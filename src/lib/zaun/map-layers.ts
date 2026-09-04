// @ts-nocheck — incremental strict typing; CDN map libs typed loosely for migration.
/* Map Layers & Data Sources Module */

import * as maplibregl from 'maplibre-gl';
import { DrawModule } from './draw';
import { assetUrl } from './wms-client';

export function initMapLayers(map, draw) {
  let distractionOverlayId = null;
  let hoveredAnnotationId = null;
  let activeAnnotationId = null;

  function annotationFeatureId(feature) {
    return feature?.properties?.fence_id
      ?? feature?.properties?.id
      ?? feature?.id
      ?? null;
  }

  function setAnnotationState(featureId, state, enabled) {
    if (featureId === null || featureId === undefined) return;
    try {
      map.setFeatureState({ source: 'annotations', id: featureId }, { [state]: enabled });
    } catch (_) {}
  }

  function shouldIgnoreMapSelection() {
    // While tracing a fence, clicks must place/snap vertices — never select PV or saved fences.
    return DrawModule.isAnnotationActive?.() || DrawModule.isAnnotationDrawing?.();
  }

  function addDataLayers() {
    // German State borders outline
    map.addSource('german-states', {
      type: 'geojson',
      data: assetUrl('data/german_states.geojson')
    });
    map.addLayer({
      id: 'german-states-outline',
      type: 'line',
      source: 'german-states',
      layout: { visibility: 'none' },
      paint: {
        'line-color': '#20603d',
        'line-width': 1.8,
        'line-opacity': 0.65,
        'line-dasharray': [3, 3]
      }
    });
    // Emphasized state when a Land DOP WMS is selected (filter starts empty).
    map.addLayer({
      id: 'german-states-highlight-fill',
      type: 'fill',
      source: 'german-states',
      filter: ['==', ['get', 'name'], '__none__'],
      paint: {
        'fill-color': '#a371f7',
        'fill-opacity': 0.12,
      }
    });
    map.addLayer({
      id: 'german-states-highlight',
      type: 'line',
      source: 'german-states',
      filter: ['==', ['get', 'name'], '__none__'],
      paint: {
        'line-color': '#a371f7',
        'line-width': 3.25,
        'line-opacity': 0.95,
      }
    });

    // Soft fill for every Bundesland that has a catalog DOP WMS (visual availability).
    map.addLayer({
      id: 'dop-coverage-fill',
      type: 'fill',
      source: 'german-states',
      filter: ['==', ['get', 'name'], '__none__'],
      layout: { visibility: 'visible' },
      paint: {
        'fill-color': '#a371f7',
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          5, 0.22,
          10, 0.12,
          14, 0.04,
          16, 0.0,
        ],
      },
    }, 'german-states-outline');
    map.addLayer({
      id: 'dop-coverage-outline',
      type: 'line',
      source: 'german-states',
      filter: ['==', ['get', 'name'], '__none__'],
      layout: { visibility: 'visible' },
      paint: {
        'line-color': '#a371f7',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          5, 1.2,
          12, 2.0,
          16, 0.5,
        ],
        'line-opacity': [
          'interpolate', ['linear'], ['zoom'],
          5, 0.85,
          14, 0.35,
          16, 0.0,
        ],
      },
    }, 'german-states-outline');

    // Optional bbox overlays from catalog (fallback / Bund coverage).
    map.addSource('dop-coverage-bounds', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id: 'dop-coverage-bounds-fill',
      type: 'fill',
      source: 'dop-coverage-bounds',
      layout: { visibility: 'none' },
      paint: {
        'fill-color': '#a371f7',
        'fill-opacity': 0.06,
      },
    }, 'german-states-outline');

    // LineString fences render as lines; Polygon/MultiPolygon get fill + outline
    // ($type Polygon also matches MultiPolygon in MapLibre filters).
    // Extra/sample fences (no PV) use violet. Paint keys off string prop `extra`
    // ("yes"/"no") — MapLibre boolean compares on GeoJSON props are unreliable.
    map.addSource('annotations', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'fence_id'
    });
    const isExtraFence = ['==', ['get', 'extra'], 'yes'];
    const isAwaitingReview = [
      'any',
      ['==', ['get', 'review_status'], 'awaiting'],
      [
        'all',
        ['any', ['==', ['get', 'is_public'], false], ['==', ['to-string', ['get', 'is_public']], 'false']],
        ['!=', ['get', 'review_status'], 'excluded'],
        ['!=', ['get', 'review_status'], 'verified'],
      ],
    ];
    // Verified = lime; awaiting review (anyone’s pending fence) = violet; extra = brighter violet.
    const annotationColor = ['case',
      ['boolean', ['feature-state', 'active'], false], '#1fc76e',
      ['boolean', ['feature-state', 'hover'], false], '#1fc76e',
      isExtraFence, '#c297ff',
      isAwaitingReview, '#a78bfa',
      '#18a85b'
    ];
    const annotationLineWidth = ['case',
      ['boolean', ['feature-state', 'active'], false], 3,
      ['boolean', ['feature-state', 'hover'], false], 3,
      isExtraFence, 2.5,
      isAwaitingReview, 2.5,
      2.75
    ];
    const annotationLineOpacity = ['case',
      isAwaitingReview, 0.95,
      0.85
    ];
    // Fill layers only accept Polygon in $type filters; MultiPolygon still matches.
    const legacyPolygonFilter = ['==', '$type', 'Polygon'];
    map.addLayer({
      id: 'annotations-fill',
      type: 'fill',
      source: 'annotations',
      filter: legacyPolygonFilter,
      paint: {
        'fill-color': annotationColor,
        'fill-opacity': 0.42
      }
    });
    map.addLayer({
      id: 'annotations-line',
      type: 'line',
      source: 'annotations',
      paint: {
        'line-color': annotationColor,
        'line-width': annotationLineWidth,
        'line-opacity': annotationLineOpacity,
      }
    });
    const annotationLayerIds = ['annotations-fill', 'annotations-line'];
    const bindAnnotationLayerEvents = (layerId) => {
      map.on('click', layerId, event => {
        if (shouldIgnoreMapSelection()) return;
        if (!event.features?.length) return;
        const feature = event.features[0];
        const featureId = annotationFeatureId(feature);
        if (activeAnnotationId !== null && activeAnnotationId !== featureId) {
          setAnnotationState(activeAnnotationId, 'active', false);
        }
        activeAnnotationId = featureId;
        setAnnotationState(activeAnnotationId, 'active', true);
        map.fire('annotation.select', {feature});
      });
      map.on('mousemove', layerId, event => {
        if (shouldIgnoreMapSelection()) return;
        const feature = event.features?.[0];
        const featureId = annotationFeatureId(feature);
        if (hoveredAnnotationId !== null && hoveredAnnotationId !== featureId) {
          setAnnotationState(hoveredAnnotationId, 'hover', false);
        }
        hoveredAnnotationId = featureId;
        setAnnotationState(hoveredAnnotationId, 'hover', true);
      });
      map.on('mouseenter', layerId, () => {
        if (shouldIgnoreMapSelection()) return;
        map.getCanvas().style.cursor='pointer';
      });
      map.on('mouseleave', layerId, () => {
        if (hoveredAnnotationId !== null) {
          setAnnotationState(hoveredAnnotationId, 'hover', false);
          hoveredAnnotationId = null;
        }
        if (!shouldIgnoreMapSelection()) map.getCanvas().style.cursor='';
      });
    };
    annotationLayerIds.forEach(bindAnnotationLayerEvents);

    // Systems layer
    map.addSource('systems',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'systems-fill',type:'fill',source:'systems',paint:{'fill-color':['case',['boolean',['get','annotated'],false],'#18a85b','#f0883e'],'fill-opacity':0.42}});
    map.addLayer({id:'systems-line',type:'line',source:'systems',paint:{'line-color':['case',['boolean',['get','annotated'],false],'#18a85b','#f0883e'],'line-width':1,'line-opacity':0.42}});
    // Invisible wider stroke so finger taps hit outlines (queryRenderedFeatures uses this).
    map.addLayer({
      id: 'systems-hit',
      type: 'line',
      source: 'systems',
      paint: {
        'line-color': '#000000',
        'line-opacity': 0,
        'line-width': 28,
      },
    });
    const systemsPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: 'systems-hover-popup'
    });
    map.on('click','systems-fill', event => {
      if (shouldIgnoreMapSelection()) return;
      if (!event.features?.length) return;
      systemsPopup.remove();
      map.fire('system.select', {feature:event.features[0]});
    });
    map.on('mousemove', 'systems-fill', (event) => {
      if (shouldIgnoreMapSelection()) {
        systemsPopup.remove();
        return;
      }
      const feature = event.features?.[0];
      if (!feature) return;
      const props = feature.properties || {};
      const id = props.area_id ?? props.footprint_id ?? feature.id ?? '—';
      const ha = Number(props.area_size ?? props.area_ha);
      const areaText = Number.isFinite(ha) ? `${ha.toFixed(3)} ha` : 'area n/a';
      systemsPopup
        .setLngLat(event.lngLat)
        .setHTML(`<strong>PV #${id}</strong><div>${areaText}</div>`)
        .addTo(map);
    });
    map.on('mouseenter','systems-fill', () => {
      if (shouldIgnoreMapSelection()) return;
      map.getCanvas().style.cursor='pointer';
    });
    map.on('mouseleave','systems-fill', () => {
      if (!shouldIgnoreMapSelection()) map.getCanvas().style.cursor='';
      systemsPopup.remove();
    });

    // Snap target visual indicator layer (kept small — matches ~SNAP_PX feel)
    map.addSource('snap-target', {type:'geojson', data:{type:'FeatureCollection', features:[]}});
    map.addLayer({
      id: 'snap-target-ring',
      type: 'circle',
      source: 'snap-target',
      paint: {
        'circle-radius': 8,
        'circle-color': '#18a85b',
        'circle-opacity': 0.18,
        'circle-stroke-color': '#1fc76e',
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0.9
      }
    });
    map.addLayer({
      id: 'snap-target-pulse',
      type: 'circle',
      source: 'snap-target',
      paint: {
        'circle-radius': 3.5,
        'circle-color': '#1fc76e',
        'circle-opacity': 0.95,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.25
      }
    });
  }

  function setDistractionBlending(areaId, systemOpacity = 0.42) {
    if (!map.getLayer('systems-fill')) return;
    const opacity = Math.min(1, Math.max(0, systemOpacity));
    const areaKey = areaId === null || areaId === undefined ? null : String(areaId);

    const resetLayers = () => {
      const defaultFillColor = ['case', ['boolean', ['get', 'annotated'], false], '#18a85b', '#f0883e'];
      const defaultOverlayOpacity = 0.42;
      map.setPaintProperty('systems-fill', 'fill-color', defaultFillColor);
      map.setPaintProperty('systems-fill', 'fill-opacity', defaultOverlayOpacity);
      if (map.getLayer('systems-line')) {
        map.setPaintProperty('systems-line', 'line-color', defaultFillColor);
        map.setPaintProperty('systems-line', 'line-width', 1);
        map.setPaintProperty('systems-line', 'line-opacity', defaultOverlayOpacity);
      }
      if (map.getLayer('annotations-line')) {
        map.setPaintProperty('annotations-line', 'line-opacity', defaultOverlayOpacity);
      }
      if (map.getLayer('annotations-fill')) {
        map.setPaintProperty('annotations-fill', 'fill-opacity', defaultOverlayOpacity);
      }
    };

    if (areaKey === null) {
      resetLayers();
      return;
    }

    const isActiveSystem = ['==', ['to-string', ['coalesce', ['get', 'area_id'], ['get', 'footprint_id'], '']], areaKey];
    const inactiveFillColor = ['case', ['boolean', ['get', 'annotated'], false], '#18a85b', '#f0883e'];

    // Active guided system is blue; everything else keeps annotated/orange styling.
    map.setPaintProperty('systems-fill', 'fill-color', [
      'case',
      isActiveSystem,
      '#58a6ff',
      inactiveFillColor
    ]);
    map.setPaintProperty('systems-fill', 'fill-opacity', opacity);
    if (map.getLayer('systems-line')) {
      map.setPaintProperty('systems-line', 'line-color', [
        'case',
        isActiveSystem,
        '#58a6ff',
        inactiveFillColor
      ]);
      map.setPaintProperty('systems-line', 'line-width', [
        'case',
        isActiveSystem,
        2.5,
        1
      ]);
      map.setPaintProperty('systems-line', 'line-opacity', opacity);
    }
    if (map.getLayer('annotations-line')) {
      map.setPaintProperty('annotations-line', 'line-opacity', opacity);
    }
    if (map.getLayer('annotations-fill')) {
      map.setPaintProperty('annotations-fill', 'fill-opacity', opacity * 0.14);
    }
  }

  function setPvSystemsVisible(visible) {
    ['systems-fill', 'systems-line', 'systems-hit'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    });
  }

  function setAnnotationsVisible(visible) {
    ['annotations-fill', 'annotations-line'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    });
  }

  /** Catalog id → GeoJSON `name` values (spanish labels in german_states_slim.geojson). */
  const CATALOG_STATE_NAMES = {
    'bw-rgb': ['Baden-Wurtemberg'],
    'bw-cir': ['Baden-Wurtemberg'],
    'by-rgb': ['Baviera'],
    'by-cir': ['Baviera'],
    'bb-be': ['Berlín', 'Brandeburgo'],
    'hb-hb': ['Bremen'],
    'hb-bhv': ['Bremen'],
    hh: ['Hamburgo'],
    'he-rgb': ['Hesse'],
    'he-cir': ['Hesse'],
    mv: ['Mecklemburgo-Pomerania Occident'],
    ni: ['Baja Sajonia'],
    nw: ['Renania del Norte-Westfalia'],
    rp: ['Renania-Palatinado'],
    sl: ['Sarre'],
    sn: ['Sajonia'],
    st: ['Sajonia-Anhalt'],
    'st-gdi': ['Sajonia-Anhalt'],
    sh: ['Schleswig-Holstein'],
    th: ['Turingia'],
  };

  function highlightFilterForNames(names) {
    if (!names?.length) return ['==', ['get', 'name'], '__none__'];
    if (names.length === 1) return ['==', ['get', 'name'], names[0]];
    return ['in', ['get', 'name'], ['literal', names]];
  }

  function clearGermanStateHighlight() {
    const empty = highlightFilterForNames([]);
    ['german-states-highlight', 'german-states-highlight-fill'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        try { map.setFilter(layerId, empty); } catch (_) {}
        try { map.setLayoutProperty(layerId, 'visibility', 'none'); } catch (_) {}
      }
    });
  }

  /** Tint every Land that has a catalog DOP entry (visual “DOP available here”). */
  function setDopCoverageFromCatalog(entries) {
    const names = [];
    const seen = new Set();
    const boundsFeatures = [];
    (entries || []).forEach((entry) => {
      if (!entry?.id) return;
      // Prefer RGB / DOP tiles; skip CIR duplicates for the tint.
      const product = `${entry.product || ''} ${entry.label || ''}`;
      if (/\bcir\b/i.test(product)) return;
      (CATALOG_STATE_NAMES[entry.id] || []).forEach((name) => {
        if (!seen.has(name)) {
          seen.add(name);
          names.push(name);
        }
      });
    });
    const filter = highlightFilterForNames(names);
    ['dop-coverage-fill', 'dop-coverage-outline'].forEach((layerId) => {
      if (!map.getLayer(layerId)) return;
      try { map.setFilter(layerId, filter); } catch (_) {}
      try { map.setLayoutProperty(layerId, 'visibility', names.length ? 'visible' : 'none'); } catch (_) {}
    });
    const src = map.getSource('dop-coverage-bounds');
    if (src) {
      try {
        src.setData({ type: 'FeatureCollection', features: boundsFeatures });
      } catch (_) {}
    }
    return names;
  }

  function setDopCoverageVisible(visible) {
    ['dop-coverage-fill', 'dop-coverage-outline'].forEach((layerId) => {
      if (!map.getLayer(layerId)) return;
      try { map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none'); } catch (_) {}
    });
  }

  function highlightGermanState(catalogIdOrNames) {
    let names = [];
    if (Array.isArray(catalogIdOrNames)) names = catalogIdOrNames;
    else if (typeof catalogIdOrNames === 'string') names = CATALOG_STATE_NAMES[catalogIdOrNames] || [];
    const filter = highlightFilterForNames(names);
    ['german-states-highlight', 'german-states-highlight-fill'].forEach((layerId) => {
      if (!map.getLayer(layerId)) return;
      try { map.setFilter(layerId, filter); } catch (_) {}
      try {
        map.setLayoutProperty(layerId, 'visibility', names.length ? 'visible' : 'none');
      } catch (_) {}
    });
    if (map.getLayer('german-states-outline')) {
      try { map.setLayoutProperty('german-states-outline', 'visibility', 'none'); } catch (_) {}
    }
    return names;
  }

  function showSnapTarget(coord) {
    const src = map.getSource('snap-target');
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coord },
        properties: {}
      }]
    });
  }

  function hideSnapTarget() {
    const src = map.getSource('snap-target');
    if (!src) return;
    src.setData({ type: 'FeatureCollection', features: [] });
  }

  return {
    addDataLayers,
    setDistractionBlending,
    setPvSystemsVisible,
    setAnnotationsVisible,
    highlightGermanState,
    clearGermanStateHighlight,
    setDopCoverageFromCatalog,
    setDopCoverageVisible,
    showSnapTarget,
    hideSnapTarget,
    setAnnotations: (data) => {
      const src = map?.getSource('annotations');
      if (!src) return;
      src.setData(normalizeAnnotationsForPaint(data));
    },
    setSystems: (data) => map?.getSource('systems')?.setData(data)
  };
}

