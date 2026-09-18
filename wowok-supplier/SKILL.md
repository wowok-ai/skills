---
name: wowok-supplier
description: "WoWok Supplier — the canonical skill for suppliers (sub-order providers) who present their service to a Demand and fulfill the resulting sub-order. Covers demand discovery, service presentation (open or passport-gated), sub-order fulfillment via Progress, and settlement collection. The supplier is a PEER role with a two-sided position: deliver (to get paid) + collect (from the upstream merchant). For the merchant who owns the main Service, see wowok-provider. For the process operators executing the workflow, see wowok-collaborator. Use when: User wants to present their service to a Demand (open RFP or gated call); User is a sub-order provider / supplier fulfilling part of a transaction; User wants to collect settlement from an upstream merchant; User mentions \"supplier\", \"sub-order\", \"demand\", \"present service\", \"RFP\", \"fulfill sub-order\"."
metadata:
  version: "2.1.0"
  role: supplier
  related: "wowok-provider, wowok-machine, wowok-messenger"
---

# WoWok Supplier Guide

> **Role**: Supplier (sub-order provider / Demand presenter)
> **Related Skills**: [wowok-provider](../wowok-provider/SKILL.md) (main merchant), [wowok-collaborator](../wowok-collaborator/SKILL.md) (process operators), [wowok-machine](../wowok-machine/SKILL.md) (workflow), [wowok-messenger](../wowok-messenger/SKILL.md) (evidence exchange)

---

## What the MCP already does for you

Do not re-derive any of this — consume the tool output:

- **Discovery → present-path bridge**: `evaluation_operation` action=`demand_present` enumerates Demands, matches THIS service, and returns each match with a `next` block — `operation` (`demand.present_service` vs `demand.present_service_with_passport`), `preconditions` checklist, and rationale. Read-only; the write still needs user consent.
- **Ad-hoc ranking**: `demand_match` (one Demand vs candidate Services), `service_match` (one Service vs candidate Demands), `service_risk`. All accept an optional `presenter_history` (see reputation below).
- **Execution routing**: `query_toolkit` query_type=`participation_radar` returns `operable[].recommended_call` (tool/path/reason) for every forward the account can execute. Never hand-pick `order.progress` vs `progress.operate` yourself — no `recommended_call` means the forward is not yours to execute.
- **Own-interest analysis**: the radar derives role `supplier` and attaches `supplier-interest` (fund_flow / responsibility / leverage / stakes). Present it neutrally; the supplier decides.

The skill keeps only the **conversation flow**: discover → present → fulfill → collect.

---

## Role: the two-sided supplier

The supplier is a **peer**. Its position is two-sided:

1. **DELIVER** — fulfill the sub-order to unlock settlement.
2. **COLLECT** — collect the share from the upstream merchant.

Payment is a two-hop waterfall: main order escrow → allocation → your sub-order. A delivery you cannot prove is unpaid work; an upstream stall you do not chase is a lost claim. Protect both sides.

---

## Interaction principles

1. **Review-first**: state what you understood, the decision order, and the interaction contract before the first choice.
2. **User-driven**: every write is an explicit user decision; you recommend, never auto-advance.
3. **Default disclosure**: disclose defaults and caveats BEFORE the user decides. Network: the runtime uses the USER'S CURRENT network (client UI selection) — omit `env.network`; set it only when the user explicitly names a different network.

---

## Pre-flight: before presenting

Confirm with the user; never fabricate or auto-present:

| # | Item | Notes |
|---|------|-------|
| S1 | Account | `env.account`, default `""` (SDK default account). |
| S2 | Target Demand | Which Demand (name/address) the presentation answers. |
| S3 | Service to present | Which published, non-paused Service represents the offering (`present.service`). |
| S4 | Guard path | If the Demand binds guards, `present.by_guard` selects which Guard's verification to pass through — the sender needs a Passport that satisfies it. The `demand_present` `next.preconditions` list states exactly this. |

Not confirmed → STOP and ask.

---

## Phase 1 — Discover & present

1. **Discover+match in one read-only call**: `evaluation_operation` action=`demand_present` with the service capability vector (plus optional location filter). Each item in `matches` carries the ranking `result` and the `next` present-path block.
2. **Present (WRITE)** via `onchain_operations` operation_type=`demand`, `data: { object: <Demand>, present: { recommend, service?, by_guard? } }`:
   - Unguarded Demand: plain `present` (`recommend` required).
   - Guarded Demand: add `by_guard` (Guard ID/name from the Demand's guard list); verification runs at present time.
3. The Demand's `presenters` table records the submission keyed by sender (recommend / service / update_time). The owner later gives feedback and selects; selection forms the Order on the chosen Service (`service.order_new`, issued by the Demand side — not by you).

Match honestly: presenting to every Demand dilutes reputation — present only where you genuinely fit.

## Reputation: acceptance-score backflow

The Demand owner's feedback scores your presentation. Feed it into future evaluations as `presenter_history` (entries `{demand_id?, acceptance_score, feedback_time?}`, collected per party):

- Standalone `onchain_events` tool, type=`DemandFeedbackEvent` (carries `demand`, optional `service`, `feedback`, `acceptance_score`) — filter client-side by your presented Service. `DemandPresentEvent` is the presentation event; `DemandChangedEvent` signals reward changes.
- Or `query_toolkit` query_type=`onchain_table_item_demand_presenter` per Demand — the presenter row carries `acceptance_score` (null = not yet rated).

## Phase 2 — Fulfill the sub-order

If selected, a sub-order (Order + Progress) reaches you. For every advance:

1. Run `participation_radar` with `radar_account` and `radar_targets: [{ progress: <sub-order Progress>, order: <sub-order Order, recommended> }]`.
2. Execute exactly the `recommended_call` attached to an operable forward; if none is returned, the forward is not yours — say so, do not attempt a call.
3. When the call asks for guard evidence (submission prompts), supply the evidence the call requests — upload delivery proof (Repository/WTS) BEFORE advancing. It protects the payment claim and pre-builds the arbitration defense.

## Phase 3 — Collect settlement

Settlement is released through the allocation waterfall when the sub-order completes — it is not enough to assume it arrived:

1. Verify your share reached your address (query the sub-order's Allocation/Treasury; the supplier-interest `fund_flow` block tells you what to check).
2. If the upstream merchant stalls: Messenger nudge (WTS-recorded) → arbitration if the upstream Service binds one → on-chain reputation (permanent, public).
3. Know the recourse before you start: the upstream `compensation_fund` is the indemnity source; an empty fund leaves only the refund path + reputation.

---

## Quick rules

- Prefer `demand_present` (read-only, gives the present path) over manually discovering then guessing the write shape.
- One present schema: guarded Demands differ only by `by_guard`; never invent a second operation.
- Execute from radar `recommended_call`; evidence first, advance second.
- Two-hop money: deliver AND verify the second hop (allocation → you).
