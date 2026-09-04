// @ts-nocheck — per-zoom fence annotation variants (duplicate from zN, then drag).
import { mapZoomBucket } from './excluded-zooms';

export function zoomFamilyIdOf(feature) {
  const props = feature?.properties || {};
  const family = props.zoom_family_id || props.fence_id || feature?.id || props.id;
  return family != null ? String(family) : null;
}

export function authoredZoomBucket(feature) {
  return mapZoomBucket(feature?.properties?.imagery_zoom);
}

export function familyMembers(annotations, feature) {
  const family = zoomFamilyIdOf(feature);
  if (!family) return [];
  return (annotations || []).filter((ann) => {
    if ((ann?.properties?.category || ann?.properties?.type || 'fence') !== 'fence') return false;
    return zoomFamilyIdOf(ann) === family;
  });
}

export function familyMemberAtZoom(annotations, feature, zoom) {
  const bucket = mapZoomBucket(zoom);
  if (bucket == null) return null;
  return familyMembers(annotations, feature).find((ann) => authoredZoomBucket(ann) === bucket) || null;
}

export function bestSourceForZoomDuplicate(annotations, feature, targetZoom) {
  // Pick the closest authored zoom variant to copy from.
  const seed = feature ? [feature] : [];
  const members = familyMembers(annotations, feature);
  const pool = members.length ? members : seed;
  const target = mapZoomBucket(targetZoom);
  if (target == null || !pool.length) return null;
  if (familyMemberAtZoom(pool, feature || pool[0], target)) {
    return null; // already have this zoom
  }
  let best = null;
  let bestDist = Infinity;
  for (const member of pool) {
    const authored = authoredZoomBucket(member);
    if (authored == null) {
      if (!best) best = member;
      continue;
    }
    const dist = Math.abs(authored - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = member;
    }
  }
  return best;
}
