---
name: wowok-onboard
description: "WoWok First-Touch Onboarding — guides a NEW user from a vague first prompt to their first published Service: a Review opening, then AT MOST 8 mandatory business questions (never technical field prompts), then a dependency-aware auto-build (reuse / customize / discover). Every decision (industry, network, location, token, pricing, workflow, fund distribution, arbitration) is framed as who-wins-what and why. Produces Permission + Service + Machine + Progress + Guards + Allocation + Contact + Arbitration, verified by a test order. Not for existing merchants tuning operations — use wowok-provider. Use when: User is new to WoWok and wants to set up a service; User says \"open a shop\", \"create a service\", \"start selling\", \"onboard\"; User has no published Service yet; User asks \"what's next\" after account creation; User resumes an interrupted onboarding."
metadata:
  version: "2.0.0"
  role: shared
  related: "wowok-provider, wowok-machine"
---

# WoWok First-Touch Onboarding

Guides a new merchant from zero to first published Service in a **Review opening + AT MOST 8 mandatory business questions** (not 12 technical rounds). The AI speaks in **business / commercial terms** — it explains what each choice means for the merchant and the buyer (interests, causality, risk), and NEVER asks the user to fill a technical field. The MCP layer owns the technical defaults; this Skill owns the **business dialogue rhythm** and the **dependency-aware build order**.

> **Related Skills**: [wowok-provider](../wowok-provider/SKILL.md) (post-onboard operations), [wowok-machine](../wowok-machine/SKILL.md) (workflow design), [wowok-messenger](../wowok-messenger/SKILL.md) (customer-service Contact), [wowok-arbitrator](../wowok-arbitrator/SKILL.md) (third-party Arbitration)

---

## MCP Knowledge Layer

The following content is pushed down to the MCP layer and applied automatically — this Skill does NOT duplicate it:

| Content | Access via (MCP action) | Applied via |
|---------|--------------------------|-------------|
| Industry modes + expert description guidance | `industry_pack_operation` action='list_modes' / 'recommend_industry' (each mode now returns `location_sensitivity`, `trust_selling_points`, `build_notes`) | Q1 (industry) + Q5 (description optimization) |
| Cross-network build detection + mainnet migration checklist | `query_toolkit` query_type='migration_preflight' | Q2 (testnet vs mainnet) |
| Testnet faucet / mainnet bridge / airdrop / payment-token guidance | `wowok_buildin_info` info='funding guidance' / 'mainnet bridge tokens' | Q2 + Q4 |
| Third-party arbitrator discovery | `onchain_events` type='ArbitrationEvent' (dedupe by `object`) | Q8 (arbitration) |
| Safety rules (immutability, confirmation, object reuse) | `schema_query` action='get_safety_rules' | pre-publish + `goal_operation` action='aggregate_risks' |
| Guard / Machine / Arbitration / Treasury design rules | `schema_query` action='get_guard_design_patterns' | build + `aggregate_risks` |
| Common mistakes (field/unit/workflow pitfalls) | `wowok_buildin_info` info='common mistakes' | tool calls (proactive warnings) |
| Deployment checklist (publish readiness) | `goal_operation` action='aggregate_risks' (findings carry CRITICAL/WARN severity) + wowok-auditor pre-publish gates | before service/machine publish |
| Multi-round memory (decisions / feedback / problems) | `goal_operation` (Goal) + TaskProcess streams | every confirmation / user objection |

This Skill keeps the **business dialogue flow**, the **≤8-question gate**, and the **dependency-aware build order**. The user's intent is recorded as a Goal (`goal_operation` action='create'); actual on-chain objects are created via `onchain_operations` in dependency order.

---

## Core Interaction Principles (non-negotiable)

1. **Business-first language (最重要的原则)**: Explain every choice as "what it means for you and for your customer" — role interests, incentives, cause-and-effect, risk. NEVER phrase a question as "set field X / pass parameter Y". Translate technical defaults into business consequences and surface them as recommendations the user can accept or override.
2. **Review-first**: Before the first question, output a review stating (a) understanding of the business, (b) the dependency-chain overview (abridged, business-framed), (c) the interaction contract, (d) the free-testnet / no-money-at-risk reassurance.
3. **User-driven + ≤8 mandatory questions**: There are AT MOST 8 business questions. Everything else is an AUTO technical step with a `recommend` default — the AI discloses the default and lets the user confirm or object, but never forces a new question beyond the 8.
4. **Reuse / Customize / Discover**: For every technical component (Permission, Machine, Guard, Contact, Treasury, Arbitration, Reward, Repository), surface three avenues — reuse an existing object, customize a new one, or discover from the system.
5. **Confirm + remember**: Every business decision (workflow, fund distribution, description, arbitration) is CONFIRMED by the user before acting. User objections/questions are recorded in the process memory (`decisions` / `feedback` streams) — the onboarding is multi-round, not linear.
6. **Default-config disclosure**: Before creating anything, disclose the default configuration and its business meaning; no silent defaults.

