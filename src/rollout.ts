/**
 * FNV-1a hash (32-bit) — fast, deterministic, good distribution for bucketing.
 * Matches the approach referenced in platform models (MurmurHash3 comment,
 * but FNV-1a is simpler and sufficient for percentage bucketing).
 */
export function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // FNV prime: multiply by 16777619
    // Use Math.imul for correct 32-bit multiplication
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned 32-bit integer
  return hash >>> 0;
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

  const hash = fnv1aHash(flagKey + String(attributeValue));
  const bucket = hash % 100;
  return bucket < percentage;
}
