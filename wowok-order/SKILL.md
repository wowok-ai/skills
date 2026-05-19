---
name: wowok-order
description: |
  WoWok order lifecycle management — covers the complete order flow from
  creation through payment, progress tracking, completion, and dispute
  resolution. Includes order splitting (Allocation), incentive distribution
  (Reward), and arbitration patterns.
  
  Use this skill when managing orders, setting up payment flows, configuring
  order splitting, or handling disputes.
when_to_use:
  - User wants to create or manage orders
  - User asks about order lifecycle, payment, or progress
  - User needs to set up order splitting (allocation) or incentives (reward)
  - User mentions "order", "payment", "allocation", "reward", "arbitration", "dispute"
  - User wants to understand how money flows in WoWok
---

# WoWok Order Lifecycle Management

## Runtime Objects Overview

After a Service is published (see [wowok-build](../wowok-build/SKILL.md)), users interact with it creating runtime objects:

| Object | Created By | Purpose |
|--------|-----------|---------|
| **Order** | User purchase | Order management and escrow |
| **Progress** | Order creation | Workflow state tracking |
| **Allocation** | Order creation | Executes allocators to distribute order funds |
| **Arb(s)** | Dispute request | Arbitration for compensation |

**Key Distinction:**
- **Allocators** (plural): Defined at **Service** level — multiple distribution strategies with Guard conditions
- **Allocation** (singular): Created per **Order** — the execution engine that runs the winning allocator strategy

```
User Purchase
     ↓
Service ──→ Order ──→ Progress
              ↓           ↓
         Payment    Node Transitions
         (escrow)   (Guard validated)
                        ↓
              ┌─────────────────┐
              │  Multiple Exit  │
              │    Nodes →      │
              │  Allocation     │
              │  (Conditional)  │
              └─────────────────┘
                        ↓
            Fund Distribution
            (Per Consensus Rules)
```

### Allocation as Consensus-Driven Distribution

**Allocation is not a single endpoint** — it's a set of **conditional distribution strategies** defined by mutual consensus between buyer and seller:

| Scenario | Trigger Node | Allocation Strategy | Guard Control |
|----------|-------------|---------------------|---------------|
| **Order Complete** | "Completed" / "Wonderful" | Full payment to seller | `merchant_win_guard` |
| **Order Cancelled** | "Cancelled" / "Lost" | Refund to buyer | `customer_win_guard` |
| **Return Accepted** | "Return Complete" | Partial refund per policy | `return_accept_guard` |
| **Return Rejected** | "Return Fail" | Payment to seller | `return_reject_guard` |

Each allocation strategy is **independently validated by its Guard** — only the Guard that evaluates to `true` for the current Progress node will execute its distribution rules.

## Component Relationships

```
Service (marketplace)
  ├── Machine (workflow template)
  ├── Allocators (order splitting rules - multiple strategies)
  ├── Reward (incentive pool)
  └── Treasury (team fund)

Order (instance)
  ├── references Service
  ├── references Machine (for workflow)
  ├── Payment (funds transfer)
  ├── Progress (workflow tracking)
  └── Allocation (created at order creation, executes allocators)
      └── Runs the winning allocator strategy when Guard validates
```

## Order Lifecycle: From Discovery to Consensus

Creating an order is NOT just a single transaction — it's a **matching and consensus-building process**. AI must help users gather sufficient information, evaluate the service, and establish clear mutual understanding before committing funds.

### Phase 1: Service Discovery & Evaluation

Before creating an order, thoroughly investigate the Service:

**1. Query Service Configuration**
```
query_toolkit({ query_type: "onchain_objects", objects: ["<service_name>"] })
```

Extract and analyze:
- **Sales**: Pricing models, available offerings. Each sale includes:
  - `name`, `price`, `stock`: Basic product info
  - `wip`: HTTP URL to the Witness Promise file (product description, images, terms)
  - `wip_hash`: Hash of the WIP file for integrity verification
  - **Critical**: The WIP file represents the seller's **immutable commitment** to product specifications. If `wip_hash` is empty, the system auto-verifies against the WIP content; if provided, it must match. This commitment serves as **arbitration evidence** in case of disputes.
