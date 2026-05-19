---
name: wowok-provider
description: |
  WoWok Service Provider — the canonical skill for service providers (merchants, sellers)
  to build, operate, and manage commercial services on WoWok.
  
  Covers the complete service lifecycle: creating Service objects, designing Machine workflows,
  setting up Allocators for fund distribution, handling order fulfillment, and managing
  customer relationships through Messenger.
  
  For customers placing orders, see wowok-order. For arbitrators, see wowok-arbitrator.
when_to_use:
  - User is a service provider/merchant/seller on WoWok
  - User wants to create a commercial service/marketplace
  - User wants to design workflow (Machine) for order processing
  - User wants to set up fund distribution strategies (Allocators)
  - User wants to handle order fulfillment and customer service
  - User mentions "create service", "merchant", "seller", "provider", "workflow design"
---

# WoWok Service Provider Guide

Build and operate commercial services on WoWok as a service provider.

> **Role**: Service Provider (Merchant/Seller)  
> **Prerequisites**: Understand CREATE vs MODIFY pattern — use `schema_query({ action: "get", name: "onchain_operations" })`  
> **Customer Perspective**: See [wowok-order](../wowok-order/SKILL.md)  
> **Arbitration**: See [wowok-arbitrator](../wowok-arbitrator/SKILL.md)  
> **Messenger**: See [wowok-messenger](../wowok-messenger/SKILL.md) for customer communication  
> **Tools**: See [wowok-tools](../wowok-tools/SKILL.md)

---

## Core Principle: Dependency-First Construction

Commercial services MUST be built in strict dependency order. An object cannot reference another object that does not yet exist.

**Immutability Rules**:
- **Machine**: Nodes become **IMMUTABLE** after `publish: true`
- **Service**: `machine` and `order_allocators` become **LOCKED** after `publish: true`
- **Guard**: **IMMUTABLE** after creation (CREATE-only)

**Why This Matters**: Guards created in Phase 2 validate **FUTURE** runtime objects (Order, Progress) that don't exist yet. They store query logic, not object state.

---

## The 4-Phase Build Process

```
PHASE 1 — Foundation
  1. Permission — schema_query({ action: "get", name: "onchain_operations_permission" })
  2. Service — schema_query({ action: "get", name: "onchain_operations_service" }) — CREATE only, DO NOT publish
  3. Machine — schema_query({ action: "get", name: "onchain_operations_machine" }) — CREATE and define ALL nodes, DO NOT publish

PHASE 2 — Trust Layer
  4. Guards — schema_query({ action: "get", name: "onchain_operations_guard" }) — validate Reward claims, Allocators conditions, Machine node transitions, etc. Create all guards needed.

PHASE 3 — Sub-Components
  5. Allocators — schema_query({ action: "get", name: "onchain_operations_service" }) — DEFINE multiple allocator strategies (with Guards) at Service level
  6. Reward — schema_query({ action: "get", name: "onchain_operations_reward" }) — CREATE/MODIFY incentive pools
  7. Arbitration — schema_query({ action: "get", name: "onchain_operations_arbitration" }) — CREATE/MODIFY dispute resolution

PHASE 4 — Publication
  8. Publish Machine — nodes become IMMUTABLE
  9. Bind Machine to Service — MODIFY Service.machine
  10. Publish Service — Machine & order_allocators LOCKED

> **Allocators vs Allocation**: 
> - **Allocators** (plural): Defined at **Service** level — multiple distribution strategies with Guard conditions
> - **Allocation** (singular): Auto-created per **Order** — the execution engine that evaluates Guards and runs the winning strategy
```

---

## Pre-Build: Discover Resources

Query before building to avoid collisions:

```typescript
query_toolkit({ query_type: "account_list" })
query_toolkit({ query_type: "local_mark_list" })
query_toolkit({ query_type: "onchain_objects", objects: ["<name>"] })
wowok_buildin_info({ info_type: "permissions" })
wowok_buildin_info({ info_type: "guard_instructions" })
```

**Get schemas**: `schema_query({ action: "get", name: "query_toolkit" })` | `schema_query({ action: "get", name: "wowok_buildin_info" })`

---

## Key Operations Reference

### CREATE vs MODIFY

