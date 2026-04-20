import type { ConfigFile, EvaluationContext, EvalResult } from './types';
import { matchRule } from './rules';
import { isInRollout } from './rollout';

/**
 * Evaluates a flag from a config file against an optional user context.
 *
 * Evaluation order:
 *   1. Look up flag by key — if not found, return { found: false }
 *   2. If flag is not enabled, return { enabled: false, value: defaultValue }
 *   3. Evaluate rules in order — first match wins, return rule.serveValue
 *   4. If rollout is configured:
 *        - 100% → fall through (everyone in)
 *        - 0%   → return { enabled: false, value: defaultValue } (everyone out)
 *        - 1-99% → require the rollout attribute (or targetingKey) in context.
 *                  If missing, treat the user as excluded. If present,
 *                  bucket deterministically.
 *   5. If no rules matched and the user is in the rollout, return defaultValue
 *
 * Behavior change vs. <1.0: previously a missing rollout attribute caused the
 * rollout block to be silently skipped, so users without the attribute fell
 * through to enabled=true and received the flag. That meant "30% rollout by
 * userId" actually delivered the flag to 30% of users with userId AND 100% of
 * users without it. See issue #234 for the full breakdown.
 */
export function evaluateFlag(
  config: ConfigFile,
  flagKey: string,
  context?: EvaluationContext,
): EvalResult {
  const flag = config.flags?.[flagKey];

  if (!flag) {
    return { found: false, enabled: false, value: null };
  }

  if (!flag.enabled) {
    return { found: true, enabled: false, value: flag.defaultValue };
  }

  // Check dependencies — if any prerequisite flag is disabled or missing, return default
  if (flag.dependencies && flag.dependencies.length > 0) {
    for (const depKey of flag.dependencies) {
      const depFlag = config.flags?.[depKey];
      if (!depFlag || !depFlag.enabled) {
        return { found: true, enabled: false, value: flag.defaultValue };
      }
    }
  }

  // Evaluate individual user targets — checked before rules
  if (flag.targets && flag.targets.length > 0 && context) {
    for (const target of flag.targets) {
      // Check targetingKey first, then fall back to identifierType-based matching
      const contextValue = context.targetingKey ?? context[target.identifierType];
      if (contextValue !== undefined && String(contextValue) === target.identifier) {
        return {
          found: true,
          enabled: true,
          value: target.serveValue,
          ruleMatch: `target:${target.identifierType}`,
        };
      }
    }
  }

  // Evaluate rules in order — first match wins
  if (flag.rules && flag.rules.length > 0 && context) {
    for (const rule of flag.rules) {
      if (matchRule(rule, context)) {
        return {
          found: true,
          enabled: true,
          value: rule.serveValue,
          ruleMatch: rule.attribute,
        };
      }
    }
  }

  // Evaluate rollout — deterministic percentage bucketing.
  //
  // Boundary cases first: 100% means "everyone gets it" regardless of
  // whether the caller passed the rollout attribute, and 0% means "nobody"
  // for the same reason. Without this special-case, a 100% rollout would
  // exclude contextless callers (since the bucket lookup would fail) and a
  // 0% rollout used to silently include them (the previous bug).
  if (flag.rollout) {
    const pct = flag.rollout.percentage;
    if (pct >= 100) {
      // Fall through to the served path below.
    } else if (pct <= 0) {
      return { found: true, enabled: false, value: flag.defaultValue };
    } else {
      const attributeValue =
        context?.[flag.rollout.attribute] ?? context?.targetingKey;
      if (attributeValue === undefined || attributeValue === null) {
        // Bucketed rollout with no bucket key → excluded.
        return { found: true, enabled: false, value: flag.defaultValue };
      }
      const inRollout = isInRollout(
        String(attributeValue),
        flagKey,
        pct,
      );
      if (!inRollout) {
        return { found: true, enabled: false, value: flag.defaultValue };
      }
    }
  }

  // No rules matched and user is in rollout (or no rollout configured)
  return { found: true, enabled: true, value: flag.defaultValue };
}
