---
name: wowok-tools
description: |
  WoWok MCP tool usage mastery — the definitive guide to using WoWok's 13 MCP
  tools correctly. Prevents the most common AI tool usage failures: wrong tool
  selection, incorrect parameter formats, missing required fields, and
  misunderstanding tool capabilities.
  
  Use this skill whenever the AI needs to select or use any WoWok MCP tool.
  This is the "tool instruction manual" that bridges user intent and correct
  tool invocation.
when_to_use:
  - AI is about to call any WoWok MCP tool
  - AI is unsure which tool to use for a task
  - AI encounters a tool error and needs to debug
  - User asks "how do I..." for any WoWok operation
  - AI needs to understand tool capabilities and limitations
---

# WoWok MCP Tool Usage Mastery

## Tool Inventory (13 Tools)

### 1. `onchain_operations` — ⛓️ The Main Tool
**Purpose**: All on-chain state changes (create, update, delete, publish objects)
**Operation Types**: service, machine, progress, repository, arbitration, contact, treasury, reward, allocation, permission, guard, personal, payment, demand, order, gen_passport

**Key Pattern**:
```
{
  operation_type: "<type>",     // WHICH object type
  data: { op: "<action>", ... }, // WHAT to do
  submission?: {                 // HOW to pay (optional for dry run)
    sender: "<account>",
    gas_budget: "<amount>"
  }
}
```

**CRITICAL**: Always dry-run FIRST (without `submission`), then execute with `submission` after user confirms.

### 2. `query_toolkit` — 🔍 Data Query
**Purpose**: Read data (local + on-chain)
**Query Types**: local_mark_list, account_list, local_info_list, token_list, account_balance, onchain_personal_profile, onchain_objects, onchain_received

**When to use**:
- Before any operation: query accounts (`account_list`) and marks (`local_mark_list`)
- To resolve names→addresses: `local_mark_list`
- To inspect objects: `onchain_objects`
- To check balances: `account_balance`

### 3. `onchain_table_data` — 📊 Table/Sub-item Query
**Purpose**: Query dynamic fields and sub-items of on-chain objects
**Query Types**: onchain_table (paginated), 11 specific item types + generic

**When to use**:
- To explore all sub-items of an object: `onchain_table`
- To query Repository records: `onchain_table_item_repository_data`
- To query Permission entries: `onchain_table_item_permission_perm`
- To query Reward claims: `onchain_table_item_reward_record`
- To query Machine nodes: `onchain_table_item_machine_node`
- To query Progress history: `onchain_table_item_progress_history`
- To query Treasury history: `onchain_table_item_treasury_history`
- To query Entity registration: `onchain_table_item_entity_registrar`
- To query Entity votes: `onchain_table_item_entity_linker`

### 4. `account_operation` — 🔒 LOCAL Wallet
**Purpose**: Manage local accounts (generate, suspend, resume, faucet, sign)
**100% LOCAL** — never touches the blockchain

### 5. `local_mark_operation` — 🔒 LOCAL Address Book
**Purpose**: Create human-readable name→address mappings
**100% LOCAL** — stored only on this device

**Key Pattern**:
```
{ op: "add", data: [{ name: "my_service", address: "0x...", tags: ["service"] }] }
```

### 6. `local_info_operation` — 🔒 LOCAL Private Data
**Purpose**: Store sensitive info (delivery addresses, phone, contacts)
**100% LOCAL** — never leaves the device

### 7. `messenger_operation` — 💬 Encrypted Messaging
**Purpose**: End-to-end encrypted communication
**Operations**: watch_conversations, send_message, send_file, watch_messages, extract_zip_messages, generate_wts, verify_wts, sign_wts, wts2html, proof_message, blacklist, friendslist, guardlist, settings, mark_messages_as_viewed, mark_conversation_as_viewed

### 8. `wip_file` — 🤝 Witness Information Promise
**Purpose**: Create/verify/sign WIP files (markdown + images → signed promise)
**Operations**: generate, verify, sign, wip2html

### 9. `guard2file` — 📄 Export Guard
**Purpose**: Export a Guard's definition from chain to local JSON/Markdown file
**Use for**: Reviewing Guard logic, creating new Guards based on existing ones

### 10. `machineNode2file` — ⚙️ Export Machine Nodes
**Purpose**: Export Machine node definitions from chain to local file
**Use for**: Reviewing workflow definitions, creating new Machines

