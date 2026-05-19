---
name: wowok-machine
description: |
  WoWok Machine workflow design — defines multi-step workflows (state machines)
  for order processing. Machines control how orders progress through stages,
  who can advance them, and what conditions must be met at each step.
  
  Use this skill when designing or modifying Machine workflows, creating
  Progress tracking, or troubleshooting workflow advancement issues.
when_to_use:
  - User wants to create or modify a Machine workflow
  - User asks about workflow steps, state transitions, or progress
  - User needs to design order processing pipelines
  - User mentions "machine", "workflow", "progress", "state machine", "pipeline"
---

# WoWok Machine Workflow Design

## What is a Machine?

A Machine is a **workflow template** that defines how orders progress through stages. It's a directed graph where:
- **Nodes** = stages/states in the workflow
- **Forwards** = allowed transitions between nodes
- **Guards** = conditions that must be met to advance
- **Pairs** = data fields tracked at each node

## Machine Structure

```
Machine {
  service: "<service_id>",         // Which Service this Machine belongs to
  guard: "<guard_id>",             // Guard for workflow validation
  node: {
    op: "set",
    nodes: [
      {
        name: "<node_name>",       // Unique node identifier
        pairs: [                   // Data fields at this node
          { name: "<field>", value_type: "<type>", description: "..." }
        ],
        forwards: [                // Allowed next nodes
          { name: "<next_node>", guard: "<guard_id>" }
        ],
        guard: "<guard_id>",       // Guard for entering this node
        threshold: <number>        // Required signers to advance
      }
    ],
    bReplace: true
  }
}
```

## Machine Node Design Rules

### Rule 1: Every Node Needs a Unique Name
Node names are identifiers. Use descriptive names like "pending", "in_progress", "review", "completed".

### Rule 2: Forwards Define the Graph
Each node's `forwards` array defines which nodes can be reached next. A node without forwards is a terminal/end state.

### Rule 3: Guards Control Transitions
Each forward can have a `guard` that must pass before the transition is allowed. This enables conditional workflows.

### Rule 4: Pairs Define Node Data
Each node's `pairs` define what data is tracked at that stage. Different nodes can track different data.

### Rule 5: Threshold Controls Multi-Sig
The `threshold` field defines how many signers must approve to advance from this node. Use for multi-party approval workflows.

## Common Workflow Patterns

### Pattern 1: Linear Pipeline
```
Start → Step1 → Step2 → Step3 → Done
```
Simple sequential workflow. Each node forwards to exactly one next node.

```
nodes: [
  { name: "pending", forwards: [{ name: "in_progress" }] },
  { name: "in_progress", forwards: [{ name: "review" }] },
  { name: "review", forwards: [{ name: "completed" }] },
  { name: "completed", forwards: [] }
]
```

### Pattern 2: Branching Workflow
```
           → Approved → Completed
Start → Review
           → Rejected → Revision → Review
```
Conditional branching based on Guard validation.

```
nodes: [
  { name: "review", forwards: [
    { name: "approved", guard: "<approval_guard>" },
    { name: "rejected", guard: "<rejection_guard>" }
  ]},
  { name: "approved", forwards: [{ name: "completed" }] },
  { name: "rejected", forwards: [{ name: "revision" }] },
  { name: "revision", forwards: [{ name: "review" }] },
  { name: "completed", forwards: [] }
]
```

### Pattern 3: Multi-Party Approval
```
Start → Review (threshold: 3) → Completed
```
Requires multiple signers to advance.

```
nodes: [
  { name: "review", threshold: 3, forwards: [{ name: "completed" }] }
]
```

### Pattern 4: Parallel Tracks
```
        → Track A → Merge
Start →
        → Track B → Merge → Done
```
Multiple parallel work streams that converge.

## Progress Operations

Progress tracks an order's movement through a Machine's workflow.

### Advance Progress
```
onchain_operations({
  operation_type: "progress",
  data: {
    op: "advance",
    order: "<order_id>",
    node: "<target_node_name>",
    pairs: { <node_data> }
  }
})
```

### Query Progress History
```
onchain_table_data({
  query_type: "onchain_table_item_progress_history",
  parent: "<progress_id>",
  u64: <sequence_number>
})
```

## Machine Creation Workflow

### Step 1: Design Nodes on Paper
Sketch the workflow graph before coding. Identify all nodes, transitions, and conditions.

