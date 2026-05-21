---
name: wowok-order
description: |
  WoWok Customer Guide — complete order lifecycle for buyers: service evaluation,
  consensus building, order creation, progress tracking, and dispute resolution.
  
  Covers the full buyer journey: pre-purchase due diligence based on on-chain objects, consensus establishment with Messenger as off-chain
  but self-verifiable evidence supplement, order operations, progress advancement
  with game theory, and arbitration when needed.
when_to_use:
  - User is a customer/buyer placing or managing orders
  - User wants to evaluate services before purchasing
  - User needs to communicate with sellers via Messenger
  - User asks about order progress, payments, or refunds
  - User wants to file disputes or arbitration claims
  - User mentions "buy", "order", "purchase", "refund", "dispute", "arbitration"
---

# WoWok Customer Guide

Complete guide for buyers on WoWok — from service discovery to order completion.

> **Role**: Customer (Buyer/Order Holder)  
> **Provider Guide**: See [wowok-provider](../wowok-provider/SKILL.md)  
> **Arbitration Guide**: See [wowok-arbitrator](../wowok-arbitrator/SKILL.md)  
> **Messenger**: See [wowok-messenger](../wowok-messenger/SKILL.md) for encrypted communication  
> **Tools**: See [wowok-tools](../wowok-tools/SKILL.md)

---

## Core Concepts

### Order Lifecycle Objects

When you purchase from a Service, three runtime objects are created:

| Object | Purpose | Key Points |
|--------|---------|------------|
| **Order** | Fund escrow & ownership | You are the `builder` (owner). Agents can help operate but **only you can withdraw funds**. |
| **Progress** | Workflow state tracking | Tracks which Machine node you're at. Advanced via Order operations. |
| **Allocation** | Fund distribution engine | Executes the winning allocator strategy when reaching exit nodes. |

### Allocators vs Allocation

- **Allocators** (Service level): Multiple distribution strategies defined by seller, each with a Guard condition
- **Allocation** (Order level): Auto-created execution engine that evaluates all allocator Guards and runs the strategy whose Guard returns `true`

**When Allocation Executes**:
- Allocation evaluates **whenever the Progress reaches a node** that triggers fund distribution
- **Any node** (not just exit nodes) can be configured to trigger Allocation evaluation
- The winning allocator is the one whose Guard validates `true` for the current state
- Guards can check: Progress node, time elapsed, signatures, or any on-chain data

**Consensus Principle**: Allocators and their Guard conditions are immutable and transparent. Both parties see the same rules, but choose different paths based on their interests.

---

## Phase 1: Service Evaluation (Pre-Purchase)

Thoroughly investigate before committing funds.

### 1.1 Query Service Configuration

**Tool**: Use `query_toolkit` with `onchain_objects` query type to retrieve Service configuration.

**Schema Reference**: `schema_query({ action: "get", name: "query_toolkit" })`

**Key Fields to Analyze**:

| Field | What to Check | Risk Signals |
|-------|---------------|--------------|
| `sales` | Pricing, stock, WIP files | No `wip_hash` = unverified product claims |
| `machine` | Workflow complexity | Overly complex = higher dispute risk |
| `allocators` | Fund distribution rules | Unfair splits = reconsider purchase |
| `arbitrations` | Available dispute resolution | None available = higher risk |
| `compensation_fund` | Arbitration payout capacity | Low balance = limited recourse |

**WIP File Verification**:
- `wip`: URL to product description/images
- `wip_hash`: Integrity hash (if empty, auto-verified; if provided, must match)
- **This is the seller's immutable commitment on-chain** — serves as arbitration evidence

### 1.2 Evaluate Service Reputation

Query the Service's EntityLinker for community endorsement data.

**Tool**: `query_toolkit` with `onchain_table_item_entity_linker` query type.

**Key Metrics to Calculate**:

| Metric | How to Calculate | Good Sign |
|--------|------------------|-----------|
| **Completion Rate** | % orders reaching terminal nodes | >90% |
| **Arbitration Rate** | % orders with non-empty `dispute` | <5% |
| **Avg Resolution Time** | Time from creation to completion | Short |
| **Repeat Customer Rate** | % builders appearing multiple times | High |
| **Community Sentiment** | likes vs dislikes in EntityLinker | Positive |

---

