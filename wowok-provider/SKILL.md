---
name: wowok-provider
description: "WoWok Service Provider — the canonical skill for service providers (merchants, sellers) to build, operate, and manage commercial services on WoWok. Covers service design (WIP products, Machine workflows, Allocator strategies), trust mechanisms (compensation funds, arbitration), customer attraction (discounts, rewards, supply chain promises), and order fulfillment. For customers placing orders, see wowok-order. For arbitrators, see wowok-arbitrator. Use when: User is a service provider/merchant/seller on WoWok; User wants to create a commercial service/marketplace; User wants to design workflow (Machine) for order processing; User wants to set up fund distribution strategies (Allocators); User wants to configure trust mechanisms (compensation, arbitration); User wants to handle order fulfillment and customer service; User mentions \"create service\", \"merchant\", \"seller\", \"provider\", \"workflow design\", \"compensation\", \"arbitration\"."
metadata:
  version: "2.2.1"
  role: provider
  related: "wowok-machine, wowok-messenger"
---

# WoWok Service Provider Guide

> **Role**: Service Provider (Merchant/Seller)
> **Related Skills**: [wowok-order](../wowok-order/SKILL.md) (customer), [wowok-machine](../wowok-machine/SKILL.md) (workflow), [wowok-messenger](../wowok-messenger/SKILL.md) (communication), [wowok-planner](../wowok-planner/SKILL.md) (guided build pipeline)

---

## What the MCP already enforces

Do not re-derive these — the server applies them and returns findings/prompts:

- **Pre-publish risk audit**: `goal_operation` action=`aggregate_risks` over your planned objects (safety rules, guard design, machine topology). Knowledge access: `schema_query` actions `get_safety_rules`, `get_guard_design_patterns`, `get_tool_reference`.
- **Guided build pipeline** (optional, recommended for non-trivial services): `industry_pack_operation` (recommend_industry / list_modes / derive_user_mode) and `goal_operation` action=`merchant_guide` (stateless 10-step wizard; the final step emits a topologically ordered `creation_plan`). This skill's lifecycle below is the manual path to the same result.
- **Industry archetype templates + one-click competitor migration**: `benchmark_migration_operation` — `template_list` / `template_get` / `template_scan` (pre-deploy risk scan; CRITICAL blocks) / `template_generate`, and `migration_import` → `migration_review` → `migration_apply` for migrating an existing store (URL/description → MigrationLog → scan-first creation plan; testnet unless the user explicitly confirms mainnet). Templates are editable MD files (`.wowok/industry/<industry>/templates/<variant>.md` — the client industry drawer tree) whose `user_inputs` are the business questions to confirm — the fast path that feeds the same lifecycle below.
- **Template pick — three modes** (decide BEFORE listing templates): the user names a concrete incumbent product to emulate → template match by the benchmark-product tag wins outright; the user only names an industry → start from that industry's leader/challenger variants; fully custom business → skip templates and take the guided build path. Mixed needs → template as base + partial customization. Never run a second parallel build alongside the chosen mode.
- **Migration data-source priority**: official seller APIs (e.g. SP-API) first; a user-pasted description second; a URL fetch is provenance only (detail pages are anti-scraped).
- **WIP network-deployment gate**, publish-time L1/L2 lock checks, and the compensation-fund-requires-arbitration pre-check are hard-enforced inside `onchain_operations`.
- **Execution routing for live orders** comes from `query_toolkit` query_type=`participation_radar` → `operable[].recommended_call`. Never hand-pick `order.progress` vs `progress.operate`.

---

## Interaction principles

1. **Review-first**: state what you understood, the build/modify dependency order, and the interaction contract before the first choice.
2. **User-driven**: every step is an explicit user decision; recommend, never auto-advance.
3. **Reuse / customize / discover**: for every component (Permission, Machine, Guard, Treasury, Contact, Arbitration), surface all three avenues.
4. **Default disclosure**: show a new object's defaults + caveats BEFORE the user decides. Network: the runtime uses the USER'S CURRENT network (client UI selection) — omit `env.network`; set it only when the user explicitly names a different network.

---

## Pre-flight: required business decisions

