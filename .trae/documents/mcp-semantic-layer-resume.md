# Plan: Resume and Complete MCP Semantic Layer Implementation

## Summary

Resume and complete the MCP semantic layer (S-3 → S-2 → S-4 → JSON schema regeneration → vitest), providing an AI-directly-understandable business semantics foundation for the subsequent Phase 1 industry templates (freelance + rental) and the MCP-native Tauri local client.

The 5 strategic convergence decisions the user most recently confirmed (Phase 1 = freelance + rental; Client = MCP-first local deployment, no centralized web; Telemetry = no explicit consent required; Mode marketplace = official review + community scoring; Tech stack = Tauri cross-platform local client) have been recorded and will guide the subsequent Phase 1 plan, **and are out of scope for this plan**.

## Current State Analysis (based on actual file reads)

### ✅ S-1 Complete — base.ts (schema/call)
- `ObjectRoleSchema` (L109-122): 18-value role enum + relation sub-object
- `FundRoleSchema` (L125-131): 9-value fund role enum
- `NextActionSchema` (L134-140): action/reason/tool/prerequisite/priority
- `SemanticSummarySchema` (L143-152): intent/status/summary/created/modified/released/next_actions/warnings
- `CallResponseErrorSchema` (L155-162): extended `error_code` (9-value enum)/`retryable`/`recovery_hint`/`related_object`
- `CallOutputSchema` (L229-233): new optional `semantic` field
- Type exports: `ObjectRole`, `FundRole`, `NextAction`, `SemanticSummary`
- `npx tsc --noEmit` passed

### 🔄 S-3 Half Complete
- `semantic.ts` (schema/call): `SemanticContext` interface, `ErrorCode` type, `ErrorClassification` interface, `ERROR_RULES` table (8 rules + fallback), `classifyError(errorMsg)` function — **all implemented**
- `handler.ts` (schema/call): L7 already has `import { classifyError } from "./semantic.js"` — **import done**
- **Not done**: two error branches (L35-45 error branch, L54-67 tx-failure branch) still construct raw `{ type: "error", error: enrichedError }`, do not call classifyError, do not inject `error_code`/`retryable`/`recovery_hint`

### ⏳ S-2 Not Started
- `semantic.ts` L142-145: `buildSemantic` is still a placeholder comment
- `handler.ts`: tx-success branch (L69-79) and submission branch (L83-95) do not inject `semantic`
- `handleCallResult` signature not extended with context parameter

### ⏳ S-4 Not Started
- `index.ts` (MCP main) `handleOnchainOperations` (L435-710):
  - 16 cases (L456-694): service, machine, progress, repository, arbitration, contact, treasury, reward, allocation, permission, guard, personal, payment, demand, order, gen_passport — each calls `handleCallResult(result)` without context
  - catch block (L697-709): directly constructs an error CallOutput, bypassing handleCallResult (no error classification)

### ⏳ Other Not Started
- JSON schema regeneration not executed (MCP clients cannot discover new fields)
- vitest not configured (package.json has no test script, no vitest devDep)

## Proposed Changes

### Change 1 — S-3 Complete: handler.ts error branch wiring

**File**: handler.ts (schema/call)

**1a. Error branch (currently L35-45)**

Current code:
```typescript
if (safeResult && "error" in safeResult) {
    const enrichedError = enrichMoveError(safeResult.error);
    const output: CallOutput = {
        message: `Error: ${enrichedError}`,
        result: { type: "error" as const, error: enrichedError },
    };
    return { content: [...], structuredContent: output };
}
```

Change to:
```typescript
if (safeResult && "error" in safeResult) {
    const enrichedError = enrichMoveError(safeResult.error);
    const classified = classifyError(enrichedError);
    const output: CallOutput = {
        message: `Error: ${enrichedError}`,
        result: {
            type: "error" as const,
            error: enrichedError,
            error_code: classified.error_code,
            retryable: classified.retryable,
            recovery_hint: classified.recovery_hint,
        },
    };
    return { content: [...], structuredContent: output };
}
```

**1b. Tx-failure branch (currently L54-67)**

Same pattern: call `classifyError(enrichedError)`, inject `error_code`/`retryable`/`recovery_hint`.

**Why**: `handleCallResult` is the single chokepoint where all onchain tools build CallOutput. Injecting once here means all 16 cases automatically get structured error classification, driving Recover Loop strategy selection.

