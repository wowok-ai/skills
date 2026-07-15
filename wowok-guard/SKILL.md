---
name: wowok-guard
description: |
  WoWok Guard — on-chain programmable validation rules that control access,
  verify eligibility, and provide dynamic data to objects. Guards serve as
  the trust layer for Services (buy_guard), Arbitration (voting_guard weight,
  usage_guard), Machines (forward validation), Demands (recommendation filtering),
  Rewards (claim eligibility), and Repositories (write validation with data extraction).
  Guards also enable off-chain use cases: generate a Passport via `onchain_operations` (`operation_type: "gen_passport"`) to
  obtain a signed, time-bound credential for off-chain permission verification.
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
> **Prerequisites**: Guards are CREATE-only; frozen on-chain once deployed  
> **Related Skills**: [wowok-machine](../wowok-machine/SKILL.md) (forward guards), [wowok-provider](../wowok-provider/SKILL.md) (buy_guard, allocator guards), [wowok-order](../wowok-order/SKILL.md) (guard submissions), [wowok-arbitrator](../wowok-arbitrator/SKILL.md) (voting_guard, usage_guard), [wowok-messenger](../wowok-messenger/SKILL.md) (encrypted evidence), [wowok-safety](../wowok-safety/SKILL.md) (naming, confirmation), [wowok-tools](../wowok-tools/SKILL.md) (tool reference)

---

## Core Concepts

### What a Guard IS

A Guard is an **immutable, on-chain programmable validator** — a single-purpose computational tree that returns a boolean: **pass** or **fail**. Every operation protected by a Guard must satisfy its validation logic before the operation can proceed.

Think of a Guard as a **computational tree of typed nodes** that query on-chain data, compare values, perform arithmetic, and compute one final answer. It has no side effects. It stores no mutable state. It exists purely to answer: "Should this action be allowed?"

### The Immutability Contract

Guards are **CREATE-only**. Once frozen on-chain, logic cannot be altered — this is the foundation of trust. To change a Guard: export via `guard2file`, create a new Guard, and update all references. See wowok-safety skill for naming conventions.

### The Three Structural Layers

Every Guard is built from three layers, each with a distinct role:

| Layer | Component | Role | Immutable? |
|-------|-----------|------|------------|
| **Declaration** | `table` | Declares every piece of data the Guard touches — constants and runtime submissions — each with a unique identifier (0–255) | Yes |
| **Computation** | `root` | A computational tree of GuardNode types that computes the final boolean result by combining data sources, comparisons, arithmetic, and logic | Yes |
| **Composition** | `rely` (optional) | References to other Guards; the current Guard's result is AND-ed or OR-ed with dependencies, enabling modular Guard composition | Yes |

**The table is the contract with callers**: It tells them exactly what data they must provide at runtime (`b_submission: true`) versus what the Guard already knows (`b_submission: false`). Every `identifier` node in the computation tree references exactly one table entry.

**The root is the question**: It must return Bool. Intermediate nodes return numbers, strings, addresses, or vectors. Guard is **strongly typed** — the type system is strictly enforced at creation time. Type mismatches (e.g., passing a string to a numeric comparison node) will cause validation errors and prevent Guard creation.

**The rely is composition**: Up to 4 dependent Guards. When `rely.logic_or` is false (default), all dependencies must pass (AND). When true, any passing is sufficient (OR). A Guard can only depend on Guards with `rep: true` — `rep` is the Guard's internal flag indicating it has no external Repository dependency and can serve as a dependency. Guards with `rep: false` cannot appear in `rely` lists. Violations are caught by the contract layer at creation time.

### Where Guards Attach in the Ecosystem

Guards are not standalone — they plug into other WoWok objects as validation rules. Understanding these integration points is essential because the **context** of the Guard determines what data is available to it and what happens when it fails.

