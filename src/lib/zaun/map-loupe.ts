// @ts-nocheck — incremental strict typing; CDN map libs typed loosely for migration.
/* Magnifying Loupe — always-on annotation helper with independent zoom + layer.
 *
 * Loupe +/− / wheel change ONLY the loupe zoom. Main-map zoom never moves.
 * Optional "Follow map" links loupe zoom to main+offset until you loupe in again.
 */

import * as maplibregl from 'maplibre-gl';
import { mapStyle } from './map-styles';
import { BASEMAP_LAYER_IDS, getActiveBasemapLayerId } from './imagery-layers';

export const LOUPE_OFFSET_MIN = 0;
export const LOUPE_OFFSET_MAX = 8;
export const LOUPE_OFFSET_DEFAULT = 3;
/** Loupe may zoom out for context — WMS minzoom is separate (main map / proxy). */
export const LOUPE_ABS_ZOOM_MIN = 10;
export const LOUPE_ABS_ZOOM_MAX = 22;
export const LOUPE_ABS_ZOOM_DEFAULT = 18;

const STORAGE_LAYER = 'zaun.loupe.layer';
const STORAGE_ZOOM_MODE = 'zaun.loupe.zoomMode';
const STORAGE_OFFSET = 'zaun.loupe.offset';
const STORAGE_ABS_ZOOM = 'zaun.loupe.absZoom';
const STORAGE_GEOMETRY = 'zaun.loupe.geometry';

const LOUPE_WIDTH_MIN = 160;
const LOUPE_WIDTH_MAX = 480;
const LOUPE_STAGE_MIN = 100;
const LOUPE_STAGE_MAX = 360;

const LAYER_OPTIONS = [
  { id: 'follow', label: 'Follow map' },
  { id: 'maxar', label: 'Maxar (help)' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'dop20', label: 'DOP20' },
  { id: 'osm', label: 'OSM' },
];

export function clampLoupeOffset(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return LOUPE_OFFSET_DEFAULT;
  return Math.min(LOUPE_OFFSET_MAX, Math.max(LOUPE_OFFSET_MIN, n));
}

function clampAbsZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return LOUPE_ABS_ZOOM_DEFAULT;
  // Half-step loupe zoom feels more like optical magnification.
  const stepped = Math.round(n * 2) / 2;
  return Math.min(LOUPE_ABS_ZOOM_MAX, Math.max(LOUPE_ABS_ZOOM_MIN, stepped));
}

function formatLoupeZoom(z) {
  const n = Number(z);
  if (!Number.isFinite(n)) return 'z—';
  return Number.isInteger(n) ? `z${n}` : `z${n.toFixed(1)}`;
}

