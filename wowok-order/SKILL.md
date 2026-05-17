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