/** True when props mark an Extra/sample fence (label-only, no PV link). */
export function isExtraSampleFenceProps(props) {
  if (!props || typeof props !== 'object') return false;
  const cat = String(props.category || props.type || 'fence').toLowerCase();
  if (cat !== 'fence') return false;
  const sample = props.sample;
  const sampleOn = sample === true || sample === 'true' || sample === 1 || sample === '1';
  if (!sampleOn) return false;
  const link = props.link_systems;
  const explicitlyUnlinked = link === false || link === 'false' || link === 0 || link === '0';
  const areas = props.area_ids || props.pv_system_ids || [];
  const hasPvLink = (Array.isArray(areas) && areas.length > 0)
    || props.area_id != null
    || props.pv_system_id != null;
  // Violet only for true Extra/sample: sample flag + no PV link.
  if (hasPvLink && !explicitlyUnlinked) return false;
  return explicitlyUnlinked || !hasPvLink;
}

/** Stamp string `extra` for reliable MapLibre paint matching. */
function normalizeAnnotationsForPaint(data) {
  const featuresIn = Array.isArray(data?.features)
    ? data.features
    : (Array.isArray(data) ? data : []);
  const features = featuresIn
    .filter((feature) => {
      const props = feature?.properties || {};
      if (props.map_visible === false) return false;
      const vis = String(props.visibility || '').toLowerCase();
      if (vis === 'hidden' || vis === 'excluded') return false;
      return true;
    })
    .map((feature) => {
      const props = { ...(feature?.properties || {}) };
      props.extra = isExtraSampleFenceProps(props) ? 'yes' : 'no';
      const confirms = Number(props.confirms || 0);
      const rejects = Number(props.rejects || 0);
      if (!props.review_status) {
        const pub = props.is_public === true || props.is_public === 'true'
          || String(props.visibility || '').toLowerCase() === 'visible';
        props.review_status = pub ? 'verified' : 'awaiting';
      }
      // MapLibre paint matches strings more reliably than booleans on GeoJSON props.
      props.is_public = props.review_status === 'verified' ? 'true' : 'false';
      return { ...feature, properties: props };
    });
  return {
    type: 'FeatureCollection',
    features,
  };
}
