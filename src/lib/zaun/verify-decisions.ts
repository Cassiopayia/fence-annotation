/** Fixed verification actions accepted by verify_annotation. */

export const VERIFY_DECISIONS = ['confirm', 'reject', 'needs_changes'] as const;

export type VerifyDecision = (typeof VERIFY_DECISIONS)[number];

export function isVerifyDecision(raw: string | null | undefined): raw is VerifyDecision {
  return VERIFY_DECISIONS.includes(String(raw || '').trim() as VerifyDecision);
}
