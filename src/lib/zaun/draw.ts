// @ts-nocheck — incremental strict typing; CDN map libs typed loosely for migration.
/* fency Draw Module — MapboxDraw Instance Management & Hotkeys */

import MapboxDraw from '@mapbox/mapbox-gl-draw';
import * as turf from '@turf/turf';

/**
 * Mapbox Draw's stock draw_line_string.onTrash deletes the whole in-progress
 * feature. Override so Trash / Backspace / "Remove last point" only pops the
 * last committed vertex and keeps drawing.
 */
export function buildAnnotationDrawModes() {
  const baseModes = MapboxDraw?.modes || {};
  const baseDrawLine = baseModes.draw_line_string || {};

  return {
    ...baseModes,
    draw_line_string: {
      ...baseDrawLine,
      onTrash(state) {
        // currentVertexPosition points at the live cursor slot. <=1 means at
        // most one committed click — clear and leave simple_select so the
        // caller can restart a fresh draw_line_string session.
        if (!state?.line || state.currentVertexPosition <= 1) {
          try {
            if (state?.line?.id != null) {
              this.deleteFeature([state.line.id], { silent: true });
            }
          } catch (_) {}
          this.changeMode('simple_select');
          return;
        }

        const removeAt = state.currentVertexPosition - 1;
        try {
          state.line.removeCoordinate(String(removeAt));
        } catch (_) {
          this.deleteFeature([state.line.id], { silent: true });
          this.changeMode('simple_select');
          return;
        }
        state.currentVertexPosition = removeAt;
      }
    }
  };
}