The unified CREATE vs MODIFY pattern (see `schema_query({ action: "get", name: "onchain_operations" })`):
- **Object shape** (`{ name?, ... }`) = CREATE
- **String value** (`"<name>"`) = MODIFY

### Reuse Existing Objects (Recommended)

Instead of defining from scratch, **export from existing on-chain objects** as templates:

**Export Machine for editing:**
```typescript
// Use any existing Machine ID or name as template
machineNode2file({ machine: "<existing_machine_id>", file_path: "./my_nodes.json" })
// Edit my_nodes.json, then use it to create new Machine
```

**Export Guard for editing:**
```typescript
// Use any existing Guard ID or name as template
guard2file({ guard: "<existing_guard_id>", file_path: "./my_guard.json" })
// Edit my_guard.json, then use it to create new Guard
```

**Use exported files to create new objects:**
- **Machine**: `node: { json_or_markdown_file: "./my_nodes.json" }` — loads complete node definition
- **Guard**: `root: { type: "file", file_path: "./my_guard.json" }` — loads rule tree from file

**Benefits**: Leverage proven templates, modify only what differs, significantly reduce definition workload.

**Get tool schemas:**
```
schema_query({ action: "get", name: "machineNode2file" })
schema_query({ action: "get", name: "guard2file" })
```

---

### Error Recovery

| Error | Fix |
|-------|-----|
| "object not found" | `env.no_cache: true` |
| "permission denied" | Check Permission config |
| "dependency not found" | Create referenced objects first |
| "cannot modify after publish" | Machine/Allocators immutable |
| Guard validation failure | Review Guard table vs submitted data |
| "invalid object format" | Object=CREATE, String=MODIFY |

---

## Order Fund Distribution (Allocators)

**Allocators** define **conditional fund distribution strategies** at the Service level. When an Order is created, an **Allocation** object is auto-generated as the execution engine.

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
├── At trigger nodes: All allocator Guards evaluate (any node can trigger, not just exit nodes)
├── Allocation executes the ONE strategy whose Guard returns TRUE
└── Funds distributed per that strategy's rules
```

### How Allocators + Allocation Work Together

| Step | Level | Action |
|------|-------|--------|
| 1 | **Service** | Define `order_allocators` array with multiple strategies (each with Guard + sharing rules) |
| 2 | **Order** | When order created, **Allocation** object auto-generated as execution engine |
| 3 | **Progress** | Order advances through Machine workflow nodes |
| 4 | **Trigger Node** | **Allocation** evaluates all allocator Guards against current state (any node can be trigger) |
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

**Schema**: `schema_query({ action: "get", name: "onchain_operations_service" })` — look for `order_allocators` field

---

## Product Information (WIP Files)

WIP (Witness Information Promise) files are **immutable product commitments** that serve as both marketing material and arbitration evidence.

### Creating WIP Files

Use the `wip_file` tool to generate product descriptions:

```typescript
wip_file({
  operation: "generate",
  markdown: "# Product Name\n\n## Description\nDetailed product description...\n\n## Specifications\n- Spec 1\n- Spec 2",
  images: ["./product-image-1.png", "./product-image-2.jpg"],
  outputPath: "./my-product.wip"
})
```

**WIP File Operations**:
- `generate`: Create WIP from markdown + images
- `verify`: Check integrity of WIP file
- `sign`: Add digital signatures
- `wip2html`: Convert to HTML for display

**Schema**: `schema_query({ action: "get", name: "wip_file" })`

### Attaching WIP to Service

When creating/updating Service, attach WIP to sales items:

```typescript
onchain_operations({
  operation_type: "service",
  data: {
    object: "my-service",
    sales: {
      op: "add",
      list: [{
        name: "Premium Package",
        price: "1000000000",  // 1000 tokens
        stock: 100,
        wip: "https://my-storage.com/product-a.wip",  // WIP file URL
        wip_hash: "<sha256-hash-of-wip-file>"  // Integrity hash (optional but recommended)
      }]
    }
  }
})
```

**Why WIP Matters**:
- **Immutable commitment**: Content is hashed and signed
- **Arbitration evidence**: Disputes are resolved against WIP claims
- **Customer trust**: Transparent product specifications
- **Legal protection**: Tamper-proof record of promises

> **Best Practice**: Always provide `wip_hash` to enable automatic integrity verification. If empty, the system will use the hash embedded in the WIP file.

---

## Order Processing (Progress Operations)

During order fulfillment, **always advance the workflow through the Order's Progress object**, not through the Order object directly.

### Key Principle: Order vs Progress

| Object | Purpose | Can Advance Workflow? |
|--------|---------|----------------------|
| **Order** | Holds funds, records buyer/seller, manages order-level operations | ❌ No |
| **Progress** | Tracks workflow state, executes Machine nodes, triggers Allocation | ✅ Yes |

**Critical**: The Order's `progress` field contains the Progress object ID. Use this ID to operate the workflow.

### Progress Operation Mechanics

**Two-Phase Operation with Lock (Recommended)**:

```
// Step 1: Lock the permission to avoid race conditions
onchain_operations({
  operation_type: "progress",
  data: {
    object: "<progress_object_id>",  // From Order.progress field
    operate: {
      operation: { Next: "<node_name>" },  // Target node to advance to
      hold: true  // Lock permission first
    }
  }
})

