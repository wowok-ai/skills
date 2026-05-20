---
name: wowok-guard
description: |
  WoWok Guard — the canonical skill for designing, creating, and deploying
  immutable on-chain programmable trust rules. Guards are the computational
  validation backbone of every WoWok workflow: they control access, verify
  eligibility, determine fund distribution, gate reward claims, and power
  weighted voting in arbitration.

  This skill covers the full lifecycle: analyzing validation intent from
  business requirements, designing the data table with its submission and
  constant entries, constructing the recursive computational tree from
  available node types, integrating Guards into every WoWok object type,
  and understanding how Guards function within arbitration (voting_guard
  and usage_guard), service access control, machine workflow gating,
  allocator execution, and reward distribution.

  Guards are CREATE-only and immutable — this skill emphasizes upfront
  design discipline, testing with gen_passport before integration, and
  the principle that every Guard answers exactly one question: pass or fail.
when_to_use:
  - User wants to create or modify a Guard
  - User asks about Guard logic, validation rules, trust rules, programmable conditions
  - User encounters Guard validation errors or needs to debug a Guard
  - User mentions "guard", "validation", "trust rules", "verify", "condition"
  - User asks about buy_guard, allocator guard, reward guard, machine node guard
  - User asks about arbitration voting_guard or usage_guard
  - User needs identity checks, time-locks, multi-condition verification, or entity queries
  - User wants to understand how Guards integrate with other WoWok objects
---

# WoWok Guard Design Reference

> **Role**: Service Provider, Arbitrator, or any builder needing programmable on-chain validation
> **Prerequisites**: Understand CREATE vs MODIFY pattern — Guards are CREATE-only; once deployed on-chain their logic is frozen forever
> **Machine Integration**: See [wowok-machine](../wowok-machine/SKILL.md) for how Guards attach to workflow node forwards
> **Service Provider**: See [wowok-provider](../wowok-provider/SKILL.md) for buy_guard, allocator guards, and reward guard configuration
> **Order Operations**: See [wowok-order](../wowok-order/SKILL.md) for Guard submissions during Progress advancement and the arbitration dispute process
> **Arbitration**: See [wowok-arbitrator](../wowok-arbitrator/SKILL.md) for voting_guard and usage_guard configuration and the full Arb case lifecycle
> **Messenger**: See [wowok-messenger](../wowok-messenger/SKILL.md) for encrypted evidence exchange
> **Tools**: See [wowok-tools](../wowok-tools/SKILL.md)

---

## Core Concepts

### 1. What a Guard IS

A Guard is an **immutable, on-chain programmable validator** — a single-purpose computational tree that returns a boolean: **pass** or **fail**. Every operation protected by a Guard must satisfy its validation logic before the operation can proceed.

Think of a Guard as a **recursive expression made of typed nodes** that query on-chain data, compare values, perform arithmetic, and compute one final answer. It has no side effects. It stores no mutable state. It exists purely to answer: "Should this action be allowed?"

### 2. The Immutability Contract

Guards are **CREATE-only**. Once your transaction succeeds and the Guard is frozen on-chain, its logic cannot be altered. This is the foundation of trust: any party can inspect a Guard's definition and know with **certainty** what rules govern the protected operation — today, tomorrow, and forever.

**When you need to change a Guard**:
1. Export the existing Guard using the `guard2file` tool for reference and audit
2. Create a **new** Guard with the updated logic
3. Update every reference to the old Guard (Machine forwards, Service buy_guard, Allocators, Rewards, Arbitration voting_guard, etc.) to point to the new Guard

Version your Guard names (`"_v1"`, `"_v2"`) to make this evolution traceable.

### 3. The Three Structural Layers

Every Guard is built from three layers, each with a distinct role:

| Layer | Component | Role | Immutable? |
|-------|-----------|------|------------|
| **Declaration** | `table` | Declares every piece of data the Guard touches — constants and runtime submissions — each with a unique identifier (0–255) | Yes |
| **Computation** | `root` | A recursive tree of GuardNode types that computes the final boolean result by combining data sources, comparisons, arithmetic, and logic | Yes |
| **Composition** | `rely` (optional) | References to other Guards; the current Guard's result is AND-ed or OR-ed with dependencies, enabling modular Guard composition | Yes |

**The table is the contract with callers**: It tells them exactly what data they must provide at runtime (`b_submission: true`) versus what the Guard already knows (`b_submission: false`). Every `identifier` node in the computation tree references exactly one table entry.

**The root is the question**: It must return Bool. Intermediate nodes return numbers, strings, addresses, or vectors. The type system is enforced at creation time — a comparison node expecting numbers cannot receive strings.

**The rely is composition**: Up to 4 dependent Guards. When `rely.logic_or` is false (default), all dependencies must pass. When true, any dependency passing is sufficient. This lets you build complex validation from simple, tested components.

### 4. Where Guards Attach in the Ecosystem

Guards are not standalone — they plug into other WoWok objects as validation rules. Understanding these integration points is essential because the **context** of the Guard determines what data is available to it and what happens when it fails.

