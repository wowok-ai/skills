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

```typescript
// operation_type: "service"
data: {
  object: TypedPermissionObject;  // STRING for existing, OBJECT {name, permission, tags, type_parameter} for new
  description?: string;
  location?: string;
  sales?: {
    op: "add" | "set";
    sales: { name: string; price: number; stock: number; suspension: boolean; wip: string; wip_hash: string }[];
  } | { op: "remove"; sales_name: string[] } | { op: "clear" };
  repositories?: ObjectsOp;
  rewards?: ObjectsOp;
  arbitrations?: ObjectsOp;
  machine?: string | null;
  discount?: { name: string; discount_type: 0 | 1; discount_value: number; benchmark?: number; time_ms_start?: number; time_ms_end?: number; count?: number; recipient: ManyAccountOrMark_Address; transferable?: boolean };
  discount_destroy?: string[];
  customer_required?: string[];
  order_allocators?: { description: string; threshold: number; allocators: { guard: string; sharing: { who: Recipient; sharing: number; mode: "Amount" | "Rate" | "Surplus" }[]; fix?: number; max?: number }[] } | null;
  buy_guard?: string | null;
  change_guard?: string | null;
  pause?: boolean;
  publish?: boolean;
  owner_receive?: ReceivedObjectsOrRecently;
  um?: string | null;
}
```

Key rules:
- `publish: true` LOCKS `machine` reference and `order_allocators` — unchangeable after publish
- `rewards` and `arbitrations` can be ADDED after publish, not removed
- `sales`, `discount`, `description`, `location` remain mutable after publish

#### machine — Workflow Template

```typescript
// operation_type: "machine"
data: {
  object: WithPermissionObject;  // STRING for existing, OBJECT for new
  progress_new?: ProgressNewSchema;
  description?: string;
  repository?: ObjectsSchema;
  node?: NodeFieldSchema;  // { op: "add"|"set"|"remove"|"clear"|"exchange"|"rename", nodes: [...], bReplace?: boolean } OR { json_or_markdown_file: "path" }
  pause?: boolean;
  publish?: boolean;
  owner_receive?: ReceivedObjectsOrRecently;
  um?: string | null;
}
```

Key rules:
- `publish: true` makes node definitions IMMUTABLE
- `node` supports incremental ops (add/set/remove/clear/exchange/rename/remove_prior_node/add_forward/remove_forward) OR complete replacement from file
- Machine must be created BEFORE Service references it

#### progress — Workflow Advancement

```typescript
// operation_type: "progress"
data: {
  object: NameOrAddress;  // Progress object ID
  order: NameOrAddress;

  // Advance mode
  node?: { name: string; forward: number | string; hold?: boolean };
  nodes?: { name: string; forward: number | string; hold?: boolean }[];  // Multi-step advance

  // Admin control
  admin_hold?: boolean;
  admin_unhold?: boolean;
  admin_unhold_node?: number;

  // Acceptance
  accept?: boolean;
  recipient_accept?: NameOrAddress;

  owner_receive?: ReceivedObjectsOrRecently;
  um?: string | null;
}
```

#### repository — Consensus Data

```typescript
// operation_type: "repository"
data: {
  object: WithPermissionObject;
  description?: string;
  entity?: string | NameOrAddress | null;

  // Submit records
  submit?: { op: "add" | "set" | "remove" | "clear"; records?: { address?: string; record: { timestamp: number; identifier: number; name?: string; description?: string; link?: string; linkPrototype?: string }; sign_buf?: number[]; sign_key_type?: string }[]; names?: string[] };
  // Submit & sign records
  submit_and_sign?: { op: "add" | "set" | "remove" | ...; records?: { ...; sign_buf?: number[] }[]; names?: string[] };
  // Verify records
  verify?: { records: { name: string }[]; verify_for_self?: boolean };
  // Vote on records
  vote?: { op: "add"; records?: { name: string; entity?: string }[] };

  owner_receive?: ReceivedObjectsOrRecently;
  um?: string | null;
}
```

#### arbitration — Dispute Resolution

```typescript
// operation_type: "arbitration"
data: {
  object: WithPermissionObject;
  description?: string;
  entity?: string | NameOrAddress | null;

  // Arbitrators
  arbitrators?: { op: "add" | "set" | "remove" | "clear"; accounts?: ManyAccountOrMark_Address[]; accounts_remove?: string[] };

  owner_receive?: ReceivedObjectsOrRecently;
  um?: string | null;
}
```

#### contact — IM Contact Profile

```typescript
// operation_type: "contact"
data: {
  object: WithPermissionObject;
  my_status?: string;
  description?: string;
  location?: string;

  ims?: { op: "add" | "set"; im: { at: string; description?: string }[] }
      | { op: "remove"; im: string[] }
      | { op: "clear" };

  owner_receive?: ReceivedObjectsOrRecently;
}
```