**Verification**: `npx tsc --noEmit` passes (in the MCP directory).

---

### Change 2 — S-2 Implementation: buildSemantic + tx-success/submission branch wiring

**File**: semantic.ts (schema/call) (appended after classifyError)

**2a. INTENT_RULES rule table + inferIntent**

Data-driven rule table covering 16 operation_types. Each rule: `{ operation_type, signals?, intent, confidence }`. signals is an optional data field check function (used to distinguish sub-intents under the same operation_type, e.g., create vs publish for service).

```typescript
interface IntentRule {
    operation_type: string;
    signals?: (data: any) => boolean;  // optional sub-intent discrimination
    intent: string;
    confidence: number;
}

const INTENT_RULES: IntentRule[] = [
    { operation_type: "service", signals: d => d?.publish === true, intent: "publish_service", confidence: 0.95 },
    { operation_type: "service", signals: d => d?.name && !d?.publish, intent: "create_service", confidence: 0.9 },
    { operation_type: "service", intent: "modify_service", confidence: 0.7 },
    { operation_type: "machine", intent: "configure_machine", confidence: 0.9 },
    { operation_type: "progress", intent: "update_progress", confidence: 0.9 },
    { operation_type: "order", signals: d => d?.arb, intent: "apply_arbitration", confidence: 0.9 },
    { operation_type: "order", intent: "manage_order", confidence: 0.85 },
    { operation_type: "payment", intent: "send_payment", confidence: 0.95 },
    { operation_type: "reward", intent: "manage_reward", confidence: 0.9 },
    { operation_type: "demand", intent: "post_demand", confidence: 0.9 },
    { operation_type: "treasury", intent: "manage_treasury", confidence: 0.9 },
    { operation_type: "allocation", intent: "allocate_funds", confidence: 0.9 },
    { operation_type: "permission", intent: "manage_permission", confidence: 0.9 },
    { operation_type: "guard", intent: "configure_guard", confidence: 0.9 },
    { operation_type: "arbitration", intent: "manage_arbitration", confidence: 0.9 },
    { operation_type: "contact", intent: "manage_contact", confidence: 0.9 },
    { operation_type: "repository", intent: "manage_repository", confidence: 0.9 },
    { operation_type: "personal", intent: "manage_personal", confidence: 0.9 },
    { operation_type: "gen_passport", intent: "generate_passport", confidence: 0.95 },
];

function inferIntent(operation_type: string, data: any): string {
    const rules = INTENT_RULES.filter(r => r.operation_type === operation_type);
    // prefer rules with signals
    const signaled = rules.find(r => r.signals && r.signals(data));
    if (signaled) return signaled.intent;
    // otherwise fall back to rules without signals
    const fallback = rules.find(r => !r.signals);
    return fallback?.intent ?? operation_type;
}
```

**2b. inferStatus**

```typescript
function inferStatus(safeResult: any): "success" | "partial" | "failed" | "pending_input" {
    // pending_input is handled separately by the submission branch, not returned here
    if (safeResult && "error" in safeResult) return "failed";
    if (safeResult && "digest" in safeResult) {
        return safeResult?.effects?.status?.status === "success" ? "success" : "failed";
    }
    return "success";  // data/null/array branch
}
```

**2c. tagObjectRoles**

Strip generics → split "::" → take last segment → map to role enum.

```typescript
function objectTypeToRole(objectType: string): ObjectRole["role"] {
    if (!objectType) return "Other";
    const base = objectType.replace(/<.*>/, "").trim();
    const segments = base.split("::");
    const last = (segments[segments.length - 1] || "").toLowerCase();
    const map: Record<string, ObjectRole["role"]> = {
        service: "Service", machine: "Machine", progress: "Progress",
        permission: "Permission", guard: "Guard", order: "Order",
        arb: "Arbitration", arbcase: "ArbCase", messenger: "Messenger",
        contact: "Contact", demand: "Demand", reward: "Reward",
        personal: "Personal", repository: "Repository", treasury: "Treasury",
        discount: "Discount", allocation: "Allocation",
    };
    return map[last] ?? "Other";
}

function tagObjectRoles(objectChanges: any[]): ObjectRole[] {
    if (!Array.isArray(objectChanges)) return [];
    return objectChanges
        .filter(c => c?.objectId || c?.object?.objectId)
        .map(c => {
            const id = c.objectId || c.object?.objectId;
            const type = c.objectType || c.object?.objectType || "";
            return {
                id,
                role: objectTypeToRole(type),
                immutable: c.objectType?.includes("Service") && c.type === "published",
            };
        });
}
```

