import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { AlertCircle, Eye, EyeOff, Flag, Minus, Plus, Undo2, X } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import { ensureMapLibreWorker } from "@/lib/zaun/maplibre-setup";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { HudButton, ProgressRing, StatusPill } from "./primitives";
import { cn } from "@/lib/utils";
import { featureId, forgetLocalReview, listAnnotations, verifyAnnotation } from "@/lib/zaun/public-api";
import { authorLabel, currentUsernameOrOmit, ensureAuthSession } from "@/lib/zaun/supabase-client";
import { GUEST_AUTHOR_LABEL, displayAuthorName } from "@/lib/zaun/username";

/** Aerial first — review needs to see the fence on imagery, not a blank purple card. */
const ESRI =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const BASEMAP_DE =
  "https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png";

const reviewMapStyle: StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    aerial: {
      type: "raster",
      tiles: [ESRI],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© Esri / Maxar",
    },
    basemap: {
      type: "raster",
      tiles: [BASEMAP_DE],
      tileSize: 256,
      maxzoom: 18,
      attribution: "© GeoBasis-DE / BKG",
    },
  },
  layers: [
    { id: "aerial", type: "raster", source: "aerial" },
    {
      id: "basemap",
      type: "raster",
      source: "basemap",
      layout: { visibility: "none" },
    },
  ],
};

const FLAGS = [
  "tile seam",
  "cut-off fence",
  "wrong geometry",
  "needs redraw",
  "not visible",
  "can't label",
];
const NEGATIVES = ["PV modules", "Road", "Furrow", "Forest edge", "Complex geo", "No fence visible", "Can't label"];

type ReviewItem = {
  id: string;
  feature: Feature;
  label: string;
};

/** Magenta + white casing — lime disappears on green fields. */
const REVIEW_FENCE = "#ff2bd6";
const REVIEW_HALO = "#ffffff";
const REVIEW_OVERLAY_IDS = [
  "review-ann-halo",
  "review-ann-fill",
  "review-ann-line",
  "review-ann-verts-halo",
  "review-ann-verts",
] as const;

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

/** Closed LineString fences paint as polygons so fill + outline both show. */
function geometryForReview(geometry: Geometry | null | undefined): Geometry | null | undefined {
  if (!geometry) return geometry;
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") return geometry;
  if (geometry.type !== "LineString") return geometry;
  const coords = geometry.coordinates || [];
  if (coords.length < 4) return geometry;
  const a = coords[0];
  const b = coords[coords.length - 1];
  if (!a || !b) return geometry;
  if (Math.abs(Number(a[0]) - Number(b[0])) > 1e-9 || Math.abs(Number(a[1]) - Number(b[1])) > 1e-9) {
    return geometry;
  }
  return { type: "Polygon", coordinates: [coords.slice()] };
}

function ensureReviewOverlay(map: maplibregl.Map) {
  if (!map.getSource("review-ann")) {
    map.addSource("review-ann", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer("review-ann-halo")) {
    map.addLayer({
      id: "review-ann-halo",
      type: "line",
      source: "review-ann",
      paint: {
        "line-color": REVIEW_HALO,
        "line-width": 8,
        "line-opacity": 0.95,
        "line-join": "round",
        "line-cap": "round",
      },
    });
  }
  if (!map.getLayer("review-ann-fill")) {
    map.addLayer({
      id: "review-ann-fill",
      type: "fill",
      source: "review-ann",
      filter: ["==", "$type", "Polygon"],
      paint: { "fill-color": REVIEW_FENCE, "fill-opacity": 0.22 },
    });
  }
  if (!map.getLayer("review-ann-line")) {
    map.addLayer({
      id: "review-ann-line",
      type: "line",
      source: "review-ann",
      paint: {
        "line-color": REVIEW_FENCE,
        "line-width": 3.5,
        "line-opacity": 1,
        "line-join": "round",
        "line-cap": "round",
      },
    });
  }
  if (!map.getLayer("review-ann-verts-halo")) {
    map.addLayer({
      id: "review-ann-verts-halo",
      type: "circle",
      source: "review-ann",
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-radius": 7,
        "circle-color": REVIEW_HALO,
        "circle-stroke-width": 0,
      },
    });
  }
  if (!map.getLayer("review-ann-verts")) {
    map.addLayer({
      id: "review-ann-verts",
      type: "circle",
      source: "review-ann",
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-radius": 4.5,
        "circle-color": REVIEW_FENCE,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#111",
      },
    });
  }
}

function isLocalOnlyAnnotationId(id: string) {
  const s = String(id || "");
  return s.startsWith("ann_") || s.startsWith("local_") || s.startsWith("local-");
}

