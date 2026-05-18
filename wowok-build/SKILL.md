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
  - User wants to set up order splitting (Allocators), incentive pools (Reward), or dispute resolution (Arbitration)
  - User mentions "build service", "create marketplace", "setup workflow", "revenue sharing"
---

# WoWok Commercial Service Building

Build production-ready service marketplaces on WoWok with proper dependency management.

> **Prerequisites**: Understand CREATE vs MODIFY pattern in [_common.md](../docs/skills/onchain_operations/_common.md)  
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
  1. Permission — [permission.md](../docs/skills/onchain_operations/permission.md)
  2. Service — [service.md](../docs/skills/onchain_operations/service.md) — CREATE only, DO NOT publish
  3. Machine — [machine.md](../docs/skills/onchain_operations/machine.md) — CREATE and define ALL nodes, DO NOT publish

PHASE 2 — Trust Layer
  4. Guards — [guard.md](../docs/skills/onchain_operations/guard.md) — validate Reward claims, Allocators conditions, Machine node transitions, etc. Create all guards needed.

PHASE 3 — Sub-Components
  5. Allocators — [service.md](../docs/skills/onchain_operations/service.md) — CREATE rules, MODIFY Service.order_allocators to bind
  6. Reward — [reward.md](../docs/skills/onchain_operations/reward.md) — CREATE/MODIFY incentive pools
  7. Arbitration — [arbitration.md](../docs/skills/onchain_operations/arbitration.md) — CREATE/MODIFY dispute resolution

PHASE 4 — Publication
  8. Publish Machine — nodes become IMMUTABLE
  9. Bind Machine to Service — MODIFY Service.machine
  10. Publish Service — Machine & Allocators LOCKED
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

**Schema**: [query_toolkit](../docs/skills/schema-query_toolkit.md) | [wowok_buildin_info](../docs/skills/schema-wowok_buildin_info.md)

---

## Key Operations Reference

### CREATE vs MODIFY

See [_common.md](../docs/skills/onchain_operations/_common.md) for the unified pattern:
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

**Schemas**: [machineNode2file](../docs/skills/schema-machineNode2file.md) | [guard2file](../docs/skills/schema-guard2file.md)

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

**Common Types**: [_common.md](../docs/skills/onchain_operations/_common.md) — `TypedPermissionObject`, `WithPermissionObject`, `CallEnv`, `SubmissionCall`

**Operations** (CREATE & MODIFY): [service](../docs/skills/onchain_operations/service.md) | [machine](../docs/skills/onchain_operations/machine.md) | [permission](../docs/skills/onchain_operations/permission.md) | [repository](../docs/skills/onchain_operations/repository.md) | [treasury](../docs/skills/onchain_operations/treasury.md) | [demand](../docs/skills/onchain_operations/demand.md) | [contact](../docs/skills/onchain_operations/contact.md) | [reward](../docs/skills/onchain_operations/reward.md) | [arbitration](../docs/skills/onchain_operations/arbitration.md)

**CREATE-only**: [guard](../docs/skills/onchain_operations/guard.md) (immutable) | [payment](../docs/skills/onchain_operations/payment.md)

**MODIFY-only**: [order](../docs/skills/onchain_operations/order.md) | [progress](../docs/skills/onchain_operations/progress.md) | [personal](../docs/skills/onchain_operations/personal.md)

**Tools**: [query_toolkit](../docs/skills/schema-query_toolkit.md) | [guard2file](../docs/skills/schema-guard2file.md) | [machineNode2file](../docs/skills/schema-machineNode2file.md) | [all_tools](../wowok-tools/SKILL.md)
