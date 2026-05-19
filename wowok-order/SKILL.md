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
| **Allocation** | Order completion | Fund distribution per consensus |
| **Arb(s)** | Dispute request | Arbitration for compensation |

```
User Purchase
     ↓
Service ──→ Order ──→ Progress ──→ Allocation
              ↓           ↓
         Payment    Node Transitions
         (escrow)   (Guard validated)
                        ↓
                   Completion
                        ↓
              Fund Distribution
```

## Order Lifecycle Overview

```
Demand → Order → Payment → Progress → Completion
                                  ↓
                            Arbitration (disputes)
```

## Component Relationships

```
Service (marketplace)
  ├── Machine (workflow template)
  ├── Allocation (order splitting rules)
  ├── Reward (incentive pool)
  └── Treasury (team fund)

Order (instance)
  ├── references Service
  ├── references Machine (for workflow)
  ├── Payment (funds transfer)
  └── Progress (workflow tracking)
```

## Order Creation

```
onchain_operations({
  operation_type: "order",
  data: {
    op: "create",
    service: "<service_name_or_id>",
    machine: "<machine_name_or_id>",
    buyer: "<buyer_address>",
    seller: "<seller_address>",
    price: "<amount>",
    token_type: "<token_type>",
    ...
  }
})
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

Allocation defines how order payments are automatically split among multiple recipients.

### Create Allocation
```
onchain_operations({
  operation_type: "allocation",
  data: {
    op: "create",
    name: "<allocation_name>",
    service: "<service_id>",
    rules: [
      {
        recipient: "<address_or_guard>",
        share: <percentage_or_fixed>,
        discount_type: "RATES"  // or "FIXED"
      }
    ]
  }
})
```

### Discount Types
| Type | Description |
|------|-------------|
| `RATES` | Percentage-based split (e.g., 30% = 30/100) |
| `FIXED` | Fixed amount split |

### Common Allocation Patterns

**Pattern 1: Platform Fee**
```
rules: [
  { recipient: "<platform_address>", share: 5, discount_type: "RATES" },
  { recipient: "<seller_address>", share: 95, discount_type: "RATES" }
]
```

**Pattern 2: Multi-Party Split**
```
rules: [
  { recipient: "<platform>", share: 3, discount_type: "RATES" },
  { recipient: "<seller>", share: 70, discount_type: "RATES" },
  { recipient: "<affiliate>", share: 27, discount_type: "RATES" }
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
   Permission → Guard(s) → Machine → Service (with allocation) → Publish

2. ORDER CREATION (per transaction)
   onchain_operations(operation_type: "service", data: { object, order_new: { buy: { items, total_pay } } })

3. PROGRESS ADVANCEMENT (multi-step)
   onchain_operations(operation_type: "progress", data: { object, order, node: { name, forward } })

4. FUND DISTRIBUTION (automatic on completion)
   Allocation fires → Payment split per allocator Guards

5. REWARD CLAIMS (on trigger nodes)
   Reward Guard validates → tokens distributed to claimant

6. DISPUTE RESOLUTION (if needed)
   Arbitration → arb_confirm/arb_objection → resolution
```

---

## Payments & Refunds Rules

- **Service purchase**: Always pay through `Service`. Name the generated `Order`, `Progress`, and `Allocation` via `namedNew*` fields for easy management.
- **Order operations**: All order user operations MUST go through the `Order` object — do not operate on `Progress` directly for order-related actions.
- **Refunds/withdrawals**: Users satisfy `Allocation` Guard conditions to withdraw instantly.
- **Arbitration claims**: Compensation payouts go through `Order`.
- **Alternative payments**: `account_operation (transfer)` for direct wallet-to-wallet, or `onchain_operations (payment)` for commercial features (purpose tracking, Guard validation).
