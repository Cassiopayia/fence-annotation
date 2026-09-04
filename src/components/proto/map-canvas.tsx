import { useEffect, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

import { MapModule } from "@/lib/zaun/map";
import { DrawModule } from "@/lib/zaun/draw";
import { boundsFromMap, listAnnotations, listSystems } from "@/lib/zaun/public-api";
import { loadDopCatalog } from "@/lib/zaun/wms-client";
import { initImageryService } from "@/lib/zaun/imagery-service";
import { authorLabel, currentUsernameOrOmit } from "@/lib/zaun/supabase-client";
import type { SystemStatus } from "@/components/proto/status";

export type { SystemStatus };

export type Sys = {
  id: string;
  status: SystemStatus;
  ring: [number, number][];
  fence: [number, number][];
  /** optional place hint from catalog props */
  location?: string;
};

function ringFromGeometry(geometry: Feature["geometry"] | null | undefined): [number, number][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    return (geometry.coordinates[0] ?? []) as [number, number][];
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates[0]?.[0] ?? []) as [number, number][];
  }
  return [];
}

function statusFromProps(props: Record<string, unknown> | null | undefined): SystemStatus {
  const raw = String(props?.["status"] ?? props?.["fence_status"] ?? "unknown").toLowerCase();
  if (raw === "verified" || raw === "confirm") return "verified";
  if (raw === "flagged" || raw === "needs_changes" || raw === "reject") return "flagged";
  if (raw === "excluded") return "excluded";
  if (raw === "mine" || raw === "yours" || props?.["mine"] === true) return "mine";
  if (raw === "awaiting" || raw === "pending") return "awaiting";
  if (raw === "annotated" || props?.["annotated"] === true) {
    const author = String(props?.["author_label"] ?? props?.["annotated_by"] ?? "");
    const me = currentUsernameOrOmit() || authorLabel();
    if (author && me && author === me) return "mine";
    return "awaiting";
  }
  return "open";
}

function featureToSys(feature: Feature): Sys | null {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const id = String(props["area_id"] ?? props["footprint_id"] ?? feature.id ?? "");
  if (!id) return null;
  const ring = ringFromGeometry(feature.geometry);
  if (ring.length < 3) return null;
  const location = props["location"] != null ? String(props["location"]) : undefined;
  const sys: Sys = {
    id,
    status: statusFromProps(props),
    ring,
    fence: [],
  };
  if (location) sys.location = location;
  return sys;
}

/** Fallback seeds used until the catalog loads (keeps UI interactive). */
export const SYSTEMS: Sys[] = [
  {
    id: "1",
    status: "open",
    ring: [
      [11.831, 47.907],
      [11.832, 47.907],
      [11.832, 47.908],
      [11.831, 47.908],
      [11.831, 47.907],
    ],
    fence: [],
  },
];

type Props = {
  focus?: boolean;
  aoi?: boolean;
  fence?: boolean;
  reveal?: boolean;
  pv?: boolean;
  selected?: string;
  onSelect?: (id: string) => void;
  /** User tapped a PV polygon/outline — open system info (not used for boot selection). */
  onSystemOpen?: (id: string) => void;
  recenterKey?: number;
  bottomPad?: number;
  /** When true, enter line-draw mode for guided annotation. */
  drawing?: boolean;
  /** MapLibre attribution (i) — map browse chrome only. */
  showAttribution?: boolean;
  /** Receives the live catalog once loaded (for prev/next chrome). */
  onSystemsLoaded?: (systems: Sys[]) => void;
};

/**
 * MapLibre canvas backed by the fency map stack, inside the Lovable shell.
 */
