import type { Rule, EvaluationContext } from './types';

/**
 * Evaluates whether a single rule matches the given user context.
 * Returns true if the rule's condition is satisfied.
 */
export function matchRule(rule: Rule, context: EvaluationContext): boolean {
  // Segment operator uses a special lookup — check context.segments array
  if (rule.operator === 'segment') {
    const segments = context['segments'];
    if (Array.isArray(segments)) {
      return segments.some((s) => String(s) === String(rule.value));
    }
    return false;
  }

  const contextValue = context[rule.attribute];

  // If the context doesn't have the attribute, the rule can't match
  // (except for "notIn" and "neq" which match on absence)
  if (contextValue === undefined || contextValue === null) {
    if (rule.operator === 'neq' || rule.operator === 'notIn') {
      return true;
    }
    return false;
  }

  switch (rule.operator) {
    case 'eq':
      // Strict equality when both sides are the same type
      if (typeof contextValue === typeof rule.value) {
        return contextValue === rule.value;
      }
      return String(contextValue) === String(rule.value);

    case 'neq':
      if (typeof contextValue === typeof rule.value) {
        return contextValue !== rule.value;
      }
      return String(contextValue) !== String(rule.value);

    case 'in': {
      // If contextValue is a string[], check if rule.value is IN the context array
      if (Array.isArray(contextValue)) {
        return contextValue.some((v) => String(v) === String(rule.value));
      }
      // Standard: rule.value is the array, check if contextValue is in it
      const list = Array.isArray(rule.value) ? rule.value : [];
      return list.some((v) => String(v) === String(contextValue));
    }

    case 'notIn': {
      // If contextValue is a string[], check if rule.value is NOT in the context array
      if (Array.isArray(contextValue)) {
        return !contextValue.some((v) => String(v) === String(rule.value));
      }
      // Standard: rule.value is the array, check if contextValue is NOT in it
      const list = Array.isArray(rule.value) ? rule.value : [];
      return !list.some((v) => String(v) === String(contextValue));
    }

    case 'lt':
      if (typeof contextValue === 'number' && typeof rule.value === 'number') {
        return contextValue < rule.value;
      }
      return Number(contextValue) < Number(rule.value);

    case 'gt':
      if (typeof contextValue === 'number' && typeof rule.value === 'number') {
        return contextValue > rule.value;
      }
      return Number(contextValue) > Number(rule.value);

    case 'startsWith':
      return String(contextValue).startsWith(String(rule.value));

    case 'endsWith':
      return String(contextValue).endsWith(String(rule.value));

    case 'contains':
      return String(contextValue).includes(String(rule.value));

    default:
      return false;
  }
}
