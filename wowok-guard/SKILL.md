---
name: wowok-guard
description: |
  WoWok Guard design mastery — comprehensive reference for the recursive,
  strongly-typed GuardNode computational tree (70+ node types). Covers all
  logic, arithmetic, conversion, vector, record-check, and special node types
  with correct type names as defined in the MCP SDK source. Guards are immutable
  once created — get the design right the first time.

  Use this skill for ANY Guard creation, modification, or troubleshooting.
  Guards are the most complex WoWok component; incorrect node types cause
  immediate runtime failures.
when_to_use:
  - User wants to create or modify a Guard
  - User asks about Guard logic, validation rules, trust rules
  - User encounters Guard validation errors
  - User mentions "guard", "validation", "trust rules", "verify", "condition"
always: false
---

# WoWok Guard Design Reference

## Core Concept

A Guard is a **recursive computational tree** that evaluates to a boolean result. It's an on-chain validator — once created, it's IMMUTABLE. Every operation protected by a Guard must pass its validation for the operation to succeed.

## Guard Structure

**Operation**: `onchain_operations` with `operation_type: "guard"`.

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_guard" })`

**Key Fields**:
- `namedNew`: Object creation options (name, tags, onChain, replaceExistName)
- `description`: Guard description
- `table`: Data table defining what the Guard validates
  - `identifier`: 0-255, unique within this Guard
  - `b_submission`: Must user submit this value?
  - `value_type`: Expected type (0-18, see ValueType enum)
  - `value`: Default value (if b_submission = false)
  - `name`: Human-readable field name
- `root`: The computational tree
  - `type: "node"`: Inline node definition
  - `type: "file"`: Load from JSON/Markdown file
- `rely`: Dependencies on other Guards
  - `guards`: Array of Guard IDs or names
  - `logic_or`: OR (true) vs AND (false/default)

**CRITICAL**: The Guard's `table` defines ALL data the Guard uses — both submitted values and values passed from the calling object. Every `identifier` node in the tree references a table entry.

---

## GuardNode — The Computational Tree

The GuardNode is a discriminated union with 70+ type variants. Every node has a `type` field.

### Leaf Nodes (No Children)

#### identifier — Read from Guard Table

**Type**: `identifier`

**Key Field**:
- `identifier`: Guard table index (0-255)

Returns the value at the specified Guard table index.

#### value_type — Get ValueType of Child

**Type**: `value_type`

**Key Field**:
- `node`: Child GuardNode

Returns U8: the ValueType identifier of the child node's result.

---

### Query Node — Fetch On-Chain Data

**Type**: `query`

**Key Fields**:
- `query`: Query instruction ID (number) or name (string)
- `object`: Target object specification
  - `identifier`: Guard table index for target object
  - `convert_witness`: Optional witness conversion ID
- `parameters`: Array of GuardNode parameters for the query

Fetches data from on-chain WoWok objects. The `query` field references a built-in query instruction.

**Discover Available Queries**:

**Tool**: `wowok_buildin_info` with `info_type: "guard_instructions"`.

**System Addresses for Entity Queries**:
| Constant | Value | Use For |
|----------|-------|---------|
| ENTITY_LINKER_ADDRESS | 0xaaa | EntityLinker queries |
| ENTITY_REGISTRAR_ADDRESS | 0xaab | EntityRegistrar queries |

---

### Logic & Comparison Nodes

All return **Bool**. Each takes 2-8 children unless noted.

#### Core Logic

| Type | Children | Description |
|------|----------|-------------|
| `logic_and` | `nodes[]` | ALL children must be true |
| `logic_or` | `nodes[]` | ANY child must be true |
| `logic_not` | `node` (1) | Inverts boolean result |

#### Equality

| Type | Children | Description |
|------|----------|-------------|
| `logic_equal` | `nodes[]` | Type+value equality; all must match first |
| `logic_string_nocase_equal` | `nodes[]` | Case-insensitive string equality |

#### String Comparison

| Type | Children | Description |
|------|----------|-------------|
| `logic_string_contains` | `nodes[]` | First contains all others (case-sensitive) |
| `logic_string_nocase_contains` | `nodes[]` | First contains all others (case-insensitive) |

#### Numeric Comparison (U256)

| Type | Children | Description |
|------|----------|-------------|
| `logic_as_u256_equal` | `nodes[]` | First == all others |
| `logic_as_u256_greater` | `nodes[]` | First > all others |
| `logic_as_u256_lesser` | `nodes[]` | First < all others |
| `logic_as_u256_greater_or_equal` | `nodes[]` | First >= all others |
| `logic_as_u256_lesser_or_equal` | `nodes[]` | First <= all others |

---

### Arithmetic Nodes (calc_*)

#### Numeric (all return U256, 2-8 children)

| Type | Operation |
|------|-----------|
| `calc_number_add` | first + second + third + ... |
| `calc_number_subtract` | first - second - third - ... |
| `calc_number_multiply` | first × second × third × ... |
| `calc_number_divide` | (first / second) / third / ... (throws on zero) |
| `calc_number_mod` | (first % second) % third % ... (throws on zero) |

