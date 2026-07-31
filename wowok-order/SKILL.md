---
name: wowok-order
description: |
  WoWok Customer Guide — complete buyer order lifecycle: pre-purchase due diligence
  (E1-E10), consensus building, order creation, progress advancement, and arbitration.
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
> **Provider Guide**: [wowok-provider](../wowok-provider/SKILL.md) | **Arbitration Guide**: [wowok-arbitrator](../wowok-arbitrator/SKILL.md) | **Machine**: [wowok-machine](../wowok-machine/SKILL.md) | **Messenger**: [wowok-messenger](../wowok-messenger/SKILL.md)
> Guard design patterns, safety rules, and tool references now live in the MCP knowledge layer — query via `schema_query` actions `get_guard_design_patterns`, `get_safety_rules`, `get_tool_reference`.

---

## Core Concepts (Design Invariants Not in Schema)

### Object Relationships

Purchase creates three objects: **Order** (fund escrow, you are `builder`), **Progress** (Machine node tracker), **Allocation** (fund distribution engine). Only `builder` withdraws funds. Agents may operate but never access funds.

### The No-Bypass Rule

A forward with `namedOperator === ""` signals "user-operable". **However**: if that forward also binds a Guard, passport verification is mandatory and **cannot be bypassed**. `order.next` fails without validated passport. This is a protocol invariant.

### Weight Accumulation

Each forward contributes `weight` toward a node's `threshold`. `weight ≥ threshold` → one operation suffices. Multi-forward nodes may require cumulative multi-party contributions. Parse the `machineNode2file` JSON output; never query node-by-node.

### Allocation Triggers

Allocation evaluates when Progress reaches **any** configured node (not just exit nodes). The winning Allocator is the first whose Guard returns `true`. Rules are immutable after Service publish — both parties see identical conditions.

---

## Phase 1: Pre-Purchase Due Diligence (MANDATORY GATE)

> **⛔ Complete E1-E10 in order. User must explicitly confirm every item.**
> **⚠️ = explain risk, wait for decision. 🔴 = strongly advise against purchase.**

---

### E1 — Service Basic Status

Query `query_toolkit` → `onchain_objects` for `<service_name_or_id>`. Save: `bPublished`, `bPaused`, `sales`, `machine`, `buy_guard`, `customer_required`, `arbitrations`, `compensation_fund`, `compensation_lock_duration`, `order_allocators`, `um`.

- `bPublished === false` → 🔴 **ABORT**
- `bPaused === true` → 🔴 **ABORT**
- OK → E2

---

### E2 — Product & WIP Verification

From E1 `sales[]`. Skip `suspension === true` items.

**WIP Verification** (mandatory when `wip_hash` non-empty):

Use `wip_file` → `op: "verify"`, `wipFilePath: "<wip_url>"`, `hash_equal: "<wip_hash>"`.

- `wip_hash` empty → no on-chain commitment (auto-verified, weaker evidence)
- Verification fails → 🔴 **WIP tampered after publish**
- No `wip` URL → ⚠️ No product evidence
- Verified → E3

---

### E3 — Machine Workflow Analysis (CORE)

**Step 1**: `query_toolkit` → `onchain_objects` for `<machine_id>`. Fail if `bPublished === false` or `bPaused === true`.

**Step 1b (entry-node forward check)**: In the exported Machine JSON, verify the entry node (`prev_node: ""`) has ≥1 forward. If empty, Progress will be permanently stuck at `current=""` — flag as 🔴 BLOCKER. (New Machines are schema-blocked from this, but legacy Machines may still have it.)

**Step 2**: `machineNode2file` → export the complete Machine JSON. Contains all nodes and forwards — parse locally, never node-by-node. Machine structure: see [wowok-machine](../wowok-machine/SKILL.md).

**Step 3: Classify every forward**:

| `namedOperator` | `guard` | User Can Execute? | Operation Path |
|-----------------|---------|-------------------|----------------|
| `Some("")` | `None` | ✅ Independently | **`order.progress`** (uses `order.has_op_permission`) |
| `Some("")` | `Some({...})` | ⚠️ Need Guard passport — **no bypass** | **`order.progress`** + Passport |
| `None` | Any | ❌ Provider/permission-holder only | `progress.operate` (provider path) |
| `Some("<other>")` | Any | ❌ Named operator required | `progress.operate` (named operator path) |