| Host Object | Guard Field | What It Controls | Operator | Arb State Relevance |
|-------------|-------------|-----------------|----------|---------------------|
| **Service** | `buy_guard` | Who can purchase from this service | Customer | — |
| **Service** | `order_allocators[].guard` | Which fund distribution strategy executes | System (auto-evaluated) | — |
| **Machine** | Forward `guard` | Who can advance to the next workflow node | Customer or Provider | — |
| **Progress** | Submission guard | Whether submitted data satisfies conditions during forward execution | Customer or Provider | — |
| **Reward** | `guard` | Who can claim from the reward pool | Claimant | — |
| **Repository** | Write/quote guard | Who can write to or read from on-chain storage | Writer/Reader | — |
| **Arbitration** | `usage_guard` | Who can file a dispute against this arbitration | Customer | Checked during `dispute`, which creates Arb in **Arbitrator_confirming (1)** |
| **Arbitration** | `voting_guard[]` | Who can vote on arbitration proposals and with what weight | Voters | Active during **Voting (2)** state |
| **Gen Passport** | Guard verification | Generating verified credentials after successful validation | Passport holder | Required before guard-based voting |

The two arbitration-specific guards deserve special attention because they bridge the customer-arbitrator relationship during dispute resolution.

#### usage_guard — Gating Dispute Access

The `usage_guard` on an Arbitration object controls **who can initiate a dispute**. When set, a customer calling `dispute` (or more precisely, `dispute_with_passport`) must present a Passport proving they satisfy this guard before the Arb is created.

**When this guard is checked**: At the moment of dispute creation, which transitions directly into **Arbitrator_confirming (1)** state. If the customer's Passport fails, the entire dispute transaction is rejected — no Arb is created, no fee is charged.

**Business scenarios for usage_guard**:
- Private arbitration services requiring membership or invitation
- Industry-specific arbitration requiring professional credentials
- KYC-verified dispute resolution
- Any scenario where only authorized parties should access the arbitration

When no usage_guard is set, the Arbitration is **public** — anyone can file a dispute, paying only the standard fee.

#### voting_guard — Weighted Voter Eligibility

The `voting_guard` vector on an Arbitration defines **who can vote and how much influence they carry**. This is the mechanism that transforms arbitration from a centralized decision into a decentralized, credential-weighted voting process.

**When voting guards are active**: During the **Voting (2)** state of an Arb case. Voters must first obtain a Passport by satisfying a specific voting guard (via `gen_passport`), then call the vote operation referencing that guard. Each voting guard entry specifies:

- **Which Guard** validates the voter's eligibility
- **How weight is determined** — either `FixedValue(u32)` for equal-weight pools or `GuardIdentifier(u8)` for dynamic weighting extracted from the voter's Passport submission

**The connection to Arb state transitions**: Voting only happens in the **Voting (2)** state. The arbitrator controls when voting begins (`confirm` from **Arbitrator_confirming (1)** to **Voting (2)**) and when it ends (`arbitration` from **Voting (2)** to **Arbitrated (3)**, which checks the voting deadline). Voting guards determine **who participates** during this window.

When the `voting_guard` vector is empty, the Arbitration operates in **open voting mode**: any vote called by the arbitrator carries weight 1, and the transaction signer is recorded as the voter. This is the centralized model — the arbitrator (or a small trusted panel) controls all votes directly.

---

## Phase 1: Design — Analyze the Validation Intent

Before constructing any node, articulate **what** you are validating and **why**. Start from the business requirement, not the data structure.

### The Central Questions

Every Guard answers these questions:

1. **What action is being protected?** — Buying a service? Advancing a workflow node? Claiming a reward? Casting a weighted vote? Filing a dispute?

2. **What data does the Guard have access to?** — Guards see only:
   - Their own `table` (pre-set constants plus runtime submissions from the caller)
   - On-chain state queried through `query` nodes targeting live WoWok objects
   - Transaction context (the current Clock timestamp, the signer's address, the Guard's own object ID)

3. **What should the verdict be?** — A single boolean: pass or fail. The root of every Guard tree must return Bool.

### Map Business Requirements to Guard Patterns

| Business Requirement | Guard Pattern | Key Mechanism |
|----------------------|---------------|---------------|
| "Only the author can purchase this service" | Identity check: Signer address equals stored authorized address | `context(Signer)` compared to a table constant via `logic_equal` |
| "Customer must wait 8 hours before completing" | Time-lock: Clock timestamp exceeds progress entry time plus lock duration | `context(Clock)` compared to `calc_number_add` of a Progress query and a duration constant |
| "Only sunny weather on the activity date" | Repository data check: external data matches expected value | `query` on a Repository with policy name and data key parameters, compared to constant |
| "Customer must confirm delivery via signature" | Progress history check: a specific forward has been accomplished | `query_progress_history_session_forward_find` checking for accomplished forwards |
| "User can only claim reward once" | Reward record count check: no prior claims exist | `query_reward_record_count` with recipient filter; check count equals zero |
| "Only KYC-registered entities can vote" | EntityRegistrar query: entity registration exists | `query` on ENTITY_REGISTRAR_ADDRESS with entity lookup parameters |
| "Vote weight equals reputation score" | Dynamic weight via GuardIdentifier | `VoteValue::GuardIdentifier(index)` extracts numeric value from voter's Passport |

