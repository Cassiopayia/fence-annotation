/**
 * Live connection status for the info-pill dot.
 * Red/offline when Supabase is unset, unreachable, or the last reach failed.
 */
import { getSupabase, supabaseConfigured } from "./supabase-client";

export type ConnectionStatus = "connected" | "loading" | "offline";

type Listener = (status: ConnectionStatus) => void;

const STORAGE_KEY = "zaun.supabase.last-reach.v1";
const PROBE_MS = 45_000;

let status: ConnectionStatus = "loading";
let lastOk = false;
let probing = false;
const listeners = new Set<Listener>();

function readLastOk(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "ok";
  } catch {
    return false;
  }
}

function writeLastOk(ok: boolean): void {
  lastOk = ok;
  try {
    localStorage.setItem(STORAGE_KEY, ok ? "ok" : "fail");
  } catch {
    /* ignore */
  }
}

function setStatus(next: ConnectionStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of listeners) listener(status);
}

export function getConnectionStatus(): ConnectionStatus {
  return status;
}

export function subscribeConnectionStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

/** Call after any successful Supabase round-trip. */
export function reportSupabaseReachSuccess(): void {
  writeLastOk(true);
  setStatus("connected");
}

/** Call after a failed Supabase round-trip (network / 5xx / unreachable). */
export function reportSupabaseReachFailure(): void {
  writeLastOk(false);
  setStatus("offline");
}

/**
 * Lightweight reachability probe. Uses auth getSession (no custom RPC required).
 * Unconfigured env → offline immediately.
 */
export async function probeSupabaseReachability(): Promise<ConnectionStatus> {
  if (!supabaseConfigured() || !getSupabase()) {
    writeLastOk(false);
    setStatus("offline");
    return "offline";
  }
  if (probing) return status;
  probing = true;
  setStatus(lastOk ? "connected" : "loading");
  try {
    const sb = getSupabase()!;
    const { error } = await sb.auth.getSession();
    if (error) throw error;
    // Confirm the project host answers (session can be null for cold guests).
    const { error: userErr } = await sb.auth.getUser();
    if (userErr && /fetch|network|Failed to fetch|timeout/i.test(String(userErr.message || userErr))) {
      throw userErr;
    }
    reportSupabaseReachSuccess();
    return "connected";
  } catch {
    reportSupabaseReachFailure();
    return "offline";
  } finally {
    probing = false;
  }
}

let started = false;

/** Start periodic probes (idempotent). */
export function startConnectionMonitoring(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  lastOk = readLastOk();
  if (!supabaseConfigured()) {
    writeLastOk(false);
    setStatus("offline");
    return;
  }
  setStatus(lastOk ? "connected" : "loading");
  void probeSupabaseReachability();
  window.setInterval(() => {
    void probeSupabaseReachability();
  }, PROBE_MS);
  window.addEventListener("online", () => {
    void probeSupabaseReachability();
  });
  window.addEventListener("offline", () => {
    reportSupabaseReachFailure();
  });
}
