---
name: wowok-onboard
description: |
  WoWok First-Touch Onboarding — guides a new user from zero to their first
  published Service in a structured 10-round dialogue. Bridges the operation_type
  wall and the object_type wall by sequencing every MCP call into a dependency-
  correct build order.

  Use when a new user says "I want to open a shop", "I want to sell something",
  "how do I start", or has no published Service yet. Produces a complete merchant
  capability stack: Permission + Service (published) + Machine (published) +
  Progress (bound) + Guards + Allocation, verified by a test order.

  Not for existing merchants tuning operations — hand off to wowok-provider.
when_to_use:
  - User is new to WoWok and wants to set up a service
  - User says "open a shop", "create a service", "start selling", "onboard"
  - User has no published Service yet on the current account
  - User completed account creation and asks "what's next"
  - User resumes an interrupted onboarding (read checkpoint state)
---

# WoWok First-Touch Onboarding

Guides a new merchant from zero to first published Service in 10 rounds. Each round collects one core decision, calls specific MCP operations, and verifies success before advancing.

> **Related Skills**: [wowok-provider](../wowok-provider/SKILL.md) (post-onboard operations), [wowok-machine](../wowok-machine/SKILL.md) (workflow design)

---

## MCP Knowledge Layer

The following content has been pushed down to the MCP knowledge layer and is applied automatically — this Skill no longer duplicates it:

| Content | MCP Knowledge Module | Applied Via |
|---------|---------------------|-------------|
| Scenario mode details (per-industry Permission/Machine/Guard/Allocator defaults) | `knowledge/scenario-modes.ts` (`SCENARIO_MODES`, `matchScenarioMode`, `inferScenarioTraits`) | `project_operation.create_project` — auto-applied when `project_industry` parameter is passed |
| Safety rules (immutability, confirmation, object reuse) | `knowledge/safety-rules.ts` (`CONFIRMATION_RULES`) | Pre-publish checks + `project_operation.evaluate_project` |
| Guard / Machine design rules | `knowledge/guard-design-patterns.ts`, `machine-risk.ts` | `project_operation.evaluate_project` |

This Skill keeps the **overall onboarding flow** and **R1-R10 build order** (see below). Pass the user's industry to `create_project` (via `project_industry` parameter) and the MCP layer auto-fills the scenario defaults — no need to look up per-industry presets manually.

---

## Overview

The onboarding skill dismantles the "16 operation_type × 14 object_type" wall. Instead of presenting users with a flat tool catalog, it walks them through a dependency-correct build sequence where each round maps to one object type and references exactly the MCP operations needed.

### What This Skill Does

- Converts "I want to open a shop" into a 10-round guided build plan
- Industry defaults auto-applied via `project_operation.create_project` (pass `project_industry` parameter; defaults sourced from MCP `knowledge/scenario-modes.ts`)
- Enforces dependency order: Permission → Machine (create) → Guards → Machine (bind guards+publish) → Service Phase 1 (configure) → Service Phase 2 (publish) → Test Order → Mainnet
- Persists checkpoints after each round via `local_info_operation` so users can resume
- Hands off to [wowok-provider](../wowok-provider/SKILL.md) once the Service is published

### When to Invoke

- New user with no published Service on the current account
- User explicitly asks to set up / open / start a shop
- User resumes a previously interrupted onboarding (read checkpoint first)
- Do NOT invoke for: tuning an existing Service, handling live orders, dispute resolution

### Output Contract

A published Service with: published Machine, published Service, validated Guards, configured order_allocators, and one successful test order digest (order → progress advance → allocation). Handoff packet includes all object IDs and the post-publish verification report.

---

## MCP Project Pipeline Integration

The onboarding flow is backed by the MCP SQLite-based project pipeline. Each step produces verifiable state — the AI MUST honor risk/blocking findings by stopping and fixing reported issues:

| Step | Rounds | MCP Action | Gate |
|------|--------|------------|------|
| 1. Create Project | R1-R2 | `create_project` (pass `project_industry`) → project record + scenario defaults | — |
| 2. Add Objects | R2-R7 | `add_object` for each on-chain object (Permission, Machine, Guards, Service) | — |
| 3. Build Graph | After R7 | `build_graph` → object dependency graph from added objects | — |
| 4. Evaluate | After graph built | `evaluate_project` (evaluation_type='risk') → risk assessment | CRITICAL risks block R9 |

