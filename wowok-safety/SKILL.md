---
name: wowok-safety
description: |
  WoWok operational safety and best practices — ensures AI follows correct
  conventions for security, transaction confirmation, object building workflow,
  and common mistake prevention.

  This skill is AUTOMATICALLY triggered before any on-chain operation.
when_to_use:
  - AI is about to execute an on-chain write operation
  - AI is about to transfer funds or modify financial parameters
  - AI is about to publish a Service or Machine
  - AI is building multiple interdependent objects
  - User mentions "confirm", "approve", "safe", "warning", "best practice"
always: true
---

# WoWok Safety & Best Practices

## 1. Core Principles

### 1.1 Object Reuse Principle (General Best Practice)

**ALWAYS prefer reusing existing objects over creating new ones** — this enables centralized permission control and reduces management overhead.

| Object Type | Reuse Strategy | Why |
|-------------|----------------|-----|
| **Permission** | **Strongly recommended** — ask user for existing Permission name/ID | Centralized permission control across all services |
| Machine | Reuse if workflow fits | Save design time for similar processes |
| Guards | Reuse if validation logic matches | Avoid redundant rules |
| Contact | Reuse existing customer service Contact | Single point of management |
| Arbitration | Always reuse existing Arbitration services | Customers choose from established arbiters |

**How to Reuse**:
- Ask user: *"Do you have an existing object you'd like to reuse? Provide the name or ID."*
- Use string value `"<name_or_id>"` to reference existing objects
- Use object shape `{ name?, ... }` only when creating new

**CREATE vs MODIFY Pattern** (SDK-enforced, not Move-level):
| Format | Meaning | Use When |
|--------|---------|----------|
| String `"<name>"` or `"<0x...>"` | **REUSE** existing | Object already exists |
| Object `{ name?, ... }` | **CREATE** new | Need new object |

The SDK resolves names to addresses via `GetObjectExisted()` — a string that fails resolution triggers a hard error. An object shape always creates.

### 1.2 Security & Safety

- **Hot Wallet Usage**: WoWok never exposes private keys. Treat it as a spending account for transfers, receipts, and commerce. Flag large transactions for explicit user confirmation.
- **Amount-Sensitive Operations**: Any token transfer, payment, or reward distribution MUST be verbally confirmed with the user before execution. Use `Payment` objects for commercial transfers when possible (they offer Guard validation and purpose tracking).

### 1.3 LOCAL vs ON-CHAIN

| Type | Tools | Gas | Confirmation |
|------|-------|-----|--------------|
| **LOCAL ONLY** | `account_operation`, `local_mark_operation`, `local_info_operation` | None | Not needed |
| **ON-CHAIN** | `onchain_operations`, `messenger_operation` (some ops), `wip_file` (sign) | Yes | Required |
| **QUERY** | `query_toolkit`, `onchain_table_data`, `onchain_events`, `guard2file`, `machineNode2file` | Read-only | Not needed |
| **ENCRYPTED** | `messenger_operation` (watch/send messages) | Local encryption | Not needed |

### 1.4 Default Account

Empty string `""` means the default account. Always use `""` when the user does not specify an account.

---

## 2. Transaction Confirmation Protocol

**Core rule**: NEVER execute an on-chain write without explicit user confirmation.

### 2.1 Confirmation Template

```
📋 **Operation Preview**

| Field | Value |
|-------|-------|
| Operation | {operation_type} — {op} |
| Object | {object_name} |
| Network | {network} |
| Account | {account} |

⚠️ **This will {describe_what_will_happen}**

Proceed with execution?
```

### 2.2 Amount Verification

- Always display amounts with token symbol (e.g., "10 WOW" not "10000000000").
- Query token decimals first if unsure.

**Tool**: `query_toolkit` with `query_type: "token_list"`.