---

## Dependency Chain (Authoritative ODG)

The technical build order (hidden from the user as a field list; surfaced as business consequences):

```
Account + network (testnet free first)
 └─ Permission (who is allowed to operate — reuse strongly recommended)
     ├─ Service DRAFT (brand identity — editable until publish)
     ├─ Machine nodes/forwards (business workflow) + Guards (what must be proven at each step)
     │    └─ PUBLISH Machine (immutable)
     └─ Service Phase 1: bind machine + buy_guard + sales + order_allocators
          ├─ Sales (products + WIP URL/hash) · order_allocators (who gets paid, on what condition)
          ├─ Contact (customer-service inbox) · Arbitration (independent dispute judge)
          └─ audit → PUBLISH Service (L1-locked) → TEST ORDER
```

**Irreversibility (translated to the user as "decide now, can't change later"):**
- `machine`, `order_allocators`, `arbitrations` are **L1-locked after publish** — set them before publishing.
- `compensation_fund > 0` requires a bound Arbitration; the Arbitration must be independent of the Service's own control (otherwise the merchant is both player and referee).
- Machine nodes/forwards and Guard logic are immutable after the Machine is published.

---

## Review Opening Protocol (before Q1)

When a new user expresses a vague intent, output this review FIRST (in business language), then ask the first question:

1. **Understanding** — restate what the user sells, to whom, and the rough business model.
2. **Journey overview** — show (abridged, non-technical) what will be built and where the user can intervene.
3. **Interaction contract** — state: at most 8 business questions; AI gives a `recommend` and waits; the user may pause/object/revisit at any time; every component offers reuse/customize/discover.
4. **Reassurance (first-use anxiety)** — testnet is completely free (faucet, no money at risk); mainnet needs gas only; you can practice before going live.

> ⚠️ No user-choice interaction happens before this review is complete.

---

## The 8 Mandatory Business Questions

Ask these in order; stop at 8. Frame each in business terms. Every question maps to MCP lookups that return business-grade defaults (never raw technical tables to the user).

### Q1 — What do you sell, and to whom? (industry alignment)

- **Business meaning**: Your business type determines the trust mechanism (how a buyer feels safe paying you), the workflow (how an order progresses), and the money split. It is the single most consequential choice.
- **MCP**: `industry_pack_operation` action='recommend_industry' with `intent`=<business description text> (→ top-3 modes), or action='list_modes'. Each mode returns `location_sensitivity`, `trust_selling_points`, and `build_notes` — surface these as "here is what buyers in your industry worry about, and what a trustworthy shop emphasizes".
- **Output to user**: the recommended industry + "buyers in this industry mainly worry about: …", in plain language.

### Q2 — Practice on testnet first, or go straight to mainnet?

- **Business meaning**: Testnet is a free sandbox (faucet, zero money at risk) for you to try everything; mainnet is real money and needs gas. Strongly recommend testnet first.
- **Existing-build detection (migration)**: call `query_toolkit` query_type='migration_preflight' with `account` (required); `source_network` / `target_network` are optional and default to testnet → mainnet (the resolved direction is echoed back in the result). If the account already built on testnet, switch to the **mainnet customization guide** — re-confirm payment token / location / arbitration (the checklist is returned by the same query), rather than re-asking everything.
- **Reassurance**: testnet is free; mainnet gas can be obtained via bridge/airdrop (`wowok_buildin_info` info='funding guidance').

### Q3 — Where do you serve? (service area / location)

- **Business meaning**: For non-shipping services (in-person, local, digital-at-a-location) the service area is the purchase gate — a buyer must be able to tell "can this merchant serve me?". For shipping services it is the delivery region. This is important; do not skip.
- **MCP**: the chosen mode's `location_sensitivity` — `strict`/`near` = must set a correct service area (non-mailing); `logistics` = delivery region (mailing).

### Q4 — Which currency do you accept? (payment token)

- **Business meaning**: On testnet everything settles in WOW (free). On mainnet you may accept stablecoins (USDT/USDC) to reduce price-volatility disputes, or ETH/WBTC; WOW itself is the gas token. This is the "should I change the payment token when going live" decision.
- **MCP**: `wowok_buildin_info` info='funding guidance' (testnet=WOW) + info='mainnet bridge tokens' (the authoritative bridge-token set with each `wowTypeTag` is served by MCP — quote that list, do not hardcode it here).

### Q5 — What are your products, prices, and descriptions? (sales + WIP)

