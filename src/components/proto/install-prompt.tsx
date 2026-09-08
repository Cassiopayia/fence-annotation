import { useEffect, useMemo, useState } from "react";
import { Share, X } from "lucide-react";
import { useI18n } from "@/i18n/context";
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

function installSteps(
  platform: InstallPlatform,
  nativeReady: boolean,
  t: ReturnType<typeof useI18n>["t"],
): string[] {
  if (nativeReady) {
    return [t("installStepNative1"), t("installStepNative2")];
  }
  switch (platform) {
    case "ios":
      return [t("installStepIos1"), t("installStepIos2"), t("installStepIos3")];
    case "android":
      return [
        t("installStepAndroid1"),
        t("installStepAndroid2"),
        t("installStepAndroid3"),
      ];
    case "desktop":
      return [
        t("installStepDesktop1"),
        t("installStepDesktop2"),
        t("installStepDesktop3"),
      ];
    default:
      return [t("installStepFallback")];
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
  const { t } = useI18n();
  const [platform] = useState(() => getInstallPlatform());
  const [nativeReady, setNativeReady] = useState(() => canNativeInstall());
  const [busy, setBusy] = useState(false);
  const [showHow, setShowHow] = useState(false);

  useEffect(() => subscribeInstallAvailability(() => setNativeReady(canNativeInstall())), []);

  const steps = useMemo(
    () => installSteps(platform, nativeReady, t),
    [platform, nativeReady, t],
  );

  if (!open || isStandaloneDisplay()) return null;

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
    <div className="absolute inset-0 z-[70] overflow-y-auto overscroll-contain bg-primary/60 px-4 pt-[var(--sat)] pb-[calc(var(--sab)+12px)]">
      <div className="flex min-h-full flex-col justify-end">
        <div className="space-y-4 rounded-[28px] bg-card p-6 text-card-foreground shadow-sheet">
          <div className="flex items-start justify-between">
            <Share className="size-8 text-lime-foreground" />
            <button
              type="button"
              onClick={later}
              aria-label={t("closeInstallPrompt")}
              className="grid size-9 place-items-center rounded-full bg-destructive text-destructive-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
          <h2 className="text-2xl font-semibold leading-tight">{t("installTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {platform === "ios"
              ? t("installBodyIos")
              : nativeReady
                ? t("installBodyNative")
                : t("installBodyGeneric")}
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
                {nativeReady ? t("installNow") : t("installShowSteps")}
              </button>
              <button
                type="button"
                onClick={later}
                className="h-12 w-full rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
              >
                {t("installLater")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={gotIt}
              className="h-12 w-full rounded-full bg-lime font-display text-[15px] font-bold text-lime-foreground"
            >
              {t("installGotIt")}
            </button>
          )}
        </div>
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