## Phase 2: Consensus Building (CRITICAL)

Establish mutual understanding with seller BEFORE purchasing. Consensus is built on **immutable on-chain data** (Guard, Machine, Allocators), with Messenger serving as **off-chain but self-verifiable evidence supplement**.

### Consensus Layers

| Layer | Source | Immutability | Purpose |
|-------|--------|--------------|---------|
| **On-Chain Foundation** | Service.machine, order_allocators, Guards | Immutable after publish | Transparent rules both parties agree to |
| **Off-Chain Supplement** | Messenger WTS files | Self-verifiable via signatures | Clarification, negotiation, evidence |

> **Core Principle**: On-chain data (Machine workflow, Allocator rules, Guard conditions) forms the **immutable consensus foundation**. Messenger communication provides **clarification and evidence** but cannot override on-chain rules.

> **Full Messenger Guide**: See [wowok-messenger](../wowok-messenger/SKILL.md) for complete messaging operations, WTS evidence generation, and list management.

### 2.1 Verify On-Chain Consensus First

Before contacting seller, thoroughly understand the immutable rules:

**Tool**: `query_toolkit` with `onchain_objects` query type to retrieve Service data.

**Key On-Chain Consensus Elements**:
- **Machine**: Workflow nodes and transitions — defines how order progresses
- **Allocators**: Fund distribution strategies — defines who gets what under which conditions
- **Guards**: Validation logic — determines which allocator executes
- **Arbitrations**: Available dispute resolution services

### 2.2 Get Service Contact

**Steps**:
1. Query Service object to extract `um` field (Contact object ID)
2. Query Contact object to retrieve `ims[]` array (Messenger addresses)

**Tool**: `query_toolkit` with `onchain_objects` query type.

### 2.3 Send Encrypted Messages

Use Messenger to clarify on-chain rules and negotiate specifics.

**Tool**: `messenger_operation` with `send_message` operation.

**Schema Reference**: `schema_query({ action: "get", name: "messenger_operation" })`

**Evidence Closure Principle**: Messages only become valid evidence when the recipient **explicitly confirms** (ARK signature). One-sided claims are not evidence.

**Why Messenger Matters** (as consensus supplement):
- ✅ End-to-end encrypted (NOT on-chain) — privacy for negotiations
- ✅ Creates tamper-proof audit trail (WTS files) — see [wowok-messenger](../wowok-messenger/SKILL.md) for WTS generation
- ✅ Clarifies on-chain rules without modifying them
- ✅ Generates arbitration evidence for off-chain commitments

**AI Should Proactively Suggest Clarifying**:
- Exact deliverables and acceptance criteria
- Timeline and milestones
- Edge case handling
- Refund/cancellation terms
- Delivery logistics (address, phone)
- Custom requirements

**Request Explicit Confirmation**: Ensure the seller responds and confirms understanding before proceeding. Unconfirmed messages have limited evidentiary value.

---

## Phase 3: Order Creation

Once consensus is reached, create the order through Service operation.

### 3.1 Key Parameters

**Operation**: `onchain_operations` with `operation_type: "service"`

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_service" })`

**Key Parameters**:

| Parameter | Purpose | Notes |
|-----------|---------|-------|
| `buy.items` | Products to purchase | Reference `Service.sales` |
| `buy.total_pay` | Payment budget | **Excess automatically refunded** |
| `buy.discount` | Coupon object ID | Optional — see 3.1.1 below |
| `agents` | Delegated operators | Can operate order but **CANNOT withdraw funds** |

#### 3.1.1 Using Discount Coupons

When creating an order via the `buy` operation, you can apply a discount coupon by including the `discount` field with the coupon name/ID.

**Finding Available Discounts**:

Discount coupons are separate objects that you receive (usually transferred from Service marketing campaigns or other users). To find discounts applicable to the current Service:

**Step 1: Query all Discount objects you own**

Use `query_toolkit` with `onchain_received` query type to get all Discount objects:

```json
{
  "query_type": "onchain_received",
  "name_or_address": "your_account_name",
  "type": "0x2::service::Discount", // Discount type on-chain
  "cursor": null,
  "limit": 50
}
```