### Step 2: Create Guards for Transitions
Each conditional forward needs a Guard. Create these Guards first (see [wowok-guard](../wowok-guard/SKILL.md) skill).

### Step 3: Create the Machine (Dry Run)
```
onchain_operations({
  operation_type: "machine",
  data: {
    op: "create",
    name: "<machine_name>",
    description: "<description>",
    service: "<service_id>",
    guard: "<guard_id>",
    node: {
      op: "set",
      nodes: [ ... ],
      bReplace: true
    }
  }
})
```

### Step 4: Export and Review
```
machineNode2file({
  machine: "<machine_id>",
  file_path: "<output_path>",
  format: "json"
})
```

### Step 5: Execute
After review, add `submission` to execute.

## Machine from File

Load node definitions from a local file:
```
onchain_operations({
  operation_type: "machine",
  data: {
    op: "create",
    name: "<machine_name>",
    service: "<service_id>",
    node: {
      json_or_markdown_file: "<path_to_file>"
    }
  }
})
```

## Common Machine Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "node not found" | Forward references non-existent node | Check all forward names match node names |
| "guard not found" | Forward references non-existent Guard | Create the Guard first |
| "circular dependency" | Infinite loop in forwards | Ensure at least one terminal node |
| "threshold not met" | Not enough signers | Check threshold value and signer count |
| "invalid pairs" | Node data doesn't match pairs schema | Check pairs definition matches submitted data |

## Real-World Machine Workflows (from tested examples)

### MyShop: 4-Node Order Processing

**Source**: [MyShop Example](../examples/MyShop/MyShop.md)

A linear order fulfillment workflow for an e-commerce store:

```
Order Confirmation → Shipping → In Transit → Completed
                                         ↘ Order End (Cancel Order)
```

**Key Design**: The first node (`Order Confirmation`) has two `pairs` entries — one for the initial transition (threshold=0, from empty `prev_node`) and one for cancel. Normal flow goes through Shipping → In Transit → Completed. The customer (order owner) can cancel from Order Confirmation using `namedOperator: ""`.

```
nodes: [
  {
    name: "Order Confirmation",
    pairs: [
      { prev_node: "", threshold: 0, forwards: [{ name: "Confirm Order", permissionIndex: 1000, weight: 1 }] },
      { prev_node: "Order Confirmation", threshold: 0, forwards: [{ name: "Cancel Order", permissionIndex: 1001, weight: 1 }] }
    ]
  },
  {
    name: "Shipping",
    pairs: [
      { prev_node: "Order Confirmation", threshold: 1, forwards: [{ name: "Start Shipping", permissionIndex: 1000, weight: 1 }] }
    ]
  },
  {
    name: "In Transit",
    pairs: [
      { prev_node: "Shipping", threshold: 1, forwards: [{ name: "Mark In Transit", permissionIndex: 1000, weight: 1 }] }
    ]
  },
  {
    name: "Completed",
    pairs: [
      { prev_node: "In Transit", threshold: 1, forwards: [{ name: "Complete Order", permissionIndex: 1002, weight: 1 }] }
    ]
  }
]
```

### MyShop Advanced: 11-Node Multi-Path Workflow

**Source**: [MyShop Advanced Example](../examples/MyShop_Advanced/MyShop_Advanced.md)

An enterprise-grade workflow with dual-signature returns, reward incentives, and time-based auto-completion:

```
Order Confirmed ──→ Shipping ──→ Delivery Complete ──→ Order Complete
    │                  │   │            │    │
    │                  │   │            │    └──→ Non-receipt Return ──→ Return Complete
    │                  │   │            │
    │                  │   ├──→ Wonderful
    │                  │   ├──→ Order Complete (time >= 10d)
    │                  │   └──→ Lost (dual-sig, threshold=2)
    │                  │
    └── Order Cancel ──┘            Receipt Return ──→ Return Fail (time >= 10d)
                                                        └──→ Return Complete (dual-sig)
```

**Key Design Decisions**:
- **Dual-signature returns**: Lost, Non-receipt Return, Receipt Return, and Return Complete all use `threshold: 2` — requiring both customer and merchant to confirm
- **Time-based auto-completion**: Order Complete and Return Fail use time guards (10 days) for automatic transitions
- **Wonderful rating**: Customer can rate delivery as "Wonderful" from the Shipping node, triggering reward
- **"Who completes, who submits"**: The party responsible for an action submits the on-chain proof (e.g., merchant submits Merkle Root for shipping, customer for returns)

