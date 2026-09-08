// @ts-nocheck
/** Public persistence: Supabase RPCs when configured, localStorage otherwise.

Write payloads sent to Supabase contain only:
  - optional sanitized username
  - user-drawn GeoJSON geometry
  - fixed decisions confirm | reject | needs_changes
  - server UUIDs

Auth: anonymous Supabase sessions via signInAnonymously(); optional local guest id offline.
*/

import { annotationIsPublic, annotationVisibleOnMap } from './vote-rules';
import { assetUrl } from './wms-client';
import {
  authorLabel,
  currentUsernameOrOmit,
  ensureAuthSession,
  localGuestId,
  supabaseConfigured,
  getSupabase,
} from './supabase-client';
import { GUEST_AUTHOR_LABEL, isUuid, displayAuthorName } from './username';
import { isVerifyDecision } from './verify-decisions';
import {
  reportSupabaseReachFailure,
  reportSupabaseReachSuccess,
  registerSyncHooks,
  recomputeConnectionStatus,
} from './connection-status';
import * as turf from '@turf/turf';

const ANN_KEY = 'zaun.public.annotations.v1';
const VOTE_KEY = 'zaun.public.verifications.v1';
const SYS_KEY = 'zaun.public.system-status.v1';
/** Device-local review memory — survives anonymous auth rotation. */
const REVIEWED_KEY = 'zaun.public.reviewed_ids.v1';
/** Device-local authorship memory — skip own fences after anon rotation. */
const OWNED_KEY = 'zaun.public.owned_ids.v1';
const VIEW_LIMIT = 2000;
const VIEW_LIMIT_MAX = 5000;
const WORLD_BOUNDS = { west: -180, south: -85, east: 180, north: 85 };

async function withSupabaseReach(run) {
  try {
    const result = await run();
    reportSupabaseReachSuccess();
    return result;
  } catch (err) {
    reportSupabaseReachFailure();
    throw err;
  }
}