> **⚠ CRITICAL ROUTING RULE**: When `namedOperator=""` (empty string = OrderHolder), you MUST use `order.progress` (NOT `progress.operate`). Direct `progress::next` will abort with "Permission denied" (code 5) because the Progress-level permission check does not recognize the OrderHolder short-circuit. The empty-string `namedOperator` is set automatically by `service::buy` when an Order is created — the customer (order.builder) becomes the operator for the `""` namespace. In ALL other cases (non-empty `namedOperator` or `permissionIndex`-only), use `progress.operate` on the Progress object directly.

**Step 4: Detect paths**:
- Terminal nodes (no outgoing forwards) → order ends
- Refund paths → lead to 100%→Order Allocator (cross-check E5)
- Arbitration paths → lead to arbitration nodes
- User-blocked paths → all forwards require `namedOperator ≠ ""`

**Risk Rules**:

| Signal | Level |
|--------|-------|
| No user-operable path from critical node | 🔴 Stuck unless provider acts |
| No refund path | 🔴 No fund recovery |
| No arbitration path | 🔴 No recourse |
| All exits favor provider | ⚠️ Provider paid regardless |
| Forward requires Guard user can't pass | ⚠️ Cooperation needed |

> **🔴 "No refund" + "No arbitration" → strongly advise against purchase.**

---

### E4 — Guards Analysis

Guard structure and instruction reference: MCP `schema_query` action='get_guard_design_patterns' (design patterns) and action='get_guard_templates' (ready-made templates).

**Step 1**: Collect unique Guard IDs from E3 Machine JSON (`forward.guard.guard`), E1 `order_allocators`, E1 `buy_guard`. Deduplicate.

**Step 2**: `guard2file` → export each unique Guard as JSON. Skip duplicates (same address = same Guard).

**Step 3**: `wowok_buildin_info` → `info: "guard instructions"` for instruction reference.

**Step 4**: For each exported Guard file, classify:

| Level | Criteria | Action |
|-------|----------|--------|
| 🟢 Simple | Clear purpose, few conditions | Explain |
| 🟡 Complex | Multi-layer, intent clear | Explain step-by-step |
| 🔴 Ambiguous | Unclear logic or dependencies | **Warn. Never speculate. User must review file.** |

> **⛔ Never invent Guard logic. Prioritize Guards gating user-operable forwards and refund allocators.**

---

### E5 — Fund Allocation Rules

From E1 `order_allocators.allocators[]`. For each Allocator: cross-reference Guard (E4) → trigger condition; map to Machine node (E3) → when it fires; present distribution outcome.

**Risk Rules**:

| Check | Risk |
|-------|------|
| No 100%→Order Allocator | 🔴 No refund mechanism |
| Surplus receiver = provider | ⚠️ Remainder to provider |
| Triggers only on provider-only paths | ⚠️ Unilateral collection |
| No allocators on user-operable paths | ⚠️ No financial control |

> **Key safeguard**: 100%→Order Allocator on a user-operable forward.

---

### E6 — Arbitration Availability

Batch query E1 `arbitrations[]` via `onchain_objects`. Arb process: [wowok-arbitrator](../wowok-arbitrator/SKILL.md).

Also: `onchain_events` → `type: "ArbEvent"`, `limit: 20`, filter for these Arb IDs.

- `arbitrations[]` empty → 🔴 no recourse
- Any Arb `bPaused === true` → 🔴 unavailable
- High `fee` / closed `voting_guard` / no history → ⚠️

---

### E7 — Compensation Fund

From E1: `compensation_fund`, `compensation_lock_duration`.

- Balance < planned order amount → ⚠️ may not cover award
- Lock near expiry → ⚠️ provider may withdraw

---

### E8 — Contact Channel

Query `onchain_objects` for E1 `um` ID.

- `um === null` → 🔴 **ABORT**
- `ims[]` empty → 🔴 **No Messenger**
- Has active `ims[]` → E9

---

### E9 — Chain Reputation

**Sentiment**: `query_toolkit` → `onchain_table_item_entity_linker` for provider address. Compute likes/dislikes ratio from `votes[]`.

**Orders**: Batch query `votes[].address` via `onchain_objects` (50/batch, max 200). Filter Order-type objects where `service` matches. Aggregate dispute rate (`dispute ≠ []` / total) and repeat buyer ratio.

- Dispute rate >10% → ⚠️

---

### E10 — Privacy Information Matching

From E1 `customer_required[]`. Check locally via `query_toolkit` → `local_info_list`. Match against local `name` fields.

> **⛔ Never send private info without explicit user confirmation per item.**

