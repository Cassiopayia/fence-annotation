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

/** First non-raster style layer — insert WMS/DOP rasters before this so vectors stay on top. */
export function firstNonRasterLayerId(map) {
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
 * Without this, Land DOP WMS was inserted under annotations-line and covered
 * annotation fills + live draw (draw is registered before data layers).
 */
export function ensureMapOverlayStack(map) {
  if (!map?.getLayer || !map?.moveLayer) return;
  const overlayOrder = [
    'dop-coverage-bounds-fill',
    'dop-coverage-fill',
    'dop-coverage-outline',
    'german-states-highlight-fill',
    'german-states-outline',
    'german-states-highlight',
    'systems-fill',
    'systems-line',
    'systems-hit',
    'annotations-fill',
    'annotations-line',
    'snap-target-ring',
    'snap-target-pulse',
    'export-chip-preview-aoi-fill',
    'export-chip-preview-chip-fill',
    'export-chip-preview-aoi-line',
    'export-chip-preview-full-line',
    'export-chip-preview-chip-line',
  ];
  for (const id of overlayOrder) {
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