### Design Before Building

The Guard design process is entirely upfront. There is no "draft" or "edit" phase after creation. Design thoroughly before calling the create operation:

1. List every data dependency — what must the caller provide? What constants are baked in?
2. Sketch the logic tree — what comparisons, arithmetic, and logical combinations produce the final boolean?
3. Verify types — does every comparison receive compatible operands? Are all conversions explicit?
4. Test the tree mentally — what happens with edge case inputs? What happens if a query returns empty?

---

## Phase 2: Declare the Data Table

The Guard table is the **complete declaration of information** the Guard consumes. Every `identifier` node in the computation tree references exactly one table entry by its index number (0–255). Nothing outside the table is accessible.

### Table Entry Fields

| Field | Meaning | Required When |
|-------|---------|---------------|
| `identifier` | Unique index (0–255). The computation tree uses this number to reference the entry. | Always |
| `b_submission` | Whether the **caller** must provide this value at runtime. `true` = runtime submission; `false` = pre-set constant. | Always |
| `value_type` | The type of the value: Bool, Address, String, U8–U256, or vector types. Uses numeric type codes. | Always |
| `value` | The constant value when `b_submission` is false; a placeholder when `b_submission` is true. | When `b_submission` is false |
| `name` | Human-readable label describing what this entry represents. | Always |

### Design Rules

- **Every identifier in the tree must exist in the table.** Missing references cause creation to fail.
- **No duplicate identifiers.** Each index number must appear exactly once.
- **Non-submission entries must have a value.** These are baked into the Guard immutably.
- **Submission entries use placeholder values.** The actual value is provided by the caller at runtime.
- **Query target objects must be of type Address in the table.** Their `object_type` field should match the expected query target type (Progress, Order, Machine, Reward, etc.).
- **Maximum 256 table entries** (identifiers 0–255). The total serialized table size must not exceed 40000 bytes.
- **Maximum computational input size: 1024 bytes.** The serialized computation tree must fit within this limit.

### The convert_witness Mechanism

When a query needs to access an object that is **related to** but not the same as a submitted identifier, the `convert_witness` field on the query node transforms the submitted address into its associated object. This is essential for common patterns.

**Example — Querying Progress from an Order**: A customer submits an Order ID, but the Guard needs to query the associated Progress object. The table has an Order address entry (submitted at runtime). The query node for Progress data uses `convert_witness: 100` (TypeOrderProgress), which tells the runtime: "Take the submitted Order address, find its Progress, and query that instead."

Without this mechanism, the caller would need to submit both the Order ID and the Progress ID — redundant and error-prone. The witness conversion maintains the principle that the caller provides only what they naturally have, and the system derives related objects automatically.

### Table Entry Example — Time-Lock Guard

A Guard that verifies the clock exceeds progress entry time plus a lock duration:

- **Identifier 0**: The Order ID — submitted at runtime (`b_submission: true`, type: Address). A query node referencing this with `convert_witness: 100` will reach the associated Progress.
- **Identifier 1**: The lock duration in milliseconds — pre-set constant (`b_submission: false`, type: U64, value: the duration).

This minimal table (two entries) is sufficient because the system derives the Progress object from the submitted Order.

### Table Entry Example — Arbitration Voting Guard with Dynamic Weight

A Guard that verifies a voter's reputation and extracts their voting weight:

- **Identifier 0**: The voter's entity registration — submitted at runtime (`b_submission: true`, type: Address). Used to query KYC status.
- **Identifier 1**: Minimum reputation threshold — pre-set constant (`b_submission: false`, type: U64, value: 100).
- **Identifier 2**: The voter's reputation score — submitted at runtime (`b_submission: true`, type: U64). Used by the Arbitration's `GuardIdentifier` VoteValue to determine voting weight.

The computation tree verifies the entity is registered AND the reputation score exceeds the threshold. If both checks pass, the voter's weight is extracted from identifier 2 via `GuardIdentifier(2)`.

---

## Phase 3: Build the Computational Tree

The root tree is a recursive expression whose terminal nodes read data and whose intermediate nodes transform, compare, and combine that data. The root must return Bool.

### Tree Principles

- **Type safety is enforced at creation time.** Every node validates that its children return types compatible with its operation. A `logic_equal` node that receives a String child and a U64 child will fail validation.
- **Evaluation order is stack-based.** Children are evaluated in reverse, so the first child in the array appears at the top of the evaluation stack.
- **The root must return Bool.** Logic and comparison nodes produce Bool. Arithmetic nodes produce numbers. Conversion nodes produce the target type. Ensure your outermost node is a logic or comparison type.
- **Every `identifier` node's index must exist in the table.** This is validated at creation time.

### Node Category Reference

#### Data Sources — Where Values Come From

