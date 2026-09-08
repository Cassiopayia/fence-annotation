/**
 * Live connection + sync status for the info-pill dot.
 *
 * - green (`connected`): Supabase reachable AND no pending local saves
 * - red flash (`offline` / `pending`): disconnected, or local fences not yet synced
 * - amber pulse (`loading`): probing
 *
 * Pending local fences live in localStorage across reloads and are uploaded
 * one-by-one when reachability returns.
 */
import { getSupabase, supabaseConfigured } from "./supabase-client";

export type ConnectionStatus = "connected" | "loading" | "offline" | "pending";

type Listener = (status: ConnectionStatus) => void;
type UnsyncedCheck = () => boolean;
type FlushPending = () => Promise<{ uploaded?: number; remaining?: number } | void>;

const STORAGE_KEY = "zaun.supabase.last-reach.v1";
const PROBE_MS = 45_000;
const FLUSH_GAP_MS = 900;

let status: ConnectionStatus = "loading";
let lastOk = false;
let probing = false;
let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();
let unsyncedCheck: UnsyncedCheck = () => false;
let flushPending: FlushPending | null = null;

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

/** Wire sync helpers from public-api (avoids circular imports at module init). */
export function registerSyncHooks(hooks: {
  hasUnsynced: UnsyncedCheck;
  flushPending?: FlushPending;
}): void {
  unsyncedCheck = hooks.hasUnsynced;
  flushPending = hooks.flushPending || null;
  recomputeConnectionStatus();
  // Drain any backlog left from a previous session.
  kickFlushQueue();
}

export function getConnectionStatus(): ConnectionStatus {
  return status;
}

export function subscribeConnectionStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

/**
 * Reachable + fully synced → green.
 * Reachable but local backlog → pending (red flash).
 * Unreachable → offline (red flash).
 */
export function recomputeConnectionStatus(): ConnectionStatus {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const configured = supabaseConfigured() && Boolean(getSupabase());
  const unsynced = (() => {
    try {
      return Boolean(unsyncedCheck());
    } catch {
      return false;
    }
  })();

  if (!configured || !online || !lastOk) {
    setStatus(unsynced ? "pending" : "offline");
    return status;
  }
  setStatus(unsynced ? "pending" : "connected");
  return status;
}

/** Upload pending local fences one at a time until the queue is empty or reach fails. */
function kickFlushQueue(): void {
  if (flushing || !flushPending) return;
  if (!lastOk || !navigator.onLine) return;
  if (!unsyncedCheck()) {
    recomputeConnectionStatus();
    return;
  }
  flushing = true;
  void flushPending()
    .catch(() => {})
    .finally(() => {
      flushing = false;
      recomputeConnectionStatus();
      if (lastOk && unsyncedCheck()) {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(() => {
          flushTimer = null;
          kickFlushQueue();
        }, FLUSH_GAP_MS);
      }
    });
}

/** Call after any successful Supabase round-trip. */
export function reportSupabaseReachSuccess(): void {
  writeLastOk(true);
  recomputeConnectionStatus();
  kickFlushQueue();
}

/** Call after a failed Supabase round-trip (network / 5xx / unreachable). */
export function reportSupabaseReachFailure(): void {
  writeLastOk(false);
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  recomputeConnectionStatus();
}

/**
 * Lightweight reachability probe. Uses auth getSession (no custom RPC required).
 * Unconfigured env → offline immediately.
 */
export async function probeSupabaseReachability(): Promise<ConnectionStatus> {
  if (!supabaseConfigured() || !getSupabase()) {
    writeLastOk(false);
    recomputeConnectionStatus();
    return status;
  }
  if (probing) return status;
  probing = true;
  setStatus(lastOk ? (unsyncedCheck() ? "pending" : "connected") : "loading");
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
    return status;
  } catch {
    reportSupabaseReachFailure();
    return status;
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
    recomputeConnectionStatus();
    return;
  }
  setStatus("loading");
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