#### treasury — Team Fund

```typescript
// operation_type: "treasury"
data: {
  object: TypedPermissionObject;
  description?: string;
  receive?: ReceivedBalanceOrRecently;

  deposit?: { coin: CoinParam; by_external_deposit_guard?: string; payment_info: { remark?: string; index?: number }; namedNewPayment?: NamedObject };
  withdraw?: { amount: { fixed: number } | { by_external_withdraw_guard: string }; recipient: AccountOrMark_Address; payment_info: { remark?: string; index?: number }; namedNewPayment?: NamedObject };

  external_deposit_guard?: { op: "add" | "set"; guards: { guard: string; identifier?: number | null; store_from_id?: number | null }[] }
                          | { op: "remove"; guards: string[] }
                          | { op: "clear" };
  external_withdraw_guard?: { op: "add" | "set"; guards: { guard: string; identifier?: number | null; store_from_id?: number | null }[] }
                           | { op: "remove"; guards: string[] }
                           | { op: "clear" };

  owner_receive?: ReceivedObjectsOrRecently;
  um?: string | null;
}
```

#### reward — Incentive Pool

```typescript
// operation_type: "reward"
data: {
  object: TypedPermissionObject;
  claim?: string;  // Guard ID — verify and trigger reward
  description?: string;
  coin_add?: CoinParam;
  receive?: ReceivedBalanceOrRecently;

  guard_add?: { guard: string; recipient: Recipient; amount: { type: "GuardU64Identifier"; value: number } | { type: "Fixed"; value: number }; expiration_time?: number; store_from_id?: number | null }[];
  guard_remove_expired?: boolean;
  guard_expiration_time?: number | null;

  owner_receive?: ReceivedObjectsOrRecently;
  um?: string | null;
}
```

#### allocation — Auto-Distribution

ALLOCATION HAS TWO MODES discriminated by object format:

```typescript
// MODE 1: CREATE new Allocation
data: {
  object: { name?: string; tags?: string[]; onChain?: boolean; replaceExistName?: boolean; type_parameter?: string };
  allocators: { description: string; threshold: number; allocators: { guard: string; sharing: { who: Recipient; sharing: number; mode: "Amount" | "Rate" | "Surplus" }[]; fix?: number; max?: number | null }[] };
  coin: CoinParam;
  payment_info: { remark?: string; index?: number };
}

// MODE 2: OPERATE existing Allocation
data: {
  object: string;  // Allocation ID or name
  received_coins?: ReceivedBalanceOrRecently;
  alloc_by_guard?: string;
}
```

#### permission — Access Control

```typescript
// operation_type: "permission"
data: {
  object: WithPermissionObject;
  description?: string;

  // Write Guard policies
  policy_add?: { who: AccountOrMark_Address; guard: string; store_from_id?: number | null }[];
  policy_remove?: { who: AccountOrMark_Address }[];
  policy_clear?: boolean;

  owner_receive?: ReceivedObjectsOrRecently;
  um?: string | null;
}
```

#### guard — Programmable Validation

```typescript
// operation_type: "guard"
data: {
  namedNew?: NamedObject;
  description?: string;

  table?: { identifier: number; b_submission: boolean; value_type: ValueType; value?: SupportedValue; name?: string }[];

  root: { type: "node"; node: GuardNode } | { type: "file"; file_path: string; format?: "json" | "markdown" };

  rely?: { guards: string[]; logic_or?: boolean };
}
```

GuardNode types (70+ variants, see wowok-guard skill for complete reference):
- Logic: `logic_and`, `logic_or`, `logic_not`, `logic_equal`, `logic_string_contains`, `logic_string_nocase_contains`, `logic_string_nocase_equal`, `logic_as_u256_equal`, `logic_as_u256_greater`, `logic_as_u256_lesser`, `logic_as_u256_greater_or_equal`, `logic_as_u256_lesser_or_equal`
- Arithmetic: `calc_number_add`, `calc_number_subtract`, `calc_number_multiply`, `calc_number_divide`, `calc_number_mod`, `calc_string_length`, `calc_string_contains`, `calc_string_nocase_contains`, `calc_string_nocase_equal`, `calc_string_indexof`, `calc_string_nocase_indexof`
- Conversion: `convert_number_address`, `convert_address_number`, `convert_number_string`, `convert_string_number`, `convert_safe_u8`..`convert_safe_u256`
- Vector: `vec_length`, `vec_contains_bool`, `vec_contains_address`, `vec_contains_string`, `vec_contains_string_nocase`, `vec_contains_number`, `vec_indexof_bool`, `vec_indexof_address`, `vec_indexof_string`, `vec_indexof_string_nocase`, `vec_indexof_number`
- Records: `record_check_recipient_order`, `record_check_recipient_progress`, `record_check_recipient_reward`, `record_check_treasury_history_item`, `record_check_progress_history_item`, and more
- Special: `query`, `identifier`, `value_type`

