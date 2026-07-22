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
> **Provider Guide**: [wowok-provider](../wowok-provider/SKILL.md) | **Arbitration Guide**: [wowok-arbitrator](../wowok-arbitrator/SKILL.md) | **Guard Design**: [wowok-guard](../wowok-guard/SKILL.md) | **Machine**: [wowok-machine](../wowok-machine/SKILL.md) | **Messenger**: [wowok-messenger](../wowok-messenger/SKILL.md) | **Safety**: [wowok-safety](../wowok-safety/SKILL.md) | **Tools**: [wowok-tools](../wowok-tools/SKILL.md)

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

**Step 2**: `machineNode2file` → export the complete Machine JSON. Contains all nodes and forwards — parse locally, never node-by-node. Machine structure: see [wowok-machine](../wowok-machine/SKILL.md).

**Step 3: Classify every forward**:

| `namedOperator` | `guard` | User Can Execute? |
|-----------------|---------|-------------------|
| `Some("")` | `None` | ✅ Independently via `order.progress` |
| `Some("")` | `Some({...})` | ⚠️ Need Guard passport — **no bypass** |
| `None` | Any | ❌ Provider/permission-holder only |
| `Some("<other>")` | Any | ❌ Named operator required |

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

Guard structure and instruction reference: [wowok-guard](../wowok-guard/SKILL.md).

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

---

## Phase 5: Arbitration

Process: [wowok-arbitrator](../wowok-arbitrator/SKILL.md).

Flow: `arbitration.dispute` → WTS evidence → Messenger → `order.arb_confirm` → voting → (`order.arb_objection`) → `order.arb_claim_compensation`.

**Not in schema**: fee paid separately, not from Order. One compensation claim per Order. Source: `compensation_fund` (E7).

---

## Fund Management

Builder-only operations: `order.transfer_to` (ownership), `order.receive` (withdraw — agents can execute, only builder receives).

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
