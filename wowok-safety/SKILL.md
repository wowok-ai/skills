---
name: wowok-safety
description: |
  WoWok safety and authorization protocol — ensures AI always obtains user
  confirmation before executing irreversible on-chain operations. Covers
  amount verification, publish confirmation, critical operation warnings,
  and the mandatory two-phase submission pattern.
  
  This skill is AUTOMATICALLY triggered before any on-chain write operation.
  It ensures the AI never executes transactions without explicit user approval.
when_to_use:
  - AI is about to execute an onchain_operations call with submission
  - AI is about to publish a Service or Machine
  - AI is about to transfer funds or modify financial parameters
  - AI is about to delete or irreversibly modify on-chain objects
  - User mentions "confirm", "approve", "safe", "warning"
always: true
---

# WoWok Safety & Authorization Protocol

## Core Safety Principle

**NEVER execute an on-chain write without explicit user confirmation.**

WoWok operations involve real blockchain transactions with real economic consequences. The AI MUST always:
1. Preview what will happen (dry run)
2. Present the preview clearly to the user
3. Wait for explicit confirmation
4. Only then execute

## Mandatory Two-Phase Pattern

### Phase 1: Dry Run (ALWAYS first)

```
onchain_operations({
  operation_type: "<type>",
  data: { op: "<action>", ... }
  // NO submission field → dry run only
})
```

The dry run validates parameters, checks permissions, and returns a preview of what will happen. **No state is changed.**

### Phase 2: Execute (ONLY after user confirms)

```
onchain_operations({
  operation_type: "<type>",
  data: { op: "<action>", ... },
  submission: {
    sender: "<account_name>",
    gas_budget: "<amount>"
  }
})
```

## Critical Operations Requiring Extra Confirmation

### 🔴 HIGH RISK: Financial Operations

These operations involve real token transfers and MUST be double-confirmed:

| Operation | Risk | Extra Confirmation Required |
|-----------|------|---------------------------|
| `payment` (send coins) | Direct fund transfer | ✅ Show amount, recipient, token type |
| `treasury` (deposit/withdraw) | Team fund changes | ✅ Show amount, operation type |
| `reward` (create/modify) | Incentive pool changes | ✅ Show reward rules, amounts |
| `allocation` (create/modify) | Auto-distribution rules | ✅ Show split percentages, recipients |
| `order` (create/confirm) | Order with payment | ✅ Show price, service, parties |

### 🟡 MEDIUM RISK: Structural Operations

These modify system structure and should be confirmed:

| Operation | Risk | Confirmation Required |
|-----------|------|----------------------|
| `service` (publish) | Makes service public | ✅ Confirm publish intent |
| `machine` (publish) | Makes workflow public | ✅ Confirm publish intent |
| `guard` (create/modify) | Changes validation rules | ✅ Show Guard logic summary |
| `permission` (modify) | Changes access control | ✅ Show permission changes |

### 🟢 LOW RISK: Read-Only Operations

These are always safe and need no confirmation:
- All `query_toolkit` operations
- All `onchain_table_data` operations
- `wowok_buildin_info`
- `documents_and_learn`
- `guard2file`, `machineNode2file` (export only)

## Confirmation Template

When presenting a dry-run result for confirmation, ALWAYS use this format:

```
📋 **Operation Preview**

| Field | Value |
|-------|-------|
| Operation | {operation_type} — {op} |
| Object | {object_name} |
| Network | {network} |
| Gas Budget | {estimated_gas} |

⚠️ **This will {describe_what_will_happen}**

Proceed with execution?
```

## Amount Verification Rules

When an operation involves token amounts:

1. **Always display the amount with token symbol** (not just raw number)
2. **Query token decimals first** if unsure about precision
   ```
   query_toolkit({ query_type: "token_list" })
   ```
3. **Show both the raw amount and the human-readable amount**
4. **For allocations**: Show each recipient's percentage and estimated amount
5. **For rewards**: Show total pool size and distribution rules

## Publish Confirmation

Publishing a Service or Machine makes it publicly accessible. Before publishing:

1. **Verify all Guards are correct** — export with `guard2file` and review
2. **Verify all Machine nodes** — export with `machineNode2file` and review
3. **Test with dry runs** — simulate operations against the unpublished objects
4. **Confirm the publish intent** — publishing is irreversible in practice

```
⚠️ PUBLISH CONFIRMATION REQUIRED

You are about to publish:
- Service: {name} ({id})
- This will make it publicly accessible on-chain
- Guard rules: {summary}
- Machine workflow: {summary} (if applicable)

This action cannot be easily undone. Proceed?
```

## Account Safety

