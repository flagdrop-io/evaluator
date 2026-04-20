import { describe, it, expect } from 'vitest';
import { evaluateFlag } from '../src/evaluate';
import { matchRule } from '../src/rules';
import { isInRollout, fnv1aHash } from '../src/rollout';
import type { ConfigFile, Rule, UserContext } from '../src/types';

// ============================================================================
// Helper: build a minimal config
// ============================================================================

function makeConfig(
  flags: ConfigFile['flags'] = {},
): ConfigFile {
  return {
    version: 1,
    updatedAt: '2026-03-27T00:00:00Z',
    scope: 'backend',
    flags,
  };
}

// ============================================================================
// evaluateFlag
// ============================================================================

describe('evaluateFlag', () => {
  it('returns found:false for a flag that does not exist', () => {
    const config = makeConfig({});
    const result = evaluateFlag(config, 'nonexistent');
    expect(result.found).toBe(false);
    expect(result.value).toBeNull();
  });

  it('returns enabled:true and defaultValue for a boolean flag that is enabled', () => {
    const config = makeConfig({
      'dark-mode': {
        type: 'boolean',
        enabled: true,
        defaultValue: true,
        rules: [],
      },
    });
    const result = evaluateFlag(config, 'dark-mode');
    expect(result.found).toBe(true);
    expect(result.enabled).toBe(true);
    expect(result.value).toBe(true);
  });

  it('returns enabled:false and defaultValue for a disabled flag', () => {
    const config = makeConfig({
      'dark-mode': {
        type: 'boolean',
        enabled: false,
        defaultValue: false,
      },
    });
    const result = evaluateFlag(config, 'dark-mode');
    expect(result.found).toBe(true);
    expect(result.enabled).toBe(false);
    expect(result.value).toBe(false);
  });

  it('returns rule serveValue when a rule matches', () => {
    const config = makeConfig({
      'beta-feature': {
        type: 'boolean',
        enabled: true,
        defaultValue: false,
        rules: [
          {
            attribute: 'email',
            operator: 'endsWith',
            value: '@flagdrop.io',
            serveValue: true,
          },
        ],
      },
    });
    const result = evaluateFlag(config, 'beta-feature', {
      email: 'phil@flagdrop.io',
    });
    expect(result.enabled).toBe(true);
    expect(result.value).toBe(true);
    expect(result.ruleMatch).toBe('email');
  });

  it('returns defaultValue when no rules match', () => {
    const config = makeConfig({
      'beta-feature': {
        type: 'boolean',
        enabled: true,
        defaultValue: false,
        rules: [
          {
            attribute: 'email',
            operator: 'endsWith',
            value: '@flagdrop.io',
            serveValue: true,
          },
        ],
      },
    });
    const result = evaluateFlag(config, 'beta-feature', {
      email: 'user@gmail.com',
    });
    expect(result.enabled).toBe(true);
    expect(result.value).toBe(false);
  });

  it('first matching rule wins', () => {
    const config = makeConfig({
      greeting: {
        type: 'string',
        enabled: true,
        defaultValue: 'Hello',
        rules: [
          {
            attribute: 'country',
            operator: 'eq',
            value: 'JP',
            serveValue: 'Konnichiwa',
          },
          {
            attribute: 'country',
            operator: 'eq',
            value: 'JP',
            serveValue: 'Ohayo',
          },
        ],
      },
    });
    const result = evaluateFlag(config, 'greeting', { country: 'JP' });
    expect(result.value).toBe('Konnichiwa');
  });

  it('handles rollout — user in bucket', () => {
    // We need to find a userId that lands in the bucket for 50%
    // fnv1aHash('gradual-rollout' + 'user-in') % 100 should be < 50
    const config = makeConfig({
      'gradual-rollout': {
        type: 'boolean',
        enabled: true,
        defaultValue: true,
        rollout: { percentage: 100, attribute: 'userId' },
      },
    });
    const result = evaluateFlag(config, 'gradual-rollout', {
      userId: 'any-user',
    });
    expect(result.found).toBe(true);
    expect(result.enabled).toBe(true);
  });

  it('handles rollout — 0% excludes everyone', () => {
    const config = makeConfig({
      'gradual-rollout': {
        type: 'boolean',
        enabled: true,
        defaultValue: true,
        rollout: { percentage: 0, attribute: 'userId' },
      },
    });
    const result = evaluateFlag(config, 'gradual-rollout', {
      userId: 'any-user',
    });
    expect(result.enabled).toBe(false);
    expect(result.value).toBe(true); // defaultValue
  });

  it('evaluates without context — returns defaultValue for enabled flag', () => {
    const config = makeConfig({
      'simple-flag': {
        type: 'boolean',
        enabled: true,
        defaultValue: true,
        rules: [
          {
            attribute: 'email',
            operator: 'eq',
            value: 'test@test.com',
            serveValue: false,
          },
        ],
      },
    });
    // No context passed — rules are skipped
    const result = evaluateFlag(config, 'simple-flag');
    expect(result.enabled).toBe(true);
    expect(result.value).toBe(true);
  });

  it('handles string type flag with defaultValue', () => {
    const config = makeConfig({
      'banner-text': {
        type: 'string',
        enabled: true,
        defaultValue: 'Welcome!',
        rules: [
          {
            attribute: 'tier',
            operator: 'eq',
            value: 'premium',
            serveValue: 'Welcome, Premium User!',
          },
        ],
      },
    });
    const result = evaluateFlag(config, 'banner-text', { tier: 'premium' });
    expect(result.value).toBe('Welcome, Premium User!');
  });
});

// ============================================================================
// matchRule
// ============================================================================

