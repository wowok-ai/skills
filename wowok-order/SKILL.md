---
name: wowok-order
description: |
  WoWok Customer Guide — complete buyer order lifecycle: pre-purchase due diligence
  (E1-E11), consensus building, order creation, progress advancement, and arbitration.
when_to_use:
  - User is a customer/buyer placing or managing orders
  - User wants to evaluate services before purchasing
  - User needs to communicate with sellers via Messenger
  - User asks about order progress, payments, or refunds
  - User wants to file disputes or arbitration claims
  - User mentions "buy", "order", "purchase", "refund", "dispute", "arbitration"
---

# WoWok Customer Guide

> **Role**: Customer (Buyer/Order Holder)
> **Guides**: [wowok-provider](../wowok-provider/SKILL.md) · [wowok-arbitrator](../wowok-arbitrator/SKILL.md) · [wowok-machine](../wowok-machine/SKILL.md) · [wowok-messenger](../wowok-messenger/SKILL.md)
> Guard patterns / safety rules / tool references live in the MCP knowledge layer — query via `schema_query` (`get_guard_design_patterns`, `get_safety_rules`, `get_tool_reference`).

---

## Core Concepts (Design Invariants Not in Schema)

- **Objects**: Purchase creates **Order** (fund escrow, you are `builder`), **Progress** (Machine node tracker), **Allocation** (fund distribution). Only `builder` withdraws; agents operate but never access funds.
- **No-Bypass Rule**: A forward with `namedOperator === ""` is "user-operable", but if it also binds a Guard, passport verification is mandatory and cannot be bypassed (`order.next` fails without validated passport).
- **Weight Accumulation**: Each forward contributes `weight` toward a node's `threshold`; `weight ≥ threshold` → one operation suffices. Parse `machineNode2file` JSON; never query node-by-node.
- **Allocation Triggers**: Allocation evaluates when Progress reaches **any** configured node (not just exit nodes). Winning Allocator = first whose Guard returns `true`. Rules immutable after publish.

---

## Phase 1: Pre-Purchase Due Diligence (MANDATORY GATE)

> **⛔ Complete E1-E11 in order; user must confirm every item.** **⚠️** = explain risk, wait. **🔴** = strongly advise against.

### E1 — Service Basic Status

Query `query_toolkit` → `onchain_objects` for `<service_name_or_id>`. Save: `bPublished`, `bPaused`, `sales`, `machine`, `buy_guard`, `customer_required`, `arbitrations`, `compensation_fund`, `compensation_lock_duration`, `order_allocators`, `um`.

- `bPublished === false` → 🔴 **ABORT**
- `bPaused === true` → 🔴 **ABORT**
- OK → E2

### E2 — Product & WIP Verification

From E1 `sales[]`; skip `suspension === true`. Verify WIP (mandatory when `wip_hash` non-empty): `wip_file` → `type: "verify"`, `wipFilePath: "<wip_url>"`, `hash_equal: "<wip_hash>"`.

- `wip_hash` empty → no on-chain commitment (weaker evidence)
- Verification fails → 🔴 **WIP tampered after publish**
- No `wip` URL → ⚠️ No product evidence

### E3 — Machine Workflow Analysis (CORE)

1. `query_toolkit` → `onchain_objects` for `<machine_id>`; fail if `bPublished === false` or `bPaused === true`.
2. Entry-node check: entry node (`prev_node: ""`) must have ≥1 forward, else Progress stuck at `current=""` → 🔴 BLOCKER.
3. `machineNode2file` → export full Machine JSON (parse locally; see [wowok-machine](../wowok-machine/SKILL.md)).

**Classify every forward**:

| `namedOperator` | `guard` | User Can Execute? | Operation Path |
|-----------------|---------|-------------------|----------------|
| `Some("")` | `None` | ✅ Independently | `order.progress` |
| `Some("")` | `Some({...})` | ⚠️ Guard passport (no bypass) | `order.progress` + Passport |
| `None` | Any | ❌ Provider/permission-holder | `progress.operate` |
| `Some("<other>")` | Any | ❌ Named operator | `progress.operate` |

> **⚠ ROUTING RULE**: `namedOperator=""` (OrderHolder) → use `order.progress` (NOT `progress.operate`); `progress::next` aborts "Permission denied" (code 5) because Progress-level checks don't recognize the OrderHolder short-circuit. The `""` operator is set by `service::buy` (customer = operator). All other cases (non-empty `namedOperator` or `permissionIndex`) → `progress.operate`.

**Detect paths**: terminal (no outgoing) → order ends; refund → 100%→Order Allocator (E5); arbitration → arb nodes; user-blocked → all forwards `namedOperator ≠ ""`.

| Risk Signal | Level |
|-------------|-------|
| No user-operable path from critical node | 🔴 Stuck unless provider acts |
| No refund path | 🔴 No fund recovery |
| No arbitration path | 🔴 No recourse |
| All exits favor provider | ⚠️ Provider paid regardless |
| Forward requires Guard user can't pass | ⚠️ Cooperation needed |

> **🔴 "No refund" + "No arbitration" → strongly advise against purchase.**

### E4 — Guards Analysis

