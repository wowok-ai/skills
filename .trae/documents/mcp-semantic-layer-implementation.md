# Implementation Plan: MCP Semantic Layer (Critical Path)

## Context

The WoWok MCP server returns raw Sui transaction responses. AI must perform 3-4 inference steps per call to understand "what happened, succeeded or not, what's next" — parsing `objectType` strings, correlating `objectChanges`/`events`/`balanceChanges`, and re-deriving business meaning every time. This burns context, causes errors, and blocks the Harness Expect/Verify loops and the Tauri client rendering from having a clean input.

This change adds an optional `semantic` field to `CallOutput` that pre-translates business meaning (intent / status / one-line summary / object roles / fund roles / next_actions / warnings) plus structured error fields (`error_code` / `retryable` / `recovery_hint`). It is the foundation for the AI-understandability goals and the Loop Engineering flywheel — rule tables are data-driven precisely so AI can evolve them.

This plan covers the critical path: schemas + classifier + builder + wiring for the `onchain_operations` flow (16 operation types) + JSON-schema regeneration + tests. Bridge / local / query tools are immediate follow-ups.

## Codebase facts the design rests on

- **Single chokepoint**: `handleCallResult(result)` in handler.ts (schema/call) L29-132 builds every `CallOutput` for onchain/query/local tools via 6 branches (error / tx-success / tx-failure / submission / array / null-default).
- **Intent context at call sites**: index.ts `handleOnchainOperations` L435-710 has a `switch(validated.operation_type)` over 16 cases; each calls `handleCallResult(result)` — it already knows `operation_type` + `validated.data` but doesn't pass them.
- **Missed bypass**: index.ts catch block (~L697-709) builds an error `CallOutput` directly, skipping `handleCallResult`. Must be patched or routed through it.
- **Schema defs**: base.ts (schema/call) L179-182 `CallOutputSchema = {result, message?}.strict()`; L108-112 `CallResponseErrorSchema`; L149-163 `CallResultSchema` discriminated union on `type`.
- **JSON-schema regen is mandatory**: `pnpm generate:schemas` runs `tsx scripts/generate-json-schemas.ts` (zod-to-json-schema) to emit the schemas MCP clients discover. Adding `semantic` requires re-running so clients see it.
- **No test runner** in package.json (only `tsc && generate:schemas`; uses `tsx`). Existing "tests" are inline `safeParse` calls.

## Approach

### 1. Schemas — base.ts (schema/call)

Add (all fields `optional`, backward-compatible):
- `ObjectRoleSchema` = `{ id, name?: string|null, role: enum(16 values + Other), relation?: {parent?, relation_type?}, immutable?: boolean }`
- `FundRoleSchema` = `{ amount, coinType, role: enum(payment/refund/change/compensation/reward/gas/deposit/release/other), from?, to? }`
- `NextActionSchema` = `{ action, reason, tool?, prerequisite?, priority: enum(required/recommended/optional) }`
- `SemanticSummarySchema` = `{ intent, status: enum(success/partial/failed/pending_input), summary, created?: ObjectRole[], modified?: ObjectRole[], released?: FundRole[], next_actions?: NextAction[], warnings?: string[] }`
- `CallOutputSchema` += `semantic: SemanticSummarySchema.optional()`
- `CallResponseErrorSchema` += `error_code?: enum(9 values), retryable?: boolean, recovery_hint?: string, related_object?: string`
- Export types: `SemanticSummary`, `ObjectRole`, `FundRole`, `NextAction`, `SemanticContext`

`role` enum values: `Permission | Guard | Machine | Progress | Service | Order | Allocation | Arbitration | ArbCase | Messenger | Contact | Demand | Reward | Personal | Repository | Treasury | Discount | Other`.
`error_code` enum values: `invalid_parameter | guard_rejected | state_conflict | insufficient_balance | object_not_found | permission_denied | immutable_violation | network_error | unknown`.

Descriptions on new fields follow the four-part spec (semantics / constraint / relation / example) in English.

### 2. New module — semantic.ts (schema/call)

**Data-driven rule tables** (TS const arrays with signal fns + confidence) — the form best for Loop Engineering evolution (add a rule = add an array entry, no control-flow edits, full type-checking):

```ts
type IntentRule = { op_type: string; signal: (d:any)=>boolean; intent: string; confidence: number };
const INTENT_RULES: IntentRule[] = [
  { op_type:"service", signal:d=>d.publish===true, intent:"publish_service", confidence:0.95 },
  { op_type:"service", signal:d=>!!d.order_new,   intent:"create_order",   confidence:0.9 },
  { op_type:"service", signal:d=>!!d.sales,        intent:"operate_sales",  confidence:0.85 },
  { op_type:"service", signal:d=>typeof d.object==="object", intent:"create_service", confidence:0.8 },
  // ... 16 op_types
];
```

Exports:
- `interface SemanticContext { operation_type: string; data: any }`
- `buildSemantic(result, context): SemanticSummary | undefined` — low-confidence → `undefined` (never guess)
- `classifyError(msg): { error_code, retryable, recovery_hint? }` — string pattern table, `unknown` fallback

