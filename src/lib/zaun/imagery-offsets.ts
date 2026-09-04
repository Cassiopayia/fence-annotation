// @ts-nocheck — per-source geometry calibration (translation + scale) for misaligned basemaps.
import * as turf from '@turf/turf';
import { getActiveImagerySource } from './imagery-layers';

const SCALE_EPS = 1e-9;
const ZERO_EPS = 1e-12;

export const CALIBRATION_SCALE_MIN = 0.7;
export const CALIBRATION_SCALE_MAX = 1.3;
export const CALIBRATION_SCALE_STEP = 0.002;

function nearZero(value) {
  return Math.abs(value) < ZERO_EPS;
}

function nearOne(value) {
  return Math.abs(value - 1) < SCALE_EPS;
}

export function clampCalibrationScale(scale) {
  const n = Number(scale);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(CALIBRATION_SCALE_MAX, Math.max(CALIBRATION_SCALE_MIN, n));
}

export function normalizeOffsets(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    const dlng = Number(value.dlng) || 0;
    const dlat = Number(value.dlat) || 0;
    const scale = Number(value.scale);
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    if (!Number.isFinite(dlng) || !Number.isFinite(dlat)) continue;
    if (nearZero(dlng) && nearZero(dlat) && nearOne(safeScale)) continue;
    const entry = { dlng, dlat };
    if (!nearOne(safeScale)) entry.scale = safeScale;
    out[String(key)] = entry;
  }
  return out;
}

export function getImageryOffset(props = {}, targetSource) {
  if (!targetSource) return null;
  const ref = props.imagery_source;
  if (ref && String(targetSource) === String(ref)) return null;
  const offsets = normalizeOffsets(props.imagery_offsets);
  if (!offsets) return null;
  const key = String(targetSource);
  if (offsets[key]) return offsets[key];
  if (key.startsWith('wms:')) {
    const alt = `wms-${key.slice(4)}`;
    return offsets[alt] || null;
  }
  if (key.startsWith('wms-')) {
    const alt = `wms:${key.slice(4)}`;
    return offsets[alt] || null;
  }
  return null;
}

export function translateCoordinates(coords, dlng, dlat) {
  if (!Array.isArray(coords)) return coords;
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return [coords[0] + dlng, coords[1] + dlat, ...coords.slice(2)];
  }
  return coords.map((part) => translateCoordinates(part, dlng, dlat));
}

export function translateGeometry(geometry, dlng, dlat) {
  if (!geometry || (!dlng && !dlat)) return geometry;
  const clone = JSON.parse(JSON.stringify(geometry));
  if (clone.coordinates) {
    clone.coordinates = translateCoordinates(clone.coordinates, dlng, dlat);
  }
  return clone;
}

export function scaleCoordinates(coords, cx, cy, scale) {
  if (!Array.isArray(coords)) return coords;
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return [cx + (coords[0] - cx) * scale, cy + (coords[1] - cy) * scale, ...coords.slice(2)];
  }
  return coords.map((part) => scaleCoordinates(part, cx, cy, scale));
}

export function scaleGeometry(geometry, scale, origin = null) {
  if (!geometry || nearOne(scale)) return geometry;
  const [cx, cy] = origin || geometryCentroid(geometry);
  const clone = JSON.parse(JSON.stringify(geometry));
  if (clone.coordinates) {
    clone.coordinates = scaleCoordinates(clone.coordinates, cx, cy, scale);
  }
  return clone;
}

export function applyImageryOffset(geometry, props = {}, targetSource = null) {
  const source = targetSource ?? getActiveImagerySource();
  const offset = getImageryOffset(props, source);
  if (!offset) return geometry;
  const scale = Number(offset.scale);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const scaled = scaleGeometry(geometry, safeScale);
  return translateGeometry(scaled, offset.dlng, offset.dlat);
}

export function featureForDisplay(feature, targetSource = null) {
  if (!feature?.geometry) return feature;
  const source = targetSource ?? getActiveImagerySource();
  const displayGeom = applyImageryOffset(feature.geometry, feature.properties || {}, source);
  return {
    ...feature,
    geometry: displayGeom,
    properties: {
      ...(feature.properties || {}),
      _display_source: source
    }
  };
}

export function featureCollectionForDisplay(features, targetSource = null) {
  const source = targetSource ?? getActiveImagerySource();
  return {
    type: 'FeatureCollection',
    features: (features || []).map((feature) => featureForDisplay(feature, source))
  };
}

export function geometryCentroid(geometry) {
  try {
    return turf.centroid({ type: 'Feature', geometry }).geometry.coordinates;
  } catch (_) {
    return [0, 0];
  }
}

export function computeCentroidOffset(fromGeometry, toGeometry) {
  const [fx, fy] = geometryCentroid(fromGeometry);
  const [tx, ty] = geometryCentroid(toGeometry);
  return { dlng: tx - fx, dlat: ty - fy };
}

export function setImageryOffset(offsets, source, dlng, dlat, scale = 1) {
  const merged = { ...normalizeOffsets(offsets) };
  const key = String(source);
  const safeScale = clampCalibrationScale(scale);
  if (nearZero(dlng) && nearZero(dlat) && nearOne(safeScale)) {
    delete merged[key];
  } else {
    const entry = { dlng, dlat };
    if (!nearOne(safeScale)) entry.scale = safeScale;
    merged[key] = entry;
  }
  return merged;
}

export function getCalibrationScale(props = {}, targetSource = null) {
  const source = targetSource ?? getActiveImagerySource();
  const offset = getImageryOffset(props, source);
  const scale = Number(offset?.scale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function isCalibratingForActiveSource(props = {}) {
  const ref = props.imagery_source;
  const active = getActiveImagerySource();
  return Boolean(ref && active && String(ref) !== String(active));
}

export function formatCalibrationScale(scale) {
  const pct = Math.round((clampCalibrationScale(scale) - 1) * 1000) / 10;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}
