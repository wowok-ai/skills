---
name: wowok-order
description: "WoWok Buyer Guide — TWO lifecycles in one skill: 1. PROSPECT (prospect due diligence, pre-purchase): E1-E11 due diligence + consensus building + graph-evaluation synthesis, ending in a buy/no-buy decision. 2. CUSTOMER (in-order fulfillment, post-order): order creation, progress advancement, fund management, and arbitration. For suppliers presenting to Demands, see wowok-supplier. For process operators executing workflow forwards, see wowok-collaborator. Use when: User is a potential buyer evaluating a service BEFORE purchasing (prospect); User is a customer/buyer placing or managing orders (customer); User wants to evaluate services, WIP, guards, allocations, arbitration; User needs to communicate with sellers via Messenger; User asks about order progress, payments, or refunds; User wants to file disputes or arbitration claims; User mentions \"buy\", \"order\", \"purchase\", \"refund\", \"dispute\", \"arbitration\", \"due diligence\"."
metadata:
  version: "2.1.0"
  role: customer
  related: "wowok-provider, wowok-arbitrator, wowok-messenger"
---

# WoWok Buyer Guide

> **Role**: Buyer — two lifecycles: **Prospect** (pre-purchase due diligence) → **Customer** (post-order fulfillment)
> **Guides**: [wowok-provider](../wowok-provider/SKILL.md) · [wowok-supplier](../wowok-supplier/SKILL.md) · [wowok-arbitrator](../wowok-arbitrator/SKILL.md) · [wowok-machine](../wowok-machine/SKILL.md) · [wowok-messenger](../wowok-messenger/SKILL.md)
> All mechanics (field schemas, formulas, abort codes, batch reads, forward routing, findings) live in the MCP — read tool schemas and query outputs; do not hand-maintain them here. Guard patterns / safety rules: `schema_query` (`get_guard_design_patterns`, `get_safety_rules`, `get_tool_reference`).

---

## Two Lifecycles

| Lifecycle | Role | Phases | Ends with |
|-----------|------|--------|-----------|
| **Prospect** | You have NOT ordered yet | Phase 1 (E1–E11) + Phase 2 | buy / no-buy decision |
| **Customer** | You are the Order `builder` | Phase 3–6 + Fund Management | funds withdrawn / dispute resolved |

Prospect analysis is computed by MCP `query_toolkit` (`query_type: "onchain_topology"`, the graph evaluation) + `evaluation_operation`; this skill only keeps the dialogue flow and the user-facing gates. The customer lifecycle is on-chain (Order/Progress/Allocation/Arb).

## Ground Rules (apply to every phase)

- **AI recommends, the user decides.** Present findings/options neutrally — never purchase, confirm receipt, send privacy info, or file a dispute without the user's explicit go-ahead.
- **Read MCP, don't recompute.** Workflow facts arrive pre-interpreted: `onchain_topology` (transitions, `terminal_names`, per-transition `recommended_call`, R/A/O/G/AC/SR findings), `query_toolkit participation_radar` (per-account `operable[].recommended_call`), and `_workflow_guidance` attached to Progress objects in `onchain_objects`. Trust `terminal_names` (structural) — never guess terminals from node names.
- **Never invent Guard logic.** Ambiguous Guard → user reviews the file; never speculate.
- **Privacy stays off-chain**: local reuse → explicit per-item confirmation → Messenger only.
- Only `builder` withdraws funds; agents may operate orders but never receive funds. Allocation/Guard rules are immutable after publish.
- Batch reads are MCP-internal (never fan out per-id). Edges/results flagged `bounded_window` / `truncated` support lower-bound conclusions only.

---

## Phase 1: Pre-Purchase Due Diligence (MANDATORY GATE)

> Complete E1–E11; user confirms each item. **🔴 ABORT / strongly advise against** · **⚠️ explain risk and wait**.

### E1 — Service basic status
`query_toolkit` → `onchain_objects` for the service; save `bPublished`, `bPaused`, `sales`, `machine`, `buy_guard`, `customer_required`, `arbitrations`, `compensation_fund`, `compensation_lock_duration`, `order_allocators`, `um`.
- `bPublished === false` or `bPaused === true` → 🔴 ABORT.

Fast pre-screen: `query_toolkit` `{ query_type: "onchain_topology", focus: "<service_id>" }`; 🔴 `evaluation.risk.total < 50` → offer early abort, skip E2–E10.

