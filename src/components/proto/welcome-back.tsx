import { useEffect, useState } from "react";
import { Sparkles, Users, MapPinned, Flag, X, Trophy } from "lucide-react";
import { StatusPill } from "./primitives";
import { Skeleton } from "./skeleton";

export type WelcomeStats = {
  people: number | null;
  annotations: number | null;
  goal: number;
  systems: number | null;
  flags: number | null;
  since: string | null;
};

/**
 * Greeting screen — shown once on return. Skeletons while community stats load.
 */
export function WelcomeBack({
  onClose,
  onStart,
  onOpenLeaderboard,
  stats,
  loading = false,
}: {
  onClose: () => void;
  onStart: () => void;
  onOpenLeaderboard: () => void;
  stats?: WelcomeStats | null;
  loading?: boolean;
}) {
  const people = stats?.people ?? null;
  const annotations = stats?.annotations ?? null;
  const goal = stats?.goal ?? 50;
  const systems = stats?.systems ?? null;
  const flags = stats?.flags ?? null;
  const since = stats?.since ?? null;
  const ready = !loading && annotations != null;

  const [progress, setProgress] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!ready || annotations == null) {
      setProgress(0);
      setCount(0);
      return;
    }
    const ring = window.setTimeout(() => setProgress(Math.min(1, annotations / goal)), 120);
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 1100);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(eased * annotations));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.clearTimeout(ring);
      cancelAnimationFrame(raf);
    };
  }, [ready, annotations, goal]);

  const r = 54;
  const c = 2 * Math.PI * r;
  const pct =
    ready && annotations != null ? Math.round((annotations / goal) * 100) : null;

  return (
    <div
      id="welcome-back"
      className="absolute inset-0 z-[75] flex flex-col justify-end bg-primary/85 px-4 pb-[max(20px,env(safe-area-inset-bottom))] animate-fade-in"
    >
      <div className="space-y-5 rounded-[28px] bg-card p-6 text-card-foreground shadow-sheet animate-scale-in">
        <div className="flex items-start justify-between">
          <StatusPill>
            <Sparkles className="size-3.5" />{" "}
            {since ? `away ${since}` : loading ? "loading…" : "welcome"}
          </StatusPill>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close greeting"
            className="grid size-9 place-items-center rounded-full bg-secondary text-secondary-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="relative mx-auto grid size-[136px] place-items-center">
          <svg viewBox="0 0 128 128" className="absolute inset-0 size-full -rotate-90" aria-hidden>
            <circle cx="64" cy="64" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle
              cx="64"
              cy="64"
              r={r}
              fill="none"
              stroke="var(--lime)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - progress)}
              style={{ transition: "stroke-dashoffset 1200ms cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <div className="relative text-center animate-count-pop">
            {ready ? (
              <p className="font-display text-4xl font-bold leading-none tabular-nums">{count}</p>
            ) : (
              <Skeleton className="mx-auto h-10 w-16" label="Loading annotations" />
            )}
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              new fences
            </p>
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-semibold leading-tight">Welcome back</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {ready && people != null && annotations != null && pct != null ? (
              <>
                While you were gone{" "}
                <span className="font-semibold text-foreground">{people} people</span> added{" "}
                <span className="font-semibold text-foreground">{annotations} annotations</span> —{" "}
                {pct}% of this week's community goal.
              </>
            ) : (
              <span className="inline-flex flex-col items-center gap-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-40" />
              </span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              [Users, people, "contributors"],
              [MapPinned, systems, "new systems"],
              [Flag, flags, "open flags"],
            ] as const
          ).map(([Icon, value, label], i) => (
            <div
              key={label}
              className="rounded-2xl bg-secondary px-3 py-3 text-center animate-fade-in"
              style={{ animationDelay: `${300 + i * 120}ms`, animationFillMode: "backwards" }}
            >
              <Icon className="mx-auto size-4 text-muted-foreground" />
              {value != null && !loading ? (
                <p className="mt-1.5 text-base font-semibold tabular-nums">{value}</p>
              ) : (
                <Skeleton className="mx-auto mt-1.5 h-5 w-8" />
              )}
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
          <Trophy className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">Annotating as guest</span>
            <span className="block font-mono text-[10px] text-muted-foreground">
              no account — fences sync anonymously when online
            </span>
          </span>
          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="h-9 shrink-0 rounded-full bg-secondary px-3 text-[13px] font-semibold"
          >
            Leaderboard
          </button>
        </div>

        <div className="space-y-2">
          <button
            id="welcome-start-btn"
            type="button"
            onClick={onStart}
            className="h-12 w-full rounded-full bg-lime font-display text-[15px] font-bold text-lime-foreground"
          >
            Add mine now
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 w-full rounded-full text-sm font-semibold text-muted-foreground"
          >
            Just look at the map
          </button>
        </div>
      </div>
    </div>
  );
}