- **Locations**: Geographic/service scope constraints
- **Machine**: Workflow definition, node structure, exit conditions
- **Allocators**: Fund distribution strategies and their Guard conditions
- **Arbitrations**: Dispute resolution mechanisms
- **Rewards**: Incentive programs for buyers/sellers
- **Guards**: Validation rules that control state transitions

**2. Deep Service Evaluation via EntityLinker (Optional but Recommended)**

Query the Service's community endorsement graph to build a comprehensive service capability profile:

```
// Get Service's EntityLinker data
query_toolkit({ query_type: "onchain_table_item_entity_linker", address: "<service_name_or_address>" })
```

**Response Analysis**:
- **`count`**: Follower count indicating community attention/activity level
- **`votes`**: Array of vote records, each containing:
  - `address`: Linked object address (order, arbitration, etc.)
  - `like/dislike/affiliation`: Community sentiment
  - `time`: When the relationship was established (most recent interaction time)

**Query Associated Objects for Deep Analysis**:

Objects may have associated table data. Query base object data first, then query tables if the object type supports them (Repository, Treasury, Machine, Progress, Permission, Reward, Demand, Resource, etc.):

```
// Query base object data
query_toolkit({ query_type: "onchain_objects", objects: ["<order_address_1>", "<order_address_2>"] })

// Query object's table items for detailed records
query_toolkit({ query_type: "onchain_table", parent: "<progress_address>"})
```

**Schema Reference**:
```
schema_query({ action: "get", name: "query_toolkit" })
// Look for: onchain_objects, onchain_table, onchain_table_item_repository_data
```

**Key Metrics to Calculate** (from Order object fields):
- **Activity Level**: `count` and vote frequency in EntityLinker
- **Order Completion Rate**: % of orders where `progress` reached terminal nodes (check Progress table for completion status)
- **Arbitration Rate**: % of orders where `dispute` array is non-empty (lower is better)
- **Average Resolution Time**: Calculate from Progress table node timestamps (time from order creation to reaching completion node)
- **Customer Satisfaction**: Ratio of likes vs dislikes in EntityLinker votes
- **Repeat Customer Rate**: % of unique `builder` (purchaser) addresses appearing multiple times across orders

### Phase 2: Communication & Consensus Building (CRITICAL)

Before committing funds, establish encrypted communication with the Service to clarify terms and build mutual understanding.

**Step 1: Establish Messenger Contact with Service**

Query the Service to get its Contact object (`um` field), then extract IM addresses for encrypted communication:

```
// Query Service to get um (Contact object)
query_toolkit({ query_type: "onchain_objects", objects: ["<service_name>"] })
// Extract: service.um (Contact object ID)

// Query Contact object for IM addresses
query_toolkit({ query_type: "onchain_objects", objects: ["<contact_object_id>"] })
// Extract: contact.ims[].at (IM addresses for encrypted communication)
```

**Step 2: Send Encrypted Messages**

Use the encrypted messenger to communicate with Service customer service:

```
messenger_operation({
  operation: "send_message",
  from: "<your_account>",
  to: "<service_im_address>",
  content: "<your_message_content>"
})
```

**Schema**: `schema_query({ action: "get", name: "messenger_operation" })`

**Why Encrypted Messenger Matters**:
- Messages are **end-to-end encrypted** and **NOT stored on-chain**
- Establishes **off-chain consensus** before on-chain commitment
- Creates **audit trail** for dispute resolution
- Allows **negotiation** of terms not hardcoded in the Service

**AI Guidance**: Proactively suggest users contact the seller to clarify:
- Exact deliverables and acceptance criteria
- Timeline and milestones
- Handling of edge cases
- Refund and cancellation terms
- Delivery address, contact phone, and other logistics
- Any custom requirements

### Phase 3: Order Creation & Payment

Once consensus is established, create the Order through the **Service** operation (`operation_type: "service"`), which atomically creates **Order + Allocation + Progress**.

