# @flagdrop/evaluator

**Lightweight, zero-dependency feature flag evaluation for JavaScript and TypeScript.**

[![npm version](https://img.shields.io/npm/v/@flagdrop/evaluator.svg)](https://www.npmjs.com/package/@flagdrop/evaluator)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Types](https://img.shields.io/npm/types/@flagdrop/evaluator.svg)](./src/types.ts)

The canonical flag-evaluation engine behind [FlagDrop](https://flagdrop.io). Given a flag config file and an optional user context, it returns the value a user should see — accounting for targeting rules, deterministic percentage rollouts, and dependencies.

Ships as ESM + CJS with full TypeScript types. No runtime dependencies.

---

## Install

```bash
npm install @flagdrop/evaluator
```

## Quick start

```ts
import { evaluateFlag, type ConfigFile } from '@flagdrop/evaluator';

const config: ConfigFile = {
  version: 1,
  updatedAt: '2026-04-20T00:00:00Z',
  scope: 'backend',
  flags: {
    'new-checkout-flow': {
      type: 'boolean',
      enabled: true,
      defaultValue: false,
      rollout: { percentage: 30, attribute: 'userId' },
    },
  },
};

const result = evaluateFlag(config, 'new-checkout-flow', { userId: 'u_123' });

if (result.value === true) {
  // user u_123 is in the 30% rollout
}
```

`evaluateFlag` returns a strongly-typed `EvalResult`:

```ts
{
  found: boolean;
  enabled?: boolean;
  value?: unknown;
  reason?: 'target' | 'rule' | 'rollout' | 'default' | 'disabled' | 'not-found';
  ruleIndex?: number;
}
```

## Features

- **Deterministic rollouts.** FNV-1a hashing buckets users the same way every time — across services, languages, and clients.
- **Targeting rules.** First-match-wins rule evaluation with full operator support (equals, contains, startsWith, matches, in, gt/gte/lt/lte, ...).
- **Per-user overrides.** Target specific users regardless of rule or rollout state.
- **Type-safe.** Full TypeScript definitions for config files, contexts, and results.
- **Zero dependencies.** Bundles to ~4 KB min+gzip. Safe for edge runtimes (Cloudflare Workers, Vercel Edge, Lambda@Edge).
- **Isomorphic.** Runs identically in Node, browsers, and serverless functions.

## Why a shared evaluator?

In a feature-flag system where eval can happen in many places — backend SDKs, browser SDKs, customer-hosted Lambdas reading config from S3, edge workers — the **one thing that must not drift** is the evaluation logic itself. A 30% rollout has to mean 30% of the same users everywhere, or your experiments lie.

`@flagdrop/evaluator` is that single source of truth. Consumers pass in a config file (fetched from wherever — S3, GCS, Azure Blob, an API, a JSON file) and the user context they have on hand. The evaluator returns the flag value. Config delivery and context collection are not its problem.

## API

### `evaluateFlag(config, flagKey, context?)`

Evaluates a flag against the provided context.

Evaluation order:
1. Look up the flag by key — return `{ found: false }` if missing.
2. If `enabled: false`, return the `defaultValue`.
3. Check per-user targets — if any match, return their `serveValue`.
4. Walk `rules` in order — first match returns its `serveValue`.
5. If a `rollout` is configured, hash the user's rollout attribute and return either the flag's value or the `defaultValue` based on bucket.
6. Otherwise return the flag's value (for no-rollout flags) or `defaultValue`.

### `matchRule(rule, context)`

Evaluates a single targeting rule against a context. Exposed for advanced consumers building custom eval flows.

### `isInRollout(identifier, percentage, salt)`

Deterministically checks whether an identifier is inside a percentage bucket. Uses FNV-1a hashing with a flag-key salt for isolation between rollouts.

### `fnv1aHash(input)`

Low-level FNV-1a 32-bit hash. Public for use cases that need the same bucketing math outside the evaluator (e.g. reproducing a bucket in a query).

### Types

All exported: `ConfigFile`, `ConfigFlag`, `Target`, `Rule`, `Rollout`, `EvaluationContext`, `UserContext`, `EvalResult`.

## Compatibility

- Node 18+
- All evergreen browsers
- Cloudflare Workers, Vercel Edge, AWS Lambda (including Lambda@Edge), Google Cloud Functions
- Deno (via npm: specifier)

## Used by

- Every FlagDrop SDK (backend + browser)
- FlagDrop's customer-hosted evaluators (S3 Lambda, GCS Cloud Function, Azure Functions)
- [FlagDrop's OpenFeature providers](https://github.com/flagdrop-io)

## Contributing

This package is public source for transparency, but external PRs are currently reviewed by the FlagDrop team. File issues against the main [FlagDrop project](https://github.com/flagdrop-io) if something doesn't evaluate the way you expect.

## License

MIT © FlagDrop
