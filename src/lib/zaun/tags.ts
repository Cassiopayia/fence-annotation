// @ts-nocheck — shared tag vocabulary for inspector + guided annotation.
/* Schema: fence derived from annotation; context + visibility are manual. */

export const CONTEXT_TAGS = new Set(['urban', 'rural', 'complex']);
export const VISIBILITY_TAGS = new Set(['clear', 'partial', 'occluded', 'not_visible']);
export const MANUAL_TAGS = [...CONTEXT_TAGS, ...VISIBILITY_TAGS];

export const TAG_LABELS = {
  urban: 'Urban',
  rural: 'Rural',
  complex: 'Complex',
  clear: 'Clear',
  partial: 'Partial',
  occluded: 'Occluded',
  not_visible: 'Not on imagery'
};

const TAG_ALIASES = {
  urban_obstructed: 'urban',
  urban_clutter: 'urban',
  obstructed: 'occluded',
  ambiguous: 'partial',
  other: 'partial',
  partially_enclosed: 'partial',
  fully_enclosed: null,
  no_fence: null
};

export function migrateTag(tag) {
  if (tag == null || tag === '') return null;
  const value = String(tag);
  if (Object.prototype.hasOwnProperty.call(TAG_ALIASES, value)) {
    return TAG_ALIASES[value];
  }
  return MANUAL_TAGS.includes(value) ? value : null;
}

export function normalizeTagList(raw) {
  let items = [];
  if (raw == null || raw === '') items = [];
  else if (typeof raw === 'string') items = [raw];
  else if (Array.isArray(raw)) items = raw;
  else items = [];

  let contextPick = null;
  let visibilityPick = null;
  for (const item of items) {
    const migrated = migrateTag(item);
    if (!migrated) continue;
    if (CONTEXT_TAGS.has(migrated)) contextPick = migrated;
    else if (VISIBILITY_TAGS.has(migrated)) visibilityPick = migrated;
  }
  const out = [];
  if (contextPick) out.push(contextPick);
  if (visibilityPick) out.push(visibilityPick);
  return out;
}

export function splitManualTags(tags) {
  const normalized = normalizeTagList(tags);
  const context = normalized.find((tag) => CONTEXT_TAGS.has(tag)) || null;
  const visibility = normalized.find((tag) => VISIBILITY_TAGS.has(tag)) || null;
  return { context, visibility };
}

export function normalizeTags(props = {}) {
  const combined = [
    ...(Array.isArray(props.tags) ? props.tags : []),
    ...(props.context ? [props.context] : []),
    ...(props.visibility ? [props.visibility] : [])
  ];
  if (props.fence_status === 'unclear') combined.push('partial');
  return normalizeTagList(combined);
}

export function isFenceGeometry(geometry) {
  if (!geometry || geometry.type !== 'LineString') return false;
  const coords = geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return false;
  const distinct = new Set(coords.map((point) => (Array.isArray(point) ? point.join(',') : '')));
  return distinct.size >= 2;
}

export function isClosedLineGeometry(geometry) {
  if (!isFenceGeometry(geometry)) return false;
  const coords = geometry.coordinates;
  if (coords.length < 3) return false;
  const start = coords[0];
  const end = coords[coords.length - 1];
  return Math.abs(start[0] - end[0]) < 1e-9 && Math.abs(start[1] - end[1]) < 1e-9;
}

export function deriveFence({ category, geometry, explicit }) {
  if (explicit === 'yes' || explicit === 'no' || explicit === 'unknown') return explicit;
  if (category === 'no_fence') return 'no';
  if (category === 'fence' && isFenceGeometry(geometry)) return 'yes';
  return 'no';
}

export function fenceStatusFromGeometry(geometry, fence) {
  if (fence === 'no') return 'no_fence';
  if (!isFenceGeometry(geometry)) return 'unknown';
  return isClosedLineGeometry(geometry) ? 'fully_enclosed' : 'partially_enclosed';
}

export function buildAnnotationProperties({
  selectedTags,
  geometry,
  trainingValid,
  category,
  existing = {}
}) {
  const { context, visibility } = splitManualTags(selectedTags);
  const fence = deriveFence({ category, geometry, explicit: existing.fence });
  const props = {
    ...existing,
    category,
    fence,
    training_valid: trainingValid
  };
  if (context) props.context = context;
  else delete props.context;
  if (visibility && (fence === 'yes' || fence === 'unknown')) props.visibility = visibility;
  else delete props.visibility;

  const tags = [];
  if (context) tags.push(context);
  if (visibility && (fence === 'yes' || fence === 'unknown')) tags.push(visibility);
  props.tags = tags;
  props.fence_status = fenceStatusFromGeometry(geometry, fence);
  return props;
}

export function applyTagToggle(currentTags, tag, active) {
  const next = new Set(normalizeTagList(currentTags));
  if (active) {
    if (CONTEXT_TAGS.has(tag)) {
      CONTEXT_TAGS.forEach((ctx) => next.delete(ctx));
    }
    if (VISIBILITY_TAGS.has(tag)) {
      VISIBILITY_TAGS.forEach((vis) => next.delete(vis));
    }
    next.add(tag);
  } else {
    next.delete(tag);
  }
  return normalizeTagList([...next]);
}

export function hasContext(tags) {
  return Boolean(splitManualTags(tags).context);
}

export function hasVisibility(tags) {
  return Boolean(splitManualTags(tags).visibility);
}

export function asIdList(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  return [value];
}

export function mergePvSystemIds(...groups) {
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    for (const raw of asIdList(group)) {
      if (raw == null || raw === '') continue;
      const key = String(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      const num = Number(raw);
      out.push(Number.isFinite(num) ? num : raw);
    }
  }
  return out;
}

export function primaryPvSystemId(ids) {
  const list = mergePvSystemIds(ids);
  return list.length ? list[0] : null;
}

export function linkedSystemIds(props = {}) {
  const ids = new Set();
  asIdList(props.area_id).forEach((id) => ids.add(String(id)));
  asIdList(props.pv_system_id).forEach((id) => ids.add(String(id)));
  asIdList(props.area_ids).forEach((id) => ids.add(String(id)));
  asIdList(props.pv_system_ids).forEach((id) => ids.add(String(id)));
  return ids;
}

export function annotationLinkedToSystem(annotation, systemId) {
  return linkedSystemIds(annotation?.properties || {}).has(String(systemId));
}

export function syncTagPills(host, selectedTags) {
  if (!host) return;
  const selected = new Set(normalizeTagList(selectedTags));
  host.querySelectorAll('[data-tag], [data-inspector-tag]').forEach((btn) => {
    const tag = btn.dataset.tag || btn.dataset.inspectorTag;
    const on = selected.has(tag);
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!btn.textContent.trim() && TAG_LABELS[tag]) {
      btn.textContent = TAG_LABELS[tag];
    }
  });
}

// Backward-compatible exports
export const ALL_TAGS = MANUAL_TAGS;
export const FENCE_STATUS_TAGS = new Set();
