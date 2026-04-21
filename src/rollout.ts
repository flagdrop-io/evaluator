import murmurhash3 from 'murmurhash3js';

/**
 * Deterministic bucketing via MurmurHash3 (32-bit, x86 variant).
 *
 * Returns a number 0-99 inclusive. The hash input is
 * `flagKey + String(attributeValue)` — identical format to every FlagDrop
 * SDK (Node, browser, React, Vue) and the Go backend, so the same user is
 * bucketed to the same value everywhere a flag is evaluated.
 *
 * This is the canonical bucketing algorithm for FlagDrop. Any evaluator —
 * wherever it lives — must produce identical output for this function given
 * the same inputs. A parity change here is a breaking change for every
 * rolled-out user and requires a major version bump.
 */
export function bucketUser(
  flagKey: string,
  attributeValue: string | number | boolean,
): number {
  const hash = murmurhash3.x86.hash32(flagKey + String(attributeValue));
  return Math.abs(hash) % 100;
}

/**
 * Determines whether a user is in the rollout bucket for a given flag.
 * Uses deterministic hashing so the same user always gets the same result
 * for the same flag, regardless of when or where evaluation happens.
 *
 * @param attributeValue - The value of the rollout attribute (e.g., userId)
 * @param flagKey - The flag key (used as hash salt)
 * @param percentage - Rollout percentage (0-100)
 * @returns true if the user is in the rollout bucket
 */
export function isInRollout(
  attributeValue: string | number | boolean,
  flagKey: string,
  percentage: number,
): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  return bucketUser(flagKey, attributeValue) < percentage;
}