These nodes produce values from the Guard's environment. They are typically the leaves of the tree.

| Node Type | Input | Output | Purpose |
|-----------|-------|--------|---------|
| `identifier` | An index number from the table | The entry's declared type | Reads a constant (non-submission) or the caller's submitted value (submission) |
| `context` | `"Clock"`, `"Signer"`, or `"Guard"` | U64 (Clock), Address (Signer/Guard) | Accesses transaction environment: current timestamp, transaction signer, or the Guard's own ID |
| `query` | A target object identifier (from table, must be Address), a query instruction ID or name, and typed parameters | Varies by query instruction | Fetches live on-chain data from a WoWok object. May use `convert_witness` to access related objects |

**Query notes**: Discover available query instructions and their return types via the `wowok_buildin_info` tool with query `"guard instructions"`. Each instruction has a numeric ID, declares its parameter types, and specifies its return type. The query node's parameters must match the instruction's parameter types in count and type.

#### Logic & Comparison — Making Decisions

These nodes consume values and produce Bool results. They are the decision-making layer.

| Node Type | Logic | Input Types |
|-----------|-------|-------------|
| `logic_equal` | All children must equal the first child (type-aware equality) | Any type — all children must be the same type |
| `logic_and` | All children must be true | Bool |
| `logic_or` | Any child must be true | Bool |
| `logic_not` | Inverts a single child | Bool |
| `logic_string_nocase_equal` | Case-insensitive string equality | String |
| `logic_string_contains` | First string contains all subsequent strings (case-sensitive) | String |
| `logic_string_nocase_contains` | First string contains all subsequent strings (case-insensitive) | String |
| `logic_as_u256_greater` | First child (as U256) is greater than all others | Number |
| `logic_as_u256_lesser` | First child (as U256) is less than all others | Number |
| `logic_as_u256_greater_or_equal` | First child (as U256) is greater than or equal to all others | Number |
| `logic_as_u256_lesser_or_equal` | First child (as U256) is less than or equal to all others | Number |
| `logic_as_u256_equal` | First child (as U256) equals all others | Number |

**Why "as U256"?** All numeric comparisons normalize to U256 — the largest integer type. This means a U8 and a U64 can be compared without explicit conversion; the system handles widening automatically. This is critical for time-lock patterns where you compare a U64 clock value against a U8-submitted constant.

#### Arithmetic — Computing with Numbers

These nodes consume numbers and produce U256 results. They enable Guards to calculate thresholds, offsets, and derived values.

| Node Type | Operation |
|-----------|-----------|
| `calc_number_add` | Sum of all children |
| `calc_number_subtract` | First minus second minus third... (sequential subtraction) |
| `calc_number_multiply` | Product of all children |
| `calc_number_divide` | Sequential division (throws if any divisor is zero) |
| `calc_number_mod` | Sequential modulo (throws if any divisor is zero) |

All arithmetic returns U256. Use `convert_safe_u64` (or other safe casts) to narrow back to smaller types if needed by a downstream query parameter.

#### String Operations

| Node Type | Purpose |
|-----------|---------|
| `calc_string_length` | Returns the UTF-8 byte length of a string as U64 |
| `calc_string_contains` | Checks if the first string contains subsequent strings (case-sensitive) — returns Bool |
| `calc_string_nocase_contains` | Same check, case-insensitive |
| `calc_string_nocase_equal` | Case-insensitive string equality — returns Bool |
| `calc_string_indexof` | Finds the byte position of a substring within the first string (forward or backward) — returns U64; returns `u64::MAX` if not found |
| `calc_string_nocase_indexof` | Same position search, case-insensitive |

#### Type Conversion

When nodes produce values of incompatible types for a downstream operation, insert a conversion node.

| Node Type | Input → Output |
|-----------|----------------|
| `convert_number_address` | Number (U256) → Address |
| `convert_address_number` | Address → U256 |
| `convert_number_string` | Number → String |
| `convert_string_number` | String → U256 (throws if the string is not a valid number) |
| `convert_safe_u8` through `convert_safe_u256` | Safe numeric narrowing (throws on overflow) |

#### Vector Operations

Vectors (arrays) of values can be searched, measured, and tested for containment.

| Node Type | Purpose |
|-----------|---------|
| `vec_length` | Returns the number of elements in a vector as U64 |
| `vec_contains_bool/address/string/number` | Checks if a vector contains specific values (each child is a candidate) — returns Bool |
| `vec_contains_string_nocase` | Case-insensitive string vector containment |
| `vec_indexof_bool/address/string/number` | Finds the index of a value in a vector (forward or backward) — returns U64 |
| `vec_indexof_string_nocase` | Case-insensitive index search |

#### Value Type Inspection

| Node Type | Purpose |
|-----------|---------|
| `value_type` | Returns the ValueType numeric identifier (U8) of its child node's result. Useful for dynamic type checking in complex Guards. |

#### Record Query Nodes — Pattern-Based On-Chain Lookups

These specialized query nodes search and aggregate on-chain records using BCS-serialized filter conditions. They operate on specific data tables (reward records, progress histories) and support range queries, existence checks, and count aggregation.

