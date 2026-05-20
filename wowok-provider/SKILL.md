---
name: wowok-provider
description: |
  WoWok Service Provider — the canonical skill for service providers (merchants, sellers)
  to build, operate, and manage commercial services on WoWok.

  Covers service design (WIP products, Machine workflows, Allocator strategies),
  trust mechanisms (compensation funds, arbitration), customer attraction
  (discounts, rewards, supply chain promises), and order fulfillment.

  For customers placing orders, see wowok-order. For arbitrators, see wowok-arbitrator.
when_to_use:
  - User is a service provider/merchant/seller on WoWok
  - User wants to create a commercial service/marketplace
  - User wants to design workflow (Machine) for order processing
  - User wants to set up fund distribution strategies (Allocators)
  - User wants to configure trust mechanisms (compensation, arbitration)
  - User wants to handle order fulfillment and customer service
  - User mentions "create service", "merchant", "seller", "provider", "workflow design", "compensation", "arbitration"
---

# WoWok Service Provider Guide

Build and operate commercial services on WoWok as a service provider.

> **Role**: Service Provider (Merchant/Seller)  
> **Prerequisites**: Understand CREATE vs MODIFY pattern — use `schema_query({ action: "get", name: "onchain_operations" })`  
> **Customer Perspective**: See [wowok-order](../wowok-order/SKILL.md)  
> **Arbitration**: See [wowok-arbitrator](../wowok-arbitrator/SKILL.md)  
> **Machine Design**: See [wowok-machine](../wowok-machine/SKILL.md) for workflow details  
> **Messenger**: See [wowok-messenger](../wowok-messenger/SKILL.md) for customer communication  
> **Tools**: See [wowok-tools](../wowok-tools/SKILL.md)

---

## Core Concepts

### Dependency-First Construction

Commercial services MUST be built in strict dependency order. An object cannot reference another that does not yet exist.

**Build Sequence**:
```
Permission → Service (unpublished) → Machine (Nodes but unpublished) → Guards → Allocators → Reward/Arbitration → Publish Machine → Bind to Service → Publish Service
```

**Immutability Rules**:
| Object | When Immutable | Impact |
|--------|---------------|--------|
| **Guard** | After creation | CREATE-only, cannot modify |
| **Machine** | After `publish: true` | Nodes locked, workflow frozen |
| **Service** | After `publish: true` | `machine` and `order_allocators` locked |

### CREATE vs MODIFY Pattern

The unified pattern across all operations:
- **Object shape** (`{ name?, ... }`) = **CREATE** new object
- **String value** (`"<name>"`) = **MODIFY** existing object

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations" })`

### Key Object Relationships

```
Service (merchant storefront)
├── machine → Machine (workflow definition)
├── order_allocators → Allocators (fund distribution rules)
├── arbitrations → Arbitration[] (dispute resolution options)
├── compensation_fund → Customer protection pool
├── sales → SalesItem[] (products with WIP files)
├── discount → Discount[] (coupons)
├── rewards → Reward[] (order/user behavior incentives)
└── um → Contact (customer service)

Order (created per purchase)
├── builder → Customer (order owner)
├── progress → Progress (workflow state)
└── allocation → Allocation (fund distribution engine)
```

---

## Phase 1: Service Design (Commercial Intent)

Design your service offering before building. This phase defines what customers see and how orders flow.

### 1.1 Product Promise (WIP Files)

WIP (Witness Information Promise) files are **immutable product commitments** — your on-chain promise to customers.

**Creating WIP Files**:

**Tool**: `wip_file` with `type: "generate"` operation.

**Schema Reference**: `schema_query({ action: "get", name: "wip_file" })`

**Key Parameters**:
- `options.markdown_text`: Product description in markdown format
- `options.images`: Array of image sources for product visuals
- `outputPath`: Output file path for generated WIP file

**Attaching to Service**:

**Operation**: `onchain_operations` with `operation_type: "service"`.

**Key Fields**:
- `sales.op`: Operation type ("add", "set", "remove")
- `sales.sales`: Array of sales items, each with:
  - `name`: Product name
  - `price`: Price in token units
  - `stock`: Available quantity
  - `wip`: URL to WIP file (your official site, GitHub, etc.)
  - `wip_hash`: SHA256 hash of WIP file for verification (default: `""`, uses hash embedded in WIP file unless explicitly set for verification)

