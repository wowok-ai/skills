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

---

## Dialogue Scripts (R1-R10)

A guided 10-round dialogue for the customer journey — from initial intent to post-purchase operations. Each round has a specific AI Goal, Key Questions, Tool Calls, Success Criteria, Fallback, and Checkpoint. Checkpoints persist via `local_info_operation` so the journey can resume after interruption.

### R1 — Intent Capture & Service Identification

**AI Goal**: Understand what the user wants to buy and identify candidate Services on-chain. Establish the buyer role and surface options without committing to a purchase.

**Key Questions**:
- What are you trying to purchase (product, service, subscription, rental)?
- Do you have a specific Service name or ID, or should I search?
- What is your budget and preferred token?
- Do you have a WoWok account set up? If not, hand off to [wowok-onboard](../wowok-onboard/SKILL.md).

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` with name filter (if user provides a Service name).
2. `query_toolkit` → `onchain_table_data` on the Service registry table (if user wants to browse by category/tags).
3. `account_operation` → `get` to confirm the active account exists and has a balance.
4. `local_info_operation` → create a session checkpoint `{ round: R1, intent, candidates[] }`.

**Success Criteria**: User has identified at least one candidate Service. Account confirmed. Intent packet persisted.

**Fallback**: No matching Service found → suggest broader search terms or hand off to [wowok-scenario](../wowok-scenario/SKILL.md) for industry-specific discovery. User has no account → hand off to [wowok-onboard](../wowok-onboard/SKILL.md).

**Checkpoint**: Persist `{ round: R1, service_candidates: [...], account, intent_summary }`. Mark R1 COMPLETE.

### R2 — E1-E2 Service Status & Product Verification

**AI Goal**: Run the first two due-diligence checks (E1 service status, E2 product/WIP verification) on the candidate Service. Surface hard ABORT conditions before deeper analysis.

**Key Questions**:
- Confirm we are evaluating `<service_name>` — correct?
- Are you interested in a specific `sales[]` item, or all of them?
- Have you reviewed the WIP file (product evidence)? If not, I will verify the hash.

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` for the Service. Capture `bPublished`, `bPaused`, `sales`, `machine`, `buy_guard`, `customer_required`, `arbitrations`, `compensation_fund`, `compensation_lock_duration`, `order_allocators`, `um`.
2. For each non-suspended `sales[]` item with `wip_hash`: `wip_file` → `op: "verify"`, `wipFilePath: <wip_url>`, `hash_equal: <wip_hash>`.
3. `local_info_operation` → update checkpoint with E1/E2 results.

**Success Criteria**: `bPublished === true` AND `bPaused === false` AND all WIP hashes verified. If any ABORT condition triggers, user has been informed and decided to stop or continue with risk acknowledgment.

**Fallback**: `bPublished === false` or `bPaused === true` → 🔴 ABORT, return to R1 for alternative candidates. WIP hash mismatch → 🔴 ABORT, warn user the seller altered claims post-publish. No WIP URL → ⚠️ continue but flag weaker evidence.

**Checkpoint**: Persist `{ round: R2, e1_status, e2_wip_results, abort_conditions: [...] }`. Mark R2 COMPLETE.

### R3 — E3 Machine Workflow Analysis (CORE)

**AI Goal**: Perform the most critical due-diligence step — analyze the Machine workflow to determine if the user can actually operate the order, reach refund paths, and access arbitration. This is the single most important round.