**Reward Record Queries**:

| Node Type | Searches | Returns |
|-----------|----------|---------|
| `query_reward_record_find` | Reward claim records by recipient, guard, time range, amount range, and store origin | U64 (record index, first or last match) |
| `query_reward_record_count` | Counts reward records matching the same filters | U64 |
| `query_reward_record_exists` | Checks if any reward record matches the filters | Bool |

**Progress History Queries**:

| Node Type | Searches | Returns |
|-----------|----------|---------|
| `query_progress_history_find` | Progress history entries by node, next node, time range, and index range | U64 (history index) |
| `query_progress_history_session_find` | Sessions within a specific history entry by next node filter | U64 (session index) |
| `query_progress_history_session_forward_find` | Forwards within a specific session by who, operation, accomplished status, and time range | U64 (forward index) |
| `query_progress_history_session_count` | Count of sessions in a history entry | U64 |
| `query_progress_history_session_forward_count` | Count of forwards in a session | U64 |
| `query_progress_history_session_forward_retained_submission_count` | Count of retained submissions in a forward | U64 |

These record query nodes enable sophisticated validation like "has the customer successfully completed delivery confirmation?" or "has this reward been claimed before by this address?" without requiring the caller to submit historical data — it's all queried on-chain.

---

## Phase 4: Create the Guard

Guard creation is a **single atomic operation** — it either succeeds (the Guard is frozen on-chain) or fails (nothing is created). There is no intermediate draft state, no editing phase, and no deletion mechanism.

### Operation

Use `onchain_operations` with `operation_type: "guard"`.

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_guard" })`

### Key Parameters (Business Intent)

**`namedNew`** — Gives the Guard a local name for easy reference. This maps the on-chain address to a human-readable label in your local mark. Set `replaceExistName: true` to overwrite a previous mapping. Use `onChain: true` to create a public on-chain identity for the Guard.

**`description`** — A human-readable explanation of what the Guard validates. This is stored on-chain and is visible to every user and counterparty who queries the Guard. Write it clearly and specifically — it is the public documentation of your validation rules.

**`table`** — The complete data table array. Each entry declares an identifier, whether it requires runtime submission, its value type, its value (or placeholder), and its name. The table defines the contract between the Guard and its callers.

**`root`** — The computational tree that defines the validation logic. Two modes:

- **`type: "node"`**: Provide the GuardNode tree directly in the operation. Suitable for programmatic Guard creation and simpler Guards.
- **`type: "file"`**: Load the Guard definition from a local JSON or Markdown file. The file defines `namedNew`, `description`, `table`, `root`, and `rely`. Fields specified directly in the schema parameters **override** the file's corresponding fields — useful for templating where the file provides the structure and the operation provides specific values.

**`rely`** — Optional dependency list (maximum 4). An array of existing Guard names or addresses. When `logic_or` is false (default), the current Guard passes only if **all** dependencies also pass (logical AND). When `logic_or` is true, the current Guard passes if **any** dependency passes (logical OR).

**Dependency constraint**: A Guard can only depend on other Guards that have `immutable: true` and `rep: true` (meaning they are fully standalone — no dependencies of their own, and their query validation passed). This prevents circular dependency chains and ensures the composition is well-founded.

### What Happens During Creation

The creation process performs these validations on-chain:

1. **Table serialization**: The table is BCS-serialized and checked against the 40000-byte size limit.
2. **Input serialization**: The computation tree is BCS-serialized and checked against the 1024-byte size limit.
3. **Data validation**: A native `validate_guard_data` function checks that every identifier in the computation tree maps to a table entry, that types are consistent, and that the root returns Bool.
4. **Affiliation registration**: Every Address-type constant in the table that points to another on-chain object is registered in the system's affiliation graph, enabling reverse lookups ("which Guards reference this object?")
5. **Freeze**: The Guard is frozen (`immutable: true`). After this point, no field can be modified.

### Discovery: Query Available Instructions

Before designing a Guard that queries on-chain state, discover what query instructions are available and what they return.

**Tool**: `wowok_buildin_info` with query `"guard instructions"`.

This returns the complete catalog: instruction IDs, parameter types, return types, and the target object type each instruction queries. Understanding this catalog is essential before constructing query nodes.

### Discovery: Understand Value Types

**Tool**: `wowok_buildin_info` with query `"value types"`.

The numeric type codes used in the table's `value_type` field:
- Bool = 0, Address = 1, String = 2
- U8 = 3, U16 = 4, U32 = 5, U64 = 6, U128 = 7, U256 = 8
- VecBool = 9, VecAddress = 10, VecString = 11
- VecU8–VecU256 = 12–17, VecVecU8 = 18

### System Addresses for Entity Queries

When designing Guards that query entity registrations or social graphs, use these system constants in your table:

| Constant | Address | Query Target |
|----------|---------|--------------|
| ENTITY_LINKER_ADDRESS | `0xaaa` | EntityLinker queries (follows, likes, affiliations between objects) |
| ENTITY_REGISTRAR_ADDRESS | `0xaab` | EntityRegistrar queries (KYC verification, entity registration records) |