**Use `schema_query({ action: "get", name: "onchain_operations_service" })` to get the complete schema.** Key fields in `order_new`:

**Purchase Specification (`buy`)**:
- `items`: List of items to purchase (reference `Service.sales` for available products)
- `total_pay`: Your payment budget — **excess funds are automatically refunded**
- `discount`: Optional discount coupon object ID (if you own one)
- `payment_remark`: Optional note/reference for the payment

**Agent Delegation (`agents`)**:
- Optional list of agent addresses who can operate the order on your behalf
- **Agent powers**: Cancel order, modify status, participate in Progress workflow, apply for arbitration
- **Agent limitation**: **CANNOT extract/withdraw funds** — only the order holder (`builder`) can receive payments

**Order Required Info (`order_required_info`)**:
- Contact object ID or WTS Proof object for delivery/communication (delivery address, contact phone, etc.)
- **CRITICAL**: After order creation, must notify Service customer service via **Messenger** (see Phase 2 for how to establish contact)
- Include the order ID and submitted info reference in the message

**Object Naming** (optional but recommended):
- `namedNewOrder`: Assign a local name to the Order for easy reference
- `namedNewAllocation`: Name the Allocation object
- `namedNewProgress`: Name the Progress object

**Order Holder (`builder`) Powers**:
The `builder` (purchaser who creates the order) holds **all authority**:
- Participate in Progress workflow transitions
- Apply for arbitration and receive compensation
- Claim rewards and incentives
- Withdraw funds from the order
- Transfer order ownership

> **Note**: Agents assist in operations but cannot override the `builder`'s financial rights. This ensures the purchaser maintains ultimate control over funds.

**Key Principle**: The order Machine will guide the subsequent workflow. Funds are released based on Progress transitions, with Allocators determining final distribution at completion nodes.

**Service-Required Private Information (`customer_required`)**:
- If Service specifies `customer_required` fields (e.g., phone, email, delivery address), these are **mandatory**
- **Security**: Send this private information **via Messenger** (end-to-end encrypted) directly to Service customer service 
- Messenger ensures **point-to-point secure communication** between buyer and seller — **no information is published on-chain**

### Schema Reference for Order Operations

```
// Get Service operation schema (includes order_new field)
schema_query({ action: "get", name: "onchain_operations_service" })

// Get messenger operation schema
schema_query({ action: "get", name: "messenger_operation" })

// Get query toolkit schema
schema_query({ action: "get", name: "query_toolkit" })
```

## Payment Flow

### Direct Payment
```
onchain_operations({
  operation_type: "payment",
  data: {
    op: "send",
    from: "<sender_account>",
    to: "<recipient_address>",
    amount: "<amount>",
    token_type: "<token_type>"
  }
})
```

### Payment via Order
Orders can hold funds in escrow. Payment is released when order progresses through the Machine workflow.

## Order Splitting (Allocation)

**Allocators** define **conditional fund distribution strategies** at the Service level. When an Order is created, an **Allocation** object is generated as the execution engine — it evaluates all allocator Guards at exit nodes and executes the winning strategy.

### Core Concept: Service-Level Allocators vs Order-Level Allocation

```
SERVICE SETUP (one-time)
├── order_allocators: [
│   ├── { guard: "merchant_win", sharing: [...] }  ← Strategy 1
│   ├── { guard: "customer_win", sharing: [...] }  ← Strategy 2
│   └── { guard: "return_accept", sharing: [...] } ← Strategy 3
│   ]
│
ORDER CREATION (per transaction)
├── Creates: Order + Progress + ALLOCATION (execution engine)
│
ORDER EXECUTION
├── Progress advances through Machine nodes
├── At exit node: All allocator Guards evaluate
├── Allocation executes the ONE strategy whose Guard returns TRUE
└── Funds distributed per that strategy's rules
```

### Create Multi-Strategy Allocators

Define **multiple allocators** at Service level — one for each exit scenario:

