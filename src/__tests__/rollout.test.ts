import { describe, it, expect } from 'vitest';
import { bucketUser, isInRollout } from '../rollout';

/**
 * Parity fixtures — known MurmurHash3 outputs for known inputs.
 *
 * These values define the canonical FlagDrop bucketing output. Every
 * FlagDrop SDK (Node, browser, React, Vue) and the Go backend must produce
 * IDENTICAL values for these inputs. If this test ever fails because
 * somebody changed the hash algorithm, that's a breaking change for every
 * rolled-out user and requires a major version bump + coordinated SDK
 * updates.
 *
 * Sourced from `murmurhash3js.x86.hash32(flagKey + attributeValue)` mod 100.
 * Regenerate with `/tmp/evaluator-v2` scratch script if you ever need to
 * verify manually.
 */
describe('bucketUser — MurmurHash3 parity fixtures', () => {
  const cases: Array<[string, string | number | boolean, number]> = [
    ['test-flag', 'user-1', 26],
    ['test-flag', 'user-2', 27],
    ['test-flag', 'user-100', 44],
    ['rollout-key', 'phil', 65],
    ['rollout-key', 'alice', 87],
    ['new-checkout', 'acme-corp', 71],
    ['numeric-id', '12345', 90],
    ['bool-attr', 'true', 86],
  ];

  for (const [flagKey, attr, expected] of cases) {
    it(`bucketUser(${JSON.stringify(flagKey)}, ${JSON.stringify(attr)}) === ${expected}`, () => {
      expect(bucketUser(flagKey, attr)).toBe(expected);
    });
  }

  it('returns a value 0-99 inclusive', () => {
    for (let i = 0; i < 1000; i++) {
      const b = bucketUser('some-flag', `user-${i}`);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });

  it('is deterministic', () => {
    const a = bucketUser('flag', 'user-abc');
    const b = bucketUser('flag', 'user-abc');
    expect(a).toBe(b);
  });

  it('different flagKeys bucket the same user differently (desired property)', () => {
    // Not guaranteed for every pair but should hold across enough samples.
    let differ = 0;
    for (let i = 0; i < 100; i++) {
      const u = `user-${i}`;
      if (bucketUser('flag-a', u) !== bucketUser('flag-b', u)) differ++;
    }
    // ~99% of users should land in different buckets across two flag keys.
    expect(differ).toBeGreaterThan(90);
  });

  it('numeric and boolean attribute values stringify consistently', () => {
    // bucketUser coerces via String(), so 123 and "123" must produce the same bucket.
    expect(bucketUser('flag', 123)).toBe(bucketUser('flag', '123'));
    expect(bucketUser('flag', true)).toBe(bucketUser('flag', 'true'));
  });
});

describe('isInRollout', () => {
  it('returns false at 0% regardless of attribute', () => {
    expect(isInRollout('anyone', 'some-flag', 0)).toBe(false);
    expect(isInRollout('', 'some-flag', 0)).toBe(false);
  });

  it('returns true at 100% regardless of attribute', () => {
    expect(isInRollout('anyone', 'some-flag', 100)).toBe(true);
    expect(isInRollout('', 'some-flag', 100)).toBe(true);
  });

  it('buckets strictly less than percentage are in', () => {
    // From the fixtures above, bucketUser('rollout-key', 'phil') === 65.
    expect(isInRollout('phil', 'rollout-key', 66)).toBe(true);
    expect(isInRollout('phil', 'rollout-key', 65)).toBe(false);
    expect(isInRollout('phil', 'rollout-key', 64)).toBe(false);
  });

  it('roughly hits the configured percentage across a population', () => {
    let hits = 0;
    for (let i = 0; i < 10_000; i++) {
      if (isInRollout(`user-${i}`, 'rollout-key', 30)) hits++;
    }
    const pct = (hits / 10_000) * 100;
    // Expect tight bucket distribution — at 10k samples a MurmurHash3 bucket
    // should land within ±2pp of the configured percentage.
    expect(pct).toBeGreaterThan(28);
    expect(pct).toBeLessThan(32);
  });
});
