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

Query `query_toolkit` → `onchain_objects` for `<service_name_or_id>`. Fields in schema. Save: `bPublished`, `bPaused`, `sales`, `machine`, `buy_guard`, `customer_required`, `arbitrations`, `compensation_fund`, `compensation_lock_duration`, `order_allocators`, `um`.

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

From E1 `order_allocators.allocators[]`. Fields in schema. For each Allocator: cross-reference Guard (E4) → trigger condition; map to Machine node (E3) → when it fires; present distribution outcome.

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

Batch query E1 `arbitrations[]` via `onchain_objects`. Fields in schema. Arb process: [wowok-arbitrator](../wowok-arbitrator/SKILL.md).

Also: `onchain_events` → `type: "ArbEvent"`, `limit: 20`, filter for these Arb IDs.

- `arbitrations[]` empty → 🔴 no recourse
- Any Arb `bPaused === true` → 🔴 unavailable
- High `fee` / closed `voting_guard` / no history → ⚠️

---

### E7 — Compensation Fund

From E1: `compensation_fund`, `compensation_lock_duration`. Balance type in schema.

- Balance < planned order amount → ⚠️ may not cover award
- Lock near expiry → ⚠️ provider may withdraw

---

### E8 — Contact Channel

Query `onchain_objects` for E1 `um` ID. Contact fields in schema.

- `um === null` → 🔴 **ABORT**
- `ims[]` empty → 🔴 **No Messenger**
- Has active `ims[]` → E9

---

### E9 — Chain Reputation

**Sentiment**: `query_toolkit` → `onchain_table_item_entity_linker` for provider address. Compute likes/dislikes ratio from `votes[]` (fields in schema).

**Orders**: Batch query `votes[].address` via `onchain_objects` (50/batch, max 200). Filter Order-type objects where `service` matches. Aggregate dispute rate (`dispute ≠ []` / total) and repeat buyer ratio.

- Dispute rate >10% → ⚠️

---

### E10 — Privacy Information Matching

From E1 `customer_required[]`. Check locally via `query_toolkit` → `local_info_list`. Match against local `name` fields.

> **⛔ Never send private info without explicit user confirmation per item.**

For matched: present value, ask "correct?" and "OK to send?". For missing: ask user to provide. Transmission: **Messenger only** (Phase 2), never on-chain.

---

### Pre-Purchase GATE

```
┌──────────────────────────────────────────────────────┐
│              PRE-PURCHASE GATE                        │
├──────────┬───────────────────────────────────────────┤
│ E1       │ Service Status          [ ] OK  [ ] ⚠️    │
│ E2       │ Product & WIP           [ ] OK  [ ] ⚠️    │
│ E3       │ Machine Workflow        [ ] OK  [ ] ⚠️    │
│ E4       │ Guards Logic            [ ] OK  [ ] 🔴    │
│ E5       │ Fund Allocation         [ ] OK  [ ] ⚠️    │
│ E6       │ Arbitration             [ ] OK  [ ] ⚠️    │
│ E7       │ Compensation Fund       [ ] OK  [ ] ⚠️    │
│ E8       │ Contact Channel         [ ] OK  [ ] ⚠️    │
│ E9       │ Chain Reputation        [ ] OK  [ ] ⚠️    │
│ E10      │ Privacy Info Match      [ ] OK  [ ] ⚠️    │
├──────────┴───────────────────────────────────────────┤
│ ⛔ E1 bPublished=false / E8 um=null → ABORT           │
│ ⛔ E3 no-refund + E6 no-arb → strongly advise ABORT   │
│ ⛔ E4 ambiguous Guards → user MUST manually review    │
│ ⛔ Any ⚠️ → explain risk, wait for user decision      │
│ ✅ All OK → Phase 2                                   │
└──────────────────────────────────────────────────────┘
```

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

Schema: `schema_query({ action: "get", name: "onchain_operations_service" })`. Safety: [wowok-safety](../wowok-safety/SKILL.md).

**Not in schema**:
- Excess `buy.total_pay` auto-refunded. Agents cannot withdraw.
- Discounts: query `onchain_received` (type `0x2::service::Discount`), filter by `service`, validate time/benchmark. Rate: `total_pay × (off / 10000)`. Fixed: `min(off, total_pay)`.

Post-creation: notify via Messenger with order ID.

---

## Phase 4: Order Operations

Schema: `schema_query({ action: "get", name: "onchain_operations_order" })`.

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

