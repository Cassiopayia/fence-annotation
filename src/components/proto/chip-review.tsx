import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { AlertCircle, Flag, Undo2, X } from "lucide-react";
import "@/lib/zaun/maplibre-setup";
import * as maplibregl from "maplibre-gl";
import { HudButton, ProgressRing, StatusPill } from "./primitives";
import { cn } from "@/lib/utils";
import { featureId, listAnnotations, verifyAnnotation } from "@/lib/zaun/public-api";
import { mapStyle } from "@/lib/zaun/map-styles";

const FLAGS = ["tile seam", "cut-off fence", "wrong geometry", "needs redraw"];
const NEGATIVES = ["PV modules", "Road", "Furrow", "Forest edge", "Complex geo"];

type ReviewItem = {
  id: string;
  feature: Feature;
  label: string;
};

function boundsOf(geometry: Geometry | null | undefined): [[number, number], [number, number]] | null {
  if (!geometry) return null;
  const ring: number[][] = [];
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === "number") {
      ring.push(coords as number[]);
      return;
    }
    for (const c of coords) walk(c);
  };
  walk(geometry.type === "GeometryCollection" ? geometry.geometries : (geometry as { coordinates: unknown }).coordinates);
  if (!ring.length) return null;
  const lons = ring.map((c) => c[0]!);
  const lats = ring.map((c) => c[1]!);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

function toItems(fc: FeatureCollection): ReviewItem[] {
  const all = (fc.features || [])
    .map((feature) => {
      const id = featureId(feature);
      if (!id || !feature.geometry) return null;
      const area = feature.properties?.["area_id"] ?? feature.properties?.["footprint_id"];
      const label = area != null ? `PV #${area}` : `Fence ${String(id).slice(0, 8)}`;
      return { id: String(id), feature, label };
    })
    .filter((x): x is ReviewItem => Boolean(x));

  // Prefer fences the current user has not voted on yet.
  const pending = all.filter((item) => !String(item.feature.properties?.["my_decision"] || "").trim());
  return pending.length ? pending : all;
}

/**
 * Annotation review — vote keep / reject / needs-changes on saved fence geometries.
 * Swipe → keep, ← reject, ↑ next, ↓ back. Pinch zooms the map.
 */
