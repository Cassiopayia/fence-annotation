import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import {
  canNativeInstall,
  dismissInstallPrompt,
  getInstallPlatform,
  isStandaloneDisplay,
  promptNativeInstall,
  shouldOfferInstall,
  subscribeInstallAvailability,
  initPwaInstallListeners,
  type InstallPlatform,
} from "@/lib/zaun/pwa-install";

function stepsFor(platform: InstallPlatform, nativeReady: boolean): string[] {
  if (nativeReady) {
    return [
      "Your browser can install this app directly.",
      "Tap Install below — no Share menu needed.",
    ];
  }
  switch (platform) {
    case "ios":
      return [
        "Safari only: tap the Share button (square with ↑).",
        "Scroll and tap “Add to Home Screen”.",
        "Confirm Add — fency opens full-screen next time.",
      ];
    case "android":
      return [
        "Open the browser menu (⋮).",
        "Tap “Install app” or “Add to Home screen”.",
        "Confirm — then launch from your home screen.",
      ];
    case "desktop":
      return [
        "Look for the install icon in the address bar (⊕ / monitor+arrow).",
        "Or use the browser menu → “Install fency…”.",
        "If you don’t see it yet, keep using the site — Chrome offers install after engagement.",
      ];
    default:
      return [
        "Use your browser’s Share or menu → “Add to Home Screen” / “Install app”.",
      ];
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
};

/**
 * Browser-only install sheet. Hidden automatically when already running as a PWA.
 * Chromium: native beforeinstallprompt when available; iOS: Share → Add to Home Screen.
 */
export function InstallPrompt({ open, onClose, onDone }: Props) {
  const [platform] = useState(() => getInstallPlatform());
  const [nativeReady, setNativeReady] = useState(() => canNativeInstall());
  const [busy, setBusy] = useState(false);
  const [showHow, setShowHow] = useState(false);

  useEffect(() => subscribeInstallAvailability(() => setNativeReady(canNativeInstall())), []);

  if (!open || isStandaloneDisplay()) return null;

  const steps = stepsFor(platform, nativeReady);

  const primary = async () => {
    if (nativeReady) {
      setBusy(true);
      const outcome = await promptNativeInstall();
      setBusy(false);
      if (outcome === "accepted") {
        onDone();
        return;
      }
      setShowHow(true);
      return;
    }
    setShowHow(true);
  };

  const later = () => {
    dismissInstallPrompt();
    onClose();
  };

  const gotIt = () => {
    dismissInstallPrompt();
    onDone();
  };

  return (
    <div className="absolute inset-0 z-[70] flex flex-col justify-end bg-primary/60 px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="space-y-4 rounded-[28px] bg-card p-6 text-card-foreground shadow-sheet">
        <div className="flex items-start justify-between">
          <Share className="size-8 text-lime-foreground" />
          <button
            type="button"
            onClick={later}
            aria-label="Close install prompt"
            className="grid size-9 place-items-center rounded-full bg-destructive text-destructive-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        <h2 className="text-2xl font-semibold leading-tight">
          Add fency to your Home Screen
        </h2>
        <p className="text-sm text-muted-foreground">
          {platform === "ios"
            ? "Safari doesn’t auto-prompt — you’ll use Share → Add to Home Screen."
            : nativeReady
              ? "Your browser can install this as an app in one tap."
              : "Browsers offer install when the site is a PWA (manifest + secure origin). Until then, use the steps below."}
        </p>

        {showHow && (
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}

        {!showHow ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void primary()}
              className="h-12 w-full rounded-full bg-lime font-display text-[15px] font-bold text-lime-foreground disabled:opacity-60"
            >
              {nativeReady ? "Install app now" : "Tell me how to install it"}
            </button>
            <button
              type="button"
              onClick={later}
              className="h-12 w-full rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
            >
              I know where to find it later
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={gotIt}
            className="h-12 w-full rounded-full bg-lime font-display text-[15px] font-bold text-lime-foreground"
          >
            Got it
          </button>
        )}
      </div>
    </div>
  );
}

/** Whether the app should show install chrome (overlay / More row / badge). */
export function useInstallOffer(): boolean {
  const [offer, setOffer] = useState(() => shouldOfferInstall());

  useEffect(() => {
    const stop = initPwaInstallListeners();
    const sync = () => setOffer(shouldOfferInstall());
    sync();
    const unsub = subscribeInstallAvailability(sync);
    window.addEventListener("appinstalled", sync);
    return () => {
      stop();
      unsub();
      window.removeEventListener("appinstalled", sync);
    };
  }, []);

  return offer;
}
