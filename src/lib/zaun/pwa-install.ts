/** Detect installed PWA vs browser, and wire Chromium's install prompt. */

const DISMISS_KEY = "zaun.pwa.install-dismissed.v1";

export type InstallPlatform = "ios" | "android" | "desktop" | "unknown";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

/** True when running as an installed home-screen / standalone app (not a browser tab). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const fullscreen = window.matchMedia?.("(display-mode: fullscreen)")?.matches;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
  return Boolean(mq || fullscreen || iosStandalone);
}

export function getInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Linux/i.test(ua)) return "desktop";
  return "unknown";
}

export function wasInstallDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInstallPrompt(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
  notify();
}

function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (isStandaloneDisplay()) return;
  const base = import.meta.env.BASE_URL || "/";
  void navigator.serviceWorker.register(new URL("sw.js", window.location.origin + base).href).catch(() => {
    /* offline / file:// — ignore */
  });
}

/** Chromium only — Safari never fires this; use Share → Add to Home Screen. */
export function canNativeInstall(): boolean {
  return deferred != null;
}

export function subscribeInstallAvailability(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export async function promptNativeInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const ev = deferred;
  deferred = null;
  notify();
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  if (outcome === "accepted") dismissInstallPrompt();
  return outcome;
}

/** Call once from the app root. Safe no-op outside the browser. */
export function initPwaInstallListeners(): () => void {
  if (typeof window === "undefined") return () => {};

  registerServiceWorker();

  const onBip = (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  };
  const onInstalled = () => {
    deferred = null;
    dismissInstallPrompt();
    notify();
  };

  window.addEventListener("beforeinstallprompt", onBip);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onBip);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

/** Show the Add-to-Home-Screen CTA only in a normal browser tab. */
export function shouldOfferInstall(): boolean {
  return !isStandaloneDisplay() && !wasInstallDismissed();
}
