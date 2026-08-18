---
name: wowok-market
description: |
  WoWok Market — the canonical skill for market discovery and operations. It
  covers the "matchmaking + operations" layer (K3 13/14/15): how a demand finds
  candidate services, how a merchant picks a trustworthy arbitrator, how the
  account's on-chain attention is surfaced, and how the market is measured and
  governed.

  Covers match_discover / discover_services / discover_demands (discovery),
  arbitration_score (trust selection), account_events (attention), market_metrics
  (supply/demand/trust), anti_cheat (governance), market_operations (journey
  funnel / referral / CRM), and category match rules.

  For the merchant who owns a Service, see wowok-provider. For the customer
  placing an order, see wowok-order. For the arbitrator, see wowok-arbitrator.
when_to_use:
  - User wants to discover services for an intent ("find a plumber in Shanghai")
  - Merchant wants to discover open Demands to present to
  - Merchant wants to pick/compare arbitrators (arbitration_score)
  - User wants their on-chain attention items surfaced (account_events)
  - User wants market metrics / anti-cheat signals / journey funnel / referral / CRM
  - User mentions "market", "match", "discover", "matchmaking", "operations", "funnel", "referral", "customer relationship"
---

# WoWok Market Guide

> **Role**: Market discovery & operations (matchmaking + Observe layer)
> **Related Skills**: [wowok-provider](../wowok-provider/SKILL.md) (merchant), [wowok-order](../wowok-order/SKILL.md) (customer), [wowok-arbitrator](../wowok-arbitrator/SKILL.md) (arbitrator), [wowok-supplier](../wowok-supplier/SKILL.md) (demand presenter)

---

## MCP Knowledge Layer

The matching/routing/aggregation logic is pushed down to MCP and applied automatically — this Skill does NOT duplicate it. All market actions live under `evaluation_operation`:

| Capability | MCP action | Purpose |
|------------|------------|---------|
| Service discovery (intent → candidates) | `match_discover` / `discover_services` | enumerate + location gate + 6-dim score |
| Demand discovery (merchant → open demand) | `discover_demands` | enumerate shared Demands |
| Arbitrator trust selection | `arbitration_score` | dual-perspective trust/fairness |
| Account attention | `account_events` | unread messenger / collectible / arbitrable |
| Market metrics | `market_metrics` | supply / demand / trust counts |
| Anti-cheat | `anti_cheat` | fake order / fake review / shell merchant |
| Operational aggregation | `market_operations` | journey funnel / referral / CRM |

This Skill keeps the **market conversation flow** — discover → compare → trust → act → measure. The MCP layer handles enumeration, scoring, and chain-derived aggregation.

---

## Core Interaction Principles

1. **Review-first**: State (a) what the AI understood, (b) the decision order, and (c) the interaction contract — before the first choice.
2. **User-driven**: Every step is an explicit user decision; the AI provides a `recommend` but never auto-advances.
3. **Neutrality**: the AI surfaces trade-offs and scores, never chooses the branch for the user.

---

## Phase 1: Discover (intent → candidates)

**Demand side** — `evaluation_operation` action=`match_discover`:
- Provide `description` + `location` (+ optional `budget`, `required_capabilities`, `category`).
- Returns location-gated, 6-dimension-scored services + recommendation reasons.
- `category` (e.g. `life_service` / `retail`) applies hard-constraint filtering + weight re-anchoring (K3 15 §3).

**Merchant side** — `evaluation_operation` action=`discover_demands`:
- Enumerate open Demands (optional `location` filter).
- A Demand carries rewards (incentive pointers); read the Reward objects by id for amounts.

---

## Phase 2: Compare & Trust

- **Compare**: the `match_discover` result already surfaces per-service scores + reasons. Surface the top-N side-by-side; highlight differences, never force a single pick.
- **Arbitrator trust**: `evaluation_operation` action=`arbitration_score` with the Arbitration `object` (history auto-fetched via `query_arbs`). Returns `trust` + `fairness` + `combined`. Use it when a merchant chooses which Arbitration to bind, or a customer judges a Service's arbitration guarantee.

---

## Phase 3: Act

- **Attention**: `evaluation_operation` action=`account_events` with the account — surfaces actionable items (unread messages, collectible payments, demand presented). Let the user act on each, never auto-act.
- **Discovery → order**: hand off to [wowok-order](../wowok-order/SKILL.md) for due diligence + order placement once the user picks a service.

---

## Phase 4: Measure & Govern

- **Metrics**: `evaluation_operation` action=`market_metrics` → active services / open demands / disputes / supply-demand ratio.
- **Anti-cheat**: `evaluation_operation` action=`anti_cheat` with a Service's orders/reviews/object-stack → returns negative-factor signals (fake order / fake review / shell merchant).
- **Operations**: `evaluation_operation` action=`market_operations` with `op` = `journey_funnel` / `referral_attribution` / `customer_relationship`.

---

## Design Principles

- **Events signal opportunities only**: chain events are emitted only for participatable/profitable opportunities (K3 13 §6.7) — not for create/pause/noise.
- **Read the object for authority**: event previews (description ≤260 chars, reward addresses) are routing hints; amounts and authoritative state are read from the object by id.
- **No fabricated matching**: always run the MCP enumeration/scoring; never invent candidates or scores.
