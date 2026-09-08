// @ts-nocheck — incremental strict typing; CDN map libs typed loosely for migration.
/* Map Styles & Draw Styles Module */

export const basemaps = ['basemap', 'osm', 'maxar', 'satellite', 'dop20'];

/** PV-linked fence stroke (saved + live draw). */
export const FENCE_COLOR_PV = '#18a85b';
export const FENCE_COLOR_PV_ACTIVE = '#1fc76e';
/** Extra/sample fence stroke (label-only helpers). */
export const FENCE_COLOR_EXTRA = '#c297ff';
export const FENCE_COLOR_EXTRA_ACTIVE = '#e2c5ff';

const ESRI_WORLD_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/** Official basemap.de Web Raster (Farbe) via GLOBAL_WEBMERCATOR XYZ. */
const BASEMAP_DE =
  'https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png';

export const mapStyle = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: [BASEMAP_DE],
      tileSize: 256,
      attribution: '© GeoBasis-DE / BKG (basemap.de)',
      maxzoom: 18,
    },
    // Optional overlay — MapLibre will not request tiles above maxzoom 14.
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 14,
    },
    // Direct Esri viewing only — this host does not proxy or cache imagery.
    maxar: {type:'raster', tiles:[ESRI_WORLD_IMAGERY], tileSize:256, attribution:'© Esri / Maxar', maxzoom:19},
    satellite: {type:'raster', tiles:[ESRI_WORLD_IMAGERY], tileSize:256, attribution:'© Esri', maxzoom:19},
    // Legacy id kept for export keys; not auto-shown as a DOP stand-in.
    dop20: {type:'raster', tiles:[ESRI_WORLD_IMAGERY], tileSize:256, attribution:'© Esri / Maxar', maxzoom:19},
  },
  layers: [
    {id:'basemap', type:'raster', source:'basemap', layout:{visibility:'visible'}, paint:{'raster-opacity':1}},
    {id:'osm', type:'raster', source:'osm', maxzoom:14, layout:{visibility:'none'}, paint:{'raster-opacity':1}},
    {id:'maxar', type:'raster', source:'maxar', layout:{visibility:'none'}, paint:{'raster-opacity':1}},
    {id:'satellite', type:'raster', source:'satellite', layout:{visibility:'none'}, paint:{'raster-opacity':1}},
    {id:'dop20', type:'raster', source:'dop20', layout:{visibility:'none'}, paint:{'raster-opacity':1}},
  ],
};

/** Data-driven stroke: stamped Extra stays violet; unstamped follows mode default. */
function drawStrokeColorExpr(defaultColor) {
  return [
    'case',
    ['==', ['get', 'user_extra'], 'yes'], FENCE_COLOR_EXTRA,
    ['==', ['get', 'user_extra'], 'no'], FENCE_COLOR_PV,
    defaultColor,
  ];
}

function drawActiveStrokeColorExpr(defaultColor) {
  return [
    'case',
    ['==', ['get', 'user_extra'], 'yes'], FENCE_COLOR_EXTRA_ACTIVE,
    ['==', ['get', 'user_extra'], 'no'], FENCE_COLOR_PV_ACTIVE,
    defaultColor,
  ];
}

export const drawStyles = [
  // Polygon fill & stroke
  { id: 'gl-draw-polygon-fill-inactive', type: 'fill', filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], paint: { 'fill-color': drawStrokeColorExpr(FENCE_COLOR_PV), 'fill-opacity': 0.25 } },
  { id: 'gl-draw-polygon-stroke-inactive', type: 'line', filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], paint: { 'line-color': drawStrokeColorExpr(FENCE_COLOR_PV), 'line-width': 3 } },

  // LineString stroke
  { id: 'gl-draw-line-inactive', type: 'line', filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']], paint: { 'line-color': drawStrokeColorExpr(FENCE_COLOR_PV), 'line-width': 3.5 } },
  { id: 'gl-draw-line-active', type: 'line', filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']], paint: { 'line-color': drawActiveStrokeColorExpr(FENCE_COLOR_PV_ACTIVE), 'line-width': 4 } },

  // Vertices - outer halo for high visibility on aerial imagery
  { id: 'gl-draw-polygon-and-line-vertex-stroke-inactive', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']], paint: { 'circle-radius': 8, 'circle-color': '#ffffff', 'circle-stroke-color': '#000000', 'circle-stroke-width': 1.5 } },
  // Vertices - inner core follows Extra mode default (parent line keeps its stamp)
  { id: 'gl-draw-polygon-and-line-vertex-inactive', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']], paint: { 'circle-radius': 5.5, 'circle-color': FENCE_COLOR_PV } },

  // Active / Hovered / Clicked Vertex (e.g. start/end point target for closing)
  { id: 'gl-draw-polygon-and-line-vertex-active', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['==', 'active', 'true']], paint: { 'circle-radius': 6, 'circle-color': '#ffea00', 'circle-stroke-color': '#000000', 'circle-stroke-width': 2 } },

  // Midpoints (for adding points along segment)
  { id: 'gl-draw-polygon-midpoint', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']], paint: { 'circle-radius': 4.5, 'circle-color': '#ffea00' } }
];

/**
 * Switch live MapboxDraw stroke to violet (Extra/sample) or green (PV).
 *
 * MapboxDraw registers each style twice as ``${id}.hot`` / ``${id}.cold``.
 * Stamped features keep their colour via ``user_extra``; only unstamped
 * (in-progress) geometry follows the mode default.
 */
export function applyDrawFenceColor(map, { extra = false } = {}) {
  if (!map?.getLayer) return;
  const stroke = extra ? FENCE_COLOR_EXTRA : FENCE_COLOR_PV;
  const active = extra ? FENCE_COLOR_EXTRA_ACTIVE : FENCE_COLOR_PV_ACTIVE;
  const strokeExpr = drawStrokeColorExpr(stroke);
  const activeExpr = drawActiveStrokeColorExpr(active);
  const pairs = [
    ['gl-draw-line-inactive', 'line-color', strokeExpr],
    ['gl-draw-line-active', 'line-color', activeExpr],
    ['gl-draw-polygon-stroke-inactive', 'line-color', strokeExpr],
    ['gl-draw-polygon-fill-inactive', 'fill-color', strokeExpr],
    ['gl-draw-polygon-and-line-vertex-inactive', 'circle-color', stroke],
  ];
  for (const [baseId, prop, value] of pairs) {
    for (const layerId of [`${baseId}.hot`, `${baseId}.cold`, baseId]) {
      if (!map.getLayer(layerId)) continue;
      try {
        map.setPaintProperty(layerId, prop, value);
      } catch (_) { /* layer may be mid-rebuild */ }
    }
  }
}