**Why WIP Matters**:
- **Immutable commitment**: Hashed and signed on-chain
- **Arbitration evidence**: Disputes resolved against your WIP claims
- **Customer trust**: Transparent specifications reduce uncertainty
- **Legal protection**: Tamper-proof record of promises

### 1.2 Service Workflow (Machine Design)

Machine defines your **service process** — from order creation to completion. Design from a **commercial intent** perspective, not technical implementation.

**Key Design Questions**:
1. **Service stages**: What are the key milestones? (e.g., confirmed → processing → shipped → delivered)
2. **Validation points**: Where do you need customer confirmation or external verification?
3. **Branching paths**: What happens on success vs. failure? (e.g., on-time vs. late delivery)
4. **Fund release triggers**: At which nodes and how to allocate order funds?

**Integration with Allocators**:
- Each terminal node should map to an allocator strategy
- Guards determine which allocator executes
- Design Machine and Allocators together for coherent fund flow

> **Implementation**: See [wowok-machine](../wowok-machine/SKILL.md) for node definition syntax, Guard conditions, and Forward configurations.

### 1.3 Fund Distribution Strategy (Allocators)

Allocators define **who gets what** under different outcomes. Design these alongside your Machine workflow.

**Allocator + Machine Integration**:
```
"delivered" → "order_complete" (threshold: 1)
└── Forward: "customer_signed" (weight: 1)
└── Allocator: "completed" → 95% merchant, 5% platform

"delivered" → "package_lost" (threshold: 2)
├── Forward: "customer_reports_lost" (weight: 1)
├── Forward: "merchant_confirms_lost" (weight: 1)
└── Allocator: "package_lost" → 100% to order (buyer can withdraw)

Note: Arbitration is an independent action that can be triggered at any time.
```

**Allocation Modes** (3 types, executed in order):
1. **Amount**: Fixed allocation amount (U64) for each recipient
2. **Rate**: Percentage in basis points (10000 = 100%, 500 = 5%)
   - If no Surplus defined, sum of all Rates must equal 10000 (100%)
3. **Surplus**: Receives remaining funds (maximum one per allocator)

**How Allocation Executes**:
- When an allocator Guard returns `true`, funds are distributed immediately per that allocator's `sharing` rules. If multiple Guards may evaluate to `true`, query and compare their validation logic and `sharing` rules to determine the most favorable outcome for your interests.

**Query Guard Logic**: Use `query_toolkit` with `query_type: "onchain_objects"` to query Guard objects by ID or name. Retrieve detailed validation logic including required node conditions, evidence submissions, and permission checks.

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_service" })` — look for `order_allocators` field

---

## Phase 2: Trust Mechanisms (Customer Confidence)

Configure mechanisms that assure customers they can trust your service.

### 2.1 Compensation Fund (compensation_fund)

A **dedicated pool** that pays customers if arbitration rules in their favor. Demonstrates your commitment to fair resolution.

**Setting Up Compensation Fund**:

**Operation**: `onchain_operations` with `operation_type: "service"`.

**Key Fields**:
- `compensation_fund_add`: Add funds to compensation pool (BalanceType)
- `setting_locked_time_add`: Lock duration in milliseconds (minimum 30 days = 2592000000ms)

**Merchant Commitment (Constraint)**:
```
Merchant withdrawal constraints from compensation_fund:
1. Pause Service (stop accepting new orders)
2. Wait compensation_lock_duration (≥30 days)
3. Then can withdraw remaining funds via compensation_fund_receive

This commitment ensures existing orders can still claim compensation during the lock period.
```

**Customer-Facing Benefits**:
- Display `compensation_fund` balance in service listing
- Higher balance + longer lock = more confidence for high-value orders
- Shows merchant has "skin in the game" for fair resolution
- Customers can claim compensation via arbitration — see [wowok-order](../wowok-order/SKILL.md) for customer arbitration process

### 2.2 Arbitration Configuration

Configure which arbitration services can resolve disputes for your orders.

**Operation**: `onchain_operations` with `operation_type: "service"`.

**Key Fields**:
- `arbitrations.op`: Operation type ("add", "set", "remove")
- `arbitrations.list`: Array of Arbitration object IDs/names