Guard structure/instructions: `schema_query` action='get_guard_design_patterns' + action='get_guard_templates'. Steps: (1) collect unique Guard IDs from E3 `forward.guard.guard` + E1 `order_allocators` + `buy_guard`, dedupe; (2) `guard2file` export each; (3) `wowok_buildin_info` → `info: "guard instructions"`; (4) classify:

| Level | Criteria | Action |
|-------|----------|--------|
| 🟢 Simple | Clear purpose, few conditions | Explain |
| 🟡 Complex | Multi-layer, intent clear | Explain step-by-step |
| 🔴 Ambiguous | Unclear logic/dependencies | **Warn. Never speculate. User must review file.** |

> **⛔ Never invent Guard logic. Prioritize Guards gating user-operable forwards and refund allocators.**

### E5 — Fund Allocation Rules

From E1 `order_allocators.allocators[]`: cross-ref Guard (E4) → trigger; map to Machine node (E3) → when fires; present outcome.

| Check | Risk |
|-------|------|
| No 100%→Order Allocator | 🔴 No refund mechanism |
| Surplus receiver = provider | ⚠️ Remainder to provider |
| Triggers only on provider-only paths | ⚠️ Unilateral collection |
| No allocators on user-operable paths | ⚠️ No financial control |

> **Safeguard**: 100%→Order Allocator on a user-operable forward.

### E6 — Arbitration Availability

Batch query E1 `arbitrations[]` via `onchain_objects` (process: [wowok-arbitrator](../wowok-arbitrator/SKILL.md)). Also `onchain_events` → `type: "ArbEvent"`, `limit: 20`, filter those Arb IDs.

- `arbitrations[]` empty → 🔴 no recourse
- Any Arb `bPaused === true` → 🔴 unavailable
- High `fee` / closed `voting_guard` / no history → ⚠️

### E7 — Compensation Fund

From E1: `compensation_fund`, `compensation_lock_duration`.

- Balance < planned order amount → ⚠️ may not cover award
- Lock near expiry → ⚠️ provider may withdraw

### E8 — Contact Channel

Query `onchain_objects` for E1 `um` ID.

- `um === null` → 🔴 **ABORT**
- `ims[]` empty → 🔴 **No Messenger**
- Has active `ims[]` → E9

### E9 — Chain Reputation

Sentiment: `query_toolkit` → `onchain_table_item_entity_linker` for provider; compute likes/dislikes from `votes[]`. Orders: batch query `votes[].address` via `onchain_objects` (50/batch, max 200), filter `service` match; aggregate dispute rate (`dispute ≠ []` / total) + repeat-buyer ratio. Dispute rate >10% → ⚠️.

### E10 — Privacy Information Matching (LocalInfo reuse)

From E1 `customer_required[]` (e.g. `["name", "phone", "shipping_address"]`). Reuse locally-stored private info so the user never re-types it:

1. `query_toolkit` → `query_type: "local_info_list"` to list stored private info (each `name` → `default` + optional `contents`).
2. Match each `customer_required` name against a local `name` (case-insensitive):
   - **Matched** → auto-fill the `default`; confirm "use this?" and offer any `contents` alternatives.
   - **Missing** → ask the user for the value.
3. **Save** any newly-provided value via `local_info_operation` → `add: { op: "add", data: [{ name, default }] }` (100% local, never on-chain).

> **⛔ Never send private info without explicit user confirmation per item.** Transmission: **Messenger only** (Phase 2), never on-chain.

### E11 — Trust Score Synthesis (Preorder Advice)

`wowok({ tool: "trust_score", data: { service: "<service_id>", depth: "preorder", order_amount: "<planned_amount>" } })`.

- Returns trust score + per-dimension risks + preorder advice (order confidence, game strategies, preference match, industry risks, `blocking_reminders`); non-empty `blocking_reminders` → ⛔ resolve with user BEFORE Phase 2.
- Compare candidates: `compare_with: ["<id2>", ...]` (1–9, same `depth: "preorder"`) → gains `comparison` block with per-metric bests, **NO overall ranking** (buyer decides).
- Optional `preferences` / `user_metrics` reflect the buyer's priorities.
- Fast pre-screen at E1: `depth: "evaluate"` (default); 🔴 `risk_score` <50 → advise early abort, skip E2–E10.

### Pre-Purchase GATE

**Abort**: E1 `bPublished=false`/`bPaused=true`; E8 `um=null`; E3 no-refund + E6 no-arb → strongly advise ABORT; E4 ambiguous Guards → user must review; E11 `blocking_reminders` → resolve. **Any ⚠️** → explain + wait. **All OK** → Phase 2.

---

## Phase 2: Consensus Building

Foundation = immutable on-chain rules (Phase 1). Messenger = encrypted, self-verifiable supplement (clarifies, cannot override on-chain). Full ops: [wowok-messenger](../wowok-messenger/SKILL.md).

### 2.1 Send Privacy Info

Contact `ims[]` from E8. Send E10 info via `messenger_operation` → `send_message`. **Messenger only — never on-chain.** Explicit user confirmation per item. After sending, persist any newly-provided value via `local_info_operation` `add` (so future orders auto-fill).