// Step 2: Submit result after completing off-chain work
onchain_operations({
  operation_type: "progress",
  data: {
    object: "<progress_object_id>",
    operate: {
      operation: { Next: "<node_name>" },
      hold: false  // Submit result, release lock
    }
  }
})
```

**Why Lock (hold: true)**:
- Prevents **race conditions** when multiple permissions compete
- Ensures **atomic workflow advancement**
- Required for **multi-step operations** with off-chain dependencies

### How Progress Triggers Allocation

```
Order Progression Flow:
├── Progress advances to exit node (via operate)
├── Machine node has associated Guard(s)
├── Guard(s) evaluate current state
├── Allocation auto-executes winning allocator strategy
└── Funds distributed per allocator's sharing rules
```

**Example**: When Progress reaches "delivery_complete" node:
1. Guard "delivery_confirmed" evaluates (buyer signed receipt)
2. Allocation executes "merchant_win" allocator
3. 95% funds released to seller, 5% to platform

### Query Progress State

```
// Get Order to find Progress ID
query_toolkit({ query_type: "onchain_objects", objects: ["<order_name>"] })
// Extract: order.progress

// Query Progress details
query_toolkit({ query_type: "onchain_objects", objects: ["<progress_id>"] })
// Or query Progress table items
query_toolkit({ query_type: "onchain_table", address: "<progress_id>", table_type: "progress" })
```

**Schemas**:
- Progress structure: `schema_query({ action: "get", name: "onchain_operations_progress" })`
- Progress query: `schema_query({ action: "get", name: "query_toolkit" })` — look for `onchain_table` with `table_type: "progress"`

---

## Sub-Order (Supply Chain) Patterns

Services can create **sub-orders on other services** as part of their workflow, enabling supply chain and ecosystem integrations.

### Example: Travel + Insurance Integration

**From [Travel](../examples/Travel/Travel.md) — Insurance Sub-Order**

The Travel workflow creates a sub-order on the Insurance Service when the user chooses to buy insurance:

```
Travel Service Machine Node:
├── Node: "Buy Insurance"
├── Forward: includes `forward_to_order_create`
└── Action: Automatically creates order on Insurance Service when reached
```

**Prerequisites**:
- Insurance Service must be **deployed and published** before Travel Service
- Travel Service Machine node references Insurance Service in `forward_to_order_create`

**Build Order** (see Pattern C: Repository-Linked):
1. Build and publish Insurance Service first
2. Build Travel Service with Machine node that creates sub-orders
3. Publish Travel Service

**Benefits**:
- **Composable services**: Travel + Insurance + Car Rental + Hotel
- **Automatic coordination**: Sub-order creation triggered by workflow progression
- **Independent settlement**: Each service handles its own Allocation and payment

**Schema**: `schema_query({ action: "get", name: "onchain_operations_machine" })` — look for `forward_to_order_create`

---

## Service Provider Strategy: Voluntary Compensation

Service Providers can design **voluntary compensation mechanisms** to build trust and handle service failures gracefully. These compensations are **separate from order funds** and paid proactively to maintain customer relationships.

### Use Case: Late Delivery Compensation

**Scenario**: Courier service fails to deliver within promised timeframe. Service Provider voluntarily pays compensation to customer's Order.

**Why Voluntary Compensation Matters**:
- **Customer retention**: Proactive compensation builds trust and reduces disputes
- **Reputation protection**: Demonstrates service accountability
- **Alternative to arbitration**: Resolves issues before escalation
- **Marketing advantage**: "On-time delivery guarantee" differentiates service

**Implementation Pattern**:

```
Service Provider Machine Design:
├── "Shipping" Node
│   └── Forward: "On Time Delivery" (normal path)
│   └── Forward: "Late Delivery" (with penalty trigger)
│
└── Guard Logic: "delivery_penalty_guard"
    ├── IF delivery_time > promised_time + grace_period
    ├── THEN require Payment from Service Provider to Order
    └── Validate: Payment amount ≥ configured_penalty