These are pre-set Address entries in your table with `b_submission: false`. The query node references the table identifier containing this address as its target object.

---

## Phase 5: Test, Export, and Query

### Test Independently with Gen Passport

Before embedding a Guard into a live Machine, Service, or Arbitration, test it in isolation.

**Tool**: `gen_passport`

**Schema Reference**: `schema_query({ action: "get", name: "gen_passport" })`

This tool verifies one or more Guards and, on success, generates an immutable Passport — a verified credential stored on-chain. Use it to:

- **Verify correctness**: Does the Guard produce the expected boolean result with your test data?
- **Test edge cases**: What happens with empty submissions, boundary values, or unusual addresses?
- **Debug failures**: If the Guard rejects valid data, the error helps identify type mismatches or missing table entries.
- **Pre-generate Passports for voters**: In guard-based arbitration voting, voters need Passports before they can vote. Generate these ahead of time.

The Passport itself is useful beyond testing — it serves as a reusable on-chain credential for offline verification, transaction condition checking, and multi-guard validation.

### Export for Audit and Templating

**Tool**: `guard2file`

**Schema Reference**: `schema_query({ action: "get", name: "guard2file" })`

Export an existing Guard from the blockchain to a local JSON or Markdown file. This is essential for:

- **Auditing**: Review the exact on-chain logic of any Guard — your own or a counterparty's.
- **Templating**: Export a proven Guard, edit the file, and use `root.type: "file"` to create a new variant. Override specific fields in the operation to customize the template.
- **Documentation**: Generate human-readable Guard definitions for sharing and review.

### Query On-Chain Guards

**Tool**: `query_toolkit` with `query_type: "onchain_objects"` and the Guard's name or address.

Retrieve the Guard's complete on-chain state: description, table (all entries with their types and values), root tree structure, and dependencies. This is how counterparties inspect your Guards, and how you inspect theirs.

---

## Guard in the Arbitration Context

Guards play two distinct and critical roles in the arbitration system. Understanding these roles requires understanding both the Guard design principles above and the Arb state machine documented in [wowok-arbitrator](../wowok-arbitrator/SKILL.md).

### The Two Arbitration Guard Roles

```
                    Arbitration Object
                    ┌──────────────────────────────────────┐
                    │  usage_guard: Option<address>         │  ◄── Who can FILE disputes
                    │  voting_guard: vector<VotingGuard>    │  ◄── Who can VOTE and with what weight
                    │      ├── { guard: addr, weight: ... } │
                    │      ├── { guard: addr, weight: ... } │
                    │      └── ... (max 50)                 │
                    └──────────────────────────────────────┘
```

### usage_guard — The Gate Before Dispute Creation

**When it fires**: At the moment a customer calls the `dispute` operation. This is the **entry point** to the entire arbitration process — before any Arb object exists.

**What happens**: If `usage_guard` is set, the on-chain `dispute_with_passport` function calls `passport::result_for_guard`, which verifies the customer's Passport against the guard. If the Passport is missing or the guard validation fails, the transaction reverts — no Arb is created, no fee is charged, no state changes occur.

**The connection to Arb state**: The very first Arb state is **Arbitrator_confirming (1)** — the Arb is born in this state. The usage_guard check happens **before** state (1) is reached. Think of it as a pre-condition for the Arb's existence.

**Designing an effective usage_guard**: The guard should validate whatever constitutes "authorized to access this arbitration." Common patterns:
- Identity check: Signer address equals a registered participant list (queried from a Repository or EntityRegistrar)
- Membership verification: Signer's entity registration exists and has active status
- Geographic or jurisdictional check: Signer's registered jurisdiction matches the arbitration's jurisdiction

**From wowok-order's perspective**: The customer initiates arbitration through the `arbitration.dispute` operation in their order workflow. If a usage_guard blocks them, they cannot proceed — the dispute transaction fails. The AI assisting the customer should query the Arbitration's `usage_guard` field first, check if it exists, and help the customer understand what credentials they need before attempting the dispute. See [wowok-order](../wowok-order/SKILL.md) Phase 5 for the complete customer arbitration workflow.

### voting_guard — The Weight Engine During Voting

**When it fires**: During the **Voting (2)** state of an Arb. Each individual vote transaction using `vote_with_voting_guard` triggers the guard check.

**What happens**: The voter provides a Passport (generated earlier via `gen_passport`) for a specific voting guard. The system:
1. Verifies the Passport satisfies the specified guard
2. Looks up the matching VotingGuard entry in the Arbitration's `voting_guard` vector
3. Extracts the vote weight based on the VoteValue rule
4. Records the vote with the calculated weight on the Arb's propositions

**If no voting_guard is configured** (vector is empty): The arbitrator uses the simpler `vote` function, which records the transaction signer as the voter with weight 1. No Passport is needed. This is the **open voting** model — centralized control by the arbitrator.

**The two VoteValue types and their Guard design implications**:

**FixedValue(u32)** — Equal-weight voting. The Guard's role is purely **eligibility**: pass or fail. If the voter passes, they vote with the fixed weight. The Guard's submission values are not used for weight calculation.

**GuardIdentifier(u8)** — Dynamic weighted voting. The Guard serves double duty: eligibility AND weight determination. The value at the specified identifier index in the voter's Passport submission is extracted as a number and used as the vote weight. This requires the Guard's table to include a submission entry at that identifier with a numeric type.

**Designing a voting_guard for dynamic weight**: The Guard must:
1. Include at least one submission entry with a numeric type at the identifier referenced by GuardIdentifier
2. Validate the voter's eligibility (identity, credentials, registration)
3. Include the weight-determining value as a submission — the voter provides it when generating their Passport

**Example — Reputation-weighted voting**:
- Guard table has identifier 0: entity address (submitted, Address type) for KYC lookup
- Guard table has identifier 1: reputation score (submitted, U64 type) for weight
- The computational tree verifies the entity exists in the EntityRegistrar AND the reputation score exceeds a minimum threshold
- The Arbitration's VotingGuard entry uses `GuardIdentifier(1)` — the voter's weight equals their reputation score
- A voter with reputation 500 gets 5x the voting power of a voter with reputation 100

**The connection to Arb state machine**:
- Voting guards are only relevant during **Voting (2)** state
- The arbitrator transitions the Arb to Voting via `confirm` (from **Arbitrator_confirming (1)**)
- Votes can be changed — if a voter votes again, their old weight is removed and replaced
- Maximum 520 voters per Arb
- The voting deadline, if set, blocks votes submitted after it passes
- The `arbitration` operation (transition to **Arbitrated (3)**) checks the deadline before allowing finalization

**From wowok-arbitrator's perspective**: The voting_guard configuration is set during arbitration service setup (Phase 2). The arbitrator manages the voting guard list (add, remove, clear) and coordinates the voting process (Phase 3.3). See [wowok-arbitrator](../wowok-arbitrator/SKILL.md) for the complete arbitrator workflow.

---

## Common Business Patterns

### Pattern 1: Identity Check — "Only this entity can act"

**Intent**: Restrict an operation to one or more specific known addresses.

**Where used**: Service buy_guard (only the author can purchase), permission-restricted Machine forwards (only the provider can operate), usage_guard (only registered members can file disputes).

**Structure**:
- Root: `logic_equal`
- Children: `context(Signer)` and `identifier(stored authorized address)`
- Table: One pre-set Address entry with the authorized address.

**Variation — Allowlist**: Use `vec_contains_address` with the signer and a vector of authorized addresses. The vector can be a pre-set constant in the table.

### Pattern 2: Time-Lock — "Must wait before completing"

**Intent**: Enforce a minimum waiting period between two events, preventing premature completion or claim.

**Where used**: Insurance claim completion guard, travel order completion guard, any scenario requiring a cooling-off period.

**Structure**:
- Root: `logic_as_u256_greater`
- First child: `context(Clock)` — the current timestamp
- Second child: `calc_number_add` of a Progress `query` (current node entry time) plus `identifier(lock duration)`
- The query uses `convert_witness` (e.g., `100` for Order→Progress) to reach the Progress from a submitted Order ID

**Key insight**: The caller submits only the Order ID (which they naturally have). The system converts it to the Progress object and queries the entry time. The Guard adds the lock duration constant and compares against the clock.

### Pattern 3: Repository Data Check — "External data must match"

**Intent**: Verify that a specific data item in an on-chain Repository equals an expected value.

**Where used**: Weather-dependent services, configuration-gated operations, any scenario where external verified data drives a decision.

**Structure**:
- Root: `logic_equal`
- First child: `query` on the Repository target with policy name (constant string) and data key (submitted or derived) as parameters
- Second child: `identifier(expected value constant)`
- Data keys that are timestamps may need `convert_number_address` to transform from a U64 timestamp to an Address type before being passed as a query parameter

### Pattern 4: Progress State Check — "Has a workflow step been completed?"

**Intent**: Verify that a specific forward operation has been accomplished in the Progress history before allowing a subsequent action.

**Where used**: Insurance withdrawal guard (verify order reached "Complete" node), reward claim guard (verify customer completed a review step), allocator guards (verify delivery confirmation).

**Structure**:
- Use `query_progress_history_session_forward_find` to search for an accomplished forward matching specific criteria (node name, operator address, time range)
- Combine with `logic_equal` to check the forward's `accomplished` flag
- Use `query_progress_history_find` first to locate the relevant history entry, then drill into sessions and forwards

### Pattern 5: Reward Claim Gating — "Can only claim once"

**Intent**: Prevent double-claiming of rewards while allowing legitimate first claims.

**Where used**: Reward guard, loyalty program guard, one-time incentive guard.

**Structure**:
- Use `query_reward_record_count` with the recipient's address and guard filter
- Root: `logic_equal` comparing the count to zero (or `logic_as_u256_equal` comparing to `identifier(0)`)
- If count > 0, the guard fails — the reward was already claimed

