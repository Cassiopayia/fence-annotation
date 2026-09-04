import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Global, on every screen: the (i) pill. Tapping cycles three detail levels
 * — minimal (dot + i), imagery (zoom + tile service) and system (ha, which
 * only appears when a system is actually selected). A fourth tap opens the
 * full info sheet and returns to minimal.
 */
export function InfoPill({
  onClick,
  ha,
  zoom = "z…",
  service = "…",
  systemLabel,
  connection = "loading",
  id,
}: {
  onClick: () => void;
  /** omit when no system is selected — the ha is then never rendered */
  ha?: string;
  zoom?: string;
  service?: string;
  /** Selected PV system id for mode 2 */
  systemLabel?: string;
  connection?: "connected" | "loading" | "offline";
  id?: string;
}) {
  const [mode, setMode] = useState(0);
  const step = () => {
    if (mode === 2 || (mode === 1 && !ha && !systemLabel)) {
      setMode(0);
      onClick();
      return;
    }
    setMode((m) => m + 1);
  };

  return (
    <button
      id={id}
      type="button"
      onClick={step}
      aria-label={`Info — ${connection}, ${zoom}, ${service}${systemLabel ? `, ${systemLabel}` : ""}${ha ? `, ${ha}` : ""}. Tap for more detail.`}
      className="glass flex items-center gap-2 rounded-full border border-border px-3 py-2 tap-44"
    >
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          connection === "connected" && "bg-online",
          connection === "loading" && "bg-warn animate-pulse",
          connection === "offline" && "bg-destructive",
        )}
      />
      <Info className="size-4 shrink-0" />
      {mode === 1 && (
        <span className="font-mono text-[11px] font-semibold whitespace-nowrap">
          {zoom} · {service}
        </span>
      )}
      {mode === 2 && (systemLabel || ha) && (
        <span className="font-mono text-[11px] font-semibold whitespace-nowrap">
          {systemLabel || "system"}
          {ha ? ` · ${ha}` : ""}
        </span>
      )}
    </button>
  );
}


/**
 * Global, on every screen: circular contribution progress. Replaces the old
 * full-width gamification bar — same footprint as a HUD button.
 */
export function ProgressRing({
  value,
  max,
  pop,
  onClick,
  id,
}: {
  value: number;
  max: number;
  pop?: boolean;
  onClick?: () => void;
  id?: string;
}) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      aria-label={`Contribution progress: ${value} of ${max} annotations`}
      className={cn(
        "glass relative grid size-11 place-items-center rounded-full",
        pop && "animate-count-pop",
      )}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="var(--lime)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="relative font-mono text-[11px] font-bold leading-none">{value}</span>
    </button>
  );
}