For matched: present value, ask "correct?" and "OK to send?". For missing: ask user to provide. Transmission: **Messenger only** (Phase 2), never on-chain.

---

### Pre-Purchase GATE

**Abort conditions**: E1 `bPublished=false`/`bPaused=true` → ABORT; E8 `um=null` → ABORT; E3 no-refund + E6 no-arb → strongly advise ABORT; E4 ambiguous Guards → user MUST manually review.

**Any ⚠️** → explain risk, wait for user decision. **All OK** → Phase 2.

---

## Phase 2: Consensus Building

Consensus foundation: immutable on-chain rules (Phase 1). Messenger: encrypted, self-verifiable supplement — clarifies, cannot override on-chain. Full operations: [wowok-messenger](../wowok-messenger/SKILL.md).

### 2.1 Send Privacy Info

Contact `ims[]` from E8. Send E10 info via `messenger_operation` → `send_message`. **Messenger only — never on-chain.** Get explicit user confirmation per item.

### 2.2 Negotiate

Clarify via Messenger: deliverables (E2 WIP), timeline (E3 nodes), refund/cancellation (E3/E5), privacy info received (E10). Evidence value requires recipient **explicit confirmation** (ARK signature). WTS evidence: [wowok-messenger](../wowok-messenger/SKILL.md).

### 2.3 Consensus GATE

- [ ] E10 info sent and acknowledged
- [ ] Seller confirmed deliverables and edge cases
- [ ] WTS evidence generated

---

## Phase 3: Order Creation

**Not in schema**:
- Excess `buy.total_pay` auto-refunded. Agents cannot withdraw.
- Discounts: query `onchain_received` (type `0x2::service::Discount`), filter by `service`, validate time/benchmark. Rate: `total_pay × (off / 10000)`. Fixed: `min(off, total_pay)`.

Post-creation: notify via Messenger with order ID.

---

## Phase 4: Order Operations

### Progress Advancement

When user reaches a node, AI MUST cross-reference Phase 1:

1. **E3 Machine JSON**: user-operable forwards from current node?
2. **E4 Guard files**: Guard requirements? Can user satisfy?
3. **E5 Allocation**: financial outcome of each path?

Present all three dimensions. Never just the operation name.

- `namedOperator === ""` + no Guard → `order.progress` directly
- `namedOperator === ""` + Guard → passport required, no bypass
- `namedOperator !== ""` → not user-operable

### Progress.current="" Diagnostic (stuck at initial state)

If `query_toolkit` returns a Progress with `current: ""`:

1. **Root cause**: Machine entry node (`prev_node: ""`) has empty `forwards[]` — Progress cannot advance.
2. **Query Machine**: `query_toolkit` → `onchain_objects` for `progress.machine` → inspect `node.pairs` for `prev_node: ""`.
3. **If forwards empty**: Machine must be republished with ≥1 forward on the entry node (nodes are immutable after publish — clone + add forward + new Machine + rebind to Service).
4. **MCP auto-diagnostic**: `query_toolkit` now attaches `_diagnostic` with cause + 5-step fix guide when `current=""` is detected.

---

## Phase 5: Arbitration

Process: [wowok-arbitrator](../wowok-arbitrator/SKILL.md).

Flow: `arbitration.dispute` → WTS evidence → Messenger → `order.arb_confirm` → voting → (`order.arb_objection`) → `order.arb_claim_compensation`.

**Not in schema**: fee paid separately, not from Order. One compensation claim per Order. Source: `compensation_fund` (E7).

---

## Fund Management

Builder-only operations: `order.transfer_to` (ownership), `order.receive` (withdraw — agents can execute, only builder receives).

### How to Withdraw Funds from Order (`order.receive`)

After Allocation distributes funds to Order (as `CoinWrapper` objects), the builder (Order owner) MUST call `order.receive` to unwrap and withdraw the funds. Without this step, funds stay locked in the Order as `CoinWrapper` objects.

> **P0-01 / P3-04 fix**: The `receive` field now uses `ReceivedObjectsOrRecentlySchema` (consistent with `owner_receive` on all other objects). Do NOT wrap in `{result: ...}` — pass directly.

#### Step 1: Query received objects (optional but recommended)

Before calling `order.receive`, query what the Order has received to verify there are funds to withdraw:

```json
{
  "tool": "query_toolkit",
  "query_type": "onchain_received",
  "name_or_address": "<order_name_or_address>",
  "type": "CoinWrapper"
}
```

**Expected response**: A `ReceivedBalance` object with `token_type`, `balance`, and `received[]` array of `CoinWrapper` objects. If empty, there is nothing to withdraw yet.