- **Business meaning**: What the buyer pays for, how much, and what the deliverable actually is. The description is your storefront copy — the AI should propose **industry-expert optimizations** (from `trust_selling_points` + `build_notes` + `key_risk`) and get the user's confirmation.
- **WIP**: if a product needs an immutable deliverable description (a "what you will get" file), it MUST be deployed to a public URL — on-chain stores only URL + hash. Recommend deploying it; on testnet it can be skipped (`wip: ""`), on mainnet strongly recommend.
- **Confirm**: show the optimized description + prices and ask the user to confirm or adjust.

### Q6 — How does an order progress to completion? (workflow)

- **Business meaning**: From paid → delivered → confirmed, who is responsible at each step and what must be proven (e.g. "buyer confirms receipt, not the seller"). This is the core of a trustworthy shop.
- **MCP**: the mode's `machine_shape` (business states) — present as a plain-language flow, disclose the default, let the user accept or propose changes.
- **Confirm + remember**: the AI MUST present a plain-language flow description and get explicit confirmation (or the user's objection/question), recorded in memory. Multi-round is expected.

### Q7 — How and when does money get released? (fund distribution)

- **Business meaning**: Who receives the money and on what condition (e.g. funds released only after delivery confirmation). This is the revenue model and is frozen once live — decide carefully.
- **MCP**: the mode's allocator default (e.g. merchant 97% + processor 3%; full refund on cancellation). Present the split in business terms, disclose the default, let the user confirm or change.
- **Confirm + remember**: explicit confirmation required (including "who gets paid when an order is cancelled/refunded"), recorded in memory.

### Q8 — Who judges a dispute? (arbitration)

- **Business meaning**: When you and a customer disagree, an INDEPENDENT third party must judge — it cannot be the seller, or buyers won't trust you. On testnet you may skip it; on mainnet it is strongly recommended.
- **MCP**: discover independent arbiters via `onchain_events` type='ArbitrationEvent' (dedupe by `object`, shortlist by location/fee/description). Never create your own Arbitration for your own Service (conflict of interest).
- **Confirm**: recommend a third-party arbiter (or skip on testnet), get confirmation.

---

## After the 8 Questions — Auto-Build (reuse / customize / discover)

With the 8 business decisions captured, build the objects in dependency order. These are NOT new forced questions — the AI discloses each default and lets the user confirm or object:

- **Permission** — reuse an existing one (strongly recommended; single control surface), else create.
- **Service draft** — created from Q1/Q3/Q5 answers; brand name confirmed once.
- **Machine + Guards** — built from the Q6 workflow; nodes/forwards/guards disclosed, R-M1-11 compliant (business states only, no `refunded`/`disputed` terminals).
- **Sales** — from Q5 (products + WIP URL/hash).
- **order_allocators** — from Q7 (fund split), L1-locked.
- **Contact** — reuse/create the customer-service inbox (mutable; anti-spam policy disclosed).
- **Arbitration** — from Q8 (independent third party; compensation fund if configured).
- **Optional**: Reward (loyalty/discounts), supply-chain promises, Repository — offered as opt-in, never forced.

Run `goal_operation` action='aggregate_risks' before publish; fix ALL CRITICAL findings, then publish and run a user-driven test order (per-node disclosure: AI recommends the next step, the user decides).

---

## Industry Selection Guide

Call `industry_pack_operation` action='list_modes' (8 builtin modes: `freelance` / `rental` / `education` / `travel` / `subscription` / `retail` / `retail_d2c` / `general`). If unsure, call action='recommend_industry' with `intent` set to the business description text. Each mode now returns `location_sensitivity`, `trust_selling_points`, and `build_notes` — use these for Q3 (location) and Q5 (description optimization). Mid-onboarding iteration: action='derive_user_mode' / 'evolve_user_mode'.

---

## Deployment Checklist

Before declaring onboarding complete, run `goal_operation` action='aggregate_risks' — MCP auto-checks machine binding, order_allocators, buy_guard, arbitration isolation, R-M1-11 compliance, and the rest of publish readiness, returning findings with CRITICAL/WARN severity. Fix ALL CRITICAL findings, then verify remaining hard gates via `query_toolkit` (onchain_objects). The authoritative checklist is served by MCP — do not re-derive it here.

---

## Common Errors

Known field-name / unit / workflow pitfalls are served by `wowok_buildin_info` info='common mistakes' (filter by `operation` or `category`). Error-code guidance (`E_ARBITRATION_PERMISSION_CONFLICT` 33, `E_ARBITRATION_NOT_SET_WITH_COMPENSATION_FUND` 25, R-M1-11 refund routing) appears above plus MCP `schema_query` action='get_safety_rules' / 'get_guard_design_patterns'. Consult those instead of a duplicated table.