export function ChipReview({ onExit }: { onExit: () => void }) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [done, setDone] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [pop, setPop] = useState(false);
  const [decision, setDecision] = useState<"keep" | "reject" | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [flagOpen, setFlagOpen] = useState(false);
  const [undoAsk, setUndoAsk] = useState(false);
  const [flagMode, setFlagMode] = useState(0);
  const [history, setHistory] = useState<{ id: string; decision: "confirm" | "reject" | "needs_changes" }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinch = useRef<number | null>(null);
  const points = useRef(new Map<number, { x: number; y: number }>());

  const current = items[index] ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listAnnotations()
      .then((fc) => {
        if (cancelled) return;
        const next = toItems(fc as FeatureCollection);
        setItems(next);
        setIndex(0);
        setReviewed(0);
      })
      .catch((err) => {
        console.error("[ChipReview] load failed", err);
        if (!cancelled) setError("Could not load annotations for review.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!host.current) return;
    const map = new maplibregl.Map({
      container: host.current,
      style: mapStyle as maplibregl.StyleSpecification,
      center: [10.4, 51.2],
      zoom: 6,
      attributionControl: false,
      interactive: true,
      dragRotate: false,
      dragPan: false,
      scrollZoom: true,
      boxZoom: false,
      doubleClickZoom: true,
    });
    mapRef.current = map;
    map.on("load", () => {
      map.addSource("review-ann", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "review-ann-fill",
        type: "fill",
        source: "review-ann",
        filter: ["==", "$type", "Polygon"],
        paint: { "fill-color": "#1fc76e", "fill-opacity": 0.28 },
      });
      map.addLayer({
        id: "review-ann-line",
        type: "line",
        source: "review-ann",
        paint: { "line-color": "#1fc76e", "line-width": 3, "line-opacity": 0.95 },
      });
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !current) return;
    const apply = () => {
      const src = map.getSource("review-ann") as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: "FeatureCollection", features: [current.feature] });
      const b = boundsOf(current.feature.geometry);
      if (b) {
        map.fitBounds(b, { padding: 48, maxZoom: 18, duration: 400 });
      }
    };
    if (map.isStyleLoaded() && map.getSource("review-ann")) apply();
    else map.once("load", apply);
  }, [current]);

  const meta = useMemo(() => {
    const props = (current?.feature.properties ?? {}) as Record<string, unknown>;
    const ctx = props["context"] != null ? String(props["context"]) : null;
    const vis = props["visibility"] != null ? String(props["visibility"]) : null;
    return [ctx, vis].filter(Boolean).join(" · ") || "saved fence";
  }, [current]);

  const decide = async (d: "keep" | "reject" | "needs_changes") => {
    if (!current || decision) return;
    const mapped = d === "keep" ? "confirm" : d === "reject" ? "reject" : "needs_changes";
    setDecision(d === "needs_changes" ? "reject" : d);
    setError(null);
    try {
      await verifyAnnotation(current.id, mapped, undefined);
      setHistory((h) => [...h, { id: current.id, decision: mapped }]);
      setReviewed((r) => r + 1);
      setPop(true);
      window.setTimeout(() => setPop(false), 520);
      window.setTimeout(() => {
        setDecision(null);
        setDone((d) => [...d, current]);
        setItems((prev) => {
          const next = prev.filter((item) => item.id !== current.id);
          setIndex(0);
          return next;
        });
      }, 220);
    } catch (err) {
      console.error("[ChipReview] verify failed", err);
      setDecision(null);
      setError(err instanceof Error ? err.message : "Review save failed");
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.current.size === 1) setStart({ x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!points.current.has(e.pointerId)) return;
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...points.current.values()];
    if (pts.length >= 2) {
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current && mapRef.current) {
        const scale = dist / pinch.current;
        mapRef.current.setZoom(mapRef.current.getZoom() + Math.log2(scale));
      }
      pinch.current = dist;
      return;
    }
    if (!start) return;
    setDrag({ x: e.clientX - start.x, y: e.clientY - start.y });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    points.current.delete(e.pointerId);
    if (points.current.size === 0) pinch.current = null;
    const { x, y } = drag;
    if (Math.abs(x) > Math.abs(y) && Math.abs(x) > 70) {
      void decide(x > 0 ? "keep" : "reject");
    } else if (Math.abs(y) > 70) {
      if (y < 0) setIndex((i) => Math.min(items.length - 1, i + 1));
      else setUndoAsk(true);
    }
    setStart(null);
    setDrag({ x: 0, y: 0 });
  };

  return (
    <div id="dataset-review-shell" className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground">
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(6px,env(safe-area-inset-top))] pb-2">
        <HudButton label="Close review" onClick={onExit}>
          <X className="size-5" />
        </HudButton>
        <div className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            annotation review
          </p>
          <p className="text-sm font-semibold">
            {reviewed} voted · {items.length} left
          </p>
        </div>
        <ProgressRing id="review-ring" value={reviewed} max={Math.max(reviewed + items.length, 1)} pop={pop} />
      </div>

      <div className="flex items-center gap-2 px-4 pb-2">
        <StatusPill>{current?.label ?? "—"}</StatusPill>
        <StatusPill tone="neutral">{meta}</StatusPill>
        <button
          type="button"
          onClick={() => setFlagMode((m) => (m + 1) % (FLAGS.length + 1))}
          aria-label={`${FLAGS.length} review hints. Tap for detail.`}
          className="glass ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 shadow-hud tap-44"
        >
          <AlertCircle className="size-4 shrink-0 text-foreground" />
          {flagMode === 0 ? (
            <span className="font-mono text-[11px] font-semibold">{FLAGS.length}</span>
          ) : (
            <span className="font-mono text-[11px] font-semibold whitespace-nowrap">
              {FLAGS[flagMode - 1]}
            </span>
          )}
        </button>
      </div>

      <div
        className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-[28px] bg-primary shadow-hud"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: decision
            ? `translateX(${decision === "keep" ? 40 : -40}px) rotate(${decision === "keep" ? 4 : -4}deg)`
            : `translate(${drag.x * 0.35}px, ${drag.y * 0.2}px)`,
          transition: decision || !start ? "transform 180ms ease" : undefined,
        }}
      >
        <div ref={host} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-primary/40 text-sm font-medium text-primary-foreground">
            Loading annotations…
          </div>
        )}
        {!loading && !current && (
          <div className="absolute inset-0 grid place-items-center bg-primary/50 px-6 text-center text-sm font-medium text-primary-foreground">
            No annotations left to review. Save fences on the map, then vote keep or reject here.
          </div>
        )}
        {/* swipe tint */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity",
            drag.x > 40 || decision === "keep" ? "bg-lime/35 opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity",
            drag.x < -40 || decision === "reject" ? "bg-destructive/35 opacity-100" : "opacity-0",
          )}
        />
      </div>

      {error && (
        <p className="px-4 pt-2 text-center text-xs font-medium text-destructive">{error}</p>
      )}

      <div className="space-y-3 px-4 pt-3 pb-[max(14px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={!current || Boolean(decision)}
            onClick={() => void decide("reject")}
            className="h-11 min-w-24 rounded-full bg-destructive px-4 font-display text-[14px] font-bold text-destructive-foreground disabled:opacity-40"
          >
            Reject
          </button>
          <HudButton label="Flag annotation" id="chip-flag-btn" onClick={() => setFlagOpen(true)}>
            <Flag className="size-5" />
          </HudButton>
          <button
            type="button"
            disabled={!current || Boolean(decision)}
            onClick={() => void decide("keep")}
            className="h-11 min-w-24 rounded-full bg-lime px-4 font-display text-[14px] font-bold text-lime-foreground disabled:opacity-40"
          >
            Keep
          </button>
        </div>
        <div className="flex items-center justify-center">
          <HudButton label="Undo last decision" onClick={() => setUndoAsk(true)}>
            <Undo2 className="size-5" />
          </HudButton>
        </div>
        <p className="text-center font-mono text-[11px] text-muted-foreground">
          swipe → keep · ← reject · or use the buttons · pinch to zoom
        </p>
      </div>

      {undoAsk && (
        <div className="absolute inset-0 z-10 flex flex-col justify-end bg-primary/45">
          <div className="space-y-3 rounded-t-[28px] bg-card p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-card-foreground shadow-sheet">
            <h2 className="text-lg font-semibold">Go back one annotation?</h2>
            <p className="text-sm text-muted-foreground">
              Jump to the previous fence. Votes already stored stay; you can vote again on it.
            </p>
            <button
              type="button"
              onClick={() => {
                setUndoAsk(false);
                const last = done[done.length - 1];
                if (!last) return;
                setDone((d) => d.slice(0, -1));
                setItems((prev) => [last, ...prev.filter((item) => item.id !== last.id)]);
                setIndex(0);
                setReviewed((r) => Math.max(0, r - 1));
                setHistory((h) => h.slice(0, -1));
              }}
              className="h-12 w-full rounded-full bg-lime font-display text-[15px] font-bold text-lime-foreground"
            >
              Show previous annotation
            </button>
            <button
              type="button"
              onClick={() => setUndoAsk(false)}
              className="h-11 w-full rounded-full text-sm font-semibold text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {flagOpen && (
        <div className="absolute inset-0 z-10 flex flex-col justify-end bg-primary/45">
          <div className="space-y-3 rounded-t-[28px] bg-card p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-card-foreground shadow-sheet">
            <h2 className="text-lg font-semibold">Why is this annotation wrong?</h2>
            <div className="grid gap-2">
              {NEGATIVES.map((n, i) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setFlagOpen(false);
                    void decide("needs_changes");
                  }}
                  className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-left text-sm font-semibold"
                >
                  <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFlagOpen(false)}
              className="h-12 w-full rounded-full border border-border text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
