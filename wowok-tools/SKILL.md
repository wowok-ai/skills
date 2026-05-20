---
name: wowok-tools
description: |
  Definitive WoWok MCP tool usage reference — the authoritative fallback when
  MCP tool schemas are unavailable. Covers ALL 13 tools with complete parameter
  structures, operation types, query types, discriminated unions, and nested
  sub-field schemas. Prevents the most common AI failures: wrong tool selection,
  incorrect parameter formats, missing required fields, wrong discriminated
  union branches, and stale cache issues.

  Use this skill when:
  - AI needs to select or invoke any WoWok MCP tool
  - AI is unsure which tool fits a task
  - AI needs exact parameter format for a specific operation_type
  - AI encounters a tool error and needs troubleshooting
  - MCP tool schemas are not auto-available in the current environment
  - User asks "how do I..." for any WoWok operation
  - AI needs to verify parameter types before calling
when_to_use:
  - AI is about to call any WoWok MCP tool
  - AI is unsure which tool to use for a task
  - AI encounters a tool error and needs to debug
  - User asks "how do I..." for any WoWok operation
  - AI needs exact schema for a specific operation_type or query_type
always: true
---

# WoWok MCP Tool Usage Reference

## Quick Template (Copy This)

When calling `onchain_operations`, always use this structure:

```
{
  "operation_type": "<select from 16 types below>",
  "data": { /* see specific operation_type for details */ },
  "env": { "account": "", "network": "testnet" },
  "submission": { /* only when Guard requires user submission */ }
}
```

**Critical Rules:**
1. `operation_type` MUST be one of the 16 types listed below
2. `data` structure changes based on `operation_type` — see each operation's details
3. `submission` is ONLY needed when Guard validation requires user-provided data
4. Most operations return directly; only Guard-triggered flows need a second call with `submission`

---

## The 13 Tools

| # | Tool | Type | Description |
|---|------|------|-------------|
| 1 | `onchain_operations` | Write | All on-chain state changes (16 operation_types) |
| 2 | `query_toolkit` | Read | Local + on-chain data query (8 query_types) |
| 3 | `onchain_table_data` | Read | Dynamic field/table sub-item queries (12 query_types) |
| 4 | `account_operation` | Local | Wallet management — 100% local |
| 5 | `local_mark_operation` | Local | Name→address mappings — 100% local |
| 6 | `local_info_operation` | Local | Private data store — 100% local |
| 7 | `messenger_operation` | Hybrid | Encrypted messaging (local + on-chain) |
| 8 | `wip_file` | Hybrid | Witness promise files (generate/verify/sign) |
| 9 | `guard2file` | Read | Export Guard definition to local file |
| 10 | `machineNode2file` | Read | Export Machine nodes to local file |
| 11 | `onchain_events` | Read | Watch on-chain events (paginated) |
| 12 | `wowok_buildin_info` | Read | Protocol reference (constants/instructions) |
| 13 | `documents_and_learn` | Read | Documentation URLs |

---

## 1. onchain_operations — On-Chain State Changes

**MCP Input**: `{ operation_type: string, data: object, submission?: object, env?: object }`

### operation_type Discriminated Union (16 types)

The `operation_type` field determines WHICH `data` schema applies. Each type has a COMPLETELY different `data` structure.

#### service — Service Listing

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_service" })`

**Key Fields**:
- `object`: TypedPermissionObject — STRING for existing, OBJECT for new
- `description`: Service description
- `location`: Service location
- `sales`: Sales configuration with operations (add/set/remove/clear)
- `repositories`: Repository objects
- `rewards`: Reward objects
- `arbitrations`: Arbitration objects
- `machine`: Machine object ID or null
- `discount`: Discount configuration
- `discount_destroy`: Array of discount names to destroy
- `customer_required`: Required customer info fields
- `order_allocators`: Fund distribution rules
- `buy_guard`: Guard ID for purchase validation
- `change_guard`: Guard ID for order changes
- `pause`: Pause service flag
- `publish`: Publish service flag (LOCKS machine and order_allocators)
- `owner_receive`: Owner fund extraction
- `um`: Contact object ID for Messenger