- **Amounts in operations are ALWAYS submitted as U64 integers**. If the user specifies "2 WOW", do NOT submit the string "2 WOW". Instead, calculate and submit `2000000000` (2 × 10^9, where 9 is WOW's decimals).
- **Never assume token decimals**. If the token's decimals cannot be queried, HALT the amount submission and alert the user. Do not proceed with hardcoded or guessed precision.
- Show both raw and human-readable amounts when clarifying with users.

### 2.3 Publish Confirmation

Before publishing a Service or Machine:

1. **Export and review**:
   - Use `guard2file` to export Guard definitions
   - Use `machineNode2file` to export Machine nodes

2. **Verify logic**: Confirm Guards and Machine nodes match user intent

3. **Warn about immutability**: Once published, many fields become locked

```
⚠️ PUBLISH CONFIRMATION REQUIRED

You are about to publish:
- {Service|Machine}: {name}
- This will make it publicly accessible on-chain
- After publish: {list what becomes immutable}

This action cannot be easily undone. Proceed?
```

---

## 3. Common Mistakes to Avoid

| Mistake | Why It Happens | Prevention |
|---------|---------------|------------|
| **Forgetting no_cache** | Cache lag in dependency chain | Set `env.no_cache: true` on all operations when building multiple objects |
| **Missing permission indices** | Machine forwards reference non-existent indices | Verify Permission object has required indices before creating Machine |

---

## 4. Naming Conventions

When users request complex systems without naming, propose this scheme:

```
<projectPrefix>_<type>_<purpose>_<version>
```

| Part | Example | Purpose |
|------|---------|---------|
| Project prefix | `shopFunny_` | Prevents cross-project collisions |
| Type prefix | `machine_`, `guard_`, `service_` | Clarifies object type |
| Purpose suffix | `serviceWithdraw` | Describes function |
| Version suffix | `_v2` | Enables iteration |

- Always provide `tags` on object creation for filtering and management
- Use short address form (`0x1234...def`); use names as primary identifiers

### 4.1 `replaceExistName` Flag

Controls name collision behavior:

| Value | Effect |
|-------|--------|
| `false` (default) | Throws error if name is in use — safe default |
| `true` | Steals name from existing object; old object becomes unnamed |

- Use `true` during development to reuse fixed names without cleanup
- Default to `false` in production to prevent accidental name hijacking
- Prefer versioned names (`_v1`, `_v2`) over `replaceExistName` for production

---

## 5. Network & Token Defaults

| Parameter | Default Value | Notes |
|-----------|---------------|-------|
| Network | `testnet` | Override via `env.network` |
| Token | `0x2::wow::WOW` | 9 decimals (1 WOW = 1_000_000_000) |

### 5.1 Multi-Token Support & Amount Formats

- **Multi-Token**: All operations support custom `token_type`. ALWAYS query precision via `query_toolkit` with `query_type: "token_list"` first. Never assume decimals.
- **Amount Formats**:
  - With unit: `"2WOW"`, `"10.5USDT"` — auto-converted using token precision.
  - Plain number: internal unit (e.g., `1000000000` = 1 WOW). Always clarify with users when displaying plain numbers.
- **U64 integers**: Amounts in operations are ALWAYS submitted as U64 integers. If the user specifies "2 WOW", do NOT submit the string "2 WOW" — calculate and submit `2000000000` (2 × 10^9).
- **Never assume token decimals**: If the token's decimals cannot be queried, HALT the amount submission and alert the user.

### 5.2 Payment Objects for Commercial Transfers

Use `Payment` objects for commercial transfers when possible — they offer Guard validation and purpose tracking beyond a simple `account_operation (transfer)`.

---

## 6. Query-First Pattern

- **Query before mutate**: Always query current state before modifications.

**Tool**: `query_toolkit` with appropriate filters.

- **Pagination**: All on-chain list queries (events, tables, received) support `cursor`/`limit`. Loop for large datasets.
- **Cache control**: Use `no_cache: true` for time-sensitive reads.

---

## 7. Error Patterns

| Error | Likely Cause |
|-------|-------------|
| Guard validation failure | After re-submitting with `submission`, Guard logic evaluated to false. Review Guard's rule tree via `guard2file` and submitted data values. |
| File parsing failure | `machineNode2file` or `guard2file` output format error. Check file format and schema compliance. |
| Cache stale reads | Sequential operations fail unexpectedly (e.g., "object not found" when just created). Retry with `env.no_cache: true`. |
| Permission denied | Operating account lacks the required Permission index. Check the object's Permission configuration. |

---

## 8. Testing & Validation Workflow

1. **Design Phase**: Use `wowok_buildin_info` to discover available permissions, Guard instructions, and value types

**Tool**: `wowok_buildin_info` with `info: "built-in permissions"`, `info: "guard instructions"`, or `info: "value types"`.

### 8.1 Value Types — Built-in Type Annotation System

WoWok's value type system is the foundation for type-safe data declarations used across Guards, records, and query instructions. Every data field in a Guard table or Guard submission carries a `value_type` annotation, ensuring the protocol can validate and process data correctly.

**When value types matter:**
- Defining Guard table columns: each Identifier in a Guard's `table` block requires a `value_type`
- Submitting data to Guards: `GuardSubmission` entries must match their declared `value_type`
- Reading Guard exports: `guard2file` output shows `value_type` for every Identifier
- Designing query instructions: both parameters and return values carry `value_type` annotations

- **String format is recommended** (e.g., `"U64"`, `"Address"`, `"VecString"`) for readability in Guard tables and submissions.
- Numeric codes (0–18) are accepted but obscure — prefer string names in all user-facing contexts.
- `Value` (19) is a protocol-internal type for dynamic value handling. It must **never** be used directly in user-defined Guards or submissions.
**Available value types** (queried via `wowok_buildin_info` with `info: "value types"`)

2. **Export & Review**: Before publishing, use `guard2file` and `machineNode2file` to export and review definitions

3. **Incremental Testing**: Build objects step-by-step, verifying each step

4. **Final Validation**: Test all Guard conditions and Machine transitions before publishing

5. **Publish**: Only after thorough testing, publish Service and Machine

---

## 9. Incremental Object Building

For complex objects with many fields (Service, Machine), use **incremental building** instead of creating everything in one call:

- Each step can be verified before proceeding
- Errors are isolated to specific fields
- Easier to retry failed steps without re-executing successful ones
- Better user feedback at each stage

---

## Schema Reference

| Purpose | Schema Name |
|---------|-------------|
| Query toolkit | `query_toolkit` |
| Token list | `query_toolkit` with `query_type: "token_list"` |
| Guard export | `guard2file` |
| Machine export | `machineNode2file` |
| Build-in info | `wowok_buildin_info` |
| Built-in permissions | `wowok_buildin_info` with `info: "built-in permissions"` |
| Guard instructions | `wowok_buildin_info` with `info: "guard instructions"` |
| Value types | `wowok_buildin_info` with `info: "value types"` |

**Query Schema**: `schema_query({ action: "get", name: "<schema_name>" })`

**Related Skills**: [wowok-tools](../wowok-tools/SKILL.md) | [wowok-guard](../wowok-guard/SKILL.md) | [wowok-machine](../wowok-machine/SKILL.md) | [wowok-order](../wowok-order/SKILL.md) | [wowok-provider](../wowok-provider/SKILL.md) | [wowok-arbitrator](../wowok-arbitrator/SKILL.md) | [wowok-messenger](../wowok-messenger/SKILL.md)

---

## Appendices (Progressive Disclosure)

> The following sections have been extracted to [APPENDIX.md](./APPENDIX.md) for on-demand loading:
> - Dialogue Scripts (R1-R10) — guided conversation scripts
> - Decision Trees — branching logic reference
> - Failure Playbooks — recovery scenarios
> - Tier Layering — expertise-tier based guidance
>
> Load APPENDIX.md when the user needs guided dialogue, recovery help, or tier-specific guidance.
