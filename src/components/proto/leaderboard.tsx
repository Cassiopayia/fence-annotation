import { useEffect, useState } from "react";
import { Trophy, ShieldCheck, Clock, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

export type BoardRow = { name: string; verified: number };

/**
 * Pseudonymous board — guest / author labels only. Skeletons until the board loads.
 */
export function Leaderboard({
  username,
  saved,
  verified,
  board,
  loading = false,
}: {
  username: string | null;
  saved: number;
  verified: number;
  board?: BoardRow[] | null;
  loading?: boolean;
}) {
  const [grow, setGrow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setGrow(true), 80);
    return () => window.clearTimeout(t);
  }, [board]);

  const rows = board ?? [];
  const listed = verified > 0;
  const display = listed
    ? [...rows, { name: username ?? "you", verified }].sort((a, b) => b.verified - a.verified)
    : rows;
  const top = Math.max(1, display[0]?.verified ?? 1);

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-center gap-3 rounded-2xl bg-lime-soft px-4 py-3">
        <Trophy className="size-5 shrink-0 text-lime-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          No accounts — annotations sync as guests when Supabase is configured. Only{" "}
          <span className="font-semibold text-foreground">verified</span> fences count on the board.
        </p>
      </div>

      {loading ? (
        <div className="space-y-1.5" aria-busy="true" aria-label="Loading leaderboard">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rounded-2xl border border-border px-3 py-2.5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-6" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-10" />
              </div>
            </div>
          ))}
        </div>
      ) : display.length === 0 ? (
        <p className="rounded-2xl bg-secondary px-4 py-6 text-center text-sm text-muted-foreground">
          No verified contributors yet — be the first.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {display.map((r, i) => {
            const mine = listed && r.name === (username ?? "you");
            return (
              <li
                key={`${r.name}-${i}`}
                className={cn(
                  "relative overflow-hidden rounded-2xl border px-3 py-2.5",
                  mine ? "border-lime bg-lime-soft" : "border-border",
                )}
              >
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-secondary/70"
                  style={{
                    width: grow ? `${(r.verified / top) * 100}%` : "0%",
                    transition: `width 900ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms`,
                  }}
                />
                <div className="relative flex items-center gap-3">
                  <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                    {r.name}
                    {mine && <span className="ml-1.5 font-mono text-[10px] uppercase">you</span>}
                  </span>
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                    {r.verified}
                  </span>
                  <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="space-y-2 rounded-2xl border border-dashed border-border p-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
            <UserRound className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">Guest</span>
            <span className="block font-mono text-xs text-muted-foreground">
              {saved} saved · {verified} verified
            </span>
          </span>
        </div>
        {!listed && (
          <p className="flex items-start gap-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <Clock className="mt-px size-3.5 shrink-0" />
            Hidden until your first verified fence
            {saved > 0 ? ` — ${saved} waiting in review.` : "."}
          </p>
        )}
      </div>
    </div>
  );
}