**Key Rules**:
- `publish: true` LOCKS `machine` reference and `order_allocators` — unchangeable after publish
- `rewards` and `arbitrations` can be ADDED after publish, not removed
- `sales`, `discount`, `description`, `location` remain mutable after publish

#### machine — Workflow Template

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_machine" })`

**Key Fields**:
- `object`: WithPermissionObject — STRING for existing, OBJECT for new
- `progress_new`: Progress new schema
- `description`: Machine description
- `repository`: Repository objects
- `node`: Node field schema with operations (add/set/remove/clear/exchange/rename) OR file path
- `pause`: Pause flag
- `publish`: Publish flag (makes nodes IMMUTABLE)
- `owner_receive`: Owner fund extraction
- `um`: Contact object ID

**Key Rules**:
- `publish: true` makes node definitions IMMUTABLE
- Machine must be created BEFORE Service references it

#### progress — Workflow Advancement

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_progress" })`

**Key Fields**:
- `object`: Progress object ID
- `order`: Order ID
- `node`: Single node advancement
- `nodes`: Multi-step advancement array
- `admin_hold`: Admin hold flag
- `admin_unhold`: Admin unhold flag
- `admin_unhold_node`: Admin unhold node index
- `accept`: Accept flag
- `recipient_accept`: Recipient for acceptance
- `owner_receive`: Owner fund extraction
- `um`: Contact object ID

#### repository — Consensus Data

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_repository" })`

**Key Fields**:
- `object`: WithPermissionObject
- `description`: Repository description
- `entity`: Entity reference
- `submit`: Submit records operation
- `submit_and_sign`: Submit and sign records
- `verify`: Verify records
- `vote`: Vote on records
- `owner_receive`: Owner fund extraction
- `um`: Contact object ID

#### arbitration — Dispute Resolution

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_arbitration" })`

**Key Fields**:
- `object`: WithPermissionObject
- `description`: Arbitration description
- `entity`: Entity reference
- `arbitrators`: Arbitrators configuration
- `owner_receive`: Owner fund extraction
- `um`: Contact object ID

#### contact — IM Contact Profile

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_contact" })`

**Key Fields**:
- `object`: WithPermissionObject
- `my_status`: Status message
- `description`: Contact description
- `location`: Location
- `ims`: IM addresses with operations (add/set/remove/clear)
- `owner_receive`: Owner fund extraction

#### treasury — Team Fund

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_treasury" })`

**Key Fields**:
- `object`: TypedPermissionObject
- `description`: Treasury description
- `receive`: Received balance
- `deposit`: Deposit configuration
- `withdraw`: Withdraw configuration
- `external_deposit_guard`: External deposit guards
- `external_withdraw_guard`: External withdraw guards
- `owner_receive`: Owner fund extraction
- `um`: Contact object ID

#### reward — Incentive Pool

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_reward" })`

**Key Fields**:
- `object`: TypedPermissionObject
- `claim`: Guard ID for claim verification
- `description`: Reward description
- `coin_add`: Coin to add
- `receive`: Received balance
- `guard_add`: Guards for reward distribution
- `guard_remove_expired`: Remove expired guards flag
- `guard_expiration_time`: Guard expiration time
- `owner_receive`: Owner fund extraction
- `um`: Contact object ID

#### allocation — Auto-Distribution

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_allocation" })`

**Two Modes**:

**MODE 1: CREATE new Allocation**
- `object`: Object with name, tags, onChain, replaceExistName, type_parameter
- `allocators`: Allocator configuration
- `coin`: Coin parameter
- `payment_info`: Payment info

**MODE 2: OPERATE existing Allocation**
- `object`: Allocation ID or name (STRING)
- `received_coins`: Received balance
- `alloc_by_guard`: Guard for allocation

#### permission — Access Control

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_permission" })`

**Key Fields**:
- `object`: WithPermissionObject
- `description`: Permission description
- `policy_add`: Add policies
- `policy_remove`: Remove policies
- `policy_clear`: Clear all policies
- `owner_receive`: Owner fund extraction
- `um`: Contact object ID

#### guard — Programmable Validation

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_guard" })`