#### String (return U64 or Bool)

| Type | Children | Returns | Description |
|------|----------|---------|-------------|
| `calc_string_length` | `node` (1) | U64 | UTF-8 byte length |
| `calc_string_contains` | `nodes[]` (2-8) | Bool | cs substring check |
| `calc_string_nocase_contains` | `nodes[]` (2-8) | Bool | ci substring check |
| `calc_string_nocase_equal` | `nodes[]` (2-8) | Bool | ci equality |

#### String Index (return U64)

| Type | Children | Description |
|------|----------|-------------|
| `calc_string_indexof` | `nodeLeft` + `nodeRight` + `order` | Find substring index (cs). `order`: "forward" or "backward". Not found → u64::MAX |
| `calc_string_nocase_indexof` | `nodeLeft` + `nodeRight` + `order` | Find substring index (ci) |

---

### Type Conversion Nodes (convert_*)

All take single `node` child.

| Type | Input → Output | Description |
|------|---------------|-------------|
| `convert_number_address` | Number → Address | Numeric to Address type |
| `convert_address_number` | Address → U256 | Address to numeric |
| `convert_number_string` | Number → String | Numeric to string |
| `convert_string_number` | String → U256 | Parse string as number (throws if invalid) |
| `convert_safe_u8` | any → U8 | Safe cast to U8 (throws on overflow) |
| `convert_safe_u16` | any → U16 | Safe cast to U16 |
| `convert_safe_u32` | any → U32 | Safe cast to U32 |
| `convert_safe_u64` | any → U64 | Safe cast to U64 |
| `convert_safe_u128` | any → U128 | Safe cast to U128 |
| `convert_safe_u256` | any → U256 | Safe cast to U256 |

---

### Vector Operations (vec_*)

#### Vector Properties

| Type | Children | Returns | Description |
|------|----------|---------|-------------|
| `vec_length` | `node` (1) | U64 | Number of elements |

#### Vector Containment (2-8 children, returns Bool)

First node = vector, remaining nodes = values to check.

| Type | Vector Type | Element Type |
|------|------------|--------------|
| `vec_contains_bool` | VecBool (9) or Value (19) | Bool (0) or Value (19) |
| `vec_contains_address` | VecAddress (10) or Value (19) | Address (1) or Value (19) |
| `vec_contains_string` | VecString (11) or Value (19) | String (2) or Value (19) |
| `vec_contains_string_nocase` | VecString or Value (19) | String or Value (19), ci |
| `vec_contains_number` | VecU8-VecU256 or Value (19) | U8-U256 or Value (19) |

#### Vector Index (return U64)

| Type | Children | Description |
|------|----------|-------------|
| `vec_indexof_bool` | `nodeLeft` + `nodeRight` + `order` | Find bool index |
| `vec_indexof_address` | `nodeLeft` + `nodeRight` + `order` | Find address index |
| `vec_indexof_string` | `nodeLeft` + `nodeRight` + `order` | Find string index (cs) |
| `vec_indexof_string_nocase` | `nodeLeft` + `nodeRight` + `order` | Find string index (ci) |
| `vec_indexof_number` | `nodeLeft` + `nodeRight` + `order` | Find number index |

`order`: "forward" or "backward". Not found → u64::MAX.

---

### Record Check Nodes (record_*)

Query on-chain records to validate operations. All return **Bool**.

These nodes check historical records (orders, progress steps, rewards, treasury operations) to enforce limits.

| Type | Key Parameters | Description |
|------|---------------|-------------|
| `record_check_recipient_order` | `receipt_type` + `recipient` | Check order count/status by recipient |
| `record_check_recipient_progress` | `recipient` | Check progress count by recipient |
| `record_check_recipient_reward` | `recipient` | Check reward claims by recipient |
| `record_check_treasury_history_item` | `historyIdx` + `sessionIdx` | Verify treasury operation |
| `record_check_treasury_history_item_no_um` | `historyIdx` + `sessionIdx` | Same but ignores Contact |
| `record_check_treasury_history_session` | `historyIdx` | Count treasury sessions |
| `record_check_progress_history_item` | `historyIdx` + `sessionIdx` + `forwardIdx` | Verify progress step |
| `record_check_progress_history_item_no_um` | `historyIdx` + `sessionIdx` + `forwardIdx` | Same but ignores Contact |
| `record_check_progress_history_session` | `historyIdx` + `sessionIdx` | Session info |
| `record_check_progress_history` | `historyIdx` | Count progress history |

Each uses `GuardNode` sub-nodes for its parameters (e.g., `recipient` is a GuardNode returning Address).

---

## Guard Design Workflow

### Step 1: Query Available Instructions

**Tool**: `wowok_buildin_info` with `info_type: "guard_instructions"`.

Discover what queries are available and their expected parameter types.

### Step 2: Query Value Types

**Tool**: `wowok_buildin_info` with `info_type: "value_types"`.

Understand the ValueType enum:
- Bool=0, Address=1, String=2
- U8=3, U16=4, U32=5, U64=6, U128=7, U256=8
- VecBool=9, VecAddress=10, VecString=11
- VecU8=12, VecU16=13, VecU32=14, VecU64=15, VecU128=16, VecU256=17
- VecVecU8=18

