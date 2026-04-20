import { describe, it, expect } from 'vitest';
import { evaluateFlag } from '../evaluate';
import { matchRule } from '../rules';
import type { ConfigFile, Rule, EvaluationContext } from '../types';

// ── matchRule tests ──────────────────────────────────────────────────

describe('matchRule — typed context values', () => {
  it('numeric context with lt operator (no coercion)', () => {
    const rule: Rule = { attribute: 'age', operator: 'lt', value: 30, serveValue: true };
    const context: EvaluationContext = { age: 25 };
    expect(matchRule(rule, context)).toBe(true);
  });

  it('numeric context with gt operator (no coercion)', () => {
    const rule: Rule = { attribute: 'age', operator: 'gt', value: 18, serveValue: true };
    const context: EvaluationContext = { age: 25 };
    expect(matchRule(rule, context)).toBe(true);
  });

  it('numeric lt returns false when equal', () => {
    const rule: Rule = { attribute: 'age', operator: 'lt', value: 25, serveValue: true };
    const context: EvaluationContext = { age: 25 };
    expect(matchRule(rule, context)).toBe(false);
  });

  it('boolean context with eq operator', () => {
    const rule: Rule = { attribute: 'beta', operator: 'eq', value: true, serveValue: 'on' };
    const context: EvaluationContext = { beta: true };
    expect(matchRule(rule, context)).toBe(true);
  });

  it('boolean context with eq — false !== true', () => {
    const rule: Rule = { attribute: 'beta', operator: 'eq', value: true, serveValue: 'on' };
    const context: EvaluationContext = { beta: false };
    expect(matchRule(rule, context)).toBe(false);
  });

  it('string[] context with in operator (reverse direction)', () => {
    const rule: Rule = { attribute: 'roles', operator: 'in', value: 'admin', serveValue: true };
    const context: EvaluationContext = { roles: ['admin', 'editor'] };
    expect(matchRule(rule, context)).toBe(true);
  });

  it('string[] context with in operator — value not in array', () => {
    const rule: Rule = { attribute: 'roles', operator: 'in', value: 'superadmin', serveValue: true };
    const context: EvaluationContext = { roles: ['admin', 'editor'] };
    expect(matchRule(rule, context)).toBe(false);
  });

  it('string[] context with notIn operator', () => {
    const rule: Rule = { attribute: 'roles', operator: 'notIn', value: 'superadmin', serveValue: true };
    const context: EvaluationContext = { roles: ['admin', 'editor'] };
    expect(matchRule(rule, context)).toBe(true);
  });

  it('standard in — rule.value is the array', () => {
    const rule: Rule = { attribute: 'country', operator: 'in', value: ['US', 'CA', 'GB'], serveValue: true };
    const context: EvaluationContext = { country: 'US' };
    expect(matchRule(rule, context)).toBe(true);
  });

  it('mixed type comparison — string "25" with numeric lt', () => {
    const rule: Rule = { attribute: 'age', operator: 'lt', value: 30, serveValue: true };
    const context: EvaluationContext = { age: '25' as unknown as number };
    expect(matchRule(rule, context)).toBe(true);
  });

  it('eq with same-type strings uses strict equality', () => {
    const rule: Rule = { attribute: 'plan', operator: 'eq', value: 'pro', serveValue: true };
    const context: EvaluationContext = { plan: 'pro' };
    expect(matchRule(rule, context)).toBe(true);
  });

  it('neq with same-type values', () => {
    const rule: Rule = { attribute: 'plan', operator: 'neq', value: 'free', serveValue: true };
    const context: EvaluationContext = { plan: 'pro' };
    expect(matchRule(rule, context)).toBe(true);
  });
});

// ── evaluateFlag tests ───────────────────────────────────────────────

function makeConfig(flags: ConfigFile['flags']): ConfigFile {
  return { version: 1, updatedAt: '2026-04-02T00:00:00Z', scope: 'test', flags };
}

describe('evaluateFlag — targetingKey rollout fallback', () => {
  it('uses targetingKey when rollout attribute is missing from context', () => {
    const config = makeConfig({
      'feature-x': {
        type: 'boolean',
        enabled: true,
        defaultValue: false,
        rollout: { percentage: 100, attribute: 'userId' },
      },
    });

    // No userId in context, but targetingKey is present
    const result = evaluateFlag(config, 'feature-x', { targetingKey: 'user-123' });
    expect(result.found).toBe(true);
    expect(result.enabled).toBe(true);
  });

  it('prefers explicit rollout attribute over targetingKey', () => {
    const config = makeConfig({
      'feature-x': {
        type: 'boolean',
        enabled: true,
        defaultValue: false,
        rollout: { percentage: 100, attribute: 'userId' },
      },
    });

    const result = evaluateFlag(config, 'feature-x', {
      targetingKey: 'user-123',
      userId: 'user-456',
    });
    expect(result.found).toBe(true);
    expect(result.enabled).toBe(true);
  });

  it('returns disabled when no targetingKey and no rollout attribute', () => {
    // Issue #234: a bucketed rollout (1-99%) with no bucket key in the
    // context now correctly excludes the user. The previous behavior
    // silently fell through to enabled=true, so a "30% rollout by userId"
    // delivered to 100% of contextless callers — the opposite of what
    // operators expect.
    const config = makeConfig({
      'feature-x': {
        type: 'boolean',
        enabled: true,
        defaultValue: false,
        rollout: { percentage: 50, attribute: 'userId' },
      },
    });

    const result = evaluateFlag(config, 'feature-x', { plan: 'pro' });
    expect(result.found).toBe(true);
    expect(result.enabled).toBe(false);
    expect(result.value).toBe(false);
  });
});

