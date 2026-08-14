---
name: wowok-planner
description: |
  WoWok Planning Skill — the main planning component of the L4 Harness Plan Loop.
  Converts user natural-language intent into an executable Object Dependency Graph
  (ODG) and a phased execution plan. Deterministic-first: rule tables and scenario
  templates drive planning; the LLM only clarifies intent and translates responses.

  Use when a user says "I want to build...", "plan a service", "help me set up X",
  or when the L4 Harness opens a new planning cycle. Produces an ODG JSON document
  consumed by the Harness execution loop, with checkpoints between phases.

  Not for direct execution — hand off to wowok-onboard or wowok-provider for
  step-by-step MCP orchestration once the ODG is confirmed.
when_to_use:
  - User describes a new service intent and needs a build plan
  - L4 Harness opens a Plan Loop cycle (fresh task)
  - User asks "what do I need to create to support X"
  - User wants to reuse existing objects for a new service
  - User asks for a dependency graph or execution phases
  - User resumes an interrupted planning session (read ODG checkpoint)
---

# WoWok Planning Skill

Converts natural-language intent into an executable Object Dependency Graph (ODG) and phased execution plan. Deterministic-first: rules and scenario templates decide the shape; the LLM only clarifies ambiguity and translates free text into typed fields.

> **Layer**: L3 Skill, primary planner for L4 Harness Plan Loop
> **Related Skills**: [wowok-onboard](../wowok-onboard/SKILL.md) (guided execution), [wowok-machine](../wowok-machine/SKILL.md) (workflow design), [wowok-provider](../wowok-provider/SKILL.md) (post-plan operations)
> Industry modes, Guard design patterns, safety rules, and tool references now live in the MCP knowledge layer — query via `project_operation` (`recommend_industry` / `list_modes`) and `schema_query` (`get_guard_design_patterns` / `get_safety_rules` / `get_tool_reference`).

---

## Overview

The planner sits between the user's intent and the Harness execution loop. It does NOT execute MCP transactions directly — it produces an ODG document that the Harness consumes phase-by-phase. This separation enforces review-before-write: every irreversible action is visible in the plan before any transaction is signed.

### Design Philosophy

- **Deterministic-first**: Rule tables and scenario templates produce the ODG skeleton. The LLM is invoked only for (a) intent clarification when keywords are ambiguous, and (b) translating free-text answers into typed fields.
- **Scenario-driven**: The Scenario Registry maps common intent patterns to pre-built ODG templates. A fallback `general` template absorbs unmatched intents.
- **Plan-before-write**: The full ODG is confirmed at R8 before any publish-bound object is created. Reversibility is tracked per object.
- **Checkpointed**: The ODG is persisted after every round via `local_info_operation` so the Harness can resume on interruption.

### What This Skill Does

- Classifies user intent against the Scenario Registry
- Queries existing on-chain objects to decide reuse vs create per object
- Emits an ODG with typed objects, dependencies, phases, and reversibility flags
- Flags irreversible actions and fund-risk paths before handoff
- Hands off to the Harness with a checkpoint plan and per-phase verification hooks

### When to Invoke

- User says "I want to build / set up / start / plan X"
- L4 Harness opens a new Plan Loop cycle
- User resumes an interrupted plan (read ODG checkpoint first)
- Do NOT invoke for: live order operations, dispute resolution, or post-publish tuning — those go to wowok-provider / wowok-arbitrator.

### Output Contract

A confirmed ODG JSON document (see §ODG Data Structure) with: scenario tag, complete object list with dependencies and reversibility, ordered phases, risk assessment, and a Harness handoff packet including checkpoint keys.

---

## ODG Data Structure

The ODG (Object Dependency Graph) is the single output artifact, persisted via `local_info_operation` and consumed by the Harness:

```json
{
  "task_id": "task_20260714_001",
  "scenario": "freelance",
  "version": 1,
  "status": "confirmed",
  "account": "merchant_v1",
  "objects": [
    { "id": "obj_account", "type": "account", "status": "created", "reversible": true, "dependencies": [], "user_decisions": { "reuse": false, "network": "testnet" } },
    { "id": "obj_permission", "type": "permission", "status": "planned", "reversible": true, "dependencies": ["obj_account"], "user_decisions": { "reuse": false, "indexes": { "provider": 1000 } } },
    { "id": "obj_service", "type": "service", "status": "planned", "reversible": true, "dependencies": ["obj_permission"], "user_decisions": { "name": "...", "publish": "deferred", "note": "DRAFT first — Guards reference it by LocalMark NAME to break the Guard↔Service cycle" } },
    { "id": "obj_machine", "type": "machine", "status": "planned", "reversible": false, "dependencies": ["obj_service", "obj_permission"], "user_decisions": { "nodes": [...], "forwards": [...], "publish": "deferred" } },
    { "id": "obj_guard_*", "type": "guard", "status": "planned", "reversible": false, "dependencies": ["obj_machine", "obj_service"], "user_decisions": { "logic": "...", "note": "references machine node names + service name via LocalMark NAME" } },
    { "id": "obj_treasury", "type": "treasury", "status": "planned", "reversible": true, "dependencies": ["obj_permission"], "user_decisions": { "reuse": false, "note": "optional fund pool for organizations; referenced by order_allocators as Entity recipient" } },
    { "id": "obj_contact", "type": "contact", "status": "planned", "reversible": true, "dependencies": ["obj_permission", "obj_account"], "user_decisions": { "reuse": false, "messenger": true, "anti_spam": "open", "note": "Service.um → Contact → ims[]; messenger enabled + anti-spam configured" } },
    { "id": "obj_arbitration", "type": "arbitration", "status": "planned", "reversible": true, "dependencies": ["obj_permission"], "user_decisions": { "reuse": true, "note": "REUSE third-party; permission MUST differ from Service (E_ARBITRATION_PERMISSION_CONFLICT); compensation_fund > 0 requires non-empty arbitrations" } }
  ],
  "phases": [
    { "phase": 1, "objects": ["obj_account", "obj_permission"], "gate": "user_confirm" },
    { "phase": 2, "objects": ["obj_service"], "gate": "user_confirm", "note": "Service DRAFT created BEFORE Machine so Guards can reference it by name" },
    { "phase": 3, "objects": ["obj_machine", "obj_guard_*"], "gate": "risk_check", "note": "Machine + Guards designed together; guards bound to forwards before publish" },
    { "phase": 4, "objects": ["publish_machine", "obj_treasury", "obj_allocator_*"], "gate": "allocation_audit", "note": "Machine published; Treasury (optional) created before order_allocators references it" },
    { "phase": 5, "objects": ["obj_contact", "obj_arbitration"], "gate": "user_confirm", "note": "Contact + third-party Arbitration configured BEFORE publish; arbitration.permission != service.permission" },
    { "phase": 6, "objects": ["publish_service"], "gate": "final_audit" }
  ],
  "risk_assessment": { "critical": [], "warnings": [], "irreversible_count": 1 }
}
```

Each object has: `id`, `type`, `status` (planned/created/published), `reversible` (true/false), `dependencies` (other object IDs), `user_decisions` (typed fields). Phases gate progression — `risk_check` calls `evaluate_project` (evaluation_type='risk'), `final_audit` runs the pre-publish audit checklist (see wowok-auditor).

**Dependency-chain ordering rules (authoritative, verified from Move/SDK):**
1. **Service DRAFT is created BEFORE Machine** — Guards reference the Service by LocalMark NAME, so the Service skeleton must exist first to break the Guard↔Service circular dependency.
2. **Machine + Guards are designed together** (one phase) — a forward's Guard depends on the Machine's node names; the Allocator's Guard depends on both Machine and Service.
3. **Machine publishes before Service binds it** — `service.machine` must reference a *published* Machine.
4. **`order_allocators` is L1-locked** — set it before `service.publish`; personal merchants route to Permission owner, organizations route to a Treasury (`Entity` recipient).
5. **Contact (customer service)** is configured before Service publish — `Service.um → Contact → ims[]`, with the local account enabled as messenger and anti-spam set.
6. **Arbitration is third-party and before publish** — `arbitration.permission != service.permission` (`E_ARBITRATION_PERMISSION_CONFLICT`); `compensation_fund > 0` requires non-empty `arbitrations` (`E_ARBITRATION_NOT_SET_WITH_COMPENSATION_FUND`).

These rules are the single source of truth for the dependency chain; the phase list above is their concrete serialization. Hand-off to `wowok-onboard` (Review opening + 12 rounds) follows this same chain.