> **Async mode**: `build_graph` / `evaluate_project` accept `async_mode: true` for large projects — the call returns immediately with a `task_id`. Poll `query_task_status` with that `task_id` until `status: "completed"` before reading results / proceeding to the next step. Default is synchronous (`async_mode` omitted) — fine for the ≤10-object onboarding scale.

## R1-R10 Build Order (MCP-Validated)

**Core principles (from MCP schema):**
- `service.machine` must reference a **published** Machine (Service cannot bind unpublished Machine)
- `service.order_allocators` is L1-locked — MUST be set BEFORE `service.publish` (per service.move:503)
- Guard uses **LocalMark NAME** in table to break circular dependency (Guard→Service→Guard)
- `order_new` (test order) only works when `service.bPublished=true` (else E_NOT_PUBLISHED)
- **Recommended order**: Permission → Machine (create nodes/forwards) → Guards → Machine (bind guards to forwards) → Machine (publish) → Service Phase 1 (configure) → Service Phase 2 (publish) → Test Order

| Round | Phase | Object | MCP Operation | Key Decision |
|-------|-------|--------|---------------|--------------|
| R1 | Foundation | Project + Account | `project_operation.create_project` (pass `project_industry`) + `account_operation.gen` + `faucet` | Industry mode + new/reuse account |
| R2 | Foundation | Permission | `onchain_operations.permission` CREATE/REUSE | Index 1000 = provider |
| R3 | Foundation | Machine | `onchain_operations.machine` CREATE (nodes/forwards, guards optional inline) | Nodes, forwards, optional inline guards |
| R4 | Foundation | Guards | `onchain_operations.guard` CREATE (multiple) | Buy guard, accept guard, refund guard — use LocalMark NAME for Service references |
| R5 | Foundation | Machine guard binding | `onchain_operations.machine` MODIFY (bind guards to forwards) | `op: "add forward"` or `op: "set"` to update forward guard fields; Machine must still be unpublished |
| R6 | Foundation | Machine publish | `onchain_operations.machine` publish | Machine must be published before Service can reference it |
| R7 | Revenue | Service Phase 1 | `onchain_operations.service` CREATE (no publish) + set `machine` + `order_allocators` + `buy_guard` + `sales` + `arbitrations` (if compensation) | All L1-locked fields (machine, order_allocators) MUST be set here |
| R8 | Audit | Pre-publish audit | `machineNode2file` export + `guard2file` export + `project_operation.evaluate_project` | All CRITICAL risks must be fixed before R9 |
| R9 | Publish | Service Phase 2 | `onchain_operations.service` publish=true | Only flips publish flag; L1 fields already locked |
| R10 | Test + Mainnet | Test order + Mainnet | `onchain_operations.service` `order_new` → `onchain_operations.progress` advance → `onchain_operations.allocation` `alloc_by_guard` → Re-run R2-R9 on mainnet | Full flow dry run: order → progress → allocation; Recommend testnet first, then mainnet |

**Guard binding to Machine forwards**: Two approaches:
1. **Inline (R3)**: Set guards directly in `MachineForwardSchema.guard` during Machine CREATE — guards must already exist
2. **Deferred (R5)**: Create Machine first without guards (R3), create Guards (R4), then bind guards to forwards via `op: "add forward"` or `op: "set"` — allows Guards to reference Machine by LocalMark name

Use approach 2 when Guards need to reference the Machine (e.g., verify current node or forward name). Use approach 1 for simple Guards that don't reference the Machine.

**Circular dependency handling**: Guard that references Service → create Guard first with LocalMark NAME in table (not address), then reference Guard by name in Service Phase 1. LocalMark name is resolved to address at transaction build time.

**R-M1-11 compliance** (rental/refund scenarios): Machine MUST use routing nodes (`return_approved`, `damage_confirmed`, `arbiter_rule`), NOT terminal nodes (`deposit_refunded`, `refunded`). Refund is handled by Allocator, not Machine terminal nodes.

---

## Industry Selection Guide

When the user describes their business (R2), match to one of the supported industry modes. The MCP layer auto-fills scenario defaults when `project_industry` is passed to `create_project`.

