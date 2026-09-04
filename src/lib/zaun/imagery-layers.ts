// @ts-nocheck — imagery basemap registry + active layer state for annotation/export.

export const BASEMAP_LAYER_IDS = ['basemap', 'dop20', 'maxar', 'satellite', 'osm'];

/** Map viewer layer id → export job source key(s). */
export const EXPORT_SOURCE_BY_LAYER = {
  basemap: 'basemap_de',
  dop20: 'dop20',
  maxar: 'maxar_aerial',
  satellite: 'satellite',
  osm: null
};

const WMS_EXPORT_PREFIX = 'wms:';

let activeBasemapLayerId = 'basemap';
let activeWmsLayerId = null;

export function exportSourceForLayer(layerId) {
  if (!layerId) return null;
  if (layerId.startsWith('wms-')) {
    return `${WMS_EXPORT_PREFIX}${layerId.slice(4)}`;
  }
  return EXPORT_SOURCE_BY_LAYER[layerId] ?? layerId;
}

export function layerIdForExportSource(exportSource) {
  if (!exportSource) return null;
  if (exportSource.startsWith(WMS_EXPORT_PREFIX)) {
    return `wms-${exportSource.slice(WMS_EXPORT_PREFIX.length)}`;
  }
  for (const [layerId, sourceKey] of Object.entries(EXPORT_SOURCE_BY_LAYER)) {
    if (sourceKey === exportSource) return layerId;
  }
  return exportSource;
}

export function getActiveBasemapLayerId() {
  if (activeWmsLayerId) return activeWmsLayerId;
  return activeBasemapLayerId;
}

export function getActiveImagerySource() {
  return exportSourceForLayer(getActiveBasemapLayerId());
}

export function setActiveBasemapLayerId(layerId, { isWms = false } = {}) {
  if (isWms || String(layerId || '').startsWith('wms-')) {
    activeWmsLayerId = layerId;
    return;
  }
  activeWmsLayerId = null;
  if (layerId && BASEMAP_LAYER_IDS.includes(layerId)) {
    activeBasemapLayerId = layerId;
  }
}

export function clearActiveWmsBasemap() {
  activeWmsLayerId = null;
}

export function getImageryContext(map) {
  const layerId = getActiveBasemapLayerId();
  const center = map?.getCenter?.();
  return {
    imagery_source: getActiveImagerySource(),
    imagery_layer_id: layerId,
    imagery_zoom: map?.getZoom?.() ?? null,
    imagery_center: center
      ? { lng: center.lng, lat: center.lat }
      : null
  };
}

export function appendImageryProperties(props, map, { preserveReferenceImagery = false } = {}) {
  const ctx = getImageryContext(map);
  const out = { ...props };
  if (ctx.imagery_source && !(preserveReferenceImagery && out.imagery_source)) {
    out.imagery_source = ctx.imagery_source;
  }
  if (ctx.imagery_layer_id && !(preserveReferenceImagery && out.imagery_layer_id)) {
    out.imagery_layer_id = ctx.imagery_layer_id;
  }
  if (!preserveReferenceImagery) {
    if (ctx.imagery_zoom != null) out.imagery_zoom = ctx.imagery_zoom;
    if (ctx.imagery_center) out.imagery_center = ctx.imagery_center;
  }
  return out;
}

export function basemapSwitchWarning(previousLayerId, nextLayerId) {
  if (!previousLayerId || previousLayerId === nextLayerId) return null;
  return (
    'Switching imagery may shift fences relative to the map. '
    + 'In edit mode, drag the outline to calibrate alignment on each basemap (offsets are saved per layer). '
    + 'Annotations are stored in map coordinates for the layer you saved on.'
  );
}

/** Preferred insert-before targets so new rasters never land above PV / fences. */
const VECTOR_ANCHOR_IDS = [
  'systems-fill',
  'systems-line',
  'annotations-fill',
  'annotations-line',
  'german-states-highlight-fill',
  'german-states-outline',
];

/** First non-raster style layer — insert WMS/DOP rasters before this so vectors stay on top. */
export function firstNonRasterLayerId(map) {
  if (!map?.getLayer) return undefined;
  for (const id of VECTOR_ANCHOR_IDS) {
    if (map.getLayer(id)) return id;
  }
  const layers = map?.getStyle?.()?.layers || [];
  for (const layer of layers) {
    if (layer?.type && layer.type !== 'raster') return layer.id;
  }
  return undefined;
}

/**
 * Keep imagery (rasters) under overlays. Order bottom→top among overlays:
 * coverage → systems → annotations → snap → export preview → Mapbox Draw.
 *
 * PV systems + annotations are always raised above every basemap / Land DOP
 * raster and coverage tint so fences stay visible while browsing.
 */
export function ensureMapOverlayStack(map) {
  if (!map?.getLayer || !map?.moveLayer) return;

  const underlays = [
    'dop-coverage-bounds-fill',
    'dop-coverage-fill',
    'dop-coverage-outline',
    'german-states-highlight-fill',
    'german-states-outline',
    'german-states-highlight',
  ];
  // Data vectors — must sit above every imagery / coverage layer.
  const dataOverlays = [
    'systems-fill',
    'systems-line',
    'systems-hit',
    'annotations-fill',
    'annotations-line',
  ];
  const helpers = [
    'snap-target-ring',
    'snap-target-pulse',
    'export-chip-preview-aoi-fill',
    'export-chip-preview-chip-fill',
    'export-chip-preview-aoi-line',
    'export-chip-preview-full-line',
    'export-chip-preview-chip-line',
  ];

  for (const id of [...underlays, ...dataOverlays, ...helpers]) {
    if (map.getLayer(id)) {
      try { map.moveLayer(id); } catch (_) {}
    }
  }

  // Any leftover non-raster that isn't draw / our known stack stays under data:
  // re-raise data + helpers once more so accidental inserts can't bury fences.
  for (const id of [...dataOverlays, ...helpers]) {
    if (map.getLayer(id)) {
      try { map.moveLayer(id); } catch (_) {}
    }
  }

  const layers = map.getStyle?.()?.layers || [];
  for (const layer of layers) {
    if (String(layer?.id || '').startsWith('gl-draw')) {
      try { map.moveLayer(layer.id); } catch (_) {}
    }
  }
}