**Key Questions**:
- Do you understand the workflow the seller has designed? I will explain it step-by-step.
- Are there nodes you cannot reach yourself (require provider action)? Is that acceptable?
- Is there a refund path? If not, are you comfortable with no fund recovery mechanism?

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` for the Machine (from E1 `machine` field). Confirm `bPublished === true` and `bPaused === false`.
2. `machineNode2file` → export the complete Machine JSON. Parse locally — never node-by-node.
3. Classify every forward per the E3 table: `namedOperator` × `guard` → user-operable / provider-only / guard-gated.
4. Detect terminal nodes, refund paths (lead to 100%→Order Allocator), arbitration paths, user-blocked paths.
5. `local_info_operation` → persist the full machine analysis (forward classification, paths, risk signals).

**Success Criteria**: User understands the workflow. All risk signals surfaced (no-refund, no-arb, user-blocked paths, guard-gated forwards). The combination "no refund + no arbitration" is flagged as 🔴 if present.

**Fallback**: No user-operable path from a critical node → 🔴 advise against purchase unless provider cooperation is guaranteed in writing via Messenger. No refund path → 🔴 strongly advise against. No arbitration path → 🔴 strongly advise against. User wants to negotiate workflow changes → hand off to [wowok-messenger](../wowok-messenger/SKILL.md) for pre-order negotiation.

**Checkpoint**: Persist `{ round: R3, machine_id, forward_classification, paths: {terminal, refund, arb, blocked}, risk_signals: [...] }`. Mark R3 COMPLETE.

### R4 — E4 Guards Analysis

**AI Goal**: Export and classify every Guard referenced by the Machine, allocators, and buy_guard. Identify any ambiguous Guards that the user must review manually — never speculate on Guard logic.

**Key Questions**:
- Have you reviewed the exported Guard files? I will explain each one's purpose and conditions.
- Are there Guards gating refund or user-operable forwards? These are the highest priority.
- Do you meet the Guard conditions (e.g., token holdings, reputation thresholds)?

**Tool Calls**:
1. Collect unique Guard IDs from E3 Machine JSON (`forward.guard.guard`), E1 `order_allocators`, E1 `buy_guard`. Deduplicate.
2. `guard2file` → export each unique Guard as JSON.
3. `wowok_buildin_info` → `info: "guard instructions"` for instruction reference.
4. Classify each Guard: 🟢 Simple / 🟡 Complex / 🔴 Ambiguous.
5. `local_info_operation` → persist Guard classifications and exported file paths.

**Success Criteria**: All Guards classified. Ambiguous Guards flagged for manual review. User has explicitly confirmed they understand Guards gating refund paths and user-operable forwards. User can satisfy all conditions OR has acknowledged which ones they cannot.

**Fallback**: 🔴 Ambiguous Guard → user MUST review the file directly. AI refuses to speculate. If user cannot meet a Guard condition gating a refund path → 🔴 advise against purchase. Guard logic seems to contradict seller's claims → flag discrepancy, hand off to [wowok-messenger](../wowok-messenger/SKILL.md) for clarification.

**Checkpoint**: Persist `{ round: R4, guards: [{id, level, gates_refund, user_can_satisfy}], ambiguous: [...] }`. Mark R4 COMPLETE.

### R5 — E5 Fund Allocation Rules

**AI Goal**: Map out exactly where funds go under each possible order outcome. Verify a refund mechanism exists and identify any paths where the provider can unilaterally collect.

**Key Questions**:
- Do you understand where your payment goes if the order completes successfully?
- Is there a 100%→Order Allocator (refund mechanism)? If not, are you comfortable with no refund?
- Are there allocators that fire only on provider-operated paths? That means unilateral collection.

**Tool Calls**:
1. From E1 `order_allocators.allocators[]`, cross-reference each Allocator's Guard (E4) → trigger condition.
2. Map each Allocator to the Machine node (E3) where it fires.
3. Present the distribution outcome for each path: who receives what percentage.
4. `local_info_operation` → persist the allocation map.

**Success Criteria**: User understands the financial outcome of every path. The key safeguard (100%→Order Allocator on a user-operable forward) is present OR user has acknowledged its absence. Surplus receiver and unilateral collection paths identified.

**Fallback**: No 100%→Order Allocator → 🔴 no refund mechanism, strongly advise against. Surplus receiver = provider → ⚠️ explain remainder goes to provider. Allocators only on provider-only paths → ⚠️ explain unilateral collection risk.

**Checkpoint**: Persist `{ round: R5, allocators: [{id, trigger_node, distribution, unilateral}], refund_mechanism: bool }`. Mark R5 COMPLETE.

### R6 — E6-E8 Arbitration, Compensation, Contact

**AI Goal**: Verify the three recourse-related items in parallel: arbitration availability (E6), compensation fund adequacy (E7), and contact channel existence (E8). These determine whether the user has any recourse if something goes wrong.

**Key Questions**:
- Are you comfortable with the arbitration fee and voting structure?
- Is the compensation fund large enough to cover a potential award?
- Does the seller have a reachable Messenger contact?

**Tool Calls**:
1. Batch query E1 `arbitrations[]` via `query_toolkit` → `onchain_objects`. Check `bPaused`, `fee`, `voting_guard`.
2. `onchain_events` → `type: "ArbEvent"`, `limit: 20`, filter for these Arb IDs — check dispute history.
3. From E1: check `compensation_fund` balance vs planned order amount. Check `compensation_lock_duration` expiry.
4. `query_toolkit` → `onchain_objects` for E1 `um` ID. Check `ims[]` is non-empty.
5. `local_info_operation` → persist E6/E7/E8 results.

**Success Criteria**: At least one non-paused Arbitration service exists. Compensation fund balance ≥ planned order amount (or user acknowledged shortfall). Contact has active `ims[]`. If `um === null` or `ims[]` empty → 🔴 ABORT.

**Fallback**: `arbitrations[]` empty → 🔴 no recourse, strongly advise against. Arb `bPaused === true` → 🔴 unavailable. Compensation fund insufficient → ⚠️ may not cover award. `um === null` → 🔴 ABORT (no contact channel). `ims[]` empty → 🔴 ABORT (no Messenger).

**Checkpoint**: Persist `{ round: R6, e6_arb: [...], e7_comp_fund, e8_contact, abort_conditions: [...] }`. Mark R6 COMPLETE.

### R7 — E9-E10 Reputation & Privacy Matching

**AI Goal**: Complete the final two due-diligence items: chain reputation analysis (E9) and privacy information matching (E10). Surface quantitative warning signs and confirm the user consents to sharing required private info.

**Key Questions**:
- Are you comfortable with the seller's dispute rate and reputation?
- The Service requires these private fields: `<list>`. Do you consent to send each one via Messenger?

**Tool Calls**:
1. `query_toolkit` → `onchain_table_item_entity_linker` for provider address. Compute likes/dislikes ratio.
2. Batch query `votes[].address` via `query_toolkit` → `onchain_objects` (50/batch, max 200). Filter Order-type objects where `service` matches. Aggregate dispute rate.
3. From E1 `customer_required[]`, check locally via `query_toolkit` → `local_info_list`. Match against local `name` fields.
4. For each matched field: present value, ask "correct?" and "OK to send?". For missing: ask user to provide.
5. `local_info_operation` → persist E9/E10 results and user consent per field.

**Success Criteria**: Dispute rate ≤10% (or user acknowledged higher rate). User has explicitly consented per private field. All `customer_required` fields have values ready for Messenger transmission.

**Fallback**: Dispute rate >10% → ⚠️ quantitative warning. User declines to send a required field → cannot proceed with purchase, return to R1. Missing field the user cannot provide → 🔴 ABORT.

**Checkpoint**: Persist `{ round: R7, e9_dispute_rate, e10_consent: [{field, consented}], missing_fields: [...] }`. Mark R7 COMPLETE.

### R8 — Pre-Purchase GATE Decision & Consensus Building

**AI Goal**: Consolidate E1-E10 into the Pre-Purchase GATE decision. If all green, proceed to consensus building via Messenger. If any red, present the final risk summary and let the user decide.

**Key Questions**:
- Here is the consolidated GATE summary. Do you want to proceed?
- Are you ready to send the required private info via Messenger and negotiate final terms?
- Do you want to generate WTS evidence of our consensus conversation?

**Tool Calls**:
1. Render the Pre-Purchase GATE table from persisted checkpoints (R2-R7).
2. If all OK: `messenger_operation` → `send_message` to the seller's Contact (`um` ims address). Send E10 info per user consent.
3. Negotiate via Messenger: deliverables (E2 WIP), timeline (E3 nodes), refund/cancellation (E3/E5), privacy info received (E10).
4. `messenger_operation` → `generate_wts` + `sign_wts` for the consensus conversation.
5. `local_info_operation` → persist the GATE decision and consensus packet.

**Success Criteria**: GATE decision made. If proceeding: E10 info sent and acknowledged by seller. WTS evidence generated. Seller confirmed deliverables and edge cases.

**Fallback**: User decides not to proceed → archive the analysis, return to R1. Seller does not respond → wait, then consider alternative Services. Seller disputes on-chain rules → flag the discrepancy, on-chain rules are immutable and cannot be overridden by Messenger.

**Checkpoint**: Persist `{ round: R8, gate_decision, consensus_wts_path, seller_ack: bool }`. Mark R8 COMPLETE.

### R9 — Order Creation & First Progress

**AI Goal**: Execute the order creation transaction and advance to the first user-operable node. Confirm the order is on-chain and the user understands the next operations.

**Key Questions**:
- Confirm the final amount and token. Any discounts available?
- Ready to execute `service.buy`? This transfers funds into escrow.
- After creation, which node are you at? Can you advance, or does the provider need to act first?

**Tool Calls**:
1. `query_toolkit` → `onchain_received` (type `0x2::service::Discount`), filter by `service`, validate time/benchmark.
2. `schema_query` → `onchain_operations_service` to confirm the `buy` operation shape.
3. `onchain_operations` → `service.buy` with `submission` (after user confirmation per [wowok-safety](../wowok-safety/SKILL.md)).
4. `onchain_operations` → `order.progress` if the first node is user-operable (per E3 classification).
5. `messenger_operation` → `send_message` to notify the seller with the order ID.
6. `local_info_operation` → persist the order ID, current node, and next actions.

**Success Criteria**: Order created on-chain. Order ID and Progress ID captured. User notified of current node and available forwards. Seller notified via Messenger.

**Fallback**: `service.buy` fails → check `buy_guard` (E4) — passport may be required. Generate via `onchain_operations` → `gen_passport`. Excess `total_pay` auto-refunded — confirm with user. First node not user-operable → explain the provider must act, set expectation for wait time.

**Checkpoint**: Persist `{ round: R9, order_id, progress_id, current_node, next_actions: [...] }`. Mark R9 COMPLETE.

### R10 — Operations Handoff

**AI Goal**: Hand off the user to daily order operations. Equip them with the progress advancement playbook, dispute escalation path, and fund management reference. The buyer journey transitions to ongoing operations.

**Key Questions**:
- Do you understand how to advance progress when you reach each node?
- Do you know how to escalate to arbitration if the provider fails to deliver?
- Do you know how to withdraw funds (only you, as `builder`, can do this)?

**Tool Calls**:
1. `local_info_operation` → write the handoff packet: order ID, progress ID, machine analysis (R3), allocation map (R5), guard requirements (R4), arbitration IDs (R6), contact (R8).
2. Cross-reference E3 Machine JSON for the current node's user-operable forwards. Present all three dimensions: E3 (operability), E4 (Guard), E5 (financial outcome).
3. Orient the user to Phase 4 (Order Operations) and Phase 5 (Arbitration) schemas.
4. Recommend next Skills: [wowok-messenger](../wowok-messenger/SKILL.md) for ongoing communication, [wowok-arbitrator](../wowok-arbitrator/SKILL.md) if dispute arises, [wowok-output](../wowok-output/SKILL.md) for event display.

**Success Criteria**: User has the handoff packet. User understands the daily ops loop (monitor Progress, advance nodes, trigger Allocation). User knows the dispute escalation path. User knows fund withdrawal is builder-only.

**Fallback**: User wants to modify the order → clarify which fields are mutable (none — order terms are immutable after creation; only Progress advances). User wants to cancel → check E3/E5 for refund path; if none, funds are escrowed until Allocation fires. User wants to transfer ownership → `order.transfer_to` (builder-only).

**Checkpoint**: Persist `{ round: R10, handoff_emitted: true, order_id, journey: complete }`. Mark buyer setup COMPLETE.

**Handoff Packet** (emitted to [wowok-messenger](../wowok-messenger/SKILL.md) for ongoing communication, and to [wowok-arbitrator](../wowok-arbitrator/SKILL.md) for dispute readiness):
- Order ID + Progress ID + Service ID
- Machine analysis (forward classification, paths)
- Guard requirements (which passport needed for which forward)
- Allocation map (financial outcome per path)
- Arbitration IDs + fee + voting structure
- Contact (`um`) ID + Messenger address
- WTS evidence path (from R8 consensus)
- Recommended next Skill: wowok-messenger (daily communication), wowok-arbitrator (dispute), wowok-output (event display)

---

## Decision Trees

### D1: Purchase Decision (Post-E1-E10 GATE)

```
After E1-E10 due diligence:
├── Any 🔴 ABORT condition?
│   ├── YES → STOP. Do not purchase.
│   │        (bPublished=false, bPaused=true, um=null, ims empty,
│   │         WIP hash mismatch, no-refund + no-arb)
│   └── NO → continue
├── Any ⚠️ WARNING condition?
│   ├── YES → Present risk, wait for explicit user decision
│   │        (high dispute rate, insufficient comp fund,
│   │         ambiguous guard, unilateral collection path)
│   │   ├── User accepts risk → PROCEED (document acknowledgment)
│   │   └── User declines → STOP. Return to R1.
│   └── NO → continue
├── All E1-E10 OK?
│   ├── YES → PROCEED to Consensus Building (R8)
│   └── NO → Identify which items incomplete, return to relevant R round
└── Final check: User has explicitly consented to send all
    customer_required fields via Messenger?
    ├── YES → Execute `service.buy`
    └── NO → Return to R7 for consent collection