**Why Multiple Arbitrations**:
- Customers evaluate on-chain data to choose the most trusted Arbitration from your approved list
- Different arbitrations may specialize (e.g., product quality vs. service delivery)

---

## Phase 3: Build & Publish

Execute the dependency-first build process.

### 3.1 4-Phase Build Process

```
PHASE 1 — Foundation
├── 1. Permission (CREATE)
├── 2. Service (CREATE, unpublished) — define basic info
└── 3. Machine (CREATE, unpublished) — define ALL nodes and transitions

PHASE 2 — Trust Layer
└── 4. Guards (CREATE) — schema_query({ action: "get", name: "onchain_operations_guard" }) — validate Reward claims, Allocator conditions, Machine node transitions, etc. Create all Guards needed for your workflow.

PHASE 3 — Business Logic
├── 5. Machine Node Guards (MODIFY Machine) — bind Guards to Machine node forwards for workflow validation at each operation
├── 6. Allocators (MODIFY Service) — fund distribution rules
├── 7. Rewards (CREATE/MODIFY Service) — optional incentive pools
├── 8. Arbitrations (MODIFY Service) — dispute resolution options
└── 9. Compensation Fund (MODIFY Service) — add funds

PHASE 4 — Publication
├── 10. Publish Machine — nodes become IMMUTABLE
├── 11. Bind Machine to Service — MODIFY Service.machine
└── 12. Publish Service — everything LOCKED
```

### 3.2 Pre-Build Discovery

Query existing resources to avoid collisions:

**Tools**:
- `query_toolkit` with `query_type: "account_list"` — list account objects
- `query_toolkit` with `query_type: "local_mark_list"` — list local marks
- `query_toolkit` with `query_type: "onchain_objects"` — query specific objects

### 3.3 Reuse Existing Templates

Export from proven services instead of building from scratch:

**Tools**:
- `machineNode2file` — export Machine nodes to JSON file for editing
- `guard2file` — export Guard rules to JSON file for editing

**Schema References**:
- `schema_query({ action: "get", name: "machineNode2file" })`
- `schema_query({ action: "get", name: "guard2file" })`

---

## Phase 4: Customer Attraction & Incentives

Optional mechanisms to attract and retain customers.

### 4.1 Discount Coupons

Issue promotional discounts to attract new customers or reward loyal ones.
**Operation**: `onchain_operations` with `operation_type: "service"`.

**Customer Uses Coupon**:

When customer creates order via `buy` operation, they include `discount` field with the discount name/ID.

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_service" })` — look for `BuySchema`

### 4.2 Review & Reward Incentives

Encourage post-order feedback and engagement.

**Design Pattern — Review Incentive**:
```
Machine Workflow:
├── "Order Completed" Node
│   └── Forward: "Review Requested"
│       └── Guard: time_elapsed(7_days)
│
└── "Review Submitted" Node
    └── Forward: "Reward Issued"
        └── Guard: valid_review_submitted
        └── Action: Reward tokens released to customer
```

**Creating Reward Pool**:

**Operation**: `onchain_operations` with `operation_type: "reward"`.

**Key Fields**:
- `object`: Reward object name (CREATE) or ID (MODIFY)
- `guards`: Array of RewardGuard objects defining:
  - `guard`: Guard object ID that validates reward claim
  - `recipient`: Who receives the reward
  - `amount`: Reward amount (Fixed or Guard-derived)
  - `expiration_time`: Optional expiration for this reward rule

> **Note**: Reward is an optional advanced feature. See `schema_query({ action: "get", name: "onchain_operations_reward" })` for full configuration.

### 4.3 Supply Chain Promises (Sub-Orders)

Demonstrate quality by committing to purchase from trusted suppliers.

**Use Case — Travel Service**:
```
Travel Service promises:
"We only book 5-star hotels from trusted hotel groups"

Machine Implementation:
├── "Book Hotel" Node
│   └── forward_to_order_create: {
│       service: "trusted-hotel-group-service",
│       // Creates sub-order on hotel service
│   }
│
└── Guard: "hotel_booking_confirmed"
    └── Validates sub-order created and confirmed
```

**Benefits**:
- **Transparency**: Customers see exactly who fulfills components
- **Quality assurance**: Commits you to vetted suppliers
- **Trust building**: "We use X brand" becomes verifiable on-chain

**Prerequisites**:
- Supplier Service must be published first
- Your Machine references their Service ID
- Sub-order creates independent Order with its own Allocation

