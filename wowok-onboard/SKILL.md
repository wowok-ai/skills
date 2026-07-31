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
- Enforces dependency order: Permission → Service → Machine → Progress → Guard → Allocation → Order → Publish
- Persists checkpoints after each round via `local_info_operation` so users can resume
- Hands off to [wowok-provider](../wowok-provider/SKILL.md) once the Service is published

### When to Invoke

- New user with no published Service on the current account
- User explicitly asks to set up / open / start a shop
- User resumes a previously interrupted onboarding (read checkpoint first)
- Do NOT invoke for: tuning an existing Service, handling live orders, dispute resolution

### Output Contract

A published Service with: published Machine, bound Progress, validated Guards, configured order_allocators, and one successful test order digest. Handoff packet includes all object IDs and the post-publish verification report.

---

## MCP Project Pipeline Integration

The onboarding flow is backed by the MCP SQLite-based project pipeline. Each step produces verifiable state — the AI MUST honor risk/blocking findings by stopping and fixing reported issues:

| Step | Rounds | MCP Action | Gate |
|------|--------|------------|------|
| 1. Create Project | R1-R2 | `create_project` (pass `project_industry`) → project record + scenario defaults | — |
| 2. Add Objects | R3-R8 | `add_object` for each on-chain object (Service, Machine, Guards, Allocators) | — |
| 3. Build Graph | After R8 | `build_graph` → object dependency graph from added objects | — |
| 4. Evaluate | After graph built | `evaluate_project` (evaluation_type='risk') → risk assessment | CRITICAL risks block R9 |

## R1-R10 Build Order

| Round | Object | MCP Operation | Key Decision |
|-------|--------|---------------|--------------|
| R1 | Account | `account_operation.gen` + `faucet` | New or reuse? |
| R2 | Industry mode | `project_operation.create_project` (pass `project_industry`) | Which driving mode? |
| R3 | Service | `onchain_operations.service` CREATE | Name, type_parameter, description |
| R4 | Permission | `onchain_operations.permission` CREATE/REUSE | Index 1000 = provider/merchant (customer uses `namedOperator:""` = OrderHolder; arbiter is NOT a Permission index — arbiters live in `Arbitration.voting_guard`) |
| R5 | Machine | `onchain_operations.machine` CREATE | Nodes, forwards (mode defaults from MCP) |
| R6 | Progress | `onchain_operations.progress` CREATE + bind | Mirror Machine nodes |
| R7 | Guards | `onchain_operations.guard` CREATE + `gen_passport` test | 5 Guard templates (mode defaults from MCP) |
| R8 | Allocation | `onchain_operations.allocation` CREATE + `service.order_allocators` | Fund split (mode defaults from MCP) |
| R9 | Test order | `onchain_operations.order` CREATE + `progress` advance + `allocation.alloc_by_guard` | Full flow dry run |
| R10 | Publish | `onchain_operations.machine` publish + `service` publish | Pre-publish audit must PASS |

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
| 7 | Test order placed | R9 test order created + Progress advanced + Allocator triggered successfully |

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
