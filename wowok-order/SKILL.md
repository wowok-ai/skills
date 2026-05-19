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

```typescript
query_toolkit({ query_type: "onchain_objects", objects: ["<service_name>"] })
```

**Analyze these fields**:

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

Query the Service's EntityLinker for community endorsement data:

```typescript
query_toolkit({ query_type: "onchain_table_item_entity_linker", address: "<service_address>" })
```

**Calculate Key Metrics**:

```typescript
// Query associated orders for deep analysis
query_toolkit({ query_type: "onchain_objects", objects: ["<order_addr_1>", "<order_addr_2>"] })
query_toolkit({ query_type: "onchain_table", parent: "<progress_address>" })
```

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

```typescript
// Query Service for consensus parameters
query_toolkit({ query_type: "onchain_objects", objects: ["<service_name>"] })
// Analyze: machine (workflow), order_allocators (fund rules), arbitrations (dispute resolution)
```

**Key On-Chain Consensus Elements**:
- **Machine**: Workflow nodes and transitions — defines how order progresses
- **Allocators**: Fund distribution strategies — defines who gets what under which conditions
- **Guards**: Validation logic — determines which allocator executes
- **Arbitrations**: Available dispute resolution services

### 2.2 Get Service Contact

```typescript
// Step 1: Query Service to get Contact object
query_toolkit({ query_type: "onchain_objects", objects: ["<service_name>"] })
// Extract: service.um (Contact object ID)

// Step 2: Query Contact for IM addresses
query_toolkit({ query_type: "onchain_objects", objects: ["<contact_id>"] })
// Extract: contact.ims[].at (Messenger addresses)
```

### 2.3 Send Encrypted Messages

Use Messenger to clarify on-chain rules and negotiate specifics:

```typescript
messenger_operation({
  operation: "send_message",
  from: "<your_account>",
  to: "<service_im_address>",
  content: "Questions about: deliverables, timeline, refund policy, how Machine node X works..."
})
```

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

**Schema**: `schema_query({ action: "get", name: "onchain_operations_service" })`

| Parameter | Purpose | Notes |
|-----------|---------|-------|
| `buy.items` | Products to purchase | Reference `Service.sales` |
| `buy.total_pay` | Payment budget | **Excess automatically refunded** |
| `buy.discount` | Coupon object ID | Optional |
| `agents` | Delegated operators | Can operate order but **CANNOT withdraw funds** |
| `namedNewOrder` | Local name for Order | Recommended for easy reference |
| `namedNewProgress` | Local name for Progress | Recommended |
| `namedNewAllocation` | Local name for Allocation | Recommended |

### 3.2 Private Information Handling

If Service requires private info (`customer_required`):

1. **NEVER put on-chain** — send via Messenger
2. Include order ID in the message
3. Confirm receipt with seller

```typescript
messenger_operation({
  operation: "send_message",
  to: "<service_im_address>",
  content: "Order: <order_id>. Required info: phone=xxx, address=yyy"
})
```

### 3.3 Post-Creation Notification

**Mandatory**: Notify Service customer service via Messenger with order ID and submitted info reference.

---

## Phase 4: Order Operations

All operations use `operation_type: "order"`.

**Schema**: `schema_query({ action: "get", name: "onchain_operations_order" })`

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

**Step-by-Step**:

```typescript
// Step 1: Get current state
query_toolkit({ query_type: "onchain_objects", objects: ["<order_name>"] })
// Extract: order.progress (Progress ID), order.machine (Machine ID)

query_toolkit({ query_type: "onchain_objects", objects: ["<progress_id>"] })
// Extract: progress.current_node ("" = initial)

// Step 2: Query valid transitions
query_toolkit({ query_type: "onchain_table", parent: "<machine_id>" })
// Filter: pair.prev_node === current_node AND forward.namedOperator === ""
// These are the transitions YOU (as order holder) can execute
```

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

### 5.2 Key Rules

- **Multiple Arb Objects**: Can arbitrate on multiple services simultaneously
- **One Compensation**: Only ONE claim per Order (choose best result)
- **Time Sensitivity**: Long arbitration may exceed order deadlines — discuss timelines pre-purchase
- **Evidence Privacy**: WTS files verify authenticity via `messenger_operation({ operation: "verify_wts" })`

### 5.3 Arb Object Lifecycle

```
Principal_confirming → Arbitrator_confirming → Voting → Arbitrated → Objectionable → Finished/Withdrawn
```

---

## Fund Management

### Receiving Funds (`order.receive`)

Extract funds sent to Order (compensation, penalties, rewards) to your wallet.

**Sources**:
- Arbitration compensation (from `service.compensation_fund`)
- Service penalties (late delivery, quality issues)
- Collaboration payments
- Direct transfers

**Who Can Execute**: Builder and agents (but only builder receives).

### Ownership Transfer (`order.transfer_to`)

Transfer order ownership to new address. Requires builder permission.

---

## Quick Reference

### Essential Schemas

```typescript
// Service operations (purchase)
schema_query({ action: "get", name: "onchain_operations_service" })

// Order operations (progress, arbitration, receive)
schema_query({ action: "get", name: "onchain_operations_order" })

// Arbitration operations (dispute)
schema_query({ action: "get", name: "onchain_operations_arbitration" })

// Messenger (encrypted communication)
schema_query({ action: "get", name: "messenger_operation" })

// Query toolkit (object data, tables)
schema_query({ action: "get", name: "query_toolkit" })
```

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
