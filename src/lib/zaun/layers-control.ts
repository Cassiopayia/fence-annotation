// @ts-nocheck — incremental strict typing; CDN map libs typed loosely for migration.
/* Layer control: built-in layers plus persistent WMS providers. */
import {
  BASEMAP_LAYER_IDS,
  basemapSwitchWarning,
  clearActiveWmsBasemap,
  ensureMapOverlayStack,
  firstNonRasterLayerId,
  getActiveBasemapLayerId,
  setActiveBasemapLayerId
} from './imagery-layers';
import { assetUrl, catalogToProvider, loadDopCatalog, wmsGetMapTileUrl } from './wms-client';

window.LayersControl = (() => {
  const basemapDefinitions = [
    { id: 'dop20', label: 'DOP20 (auto Land)', color: '#805ad5' },
    { id: 'maxar', label: 'Maxar / World Imagery', color: '#d69e2e' },
    { id: 'satellite', label: 'Satellite', color: '#3182ce' },
    { id: 'osm', label: 'OpenStreetMap', color: '#777' }
  ];
  const overlayDefinitions = [
    { id: 'systems', label: 'PV systems', color: '#18a85b' },
    { id: 'annotations', label: 'Annotations', color: '#18a85b' }
  ];
  const definitions = [...basemapDefinitions, ...overlayDefinitions];
  let map, panel, providers = [];
  /** @type {Array<{id:string,label:string,url:string,layer:string,minzoom?:number,maxzoom?:number,timeout?:number,bounds?:number[]}>} */
  let bundeslaender = [];
  /** Slim state outlines from static GeoJSON (may be flat-ring). */
  let stateFeatures = [];
  /** When true, pan/zoom follows the Land under map center for DOP. */
  let dopFollowEnabled = false;
  let dopFollowTimer = 0;
  let dopWatchCleanup = null;
  let activeCatalogId = null;
  const DEFAULT_WMS_MINZOOM = 14;
  const WMS_PARALLEL_REQUESTS = 10;
  const DEFAULT_PARALLEL_REQUESTS = 16;
  /** Maxar under DOP — keep faint so solid DOP is obvious. */
  const MAXAR_UNDERLAY_OPACITY = 0.28;
  /** Maxar as sole basemap — slightly soft vs full DOP. */
  const MAXAR_SOLO_OPACITY = 0.72;
  const DOP_FULL_OPACITY = 1;
  /** Default overlay (systems / annotations) opacity for the layers sliders. */
  const OVERLAY_OPACITY_DEFAULT = 0.42;
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function publishImageryStatus(text, { ok = true } = {}) {
    const live = panel?.querySelector('#dop-live-status');
    if (live) {
      live.hidden = !text;
      live.textContent = text || '';
      live.classList.toggle('is-warn', !ok);
      live.classList.toggle('is-ok', Boolean(text) && ok);
    }
    document.dispatchEvent(new CustomEvent('imagery:status', {
      detail: { text: text || '', ok },
    }));
  }

  function shortLandLabel(entry) {
    if (!entry?.label) return 'Land';
    // "Bayern · DOP20 RGB" → "Bayern"
    return String(entry.label).split('·')[0].trim() || entry.label;
  }

  function setLayerOpacity(layerId, opacity) {
    if (!map?.getLayer?.(layerId)) return;
    try { map.setPaintProperty(layerId, 'raster-opacity', opacity); } catch (_) {}
  }

  /** DOP solid; Maxar faded (underlay or solo). */
  function applyImageryOpacities({ wmsActive = false } = {}) {
    setLayerOpacity('dop20', DOP_FULL_OPACITY);
    setLayerOpacity('maxar', wmsActive ? MAXAR_UNDERLAY_OPACITY : MAXAR_SOLO_OPACITY);
    setLayerOpacity('satellite', 1);
    setLayerOpacity('osm', 1);
    providers.forEach((provider) => {
      setLayerOpacity(`wms-${provider.id}`, DOP_FULL_OPACITY);
    });
  }

  /**
   * Single imagery line in the ⓘ info panel (no dock overflow / no VIEW+DOP twin).
   * Shows what is on screen + Land DOP availability; click enables Land DOP.
   */
  function syncImageryHud({ loading = false } = {}) {
    const chip = document.getElementById('imagery-hud-chip');
    const textEl = document.getElementById('imagery-hud-text');
    if (!chip || !textEl) return;

    const entry = catalogEntryForMapCenter();
    const z = currentZoom();
    const active = String(getActiveBasemapLayerId() || '');
    const minz = Number(entry?.minzoom) || DEFAULT_WMS_MINZOOM;
    const land = shortLandLabel(entry);
    const src = entry ? findProviderByCatalog(entry) : null;
    const dopOn = Boolean(src) && active === `wms-${src.id}`;

    chip.classList.remove(
      'is-none', 'is-zoom', 'is-ready', 'is-active', 'is-loading',
      'is-unknown', 'is-dop', 'is-maxar', 'is-other',
    );
    const toggle = document.getElementById('mapHudToggle');
    const markToggle = (state) => {
      if (!toggle) return;
      toggle.classList.remove('is-dop-active', 'is-dop-ready', 'is-dop-zoom');
      if (state) toggle.classList.add(state);
    };

    if (loading) {
      chip.classList.add('is-loading');
      textEl.textContent = 'Imagery · loading…';
      chip.title = 'Loading state DOP service';
      markToggle(null);
      return;
    }

    if (dopOn) {
      if (z + 1e-6 < minz) {
        chip.classList.add('is-zoom', 'is-maxar');
        textEl.textContent = `Maxar · ${land} DOP at z${minz}+`;
        chip.title = `${entry.label} is selected — zoom to z${minz}+ for solid DOP (Maxar underlay now)`;
        markToggle('is-dop-zoom');
      } else {
        chip.classList.add('is-active', 'is-dop');
        textEl.textContent = `DOP · ${land}`;
        chip.title = `${entry.label} at z${z.toFixed(1)} — solid DOP over faint Maxar. Click to re-enable.`;
        markToggle('is-dop-active');
      }
      return;
    }

    if (active === 'maxar') {
      chip.classList.add('is-maxar');
      textEl.textContent = entry
        ? `Maxar · ${land} DOP available`
        : 'Maxar';
      chip.title = entry
        ? `Showing Maxar. Click to switch to ${entry.label}.`
        : 'Main map showing Maxar / World Imagery';
      markToggle(entry ? 'is-dop-ready' : null);
      return;
    }
    if (active === 'dop20') {
      chip.classList.add('is-dop');
      textEl.textContent = entry ? `DOP20 · tap ${land}` : 'DOP20';
      chip.title = entry
        ? `Reference DOP20 — click for ${entry.label}`
        : 'Main map showing reference DOP20 tiles';
      markToggle(entry ? 'is-dop-ready' : null);
      return;
    }
    if (active === 'satellite') {
      chip.classList.add('is-other');
      textEl.textContent = 'Satellite';
      chip.title = 'Main map showing satellite basemap';
      markToggle(null);
      return;
    }
    if (active === 'osm') {
      chip.classList.add('is-other');
      textEl.textContent = 'OSM';
      chip.title = 'Main map showing OpenStreetMap';
      markToggle(null);
      return;
    }

    if (!entry) {
      chip.classList.add('is-none');
      textEl.textContent = 'Imagery · no Land DOP';
      chip.title = 'No Bundesland DOP WMS for this map center';
      markToggle(null);
      return;
    }

    if (z + 1e-6 < minz) {
      chip.classList.add('is-zoom');
      textEl.textContent = `${land} · zoom z${minz}+`;
      chip.title = `${entry.label} available — zoom to z${minz}+ then click to enable`;
      markToggle('is-dop-zoom');
    } else {
      chip.classList.add('is-ready');
      textEl.textContent = `DOP · ${land} · tap`;
      chip.title = `${entry.label} available here — click to enable`;
      markToggle('is-dop-ready');
    }
  }

  // Back-compat aliases used elsewhere in this module.
  function syncDopAvailabilityChip(opts) { syncImageryHud(opts); }
  function syncImageryViewBadge() { syncImageryHud(); }

  function wireDopAvailabilityChip() {
    const chip = document.getElementById('imagery-hud-chip');
    if (!chip || chip.dataset.wired === '1') return;
    chip.dataset.wired = '1';
    chip.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      syncImageryHud({ loading: true });
      try {
        await enableCurrentLandDop({ force: true, focusMap: false });
      } finally {
        syncImageryHud();
      }
    });
  }

  function currentZoom() {
    const z = Number(map?.getZoom?.());
    return Number.isFinite(z) ? z : 0;
  }

  function stopDopTileWatch() {
    if (typeof dopWatchCleanup === 'function') {
      try { dopWatchCleanup(); } catch (_) {}
    }
    dopWatchCleanup = null;
  }

  function startDopTileWatch({ sourceId, label, minzoom }) {
    stopDopTileWatch();
    if (!map || !sourceId) return;
    const refresh = () => {
      const z = currentZoom();
      const floor = Number(minzoom) || DEFAULT_WMS_MINZOOM;
      if (z + 1e-6 < floor) {
        publishImageryStatus(`Zoom in to z${floor}+ to load ${label}`, { ok: false });
        return;
      }
      let loaded = false;
      try { loaded = Boolean(map.isSourceLoaded?.(sourceId)); } catch (_) {}
      if (loaded) {
        publishImageryStatus(`${label} ready · z${z.toFixed(1)}`, { ok: true });
      } else {
        publishImageryStatus(`Loading ${label} tiles… · z${z.toFixed(1)}`, { ok: true });
      }
    };
    const onSource = (event) => {
      if (event?.sourceId && event.sourceId !== sourceId) return;
      refresh();
    };
    map.on('sourcedata', onSource);
    map.on('idle', refresh);
    map.on('zoomend', refresh);
    map.on('moveend', refresh);
    refresh();
    dopWatchCleanup = () => {
      map.off('sourcedata', onSource);
      map.off('idle', refresh);
      map.off('zoomend', refresh);
      map.off('moveend', refresh);
    };
  }

  function setMapParallelRequests(limit) {
    try {
      if (typeof map?.setMaxParallelImageRequests === 'function') {
        map.setMaxParallelImageRequests(limit);
      } else if (map) {
        map._maxParallelImageRequests = limit;
      }
    } catch (_) {}
  }

  function findCatalogEntry(entry) {
    if (!entry) return null;
    return bundeslaender.find((item) => item.id === entry.catalog_id
      || (item.url.replace(/\?$/, '') === String(entry.url || '').replace(/\?$/, '')
        && item.layer === entry.layer))
      || null;
  }

  function relatedLayerIds(id) {
    if (id === 'systems') return ['systems-fill', 'systems-line'];
    if (id === 'annotations') return ['annotations-fill', 'annotations-line'];
    return [id];
  }

  function setVisible(id, visible) {
    relatedLayerIds(id).forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    });
  }

  function setOpacity(id, value) {
    const props = {
      systems: ['systems-fill', 'fill-opacity'],
      annotations: ['annotations-fill', 'fill-opacity'],
      osm: ['osm', 'raster-opacity'],
      maxar: ['maxar', 'raster-opacity'],
      satellite: ['satellite', 'raster-opacity'],
      dop20: ['dop20', 'raster-opacity']
    };
    const [layer, type] = props[id] || [];
    if (layer && map.getLayer(layer)) map.setPaintProperty(layer, type, value);
    if (id === 'systems' && map.getLayer('systems-line')) map.setPaintProperty('systems-line', 'line-opacity', value);
    if (id === 'annotations' && map.getLayer('annotations-line')) map.setPaintProperty('annotations-line', 'line-opacity', value);
    if (id.startsWith('wms-') && map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', value);
  }

  function selectBasemap(layerId, { isWms = false, force = false } = {}) {
    const previous = getActiveBasemapLayerId();
    if (!force && previous && previous !== layerId) {
      const warning = basemapSwitchWarning(previous, layerId);
      const inAnnotation = document.body.dataset.uiState === 'ANNOTATION';
      if (warning && inAnnotation && !confirm(`${warning}\n\nSwitch imagery anyway?`)) {
        return false;
      }
    }
    if (isWms || String(layerId).startsWith('wms-')) {
      // Keep Maxar under DOP so zooming below WMS minzoom is not a blank map.
      BASEMAP_LAYER_IDS.forEach((id) => setVisible(id, id === 'maxar'));
      providers.forEach((provider) => setVisible(`wms-${provider.id}`, false));
      setActiveBasemapLayerId(layerId, { isWms: true });
      setVisible(layerId, true);
      applyImageryOpacities({ wmsActive: true });
      setMapParallelRequests(WMS_PARALLEL_REQUESTS);
      panel?.querySelectorAll('[data-basemap]').forEach((input) => { input.checked = false; });
      const dopRadio = panel?.querySelector('[data-basemap="dop20"]');
      if (dopRadio) dopRadio.checked = true;
    } else {
      clearActiveWmsBasemap();
      setMapParallelRequests(DEFAULT_PARALLEL_REQUESTS);
      BASEMAP_LAYER_IDS.forEach((id) => setVisible(id, id === layerId));
      providers.forEach((provider) => setVisible(`wms-${provider.id}`, false));
      setActiveBasemapLayerId(layerId);
      applyImageryOpacities({ wmsActive: false });
      panel?.querySelectorAll('[data-basemap]').forEach((input) => {
        input.checked = input.dataset.basemap === layerId;
      });
      panel?.querySelectorAll('[data-provider-toggle]').forEach((input) => { input.checked = false; });
      panel?.querySelectorAll('[data-catalog-id]').forEach((input) => { input.checked = false; });
      if (layerId !== 'dop20') {
        dopFollowEnabled = false;
        activeCatalogId = null;
        stopDopTileWatch();
      }
    }
    ensureMapOverlayStack(map);
    // Always notify listeners (loupe, edit refresh) — including force switches to DOP.
    if (previous !== layerId) {
      document.dispatchEvent(new CustomEvent('imagery:basemapchange', {
        detail: { previous, next: layerId, force: Boolean(force) },
      }));
    }
    syncImageryViewBadge();
    return true;
  }

  function removeProviderMapLayer(providerId) {
    const id = `wms-${providerId}`;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  }

  function providerLayer(src) {
    const id = `wms-${src.id}`;
    const catalog = findCatalogEntry(src);
    const minzoom = Number(src.minzoom ?? catalog?.minzoom ?? DEFAULT_WMS_MINZOOM);
    const maxzoom = Number(src.maxzoom ?? catalog?.maxzoom ?? 20);
    const bounds = src.bounds || catalog?.bounds || undefined;
    const tileSizeRaw = Number(src.tile_size ?? catalog?.tile_size ?? 256);
    const tileSize = tileSizeRaw === 512 ? 512 : 256;
    if (map.getSource(id)) {
      // tileSize is immutable on MapLibre raster sources — recreate when catalog upgrades it.
      const existingSize = Number(map.getSource(id)?.tileSize || 256);
      if (existingSize !== tileSize) {
        removeProviderMapLayer(src.id);
      }
    }
    if (!map.getSource(id)) {
      const sourceSpec = {
        type: 'raster',
        tiles: [wmsGetMapTileUrl(src)],
        attribution: src.attribution || src.name || '© GeoBasis-DE / Land survey office',
        tileSize,
        // Only request tiles in the useful DOP zoom band — overviews stall many state WMS.
        minzoom,
        maxzoom,
      };
      if (Array.isArray(bounds) && bounds.length === 4) sourceSpec.bounds = bounds;
      map.addSource(id, sourceSpec);
    }
    if (!map.getLayer(id)) {
      const layer = {
        id,
        type: 'raster',
        source: id,
        minzoom,
        maxzoom,
        layout: { visibility: 'none' },
        paint: {
          'raster-opacity': DOP_FULL_OPACITY,
          // Smoother when MapLibre overzooms past native DOP resolution.
          'raster-resampling': 'linear',
        }
      };
      // Always under vectors (annotations / systems / draw) — never cover fences.
      const beforeId = firstNonRasterLayerId(map);
      if (beforeId) map.addLayer(layer, beforeId);
      else map.addLayer(layer);
    } else {
      setLayerOpacity(id, DOP_FULL_OPACITY);
    }
    ensureMapOverlayStack(map);
  }

  function findProviderByCatalog(entry) {
    if (!entry) return null;
    return providers.find((item) => item.catalog_id === entry.id
      || (String(item.url || '').replace(/\?$/, '') === String(entry.url || '').replace(/\?$/, '')
        && String(item.layer || '') === String(entry.layer || '')))
      || null;
  }

  function pointInBounds(lng, lat, bounds) {
    if (!Array.isArray(bounds) || bounds.length < 4) return false;
    const [west, south, east, north] = bounds.map(Number);
    return Number.isFinite(west) && Number.isFinite(south) && Number.isFinite(east) && Number.isFinite(north)
      && lng >= west && lng <= east && lat >= south && lat <= north;
  }

  function boundsArea(bounds) {
    if (!Array.isArray(bounds) || bounds.length < 4) return Number.POSITIVE_INFINITY;
    return Math.max(0, (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]));
  }

  /**
   * Spanish `name` values in german_states_slim.geojson → catalog ids.
   * Keep in sync with MapModule CATALOG_STATE_NAMES.
   */
  const STATE_NAME_TO_CATALOG_IDS = {
    'Baden-Wurtemberg': ['bw-rgb', 'bw-cir'],
    Baviera: ['by-rgb', 'by-cir'],
    Berlín: ['bb-be'],
    Brandeburgo: ['bb-be'],
    Bremen: ['hb-hb', 'hb-bhv'],
    Hamburgo: ['hh'],
    Hesse: ['he-rgb', 'he-cir'],
    'Mecklemburgo-Pomerania Occident': ['mv'],
    'Baja Sajonia': ['ni'],
    'Renania del Norte-Westfalia': ['nw'],
    'Renania-Palatinado': ['rp'],
    Sarre: ['sl'],
    Sajonia: ['sn'],
    'Sajonia-Anhalt': ['st', 'st-gdi'],
    'Schleswig-Holstein': ['sh'],
    Turingia: ['th'],
  };

  function pointInRing(lng, lat, ring) {
    if (!Array.isArray(ring) || ring.length < 3) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = Number(ring[i][0]);
      const yi = Number(ring[i][1]);
      const xj = Number(ring[j][0]);
      const yj = Number(ring[j][1]);
      if (!Number.isFinite(xi) || !Number.isFinite(yi) || !Number.isFinite(xj) || !Number.isFinite(yj)) continue;
      const intersect = ((yi > lat) !== (yj > lat))
        && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /** Rings from standard GeoJSON or the slim flat-ring variant used in-repo. */
  function ringsOfGeometry(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) return [];
    const coords = geometry.coordinates;
    const type = geometry.type;
    const first = coords[0];
    if (type === 'Polygon') {
      if (first && typeof first[0] === 'number') return [coords]; // slim flat ring
      return first ? [first] : [];
    }
    if (type === 'MultiPolygon') {
      if (first && first[0] && typeof first[0][0] === 'number') return coords; // slim list of rings
      return coords.map((poly) => poly?.[0]).filter(Boolean);
    }
    return [];
  }

  function stateNameAt(lng, lat) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !stateFeatures.length) return null;
    for (const feature of stateFeatures) {
      const rings = ringsOfGeometry(feature?.geometry);
      if (rings.some((ring) => pointInRing(lng, lat, ring))) {
        return feature?.properties?.name || feature?.properties?.area_id || null;
      }
    }
    return null;
  }

  function isCirProduct(entry) {
    const text = `${entry?.product || ''} ${entry?.label || ''}`;
    return /\bcir\b/i.test(text);
  }

  function isRgbPreferred(entry) {
    const text = `${entry?.product || ''} ${entry?.label || ''}`;
    if (/\bcir\b/i.test(text)) return false;
    return /\brgb\b/i.test(text) || /\bdop\d*\b/i.test(text);
  }

  function rankCatalogEntries(pool) {
    return [...pool].sort((a, b) => {
      const aCir = isCirProduct(a) ? 1 : 0;
      const bCir = isCirProduct(b) ? 1 : 0;
      if (aCir !== bCir) return aCir - bCir;
      const aRgb = isRgbPreferred(a) ? 0 : 1;
      const bRgb = isRgbPreferred(b) ? 0 : 1;
      if (aRgb !== bRgb) return aRgb - bRgb;
      return boundsArea(a.bounds) - boundsArea(b.bounds);
    });
  }

  /** Resolve the best Bundesland DOP for the current map center. */
  function catalogEntryForMapCenter() {
    if (!map || !bundeslaender.length) return null;
    const center = map.getCenter?.();
    if (!center) return null;
    const lng = Number(center.lng);
    const lat = Number(center.lat);

    // Prefer real state polygons — TH's bbox is small and was stealing ST/SN/BY/NI.
    let pool = null;
    const stateName = stateNameAt(lng, lat);
    if (stateName) {
      const ids = new Set(STATE_NAME_TO_CATALOG_IDS[stateName] || []);
      const statePool = bundeslaender.filter((entry) => ids.has(entry.id));
      if (statePool.length) {
        const inBounds = statePool.filter((entry) => pointInBounds(lng, lat, entry.bounds));
        pool = inBounds.length ? inBounds : statePool;
      }
    }
    if (!pool) {
      pool = bundeslaender.filter((entry) => pointInBounds(lng, lat, entry.bounds));
    }
    if (!pool.length) return null;
    return rankCatalogEntries(pool)[0] || null;
  }

  async function ensureCatalogProvider(entry) {
    if (!entry) return null;
    const body = catalogToProvider(entry);
    const previous = findProviderByCatalog(entry);
    if (previous?.id && previous.id !== body.id) {
      try { removeProviderMapLayer(previous.id); } catch (_) {}
      providers = providers.filter((item) => item.id !== previous.id);
    }
    const idx = providers.findIndex((item) => item.id === body.id || item.catalog_id === entry.id);
    if (idx >= 0) providers[idx] = body;
    else providers.push(body);
    return body;
  }

  /** Register every Bundesland WMS once at startup (tiles only requested when visible). */
  async function preloadCatalogProviders() {
    if (!bundeslaender.length) return;
    publishImageryStatus('Preparing state DOP services…', { ok: true });
    const results = await Promise.allSettled(
      bundeslaender.map((entry) => ensureCatalogProvider(entry)),
    );
    let failed = 0;
    results.forEach((result) => {
      if (result.status === 'rejected') failed += 1;
    });
    providers.forEach((src) => {
      try { providerLayer(src); } catch (_) {}
    });
    if (failed) {
      publishImageryStatus(`DOP catalog ready (${failed} Land(s) failed to register)`, { ok: false });
    } else {
      publishImageryStatus('DOP catalog ready — click “DOP20 (auto Land)”', { ok: true });
    }
  }

  async function enableCatalogEntry(entry, {
    statusEl = null,
    force = false,
    focusMap = false,
    follow = true,
  } = {}) {
    if (!entry) return null;
    if (statusEl) statusEl.textContent = 'Loading…';
    publishImageryStatus(`Switching to ${entry.label}…`, { ok: true });
    const src = await ensureCatalogProvider(entry);
    providerLayer(src);
    setMapParallelRequests(WMS_PARALLEL_REQUESTS);
    if (!selectBasemap(`wms-${src.id}`, { isWms: true, force })) {
      setMapParallelRequests(DEFAULT_PARALLEL_REQUESTS);
      return null;
    }
    activeCatalogId = entry.id;
    dopFollowEnabled = follow;
    const minz = entry.minzoom ?? DEFAULT_WMS_MINZOOM;
    if (statusEl) statusEl.textContent = `Active · z${minz}+`;
    const dopRadio = panel?.querySelector('[data-basemap="dop20"]');
    if (dopRadio) dopRadio.checked = true;

    try {
      window.MapModule?.highlightGermanState?.(entry.id);
    } catch (_) {}

    startDopTileWatch({
      sourceId: `wms-${src.id}`,
      label: entry.label,
      minzoom: minz,
    });

    if (focusMap) {
      document.dispatchEvent(new CustomEvent('imagery:catalogfocus', {
        detail: {
          entry,
          bounds: Array.isArray(entry.bounds) ? entry.bounds : null,
          catalogId: entry.id,
          label: entry.label,
          minzoom: minz,
        },
      }));
    }
    renderProviders();
    syncDopAvailabilityChip();
    return src;
  }

  async function enableCurrentLandDop({ force = false, focusMap = false } = {}) {
    const entry = catalogEntryForMapCenter();
    if (!entry) {
      dopFollowEnabled = false;
      stopDopTileWatch();
      selectBasemap('dop20', { force: true });
      publishImageryStatus('No Land DOP for this view — showing reference tiles', { ok: false });
      return null;
    }
    try {
      return await enableCatalogEntry(entry, { force, focusMap, follow: true });
    } catch (error) {
      console.warn('Current-Land DOP20 unavailable', error);
      dopFollowEnabled = false;
      stopDopTileWatch();
      selectBasemap('dop20', { force: true });
      publishImageryStatus(`${entry.label} unavailable — reference DOP20`, { ok: false });
      return null;
    }
  }

  function scheduleDopFollow() {
    if (!dopFollowEnabled) {
      syncDopAvailabilityChip();
      return;
    }
    if (dopFollowTimer) window.clearTimeout(dopFollowTimer);
    dopFollowTimer = window.setTimeout(async () => {
      dopFollowTimer = 0;
      if (!dopFollowEnabled) {
        syncDopAvailabilityChip();
        return;
      }
      const entry = catalogEntryForMapCenter();
      if (!entry || entry.id === activeCatalogId) {
        if (entry) {
          const src = findProviderByCatalog(entry);
          if (src) {
            startDopTileWatch({
              sourceId: `wms-${src.id}`,
              label: entry.label,
              minzoom: entry.minzoom ?? DEFAULT_WMS_MINZOOM,
            });
          }
        }
        syncDopAvailabilityChip();
        return;
      }
      try {
        await enableCatalogEntry(entry, { force: true, focusMap: false, follow: true });
      } catch (error) {
        console.warn('DOP follow switch failed', error);
      }
      syncDopAvailabilityChip();
    }, 350);
  }

  function renderProviders() {
    const list = panel.querySelector('.state-list');
    if (!list) return;
    const activeWms = String(getActiveBasemapLayerId() || '');
    list.innerHTML = bundeslaender.map((entry) => {
      const existing = findProviderByCatalog(entry);
      const isActive = Boolean(existing) && activeWms === `wms-${existing.id}`;
      const isReady = Boolean(existing);
      const minz = entry.minzoom ?? DEFAULT_WMS_MINZOOM;
      let status = `z${minz}+`;
      if (isActive) status = `Active · z${minz}+`;
      else if (isReady) status = `Ready · z${minz}+`;
      const providerAttr = existing ? ` data-provider-id="${esc(existing.id)}"` : '';
      const tip = `${entry.label}\n${entry.url}\nlayer=${entry.layer}\nminzoom=${minz}\nTiles load only when this Land is active and zoom ≥ ${minz}.`;
      return `<div class="provider-row state-row${isActive ? ' is-active-land' : ''}"><label title="${esc(tip)}"><input type="checkbox" id="wms-catalog-${esc(entry.id)}" name="wms_catalog" value="${esc(entry.id)}" data-catalog-id="${esc(entry.id)}"${providerAttr} ${isActive ? 'checked' : ''}> <span>${esc(entry.label)}</span></label><span class="state-status">${status}</span></div>`;
    }).join('') || '<small>Loading Bundesländer catalog…</small>';

    panel.querySelectorAll('[data-catalog-id]').forEach((input) => {
      input.onchange = async () => {
        const statusEl = input.parentElement.parentElement.querySelector('.state-status');
        const entry = bundeslaender.find((item) => item.id === input.dataset.catalogId);
        if (!entry) return;
        if (!input.checked) {
          const providerId = input.dataset.providerId;
          if (providerId) setVisible(`wms-${providerId}`, false);
          setMapParallelRequests(DEFAULT_PARALLEL_REQUESTS);
          dopFollowEnabled = false;
          activeCatalogId = null;
          stopDopTileWatch();
          if (statusEl) statusEl.textContent = `Ready · z${entry.minzoom ?? DEFAULT_WMS_MINZOOM}+`;
          try { window.MapModule?.clearGermanStateHighlight?.(); } catch (_) {}
          publishImageryStatus('State DOP off', { ok: true });
          renderProviders();
          return;
        }
        try {
          // Manual Land pick: show that Land, keep follow so panning can still adapt.
          const src = await enableCatalogEntry(entry, { statusEl, force: true, focusMap: false, follow: true });
          if (!src) {
            input.checked = false;
            return;
          }
          input.dataset.providerId = src.id;
        } catch (error) {
          input.checked = false;
          if (statusEl) statusEl.textContent = 'Unavailable';
          console.warn('Bundesland WMS unavailable', error);
          publishImageryStatus(`${entry.label} unavailable: ${error.message}`, { ok: false });
        }
      };
    });

    const host = panel.querySelector('.provider-list');
    host.innerHTML = providers.filter((source) => !source.catalog_id).length
      ? providers.filter((source) => !source.catalog_id).map((source) => (
        `<div class="provider-row" data-id="${esc(source.id)}">`
        + `<label><input type="checkbox" id="wms-provider-${esc(source.id)}" name="wms_provider" value="${esc(source.id)}" data-provider-toggle="${esc(source.id)}"> <span>${esc(source.name)}</span></label>`
        + `<button type="button" data-edit="${esc(source.id)}" title="Edit layer">Edit</button>`
        + `<button type="button" data-delete="${esc(source.id)}" title="Delete layer">×</button>`
        + `</div>`
      )).join('')
      : '<small>No custom WMS layers</small>';

    host.querySelectorAll('[data-provider-toggle]').forEach((input) => {
      input.onchange = () => {
        const src = providers.find((item) => item.id === input.dataset.providerToggle);
        if (!src) return;
        providerLayer(src);
        if (input.checked) {
          dopFollowEnabled = false;
          stopDopTileWatch();
          setMapParallelRequests(WMS_PARALLEL_REQUESTS);
          if (!selectBasemap(`wms-${src.id}`, { isWms: true })) {
            input.checked = false;
            setMapParallelRequests(DEFAULT_PARALLEL_REQUESTS);
          } else {
            startDopTileWatch({
              sourceId: `wms-${src.id}`,
              label: src.name || 'WMS',
              minzoom: src.minzoom ?? DEFAULT_WMS_MINZOOM,
            });
          }
        } else {
          setVisible(`wms-${src.id}`, false);
          clearActiveWmsBasemap();
          setMapParallelRequests(DEFAULT_PARALLEL_REQUESTS);
          selectBasemap('maxar', { force: true });
        }
      };
    });
    host.querySelectorAll('[data-delete]').forEach((button) => {
      button.onclick = () => deleteProvider(button.dataset.delete);
    });
    host.querySelectorAll('[data-edit]').forEach((button) => {
      button.onclick = () => editProvider(button.dataset.edit);
    });
  }

  async function loadCatalog() {
    try {
      bundeslaender = await loadDopCatalog();
    } catch (error) {
      console.warn('DOP WMS catalog unavailable', error);
      bundeslaender = [];
    }
  }

  async function loadStateFeatures() {
    try {
      const response = await fetch(assetUrl('data/german_states.geojson'));
      const body = await response.json();
      stateFeatures = Array.isArray(body?.features) ? body.features : [];
    } catch (error) {
      console.warn('German state outlines unavailable for DOP follow', error);
      stateFeatures = [];
    }
  }

  async function loadProviders() {
    try {
      await Promise.all([loadCatalog(), loadStateFeatures()]);
      try {
        window.MapModule?.setDopCoverageFromCatalog?.(bundeslaender);
      } catch (_) {}
      providers = [];
      await preloadCatalogProviders();
      renderProviders();
      wireDopAvailabilityChip();
      syncDopAvailabilityChip();
    } catch (error) {
      console.warn('WMS catalog unavailable', error);
      publishImageryStatus('Could not load DOP catalog. This site does not proxy tiles.', { ok: false });
      syncDopAvailabilityChip();
    }
  }

  async function addProvider(url, name = '') {
    url = url || prompt('WMS GetMap URL (your browser will fetch it directly)');
    if (!url) return;
    const layer = prompt('WMS layer name', '') || '';
    if (!layer) {
      alert('A layer name is required. This site does not run a WMS proxy.');
      return;
    }
    const data = catalogToProvider({
      id: `custom-${Date.now()}`,
      label: name || layer,
      url,
      layer,
    });
    providers.push(data);
    providerLayer(data);
    renderProviders();
  }

  async function editProvider(id) {
    const source = providers.find((item) => item.id === id);
    if (!source) return;
    const name = prompt('Layer name', source.name);
    if (name === null) return;
    const layer = prompt('WMS layer identifier', source.layer);
    if (layer === null) return;
    const data = { ...source, name, layer };
    providers = providers.map((item) => (item.id === id ? data : item));
    removeProviderMapLayer(id);
    providerLayer(data);
    renderProviders();
  }

  async function deleteProvider(id) {
    if (!confirm('Remove this WMS layer from this browser?')) return;
    removeProviderMapLayer(id);
    providers = providers.filter((item) => item.id !== id);
    renderProviders();
  }

  function init(currentMap, container = 'top-right') {
    map = currentMap;
    const embedInHost = container === 'layersHost';
    const control = {
      onAdd() {
        this._map = map;
        const root = document.createElement('div');
        root.className = embedInHost
          ? 'maplibre-layers-control imagery-embedded'
          : 'maplibre-layers-control maplibregl-ctrl';
        root.innerHTML = [
          embedInHost ? '' : '<button class="layers-toggle" type="button">Layers</button>',
          '<div class="layers-panel">',
          '<strong class="layer-section-title">Basemap</strong>',
          '<div class="builtin-list builtin-list-basemap"></div>',
          '<div id="dop-live-status" class="dop-live-status" hidden aria-live="polite"></div>',
          '<hr>',
          embedInHost
            ? '<strong class="layer-section-title">Overlays</strong><div class="builtin-list builtin-list-overlays"></div><hr>'
            : '',
          '<strong class="layer-section-title">State DOP</strong>',
          '<small class="layers-hint">Purple tint = Land with DOP WMS. Open ⓘ (bottom-left) for the active imagery line — click it (or <strong>DOP20 (auto Land)</strong>) to enable. Tiles need z14+.</small>',
          '<input id="layer-search" name="layer_search" class="layer-search" type="search" placeholder="Search Bundesland…" aria-label="Search Bundesland" autocomplete="off">',
          '<div class="state-list"></div>',
          '<details class="layers-advanced">',
          '<summary>Advanced</summary>',
          embedInHost ? '' : '<strong class="layer-section-title">Overlays</strong><div class="builtin-list builtin-list-overlays"></div>',
          embedInHost ? '' : '<strong class="layer-section-title">Custom WMS</strong>',
          '<select id="nrw-service" name="nrw_service" class="nrw-service" aria-label="Quick-add WMS">',
          '<option value="">＋ Quick-add service…</option>',
          '<option value="https://www.wms.nrw.de/geobasis/wms_nw_dop">NRW DOP (WMS)</option>',
          '<option value="https://www.wms.nrw.de/geobasis/wms_nw_vdop">NRW vDOP (WMS)</option>',
          '<option value="https://www.wms.nrw.de/geobasis/wms_nw_dop_hw21">NRW DOP HW21 (WMS)</option>',
          '<option value="https://geoservices.bayern.de/od/wms/dop/v1/dop20">Bayern DOP20 (WMS)</option>',
          '</select>',
          '<button class="add-provider" type="button">＋ Add custom WMS</button>',
          '<div class="provider-list"></div>',
          '</details>',
          '</div>',
        ].join('');
        panel = root.querySelector('.layers-panel');
        if (panel && embedInHost) panel.hidden = false;
        const basemapHost = root.querySelector('.builtin-list-basemap') || root.querySelector('.builtin-list');
        basemapDefinitions.forEach((definition) => {
          const checked = definition.id === 'dop20' ? 'checked' : '';
          basemapHost.insertAdjacentHTML(
            'beforeend',
            `<div class="layer-row layer-row-basemap"><label for="basemap-${definition.id}"><input type="radio" id="basemap-${definition.id}" name="active-basemap" data-basemap="${definition.id}" ${checked}> <span class="layer-swatch" style="background:${definition.color}"></span>${definition.label}</label></div>`
          );
        });
        const overlayHost = root.querySelector('.builtin-list-overlays') || basemapHost;
        overlayDefinitions.forEach((definition) => {
          overlayHost.insertAdjacentHTML(
            'beforeend',
            `<div class="layer-row"><label for="overlay-${definition.id}"><input type="checkbox" id="overlay-${definition.id}" name="overlay_${definition.id}" data-layer="${definition.id}" checked> <span class="layer-swatch" style="background:${definition.color}"></span>${definition.label}</label><input id="opacity-${definition.id}" name="opacity_${definition.id}" class="layer-opacity" data-opacity="${definition.id}" type="range" min="0" max="1" step=".01" value="${OVERLAY_OPACITY_DEFAULT}" title="Opacity" aria-label="${definition.label} opacity"></div>`
          );
        });
        // Apply default overlay opacity immediately (sliders alone do not).
        const applyDefaultOverlayOpacity = () => {
          overlayDefinitions.forEach((definition) => {
            const slider = panel?.querySelector(`[data-opacity="${definition.id}"]`);
            if (slider) slider.value = String(OVERLAY_OPACITY_DEFAULT);
            setOpacity(definition.id, OVERLAY_OPACITY_DEFAULT);
          });
        };
        applyDefaultOverlayOpacity();
        // Re-apply once sources/layers are fully live (avoids a race to 100% paint).
        map.once?.('idle', applyDefaultOverlayOpacity);
        const toggleBtn = root.querySelector('.layers-toggle');
        if (toggleBtn) toggleBtn.onclick = () => { panel.hidden = !panel.hidden; };
        root.querySelector('.layer-search').oninput = (event) => {
          panel.querySelectorAll('.state-row').forEach((row) => {
            row.hidden = !row.textContent.toLowerCase().includes(event.target.value.toLowerCase());
          });
        };
        root.querySelector('.add-provider').onclick = () => addProvider();
        root.querySelector('.nrw-service').onchange = (event) => {
          if (event.target.value) {
            const option = event.target.selectedOptions[0];
            addProvider(event.target.value, option.textContent);
            event.target.value = '';
          }
        };
        root.querySelectorAll('[data-basemap]').forEach((input) => {
          input.onchange = async () => {
            if (!input.checked) return;
            if (input.dataset.basemap === 'dop20') {
              await enableCurrentLandDop({ force: true, focusMap: false });
              return;
            }
            try { window.MapModule?.clearGermanStateHighlight?.(); } catch (_) {}
            if (!selectBasemap(input.dataset.basemap)) {
              const active = getActiveBasemapLayerId();
              const restore = panel?.querySelector(`[data-basemap="${active}"]`)
                || panel?.querySelector('[data-basemap="dop20"]');
              if (restore) restore.checked = true;
            } else {
              publishImageryStatus(`${input.dataset.basemap} basemap`, { ok: true });
            }
          };
        });
        root.querySelectorAll('[data-layer]').forEach((input) => {
          input.onchange = () => {
            setVisible(input.dataset.layer, input.checked);
            if (input.dataset.layer === 'systems') {
              document.dispatchEvent(new CustomEvent('systems:visibility', {
                detail: { visible: input.checked, source: 'layers' },
              }));
            }
          };
        });
        root.querySelectorAll('[data-opacity]').forEach((input) => {
          input.oninput = () => setOpacity(input.dataset.opacity, +input.value);
        });
        map.on('moveend', scheduleDopFollow);
        map.on('zoomend', () => syncDopAvailabilityChip());
        wireDopAvailabilityChip();
        // Default basemap: Land DOP (auto) with reference dop20 until catalog is ready.
        selectBasemap('dop20', { force: true });
        loadProviders().then(async () => {
          try {
            await enableCurrentLandDop({ force: true, focusMap: false });
          } catch (_) {}
          syncDopAvailabilityChip();
        });
        syncDopAvailabilityChip();
        return root;
      },
      onRemove() {
        stopDopTileWatch();
        if (map) map.off('moveend', scheduleDopFollow);
        this._map = null;
      }
    };
    if (embedInHost) {
      const host = document.getElementById('layersHost');
      if (host) host.appendChild(control.onAdd(map));
    } else {
      map.addControl(control, container);
    }
    return control;
  }

  return { init, setVisible, setOpacity, selectBasemap, enableCurrentLandDop };
})();
