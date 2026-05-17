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
