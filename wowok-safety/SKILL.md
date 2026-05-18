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

### 1.1 Security & Safety

- **Hot Wallet Usage**: WoWok never exposes private keys. Treat it as a spending account for transfers, receipts, and commerce. Flag large transactions for explicit user confirmation.
- **Amount-Sensitive Operations**: Any token transfer, payment, or reward distribution MUST be verbally confirmed with the user before execution. Use `Payment` objects for commercial transfers when possible (they offer Guard validation and purpose tracking).

### 1.2 LOCAL vs ON-CHAIN

| Type | Tools | Gas | Confirmation |
|------|-------|-----|--------------|
| **LOCAL ONLY** | `account_operation`, `local_mark_operation`, `local_info_operation` | None | Not needed |
| **ON-CHAIN** | `onchain_operations`, `messenger_operation` (some ops), `wip_file` (sign) | Yes | Required |
| **QUERY** | `query_toolkit`, `onchain_table_data`, `onchain_events`, `guard2file`, `machineNode2file` | Read-only | Not needed |
| **ENCRYPTED** | `messenger_operation` (watch/send messages) | Local encryption | Not needed |

### 1.3 Default Account

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
- Query token decimals first if unsure: `query_toolkit({ query_type: "token_list" })`.
- **Amounts in operations are ALWAYS submitted as U64 integers**. If the user specifies "2 WOW", do NOT submit the string "2 WOW". Instead, calculate and submit `2000000000` (2 × 10^9, where 9 is WOW's decimals).
- **Never assume token decimals**. If the token's decimals cannot be queried, HALT the amount submission and alert the user. Do not proceed with hardcoded or guessed precision.
- Show both raw and human-readable amounts when clarifying with users.


### 2.3 Publish Confirmation

Before publishing a Service or Machine:

1. **Export and review**: Use `guard2file` and `machineNode2file` to export definitions
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

### 4.2 Address Display Rules

When displaying an address (0x prefix + 64 hex characters) to the user:

1. **Query local mark first**:
   ```typescript
   query_toolkit({
     query_type: "local_mark_list",
     filter: { address: "0x<64_hex_chars>" }
   })
   ```

2. **Display format**:
   - If local mark exists: `{name} ({short_address})`
   - If no local mark: `{first8}...{last3}` (e.g., `0x3a2f8e1...8c1`)

3. **Short address format**: Include `0x` prefix, take first 8 chars + `...` + last 3 chars

---