#### personal — On-Chain Public Identity

```typescript
// operation_type: "personal"
data: {
  description?: string;
  referrer?: string | AccountOrMark_Address | null;

  information?: { op: "add"; data: { name: string; value_type: ValueType; value: SupportedValue }[] }
              | { op: "remove"; name: string[] }
              | { op: "clear" };

  mark?: { op: "add"; data: { address: string; name?: string; tags?: string[] }[] }
       | { op: "remove"; data: { address: string; tags?: string[] }[] }
       | { op: "clear"; address: ManyAccountOrMark_Address }
       | { op: "transfer"; to: AccountOrMark_Address }
       | { op: "replace"; new_mark_object: string }
       | { op: "destroy" };
}
```

⚠️ CRITICAL: Everything in `personal` is PERMANENTLY PUBLIC on-chain.

#### payment — Irreversible Coin Transfer

```typescript
// operation_type: "payment"
data: {
  object: { name?: string; tags?: string[]; onChain?: boolean; replaceExistName?: boolean; type_parameter?: string };
  revenue: { recipient: AccountOrMark_Address; amount: CoinParam }[];
  info: { remark?: string; index?: number };
}
```

⚠️ CRITICAL: Payment is IRREVERSIBLE. Always confirm recipient, amount, and token type before executing.

#### demand — Service Request

```typescript
// operation_type: "demand"
data: {
  object: WithPermissionObject;
  present?: { recommend: string; by_guard?: string; service?: string };
  description?: string;
  location?: string;
  rewards?: ObjectsOp;

  guards?: { op: "add" | "set"; guard: { guard: string; service_identifier?: number | null }[] }
         | { op: "remove"; guard: string[] }
         | { op: "clear" };

  feedback?: { who: AccountOrMark_Address; acceptance_score?: number; feedback?: string }[];
  owner_receive?: ReceivedObjectsOrRecently;
  um?: string | null;
}
```

#### order — Order Lifecycle

```typescript
// operation_type: "order"
data: {
  object: string | NameOrAddress;  // Order ID or name (required)

  agents?: ManyAccountOrMark_Address;
  required_info?: string | null;

  progress?: { operation: { next_node_name: string; forward: string }; hold?: boolean; adminUnhold?: boolean; message?: string };

  arb_confirm?: { arb: string; confirm: boolean; description?: string; proposition?: string[] };
  arb_objection?: { arb: string; objection: string };
  arb_claim_compensation?: { arb: string };

  receive?: QueryReceivedResult;
  transfer_to?: AccountOrMark_Address;
}
```

#### gen_passport — Immutable Credential

```typescript
// operation_type: "gen_passport"
data: {
  guard: string | string[];  // Guard object ID(s) to verify. Can be a single guard or an array of guards.
  info?: SubmissionCall;
}
```

**Features:**
- **Single Guard**: Pass a single guard ID or name as a string
- **Multiple Guards**: Pass an array of guard IDs or names to verify multiple guards at once
- **Name Resolution**: Supports both guard addresses and LocalMark names

### Common Sub-Types

**TypedPermissionObject**: STRING (existing) or OBJECT `{ name, permission, tags?, onChain?, replaceExistName?, type_parameter? }`

**WithPermissionObject**: Same as TypedPermissionObject but WITHOUT `type_parameter`

**SubmissionCall** (for execution):
```typescript
{
  sender: string;
  gas_budget: string;
  // additional network/execution params
}
```

**CoinParam**: `number` (raw) or `string` (e.g., "2WOW", "100USDT")
**NamedObject**: `{ name: string; tags?: string[]; onChain?: boolean; replaceExistName?: boolean }`

---

## 2. query_toolkit — Data Query

**MCP Input**: `{ query_type: string, ... }` — discriminated union

### 8 query_types

#### local_mark_list
```typescript
{ query_type: "local_mark_list"; network?: string }
```
Returns: list of local name→address mappings

#### account_list
```typescript
{ query_type: "account_list" }
```
Returns: list of local accounts

#### local_info_list
```typescript
{ query_type: "local_info_list"; network?: string }
```
Returns: local private data entries

#### token_list
```typescript
{ query_type: "token_list"; network?: string }
```
Returns: available token types with precision info

#### account_balance
```typescript
{ query_type: "account_balance"; address: string; token_type?: string; network?: string }
```
Returns: account token balance

#### onchain_personal_profile
```typescript
{ query_type: "onchain_personal_profile"; address: string; network?: string; no_cache?: boolean }
```
Returns: on-chain public profile

