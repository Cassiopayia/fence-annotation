import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TourStep = {
  /** css selector of the element to spotlight; omit for a centred card */
  target?: string;
  title: string;
  body: string;
  /** screen label shown above the title */
  screen?: string;
  /** app state this step needs (switch tab, open loupe, …) */
  enter?: () => void;
  /** the user has to tap the highlighted control to continue */
  awaitTap?: boolean;
  /** hint shown instead of the next arrow while waiting for the tap */
  tapHint?: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;

export function Tour({
  steps,
  onClose,
  onFinish,
}: {
  steps: TourStep[];
  onClose: () => void;
  onFinish?: () => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(180);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[i]!;
  const last = i === steps.length - 1;

  /** apply the app state this step needs */
  useEffect(() => {
    step.enter?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  /** track the target position (layout settles after enter(), so poll a few frames) */
  useEffect(() => {
    let raf = 0;
    let el: HTMLElement | null = null;
    const advance = () => window.setTimeout(() => setI((v) => Math.min(steps.length - 1, v + 1)), 260);
    const tick = () => {
      const next = step.target
        ? (document.querySelector(step.target) as HTMLElement | null)
        : null;
      if (next !== el) {
        el?.classList.remove("tour-flash");
        if (step.awaitTap) el?.removeEventListener("click", advance);
        el = next;
        el?.classList.add("tour-flash");
        if (step.awaitTap) el?.addEventListener("click", advance);
      }
      if (el) {
        const r = el.getBoundingClientRect();
        setRect((p) =>
          p && Math.abs(p.top - r.top) < 0.5 && Math.abs(p.left - r.left) < 0.5
            ? p
            : { top: r.top, left: r.left, width: r.width, height: r.height },
        );
      } else {
        setRect(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el?.classList.remove("tour-flash");
      el?.removeEventListener("click", advance);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [i]);

  const vh = typeof window === "undefined" ? 852 : window.innerHeight;
  const vw = typeof window === "undefined" ? 393 : window.innerWidth;

  const spot = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  /** card goes on the roomier side of the target */
  const below = spot ? spot.top + spot.height / 2 < vh / 2 : false;
  const cardTop = !spot
    ? Math.max(90, vh / 2 - cardH / 2)
    : below
      ? Math.min(vh - cardH - 24, spot.top + spot.height + 56)
      : Math.max(24, spot.top - cardH - 56);

  /** arrow from the card to the spotlight */
  const arrow = (() => {
    if (!spot) return null;
    const tx = Math.min(vw - 18, Math.max(18, spot.left + spot.width / 2));
    const ty = below ? spot.top + spot.height + 6 : spot.top - 6;
    const cardY = below ? cardTop - 4 : cardTop + cardH + 4;
    const cx = Math.min(vw - 30, Math.max(30, tx > vw / 2 ? tx - 46 : tx + 46));
    return { d: `M ${cx} ${cardY} Q ${cx} ${(cardY + ty) / 2} ${tx} ${ty}`, tx, ty, below };
  })();

  return (
    <div id="tour-overlay" className="pointer-events-none fixed inset-0 z-[95]">
      {/* swallow taps on the app while the tour is running — unless this step wants a real tap */}
      {step.awaitTap && spot ? (
        <>
          <div className="pointer-events-auto absolute inset-x-0 top-0" style={{ height: Math.max(0, spot.top) }} aria-hidden />
          <div className="pointer-events-auto absolute inset-x-0 bottom-0" style={{ top: spot.top + spot.height }} aria-hidden />
          <div className="pointer-events-auto absolute" style={{ top: spot.top, left: 0, width: Math.max(0, spot.left), height: spot.height }} aria-hidden />
          <div className="pointer-events-auto absolute" style={{ top: spot.top, left: spot.left + spot.width, right: 0, height: spot.height }} aria-hidden />
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0" aria-hidden />
      )}
      {/* dimmer with a hole punched around the target */}

      {spot ? (
        <div
          className="pointer-events-none absolute rounded-[22px] transition-all duration-300 ease-out"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px color-mix(in oklab, var(--primary) 66%, transparent)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-primary/70" />
      )}

      {/* pulsing ring on the target */}
      {spot && (
        <div
          className="pointer-events-none absolute rounded-[22px] border-2 border-lime animate-tour-ring transition-all duration-300 ease-out"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      )}

      {/* arrow */}
      {arrow && (
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          <path
            d={arrow.d}
            fill="none"
            stroke="var(--lime)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="7 7"
            className="animate-tour-dash"
          />
          <polygon
            points={
              arrow.below
                ? `${arrow.tx},${arrow.ty} ${arrow.tx - 6},${arrow.ty - 10} ${arrow.tx + 6},${arrow.ty - 10}`
                : `${arrow.tx},${arrow.ty} ${arrow.tx - 6},${arrow.ty + 10} ${arrow.tx + 6},${arrow.ty + 10}`
            }
            fill="var(--lime)"
          />
        </svg>
      )}

      {/* step card */}
      <div
        ref={cardRef}
        id="tour-card"
        className="pointer-events-auto absolute inset-x-4 rounded-[26px] bg-card p-4 text-card-foreground shadow-sheet transition-[top] duration-300 ease-out"
        style={{ top: cardTop }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {step.screen && (
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {step.screen}
              </p>
            )}
            <h2 className="mt-0.5 text-[17px] font-semibold leading-tight">{step.title}</h2>
          </div>
          <button
            id="tour-skip-btn"
            type="button"
            onClick={onClose}
            aria-label="Skip the tour"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>

        <div className="mt-3 flex items-center gap-2">
          {/* progress dots */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  idx === i ? "w-4 bg-lime" : "w-1.5 bg-border",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            disabled={i === 0}
            onClick={() => setI((v) => Math.max(0, v - 1))}
            aria-label="Previous step"
            className="grid size-11 place-items-center rounded-full bg-secondary disabled:opacity-40"
          >
            <ArrowLeft className="size-5" />
          </button>
          {step.awaitTap ? (
            <span className="shrink-0 rounded-full bg-lime/15 px-3 py-2 text-[12px] font-semibold text-lime-foreground">
              {step.tapHint ?? "Tap it to continue"}
            </span>
          ) : last ? (
            <button
              id="tour-finish-btn"
              type="button"
              onClick={() => (onFinish ? onFinish() : onClose())}
              className="h-11 shrink-0 rounded-full bg-lime px-5 font-display text-[14px] font-bold text-lime-foreground"
            >
              Start annotating
            </button>
          ) : (
            <button
              id="tour-next-btn"
              type="button"
              onClick={() => setI((v) => v + 1)}
              aria-label="Next step"
              className="grid size-11 place-items-center rounded-full bg-lime text-lime-foreground"
            >
              <ArrowRight className="size-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
