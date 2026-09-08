/** Local-only visibility helper. Live Supabase visibility is decided by get_annotations_in_view. */

export const MIN_UPS_FOR_VISIBLE = 2;
export const HARD_EXCLUDE_DOWNS = 4;
export const THREE_DOWN_MIN_UPS = 6;

export function requiredUps(downs: number): number | null {
  const d = Math.max(0, Math.floor(Number(downs) || 0));
  if (d >= HARD_EXCLUDE_DOWNS) return null;
  if (d === 3) return THREE_DOWN_MIN_UPS;
  const raw = d + d / 4;
  const needed = Math.ceil(raw);
  return Math.max(MIN_UPS_FOR_VISIBLE, needed);
}

/** Training-set / export gate — needs enough confirm votes. */
export function annotationIsPublic(ups: number, downs: number): boolean {
  const u = Math.max(0, Math.floor(Number(ups) || 0));
  const d = Math.max(0, Math.floor(Number(downs) || 0));
  const need = requiredUps(d);
  if (need == null) return false;
  return u >= need;
}

/**
 * Map browse gate — show everyone’s fences including pending review.
 * Only hard-excluded (too many rejects) stay off the map.
 */
export function annotationVisibleOnMap(ups: number, downs: number): boolean {
  return requiredUps(downs) != null;
}

export function visibilityReason(ups: number, downs: number): string {
  const u = Math.max(0, Math.floor(Number(ups) || 0));
  const d = Math.max(0, Math.floor(Number(downs) || 0));
  if (d >= HARD_EXCLUDE_DOWNS) return `Excluded (${d} downs; more than 3 hides the feature)`;
  const need = requiredUps(d) ?? 0;
  if (u >= need) return `Public (${u}↑ / ${d}↓)`;
  return `Pending review — needs ${need} ups (${u}↑ / ${d}↓)`;
}
