import { useEffect, useState } from "react";
import { Trophy, Users, Flag, ShieldCheck, ChevronRight } from "lucide-react";
import { StatusPill, ProgressRing } from "./primitives";
import { Skeleton } from "./skeleton";
import { cn } from "@/lib/utils";

const REVIEW_UNLOCK = 10;

export type DatasetStats = {
  total: number | null;
  annotated: number | null;
  weeklyGoal: number;
  weeklyNow: number | null;
  people: number | null;
  chipsReviewed: number | null;
  flags: number | null;
};

/**
 * Overview sheet — real catalog counts when ready; skeletons while loading.
 */
export function Overview({
  saved,
  stats,
  loading = false,
  onClose,
  onAnnotate,
}: {
  saved: number;
  stats?: DatasetStats | null;
  loading?: boolean;
  onClose: () => void;
  onAnnotate: () => void;
}) {
  const total = stats?.total ?? null;
  const annotated = stats?.annotated ?? null;
  const weeklyGoal = stats?.weeklyGoal ?? 50;
  const weeklyNow = stats?.weeklyNow ?? null;
  const people = stats?.people ?? null;
  const chipsReviewed = stats?.chipsReviewed ?? null;
  const flags = stats?.flags ?? null;
  const ready = !loading && annotated != null && total != null && total > 0;

  const [progress, setProgress] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!ready || annotated == null || total == null) {
      setProgress(0);
      setCount(0);
      return;
    }
    const ring = window.setTimeout(() => setProgress(annotated / total), 120);
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 1200);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(eased * annotated));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.clearTimeout(ring);
      cancelAnimationFrame(raf);
    };
  }, [ready, annotated, total]);

  const r = 54;
  const c = 2 * Math.PI * r;
  const datasetPct = ready && annotated != null && total != null
    ? Math.round((annotated / total) * 100)
    : null;
  const weeklyPct =
    weeklyNow != null ? Math.round((weeklyNow / weeklyGoal) * 100) : null;
  const reviewUnlocked = saved >= REVIEW_UNLOCK;

  return (
    <div className="space-y-5 pt-1">
      <div className="relative mx-auto grid size-[148px] place-items-center">
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
        <div className="relative text-center">
          {ready ? (
            <p className="font-display text-4xl font-bold leading-none tabular-nums">{count}</p>
          ) : (
            <Skeleton className="mx-auto h-10 w-20" />
          )}
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            systems annotated
          </p>
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-semibold leading-tight">Goal: every PV fence</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {ready && annotated != null && total != null && datasetPct != null ? (
            <>
              {annotated.toLocaleString("en-US")} of{" "}
              {total.toLocaleString("en-US").replace(",", " ")} systems are done —{" "}
              <span className="font-semibold text-foreground">{datasetPct}%</span> of the dataset.
              Your fences help close the gap.
            </>
          ) : (
            <span className="inline-flex w-full flex-col items-center gap-2">
              <Skeleton className="h-4 w-64 max-w-full" />
              <Skeleton className="h-4 w-48 max-w-full" />
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-secondary px-4 py-3 text-center">
          <div className="flex justify-center">
            <ProgressRing value={saved} max={REVIEW_UNLOCK} />
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            your progress
          </p>
          <p className="text-sm font-semibold">
            {saved} / {REVIEW_UNLOCK} to review
          </p>
        </div>

        <div className="rounded-2xl bg-secondary px-4 py-3 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-lime-soft text-lime-foreground">
            <Trophy className="size-5" />
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            weekly goal
          </p>
          {weeklyPct != null && weeklyNow != null ? (
            <p className="text-sm font-semibold">
              {weeklyPct}% · {weeklyNow} / {weeklyGoal}
            </p>
          ) : (
            <Skeleton className="mx-auto mt-1 h-5 w-24" />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3">
          <div className="flex items-center gap-3">
            <Users className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium">Contributors this week</span>
          </div>
          {people != null && !loading ? (
            <span className="font-mono text-sm font-semibold">{people}</span>
          ) : (
            <Skeleton className="h-5 w-8" />
          )}
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium">Chips reviewed</span>
          </div>
          {chipsReviewed != null && !loading ? (
            <span className="font-mono text-sm font-semibold">{chipsReviewed}</span>
          ) : (
            <Skeleton className="h-5 w-10" />
          )}
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3">
          <div className="flex items-center gap-3">
            <Flag className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium">Open flags</span>
          </div>
          {flags != null && !loading ? (
            <StatusPill tone={flags > 0 ? "warn" : "neutral"}>{flags}</StatusPill>
          ) : (
            <Skeleton className="h-6 w-8 rounded-full" />
          )}
        </div>
      </div>

      {reviewUnlocked && (
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Review is unlocked. You can now vet other contributors chips from the More list.
        </p>
      )}

      <div className="space-y-2">
        <button
          type="button"
          onClick={onAnnotate}
          className={cn(
            "flex h-12 w-full items-center justify-center gap-2 rounded-full font-display text-[15px] font-bold",
            "bg-lime text-lime-foreground",
          )}
        >
          Add more fences <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-11 w-full rounded-full text-sm font-semibold text-muted-foreground"
        >
          Back to map
        </button>
      </div>
    </div>
  );
}
