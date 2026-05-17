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

You MUST build objects in dependency order — an object cannot reference another object that does not yet exist.

## Canonical Build Order

The build process has **6 phases**. Within a phase, objects may be built in parallel. Across phases, strict ordering is enforced.

```
PHASE 1 — Foundation
  1. Permission (access control rules)

PHASE 2 — Trust Layer
  2. Guard (trust/validation rules) — may reference Permission
     ⚠️ If a Guard queries specific on-chain objects (Service, Machine, etc.)
        via query_type "object", that Guard MUST be created AFTER those objects.
        Guards that query system objects only (entity_registrar, balance, etc.)
        are safe to create here.

PHASE 3 — Service Scaffold (unpublished)
  3. Service (marketplace listing) — references Guard, may reference Permission
     Create the Service but DO NOT publish yet. The Service acts as a hub that
     Machine, Allocation, Reward, and Arbitration will reference.

PHASE 4 — Service Sub-Components (built before Service publish)
  4. Machine (workflow template) — references Guard, may reference Permission
  5. Allocation (auto-distribution rules) — references Service
  6. Reward (incentive pool) — references Service
  7. Arbitration (dispute resolution) — references Service

PHASE 5 — Publish Sequence (order within this phase is CRITICAL)
  8. Publish Machine(s) — once published, node definitions become IMMUTABLE
  9. Service: set Machine reference(s) — assign published Machine(s) to Service
  10. Publish Service — Machine & Allocation are now LOCKED;
      Reward(s) & Arbitration(s) can still be added after publish;
      other Service settings (products, pricing, etc.) remain modifiable

PHASE 6 — Runtime Objects
  11. Treasury (team fund) — references Service
  12. Demand (service request) — references Service
  13. Order (order management) — references Service, Machine
```

### Why This Order Matters

#### Core Dependency Rules

- **Permission** is the absolute foundation. Service, Machine, Reward, Demand, Treasury, Repository, Contract, and Arbitration ALL use their own `permission` field for access control. Permission MUST exist first (or be a pre-existing built-in).

- **Guard** provides programmable trust/validation. Services and Machines embed Guards. Guards that query system objects (entity_registrar, balance, personal profile, etc.) can be created here safely. However, **if a Guard queries a specific custom object** (using `query_type: "object"` targeting a Service or Machine), that Guard MUST be created AFTER the object it queries. Always verify Guard query targets before placement.

- **Service** is the central hub. Machine, Allocation, Reward, Arbitration, Treasury, Demand, and Order all reference a Service. Create the Service scaffold early so sub-components have an ID to reference — but defer publishing until all required sub-components are ready.

- **Machine, Allocation, Reward, Arbitration** each depend on Guards that must be created first (Phase 2). These sub-components also reference the Service (Phase 3).

#### Publish-Phase Immutability Rules

This is the most critical constraint in the system. When a Service is published:

| Setting | Locked on Publish? | Can modify after? |
|---------|-------------------|-------------------|
| Machine reference | ✅ LOCKED | ❌ Cannot change or remove |
| Allocation rules | ✅ LOCKED | ❌ Cannot change or remove |
| Reward(s) | ❌ Not locked | ✅ Can add more Rewards |
| Arbitration(s) | ❌ Not locked | ✅ Can add more Arbitrations |
| Products / pricing | ❌ Not locked | ✅ Can add/modify products |
| buy_guard / sell_guard | ❌ Not locked | ✅ Can update guard references |
| Description / metadata | ❌ Not locked | ✅ Can update |

When a Machine is published:
| Setting | Locked on Publish? | Can modify after? |
|---------|-------------------|-------------------|
| Node definitions | ✅ LOCKED | ❌ Cannot change nodes, forwards, or pairs |

**Therefore, the publish sequence is non-negotiable**: Machine(s) MUST be published BEFORE the Service sets them, and Service MUST NOT be published until all intended Machines and Allocations are finalized and attached.

#### Sequence Rationale Summary

| Object | Must exist BEFORE this object | Why |
|--------|------------------------------|-----|
| Permission | (nothing) | Foundation — referenced by all other objects' `permission` field |
| Guard | Permission (optional) | Guards may reference Permission indices in their logic |
| Service | Guard, Permission | Service embeds buy_guard/sell_guard and permission |
| Machine | Guard, Permission (optional) | Machine nodes use Guards for transition control |
| Allocation | Service | Allocation rules split payments for a specific Service |
| Reward | Service | Reward pools belong to a specific Service |
| Arbitration | Service | Arbitration resolves disputes for a specific Service |
| Treasury | Service | Treasury holds funds for a specific Service |
| Demand | Service | Demand is a request against a specific Service |
| Order | Service, Machine | Order references the Service and its workflow Machine |