**2d. tagFundRoles** (basic version, only payment/refund/gas three categories)

```typescript
function tagFundRoles(balanceChanges: any[], operation_type: string): FundRole[] {
    if (!Array.isArray(balanceChanges)) return [];
    return balanceChanges
        .filter(c => c?.amount || c?.coinType)
        .map(c => {
            const amount = String(c.amount || "0");
            const isNegative = amount.startsWith("-");
            let role: FundRole["role"] = "other";
            if (operation_type === "payment") role = isNegative ? "payment" : "refund";
            else if (operation_type === "reward") role = isNegative ? "reward" : "release";
            else if (operation_type === "treasury") role = isNegative ? "deposit" : "release";
            else role = isNegative ? "payment" : "release";
            return {
                amount,
                coinType: c.coinType || "",
                role,
                from: c.sender || null,
                to: c.recipient || null,
            };
        });
}
```

**2e. inferNextActions** (data-driven, covering key workflow advancement points)

```typescript
interface NextActionRule {
    when: (operation_type: string, data: any, status: string) => boolean;
    action: string;
    reason: string;
    tool?: string;
    priority: "required" | "recommended" | "optional";
}

const NEXT_ACTION_RULES: NextActionRule[] = [
    { when: (ot) => ot === "service", action: "publish the Service when configuration is complete", reason: "Service must be published before customers can order", tool: "onchain_operations (service with publish:true)", priority: "recommended" },
    { when: (ot) => ot === "service", action: "add Machine nodes to define the service workflow", reason: "Machine drives order state transitions", tool: "onchain_operations (machine)", priority: "recommended" },
    { when: (ot) => ot === "machine", action: "bind Progress to track order execution", reason: "Progress provides customer-visible status updates", tool: "onchain_operations (progress)", priority: "recommended" },
    { when: (ot) => ot === "order", action: "wait for customer payment or proceed to allocation", reason: "Order lifecycle: payment → allocation → completion", priority: "optional" },
    { when: (ot) => ot === "demand", action: "wait for presenter submissions or evaluate existing ones", reason: "Demand lifecycle: presenters submit solutions for reward", priority: "optional" },
    { when: (ot) => ot === "reward", action: "deposit funds into the reward pool", reason: "Reward pool must be funded before claimants can withdraw", tool: "onchain_operations (treasury)", priority: "recommended" },
];
```

**2f. inferWarnings** (business-level warnings)

```typescript
function inferWarnings(operation_type: string, data: any, safeResult: any): string[] {
    const warnings: string[] = [];
    // example: service without order_allocators configured
    if (operation_type === "service" && data?.order_allocators === undefined) {
        warnings.push("order_allocators not configured; order funds cannot be distributed automatically");
    }
    // example: reward balance is zero
    if (operation_type === "reward" && data?.balance === "0") {
        warnings.push("Reward pool balance is zero; claimants cannot withdraw");
    }
    return warnings;
}
```

**2g. composeSummary**

```typescript
function composeSummary(intent: string, status: string, created: ObjectRole[], modified: ObjectRole[], released: FundRole[], operation_type: string): string {
    const intentVerb = intent.replace(/_/g, " ");
    if (status === "failed") return `Failed to ${intentVerb}`;
    if (status === "pending_input") return `${intentVerb} requires Guard submission to proceed`;
    const parts: string[] = [];
    if (created.length) parts.push(`created ${created.length} object(s)`);
    if (modified.length) parts.push(`modified ${modified.length} object(s)`);
    if (released.length) parts.push(`${released.length} fund movement(s)`);
    return `Successfully ${intentVerb}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}
