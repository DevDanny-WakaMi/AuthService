import * as crypto from 'crypto';

export const WAKAMI_REFERRAL_CODE_PATTERN = /^WKM-[A-Z]{3}-[A-Z0-9]{6}$/;

/**
 * Uses the first three ASCII alphabetic characters from a first name. A
 * one- or two-letter name is padded with X; a missing/non-alphabetic name
 * receives the neutral USR segment until a real first name is available.
 */
export function getReferralCodeNameSegment(firstName?: string | null): string {
  const letters =
    (firstName ?? '').match(/[a-z]/gi)?.join('').toUpperCase() ?? '';

  if (!letters) {
    return 'USR';
  }

  return letters.slice(0, 3).padEnd(3, 'X');
}

export function createReferralCode(firstName?: string | null): string {
  const suffix = crypto
    .randomInt(0, 36 ** 6)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0');
  return `WKM-${getReferralCodeNameSegment(firstName)}-${suffix}`;
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

export function hasReferralCodeNameSegment(
  referralCode: string,
  firstName?: string | null,
): boolean {
  return referralCode.startsWith(
    `WKM-${getReferralCodeNameSegment(firstName)}-`,
  );
}