/** Status pill — DOP · zoom · connection. Dark text on soft lime. */
export function StatusPill({
  children,
  tone = "lime",
  className,
}: {
  children: ReactNode;
  tone?: "lime" | "neutral" | "warn";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-wide",
        tone === "lime" && "bg-lime-soft text-lime-foreground",
        tone === "neutral" && "glass text-foreground",
        tone === "warn" && "bg-warn/25 text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Floating circular HUD control on the map. */
export function HudButton({
  label,
  onClick,
  active,
  children,
  id,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "grid size-11 place-items-center rounded-full border border-border transition-colors tap-44",
        active ? "bg-lime text-lime-foreground" : "bg-card text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Bottom sheet: grabber to expand full-screen or swipe down to dismiss. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  full = false,
  id,
  elevated = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Start already full-screen (no grabber expand). */
  full?: boolean;
  id?: string;
  /** lifts the sheet above the greeting and install overlays */
  elevated?: boolean;
}) {
  const [expanded, setExpanded] = useState(full);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** Keep mounted briefly while closing so the slide-out can finish — then unmount
   *  so off-screen `shadow-sheet` layers cannot stack / bleed over the map. */
  const [mounted, setMounted] = useState(open);
  const startY = useRef(0);
  const startExpanded = useRef(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    setDragY(0);
    setDragging(false);
    setExpanded(full);
    const t = window.setTimeout(() => setMounted(false), 320);
    return () => window.clearTimeout(t);
  }, [open, full]);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (full || !open) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    startExpanded.current = expanded;
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!dragging) return;
    setDragY(e.clientY - startY.current);
  };

  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    const dy = dragY;
    setDragY(0);

    // Swipe down → dismiss (or collapse if full-screen)
    if (dy > 110) {
      if (startExpanded.current) {
        setExpanded(false);
        return;
      }
      onClose();
      return;
    }
    // Swipe / drag up → expand to full screen
    if (dy < -70) {
      setExpanded(true);
      return;
    }
  };

  const tall = full || expanded;

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0",
        elevated ? "z-[85]" : "z-50",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <div
        onClick={open ? onClose : undefined}
        className={cn(
          "absolute inset-0 bg-primary/45 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <section
        id={id}
        className={cn(
          "absolute inset-x-0 bottom-0 flex flex-col bg-card ease-out",
          // Shadow only while open — closed + translate-y-full still paints shadow-sheet and bleeds.
          open && "shadow-sheet",
          tall ? "top-0 rounded-t-none pt-safe" : "max-h-[86dvh] rounded-t-[28px]",
          dragging ? "transition-none" : "transition-[transform,max-height,top,border-radius] duration-300",
          open ? "translate-y-0" : "translate-y-full",
        )}
        style={
          open && dragY
            ? {
                transform: `translateY(${
                  !tall && dragY < 0 ? Math.max(dragY, -100) : Math.max(0, dragY)
                }px)`,
              }
            : undefined
        }
      >
        {!full && (
          <div
            role="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Drag down to shrink or close" : "Drag up for full screen, down to close"}
            tabIndex={open ? 0 : -1}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={() => setExpanded((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") setExpanded(true);
              if (e.key === "ArrowDown") {
                if (expanded) setExpanded(false);
                else onClose();
              }
              if (e.key === "Escape") onClose();
            }}
            className="flex cursor-grab touch-none flex-col items-center pt-2 pb-1 active:cursor-grabbing"
          >
            <div className="h-1.5 w-10 rounded-full bg-border" aria-hidden />
            <span className="sr-only">
              {expanded
                ? "Sheet expanded. Drag down to shrink, further to close."
                : "Drag up to expand sheet full screen, or down to close."}
            </span>
          </div>
        )}
        {(title || !full) && (
          <header
            className="flex touch-none items-center justify-between px-5 pt-1 pb-2"
            onPointerDown={full ? undefined : onPointerDown}
            onPointerMove={full ? undefined : onPointerMove}
            onPointerUp={full ? undefined : onPointerUp}
            onPointerCancel={full ? undefined : onPointerUp}
          >
            {title ? <h2 className="text-lg font-semibold">{title}</h2> : <span />}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full bg-secondary text-secondary-foreground"
              onPointerDown={(e) => e.stopPropagation()}
            >
              ✕
            </button>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))] overscroll-contain">
          {children}
        </div>
      </section>
    </div>
  );
}

/** Selectable tag chip (context / visibility tags). */
export function TagChip({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
        selected
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * One pill that cycles through its options on tap — cleaner on a phone than
 * a row of chips. Used for context / visibility during guided annotation.
 */
export function CyclePill({
  label,
  options,
  value,
  onChange,
  id,
  className,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  id?: string;
  className?: string;
}) {
  const next = () => onChange(options[(options.indexOf(value) + 1) % options.length] ?? value);
  return (
    <button
      id={id}
      type="button"
      onClick={next}
      aria-label={`${label}: ${value}. Tap to cycle.`}
      className={cn(
        "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-full bg-secondary px-3 py-2 text-left tap-44",
        className,
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-[13px] font-semibold">{value}</span>
    </button>
  );
}


/** Binary toggle pill used in layer lists and export options. */
export function TogglePill({
  on,
  onClick,
  labelOn = "on",
  labelOff = "off",
}: {
  on: boolean;
  onClick?: () => void;
  labelOn?: string;
  labelOff?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? labelOn : labelOff}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200",
        on ? "bg-lime" : "bg-secondary",
      )}
    >
      <span
        className={cn(
          "size-6 rounded-full bg-card shadow-hud transition-transform duration-200 ease-out",
          on ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}



export function ListRow({
  title,
  meta,
  onClick,
  trailing,
  id,
  variant = "default",
}: {
  title: string;
  meta?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  id?: string;
  variant?: "default" | "destructive";
}) {
  return (
    <div
      id={id}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border px-1 py-3.5 text-left last:border-0 tap-44",
        variant === "destructive" && "text-destructive",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{title}</span>
        {meta && (
          <span className={cn(
            "mt-0.5 block truncate font-mono text-xs",
            variant === "destructive" ? "text-destructive/70" : "text-muted-foreground",
          )}>
            {meta}
          </span>
        )}
      </span>
      <span className={cn("shrink-0", variant === "destructive" ? "text-destructive" : "text-muted-foreground")}>
        {trailing ?? "›"}
      </span>
    </div>
  );
}