```

**2h. buildSemantic** (orchestration function)

```typescript
export function buildSemantic(safeResult: any, context?: SemanticContext): SemanticSummary | undefined {
    if (!context) return undefined;  // no context = backward compatible, do not inject semantic

    const intent = inferIntent(context.operation_type, context.data);
    const status = inferStatus(safeResult);

    const objectChanges = safeResult?.objectChanges || [];
    const balanceChanges = safeResult?.balanceChanges || [];

    const created = tagObjectRoles(objectChanges.filter((c: any) => c?.type === "created"));
    const modified = tagObjectRoles(objectChanges.filter((c: any) => c?.type === "mutated"));
    const released = tagFundRoles(balanceChanges, context.operation_type);

    const next_actions = NEXT_ACTION_RULES
        .filter(r => r.when(context.operation_type, context.data, status))
        .map(r => ({ action: r.action, reason: r.reason, tool: r.tool, priority: r.priority }));

    const warnings = inferWarnings(context.operation_type, context.data, safeResult);

    return {
        intent,
        status,
        summary: composeSummary(intent, status, created, modified, released, context.operation_type),
        created: created.length ? created : undefined,
        modified: modified.length ? modified : undefined,
        released: released.length ? released : undefined,
        next_actions: next_actions.length ? next_actions : undefined,
        warnings: warnings.length ? warnings : undefined,
    };
}
```

**2i. handler.ts signature extension + tx-success/submission branch wiring**

Extend signature (L30):
```typescript
export function handleCallResult(result: any, context?: SemanticContext): { content: any[]; structuredContent: CallOutput } {
```

Extend import (L7):
```typescript
import { classifyError, buildSemantic, type SemanticContext } from "./semantic.js";
```

Tx-success branch (L69-79): inject `semantic: buildSemantic(safeResult, context)`
Submission branch (L83-95): construct fixed semantic:
```typescript
const semantic: SemanticSummary = {
    intent: "guard_submission_required",
    status: "pending_input",
    summary: "Guard verification required — fill the submission data and resubmit",
    next_actions: [{
        action: "fill guard submission data and resubmit via call_with_submission",
        reason: "Guard rejected the call; submission must satisfy the Guard table requirements",
        tool: "onchain_operations (with submission field)",
        priority: "required",
    }],
};
```

**Why**: Per-branch enrichment (not a single end-of-function call), because the tx-success branch has objectChanges/balanceChanges/events, while the submission branch has no transaction data but has fixed semantics. The data-driven rule table form (TS const array + signal fns) is the best evolution form for Loop Engineering — adding a rule = adding an array entry, no control flow changes needed.

**Verification**: `npx tsc --noEmit` passes (in the MCP directory).

---

### Change 3 — S-4: 16 call site wiring + catch block patch

**File**: index.ts (MCP main)

**3a. 16 cases** (L456-694)

Each `handleCallResult(result)` → `handleCallResult(result, { operation_type: "<case>", data: validated.data })`

Specific 16 locations (gen_passport is an exception, using `{ operation_type: "gen_passport", data: { guard: validated.guard, info: validated.info } }`):
- service (L461), machine (L497), progress (L504), repository (L511), arbitration (L518), contact (L525), treasury (L532), reward (L541), allocation (L548), permission (L553), guard (L612), personal (L670), payment (L675), demand (L682), order (L689), gen_passport (L693)

**3b. catch block (L697-709)**

Change to route through handleCallResult so that catch errors also get classifyError classification:
```typescript
} catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return handleCallResult(
        { error: errorMessage },
        { operation_type: (validated as any)?.operation_type, data: (validated as any)?.data }
    );
}
```

Note: `validated` may be undefined when strictParse throws, so optional chaining + try-catch wrapping is needed. If `validated` is undefined, pass `undefined` context (handleCallResult is backward compatible).

**Why**: Wire all 16 cases at once so every onchain operation gets the semantic layer. Routing the catch block ensures parameter validation errors, file read errors, etc. also get structured classification (e.g., `invalid_parameter`).

**Verification**: `npx tsc --noEmit` passes (in the MCP directory).

---

### Change 4 — JSON Schema Regeneration

**Command** (in the MCP directory):
```bash
pnpm generate:schemas
```

**Why**: MCP clients discover tool input/output fields through JSON schema. The newly added `semantic`, `error_code`, `retryable`, `recovery_hint` must appear in the generated JSON schema, otherwise clients cannot detect them.

**Verification**: Check that the generated JSON schema file contains the `semantic` field definition.

---

### Change 5 — vitest Configuration + 4 spec files

**5a. package.json** (MCP package.json)

Add to devDependencies:
```json
"vitest": "^2.1.0"
```

Add to scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**5b. vitest.config.ts** (new file in MCP vitest.config.ts)

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        include: ["src/**/*.spec.ts"],
    },
});
```

**5c. 4 spec files** (new files in MCP __tests__ directory)

