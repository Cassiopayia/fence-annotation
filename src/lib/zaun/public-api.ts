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
import { GUEST_AUTHOR_LABEL, isUuid } from './username';
import { isVerifyDecision } from './verify-decisions';
import {
  reportSupabaseReachFailure,
  reportSupabaseReachSuccess,
} from './connection-status';

const ANN_KEY = 'zaun.public.annotations.v1';
const VOTE_KEY = 'zaun.public.verifications.v1';
const SYS_KEY = 'zaun.public.system-status.v1';
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
  if (props.is_public == null) {
    props.is_public = annotationIsPublic(confirms, rejects);
  }
  // Server may mark visibility; still show pending on the map unless hard-excluded / hidden.
  const vis = String(props.visibility || '').toLowerCase();
  if (vis === 'hidden' || vis === 'excluded') {
    props.map_visible = false;
  } else if (props.map_visible == null) {
    props.map_visible = annotationVisibleOnMap(confirms, rejects);
  }
  if (!props.review_status) {
    props.review_status = props.is_public || vis === 'visible'
      ? 'verified'
      : props.map_visible
        ? 'awaiting'
        : 'excluded';
  }
  props.author_label = props.author_label || GUEST_AUTHOR_LABEL;
  return feature;
}

function mergeAnnotationCollections(...collections) {
  const byId = new Map();
  for (const fc of collections) {
    for (const feature of fc?.features || []) {
      const enriched = enrichRemoteFeature({ ...feature, properties: { ...(feature.properties || {}) } });
      if (!enriched || enriched.properties?.map_visible === false) continue;
      const id = featureId(enriched);
      if (!id) continue;
      byId.set(id, enriched);
    }
  }
  return { type: 'FeatureCollection', features: [...byId.values()] };
}

function featureFromGeometry(id, geometry, extras = {}) {
  const confirms = Number(extras.confirms || 0);
  const rejects = Number(extras.rejects || 0);
  const isPublic = extras.visibility
    ? extras.visibility === 'visible'
    : annotationIsPublic(confirms, rejects);
  const mapVisible = annotationVisibleOnMap(confirms, rejects);
  return {
    type: 'Feature',
    id: String(id),
    geometry,
    properties: {
      fence_id: String(id),
      author_label: extras.author_label || GUEST_AUTHOR_LABEL,
      visibility: extras.visibility || (isPublic ? 'visible' : 'pending'),
      created_at: extras.created_at || new Date().toISOString(),
      revision_id: extras.revision_id || null,
      confirms,
      rejects,
      needs_changes: Number(extras.needs_changes || 0),
      my_decision: extras.my_decision || '',
      is_public: isPublic,
      map_visible: mapVisible,
      review_status: isPublic ? 'verified' : mapVisible ? 'awaiting' : 'excluded',
      ...(extras.area_id != null ? { area_id: extras.area_id } : {}),
      ...(extras.extra != null ? { extra: extras.extra } : {}),
      ...(extras.context != null ? { context: extras.context } : {}),
    },
  };
}