**Key Fields**:
- `namedNew`: Named object options
- `description`: Guard description
- `table`: Data table array with identifier, b_submission, value_type, value, name
- `root`: Computational tree — either inline node or file reference
  - `type: "node"`: Inline GuardNode
  - `type: "file"`: Load from file
- `rely`: Dependencies on other Guards

See [wowok-guard](../wowok-guard/SKILL.md) skill for complete GuardNode reference.

#### personal — On-Chain Public Identity

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_personal" })`

**Key Fields**:
- `description`: Personal description
- `referrer`: Referrer reference
- `information`: Information operations (add/remove/clear)
- `mark`: Mark operations (add/remove/clear/transfer/replace/destroy)

⚠️ CRITICAL: Everything in `personal` is PERMANENTLY PUBLIC on-chain.

#### payment — Irreversible Coin Transfer

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_payment" })`

**Key Fields**:
- `object`: Named object options
- `revenue`: Revenue recipients array
- `info`: Payment info (remark, index)

⚠️ CRITICAL: Payment is IRREVERSIBLE. Always confirm recipient, amount, and token type before executing.

#### demand — Service Request

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_demand" })`

**Key Fields**:
- `object`: WithPermissionObject
- `present`: Present configuration
- `description`: Demand description
- `location`: Location
- `rewards`: Reward objects
- `guards`: Guards configuration
- `feedback`: Feedback entries
- `owner_receive`: Owner fund extraction
- `um`: Contact object ID

#### order — Order Lifecycle

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_order" })`

**Key Fields**:
- `object`: Order ID or name
- `agents`: Agent addresses
- `required_info`: Required info field
- `progress`: Progress advancement
- `arb_confirm`: Arbitration confirmation
- `arb_objection`: Arbitration objection
- `arb_claim_compensation`: Claim compensation
- `receive`: Receive funds
- `transfer_to`: Transfer order to new owner

#### gen_passport — Immutable Credential

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_gen_passport" })`

**Key Fields**:
- `guard`: Guard ID(s) — single string or array of strings
- `info`: Submission call info

**Features:**
- **Single Guard**: Pass a single guard ID or name as a string
- **Multiple Guards**: Pass an array of guard IDs or names to verify multiple guards at once
- **Name Resolution**: Supports both guard addresses and LocalMark names

### Common Sub-Types

**TypedPermissionObject**: STRING (existing) or OBJECT `{ name, permission, tags?, onChain?, replaceExistName?, type_parameter? }`

**WithPermissionObject**: Same as TypedPermissionObject but WITHOUT `type_parameter`

**SubmissionCall** (for execution):
- `sender`: string
- `gas_budget`: string
- Additional network/execution params

**CoinParam**: `number` (raw) or `string` (e.g., "2WOW", "100USDT")

**NamedObject**: `{ name: string; tags?: string[]; onChain?: boolean; replaceExistName?: boolean }`

---

## 2. query_toolkit — Data Query

**MCP Input**: `{ query_type: string, ... }` — discriminated union

**Schema Reference**: `schema_query({ action: "get", name: "query_toolkit" })`

### 8 query_types

#### local_mark_list
- `query_type`: "local_mark_list"
- `network`: Optional network
- Returns: list of local name→address mappings

#### account_list
- `query_type`: "account_list"
- Returns: list of local accounts

#### local_info_list
- `query_type`: "local_info_list"
- `network`: Optional network
- Returns: local private data entries

#### token_list
- `query_type`: "token_list"
- `network`: Optional network
- Returns: available token types with precision info

#### account_balance
- `query_type`: "account_balance"
- `address`: Account address
- `token_type`: Optional token type
- `network`: Optional network
- Returns: account token balance

#### onchain_personal_profile
- `query_type`: "onchain_personal_profile"
- `address`: Account address
- `network`: Optional network
- `no_cache`: Optional flag
- Returns: on-chain public profile

#### onchain_objects
- `query_type`: "onchain_objects"
- `address`: Optional address
- `name_or_address`: Optional name or address
- `network`: Optional network
- `no_cache`: Optional flag
- Returns: on-chain objects owned by address