```
nodes: [
  {
    name: "Order Confirmed",
    pairs: [
      { prev_node: "", threshold: 0, forwards: [{ name: "Confirm Order", permissionIndex: 1010, weight: 1 }] },
      { prev_node: "Order Confirmed", threshold: 0, forwards: [{ name: "Cancel Order", permissionIndex: 1010, weight: 1 }] }
    ]
  },
  {
    name: "Order Cancel",
    pairs: [
      { prev_node: "Order Confirmed", threshold: 1, forwards: [{ name: "Cancel Order", permissionIndex: 1010, weight: 1 }] }
    ]
  },
  {
    name: "Shipping",
    pairs: [
      { prev_node: "Order Confirmed", threshold: 1, forwards: [{ name: "Ship Order", permissionIndex: 1011, weight: 1, guard: { guard: "machine_merkle_root_v2" } }] }
    ]
  },
  {
    name: "Delivery Complete",
    pairs: [
      { prev_node: "Shipping", threshold: 1, forwards: [{ name: "Confirm Delivery", permissionIndex: 1012, weight: 1 }] }
    ]
  },
  {
    name: "Wonderful",
    pairs: [
      { prev_node: "Shipping", threshold: 1, forwards: [{ name: "Rate Wonderful", permissionIndex: 1013, weight: 1 }] }
    ]
  },
  {
    name: "Order Complete",
    pairs: [
      { prev_node: "Shipping", threshold: 1, forwards: [{ name: "Auto Complete (10d)", permissionIndex: 1011, weight: 1, guard: { guard: "machine_time_10d_v2" } }] },
      { prev_node: "Delivery Complete", threshold: 1, forwards: [{ name: "Complete Order", permissionIndex: 1011, weight: 1 }] }
    ]
  },
  {
    name: "Lost",
    pairs: [
      { prev_node: "Shipping", threshold: 2, forwards: [{ name: "Report Lost", permissionIndex: 1014, weight: 1 }] }
    ]
  },
  {
    name: "Non-receipt Return",
    pairs: [
      { prev_node: "Delivery Complete", threshold: 2, forwards: [{ name: "Return (No Receipt)", permissionIndex: 1015, weight: 1 }] }
    ]
  },
  {
    name: "Receipt Return",
    pairs: [
      { prev_node: "Delivery Complete", threshold: 2, forwards: [{ name: "Return (With Receipt)", permissionIndex: 1016, weight: 1 }] }
    ]
  },
  {
    name: "Return Fail",
    pairs: [
      { prev_node: "Receipt Return", threshold: 1, forwards: [{ name: "Return Failed (10d)", permissionIndex: 1011, weight: 1, guard: { guard: "machine_time_10d_v2" } }] }
    ]
  },
  {
    name: "Return Complete",
    pairs: [
      { prev_node: "Non-receipt Return", threshold: 2, forwards: [{ name: "Complete Return", permissionIndex: 1017, weight: 1 }] },
      { prev_node: "Receipt Return", threshold: 2, forwards: [{ name: "Complete Return", permissionIndex: 1017, weight: 1 }] }
    ]
  }
]
```

### Insurance: 2-Node Time-Lock Workflow

**Source**: [Insurance Example](../examples/Insurance/Insurance.md)

A minimal claim processing workflow with time-lock protection:

```
Start → Complete (time-lock guard: clock > progress.current_time + 1000ms)
```

**Key Design**: The Complete forward uses a Guard with `convert_witness: 100` (TypeOrderProgress) to access the Order's Progress object and query `progress.current_time`. This creates a time-lock — the claim cannot be completed until the lock duration passes.

```
nodes: [
  {
    name: "Start",
    pairs: [
      { prev_node: "", threshold: 0, forwards: [{ name: "start_claim", permissionIndex: 1000, weight: 1 }] }
    ]
  },
  {
    name: "Complete",
    pairs: [
      { prev_node: "Start", threshold: 1, forwards: [{ name: "complete_claim", permissionIndex: 1001, weight: 1, guard: { guard: "insurance_complete_guard_v1" } }] }
    ]
  }
]
```

### Travel: 5-Node Weather-Dependent Workflow

**Source**: [Travel Example](../examples/Travel/Travel.md)

A complex travel service workflow with insurance sub-order and weather-dependent activity:

```
Start → Buy Insurance (creates sub-order) → SPA → Ice Scooting (weather check guard)
                                                      ├──→ Complete (time-lock)
                                                      └──→ Cancel
```

**Key Design**:
- **Insurance sub-order**: The "Buy Insurance" forward creates a sub-order on the Insurance Service via `forward_to_order_create`
- **Weather-dependent activity**: The Ice Scooting forward uses a weather check Guard that queries the weather Repository
- **Time-lock completion**: The Complete forward uses `convert_witness: 100` for time-lock (same as Insurance)
- **Named forwards**: Each forward uses a descriptive `forward_name` for event tracking

```
nodes: [
  {
    name: "Start",
    pairs: [
      { prev_node: "", threshold: 0, forwards: [{ forward_name: "start_travel", permissionIndex: 1000, weight: 1 }] }
    ]
  },
  {
    name: "Buy Insurance",
    pairs: [
      { prev_node: "Start", threshold: 1, forwards: [{ forward_name: "buy_insurance", permissionIndex: 1001, weight: 1, guard: { guard: "travel_buy_insurance_guard_v1" } }] }
    ]
  },
  {
    name: "SPA",
    pairs: [
      { prev_node: "Buy Insurance", threshold: 1, forwards: [{ forward_name: "enjoy_spa", permissionIndex: 1002, weight: 1 }] }
    ]
  },
  {
    name: "Ice Scooting",
    pairs: [
      { prev_node: "SPA", threshold: 1, forwards: [
        { forward_name: "ice_scooting", permissionIndex: 1003, weight: 1, guard: { guard: "weather_check_guard_v1" } }
      ]}
    ]
  },
  {
    name: "Complete",
    pairs: [
      { prev_node: "Ice Scooting", threshold: 1, forwards: [{ forward_name: "complete_travel", permissionIndex: 1004, weight: 1, guard: { guard: "travel_complete_guard_v1" } }] }
    ]
  }
]
```

### ThreeBody Signature: 2-Node Simple Workflow

**Source**: [ThreeBody Signature Example](../examples/ThreeBody_Signature/ThreeBody_Signature.md)

The simplest possible workflow — just delivery and completion:

```
Book Delivered → Signature Completed
```

```
nodes: [
  {
    name: "Book Delivered",
    pairs: [
      { prev_node: "", threshold: 0, forwards: [{ name: "Confirm Delivery", permissionIndex: 1000, weight: 1 }] }
    ]
  },
  {
    name: "Signature Completed",
    pairs: [
      { prev_node: "Book Delivered", threshold: 1, forwards: [{ name: "Complete Signature", permissionIndex: 1001, weight: 1 }] }
    ]
  }
]
```

## Machine Workflow Design Checklist

Based on patterns from all tested examples:

```
Designing a Machine workflow?
├─ How many nodes?
│  ├─ 2 nodes → Pattern: Start → Complete (Insurance, ThreeBody)
│  ├─ 4 nodes → Pattern: Linear pipeline (MyShop)
│  ├─ 5+ nodes → Pattern: Multi-path with branches (Travel, MyShop Advanced)
│  └─ 11+ nodes → Pattern: Enterprise with dual-sig + time + rewards
│
├─ Need dual-signature (multi-party approval)?
│  └─ Set threshold: 2 on the node → Both parties must confirm
│
├─ Need time-based auto-advancement?
│  └─ Add a time guard on the forward (e.g., machine_time_10d_v2)
│
├─ Need sub-order creation (supply chain)?
│  └─ Use forward_to_order_create on the forward (Travel → Insurance)
│
├─ Need initial entry (prev_node: "")?
│  └─ threshold: 0 on the first pair means "anyone can enter from start"
│
└─ Need guard on forward?
   └─ guard: { guard: "<guard_name>" } validates the transition
```

## Machine Node Patterns Quick Reference

| Pattern | Nodes | Threshold | Guard | Use Case |
|---------|-------|-----------|-------|----------|
| Auto-start | `prev_node: ""` | 0 | none | Entry point — anyone can start |
| Single-party | `prev_node: "X"` | 1 | optional | One party advances (merchant or customer) |
| Dual-signature | `prev_node: "X"` | 2 | optional | Both parties must confirm (returns, lost) |
| Time-lock | `prev_node: "X"` | 1 | time guard | Auto-complete after duration |
| Guarded | `prev_node: "X"` | 1 | condition guard | Weather check, Merkle root, etc. |
| Sub-order | `prev_node: "X"` | 1 | guard + forward_to | Create order on another Service |

