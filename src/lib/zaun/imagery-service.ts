// @ts-nocheck — React-facing Land DOP / basemap controller for the Lovable imagery sheet.
import {
  clearActiveWmsBasemap,
  ensureMapOverlayStack,
  firstNonRasterLayerId,
  setActiveBasemapLayerId,
} from "./imagery-layers";
import {
  catalogToProvider,
  loadDopCatalog,
  wmsGetMapTileUrl,
  type DopCatalogEntry,
} from "./wms-client";

export type DopLayerStatus = {
  id: string;
  label: string;
  product?: string;
  enabled: boolean;
  /** Currently contributing tiles for the map center / view */
  active: boolean;
  ok: boolean;
  error: string | null;
  minzoom: number;
  maxzoom: number;
  layerId: string;
};

export type ImagerySnapshot = {
  dopMaster: boolean;
  maxar: boolean;
  osm: boolean;
  dops: DopLayerStatus[];
  ready: boolean;
};

type Listener = (snap: ImagerySnapshot) => void;

const DOP_FULL_OPACITY = 1;
const DEFAULT_WMS_MINZOOM = 14;
/** Extra map zoom past native DOP tile zoom — MapLibre overscales last tiles (no higher WMS z). */
const DOP_OVERZOOM = 2;
const BASEMAP_MAX_ZOOM = 18;
const MAXAR_MAX_ZOOM = 19;
const DEFAULT_MAP_MAX_ZOOM = 22;

let map = null;
let catalog: DopCatalogEntry[] = [];
let providers = [];
/** catalog id → enabled */
const enabledById = new Map();
/** catalog id → { ok, error } */
const healthById = new Map();
let dopMaster = true;
let maxarOn = false;
let osmOn = false;
let ready = false;
const listeners = new Set();

function notify() {
  const snap = getImagerySnapshot();
  for (const listener of listeners) listener(snap);
}

function setVisible(layerId, visible) {
  if (!map?.getLayer?.(layerId)) return;
  try {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  } catch (_) {}
}

function removeProviderMapLayer(providerId) {
  const id = `wms-${providerId}`;
  try {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  } catch (_) {}
}

function providerLayer(src) {
  if (!map) return;
  const id = `wms-${src.id}`;
  const entry = catalog.find((c) => c.id === src.catalog_id);
  const minzoom = Number(src.minzoom ?? entry?.minzoom ?? DEFAULT_WMS_MINZOOM);
  const maxzoom = Number(src.maxzoom ?? entry?.maxzoom ?? 20);
  const bounds = src.bounds || entry?.bounds || undefined;
  const tileSizeRaw = Number(src.tile_size ?? entry?.tile_size ?? 256);
  const tileSize = tileSizeRaw === 512 ? 512 : 256;

  if (map.getSource(id)) {
    const existingSize = Number(map.getSource(id)?.tileSize || 256);
    if (existingSize !== tileSize) removeProviderMapLayer(src.id);
  }
  if (!map.getSource(id)) {
    const sourceSpec = {
      type: "raster",
      tiles: [wmsGetMapTileUrl(src)],
      attribution: src.attribution || src.name || "© GeoBasis-DE / Land survey office",
      tileSize,
      minzoom,
      maxzoom,
    };
    if (Array.isArray(bounds) && bounds.length === 4) sourceSpec.bounds = bounds;
    map.addSource(id, sourceSpec);
  }
  if (!map.getLayer(id)) {
    const layer = {
      id,
      type: "raster",
      source: id,
      minzoom,
      maxzoom,
      layout: { visibility: "none" },
      paint: {
        "raster-opacity": DOP_FULL_OPACITY,
        "raster-resampling": "linear",
      },
    };
    const beforeId = firstNonRasterLayerId(map);
    if (beforeId) map.addLayer(layer, beforeId);
    else map.addLayer(layer);
  }
  ensureMapOverlayStack(map);
}

function pointInBounds(lng, lat, bounds) {
  if (!Array.isArray(bounds) || bounds.length < 4) return false;
  const [west, south, east, north] = bounds.map(Number);
  return (
    Number.isFinite(west) &&
    Number.isFinite(south) &&
    Number.isFinite(east) &&
    Number.isFinite(north) &&
    lng >= west &&
    lng <= east &&
    lat >= south &&
    lat <= north
  );
}

function activeCatalogIdsForView() {
  if (!map || !dopMaster) return new Set();
  const center = map.getCenter?.();
  if (!center) return new Set();
  const lng = Number(center.lng);
  const lat = Number(center.lat);
  const zoom = Number(map.getZoom?.() ?? 0);
  const hits = catalog.filter((entry) => {
    if (enabledById.get(entry.id) === false) return false;
    if (!pointInBounds(lng, lat, entry.bounds)) return false;
    const minzoom = Number(entry.minzoom ?? DEFAULT_WMS_MINZOOM);
    return zoom >= minzoom;
  });
  // Prefer the tightest covering Land when several overlap (border regions).
  hits.sort((a, b) => boundsArea(a.bounds) - boundsArea(b.bounds));
  return new Set(hits.map((e) => e.id));
}

