import { cn } from "@/lib/utils";

/** Pulse placeholder for stats that are still loading from the network. */
export function Skeleton({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-block animate-pulse rounded-md bg-secondary", className)}
    />
  );
}

export function SkeletonLines({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn("h-4 w-full", i === rows - 1 && "w-2/3")} />
      ))}
    </div>
  );
}
