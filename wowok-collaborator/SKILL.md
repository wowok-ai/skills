---
name: wowok-collaborator
description: "WoWok Collaborator — the canonical skill for process collaborators who execute workflow forwards on behalf of a merchant: internal staff (permission entities) and external operators (named operators). Covers permission-index and named-operator routing, guard-gated evidence submission, and reputation protection. The collaborator carries PROCESS responsibility (no direct settlement stake) — the goal is to keep the workflow flowing and avoid stall blame. For the merchant who owns the Service, see wowok-provider. For the supplier who presents to Demands, see wowok-supplier. Use when: User is an operator/employee executing workflow steps (permission index); User is an external named operator advancing a Machine forward; User wants to submit guard evidence (proof/repository) for a forward; User mentions \"collaborator\", \"operator\", \"permission index\", \"named operator\", \"execute forward\"."
metadata:
  version: "2.1.0"
  role: collaborator
  related: "wowok-provider, wowok-machine, wowok-messenger"
---

# WoWok Collaborator Guide

> **Role**: Collaborator (internal permission entity OR external named operator)
> **Related Skills**: [wowok-provider](../wowok-provider/SKILL.md) (merchant), [wowok-machine](../wowok-machine/SKILL.md) (workflow), [wowok-messenger](../wowok-messenger/SKILL.md) (evidence exchange)
> Mechanics — routing, permission indexes, guard field lists, thresholds — are emitted by the MCP per query. Read them from the output; do not hand-maintain them here. Guard patterns: `schema_query` (`get_guard_design_patterns`, `get_safety_rules`).

## What is pushed down (do not duplicate)

| Capability | Where it surfaces |
|---|---|
| What you can execute now, and how | `query_toolkit` `participation_radar` — `operable[]` with per-forward `execution_path`, `permission_index` / `named_operator`, `guard`, and **`recommended_call`** |
| Concrete execution route | each operable forward's **`recommended_call`** (`tool` + `path` + `reason`) — the single source of truth; never hand-route from operator names |
| Interest analysis | radar `interest_analysis` (fund_flow / responsibility / leverage / stakes), derived as `collaborator-interest` |
| Guard design & safety rules | `schema_query` `get_guard_design_patterns` / `get_safety_rules` |
| Threshold cooperation (multi-contributor forwards) | `evaluation_operation` action `node_game` |

## Role: process responsibility, not settlement

- You typically have **no direct settlement stake** (compensation is salary/contract off-chain, unless an Allocation slot explicitly routes to you).
- Your real stake is **reputation**: stall and dispute metrics are public and read by future counterparties.
- Sub-kind is **derived on-chain, never asserted**: `permission_entity` (granted a permission index in the Service's Permission) or `named_operator` (Progress.namedOperator → LocalMark). The radar tells you which.

## Working procedure

1. **Review-first**: state what you understood, what the account can execute, and the interaction contract before acting.
2. **Read the radar**: `query_toolkit` `participation_radar` with `radar_account` and `radar_targets: [{ progress, order? }]` (1–20 targets). Present `operable` neutrally; if `branch_choice` is present, the user picks the branch — never auto-advance.
3. **Execute per `recommended_call`**: call exactly the tool/path the forward gives (the reason text carries the failure code you would hit on the wrong path). No `recommended_call` → that forward is not executable by this account; say so instead of trying.
4. **Stay in scope**: only execute forwards the account's permission/named-operator grants. Out-of-scope action creates semantic responsibility without authority.

## Guard-gated forwards

- The forward's `guard` field (and `workflow_operation` `list`/`task` → `options[].guard_submissions`) tells you exactly which `b_submission` fields must be supplied (name, value type, object type).
- Prepare evidence (Repository / Proof) **before** executing; exchange it via Messenger when it comes from another party.
- Execute once, with the `submission` values attached to the same call. Pre-uploading evidence reduces dispute probability and builds the merchant's arbitration defense — your diligence is visible on-chain.

## Principles

- **Momentum**: advance when you can; a stall is publicly visible.
- **Scope discipline**: never interfere outside your granted forwards.
- **Evidence first**: a guarded forward is only as strong as its submission.
- **Neutrality**: surface trade-offs and options; the role decides, you do not.
- **Defaults disclosed**: disclose defaults and caveats before acting.

## Quick reference

- No settlement stake — your currency is reputation.
- Route via `operable[].recommended_call`; do not infer the tool from the operator kind yourself.
- Guarded forward: read `guard_submissions`, collect the values, submit with the execute call.
- `node_game` surfaces the cooperation picture when a pair's threshold needs multiple distinct contributors.