### 11. `onchain_events` — 📅 Event Watching
**Purpose**: Watch on-chain events (arbitration, new orders, progress, demands, entity registrations)
**Supports**: Pagination via cursor

### 12. `wowok_buildin_info` — ℹ️ Protocol Reference
**Purpose**: Query built-in protocol information
**Info Types**: constants, permissions, guard_instructions, network, value_types

**ALWAYS query before building**:
- `guard_instructions` before designing a Guard
- `permissions` before creating a Permission
- `value_types` before defining Guard table fields

### 13. `documents_and_learn` — 📚 Documentation
**Purpose**: Access WoWok documentation URLs
**Use for**: Pointing users to official docs for deeper learning

## Tool Selection Decision Tree

```
User wants to...
├─ CREATE something on-chain → onchain_operations
├─ READ/QUERY data
│  ├─ Local data (accounts, marks, info, tokens) → query_toolkit
│  ├─ On-chain objects → query_toolkit (onchain_objects)
│  ├─ On-chain table/sub-items → onchain_table_data
│  ├─ Account balance → query_toolkit (account_balance)
│  └─ Events → onchain_events
├─ MANAGE local data
│  ├─ Accounts → account_operation
│  ├─ Address book → local_mark_operation
│  └─ Private info → local_info_operation
├─ COMMUNICATE → messenger_operation
├─ CREATE/VERIFY promises → wip_file
├─ EXPORT definitions → guard2file / machineNode2file
├─ LEARN about protocol → wowok_buildin_info
└─ READ documentation → documents_and_learn
```

## Common Parameter Pitfalls

### Pitfall 1: Wrapping Parameters in `description`
```
❌ WRONG: { description: '{ "operation_type": "service", ... }' }
✅ RIGHT: { operation_type: "service", data: { op: "create", ... } }
```
The tool auto-detects and fixes this, but it adds latency. Always use flat parameters.

### Pitfall 2: Using Raw Addresses Instead of Names
```
❌ WRONG: "0xabc123def456..."
✅ RIGHT: "my_service" (after creating a local mark)
```
Always create local marks for objects you'll reference frequently.

### Pitfall 3: Forgetting `no_cache` After Creation
```
❌ WRONG: Query immediately after creation → stale cache → "not found"
✅ RIGHT: Add no_cache: true when querying freshly created objects
```

### Pitfall 4: Missing `submission` for Execution
```
❌ WRONG: Calling onchain_operations without submission → dry run only, no state change
✅ RIGHT: Add submission: { sender: "account", gas_budget: "10000000" } to execute
```

### Pitfall 5: Wrong `query_type` for Table Data
```
❌ WRONG: Using onchain_table for a specific Repository record
✅ RIGHT: Use onchain_table_item_repository_data with parent + name + entity
```

### Pitfall 6: Entity Queries Without System Addresses
```
❌ WRONG: Using a user address for entity_registrar/entity_linker queries
✅ RIGHT: Use ENTITY_LINKER_ADDRESS (0xaaa) or ENTITY_REGISTRAR_ADDRESS (0xaab)
```

## The Query-First Pattern (ALWAYS Follow)

Before ANY on-chain operation:
```
1. query_toolkit (account_list)     → Know available accounts
2. query_toolkit (local_mark_list)  → Know named addresses
3. query_toolkit (onchain_objects)  → Know existing on-chain objects
4. wowok_buildin_info               → Know protocol constants/permissions
```

## The Dry-Run Pattern (ALWAYS Follow for Writes)

```
1. Call onchain_operations WITHOUT submission → Validate + Preview
2. Show preview to user → Get confirmation
3. Call onchain_operations WITH submission → Execute
```

## Error Recovery Quick Reference

| Error Pattern | Likely Cause | Fix |
|--------------|-------------|-----|
| "object not found" | Cache stale | Add `no_cache: true` |
| "permission denied" | Wrong sender | Check account permissions |
| "invalid parameter" | Wrong format | Check schema, remove wrapping |
| "dependency not found" | Wrong order | Build dependencies first |
| "guard validation failed" | Data mismatch | Review Guard table vs submitted data |
| "unknown query_type" | Wrong tool | Check if you need onchain_table_data instead |
| "table field required" | Missing Guard table | Guards MUST have a table array |