```

### D2: Progress Advancement Path Selection

```
User has reached a node in the Machine workflow:
├── Query E3 Machine JSON for current node's forwards
├── For each outgoing forward:
│   ├── namedOperator === "" AND no Guard?
│   │   └── User-operable → `order.progress` directly
│   ├── namedOperator === "" AND Guard present?
│   │   ├── User can satisfy Guard (has passport)?
│   │   │   ├── YES → `order.progress` with passport
│   │   │   └── NO → Generate passport via `gen_passport`
│   │   │       ├── Passport generated → `order.progress`
│   │   │       └── Guard rejects → Stuck. Escalate to Messenger
│   │   └── (No-bypass rule: passport is mandatory)
│   ├── namedOperator !== ""?
│   │   └── Provider-only → Wait for provider action
│   │       ├── Provider acts → Node advances
│   │       └── Provider stalls → Consider dispute (D3)
│   └── No outgoing forwards (terminal)?
│       └── Order complete. Check Allocation outcome.
└── Multiple user-operable forwards?
    ├── Present all three dimensions (E3 operability, E4 Guard, E5 finance)
    └── Let user choose which path to take
```

### D3: Dispute Escalation Path

```
Order is stuck or provider failed to deliver:
├── Is there a user-operable forward to a refund path? (E3/E5)
│   ├── YES → Advance to refund node. Allocation fires. Funds returned.
│   └── NO → continue
├── Is there an arbitration path in the Machine? (E3)
│   ├── YES → Follow Machine arbitration path (may need provider action)
│   └── NO → File dispute directly via `arbitration.dispute` (E6)
├── Filing dispute:
│   ├── Generate WTS evidence (`generate_wts` + `sign_wts`)
│   ├── Send WTS to arbitrator via Messenger
│   ├── Execute `order.arb_confirm`
│   ├── Voting occurs (Arb state machine)
│   ├── Result at state (3) Arbitrated:
│   │   ├── Accept → `order.arb_claim_compensation` → (5)
│   │   └── Object → `order.arb_objection` → (4) → reset → (0) → retry
│   └── One compensation claim per Order (source: compensation_fund)
└── No arbitration available? (E6 empty)
    ├── No refund + no arb → Funds escrowed indefinitely
    └── Escalate to WoWok community / off-chain recourse