### 2.2 Negotiate

Clarify via Messenger: deliverables (E2 WIP), timeline (E3 nodes), refund/cancellation (E3/E5), privacy received (E10). Evidence value requires recipient **explicit confirmation** (ARK signature). WTS evidence: [wowok-messenger](../wowok-messenger/SKILL.md).

### 2.3 Consensus GATE

- [ ] E10 info sent and acknowledged
- [ ] Seller confirmed deliverables and edge cases
- [ ] WTS evidence generated

---

## Phase 3: Order Creation

Not in schema: excess `buy.total_pay` auto-refunded; agents cannot withdraw. Discounts: query `onchain_received` (type `0x2::service::Discount`), filter by `service`, validate time/benchmark; rate = `total_pay × (off / 10000)`; fixed = `min(off, total_pay)`. Post-creation: notify via Messenger with order ID.

---

## Phase 4: Order Operations

### Progress Advancement

When user reaches a node, cross-reference Phase 1: (1) E3 user-operable forwards; (2) E4 Guard requirements; (3) E5 financial outcome. Present all three — never just the operation name.

- `namedOperator === ""` + no Guard → `order.progress`
- `namedOperator === ""` + Guard → passport required (no bypass)
- `namedOperator !== ""` → not user-operable

### Progress.current="" Diagnostic (stuck at initial state)

Root cause: entry node (`prev_node: ""`) has empty `forwards[]`. Fix: clone Machine + add forward + republish + rebind (nodes immutable after publish). MCP `query_toolkit` attaches `_diagnostic` (cause + 5-step fix) when `current=""` is detected.

---

## Phase 5: Arbitration

Process: [wowok-arbitrator](../wowok-arbitrator/SKILL.md). Flow: `arbitration.dispute` → WTS evidence → Messenger → `order.arb_confirm` → voting → (`order.arb_objection`) → `order.arb_claim_compensation`.

Not in schema: fee paid separately (not from Order); one compensation claim per Order; source = `compensation_fund` (E7).

---

## Fund Management

Builder-only: `order.transfer_to` (ownership), `order.receive` (withdraw). Agents may execute `receive`, but only the builder receives funds.

### Withdraw via `order.receive`

After Allocation distributes `CoinWrapper` objects to the Order, the builder MUST call `order.receive` to unwrap + withdraw; otherwise funds stay locked as `CoinWrapper`.

- **Schema**: `receive` accepts `ReceivedObjectsOrRecentlySchema` (consistent with `owner_receive` on ALL objects). Pass directly — do NOT wrap in `{result: ...}` (that is `QueryReceivedResult`).
- **Simplest form** — `"recently"` auto-receives all recently-received `CoinWrapper`:

```json
{ "tool": "onchain_operations", "data": { "operation_type": "order", "data": { "object": "<order_id>", "receive": "recently" } }, "env": { "account": "<builder>", "network": "testnet", "confirmed": true } }
```

- **Precise form** — pass an explicit `[{id, type}]` array, or pass the `ReceivedBalance` from `query_toolkit` → `query_type: "onchain_received"` (type `CoinWrapper`) directly as `receive`.
- **Result** — builder receives the underlying token (CoinWrapper auto-unwrapped); digest returned.

**When to call**:

| Trigger | Action |
|---------|--------|
| Allocation fires (refund on `return_approved`) | `order.receive` → withdraw to builder |
| Arbitration awards compensation | `order.receive` → withdraw to builder |
| Multi-stage allocation (partial refund + deduction) | `order.receive` `"recently"` (all at once) |
| Order closed with no allocation | Do NOT call (nothing to withdraw) |

**Pitfalls**: don't wrap in `{result:...}`; query first (don't call with no funds); only builder receives; CoinWrapper auto-unwraps to the underlying token.

---

## Phase 6: Customer Intelligence (MCP-Handled)

> **MCP auto-populates `semantic.customer_advice`** in order/query responses when `customer_intelligence` is ON (default). Read from MCP output — do NOT recompute.

Key fields: `reminders[]` (`required` blocks purchase; `recommended` = strong caution; `info` = advisory; `reminder` = timed nudge); `risk_score` 0-100 (🟢≥85 | 🟡70-84 | 🟠50-69 | 🔴<50 advise against); `preference_match` 0-100 with `matches`/`mismatches` (≥75 strong, <50 mismatch).

**Red lines** (do not purchase): no arb + no refund path, OR `compensation_ratio < 0.5`. **Post-purchase**: monitor refund Allocator triggers, WIP hash mismatch, merchant unreachable (>3d warning, >7d arb), evidence collection (≥3 items). **Runtime toggle**: `config_operation` → `action: "toggle"`, `service: "order_monitor"` (default OFF).

---

### Phase Dependency

E1 (Service) → E2 (Products/WIP), E8 (Contact), E10 (Privacy), E7 (Compensation), E6 (Arbitrations) run in parallel after E1. E3 (Machine) → E4 (Guards) → E5 (Allocators) is a strict chain. E9 (Reputation) follows E3. E11 (Trust Score) runs LAST — aggregates all prior findings.