This returns `ReceivedNormal[]` where each item's `content_raw` contains Discount fields:
- `name`: Discount name
- `discount_type`: "rate" (percentage) or "fixed" (absolute amount)
- `benchmark`: Minimum order amount required
- `off`: Discount value (e.g., 1000 for 10% if rate, or 100 for 100 units if fixed)
- `time_start` / `time_end`: Validity period
- `service`: Parent Service object ID (which Service this discount belongs to)
- `transferable`: Whether it can be transferred to others

**Step 2: Filter discounts for the current Service**

Each Discount has a `service` field indicating which Service it can be used with. Filter the received Discount objects by comparing each Discount's `service` field with the target Service object ID you're purchasing from. Only Discounts where `service` matches the target Service can be applied to that Service.

**Step 3: Validate discount applicability**

Before using a discount, verify:
1. **Time validity**: `time_start` ≤ current_time ≤ `time_end`
2. **Minimum amount**: Order total ≥ `benchmark`
3. **Service match**: Discount's `service` field matches the Service being purchased

**Step 4: Apply discount in order creation**

Include the selected Discount object ID in the `buy.discount` field:

```json
{
  "operation_type": "service",
  "data": {
    "buy": {
      "items": [...],
      "total_pay": "10000",
      "discount": "discount_object_id_here"
    }
  }
}
```

**Discount Calculation**:
- If `discount_type` is "rate": Discount = `total_pay` × (`off` / 10000)
- If `discount_type` is "fixed": Discount = min(`off`, `total_pay`)
- Final payment = `total_pay` - Discount

| `namedNewOrder` | Local name for Order | Recommended for easy reference |
| `namedNewProgress` | Local name for Progress | Recommended |
| `namedNewAllocation` | Local name for Allocation | Recommended |

### 3.2 Private Information Handling

After order creation, the AI must check the Service's `customer_required` field to see what information the provider needs (e.g., phone, email, delivery address).

1. **Retrieve from local storage**: Use `query_toolkit` → `local_info_list` to retrieve your saved private information matching the `customer_required` fields. These are sensitive records stored only on your device.
2. **AI should prompt**: If the required info is not in `local_info`, ask if the user wants to save it there for future use. If it exists, present it for user confirmation before sending.
3. **Send via Messenger**: Use `messenger_operation` with `send_message` — **NEVER put private information on-chain**.
4. **Include order ID** in the message for traceability.
5. **Request explicit confirmation**: Unconfirmed delivery may stall order progress.

### 3.3 Post-Creation Notification

**Mandatory**: Notify Service customer service via Messenger with order ID and submitted info reference.

---

## Phase 4: Order Operations

All operations use `operation_type: "order"`.

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_order" })`

### 4.1 Permission Hierarchy

| Role | Can Do | Cannot Do |
|------|--------|-----------|
| **Builder** (You) | Everything + withdraw funds | — |
| **Agents** | Operate progress, arbitration, cancel | **Withdraw funds** |

> **Critical**: You maintain ultimate financial control. Agents assist but cannot access funds.

### 4.2 Progress Advancement

**Key Rule**: As the order holder (builder), you advance progress **through the Order object**.

The Machine workflow defines who can operate each forward transition:
- **Order-operable forwards**: `namedOperator === ""` — you can execute via `order.progress`
- **Permission-operable forwards**: Require specific namespace permission — typically for Service Provider or collaborators

**Steps**:
1. Query Order object to get `progress` (Progress ID) and `machine` (Machine ID)
2. Query Progress object to get `current_node`
3. Query Machine table to find valid transitions from current node

**Tools**: 
- `query_toolkit` with `onchain_objects` query type
- `query_toolkit` with `onchain_table` query type

> **Note**: Service Providers or their collaborators may operate other forwards directly via Progress if the Machine design grants them permission. The Machine consensus is immutable — both parties operate within the same transparent rules.

### 4.3 Path Selection & Game Theory

**Core Principle**: Same transparent rules, different optimal paths based on interests.

**Example Scenario**:

```
Current Node: "delivery_pending"
├── Path A → "delivery_confirmed"
│   ├── Guard: buyer signs receipt
│   └── Allocation: 95% seller, 5% platform
│
├── Path B → "dispute_filed"
│   ├── Guard: arbitration requested
│   └── Allocation: funds frozen
│
└── Path C → "return_initiated"
    ├── Guard: within return window
    └── Allocation: 90% refund, 10% fee
```