#### onchain_received
- `query_type`: "onchain_received"
- `name_or_address`: Name or address
- `all_type`: Optional boolean
- `cursor`: Optional cursor
- `limit`: Optional limit
- `no_cache`: Optional flag
- `network`: Optional network
- Returns: received CoinWrapper objects

---

## 3. onchain_table_data — Table Sub-Items

**MCP Input**: `{ query_type: string, parent: string, ... }` — 12 query_types

**Schema Reference**: `schema_query({ action: "get", name: "onchain_table_data" })`

| query_type | Parent | Key | Returns |
|------------|--------|-----|---------|
| `onchain_table` | any object | — (paginated cursor) | TableAnswer |
| `onchain_table_item_repository_data` | Repository | name + entity | entry record |
| `onchain_table_item_permission_perm` | Permission | address | perm entry |
| `onchain_table_item_entity_registrar` | Registrar | address | registrar record |
| `onchain_table_item_entity_linker` | Linker | entity + who | linker entry |
| `onchain_table_item_reward_record` | Reward | address | claim record |
| `onchain_table_item_demand_presenter` | Demand | address | presenter info |
| `onchain_table_item_treasury_history` | Treasury | address (payment) | history entry |
| `onchain_table_item_machine_node` | Machine | u64 (index) | node definition |
| `onchain_table_item_progress_history` | Progress | u64 (index) | history entry |
| `onchain_table_item_address_mark` | AddressMark | address | public mark |
| `onchain_table_item_generic` | any object | key_type + key_value | ObjectBase |

All support: `no_cache?: boolean`, `network?: "localnet" | "testnet"`

---

## 4. account_operation — LOCAL Wallet

**MCP Input**: `{ operation_type: string, data: object }`

**Schema Reference**: `schema_query({ action: "get", name: "account_operation" })`

Operations: `generate`, `suspend`, `resume`, `faucet`, `sign`, `signData`, `query`

100% LOCAL — never touches blockchain.

---

## 5. local_mark_operation — LOCAL Address Book

**MCP Input**: `{ operation_type: string, data: object }`

**Schema Reference**: `schema_query({ action: "get", name: "local_mark_operation" })`

Operations:
- `add`: Add marks with `{ marks: { name, address, tags? }[], network? }`
- `remove`: Remove marks with `{ marks: { name }[], network? }`
- `clear`: Clear all with `{ network? }`

---

## 6. local_info_operation — LOCAL Private Data

**MCP Input**: `{ operation_type: string, data: object }`

**Schema Reference**: `schema_query({ action: "get", name: "local_info_operation" })`

Store sensitive info (phone, address, contacts) locally.

---

## 7. messenger_operation — Encrypted Messaging

**MCP Input**: varies by operation

**Schema Reference**: `schema_query({ action: "get", name: "messenger_operation" })`

Operations: `watch_conversations`, `send_message`, `send_file`, `watch_messages`, `extract_zip_messages`, `generate_wts`, `verify_wts`, `sign_wts`, `wts2html`, `proof_message`, `mark_messages_as_viewed`, `mark_conversation_as_viewed`, `blacklist`, `friendslist`, `guardlist`, `settings`

See [wowok-messenger](../wowok-messenger/SKILL.md) skill for detailed usage.

---

## 8-13 Quick Reference

### wip_file

**Schema Reference**: `schema_query({ action: "get", name: "wip_file" })`

Operations: `generate`, `verify`, `sign`, `wip2html`

### guard2file

**Schema Reference**: `schema_query({ action: "get", name: "guard2file" })`

- `guard`: Guard ID or name
- `file_path`: Output file path
- `format`: "json" or "markdown"

### machineNode2file

**Schema Reference**: `schema_query({ action: "get", name: "machineNode2file" })`

- `machine`: Machine ID or name
- `file_path`: Output file path
- `format`: "json" or "markdown"

### onchain_events

**Schema Reference**: `schema_query({ action: "get", name: "onchain_events" })`

- `type`: Event type
- `cursor`: Optional cursor
- `limit`: Optional limit

### wowok_buildin_info

**Schema Reference**: `schema_query({ action: "get", name: "wowok_buildin_info" })`

- `info_type`: "constants", "permissions", "guard_instructions", "network", "value_types"

### documents_and_learn

