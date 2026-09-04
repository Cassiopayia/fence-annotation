/** Username rules for the public write API. Must match webapp/core/username.py. */

export const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const GUEST_AUTHOR_LABEL = 'Guest';

export function normalizeUsername(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toLowerCase();
}

export function isValidUsername(raw: string | null | undefined): boolean {
  return USERNAME_RE.test(normalizeUsername(raw));
}

export function optionalUsername(raw: string | null | undefined): string | null {
  const username = normalizeUsername(raw);
  if (!username) return null;
  if (!USERNAME_RE.test(username)) {
    throw new Error('Username must be 3–32 characters: lowercase a–z, 0–9, and _');
  }
  return username;
}

export function isUuid(raw: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(raw || ''),
  );
}

/** Render untrusted labels as plain text — never innerHTML. */
export function setPlainText(el: Element | null | undefined, value: string): void {
  if (el) el.textContent = String(value ?? '');
}
