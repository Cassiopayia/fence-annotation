// @ts-nocheck — incremental strict typing; CDN map libs typed loosely for migration.
/* Map Module Orchestrator — Owns MapLibre lifecycle, raster sources, drawing control, and snap feedback. */

import "./maplibre-setup";
import { ensureMapLibreWorker } from "./maplibre-setup";
import * as maplibregl from 'maplibre-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { basemaps, mapStyle, drawStyles } from './map-styles';
import { initMapLayers } from './map-layers';
import { buildAnnotationDrawModes, DrawModule } from './draw';
import { ensureMapOverlayStack } from './imagery-layers';

export const MapModule = (() => {
  let map;
  let draw;
  let mapLayers;

  /** @param {string | HTMLElement} container */
  function init(container = 'map') {
    ensureMapLibreWorker();
    // Tear down a previous map instance (React remounts MapCanvas across tabs).
    try {
      map?.remove?.();
    } catch (_) {}

    map = new maplibregl.Map({
      container,
      center: [10.4, 51.2],
      zoom: 6,
      minZoom: 1,
      dragRotate: false,
      // Custom control below — needs fixed stacking above Lovable HUD.
      attributionControl: false,
      style: mapStyle,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'top-right',
    );

    // Stay collapsed until the user taps — MapLibre may auto-expand on wide viewports.
    const collapseAttrib = () => {
      const el = map.getContainer()?.querySelector?.('.maplibregl-ctrl-attrib');
      if (!el) return;
      el.classList.add('maplibregl-compact');
      el.classList.remove('maplibregl-compact-show');
      if (el instanceof HTMLDetailsElement) el.open = false;
      el.removeAttribute?.('open');
    };
    map.once('load', collapseAttrib);
    requestAnimationFrame(collapseAttrib);

    // Keep the canvas flush with the viewport when mobile chrome shows/hides.
    const onViewport = () => {
      try {
        map.resize();
      } catch (_) {}
    };
    window.visualViewport?.addEventListener('resize', onViewport);
    window.addEventListener('orientationchange', onViewport);
    map.once('remove', () => {
      window.visualViewport?.removeEventListener('resize', onViewport);
      window.removeEventListener('orientationchange', onViewport);
    });

    draw = new MapboxDraw({
      displayControlsDefault: false,
      keybindings: true,
      // Guided/FAB/edit enter draw modes in code — no Mapbox Draw toolbar needed.
      controls: {
        point: false,
        line: false,
        line_string: false,
        polygon: false,
        trash: false,
        combine_features: false,
        uncombine_features: false,
      },
      defaultMode: 'simple_select',
      styles: drawStyles,
      modes: buildAnnotationDrawModes(),
    });

    // Keep MapLibre chrome off the Lovable HUD (info pill is top-left).
    map.addControl(draw, 'top-right');

    mapLayers = initMapLayers(map, draw);
    DrawModule.init(map, draw, {
      showSnapTarget: (coord) => mapLayers?.showSnapTarget(coord),
      hideSnapTarget: () => mapLayers?.hideSnapTarget(),
    });
    if (typeof window !== 'undefined') window.MapModule = MapModule;

    map.on('load', () => {
      mapLayers.addDataLayers();
      // Draw control registers before data layers — lift vectors + draw above rasters.
      ensureMapOverlayStack(map);

      map.on('sourcedata', (e) => {
        if (e.isSourceLoaded) window.dispatchEvent(new CustomEvent('tilesloaded'));
      });
    });

    return {
      map,
      draw,
      showSnapTarget: (coord) => mapLayers?.showSnapTarget(coord),
      hideSnapTarget: () => mapLayers?.hideSnapTarget(),
    };
  }

  return {
    init,
    setAnnotations: (d) => mapLayers?.setAnnotations(d),
    setSystems: (d) => mapLayers?.setSystems(d),
    setDistractionBlending: (a, inactiveOpacity) => mapLayers?.setDistractionBlending(a, inactiveOpacity),
    setPvSystemsVisible: (visible) => mapLayers?.setPvSystemsVisible(visible),
    setAnnotationsVisible: (visible) => mapLayers?.setAnnotationsVisible(visible),
    highlightGermanState: (idOrNames) => mapLayers?.highlightGermanState(idOrNames),
    clearGermanStateHighlight: () => mapLayers?.clearGermanStateHighlight(),
    setDopCoverageFromCatalog: (entries) => mapLayers?.setDopCoverageFromCatalog(entries),
    setDopCoverageVisible: (visible) => mapLayers?.setDopCoverageVisible(visible),
    showSnapTarget: (coord) => mapLayers?.showSnapTarget(coord),
    hideSnapTarget: () => mapLayers?.hideSnapTarget(),
    getMap: () => map,
    getDraw: () => draw,
  };
})();