function boundsArea(bounds) {
  if (!Array.isArray(bounds) || bounds.length < 4) return Number.POSITIVE_INFINITY;
  const [west, south, east, north] = bounds.map(Number);
  if (![west, south, east, north].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  return Math.max(0, east - west) * Math.max(0, north - south);
}

/** Providers that can actually paint the current center at this zoom. */
function coveringProviders() {
  const activeIds = activeCatalogIdsForView();
  if (!activeIds.size) return [];
  const covering = providers.filter((src) => {
    const catalogId = src.catalog_id || src.id.replace(/^dop-/, "");
    return activeIds.has(catalogId);
  });
  covering.sort((a, b) => {
    const ea = catalog.find((c) => c.id === (a.catalog_id || a.id.replace(/^dop-/, "")));
    const eb = catalog.find((c) => c.id === (b.catalog_id || b.id.replace(/^dop-/, "")));
    return boundsArea(ea?.bounds || a.bounds) - boundsArea(eb?.bounds || b.bounds);
  });
  return covering;
}

/** Cap camera zoom: past native DOP maxzoom, MapLibre overzooms tiles (tile z stays put). */
function syncMapMaxZoom(covering) {
  if (!map?.setMaxZoom) return;
  let maxZ = DEFAULT_MAP_MAX_ZOOM;
  if (maxarOn) {
    maxZ = MAXAR_MAX_ZOOM;
  } else if (covering.length > 0) {
    const native = Math.max(
      ...covering.map((src) => {
        const entry = catalog.find((c) => c.id === (src.catalog_id || src.id.replace(/^dop-/, "")));
        return Number(src.maxzoom ?? entry?.maxzoom ?? 20);
      }),
    );
    // Camera may go slightly past native — imagery overscales instead of fetching higher WMS z.
    maxZ = native + DOP_OVERZOOM;
  } else if (!osmOn) {
    maxZ = BASEMAP_MAX_ZOOM;
  }
  try {
    map.setMaxZoom(maxZ);
    if (Number(map.getZoom()) > maxZ) map.zoomTo(maxZ, { duration: 0 });
  } catch (_) {}
}

/** Apply visibility: Land DOPs only when they cover the view; keep basemap.de under until then. */
function applyVisibility() {
  if (!map) return;
  const zoom = Number(map.getZoom?.() ?? 0);
  const covering = coveringProviders();
  const coveringIds = new Set(covering.map((src) => src.id));

  for (const src of providers) {
    const id = `wms-${src.id}`;
    const on = coveringIds.has(src.id);
    setVisible(id, on);
    if (on && map.getLayer?.(id)) {
      const entry = catalog.find((c) => c.id === (src.catalog_id || src.id.replace(/^dop-/, "")));
      const nativeMax = Number(src.maxzoom ?? entry?.maxzoom ?? 20);
      // Nearest when overzooming past native DOP — keeps fence edges crisper.
      try {
        map.setPaintProperty(
          id,
          "raster-resampling",
          zoom > nativeMax + 0.05 ? "nearest" : "linear",
        );
      } catch (_) {}
    }
  }

  setVisible("satellite", false);
  setVisible("dop20", false);
  setVisible("maxar", maxarOn);
  // OSM is an optional overlay and must not request tiles above z14 (source maxzoom).
  const showOsm = osmOn && zoom <= 14 && !maxarOn && covering.length === 0;
  setVisible("osm", showOsm);
  // Keep basemap.de until a covering Land DOP can paint (or Maxar replaces it).
  const showBasemap = !maxarOn && covering.length === 0;
  setVisible("basemap", showBasemap);

  syncMapMaxZoom(covering);

  if (covering.length > 0) {
    setActiveBasemapLayerId(`wms-${covering[0].id}`, { isWms: true });
  } else if (maxarOn) {
    clearActiveWmsBasemap();
    setActiveBasemapLayerId("maxar");
  } else if (showOsm) {
    clearActiveWmsBasemap();
    setActiveBasemapLayerId("osm");
  } else {
    clearActiveWmsBasemap();
    setActiveBasemapLayerId("basemap");
  }

  ensureMapOverlayStack(map);
  notify();
}

function lngLatToMercator(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return [x, y];
}

async function probeEntry(entry: DopCatalogEntry): Promise<{ ok: boolean; error: string | null }> {
  try {
    const provider = catalogToProvider(entry);
    const template = wmsGetMapTileUrl(provider);
    const bounds = Array.isArray(entry.bounds) && entry.bounds.length === 4
      ? entry.bounds.map(Number)
      : [10.4, 51.2, 10.5, 51.3];
    const cx = (bounds[0] + bounds[2]) / 2;
    const cy = (bounds[1] + bounds[3]) / 2;
    const pad = 0.008;
    const [minx, miny] = lngLatToMercator(cx - pad, cy - pad);
    const [maxx, maxy] = lngLatToMercator(cx + pad, cy + pad);
    const url = template.replace("{bbox-epsg-3857}", `${minx},${miny},${maxx},${maxy}`);

    const result = await new Promise<{ ok: boolean; error: string | null }>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timer = window.setTimeout(() => {
        resolve({ ok: false, error: "Tile probe timed out (WMS slow or blocked)" });
      }, 15000);
      img.onload = () => {
        window.clearTimeout(timer);
        resolve({ ok: true, error: null });
      };
      img.onerror = () => {
        window.clearTimeout(timer);
        resolve({
          ok: false,
          error: "GetMap tile failed — WMS down, wrong layer, or blocked in browser",
        });
      };
      img.src = url;
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg || "WMS probe failed" };
  }
}

