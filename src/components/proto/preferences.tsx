import { useEffect } from "react";
import { Languages, Moon, Palette, Sun, SunMoon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Lang = "en" | "de";
export type Theme = "light" | "dark" | "system";
export type Scheme = "field" | "midnight" | "coral" | "harvest" | "voltage";

export const LANGS: { id: Lang; label: string; meta: string }[] = [
  { id: "en", label: "English", meta: "EN" },
  { id: "de", label: "Deutsch", meta: "DE" },
];

export const THEMES: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "Auto", Icon: SunMoon },
];

/** Colour schemes — swatches are the palette's key hues, in order. */
export const SCHEMES: { id: Scheme; label: string; swatches: string[] }[] = [
  { id: "field", label: "Field", swatches: ["#1b2b22", "#c9f24d", "#e9f7e2", "#e8873c"] },
  { id: "midnight", label: "Midnight", swatches: ["#171738", "#3423a6", "#7180b9", "#dff3e4"] },
  { id: "coral", label: "Coral", swatches: ["#445e93", "#f93943", "#fcb0b3", "#fcecc9"] },
  { id: "harvest", label: "Harvest", swatches: ["#233d4d", "#fe7f2d", "#fcca46", "#a1c181"] },
  { id: "voltage", label: "Voltage", swatches: ["#2e294e", "#541388", "#d90368", "#ffd400"] },
];

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
    SCHEMES.forEach((s) => root.classList.remove(`palette-${s.id}`));
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
  lang,
  theme,
  scheme,
  onLang,
  onTheme,
  onScheme,
  compact = false,
}: {
  lang: Lang;
  theme: Theme;
  scheme: Scheme;
  onLang: (l: Lang) => void;
  onTheme: (t: Theme) => void;
  onScheme: (s: Scheme) => void;
  compact?: boolean;
}) {
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
          <h2 className="text-[15px] font-semibold">Language &amp; appearance</h2>
        </div>
      )}
      <div className="space-y-2">
        {!compact && (
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            language
          </p>
        )}
        <Segment
          value={lang}
          options={LANGS.map((l) => ({ id: l.id, label: l.label }))}
          onChange={onLang}
          ariaLabel="Language"
        />
      </div>
      <div className="space-y-2">
        {!compact && (
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            colour theme
          </p>
        )}
        <Segment value={theme} options={THEMES} onChange={onTheme} ariaLabel="Colour theme" />
      </div>

      {/* colour scheme swatches */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Palette className="size-3.5 text-muted-foreground" />
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            colour scheme
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Colour scheme"
          id="scheme-picker"
          className="grid grid-cols-5 gap-2"
        >
          {SCHEMES.map((s) => {
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
                    <span key={c} className="size-3" style={{ backgroundColor: c }} />
                  ))}
                </span>
                <span className="text-[10px] font-semibold leading-none">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!compact && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Dark keeps the map readable at night; Auto follows iOS. Schemes retint the whole app —
          Field stays the highest-contrast option for bright sunlight. Language switches labels only —
          taxonomy values stay in the dataset schema.
        </p>
      )}
    </section>
  );
}