```
onchain_operations({
  operation_type: "service",
  data: {
    object: "<service_name>",
    order_allocators: {
      description: "Order fund distribution strategies",
      threshold: 0,
      allocators: [
        // Strategy 1: Order completes successfully
        {
          guard: "merchant_win_guard",
          sharing: [
            { who: { Signer: "signer" }, sharing: 9500, mode: "Rate" },  // 95% to seller
            { who: { Address: "<platform>" }, sharing: 500, mode: "Rate" }  // 5% platform fee
          ]
        },
        // Strategy 2: Order cancelled/refunded
        {
          guard: "customer_win_guard",
          sharing: [
            { who: { Signer: "signer" }, sharing: 10000, mode: "Rate" }  // 100% refund to buyer
          ]
        },
        // Strategy 3: Return accepted
        {
          guard: "return_accept_guard",
          sharing: [
            { who: { Signer: "signer" }, sharing: 9000, mode: "Rate" },  // 90% refund
            { who: { Address: "<platform>" }, sharing: 1000, mode: "Rate" }  // 10% restocking fee
          ]
        }
      ]
    }
  }
})
```

### How Allocators + Allocation Work Together

| Step | Level | Action |
|------|-------|--------|
| 1 | **Service** | Define `order_allocators` array with multiple strategies (each with Guard + sharing rules) |
| 2 | **Order** | When order created, **Allocation** object auto-generated as execution engine |
| 3 | **Progress** | Order advances through Machine workflow nodes |
| 4 | **Exit Node** | **Allocation** evaluates all allocator Guards against current state |
| 5 | **Execution** | **Allocation** executes the ONE allocator whose Guard returns `true` |
| 6 | **Distribution** | Funds split according to winning allocator's `sharing` rules |

**Key Point:** Allocators are the **recipes** (defined once at Service level). Allocation is the **cook** (created per Order, executes the right recipe).

### Allocation Modes

| Mode | Description | Example |
|------|-------------|---------|
| `Rate` | Percentage-based (basis points: 10000 = 100%) | `sharing: 500` = 5% |
| `Fixed` | Fixed token amount | `sharing: 1000000` = 1 token (6 decimals) |

### Common Multi-Strategy Patterns

**Pattern 1: E-Commerce (Complete vs Cancel vs Return)**
```
allocators: [
  { guard: "order_complete", sharing: [{ seller: 95% }, { platform: 5% }] },
  { guard: "order_cancelled", sharing: [{ buyer: 100% }] },
  { guard: "return_accepted", sharing: [{ buyer: 90% }, { platform: 10% }] }
]
```

**Pattern 2: Service Marketplace (Success vs Fail)**
```
allocators: [
  { guard: "service_delivered", sharing: [{ provider: 100% }] },
  { guard: "service_failed", sharing: [{ buyer: 80% }, { platform: 20% }] }
]
```

**Pattern 3: Insurance (Claim vs No Claim)**
```
allocators: [
  { guard: "claim_approved", sharing: [{ claimant: 100% }] },
  { guard: "no_claim", sharing: [{ insurer: 100% }] }
]
```

## Incentive Distribution (Reward)

Reward defines incentive pools that distribute tokens based on Guard-validated conditions.

### Create Reward
```
onchain_operations({
  operation_type: "reward",
  data: {
    op: "create",
    name: "<reward_name>",
    service: "<service_id>",
    ...
  }
})
```

### Reward Claim Flow
1. User meets Reward conditions (validated by Guard)
2. User claims reward → `onchain_table_data` query `onchain_table_item_reward_record`
3. Tokens are distributed from the Reward pool

## Treasury Management

Treasury is a team fund for a Service.

### Deposit to Treasury
```
onchain_operations({
  operation_type: "treasury",
  data: {
    op: "deposit",
    service: "<service_id>",
    amount: "<amount>",
    token_type: "<token_type>"
  }
})
```

### Withdraw from Treasury
```
onchain_operations({
  operation_type: "treasury",
  data: {
    op: "withdraw",
    service: "<service_id>",
    amount: "<amount>",
    token_type: "<token_type>",
    recipient: "<address>"
  }
})
```

