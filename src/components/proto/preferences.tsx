import { useEffect, useMemo } from "react";
import { Languages, Moon, Palette, Sun, SunMoon } from "lucide-react";
import { useI18n, type Lang } from "@/i18n/context";
import { cn } from "@/lib/utils";

export type { Lang };
export type Theme = "light" | "dark" | "system";
export type Scheme = "field" | "midnight" | "coral" | "harvest" | "voltage";

/** Colour schemes — swatches are the palette's key hues, in order. */
export const SCHEME_SWATCHES: Record<Scheme, string[]> = {
  field: ["#1b2b22", "#c9f24d", "#e9f7e2", "#e8873c"],
  midnight: ["#171738", "#3423a6", "#7180b9", "#dff3e4"],
  coral: ["#445e93", "#f93943", "#fcb0b3", "#fcecc9"],
  harvest: ["#233d4d", "#fe7f2d", "#fcca46", "#a1c181"],
  voltage: ["#2e294e", "#541388", "#d90368", "#ffd400"],
};

/** Applies the chosen theme to <html> so every token switches at once. */
export function useThemeEffect(theme: Theme, scheme: Scheme = "voltage") {
  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mql.matches);
      root.classList.toggle("dark", dark);
    };
    apply();
    if (theme !== "system") return;
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    (Object.keys(SCHEME_SWATCHES) as Scheme[]).forEach((s) =>
      root.classList.remove(`palette-${s}`),
    );
    if (scheme !== "field") root.classList.add(`palette-${scheme}`);
  }, [scheme]);
}

function Segment<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { id: T; label: string; Icon?: typeof Sun }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex gap-1 rounded-full bg-secondary p-1"
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
              active
                ? "bg-card text-foreground shadow-hud"
                : "text-muted-foreground",
            )}
          >
            {o.Icon && <o.Icon className="size-4" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Language + colour theme switches. Used full-size in More and compact in the
 * welcome greeting so returning users can set both before touching the map.
 */
export function Preferences({
  theme,
  scheme,
  onTheme,
  onScheme,
  compact = false,
}: {
  theme: Theme;
  scheme: Scheme;
  onTheme: (t: Theme) => void;
  onScheme: (s: Scheme) => void;
  compact?: boolean;
}) {
  const { lang, setLang, t } = useI18n();

  const langs = useMemo(
    () => [
      { id: "en" as const, label: t("langEnglish") },
      { id: "de" as const, label: t("langGerman") },
    ],
    [t],
  );

  const themes = useMemo(
    () => [
      { id: "light" as const, label: t("themeLight"), Icon: Sun },
      { id: "dark" as const, label: t("themeDark"), Icon: Moon },
      { id: "system" as const, label: t("themeAuto"), Icon: SunMoon },
    ],
    [t],
  );

  const schemes = useMemo(
    () =>
      (Object.keys(SCHEME_SWATCHES) as Scheme[]).map((id) => ({
        id,
        label: t(
          id === "field"
            ? "schemeField"
            : id === "midnight"
              ? "schemeMidnight"
              : id === "coral"
                ? "schemeCoral"
                : id === "harvest"
                  ? "schemeHarvest"
                  : "schemeVoltage",
        ),
        swatches: SCHEME_SWATCHES[id],
      })),
    [t],
  );

  return (
    <section
      id="preferences"
      className={cn(
        "space-y-3 rounded-2xl border border-border p-3",
        compact && "border-0 bg-secondary/60 p-3",
      )}
    >
      {!compact && (
        <div className="flex items-center gap-2">
          <Languages className="size-4 text-muted-foreground" />
          <h2 className="text-[15px] font-semibold">
            {t("languageAppearance")}
          </h2>
        </div>
      )}
      <div className="space-y-2">
        {!compact && (
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("language")}
          </p>
        )}
        <Segment
          value={lang}
          options={langs}
          onChange={setLang}
          ariaLabel={t("language")}
        />
      </div>
      <div className="space-y-2">
        {!compact && (
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("colourTheme")}
          </p>
        )}
        <Segment
          value={theme}
          options={themes}
          onChange={onTheme}
          ariaLabel={t("colourTheme")}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Palette className="size-3.5 text-muted-foreground" />
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("colourScheme")}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label={t("colourScheme")}
          id="scheme-picker"
          className="grid grid-cols-5 gap-2"
        >
          {schemes.map((s) => {
            const active = s.id === scheme;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={s.label}
                onClick={() => onScheme(s.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border p-2 transition-colors",
                  active ? "border-lime bg-card shadow-hud" : "border-border",
                )}
              >
                <span className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-md">
                  {s.swatches.map((c) => (
                    <span
                      key={c}
                      className="size-3"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </span>
                <span className="text-[10px] font-semibold leading-none">
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!compact && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("preferencesHint")}
        </p>
      )}
    </section>
  );
}