function isOwnReviewFeature(props: Record<string, unknown>, id: string) {
  if (props["is_own"] === true || props["is_own"] === "true") return true;
  if (props["sync_state"] === "pending") return true;
  if (isLocalOnlyAnnotationId(id)) return true;
  return false;
}

function classifyReviewPool(fc: FeatureCollection) {
  const meName = displayAuthorName(currentUsernameOrOmit() || authorLabel());
  const namedMe = Boolean(currentUsernameOrOmit());
  let own = 0;
  let voted = 0;
  let verified = 0;
  let left = 0;

  for (const feature of fc.features || []) {
    const id = featureId(feature);
    if (!id || !feature.geometry) continue;
    const props = feature.properties || {};
    if (isOwnReviewFeature(props, id)) {
      own += 1;
      continue;
    }
    if (namedMe) {
      const author = displayAuthorName(String(props["author_label"] || GUEST_AUTHOR_LABEL));
      if (author === meName) {
        own += 1;
        continue;
      }
    }
    if (String(props["my_decision"] || "").trim()) {
      voted += 1;
      continue;
    }
    const review = String(props["review_status"] || "").toLowerCase();
    if (review === "verified" || props["is_public"] === true || props["is_public"] === "true") {
      verified += 1;
      continue;
    }
    left += 1;
  }

  return { own, voted, verified, left };
}

