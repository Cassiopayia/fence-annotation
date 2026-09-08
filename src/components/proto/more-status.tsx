import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "./skeleton";
import type { DatasetStats } from "./overview";

/**
 * Status header for the More screen — skeletons until catalog counts arrive.
 */
export function MoreStatus({
  saved,
  stats,
  loading = false,
  onOpenOverview,
}: {
  saved: number;
  stats?: DatasetStats | null;
  loading?: boolean;
  onOpenOverview: () => void;
}) {
  const total = stats?.total ?? null;
  const annotated = stats?.annotated ?? null;
  const weeklyGoal = stats?.weeklyGoal ?? 50;
  const weeklyNow = stats?.weeklyNow ?? null;
  const chipsReviewed = stats?.chipsReviewed ?? null;
  const ready = !loading && annotated != null && total != null && total > 0;

  const [progress, setProgress] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!ready || annotated == null || total == null) {
      setProgress(0);
      setCount(0);
      return;
    }
    const ring = window.setTimeout(() => setProgress(annotated / total), 100);
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 1000);
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

  const r = 28;
  const c = 2 * Math.PI * r;
  const datasetPct =
    ready && annotated != null && total != null
      ? ((annotated / total) * 100).toFixed(1)
      : null;

  return (
    <button
      id="more-status"
      type="button"
      onClick={onOpenOverview}
      className="w-full rounded-2xl border border-border px-4 py-3.5 text-left"
    >
      <div className="flex items-center gap-4">
        <div className="relative grid size-[68px] shrink-0 place-items-center">
          <svg viewBox="0 0 68 68" className="absolute inset-0 size-full -rotate-90" aria-hidden>
            <circle cx="34" cy="34" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
            <circle
              cx="34"
              cy="34"
              r={r}
              fill="none"
              stroke="var(--lime)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - progress)}
              style={{ transition: "stroke-dashoffset 1100ms cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <span className="relative text-center font-display text-lg font-bold leading-none tabular-nums">
            {ready ? count : <Skeleton className="mx-auto h-5 w-8" />}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          {ready && annotated != null && total != null ? (
            <p className="text-[15px] font-semibold leading-tight">
              {annotated} of {total.toLocaleString("en-US").replace(",", " ")} systems annotated
            </p>
          ) : (
            <Skeleton className="h-5 w-48 max-w-full" />
          )}
          {datasetPct != null && chipsReviewed != null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {datasetPct}% of the dataset · {chipsReviewed} chips reviewed
            </p>
          ) : (
            <Skeleton className="mt-1 h-3 w-36" />
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Tag>You: {saved} fences</Tag>
            {weeklyNow != null ? (
              <Tag>
                Week: {weeklyNow}/{weeklyGoal}
              </Tag>
            ) : (
              <Skeleton className="h-5 w-20 rounded-full" />
            )}
          </div>
        </div>

        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </div>
    </button>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] font-semibold">
      {children}
    </span>
  );
}