Internals: `inferIntent` (iterate INTENT_RULES, first match ≥0.7), `inferStatus` (from result shape), `composeSummary`, `tagObjectRoles` (parse `objectChanges[].objectType` — strip generics `replace(/<.*>/,"")`, split `"::"`, last segment → role; cover Service/Machine/Guard/Order first, else `Other`), `tagFundRoles` (framework: amount sign + owner), `inferNextActions` (rule table), `inferWarnings`.

~300 lines, one file. Split only if it exceeds ~400.

### 3. Wire chokepoint — handler.ts (schema/call)

Extend signature: `handleCallResult(result, context?: SemanticContext)`. **Per-branch enrichment** (each branch has different data, not a single end-call):
- error branch + tx-failure branch: call `classifyError(enrichedError)` → inject `error_code/retryable/recovery_hint`
- tx-success branch: call `buildSemantic(safeResult, context)` (richest — has `objectChanges`/`balanceChanges`/`events`)
- submission branch: `buildSemantic` with `intent:"guard_submission_required"`, `next_actions:[{action:"fill guard submission", priority:"required"}]`
- array/null/default: `buildSemantic` returns undefined unless context yields clear intent

`context` optional → no-context calls behave exactly as before (backward compat).

### 4. Wire call sites — index.ts (MCP main)

Each of 16 cases: `handleCallResult(result, { operation_type: "<case>", data: validated.data })`. **Patch the catch block (~L697-709)** to route through `handleCallResult({error: errorMessage}, context)` or call `classifyError` inline so errors also get structured fields.

### 5. Regenerate JSON schemas

`pnpm generate:schemas` — mandatory so MCP clients discover `semantic` and the error fields.

### 6. Tests — add vitest

Add `vitest` to devDependencies, `vitest.config.ts` (`{test:{globals:true, include:["tests/**/*.spec.ts"]}}`), scripts `"test":"vitest run"`, `"test:watch":"vitest"`. Specs under `tests/semantic/`:
- `classifyError.spec.ts` — each error_code ≥1 match + unknown fallback + retryable booleans
- `inferIntent.spec.ts` — each op_type's intent signals
- `tagObjectRoles.spec.ts` — `0x2::service::Service`→Service, `0x2::coin::Coin<0x2::wow::WOW>`→Other (Coin not in v1 set), unknown→Other
- `buildSemantic.spec.ts` — tx success/failure/submission/data; context=unknown op → undefined; no-context → undefined semantic

Reused utility: existing `strictParse` (base.ts L6) and `enrichMoveError` (from `@wowok/wowok`) — already used in handler.ts, keep using for error enrichment before `classifyError`.

## Ordering (S-3 before S-2 — errors are simpler, validate plumbing first)

1. S-1 schemas in base.ts (0.5d)
2. S-3 `classifyError` + error-branch wiring in handler.ts (1d)
3. S-2 `buildSemantic` + tx-success/submission wiring (2d)
4. S-4 16 call sites in index.ts + catch-block patch (0.5d)
5. `pnpm generate:schemas` (0.1d)
6. vitest specs written alongside S-3 & S-2 (test-first for rule tables) (1d)

~5 days, matches the task-breakdown doc's parallel estimate.

## Out of scope (immediate follow-ups)

- S-6 bridge-handler `ok`/`err` adaptation
- S-7 local ops (account/mark/info)
- S-8 query tools
- S-9 telemetry hooks (Loop Engineering base)
- Full FundRole attribution table; full role mapping beyond Service/Machine/Guard/Order (framework only this batch)
- EventSemantic registry (needs contract team)
- Four-part description rewrite of *existing* fields (only new fields this batch)

## Verification

End-to-end checks after implementation:

1. **Build**: `pnpm build` (tsc + generate:schemas) passes; no type errors.
2. **JSON schemas updated**: confirm `semantic` appears in generated JSON schema for CallOutput (grep generated file).
3. **Unit tests**: `pnpm test` green — all 4 spec files.
4. **Backward compat**: `CallOutputSchema.parse({result:{type:"null"}})` succeeds (no semantic); `handleCallResult(result)` with no context returns output without semantic.
5. **Live smoke test** (via `pnpm start` + an MCP client or a tsx script calling `handleOnchainOperations`):
   - service publish success → `semantic.intent="publish_service"`, `status="success"`, `next_actions` suggests sharing service id; `created`/`modified` tags Service with role.
   - service publish failing with "machine not published" → `error_code="state_conflict"` (or immutable_violation), `retryable=false`, `recovery_hint` set.
   - order advance returning submission → `status="pending_input"`, `next_actions=[{action:"fill guard submission", priority:"required"}]`.
   - gas-insufficient failure → `error_code="insufficient_balance"`, `retryable=true`.
6. **AI-understandability check**: feed 3 semantic outputs to an LLM, ask it to state what happened / next step — must succeed reading `semantic` alone, without raw `transaction`.

## Critical files

- base.ts (schema/call) — add schemas + optional fields + type exports
- semantic.ts (schema/call) — NEW: buildSemantic, classifyError, data-driven rule tables
- handler.ts (schema/call) — extend handleCallResult signature + per-branch enrichment
- index.ts (MCP main) — 16 call sites pass context + catch-block patch (L435-710, ~L697-709)
- package.json (MCP) — add vitest devDep + scripts
- vitest.config.ts (MCP) — NEW
- tests/semantic/*.spec.ts — NEW: 4 spec files
- scripts/generate-json-schemas.ts — verify CallOutput included (likely already); run via `pnpm generate:schemas`