- **Never create accounts without user request** — `account_operation` with `op: "generate"`
- **Never share private keys or sensitive data** — these are local-only
- **Always confirm which account is being used** as the sender for transactions
- **Check account balance** before operations that require gas

## What the AI MUST Do

1. ✅ Always dry-run first, show preview
2. ✅ Always get explicit confirmation before executing
3. ✅ Always show amounts with token symbols
4. ✅ Always warn before publishing
5. ✅ Always confirm the sender account
6. ✅ Always check for sufficient gas balance

## What the AI MUST NOT Do

1. ❌ Never execute on-chain writes without user confirmation
2. ❌ Never skip the dry-run phase
3. ❌ Never hide or obscure financial amounts
4. ❌ Never publish without explicit user request
5. ❌ Never use a different account than what the user specified
6. ❌ Never proceed if the dry run shows errors

## Real-World Safety Patterns (from tested examples)

### Pattern 1: Dry-Run Before Every Structural Change

**From [Insurance](../examples/Insurance/Insurance.md), [Travel](../examples/Travel/Travel.md), [MyShop Advanced](../examples/MyShop_Advanced/MyShop_Advanced.md)**

Every structural operation in the tested examples follows this exact two-phase pattern:

```
// Phase 1: Validate (no submission → no state change)
onchain_operations({
  operation_type: "<type>",
  data: { ... },
  env: { account: "<name>", network: "testnet" }
})
→ Review the returned preview. Check: object IDs, guard logic, amounts.

// Phase 2: Execute (only after user confirms)
onchain_operations({
  operation_type: "<type>",
  data: { ... },
  env: { account: "<name>", network: "testnet" },
  submission: { sender: "<name>", gas_budget: "10000000" }
})
```

### Pattern 2: Guard Logic Verification Before Deployment

**From [Insurance](../examples/Insurance/Insurance.md) — Time-Lock Guard**

Before deploying a Guard that controls fund release (Payment, Allocation, Reward), ALWAYS:

1. Export the Guard for human review:
   ```
   guard2file({ guard: "insurance_complete_guard_v1", file_path: "./guard_review.json", format: "json" })
   ```
2. Test the Guard logic with `gen_passport`:
   ```
   onchain_operations({
     operation_type: "gen_passport",
     data: { guard: "insurance_complete_guard_v1" },
     info: { name: "guard_test", b_submission: true }
   })
   ```
   This submits runtime values to the Guard and returns pass/fail — without any state change.

**From [Travel](../examples/Travel/Travel.md) — Weather Check Guard**

The Travel example demonstrates guard testing with specific runtime values:
- The Guard queries `weather_repo_v2` for a given date
- Test with `gen_passport`, submitting a timestamp that maps to "sunny" → should pass
- Test with a timestamp that maps to "rainy" → should fail
- This validates the Guard BEFORE it protects real funds in an Allocation

**From [MyShop Advanced](../examples/MyShop_Advanced/MyShop_Advanced.md) — Service Guard Testing**

Service-level Guards (`service_merchant_win_v2`, `service_customer_win_v2`) control fund allocation. Before binding these to `order_allocators`:
1. Export each Guard with `guard2file`
2. Test with `gen_passport`, submitting mock order progress data
3. Verify: correct node → pass, wrong node → fail
4. Only then bind to Service's `order_allocators`

### Pattern 3: Publish-Immutability Checklist

**From [MyShop Advanced](../examples/MyShop_Advanced/MyShop_Advanced.md) — Build Order Rationale**

Before any publish operation, verify this checklist:

```
PUBLISH CHECKLIST
├─ Machine publish:
│  ├─ ✅ All nodes defined and reviewed (machineNode2file)
│  ├─ ✅ All forward guards created and tested (gen_passport)
│  ├─ ✅ Permission indexes assigned to correct accounts
│  └─ ⚠️  After publish: nodes become IMMUTABLE
│
├─ Service publish:
│  ├─ ✅ Machine bound to Service (machine field set)
│  ├─ ✅ Allocation rules finalized (order_allocators)
│  ├─ ✅ Sales/products defined (sales)
│  ├─ ✅ Guards tested (buy_guard, sell_guard)
│  └─ ⚠️  After publish: machine + allocation LOCKED
│
└─ Reward (post-publish):
   └─ ✅ Can be added after Service publish (not locked)
```

### Pattern 4: Multi-Provider Coordination Safety

**From [Travel](../examples/Travel/Travel.md) — Two-Provider System**

When building a system that spans multiple accounts/providers:

1. **Each provider uses their own account** for operations on their own objects
   - `weather_provider_v1` creates and manages `weather_repo_v2`
   - `travel_provider_v1` creates and manages `travel_service_v1`

