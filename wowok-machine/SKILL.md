---
name: wowok-machine
description: |
  WoWok Machine Workflow Design — the canonical skill for designing, building,
  and operating automated workflow templates (Machines) on WoWok. Machines are
  directed graphs that define how orders progress through stages, who can
  advance them, and what conditions must be met at each step.

  Covers Machine architecture (Nodes, Pairs, Forwards, Guards, Thresholds),
  lifecycle management (create, configure, publish, pause), node operations
  (add, exchange, rename, granular forward/prior-node manipulation),
  Progress integration, cross-service sub-order creation, privacy-preserving
  consensus patterns, and export/import workflows via machineNode2file.
when_to_use:
  - User wants to create or modify a Machine workflow
  - User asks about workflow steps, state transitions, or progress
  - User needs to design order processing pipelines
  - User mentions "machine", "workflow", "progress", "state machine", "pipeline"
  - User wants to export Machine nodes to a file or import from a file
  - User needs to understand threshold mechanics, forward permissions, or guard bindings
---

# WoWok Machine Workflow Design

Design, build, and operate automated workflow templates that define how orders are processed on WoWok.

> **Role**: Service Provider (Merchant/Seller) or Workflow Designer  
> **Prerequisites**: Understand CREATE vs MODIFY pattern — use `schema_query({ action: "get", name: "onchain_operations" })`  
> **Machine Operations Tool**: `onchain_operations` with `operation_type: "machine"`  
> **Progress Operations**: See [wowok-provider](../wowok-provider/SKILL.md) for order fulfillment via Progress  
> **Guard Design**: See [wowok-guard](../wowok-guard/SKILL.md) for creating validation rules  
> **Service Integration**: See [wowok-provider](../wowok-provider/SKILL.md) for binding Machines to Services  
> **Tools**: See [wowok-tools](../wowok-tools/SKILL.md)

---

## Core Concepts

### What is a Machine?

A Machine is a **workflow template** — a directed graph that defines how orders progress from creation to completion. Each Machine belongs to a Service and is instantiated as a **Progress** object when an order is created on that Service. The Machine defines the rules; the Progress tracks the live execution.

**Key Analogy**: Machine = workflow blueprint, Progress = live workflow instance.

### Machine's Role in the Ecosystem

```
Service (merchant storefront)
├── machine → Machine (workflow definition)
├── order_allocators → Allocators (fund distribution rules)
├── sales → SalesItem[] (products)
├── arbitrations → Arbitration[] (dispute resolution)
└── ...

Order (created per purchase on a Service)
├── builder → Customer (order owner)
├── progress → Progress (instantiated from Machine, tracks live workflow state)
└── allocation → Allocation (fund distribution engine)
```

A Machine bridges the Service's commercial promise with the Order's operational reality. It is the executable specification of how a service delivers value.

### Immutability Rules

| Object | When Immutable | Impact |
|--------|---------------|--------|
| **Machine** | After `publish: true` | All nodes are locked; workflow topology frozen |
| **Guard** | After creation | CREATE-only, cannot modify |

Because published Machines are immutable, you must design the complete workflow before publishing. However, before publishing, nodes can be freely added, removed, renamed, and reorganized.

---

## Machine Architecture

### The Building Blocks

A Machine is composed of three structural layers:

```
Machine
└── Nodes (up to 200)
    └── Pairs (up to 40 per node)
        ├── prev_node: which prior node this pair connects from
        ├── threshold: required total forward weight to advance
        └── Forwards (up to 20 per pair)
            ├── name: operation identifier
            ├── weight: contribution toward threshold
            ├── permissionIndex | namedOperator: who can execute
            └── guard (optional): condition that must pass
```

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_machine" })`

### Node

A Node represents a **stage or state** in the workflow. Each node has a unique name and contains one or more Pairs defining how to reach it and what Forwards are available from it.

Node names must be unique within a Machine. The empty string (`""`) is reserved and represents the initial state — the first Pair in the entry node must use `prev_node: ""` with `threshold: 0` to allow anyone to start the workflow.