describe('matchRule', () => {
  it('eq — matches equal strings', () => {
    const rule: Rule = {
      attribute: 'country',
      operator: 'eq',
      value: 'US',
      serveValue: true,
    };
    expect(matchRule(rule, { country: 'US' })).toBe(true);
    expect(matchRule(rule, { country: 'UK' })).toBe(false);
  });

  it('neq — matches unequal strings', () => {
    const rule: Rule = {
      attribute: 'country',
      operator: 'neq',
      value: 'US',
      serveValue: true,
    };
    expect(matchRule(rule, { country: 'UK' })).toBe(true);
    expect(matchRule(rule, { country: 'US' })).toBe(false);
  });

  it('neq — matches when attribute is missing', () => {
    const rule: Rule = {
      attribute: 'country',
      operator: 'neq',
      value: 'US',
      serveValue: true,
    };
    expect(matchRule(rule, {})).toBe(true);
  });

  it('in — matches when value is in list', () => {
    const rule: Rule = {
      attribute: 'country',
      operator: 'in',
      value: ['US', 'CA', 'MX'],
      serveValue: true,
    };
    expect(matchRule(rule, { country: 'CA' })).toBe(true);
    expect(matchRule(rule, { country: 'JP' })).toBe(false);
  });

  it('notIn — matches when value is not in list', () => {
    const rule: Rule = {
      attribute: 'country',
      operator: 'notIn',
      value: ['US', 'CA'],
      serveValue: true,
    };
    expect(matchRule(rule, { country: 'JP' })).toBe(true);
    expect(matchRule(rule, { country: 'US' })).toBe(false);
  });

  it('lt — numeric less-than', () => {
    const rule: Rule = {
      attribute: 'age',
      operator: 'lt',
      value: 18,
      serveValue: 'minor',
    };
    expect(matchRule(rule, { age: 17 })).toBe(true);
    expect(matchRule(rule, { age: 18 })).toBe(false);
    expect(matchRule(rule, { age: 25 })).toBe(false);
  });

  it('gt — numeric greater-than', () => {
    const rule: Rule = {
      attribute: 'score',
      operator: 'gt',
      value: 100,
      serveValue: 'high',
    };
    expect(matchRule(rule, { score: 150 })).toBe(true);
    expect(matchRule(rule, { score: 50 })).toBe(false);
  });

  it('startsWith — string prefix match', () => {
    const rule: Rule = {
      attribute: 'email',
      operator: 'startsWith',
      value: 'admin',
      serveValue: true,
    };
    expect(matchRule(rule, { email: 'admin@test.com' })).toBe(true);
    expect(matchRule(rule, { email: 'user@test.com' })).toBe(false);
  });

  it('endsWith — string suffix match', () => {
    const rule: Rule = {
      attribute: 'email',
      operator: 'endsWith',
      value: '@flagdrop.io',
      serveValue: true,
    };
    expect(matchRule(rule, { email: 'phil@flagdrop.io' })).toBe(true);
    expect(matchRule(rule, { email: 'phil@gmail.com' })).toBe(false);
  });

  it('contains — string includes match', () => {
    const rule: Rule = {
      attribute: 'email',
      operator: 'contains',
      value: 'flagdrop',
      serveValue: true,
    };
    expect(matchRule(rule, { email: 'phil@flagdrop.io' })).toBe(true);
    expect(matchRule(rule, { email: 'phil@gmail.com' })).toBe(false);
  });

  it('segment — matches when user is in a segment', () => {
    const rule: Rule = {
      attribute: 'segment',
      operator: 'segment',
      value: 'beta-testers',
      serveValue: true,
    };
    expect(matchRule(rule, { segments: ['beta-testers', 'internal'] })).toBe(
      true,
    );
    expect(matchRule(rule, { segments: ['production'] })).toBe(false);
  });

  it('returns false for missing attribute (non-negation operators)', () => {
    const rule: Rule = {
      attribute: 'country',
      operator: 'eq',
      value: 'US',
      serveValue: true,
    };
    expect(matchRule(rule, {})).toBe(false);
  });

  it('returns false for unknown operator', () => {
    const rule: Rule = {
      attribute: 'x',
      operator: 'banana',
      value: 'y',
      serveValue: true,
    };
    expect(matchRule(rule, { x: 'y' })).toBe(false);
  });
});

// ============================================================================
// rollout
// ============================================================================

describe('rollout', () => {
  it('fnv1aHash is deterministic', () => {
    const h1 = fnv1aHash('test-flag-user123');
    const h2 = fnv1aHash('test-flag-user123');
    expect(h1).toBe(h2);
  });

  it('fnv1aHash produces different values for different inputs', () => {
    const h1 = fnv1aHash('test-flag-user123');
    const h2 = fnv1aHash('test-flag-user456');
    expect(h1).not.toBe(h2);
  });

  it('isInRollout returns true for 100%', () => {
    expect(isInRollout('any-user', 'any-flag', 100)).toBe(true);
  });

  it('isInRollout returns false for 0%', () => {
    expect(isInRollout('any-user', 'any-flag', 0)).toBe(false);
  });

  it('isInRollout is deterministic for the same user+flag', () => {
    const r1 = isInRollout('user-42', 'my-flag', 50);
    const r2 = isInRollout('user-42', 'my-flag', 50);
    expect(r1).toBe(r2);
  });

  it('isInRollout distributes roughly evenly', () => {
    // Test that ~50% of 1000 users land in a 50% rollout
    let inCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (isInRollout(`user-${i}`, 'distribution-test', 50)) {
        inCount++;
      }
    }
    // Allow 10% tolerance: expect 400-600 out of 1000
    expect(inCount).toBeGreaterThan(400);
    expect(inCount).toBeLessThan(600);
  });
});