---

## Phase 5: Order Fulfillment

Handle active orders through workflow progression.

### 5.1 Progress Operations

Advance orders through your Machine workflow via the Progress object.

**Key Principle**:
| Object | Purpose | Operation Target |
|--------|---------|------------------|
| **Order** | Fund escrow, ownership | Read-only for workflow |
| **Progress** | Workflow state, node execution | **Operate via this** |

**Two-Phase Operation** (recommended):

**Operation**: `onchain_operations` with `operation_type: "progress"`.

**Step 1: Lock permission**:
- `object`: Progress object ID (from Order.progress)
- `operate.operation`: Target node operation (e.g., `{ Next: "shipped" }`)
- `operate.hold`: `true` to lock permission

**Step 2: Complete off-chain work, then submit**:
- Same operation with `hold: false` to release lock and submit

**Why Lock (hold: true)**:
- Prevents race conditions
- Ensures atomic operations
- Required for multi-step processes

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_progress" })`

### 5.2 Voluntary Compensation

Proactively compensate for service failures to maintain relationships.

**Scenario — Late Delivery**:
```
Machine Design:
├── "Shipping" Node
│   ├── Forward: "On Time" (normal)
│   └── Forward: "Late" (penalty trigger)
│
└── Guard "late_penalty"
    ├── IF delivery_time > promised + grace_period
    ├── THEN require Payment from merchant to Order
    └── Validate: Payment ≥ configured_penalty
```

**Payment Flow**:
```
Merchant Wallet
    ├──→ Payment (penalty) ──→ Customer's Order
    │                              └──→ Customer extracts via receive()
    └──→ Guard validates before workflow continues
```

**Benefits**:
- Retains customers through proactive accountability
- Avoids escalation to arbitration
- Differentiates your service with guarantees

### 5.3 Customer Service

Handle inquiries and issues via Messenger.

**Setup**:
```
Service.um → Contact.object_id
Contact.ims[] → Your customer service addresses
```

**Best Practices**:
- Respond promptly to build trust
- Document all agreements (generates WTS evidence)
- Confirm understanding explicitly (ARK signature required for evidence)
- Proactively communicate delays

> **Full Guide**: See [wowok-messenger](../wowok-messenger/SKILL.md) for messaging, WTS generation, and evidence management.

---

## Best Practices & Common Pitfalls

### Design Principles

| Do | Don't |
|----|-------|
| Design Machine + Allocators together | Design workflow without considering fund flow |
| Provide generous compensation_fund | Skip compensation fund for high-value services |
| Use clear, verifiable Guard conditions | Create ambiguous validation logic |
| Test with small orders first | Publish without testing |
| Document WIP thoroughly | Make vague product promises |

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "dependency not found" | Referencing non-existent object | Create dependencies first |
| "cannot modify after publish" | Trying to change locked fields | Machine/Service immutable after publish |
| Guard validation failure | Guard logic doesn't match data | Review Guard table vs submitted data |
| "invalid object format" | Wrong CREATE/MODIFY syntax | Object=CREATE, String=MODIFY |

### Trust Building Checklist

Before promoting your service:
- [ ] WIP files clearly specify deliverables
- [ ] Machine covers all success/failure paths
- [ ] Allocators fairly distribute funds in all scenarios
- [ ] Compensation fund adequately funded
- [ ] Arbitration services configured
- [ ] Test order completed successfully
- [ ] Customer service contact responsive

---

## Quick Reference

### Essential Schemas

| Purpose | Schema Name |
|---------|-------------|
| Service operations | `onchain_operations_service` |
| Machine operations | `onchain_operations_machine` |
| Guard operations | `onchain_operations_guard` |
| WIP file generation | `wip_file` |
| Messenger operations | `messenger_operation` |
| Query toolkit | `query_toolkit` |

**Query Schema**: `schema_query({ action: "get", name: "<schema_name>" })`

### Build Sequence
1. Permission → Service (unpublished) → Machine (unpublished)
2. Guards → Allocators → Reward/Arbitration/Compensation
3. Publish Machine → Bind to Service → Publish Service

### Key Metrics to Monitor
- Order completion rate
- Arbitration rate (keep <5%)
- Average resolution time
- Customer feedback sentiment
- Compensation fund utilization
