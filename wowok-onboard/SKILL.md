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
| Scenario mode details (per-industry Permission/Machine/Guard/Allocator defaults) | `knowledge/scenario-modes.ts` (`SCENARIO_MODES`, `matchScenarioMode`, `inferScenarioTraits`) | `project_operation.analyze_intent` — auto-applied when `industry` parameter is passed |
| Safety rules (immutability, confirmation, object reuse) | `knowledge/safety-rules.ts` (`CONFIRMATION_RULES`) | Pre-publish checks + `project_operation.aggregate_risks` |
| Guard / Machine design rules | `knowledge/guard-design-patterns.ts`, `machine-risk.ts` | `project_operation.aggregate_risks` |

This Skill keeps the **overall onboarding flow** and **R1-R10 build order** (see below). Pass the user's industry to `analyze_intent` and the MCP layer auto-fills the scenario defaults — no need to look up per-industry presets manually.

---

## Overview

The onboarding skill dismantles the "16 operation_type × 14 object_type" wall. Instead of presenting users with a flat tool catalog, it walks them through a dependency-correct build sequence where each round maps to one object type and references exactly the MCP operations needed.

### What This Skill Does

- Converts "I want to open a shop" into a 10-round guided build plan
- Industry defaults auto-applied via `project_operation.analyze_intent` (pass `industry` parameter; defaults sourced from MCP `knowledge/scenario-modes.ts`)
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

## MCP 5-Stage Pipeline Integration

The onboarding flow is gated by the MCP project-based 5-stage deployment pipeline. Each stage gates progression — the AI MUST honor `can_proceed: false` by stopping and fixing reported issues:

| Stage | Rounds | MCP Action | Gate |
|-------|--------|------------|------|
| 1. Project Naming | R1-R2 | Establish `project` + `version` namespace | — |
| 2. Business Puzzle | R2 | `analyze_intent` (pass `industry`) → ODG + missing fields + `next_step` | — |
| 3. Risk Calibration | After R8 | `aggregate_risks` → risk assessment across all puzzles | CRITICAL risks block |
| 4. Deployment Doc | After risks pass | `generate_deployment_doc` → deployment doc with D-01..D-18 checks | D-errors block R9 |
| 5. Substep Trace | R9-R10 | `trace_substeps` → validate substep linkage (D-10 check) | Linkage errors block publish |

## R1-R10 Build Order

| Round | Object | MCP Operation | Key Decision |
|-------|--------|---------------|--------------|
| R1 | Account | `account_operation.gen` + `faucet` | New or reuse? |
| R2 | Industry mode | `project_operation.analyze_intent` (pass `industry`) | Which driving mode? |
| R3 | Service | `onchain_operations.service` CREATE | Name, type_parameter, description |
| R4 | Permission | `onchain_operations.permission` CREATE/REUSE | Indexes 1000/1500 (customer uses `namedOperator:""`) |
| R5 | Machine | `onchain_operations.machine` CREATE | Nodes, forwards (mode defaults from MCP) |
| R6 | Progress | `onchain_operations.progress` CREATE + bind | Mirror Machine nodes |
| R7 | Guards | `onchain_operations.guard` CREATE + `gen_passport` test | 5 Guard templates (mode defaults from MCP) |
| R8 | Allocation | `onchain_operations.allocation` CREATE + `service.order_allocators` | Fund split (mode defaults from MCP) |
| R9 | Test order | `onchain_operations.order` CREATE + `progress` advance + `allocation.alloc_by_guard` | Full flow dry run |
| R10 | Publish | `onchain_operations.machine` publish + `service` publish | Pre-publish audit must PASS |
