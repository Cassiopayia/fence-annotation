import { useEffect, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { setPendingCaptchaToken } from "@/lib/zaun/supabase-client";

function turnstileSiteKey(): string {
  return String(
    import.meta.env.VITE_TURNSTILE_SITEKEY || import.meta.env.TURNSTILE_SITEKEY || "",
  ).trim();
}

export function captchaConfigured(): boolean {
  return Boolean(turnstileSiteKey());
}

/**
 * One-time Turnstile gate before map browsing when a site key is configured.
 * Token is handed to anonymous sign-in on first capture.
 */
export function CaptchaGate({ onPassed }: { onPassed: () => void }) {
  const siteKey = turnstileSiteKey();
  const [error, setError] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);

  useEffect(() => {
    if (!siteKey) onPassed();
  }, [siteKey, onPassed]);

  if (!siteKey) return null;

  return (
    <div className="absolute inset-0 z-[90] flex flex-col justify-end bg-primary/70 px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="space-y-4 rounded-[28px] bg-card p-6 text-card-foreground">
        <h2 className="font-display text-xl font-bold">Quick check</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Complete the CAPTCHA to browse the map and annotate. No account needed — this keeps the
          shared dataset clear of bots.
        </p>
        <div className="flex justify-center overflow-hidden rounded-2xl bg-secondary px-2 py-3">
          <Turnstile
            key={widgetKey}
            siteKey={siteKey}
            onSuccess={(token) => {
              setPendingCaptchaToken(token);
              setError(null);
              onPassed();
            }}
            onExpire={() => {
              setPendingCaptchaToken(null);
              setError("CAPTCHA expired — try again.");
              setWidgetKey((k) => k + 1);
            }}
            onError={() => {
              setPendingCaptchaToken(null);
              setError("CAPTCHA failed — try again.");
              setWidgetKey((k) => k + 1);
            }}
            options={{ theme: "auto", size: "normal" }}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