## Step-by-Step Construction Pattern

### Phase 0: Discover Available Resources (ALWAYS FIRST)

Before building anything, query what already exists on-chain and locally:

```
Tool: query_toolkit (query_type: "account_list")
→ Discover available accounts and their addresses

Tool: query_toolkit (query_type: "local_mark_list")
→ Discover named address mappings (name→address)

Tool: query_toolkit (query_type: "onchain_objects")
→ Discover existing on-chain objects (avoid name collisions)

Tool: wowok_buildin_info (info_type: "permissions")
→ Discover built-in permission indices (reuse when possible)

Tool: wowok_buildin_info (info_type: "guard_instructions")
→ Discover available Guard instructions (needed for Guard design)
```

### Phase 1: Build Permission

Permissions define **who can do what** to all other objects. Every object — Service, Machine, Reward, Demand, Treasury, Repository, Contract, Arbitration — carries a `permission` field. Permission MUST be created first.

Use built-in permissions when they suffice. Otherwise, create a custom one:

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

**Key rules**:
- The `builder` account becomes the initial owner. Only the builder can modify the Permission later.
- Each entry in `perm` maps a human-readable name to a built-in `permission_index` (from `wowok_buildin_info`).
- After creation, mark it: `local_mark_operation({ op: "add", data: [{ name: "my_perm", address: "<perm_id>", tags: ["permission"] }] })`

### Phase 2: Build Guard(s)

Guards are programmable trust/validation rules. See `wowok-guard` skill for detailed node tree design.

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

**Critical rules**:
- The `table` defines what input data the Guard validates at runtime.
- The `root` defines the validation logic tree (typically an `and` node).
- Every `witness` reference in the tree MUST match a field name in `table`.
- Query nodes MUST have `convert_witness` to extract comparable values.
- **⚠️ Ordering constraint**: If this Guard queries a specific on-chain object (`query_type: "object"` targeting a Service or Machine ID), that target object MUST be created BEFORE this Guard. Guards that only query system objects (entity_registrar, balance, etc.) are safe to build here.
- After creation, mark it: `local_mark_operation({ op: "add", data: [{ name: "my_guard", address: "<guard_id>", tags: ["guard"] }] })`

### Phase 3: Build Service Scaffold (UNPUBLISHED)

Create the Service as a scaffold — it will be referenced by sub-components but NOT published yet. Do NOT set `publish: true` at this stage.

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

**Key rules**:
- `buy_guard` validates buyers (e.g., entity registration, minimum reputation).
- `sell_guard` validates sellers (e.g., credential verification).
- `permission` controls who can administer this Service.
- The Service ID returned by creation is needed by Phase 4 components.
- After creation, mark it: `local_mark_operation({ op: "add", data: [{ name: "my_service", address: "<service_id>", tags: ["service"] }] })`

### Phase 4: Build Service Sub-Components

All sub-components reference the Service created in Phase 3. These MUST be built BEFORE the Service is published (Phase 5).

#### 4a: Build Machine(s) (workflow templates)

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

**Key rules**:
- Each node needs a unique name, `forwards` defining transitions, and optional `guard` per transition.
- The Machine's `guard` provides a default validation context for all nodes.
- Export for review: `machineNode2file({ machine: "<machine_id>", file_path: "<path>", format: "json" })`
- Nodes CAN be modified and re-exported UNTIL the Machine is published.

#### 4b: Build Allocation(s) (payment splitting)

```
Tool: onchain_operations (operation_type: "allocation")
Data: {
  op: "create",
  name: "<allocation_name>",
  service: "<service_name_or_id>",
  rules: [
    { recipient: "<address>", share: <percentage>, discount_type: "RATES" }
  ]
}
```

**Key rules**:
- `discount_type: "RATES"` = percentage-based (share is out of 100).
- `discount_type: "FIXED"` = fixed amount split.
- Total shares should sum to 100 for RATES type.
- Allocation rules become **LOCKED** when the Service is published.

#### 4c: Build Reward(s) (incentive pools)

```
Tool: onchain_operations (operation_type: "reward")
Data: {
  op: "create",
  name: "<reward_name>",
  service: "<service_name_or_id>",
  ...
}
```

**Key rules**:
- Rewards can be added AFTER Service publish as well.
- Each Reward defines conditions (via Guard) for claiming incentives.

