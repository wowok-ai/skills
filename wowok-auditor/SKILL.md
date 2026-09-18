---
name: wowok-auditor
description: "WoWok pre-publish auditor — the static-analysis Skill that verifies Guard completeness, Machine soundness, fund-flow safety, permission consistency, and publish readiness BEFORE any irreversible publish operation (Service publish, Machine publish, Allocator binding freeze). This Skill is the orchestration guide for the L4 Harness Verify Loop. It does not mutate objects. It triggers the MCP risk engine, gathers evidence, and presents a pass/warn/fail report plus a publish decision. Use when: User is about to publish a Service, Machine, or lock an Allocator set; User asks to \"audit\", \"verify\", \"review\", \"check before publish\"; L4 Harness Verify Loop is invoked before an irreversible operation; User mentions \"fund flow\", \"refund path\", \"allocation sum\", \"guard completeness\"; User mentions \"machine cycle\", \"unreachable state\", \"permission index conflict\"; User wants a pre-publish go/no-go decision; A publish operation failed and root-cause analysis is needed."
metadata:
  version: "2.1.1"
  role: shared
  related: "wowok-planner, wowok-provider, wowok-machine"
---

# WoWok Pre-Publish Auditor

Read-only orchestration for the gate that precedes every irreversible publish.
The auditor never writes on-chain; it triggers the MCP risk engine, gathers
evidence, and presents a go / no-go decision. (R10 in MCP dialogue rounds is
the canonical **verify** round — a FAIL blocks publish there.)

> **Role**: Auditor (read-only). Pre-write safety rules live in the MCP knowledge layer (`schema_query` action='get_safety_rules') and are applied on every write; this auditor drives the comprehensive pre-publish aggregation.
> **Layer**: L3 Skill, orchestration guide for the L4 Verify Loop.
> **Related Skills**: [wowok-machine](../wowok-machine/SKILL.md) (Machine design), [wowok-onboard](../wowok-onboard/SKILL.md) (publish flow).

---

## What Lives Where (single source of truth)

The machine-executable rules are NOT duplicated in this Skill — they evolve in MCP and this file would drift:

| Content | Source (MCP) |
|---------|--------------|
| Safety rules (confirmation levels, immutability, object reuse) | `schema_query` action='get_safety_rules' |
| Guard completeness, Machine soundness, fund-flow safety, permission consistency, publish readiness | `goal_operation` action='aggregate_risks' (auto-applied) |

This Skill keeps only **when to run the audit, how to call it, and how to read the verdict**.

---

## When to Run

Run an audit immediately before any irreversible operation:

1. **Service publish** — machine bound + published, allocators locked, arbitration/compensation invariants, buy_guard, contact, permission indices.
2. **Machine publish** — nodes/pairs/forwards become immutable afterward.
3. **Service fund-template lock** — `order_allocators` (the order distribution template and its trigger guards) is a Service create/update FIELD that becomes permanently immutable at `publish=true`; there is no separate bind op.
4. **Post-failure root-cause analysis** — a publish/assert failed (e.g. `E_ARBITRATION_NOT_SET_WITH_COMPENSATION_FUND`, `E_ARBITRATION_PERMISSION_CONFLICT`); re-run to identify every remaining blocker, not just the one that aborted.

Scope adapts to blast radius: a single Service with no Machine skips machine checks automatically; a stack with cross-Machine supply chains runs the full chain. The engine derives applicable checks from the objects — do not hand-pick rules.

---

## How to Run

```
goal_operation  action='aggregate_risks'
                intent=<business intent text>           # or pass 'puzzles' through from analyze_intent
                planned_objects=[{object_type,is_new,name?}]
                planned_operations=[{object_type,trigger:'create'|'publish',name?}]
                severity_threshold='HIGH'               # default HIGH
                user_confirmed_high_risks=[...]         # IDs acknowledged in a prior round
```

Evidence-gathering (all read-only, done BEFORE presenting the verdict):

- `guard2file` / `machineNode2file` — export immutable backups of what is about to be published.
- `query_toolkit` (`onchain_objects`, table items) — verify current on-chain state (`bPublished`, balances, bound objects).
- `onchain_events` — confirm the state transitions claimed by recent operations.
- Use the `semantic` field of recent operation results (`semantic.created` / `.modified` / `.released` / `.events`) to cross-check that intended roles/objects were actually produced.

Never call `onchain_operations` with `submission` from this role — fixes belong to the Skill being audited.

---

## How to Read the Verdict

`aggregate_risks` returns a blocking **status** plus per-finding severity (CRITICAL / HIGH / MEDIUM / LOW / INFO):

| Status | Meaning | Auditor action |
|---|---|---|
| `RISK_PASSED` | No risk at/above threshold | Go — present the go decision |
| `RISK_BLOCKED` | CRITICAL present, or unacknowledged risk ≥ threshold (default HIGH) | No-go — list every blocker with its object + fix; do not publish |
| `RISK_PENDING_CONFIRM` | Only acknowledged-able HIGH risks remain | Explain each HIGH risk in business terms; proceed only after explicit user confirmation, then re-run with the risk IDs in `user_confirmed_high_risks` |
| `RISK_CANCELLED` | The risk session was cancelled | Treat as no-go until re-audited |

Presentation rules:

1. **FAIL blocks, WARN asks, PASS is silent.** CRITICAL/blocked findings are hard stops fixed by the owning Skill; MEDIUM/LOW are surfaced as advisories.
2. **Blast-radius first**: order findings by irreversibility — a post-publish Guard logic bug is permanent; an untested Guard or missing backup is recoverable.
3. Group by the five coverage aspects — **Guard completeness, Machine soundness, fund-flow safety, permission consistency, publish readiness** (map each finding via its returned `object_type` and `risk_rule_id`), and state explicitly which objects were in scope. Quote the finding text the engine returns; never maintain a local rule list.

---

## Audit Report Contract

The user-facing report contains: scope (objects/operations audited), findings grouped by dimension with severity, the blocking status, required fixes vs acknowledged risks, and a final one-line decision: **GO / NO-GO / CONFIRM-THEN-GO**. It contains no transaction itself — the audited Skill performs the mutation after GO.
