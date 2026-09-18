---
name: wowok-market
description: "WoWok Market — market discovery and operations (the matchmaking layer): how a demand finds candidate services, how a merchant picks a trustworthy arbitrator, how the account's on-chain attention is surfaced, and how the market is measured and governed. Covers match_discover/discover_services/discover_demands, arbitration_score (trust selection), account_events (attention), market_metrics, anti_cheat, market_operations (journey funnel / referral / CRM) and category match rules. Use when: User wants to discover services for an intent (\"find a plumber in Shanghai\"); Merchant wants to find open Demands to present to; Merchant wants to pick or compare arbitrators; User wants their on-chain attention items surfaced; User wants market metrics, anti-cheat signals, journey funnel, referral or CRM; User mentions \"market\", \"match\", \"discover\", \"matchmaking\", \"funnel\", \"referral\"."
metadata:
  version: "1.1.0"
  role: shared
  related: "wowok-provider, wowok-order, wowok-arbitrator"
---

# WoWok Market Guide

> **Role**: Market discovery & operations (matchmaking + Observe layer)
> **Related Skills**: [wowok-provider](../wowok-provider/SKILL.md) (merchant), [wowok-order](../wowok-order/SKILL.md) (customer), [wowok-arbitrator](../wowok-arbitrator/SKILL.md) (arbitrator), [wowok-supplier](../wowok-supplier/SKILL.md) (demand presenter)
> All mechanics — parameters, six-dimension weights, thresholds, output fields — live in the tool schema and query outputs. Read them at call time; do not hand-maintain them here.

## Action routing (all under `evaluation_operation`)

Pick the action by intent, then read its input schema:

| Intent | action |
|---|---|
| Discover scored services for a demand intent | `match_discover` — `description` + `location` required; budget / required capabilities / `category` / region optional. `category` (registered keys: `life_service`, `retail`, …) adds hard-constraint filtering and re-anchors the six-dimension weights; omit for generic scoring. |
| Enumerate services without scoring | `discover_services` |
| Enumerate demands (merchant side) | `discover_demands` — returns **all** shared Demands with `presenters_count`; an *open* demand is `presenters_count = 0` (the action does not pre-filter). |
| Trust / compare an arbitrator | `arbitration_score` — pass `arbitration.object`; when real case `history` is omitted it is auto-fetched on-chain for `context_network`. Output carries trust, fairness and a 0–100 combined score with per-rule reasons. |
| Surface this account's actionable attention | `account_events` — omit `categories` to run every watcher; each returned row is self-describing (`category` / `title` / `action`). Never pre-list category names for the user — the rows are the list. |
| Market size & balance | `market_metrics` — active services, open demands, open arb cases, supply/demand ratio, order flow. |
| Cheat signals on one Service | `anti_cheat` — **evidence must be gathered first** (Service object stack, its orders, its review rows) and passed in; returns fake-order / fake-review / shell-merchant / reputation-trade signals. |
| Operational aggregation | `market_operations` — `op`: `journey_funnel` / `referral_attribution` / `customer_relationship` / `dynamic_pricing`. |

**Deep structural trust** — for multi-hop questions (who really controls Service/Permission/Arbitration, shell/affiliation structure, money-flow exposure, workflow single points), run `query_toolkit` → `query_type: "onchain_topology"` with `focus` = the address/object/LocalMark. It batches every chain read and returns typed edges, reached Machines' workflow graphs and R/A/O/G findings; conclusions crossing a `bounded_window` edge are lower bounds. It supplies structural facts to `anti_cheat` and arbitrator comparison; it never produces a score itself.

## Conversation flow: discover → compare → trust → act → measure

1. **Review-first**: before the first choice, state (a) what you understood, (b) the decision order, (c) the interaction contract.
2. **User-driven**: every step is an explicit user decision; you give a `recommend`, never auto-advance and never auto-act on attention items.
3. **Neutrality**: surface scores and trade-offs side by side; never force a single pick.
4. **No fabricated matching**: always run the MCP enumeration/scoring; never invent candidates, counts or scores.
5. **Hand off cleanly**: picked a service → [wowok-order](../wowok-order/SKILL.md) for due diligence and buying; merchant wants to present → [wowok-supplier](../wowok-supplier/SKILL.md).

## Authority rules

- **Objects are authoritative**: event rows (descriptions, reward addresses, counts) are routing hints only — amounts and current state are read from the objects by id.
- **Opportunity events are deliberately sparse**: a reward-less Demand emits no event. No event is not proof of no demand; enumerate when the question matters.
- **Network awareness**: discovery and trust calls default to testnet — pass `context_network` explicitly for real decisions.
