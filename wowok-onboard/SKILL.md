---
name: wowok-onboard
description: "WoWok First-Touch Onboarding — guides a NEW user from a vague first prompt to their first published Service: a Review opening, then AT MOST 8 mandatory business questions (never technical field prompts), then a dependency-aware auto-build (reuse / customize / discover). Every decision (industry, network, location, token, pricing, workflow, fund distribution, arbitration) is framed as who-wins-what and why. Produces Permission + Service + Machine + Progress + Guards + Allocation + Contact + Arbitration, verified by a test order. Not for existing merchants tuning operations — use wowok-provider. Use when: User is new to WoWok and wants to set up a service; User says \"open a shop\", \"create a service\", \"start selling\", \"onboard\"; User has no published Service yet; User asks \"what's next\" after account creation; User resumes an interrupted onboarding."
metadata:
  version: "2.1.0"
  role: shared
  related: "wowok-provider, wowok-machine"
---

# WoWok First-Touch Onboarding

Take a new merchant from zero to first published Service via a **Review opening + AT MOST 8 mandatory business questions**. Speak business/commercial language — what each choice means for merchant and buyer (interests, causality, risk) — NEVER "set field X". The MCP owns technical defaults; this skill owns the **dialogue rhythm** and **dependency-aware build order**.

> Related: [wowok-provider](../wowok-provider/SKILL.md) (post-onboard ops) · [wowok-machine](../wowok-machine/SKILL.md) · [wowok-messenger](../wowok-messenger/SKILL.md) · [wowok-arbitrator](../wowok-arbitrator/SKILL.md)

---

## What the MCP already handles (don't duplicate)

| Content | Access |
|---|---|
| Industry modes, recommendation, expert description guidance | `industry_pack_operation` `list_modes` / `recommend_industry` (items carry `location_sensitivity`, `trust_selling_points`, `build_notes`; full modes also carry `machine_shape`, `key_risk`, allocator/guards) |
| Cross-network build detection + migration checklist | `query_toolkit` query_type=`migration_preflight` (`account` required; direction defaults testnet→mainnet) |
| Faucet / bridge / airdrop / payment-token guidance | `wowok_buildin_info` info=`funding guidance` / `mainnet bridge tokens` (quote the served token list + `wowTypeTag`, never hardcode) |
| Third-party arbiters | `onchain_events` type=`ArbitrationEvent` (dedupe by `object`; shortlist by location/fee) |
| Field/unit/workflow pitfalls | `wowok_buildin_info` info=`common mistakes` |
| Safety + Guard/Machine/Arbitration design rules | `schema_query` `get_safety_rules` / `get_guard_design_patterns` |
| Publish readiness (CRITICAL/WARN findings) | `goal_operation` action=`aggregate_risks` |
| Multi-round memory (decisions/feedback) | `goal_operation` (Goal + TaskProcess streams) |

---

## Non-negotiable interaction rules

1. **Business-first**: every question is "what this means for you and your customer", never a technical field prompt. Translate defaults into consequences; offer them as recommendations.
2. **Review-first**: before Q1 output (a) restated understanding of the business, (b) abridged build journey with intervention points, (c) the contract — ≤8 questions, recommendations wait for confirmation, pause/object/revisit always allowed, reuse/customize/discover on every component, (d) testnet reassurance — free faucet, zero money at risk; mainnet needs gas only.
3. **≤8 mandatory questions**; everything else is an auto step with a disclosed `recommend` default — confirm or object, never a 9th question.
4. **Reuse / customize / discover** for Permission, Progress, Machine, Guards, Contact, Allocation, Arbitration, Reward, Repository.
5. **Confirm and remember** every business decision (Goal process streams); onboarding is multi-round.
6. **No silent defaults**: disclose configuration + business meaning before creating.

---

## Dependency chain (build order)