### E2 — Product / WIP
From E1 `sales[]`, skip `suspension === true`. When `wip_hash` is non-empty it is a buy-side MUST: verify with `wip_file` `{type:"verify", wipFilePath, hash_equal}` before purchase.
- Verification fails → 🔴 WIP tampered after publish · no WIP URL → ⚠️ no product evidence · empty hash → weaker commitment.

### E3 — Machine workflow (core)
Primary: `query_toolkit` → `query_type: "onchain_topology"`, `focus: "<service_id>"` (default `table_edges: ["machine.node"]`). It returns the bound Machine's flattened `transitions` (per-forward `guard` / `named_operator` / `permission_index` / `weight`) with:
- **`recommended_call` per transition** — the exact execution route (`onchain_operations` `data.progress` for `named_operator=""` OrderHolder forwards incl. the permission#5 wrong-route warning; `workflow_operation` `data.operate` for permission-index/named-operator forwards; Guard-bound forwards carry the passport requirement). Use it verbatim — do not hand-route.
- structural `terminal_names`, and objective findings (e.g. R4 process single point, G2 single substitute = hold-up, unbound-forward findings) plus `orders_completion`.

Checks and verdicts (surfaced by findings + your reading of transitions):
- Entry node (`prev_node: ""`) with no forward → 🔴 orders stuck at `current=""`.
- No user-operable path on a critical node → check the allocators first (E5) — an allocator exit may cover it; 🔴 stuck unless provider acts only if neither path nor allocator exists.
- No refund path → 🔴 only if there is **neither** (a) a forward you can operate that leads to a state whose allocator pays the Order, **nor** (b) an allocator whose Guard fires on elapsed time or on a state you can reach without the seller. Either counts.
- No arbitration path → 🔴 no recourse. **No refund AND no arbitration → strongly advise against purchase.**
- All exits pay the provider regardless → ⚠️; a forward needs a Guard the user cannot satisfy → ⚠️ cooperation needed.

Use `machineNode2file` (export once, parse locally — never node-by-node; see [wowok-machine](../wowok-machine/SKILL.md)) only when full node JSON is needed for explanation.

### E4 — Guards
1. Collect unique Guard IDs from E3 transition guards + E1 `order_allocators` + `buy_guard` (dedupe); export each with `guard2file`.
2. Semantics: `schema_query` `get_guard_design_patterns` + `get_guard_templates`; generic instructions: `wowok_buildin_info` `info: "guard instructions"`.
3. Classify: 🟢 clear purpose → explain · 🟡 multi-layer but clear intent → explain step by step · 🔴 ambiguous logic/dependencies → **warn; user must review the file**. Prioritize Guards on user-operable forwards and refund allocators.

### E5 — Fund allocation (exit map)
Read E1 `order_allocators.allocators[]` (topology also carries allocation edges). For each: cross-ref its Guard (E4) → trigger condition; map to the Machine node (E3) → when it fires; state the outcome in money terms. Before the user buys, write one row per allocator: **Who can trigger it** (anyone / only the Signer named in the Guard) · **Earliest time** (read `progress.current_time` / Clock comparisons in the Guard) · **Payee** (Order = refund to you) · **What you submit** (usually the Order address) · **State it needs**. Triggering is `allocation alloc_by_guard` and anyone may do it, including you; when the payee is the Order, finish with `order receive: "recently"`. The earliest time a provider-paying allocator can fire is the user's dispute window — state that number in plain time units before they buy. If the Machine gives the user no forward, do not conclude the order can be stuck: check the allocators first.
- No 100%→Order allocator → 🔴 no refund mechanism · surplus receiver = provider → ⚠️ · triggers only on provider-only paths → ⚠️ unilateral collection · no allocators on user-operable paths → ⚠️ no financial control. Safest: 100%→Order allocator on a user-operable forward.

### E6 — Arbitration
Batch query E1 `arbitrations[]` via `onchain_objects`; also `onchain_events` `type: "ArbEvent"` (recent, filter those IDs). Process detail: [wowok-arbitrator](../wowok-arbitrator/SKILL.md).
- Empty list → 🔴 no recourse · any `bPaused === true` → 🔴 unavailable · high fee / closed `voting_guard` / no history → ⚠️.

### E7 — Compensation fund
From E1: `compensation_fund`, `compensation_lock_duration`. Balance below planned order amount → ⚠️; lock near expiry (provider can withdraw) → ⚠️.

### E8 — Contact channel
`onchain_objects` for E1 `um` (use `customer_required` from E1). `customer_required` non-empty AND (`um === null` or the Contact's `ims[]` empty) → 🔴 ABORT — the Service asks for private data but publishes nowhere to send it. `customer_required` empty and `um === null` → ⚠️ no in-band channel — rely on on-chain state and the Machine; explain and wait. Active `ims[]` → proceed.

### E9 — Chain reputation
The aggregate view is already computed inside the `onchain_topology` graph evaluation (trust dimension) and `query_toolkit relationship_profile` (derived relationships) — present those rather than hand-aggregating.
Only when raw evidence is needed (all reads batched, ≤50/batch): `onchain_table_data` `onchain_table_item_entity_linker` (provider address → `votes[]` {who, like, dislike, favor}) + `onchain_table_data` `onchain_table_item_object_linker_tx` (Service address → recent binding Orders, FIFO 0xaaf window — lossy) → dispute rate / repeat-buyer ratio; >10% dispute → ⚠️.
Presenter history (merchant active on Demands): aggregate `onchain_events` `DemandFeedbackEvent` filtered by the merchant's Service, or `onchain_table_data` `onchain_table_item_demand_presenter` per Demand (row carries `acceptance_score`, null = unrated); pass as `presenter_history` to `evaluation_operation` (`demand_match`). Omit when no presenter activity (neutral without history).

### E10 — Privacy matching (LocalInfo)
From E1 `customer_required[]` (e.g. name/phone/shipping_address):
1. `query_toolkit` → `local_info_list`; match each required name (case-insensitive) to a stored entry.
2. Matched → propose the `default` + offer `contents` alternatives; missing → ask the user.
3. Persist new values with `local_info_operation` `add` (100% local, never on-chain).
> ⛔ Never transmit any private item without explicit per-item confirmation. Transmission is Messenger only (Phase 2).

### E11 — Graph evaluation synthesis
`query_toolkit` `{ query_type: "onchain_topology", focus: "<service_id>" }` → `evaluation` = `trust` + `risk` (each a 0-100 `total` with `level`/`breakdown`/`red_flags`/`blocked`), `completeness`, `coverage` slots, and `unverified` rules (data gaps are never scored as low). ⛔ `evaluation.risk.blocked` (critical red flags) → resolve with the user before Phase 2. Compare candidates by running the same query per service: present per-metric bests, **no overall ranking**.

### Pre-purchase gate
🔴 Abort: E1 unpublished/paused · E8 no usable channel for `customer_required` info · E3 no-refund + E6 no-arb · E4 ambiguous Guards (user review) · E11 `evaluation.risk.blocked` unresolved. Every ⚠️ = explain and wait. All clear → Phase 2.

**Dependency**: E1 first; E2/E8/E10/E7/E6 parallel after E1; E3→E4→E5 strict chain; E9 follows E3; E11 last (aggregates everything).

---

## Phase 2: Consensus building

On-chain rules (Phase 1) are immutable truth; Messenger is the encrypted, self-verifiable supplement — it clarifies, never overrides. Full ops: [wowok-messenger](../wowok-messenger/SKILL.md).

1. **Send privacy** to E8 `ims[]` via `messenger_operation` `send_required_info` (one E2E message) or `send_message`; per-item confirmation; persist new values via `local_info_operation add`.
2. **Negotiate**: deliverables (E2 WIP), timeline (E3 nodes), refund/cancellation (E3/E5), privacy receipt (E10). Evidence value requires the recipient's explicit confirmation (ARK signature); generate WTS evidence.
3. **Gate**: info sent & acknowledged · seller confirmed deliverables and edge cases · WTS evidence generated. Notify the order ID by Messenger after purchase.

---

## Phase 3: Order creation

- Enable Messenger on the buying account before you buy — an arbitrator can only ask you for evidence if your account is registered (`messenger_operation` `enable_messenger` covers your own account only).
- Buy (`onchain_operations` service `buy`): `wip_hash` MUST equal the current sale hash (never `""` when set); coin ≥ amount, excess auto-refunds to the sender in the same tx; agents cannot withdraw.
- Discounts: `query_toolkit` → `onchain_received` with type `0x2::service::Discount`, filter by `service`, validate benchmark/time validity per the tool schema (rate/fixed semantics described on `discount_type`/`off`); pass the chosen Discount in the buy call.

---

## Phase 4: Order operations

When the user reaches a node, present the forward's three aspects together — never just an operation name:
1. **Execution route**: the forward's `recommended_call` (from `participation_radar` / `_workflow_guidance`): `data.progress` for OrderHolder forwards, `data.operate` for others.
2. **Guard requirements** (E4) — bound Guard means validated passport, no bypass.
3. **Financial outcome** (E5) — which Allocation fires.

`current === ""` diagnosis: `onchain_objects` attaches `_diagnostic` (cause + republish fix) on the Progress object — relay it verbatim.

---

## Phase 5: Arbitration

Flow: `arbitration dispute` (the case starts in state 1 — no customer confirmation at filing) → send the signed WTS by Messenger → the arbitrator confirms and rules → you may `arb_claim_compensation` (accept) or `arb_objection`. After an objection the arbitrator `reset`s the case to state 0 and **you must call `order.arb_confirm` again** to put it back in state 1; until you do, nothing moves. Do not call the arbitration-side `confirm`: it is the arbitrator's call and fails with `Missing permissions 361`. Process: [wowok-arbitrator](../wowok-arbitrator/SKILL.md).

When you file, send exactly one first message to the arbitrator: the signed WTS with the Arb address in its caption/text (a stranger thread allows one message until they reply).

**Before filing**, review the whole evidence pile at once with `evaluation_operation` `action: "evidence_review"` (list mode `items[]`: id/kind/hash_committed/digital_check_passed/contradiction/proof_ref; kinds per the tool schema).
- Output partitions `usable` / `manual` / `rejected` and returns `proof_candidates` + `dispute_hint`.
- Let the user PICK which proof candidates to reference (never auto-attach; the on-chain `dispute` has no proof field — references travel in the description / Messenger).
- "no evidence passed" → anchor more evidence (Messenger WTS → Proof) before filing.
- Fee is paid separately (not from the Order); one compensation claim per Order; source is `compensation_fund` (E7). After a ruling of 0 you can still call `arb_claim_compensation`: it costs only gas, closes the case (state 5) and lets the arbitrator take the fee immediately.

**When to file — timing changes the payout source.** While the order's escrow pool is still FUNDED and unsettled, a claim redirects POOL money directly — the strongest collection window (and your only lever that changes where pool funds go). Once the pool has settled or drained, payouts route via the Service `compensation_fund` instead: check its balance first (it is per-Service and an underfunded fund can leave a won claim unpayable). `participation_radar` `fund_advice` states the live fund path per order — read it before advising the user on timing. A ruling never re-splits the pool's ratios: on-chain refunds stay all-or-nothing; a "partial refund" outcome must be negotiated off-chain between the parties.

---

## Fund management (builder only)

`order.transfer_to` (ownership, irreversible) and `order.receive` (withdraw) are on `onchain_operations` operation_type `order`. Agents may execute `receive`, but only the builder gets the funds.

After an Allocation distributes `CoinWrapper` to the Order, the builder MUST `receive` to unwrap + withdraw (funds stay locked otherwise):

```json
{ "tool": "onchain_operations", "data": { "operation_type": "order", "data": { "object": "<order_id>", "receive": "recently" } }, "env": { "account": "<builder>", "confirmed": true } }
```

- `"recently"` = all recently-received CoinWrapper; precise form = explicit `[{id,type}]` or the `onchain_received` (type `CoinWrapper`) balance passed DIRECTLY (never wrap in `{result:...}`).
- Call when: refund allocation fires · compensation awarded · multi-stage split (one `"recently"` clears all). Do NOT call when the order closed with no allocation. Query first — don't call with no funds.

---

## Phase 6: Customer intelligence (MCP-handled)

When `customer_intelligence` is ON (default), order/query responses carry `semantic.customer_advice` — read it, do not recompute:
- `reminders[]`: `required` (blocks purchase) / `recommended` (strong caution) / `info` / `reminder` (timed nudge).
- `risk_score` 0–100 (🟢≥85 · 🟡70–84 · 🟠50–69 · 🔴<50) · `preference_match` 0–100 (`matches`/`mismatches`; ≥75 strong, <50 mismatch).
- Red lines: no arb + no refund path, OR `compensation_ratio < 0.5`. Post-purchase: monitor refund triggers, WIP hash mismatch, merchant unreachable (>3d warn → >7d arb), evidence ≥3 items.
- Runtime toggle: `config_operation` `action:"toggle" service:"order_monitor"` (default OFF; enable when active orders exist).

Plug-in `evaluation_operation` (read-only; read results, don't recompute): `demand_match` / `service_match` (rank vs capability vector), `capability_gap`, `compose_service`, `node_game` / `arb_game` (best-move + payoff; pair with `query_toolkit participation_radar` output). The role decides and acts.