### Pair (NodePair)

A Pair is the connection between a previous node and the current node. It defines:

- **`prev_node`**: The name of the node this transition comes from. Use `""` (empty string) for the initial entry point.
- **`threshold`**: A 32-bit unsigned integer. When the sum of completed Forward weights from this Pair reaches or exceeds the threshold, the session commits to history and the next node becomes current.
- **`forwards`**: The set of available operations to advance beyond this node.

A single Node can have multiple Pairs, enabling multi-path entry from different prior nodes. For example, a "Completed" node might have one Pair from "Normal Delivery" and another from "Express Delivery", each with different Forwards available.

### Forward

A Forward is a **named operation** that users execute to advance the workflow. Each Forward has:

- **`name`**: A descriptive operation identifier (e.g., "Confirm Order", "Ship Goods", "Complete Signature").
- **`weight`**: A 16-bit unsigned integer (0-65535) representing this Forward's contribution toward the threshold. When the sum of completed Forward weights in the current session meets or exceeds the Pair's threshold, the node transition triggers.
- **`permissionIndex`** or **`namedOperator`**: Exactly one must be specified — this controls who can execute the Forward.

**Permission Model**:

| Field | Scope | Typical Use |
|-------|-------|-------------|
| `permissionIndex` | Shared across ALL Progress instances from this Machine | Internal roles (merchant operators, admins) — same personnel handle all orders |
| `namedOperator` | Per-Progress namespace | External roles that differ per order instance |

- Use `namedOperator: ""` (empty string) to grant order owner and their agents the right to execute the Forward. This is the standard way to let customers operate on their own orders.
- Use `namedOperator: "<role_name>"` for role-based operators managed per Progress instance — ideal when different orders have different delivery personnel or reviewers.

**Schema Reference**: The Permission object's index grants specific accounts the ability to execute Forwards with matching `permissionIndex` values. See `schema_query({ action: "get", name: "onchain_operations_permission" })`.

### Guard on Forwards

A Forward can optionally include a Guard — an on-chain validation rule that must evaluate to `true` for the Forward to complete. Guards are IMMUTABLE after creation.

**Guard use cases on Forwards**:
- **Time-lock**: Require a minimum duration to pass since entering a node (e.g., Insurance claim cooling-off period)
- **Merkle Root verification**: Prove that private off-chain communication occurred via Messenger (e.g., shipping tracking number shared)
- **External condition check**: Validate state from a Repository or other on-chain data (e.g., weather conditions for outdoor activities)
- **Supply chain commitment**: Confirm a sub-order was created on another Service
- **Penalty payment verification**: Validate that compensation was paid before proceeding

When a Forward has a Guard and the Guard requires runtime data submission, the user must include a `submission` block with the Guard operation. Use `schema_query({ action: "get", name: "onchain_operations" })` to understand the submission structure.

**Guard retained submissions**: A Guard on a Forward can specify `retained_submission` — an array of identifier indices whose submitted values are preserved and carried forward to subsequent nodes. This enables data flow across workflow stages without re-submission.

> **Full Guard Reference**: See [wowok-guard](../wowok-guard/SKILL.md) for the complete Guard computation tree (70+ node types).

### Threshold Mechanics

The threshold is the **trigger value** for node advancement. Here is how it works in practice:

1. A Progress session starts when entering a node.
2. Users execute Forwards from the current node, each with its own weight.
3. When the **sum of completed Forward weights ≥ threshold**, the session finalizes:
   - The session (all completed Forwards) moves to Progress history
   - The next node becomes the current node
   - A new session begins at the new node

**Common threshold patterns**:

| Threshold | Weight Pattern | Meaning |
|-----------|---------------|---------|
| 0 | Any (typically weight: 1) | Entry point — no conditions, anyone enters freely |
| 1 | Single forward, weight: 1 | One party must execute the forward to advance |
| 2 | Two forwards, each weight: 1 | Both parties must execute their respective forwards (dual-signature) |
| N (multiple) | Multiple forwards, weights sum to N | Complex multi-party consensus |