| Host Object | Guard Field | What It Controls | Operator | Who Provides Submission Data |
|-------------|-------------|-----------------|----------|------------------------------|
| **Service** | `buy_guard` | Who can purchase from this service | Customer | Customer (signer, credentials) |
| **Service** | `order_allocators[].guard` | Which fund distribution strategy executes | System (auto-evaluated) | System derives from Progress state |
| **Machine** | Forward `guard` | Who can advance to the next workflow node | Customer or Provider | The party executing the forward |
| **Progress** | Submission guard | Whether submitted data satisfies conditions during forward execution | Customer or Provider | The party submitting data |
| **Reward** | `guard` | Who can claim from the reward pool | Claimant | Claimant (address, credentials) |
| **Repository** | Write/quote guard | Who can write to or read from on-chain storage | Writer/Reader | Writer/Reader |
| **Arbitration** | `usage_guard` | Who can file a dispute against this arbitration | Customer | Customer (Passport credential) |
| **Arbitration** | `voting_guard[]` | Who can vote on arbitration proposals and with what weight | Voters (authenticated via Arbitrator) | Voter (Passport credential with weight data) |
| **Gen Passport** | Guard verification | Generating verified credentials after successful validation | Passport holder | Passport applicant |

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

| Business Requirement | Guard Pattern | Key Mechanism | Implementation Notes |
|----------------------|---------------|---------------|---------------------|
| "Only the author can purchase this service" | Identity check | Signer address equals stored authorized address | `context(Signer)` vs table constant via `logic_equal`. Variation: use `vec_contains_address` for allowlists |
| "Customer must wait 8 hours before completing" | Time-lock | Clock timestamp exceeds progress entry time plus duration | `context(Clock)` vs `calc_number_add` of Progress query + duration constant. Use `convert_witness=100` to derive Progress from submitted Order ID |
| "Only sunny weather on the activity date" | Repository data check | External data matches expected value | `query` on Repository with policy name and data key. Timestamp keys may need `convert_number_address` |
| "Customer must confirm delivery via signature" | Progress history check | Specific forward has been accomplished | Chain `query_progress_history_find` → `query_progress_history_session_forward_find`. Check `accomplished` flag with `logic_equal` |
| "User can only claim reward once" | Reward record count check | No prior claims exist | `query_reward_record_count` with recipient filter; compare count to zero via `logic_equal` |
| "Order payment > 1,000,000 and reached 'complete' to claim reward" | Multi-condition | Order amount + progress state + service match | Combine multiple `query` nodes with `logic_and`. Use `convert_witness=TypeOrderProgress` to access Progress from Order |
| "Vote weight equals reputation score" | Dynamic weight | GuardIdentifier extracts numeric value from Passport | Table needs numeric submission entry at referenced index. Guard validates eligibility AND weight range |
| "Only premium members can file disputes" | Membership verification | Entity registration or tier check | `query` on ENTITY_REGISTRAR_ADDRESS or Repository. Combine entity existence check with tier comparison via `logic_and` |

### Quick Decision: What Guard Pattern Fits?

```
Identity check?      → context(Signer) + logic_equal (single address) / vec_contains_address (allowlist)
Time constraint?     → context(Clock) + calc_number_* comparisons
External data?       → query + table entry declaring target object address
Progress state?      → query_progress_history_find + convert_witness
One-time claim?      → query_reward_record_count + logic_equal(0)
Dynamic weight?      → GuardIdentifier + numeric table entry (b_submission: true)
External Repository? → query + table entry declaring Repository address
Entity reputation?   → query + table entry declaring ENTITY_REGISTRAR_ADDRESS(0xaab) / ENTITY_LINKER_ADDRESS(0xaaa)
```

### Design Before Building

**Design thoroughly before calling the create operation** — there is no edit phase after creation (see The Immutability Contract above).

1. **Query available query instructions first**: Before designing any Guard that queries on-chain data, use `wowok_buildin_info` with info `"guard instructions"` to retrieve the complete list of available query instructions. Each query has a specific ID, name, parameters, and return type — you MUST verify these details before constructing your Guard. Never guess query instruction names or parameter types.
2. List every data dependency — what must the caller provide? What constants are baked in?
3. Sketch the logic tree — what comparisons, arithmetic, and logical combinations produce the final boolean?
4. Verify types — does every comparison receive compatible operands? Are all conversions explicit?
5. Test the tree mentally — what happens with edge case inputs? What happens if a query returns empty?

---

## Phase 2: Declare the Data Table

The Guard table is the **complete declaration of information** the Guard consumes. Every `identifier` node in the computation tree references exactly one table entry by its index number (0–255). Nothing outside the table is accessible.

### Table Entry Fields

| Field | Meaning | Required When |
|-------|---------|---------------|
| `identifier` | Unique index (0–255). The computation tree uses this number to reference the entry. | Always |
| `b_submission` | Whether the **caller** must provide this value at runtime. `true` = runtime submission; `false` = pre-set constant. | Always |
| `value_type` | The type of the value: Bool, Address, String, U8–U256, or vector types. Uses numeric type codes (use `wowok_buildin_info` with info `"value types"` for the complete mapping). | Always |
| `value` | The constant value when `b_submission` is false; a placeholder when `b_submission` is true. | When `b_submission` is false |
| `name` | Human-readable label describing what this entry represents. | Always |