function emptyFc() {
  return { type: 'FeatureCollection', features: [] };
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function featureId(feature) {
  const props = feature?.properties || {};
  return String(props.fence_id || props.id || feature?.id || '');
}

export function boundsFromMap(map) {
  if (!map?.getBounds) return { ...WORLD_BOUNDS };
  const b = map.getBounds();
  return {
    west: b.getWest(),
    south: b.getSouth(),
    east: b.getEast(),
    north: b.getNorth(),
  };
}

function publicGeometry(geometry) {
  if (!geometry || !geometry.type || geometry.coordinates == null) {
    throw new Error('A drawn geometry is required');
  }
  // Persist closed rings as Polygon so fills render for everyone (incl. other clients).
  if (geometry.type === 'LineString') {
    const coords = geometry.coordinates || [];
    if (coords.length >= 4) {
      const a = coords[0];
      const b = coords[coords.length - 1];
      const closed = Array.isArray(a) && Array.isArray(b)
        && Math.abs(Number(a[0]) - Number(b[0])) < 1e-9
        && Math.abs(Number(a[1]) - Number(b[1])) < 1e-9;
      if (closed) {
        return { type: 'Polygon', coordinates: [coords] };
      }
    }
  }
  return { type: geometry.type, coordinates: geometry.coordinates };
}

function unwrapRpc(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

function extractId(data) {
  const row = unwrapRpc(data);
  if (typeof row === 'string' && isUuid(row)) return row;
  if (!row || typeof row !== 'object') return '';
  return String(row.id || row.annotation_id || row.p_annotation_id || '');
}

function localDecisionMap() {
  const rows = readJson(VOTE_KEY, []);
  const mine = localGuestId();
  const map = new Map();
  for (const row of rows) {
    const id = String(row.annotation_id);
    const cur = map.get(id) || { confirms: 0, rejects: 0, needs_changes: 0, mine: '' };
    if (row.decision === 'confirm') cur.confirms += 1;
    if (row.decision === 'reject') cur.rejects += 1;
    if (row.decision === 'needs_changes') cur.needs_changes += 1;
    if (row.user_id === mine) cur.mine = row.decision;
    map.set(id, cur);
  }
  return map;
}

function readReviewedIds() {
  const raw = readJson(REVIEWED_KEY, []);
  return new Set((Array.isArray(raw) ? raw : []).map(String).filter(Boolean));
}

function readOwnedIds() {
  const raw = readJson(OWNED_KEY, []);
  return new Set((Array.isArray(raw) ? raw : []).map(String).filter(Boolean));
}

/** True when this device already voted on an annotation (local memory). */
export function hasLocalReviewDecision(annotationId) {
  const id = String(annotationId || '');
  if (!id) return false;
  if (readReviewedIds().has(id)) return true;
  const local = localDecisionMap().get(id);
  return Boolean(String(local?.mine || '').trim());
}

function annotationAuthoredByMe(props, meLabel) {
  if (props?.is_own === true || props?.is_own === 'true') return true;
  const owned = readOwnedIds();
  const fid = String(props?.fence_id || props?.id || '');
  if (fid && owned.has(fid)) return true;
  const author = displayAuthorName(props?.author_label);
  const me = displayAuthorName(meLabel);
  if (me === GUEST_AUTHOR_LABEL || author === GUEST_AUTHOR_LABEL) return false;
  return Boolean(author && me && author === me);
}

const ANNOTATED_SYSTEM_STATUSES = new Set([
  'verified', 'awaiting', 'pending', 'flagged', 'excluded', 'annotated', 'confirm',
]);

/** Map display in guided annotate: open footprints + this user's claims only. */
export function filterSystemsForAnnotate(systemsFc, meLabel = authorLabel()) {
  if (!systemsFc?.features?.length) return systemsFc || emptyFc();
  return {
    type: 'FeatureCollection',
    features: (systemsFc.features || []).filter((feature) => {
      const props = feature?.properties || {};
      const status = String(props.status || props.fence_status || '').toLowerCase();
      if (status === 'mine' || status === 'yours') return true;
      if (ANNOTATED_SYSTEM_STATUSES.has(status)) return false;
      if (props.annotated === true || props.annotated === 'true') return false;
      if (annotationAuthoredByMe(props, meLabel)) return true;
      return true;
    }),
  };
}

export function rememberOwnedAnnotationId(annotationId) {
  const id = String(annotationId || '');
  if (!id) return;
  const ids = readOwnedIds();
  if (ids.has(id)) return;
  ids.add(id);
  writeJson(OWNED_KEY, [...ids]);
}

function rememberReviewedId(annotationId, decision) {
  const id = String(annotationId || '');
  if (!id) return;
  const ids = readReviewedIds();
  ids.add(id);
  writeJson(REVIEWED_KEY, [...ids]);
  // Mirror into local vote rows so decorateLocal / offline mode stay consistent.
  const mine = localGuestId();
  const rows = readJson(VOTE_KEY, []);
  const next = rows.filter((row) => !(row.annotation_id === id && row.user_id === mine));
  next.push({ annotation_id: id, user_id: mine, decision });
  writeJson(VOTE_KEY, next);
}

/** Allow re-vote after in-session undo (does not delete the server vote). */
export function forgetLocalReview(annotationId) {
  const id = String(annotationId || '');
  if (!id) return;
  const ids = readReviewedIds();
  if (ids.delete(id)) writeJson(REVIEWED_KEY, [...ids]);
  const mine = localGuestId();
  const rows = readJson(VOTE_KEY, []);
  const next = rows.filter((row) => !(row.annotation_id === id && row.user_id === mine));
  if (next.length !== rows.length) writeJson(VOTE_KEY, next);
}

/** Stamp device-local review + authorship memory onto features (anon session can rotate). */
function applyLocalReviewMemory(fc) {
  const reviewed = readReviewedIds();
  const owned = readOwnedIds();
  const decisions = localDecisionMap();
  if (!reviewed.size && !decisions.size && !owned.size) return fc;
  return {
    type: 'FeatureCollection',
    features: (fc?.features || []).map((feature) => {
      const id = featureId(feature);
      if (!id) return feature;
      const props = { ...(feature.properties || {}) };
      const local = decisions.get(id);
      if (!String(props.my_decision || '').trim()) {
        if (local?.mine) props.my_decision = local.mine;
        else if (reviewed.has(id)) props.my_decision = local?.mine || 'confirm';
      }
      if (owned.has(id) && props.is_own !== true) {
        props.is_own = true;
      }
      return { ...feature, properties: props };
    }),
  };
}

function decorateLocal(features, decisionsById) {
  return (features || []).map((feature) => {
    const id = featureId(feature);
    const votes = decisionsById.get(id) || { confirms: 0, rejects: 0, needs_changes: 0, mine: '' };
    const props = feature.properties || (feature.properties = {});
    props.confirms = votes.confirms;
    props.rejects = votes.rejects;
    props.needs_changes = votes.needs_changes;
    props.my_decision = votes.mine;
    props.is_public = annotationIsPublic(votes.confirms, votes.rejects);
    // Pending review stays on the map for everyone; only hard-excluded drop out.
    props.map_visible = annotationVisibleOnMap(votes.confirms, votes.rejects);
    props.review_status = props.is_public
      ? 'verified'
      : props.map_visible
        ? 'awaiting'
        : 'excluded';
    props.author_label = props.author_label || GUEST_AUTHOR_LABEL;
    return feature;
  }).filter((feature) => feature.properties?.map_visible !== false);
}

function enrichRemoteFeature(feature) {
  if (!feature) return null;
  const props = feature.properties || (feature.properties = {});
  const confirms = Number(props.confirms || 0);
  const rejects = Number(props.rejects || 0);
  // Coerce RPC boolean/string is_public / is_own.
  if (props.is_public === 'true') props.is_public = true;
  if (props.is_public === 'false') props.is_public = false;
  if (props.is_own === 'true') props.is_own = true;
  if (props.is_own === 'false') props.is_own = false;
  if (props.is_public == null) {
    props.is_public = annotationIsPublic(confirms, rejects);
  }
  // Tag "visibility" (clear/partial/…) is not the row visibility gate.
  const vis = String(props.visibility || '').toLowerCase();
  if (vis === 'hidden' || vis === 'excluded') {
    props.map_visible = false;
  } else if (props.map_visible == null) {
    props.map_visible = annotationVisibleOnMap(confirms, rejects);
  }
  if (!props.review_status) {
    props.review_status = props.is_public
      ? 'verified'
      : props.map_visible
        ? 'awaiting'
        : 'excluded';
  }
  props.author_label = props.author_label || GUEST_AUTHOR_LABEL;
  return feature;
}

const ROW_VISIBILITY = new Set(['visible', 'pending', 'hidden', 'excluded']);

function isRowVisibilityValue(value) {
  return ROW_VISIBILITY.has(String(value || '').toLowerCase());
}

function mergeAnnotationCollections(...collections) {
  const byId = new Map();
  for (const fc of collections) {
    for (const feature of fc?.features || []) {
      const enriched = enrichRemoteFeature({ ...feature, properties: { ...(feature.properties || {}) } });
      if (!enriched || enriched.properties?.map_visible === false) continue;
      const id = featureId(enriched);
      if (!id) continue;
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, enriched);
        continue;
      }
      const prevProps = prev.properties || {};
      const nextProps = enriched.properties || {};
      // Prefer imagery tags (clear/rural) over DB row visibility ("visible").
      const mergedVisibility = (() => {
        const p = prevProps.visibility;
        const n = nextProps.visibility;
        if (p && !isRowVisibilityValue(p)) return p;
        if (n && !isRowVisibilityValue(n)) return n;
        return n || p;
      })();
      // Later collections win for most fields, but never drop server review fields
      // just because a local cache row omitted them.
      byId.set(id, {
        ...prev,
        ...enriched,
        geometry: enriched.geometry || prev.geometry,
        properties: {
          ...prevProps,
          ...nextProps,
          visibility: mergedVisibility,
          context: nextProps.context || prevProps.context,
          area_id: nextProps.area_id ?? prevProps.area_id,
          is_own: (() => {
            // Prefer an explicit remote boolean when present.
            if (nextProps.is_own === true || nextProps.is_own === 'true') return true;
            if (nextProps.is_own === false || nextProps.is_own === 'false') return false;
            if (prevProps.is_own === true || prevProps.is_own === 'true') return true;
            if (prevProps.is_own === false || prevProps.is_own === 'false') return false;
            return nextProps.is_own ?? prevProps.is_own;
          })(),
          my_decision: String(nextProps.my_decision || prevProps.my_decision || ''),
          confirms: Math.max(Number(nextProps.confirms || 0), Number(prevProps.confirms || 0)),
          rejects: Math.max(Number(nextProps.rejects || 0), Number(prevProps.rejects || 0)),
          needs_changes: Math.max(Number(nextProps.needs_changes || 0), Number(prevProps.needs_changes || 0)),
          review_status: nextProps.review_status || prevProps.review_status,
          fence_id: nextProps.fence_id || prevProps.fence_id || id,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features: [...byId.values()] };
}

function featureFromGeometry(id, geometry, extras = {}) {
  const confirms = Number(extras.confirms || 0);
  const rejects = Number(extras.rejects || 0);
  // extras.visibility may be a DB gate ("visible") OR an imagery tag ("clear").
  // Only the DB gate should decide is_public here.
  const rowVis = isRowVisibilityValue(extras.visibility) ? String(extras.visibility).toLowerCase() : null;
  const isPublic = extras.is_public === true || extras.is_public === 'true'
    ? true
    : extras.is_public === false || extras.is_public === 'false'
      ? false
      : rowVis
        ? rowVis === 'visible' && annotationIsPublic(confirms, rejects)
        : annotationIsPublic(confirms, rejects);
  const mapVisible = extras.map_visible === true || extras.map_visible === 'true'
    ? true
    : extras.map_visible === false || extras.map_visible === 'false'
      ? false
      : annotationVisibleOnMap(confirms, rejects);
  const isOwn = extras.is_own === true || extras.is_own === 'true'
    ? true
    : extras.is_own === false || extras.is_own === 'false'
      ? false
      : undefined;
  return {
    type: 'Feature',
    id: String(id),
    geometry,
    properties: {
      fence_id: String(id),
      author_label: extras.author_label || GUEST_AUTHOR_LABEL,
      // Prefer keeping an imagery tag; fall back to row gate.
      visibility: extras.visibility || (isPublic ? 'visible' : 'pending'),
      created_at: extras.created_at || new Date().toISOString(),
      revision_id: extras.revision_id || null,
      confirms,
      rejects,
      needs_changes: Number(extras.needs_changes || 0),
      my_decision: extras.my_decision || '',
      is_public: isPublic,
      map_visible: mapVisible,
      review_status: extras.review_status || (isPublic ? 'verified' : mapVisible ? 'awaiting' : 'excluded'),
      ...(isOwn !== undefined ? { is_own: isOwn } : {}),
      ...(extras.area_id != null ? { area_id: extras.area_id } : {}),
      ...(extras.extra != null ? { extra: extras.extra } : {}),
      ...(extras.context != null ? { context: extras.context } : {}),
    },
  };
}

function pickProp(row, props, key, aliases = []) {
  if (props[key] != null && props[key] !== '') return props[key];
  if (row[key] != null && row[key] !== '') return row[key];
  for (const alt of aliases) {
    if (props[alt] != null && props[alt] !== '') return props[alt];
    if (row[alt] != null && row[alt] !== '') return row[alt];
  }
  return undefined;
}

export function rowToFeature(row) {
  if (!row) return null;
  if (row.type === 'Feature' && row.geometry) {
    const props = { ...(row.properties || {}) };
    const id = String(props.fence_id || props.id || row.id || '');
    props.fence_id = id;
    props.author_label = props.author_label || row.author_label || GUEST_AUTHOR_LABEL;
    // Surface RPC columns onto props when the Feature wrapper omitted them.
    const areaId = pickProp(row, props, 'area_id', ['footprint_id']);
    if (props.area_id == null && areaId != null) props.area_id = areaId;
    const extra = pickProp(row, props, 'extra');
    if (props.extra == null && extra != null) props.extra = extra;
    const confirms = pickProp(row, props, 'confirms', ['confirm_count']);
    if (confirms != null) props.confirms = Number(confirms);
    const rejects = pickProp(row, props, 'rejects', ['reject_count']);
    if (rejects != null) props.rejects = Number(rejects);
    const needs = pickProp(row, props, 'needs_changes', ['needs_changes_count']);
    if (needs != null) props.needs_changes = Number(needs);
    const myDecision = pickProp(row, props, 'my_decision');
    if (myDecision != null) props.my_decision = myDecision;
    const isPublic = pickProp(row, props, 'is_public');
    if (isPublic != null) props.is_public = isPublic;
    const isOwn = pickProp(row, props, 'is_own');
    if (isOwn != null) props.is_own = isOwn;
    const reviewStatus = pickProp(row, props, 'review_status');
    if (reviewStatus != null) props.review_status = reviewStatus;
    const mapVisible = pickProp(row, props, 'map_visible');
    if (mapVisible != null) props.map_visible = mapVisible;
    const context = pickProp(row, props, 'context');
    if (props.context == null && context != null) props.context = context;
    return { type: 'Feature', id, geometry: row.geometry, properties: props };
  }
  const geometry = row.geometry || row.geom || row.p_geometry;
  if (!geometry) return null;
  const id = String(row.id || row.annotation_id || '');
  const nested = row.properties && typeof row.properties === 'object' ? row.properties : {};
  return featureFromGeometry(id, geometry, {
    author_label: row.author_label || row.username || nested.author_label || GUEST_AUTHOR_LABEL,
    visibility: nested.visibility || row.visibility,
    created_at: row.created_at,
    revision_id: row.revision_id || null,
    confirms: row.confirms ?? row.confirm_count ?? nested.confirms,
    rejects: row.rejects ?? row.reject_count ?? nested.rejects,
    needs_changes: row.needs_changes ?? row.needs_changes_count ?? nested.needs_changes,
    my_decision: row.my_decision || nested.my_decision || '',
    is_public: row.is_public ?? nested.is_public,
    is_own: row.is_own ?? nested.is_own,
    map_visible: row.map_visible ?? nested.map_visible,
    review_status: row.review_status || nested.review_status,
    area_id: row.area_id ?? nested.area_id,
    extra: row.extra ?? nested.extra,
    context: row.context ?? nested.context,
  });
}

function rowsToCollection(data) {
  if (data?.type === 'FeatureCollection') {
    return { type: 'FeatureCollection', features: (data.features || []).map(rowToFeature).filter(Boolean) };
  }
  const rows = Array.isArray(data) ? data : (data ? [data] : []);
  return { type: 'FeatureCollection', features: rows.map(rowToFeature).filter(Boolean) };
}

export function backendMode() {
  return supabaseConfigured() ? 'supabase' : 'local';
}

let systemsCatalogPromise = null;
let systemsCatalogCache = null;
let remoteSystemFlagsPromise = null;
let remoteSystemFlagsCache = null;
/** Serialize concurrent flush calls (connection-status also guards its hook). */
let flushPendingPromise = null;

/** Soft-read shared skip/flag statuses (local-only when RPC unavailable). */
async function loadRemoteSystemFlags() {
  if (remoteSystemFlagsCache) return remoteSystemFlagsCache;
  if (remoteSystemFlagsPromise) return remoteSystemFlagsPromise;
  const sb = getSupabase();
  if (!sb) {
    remoteSystemFlagsCache = {};
    return remoteSystemFlagsCache;
  }
  remoteSystemFlagsPromise = (async () => {
    try {
      return await withSupabaseReach(async () => {
        const { data, error } = await sb.rpc('get_system_flags', { p_limit: 20000 });
        if (error) throw error;
        const map = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        remoteSystemFlagsCache = map;
        return map;
      });
    } catch (_) {
      remoteSystemFlagsCache = {};
      return remoteSystemFlagsCache;
    } finally {
      remoteSystemFlagsPromise = null;
    }
  })();
  return remoteSystemFlagsPromise;
}

/** Single in-flight / cached load of the large PV catalog (Index + MapCanvas share it). */
export async function listSystems() {
  if (systemsCatalogCache) {
    const flags = await loadRemoteSystemFlags();
    return applySystemStatuses(structuredClone(systemsCatalogCache), flags);
  }
  if (!systemsCatalogPromise) {
    systemsCatalogPromise = (async () => {
      const res = await fetch(assetUrl('data/pv_systems.geojson'));
      if (!res.ok) throw new Error(`PV catalog HTTP ${res.status}`);
      const data = await res.json();
      systemsCatalogCache = data;
      return data;
    })().catch((err) => {
      systemsCatalogPromise = null;
      throw err;
    });
  }
  const [data, flags] = await Promise.all([systemsCatalogPromise, loadRemoteSystemFlags()]);
  return applySystemStatuses(structuredClone(data), flags);
}

function applySystemStatuses(data, remoteFlags = {}) {
  const local = readJson(SYS_KEY, {});
  for (const feature of data.features || []) {
    const id = String(feature.properties?.area_id ?? feature.properties?.footprint_id ?? feature.id);
    const remote = remoteFlags?.[id];
    const props = feature.properties || (feature.properties = {});
    // Remote shared flags first; device-local overrides (this device's skip wins).
    if (remote && typeof remote === 'object') {
      if (remote.status) {
        props.status = remote.status;
        props.fence_status = remote.status;
      }
      if (remote.reason != null) props.skip_reason = remote.reason;
      if (remote.author_label) props.annotated_by = remote.author_label;
      if (remote.annotated != null) props.annotated = remote.annotated;
    }
    if (local[id]) Object.assign(props, local[id]);
  }
  return data;
}

export function clearSystemsCatalogCache() {
  systemsCatalogCache = null;
  systemsCatalogPromise = null;
  remoteSystemFlagsCache = null;
  remoteSystemFlagsPromise = null;
}

/**
 * Mark PV systems that already have a linked fence so they stop looking "open"
 * (yellow) for every user — pending → awaiting/mine, verified → verified.
 * Extra/sample fences (no PV link) do not claim a system.
 *
 * Prefer explicit area_id; if missing (legacy rows), claim by spatial intersection.
 */
export function applyAnnotationCoverageToSystems(systemsFc, annotationsFc) {
  if (!systemsFc?.features?.length) return systemsFc || emptyFc();

  const rank = { verified: 4, mine: 3, awaiting: 2, flagged: 1, open: 0 };
  /** @type {Map<string, { status: string, annotated: boolean, author_label?: string }>} */
  const byArea = new Map();

  const me = (() => {
    try {
      return currentUsernameOrOmit() || authorLabel();
    } catch (_) {
      return GUEST_AUTHOR_LABEL;
    }
  })();

  const consider = (areaKey, status, author) => {
    if (!areaKey) return;
    const id = String(areaKey);
    const prev = byArea.get(id);
    if (prev && (rank[prev.status] || 0) >= (rank[status] || 0)) return;
    byArea.set(id, {
      status,
      annotated: status === 'verified' || status === 'mine' || status === 'awaiting',
      author_label: author,
    });
  };

  /** @type {{ id: string, feature: object, bbox: number[] }[]} */
  const systemIndex = [];
  for (const feature of systemsFc.features || []) {
    const id = String(feature?.properties?.area_id ?? feature?.properties?.footprint_id ?? feature?.id ?? '');
    if (!id || !feature?.geometry) continue;
    let box;
    try {
      box = turf.bbox(feature);
    } catch (_) {
      continue;
    }
    systemIndex.push({ id, feature, bbox: box });
  }

  const bboxOverlap = (a, b) =>
    a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

  const areasForAnnotation = (feature) => {
    const props = feature?.properties || {};
    const areaIds = [];
    if (props.area_id != null && props.area_id !== '') areaIds.push(String(props.area_id));
    if (props.footprint_id != null && props.footprint_id !== '') areaIds.push(String(props.footprint_id));
    const list = props.area_ids || props.pv_system_ids;
    if (Array.isArray(list)) list.forEach((a) => { if (a != null && a !== '') areaIds.push(String(a)); });
    if (areaIds.length) return [...new Set(areaIds)];

    // Legacy uploads stored no area_id — claim intersecting PV polygons.
    if (!feature?.geometry || !systemIndex.length) return [];
    let annBbox;
    try {
      annBbox = turf.bbox(feature);
    } catch (_) {
      return [];
    }
    const claimed = [];
    for (const sys of systemIndex) {
      if (!bboxOverlap(annBbox, sys.bbox)) continue;
      try {
        if (turf.booleanIntersects(feature, sys.feature)) claimed.push(sys.id);
      } catch (_) {}
    }
    return claimed;
  };

  for (const feature of annotationsFc?.features || []) {
    const props = feature?.properties || {};
    // Extra / sample helpers are not PV claims.
    const extra = props.extra;
    if (extra === 'yes' || extra === true || extra === 1 || extra === '1') continue;
    if (props.sample === true || props.sample === 'true') continue;
    if (props.link_systems === false || props.link_systems === 'false') continue;

    const areaIds = areasForAnnotation(feature);
    if (!areaIds.length) continue;

    const author = String(props.author_label || '');
    const review = String(props.review_status || '').toLowerCase();
    const isPublic = props.is_public === true || props.is_public === 'true' || review === 'verified';
    let status = 'awaiting';
    if (isPublic || review === 'verified') status = 'verified';
    else if (annotationAuthoredByMe(props, me)) status = 'mine';
    else status = 'awaiting';

    for (const a of areaIds) consider(a, status, author);
  }

  return {
    type: 'FeatureCollection',
    features: (systemsFc.features || []).map((feature) => {
      const props = { ...(feature.properties || {}) };
      const id = String(props.area_id ?? props.footprint_id ?? feature.id ?? '');
      const hit = byArea.get(id);
      if (!hit) return { ...feature, properties: props };

      // Local explicit flag/exclude wins over remote coverage.
      const localStatus = String(props.status || props.fence_status || '').toLowerCase();
      if (localStatus === 'flagged' || localStatus === 'excluded') {
        return { ...feature, properties: props };
      }

      props.annotated = hit.annotated;
      props.status = hit.status;
      props.fence_status = hit.status;
      if (hit.author_label) props.annotated_by = hit.author_label;
      return { ...feature, properties: props };
    }),
  };
}

export async function patchSystemStatus(systemId, payload) {
  const id = String(systemId);
  const statuses = readJson(SYS_KEY, {});
  const prev = statuses[id] || {};
  const next = { ...prev, ...payload };
  statuses[id] = next;
  writeJson(SYS_KEY, statuses);

  const status = String(next.status || next.fence_status || '').toLowerCase();
  if (status === 'flagged' || status === 'excluded' || status === 'open' || status === 'awaiting' || status === 'mine' || status === 'verified') {
    const sb = getSupabase();
    if (sb) {
      try {
        await ensureAuthSession();
        await withSupabaseReach(async () => {
          const { error } = await sb.rpc('upsert_system_flag', {
            p_system_id: id,
            p_status: status,
            p_reason: next.skip_reason != null ? String(next.skip_reason) : null,
          });
          if (error) throw error;
        });
        if (remoteSystemFlagsCache && typeof remoteSystemFlagsCache === 'object') {
          remoteSystemFlagsCache[id] = {
            status,
            reason: next.skip_reason ?? null,
            author_label: next.annotated_by || authorLabel(),
            annotated: status === 'flagged' || status === 'excluded' || status === 'awaiting' || status === 'mine' || status === 'verified',
          };
        }
      } catch (_) {
        // Local status still applied; sync can retry on later loads.
      }
    }
  }

  return { id, ...next };
}

export async function listAnnotations(bounds = WORLD_BOUNDS) {
  migrateLocalAnnotationCache();
  const local = decorateLocal(readJson(ANN_KEY, emptyFc()).features || [], localDecisionMap());
  const localFc = { type: 'FeatureCollection', features: local };
  const sb = getSupabase();
  if (sb) {
    // Soft-read: no anonymous sign-in — that happens on first capture (save).
    // p_include_pending=true → awaiting + verified for map browse (violet / lime).
    try {
      return await withSupabaseReach(async () => {
        const { data, error } = await sb.rpc('get_annotations_in_view', {
          p_west: Number(bounds.west),
          p_south: Number(bounds.south),
          p_east: Number(bounds.east),
          p_north: Number(bounds.north),
          p_limit: Math.min(VIEW_LIMIT, VIEW_LIMIT_MAX),
          p_include_pending: true,
        });
        if (error) throw error;
        const remote = rowsToCollection(data);
        remote.features = (remote.features || []).map(enrichRemoteFeature).filter(Boolean);
        // Remote hits clear local pending flags for the same ids.
        try {
          const remoteIds = new Set((remote.features || []).map(featureId).filter(Boolean));
          const stored = readJson(ANN_KEY, emptyFc());
          let changed = false;
          for (const f of stored.features || []) {
            const id = featureId(f);
            if (!id || !remoteIds.has(id)) continue;
            if (f.properties?.sync_state !== 'synced') {
              stampSync(f, 'synced');
              changed = true;
            }
          }
          if (changed) {
            writeJson(ANN_KEY, stored);
            recomputeConnectionStatus();
          }
        } catch (_) {}
        // Local first, remote second — remote wins on id clash (keeps is_own / my_decision).
        return applyLocalReviewMemory(mergeAnnotationCollections(localFc, remote));
      });
    } catch (_) {
      return applyLocalReviewMemory(localFc);
    }
  }
  return applyLocalReviewMemory(localFc);
}

/** Count fences authored by the current user (local + soft remote sample). */
export async function countMyAnnotations() {
  const mine = authorLabel();
  const guest = GUEST_AUTHOR_LABEL;
  const local = readJson(ANN_KEY, emptyFc());
  const localCount = (local.features || []).filter((f) => {
    const a = f?.properties?.author_label;
    return a === mine || (!mine && a === guest);
  }).length;

  const sb = getSupabase();
  if (!sb) return localCount;

  try {
    const remote = await listAnnotations(WORLD_BOUNDS);
    const remoteMine = (remote.features || []).filter((f) => {
      const a = f?.properties?.author_label;
      return a && (a === mine || a === currentUsernameOrOmit());
    }).length;
    return Math.max(localCount, remoteMine);
  } catch (_) {
    return localCount;
  }
}

function upsertLocalAnnotation(feature) {
  if (!feature) return;
  const stored = readJson(ANN_KEY, emptyFc());
  const id = featureId(feature);
  const next = (stored.features || []).filter((item) => featureId(item) !== id);
  next.push(feature);
  writeJson(ANN_KEY, { type: 'FeatureCollection', features: next });
  try { recomputeConnectionStatus(); } catch (_) {}
}

/** Replace one local row — never wipes the rest of the cache. */
function replaceLocalAnnotation(oldId, feature) {
  if (!feature) return;
  const stored = readJson(ANN_KEY, emptyFc());
  const newId = featureId(feature);
  const next = (stored.features || []).filter((item) => {
    const id = featureId(item);
    if (oldId && id === String(oldId)) return false;
    if (newId && id === newId) return false;
    return true;
  });
  next.push(feature);
  writeJson(ANN_KEY, { type: 'FeatureCollection', features: next });
}

function stampSync(feature, state) {
  if (!feature) return feature;
  const props = feature.properties || (feature.properties = {});
  props.sync_state = state;
  if (state === 'synced') delete props.sync_error;
  return feature;
}

function isLocalOnlyId(id) {
  const s = String(id || '');
  if (!s) return true;
  if (isUuid(s)) return false;
  return s.startsWith('ann_') || s.startsWith('local_');
}

function isPendingLocalFeature(feature) {
  const props = feature?.properties || {};
  if (props.sync_state === 'pending') return true;
  if (props.sync_state === 'synced') return false;
  return isLocalOnlyId(featureId(feature));
}

/**
 * Stamp legacy cache rows after reload. Never deletes geometry —
 * only labels pending vs already-synced mirrors.
 */
export function migrateLocalAnnotationCache() {
  const stored = readJson(ANN_KEY, emptyFc());
  const features = stored.features || [];
  if (!features.length) return stored;
  let changed = false;
  const owned = readOwnedIds();
  let ownedChanged = false;
  for (const feature of features) {
    const props = feature.properties || (feature.properties = {});
    const id = featureId(feature);
    // Local annotation cache only holds fences this device authored.
    if (id && !owned.has(id)) {
      owned.add(id);
      ownedChanged = true;
    }
    if (props.sync_state === 'pending' || props.sync_state === 'synced') continue;
    if (isLocalOnlyId(id)) {
      props.sync_state = 'pending';
      changed = true;
    } else if (isUuid(id)) {
      props.sync_state = 'synced';
      changed = true;
    } else {
      props.sync_state = 'pending';
      changed = true;
    }
  }
  if (ownedChanged) writeJson(OWNED_KEY, [...owned]);
  if (changed) writeJson(ANN_KEY, { type: 'FeatureCollection', features });
  return readJson(ANN_KEY, emptyFc());
}

/** True when localStorage still holds fences that never made it to Supabase. */
export function hasUnsyncedAnnotations() {
  migrateLocalAnnotationCache();
  const stored = readJson(ANN_KEY, emptyFc());
  return (stored.features || []).some(isPendingLocalFeature);
}

export function countPendingAnnotations() {
  migrateLocalAnnotationCache();
  const stored = readJson(ANN_KEY, emptyFc());
  return (stored.features || []).filter(isPendingLocalFeature).length;
}

function buildLocalPendingFeature(geometry, clientProps, existingId = '') {
  const id = existingId || `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    type: 'Feature',
    id,
    geometry,
    properties: {
      ...clientProps,
      author_label: clientProps.author_label || authorLabel(),
      created_at: clientProps.created_at || new Date().toISOString(),
      fence_id: String(id),
      sync_state: 'pending',
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload one pending local fence per call so reloads / probes drain the
 * backlog gradually. Cache survives reload; only the uploaded row is replaced.
 */
export async function flushPendingAnnotations() {
  if (flushPendingPromise) return flushPendingPromise;
  flushPendingPromise = flushPendingAnnotationsOnce().finally(() => {
    flushPendingPromise = null;
  });
  return flushPendingPromise;
}

async function flushPendingAnnotationsOnce() {
  const sb = getSupabase();
  if (!sb || !supabaseConfigured()) {
    return { uploaded: 0, remaining: countPendingAnnotations() };
  }

  migrateLocalAnnotationCache();
  const stored = readJson(ANN_KEY, emptyFc());
  const pending = (stored.features || [])
    .filter(isPendingLocalFeature)
    .sort((a, b) => {
      const ta = Date.parse(a?.properties?.created_at || 0) || 0;
      const tb = Date.parse(b?.properties?.created_at || 0) || 0;
      return ta - tb;
    });

  if (!pending.length) {
    recomputeConnectionStatus();
    return { uploaded: 0, remaining: 0 };
  }

  const item = pending[0];
  const existingId = featureId(item);
  let uploaded = 0;
  try {
    await ensureAuthSession();
    const geometry = publicGeometry(item.geometry);
    const clientProps = { ...(item.properties || {}) };
    delete clientProps.sync_error;
    delete clientProps.sync_state;

    await withSupabaseReach(async () => {
      const args = { p_geometry: geometry };
      const username = currentUsernameOrOmit();
      if (username) args.p_username = username;
      if (clientProps.area_id != null && clientProps.extra !== 'yes') {
        args.p_area_id = clientProps.area_id;
      }
      if (clientProps.extra === 'yes' || clientProps.sample === true) {
        args.p_extra = true;
        args.p_sample = true;
      }
      let data;
      let error;
      ({ data, error } = await sb.rpc('create_annotation', args));
      if (error && /p_area_id|p_extra|p_sample|unexpected|could not find/i.test(String(error.message || ''))) {
        ({ data, error } = await sb.rpc('create_annotation', {
          p_geometry: geometry,
          ...(username ? { p_username: username } : {}),
        }));
      }
      if (error) throw error;
      const created = unwrapRpc(data);
      const id = extractId(created) || extractId(data);
      const feature = rowToFeature(created) || featureFromGeometry(id, geometry, {
        author_label: username || GUEST_AUTHOR_LABEL,
        ...clientProps,
      });
      stampSync(feature, 'synced');
      if (feature?.properties) {
        Object.assign(feature.properties, clientProps, {
          fence_id: String(feature.properties.fence_id || id),
          sync_state: 'synced',
        });
      }
      replaceLocalAnnotation(existingId, feature);
      rememberOwnedAnnotationId(featureId(feature) || id || existingId);
    });
    uploaded = 1;
    await sleep(400);
    try {
      window.dispatchEvent(new CustomEvent('zaun:annotations-changed'));
    } catch (_) {}
  } catch (err) {
    try {
      const props = item.properties || (item.properties = {});
      props.sync_state = 'pending';
      props.sync_error = err instanceof Error ? err.message : String(err);
      replaceLocalAnnotation(existingId, item);
    } catch (_) {}
  }

  recomputeConnectionStatus();
  return { uploaded, remaining: countPendingAnnotations() };
}

export async function saveAnnotation(payload) {
  await ensureAuthSession();
  const geometry = publicGeometry(payload.geometry);
  const existingId = String(payload.id || payload.properties?.fence_id || '');
  const clientProps = { ...(payload.properties || {}) };
  const sb = getSupabase();
  if (sb) {
    try {
      return await withSupabaseReach(async () => {
        if (isUuid(existingId)) {
          const { data, error } = await sb.rpc('propose_annotation_edit', {
            p_annotation_id: existingId,
            p_geometry: geometry,
          });
          if (error) throw error;
          const feature = rowToFeature(unwrapRpc(data)) || featureFromGeometry(existingId, geometry, {
            author_label: clientProps.author_label || authorLabel(),
            ...clientProps,
          });
          if (feature?.properties) Object.assign(feature.properties, clientProps, feature.properties);
          stampSync(feature, 'synced');
          upsertLocalAnnotation(feature);
          rememberOwnedAnnotationId(featureId(feature) || existingId);
          return feature;
        }
        const args = { p_geometry: geometry };
        const username = currentUsernameOrOmit();
        if (username) args.p_username = username;
        // Best-effort metadata — older RPCs ignore unknown args; retry bare on failure.
        if (clientProps.area_id != null && clientProps.extra !== 'yes') {
          args.p_area_id = clientProps.area_id;
        }
        if (clientProps.extra === 'yes' || clientProps.sample === true) {
          args.p_extra = true;
          args.p_sample = true;
        }
        let data;
        let error;
        ({ data, error } = await sb.rpc('create_annotation', args));
        if (error && /p_area_id|p_extra|p_sample|unexpected|could not find/i.test(String(error.message || ''))) {
          ({ data, error } = await sb.rpc('create_annotation', {
            p_geometry: geometry,
            ...(username ? { p_username: username } : {}),
          }));
        }
        if (error) throw error;
        const created = unwrapRpc(data);
        const id = extractId(created) || extractId(data);
        const feature = rowToFeature(created) || featureFromGeometry(id, geometry, {
          author_label: username || GUEST_AUTHOR_LABEL,
          ...clientProps,
        });
        // Keep client stamps (extra / area_id) for map paint even if RPC omits them.
        if (feature?.properties) {
          Object.assign(feature.properties, clientProps, {
            fence_id: String(feature.properties.fence_id || id),
            author_label: feature.properties.author_label || username || GUEST_AUTHOR_LABEL,
          });
        }
        stampSync(feature, 'synced');
        upsertLocalAnnotation(feature);
        rememberOwnedAnnotationId(featureId(feature) || id);
        return feature;
      });
    } catch (err) {
      // Keep the fence locally so work isn't lost; dot stays red until flush.
      const feature = buildLocalPendingFeature(geometry, {
        ...clientProps,
        sync_error: err instanceof Error ? err.message : String(err),
      }, existingId);
      upsertLocalAnnotation(feature);
      rememberOwnedAnnotationId(featureId(feature));
      return feature;
    }
  }

  const feature = buildLocalPendingFeature(geometry, clientProps, existingId);
  upsertLocalAnnotation(feature);
  rememberOwnedAnnotationId(featureId(feature));
  return decorateLocal([feature], localDecisionMap())[0];
}

export async function deleteAnnotation(annotationId) {
  await ensureAuthSession();
  if (getSupabase()) {
    throw new Error('Remote annotations cannot be deleted from the client.');
  }
  const stored = readJson(ANN_KEY, emptyFc());
  writeJson(ANN_KEY, {
    type: 'FeatureCollection',
    features: (stored.features || []).filter((item) => featureId(item) !== String(annotationId)),
  });
}

export async function verifyAnnotation(annotationId, decision, revisionId, comment) {
  if (!isVerifyDecision(decision)) {
    throw new Error('Decision must be confirm, reject, or needs_changes');
  }
  await ensureAuthSession();
  const note = comment != null ? String(comment).trim().slice(0, 200) : '';
  const sb = getSupabase();
  if (sb) {
    return withSupabaseReach(async () => {
      const args = {
        p_annotation_id: String(annotationId),
        p_decision: decision,
      };
      if (revisionId && isUuid(revisionId)) args.p_revision_id = revisionId;
      const { error } = await sb.rpc('verify_annotation', args);
      if (error) throw error;
      // Vote landed — remember locally even if the follow-up list read fails.
      rememberReviewedId(annotationId, decision);
      if (note) {
        try {
          const uid = (await sb.auth.getUser()).data?.user?.id;
          if (uid) {
            await sb
              .from('annotation_verifications')
              .update({ comment: note })
              .eq('annotation_id', String(annotationId))
              .eq('user_id', uid);
          }
        } catch (_) {
          /* comment is best-effort; decision already saved */
        }
      }
      try {
        return await listAnnotations();
      } catch (_) {
        return applyLocalReviewMemory(readJson(ANN_KEY, emptyFc()));
      }
    });
  }
  rememberReviewedId(annotationId, decision);
  const rows = readJson(VOTE_KEY, []);
  if (note) {
    const mine = localGuestId();
    const hit = rows.find((row) => row.annotation_id === String(annotationId) && row.user_id === mine);
    if (hit) hit.comment = note;
    writeJson(VOTE_KEY, rows);
  }
  return listAnnotations();
}

/** @deprecated use verifyAnnotation */
export async function castVote(annotationId, value) {
  return verifyAnnotation(annotationId, value === -1 ? 'reject' : 'confirm');
}

export async function publicGeoJSON(bounds = WORLD_BOUNDS) {
  const all = await listAnnotations(bounds);
  if (backendMode() === 'supabase') return all;
  return {
    type: 'FeatureCollection',
    features: (all.features || []).filter((feature) => feature.properties?.is_public),
  };
}

export function normalizeLeaderboardRow(row, index = 0) {
  return {
    username: displayAuthorName(row?.username || row?.author_label || row?.display_name),
    points: Number(row?.points ?? row?.score ?? row?.credits ?? row?.count ?? 0),
    rank: Number(row?.rank ?? index + 1),
  };
}

export function leaderboardFromAnnotations(features) {
  const counts = new Map();
  for (const feature of features || []) {
    if (feature?.properties && feature.properties.is_public === false) continue;
    const name = displayAuthorName(feature.properties?.author_label);
    const cur = counts.get(name) || { username: name, points: 0 };
    cur.points += 1;
    counts.set(name, cur);
  }
  return [...counts.values()]
    .sort((a, b) => b.points - a.points)
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

export async function fetchLeaderboard(limit = 100) {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.rpc('get_leaderboard', {
        p_limit: Math.min(Math.max(1, Number(limit) || 100), 100),
      });
      if (error) throw error;
      // Merge duplicate Guest / blank rows from the RPC into one line.
      const merged = new Map();
      for (const raw of Array.isArray(data) ? data : []) {
        const row = normalizeLeaderboardRow(raw);
        const cur = merged.get(row.username) || { username: row.username, points: 0 };
        cur.points += row.points;
        merged.set(row.username, cur);
      }
      return [...merged.values()]
        .sort((a, b) => b.points - a.points)
        .map((row, idx) => ({ ...row, rank: idx + 1 }));
    } catch (_) {
      return [];
    }
  }
  const stored = readJson(ANN_KEY, emptyFc());
  return leaderboardFromAnnotations(decorateLocal(stored.features || [], localDecisionMap()));
}

registerSyncHooks({
  hasUnsynced: hasUnsyncedAnnotations,
  flushPending: flushPendingAnnotations,
});

// Ensure legacy local rows are stamped pending/synced on first module load.
try {
  migrateLocalAnnotationCache();
} catch (_) {}
