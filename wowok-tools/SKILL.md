---
name: wowok-tools
description: |
  WoWok MCP tool reference — the fallback when schemas are unavailable.
  Covers 13 tools with usage patterns, common pitfalls, and troubleshooting.
  
  Core value: prevent common AI failures (wrong tool selection, incorrect
  parameter formats, missing required fields, wrong discriminated unions).
when_to_use:
  - AI needs to select or invoke any WoWok MCP tool
  - AI encounters tool errors and needs debugging
  - MCP tool schemas are not auto-available
  - User asks "how do I..." for any WoWok operation
always: true
---

# WoWok MCP Tool Reference

Quick reference for WoWok MCP tools — patterns, pitfalls, and troubleshooting.

> **Domain Skills**: [wowok-guard](../wowok-guard/SKILL.md) (validation logic), [wowok-messenger](../wowok-messenger/SKILL.md) (encrypted messaging), [wowok-machine](../wowok-machine/SKILL.md) (workflows)
> **Business Skills**: [wowok-order](../wowok-order/SKILL.md) (customer), [wowok-provider](../wowok-provider/SKILL.md) (merchant), [wowok-arbitrator](../wowok-arbitrator/SKILL.md) (dispute resolution)

---

## Core Patterns

### Standard Structure

```json
{
  "operation_type": "<one of 16 types>",
  "data": { /* type-specific */ },
  "env": { "account": "", "network": "testnet" },
  "submission": { /* Guard submission if needed */ }
}
```

**Exceptions** (no `data` wrapper):
- `gen_passport`: `{ guard, info?, env? }`
- `guard`, `payment`, `personal`: flat structure

### CREATE vs MODIFY Pattern

| Format | Meaning | Example |
|--------|---------|---------|
| **String** | Reference EXISTING | `"my-service"` or `"0x1234..."` |
| **Object** | CREATE NEW | `{ name: "my-service", permission: "..." }` |

---

## The 13 Tools

| Tool | Purpose | Key Pattern |
|------|---------|-------------|
| `onchain_operations` | Write state (16 types) | Discriminated by `operation_type` |
| `query_toolkit` | Read on-chain data | 8 query types |
| `onchain_table_data` | Query sub-items | Dynamic field access |
| `account_operation` | Wallet management | 100% local |
| `local_mark_operation` | Name→address mappings | 100% local |
| `local_info_operation` | Private data store | 100% local |
| `messenger_operation` | Encrypted messaging | Hybrid (see messenger skill) |
| `wip_file` | Witness promise files | Generate/verify/sign |
| `guard2file` | Export Guard definition | Read-only |
| `machineNode2file` | Export Machine nodes | Read-only |
| `onchain_events` | Watch events | Paginated |
| `wowok_buildin_info` | Protocol constants | Reference data |
| `documents_and_learn` | Documentation URLs | Learning resources |

---

## Critical Patterns by Operation

### service — Business Listing

**Immutable After Publish**: `machine`, `order_allocators`
**Mutable Always**: `sales`, `discount`, `description`, `location`
**Add-Only After Publish**: `rewards`, `arbitrations`

**Common Pitfall**: Forgetting `publish: true` leaves machine/allocators changeable — risky for production.

### machine — Workflow Template

**Key Insight**: Machine defines WHO can advance (via `namedOperator`). Empty string = Order-operable; non-empty = requires Permission.

**Publish Effect**: Makes nodes immutable. Essential before Service references it.

### progress — Advancement

**Dual Paths**:
- `node`: Single step
- `nodes`: Multi-step array

**Guard Integration**: Forward transitions may require Guard validation — see [wowok-machine](../wowok-machine/SKILL.md).

### guard — Immutable Validation

**CRITICAL**: Guards are CREATE-ONLY. No modification after deployment.

**Update Strategy**: `guard2file` → modify locally → create new Guard → update all references.

See [wowok-guard](../wowok-guard/SKILL.md) for complete GuardNode reference and design patterns.

### order — Customer Operations

**Key Distinction**: Order is builder-owned; agents can operate but **CANNOT withdraw**.

**Arbitration Flow**: `arb_confirm` → `arb_objection` → `arb_claim_compensation` (all via Order)

See [wowok-order](../wowok-order/SKILL.md) for customer-side arbitration operations.

### gen_passport — Credential Generation

**Single or Multiple**: One Guard (string) or multiple Guards (array)

**Use Case**: Off-chain permission verification, voting eligibility, access control.

---

## Common Pitfalls

### 1. Wrong Discriminated Union Branch

**Symptom**: "Invalid data structure" errors
**Cause**: Using `service` schema for `order` operation
**Fix**: Match `operation_type` exactly to schema

### 2. CREATE vs MODIFY Confusion

**Symptom**: Creates duplicate objects instead of modifying
**Cause**: Passing object shape when string reference intended
**Fix**: String = existing, Object = new

### 3. Missing submission Field

**Symptom**: Guard validation fails with "missing submission"
**Cause**: Guard requires user data but `submission` omitted
**Fix**: Add `submission: { sender, info }` after first call fails

### 4. Immutable Field After Publish

**Symptom**: "Cannot modify published field" error
**Cause**: Attempting to change `machine` or `order_allocators` after `publish: true`
**Fix**: Create new Service with corrected fields

### 5. Wrong Tool Selection

| Task | Wrong Tool | Correct Tool |
|------|-----------|--------------|
| Query object state | `onchain_operations` | `query_toolkit` |
| Send message | `onchain_operations` | `messenger_operation` |
| Check name availability | `query_toolkit` | `local_mark_operation` |
| Export Guard logic | `query_toolkit` | `guard2file` |

---

## Troubleshooting Guide

### "Schema not found"

**Action**: `schema_query({ action: "get", name: "<tool_name>" })`

### "Invalid parameter format"

**Checklist**:
1. Correct `operation_type`?
2. CREATE vs MODIFY format correct?
3. Required fields present?
4. `submission` needed for Guard?

### "Permission denied"

**Causes**:
- Not object owner
- Missing Permission reference
- Guard validation failed

### Tool-Specific Errors

| Error | Likely Cause | Solution |
|-------|-------------|----------|
| "Object not found" | Wrong address or not created | Verify with `query_toolkit` |
| "Name already exists" | `replaceExistName: false` | Set `replaceExistName: true` or choose new name |
| "Guard validation failed" | Missing/incorrect `submission` | Add proper `submission` field |
| "Insufficient balance" | Account lacks funds | Check with `account_operation` |
| "Deadline passed" | Timestamp in past | Use future timestamp |

---

## Schema Access

```javascript
// Get any tool schema
schema_query({ action: "get", name: "onchain_operations" })
schema_query({ action: "get", name: "query_toolkit" })
schema_query({ action: "get", name: "messenger_operation" })
// ... etc for all 13 tools
```

---

## Design Principles

1. **Immutability First**: Guards, published Machines — design carefully, no updates
2. **Explicit Over Implicit**: Always specify `operation_type`, never rely on defaults
3. **Validate Before Execute**: Use `query_toolkit` to check state before operations
4. **Local for Private**: Sensitive data → `local_info_operation`, never on-chain
5. **Schema as Source**: When in doubt, query schema — don't guess parameter formats

---

## Quick Decision Tree

```
Need to change on-chain state?
├── YES → onchain_operations
│   └── Which type? (service, machine, order, guard, etc.)
├── NO, just query → query_toolkit
│   └── Object state or table data?
├── NO, communicate → messenger_operation
├── NO, manage wallet → account_operation
└── NO, export definition → guard2file / machineNode2file
```