**AI Decision Framework**:

1. **Query all valid paths** from current node
2. **Evaluate Guard conditions** for each path
3. **Assess Allocation impact** (query `service.order_allocators`)
4. **Present options** with consequences:

| Path | Guard Required | Financial Outcome | Best For |
|------|----------------|-------------------|----------|
| A | Sign receipt | Pay seller 95% | Satisfied customer |
| B | Request arbitration | Frozen | Disputed order |
| C | Return in window | 90% refund | Unsatisfied customer |

**AI Guidance**:
- Always present ALL available paths
- Explain Guard requirements
- Map to Allocation consequences
- Recommend based on user's goals and evidence

---

## Phase 5: Arbitration (When Needed)

When disputes cannot be resolved directly, use third-party Arbitration.

### 5.1 Arbitration Process

| Step | Operation | Key Points |
|------|-----------|------------|
| 1 | `arbitration.dispute` | Create Arb object, **pay fee separately** (NOT from Order) |
| 2 | Generate WTS | Export Messenger history as tamper-proof evidence |
| 3 | Send evidence | Via Messenger to Arbitration's contact (encrypted) |
| 4 | `order.arb_confirm` | Signal "all evidence submitted" |
| 5 | Wait for voting | Arbitration organizes voters |
| 6 | `order.arb_objection` | (Optional) Object to unfavorable result |
| 7 | `order.arb_claim_compensation` | Claim payout from `service.compensation_fund` |

**Schema References**:
- `schema_query({ action: "get", name: "onchain_operations_arbitration" })`
- `schema_query({ action: "get", name: "onchain_operations_order" })`
- `schema_query({ action: "get", name: "messenger_operation" })`

### 5.2 Key Rules

- **Multiple Arb Objects**: Can arbitrate on multiple services simultaneously
- **One Compensation**: Only ONE claim per Order (choose best result)
- **Time Sensitivity**: Long arbitration may exceed order deadlines — discuss timelines pre-purchase
- **Evidence Privacy**: WTS files verify authenticity via `messenger_operation` with `verify_wts` operation

### 5.3 Arb Object Lifecycle

```
Principal_confirming → Arbitrator_confirming → Voting → Arbitrated → Objectionable → Finished/Withdrawn
```

---

## Fund Management

### Receiving Funds (`order.receive`)

Extract funds sent to Order (compensation, penalties, rewards) to your wallet.

**Operation**: `onchain_operations` with `operation_type: "order"` and `receive` field.

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_order" })`

**Sources**:
- Arbitration compensation (from `service.compensation_fund`)
- Service penalties (late delivery, quality issues)
- Collaboration payments
- Direct transfers

**Who Can Execute**: Builder and agents (but only builder receives).

### Ownership Transfer (`order.transfer_to`)

Transfer order ownership to new address. Requires builder permission.

**Operation**: `onchain_operations` with `operation_type: "order"` and `transfer_to` field.

---

## Quick Reference

### Essential Schemas

| Purpose | Schema Name |
|---------|-------------|
| Service operations (purchase) | `onchain_operations_service` |
| Order operations (progress, arbitration, receive) | `onchain_operations_order` |
| Arbitration operations (dispute) | `onchain_operations_arbitration` |
| Messenger (encrypted communication) | `messenger_operation` |
| Query toolkit (object data, tables) | `query_toolkit` |

**Query Schema**: `schema_query({ action: "get", name: "<schema_name>" })`

### Common Workflows

**Evaluate → Communicate → Purchase → Track → Complete/Dispute**

1. Query Service → Check sales, machine, allocators, arbitrations
2. Messenger contact → Clarify terms, save WTS
3. Service operation → Create order with named objects
4. Order operations → Advance progress, choose paths
5. Receive funds or arbitration → Extract to wallet

---

## Safety Checklist

Before purchasing:
- [ ] Verified WIP file and product claims
- [ ] Reviewed allocators (fair distribution?)
- [ ] Checked available arbitrations
- [ ] Established Messenger contact with seller
- [ ] Clarified deliverables, timeline, refund policy
- [ ] Saved conversation as WTS evidence

Before advancing progress:
- [ ] Understand ALL available paths
- [ ] Know Guard requirements for chosen path
- [ ] Aware of Allocation consequences
- [ ] Have required evidence/proof ready