> **Golden rule**: never guess what the user sells, how their workflow operates, or how funds split — these are BUSINESS decisions. Missing → ASK; "just make something up" → REFUSE.

For each item the user gives **"Reuse: `<name/id>`"** or **"Create new: `<details>`"** or **"Discover"**:

| # | Item | Why it cannot be fabricated |
|---|------|------------------------------|
| 1 | Account (`env.account`, default `""`) | — |
| 2 | Permission (reuse strongly recommended) | Controls ALL your services |
| 3 | Service DRAFT (name, type_parameter) — create FIRST, unpublished, so Guards can reference it by LocalMark name | Breaks the Guard↔Service cycle |
| 4 | Machine: nodes, pairs, forwards | IS the business process |
| 5 | Guards: validation logic per Guard | Enforces business rules |
| 6 | Guard bindings: which Guard gates which forward | Wrong binding = unauthorized access |
| 7 | Allocators: per outcome, who gets what | IS the revenue model |

Conditional: **C1 Contact** when `customer_required` is set or customer service is wanted · **C2 WIP files** for physical goods (description, images) · **C3 Sales products** (name, price, stock, WIP each).

⛔ GATE: all items confirmed before any write. Track `[pending] / [confirmed: reuse <id>] / [confirmed: create]`. Never invent product names, prices, nodes, splits, or Guard logic — even if the user seems sure.

---

## Build lifecycle

All writes go through `onchain_operations` with `operation_type`; account from item 1 is `env.account`. Discovery via `query_toolkit` (account_list / local_mark_list / onchain_objects); file exports via `machineNode2file` and `guard2file`.

1. **Foundation** — Permission (`permission`) → Service DRAFT (`service`, `publish: false`) → Machine unpublished (`machine`: nodes → pairs → forwards).
2. **Guards** (`guard`) — design with `schema_query` action=`get_guard_design_patterns`; pass/fail gates vs runtime-submitted evidence (`b_submission` table entries) have different patterns — do not improvise, read the pattern output.
3. **Bind + publish Machine, bind Service** — `machine` "add forward" with guards → machine `publish: true` (nodes/forwards become IMMUTABLE; re-export with machineNode2file and verify) → `service` bind `machine` (must already be published) and `buy_guard`.
4. **Products** — `service` `sales: {op:'add'|'set'|'remove'|'clear', …}`; each sale `{name, price, stock, suspension, wip, wip_hash}` (price/stock are smallest-unit STRINGS). User supplies name/price/stock — never fabricate.
5. **Revenue** — `service` `order_allocators` (set BEFORE publish). Modes: Amount / Rate (bps; net base = pool − fix, or max − fix with a cap; sums to exactly 10000 with no Surplus, otherwise ≤10000) / Surplus (remainder drain, max one per allocator) / RateGross (bps on the FULL pool, or the max cap, so fixed fees and % of the order total coexist; mixing net Rate and RateGross in one allocator aborts EMIXED_RATE_BASES = 17 unless fix == 0). Recipients: `Entity` (fixed address — an org address is usually a Treasury that must hold permission 253 TREASURY_RECEIVE to intake), `Signer` (the allocation caller — do not overuse or splits collapse), `GuardIdentifier` (BOUND to the paying order: in a Service-created Allocation every `GuardIdentifier` submission must equal the paying order or the call aborts with code 15 — it is always "the order", never a third party whose address is supplied at trigger time; use `Entity` for named parties).
   Anchor tip: `Entity`/`Signer` rows resolve no submission, so an allocator paying only them leaves its Guard bound to no particular order — bind it with a zero-share `{GuardIdentifier: 0}` anchor row (pattern `allocator_order_anchor`; confirm Rate 0 with a dry-run before publishing).