#### 4d: Build Arbitration(s) (dispute resolution)

```
Tool: onchain_operations (operation_type: "arbitration")
Data: {
  op: "create",
  name: "<arbitration_name>",
  service: "<service_name_or_id>",
  ...
}
```

**Key rules**:
- Arbitrations can be added AFTER Service publish as well.
- Defines how disputes on orders for this Service are resolved.

### Phase 5: Publish Sequence (ORDER IS CRITICAL)

This phase has a **non-negotiable** internal order. Incorrect sequencing will lock settings prematurely.

#### 5a: Publish Machine(s) FIRST

```
Tool: onchain_operations (operation_type: "machine")
Data: {
  op: "publish",
  name: "<machine_name>",
  ...
}
submission: { sender: "<account>", gas_budget: "<amount>" }
```

**After publishing a Machine, its node definitions (nodes, forwards, pairs) become IMMUTABLE.** Review thoroughly before this step.

#### 5b: Service sets Machine reference(s)

```
Tool: onchain_operations (operation_type: "service")
Data: {
  op: "update",
  name: "<service_name>",
  machine: "<machine_name_or_id>",
  ...
}
```

Assign the published Machine(s) to the Service. This reference will be locked on Service publish.

#### 5c: Publish Service LAST

```
Tool: onchain_operations (operation_type: "service")
Data: {
  op: "publish",
  name: "<service_name>",
  ...
}
submission: { sender: "<account>", gas_budget: "<amount>" }
```

**After publishing a Service**:
- ✅ Machine reference is **LOCKED** — cannot change or remove.
- ✅ Allocation rules are **LOCKED** — cannot change or remove.
- ✅ Reward(s) and Arbitration(s) can still be **ADDED** (but existing ones may lock).
- ✅ Products, pricing, description, guard references can still be **MODIFIED**.
- ✅ The Service can now receive Orders.

### Phase 6: Build Runtime Objects

These objects operate on a published Service at runtime.

#### 6a: Treasury (team fund)

```
Tool: onchain_operations (operation_type: "treasury")
Data: {
  op: "create",
  name: "<treasury_name>",
  service: "<service_name_or_id>",
  ...
}
```

#### 6b: Demand (service request)

```
Tool: onchain_operations (operation_type: "demand")
Data: {
  op: "create",
  service: "<service_name_or_id>",
  ...
}
```

#### 6c: Order (order instance)

```
Tool: onchain_operations (operation_type: "order")
Data: {
  op: "create",
  service: "<service_name_or_id>",
  machine: "<machine_name_or_id>",
  buyer: "<buyer_address>",
  seller: "<seller_address>",
  price: "<amount>",
  token_type: "<token_type>",
  ...
}
```

Orders reference both the Service (marketplace context) and Machine (workflow template).

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

### Pattern 1: Simple Marketplace (Permission + Guard + Service)

For a basic buy/sell marketplace with no workflow.

```
Phase 1: Permission → Phase 2: Guard → Phase 3: Service (unpublished) → Phase 5c: Publish Service
```

No Machines, no Allocations — just Permission, Guard, and Service. Publish Service directly.

### Pattern 2: Workflow Service (Permission + Guard + Service + Machine)

For services that need order progress tracking through defined stages.

```
Phase 1: Permission → Phase 2: Guard → Phase 3: Service (unpublished)
→ Phase 4a: Machine → Phase 5a: Publish Machine → Phase 5b: Service sets Machine → Phase 5c: Publish Service
```

### Pattern 3: Full Commerce System (Permission + Guard + Service + Machine + Allocation + Reward + Treasury)

A complete marketplace with workflow, payment splitting, incentives, and treasury.

```
Phase 1: Permission → Phase 2: Guard(s) → Phase 3: Service (unpublished)
→ Phase 4a: Machine → Phase 4b: Allocation → Phase 4c: Reward
→ Phase 5a: Publish Machine → Phase 5b: Service sets Machine → Phase 5c: Publish Service
→ Phase 6a: Treasury
```

### Pattern 4: Order Lifecycle (after Service is published)

```
Published Service + Published Machine → Phase 6b: Demand → Phase 6c: Order → Progress tracking
```

### Pattern 5: Service with Arbitration (Permission + Guard + Service + Arbitration)

```
Phase 1: Permission → Phase 2: Guard(s) → Phase 3: Service (unpublished)
→ Phase 4d: Arbitration → Phase 5c: Publish Service
(Additional Arbitrations can be added post-publish)
```

