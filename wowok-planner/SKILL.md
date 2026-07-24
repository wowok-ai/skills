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
> **Related Skills**: [wowok-onboard](../wowok-onboard/SKILL.md) (guided execution), [wowok-scenario](../wowok-scenario/SKILL.md) (scenario templates), [wowok-tools](../wowok-tools/SKILL.md) (MCP reference), [wowok-machine](../wowok-machine/SKILL.md) (workflow design), [wowok-guard](../wowok-guard/SKILL.md) (Guard design), [wowok-safety](../wowok-safety/SKILL.md) (immutability rules), [wowok-provider](../wowok-provider/SKILL.md) (post-plan operations)

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
    { "id": "obj_permission", "type": "permission", "status": "planned", "reversible": true, "dependencies": [], "user_decisions": { "reuse": false, "indexes": { "provider": 1000 } } },
    { "id": "obj_service", "type": "service", "status": "planned", "reversible": true, "dependencies": ["obj_permission"], "user_decisions": { "name": "...", "publish": "deferred" } },
    { "id": "obj_machine", "type": "machine", "status": "planned", "reversible": false, "dependencies": ["obj_permission"], "user_decisions": { "nodes": [...], "forwards": [...], "publish": "deferred" } },
    { "id": "obj_arbitration", "type": "arbitration", "status": "planned", "reversible": true, "dependencies": [], "user_decisions": { "voting_guard_count": 3, "fee_balance": "1000 WOW", "note": "arbiters live in voting_guard, NOT Permission index 1500" } }
  ],
  "phases": [
    { "phase": 1, "objects": ["obj_permission"], "gate": "user_confirm" },
    { "phase": 2, "objects": ["obj_service", "obj_machine", "obj_arbitration"], "gate": "risk_check" },
    { "phase": 3, "objects": ["obj_guard_*"], "gate": "passport_test" },
    { "phase": 4, "objects": ["obj_allocator_*"], "gate": "allocation_audit" },
    { "phase": 5, "objects": ["publish"], "gate": "final_audit" }
  ],
  "risk_assessment": { "critical": [], "warnings": [], "irreversible_count": 1 }
}
```

Each object has: `id`, `type`, `status` (planned/created/published), `reversible` (true/false), `dependencies` (other object IDs), `user_decisions` (typed fields). Phases gate progression — `risk_check` calls `evaluate_project` (evaluation_type='risk'), `final_audit` runs the pre-publish audit checklist (see wowok-auditor).
