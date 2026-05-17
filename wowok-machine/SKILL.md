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
Each conditional forward needs a Guard. Create these Guards first (see `wowok-guard` skill).

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