---

## Machine Lifecycle

### Dependency-First Construction

A Machine depends on a **Permission** object. Build in this order:

```
1. Permission (CREATE) → provides access control foundation
2. Machine (CREATE, unpublished) → define structure and nodes
3. Guards (CREATE) → build conditions needed by Forwards
4. Bind Guards to Forwards (MODIFY Machine) → add guard references to specific forwards
5. Publish Machine → nodes become IMMUTABLE
6. Bind Machine to Service (MODIFY Service) → machine field
```

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_machine" })`

### CREATE vs MODIFY Pattern

The unified pattern across all WoWok operations:

- **Object shape** (`{ name: "...", permission: "...", ... }`) = **CREATE** a new Machine
- **String value** (`"machine_name"`) = **MODIFY** an existing Machine

When creating, the `object` field must include:
- `name`: Machine name (unique identifier for local mark tracking)
- `permission`: Permission object name or address (can reference an existing Permission, or define a new one)
- `replaceExistName`: Strongly recommended — set to `true` to replace any existing object with the same name

### Configuration Operations on an Existing Machine

Once created (but before publishing), you can perform these operations on a Machine by referencing it as a string value in the `object` field:

**Description management**:
- Set or update the Machine's `description` — a human-readable explanation of the workflow's purpose.

**Repository binding** (`repository`):
- Attach Repository objects to the Machine for consensus data management.
- Operations: `add` (append), `set` (replace all), `remove` (delete specific), `clear` (remove all).
- Maximum 200 consensus repositories per Machine.

**Pause control** (`pause`):
- Set `pause: true` to prevent new Progress objects from being created from this Machine.
- Set `pause: false` to re-enable Progress creation.
- Useful for maintenance windows or service suspension.

**Publish** (`publish: true`):
- Finalizes the Machine. After publishing, nodes can no longer be modified.
- Only published Machines can have Progress objects created from them.

**Owner receive** (`owner_receive`):
- Unwrap and transfer any CoinWrapper objects received by the Machine to the owner of its Permission object.

**Contact binding** (`um`):
- Attach a Contact object to the Machine for customer communication.
- Set to `null` to remove the contact.

**Progress creation** (`progress_new`):
- Create a new Progress object directly from the Machine in a single operation.
- The Machine must already exist (be published) for this to work.
- Can optionally set: `task` (bind a task object), `repository` (bind consensus repositories to the Progress), and `progress_namedOperator` (set per-Progress operators).
- Can optionally name the new Progress via `namedNew` for local mark tracking.

### Node Operations (Pre-Publish Only)

All node operations use the `node` field with a discriminated `op` value. These operations are only available before the Machine is published:

**Bulk node management**:

| Operation | `op` Value | Description |
|-----------|-----------|-------------|
| Add nodes | `"add"` | Append nodes to the Machine. Use `bReplace: true` to replace existing nodes with the same name; `bReplace: false` (default) to merge. |
| Set nodes | `"set"` | Clear all existing nodes first, then add the specified nodes. Use `bReplace: true` for a destructive full replacement. |
| Remove nodes | `"remove"` | Delete nodes by name. |
| Clear all | `"clear"` | Remove all nodes from the Machine. |

**Targeted node manipulation**:

| Operation | `op` Value | Description |
|-----------|-----------|-------------|
| Exchange positions | `"exchange"` | Swap the positions of two nodes in the workflow ordering. |
| Rename | `"rename"` | Change a node's name. All references to the old name in Pairs and Forwards are updated automatically. |
| Remove prior node pairs | `"remove prior node"` | Delete specific prior-node-to-current-node connections (Pairs). Specify `prior_node_name` (array of prior node names to remove) and `node_name`. |
| Add forwards | `"add forward"` | Add Forwards to specific node pairs. Each entry specifies `prior_node_name`, `node_name`, an array of `forward` definitions, and optionally a new `threshold`. |
| Remove forwards | `"remove forward"` | Delete specific Forwards from node pairs by their forward names. |