### Design Rules

- **Every identifier in the tree must exist in the table.** Missing references cause creation to fail.
- **No duplicate identifiers.** Each index number must appear exactly once.
- **Non-submission entries must have a value.** These are baked into the Guard immutably.
- **Submission entries use placeholder values.** The actual value is provided by the caller at runtime.
- **Query target objects must be of type Address in the table.** Their `object_type` field should match the expected query target type (Progress, Order, Machine, Reward, etc.).
- **Querying EntityRegistrar or EntityLinker requires system address table entries.** Add entries for `ENTITY_REGISTRAR_ADDRESS` (`0xaab`) or `ENTITY_LINKER_ADDRESS` (`0xaaa`) to the table as Address-type constants when your query instruction targets these global registries. Without them, creation fails.
- **Maximum 256 table entries** (identifiers 0–255). The total serialized table size must not exceed 40000 bytes.
- **Submission entries must have descriptive `name` values.** For `b_submission: true` entries, `name` is the contract between Guard and caller — it tells callers what data they must provide. Use natural language that explains the purpose and necessity: "The order ID that identifies the target Order for verification" not `"order_id"`, "The signer's account address that will be compared against the authorized list" not `"addr"`. This is critical because callers see only this name when submitting data.

### The convert_witness Mechanism

`convert_witness` transforms a submitted object ID into its associated object — enabling queries across object relationships without requiring the caller to submit multiple IDs.

**Core principle**: Caller submits what they have (e.g., Order ID); Guard queries what it needs (e.g., Progress state) via witness conversion.

**Rules**:
- Witness type encodes source→target transformation
- Table entry's `object_type` must match witness source type
- Query instruction's object type must match witness target type
- Type mismatches cause Guard creation to fail

**Available witness types** are defined in the schema — query `wowok_buildin_info` with info `"guard instructions"` for the complete list with use cases.

**Notable**: `TypeArbArbitration (105)`: Arb and Arbitration are **different on-chain objects**. The witness queries the Arbitration (parent service) from an Arb (case) address — the binding is set when Arbitration creates the Arb. Schema describes this as "access arbitration configuration or fee settings."

---

## Phase 3: Build the Computational Tree

The root tree is a computational expression whose terminal nodes read data and whose intermediate nodes transform, compare, and combine that data. The root must return Bool.

### Tree Principles

- **Type safety is enforced at creation time.** Every node validates that its children return types compatible with its operation. A `logic_equal` node that receives a String child and a U64 child will fail validation.
- **Evaluation order is stack-based.** Children are evaluated in reverse, so the first child in the array appears at the top of the evaluation stack.
- **Every `identifier` node's index must exist in the table.** This is validated at creation time.

### Discovering Available Node Types

Guard computational trees are built from typed nodes. Rather than listing all possible nodes (which evolves with the system), query the authoritative schema dynamically:

**Tool**: `schema_query({ action: "get", name: "onchain_operations_guard" })`

This returns the complete `GuardNodeSchema` definition — every node type, its required fields, input/output types, and validation rules. Node categories include:

- **Data source nodes**: `identifier`, `context`, `query` — read values from the Guard table, transaction context, or on-chain objects
- **Logic & Arithmetic nodes**: `logic_*`, `calc_number_*` — combine values into boolean decisions and compute numeric results
- **String, Conversion & Vector nodes**: `calc_string_*`, `convert_*`, `vec_*` — manipulate strings, transform types, search arrays
- **Record query nodes**: `query_reward_record_*`, `query_progress_history_*` — search on-chain historical data

**Key principle**: Every node declares its return type and the types it expects from children. The schema enforces these constraints at Guard creation time — type mismatches cause creation to fail. All numeric comparisons normalize to U256, enabling cross-type comparisons without explicit conversion.

**Query instructions**: For the `query` node, discover available instructions via `wowok_buildin_info` with info `"guard instructions"`. Use the `filter` parameter to narrow results by name, return type, parameter count, or object type — more effective than browsing raw ID ranges.

---

## Phase 4: Create the Guard

