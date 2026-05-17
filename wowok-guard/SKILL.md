---
name: wowok-guard
description: |
  WoWok Guard design mastery — programmable trust rules for on-chain validation.
  Guards are the most complex and error-prone component in WoWok. This skill
  ensures AI correctly designs Guard node trees, understands instruction
  constraints, and avoids common Guard construction failures.
  
  Use this skill whenever the user needs to create, modify, or understand a
  Guard — the programmable validation rules that protect on-chain operations.
when_to_use:
  - User wants to create or modify a Guard
  - User asks about Guard logic, validation rules, or trust rules
  - User encounters Guard validation errors
  - User needs to design access control or verification logic
  - User mentions "guard", "validation", "trust rules", "verify"
---

# WoWok Guard Design Mastery

## What is a Guard?

A Guard is a **programmable validation tree** that evaluates submitted data against defined rules. Think of it as an on-chain "if-this-then-that" engine. Every node in the tree is either:
- A **logic node** (AND/OR/NOT) that combines child results
- A **query node** that fetches on-chain data
- A **comparison node** that checks values
- A **leaf node** that returns a constant

## Guard Structure

```
Guard {
  table: [                          // What data the Guard validates
    { name: "field1", value_type: "U64", description: "..." },
    { name: "field2", value_type: "Address", description: "..." },
  ],
  root: {                           // The validation logic tree
    type: "and",                    // Root is typically AND
    nodes: [ ... ]                  // Child nodes
  }
}
```

## Guard Node Types

### Logic Nodes

| Type | Children | Description |
|------|----------|-------------|
| `and` | `nodes[]` | ALL children must pass |
| `or` | `nodes[]` | AT LEAST ONE child must pass |
| `not` | `node` (single) | Inverts the child result |

### Query Nodes (Fetch On-Chain Data)

Query nodes fetch data from the blockchain for comparison. Each query node has:
- `query_type`: What to query
- `convert_witness`: How to extract a value from the result (using Guard instructions)

**Critical Rule**: Query nodes MUST have `convert_witness` to extract a usable value. Without it, the query result is an object that cannot be compared.

```
{
  type: "query",
  query_type: "entity_registrar",
  address: { type: "witness", name: "user_address" },
  convert_witness: [
    { instruction: "get_field", field: "records" },
    { instruction: "length" }
  ]
}
```

### Comparison Nodes

| Type | Operands | Description |
|------|----------|-------------|
| `eq` | `left`, `right` | Equal |
| `neq` | `left`, `right` | Not equal |
| `gt` | `left`, `right` | Greater than |
| `gte` | `left`, `right` | Greater than or equal |
| `lt` | `left`, `right` | Less than |
| `lte` | `left`, `right` | Less than or equal |
| `contains` | `container`, `element` | Container contains element |
| `not_contains` | `container`, `element` | Container does not contain element |

### Value Nodes

| Type | Value | Description |
|------|-------|-------------|
| `witness` | `name` (string) | Reference a field from the Guard's `table` |
| `constant` | `value` (any) | A fixed value for comparison |
| `address` | `value` (string) | A blockchain address |

## Guard Instructions (for convert_witness)

Always query available instructions first:
```
Tool: wowok_buildin_info (info_type: "guard_instructions")
```

Common instructions:
- `get_field` — Extract a field from an object
- `length` — Get the length of a vector/array
- `convert_address_number` — Convert address to number
- `convert_number_address` — Convert number to address
- `get` — Get element at index from a vector
- `add` / `sub` / `mul` / `div` — Arithmetic operations
- `and` / `or` / `not` — Boolean operations
- `gt` / `gte` / `lt` / `lte` / `eq` — Comparisons

## Query Node Types

| query_type | What it queries | Key parameters |
|------------|----------------|----------------|
| `entity_registrar` | Entity registration info | `address` |
| `entity_linker` | Community votes/endorsements | `address` |
| `object` | Any on-chain object | `object_id` |
| `table_item` | Dynamic field of an object | `parent`, `key_type`, `key_value` |
| `personal` | User public profile | `address` |
| `received` | Objects received by an address | `address` |
| `balance` | Token balance | `address`, `token_type` |