**File-based node definition**:

Instead of inline node definitions, you can load nodes from a JSON or Markdown file using the `json_or_markdown_file` field within `node`. The file must contain a JSON array of node objects (not an operation wrapper). This completely replaces all existing nodes.

Use `machineNode2file` to export an existing Machine's nodes, edit the file, then re-import.

---

## Progress: The Live Workflow Instance

### The Machine-Progress Relationship

| Object | Purpose | Lifecycle |
|--------|---------|-----------|
| **Machine** | Workflow template (blueprint) | Created → Configured → Published → Immutable |
| **Progress** | Live workflow instance (execution) | Created per Order → Advances through nodes → Reaches terminal |

When an Order is created on a Service that has a published Machine bound to it, a Progress object is automatically created. This Progress tracks the Order's journey through the Machine's workflow.

### Progress Operations

Progress operations use `onchain_operations` with `operation_type: "progress"`.

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_progress" })`

**Advancing Progress**:

Use the `operate` field to advance the Progress. The operation specifies:
- `operation.next_node_name`: The target node name to advance to
- `operation.forward`: The Forward name to execute
- `hold`: Optional boolean for two-phase operation

**Two-Phase Operation (recommended for critical transitions)**:

1. **Lock** (`hold: true`): Reserve the operation permission to prevent race conditions. This is useful when you need to complete off-chain work before submitting.
2. **Submit** (`hold: false` or omit): Finalize the operation. The Forward executes, weight accumulates toward threshold, and if threshold is met, the node transitions.

**Admin unhold** (`adminUnhold: true`): Allows an admin to force-release a lock held by another operator.

**Progress-level configuration**:
- `task`: Bind a task object reference (cannot be changed once set)
- `repository`: Manage consensus Repository objects for this Progress instance
- `progress_namedOperator`: Manage per-Progress named operators (add, set, remove)

### Querying Progress State

**Tools**:

- `query_toolkit` with `query_type: "onchain_objects"` — query the Progress object to see its current node, sessions, and metadata.
- `query_toolkit` with `query_type: "onchain_table_data"` and type `"ProgressHistory"` — query completed history records. Each record contains the previous node, next node, completed session details, and timestamp.

**Schema Reference**: `schema_query({ action: "get", name: "query_toolkit" })`

---

## Export & Import Workflows

### Exporting Machine Nodes (machineNode2file)

The `machineNode2file` tool exports an existing Machine's node definitions to a local file for review, editing, or reuse.

**Tool**: `machineNode2file`

**Key Parameters**:
- `machine`: Machine object name or address to export
- `file_path`: Output file path (absolute or relative)
- `format`: `"json"` (default) or `"markdown"` — Markdown format includes a human-readable table of nodes, pairs, and forwards plus the raw JSON at the bottom

**Schema Reference**: `schema_query({ action: "get", name: "machineNode2file" })`

**Use Cases**:
- Export a proven workflow from an existing Service as a template for a new Service
- Review the full node structure before making changes
- Version control Machine definitions in source control
- Share workflow designs with team members

### Importing Nodes from File

Use the `node.json_or_markdown_file` field within a Machine operation to load node definitions from a local file. The file must contain a JSON array of node objects. This completely replaces all existing nodes — equivalent to a `"set"` operation with `bReplace: true`.

**Workflow**:
1. Export from an existing Machine: `machineNode2file`
2. Edit the file to modify nodes, add new nodes, or adjust thresholds/guards
3. Import into a new or existing Machine: `node.json_or_markdown_file`

---

## Workflow Design Patterns

Business-driven patterns extracted from real WoWok deployments. Each pattern represents a specific commercial intent.

### Pattern 1: Simple Linear Pipeline

**Business Intent**: A straightforward service with sequential stages and no branching.

```
Start → Processing → Review → Completed
```