```

**Payment Flow**:
```
Service Provider Wallet
        │
        ├──→ Payment (penalty amount) ──→ Customer's Order
        │                                      │
        │                                      └──→ Order.receive() ──→ Customer Wallet
        │
        └──→ Machine Guard validates payment before allowing workflow continuation
```

**Key Design Principles**:

| Principle | Description |
|-----------|-------------|
| **Separate from Order Funds** | Compensation is paid FROM Service Provider's wallet, NOT from order escrow |
| **Guard-Enforced** | Machine workflow requires penalty payment before progression |
| **Transparent Rules** | Penalty conditions and amounts are defined in Service's Machine/Guard |
| **Customer Benefit** | Customer receives compensation directly to their Order, extractable via `receive` |

**Schema**: `schema_query({ action: "get", name: "onchain_operations_payment" })` — for penalty payment validation

---

## Customer Service via Messenger

Service Providers handle customer communication through Wowok Messenger for:
- **Pre-order consultation**: Answer questions about products/services
- **Order coordination**: Confirm delivery details, handle custom requests
- **Issue resolution**: Address complaints before they escalate to arbitration
- **Evidence collection**: WTS files for dispute resolution

> **Complete Messenger Guide**: See [wowok-messenger](../wowok-messenger/SKILL.md) for messaging operations, WTS generation, and evidence management.

### Setting Up Customer Service Contact

Service's `um` field references a Contact object with Messenger addresses:

```
Service.um → Contact.object_id
Contact.ims[] → List of IM addresses for customer service
```

### Responding to Customer Inquiries

```typescript
messenger_operation({
  operation: "send_message",
  to: "<customer_address>",
  content: "Response to inquiry with clear terms and confirmation..."
})
```

**Evidence Closure Principle**: Messages only become valid evidence when you **explicitly confirm** (ARK signature). Ensure you respond to customer messages to create valid evidence trail.

**Best Practices**:
- Respond promptly to customer inquiries
- Document all agreements via Messenger (generates WTS evidence)
- Proactively communicate delays or issues
- Use WTS files as tamper-proof conversation records
- **Always confirm understanding** — unconfirmed messages have limited evidentiary value

---

## Schema Reference

Use `schema_query` tool to get complete JSON schemas:

```
schema_query({ action: "list" })                    // List all schemas
schema_query({ action: "get", name: "onchain_operations_service" })   // Specific operation
schema_query({ action: "list_operations" })         // List all on-chain operations
```

**Common Types** (in `onchain_operations` schema): `TypedPermissionObject`, `WithPermissionObject`, `CallEnv`, `SubmissionCall`

**Operations** (CREATE & MODIFY): `onchain_operations_service` | `onchain_operations_machine` | `onchain_operations_permission` | `onchain_operations_repository` | `onchain_operations_treasury` | `onchain_operations_demand` | `onchain_operations_contact` | `onchain_operations_reward` | `onchain_operations_arbitration`

**CREATE-only**: `onchain_operations_guard` (immutable) | `onchain_operations_payment`

**MODIFY-only**: `onchain_operations_order` | `onchain_operations_progress` | `onchain_operations_personal`

**Tools**: `query_toolkit` | `guard2file` | `machineNode2file` | [all_tools](../wowok-tools/SKILL.md)