```
Account + network (testnet first)
└─ Permission            (operators; reuse strongly recommended)
   ├─ Service DRAFT      (brand identity; editable until publish)
   ├─ Progress ledger    (per-node accomplishment schema the Machine binds)
   ├─ Machine nodes/forwards + node Guards → PUBLISH Machine (immutable)
   └─ Service bind: machine + buy_guard + sales + order_allocators
        ├─ Sales (products + WIP URL/hash) · Allocators (who gets paid, when)
        ├─ Contact (support inbox) · Arbitration (independent judge)
        └─ aggregate_risks → PUBLISH Service → TEST ORDER
```

**Irreversibility to translate as "decide now"**:
- After Service publish, `machine` and `order_allocators` are **L1 permanent locks**.
- `arbitrations` / rewards are **L2 time-locks**: you may still ADD after publish; remove/clear requires pause + the lock duration to elapse.
- Machine nodes/forwards and each Guard are immutable once the Machine is published.
- `compensation_fund > 0` requires a bound Arbitration — independent of the Service's controllers (same Permission aborts 33).

---

## The 8 questions (ask in order, business-framed)

**Q1 — What do you sell, to whom?** Determines trust mechanism, workflow, split. `recommend_industry {intent}` → top-3 modes; surface each mode's `trust_selling_points`/`build_notes` as "what buyers in this industry worry about". Builtin modes (8): `freelance` `rental` `education` `travel` `subscription` `retail` `retail_d2c` `general`; mid-onboarding tweaks use `derive_user_mode` / `evolve_user_mode`.

**Q2 — Testnet practice or mainnet now?** Recommend testnet. Run `migration_preflight` — if the account already built on testnet, switch to the migration checklist (re-confirm token/location/arbitration/WIP/gas), don't re-ask.

**Q3 — Where do you serve?** Purchase gate for local/in-person, delivery region for shipping. Use the mode's `location_sensitivity`: `strict` = location must match demand area; `near` = digital/global, location is a service region; `logistics` = delivery region.

**Q4 — Which currency?** Testnet settles WOW (free); mainnet may use USDT/USDC/ETH/WBTC to cut volatility — quote the served bridge-token list, not a hardcoded one.

**Q5 — Products, prices, descriptions?** Propose expert-optimized storefront copy from `trust_selling_points` + `build_notes` + `key_risk`; confirm prices. WIP: an immutable deliverable spec lives at a public URL — on-chain stores URL + hash only; skippable on testnet, strongly recommended on mainnet.

**Q6 — How does an order progress?** Present the mode's `machine_shape` as a plain-language paid→delivered→confirmed flow (who proves what — e.g. buyer confirms receipt). Explicit confirmation/objection recorded. Nodes stay business states — no refund/dispute terminals (R-M1-11).

**Q7 — How and when is money released?** Present the mode allocator default in business terms (e.g. merchant 97% + processor 3%; full refund on cancellation), including the cancellation path. Explicit confirmation; this is L1-locked at publish.

**Q8 — Who judges disputes?** An INDEPENDENT third party — never the seller's own controllers. Discover via `ArbitrationEvent`; bind by reference. Skippable on testnet; strongly recommended mainnet.

---

## Auto-build & finish

With the 8 decisions captured, create in dependency order (each default disclosed, not a new question): Permission (reuse) → Service draft → Progress ledger → Machine + Guards (R-M1-11) → publish Machine → sales/WIP → order_allocators → Contact (support IMs; anti-spam disclosed) → Arbitration binding (+ compensation fund if chosen). Reward / supply-chain promises / Repository are opt-in offers.

Then: `aggregate_risks` → fix ALL CRITICAL findings → publish Service → run a **user-driven test order** (AI recommends the next per-node step, user decides). Remaining hard gates via `query_toolkit` query_type=`onchain_objects`; the authoritative checklist is MCP-served — don't re-derive it.

## Errors

Pitfalls and error-code guidance (`E_ARBITRATION_PERMISSION_CONFLICT` 33, `E_ARBITRATION_NOT_SET_WITH_COMPENSATION_FUND` 25, R-M1-11 refund routing) come from `common mistakes` / `get_safety_rules` / `get_guard_design_patterns` — consult them rather than keeping a duplicated table.
