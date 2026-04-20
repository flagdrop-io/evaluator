/** Top-level config file structure (flags-{env}-{scope}.json) */
export interface ConfigFile {
  version: number;
  updatedAt: string;
  scope: string;
  flags: Record<string, ConfigFlag>;
}

/** A user-level targeting override */
export interface Target {
  identifier: string;
  identifierType: string; // "userId" | custom
  serveValue: unknown;
}

/** A single flag entry in the config file */
export interface ConfigFlag {
  type: string; // "boolean" | "string" | "number" | "json"
  enabled: boolean;
  defaultValue: unknown;
  targets?: Target[];
  rules?: Rule[];
  rollout?: Rollout;
  description?: string;
  dependencies?: string[];
}

/** A targeting rule — evaluated in order, first match wins */
export interface Rule {
  attribute: string;
  operator: string; // "eq" | "neq" | "in" | "notIn" | "lt" | "gt" | "startsWith" | "endsWith" | "segment"
  value: unknown;
  serveValue: unknown;
}

/** Percentage-based gradual rollout */
export interface Rollout {
  percentage: number;
  attribute: string;
}

/** Evaluation context provided at evaluation time */
export interface EvaluationContext {
  targetingKey?: string;
  [key: string]: string | number | boolean | string[] | undefined;
}

/** @deprecated Use EvaluationContext */
export type UserContext = EvaluationContext;

/** Result of evaluating a flag */
export interface EvalResult {
  found: boolean;
  enabled: boolean;
  value: unknown;
  ruleMatch?: string; // which rule attribute matched, for debugging
}
