---
name: wowok-collaborator
description: |
  WoWok Collaborator — the canonical skill for process collaborators who execute
  workflow forwards on behalf of a merchant: internal staff (permission entities)
  and external operators (named operators).

  Covers permission-index and named-operator routing, guard-gated evidence
  submission, and reputation protection. The collaborator carries PROCESS
  responsibility (no direct settlement stake) — the goal is to keep the workflow
  flowing and avoid stall blame.

  For the merchant who owns the Service, see wowok-provider. For the supplier who
  presents to Demands, see wowok-supplier.
when_to_use:
  - User is an operator/employee executing workflow steps (permission index)
  - User is an external named operator advancing a Machine forward
  - User wants to submit guard evidence (proof/repository) for a forward
  - User mentions "collaborator", "operator", "permission index", "named operator", "execute forward"
---

# WoWok Collaborator Guide

> **Role**: Collaborator (internal permission entity OR external named operator)
> **Related Skills**: [wowok-provider](../wowok-provider/SKILL.md) (merchant), [wowok-machine](../wowok-machine/SKILL.md) (workflow), [wowok-messenger](../wowok-messenger/SKILL.md) (evidence exchange)

---

## MCP Knowledge Layer

The following content has been pushed down to the MCP knowledge layer and is applied automatically — this Skill does NOT duplicate it:

| Content | Access via (MCP action) | Applied Via |
|---------|--------------------------|-------------|
| Collaborator interest analysis (fund_flow / responsibility / leverage / stakes) | `project_operation` action='participation_radar' | role derivation → `collaborator-interest` |
| Progress routing rule (namedOperator vs permissionIndex) | `schema_query` action='get_safety_rules' | `onchain_operations` progress/order |
| Guard design + submission patterns | `schema_query` action='get_guard_design_patterns' | guard-gated forwards |
| Node game (threshold cooperation) | `evaluation_operation` action='node_game' | multi-role forward evaluation |

This Skill keeps the collaborator **conversation flow** — what you can execute now, what evidence to submit, and how to stay in scope.

---

## Role: process responsibility, not settlement

The collaborator has **no direct settlement stake**. Your compensation is typically outside the on-chain order (salary/contract) unless the allocation explicitly routes a slot to you. Your stake is **reputation** — the stall/dispute metrics are public and read by future counterparties.

Two sub-kinds (derived on-chain, never asserted):
- **permission entity** (internal staff): granted a `permissionIndex` in the Service's Permission.
- **named operator** (external): resolved via Progress.namedOperator → LocalMark.

---

## Core Interaction Principles

1. **Review-first**: State what you understand + what you can execute + the interaction contract before acting.
2. **User-driven**: the AI surfaces options; you decide; never auto-advance.
3. **Stay in scope**: only execute forwards your permission/named-operator grants — out-of-scope action creates semantic responsibility without authority.
4. **Default-config disclosure**: disclose defaults + caveats before acting.

---

## What You Can Execute Now

Run `project_operation` action='participation_radar' with your account + the order's Progress. It returns:

- `operable` — forwards YOU can execute right now (permission / named-operator path).
- `waiting_on` — what the workflow waits on from other roles.
- `collaborator_kind` — internal vs external.
- `interest_analysis` → `collaborator-interest` (fund_flow / responsibility / leverage / stakes).

Present it neutrally; the collaborator decides.

---

## Routing

- Empty `namedOperator` (`""`) → `order.progress` (the order holder, NOT you).
- Non-empty role name → `progress.operate` with the named operator.
- `permissionIndex` → `progress.operate` with your granted index.

Wrong path → "Permission denied" (abort code 5). The MCP safety rules carry the authoritative classification.

---

## Guard-gated Forwards

A forward with a guard requires a `b_submission` (retained submission) before execution. Prepare your evidence (Repository/proof) in advance:

1. Upload evidence (Repository/proof data).
2. Execute the forward (two-phase: call → submission prompt → re-call with submission).
3. Advance the workflow.

Uploading evidence BEFORE executing reduces dispute probability and pre-builds the merchant's arbitration defense — your diligence is visible on-chain.

---

## Design Principles

- **Momentum**: advance when you can; the stall is publicly visible.
- **Scope discipline**: never interfere outside your permission/named-operator scope.
- **Evidence first**: guard-gated forwards are only as strong as the submission behind them.
- **Neutrality**: the AI surfaces trade-offs, never chooses the branch for you.

## Quick Reference

- You carry no settlement stake — your currency is reputation.
- `permissionIndex` → `progress.operate`; `namedOperator` role name → `progress.operate`.
- Guard-gated forward needs `b_submission` evidence before execution.
- Threshold cooperation (`node_game`) surfaces multi-role forward needs when a pair's threshold > 1.