### Query Treasury History
```
onchain_table_data({
  query_type: "onchain_table_item_treasury_history",
  parent: "<treasury_id>",
  address: "<payment_id>"
})
```

## Arbitration (Dispute Resolution)

When orders have disputes, Arbitration provides resolution.

### Create Arbitration
```
onchain_operations({
  operation_type: "arbitration",
  data: {
    op: "create",
    name: "<arbitration_name>",
    ...
  }
})
```

### Watch Arbitration Events
```
onchain_events({
  type: "arbitration",
  cursor: null,
  limit: 20
})
```

## Demand (Service Requests)

Demand allows users to request services.

### Create Demand
```
onchain_operations({
  operation_type: "demand",
  data: {
    op: "create",
    service: "<service_id>",
    description: "<request_description>",
    ...
  }
})
```

### Query Demand Presenters
```
onchain_table_data({
  query_type: "onchain_table_item_demand_presenter",
  parent: "<demand_id>",
  address: "<presenter_address>"
})
```

## Complete Order Flow Example

### 1. Service Setup (done once)
```
Permission → Guard → Service → Machine → Allocation → Reward
```

### 2. Order Creation (per transaction)
```
1. Buyer creates Order referencing Service + Machine
2. Buyer sends Payment to Order (escrow)
3. Seller advances Progress through Machine nodes
4. On completion, Allocation splits payment automatically
5. Reward distributes incentives if conditions met
```

### 3. Dispute Resolution (if needed)
```
1. Either party initiates Arbitration
2. Arbiter reviews evidence
3. Arbiter resolves → funds released per resolution
```

## Querying Order State

### Check Order Object
```
query_toolkit({
  query_type: "onchain_objects",
  objects: ["<order_name_or_id>"]
})
```

### Check Order Progress
```
onchain_table_data({
  query_type: "onchain_table",
  parent: "<progress_id>"
})
```

### Check Received Payments
```
query_toolkit({
  query_type: "onchain_received",
  name_or_address: "<object_id>"
})
```

## Order Operations (Post-Creation)

After order creation, the order holder (`builder`) and agents can perform various operations using `operation_type: "order"`.

**Schema**: `schema_query({ action: "get", name: "onchain_operations_order" })`

### Order Operation Categories

**1. Agent Management (`agents`)**
- Set or update agent list for the order
- Agents can: cancel order, modify status, advance progress, apply for arbitration
- Agents **CANNOT**: withdraw funds (only `builder` can)

**2. Progress Advancement (`progress`)**
- Advance order through Machine workflow nodes
- Submit required data for Guard validation
- Move order toward completion or exit states

**3. Arbitration Operations**
- `arb_confirm`: Submit compensation request and apply for arbitration
- `arb_objection`: Oppose and appeal arbitration results, request re-arbitration
- `arb_claim_compensation`: Claim compensation from adjudicated Arb object

**4. Fund Management (`receive`)**
- Unwrap CoinWrapper objects received by the order
- Transfer received funds to order owner (`builder`)
- **Only `builder` can execute this operation**

**5. Information Submission (`required_info`)**
- Submit Contact object (recipient info)
- Submit WTS Proof object (delivery proof via Wowok Messenger)
- Required for certain Machine node transitions

**6. Ownership Transfer (`transfer_to`)**
- Transfer order ownership to new address
- Requires order owner (`builder`) permission
- New owner gains all `builder` powers

### Key Principle: Permission Hierarchy

| Role | Powers | Limitations |
|------|--------|-------------|
| **Builder** (Order Holder) | All operations + fund withdrawal | Cannot be restricted by agents |
| **Agents** | Operational tasks (progress, arbitration, cancel) | **No fund access** |

> **Critical**: The `builder` maintains ultimate authority over funds. Agents assist in workflow operations but cannot override financial control. This protects the purchaser's investment.

## Common Order Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "service not found" | Service doesn't exist | Create Service first |
| "machine not found" | Machine doesn't exist | Create Machine first |
| "insufficient balance" | Not enough tokens | Check balance with account_balance |
| "allocation failed" | Invalid split rules | Check total shares = 100% |
| "progress blocked" | Guard condition not met | Check forward Guard logic |
| "arbitration not found" | No Arbiter configured | Create Arbitration object |