function isCirEntry(entry) {
  const hay = `${entry?.id || ""} ${entry?.product || ""} ${entry?.label || ""}`.toLowerCase();
  return /\bcir\b/.test(hay) || hay.includes("-cir");
}

function defaultEnabledForEntry(entry) {
  // CIR (false-color) off by default — RGB Land DOPs on.
  return !isCirEntry(entry);
}

async function registerAll() {
  providers = [];
  for (const entry of catalog) {
    enabledById.set(entry.id, defaultEnabledForEntry(entry));
    try {
      const body = catalogToProvider(entry);
      providers.push(body);
      providerLayer(body);
      healthById.set(entry.id, { ok: true, error: null });
    } catch (err) {
      healthById.set(entry.id, {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to register layer",
      });
    }
  }
  // Probe in background — UI updates as results land.
  void Promise.all(
    catalog.map(async (entry) => {
      const health = await probeEntry(entry);
      healthById.set(entry.id, health);
      notify();
    }),
  );
}

export function getImagerySnapshot(): ImagerySnapshot {
  const activeIds = activeCatalogIdsForView();
  return {
    dopMaster,
    maxar: maxarOn,
    osm: osmOn,
    ready,
    dops: catalog.map((entry) => {
      const health = healthById.get(entry.id) || { ok: true, error: null };
      const provider = providers.find((p) => p.catalog_id === entry.id);
      return {
        id: entry.id,
        label: entry.label,
        product: entry.product,
        enabled: enabledById.get(entry.id) !== false,
        active: activeIds.has(entry.id),
        ok: health.ok !== false,
        error: health.error || null,
        minzoom: Number(entry.minzoom ?? DEFAULT_WMS_MINZOOM),
        maxzoom: Number(entry.maxzoom ?? 20),
        layerId: provider ? `wms-${provider.id}` : `wms-dop-${entry.id}`,
      };
    }),
  };
}

export function subscribeImagery(listener: Listener): () => void {
  listeners.add(listener);
  listener(getImagerySnapshot());
  return () => listeners.delete(listener);
}

export function setDopMaster(on: boolean) {
  dopMaster = Boolean(on);
  if (dopMaster) {
    for (const entry of catalog) {
      // Master turns RGB DOPs on; leave CIR as the user left them (default off).
      if (!isCirEntry(entry)) enabledById.set(entry.id, true);
    }
  } else {
    for (const entry of catalog) enabledById.set(entry.id, false);
  }
  applyVisibility();
}

export function setDopEnabled(catalogId: string, on: boolean) {
  enabledById.set(catalogId, Boolean(on));
  // Master reflects “any on”
  dopMaster = [...enabledById.values()].some(Boolean);
  applyVisibility();
}

export function setMaxarEnabled(on: boolean) {
  maxarOn = Boolean(on);
  applyVisibility();
}

export function setOsmEnabled(on: boolean) {
  osmOn = Boolean(on);
  applyVisibility();
}

export async function initImageryService(mlMap) {
  map = mlMap;
  ready = false;
  try {
    map.setMaxParallelImageRequests?.(10);
  } catch (_) {}
  // Country context: basemap.de (not Esri/OSM).
  setVisible("dop20", false);
  setVisible("maxar", false);
  setVisible("osm", false);
  setVisible("basemap", true);
  notify();
  try {
    catalog = await loadDopCatalog();
  } catch (err) {
    catalog = [];
    console.warn("[imagery] catalog load failed", err);
  }
  await registerAll();
  // Defaults: real Land DOPs on, Maxar off, OSM off; reference fills gaps below z14.
  dopMaster = true;
  maxarOn = false;
  osmOn = false;
  applyVisibility();
  ready = true;
  map.on?.("moveend", () => applyVisibility());
  map.on?.("zoomend", () => applyVisibility());
  notify();
  return getImagerySnapshot();
}

export function getImageryCatalog() {
  return catalog.slice();
}