describe('evaluateFlag — rollout boundary semantics (#234)', () => {
  // 100% rollout = everyone, regardless of whether the caller passed the
  // rollout attribute. Without this special-case, a 100% rollout would
  // exclude every contextless caller after the strict-bucketing fix.
  it('100% rollout serves the flag even with no context', () => {
    const config = makeConfig({
      'fully-rolled-out': {
        type: 'string',
        enabled: true,
        defaultValue: 'served',
        rollout: { percentage: 100, attribute: 'userId' },
      },
    });
    const result = evaluateFlag(config, 'fully-rolled-out');
    expect(result.enabled).toBe(true);
    expect(result.value).toBe('served');
  });

  it('100% rollout serves the flag with empty context', () => {
    const config = makeConfig({
      'fully-rolled-out': {
        type: 'string',
        enabled: true,
        defaultValue: 'served',
        rollout: { percentage: 100, attribute: 'userId' },
      },
    });
    const result = evaluateFlag(config, 'fully-rolled-out', {});
    expect(result.enabled).toBe(true);
    expect(result.value).toBe('served');
  });

  // 0% rollout = nobody, regardless of whether the caller passed the
  // rollout attribute. The bucketing math already returned false for
  // percentage <= 0, but the old code only entered that path when the
  // attribute was present — contextless callers were silently included.
  it('0% rollout returns disabled with the userId attribute present', () => {
    const config = makeConfig({
      'not-rolled-out': {
        type: 'boolean',
        enabled: true,
        defaultValue: false,
        rollout: { percentage: 0, attribute: 'userId' },
      },
    });
    const result = evaluateFlag(config, 'not-rolled-out', { userId: 'alice' });
    expect(result.enabled).toBe(false);
    expect(result.value).toBe(false);
  });

  it('0% rollout returns disabled with no context', () => {
    const config = makeConfig({
      'not-rolled-out': {
        type: 'boolean',
        enabled: true,
        defaultValue: false,
        rollout: { percentage: 0, attribute: 'userId' },
      },
    });
    const result = evaluateFlag(config, 'not-rolled-out');
    expect(result.enabled).toBe(false);
    expect(result.value).toBe(false);
  });

  // Bucketed rollout with attribute present should still bucket correctly.
  it('50% rollout buckets by userId when present', () => {
    const config = makeConfig({
      'gradual': {
        type: 'boolean',
        enabled: true,
        defaultValue: false,
        rollout: { percentage: 50, attribute: 'userId' },
      },
    });
    // Run a bunch of users — the same user must always get the same answer.
    const results = new Set<boolean>();
    for (let i = 0; i < 50; i++) {
      const result = evaluateFlag(config, 'gradual', { userId: `user-${i}` });
      results.add(result.enabled);
    }
    // Should see both true and false (bucketing is working).
    expect(results.has(true)).toBe(true);
    expect(results.has(false)).toBe(true);
  });

  it('bucketing is deterministic for the same user', () => {
    const config = makeConfig({
      'gradual': {
        type: 'boolean',
        enabled: true,
        defaultValue: false,
        rollout: { percentage: 50, attribute: 'userId' },
      },
    });
    const r1 = evaluateFlag(config, 'gradual', { userId: 'phil' });
    const r2 = evaluateFlag(config, 'gradual', { userId: 'phil' });
    expect(r1.enabled).toBe(r2.enabled);
  });
});

describe('evaluateFlag — full evaluation flow with typed context', () => {
  it('rule matching with numeric context, then rollout', () => {
    const config = makeConfig({
      'premium-feature': {
        type: 'boolean',
        enabled: true,
        defaultValue: false,
        rules: [
          { attribute: 'age', operator: 'gt', value: 21, serveValue: true },
        ],
        rollout: { percentage: 50, attribute: 'userId' },
      },
    });

    const result = evaluateFlag(config, 'premium-feature', {
      targetingKey: 'user-1',
      age: 25,
      userId: 'user-1',
    });

    // Rule matches (age 25 > 21), so rollout is never checked
    expect(result.found).toBe(true);
    expect(result.enabled).toBe(true);
    expect(result.value).toBe(true);
    expect(result.ruleMatch).toBe('age');
  });

  it('boolean rule match in full evaluation', () => {
    const config = makeConfig({
      'beta-feature': {
        type: 'string',
        enabled: true,
        defaultValue: 'off',
        rules: [
          { attribute: 'beta', operator: 'eq', value: true, serveValue: 'on' },
        ],
      },
    });

    const result = evaluateFlag(config, 'beta-feature', { beta: true });
    expect(result.value).toBe('on');
    expect(result.ruleMatch).toBe('beta');
  });

  it('flag not found returns found: false', () => {
    const config = makeConfig({});
    const result = evaluateFlag(config, 'nonexistent', {});
    expect(result.found).toBe(false);
  });

  it('disabled flag returns defaultValue', () => {
    const config = makeConfig({
      'disabled-flag': {
        type: 'boolean',
        enabled: false,
        defaultValue: 'nope',
      },
    });
    const result = evaluateFlag(config, 'disabled-flag', {});
    expect(result.enabled).toBe(false);
    expect(result.value).toBe('nope');
  });
});