## Real-World Order Flows (from tested examples)

### Allocation Patterns

**From [Insurance](../examples/Insurance/Insurance.md) — Single-Recipient Allocation**

The Insurance service uses a single allocator with 100% going to the signer who completes the claim:

```
order_allocators: {
  description: "Insurance order revenue allocation",
  threshold: 0,
  allocators: [{
    guard: "insurance_withdraw_guard_v1",
    sharing: [{ who: { Signer: "signer" }, sharing: 10000, mode: "Rate" }]
  }]
}
```

`sharing: 10000` in `mode: "Rate"` = 100% (basis points: 10000 = 100%).

**From [MyShop Advanced](../examples/MyShop_Advanced/MyShop_Advanced.md) — Multi-Recipient Allocation**

Dual-allocation pattern: one allocator for merchant-winning scenarios, one for customer-winning scenarios:

```
order_allocators: {
  description: "Order fund allocation",
  threshold: 0,
  allocators: [
    {
      guard: "service_merchant_win_v2",
      sharing: [{ who: { Signer: "signer" }, sharing: 10000, mode: "Rate" }]
    },
    {
      guard: "service_customer_win_v2",
      sharing: [{ who: { Signer: "signer" }, sharing: 10000, mode: "Rate" }]
    }
  ]
}
```

Each allocator's Guard validates the order's current node — if the node is "Order Complete", "Wonderful", or "Return Fail", the merchant's allocator fires. If "Lost" or "Return Complete", the customer's allocator fires.

### Order Creation Patterns

**From [Insurance](../examples/Insurance/Insurance.md) — Order via Service**

Orders can be created directly through the Service's `order_new` field:

```
onchain_operations({
  operation_type: "service",
  data: {
    object: "insurance_service_v1",
    order_new: {
      buy: {
        items: [{ name: "Outdoor Accident Insurance", stock: 1, wip_hash: "" }],
        total_pay: { balance: 100000000 }
      },
      namedNewOrder: { name: "test_insurance_order_v1", replaceExistName: true }
    }
  }
})
```

**From [Travel](../examples/Travel/Travel.md) — Order via Service with Discount**

Orders can include discounts for time-limited promotions:

```
order_new: {
  buy: {
    items: [{ name: "Iceland Adventure", stock: 1 }],
    total_pay: { balance: 200000000 }
  },
  namedNewOrder: { name: "alice_travel_order_v1" }
}
```

### Reward Patterns

**From [MyShop Advanced](../examples/MyShop_Advanced/MyShop_Advanced.md) — Multi-Condition Rewards**

Rewards can be added AFTER Service publish. Each reward uses a Guard to verify claim conditions:

```
onchain_operations({
  operation_type: "reward",
  data: {
    object: { name: "myshop_reward_v2", permission: "myshop_permission_v2", replaceExistName: true },
    description: "Reward pool for MyShop Advanced",
    coin_add: { balance: 100000000 },
    guard_add: [
      {
        guard: "reward_wonderful_v2",
        recipient: { Signer: "signer" },
        amount: { type: "Fixed", value: 10000 },
        expiration_time: null
      },
      {
        guard: "reward_lost_v2",
        recipient: { Signer: "signer" },
        amount: { type: "Fixed", value: 20000 },
        expiration_time: null
      },
      {
        guard: "reward_shipping_timeout_v2",
        recipient: { Signer: "signer" },
        amount: { type: "Fixed", value: 30000 },
        expiration_time: null
      }
    ]
  }
})
```

Each guard checks the order's current node:
- `reward_wonderful_v2`: order at "Wonderful" node → 10000 reward
- `reward_lost_v2`: order at "Lost" node → 20000 compensation
- `reward_shipping_timeout_v2`: order at "Shipping" node > 2 days → 30000 compensation

### Progress Advancement Patterns

**From [MyShop Advanced](../examples/MyShop_Advanced/MyShop_Advanced.md) — Progress with Submitted Data**