**Key Characteristics**:
- Every node has exactly one Pair from the previous node
- Each Pair has exactly one Forward
- Threshold: 1, Weight: 1 — single party advances at each step
- No Guards needed

**Entry Node Setup**: The first node has a Pair with `prev_node: ""` and `threshold: 0` — this is the entry point that allows anyone to begin the workflow.

**Real Example — ThreeBody Signature** (2-node linear):
```
Book Delivered → Signature Completed
```
- Node "Book Delivered": Pair from `""` (initial), threshold 0, Forward "Confirm Delivery", permissionIndex for author
- Node "Signature Completed": Pair from "Book Delivered", threshold 1, Forward "Complete Signature", permissionIndex for author

### Pattern 2: Entry + Cancel

**Business Intent**: Allow the customer to cancel an order early, but only from the initial stage.

```
                 → Cancel Order (customer)
Order Confirmation
                 → Confirm Order (merchant) → Shipping → In Transit → Completed
```

**Key Characteristics**:
- The first node has TWO Pairs: one for the initial entry (threshold 0), one for cancellation (also from the same node)
- The customer uses `namedOperator: ""` to cancel (order owner permission)
- The merchant uses `permissionIndex` to confirm
- After leaving the first node, cancellation is no longer possible

**Real Example — MyShop** (4-node with cancel):
```
Order Confirmation → Shipping → In Transit → Completed
              ↘ Order End (Cancel Order)
```
- Node "Order Confirmation": Pair from `""` (threshold 0) with Forward "Confirm Order" (permissionIndex 1000, merchant) AND Forward "Cancel Order" (namedOperator "", customer)
- Once the merchant executes "Confirm Order" and moves to "Shipping", the customer can no longer cancel

### Pattern 3: Multi-Path with Guards

**Business Intent**: Branching workflow where the path taken depends on Guard conditions — different outcomes lead to different fund allocations.

```
           → Normal Completion (guard: delivery_confirmed)
Shipping →
           → Lost Package (guard: package_lost, threshold: 2)
```

**Key Characteristics**:
- Multiple Forwards from the same Pair, each with different Guards
- Guards determine which path is valid based on on-chain or submitted evidence
- Different paths lead to different terminal nodes with different Allocator strategies
- Dual-signature paths use `threshold: 2` — both customer and merchant must confirm

**Real Example — MyShop Advanced** (11-node multi-path):
```
Shipping → Delivery Complete → Order Complete
    │  ├──→ Wonderful (customer rating, triggers reward)
    │  ├──→ Order Complete (time guard: ≥ 10 days auto-completion)
    │  └──→ Lost (threshold: 2, dual-sig, triggers compensation)
    │
    └── Delivery Complete → Non-receipt Return (threshold: 2) → Return Complete
                     └──→ Receipt Return (threshold: 2) → Return Fail (time guard: ≥ 10 days)
                                                   └──→ Return Complete (threshold: 2)
```

### Pattern 4: Time-Lock

**Business Intent**: Require a minimum waiting period before advancing — prevents premature completion.

```
Start → Complete (guard: clock > progress.current_time + lock_duration)
```

**Key Characteristics**:
- The Forward includes a Guard that compares the on-chain Clock with the Progress's `current_time` plus a lock duration
- The Guard uses `convert_witness` to transform the submitted Order ID into its Progress object, then queries `progress.current_time`
- Prevents the workflow from completing before the lock period expires

**Real Example — Insurance** (time-lock claim):
- Guard `insurance_complete_guard` uses `convert_witness: 100` (TypeOrderProgress) to access Progress data
- Validates: `clock > progress.current_time + lock_duration`
- Lock duration: 1000ms for testing, should be reasonable duration (e.g., 8 hours) in production

### Pattern 5: Sub-Order Creation (Supply Chain)

**Business Intent**: When advancing a Forward, automatically create a sub-order on another Service — committing to use a trusted supplier.

```
Start → Buy Insurance (creates sub-order on Insurance Service) → Main Activity → Complete
```