## Real-World Build Examples

The following build sequences are extracted from **tested, verified examples** in `d:\wowok\docs\examples\`. Each example has been executed on testnet with actual transaction results. See the corresponding `*_TestResults.md` files for real object addresses and execution logs.

### Example Build Sequence Comparison

| Phase | [MyShop](../examples/MyShop/MyShop.md) | [MyShop Advanced](../examples/MyShop_Advanced/MyShop_Advanced.md) | [Insurance](../examples/Insurance/Insurance.md) | [Travel](../examples/Travel/Travel.md) | [ThreeBody](../examples/ThreeBody_Signature/ThreeBody_Signature.md) |
|-------|-----------|-------------------|-----------|--------|------------|
| 1 | Permission | Permission | Permission | Permission (weather) → Repository → Permission (travel) | Permission |
| 2 | Machine (unpublished) | Service (empty, unpublished) | Guard (complete) → Guard (withdraw) | Arbitration → Guards (weather, complete, cancel, buy-insurance) | Guard (buy) |
| 3 | Contact | Guards (machine ×4, service ×2) | Machine (with nodes + publish inline) | Machine (with nodes) → Publish | Machine (with nodes) → Publish |
| 4 | Guards (withdraw, refund) | Machine (with nodes) | Service (with machine + publish inline) | Service (with machine + allocation + publish inline) | Service (with machine + publish inline) |
| 5 | Service (with machine, allocation, publish) | Publish Machine | — | — | — |
| 6 | — | Bind Machine to Service | — | — | — |
| 7 | — | Arbitration | — | — | — |
| 8 | — | Service update + publish | — | — | — |
| 9 | — | Reward + Reward Guards | — | — | — |

### Key Patterns Observed Across All Examples

#### Pattern A: Inline Publish (Insurance, Travel, ThreeBody)

The simplest pattern: create and publish Machine + Service in as few transactions as possible.

```
Permission → Guard(s) → Machine (create with nodes, publish: true)
                     → Service (create with machine + order_allocators + sales, publish: true)
```

Used when: the system has few Guards, no complex allocation, and the Machine workflow is straightforward.

**Concrete example** (Insurance — 2 transactions after Permission):
1. `operation_type: "machine"` with `data.object: {name, permission}`, `data.node: {op: "add", nodes: [...]}`, `data.publish: true`
2. `operation_type: "service"` with `data.object: {name, permission, type_parameter}`, `data.machine`, `data.order_allocators`, `data.sales`, `data.publish: true`

#### Pattern B: Scaffold-First (MyShop Advanced)

Create Service empty/unpublished first to get its address, then build Guards that reference it, then finalize.

```
Permission → Service (create empty, NO publish)
          → Guards (can query Service name/address)
          → Machine (create with nodes)
          → Publish Machine → Bind Machine to Service
          → Arbitration
          → Service update (add order_allocators, sales, arbitrations) + publish
          → Reward (post-publish, can still be added)
```

Used when: Guards need to verify that orders belong to a specific Service name, so the Service must exist before Guards are created.

**Concrete example** (MyShop Advanced — 9 major steps):
1. `operation_type: "permission"` → create + add permission indexes (1000-1015)
2. `operation_type: "service"` → create with `data.object: {name, permission}`, NO publish
3. `operation_type: "guard"` ×6 → 4 machine guards (merkle_root, service_order, time_10d, time_2d) + 2 service guards (merchant_win, customer_win)
4. `operation_type: "machine"` → create with `data.object: {name, permission}`, `data.node: {op: "add", nodes: [11 nodes]}`
5. `operation_type: "machine"` → update with `data.publish: true`
6. `operation_type: "service"` → update with `data.machine: "<machine_name>"`
7. `operation_type: "arbitration"` → create
8. `operation_type: "service"` → update with `data.order_allocators`, `data.sales`, `data.arbitrations`, `data.publish: true`
9. `operation_type: "reward"` → create + `guard_add` (post-publish, rewards can be added)

#### Pattern C: Repository-Linked (Travel)

When the system depends on external data (Repository), that data provider's objects must be built first.

```
Weather Provider: Permission → Repository (with policies + data)
Travel Provider:  Permission → Arbitration → Guards (queries weather repo)
                 → Machine → Publish Machine
                 → Service (with machine + allocation) → Publish Service
