import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ensureMapLibreWorker } from "@/lib/zaun/maplibre-setup";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, StyleSpecification } from "maplibre-gl";
import { cn } from "@/lib/utils";
import { MapModule } from "@/lib/zaun/map";

const LAYERS = ["Maxar", "basemap.de", "OSM"] as const;
type LoupeLayer = (typeof LAYERS)[number];
const SIZE = 148;
const LOUPE_ZOOM_BONUS = 2.5;

const BASEMAP_DE =
  "https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png";
const ESRI =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function rasterStyle(
  tiles: string[],
  attribution: string,
  maxzoom = 19,
): StyleSpecification {
  return {
    version: 8,
    sources: {
      imagery: {
        type: "raster",
        tiles,
        tileSize: 256,
        maxzoom,
        attribution,
      },
    },
    layers: [{ id: "imagery", type: "raster", source: "imagery" }],
  };
}

const LAYER_STYLE: Record<LoupeLayer, StyleSpecification> = {
  Maxar: rasterStyle([ESRI], "© Esri / Maxar", 19),
  "basemap.de": rasterStyle([BASEMAP_DE], "© GeoBasis-DE / BKG (basemap.de)", 18),
  OSM: rasterStyle(["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], "© OpenStreetMap", 14),
};

/**
 * Draggable magnifier — second MapLibre view centered under the loupe glass.
 */
export function Loupe({ onClose }: { onClose: () => void }) {
  const [pos, setPos] = useState({ x: 24, y: 220 });
  const [layer, setLayer] = useState<LoupeLayer>(LAYERS[0]!);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const off = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const mapHost = useRef<HTMLDivElement | null>(null);
  const loupeMap = useRef<MlMap | null>(null);
  const layerRef = useRef(layer);
  layerRef.current = layer;

  const syncView = () => {
    const main = MapModule.getMap?.();
    const lm = loupeMap.current;
    const host = mapHost.current;
    if (!main || !lm || !host) return;
    const rect = host.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const mainRect = main.getContainer().getBoundingClientRect();
    const point = {
      x: rect.left + rect.width / 2 - mainRect.left,
      y: rect.top + rect.height / 2 - mainRect.top,
    };
    try {
      const lngLat = main.unproject([point.x, point.y]);
      lm.jumpTo({
        center: lngLat,
        zoom: Math.min(22, main.getZoom() + LOUPE_ZOOM_BONUS),
        bearing: main.getBearing(),
      });
    } catch {
      /* map may be mid-remove */
    }
  };

  useEffect(() => {
    const host = mapHost.current;
    if (!host || loupeMap.current) return;

    ensureMapLibreWorker();
    let cancelled = false;
    const m = new maplibregl.Map({
      container: host,
      style: LAYER_STYLE[layerRef.current],
      interactive: false,
      attributionControl: false,
      center: [10.4, 51.2],
      zoom: 16,
      fadeDuration: 0,
    });
    loupeMap.current = m;

    const paint = () => {
      if (cancelled) return;
      try {
        m.resize();
        syncView();
      } catch {
        /* ignore */
      }
    };

    m.on("load", paint);
    // Absolute host often reports 0×0 on the first frame — resize after layout.
    requestAnimationFrame(() => {
      requestAnimationFrame(paint);
    });
    const t = window.setTimeout(paint, 120);

    const main = MapModule.getMap?.();
    const onMain = () => syncView();
    main?.on("move", onMain);
    main?.on("zoom", onMain);
    main?.on("moveend", onMain);
    window.addEventListener("resize", onMain);
    window.visualViewport?.addEventListener("resize", onMain);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      main?.off("move", onMain);
      main?.off("zoom", onMain);
      main?.off("moveend", onMain);
      window.removeEventListener("resize", onMain);
      window.visualViewport?.removeEventListener("resize", onMain);
      try {
        m.remove();
      } catch {
        /* ignore */
      }
      loupeMap.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const lm = loupeMap.current;
    if (!lm) return;
    lm.setStyle(LAYER_STYLE[layer]);
    lm.once("style.load", () => {
      lm.resize();
      syncView();
    });
  }, [layer]);

  useEffect(() => {
    syncView();
  }, [pos]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      const next = {
        x: Math.max(4, Math.min(window.innerWidth - SIZE - 4, e.clientX - off.current.x)),
        y: Math.max(4, Math.min(window.innerHeight - SIZE - 4, e.clientY - off.current.y)),
      };
      posRef.current = next;
      setPos(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      syncView();
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    off.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
    draggingRef.current = true;
    setDragging(true);
  };

  return (
    <div
      id="loupe"
      className={cn(
        "absolute z-[55] touch-none select-none",
        dragging && "cursor-grabbing",
      )}
      style={{ left: pos.x, top: pos.y, width: SIZE }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        onPointerDown={onDown}
        className={cn(
          "relative overflow-hidden rounded-full border-2 border-card bg-card transition-transform",
          dragging && "scale-[1.03]",
        )}
        style={{ width: SIZE, height: SIZE }}
      >
        <div
          ref={mapHost}
          className="absolute inset-0"
          style={{ width: SIZE, height: SIZE }}
        />
        <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-foreground/20" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-card/80" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-card/80" />
      </div>

      <div className="mt-1.5 flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => setLayer(LAYERS[(LAYERS.indexOf(layer) + 1) % LAYERS.length]!)}
          aria-label={`Loupe layer: ${layer}. Tap to switch.`}
          className="shrink-0 rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] font-semibold uppercase leading-4 tracking-wide"
        >
          {layer}
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close loupe"
          className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-card"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