function readStored(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null || v === '' ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function writeStored(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (_) {}
}

function normalizeZoomMode(raw) {
  // Legacy "relative" == follow map zoom + offset.
  if (raw === 'follow' || raw === 'relative') return 'follow';
  return 'absolute';
}

function loupeStyleForLayer(layerId) {
  if (layerId && String(layerId).startsWith('wms-')) {
    return {
      version: 8,
      sources: {
        loupe: {
          type: 'raster',
          tiles: (window.map?.getSource?.(layerId)?.tiles
            || window.map?.getSource?.(layerId)?._options?.tiles
            || ['https://tile.openstreetmap.org/{z}/{x}/{y}.png']),
          tileSize: 256,
          attribution: 'WMS',
        },
      },
      layers: [{ id: 'loupe', type: 'raster', source: 'loupe' }],
    };
  }
  const key = mapStyle.sources?.[layerId] ? layerId : 'maxar';
  const source = mapStyle.sources[key];
  return {
    version: 8,
    sources: { loupe: { ...source } },
    layers: [{ id: 'loupe', type: 'raster', source: 'loupe' }],
  };
}

export function installLoupe(root) {
  // Independent loupe zoom by default — +/− never moves the main map.
  let zoomMode = normalizeZoomMode(readStored(STORAGE_ZOOM_MODE, 'absolute'));
  let loupeZoomOffset = clampLoupeOffset(readStored(STORAGE_OFFSET, LOUPE_OFFSET_DEFAULT));
  let loupeAbsZoom = clampAbsZoom(readStored(STORAGE_ABS_ZOOM, LOUPE_ABS_ZOOM_DEFAULT));
  let layerChoice = readStored(STORAGE_LAYER, 'maxar'); // follow | maxar | …
  if (layerChoice !== 'follow' && !BASEMAP_LAYER_IDS.includes(layerChoice)) {
    layerChoice = 'maxar';
  }
  // Prefer Maxar help imagery in the loupe by default (main map owns DOP).
  if (!readStored(STORAGE_LAYER, null)) {
    layerChoice = 'maxar';
    writeStored(STORAGE_LAYER, 'maxar');
  }
  if (!readStored(STORAGE_ABS_ZOOM, null)) {
    loupeAbsZoom = LOUPE_ABS_ZOOM_DEFAULT;
    writeStored(STORAGE_ABS_ZOOM, loupeAbsZoom);
  }
  let activeStyleLayerId = null;
  let lastCenter = null;
  let styleSwapPending = false;
  let mainMapBound = false;

  const loupeFab = document.createElement('button');
  loupeFab.id = 'loupeFab';
  loupeFab.type = 'button';
  loupeFab.className = 'map-loupe-fab icon-btn';
  loupeFab.title = 'Open loupe (Esc to close when open)';
  loupeFab.setAttribute('aria-label', 'Open loupe');
  loupeFab.setAttribute('aria-controls', 'mapLoupe');
  loupeFab.setAttribute('aria-expanded', 'false');
  loupeFab.textContent = '🔍';

  const loupeWrap = document.createElement('div');
  loupeWrap.id = 'mapLoupe';
  loupeWrap.className = 'map-loupe-container';
  loupeWrap.innerHTML = `
    <div class="map-loupe-bar" data-loupe-drag role="toolbar" aria-label="Loupe controls">
      <span class="map-loupe-drag-grip" aria-hidden="true" title="Drag loupe">⠿</span>
      <select id="loupeLayerSelect" name="loupe_layer" class="map-loupe-select" aria-label="Loupe imagery layer" title="Imagery shown in the loupe (independent of main basemap)">
        ${LAYER_OPTIONS.map((o) => `<option value="${o.id}"${o.id === layerChoice ? ' selected' : ''}>${o.label}</option>`).join('')}
      </select>
      <button type="button" id="loupeZoomLockBtn" class="map-loupe-icon-btn map-loupe-lock" title="Follow main-map zoom" aria-pressed="false">🔗</button>
      <button type="button" id="loupeZoomOutBtn" class="map-loupe-icon-btn" title="Loupe zoom out (main map unchanged)">−</button>
      <span id="loupeZoomIndicator" class="map-loupe-zoom-ind" aria-live="polite">${formatLoupeZoom(loupeAbsZoom)}</span>
      <button type="button" id="loupeZoomInBtn" class="map-loupe-icon-btn" title="Loupe zoom in (main map unchanged)">+</button>
      <button type="button" id="loupeMinimizeBtn" class="map-loupe-icon-btn map-loupe-minimize" title="Close loupe" aria-label="Close loupe">✕</button>
    </div>
    <div class="map-loupe-stage">
      <div id="loupeMap" class="map-loupe-canvas"></div>
      <div class="map-loupe-haircross" aria-hidden="true">
        <span class="map-loupe-haircross-v"></span>
        <span class="map-loupe-haircross-h"></span>
        <span class="map-loupe-haircross-dot"></span>
      </div>
    </div>
    <div class="map-loupe-resize" data-loupe-resize title="Resize loupe" aria-hidden="true"></div>
  `;
  root.appendChild(loupeFab);

  const loupeBackdrop = document.createElement('button');
  loupeBackdrop.type = 'button';
  loupeBackdrop.className = 'map-loupe-backdrop';
  loupeBackdrop.hidden = true;
  loupeBackdrop.setAttribute('aria-label', 'Close loupe');
  loupeBackdrop.title = 'Close loupe';
  root.appendChild(loupeBackdrop);

  root.appendChild(loupeWrap);

  const isMobileLoupe = () => window.matchMedia('(max-width: 760px)').matches;
  let mobileOpen = false;
  let desktopOpen = false;

  const syncLoupeOpen = () => {
    const mobile = isMobileLoupe();
    const open = mobile ? mobileOpen : desktopOpen;
    loupeWrap.classList.toggle('is-mobile-collapsed', mobile && !mobileOpen);
    loupeWrap.classList.toggle('is-mobile-open', mobile && mobileOpen);
    loupeWrap.classList.toggle('is-desktop-collapsed', !mobile && !desktopOpen);
    loupeFab.classList.toggle('is-hidden', open);
    loupeFab.setAttribute('aria-expanded', String(open));
    loupeBackdrop.hidden = !(mobile && mobileOpen);
    document.body.classList.toggle('loupe-mobile-open', mobile && mobileOpen);
  };

  const setMobileOpen = (open) => {
    mobileOpen = Boolean(open);
    syncLoupeOpen();
  };

  const setDesktopOpen = (open) => {
    desktopOpen = Boolean(open);
    syncLoupeOpen();
    if (desktopOpen) {
      try { loupeMap?.resize?.(); } catch (_) {}
    }
  };

  const loupeCrowdedContext = () => {
    const body = document.body;
    if (body.dataset.datasetReview === '1') return true;
    if (body.dataset.sidebar === 'features') return true;
    if (body.dataset.uiState === 'ANNOTATION') return true;
    return false;
  };

  const autoCollapseIfCrowded = () => {
    if (isMobileLoupe() || !desktopOpen) return;
    if (loupeCrowdedContext()) {
      setDesktopOpen(false);
      return;
    }
    const actionBar = document.getElementById('app-action-bar');
    const actionBarVisible = actionBar && !actionBar.hidden;
    if (document.body.dataset.uiState === 'ANNOTATION' && actionBarVisible) {
      const barRect = actionBar.getBoundingClientRect();
      const loupeRect = loupeWrap.getBoundingClientRect();
      if (barRect.top < loupeRect.bottom + 12) {
        setDesktopOpen(false);
      }
    }
  };

  loupeFab.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isMobileLoupe()) setMobileOpen(true);
    else setDesktopOpen(true);
    try { loupeMap?.resize?.(); } catch (_) {}
  });
  loupeBackdrop.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setMobileOpen(false);
  });
  loupeWrap.querySelector('#loupeMinimizeBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isMobileLoupe()) setMobileOpen(false);
    else setDesktopOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = isMobileLoupe() ? mobileOpen : desktopOpen;
    if (!open) return;
    if (isMobileLoupe()) setMobileOpen(false);
    else setDesktopOpen(false);
  });

  const clampGeometry = (geo, hostRect) => {
    const width = Math.min(
      LOUPE_WIDTH_MAX,
      Math.max(LOUPE_WIDTH_MIN, Number(geo?.width) || 240),
    );
    const stageHeight = Math.min(
      LOUPE_STAGE_MAX,
      Math.max(LOUPE_STAGE_MIN, Number(geo?.stageHeight) || 150),
    );
    const maxLeft = Math.max(0, hostRect.width - width);
    const maxTop = Math.max(0, hostRect.height - (stageHeight + 36));
    const left = Math.min(maxLeft, Math.max(0, Number(geo?.left)));
    const top = Math.min(maxTop, Math.max(0, Number(geo?.top)));
    return {
      left: Number.isFinite(left) ? left : null,
      top: Number.isFinite(top) ? top : null,
      width,
      stageHeight,
      placed: Boolean(geo?.placed) && Number.isFinite(left) && Number.isFinite(top),
    };
  };

  const readGeometry = () => {
    try {
      return JSON.parse(readStored(STORAGE_GEOMETRY, '{}') || '{}');
    } catch (_) {
      return {};
    }
  };

  const applyGeometry = (geo) => {
    const hostRect = root.getBoundingClientRect();
    const next = clampGeometry(geo, hostRect);
    loupeWrap.style.width = `${next.width}px`;
    const stage = loupeWrap.querySelector('.map-loupe-stage');
    if (stage) stage.style.height = `${next.stageHeight}px`;
    if (next.placed) {
      loupeWrap.classList.add('is-placed');
      loupeWrap.style.left = `${next.left}px`;
      loupeWrap.style.top = `${next.top}px`;
      loupeWrap.style.right = 'auto';
    }
    return next;
  };

  const persistGeometry = (geo) => {
    writeStored(STORAGE_GEOMETRY, JSON.stringify(geo));
  };

  let geometry = applyGeometry(readGeometry());

  const stopMapGesture = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  // Keep main-map pan/zoom/draw from eating loupe chrome interactions.
  ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'pointerdown', 'touchstart'].forEach((type) => {
    loupeWrap.addEventListener(type, (event) => event.stopPropagation());
    loupeFab.addEventListener(type, (event) => event.stopPropagation());
    loupeBackdrop.addEventListener(type, (event) => event.stopPropagation());
  });
  loupeWrap.addEventListener('wheel', (event) => {
    stopMapGesture(event);
    const delta = event.deltaY > 0 ? -0.5 : 0.5;
    // Wheel always loupes in/out independently — never changes main map zoom.
    nudgeLoupeZoom(delta);
  }, { passive: false });

  const wireLoupeDragResize = () => {
    const dragEl = loupeWrap.querySelector('[data-loupe-drag]');
    const resizeEl = loupeWrap.querySelector('[data-loupe-resize]');
    if (!dragEl || !resizeEl) return;

    const bindPointer = (el, onMove, onEnd) => {
      el.addEventListener('pointerdown', (event) => {
        if (event.button != null && event.button !== 0) return;
        // Don't start drag from interactive controls inside the bar.
        if (el === dragEl && event.target?.closest?.('button, select, option, input, a, label')) return;
        event.preventDefault();
        event.stopPropagation();
        try { el.setPointerCapture?.(event.pointerId); } catch (_) {}
        const startX = event.clientX;
        const startY = event.clientY;
        const hostRect = root.getBoundingClientRect();
        const wrapRect = loupeWrap.getBoundingClientRect();
        const origin = {
          left: wrapRect.left - hostRect.left,
          top: wrapRect.top - hostRect.top,
          width: wrapRect.width,
          stageHeight: loupeWrap.querySelector('.map-loupe-stage')?.getBoundingClientRect()?.height || 150,
        };
        loupeWrap.classList.add('is-dragging');
        const move = (ev) => {
          onMove(ev.clientX - startX, ev.clientY - startY, origin, hostRect);
        };
        const up = () => {
          loupeWrap.classList.remove('is-dragging');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          onEnd?.();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
    };

    bindPointer(dragEl, (dx, dy, origin, hostRect) => {
      geometry = applyGeometry({
        ...geometry,
        placed: true,
        left: origin.left + dx,
        top: origin.top + dy,
        width: origin.width,
        stageHeight: origin.stageHeight,
      });
    }, () => persistGeometry(geometry));

    bindPointer(resizeEl, (dx, dy, origin) => {
      geometry = applyGeometry({
        ...geometry,
        placed: geometry.placed,
        left: geometry.left,
        top: geometry.top,
        width: origin.width + dx,
        stageHeight: origin.stageHeight + dy,
      });
      try { loupeMap?.resize?.(); } catch (_) {}
    }, () => {
      persistGeometry(geometry);
      try { loupeMap?.resize?.(); } catch (_) {}
    });
  };
  wireLoupeDragResize();

  const mainZoom = () => {
    const mainMap = window.MapModule?.getMap?.();
    return mainMap ? mainMap.getZoom() : 12;
  };

  const resolveStyleLayer = () => {
    if (layerChoice === 'follow') {
      const active = getActiveBasemapLayerId() || 'maxar';
      // Below typical DOP minzoom, follow Maxar so the loupe isn't empty.
      if (String(active).startsWith('wms-') && mainZoom() < 14) return 'maxar';
      return active;
    }
    return layerChoice;
  };

  activeStyleLayerId = resolveStyleLayer();

  const loupeMap = new maplibregl.Map({
    container: 'loupeMap',
    style: loupeStyleForLayer(activeStyleLayerId),
    center: [10.4515, 51.1657],
    zoom: loupeAbsZoom,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
  });

  const zoomInd = loupeWrap.querySelector('#loupeZoomIndicator');
  const lockBtn = loupeWrap.querySelector('#loupeZoomLockBtn');
  const layerSelect = loupeWrap.querySelector('#loupeLayerSelect');
  const zoomInBtn = loupeWrap.querySelector('#loupeZoomInBtn');
  const zoomOutBtn = loupeWrap.querySelector('#loupeZoomOutBtn');

  const targetZoom = () => {
    if (zoomMode === 'follow') {
      return Math.max(
        LOUPE_ABS_ZOOM_MIN,
        Math.min(LOUPE_ABS_ZOOM_MAX, mainZoom() + loupeZoomOffset),
      );
    }
    return clampAbsZoom(loupeAbsZoom);
  };

  const updateZoomDisplay = () => {
    const z = targetZoom();
    if (zoomInd) {
      zoomInd.textContent = zoomMode === 'follow'
        ? `map+${loupeZoomOffset}`
        : formatLoupeZoom(z);
      zoomInd.title = zoomMode === 'follow'
        ? `Following main map (z${mainZoom().toFixed(1)} + ${loupeZoomOffset}). Press +/− to loupe independently.`
        : `Loupe zoom ${formatLoupeZoom(z)} — main map unchanged`;
    }
    if (lockBtn) {
      const following = zoomMode === 'follow';
      lockBtn.textContent = following ? '🔗' : '🔒';
      lockBtn.title = following
        ? 'Following main-map zoom — click to lock independent loupe zoom'
        : 'Independent loupe zoom — click to follow main-map zoom';
      lockBtn.setAttribute('aria-pressed', String(following));
      lockBtn.classList.toggle('is-active', following);
    }
  };

  const refreshView = () => {
    if (!loupeMap || styleSwapPending) return;
    const center = lastCenter || loupeMap.getCenter();
    const nextZoom = targetZoom();
    const cur = loupeMap.getCenter();
    const curZ = loupeMap.getZoom();
    // Skip jumpTo when nothing meaningful changed — reduces flicker.
    if (
      Math.abs(cur.lng - center.lng) < 1e-10
      && Math.abs(cur.lat - center.lat) < 1e-10
      && Math.abs(curZ - nextZoom) < 0.01
    ) {
      updateZoomDisplay();
      return;
    }
    loupeMap.jumpTo({
      center: [center.lng, center.lat],
      zoom: nextZoom,
    });
    updateZoomDisplay();
  };

  /** Loupe-only zoom. Always detaches from main-map follow. */
  const nudgeLoupeZoom = (delta) => {
    const base = zoomMode === 'follow' ? targetZoom() : loupeAbsZoom;
    zoomMode = 'absolute';
    loupeAbsZoom = clampAbsZoom(base + delta);
    writeStored(STORAGE_ZOOM_MODE, zoomMode);
    writeStored(STORAGE_ABS_ZOOM, loupeAbsZoom);
    refreshView();
  };

  const setFollowMode = (follow) => {
    if (follow) {
      zoomMode = 'follow';
      loupeZoomOffset = clampLoupeOffset(loupeMap.getZoom() - mainZoom());
      writeStored(STORAGE_OFFSET, loupeZoomOffset);
    } else {
      zoomMode = 'absolute';
      loupeAbsZoom = clampAbsZoom(loupeMap.getZoom());
      writeStored(STORAGE_ABS_ZOOM, loupeAbsZoom);
    }
    writeStored(STORAGE_ZOOM_MODE, zoomMode);
    refreshView();
  };

  const applyStyleLayer = (layerId, { force = false } = {}) => {
    const next = layerId || 'maxar';
    if (!force && next === activeStyleLayerId) return;
    activeStyleLayerId = next;
    const center = lastCenter || loupeMap.getCenter();
    const zoom = targetZoom();
    styleSwapPending = true;
    loupeMap.setStyle(loupeStyleForLayer(activeStyleLayerId));
    loupeMap.once('style.load', () => {
      styleSwapPending = false;
      try {
        loupeMap.jumpTo({ center: [center.lng, center.lat], zoom });
        loupeMap.resize();
      } catch (_) {}
      updateZoomDisplay();
      // Nudge a redraw so tiles refetch after basemap switches.
      try { loupeMap.triggerRepaint?.(); } catch (_) {}
    });
  };

  const syncStyleFromChoice = ({ force = false } = {}) => {
    applyStyleLayer(resolveStyleLayer(), { force });
  };

  const bindMainMapZoom = () => {
    const mainMap = window.MapModule?.getMap?.();
    if (!mainMap || mainMapBound) return;
    mainMapBound = true;
    let lastFollowStyle = null;
    const onMainZoom = () => {
      if (zoomMode === 'follow') refreshView();
      if (layerChoice === 'follow') {
        const next = resolveStyleLayer();
        if (next !== lastFollowStyle) {
          lastFollowStyle = next;
          syncStyleFromChoice({ force: true });
        }
      }
    };
    mainMap.on('zoom', onMainZoom);
    mainMap.on('zoomend', onMainZoom);
  };

  const onLoupeZoomClick = (delta) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    nudgeLoupeZoom(delta);
  };

  zoomInBtn.onclick = onLoupeZoomClick(0.5);
  zoomOutBtn.onclick = onLoupeZoomClick(-0.5);
  lockBtn.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setFollowMode(zoomMode !== 'follow');
  };

  layerSelect.onchange = () => {
    layerChoice = layerSelect.value || 'follow';
    writeStored(STORAGE_LAYER, layerChoice);
    syncStyleFromChoice({ force: true });
    updateZoomDisplay();
  };

  document.addEventListener('imagery:basemapchange', () => {
    // Always refresh when following the main map; also reload if the loupe
    // layer id matches the new basemap (e.g. user picked Maxar in both).
    if (layerChoice === 'follow') {
      syncStyleFromChoice({ force: true });
      refreshView();
      return;
    }
    const active = getActiveBasemapLayerId();
    if (active && (active === layerChoice || String(active).startsWith('wms-'))) {
      // Keep independent loupe imagery, but force a tile refresh after map churn.
      try { loupeMap.resize(); } catch (_) {}
      refreshView();
    }
  });

  loupeMap.on('load', () => {
    try { loupeMap.resize(); } catch (_) {}
    bindMainMapZoom();
    refreshView();
  });

  // Keep tiles crisp when container size changes (sidebars etc.).
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      try { loupeMap.resize(); } catch (_) {}
    });
    ro.observe(loupeWrap);
  }

  const resizeLoupe = () => {
    geometry = applyGeometry(geometry.placed ? geometry : readGeometry());
    syncLoupeOpen();
    autoCollapseIfCrowded();
    try { loupeMap.resize(); } catch (_) {}
  };
  window.addEventListener('resize', resizeLoupe);
  document.addEventListener('ui:statechange', autoCollapseIfCrowded);
  document.addEventListener('sidebarchange', autoCollapseIfCrowded);
  try {
    const bodyObs = new MutationObserver(autoCollapseIfCrowded);
    bodyObs.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-dataset-review', 'data-sidebar', 'data-ui-state'],
    });
  } catch (_) { /* ignore */ }

  loupeWrap.querySelector('#loupeMap')?.addEventListener('zaun:loupe-resize', resizeLoupe);

  updateZoomDisplay();
  syncLoupeOpen();
  loupeWrap.classList.add('is-desktop-collapsed');

  return {
    show: () => {
      try { loupeMap.resize(); } catch (_) {}
      bindMainMapZoom();
      refreshView();
      autoCollapseIfCrowded();
    },
    collapseIfCrowded: autoCollapseIfCrowded,
    hide: () => {
      if (isMobileLoupe()) setMobileOpen(false);
      else setDesktopOpen(false);
    },
    getOffset: () => loupeZoomOffset,
    setOffset: (next) => {
      // API compat: setting offset implies follow mode.
      loupeZoomOffset = clampLoupeOffset(next);
      zoomMode = 'follow';
      writeStored(STORAGE_ZOOM_MODE, zoomMode);
      writeStored(STORAGE_OFFSET, loupeZoomOffset);
      refreshView();
    },
    updateCenter(lngLat) {
      if (!loupeMap || !lngLat) return;
      lastCenter = lngLat;
      bindMainMapZoom();
      refreshView();
    },
  };
}