---

## Privacy & Consensus via Messenger

Sensitive logistics and customer data flow through Messenger's end-to-end encryption (never on-chain). Guard consensus follows: **who performs the key action, submits the proof; the other party confirms**.

| Scenario | Action | Proof Submission |
|----------|--------|------------------|
| Merchant ships | Receives address via Messenger, replies tracking number | Merchant submits Merkle Root to Guard |
| Customer returns | Sends return tracking via Messenger | Customer submits Merkle Root to Guard |
| Mutual confirmation | Both parties sign | Both submit confirmation proofs |

This pattern is used in Machine workflows where off-chain actions (shipping, delivery) need on-chain verification via Guard proofs.

---

## Forward Permission Model

Each forward must specify either `permissionIndex` or `namedOperator`:

| Field | Scope | Typical Use |
|-------|-------|-------------|
| `permissionIndex` | Shared across all Progress instances | Internal roles (merchant operators, admins) |
| `namedOperator` | Per-Progress namespace | External roles per order instance |

**Order user operations** MUST use `namedOperator("")` — this maps to the order's owner (customer).

---

## Guard in Forwards — Use Cases

The optional `guard` field in a Forward validates critical operation results before allowing the forward to complete:

- **Repository submission validation**: Verify that required data was successfully submitted to a specified Repository object
- **Supply chain commitment validation**: Confirm that sub-order commitments in the supply chain were fulfilled
- **External condition checks**: Validate any external state or conditions that must be met before proceeding
- **Service penalty validation**: Verify compensation payments for service failures (e.g., late delivery penalties)

When a forward has a Guard, the Guard's logic is evaluated when a user attempts to execute that forward. If the Guard returns `false`, the forward cannot be completed.

---

## Service Penalty & Compensation Pattern

Design Machines to handle **service failures gracefully** through automated compensation workflows. This pattern validates penalty payments before allowing workflow continuation.

### Use Case: Late Delivery Compensation

**Scenario**: Courier service fails to deliver within promised timeframe. Machine requires courier to pay penalty to customer before order can proceed.

```
Delivery Node ──→ Late Delivery Detected (Guard: time > deadline)
                      │
                      ├──→ Penalty Payment Required ──→ Payment Verified (Guard)
                      │                                    │
                      └──→ Continue to Next Node ←─────────┘
```

**Machine Design**:
```javascript
{
  name: "Delivery",
  pairs: [{
    prev_node: "Shipping",
    threshold: 1,
    forwards: [
      // Normal delivery path
      { name: "On Time Delivery", permissionIndex: 1001, weight: 1 },
      // Late delivery with penalty
      { 
        name: "Late Delivery", 
        permissionIndex: 1001, 
        weight: 1,
        guard: { guard: "delivery_time_check" }  // Checks if past deadline
      }
    ]
  }]
}
```

**Guard Logic** (`delivery_penalty_guard`):
- Query Progress: Get `progress.current_time` vs `expected_delivery_time`
- If late: Verify Payment object showing penalty amount transferred to Order
- Validate: Payment amount ≥ configured penalty rate
- Validate: Payment completed within grace period

**Benefits**:
- **Automatic enforcement**: Late delivery cannot proceed without compensation
- **Verified compensation**: Guard cryptographically verifies payment occurred
- **Customer protection**: Guaranteed penalty for service failures
- **Service accountability**: Forces service providers to meet commitments

### Cross-Service Collaboration Penalties

**Pattern**: When multiple services collaborate (e.g., Travel + Insurance + Courier), any party's failure can trigger penalties paid to the affected customer's Order.

```
Travel Order ──→ Courier Sub-order ──→ Late Delivery
                                              │
                                              ├──→ Courier pays penalty to Travel Order
                                              │
                                              └──→ Travel Order receives compensation
                                                   (Order.receive to claim funds)
```

**Implementation**:
1. Courier Service Machine has `late_delivery` node with penalty Guard
2. Guard verifies Payment from Courier Service to Travel Order
3. Travel Order's `receive` operation extracts penalty to customer
4. Workflow continues only after penalty verified

**Schema**: `schema_query({ action: "get", name: "onchain_operations_payment" })` — for penalty payment validation

---

## Progress Advancement Rules

- Sum of completed forward weights ≥ threshold → session moves to history, next node becomes current
- Order users advance via `Order` object
- Non-order users advance via `Progress` object directly
