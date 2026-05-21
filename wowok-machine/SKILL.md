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

Design, build, and operate automated workflow templates.

> **Role**: Service Provider or Workflow Designer  
> **Key Tools**: `onchain_operations` with `operation_type: "machine"`  
> **Related Skills**: [wowok-guard](../wowok-guard/SKILL.md) (Guards), [wowok-provider](../wowok-provider/SKILL.md) (Service binding), [wowok-order](../wowok-order/SKILL.md) (customer perspective), [wowok-tools](../wowok-tools/SKILL.md) (schema reference)

---

## Core Concepts

### What is a Machine?

A Machine is a **workflow template** — a directed graph that defines how orders progress from creation to completion. Machines can be bound to Services (one-to-many) or operate standalone for collaborative workflows. When bound to a Service, the Machine is instantiated as a **Progress** object when an order is created. The Machine defines the rules; the Progress tracks the live execution.

**Key Analogy**: Machine = workflow blueprint, Progress = live workflow instance.

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

Node names must be unique within a Machine. The empty string (`""`) represents the initial state — any Pair with `prev_node: ""` is an entry point. A Machine can have multiple entry nodes, each with its own threshold configuration.

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
- **`permissionIndex`** and/or **`namedOperator`**: At least one must be specified — both can be set simultaneously, in which case the executor needs EITHER permission to execute the Forward. 

**Permission Model**:

| Field | Scope | Typical Use |
|-------|-------|-------------|
| `permissionIndex` | Shared across ALL Progress instances from this Machine | Internal roles (merchant operators, admins) — same personnel handle all workflow instances |
| `namedOperator` | Per-Progress namespace | External roles that differ per workflow instance |

- Use `namedOperator: ""` (empty string) to grant order owner and their agents the right to execute the Forward. This is the standard way to let customers operate on their own orders.
- Use `namedOperator: "<role_name>"` for role-based operators managed per Progress instance — ideal when different orders have different delivery personnel or reviewers.
- **Both set**: When `permissionIndex` AND `namedOperator` are both specified, the executor needs EITHER permission to execute the Forward — the permissions act as alternatives. This is useful when the same operation should be executable by either internal staff (via `permissionIndex`) or external roles (via `namedOperator`).

**Best Practice**: Forwards should use **custom permissions** rather than built-in indices to avoid management chaos. Either create a dedicated Permission object via `onchain_operations` with `operation_type: "permission"`, or add custom indices to an existing Permission object. Define workflow-specific roles, then reference those indices in your Forwards. Query the Permission schema via `schema_query({ action: "get", name: "onchain_operations_permission" })`.

### Guard on Forwards

A Forward can optionally include a Guard — an on-chain validation rule that must evaluate to `true` for the Forward to complete. Guards are IMMUTABLE after creation.

**Guard use cases on Forwards**:
- **Time-lock**: Require a minimum duration to pass since entering a node (e.g., Insurance claim cooling-off period)
- **External condition check**: Validate state from a Repository or other on-chain data (e.g., weather conditions for outdoor activities)
- **Supply chain commitment**: Confirm a sub-order was created on another Service
- **Penalty payment verification**: Validate that compensation was paid before proceeding

**Guard retained submissions**: A Guard on a Forward can specify `retained_submission` — an array of identifier indices whose submitted values are preserved and carried forward to subsequent nodes. This enables data flow across workflow stages without re-submission.

> **Full Guard Reference**: See [wowok-guard](../wowok-guard/SKILL.md) for the complete Guard computation tree (70+ node types).

### Threshold Mechanics

The threshold is the **trigger value** for node advancement. Users execute Forwards from the current node, accumulating weight. When the **sum of completed Forward weights ≥ threshold**, the session finalizes: completed Forwards move to history, and the workflow advances to the next node.

**Competing Transitions**: If a node has multiple Pairs leading to different next nodes, the first Pair to meet its threshold wins — subsequent completions go to the newly active node. This enables competitive workflows where different paths race to completion.

**Parallel vs Sequential Execution**: By configuring thresholds and weights, you control task coordination:
- **Sequential**: `threshold = 1`, single Forward with `weight = 1` — one completion triggers advancement
- **Parallel (AND)**: `threshold = N`, N Forwards each with `weight = 1` — all must complete before advancing
- **Parallel (OR)**: Multiple Pairs from same node, each with `threshold = 1` — first completion wins, enabling branching paths like `A→B→C` vs `A→C` where B is optional

---

## Machine Lifecycle

### Dependency-First Construction

A Machine depends on a **Permission** object. Build in this order:

```
1. Permission (CREATE or MODIFY to add indices) → provides access control foundation; add custom indices anytime for Forwards
2. Machine (CREATE, unpublished) → define structure and ALL nodes
3. Guards (CREATE) → build conditions needed by Forwards
4. Bind Guards to Forwards (MODIFY Machine) → add guard references to specific forwards
5. Publish Machine → nodes become IMMUTABLE
6. Bind Machine to Service (MODIFY Service) → machine field
```

**Schema Reference**: Query all Machine operations via `schema_query({ action: "get", name: "onchain_operations_machine" })`. This includes configuration (description, repository binding, pause control, publish, owner receive, contact binding, progress creation, etc.) and node manipulation operations.

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

**File-based Workflow**:

Use `machineNode2file` to export a Machine's nodes to a JSON/Markdown file, edit, then import via `node.json_or_markdown_file` field. The file must contain a JSON array of node objects — this replaces all existing nodes.

---

## Progress: The Live Workflow Instance

### Progress Creation

Progress objects are created in two ways:
- **Service Order**: When an Order is created on a Service with a bound Machine, Progress is automatically instantiated
- **Direct Creation**: Via `progress_new` operation with appropriate permissions

### Progress Operations

**Order-associated Progress** (when Forward with `namedOperator: ""`): Must advance via `order` operations.

**All other cases**: Advance via direct `progress` operations.

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
- `query_toolkit` with `query_type: "onchain_table"` — query all history records from Progress table (paginated)
- `query_toolkit` with `query_type: "onchain_table_item_progress_history"` — query single history record by sequence number

**Schema Reference**: `schema_query({ action: "get", name: "onchain_table_data" })`

---

## Workflow Design Patterns

Business-driven patterns extracted from real WoWok deployments. Each pattern represents a specific commercial intent.

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

### Sub-Order Creation (Supply Chain)

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

### Dual-Signature Consensus

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