function toItems(fc: FeatureCollection): ReviewItem[] {
  const meName = displayAuthorName(currentUsernameOrOmit() || authorLabel());
  const namedMe = Boolean(currentUsernameOrOmit());

  return (fc.features || [])
    .map((feature) => {
      const id = featureId(feature);
      if (!id || !feature.geometry) return null;
      const props = feature.properties || {};
      if (isOwnReviewFeature(props, id)) return null;
      if (namedMe) {
        const author = displayAuthorName(String(props["author_label"] || GUEST_AUTHOR_LABEL));
        if (author === meName) return null;
      }
      if (String(props["my_decision"] || "").trim()) return null;
      const review = String(props["review_status"] || "").toLowerCase();
      if (review === "verified" || props["is_public"] === true || props["is_public"] === "true") {
        return null;
      }
      const area = props["area_id"] ?? props["footprint_id"];
      const label = area != null ? `PV #${area}` : `Fence ${String(id).slice(0, 8)}`;
      return { id: String(id), feature, label };
    })
    .filter((x): x is ReviewItem => Boolean(x));
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
  const [pool, setPool] = useState({ own: 0, voted: 0, verified: 0, left: 0 });
  const [pop, setPop] = useState(false);
  const [decision, setDecision] = useState<"keep" | "reject" | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [flagOpen, setFlagOpen] = useState(false);
  const [undoAsk, setUndoAsk] = useState(false);
  const [flagMode, setFlagMode] = useState(0);
  const [history, setHistory] = useState<{ id: string; decision: "confirm" | "reject" | "needs_changes" }[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Blink the drawn fence off to judge bare imagery. */
  const [fenceVisible, setFenceVisible] = useState(true);
  const host = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const fittedIdRef = useRef<string | null>(null);
  /** Once the user pinches/scrolls/pans, never snap the camera back for this chip. */
  const userCameraRef = useRef(false);
  const pinch = useRef<number | null>(null);
  const points = useRef(new Map<number, { x: number; y: number }>());
  const currentRef = useRef<ReviewItem | null>(null);

  const current = items[index] ?? null;
  currentRef.current = current;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        // Need a session so is_own / my_decision from the RPC are accurate.
        await ensureAuthSession().catch(() => null);
        const fc = await listAnnotations();
        if (cancelled) return;
        const fcTyped = fc as FeatureCollection;
        const next = toItems(fcTyped);
        const stats = classifyReviewPool(fcTyped);
        setPool(stats);
        setItems(next);
        // Session starts with prior votes from the server so the ring isn't "0 / 1".
        setReviewed(stats.voted);
        setIndex(0);
      } catch (err) {
        console.error("[ChipReview] load failed", err);
        if (!cancelled) setError("Could not load annotations for review.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    ensureMapLibreWorker();

    const map = new maplibregl.Map({
      container: el,
      style: reviewMapStyle,
      center: [10.4, 51.2],
      zoom: 6,
      minZoom: 1,
      maxZoom: 20,
      attributionControl: false,
      interactive: true,
      dragRotate: false,
      dragPan: true,
      scrollZoom: true,
      boxZoom: false,
      doubleClickZoom: true,
      touchZoomRotate: true,
      fadeDuration: 0,
    });
    mapRef.current = map;
    try {
      map.touchZoomRotate.disableRotation();
      // Make wheel / trackpad zoom feel responsive (default is sluggish on desktop).
      map.scrollZoom.setZoomRate(1 / 100);
      map.scrollZoom.setWheelZoomRate(1 / 450);
    } catch {
      /* ignore */
    }

    const paint = () => {
      try {
        map.resize();
      } catch {
        /* ignore */
      }
    };

    // Any real user camera gesture cancels an in-flight fitBounds and locks free zoom.
    const onUserCamera = (e: { originalEvent?: Event }) => {
      if (!e?.originalEvent) return;
      userCameraRef.current = true;
      try {
        map.stop();
      } catch {
        /* ignore */
      }
    };
    map.on("zoomstart", onUserCamera);
    map.on("dragstart", onUserCamera);
    map.on("rotatestart", onUserCamera);

    map.on("load", () => {
      try {
        ensureReviewOverlay(map);
      } catch {
        /* style mid-load */
      }
      paint();
    });
    // Absolute flex host is often 0×0 on the first frame (same bug as loupe).
    requestAnimationFrame(() => {
      requestAnimationFrame(paint);
    });
    const t = window.setTimeout(paint, 80);
    const t2 = window.setTimeout(paint, 300);
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => paint())
      : null;
    ro?.observe(el);
    window.addEventListener("resize", paint);
    window.visualViewport?.addEventListener("resize", paint);

    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      ro?.disconnect();
      window.removeEventListener("resize", paint);
      window.visualViewport?.removeEventListener("resize", paint);
      map.off("zoomstart", onUserCamera);
      map.off("dragstart", onUserCamera);
      map.off("rotatestart", onUserCamera);
      try {
        map.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
    };
  }, []);

  // New chip → allow one auto-fit; after that the user owns the camera.
  useEffect(() => {
    fittedIdRef.current = null;
    userCameraRef.current = false;
  }, [current?.id]);

  useEffect(() => {
    const map = mapRef.current;
    const chip = currentRef.current;
    if (!map || !chip) return;

    const applyData = () => {
      const live = currentRef.current;
      if (!live) return;
      try {
        map.resize();
      } catch {
        /* ignore */
      }
      try {
        ensureReviewOverlay(map);
      } catch {
        /* style mid-load */
        return;
      }
      const src = map.getSource("review-ann") as maplibregl.GeoJSONSource | undefined;
      const paintGeom = geometryForReview(live.feature.geometry) || live.feature.geometry;
      const painted: Feature = {
        ...live.feature,
        geometry: paintGeom as Geometry,
      };
      const features: Feature[] = [painted];
      const ringCoords =
        paintGeom?.type === "Polygon"
          ? paintGeom.coordinates?.[0] || []
          : paintGeom?.type === "LineString"
            ? paintGeom.coordinates || []
            : [];
      for (const coord of ringCoords) {
        if (!coord || coord.length < 2) continue;
        features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [coord[0]!, coord[1]!] },
        });
      }
      src?.setData({ type: "FeatureCollection", features });

      // Fit only once per chip — never on idle / overlay toggles / re-renders.
      if (fittedIdRef.current === live.id || userCameraRef.current) return;
      const b = boundsOf(paintGeom);
      if (!b) return;
      const [[west, south], [east, north]] = b;
      // Degenerate / point-like bounds still need a camera jump.
      const span = Math.max(east - west, north - south);
      const pad = Math.max(0.0002, span * 0.35);
      try {
        fittedIdRef.current = live.id;
        map.fitBounds(
          [
            [west - pad, south - pad],
            [east + pad, north + pad],
          ],
          { padding: 56, maxZoom: span < 1e-5 ? 17 : 18, duration: 350 },
        );
      } catch {
        /* ignore */
      }
    };

    if (map.isStyleLoaded()) {
      applyData();
      return;
    }
    map.once("load", applyData);
    return () => {
      map.off("load", applyData);
    };
  }, [current?.id]);

  // Quick compare: hide / show the fence overlay without leaving the chip.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const vis = fenceVisible ? "visible" : "none";
    for (const id of REVIEW_OVERLAY_IDS) {
      if (!map.getLayer(id)) continue;
      try {
        map.setLayoutProperty(id, "visibility", vis);
      } catch {
        /* style mid-load */
      }
    }
  }, [fenceVisible, current]);

  // New chip → fence back on so each vote starts with the annotation visible.
  useEffect(() => {
    setFenceVisible(true);
  }, [current?.id]);

  const meta = useMemo(() => {
    const props = (current?.feature.properties ?? {}) as Record<string, unknown>;
    const ctx = props["context"] != null ? String(props["context"]) : null;
    const visRaw = props["visibility"] != null ? String(props["visibility"]) : null;
    // DB gate values (visible/pending) are not imagery tags.
    const vis =
      visRaw && !["visible", "pending", "hidden", "excluded"].includes(visRaw.toLowerCase())
        ? visRaw
        : null;
    return [ctx, vis].filter(Boolean).join(" · ") || "saved fence";
  }, [current]);

  const decide = async (d: "keep" | "reject" | "needs_changes", reason?: string) => {
    if (!current || decision) return;
    const mapped = d === "keep" ? "confirm" : d === "reject" ? "reject" : "needs_changes";
    setDecision(d === "needs_changes" ? "reject" : d);
    setError(null);
    try {
      await verifyAnnotation(current.id, mapped, undefined, reason);
      setHistory((h) => [...h, { id: current.id, decision: mapped }]);
      setReviewed((r) => r + 1);
      setPool((p) => ({
        ...p,
        voted: p.voted + 1,
        left: Math.max(0, p.left - 1),
      }));
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
      const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message || err);
      // Own fence slipped through — drop it and keep reviewing others.
      if (/your own annotation|cannot verify/i.test(msg)) {
        setItems((prev) => {
          const next = prev.filter((item) => item.id !== current.id);
          setIndex(0);
          return next;
        });
        setError("Skipped — that fence is yours. You can only review other people’s annotations.");
        return;
      }
      setError(msg || "Review save failed");
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
    // Two fingers → leave pinch-zoom to MapLibre; don't treat as swipe.
    if (pts.length >= 2) {
      pinch.current = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      setStart(null);
      setDrag({ x: 0, y: 0 });
      return;
    }
    if (!start) return;
    setDrag({ x: e.clientX - start.x, y: e.clientY - start.y });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    points.current.delete(e.pointerId);
    const wasPinch = pinch.current != null || points.current.size > 0;
    if (points.current.size === 0) pinch.current = null;
    // Ignore vote swipe if this was / still is a pinch.
    if (wasPinch) {
      setStart(null);
      setDrag({ x: 0, y: 0 });
      return;
    }
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

  const queueDone = !loading && items.length === 0;
  const ringMax = Math.max(reviewed + items.length, pool.voted + pool.left, 1);
  const ringValue = queueDone ? ringMax : reviewed;
  // Only tip the card once a clear horizontal swipe is underway — otherwise
  // the CSS transform fights MapLibre pan/pinch and zoom-out feels broken.
  const swipeHint =
    !decision
    && Math.abs(drag.x) > 28
    && Math.abs(drag.x) > Math.abs(drag.y) * 1.15;

  const nudgeZoom = (dir: 1 | -1) => {
    const map = mapRef.current;
    if (!map) return;
    userCameraRef.current = true;
    try {
      map.stop();
      map.easeTo({ zoom: map.getZoom() + dir, duration: 180 });
    } catch {
      /* ignore */
    }
  };

  return (
    <div id="dataset-review-shell" className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground">
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(6px,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={() => setFlagMode((m) => (m + 1) % (FLAGS.length + 1))}
          aria-label="Flag tip. Tap to cycle reasons."
          className="glass flex max-w-[46%] shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 shadow-hud tap-44"
        >
          <AlertCircle className="size-4 shrink-0" />
          {flagMode === 0 ? (
            <span className="font-mono text-[11px] font-semibold">
              Flag
              <span className="ml-1 text-muted-foreground">tips</span>
            </span>
          ) : (
            <span className="truncate font-mono text-[11px] font-semibold whitespace-nowrap">
              {FLAGS[flagMode - 1]}
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            annotation review
          </p>
          <p className="truncate text-sm font-semibold">
            {queueDone
              ? pool.voted + reviewed > 0
                ? `Caught up · ${Math.max(reviewed, pool.voted)} reviewed`
                : "Nothing to review"
              : `${reviewed} reviewed · ${items.length} left`}
          </p>
        </div>
        <ProgressRing
          id="review-ring"
          value={ringValue}
          max={ringMax}
          complete={queueDone}
          center={queueDone ? "100%" : reviewed}
          pop={pop}
        />
      </div>

      <div className="flex items-center gap-2 px-4 pb-2">
        <StatusPill>{current?.label ?? "—"}</StatusPill>
        <StatusPill tone="neutral">{meta}</StatusPill>
      </div>

      <div
        className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-[28px] bg-black shadow-hud [touch-action:none]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: decision
            ? `translateX(${decision === "keep" ? 40 : -40}px) rotate(${decision === "keep" ? 4 : -4}deg)`
            : swipeHint
              ? `translate(${drag.x * 0.35}px, ${drag.y * 0.12}px)`
              : undefined,
          transition: decision || !start ? "transform 180ms ease" : undefined,
        }}
      >
        <div ref={host} className="absolute inset-0 h-full w-full [&_.maplibregl-map]:h-full [&_.maplibregl-canvas]:!block" />
        {current && !loading && (
          <div className="absolute right-3 top-3 z-[2] flex flex-col gap-2">
            <button
              type="button"
              aria-label="Zoom in"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => nudgeZoom(1)}
              className="glass grid size-11 place-items-center rounded-full border border-border shadow-hud"
            >
              <Plus className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => nudgeZoom(-1)}
              className="glass grid size-11 place-items-center rounded-full border border-border shadow-hud"
            >
              <Minus className="size-5" />
            </button>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 z-[1] grid place-items-center bg-black/50 text-sm font-medium text-white">
            Loading annotations…
          </div>
        )}
        {!loading && !current && (
          <div className="absolute inset-0 z-[1] grid place-items-center bg-black/60 px-6 text-center text-sm font-medium text-white">
            {pool.voted > 0 || pool.own > 0 || pool.verified > 0 ? (
              <span>
                You’re caught up.
                {pool.voted > 0 ? ` ${pool.voted} already reviewed by you.` : ""}
                {pool.own > 0 ? ` ${pool.own} are yours (others review those).` : ""}
                {pool.verified > 0 ? ` ${pool.verified} already verified.` : ""}
              </span>
            ) : (
              <span>No annotations left to review. Save fences on the map so others can vote keep or reject.</span>
            )}
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
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          <button
            type="button"
            disabled={!current || Boolean(decision)}
            onClick={() => void decide("reject")}
            className="h-11 min-w-20 rounded-full bg-destructive px-3 font-display text-[14px] font-bold text-destructive-foreground disabled:opacity-40 sm:min-w-24 sm:px-4"
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
            className="h-11 min-w-20 rounded-full bg-lime px-3 font-display text-[14px] font-bold text-lime-foreground disabled:opacity-40 sm:min-w-24 sm:px-4"
          >
            Keep
          </button>
        </div>
        <div className="flex items-center justify-center gap-3">
          <HudButton
            label={fenceVisible ? "Hide annotation overlay" : "Show annotation overlay"}
            disabled={!current}
            active={!fenceVisible}
            onClick={() => setFenceVisible((v) => !v)}
          >
            {fenceVisible ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
          </HudButton>
          <HudButton label="Undo last decision" onClick={() => setUndoAsk(true)}>
            <Undo2 className="size-5" />
          </HudButton>
          <HudButton label="Close review" onClick={onExit}>
            <X className="size-5" />
          </HudButton>
        </div>
      </div>

      {undoAsk && (
        <div className="absolute inset-0 z-10 flex flex-col justify-end bg-primary/45">
          <div className="space-y-3 rounded-t-[28px] bg-card p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-card-foreground shadow-sheet">
            <h2 className="text-lg font-semibold">Go back one annotation?</h2>
            <p className="text-sm text-muted-foreground">
              {done.length
                ? "Jump to the previous fence. You can change your vote — the new decision replaces the last one."
                : "No previous review in this session yet."}
            </p>
            <button
              type="button"
              disabled={!done.length}
              onClick={() => {
                setUndoAsk(false);
                const last = done[done.length - 1];
                if (!last) return;
                forgetLocalReview(last.id);
                // Allow re-vote: clear local my_decision stamp from the restored chip.
                const restored: ReviewItem = {
                  ...last,
                  feature: {
                    ...last.feature,
                    properties: { ...(last.feature.properties || {}), my_decision: "" },
                  },
                };
                setDone((d) => d.slice(0, -1));
                setItems((prev) => [restored, ...prev.filter((item) => item.id !== restored.id)]);
                setIndex(0);
                setReviewed((r) => Math.max(0, r - 1));
                setPool((p) => ({
                  ...p,
                  voted: Math.max(0, p.voted - 1),
                  left: p.left + 1,
                }));
                setHistory((h) => h.slice(0, -1));
                setError(null);
                setDecision(null);
              }}
              className="h-12 w-full rounded-full bg-lime font-display text-[15px] font-bold text-lime-foreground disabled:opacity-40"
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
                    void decide("needs_changes", n);
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
