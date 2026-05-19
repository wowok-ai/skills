---
name: wowok-build
description: |
  WoWok commercial service building — the canonical skill for constructing
  production-ready service marketplaces (Service + Machine + Guard + Allocators + Reward + Arbitration).
  
  This skill covers the complete 4-phase build process for commercial services.
  For individual tool usage and auxiliary objects (Demand, Treasury, Repository, Contact),
  see wowok-tools.
when_to_use:
  - User wants to create a commercial service/marketplace on WoWok
  - User wants to build a complete workflow system with order management
  - User wants to set up order allocation strategies (Allocators), incentive pools (Reward), or dispute resolution (Arbitration)
  - User mentions "build service", "create marketplace", "setup workflow", "revenue sharing", "order allocators"
---

# WoWok Commercial Service Building

Build production-ready service marketplaces on WoWok with proper dependency management.

> **Prerequisites**: Understand CREATE vs MODIFY pattern — use `schema_query({ action: "get", name: "onchain_operations" })`  
> **Auxiliary Objects**: Demand, Treasury, Repository, Contact — see [wowok-tools](../wowok-tools/SKILL.md)  
> **Guard Design**: See [wowok-guard](../wowok-guard/SKILL.md) | **Order Lifecycle**: See [wowok-order](../wowok-order/SKILL.md)

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