2. **Cross-provider references use names, not raw addresses**
   - The weather check Guard references `"weather_repo_v2"` by name
   - The MCP server resolves names to addresses automatically

3. **Data providers build their objects BEFORE consumers**
   - Weather Repository + data exists before the Guard that queries it
   - Insurance Service exists before Travel creates sub-orders on it

### Pattern 5: Amount Verification for Financial Operations

**From all examples — Payment, Order, Allocation operations**

All financial operations in the tested examples follow these conventions:

| Operation | Amount Format | Verification |
|-----------|--------------|-------------|
| `service.sales[].price` | Raw integer (smallest unit) | Verify with: `wowok_buildin_info({ info_type: "token_list" })` |
| `order.buy.total_pay.balance` | Raw integer | Confirm matches sales price × quantity |
| `reward.coin_add` | Raw integer | Confirm pool size against expected payouts |
| `allocation.sharing[].sharing` | Integer (Rate mode: basis points) | 10000 = 100%, 500 = 5% |

**From [Insurance](../examples/Insurance/Insurance.md):**
```
sales: [{ name: "Outdoor Accident Insurance", price: 100000000, stock: 1000 }]
// 100000000 = 1 WOW (if 1 WOW = 10^8 smallest units)
```

**From [MyShop Advanced](../examples/MyShop_Advanced/MyShop_Advanced.md):**
```
order_allocators.allocators[].sharing: { sharing: 10000, mode: "Rate" }
// 10000 in Rate mode = 100% allocation
```

### Pattern 6: no_cache After Creation

**From [MyShop Advanced Test Results](../examples/MyShop_Advanced/MyShop_Advanced_MerchantSystem_TestResults.md)**

When querying an object immediately after creating it, always use `no_cache: true`:

```
// After creating a Permission:
onchain_operations({ operation_type: "permission", data: { object: { name: "myshop_permission_v2", ... } }, env: { ... } })

// Query it — must bypass cache:
query_toolkit({ query_type: "onchain_objects", objects: ["myshop_permission_v2"], no_cache: true })
```

Without `no_cache: true`, the query may return stale data (object not found), causing the AI to incorrectly conclude the creation failed.

### Pattern 7: replaceExistName for Development Iterations

**From all examples — object naming convention**

During development, when iterating on object designs, use `replaceExistName: true` to overwrite previous versions:

```
data: {
  object: { name: "myshop_permission_v2", replaceExistName: true, ... }
}
```

⚠️ **Safety note**: `replaceExistName: true` destroys the previous object with that name. Only use during development. In production, use versioned names (`_v1`, `_v2`, `_v3`).

### Pattern 8: Machine Creation Order — Nodes First, Then Publish

**From [Insurance](../examples/Insurance/Insurance.md) — Key Discovery**

The Insurance example documents a critical finding: Machine nodes must be added during creation (same transaction) before publishing. Adding nodes in separate transactions after creation may not persist correctly.

✅ **Correct** (single transaction):
```
onchain_operations({
  operation_type: "machine",
  data: {
    object: { name: "insurance_machine_v1", permission: "..." },
    node: { op: "add", nodes: [...] },  // nodes in same call
    publish: true                        // publish in same call
  }
})
```

❌ **Incorrect** (separate transactions):
```
// Step 1: Create machine (no nodes)
onchain_operations({ operation_type: "machine", data: { object: {...} } })
// Step 2: Add nodes (may not persist)
onchain_operations({ operation_type: "machine", data: { object: "...", node: { op: "add", nodes: [...] } } })
// Step 3: Publish
onchain_operations({ operation_type: "machine", data: { object: "...", publish: true } })
```

## Safety Decision Tree for On-Chain Operations

```
About to execute onchain_operations?
├─ Is this a READ operation? (query_toolkit, onchain_table_data, etc.)
│  └─ ✅ SAFE — proceed without confirmation
│
├─ Is this a WRITE operation? (onchain_operations with submission)
│  ├─ Does it involve money? (payment, reward, treasury, allocation)
│  │  └─ 🔴 HIGH RISK — must show amounts + token type + recipient + get double confirmation
│  │
│  ├─ Does it publish something? (service.publish, machine.publish)
│  │  └─ 🟡 MEDIUM RISK — must show what will be locked + get confirmation
│  │
│  ├─ Does it modify guards/permissions? (guard, permission)
│  │  └─ 🟡 MEDIUM RISK — must explain what access changes + get confirmation
│  │
│  └─ Is it a structural change? (service.update, machine.node)
│     └─ 🟢 LOW-MEDIUM — show what changes + get confirmation
│
└─ Is this a DRY RUN? (no submission field)
   └─ ✅ SAFE — no state change, but still review the preview for errors
```
