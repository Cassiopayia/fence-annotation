import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import {
  GUEST_AUTHOR_LABEL,
  isValidUsername,
  optionalUsername,
} from "./username";

const STORAGE_KEY = "zaun.auth.v1";

export type AuthProfile = {
  id: string;
  username: string | null;
};

let client: SupabaseClient | null = null;
let profile: AuthProfile | null = null;
/** Turnstile token from the browse gate — consumed on first anonymous sign-in. */
let pendingCaptchaToken: string | null = null;

export function setPendingCaptchaToken(token: string | null): void {
  pendingCaptchaToken = token && String(token).trim() ? String(token).trim() : null;
}

export function takePendingCaptchaToken(): string | undefined {
  const token = pendingCaptchaToken || undefined;
  pendingCaptchaToken = null;
  return token;
}

function supabaseUrl(): string {
  return String(import.meta.env.VITE_SUPABASE_URL || "").trim();
}

function supabasePublishableKey(): string {
  return String(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
      || import.meta.env.VITE_SUPABASE_ANON_KEY
      || "",
  ).trim();
}

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!client) {
    client = createClient(supabaseUrl(), supabasePublishableKey(), {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

function persist(next: AuthProfile): void {
  profile = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (_) {}
}

function readStored(): AuthProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const username = isValidUsername(parsed?.username)
      ? optionalUsername(parsed.username)
      : null;
    return {
      id: String(parsed?.id || ""),
      username,
    };
  } catch (_) {
    return null;
  }
}

function randomLocalId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `local_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function getAuthProfile(): AuthProfile {
  if (!profile) {
    profile = readStored() || { id: "", username: null };
  }
  return profile;
}

/** Local-only id when Supabase is not configured. */
export function localGuestId(): string {
  const p = getAuthProfile();
  if (!p.id) {
    p.id = randomLocalId();
    persist(p);
  }
  return p.id;
}

export function getGuestProfile(): AuthProfile {
  return getAuthProfile();
}

export function currentUsernameOrOmit(): string | null {
  const stored = getAuthProfile().username;
  return stored && isValidUsername(stored) ? stored : null;
}

export function authorLabel(): string {
  return currentUsernameOrOmit() || GUEST_AUTHOR_LABEL;
}

/** True when a local guest id or Supabase session exists. Login UI is not used. */
export function isSignedIn(): boolean {
  const p = getAuthProfile();
  return Boolean(p.id);
}

async function applySession(session: Session | null): Promise<AuthProfile> {
  const p = getAuthProfile();
  if (!session?.user) {
    p.id = "";
    persist(p);
    return p;
  }
  p.id = session.user.id;
  const metaName = session.user.user_metadata?.username;
  if (metaName && isValidUsername(String(metaName))) {
    p.username = optionalUsername(String(metaName));
  }
  persist(p);
  return p;
}

/**
 * Ensure a session before write RPCs (first capture / save / verify).
 * Calls supabase.auth.signInAnonymously() when no session exists.
 * Browse/read paths must not call this.
 * If Turnstile ran at the browse gate, its token is attached once (single-use).
 */
export async function ensureAuthSession(): Promise<AuthProfile> {
  const p = getAuthProfile();
  const sb = getSupabase();
  if (!sb) {
    if (!p.id) {
      p.id = randomLocalId();
      persist(p);
    }
    return p;
  }
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    if (data.session) {
      await applySession(data.session);
      const { reportSupabaseReachSuccess } = await import("./connection-status");
      reportSupabaseReachSuccess();
      return getAuthProfile();
    }
    const captchaToken = takePendingCaptchaToken();
    const { data: anon, error: anonErr } = await sb.auth.signInAnonymously(
      captchaToken ? { options: { captchaToken } } : undefined,
    );
    if (anonErr) throw anonErr;
    await applySession(anon.session);
    const { reportSupabaseReachSuccess } = await import("./connection-status");
    reportSupabaseReachSuccess();
    return getAuthProfile();
  } catch (err) {
    const { reportSupabaseReachFailure } = await import("./connection-status");
    reportSupabaseReachFailure();
    throw err;
  }
}

/** @deprecated alias */
export async function ensureAnonymousSession(): Promise<AuthProfile> {
  return ensureAuthSession();
}

/** @deprecated alias */
export const ensureGuestSession = ensureAuthSession;

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
  persist({ id: "", username: null });
}