### Step 3: Design the Table

Decide what data the Guard needs:
- **Submitted data** (b_submission = true): User provides at operation time
- **Passed data** (b_submission = false): Object provides automatically

### Step 4: Build the Root Tree

- Start with `logic_and` as the root
- Add child nodes for each condition
- Use `query` + `identifier` patterns for data fetching
- Use comparison nodes for validation

### Step 5: Create Guard

**Operation**: `onchain_operations` with `operation_type: "guard"`.

**Key Fields**:
- `namedNew`: Guard creation options with name
- `description`: Guard purpose
- `table`: Data table array
- `root`: Computational tree with `type: "node"` and `node` containing the tree

Guard creation is a **one-step** operation — the `guard` operation type has no `submission` field. It either succeeds (returns transaction) or fails (returns error).

### Step 6: Export for Review

**Tool**: `guard2file`.

**Key Fields**:
- `guard`: Guard ID or name
- `file_path`: Output file path
- `format`: Output format ("json" or "markdown")

### Step 7: Use Guard in Operations

The Guard is now ready to be referenced by other operations (service, machine, progress, etc.) via their `submission` field.

---

## Common Guard Patterns

### Pattern 1: Identity Check (is sender == expected address?)

**Node Structure**:
- Type: `logic_equal`
- Nodes: Two `identifier` nodes
  - First: identifier 0 (submitted address)
  - Second: identifier 1 (stored address)

### Pattern 2: Minimum Balance

**Node Structure**:
- Type: `logic_as_u256_greater_or_equal`
- Nodes:
  - First: `query` node
    - query: "balance" (check wowok_buildin_info for correct ID)
    - object: { identifier: 0 } (account from table[0])
    - parameters: [ { type: "identifier", identifier: 1 } ] (coin_type from table[1])
  - Second: `identifier` node with identifier 2 (minimum balance from table[2])

### Pattern 3: Entity Registration Count

**Node Structure**:
- Type: `logic_as_u256_greater`
- Nodes:
  - First: `query` node
    - query: "entity_registrar_records_length"
    - object: { identifier: 0 } (ENTITY_REGISTRAR_ADDRESS 0xaab)
    - parameters: []
  - Second: `identifier` node with identifier 1 (0 to check count > 0)

### Pattern 4: Rate Limiting (record check)

**Node Structure**:
- Type: `logic_not`
- Node:
  - Type: `record_check_recipient_order`
  - receipt_type: "specific_value"
  - recipient: { type: "identifier", identifier: 0 }

Inverts: "has records" → false (blocked)

---

## Critical Rules

1. **`identifier` nodes reference table indices** — NOT arbitrary names. Every identifier must be defined in `table[]`.
2. **`query` nodes need `object.identifier`** — the target object comes from the Guard table.
3. **`query` instruction IDs come from `wowok_buildin_info`** — never guess query instruction IDs.
4. **Entity queries use system addresses** — ENTITY_LINKER_ADDRESS (0xaaa) and ENTITY_REGISTRAR_ADDRESS (0xaab).
5. **Root should return Bool** — final result determines pass/fail.
6. **node type names are lower_snake_case** — `logic_and`, `calc_number_add`, `convert_number_address`, etc.
7. **Guards are IMMUTABLE** — after creation, they cannot be modified. Export → Edit → Create New.
8. **Use `guard2file` for review** — always export and verify Guard logic before executing.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "unknown node type" | Wrong type name | Use exact names from this reference |
| "identifier out of range" | Table index mismatch | Verify identifiers match table indices |
| "query not found" | Invalid instruction ID | Query `wowok_buildin_info` for valid IDs |
| "type mismatch" | Wrong ValueType in table | Match table type to actual value type |
| "table field required" | Missing table array | Guards MUST have `table[]` |
| "guard validation failed" | Logic error | Export with `guard2file`, review logic |
| "object not found" | Wrong query object | Verify object addresses/identifiers |

---

## Query Witness Conversion Types

When using a `query` node's `convert_witness` field, the following numeric IDs allow cross-object type conversion — accessing a related object from the current context:

| Conversion | ID | Description |
|-----------|-----|-------------|
| TypeOrderProgress | 100 | From Order, get its Progress |
| TypeOrderMachine | 101 | From Order, get its Machine |
| TypeOrderService | 102 | From Order, get its Service |
| TypeProgressMachine | 103 | From Progress, get its Machine |
| TypeArbOrder | 104 | From Arb, get its Order |

---

## Schema Reference

| Purpose | Schema Name |
|---------|-------------|
| Guard operations | `onchain_operations_guard` |
| General on-chain operations | `onchain_operations` |
| Build-in info | `wowok_buildin_info` |

**Query Schema**: `schema_query({ action: "get", name: "<schema_name>" })`

**Related Skills**: [wowok-machine](../wowok-machine/SKILL.md) | [wowok-order](../wowok-order/SKILL.md) | [wowok-provider](../wowok-provider/SKILL.md)