#### onchain_objects
```typescript
{ query_type: "onchain_objects"; address?: string; name_or_address?: string; network?: string; no_cache?: boolean }
```
Returns: on-chain objects owned by address

#### onchain_received
```typescript
{ query_type: "onchain_received"; name_or_address: string | AccountOrMark_Address; all_type?: boolean; cursor?: string | null; limit?: number | null; no_cache?: boolean; network?: string }
```
Returns: received CoinWrapper objects

---

## 3. onchain_table_data — Table Sub-Items

**MCP Input**: `{ query_type: string, parent: string, ... }` — 12 query_types

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

Operations: `generate`, `suspend`, `resume`, `faucet`, `sign`, `signData`, `query`

100% LOCAL — never touches blockchain.

---

## 5. local_mark_operation — LOCAL Address Book

**MCP Input**: `{ operation_type: string, data: object }`

```typescript
// Add marks
{ operation_type: "add", data: { marks: { name: string; address: string; tags?: string[] }[], network?: string } }

// Remove marks
{ operation_type: "remove", data: { marks: { name: string }[]; network?: string } }

// Clear all
{ operation_type: "clear", data: { network?: string } }
```

---

## 6. local_info_operation — LOCAL Private Data

**MCP Input**: `{ operation_type: string, data: object }`

Store sensitive info (phone, address, contacts) locally.

---

## 7. messenger_operation — Encrypted Messaging

**MCP Input**: varies by operation

Operations: `watch_conversations`, `send_message`, `send_file`, `watch_messages`, `extract_zip_messages`, `generate_wts`, `verify_wts`, `sign_wts`, `wts2html`, `proof_message`, `mark_messages_as_viewed`, `mark_conversation_as_viewed`, `blacklist`, `friendslist`, `guardlist`, `settings`

---

## 8-13 Quick Reference

- **wip_file**: `{ operation: "generate"|"verify"|"sign"|"wip2html", data: object }`
- **guard2file**: `{ guard: string; file_path: string; format?: "json"|"markdown" }`
- **machineNode2file**: `{ machine: string; file_path: string; format?: "json"|"markdown" }`
- **onchain_events**: `{ type: string; cursor?: string | null; limit?: number | null }`
- **wowok_buildin_info**: `{ info_type: "constants"|"permissions"|"guard_instructions"|"network"|"value_types" }`
- **documents_and_learn**: `{ document_type?: string }`

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

## Bundled Schema Reference

When MCP tool schemas are unavailable or ambiguous, consult the complete schema files bundled with this package. Each file contains the full discriminated union, all nested sub-fields, and exact type definitions.

| Tool | Schema File | Contents |
|------|-----------|----------|
| `onchain_operations` | [schemas/onchain_operations/](../schemas/onchain_operations/) | 16 types split by operation_type. [_index.md](../schemas/onchain_operations/_index.md) for lookup, Value Types, and principles; [_common.md](../schemas/onchain_operations/_common.md) for shared schemas (CallEnv, SubmissionCall, Recipient, etc.) |
| `query_toolkit` | [schemas/schema-query_toolkit.md](../schemas/schema-query_toolkit.md) | 8 query_types, pagination params, filter structures |
| `onchain_table_data` | [schemas/schema-onchain_table_data.md](../schemas/schema-onchain_table_data.md) | 12 query_types, parent/key structures, result schemas |
| `onchain_events` | [schemas/schema-onchain_events.md](../schemas/schema-onchain_events.md) | Event query types, pagination |
| `account_operation` | [schemas/schema-account_operation.md](../schemas/schema-account_operation.md) | Local wallet operations (generate, sign, faucet, etc.) |
| `local_mark_operation` | [schemas/schema-local_mark_operation.md](../schemas/schema-local_mark_operation.md) | Address book mark operations |
| `local_info_operation` | [schemas/schema-local_info_operation.md](../schemas/schema-local_info_operation.md) | Private local data operations |
| `messenger_operation` | [schemas/schema-messenger_operation.md](../schemas/schema-messenger_operation.md) | Encrypted messaging operations |
| `wip_file` | [schemas/schema-wip_file.md](../schemas/schema-wip_file.md) | Witness promise file operations |
| `guard2file` | [schemas/schema-guard2file.md](../schemas/schema-guard2file.md) | Guard export to file |
| `machineNode2file` | [schemas/schema-machineNode2file.md](../schemas/schema-machineNode2file.md) | Machine nodes export to file |
| `wowok_buildin_info` | [schemas/schema-wowok_buildin_info.md](../schemas/schema-wowok_buildin_info.md) | Protocol constants, permissions, guard instructions |

**When to use**: Always verify the schema before calling complex tools like `onchain_operations` — the discriminated union has 16 branches with 5-6 levels of nesting, and one wrong field name causes immediate failure.