When advancing through a node that requires Guard validation with submitted data:

```
onchain_operations({
  operation_type: "progress",
  data: {
    object: "<progress_id>",
    order: "<order_name>",
    node: { name: "Shipping", forward: 0 },
    pairs: [{ name: "prev_node", value: "Order Confirmed" }]
  }
})
```

For the Shipping node (which requires a Merkle root Guard), the Guard's `table` expects a submitted Merkle root string. The `pairs` field carries the runtime data the Guard validates.

### Arbitration Patterns

**From [Travel](../examples/Travel/Travel.md) — Pre-Service Arbitration**

Arbitration can be created before the Service and bound during Service creation/update:

```
// Create Arbitration independently:
onchain_operations({
  operation_type: "arbitration",
  data: {
    object: { name: "travel_arbitration_v1", permission: "travel_permission_v1" },
    description: "Arbitration for Iceland travel service disputes"
  }
})

// Bind during Service update:
onchain_operations({
  operation_type: "service",
  data: {
    object: "travel_service_v1",
    arbitrations: { op: "add", objects: ["travel_arbitration_v1"] }
  }
})
```

### Sub-Order (Supply Chain) Patterns

**From [Travel](../examples/Travel/Travel.md) — Insurance Sub-Order**

The Travel workflow creates a sub-order on the Insurance Service as part of its Machine progression. The "Buy Insurance" node's forward includes `forward_to_order_create` which automatically creates an order on the insurance service when the travel order reaches that node.

The Insurance Service must already be deployed and published before the Travel Service creates sub-orders on it. See [wowok-build](../wowok-build/SKILL.md) Pattern C: Repository-Linked for the build order.

### Order Lifecycle Summary (from tested examples)

```
1. SERVICE SETUP (one-time)
   Permission → Guard(s) → Machine → Service (with multi-strategy allocation) → Publish
   │
   └── Allocation defines MULTIPLE strategies:
       • order_complete → seller gets paid
       • order_cancelled → buyer gets refund
       • return_accepted → partial refund
       • dispute_resolved → per arbitration

2. ORDER CREATION (per transaction)
   onchain_operations(operation_type: "service", data: { object, order_new: { buy: { items, total_pay } } })
   │
   └── Creates: Order + Progress + Allocation (execution engine)

3. PROGRESS ADVANCEMENT (multi-step through Machine nodes)
   onchain_operations(operation_type: "progress", data: { object, order, node: { name, forward } })
   │
   └── Order flows through: Created → Confirmed → Shipping → ... → Exit Node

4. GUARD-CONTROLLED FUND DISTRIBUTION (at exit nodes)
   When Progress reaches exit node:
   │
   ├── **Allocation** (execution engine) evaluates all Service-level allocator Guards
   ├── ONLY the allocator whose Guard returns TRUE is selected
   └── **Allocation** executes that strategy → distributes order funds
   │
   Examples:
   • "Order Complete" node → merchant_win_guard TRUE → Allocation pays seller
   • "Order Lost" node → customer_win_guard TRUE → Allocation refunds buyer
   • "Return Complete" node → return_guard TRUE → Allocation does partial refund

5. REWARD CLAIMS (on trigger nodes)
   Reward Guard validates → tokens distributed to claimant

6. DISPUTE RESOLUTION (if needed)
   Arbitration → arb_confirm/arb_objection → resolution → allocation may be overridden
```

---

## Payments & Refunds Rules

- **Service purchase**: Always pay through `Service`. Name the generated `Order`, `Progress`, and `Allocation` via `namedNew*` fields for easy management.
- **Order operations**: All order user operations MUST go through the `Order` object — do not operate on `Progress` directly for order-related actions.
- **Refunds/withdrawals**: Users satisfy `Allocation` Guard conditions to withdraw instantly.
- **Arbitration claims**: Compensation payouts go through `Order`.
- **Alternative payments**: `account_operation (transfer)` for direct wallet-to-wallet, or `onchain_operations (payment)` for commercial features (purpose tracking, Guard validation).