**Schema Reference**: `schema_query({ action: "get", name: "documents_and_learn" })`

- `document_type`: Optional document type

---

## Tool Selection Decision Tree

```
User wants to...
├─ CREATE/MODIFY on-chain object → onchain_operations
│  ├─ operation_type = service | machine | permission | guard | ...
│  └─ data = { op: "create"|"update"|..., ... }
│
├─ QUERY data
│  ├─ Local accounts/marks/info/tokens → query_toolkit
│  ├─ On-chain objects/profile → query_toolkit (onchain_objects / onchain_personal_profile)
│  ├─ Account balance → query_toolkit (account_balance)
│  ├─ Table sub-items → onchain_table_data
│  ├─ Received payments → query_toolkit (onchain_received)
│  └─ On-chain events → onchain_events
│
├─ MANAGE local data
│  ├─ Accounts → account_operation
│  ├─ Address book → local_mark_operation
│  └─ Private info → local_info_operation
│
├─ COMMUNICATE → messenger_operation
├─ PROMISES (WIP) → wip_file
├─ EXPORT definitions → guard2file / machineNode2file
├─ LEARN protocol → wowok_buildin_info
└─ DOCUMENTATION → documents_and_learn
```

---

## Mandatory Patterns

### Query-First Pattern (ALWAYS before writes)

```
1. query_toolkit (account_list)      → Which accounts exist?
2. query_toolkit (local_mark_list)   → What named addresses exist?
3. query_toolkit (onchain_objects)   → What's already on-chain?
4. wowok_buildin_info                → Protocol constants/permissions
```

### Dry-Run Pattern (ALWAYS for writes)

```
1. Call onchain_operations WITHOUT submission → Validate + Preview
2. Show preview to user → Get explicit confirmation
3. Call onchain_operations WITH submission → Execute
```

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "object not found" | Cache stale | Add `no_cache: true` |
| "permission denied" | Wrong sender | Verify sender has permission |
| "unknown query_type" | Wrong tool | Check if table query → use `onchain_table_data` |
| "table field required" | Missing Guard table | Guards MUST have `table` array |
| "dependency not found" | Build order | Build dependencies before dependents |
| "invalid parameter" | Wrong format | Check discriminated union branch |
| submission parameter errors | Didn't check schema | Verify all submission fields |

---

## Schema Query Tool — Authoritative Schema Source

Use the `schema_query` MCP tool to retrieve complete JSON schemas for any WoWok tool or operation. This is the **authoritative source** — returns schemas directly from the MCP server with all properties, types, and descriptions.

### Usage Examples

**List all available schemas:**
```
schema_query({ action: "list" })
```

**Get a specific tool schema:**
```
schema_query({ action: "get", name: "onchain_operations" })
schema_query({ action: "get", name: "onchain_operations_service" })
schema_query({ action: "get", name: "query_toolkit" })
```

**Search schemas by keyword:**
```
schema_query({ action: "search", query: "guard" })
```

**List all on-chain operation types:**
```
schema_query({ action: "list_operations" })
```

### Available Schema Names

**Main Tools:** `onchain_operations`, `query_toolkit`, `onchain_table_data`, `onchain_events`, `account_operation`, `local_mark_operation`, `local_info_operation`, `messenger_operation`, `wip_file`, `guard2file`, `machineNode2file`, `wowok_buildin_info`, `schema_query`

**Individual Operations:** `onchain_operations_service`, `onchain_operations_machine`, `onchain_operations_order`, `onchain_operations_progress`, `onchain_operations_guard`, `onchain_operations_permission`, `onchain_operations_arbitration`, `onchain_operations_repository`, `onchain_operations_contact`, `onchain_operations_treasury`, `onchain_operations_reward`, `onchain_operations_allocation`, `onchain_operations_personal`, `onchain_operations_payment`, `onchain_operations_demand`, `onchain_operations_gen_passport`

**When to use**: Always call `schema_query` before using complex tools like `onchain_operations` — the discriminated unions have 16 branches with 5-6 levels of nesting, and one wrong field name causes immediate failure. Use `action: "get"` with the specific operation name (e.g., `onchain_operations_service`) when you need the complete structure for a single operation type.