| Industry | Mode | One-line Description |
|----------|------|----------------------|
| `general` | `general` | Free-form / hybrid — no presets, full manual control |
| `retail` | `general` (retail profile) | Physical goods sales with stock + WIP product listings |
| `service` | `general` (service profile) | Intangible services (consulting, design) — milestone delivery |
| `rental` | `rental` | Equipment / vehicle / property rental with deposit escrow + return inspection (R-M1-11 compliant — uses `return_approved`/`damage_confirmed`/`arbiter_rule` routing nodes, NO `deposit_refunded`/`deposit_deducted`/`refunded` terminal nodes; topology auto-applied by `project_operation.create_project` with `project_industry='rental'` from MCP `knowledge/scenario-modes.ts`) |
| `freelance` | `freelance` | Design / dev / consulting — milestone allocation + acceptance gate |
| `education` | `education` | Courses / training / tutoring — periodic release per session attendance |
| `travel` | `travel` | Custom tours / multi-segment trips — multi-tier allocation per segment |
| `subscription` | `subscription` | SaaS / content membership / periodic service — periodic charge + cancel guard |

> If unsure which fits, call `project_operation` action='recommend_industry' with the user's business description — it returns top-3 industry matches with reference examples. To iterate a mode mid-onboarding, use action='derive_user_mode' / 'evolve_user_mode' (user mode registry in MCP).

---

## Deployment Checklist

Before declaring onboarding complete, verify ALL items. Each is a hard gate — a missing item blocks successful order flow.

| # | Item | How to Verify |
|---|------|---------------|
| 1 | Permission created | `query_toolkit` (onchain_objects, type=permission) returns object |
| 2 | Machine published | `query_toolkit` (onchain_objects, type=machine) → `bPublished: true` |
| 2b | **R-M1-11 compliance** (rental / deposit / refund scenarios only) | `machineNode2file` export → grep node names; MUST NOT contain `deposit_refunded`/`deposit_deducted`/`refunded`; MUST contain routing nodes (`return_approved`/`damage_confirmed`/`arbiter_rule`) with bound Allocators (item 4) |
| 3 | Guards created | `query_toolkit` (onchain_objects, type=guard) returns all expected guards |
| 4 | Allocators configured | Each Allocator `sharing[].sharing` Rate entries sum to **10000** (Rate mode); or `Amount` mode values set. For rental/refund scenarios, verify Allocators' `trigger_node` references the routing nodes (e.g., `return_approved`) — NOT missing (else R-M1-11 refund path is broken) |
| 5 | Service created with all bindings | `query_toolkit` (onchain_objects, type=service) → machine, order_allocators, buy_guard all non-empty |
| 6 | Service published | `query_toolkit` (onchain_objects, type=service) → `bPublished: true` |
| 7 | Test order placed | R9 test order created via `service.order_new` + Progress advanced + Allocator triggered successfully |

> If any item fails, do NOT proceed to handoff. Fix the underlying issue, then re-verify. Use `project_operation.evaluate_project` (risk) to auto-detect missing bindings.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `dynamicFieldNotFound` | SDK cannot resolve a dynamic field reference | Set `env.account` (account not configured) — pass account in the tool call wrapper |
| `Circular dependency` (Guard ↔ Service creation) | Guard needs Service address; Service needs Guard address | Use **LocalMark NAME** (not address) in Guard query table — pattern documented in MCP `schema_query` action='get_guard_design_patterns' |
| `order.balance invalid` | Used wrong field for order amount | Use `order.amount` (not `order.balance` — `balance` is residual escrow, `amount` is original payment) |
| Allocator `rate sum != 10000` | Rate-mode Allocator sharing percentages don't sum to 100% | Ensure all `sharing[].sharing` values in Rate mode sum to exactly **10000** basis points (e.g., 80% = 8000) |
| `IMPACK_GUARD_NOT_FOUND` (gen_passport) | Repository query with `quote_guard = Some(addr)` | `impack_list` is empty during verify phase — only `quote_guard = None` passes; see MCP `schema_query` action='get_guard_design_patterns' |
| `Permission denied` (Progress advance, abort code 5) | Wrong operation path for forward's `namedOperator` | Empty `namedOperator` → use `order.progress`; non-empty → use `progress.operate`; `permissionIndex` → use `progress.operate` |
| Allocator never fires (refund stuck) — R-M1-11 violation | Machine has a node like `deposit_refunded` instead of routing node `return_approved`; or Allocator's `trigger_node` is missing/mispelled | Rename node to `return_approved` / `damage_confirmed`; bind Allocator to that node; R-M1-11 is auto-enforced by MCP pre-publish checks and `project_operation.evaluate_project` |