### Pattern 6: Arbitration Voting Guard — Eligibility + Dynamic Weight

**Intent**: Verify a voter is qualified AND extract their voting weight from their credentials.

**Where used**: Arbitration voting_guard with GuardIdentifier VoteValue.

**Structure**:
- Two submission entries: entity address (for eligibility check) and credential value (for weight)
- Computational tree: `logic_and` combining an entity registration check with a minimum threshold check
- The Arbitration's VotingGuard entry uses `GuardIdentifier(index_of_weight_entry)` to extract the weight

---

## Best Practices

### Design Principles

| Do | Don't |
|----|-------|
| Design Guards for exactly one clear validation purpose | Create monolithic Guards that check unrelated conditions in a single tree |
| Name Guards descriptively with their business purpose and version | Use cryptic or generic names that don't convey intent |
| Test Guards independently with `gen_passport` before integrating into any workflow | Deploy Guards into live Services or Machines without standalone verification |
| Export and review Guards with `guard2file` before recreating them with changes | Assume you remember the exact logic of a Guard deployed weeks ago |
| Use `rely` for Guard composition when validation naturally decomposes into independent checks | Duplicate identical validation logic across multiple Guards |
| Query available instructions via `wowok_buildin_info` before designing query nodes | Guess query instruction IDs, parameter counts, or return types |
| Keep the table concise with well-named entries that match the caller's natural data | Dump unnecessary data into the table — every entry is a contract |
| Use `convert_witness` to derive related objects from what the caller naturally has | Require callers to submit multiple redundant IDs for the same conceptual entity |

### Common Pitfalls

1. **Undefined table identifiers**: Every `identifier` node in the tree must match an entry in the table. Missing entries cause creation failure — validate your tree against your table before submitting.

2. **Type mismatches in comparison nodes**: A `logic_equal` comparing a String to a U64 fails validation. Use explicit conversion nodes (`convert_string_number`, `convert_number_string`) when types differ. Numeric comparisons use `logic_as_u256_*` variants which auto-widen to U256.

3. **Wrong query instruction IDs or parameter counts**: Query instructions are system-defined. Always discover them through `wowok_buildin_info` with `"guard instructions"`. The parameter count and types in your query node must match the instruction exactly.

4. **Missing convert_witness**: When accessing Progress data from an Order ID in the table, the query node needs `convert_witness` with the appropriate witness type. Without it, the runtime looks for a Progress at the Order's address — which does not exist. Common witness types include Order→Progress (100), and others documented in the guard instructions query.

5. **Testing with production durations**: Set time-lock durations to small values (e.g., 1000 milliseconds) during testing. Increase to production values only after verifying the logic works correctly.

6. **Forgetting to export before recreating**: Guards are immutable. If you need to change one, export it first with `guard2file` so you have the exact on-chain definition as a reference. Then create a new Guard with a versioned name.

7. **Root not returning Bool**: The outermost node of the tree must produce Bool. Logic and comparison nodes return Bool; arithmetic, conversion, and string operation nodes do not. Ensure your tree terminates at a logic or comparison node.

8. **Dependency on non-standalone Guards**: A Guard's `rely` entries must reference Guards that are themselves standalone (`immutable: true` and `rep: true`). Guards with their own dependencies cannot be used as dependencies for others.

### Naming Conventions

- Use descriptive names that convey the Guard's business purpose: `"weather_check_guard"`, `"insurance_complete_guard"`, `"voter_reputation_guard"`
- Version suffixes make evolution traceable: `"_v1"`, `"_v2"` — since Guards cannot be modified, versioned names track the lineage
- Tags help with organization and discovery: `["insurance", "time-lock", "complete"]`, `["arbitration", "voting", "reputation"]`

---

## Tool Reference

| Tool | Purpose |
|------|---------|
| `onchain_operations` (`operation_type: "guard"`) | Create a new immutable Guard on-chain with its table, computational tree, and optional dependencies |
| `wowok_buildin_info` (`query: "guard instructions"`) | Discover all available query instructions — their IDs, parameter types, return types, and target object types |
| `wowok_buildin_info` (`query: "value types"`) | Discover the numeric codes for all supported value types used in table entries |
| `gen_passport` | Test Guard validation with runtime submissions and generate a verified on-chain credential on success |
| `guard2file` | Export an existing Guard's complete definition (description, table, root tree, dependencies) to a local JSON or Markdown file |
| `query_toolkit` (`query_type: "onchain_objects"`) | Query any Guard object on-chain by name or address to inspect its full definition |
| `schema_query` (`name: "onchain_operations_guard"`) | Retrieve the complete Guard operation schema with all parameter definitions |

**Related Skills**: [wowok-machine](../wowok-machine/SKILL.md) | [wowok-provider](../wowok-provider/SKILL.md) | [wowok-order](../wowok-order/SKILL.md) | [wowok-arbitrator](../wowok-arbitrator/SKILL.md) | [wowok-messenger](../wowok-messenger/SKILL.md) | [wowok-tools](../wowok-tools/SKILL.md)