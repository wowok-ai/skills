---
name: wowok-build
description: |
  WoWok complex system building — the canonical skill for constructing multi-object
  on-chain systems (Service + Machine + Guard + Allocation + Reward + Treasury).
  Use this skill whenever the user wants to build, deploy, or modify a WoWok
  service system involving multiple interdependent on-chain objects.
  
  This skill covers: dependency chains, canonical build order, step-by-step
  construction patterns, and common pitfalls. It ensures AI follows the correct
  sequence and avoids the most frequent build failures.
when_to_use:
  - User wants to create a new service/marketplace on WoWok
  - User wants to build a workflow system with Machine + Progress
  - User wants to set up order splitting, incentive pools, or fund allocation
  - User mentions "build", "deploy", "create service", "setup workflow"
  - User is constructing multiple interdependent on-chain objects
---

# WoWok Complex System Building

## Core Principle: Dependency-First Construction

Every WoWok system is a **directed acyclic graph (DAG)** of on-chain objects. You MUST build objects in dependency order — an object cannot reference another object that does not yet exist.

## Canonical Build Order

```
1. Permission (access control rules)
2. Guard (trust/validation rules) — may reference Permission
3. Service (marketplace listing) — references Guard, may reference Permission
4. Machine (workflow template) — references Guard, may reference Permission
5. Allocation (auto-distribution rules) — references Service
6. Reward (incentive pool) — references Service
7. Treasury (team fund) — references Service
8. Demand (service request) — references Service
9. Order (order management) — references Service, Machine
```

### Why This Order Matters

- **Permission** is the foundation: Guards, Services, and Machines all reference it for access control.
- **Guard** is the trust layer: Services and Machines embed Guard rules for validation.
- **Service** is the hub: Allocation, Reward, Treasury, Demand, and Order all reference a Service.
- **Machine** defines workflows: Orders reference Machines for progress tracking.

## Step-by-Step Construction Pattern

### Step 1: Discover Available Resources

Before building anything, ALWAYS query what exists:

```
Tool: query_toolkit (query_type: "account_list")
→ Discover available accounts

Tool: query_toolkit (query_type: "local_mark_list")
→ Discover named addresses (name→address mappings)

Tool: wowok_buildin_info (info_type: "permissions")
→ Discover built-in permission indices

Tool: wowok_buildin_info (info_type: "guard_instructions")
→ Discover available Guard instructions
```

### Step 2: Build Permission (if needed)

Permissions control who can do what. Use built-in permissions when possible.

```
Tool: onchain_operations (operation_type: "permission")
Data: {
  op: "create",
  name: "<permission_name>",
  description: "<description>",
  builder: "<account_name_or_address>",
  perm: [
    { name: "<perm_name>", permission_index: <number>, description: "<desc>" }
  ]
}
```

**Key rule**: The `builder` account becomes the initial owner. Only the builder can modify the Permission later.

### Step 3: Build Guard

Guards are programmable trust rules. This is the most complex step — see `wowok-guard` skill for detailed guidance.

```
Tool: onchain_operations (operation_type: "guard")
Data: {
  op: "create",
  name: "<guard_name>",
  description: "<description>",
  table: [
    { name: "<field_name>", value_type: "<type>", description: "<desc>" }
  ],
  root: { <guard_node_tree> }
}
```

**Critical**: The `table` defines what data the Guard validates. The `root` defines the validation logic tree.

### Step 4: Build Service

The Service is the marketplace listing — it ties everything together.

```
Tool: onchain_operations (operation_type: "service")
Data: {
  op: "create",
  name: "<service_name>",
  description: "<description>",
  buy_guard: "<guard_name_or_id>",
  sell_guard: "<guard_name_or_id>",
  permission: "<permission_name_or_id>",
  token_type: "<token_type>",
  price: "<price>",
  ...
}
```

### Step 5: Build Machine (if workflow needed)

```
Tool: onchain_operations (operation_type: "machine")
Data: {
  op: "create",
  name: "<machine_name>",
  description: "<description>",
  service: "<service_name_or_id>",
  guard: "<guard_name_or_id>",
  node: {
    op: "set",
    nodes: [ <machine_node_definitions> ],
    bReplace: true
  }
}
```

### Step 6: Build Allocation (for order splitting)

```
Tool: onchain_operations (operation_type: "allocation")
Data: {
  op: "create",
  name: "<allocation_name>",
  service: "<service_name_or_id>",
  rules: [ <allocation_rules> ]
}
```

### Step 7: Build Reward (for incentives)

```
Tool: onchain_operations (operation_type: "reward")
Data: {
  op: "create",
  name: "<reward_name>",
  service: "<service_name_or_id>",
  ...
}
```

## The Submission Pattern (Critical for Safety)

Operations that modify on-chain state support a **two-phase submission** pattern:

1. **Phase 1 — Dry Run**: Call without `submission` to validate and get a preview
2. **Phase 2 — Execute**: Add `submission: { sender: "<account>", gas_budget: "<amount>" }` to execute

```
// Phase 1: Validate
onchain_operations({ operation_type: "service", data: { op: "create", ... } })

// Phase 2: Execute (only after user confirms the preview)
onchain_operations({
  operation_type: "service",
  data: { op: "create", ... },
  submission: { sender: "my_account", gas_budget: "10000000" }
})
```

**ALWAYS do Phase 1 first** and show the result to the user before Phase 2.

## Common Build Patterns

### Pattern 1: Simple Marketplace (Service + Guard + Permission)

```
Permission → Guard → Service
```

### Pattern 2: Workflow Service (Service + Machine + Guard + Permission)

```
Permission → Guard → Service → Machine
```

### Pattern 3: Full Commerce System (Service + Machine + Guard + Allocation + Reward + Treasury)

```
Permission → Guard → Service → Machine → Allocation → Reward → Treasury
```

### Pattern 4: Order Lifecycle (Service + Machine + Order + Progress)

```
Service → Machine → Order → Progress
```

## Critical Rules

1. **Never skip the query phase** — always check what accounts, marks, and on-chain objects exist before building.
2. **Always use names, not raw addresses** — use `local_mark_operation` to create human-readable names for addresses.
3. **Build one object at a time** — verify each creation succeeded before building the next dependency.
4. **Use `no_cache: true`** when querying an object you just created to avoid stale cache reads.
5. **Export and review** — use `guard2file` and `machineNode2file` to export definitions for review before publishing.
6. **Publish is the final step** — only publish Service and Machine after thorough testing.

## Error Recovery

| Error | Cause | Fix |
|-------|-------|-----|
| "object not found" after creation | Cache stale read | Retry with `no_cache: true` |
| "permission denied" | Wrong account or missing perm | Check Permission config and sender account |
| Guard validation failure | Data doesn't match Guard rules | Review Guard table and submitted data |
| "dependency not found" | Wrong build order | Check that all referenced objects exist first |