#### Step 2: Call `order.receive` with `"recently"` (simplest form)

Use the string `"recently"` to auto-receive all recently received `CoinWrapper` objects:

```json
{
  "tool": "onchain_operations",
  "data": {
    "operation_type": "order",
    "data": {
      "object": "<order_name_or_address>",
      "receive": "recently"
    }
  },
  "env": {
    "account": "<builder_account_name>",
    "network": "testnet",
    "confirmed": true
  }
}
```

**Expected result**:
- Builder account receives the underlying token (e.g., WOW) — `CoinWrapper` is auto-unwrapped
- Transaction digest returned
- Order's received `CoinWrapper` objects are consumed

#### Step 2 (alternatives)

For precise control, pass an explicit array of `{id, type}` objects, or pass the `ReceivedBalance` object from Step 1 query directly as `receive`. Both forms accept the same `env` block as the `"recently"` form above.

#### Common Pitfalls

- ❌ **Do NOT wrap in `{result: ...}`** — the `receive` field accepts `ReceivedObjectsOrRecently` directly, NOT `QueryReceivedResult` (`{result: [...]}`)
- ❌ **Do NOT call `order.receive` if no funds received yet** — query first via Step 1
- ✅ Only the **builder** (Order owner) can call `receive` — agents cannot withdraw funds (they can execute the call, but only builder receives)
- ✅ `CoinWrapper` is auto-unwrapped to the underlying token (e.g., WOW)
- ✅ The `receive` field is consistent with `owner_receive` on all other objects (arbitration/contact/demand/machine/permission/repository/reward/service/treasury)

#### When to Call `order.receive`

| Trigger | Why | Action |
|---------|-----|--------|
| Allocation fires (e.g., refund Allocator triggers on `return_approved`) | Order receives `CoinWrapper` with refund amount | Call `order.receive` to withdraw to builder account |
| Arbitration awards compensation | Order receives `CoinWrapper` with award amount | Call `order.receive` to withdraw to builder account |
| Multi-stage allocation (partial refund + partial deduction) | Order receives multiple `CoinWrapper` objects | Call `order.receive` with `"recently"` to receive all at once |
| Order closed with no allocation | No `CoinWrapper` received | Do NOT call `order.receive` (nothing to withdraw) |

---

## Phase 3: Customer Intelligence (MCP-Handled)

> **MCP auto-populates `semantic.customer_advice`** in order/query responses when `customer_intelligence` is ON (default). Read these fields from MCP output — do NOT recompute internally.

**Key fields in `semantic.customer_advice`**:
- `reminders[]`: stage-aware reminders with priority (`required` blocks purchase; `recommended` = strong caution; `info` = advisory; `reminder` = timed nudge)
- `risk_score`: 0-100 (🟢≥85 low | 🟡70-84 | 🟠50-69 | 🔴<50 high — advise against purchase)
- `preference_match`: 0-100 score with `matches`/`mismatches` arrays (≥75 strong match, <50 significant mismatch)

**Red lines** (do not purchase): no arb + no refund path, OR compensation_ratio < 0.5.

**Post-purchase**: monitor refund Allocator triggers, WIP hash mismatch, merchant unreachable (>3d warning, >7d arb advice), evidence collection (≥3 items).

**Runtime toggle**: `config_operation` → `action: "toggle"`, `service: "order_monitor"` (default OFF) to enable active Progress stall + compensation change + Messenger timeout monitoring.

---

### Phase Dependency

E1 (Service) → E2 (Products/WIP), E8 (Contact), E10 (Privacy), E7 (Compensation), E6 (Arbitrations) run in parallel after E1. E3 (Machine) → E4 (Guards) → E5 (Allocators) is a strict chain. E9 (Reputation) follows E3.

### ⚠️ Critical Attention Items

1. **E4 Ambiguous Guards** — blind spot. User must review file directly. AI must not speculate.
2. **E3 no-refund + E6 no-arb** — no mechanism to recover funds. Single most important decision factor.
3. **E3 Forward with Guard** — "user-operable" is misleading if Guard blocks you. Verify requirements.
4. **E2 WIP hash mismatch** — seller altered claims post-publish. Red flag regardless of other factors.
5. **E9 High dispute rate** — >10% quantitative warning independent of structural analysis.
6. **Phase 3 customer_advice** — when `customer_intelligence` is ON, read `semantic.customer_advice` first in every order/query response. The `reminders` array is pre-sorted by priority; `required` items block purchase.

---