export const DrawModule = (() => {
  let map = null;
  let draw = null;
  let activeSelectedFeatureId = null;
  let activeState = 'OVERVIEW';
  let showSnapTarget = () => {};
  let hideSnapTarget = () => {};
  // Spec: soft magnetic snap within ~8px. Use a slightly larger hitbox for
  // finding candidates, then still require screen distance <= SNAP_PX.
  const SNAP_PX = 10;
  const SNAP_QUERY_PAD = 14;
  let ignoreResumeUntil = 0;

  function init(mapInstance, drawInstance, snapRenderer = {}) {
    map = mapInstance;
    draw = drawInstance;
    showSnapTarget = snapRenderer.showSnapTarget || (() => {});
    hideSnapTarget = snapRenderer.hideSnapTarget || (() => {});
    wireEventListeners();
  }

  function setActiveState(state) {
    activeState = state;
    if (state === 'ANNOTATION') {
      enterAnnotationMode();
    } else if (state === 'EDIT') {
      // Same draw tooling as annotate; caller loads geometry then continueDrawingFromFeature().
      hideSnapTarget();
      syncDrawingClass();
    } else {
      exitAnnotationMode();
    }
  }

  function isAnnotationDrawing() {
    if ((activeState !== 'ANNOTATION' && activeState !== 'EDIT') || !draw) return false;
    if (rectActive) return true;
    try {
      const mode = draw.getMode();
      return mode === 'draw_line_string' || mode === 'draw_polygon';
    } catch (_) {
      return false;
    }
  }

  function isAnnotationActive() {
    return activeState === 'ANNOTATION' || activeState === 'EDIT';
  }

  function isEditSession() {
    return activeState === 'EDIT'
      || document.getElementById('edit-action-bar')?.hidden === false;
  }

  function syncDrawingClass() {
    const root = map?.getContainer?.();
    if (!root) return;
    root.classList.toggle('annotation-drawing', isAnnotationDrawing());
  }

  /** Always tear down and re-enter draw_line_string so Save&Next is drawable. */
  function forceDrawLineString() {
    stopRectangleDrag();
    if (!draw) return;
    try {
      if (draw.getMode() !== 'simple_select') {
        draw.changeMode('simple_select');
      }
    } catch (_) {}
    try {
      draw.changeMode('draw_line_string');
    } catch (e) {
      console.warn('Failed to enter draw_line_string mode:', e);
    }
    syncDrawingClass();
  }

  /** Enter stock MapboxDraw polygon mode (bulk no-fence AOI). */
  function forceDrawPolygon() {
    stopRectangleDrag();
    if (!draw) return;
    try {
      if (draw.getMode() !== 'simple_select') {
        draw.changeMode('simple_select');
      }
    } catch (_) {}
    try {
      draw.changeMode('draw_polygon');
    } catch (e) {
      console.warn('Failed to enter draw_polygon mode:', e);
    }
    syncDrawingClass();
  }

  // ── Drag-rectangle for empty / no-fence areas ────────────────────────────
  let rectActive = false;
  let rectStart = null; // { lng, lat }
  let rectMoveHandler = null;
  let rectUpHandler = null;
  let rectDownHandler = null;
  const RECT_SOURCE = 'zaun-nofence-rect-draft';
  const RECT_FILL = 'zaun-nofence-rect-fill';
  const RECT_LINE = 'zaun-nofence-rect-line';

  function rectFeature(a, b) {
    const west = Math.min(a.lng, b.lng);
    const east = Math.max(a.lng, b.lng);
    const south = Math.min(a.lat, b.lat);
    const north = Math.max(a.lat, b.lat);
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [west, south], [east, south], [east, north], [west, north], [west, south],
        ]],
      },
    };
  }

  function ensureRectLayers() {
    if (!map?.getSource) return;
    if (!map.getSource(RECT_SOURCE)) {
      map.addSource(RECT_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!map.getLayer(RECT_FILL)) {
      map.addLayer({
        id: RECT_FILL,
        type: 'fill',
        source: RECT_SOURCE,
        paint: { 'fill-color': '#3fb950', 'fill-opacity': 0.18 },
      });
    }
    if (!map.getLayer(RECT_LINE)) {
      map.addLayer({
        id: RECT_LINE,
        type: 'line',
        source: RECT_SOURCE,
        paint: { 'line-color': '#3fb950', 'line-width': 2 },
      });
    }
  }

  function setRectDraft(feature) {
    ensureRectLayers();
    const src = map?.getSource?.(RECT_SOURCE);
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: feature ? [feature] : [],
    });
  }

  function stopRectangleDrag() {
    rectActive = false;
    rectStart = null;
    if (map && rectMoveHandler) {
      map.off('mousemove', rectMoveHandler);
      map.off('touchmove', rectMoveHandler);
    }
    if (map && rectUpHandler) {
      map.off('mouseup', rectUpHandler);
      map.off('touchend', rectUpHandler);
    }
    if (map && rectDownHandler) {
      map.off('mousedown', rectDownHandler);
      map.off('touchstart', rectDownHandler);
    }
    rectMoveHandler = rectUpHandler = rectDownHandler = null;
    try { setRectDraft(null); } catch (_) {}
    try { map?.dragPan?.enable?.(); } catch (_) {}
  }

  /** Drag a rectangle on the map; commits a Polygon into MapboxDraw and fires draw.create. */
  function forceDrawRectangle() {
    if (!map || !draw) return;
    stopRectangleDrag();
    try {
      if (draw.getMode() !== 'simple_select') draw.changeMode('simple_select');
    } catch (_) {}
    rectActive = true;
    ensureRectLayers();
    syncDrawingClass();

    rectDownHandler = (e) => {
      if (!rectActive) return;
      if (e.originalEvent?.button != null && e.originalEvent.button !== 0) return;
      rectStart = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      try { map.dragPan.disable(); } catch (_) {}
      e.preventDefault?.();
    };
    rectMoveHandler = (e) => {
      if (!rectActive || !rectStart) return;
      setRectDraft(rectFeature(rectStart, e.lngLat));
    };
    rectUpHandler = (e) => {
      if (!rectActive || !rectStart) return;
      const end = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      const feat = rectFeature(rectStart, end);
      const ring = feat.geometry.coordinates[0];
      const bigEnough = Math.abs(ring[0][0] - ring[1][0]) > 1e-7
        && Math.abs(ring[0][1] - ring[2][1]) > 1e-7;
      rectStart = null;
      setRectDraft(null);
      try { map.dragPan.enable(); } catch (_) {}
      if (!bigEnough) return;
      try {
        const ids = draw.add(feat);
        const id = Array.isArray(ids) ? ids[0] : ids;
        // Match MapboxDraw's create event so guided auto-save can run.
        map.fire('draw.create', {
          features: [{ ...feat, id }],
        });
      } catch (err) {
        console.warn('Failed to commit rectangle:', err);
      }
    };
    map.on('mousedown', rectDownHandler);
    map.on('touchstart', rectDownHandler);
    map.on('mousemove', rectMoveHandler);
    map.on('touchmove', rectMoveHandler);
    map.on('mouseup', rectUpHandler);
    map.on('touchend', rectUpHandler);
    map.on('touchcancel', rectUpHandler);
  }

  function isRectangleMode() {
    return rectActive;
  }

  /**
   * Continue draw_line_string from an existing feature endpoint.
   * Only used when a feature is explicitly selected / being edited — never to
   * auto-start a blank point after finishing a line.
   */
  function continueDrawingFromFeature(featureOrId, fromCoord = null) {
    if (!draw) return false;
    const id = featureOrId && typeof featureOrId === 'object'
      ? featureOrId.id
      : featureOrId;
    if (id == null) return false;

    let feature = null;
    try { feature = draw.get(String(id)); } catch (_) {}
    if (!feature) {
      feature = draw.getAll().features.find((item) => String(item.id) === String(id)) || null;
    }
    if (!feature?.geometry) return false;

    let from = Array.isArray(fromCoord) && fromCoord.length >= 2 ? fromCoord : null;
    if (!from) {
      if (feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates || [];
        if (!coords.length) return false;
        from = coords[coords.length - 1];
      } else if (feature.geometry.type === 'Polygon') {
        const ring = feature.geometry.coordinates?.[0] || [];
        if (ring.length >= 2) from = ring[ring.length - 2] || ring[ring.length - 1];
      }
    }
    if (!Array.isArray(from) || from.length < 2) return false;

    try {
      draw.changeMode('draw_line_string', {
        featureId: String(feature.id),
        from: { type: 'Point', coordinates: [from[0], from[1]] }
      });
      activeSelectedFeatureId = feature.id;
      syncDrawingClass();
      return true;
    } catch (error) {
      console.warn('Failed to continue draw_line_string from feature:', error);
      return false;
    }
  }

  function selectFinishedFeatures(featureIds) {
    if (!draw) return;
    const ids = (Array.isArray(featureIds) ? featureIds : [featureIds])
      .filter((id) => id != null)
      .map(String);
    if (!ids.length) {
      try { draw.changeMode('simple_select'); } catch (_) {}
      syncDrawingClass();
      return;
    }
    activeSelectedFeatureId = ids[ids.length - 1];
    try {
      draw.changeMode('simple_select', { featureIds: ids });
    } catch (_) {
      try { draw.changeMode('simple_select'); } catch (_) {}
    }
    hideSnapTarget();
    syncDrawingClass();
  }

  /** Start a brand-new LineString (independent fence), optionally seeded at coord. */
  function startNewLine(fromCoord = null) {
    if (!draw) return false;
    if (!Array.isArray(fromCoord) || fromCoord.length < 2) {
      forceDrawLineString();
      return true;
    }
    const seed = [fromCoord[0], fromCoord[1]];
    try {
      try { draw.changeMode('simple_select'); } catch (_) {}
      const added = draw.add({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [seed] }
      });
      const newId = added?.[0];
      if (newId == null) {
        forceDrawLineString();
        return false;
      }
      draw.changeMode('draw_line_string', {
        featureId: String(newId),
        from: { type: 'Point', coordinates: seed }
      });
      activeSelectedFeatureId = newId;
      syncDrawingClass();
      return true;
    } catch (error) {
      console.warn('startNewLine failed, falling back to blank draw:', error);
      forceDrawLineString();
      return false;
    }
  }

  /**
   * Insert a vertex on an existing LineString at the nearest edge point.
   * Does not split the feature — safe for training labels.
   */
  function insertVertexOnLine(feature, mouseLngLat, point) {
    if (!draw || !feature?.geometry || feature.geometry.type !== 'LineString') return false;
    if (typeof turf === 'undefined') return false;
    const coords = (feature.geometry.coordinates || []).map((c) => [c[0], c[1]]);
    if (coords.length < 2) return false;

    // Prefer existing vertices — caller should attach/continue instead.
    for (const vertex of coords) {
      if (screenDist(vertex, point) <= SNAP_PX) return false;
    }

    let best = null;
    for (let i = 0; i < coords.length - 1; i += 1) {
      try {
        const segment = turf.lineString([coords[i], coords[i + 1]]);
        const nearest = turf.nearestPointOnLine(
          segment,
          turf.point([mouseLngLat.lng, mouseLngLat.lat])
        );
        const coord = nearest?.geometry?.coordinates;
        if (!coord) continue;
        const dist = screenDist(coord, point);
        if (dist <= SNAP_PX && dist < (best?.dist ?? Infinity)) {
          best = { dist, coord: [coord[0], coord[1]], insertAt: i + 1 };
        }
      } catch (_) {}
    }
    if (!best) return false;

    coords.splice(best.insertAt, 0, best.coord);
    if (!setFeatureCoordinates(feature.id, coords)) return false;
    activeSelectedFeatureId = feature.id;
    try {
      draw.changeMode('direct_select', { featureId: String(feature.id) });
    } catch (_) {
      selectFinishedFeatures([feature.id]);
    }
    syncDrawingClass();
    return true;
  }

  function nearestVertexOnFeature(feature, point) {
    if (!feature?.geometry) return null;
    let coords = [];
    if (feature.geometry.type === 'LineString') coords = feature.geometry.coordinates || [];
    else if (feature.geometry.type === 'Polygon') coords = feature.geometry.coordinates?.[0] || [];
    let best = null;
    for (const coord of coords) {
      if (!coord) continue;
      const dist = screenDist(coord, point);
      if (dist <= SNAP_PX && dist < (best?.dist ?? Infinity)) {
        best = { coord: [coord[0], coord[1]], dist };
      }
    }
    return best;
  }

  function enterAnnotationMode() {
    if (!draw) return;
    // Mapbox Draw can report draw_line_string while its internal line is gone —
    // bounce mode, and retry until the control is ready (map load / remount).
    const arm = (attempt = 0) => {
      if (!draw) return;
      try {
        forceDrawLineString();
        if (draw.getMode() === "draw_line_string") return;
      } catch (_) {}
      if (attempt < 12) setTimeout(() => arm(attempt + 1), 100 + attempt * 50);
    };
    setTimeout(() => arm(0), 50);
  }

  function exitAnnotationMode() {
    stopRectangleDrag();
    if (!draw) return;
    try {
      draw.changeMode('simple_select');
    } catch (_) {}
    hideSnapTarget();
    syncDrawingClass();
  }

  function getTotalCoordinates() {
    if (!draw) return 0;
    const all = draw.getAll().features;
    let total = 0;
    all.forEach(f => {
      if (f.geometry && f.geometry.coordinates) {
        if (f.geometry.type === 'LineString') total += f.geometry.coordinates.length;
        else if (f.geometry.type === 'Polygon') total += (f.geometry.coordinates[0]?.length || 0);
      }
    });
    return total;
  }

  function checkClosure() {
    if (!draw) return false;
    const feats = draw.getAll().features;
    if (!feats || !feats.length) return false;
    const last = feats[feats.length - 1];
    if (!last || last.geometry.type !== 'LineString') return false;
    const coords = last.geometry.coordinates;
    if (coords.length < 3) return false;
    const start = coords[0];
    const end = coords[coords.length - 1];
    return Math.abs(start[0] - end[0]) < 1e-9 && Math.abs(start[1] - end[1]) < 1e-9;
  }

  function updateClosureBadge(isClosed) {
    const badge = document.getElementById('guided-closure-badge');
    if (!badge) return;
    if (isClosed) {
      badge.textContent = 'Outline closed — ready to save';
      badge.className = 'badge-closure closed';
    } else {
      badge.textContent = '';
      badge.className = 'badge-closure open';
    }
  }

  function popLastVertexFromFeature(feat) {
    if (!feat || !feat.geometry) return false;

    if (feat.geometry.type === 'LineString') {
      const coords = feat.geometry.coordinates;
      if (coords.length > 2) {
        coords.pop();
        feat.geometry.coordinates = coords;
        draw.add(feat);
        return true;
      } else {
        if (feat.id) draw.delete(feat.id);
        return false;
      }
    } else if (feat.geometry.type === 'Polygon') {
      const coords = feat.geometry.coordinates[0];
      if (coords.length > 4) {
        coords.splice(coords.length - 2, 1);
        feat.geometry.coordinates[0] = coords;
        draw.add(feat);
        return true;
      } else {
        if (feat.id) draw.delete(feat.id);
        return false;
      }
    }
    return false;
  }

  function deleteActiveOrSelectedFeature() {
    if (!draw) return;

    const mode = draw.getMode();

    if (mode === 'draw_line_string') {
      // Custom draw_line_string.onTrash pops one vertex (not the whole line).
      draw.trash();
      // If the in-progress line was cleared, stay idle — do not auto-start a
      // blank point unless/until a finished feature is selected again.
      try {
        if (
          (activeState === 'ANNOTATION' || activeState === 'EDIT')
          && draw.getMode() !== 'draw_line_string'
        ) {
          const remaining = draw.getAll().features;
          const last = remaining?.length ? remaining[remaining.length - 1] : null;
          if (last?.id != null) selectFinishedFeatures([last.id]);
          else selectFinishedFeatures([]);
        }
      } catch (_) {}
      hideSnapTarget();
      updateClosureBadge(checkClosure());
      syncDrawingClass();
      return;
    }

    // Editing an existing annotation (direct_select): trash only the selected
    // vertex. Never pop the line tip + continueDrawing — that "ate" fences.
    if (mode === 'direct_select' || activeState === 'EDIT') {
      try { draw.trash(); } catch (_) {}
      hideSnapTarget();
      updateClosureBadge(checkClosure());
      syncDrawingClass();
      return;
    }

    // Selected finished outline in guided draw: pop last vertex, then resume
    // from the new end only because a feature is selected.
    const selected = draw.getSelected();
    let target = null;
    if (selected?.features?.length) {
      target = selected.features[selected.features.length - 1];
    } else if (activeSelectedFeatureId) {
      target = draw.getAll().features.find(f => String(f.id) === String(activeSelectedFeatureId)) || null;
    }

    if (!target) {
      // Nothing selected → do not start a new floating point.
      updateClosureBadge(checkClosure());
      syncDrawingClass();
      return;
    }

    const featureId = target.id;
    const stillThere = popLastVertexFromFeature(target);
    if (stillThere && featureId != null) {
      activeSelectedFeatureId = featureId;
      setTimeout(() => {
        if (!continueDrawingFromFeature(featureId)) {
          selectFinishedFeatures([featureId]);
        }
        syncDrawingClass();
      }, 0);
    } else {
      activeSelectedFeatureId = null;
      selectFinishedFeatures([]);
    }
    hideSnapTarget();
    updateClosureBadge(checkClosure());
    syncDrawingClass();
  }

  function screenDist(a, point) {
    try {
      const px = map.project(a);
      return Math.hypot(px.x - point.x, px.y - point.y);
    } catch (_) {
      return Infinity;
    }
  }

  function nearestOtherEndpoint(featureId, point) {
    let nearest = null;
    let distance = Infinity;
    let ownerId = null;
    draw.getAll().features.forEach(feature => {
      if (String(feature.id) === String(featureId) || feature.geometry?.type !== 'LineString') return;
      const coords = feature.geometry.coordinates || [];
      [coords[0], coords[coords.length - 1]].forEach(endpoint => {
        if (!endpoint) return;
        const d = screenDist(endpoint, point);
        if (d < distance) {
          distance = d;
          nearest = endpoint;
          ownerId = feature.id;
        }
      });
    });
    if (distance > SNAP_PX) return null;
    return { coord: nearest, featureId: ownerId };
  }

  function coordsEqual(a, b, eps = 1e-7) {
    if (!a || !b) return false;
    return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
  }

  function dedupeCoords(coords) {
    const out = [];
    for (const c of coords || []) {
      if (!Array.isArray(c) || c.length < 2) continue;
      const point = [c[0], c[1]];
      const prev = out[out.length - 1];
      if (!prev || !coordsEqual(prev, point)) out.push(point);
    }
    return out;
  }

  function findSharedEndpoint(coordsA, coordsB) {
    if (!coordsA?.length || !coordsB?.length) return null;
    const endsA = [coordsA[0], coordsA[coordsA.length - 1]];
    const endsB = [coordsB[0], coordsB[coordsB.length - 1]];
    for (const a of endsA) {
      for (const b of endsB) {
        if (coordsEqual(a, b)) return [a[0], a[1]];
      }
    }
    return null;
  }

  function mergeLineStringsAtJunction(primaryCoords, otherCoords, junction) {
    const p = dedupeCoords(primaryCoords);
    const o = dedupeCoords(otherCoords);
    if (p.length < 2 || o.length < 2 || !junction) return null;

    const pStart = p[0];
    const pEnd = p[p.length - 1];
    const oStart = o[0];
    const oEnd = o[o.length - 1];
    const pAtStart = coordsEqual(pStart, junction);
    const pAtEnd = coordsEqual(pEnd, junction);
    const oAtStart = coordsEqual(oStart, junction);
    const oAtEnd = coordsEqual(oEnd, junction);

    if (pAtEnd && oAtStart) return dedupeCoords([...p, ...o.slice(1)]);
    if (pAtEnd && oAtEnd) return dedupeCoords([...p, ...o.slice(0, -1).reverse()]);
    if (pAtStart && oAtEnd) return dedupeCoords([...o, ...p.slice(1)]);
    if (pAtStart && oAtStart) return dedupeCoords([...o.slice().reverse(), ...p.slice(1)]);
    return null;
  }

  function tryMergeOtherFeatureAtPoint(currentFeature, junctionCoord) {
    if (!draw || !currentFeature?.id || !junctionCoord) return false;
    let currentCoords = dedupeCoords(currentFeature.geometry?.coordinates || []);
    let merged = false;

    for (const other of draw.getAll().features) {
      if (String(other.id) === String(currentFeature.id)) continue;
      if (other.geometry?.type !== 'LineString') continue;
      const otherCoords = other.geometry.coordinates || [];
      if (otherCoords.length < 2) continue;
      const oStart = otherCoords[0];
      const oEnd = otherCoords[otherCoords.length - 1];
      if (!coordsEqual(oStart, junctionCoord) && !coordsEqual(oEnd, junctionCoord)) continue;

      const mergedCoords = mergeLineStringsAtJunction(currentCoords, otherCoords, junctionCoord);
      if (!mergedCoords || mergedCoords.length < 2) continue;
      currentCoords = mergedCoords;
      try { draw.delete(other.id); } catch (_) {}
      merged = true;
    }

    if (!merged) return false;
    setFeatureCoordinates(currentFeature.id, currentCoords);
    activeSelectedFeatureId = currentFeature.id;
    return true;
  }

  function mergeAllConnectedDrawLines() {
    if (!draw) return;
    let changed = true;
    while (changed) {
      changed = false;
      const features = draw.getAll().features.filter((f) => f.geometry?.type === 'LineString');
      outer: for (let i = 0; i < features.length; i += 1) {
        for (let j = i + 1; j < features.length; j += 1) {
          const a = features[i];
          const b = features[j];
          // Never glue Extra (sample) lines onto PV-linked lines — they save differently.
          if (!drawExtraStampsCompatible(a, b)) continue;
          const junction = findSharedEndpoint(a.geometry.coordinates, b.geometry.coordinates);
          if (!junction) continue;
          const merged = mergeLineStringsAtJunction(a.geometry.coordinates, b.geometry.coordinates, junction);
          if (!merged || merged.length < 2) continue;
          setFeatureCoordinates(a.id, merged);
          // Keep a definitive Extra stamp when either side was stamped.
          const stamp = drawExtraStamp(a) || drawExtraStamp(b);
          if (stamp) {
            try { draw.setFeatureProperty(a.id, 'extra', stamp); } catch (_) {}
          }
          try { draw.delete(b.id); } catch (_) {}
          changed = true;
          break outer;
        }
      }
    }
  }

  /** 'yes' | 'no' | null (unstamped). */
  function drawExtraStamp(feature) {
    const raw = feature?.properties?.extra;
    if (raw === 'yes' || raw === true || raw === 1 || raw === '1') return 'yes';
    if (raw === 'no' || raw === false || raw === 0 || raw === '0') return 'no';
    return null;
  }

  function drawExtraStampsCompatible(a, b) {
    const sa = drawExtraStamp(a);
    const sb = drawExtraStamp(b);
    if (sa == null || sb == null) return true;
    return sa === sb;
  }

  function stampCreatedFeaturesExtra(features) {
    if (!draw) return;
    const nofence = document.body.dataset.nofenceAoi === '1';
    if (nofence) return;
    const isExtra = document.body.dataset.extraFence === '1'
      || document.body.dataset.sampleFence === '1';
    const value = isExtra ? 'yes' : 'no';
    for (const feature of features || []) {
      if (feature?.id == null) continue;
      if (feature.geometry?.type !== 'LineString') continue;
      try {
        draw.setFeatureProperty(feature.id, 'extra', value);
      } catch (_) {}
    }
  }

  function findDrawLineVertexHit(point) {
    let best = null;
    for (const feature of draw.getAll().features) {
      if (feature.geometry?.type !== 'LineString') continue;
      const hit = nearestVertexOnFeature(feature, point);
      if (!hit) continue;
      if (!best || hit.dist < best.dist) {
        best = { feature, coord: hit.coord, dist: hit.dist };
      }
    }
    return best;
  }

  function pushRingCandidates(ring, mouseLngLat, verticesOut, edgeOut) {
    if (!Array.isArray(ring) || ring.length < 2) return;
    for (const coord of ring) {
      if (Array.isArray(coord) && coord.length >= 2) verticesOut.push(coord);
    }
    if (typeof turf === 'undefined') return;
    try {
      const line = turf.lineString(ring);
      const snapped = turf.nearestPointOnLine(line, turf.point([mouseLngLat.lng, mouseLngLat.lat]));
      if (snapped?.geometry?.coordinates) edgeOut.push(snapped.geometry.coordinates);
    } catch (_) {}
  }

  function collectGeometryCandidates(feature, mouseLngLat, verticesOut, edgeOut) {
    const geom = feature?.geometry;
    if (!geom) return;
    if (geom.type === 'Point') {
      verticesOut.push(geom.coordinates);
    } else if (geom.type === 'MultiPoint') {
      (geom.coordinates || []).forEach((c) => verticesOut.push(c));
    } else if (geom.type === 'LineString') {
      pushRingCandidates(geom.coordinates, mouseLngLat, verticesOut, edgeOut);
    } else if (geom.type === 'MultiLineString') {
      (geom.coordinates || []).forEach((line) => pushRingCandidates(line, mouseLngLat, verticesOut, edgeOut));
    } else if (geom.type === 'Polygon') {
      (geom.coordinates || []).forEach((ring) => pushRingCandidates(ring, mouseLngLat, verticesOut, edgeOut));
    } else if (geom.type === 'MultiPolygon') {
      (geom.coordinates || []).forEach((poly) => {
        (poly || []).forEach((ring) => pushRingCandidates(ring, mouseLngLat, verticesOut, edgeOut));
      });
    }
  }

  function nearestAmong(candidates, point, threshold = SNAP_PX) {
    let nearest = null;
    let distance = Infinity;
    for (const coord of candidates) {
      if (!coord) continue;
      const d = screenDist(coord, point);
      if (d < distance) {
        distance = d;
        nearest = coord;
      }
    }
    return distance <= threshold ? nearest : null;
  }

  function collectSnapRefFeatures(currentFeature = null) {
    const out = [];
    const seen = new Set();
    const push = (feature) => {
      if (!feature?.geometry) return;
      const key = String(feature.id ?? feature.properties?.fence_id ?? feature.properties?.area_id ?? JSON.stringify(feature.geometry.coordinates?.[0]));
      if (seen.has(key)) return;
      if (currentFeature && feature.id != null && String(feature.id) === String(currentFeature.id)) return;
      seen.add(key);
      out.push(feature);
    };

    try {
      (map.querySourceFeatures('annotations') || []).forEach(push);
    } catch (_) {}
    try {
      (map.querySourceFeatures('systems') || []).forEach(push);
    } catch (_) {}
    try {
      (draw?.getAll()?.features || []).forEach(push);
    } catch (_) {}
    return out;
  }

  function toLineFeature(feature) {
    const geom = feature?.geometry;
    if (!geom) return null;
    try {
      if (geom.type === 'LineString' || geom.type === 'MultiLineString') return feature;
      if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
        return typeof turf.polygonToLine === 'function' ? turf.polygonToLine(feature) : feature;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Snap to line intersections without splitting existing fences.
   * Only places a vertex on the *new* drawing at the crossing coordinate —
   * safe for training labels (shared coincident point / T-junction).
   */
  function nearestIntersectionSnap(point, mouseLngLat, currentFeature = null) {
    if (!map || typeof turf === 'undefined' || typeof turf.lineIntersect !== 'function') return null;

    const mouse = [mouseLngLat.lng, mouseLngLat.lat];
    const refs = collectSnapRefFeatures(currentFeature);
    if (!refs.length) return null;

    const candidates = [];

    let lastCommit = null;
    if (currentFeature?.geometry?.type === 'LineString') {
      const coords = currentFeature.geometry.coordinates || [];
      if (coords.length >= 2) lastCommit = coords[coords.length - 2];
      else if (coords.length === 1) lastCommit = coords[0];
    }

    // 1) Where the active rubber-band segment crosses an existing fence/system outline.
    if (lastCommit) {
      let activeSeg = null;
      try {
        activeSeg = turf.lineString([lastCommit, mouse]);
      } catch (_) {}
      if (activeSeg) {
        refs.forEach((feature) => {
          const line = toLineFeature(feature);
          if (!line) return;
          try {
            const hits = turf.lineIntersect(activeSeg, line);
            (hits.features || []).forEach((hit) => {
              const coord = hit.geometry?.coordinates;
              if (coord) candidates.push(coord);
            });
          } catch (_) {}
        });
      }
    }

    // 2) Existing fence/system junctions near the cursor (inner↔outer / connected fences).
    const nearby = [];
    refs.forEach((feature) => {
      const line = toLineFeature(feature);
      if (!line) return;
      try {
        const probe = line.type === 'FeatureCollection' ? line.features[0] : line;
        if (!probe) return;
        const nearest = turf.nearestPointOnLine(probe, turf.point(mouse));
        const coord = nearest?.geometry?.coordinates;
        if (coord && screenDist(coord, point) <= SNAP_QUERY_PAD * 3) nearby.push(line);
      } catch (_) {}
    });

    const limited = nearby.slice(0, 14);
    for (let i = 0; i < limited.length; i += 1) {
      for (let j = i + 1; j < limited.length; j += 1) {
        try {
          const hits = turf.lineIntersect(limited[i], limited[j]);
          (hits.features || []).forEach((hit) => {
            const coord = hit.geometry?.coordinates;
            if (coord) candidates.push(coord);
          });
        } catch (_) {}
      }
    }

    // Slightly looser threshold so crossings are easy to catch while drawing.
    return nearestAmong(candidates, point, SNAP_PX * 1.35);
  }

  function nearestLayerGeometrySnap(point, mouseLngLat) {
    if (!map) return null;
    // Prefer outline layers — fill hits make giant polygons dominate the query.
    const layers = ['systems-line', 'annotations-line', 'systems-fill', 'annotations-fill']
      .filter((id) => map.getLayer(id));
    if (!layers.length) return null;

    let features = [];
    try {
      features = map.queryRenderedFeatures(
        [
          [point.x - SNAP_QUERY_PAD, point.y - SNAP_QUERY_PAD],
          [point.x + SNAP_QUERY_PAD, point.y + SNAP_QUERY_PAD]
        ],
        { layers }
      );
    } catch (_) {
      return null;
    }
    if (!features.length) return null;

    const vertices = [];
    const edges = [];
    features.forEach((f) => collectGeometryCandidates(f, mouseLngLat, vertices, edges));

    // Prefer exact vertices (corners / annotation nodes) over edge midpoints.
    return {
      vertex: nearestAmong(vertices, point),
      edge: nearestAmong(edges, point)
    };
  }

  function findSnapTarget(point, mouseLngLat, currentFeature = null) {
    const candidates = [];

    if (currentFeature?.geometry?.type === 'LineString') {
      const coords = currentFeature.geometry.coordinates || [];
      // Need at least two committed points (+ live cursor) before closing.
      if (coords.length >= 3) {
        const start = coords[0];
        if (screenDist(start, point) <= SNAP_PX) {
          candidates.push({ coord: start, priority: 0 });
        }
      }
      const other = nearestOtherEndpoint(currentFeature.id, point);
      if (other) candidates.push({ coord: other.coord, priority: 1, mergeFeatureId: other.featureId });
    }

    const layerSnap = nearestLayerGeometrySnap(point, mouseLngLat) || {};
    if (layerSnap.vertex) candidates.push({ coord: layerSnap.vertex, priority: 2 });

    const intersection = nearestIntersectionSnap(point, mouseLngLat, currentFeature);
    if (intersection) candidates.push({ coord: intersection, priority: 3 });

    if (layerSnap.edge) candidates.push({ coord: layerSnap.edge, priority: 4 });

    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return screenDist(a.coord, point) - screenDist(b.coord, point);
    });
    return candidates[0];
  }

  function applySnapResult(snapResult) {
    const snapCoord = snapResult?.coord || snapResult;
    if (!snapCoord || !draw) return false;
    const applied = applySnapToLatestVertex(snapCoord);
    if (!applied) return false;

    const feats = draw.getAll()?.features || [];
    const feat = feats[feats.length - 1];
    if (feat) tryMergeOtherFeatureAtPoint(feat, snapCoord);
    return true;
  }

  function setFeatureCoordinates(featureId, coordinates) {
    if (!draw || featureId == null || !Array.isArray(coordinates)) return false;

    // Prefer Mapbox Draw's live store feature so draw_line_string state stays in sync.
    try {
      const storeFeature = draw._ctx?.store?.get?.(String(featureId));
      if (storeFeature?.setCoordinates) {
        storeFeature.setCoordinates(coordinates);
        try { draw._ctx.store.featureChanged?.(String(featureId)); } catch (_) {}
        try {
          if (typeof draw._ctx.store.render === 'function') draw._ctx.store.render();
          else draw._ctx.map?.fire?.('draw.render');
        } catch (_) {}
        return true;
      }
    } catch (_) {}

    try {
      const feat = draw.get(String(featureId));
      if (!feat?.geometry) return false;
      draw.add({
        ...feat,
        geometry: {
          ...feat.geometry,
          coordinates
        }
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Magnetize only the live cursor vertex while hovering a snap target. */
  function applySnapToCursorVertex(snapCoord) {
    if (!draw || !snapCoord || draw.getMode() !== 'draw_line_string') return false;
    const feats = draw.getAll().features;
    if (!feats.length) return false;
    const feat = feats[feats.length - 1];
    if (!feat?.geometry || feat.geometry.type !== 'LineString') return false;
    const coords = (feat.geometry.coordinates || []).map((c) => [c[0], c[1]]);
    if (!coords.length) return false;
    coords[coords.length - 1] = [snapCoord[0], snapCoord[1]];
    return setFeatureCoordinates(feat.id, coords);
  }

  /**
   * After Mapbox Draw commits a click, rewrite the placed vertex (and cursor)
   * to the snap coordinate. Previously we only moved the cursor slot, so the
   * committed point stayed unsnapped.
   */
  function applySnapToLatestVertex(snapCoord) {
    if (!draw || !snapCoord) return false;
    const feats = draw.getAll().features;
    if (!feats.length) return false;
    const feat = feats[feats.length - 1];
    if (!feat?.geometry || feat.geometry.type !== 'LineString') return false;
    const coords = (feat.geometry.coordinates || []).map((c) => [c[0], c[1]]);
    if (!coords.length) return false;

    if (draw.getMode() === 'draw_line_string' && coords.length >= 2) {
      coords[coords.length - 2] = [snapCoord[0], snapCoord[1]];
      coords[coords.length - 1] = [snapCoord[0], snapCoord[1]];
    } else {
      coords[coords.length - 1] = [snapCoord[0], snapCoord[1]];
    }
    return setFeatureCoordinates(feat.id, coords);
  }

  function wireEventListeners() {
    if (!map) return;

    map.on('contextmenu', (e) => {
      if (activeState !== 'ANNOTATION' || !draw) return;
      const hits = map.queryRenderedFeatures(e.point).filter(f =>
        f.layer && (f.layer.id.startsWith('gl-draw') || f.layer.id.startsWith('draw') || f.layer.id.includes('annotation'))
      );
      if (hits.length > 0) {
        e.preventDefault();
        const hitId = hits[0].properties?.id || hits[0].id;
        const allFeats = draw.getAll().features;
        const targetFeat = allFeats.find(f => String(f.id) === String(hitId)) || allFeats[0];
        if (targetFeat) {
          activeSelectedFeatureId = targetFeat.id;
          try {
            draw.changeMode('direct_select', { featureId: targetFeat.id });
          } catch (_) {}
          syncDrawingClass();
        }
      }
    });

    // Capture-phase: stop Mapbox Draw's default trash/key handlers from also
    // firing (would pop two vertices or delete the feature twice).
    document.addEventListener('click', (e) => {
      if (!e.target.closest?.('.mapbox-gl-draw_trash')) return;
      if (activeState !== 'ANNOTATION' && activeState !== 'EDIT') return;
      e.preventDefault();
      e.stopPropagation();
      deleteActiveOrSelectedFeature();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (activeState !== 'ANNOTATION' && activeState !== 'EDIT') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Backspace' || e.key === 'Delete' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        e.stopPropagation();
        deleteActiveOrSelectedFeature();
      }
    }, true);

    // Mapbox Draw listens on keyup for trash — block it so we don't double-pop.
    document.addEventListener('keyup', (e) => {
      if (activeState !== 'ANNOTATION' && activeState !== 'EDIT') return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    const handleSnapPointer = (e) => {
      if (!isAnnotationDrawing()) {
        hideSnapTarget();
        return;
      }
      const allDraw = draw.getAll();
      const feat = allDraw.features.length ? allDraw.features[allDraw.features.length - 1] : null;
      const snap = findSnapTarget(e.point, e.lngLat, feat);
      if (snap?.coord) {
        showSnapTarget(snap.coord);
        applySnapToCursorVertex(snap.coord);
        return;
      }
      hideSnapTarget();
    };

    map.on('mousemove', handleSnapPointer);
    map.on('touchmove', handleSnapPointer);

    map.on('click', (e) => {
      if (!(activeState === 'ANNOTATION' || activeState === 'EDIT') || !draw) return;

      // While drawing: only rewrite snapped vertices. Finishing is Mapbox Draw's
      // "click the last point again" behavior (already highlighted on hover).
      if (isAnnotationDrawing()) {
        const allDraw = draw.getAll();
        const feat = allDraw.features.length ? allDraw.features[allDraw.features.length - 1] : null;
        const snap = findSnapTarget(e.point, e.lngLat, feat);
        if (!snap?.coord) return;

        setTimeout(() => {
          if (!isAnnotationDrawing()) return;
          if (applySnapResult(snap)) {
            const closed = checkClosure();
            updateClosureBadge(closed);
            if (closed) {
              // Snap-close to start finishes the ring and keeps it selected.
              const id = feat?.id ?? draw.getAll().features.at(-1)?.id;
              ignoreResumeUntil = Date.now() + 400;
              selectFinishedFeatures(id != null ? [id] : []);
            }
            hideSnapTarget();
          }
        }, 0);
        return;
      }

      if (Date.now() < ignoreResumeUntil) return;
      // Never intercept direct_select — vertex drag/edit must reach Mapbox Draw.
      const mode = draw.getMode();
      if (mode !== 'simple_select') return;

      const selected = draw.getSelected()?.features || [];
      let target = selected[0] || null;
      if (!target && activeSelectedFeatureId != null) {
        target = draw.getAll().features.find((f) => String(f.id) === String(activeSelectedFeatureId)) || null;
      }

      // 1) Click a vertex on any in-progress line → continue that same line
      //    (one LineString), instead of spawning a separate attached segment.
      const vertexHit = findDrawLineVertexHit(e.point);
      if (vertexHit) {
        e.preventDefault?.();
        continueDrawingFromFeature(vertexHit.feature, vertexHit.coord);
        return;
      }

      // 2) Click the line edge (not a vertex) → insert a new point on that line.
      if (target?.geometry?.type === 'LineString') {
        if (insertVertexOnLine(target, e.lngLat, e.point)) {
          e.preventDefault?.();
          return;
        }
      }

      // 3) Bulk no-fence AOI mode uses polygons — do not spawn a fence line.
      if (document.body.dataset.nofenceAoi === '1') {
        e.preventDefault?.();
        try { draw.changeMode('draw_polygon'); } catch (_) {}
        syncDrawingClass();
        return;
      }

      // 4) Did not choose a point on the line → start a fresh independent line.
      e.preventDefault?.();
      startNewLine();
    });

    map.on('draw.create', (event) => {
      // Stamp Extra/PV before merge so connected lines of different kinds stay separate.
      stampCreatedFeaturesExtra(event?.features || []);
      mergeAllConnectedDrawLines();
      // Finish gesture (click last point) → keep selection, do NOT spawn a new point.
      ignoreResumeUntil = Date.now() + 400;
      setTimeout(() => {
        const createdIds = (event?.features || []).map((f) => f.id).filter((id) => id != null);
        const fallbackId = draw.getAll().features.at(-1)?.id;
        selectFinishedFeatures(createdIds.length ? createdIds : (fallbackId != null ? [fallbackId] : []));
        updateClosureBadge(checkClosure());
      }, 0);
    });

    map.on('draw.modechange', () => syncDrawingClass());
    map.on('draw.render', () => updateClosureBadge(checkClosure()));
  }

  return {
    init,
    setActiveState,
    enterAnnotationMode,
    exitAnnotationMode,
    forceDrawLineString,
    forceDrawPolygon,
    forceDrawRectangle,
    stopRectangleDrag,
    isRectangleMode,
    continueDrawingFromFeature,
    isAnnotationDrawing,
    isAnnotationActive,
    deleteActiveOrSelectedFeature,
    checkClosure,
    updateClosureBadge,
    mergeAllConnectedDrawLines,
    getTotalCoordinates,
    getFeatures: () => (draw ? draw.getAll() : { type: 'FeatureCollection', features: [] }),
    setFeatures: (geojson) => {
      if (!draw) return;
      draw.deleteAll();
      if (geojson && geojson.features) draw.set(geojson);
    },
    clearAll: () => {
      if (draw) draw.deleteAll();
    }
  };
})();
