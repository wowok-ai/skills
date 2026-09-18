---
name: wowok-planner
description: "WoWok Planning Skill — the planning component of the L4 Harness Plan Loop. Converts natural-language intent into an executable Object Dependency Graph (ODG) plus a phased plan. Deterministic-first: rule tables and scenario templates drive planning; the LLM only clarifies intent. Produces an ODG consumed by the Harness execution loop, with checkpoints between phases. Not for direct execution — hand off to wowok-onboard or wowok-provider once the ODG is confirmed. Use when: User describes a new service intent and needs a build plan; the Harness opens a Plan Loop cycle; User asks \"what do I need to create to support X\"; User wants to reuse existing objects for a new service; User asks for a dependency graph or execution phases; User resumes an interrupted planning session."
metadata:
  version: "2.1.0"
  role: shared
  related: "wowok-onboard, wowok-auditor, wowok-provider"
---

# WoWok Planning Skill

Converts natural-language intent into an executable, dependency-ordered build plan. Deterministic-first: the MCP pipeline decides the shape; you only clarify ambiguity and translate free-text answers into typed fields. You NEVER execute chain transactions — the plan is materialized later via `onchain_operations`.

> **Layer**: L3 Skill, planner for the L4 Harness Plan Loop
> **Related**: [wowok-onboard](../wowok-onboard/SKILL.md) (guided execution), [wowok-auditor](../wowok-auditor/SKILL.md) (pre-publish gate), [wowok-machine](../wowok-machine/SKILL.md), [wowok-provider](../wowok-provider/SKILL.md)
> Industry modes / Guard patterns / safety rules are MCP knowledge: `industry_pack_operation` (`recommend_industry` / `list_modes` / `derive_user_mode`) and `schema_query` (`get_guard_design_patterns` / `get_safety_rules` / `get_tool_reference`).

## The planning pipeline (all under `goal_operation`)

Do not invent a plan format or gate names — the MCP owns the artifacts:

1. **Industry** (optional first): `industry_pack_operation` `recommend_industry` with the intent text; confirm one of the returned modes (`list_modes` to see all; `derive_user_mode` to fork a custom one).
2. **Guided wizard (default for merchants)**: `merchant_guide` — a stateless 10-step wizard (intent → industry → roles → deliverables → payment → trust → blueprint → score preview → harness checks → **creation_plan**). Pass the opaque `guide_state` back UNCHANGED each turn with the user's `guide_confirm`. Step 10 returns a topological `creation_plan` (order / object_type / depends_on / operation_hint) computed from the semantic graph — that order IS the plan.
3. **Object-level pipeline (advanced / harness)**: `analyze_intent` (C1: parsed intent, per-object puzzle snapshots, missing dimensions, `recommended_creation_order`) → `aggregate_risks` (C2: blocking RISK status — pass the puzzles through UNCHANGED) → `trace_substeps` (C3: substep DAG + coherence verdict). Omit `puzzles` and pass `intent` to run C1→C2 in one call.
4. **Materialize after GO**: create objects in `creation_plan` order via `onchain_operations` (that belongs to wowok-onboard / wowok-provider), then pass the pre-publish gate (wowok-auditor).

## Checkpoints & resumability

- Round state lives in a Goal: `goal_operation` `create` → `approve` / `advance` (plus `bind` / `pause` / `complete` / `abandon` as the lifecycle requires). Never fake completion outside the Goal.
- Persist human-readable plan artifacts with `workspace_operation` (`write` / `read` / `list`) so an interrupted session can resume. Do NOT use `local_info_operation` — that store is private customer-required info, not planning state.
- On resume: read the Goal state and the workspace artifact first, then continue from the furthest confirmed step.

## Invariants the plan must always satisfy

These are chain-enforced (the risk engine and auditor verify them — your plan must not fight them):

1. **Machine published and bound before Service publish** — `service.machine` needs a published Machine; the binding is immutable afterward.
2. **`order_allocators` set before `publish=true`** — permanently L1-locked at publish (no pause exception); personal merchants route to the Permission owner, organizations typically to a Treasury `Entity` recipient.
3. **Arbitration permission ≠ Service permission** (`E_ARBITRATION_PERMISSION_CONFLICT`); a positive compensation fund requires non-empty arbitrations (`E_ARBITRATION_NOT_SET_WITH_COMPENSATION_FUND`).
4. **Contact configured before Service publish** — `Service.um → Contact → ims[]`, with the messenger account enabled and anti-spam set.
5. Drafts may reference each other by LocalMark name while still unbound; respect the machine-derived `creation_plan` order when an edge is `required`.

## Boundaries

- Invoke on: "I want to build / set up / plan X", a new Plan Loop cycle, or resuming an interrupted plan.
- Do NOT invoke for live order ops, disputes, or post-publish tuning → wowok-provider / wowok-arbitrator.
- Naming note: the **R1–R10** rounds in MCP schemas are the Guard-authoring dialogue rounds (R1=intent … R10=verify), NOT plan phases. Label your own checklists "Step n", never "Rn".