```

Used when: a Guard queries Repository data (e.g., weather conditions). The Repository and its data must exist before the Guard that queries it.

#### Pattern D: Simple Marketplace (MyShop)

When the system has allocation but the Machine is built before Guards for simplicity.

```
Permission → Machine (unpublished) → Contact → Guards → Service (with machine + allocation, publish)
```

Note: MyShop creates the Machine before Guards because its Guards don't query the Service. This is valid when Guards only reference system-level queries (entity_registrar, balance, etc.).

### Pattern E: Minimal Guard (ThreeBody Signature)

The simplest possible system — one Guard protecting a buy operation.

```
Permission → Guard (buyer == creator) → Machine (2 nodes + publish inline) → Service (with machine + publish inline)
```

### Build Strategy Decision Tree

```
Building a WoWok Service?
├─ Guards need to query THIS Service's name? 
│  ├─ YES → Scaffold-First (Pattern B): create Service empty first
│  └─ NO  → Inline Publish (Pattern A): create Machine+Service directly
│
├─ System depends on external Repository data?
│  └─ YES → Repository-Linked (Pattern C): build data provider objects first
│
├─ Need post-publish Rewards (incentives)?
│  └─ YES → Create Reward AFTER Service publish (can always be added later)
│
├─ Need Allocation (payment splitting)?
│  └─ YES → Must be set BEFORE Service publish (becomes locked)
│
├─ Need Arbitration (dispute resolution)?
│  └─ Can be added BEFORE or AFTER Service publish
│
└─ Complexity rules:
   ├─ 1-2 Guards, simple workflow → Pattern A (inline)
   ├─ 5+ Guards, complex allocation → Pattern B (scaffold-first)
   └─ External data dependency → Pattern C (repository-linked)
```

### Cross-Reference: Actual Test Results

All patterns above are verified by real testnet executions:

| Example | Test Results File | Key Verified Behaviors |
|---------|------------------|----------------------|
| MyShop | [MyShop_TestResults.md](../examples/MyShop/MyShop_TestResults.md) | Order creation, progress advancement, allocation payment |
| MyShop Advanced | [MerchantSystem](../examples/MyShop_Advanced/MyShop_Advanced_MerchantSystem_TestResults.md) + [OrderFlow](../examples/MyShop_Advanced/MyShop_Advanced_OrderFlow_TestResults.md) | Multi-path workflow, reward claims, dual-signature returns |
| Insurance | [Insurance_TestResults.md](../examples/Insurance/Insurance_TestResults.md) | Time-lock guard, sub-order creation |
| Travel | [Travel_TestResults.md](../examples/Travel/Travel_TestResults.md) | Weather-dependent guard, insurance sub-order integration |
| ThreeBody | [ThreeBody_Signature_TestResults.md](../examples/ThreeBody_Signature/ThreeBody_Signature_TestResults.md) | Buy guard verification, simple workflow

## Critical Rules

1. **Never skip the query phase** — always check what accounts, marks, and on-chain objects exist before building.
2. **Always use names, not raw addresses** — use `local_mark_operation` to create human-readable names for addresses. Mark every object immediately after creation.
3. **Build in strict phase order** — Permission first, then Guards, then Service scaffold, then sub-components, then the publish sequence. An object cannot reference an object that does not yet exist.
4. **Respect the publish sequence** — Machine(s) published FIRST, then Service sets Machine reference, then Service published LAST. This order is non-negotiable.
5. **Understand what locks on publish** — Machine nodes lock on Machine publish. Machine reference and Allocation lock on Service publish. Plan accordingly.
6. **Use `no_cache: true`** when querying an object you just created to avoid stale cache reads.
7. **Export and review before publishing** — use `guard2file` and `machineNode2file` to export definitions. Publishing is the point of no return for node definitions and structural settings.
8. **Verify Guard query targets** — if a Guard uses `query_type: "object"` targeting a Service or Machine, ensure that target object is created BEFORE the Guard.
9. **Always dry-run first** — call `onchain_operations` without `submission` to validate, then only execute with `submission` after user confirms the preview.

## Error Recovery

| Error | Cause | Fix |
|-------|-------|-----|
| "object not found" after creation | Cache stale read | Retry with `no_cache: true` |
| "permission denied" | Wrong account or missing perm | Check Permission config and sender account |
| Guard validation failure | Data doesn't match Guard rules | Review Guard table and submitted data |
| "dependency not found" | Wrong build order | Verify all referenced objects exist before the dependent object |
| "cannot modify after publish" | Attempting to change locked settings | Machine nodes, Machine reference, and Allocation are immutable after publish. Create new objects if changes are needed |
| Guard queries non-existent object | Guard created before its query target | Reorder: create the target object first, then the Guard |