## System Addresses for Entity Queries

When querying EntityLinker or EntityRegistrar, use these system addresses:

| System Address | Value | Description |
|----------------|-------|-------------|
| `ENTITY_LINKER_ADDRESS` | `0xaaa` | Use for EntityLinker queries |
| `ENTITY_REGISTRAR_ADDRESS` | `0xaab` | Use for EntityRegistrar queries |

## Guard Design Rules (from WOWOK.md)

### Rule 1: Query Nodes MUST Have convert_witness
Without `convert_witness`, the query returns an object that cannot be compared to anything meaningful.

### Rule 2: Witness Names Must Match Table Fields
Every `witness` reference in the Guard tree must correspond to a field defined in the `table` array.

### Rule 3: Entity Queries Use System Addresses
EntityLinker and EntityRegistrar are global system objects. Use their system addresses, not user addresses.

### Rule 4: Root is Typically AND
The root node should be `and` to ensure ALL conditions pass. Use `or` only when any single condition is sufficient.

### Rule 5: Keep Trees Shallow
Deep nesting makes Guards hard to debug. Prefer flat AND/OR structures with clear query→compare patterns.

## Common Guard Patterns

### Pattern 1: Entity Must Be Registered
```
root: {
  type: "and",
  nodes: [
    {
      type: "query",
      query_type: "entity_registrar",
      address: { type: "witness", name: "user_address" },
      convert_witness: [
        { instruction: "get_field", field: "records" },
        { instruction: "length" }
      ]
    },
    { type: "gt", left: <query_result>, right: { type: "constant", value: 0 } }
  ]
}
```

### Pattern 2: Minimum Balance Check
```
root: {
  type: "and",
  nodes: [
    {
      type: "query",
      query_type: "balance",
      address: { type: "witness", name: "user_address" },
      token_type: "0x2::wow::WOW",
      convert_witness: [{ instruction: "get_field", field: "balance" }]
    },
    {
      type: "gte",
      left: <query_result>,
      right: { type: "witness", name: "min_balance" }
    }
  ]
}
```

### Pattern 3: Community Trust Check (EntityLinker)
```
root: {
  type: "and",
  nodes: [
    {
      type: "query",
      query_type: "entity_linker",
      address: { type: "witness", name: "user_address" },
      convert_witness: [
        { instruction: "get_field", field: "likes" },
        { instruction: "length" }
      ]
    },
    {
      type: "gte",
      left: <query_result>,
      right: { type: "constant", value: 3 }
    }
  ]
}
```

## Guard Creation Workflow

### Step 1: Discover Available Instructions
```
Tool: wowok_buildin_info (info_type: "guard_instructions")
```

### Step 2: Design the Table
Define what data the Guard will validate. Each field has a name, type, and description.

### Step 3: Design the Root Tree
Build the validation logic using the node types above.

### Step 4: Create the Guard (Dry Run First)
```
Tool: onchain_operations (operation_type: "guard")
Data: {
  op: "create",
  name: "<guard_name>",
  description: "<description>",
  table: [ ... ],
  root: { ... }
}
```

### Step 5: Review and Execute
After dry run succeeds, add `submission` to execute.

## Guard from File

You can load Guard definitions from a local JSON or Markdown file:

```
Tool: onchain_operations (operation_type: "guard")
Data: {
  op: "create",
  name: "<guard_name>",
  root: {
    type: "file",
    file_path: "<path_to_file>",
    format: "json"  // or "markdown"
  }
}
```

## Export Guard for Review

```
Tool: guard2file
Data: {
  guard: "<guard_name_or_id>",
  file_path: "<output_path>",
  format: "json"  // or "markdown"
}
```

## Common Guard Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "witness not found in table" | Witness name doesn't match table field | Add the field to `table` or fix the witness name |
| "query node missing convert_witness" | Query without value extraction | Add `convert_witness` to extract a comparable value |
| "type mismatch" | Comparing incompatible types | Check value types in table match comparison operands |
| "entity not found" | Wrong address for entity query | Use system addresses (0xaaa, 0xaab) for entity queries |
| Guard validation fails at runtime | Data doesn't satisfy Guard rules | Review the Guard tree logic and submitted data values |