6. **Customer service** — `contact` `ims: {op:'add'|'set'|'remove'|'clear'}` (IM list; mutations require permission 453 CONTACT_IM, emit no events) + enable messaging via `account_operation {messenger:{enabled:true, name_or_account}}`. Inbound filtering is the Messenger friends/guard/stranger lists (see wowok-messenger). Bind `service.um` when `customer_required`. If your Contact runs a Guarded/Closed Messenger profile, an arbitrator on your Service cannot reach you unless you `friendslist add` their address once a case is filed.
7. **Trust** — bind a REUSED third-party Arbitration: it MUST use a different Permission than the Service (`E_ARBITRATION_PERMISSION_CONFLICT` = 33). Business red line beyond the code check: the arb must be an INDEPENDENT third party — an arb whose Permission shares any controller with the Service (different Permission, same owner) means the seller judging their own case; disclose it as effectively-no-arbitration. `compensation_fund_add` funds an internal `Balance<T>` (not a Treasury, not a payment to the arb); a non-empty fund at publish requires non-empty `arbitrations` (`E_ARBITRATION_NOT_SET_WITH_COMPENSATION_FUND` = 25).
8. **Pre-publish verify** — machineNode2file + guard2file exports · `aggregate_risks` CRITICAL cleared · permission indices granted · arb Permission isolation · contact IM + messenger enabled → `service` `publish: true`.
9. **Test order** — `service` `order_new` (requires bPublished, else E_NOT_PUBLISHED=7) → disclose the next nodes → advance each forward from radar `recommended_call` → trigger allocation (below) → verify every claimant received. Use a user-chosen test account. ⚠️ Plan settlement into EVERY order from day one: reaching a terminal node releases NOTHING by itself (no auto-settle) — the funds sit frozen and the dispute window stays open until someone triggers the matching guard. The radar `fund_advice` names the favorable action per order (settle now vs dispute leverage).

### Lock levels after publish

- **L1 permanent** (no exception — the L2 lock duration does NOT unlock these; machine/order_allocators are permanently frozen once published): `machine`, `order_allocators`.
- **L2 time-locked** (requires pause + `setting_lock_duration` elapsed; default 30 days = 2,592,000,000 ms): arbitrations/rewards **remove/clear**, `compensation_fund_withdraw`.
- **L3 stays mutable**: arbitrations/rewards **add**, `buy_guard`, `sales`, `discount`, `description`, `location`, `repositories` add, `compensation_fund_add`, `setting_lock_duration_add`, `customer_required`, `um`.

Check current state with `query_toolkit` query_type=`service_panorama` (also machine_panorama for the bound Machine).

---

## Key mechanics

### Allocation: trigger + claim (two distinct steps)

After Progress reaches a terminal node, distribution is NOT automatic. Anyone can trigger it — Guard verification decides which allocator applies:

```
onchain_operations operation_type="allocation"
data: { object: <Allocation>, alloc_by_guard: <Guard name/address> }
```

