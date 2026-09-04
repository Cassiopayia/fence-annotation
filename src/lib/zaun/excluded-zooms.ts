/** Per-annotation zoom exclusion helpers (export skips these buckets). */

export function mapZoomBucket(zoom) {
  const value = Math.round(Number(zoom));
  if (!Number.isFinite(value) || value < 10 || value > 22) return null;
  return value;
}

export function normalizeExcludedZooms(raw) {
  const values = Array.isArray(raw) ? raw : (raw == null || raw === '' ? [] : [raw]);
  const seen = new Set();
  const out = [];
  for (const item of values) {
    const bucket = mapZoomBucket(item);
    if (bucket == null || seen.has(bucket)) continue;
    seen.add(bucket);
    out.push(bucket);
  }
  return out.sort((a, b) => a - b);
}

export function isZoomExcluded(excluded, zoom) {
  const bucket = mapZoomBucket(zoom);
  if (bucket == null) return false;
  return normalizeExcludedZooms(excluded).includes(bucket);
}

export function toggleExcludedZoom(excluded, zoom, shouldExclude) {
  const bucket = mapZoomBucket(zoom);
  if (bucket == null) return normalizeExcludedZooms(excluded);
  const set = new Set(normalizeExcludedZooms(excluded));
  if (shouldExclude) set.add(bucket);
  else set.delete(bucket);
  return [...set].sort((a, b) => a - b);
}

export function formatExcludedZooms(excluded) {
  const list = normalizeExcludedZooms(excluded);
  if (!list.length) return '';
  return list.map((z) => `z${z}`).join(', ');
}