**Key Characteristics**:
- The Forward uses `forward_to_order_create` to specify the target Service for the sub-order
- The Guard on the Forward validates that the sub-order was successfully created
- Useful for supply chain transparency: "We use X supplier" becomes verifiable on-chain

**Real Example — Travel** (insurance sub-order):
- Forward "Buy Insurance" on the "Start" node creates a sub-order on the Insurance Service
- The Insurance sub-order follows its own Machine workflow independently
- Both workflows (Travel and Insurance) progress in parallel

### Pattern 6: Dual-Signature Consensus

**Business Intent**: Require both parties (customer and merchant) to confirm before advancing — used for sensitive operations like returns, lost packages, and completion.

```
Shipping → Lost (threshold: 2)
           ├── Forward: "customer_reports_lost" (namedOperator: "", weight: 1)
           └── Forward: "merchant_confirms_lost" (permissionIndex, weight: 1)
```

**Key Characteristics**:
- Threshold: 2 with two Forwards each of weight: 1
- One Forward uses `namedOperator: ""` (customer), the other uses `permissionIndex` (merchant)
- Both must execute their respective Forwards before the node transitions
- Creates an undeniable on-chain record of mutual agreement

**Real Example — MyShop Advanced**:
- Lost, Non-receipt Return, Receipt Return, and Return Complete all use threshold: 2
- Both customer and merchant must confirm, preventing unilateral actions

---

## Privacy & Off-Chain Consensus

### The Messenger Pattern

Sensitive logistics data (shipping addresses, tracking numbers, personal information) flows through Messenger's end-to-end encryption — never stored on-chain. What goes on-chain is a **Merkle Root** — a cryptographic proof that communication occurred.

**The principle**: **Who performs the key action, submits the proof.** The other party confirms.

| Scenario | Off-Chain Action | On-Chain Proof |
|----------|-----------------|----------------|
| Merchant ships order | Receives address via Messenger, replies with tracking number | Merchant submits Merkle Root to Guard on Forward |
| Customer returns item | Sends return tracking number via Messenger | Customer submits Merkle Root to Guard on Forward |
| Mutual confirmation | Both parties sign via Messenger | Both submit confirmation proofs |

The Merkle Root Guard validates that the communication matches the expected content pattern, ensuring accountability without exposing private data.

> **Full Guide**: See [wowok-messenger](../wowok-messenger/SKILL.md) for Messenger operations and WTS evidence generation.

---

## Service Penalty & Compensation

Design Machines to handle service failures gracefully through automated compensation workflows. Guards validate penalty payments before allowing workflow continuation.

### Late Delivery Penalty Pattern

```
Shipping Node → On Time Delivery (normal path)
              → Late Delivery (guard: time > deadline)
                   → Penalty Payment Verified (guard: payment ≥ configured_penalty)
                        → Continue to Next Node
```

**Design**: The Shipping node has two Forwards — one for on-time delivery (no guard), one for late delivery (guard checks if past deadline). The late path requires a Guard that verifies a Payment from the merchant to the customer's Order before allowing progression.

**Benefits**:
- Automatic enforcement — late delivery cannot proceed without compensation
- Cryptographically verified payment
- Customer protection guarantee
- Service accountability

> **Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_payment" })` for penalty payment validation.

### Cross-Service Penalties

When multiple Services collaborate (e.g., Travel + Insurance + Courier), any party's failure can trigger penalties paid to the affected customer's Order. The penalty Guard validates the payment, and the customer extracts compensation via the Order's `receive` operation.

---

## Build Checklist

Use this checklist when designing a Machine workflow:

```
Designing a Machine workflow?

├── Scope: How many nodes?
│   ├── 2 nodes → Linear: Start → Complete (Insurance, ThreeBody)
│   ├── 4 nodes → Linear with cancel: Order → Ship → Transit → Complete (MyShop)
│   ├── 5+ nodes → Multi-path with branches (Travel)
│   └── 11+ nodes → Enterprise: dual-sig + time + rewards (MyShop Advanced)

├── Entry point design:
│   └── First node MUST have a Pair with prev_node: "" and threshold: 0

├── Who advances at each step?
│   ├── Merchant/Provider → Use permissionIndex (shared across all orders)
│   ├── Customer → Use namedOperator: "" (order owner)
│   └── Role-specific per order → Use namedOperator: "<role>"

├── Need dual-signature (multi-party confirmation)?
│   └── Set threshold: 2 with two Forwards each weight: 1 → Both parties must execute

├── Need time-based auto-advancement?
│   └── Add a time Guard on the Forward (compare Clock with progress.current_time + duration)

├── Need conditional branching?
│   └── Multiple Forwards from the same Pair, each with different Guards

├── Need Guard on Forward?
│   ├── What condition must pass?
│   ├── Does the Guard need user-submitted data? (submission block)
│   └── Does the Guard need retained submissions for subsequent nodes?

├── Need sub-order creation (supply chain)?
│   └── Use forward_to_order_create on the Forward → Creates sub-order on target Service

├── Fund flow design:
│   └── Each terminal node should map to an Allocator strategy — design Machine and Allocators together

└── Terminal nodes:
    └── Nodes with no Forwards are terminal — ensure every path reaches one
```

---

## Common Pitfalls

| Pitfall | Consequence | Prevention |
|----------|-------------|------------|
| Publishing Machine before binding all Guards | Cannot add Guard references after publish | Verify all Guard references in Forwards before publishing |
| Designing Machine without considering Allocators | Fund distribution doesn't match workflow outcomes | Design Machine and Allocators together; each terminal node maps to an allocator |
| Missing entry pair (`prev_node: ""`, `threshold: 0`) | Workflow cannot be started — no initial node | Always include an entry pair in at least one node |
| Creating Guards after Machine publish | Guards referenced in Forwards won't exist | Create all Guards before finalizing Machine Forwards |
| Not testing on testnet first | Bugs become permanent after mainnet publish | Always test the full workflow on testnet before mainnet deployment |
| Orphaned paths (no route to a terminal node) | Orders can get stuck with no exit | Trace all possible paths from entry to exit; every node must lead to a terminal |
| Using wrong permission model | Unauthorized users can advance (or authorized users cannot) | Carefully choose `permissionIndex` vs `namedOperator` based on the scope of the role |

---

## Quick Reference

### Essential Schemas

| Purpose | Schema Name |
|---------|-------------|
| Machine operations | `onchain_operations_machine` |
| Progress operations | `onchain_operations_progress` |
| Guard operations | `onchain_operations_guard` |
| Permission operations | `onchain_operations_permission` |
| Service operations (Machine binding) | `onchain_operations_service` |
| Query toolkit | `query_toolkit` |
| Table data query | `onchain_table_data` |
| Machine node export | `machineNode2file` |

**Query any schema**: `schema_query({ action: "get", name: "<schema_name>" })`

### Key Constraints

| Constraint | Limit |
|-----------|-------|
| Maximum nodes per Machine | 200 |
| Maximum Pairs per node | 40 |
| Maximum Forwards per Pair | 20 |
| Maximum consensus repositories per Machine | 200 |
| Forward weight range | 0–65535 (u16) |
| Threshold range | 0–4294967295 (u32) |
| Node name max length | Configurable, validated by `isValidName` |

### Related Skills

| Skill | Relevance |
|-------|-----------|
| [wowok-guard](../wowok-guard/SKILL.md) | Designing Guards for Machine Forwards |
| [wowok-provider](../wowok-provider/SKILL.md) | Binding Machines to Services, designing Allocators alongside workflows |
| [wowok-order](../wowok-order/SKILL.md) | Customer perspective on order progression through Machine workflows |
| [wowok-messenger](../wowok-messenger/SKILL.md) | Off-chain communication patterns with on-chain Merkle Root proofs |
| [wowok-tools](../wowok-tools/SKILL.md) | MCP tool reference for all schema queries and operations |