If the call returns a submission prompt, re-call with the top-level `submission` carrying the requested values (conventionally the Order address at the Guard's submitted identifier). The call creates immutable Payment objects and the result prints the DISTRIBUTION DETAILS. Recipients then **claim their CoinWrapper** — it is not spendable until claimed: EOA wallet → `payment` receive (auto-derived type; omit object to claim all); Order → `order` receive; Treasury → `treasury` receive (253). Find pending wrappers via `query_toolkit` query_type=`onchain_received`. A GuardIdentifier targeting the Order puts funds in escrow in the Payment — the order owner claims via order receive.

### WIP files

`wip_file` type=`generate` ({markdown_text, images}, optional signing account) writes a `.wip` file; deploy it to a PUBLIC URL (GitHub Pages / IPFS / own site), then reference it as `sale.wip` (`wip_hash` is SHA-256, SDK auto-derives when omitted, but pin it explicitly). A local path / localhost / LAN URL passes merchant-side checks but **aborts customer `order_new` 100%** — allowed ONLY with `env.network:"localnet"`. Can't deploy? Leave `wip:""` (testing only, no integrity guarantee). Buyers should pin the on-chain `wip_hash` in each order item (anti-swap).

### Compensation fund

Add: `compensation_fund_add` (any time) · set waiting period: `setting_lock_duration_add` · withdraw ALL: `compensation_fund_withdraw` ONLY while paused AND the lock has elapsed (funds go to a new Payment owned by `receipt`). Note `compensation_fund_receive` is the CLAIM-side op for arbitration winners, not the merchant's withdrawal.
Red lines: the fund is **per-Service** — it never covers another Service's orders; size it to at least **3× your highest single-order price**, otherwise the indemnity cap is unreachable and a customer who wins a dispute may still collect nothing.

### Mainnet-only: stablecoins & bridging

WOW is the default token; supported bridge tokens/chains: `bridge_operation` operation_type `query_supported_tokens` / `query_supported_evm_chains` (addresses also in `wowok_buildin_info` info="mainnet bridge tokens"). Transfers: `cross_chain_wow_to_evm` / `cross_chain_evm_to_wow` (latter auto-claims on WOW); tracking `query_transfer_status` / `query_transfer_list`; RPC 429s via `manage_evm_rpc`. Mainnet env required — no cross-chain path on testnet.

---

## Fund-flow patterns the primitives already support

Combinations that need no new Service — staged release/holdbacks, commission holdback (no clawback exists), reward rule replacement, buyer blocklists via `buy_guard`, referral anti-self-purchase, and multi-party recourse. All are cataloged as Guard design patterns: `schema_query` action=`get_guard_design_patterns`, ids `pattern.allocation_staged_release`, `pattern.commission_holdback`, `pattern.reward_rule_replacement`, `pattern.buy_guard_blocklist`, `pattern.referral_anti_self_purchase`, `pattern.multi_party_recourse` (plus `pattern.allocator_order_anchor` for zero-share binding, below). Read each pattern's notes: VERIFIED parts are tested; INFERENCE parts need a dry-run before publishing (published allocators cannot change).

---

## Iteration: in-place vs new version

| Situation | Strategy |
|-----------|----------|
| Unpublished draft | In-place modify |
| Published, change to an L1 field (Machine, allocators) | NEW version: create new objects only for changed parts, reuse the rest by address (Permission, Guards, Treasury, Contact…), publish v2 as a separate Service — v1 keeps running. There is no fork/upgrade tool. ⚠️ Before listing a Guard as reusable, export it with `guard2file` and look for a Service address written as a constant (e.g. an `order.service == <address>` comparison) — such a Guard works for ONE Service only, and every Guard (in allocators and on Machine forwards) carrying the constant must be rebuilt for v2. Avoid this from v1 by not writing the Service address into Guards that do not need it. |
| Published, L3 change only (products, description, buy_guard…) | In-place mutate |

Before deciding, confirm published state via `service_panorama`.

**Orders are self-contained across versions.** A v2 Service is independent: existing v1 orders are never migrated. Each order carries the product info it was bought with (snapshotted inside the order at purchase time) and settles under the terms it was bought under — unrelated to whatever the currently offered products are. Never promise a customer that an old order will pick up v2 terms or products.

**Lists and scores that change: use a Repository.** Keep a mutable list or number (allowed-operator list, blocklist, score) in a Repository policy and let the Guard read it — editing the list then needs no new Guard. Comparison and count/sum limits are in GUARD_SCHEMA_NOTES (`get_guard_design_patterns`): values compare as U256 numbers only, and a Guard cannot count or sum entries. Payees and split ratios in `order_allocators` still freeze at publish — pre-declare the tiers you may need.

---

## Operating live orders

- Progress work item is the **Progress** object: canonical forward ops are `next` (advance; default), `hold` (block), `unhold` (release own hold), `adminUnhold` (force, permission 224). Execute exactly what radar `recommended_call` returns; no call suggested = not yours to execute.
- Check `customer_required` before fulfillment: missing info must arrive via encrypted Messenger to the Contact, with the Contact/WTS proof recorded as `order_required_info`.
- Demand-side business: `evaluation_operation` `demand_match` (demand→services), `service_match` (service→demands), `capability_gap`, `compose_service` are read-only; the supplier presents via `demand.present` (see wowok-supplier).
- Disputes on your orders are Arbitration cases (counterparty view: wowok-arbitrator). Merchant channel order: (1) **Messenger FIRST** — negotiate and submit evidence (order WTS records, chat transcripts) to the customer over encrypted chat; (2) when the public case record itself needs your position, use the Service call `arb_statement` (permission 321): attach a bounded statement to the case opened against one of your orders — it appends a permanent public event, mutates nothing on the Arb, works in ANY case state, and never requires holding the order. Use it to state facts or report customer conduct, not as a substitute for the Messenger evidence thread.