```

### D4: Refund vs Arbitration Decision

```
User wants to exit the order:
├── Why does the user want to exit?
│   ├── Provider agreed to cancel
│   │   ├── Refund path exists (E3/E5)? → Advance to refund node. Done.
│   │   └── No refund path → Negotiate via Messenger, may need arbitration
│   ├── Provider stalled / non-responsive
│   │   ├── Refund path user-operable? → Advance to refund node. Done.
│   │   ├── Refund path provider-operable? → Provider must act. Escalate.
│   │   └── No refund path → Must use arbitration (D3)
│   ├── Quality dispute (deliverable doesn't match WIP)
│   │   ├── Document discrepancy (Messenger evidence)
│   │   └── File arbitration dispute (D3)
│   └── Changed mind (no fault)
│       ├── Refund path exists? → Try to advance. Provider may block.
│       └── No refund path → No recourse. Funds escrowed.
└── Key: Always check E3 Machine JSON + E5 Allocation map first.
```

### D5: Information Sharing Decision

```
Service has customer_required[] fields (E10):
├── For each required field:
│   ├── Is it already in local_info? (query local_info_list)
│   │   ├── YES → Present value, ask user "correct?" and "OK to send?"
│   │   │   ├── Correct + consent → Queue for Messenger send
│   │   │   ├── Correct + decline → Cannot purchase. ABORT.
│   │   │   └── Incorrect → Ask user to provide new value
│   │   └── NO → Ask user to provide value
│   │       ├── User provides → Queue for Messenger send
│   │       └── User declines → Cannot purchase. ABORT.
│   └── After all fields resolved:
│       ├── Send via Messenger ONLY (never on-chain)
│       ├── Get explicit confirmation per item
│       └── Generate WTS evidence of the exchange
└── Transmission medium:
    ├── Messenger send_message (text fields)
    └── Messenger send_file (large documents, WIP, ZIP)
```

---

## Failure Playbooks

### F1: Service Not Found / Not Published

**Trigger**: User provides a Service name or ID, but `query_toolkit` → `onchain_objects` returns empty OR `bPublished === false`.

**Diagnosis**:
- Empty result: name typo, wrong network, or Service never created.
- `bPublished === false`: Service exists but seller hasn't published it yet. Cannot be purchased.
- `bPaused === true`: Service is temporarily suspended by seller.

**Recovery**:
1. Confirm the name/ID with the user. Check for typos.
2. Verify `env.network` matches the Service's chain (testnet vs mainnet).
3. If `bPublished === false`: inform user the Service is not yet live. Suggest contacting the seller via Messenger if Contact exists.
4. If `bPaused === true`: inform user the Service is suspended. Check `onchain_events` for recent pause events to understand why.
5. Return to R1 for alternative candidates.

**Prevention**: Always confirm the Service name/ID with the user before starting due diligence. Verify `env.network` at R1.

### F2: Ambiguous Guard Blocks Purchase

**Trigger**: During E4, a Guard export (`guard2file`) produces logic the AI cannot confidently classify as 🟢 Simple or 🟡 Complex — it falls into 🔴 Ambiguous.

**Diagnosis**:
- Guard uses complex `rely` composition with cross-object references.
- Guard logic depends on dynamic on-chain state that's hard to evaluate offline.
- Guard instructions reference obscure or undocumented operations.
- The Guard gates a critical path (refund, user-operable forward).

**Recovery**:
1. **Never speculate.** Present the raw Guard file to the user.
2. Explain which parts are clear and which are ambiguous.
3. Identify the specific instructions or rely chains that are unclear.
4. Query `wowok_buildin_info` → `info: "guard instructions"` for reference.
5. If user can review and confirm understanding → proceed with documented acknowledgment.
6. If user cannot understand → recommend declining purchase. The risk of an unforeseen Guard failure during refund is too high.
7. If user wants to negotiate with seller → hand off to [wowok-messenger](../wowok-messenger/SKILL.md) to request clarification or Guard modification (seller would need to create a new Guard — immutable after creation).

**Prevention**: At R4, always prioritize Guards gating refund paths and user-operable forwards. If any such Guard is ambiguous, treat as a hard stop until resolved.

### F3: Order Stuck (No User-Operable Forward)

**Trigger**: User has created an order (R9 complete) but cannot advance Progress because all forwards from the current node have `namedOperator !== ""` (provider-only) or require a Guard the user cannot satisfy.

**Diagnosis**:
- This was likely identified at E3 (R3) but the user proceeded anyway, expecting provider cooperation.
- Provider is now non-responsive or refusing to act.
- The node has no refund path — funds are escrowed.

**Recovery**:
1. Re-confirm the forward classification from the persisted R3 checkpoint.
2. Check if any forward was misclassified (e.g., Guard condition the user can now satisfy).
3. If a Guard-gated forward exists and user can generate a passport → try `gen_passport` then `order.progress`.
4. If truly no user-operable path:
   - Contact provider via Messenger. Document the stall.
   - If arbitration path exists in Machine (E3) → advance via that path (may require provider action — same problem).
   - File dispute directly via `arbitration.dispute` (E6). WTS evidence of the stall strengthens the case.
5. If no arbitration available → funds are escrowed indefinitely. This is the worst-case scenario flagged at E3.

**Prevention**: At R3 (E3), the combination "no user-operable path from critical node" should be 🔴. Never proceed without explicit user acknowledgment AND a Messenger-negotiated commitment from the provider to act within a timeframe.

### F4: Refund Path Blocked

**Trigger**: User wants to exit the order, but the refund path (100%→Order Allocator) either doesn't exist (E5) or is gated by a Guard the user cannot satisfy (E4).

**Diagnosis**:
- E5 showed no 100%→Order Allocator → no refund mechanism was designed.
- Refund path exists but Guard requires conditions the user doesn't meet (e.g., provider-issued passport).
- Refund path is provider-operated (`namedOperator !== ""`) and provider refuses to advance.

**Recovery**:
1. Confirm from R5 checkpoint whether any refund mechanism exists.
2. If refund path exists but Guard blocks:
   - Try `gen_passport` — if Guard is self-satisfiable (e.g., token holding), this works.
   - If Guard requires provider action → provider is blocking refund. Document via Messenger.
3. If no refund mechanism:
   - File arbitration dispute (D3). The absence of a refund path strengthens the case if the provider also failed to deliver.
   - WTS evidence of provider non-delivery is critical.
4. If arbitration also unavailable (E6 empty) → funds are escrowed indefinitely. This is the 🔴 no-refund + no-arb scenario flagged at E3.

**Prevention**: At R3/R5, "no refund + no arb" is a hard 🔴. Never proceed without explicit user acknowledgment of the worst-case outcome.

### F5: Arbitration Rejected / Unavailable

**Trigger**: User files a dispute via `arbitration.dispute`, but the Arbitration service is paused, the fee is prohibitive, or the voting structure is closed.

**Diagnosis**:
- E6 showed `bPaused === true` → Arbitration service is suspended.
- `fee` is higher than the disputed amount → not economically viable.
- `voting_guard` is closed (specific voters only) and may be biased toward the provider.

**Recovery**:
1. Re-check E6 — are there other Arbitration services in `arbitrations[]`? Batch query them.
2. If all are paused or prohibitively expensive → inform user. No on-chain recourse.
3. If voting structure seems biased → document via WTS, consider off-chain escalation.
4. If user already paid the dispute fee and Arb is paused → fee may be lost. Check `onchain_events` for Arb state.
5. If Arb is active but voting is slow → check deadline settings. Arbitrator sets voting deadline.

**Prevention**: At R6 (E6), verify at least one non-paused Arbitration service with a reasonable fee BEFORE purchase. If all are paused or expensive, flag as ⚠️ or 🔴.

### F6: WIP Hash Mismatch Discovered Post-Purchase

**Trigger**: User verified WIP hash at E2 (R2) and it matched. After purchase, the seller altered the WIP file and the hash no longer matches.

**Diagnosis**:
- Seller updated the WIP file post-publish without updating the on-chain hash.
- Or: seller published a different WIP than what was verified (rare, but possible if verification was skipped).
- The on-chain `wip_hash` is immutable after Service publish — any change to the WIP file is detectable.

**Recovery**:
1. Re-run `wip_file` → `op: "verify"` with the current WIP file and the on-chain `wip_hash`.
2. If verification fails → the seller has altered the product evidence. This is a red flag for arbitration.
3. Generate WTS evidence of:
   - The original verification result (if logged).
   - The current WIP file and hash mismatch.
4. File arbitration dispute (D3). WIP hash mismatch is strong evidence of seller bad faith.
5. If the order is still in progress → try to advance to a refund path (D4) before the provider collects.

**Prevention**: Always verify WIP hash at E2 (R2) and re-verify immediately before purchase at R8/R9. Log the verification result in the checkpoint for future evidence.

---

## Tier Layering

### Novice — Guided E1-E10 Walkthrough

**Profile**: First-time buyer. Unfamiliar with WoWok concepts. Needs step-by-step guidance through due diligence.

**AI Behavior**:
- Execute E1-E10 in strict order. Explain each step's purpose before running it.
- Use simple language. Avoid jargon. Translate Machine forwards into plain-English workflow descriptions.
- Render the Pre-Purchase GATE table visually at R8.
- Confirm every decision explicitly. Default to conservative (any ⚠️ → ask user to acknowledge).
- For Guards: only present 🟢 Simple and 🟡 Complex. For 🔴 Ambiguous, recommend declining purchase.
- For Messenger: guide through `send_message` step-by-step. Do not assume familiarity.
- For order creation: show the confirmation template from [wowok-safety](../wowok-safety/SKILL.md). Wait for explicit "yes" before `service.buy`.

**Typical Journey**: R1 (browse) → R2-R7 (guided E1-E10) → R8 (GATE decision) → R9 (first order) → R10 (handoff with clear next steps).

### Advanced — Direct Phase Execution with Custom Evaluation

**Profile**: Experienced buyer. Understands WoWok concepts. Wants to run due diligence efficiently with custom risk thresholds.

**AI Behavior**:
- Execute E1-E10 but allow the user to skip items they've pre-evaluated.
- Present Machine JSON analysis concisely — forward classification table, no step-by-step explanation.
- For Guards: present all three levels (🟢🟡🔴). For 🔴 Ambiguous, export the file and let the user review independently.
- Allow custom risk thresholds (e.g., "I'm OK with 15% dispute rate" or "I don't need arbitration for orders under 10 WOW").
- For Messenger: assume familiarity. Only intervene for WTS evidence generation.
- For order creation: show the operation, confirm, execute. Minimal hand-holding.
- Support batch evaluation: if the user provides multiple Service candidates, run E1-E10 on all and present a comparison table.

**Typical Journey**: R1 (direct Service ID) → R2-R7 (batch E1-E10 with custom thresholds) → R8 (GATE decision with comparison) → R9 (order creation) → R10 (handoff to operations).

### Expert — Multi-Service Portfolio & Risk Modeling

**Profile**: Power user. Manages multiple orders across Services. Wants portfolio-level risk analysis and custom workflows.

**AI Behavior**:
- Support portfolio queries: "Show me all my active orders and their current node states."
- Cross-Service comparison: normalize E1-E10 results into a risk score. Rank candidates.
- Custom Guard analysis: for 🔴 Ambiguous Guards, attempt partial evaluation using `wowok_buildin_info` and `onchain_table_data` to resolve dynamic dependencies.
- Machine path optimization: for multi-forward nodes, compute the optimal path based on user's Guard satisfaction and financial outcome (E5).
- Arbitration strategy: evaluate multiple Arbitration services (E6) and recommend the best one based on fee, voting structure, and historical dispute resolution speed (from `onchain_events`).
- WTS evidence pipeline: automate `generate_wts` + `sign_wts` for all Messenger conversations related to an order. Maintain an evidence library.
- Discount hunting: proactively query `onchain_received` for active discounts before order creation.
- Fund management: track escrowed funds across all orders. Alert when compensation funds are near lock expiry.

**Typical Journey**: R1 (portfolio query) → R2-R7 (automated E1-E10 with risk scoring) → R8 (comparison table + recommendation) → R9 (batch order creation with discounts) → R10 (portfolio dashboard handoff).