1. `classifyError.spec.ts` — test 8 error_code pattern matches + fallback to unknown
2. `inferIntent.spec.ts` — test 16 operation_type → intent mappings + signals sub-intent discrimination
3. `tagObjectRoles.spec.ts` — test objectType generics strip, `::` split, last segment → role enum mapping
4. `buildSemantic.spec.ts` — end-to-end: construct mock tx result + context, verify full SemanticSummary structure

**Why**: vitest is the first test infrastructure for this MCP package. 4 specs cover the core semantic layer logic, preventing rule table regressions.

**Verification**: `pnpm test` all pass.

## Assumptions and Decisions

1. **Semantic layer language**: English implementation (per user E4 decision: "English implementation. Other languages will be handled by the LLM automatically; the semantic layer core uses English")
2. **Data-driven rule tables**: TS const array + signal fns + confidence (best evolution form for Loop Engineering — adding a rule = adding an array entry, no control flow changes required, fully type-checked)
3. **Backward compatibility**: All new fields are optional; calling `handleCallResult` without context behaves identically to before (`buildSemantic(undefined, undefined)` returns `undefined`)
4. **objectType parsing**: Strip generics `replace(/<.*>/,"")`, split `"::"`, take last segment → role enum
5. **Single chokepoint**: `handleCallResult` is the only entry point for all onchain tools to build CallOutput
6. **Per-branch enrichment**: buildSemantic is called separately in each branch (not a single end-of-function call), because each branch has different available data
7. **FundRole basic version**: Only infers payment/refund/gas/deposit/release/reward six categories, does not involve full business context inference (out of scope)
8. **Phase 1 industries (freelance + rental) + Tauri client**: Out of scope for this plan, to be planned separately after the semantic layer is complete

## Out of Scope (per approved plan)

- Semantic enhancement for bridge/local/query tools (onchain_operations only)
- Full FundRole inference (basic six categories only)
- EventSemantic mapping
- Rewriting existing field descriptions
- Loop Engineering telemetry collection (no-consent requirement confirmed, but collection mechanism is a separate plan)
- Phase 1 industry templates (freelance + rental)
- Tauri local client

## Verification Steps

1. `npx tsc --noEmit` (in the mcp directory) — type check passes
2. `pnpm build` — build succeeds (tsc + generate:schemas)
3. `pnpm generate:schemas` — JSON schema regenerated
4. Check generated JSON schema contains `semantic` field, extended error fields (`error_code`/`retryable`/`recovery_hint`)
5. `pnpm test` — all 4 specs pass
6. Backward compatibility verification: calling `handleCallResult(result)` without context returns a CallOutput without the `semantic` field (identical to before)

## Task Checklist (execution order)

- [ ] **S-3a**: handler.ts error branch wiring (L35-45) — call classifyError, inject error_code/retryable/recovery_hint
- [ ] **S-3b**: handler.ts tx-failure branch wiring (L54-67) — same as above
- [ ] **S-3 verification**: `npx tsc --noEmit`
- [ ] **S-2a**: semantic.ts implement INTENT_RULES + inferIntent
- [ ] **S-2b**: semantic.ts implement inferStatus, objectTypeToRole, tagObjectRoles, tagFundRoles, NEXT_ACTION_RULES, inferNextActions, inferWarnings, composeSummary
- [ ] **S-2c**: semantic.ts implement buildSemantic
- [ ] **S-2d**: handler.ts extend signature (handleCallResult + context parameter) + import buildSemantic/SemanticContext + tx-success branch inject semantic + submission branch inject fixed semantic
- [ ] **S-2 verification**: `npx tsc --noEmit`
- [ ] **S-4a**: index.ts 16 cases pass context (service/machine/progress/repository/arbitration/contact/treasury/reward/allocation/permission/guard/personal/payment/demand/order/gen_passport)
- [ ] **S-4b**: index.ts catch block routes to handleCallResult
- [ ] **S-4 verification**: `npx tsc --noEmit`
- [ ] **schema regeneration**: `pnpm generate:schemas`, verify JSON schema contains new fields
- [ ] **vitest configuration**: package.json add vitest devDep + test script; create vitest.config.ts
- [ ] **vitest spec 1**: classifyError.spec.ts
- [ ] **vitest spec 2**: inferIntent.spec.ts
- [ ] **vitest spec 3**: tagObjectRoles.spec.ts
- [ ] **vitest spec 4**: buildSemantic.spec.ts
- [ ] **final verification**: `pnpm build` + `pnpm test` + check generated JSON schema