Schema: `schema_query({ action: "get", name: "onchain_operations_arbitration" })`. Process: [wowok-arbitrator](../wowok-arbitrator/SKILL.md).

Flow: `arbitration.dispute` → WTS evidence → Messenger → `order.arb_confirm` → voting → (`order.arb_objection`) → `order.arb_claim_compensation`.

**Not in schema**: fee paid separately, not from Order. One compensation claim per Order. Source: `compensation_fund` (E7).

---

## Fund Management

Schema: `onchain_operations_order`. Builder-only operations: `order.transfer_to` (ownership), `order.receive` (withdraw — agents can execute, only builder receives).

---

## Phase 3: Customer Intelligence (Optional Enhancement)

> **When to use**: When `customer_intelligence` runtime service is enabled (default ON), the MCP server automatically populates `semantic.customer_advice` in order/query operations. This is a layer ON TOP of E1-E10 — never a replacement for due diligence.

### Information Puzzle (6 dimensions)

E1-E10 captures static facts. The information puzzle assembles them into a dynamic, evolving picture that gets richer with every query:

| Dimension | Source | Fragments |
|-----------|--------|-----------|
| Service basics | E1 query | publish/pause/price/sales/WIP |
| Workflow structure | E3 machineNode2file | nodes/forwards/user-operable/refund path |
| Fund safety | E5 + E7 | allocators/compensation/price anomaly |
| Trust signals | E6 + E9 | arbitration/reviews/dispute rate |
| Merchant behavior | onchain_events | completion rate/trend/refund rate |
| Market context | batch query_toolkit | similar services/price distribution |

**Incremental collection**: Don't fetch all 6 every time. Browse = dim 1+6, Evaluate = +2/3/4, Preorder = +5, Monitoring = 2+5.

### Risk Scoring (4 dimensions, 100 points)

E1-E10 produces ⚠️/🔴 flags. Risk scoring converts them to a quantitative score:

| Dimension | Max | Key checks |
|-----------|-----|------------|
| Workflow | 35 | refund path / arbitration path / user-operable / dead ends |
| Fund | 25 | compensation coverage / allocator fairness / price anomaly / lock duration |
| Trust | 20 | arbitration independence / dispute rate / reputation / trust score |
| Behavior | 20 | completion trend / response time / refund rate / arb loss rate / anomalies |

**Levels**: 🟢 ≥85 low | 🟡 70-84 medium-low | 🟠 50-69 medium-high | 🔴 <50 high (advise against)

### User Preference Matching (7 dimensions, 100 points)

When the user has 3+ historical orders, the system infers preferences and scores each Service:

| Dimension | Max | What it measures |
|-----------|-----|------------------|
| Price | 25 | budget fit or market avg comparison |
| Time | 15 | cycle ≤ max_acceptable_cycle |
| Region | 10 | preferred_region match |
| Brand | 10 | min_order_history + merchant age |
| Bargain | 15 | reward/discount presence |
| Emotion | 10 | after_sales_expectation + transparency |
| Risk | 15 | risk_score ≥ min_trust_score + arb/comp requirements |

**Score ≥ 75** = strong match. **< 50** = significant mismatch. The `matches`/`mismatches` arrays explain the score so you can present tradeoffs to the user.

### Reminder System (6 stages, 4 priorities)

Reminders are populated in `semantic.customer_advice.reminders` based on the operation stage:

| Stage | When | Example reminders |
|-------|------|-------------------|
| browse | query_toolkit on Service | reviews summary / price anomaly / no arb / no comp |
| evaluate | deeper analysis | checklist / high risk (required) / ambiguous guard (required) / no refund path |
| preorder | order creation | payment confirm (required) / compensation insufficient / arb missing (required) |
| in_progress | order monitoring | progress stalled / compensation drop / messenger unanswered |
| complete | order done | review reminder / review window |
| after_sale | post-purchase | arb window / refund received |

**Priority order**: `required` (blocks purchase) > `recommended` (strong caution) > `info` (advisory) > `reminder` (timed nudge). Fatigue control: max 3 high-risk reminders per response.

### Game Strategy Quick Reference (8 scenarios)

When the user faces a specific negotiation, refer to the strategy matrix:

| Scenario | Merchant tactic | User strategy |
|----------|------------------|---------------|
| Info asymmetry | Hides Machine details | Demand machineNode2file export + Messenger Q&A |
| Fund safety | No/low compensation | Require 100% coverage + WTS agreement |
| Refund dispute | No refund path | Demand 100%→Order Allocator + Messenger terms |
| Arb fairness | Self-built arbitration | Verify arb owner via query_toolkit |
| Pricing | Price >120% market avg | Reference market_context.avg_price + request discount/Reward |
| Delivery SLA | No milestone nodes | Require milestone config + written timeline |
| Quality | WIP hash unverified | Require WIP verify + sample/staged delivery |
| After-sales | No Messenger | Require Messenger config + written after-sales terms |

**Red lines** (do not purchase): no arb + no refund path, OR compensation_ratio < 0.5.

### Industry Personalization (6 industries)

Each industry has specific risk checks and preference templates:

| Industry | Cycle (days) | Response (h) | Arb | Comp | Risk appetite | Delivery |
|----------|--------------|--------------|-----|------|---------------|----------|
| freelance | 30 | 4 | ✓ | ✓ | balanced | normal |
| rental | 7 | 8 | ✓ | ✓ | conservative | normal |
| education | 90 | 24 | ✓ | ✓ | conservative | flexible |
| travel | 14 | 2 | ✓ | ✓ | conservative | urgent |
| subscription | 30 | 24 | – | – | aggressive | normal |
| retail | 7 | 8 | ✓ | ✓ | balanced | normal |

**Industry-specific risks**: freelance checks WIP verified + milestone nodes; rental checks compensation coverage + lock duration; travel checks urgent delivery + Messenger; subscription checks no-lockin + user-operable; etc.

### Post-Purchase Support (4 phases)

When the order is in progress or completed, post-purchase support covers:

- **Refund tracking**: monitor refund Allocator triggers, check refunded vs order amount
- **Quality issue**: WIP hash mismatch detection + evidence collection (≥3 items recommended)
- **Merchant unreachable**: >3 days warning, >7 days arbitration advice (if available)
- **Arbitration support**: evidence collection → application template → progress monitoring → result interpretation

### Runtime Service Toggles

Use `config_operation` to toggle Phase 3 services at runtime:

| Service | Default | What it controls |
|---------|---------|------------------|
| `customer_intelligence` | ON | Populates `semantic.customer_advice` (reminders + risk + preference match) |
| `order_monitor` | OFF | Active order monitoring (Progress stall + compensation change + Messenger timeout) |

Toggle example: `config_operation` → `action: "toggle"`, `service: "order_monitor"` to enable active monitoring when the user has active orders.

---

## Quick Reference

Schemas: `schema_query({ action: "get", name: "<name>" })` for `onchain_operations_service`, `onchain_operations_order`, `onchain_operations_arbitration`, `messenger_operation`, `query_toolkit`, `onchain_table_data`, `wip_file`.

### Phase Dependency

```
E1 (Service) ──→ E2 (Products/WIP)
  │    │
  │    ├──→ E8 (Contact)   ├──→ E7 (Compensation)
  │    ├──→ E10 (Privacy)  └──→ E6 (Arbitrations)
  │
  └──→ E3 (Machine) ──→ E4 (Guards) ──→ E5 (Allocators)
         │
         └──→ E9 (Reputation)
```

> E3→E4→E5 is a strict chain. E6-E10 run in parallel after E1.

### ⚠️ Critical Attention Items

1. **E4 Ambiguous Guards** — blind spot. User must review file directly. AI must not speculate.
2. **E3 no-refund + E6 no-arb** — no mechanism to recover funds. Single most important decision factor.
3. **E3 Forward with Guard** — "user-operable" is misleading if Guard blocks you. Verify requirements.
4. **E2 WIP hash mismatch** — seller altered claims post-publish. Red flag regardless of other factors.
5. **E9 High dispute rate** — >10% quantitative warning independent of structural analysis.
6. **Phase 3 customer_advice** — when `customer_intelligence` is ON, read `semantic.customer_advice` first in every order/query response. The `reminders` array is pre-sorted by priority; `required` items block purchase.

---

## Appendices (Progressive Disclosure)

> The following sections have been extracted to [APPENDIX.md](./APPENDIX.md) for on-demand loading:
> - Dialogue Scripts (R1-R10) — guided conversation scripts
> - Decision Trees — branching logic reference
> - Failure Playbooks — recovery scenarios
> - Tier Layering — expertise-tier based guidance
> - Phase 3 Integration — information puzzle + risk scoring + preference matching + game strategy + post-purchase playbook
>
> Load APPENDIX.md when the user needs guided dialogue, recovery help, or tier-specific guidance.