export function MapCanvas({
  focus = false,
  aoi = false,
  fence = false,
  reveal = false,
  pv = true,
  selected,
  onSelect,
  onSystemOpen,
  recenterKey = 0,
  bottomPad = 120,
  drawing = false,
  showAttribution = false,
  onSystemsLoaded,
}: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const systemsRef = useRef<Sys[]>(SYSTEMS);
  const [systems, setSystems] = useState<Sys[]>(SYSTEMS);
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSystemOpenRef = useRef(onSystemOpen);
  onSystemOpenRef.current = onSystemOpen;
  const onSystemsLoadedRef = useRef(onSystemsLoaded);
  onSystemsLoadedRef.current = onSystemsLoaded;

  /* boot MapModule once */
  useEffect(() => {
    if (!host.current) return;
    let cancelled = false;

    const { map } = MapModule.init(host.current as unknown as string);
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __map?: MlMap }).__map = map;

    const pickSystem = (e: {
      point: { x: number; y: number };
      originalEvent?: Event;
    }) => {
      // Never steal taps while tracing a fence.
      if (drawingRef.current || DrawModule.isAnnotationDrawing?.()) return;

      const oe = e.originalEvent as PointerEvent | TouchEvent | undefined;
      const coarse =
        typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(pointer: coarse)").matches;
      const isTouch =
        coarse
        || oe?.pointerType === "touch"
        || Boolean(oe && "changedTouches" in oe);
      // Finger taps miss thin outlines — enlarge the hit box on touch / coarse pointers.
      const pad = isTouch ? 22 : 4;
      const layers = ["systems-fill", "systems-hit", "systems-line"].filter((id) =>
        Boolean(map.getLayer(id)),
      );
      if (!layers.length) return;
      const hits = map.queryRenderedFeatures(
        [
          [e.point.x - pad, e.point.y - pad],
          [e.point.x + pad, e.point.y + pad],
        ],
        { layers },
      );
      const feature = hits[0];
      if (!feature) return;

      const props = feature.properties as Record<string, unknown> | undefined;
      const id = props?.["area_id"] ?? props?.["footprint_id"] ?? props?.["id"] ?? feature.id;
      if (id == null) return;
      const sid = String(id);
      onSelectRef.current?.(sid);
      onSystemOpenRef.current?.(sid);
    };

    // Map-level click (not layer-bound): reliable on iPhone + desktop.
    map.on("click", pickSystem);

    const boot = async () => {
      try {
        const [catalog, systemsFc, annotations] = await Promise.all([
          loadDopCatalog().catch(() => []),
          listSystems(),
          listAnnotations(boundsFromMap(map)).catch(() => ({
            type: "FeatureCollection" as const,
            features: [],
          })),
        ]);
        if (cancelled) return;

        MapModule.setSystems(systemsFc);
        MapModule.setAnnotations(annotations);
        MapModule.setPvSystemsVisible?.(true);
        MapModule.setAnnotationsVisible?.(true);
        if (Array.isArray(catalog) && catalog.length) {
          MapModule.setDopCoverageFromCatalog(catalog);
        }
        await initImageryService(map);

        const parsed = ((systemsFc as FeatureCollection).features || [])
          .map(featureToSys)
          .filter((s): s is Sys => Boolean(s));
        if (parsed.length) {
          systemsRef.current = parsed;
          setSystems(parsed);
          onSystemsLoadedRef.current?.(parsed);
          if (!selected) onSelectRef.current?.(parsed[0]!.id);
        }
      } catch (err) {
        console.error("[MapCanvas] failed to load catalog", err);
      }
    };

    const reloadAnnotations = () => {
      if (cancelled || !readyRef.current) return;
      void listAnnotations(boundsFromMap(map))
        .then((fc) => {
          if (!cancelled) {
            MapModule.setAnnotations(fc);
            MapModule.setAnnotationsVisible?.(true);
          }
        })
        .catch(() => {});
    };

    map.once("load", () => {
      readyRef.current = true;
      void boot();
      if (drawingRef.current) {
        DrawModule.setActiveState("ANNOTATION");
      }
    });

    map.on("moveend", reloadAnnotations);

    return () => {
      cancelled = true;
      readyRef.current = false;
      map.off("moveend", reloadAnnotations);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* fly to selected system */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !selected) return;
    const sys = systemsRef.current.find((s) => s.id === selected) ?? systems.find((s) => s.id === selected);
    if (!sys?.ring.length) return;

    const lons = sys.ring.map((p) => p[0]);
    const lats = sys.ring.map((p) => p[1]);
    m.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      {
        padding: { top: 96, left: 48, right: 48, bottom: bottomPad + 48 },
        duration: 700,
        maxZoom: reveal ? 16.6 : 18,
      },
    );
  }, [selected, recenterKey, reveal, bottomPad, systems]);

  useEffect(() => {
    MapModule.setPvSystemsVisible?.(pv);
  }, [pv]);

  useEffect(() => {
    if (focus && selected) {
      MapModule.setDistractionBlending?.(selected, 0.32);
    } else {
      MapModule.setDistractionBlending?.(null, 0.55);
    }
  }, [focus, selected]);

  /* enter / leave draw mode once the map is ready; re-assert while drawing stays true */
  useEffect(() => {
    let tries = 0;
    let alive = true;
    const arm = () => {
      if (!alive || !MapModule.getDraw?.()) return false;
      if (drawing) DrawModule.setActiveState("ANNOTATION");
      else DrawModule.setActiveState("OVERVIEW");
      return true;
    };
    if (arm() && drawing) {
      // Keep re-arming briefly so Strict Mode / late Draw init cannot leave OVERVIEW.
      const keep = window.setInterval(() => {
        tries += 1;
        if (!alive || !drawing || tries > 20) {
          window.clearInterval(keep);
          return;
        }
        DrawModule.setActiveState("ANNOTATION");
      }, 200);
      return () => {
        alive = false;
        window.clearInterval(keep);
      };
    }
    const t = window.setInterval(() => {
      tries += 1;
      if (arm() || tries > 40) window.clearInterval(t);
    }, 50);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [drawing]);

  void aoi;
  void fence;

  return (
    <div
      id="map"
      data-attrib={showAttribution ? "on" : "off"}
      className="absolute inset-0 overflow-hidden bg-primary [touch-action:none]"
    >
      <div ref={host} className="h-full w-full cursor-crosshair" />
      {/* Dim only — must not intercept draw clicks */}
      {focus && <div className="pointer-events-none absolute inset-0 bg-primary/20" />}
    </div>
  );
}

export function getMapDraw() {
  return MapModule.getDraw?.() ?? null;
}

export function getDrawnGeometry(): GeoJSON.Geometry | null {
  const draw = MapModule.getDraw?.();
  if (!draw) return null;
  const fc = (DrawModule.getFeatures?.() || draw.getAll?.()) as FeatureCollection | undefined;
  const features = fc?.features || [];
  // Prefer a closed/finished LineString with ≥2 vertices; fall back to any line/poly.
  const lines = features.filter((f) => f.geometry?.type === "LineString");
  const bestLine = [...lines].sort((a, b) => {
    const la = (a.geometry as GeoJSON.LineString).coordinates?.length || 0;
    const lb = (b.geometry as GeoJSON.LineString).coordinates?.length || 0;
    return lb - la;
  })[0];
  if (bestLine?.geometry) return bestLine.geometry;
  const poly = features.find((f) => f.geometry?.type === "Polygon");
  return poly?.geometry ?? null;
}
