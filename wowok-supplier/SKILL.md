---
name: wowok-supplier
description: |
  WoWok Supplier — the canonical skill for suppliers (sub-order providers) who
  present their service to a Demand and fulfill the resulting sub-order.

  Covers demand discovery, service presentation (open or passport-gated),
  sub-order fulfillment via Progress, and settlement collection. The supplier
  is a PEER role with a two-sided position: deliver (to get paid) + collect
  (from the upstream merchant).

  For the merchant who owns the main Service, see wowok-provider. For the
  process operators executing the workflow, see wowok-collaborator.
when_to_use:
  - User wants to present their service to a Demand (open RFP or gated call)
  - User is a sub-order provider / supplier fulfilling part of a transaction
  - User wants to collect settlement from an upstream merchant
  - User mentions "supplier", "sub-order", "demand", "present service", "RFP", "fulfill sub-order"
---

# WoWok Supplier Guide

> **Role**: Supplier (sub-order provider / Demand presenter)
> **Related Skills**: [wowok-provider](../wowok-provider/SKILL.md) (main merchant), [wowok-collaborator](../wowok-collaborator/SKILL.md) (process operators), [wowok-machine](../wowok-machine/SKILL.md) (workflow), [wowok-messenger](../wowok-messenger/SKILL.md) (evidence exchange)

---

## MCP Knowledge Layer

The following content has been pushed down to the MCP knowledge layer and is applied automatically — this Skill does NOT duplicate it:

| Content | Access via (MCP action) | Applied Via |
|---------|--------------------------|-------------|
| Demand semantics (open vs guarded, present paths) | `schema_query` action='get' (demand object schema, or on-demand knowledge) | `onchain_operations` demand |
| Supplier interest analysis (fund_flow / responsibility / leverage / stakes) | `project_operation` action='participation_radar' | role derivation → `supplier-interest` |
| Demand/service matching | `evaluation_operation` action='demand_match' | read-only ranking |
| Safety rules (immutability, object reuse, confirmation) | `schema_query` action='get_safety_rules' | `evaluate_project` + pre-publish |

This Skill keeps the supplier **conversation flow** — discover → present → fulfill → collect. The MCP layer handles rules, matching, and own-interest surfacing.

---

## Role: the two-sided supplier

The supplier is a **peer** (not weak like the customer, not strong like the merchant). Its position is two-sided:

1. **DELIVER** — fulfill the sub-order deliverable to unlock settlement.
2. **COLLECT** — collect the settlement share from the upstream merchant.

Your payment is a two-hop waterfall: main order escrow → allocation → your sub-order. You must protect BOTH sides — a delivery you can't prove is unpaid work; an upstream stall you don't chase is a lost claim.

---

## Core Interaction Principles

1. **Review-first**: State (a) what the AI understood, (b) the decision order, and (c) the interaction contract — before the first choice.
2. **User-driven**: Every step is an explicit user decision; the AI provides a `recommend` but never auto-advances.
3. **Reuse / Customize / Discover (三选一)**: For every component (service, passport, guard), surface reuse / customize / discover.
4. **Default-config disclosure**: Disclose defaults + caveats BEFORE the user decides.

---

## ⚠️ PRE-FLIGHT: Before Presenting to a Demand

Before ANY presentation, confirm with the user. **Do NOT fabricate, do NOT auto-present.**

| # | Item | User Must Provide | Why Not Fabricate |
|---|------|-------------------|--------------------|
| **S1** | **Account** | Which account operates. Default `""`. | Safe default exists |
| **S2** | **Target Demand** | Which Demand to present to (name/address). | You don't know which RFP they're answering |
| **S3** | **Service to present** | Which Service represents their offering. | It's their brand/offering identity |
| **S4** | **Passport (if gated)** | A valid Passport passing the Demand's guards. | Guards filter presentations; wrong passport = rejection |

> ⛔ GATE: S1-S4 confirmed before calling `present` (with `by_guard` for guarded demands). Not confirmed → STOP and ask.

---

## Phase 1: Discover & Present

**Discover** — `query_toolkit` / `onchain_objects` to list open Demands. A Demand is a user's service request with optional reward; presenters submit proposals.

**Match** — `evaluation_operation` action='demand_match' ranks whether your service fits the Demand's capability vector. Read-only; you decide whether to present.

**Present** — `onchain_operations` operation_type='demand':
- Open Demand → `present`.
- Guarded Demand → `present` with `by_guard` (a Passport that passes one of the Demand's guards).

> The Demand's `presenters` table records your submission (recommend / service / acceptance_score). The creator may give `feedback` + an `acceptance_score` — that is the selection signal.

---

## Phase 2: Fulfill the Sub-order

If selected, you receive a sub-order. Fulfill it via Progress (same routing rule as the provider):

- Empty `namedOperator` (`""`) → `order.progress`
- Non-empty role name or `permissionIndex` → `progress.operate`
- Guard-gated forwards need `b_submission` (evidence) entries.

Upload delivery evidence (Repository/proof) BEFORE advancing — it protects your payment claim and pre-builds your arbitration defense.

---

## Phase 3: Collect Settlement

Your settlement is released through the allocation waterfall when the sub-order completes. It is NOT automatic — verify your share arrived (query your sub-order's Allocation/Treasury).

If the upstream merchant stalls or withholds, escalate in order:
1. Messenger nudge (WTS evidence).
2. Arbitration (if the upstream Service binds one).
3. On-chain reputation — the loss is permanent and public.

---

## Own-Interest Surfacing

Run `project_operation` action='participation_radar' with your account + sub-order progress. The MCP derives your role (supplier) and attaches `supplier-interest` (fund_flow / responsibility / leverage / stakes). Present it as neutral information — the supplier decides.

---

## Design Principles

- **Prove before you advance**: evidence first, then execute.
- **Protect both sides**: deliver AND collect — neglect either and you lose.
- **Match honestly**: presenting to every Demand dilutes your reputation; present only where you genuinely fit.
- **Neutrality**: the AI surfaces trade-offs, never chooses the branch for you.

## Quick Reference

- Open Demand → `present`; Guarded Demand → `present` with `by_guard`.
- Guarded Demand accepts only Passports that pass its guards.
- Settlement is two-hop (main order → allocation → sub-order) — verify the second hop too.
- Upstream compensation_fund is your recourse for unpaid work; empty fund = refund + reputation only.