Guard creation is a **single atomic operation** — it either succeeds (the Guard is frozen on-chain) or fails (nothing is created). There is no intermediate draft state, no editing phase, and no deletion mechanism.

### Operation

Use `onchain_operations` with `operation_type: "guard"`.

**Two creation modes**:
- `root.type: "node"` — build the computation tree directly in the operation payload.
- `root.type: "file"` — load the tree from a `guard2file`-exported JSON/Markdown file. Use this to iterate on existing Guards: export → edit file → create new Guard from file.

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_guard" })`

---

## Phase 5: Test, Export, and Query

### Test Independently with Gen Passport

Before embedding a Guard into a live Machine, Service, or Arbitration, test it in isolation.

**Tool**: `onchain_operations` with `operation_type: "gen_passport"`

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_gen_passport" })`

This tool verifies one or more Guards and, on success, generates an immutable Passport — a verified credential stored on-chain. Use it to:

- **Test edge cases**: What happens with empty submissions, boundary values, or unusual addresses?
- **Debug failures**: If the Guard rejects valid data, the error helps identify type mismatches or missing table entries.

The Passport itself is useful beyond testing — it serves as a reusable on-chain credential for offline verification, transaction condition checking, and multi-guard validation. A single Passport can satisfy multiple Guards in a single transaction.

**Multi-Guard behavior**: When verifying multiple Guards, they are AND-ed — all must pass for the Passport to be generated. Each Guard's submission is passed independently.

**Optional `info` field**: If you omit `info` (submission data), the system attempts to auto-fetch existing submissions from the Guard. Provide `info` explicitly when testing with custom inputs.

**Passport query**: Once generated, query the Passport object via `query_toolkit` → `onchain_objects` to inspect its data, validated Guards, and timestamp.

### Query On-Chain Guards

**Tool**: `query_toolkit` with `query_type: "onchain_objects"`

Guards are **public consensus**. Once bound to objects (Service, Machine, Arbitration), they become the trusted executor of rights and obligations. All parties can inspect the exact validation rules — this transparency is the foundation of trustless interaction. Query Guards before engaging with any protected operation.

Query results include `_guard_node_comments` — human-readable annotations for each computation node automatically injected by the system. Use these to quickly verify that the Guard's logic matches the intended design without manually decoding the node tree.

### Guard Iteration Workflow

Guards are immutable but iterable. The full cycle:

```
1. guard2file <existing_guard> → JSON/Markdown file
2. Edit file (table, root tree, rely)
3. Review edited JSON with user → confirm
4. onchain_operations(guard) with root.type="file" → new Guard created
5. Update all references (Machine forwards, Service buy_guard, Arbitration voting_guard, etc.)
```

---

## Guard Data Flow: How Objects Read Guard Data

Guards are not just validators — they are **data sources**. When bound to objects, Guards provide structured data that the object reads and uses for decision-making. This section explains how different object types interact with Guard data.

### Arbitration: Voting Weight from Guard

Arbitration uses `usage_guard` for eligibility (pass/fail) and `voting_guard` for vote weight — either fixed or dynamically read from a Guard table submission index (`GuardIdentifier`). Table must have a numeric entry at the `GuardIdentifier` index; the value becomes the voter's weight (cast to u32).

### Demand: ServiceGuard with Identifier Mapping

Demand's `ServiceGuard` validates recommendations. If `service_identifier` is set, the Guard submission value at that index is passed to the service for validation; if unset, only Guard pass/fail is checked.

### Machine: Forward Guard with Retained Submission

Machine's forward `guard` validates state transitions. If `retained_submission` is set, those submission values are stored in Progress for audit or subsequent validation.

### Repository: Policy Write Guard with Data Extraction

Repository's `write_guard` validates writes. If `id_from_submission` is set, reads entity ID from that submission index — **the index must be Address type**. If `data_from_submission` is set, reads data value from that index — **the value type must match the Repository's declared value_type**. Guard table must include entries for the data being extracted.

---

**Key Principle**: Design your Guard table based on what data the target object needs to read. Objects don't just validate — they consume Guard submissions as structured data inputs.

### Type Requirements by Object

Each object extracts Guard data with precise type expectations. Mismatches cause creation or runtime failure:

| Object | Extraction Field | Table Index Requirement | Type Constraint |
|--------|-----------------|------------------------|-----------------|
| **Arbitration** `voting_guard` | Vote weight via `GuardIdentifier(u8)` | Index must be `b_submission: true` | **Numeric** (U8–U256, cast to u32) |
| **Demand** `ServiceGuard` | `service_identifier` mapping | Index must be `b_submission: true` | Depends on Service validation |
| **Machine** Forward | `retained_submission` | Index must be `b_submission: true`; uniquely located by `node→next_node→forward` triple | As declared in table |
| **Repository** | `id_from_submission` | Index must be `b_submission: true` | **Must be Address** |
| **Repository** | `data_from_submission` | Index must be `b_submission: true` | **Must match Repository's value_type** |

---

## Best Practices

### Common Pitfalls

1. **Undefined table identifiers**: Every `identifier` node in the tree must match an entry in the table. Missing entries cause creation failure — validate your tree against your table before submitting.

2. **Type mismatches in comparison nodes**: A `logic_equal` comparing a String to a U64 fails validation. Use explicit conversion nodes (`convert_string_number`, `convert_number_string`) when types differ. Numeric comparisons use `logic_as_u256_*` variants which auto-widen to U256.

3. **Wrong query instruction IDs or parameter counts**: Query instructions are system-defined. Always discover them through `wowok_buildin_info` with info `"guard instructions"`. The parameter count and types in your query node must match the instruction exactly — off-by-one parameter counts are a common failure.

4. **Missing convert_witness**: When accessing Progress data from an Order ID in the table, the query node needs `convert_witness` with the appropriate witness type. Without it, the runtime looks for a Progress at the Order's address — which does not exist as a Progress object. The creation-time validation catches this mismatch.

5. **Testing with production durations**: Set time-lock durations to small values (e.g., 1000 milliseconds) during testing. Increase to production values only after verifying the logic works correctly. A Guard with a 30-day lock tested with real durations cannot produce results for a month.

6. **Forgetting to export before recreating**: Guards are immutable. If you need to change one, export it first with `guard2file` so you have the exact on-chain definition as a reference. Then create a new Guard with a versioned name and update all references.

7. **Root not returning Bool**: The outermost node of the tree must produce Bool. Logic and comparison nodes return Bool; arithmetic, conversion, and string operation nodes do not. Ensure your tree terminates at a logic or comparison node — the creation validation will reject non-Bool roots.

8. **Dependency on non-standalone Guards**: A Guard's `rely` entries must reference Guards with `rep: true` — meaning they have no external Repository dependency. Guards that depend on a Repository (`rep: false`) cannot serve as dependencies. The contract layer catches violations at creation time.

9. **Forgetting voting_guard weight type validation**: When using `GuardIdentifier`, the referenced identifier must exist in the guard's table and its value type must be numeric. The system checks this when the VotingGuard is added to the Arbitration — if the identifier does not exist or is non-numeric, the operation reverts with `E_GUARD_IDENTIFIER_NOT_NUMBER`.

10. **Not checking Arbitration pause state**: Even with a valid usage_guard Passport, the dispute fails if the Arbitration is paused (`bPaused: true`). The pause check happens before the guard check — advise customers to verify the Arbitration is active before generating Passports.

---

## Tool Reference

| Tool | Purpose |
|------|---------|
| `wowok_buildin_info` (`info: "guard instructions"`) | Discover all available query instructions — their IDs, parameter types, return types, and target object types |
| `wowok_buildin_info` (`info: "value types"`) | Discover the numeric codes for all supported value types used in table entries |
| `wowok_buildin_info` (`info: "built-in permissions"`) | Discover all built-in permission index codes for use with `permission.entity.perm has` queries |
| `onchain_operations` (`operation_type: "gen_passport"`) | Test Guard validation with runtime submissions and generate a verified on-chain credential on success |
| `guard2file` | Export an existing Guard's complete definition (description, table, root tree, dependencies) to a local JSON or Markdown file |
| `query_toolkit` (`query_type: "onchain_objects"`) | Query any Guard object on-chain by name or address to inspect its full definition |
| `schema_query` (`name: "onchain_operations_guard"`) | Retrieve the complete Guard operation schema with all parameter definitions |

---

---

## Appendices (Progressive Disclosure)

> The following sections have been extracted to [APPENDIX.md](./APPENDIX.md) for on-demand loading:
> - Dialogue Scripts (R1-R10) — guided conversation scripts
> - Decision Trees — branching logic reference
> - Failure Playbooks — recovery scenarios
> - Tier Layering — expertise-tier based guidance
>
> Load APPENDIX.md when the user needs guided dialogue, recovery help, or tier-specific guidance.