export function rowToFeature(row) {
  if (!row) return null;
  if (row.type === 'Feature' && row.geometry) {
    const props = { ...(row.properties || {}) };
    const id = String(props.fence_id || props.id || row.id || '');
    props.fence_id = id;
    props.author_label = props.author_label || row.author_label || GUEST_AUTHOR_LABEL;
    return { type: 'Feature', id, geometry: row.geometry, properties: props };
  }
  const geometry = row.geometry || row.geom || row.p_geometry;
  if (!geometry) return null;
  const id = String(row.id || row.annotation_id || '');
  return featureFromGeometry(id, geometry, {
    author_label: row.author_label || row.username || GUEST_AUTHOR_LABEL,
    visibility: row.visibility,
    created_at: row.created_at,
    revision_id: row.revision_id || null,
    confirms: row.confirms ?? row.confirm_count,
    rejects: row.rejects ?? row.reject_count,
    needs_changes: row.needs_changes ?? row.needs_changes_count,
    my_decision: row.my_decision || '',
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

export async function listSystems() {
  const res = await fetch(assetUrl('data/pv_systems.geojson'));
  if (!res.ok) throw new Error(`PV catalog HTTP ${res.status}`);
  const data = await res.json();
  const statuses = readJson(SYS_KEY, {});
  for (const feature of data.features || []) {
    const id = String(feature.properties?.area_id ?? feature.properties?.footprint_id ?? feature.id);
    if (statuses[id]) Object.assign(feature.properties || (feature.properties = {}), statuses[id]);
  }
  return data;
}

export async function patchSystemStatus(systemId, payload) {
  const statuses = readJson(SYS_KEY, {});
  const prev = statuses[String(systemId)] || {};
  statuses[String(systemId)] = { ...prev, ...payload };
  writeJson(SYS_KEY, statuses);
  return { id: String(systemId), ...statuses[String(systemId)] };
}

export async function listAnnotations(bounds = WORLD_BOUNDS) {
  const local = decorateLocal(readJson(ANN_KEY, emptyFc()).features || [], localDecisionMap());
  const localFc = { type: 'FeatureCollection', features: local };
  const sb = getSupabase();
  if (sb) {
    // Soft-read: no anonymous sign-in — that happens on first capture (save).
    // Ask for pending fences too when the RPC supports it (ignored if unknown arg).
    try {
      return await withSupabaseReach(async () => {
        const baseArgs = {
          p_west: Number(bounds.west),
          p_south: Number(bounds.south),
          p_east: Number(bounds.east),
          p_north: Number(bounds.north),
          p_limit: Math.min(VIEW_LIMIT, VIEW_LIMIT_MAX),
        };
        let data;
        let error;
        ({ data, error } = await sb.rpc('get_annotations_in_view', {
          ...baseArgs,
          p_include_pending: true,
        }));
        // Older RPCs may not accept p_include_pending — retry without.
        if (error && /p_include_pending|unexpected|could not find/i.test(String(error.message || ''))) {
          ({ data, error } = await sb.rpc('get_annotations_in_view', baseArgs));
        }
        if (error) throw error;
        const remote = rowsToCollection(data);
        remote.features = (remote.features || []).map(enrichRemoteFeature).filter(Boolean);
        // Merge local so freshly saved / offline fences stay visible with remotes.
        return mergeAnnotationCollections(remote, localFc);
      });
    } catch (_) {
      return localFc;
    }
  }
  return localFc;
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

export async function saveAnnotation(payload) {
  await ensureAuthSession();
  const geometry = publicGeometry(payload.geometry);
  const existingId = String(payload.id || payload.properties?.fence_id || '');
  const sb = getSupabase();
  if (sb) {
    return withSupabaseReach(async () => {
      if (isUuid(existingId)) {
        const { data, error } = await sb.rpc('propose_annotation_edit', {
          p_annotation_id: existingId,
          p_geometry: geometry,
        });
        if (error) throw error;
        return rowToFeature(unwrapRpc(data)) || featureFromGeometry(existingId, geometry, {
          author_label: payload.properties?.author_label,
        });
      }
      const args = { p_geometry: geometry };
      const username = currentUsernameOrOmit();
      if (username) args.p_username = username;
      const { data, error } = await sb.rpc('create_annotation', args);
      if (error) throw error;
      const created = unwrapRpc(data);
      const id = extractId(created) || extractId(data);
      return rowToFeature(created) || featureFromGeometry(id, geometry, { author_label: username || GUEST_AUTHOR_LABEL });
    });
  }

  const feature = {
    type: 'Feature',
    id: existingId || (crypto.randomUUID?.() || `ann_${Date.now()}`),
    geometry,
    properties: {
      ...(payload.properties || {}),
      author_label: authorLabel(),
      created_at: payload.properties?.created_at || new Date().toISOString(),
    },
  };
  feature.properties.fence_id = String(feature.id);
  const stored = readJson(ANN_KEY, emptyFc());
  const id = featureId(feature);
  const next = (stored.features || []).filter((item) => featureId(item) !== id);
  next.push(feature);
  writeJson(ANN_KEY, { type: 'FeatureCollection', features: next });
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

export async function verifyAnnotation(annotationId, decision, revisionId) {
  if (!isVerifyDecision(decision)) {
    throw new Error('Decision must be confirm, reject, or needs_changes');
  }
  await ensureAuthSession();
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
      return listAnnotations();
    });
  }
  const mine = localGuestId();
  const rows = readJson(VOTE_KEY, []);
  const next = rows.filter((row) => !(
    row.annotation_id === String(annotationId) && row.user_id === mine
  ));
  next.push({ annotation_id: String(annotationId), user_id: mine, decision });
  writeJson(VOTE_KEY, next);
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
    username: String(row?.username || row?.author_label || row?.display_name || GUEST_AUTHOR_LABEL),
    points: Number(row?.points ?? row?.score ?? row?.credits ?? row?.count ?? 0),
    rank: Number(row?.rank ?? index + 1),
  };
}

export function leaderboardFromAnnotations(features) {
  const counts = new Map();
  for (const feature of features || []) {
    if (feature?.properties && feature.properties.is_public === false) continue;
    const name = feature.properties?.author_label || GUEST_AUTHOR_LABEL;
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
      return (Array.isArray(data) ? data : []).map(normalizeLeaderboardRow);
    } catch (_) {
      return [];
    }
  }
  const stored = readJson(ANN_KEY, emptyFc());
  return leaderboardFromAnnotations(decorateLocal(stored.features || [], localDecisionMap()));
}
