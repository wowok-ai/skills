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

**The rely is composition**: Up to 4 dependent Guards. When `rely.logic_or` is false (default), all dependencies must pass (AND). When true, any passing is sufficient (OR). A Guard can only depend on Guards with `rep: true` — `rep` indicates the Guard's `repository.data` queries (query 1167) do not depend on runtime submissions, so results are deterministic and the Guard can serve as a dependency. Guards with `rep: false` cannot appear in `rely` lists. Violations are caught by the contract layer at creation time.

### Data Source 4 Classification — The Foundation of Guard Semantics

A Guard is fundamentally a **data computation tree**: deterministic data (on-chain constants + system context) + submitted data (runtime, semi-open) → derived through finite operation rules → a single boolean result. Every leaf node in the computation tree draws data from one of **4 data source classifications**. Understanding these 4 classifications is essential for designing and interpreting Guards.

| Type | Name | SDK Manifestation | Native Opcode | Trust Level | Typical Scenario |
|------|------|-------------------|---------------|-------------|------------------|
| **Type 1** | OnChainConstant | `query` + `identifier` (`b_submission: false`, no witness) | TYPE_QUERY + TYPE_CONSTANT | Highest | Query fields of already-published Service/Machine/Reward objects |
| **Type 2** | WitnessDerived | `query` + `identifier` + `convert_witness` (100-108) | TYPE_QUERY + witness_byte | High (source trusted + deterministic derivation) | Order → Progress query via witness=100 |
| **Type 3** | SubmittedObject | `query` + `identifier` (`b_submission: true`, no witness) | TYPE_QUERY + TYPE_CONSTANT | Medium (requires constraint rules) | User submits Order address for field query |
| **Type 4** | SystemContext | `context` (Signer/Clock/Guard) | TYPE_SIGNER / TYPE_CLOCK / TYPE_GUARD | Highest | Identity verification, time-locks |

**Key insights**:
1. **Type 1 and Type 3 are isomorphic at the native layer** — both use TYPE_QUERY+TYPE_CONSTANT; the only difference is the `b_submission` flag (false vs true)
2. **Type 2 can overlay on Type 1 or Type 3** — the source object can be a constant (Type 1) or a submission (Type 3), then witness derives the target object
3. **Type 4 is fully independent** — does not depend on the table
4. **Except for Type 4, all data must be declared in the table** — the table is the complete data contract between Guard and caller

**The table as data contract**: The table declares:
- **Deterministic data** (`b_submission: false`): type + value, baked at creation, immutable
- **Submitted data** (`b_submission: true`): type only (1-byte placeholder), value provided by caller at runtime — **must have constraint rules designed, otherwise empty data is meaningless**

**Guard essence**: A deterministic data set (Type 1 + Type 4) + submitted data (Type 3, must have constraint rules and defined types) → derived through finite operation rules → a single boolean result. The semantics are deterministic — you only need to fill in the "data object source meaning" and "field meaning" (e.g., "the permission address of service A", "the current node time of workflow B").

### Verifier Constraint Levels — Designing Who Can Pass

When a Guard uses `context(Signer)`, the designer chooses how strictly to constrain the verifier's identity. Three levels exist, trading off **security** against **convenience**. Evaluating designer intent and dismantling the semantic execution plan across these levels is a core capability — choose the right level for each scene.

#### Level 1 — Strict Single-Identity Binding (avoid unless justified)

**Pattern**: `logic_equal[context(Signer), identifier[N](fixed_address)]`

- **Maximally secure**: only ONE address can pass
- **Maximally inconvenient**: if that address is unavailable (key loss, personnel change, rotation), the Guard permanently blocks the operation — Guards are **immutable** after publish
- **Use only when**: the role is permanently tied to one address AND the designer explicitly accepts the lock-in risk
- **Risk rule**: `R-C4-04` (info) flags this pattern with a convenience reminder
- **Example**: `logic_equal[context(Signer), identifier[5](myshop_merchant)]`

> ⚠️ **Avoid Level 1 unless you understand the lock-in risk.** Prefer Level 2 (identity-set) or Level 3 (scene-combined) whenever possible.

#### Level 2 — Identity-Set Binding (recommended for role-based access)

**Pattern**: `logic_or` of multiple identity checks — Signer is ANY of a valid set.

**Key semantic insight — Address vs Bool return types**:
Guard queries that verify identity fall into two categories based on their return type, and this determines how they participate in a `logic_or`:

| Return Type | Query Examples | Construction in `logic_or` |
|-------------|---------------|---------------------------|
| **Address** | `1562 order.owner`, `1002 permission.owner`, `1488 service.permission` | Must wrap each in `logic_equal[query, context(Signer)]` to produce a Bool |
| **Bool** (suffix "has") | `1567 order.agent has`, `1004 permission.admin has`, `1006 permission.entity has` | Use **directly** as a `logic_or` child — they already return a verdict; pass `context(Signer)` as a parameter |

**Example — Order-holder identity set** (Signer is owner OR agent):
```json
{
  "type": "logic_or",
  "nodes": [
    {
      "type": "logic_equal",
      "nodes": [
        {"type": "query", "query": 1562, "object": {"identifier": 0}, "parameters": []},
        {"type": "context", "context": "Signer"}
      ]
    },
    {
      "type": "query",
      "query": 1567,
      "object": {"identifier": 0},
      "parameters": [{"type": "context", "context": "Signer"}]
    }
  ]
}
```
Here `1562` returns Address → wrapped in `logic_equal`; `1567` returns Bool → used directly with `context(Signer)` as its parameter.

**Example — Service-provider identity set** (Signer is permission.owner OR has admin):

Three sub-patterns with increasing flexibility:

1. **Static permission address** (simplest, breaks if Service rotates permission):
   Query `1002`/`1004` against a table-constant permission address. If the Service changes its permission (like a company changing its board), the Guard must be rebuilt.

2. **Dynamic permission address** (survives rotation — **RECOMMENDED**):
   The caller submits a permission address; the Guard verifies `query(1488: service.permission) == submitted_perm`, then checks `1002`/`1004` against the submitted permission. This survives permission rotation without rebuilding the Guard.

3. **Repository-based address set** (most flexible, most complex — **only for extreme flexibility needs**):
   The permission address set is stored in a Repository and queried dynamically. This allows runtime configuration of the authorized set, but adds significant complexity.

> 💡 **`logic_or` wrapping of the Signer check suppresses R-C4-04** — this is the recommended Level 2 alternative to Level 1 strict binding.

#### Level 3 — Scene-Combined Constraint (verify whether Signer binding is even needed)

Before adding any Signer binding, evaluate the Guard's usage scene. **Many scenes do not need Signer binding at all** — the scene itself ensures safety through other mechanisms.

| Scene | Is Signer binding needed? | Why |
|-------|--------------------------|-----|
| Service `order_allocators` + `sharing.who=Entity` | **NO** | Funds flow to a fixed Treasury/address regardless of caller — `sharing.who` already guarantees recipient safety (R-C3-06 safe) |
| Service `order_allocators` + `sharing.who=Signer` | **YES (Level 2 dynamic)** | Funds flow to caller — must bind Signer to authorized recipient (e.g., `order.owner`) |
| Machine `forward` guard | **MAYBE** | Forward's `permissionIndex`/`namedOperator` already verifies operator permission; Signer binding only needed if submitted data must belong to operator |
| Service `buy_guard` | **Usually NO** | The customer is the caller; identity checks via whitelist/credentials suffice |
| Reward `guard` | **Depends** | If claim is one-time (record count), no Signer binding needed; if claim amount is submitted, bind Signer |
| Arbitration `voting_guard` | **NO** (weight from query, not Signer) | Weight must come from on-chain EntityRegistrar, not submission (R-C3-02) |

**Decision flow**:
1. Does the scene's host object already verify the operator? (e.g., Machine forward) → Signer binding may be redundant
2. Does `sharing.who` route funds to a fixed recipient? → Signer binding unnecessary (R-C3-06 safe)
3. Does the resource flow matter more than who triggers it? → Focus on flow safety, not caller identity
4. Only if resources flow to the caller AND no other layer verifies identity → add Level 2 Signer binding

#### One Guard One Purpose Principle

Each Guard should serve **ONE specific purpose**, documented in its `description`:
- **Scenario**: where the Guard is attached (which host object, which binding field)
- **Verification rules**: concise statement of what conditions are checked
- **Risk notes**: which risks are mitigated (R-C3-01/05/06, etc.) and which trade-offs apply
- **Verifier constraint level**: which Level (1/2/3) is used and why

General-purpose Guards designed for `rely` composition are the exception — they need explicit general rules and composition documentation. All other Guards should be single-purpose.

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
| `value_type` | The type of the value: Bool, Address, String, U8–U256, or vector types. Accepts both string names (preferred, e.g., `"Address"`, `"U64"`) and numeric codes (e.g., `1`, `6`). Use `wowok_buildin_info` with info `"value types"` for the complete mapping. SDK deserialization returns string names. | Always |
| `value` | The constant value when `b_submission` is false; a placeholder when `b_submission` is true. | When `b_submission` is false |
| `name` | Human-readable label describing what this entry represents. | Always |

### Design Rules

- **Every identifier in the tree must exist in the table.** Missing references cause creation to fail.
- **No duplicate identifiers.** Each index number must appear exactly once.
- **Non-submission entries must have a value.** These are baked into the Guard immutably.
- **Submission entries use placeholder values.** The actual value is provided by the caller at runtime.
- **Query target objects must be of type Address in the table.** The `object_type` field is **automatically filled by the SDK** based on the first query node referencing this identifier (it is NOT a user-provided field). The SDK infers the object type from the query instruction's target object type (Progress, Order, Machine, Reward, etc.).
- **Querying EntityRegistrar or EntityLinker requires system address table entries.** Add entries for `ENTITY_REGISTRAR_ADDRESS` (`0xaab`) or `ENTITY_LINKER_ADDRESS` (`0xaaa`) to the table as Address-type constants when your query instruction targets these global registries. Without them, creation fails.
- **Maximum 256 table entries** (identifiers 0–255). The total serialized table size must not exceed 40000 bytes.
- **Submission entries must have descriptive `name` values.** For `b_submission: true` entries, `name` is the contract between Guard and caller — it tells callers what data they must provide. Use natural language that explains the purpose and necessity: "The order ID that identifies the target Order for verification" not `"order_id"`, "The signer's account address that will be compared against the authorized list" not `"addr"`. This is critical because callers see only this name when submitting data.

### The convert_witness Mechanism

`convert_witness` transforms a source object ID into its associated target object — enabling queries across object relationships without requiring the caller to submit multiple IDs. This is the **Type 2 (WitnessDerived)** data source.

**Core principle**: Witness is a "read the source object's associated field" mechanism (not a lookup table, not an independent index). It is a one-to-one deterministic derivation of object relationships with only 9 derivation types. Caller submits what they have (e.g., Order ID); Guard queries what it needs (e.g., Progress state) via witness conversion.

**Rules**:
- Witness type encodes source→target transformation
- Table entry's `object_type` (auto-filled by SDK) must match witness source type
- Query instruction's object type must match witness target type
- Type mismatches cause Guard creation to fail
- Multi-hop witnesses (106-108) require intermediate objects to exist

**Complete 9 witness types** (defined in `guard.rs#L34-L65`):

| Code | Name | Source → Target | Derivation | Hops |
|------|------|-----------------|------------|------|
| 100 | TypeOrderProgress | Order → Progress | read order.progress field | 1 |
| 101 | TypeOrderMachine | Order → Machine | read order.machine field | 1 |
| 102 | TypeOrderService | Order → Service | read order.service field | 1 |
| 103 | TypeProgressMachine | Progress → Machine | read progress.machine field | 1 |
| 104 | TypeArbOrder | Arb → Order | read arb.order field | 1 |
| 105 | TypeArbArbitration | Arb → Arbitration | read arb.arbitration field | 1 |
| 106 | TypeArbProgress | Arb → Progress | arb.order → order.progress | 2 (multi-hop) |
| 107 | TypeArbMachine | Arb → Machine | arb.order → order.machine | 2 (multi-hop) |
| 108 | TypeArbService | Arb → Service | arb.order → order.service | 2 (multi-hop) |

**Key notes**:
- **Type 2 can overlay on Type 1 or Type 3**: The source object can be a constant (Type 1, `b_submission: false`) or a submission (Type 3, `b_submission: true`). The witness then derives the target object.
- **Multi-hop witnesses (106-108)**: Arb → Progress/Machine/Service uses two hops (Arb → Order → target). The intermediate Order object must exist for the derivation to succeed.
- **TypeArbArbitration (105)**: Arb and Arbitration are **different on-chain objects**. The witness queries the Arbitration (parent service) from an Arb (case) address — the binding is set when Arbitration creates the Arb.
- **Available witness types** are also discoverable via `wowok_buildin_info` with info `"guard instructions"`.

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

**Important — impack_list semantics in verify phase**: When a Guard queries Repository data (query 1167 `repository.data`) with a policy that has a `quote_guard` set, the verification checks whether the quote_guard address is in the `impack_list`. However, `impack_list` is **always empty during the `verify_guard` phase** — `Passport.new()` initializes `impack:vector[]` and the verify loop never modifies it; `impack` is only populated in `result_for_permission` (after verify completes). This means a Repository query with `quote_guard = Some(addr)` will always fail with `IMPACK_GUARD_NOT_FOUND` in the gen_passport flow; only `quote_guard = None` passes. Verify the quote_guard mechanism's design intent before relying on it.

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

> The full constraint system has **33 rules: 22 creation-phase + 11 runtime-phase**. The 22 creation-phase constraints below are all enforced by SDK + native `validate_guard_data`; runtime constraints are enforced by native `verify_guard`.

#### Creation-Phase Constraints (22 items, enforced by SDK + native `validate_guard_data`)

**Root (1 item)**

1. **ROOT_01 — Root must return Bool**: The outermost node of the tree must produce Bool. Logic and comparison nodes return Bool; arithmetic, conversion, and string operation nodes do not. Ensure your tree terminates at a logic or comparison node — the creation validation will reject non-Bool roots.

**Table (5 items)**

2. **TABLE_01 — Identifier uniqueness**: Every `identifier` in the table must be unique (0–255). Duplicate identifiers cause creation failure. SDK uses `lodash.groupBy` to detect duplicates.

3. **TABLE_02 — Identifier referential integrity**: Every `identifier` node in the computation tree must match an entry in the table. Missing entries cause creation failure — validate your tree against your table before submitting.

4. **TABLE_03 — Constant value non-empty**: When `b_submission=false`, the `value` field must be non-empty. These values are baked into the Guard immutably at creation time.

5. **TABLE_04 — Table size limits**: Maximum 256 table entries (identifiers 0–255), and the total serialized table size must not exceed 40000 bytes (BCS). Enforced by Move `guard::new`.

6. **TABLE_05 — Submission value is 1-byte type code**: When `b_submission=true`, the `value` field is only a 1-byte type code placeholder (the actual value is provided at runtime). Enforced by native `deserialize_constants`.

**Query (4 items)**

7. **QUERY_01 — Query instruction ID valid**: Query instruction IDs are system-defined. Always discover them through `wowok_buildin_info` with info `"guard instructions"`. Invalid IDs cause creation failure.

8. **QUERY_02 — Parameter count matches**: The parameter count and types in your query node must match the instruction exactly — off-by-one parameter counts are a common failure.

9. **QUERY_03 — Return type compatible**: The query node's return type must be compatible with the parent node's expected input. A `logic_equal` comparing a String to a U64 fails validation. Use explicit conversion nodes (`convert_string_number`, `convert_number_string`) when types differ. Numeric comparisons use `logic_as_u256_*` variants which auto-widen to U256.

10. **QUERY_04 — Object identifier is Address type**: The table entry referenced by a query node's `object.identifier` must have `value_type: Address`. SDK `buildNode` validates this at L603-609.

**Witness (3 items)**

11. **WITNESS_01 — Witness type valid (100-108)**: The `convert_witness` value must be one of the 9 valid witness types (100-108). Invalid witness types cause creation failure.

12. **WITNESS_02 — Witness target matches query objectType**: The witness's target object type must match the query instruction's expected object type. For example, `TypeOrderProgress` (100) derives a Progress, so the query must target a Progress object. SDK `buildNode` validates this at L613-619.

13. **WITNESS_03 — Witness source matches table object_type**: If the table entry has an `object_type` declared (auto-filled by SDK), it must match the witness's source object type. For example, `TypeOrderProgress` (100) expects an Order source, so the table entry's `object_type` must be Order. SDK `buildNode` validates this at L622-631. **Missing convert_witness** is a related failure: when accessing Progress data from an Order ID, the query node needs `convert_witness` with the appropriate witness type. Without it, the runtime looks for a Progress at the Order's address — which does not exist as a Progress object.

**Rely (3 items)**

14. **RELY_01 — Dependency count ≤ 4**: A Guard can depend on at most 4 other Guards (`MAX_DEPENDED_COUNT`). SDK `reliesAdd` enforces this limit.

15. **RELY_02 — Dependencies must have rep=true**: A Guard's `rely` entries must reference Guards with `rep: true` — meaning their `repository.data` queries do not depend on runtime submissions. Guards that depend on a Repository via submitted addresses (`rep: false`) cannot serve as dependencies. Move `guard::relies_add` catches violations at creation time.

16. **RELY_03 — No self-reference**: A Guard cannot depend on itself. SDK `reliesAdd` prevents self-referential rely entries.

**Binding (3 items)**

17. **BINDING_01 — voting_guard GuardIdentifier must be numeric**: When using `GuardIdentifier` for Arbitration `voting_guard`, the referenced table entry must have a numeric `value_type` (U8–U256). The system checks this when the VotingGuard is added to the Arbitration — if the identifier does not exist or is non-numeric, the operation reverts with `E_GUARD_IDENTIFIER_NOT_NUMBER`.

18. **BINDING_02 — Repository id_from_submission must be Address**: When a Repository `write_guard` uses `id_from_submission`, the referenced table entry must have `value_type: Address`. Move Repository enforces this at binding time.

19. **BINDING_03 — Repository data_from_submission type must match**: When a Repository `write_guard` uses `data_from_submission`, the referenced table entry's `value_type` must match the Repository's declared `value_type`. Move Repository enforces this at binding time.

**Input (2 items)**

20. **INPUT_01 — Root bytecode non-empty**: The serialized root computation tree must not be empty. SDK `newGuard` validates this before submission.

21. **INPUT_02 — Root bytecode size ≤ MAX_INPUT_SIZE**: The serialized root computation tree must not exceed `MAX_INPUT_SIZE`. SDK `newGuard` validates this before submission.

**Immutable (1 item)**

22. **IMMUTABLE_01 — Guard becomes immutable after creation**: Once `guard::create` is called, the Guard's `immutable` flag is set to `true` and no further modifications are possible. This is the foundation of the immutability contract — to change a Guard, export via `guard2file`, create a new Guard, and update all references.

#### Practical Tips (not strict constraints, but strongly recommended)

- **Testing with production durations**: Set time-lock durations to small values (e.g., 1000 milliseconds) during testing. Increase to production values only after verifying the logic works correctly. A Guard with a 30-day lock tested with real durations cannot produce results for a month.
- **Forgetting to export before recreating**: Guards are immutable. If you need to change one, export it first with `guard2file` so you have the exact on-chain definition as a reference. Then create a new Guard with a versioned name and update all references.
- **Not checking Arbitration pause state**: Even with a valid usage_guard Passport, the dispute fails if the Arbitration is paused (`bPaused: true`). The pause check happens before the guard check — advise customers to verify the Arbitration is active before generating Passports.

#### Runtime-Phase Constraints (enforced by native `verify_guard`)

These constraints are checked at Guard verification time (gen_passport or actual usage), not at creation. They are often overlooked because creation succeeds but runtime fails:

- **RUN_IMMUTABLE_01**: Guard must have `immutable=true` to be verified. A Guard that hasn't been finalized via `guard::create` cannot be used.
- **RUN_SUB_01**: The submission's `value[0]` (type byte) must match the table declaration. A submission with the wrong type byte is rejected.
- **RUN_SUB_02**: Every table entry with `b_submission=true` must have a corresponding submission value. Missing submissions cause failure.
- **RUN_SUB_03**: Total submission bytes must be ≤ `MAX_SUBMISSION_SIZE` (256).
- **RUN_WITNESS_01/02**: When witness conversion runs, the source object must have the associated field, and the derived target object must exist. Multi-hop witnesses (106-108) require the intermediate Order object to exist.
- **RUN_QUERY_01**: The query target object must exist and its type must match.
- **RUN_IMPACK_01/02**: At least one impack guard is required; an impack guard failure fails the entire passport. **Note**: `impack_list` is always empty during verify (see Repository section above), so quote_guard queries will fail unless `quote_guard = None`.
- **RUN_TX_01**: The Passport's `tx_hash` must match the current transaction.
- **RUN_RELY_01**: Rely guards must have been added to the passport.

### Readability Conventions — Prefer String Names Over Numeric IDs

> **Built-in MCP convention**: Whenever the schema accepts BOTH a numeric ID and a human-readable string name for the same field, **always prefer the string name** in examples, documentation, and AI-generated JSON. Numeric IDs are accepted for backward compatibility and compact machine output, but string names are the canonical form for any human-readable artifact.

This convention is grounded in the user-experience principle: *"Wherever the interface supports it, optimize from the user's understanding as the starting point."* A reader who sees `"query": "order.service"` understands the intent immediately; `"query": 1563` requires an extra lookup against the `GUARDQUERY` registry.

#### Fields Affected

| Field | String form (preferred) | Numeric form (avoid) | Source of truth |
|-------|-------------------------|----------------------|-----------------|
| `query` | `"order.service"` | `1563` | `GUARDQUERY` registry (375 entries, exported by `@wowok/wowok`) |
| `value_type` | `"Address"`, `"U64"`, `"String"` | `1`, `6`, `2` | `ValueType` enum |
| `context` | `"Signer"`, `"Clock"`, `"Guard"` | (numeric not accepted) | `Context` enum |
| `convert_witness` | `"OrderProgress"`, `"OrderMachine"` | `100`, `101` | `WitnessType` enum (SDK `parseWitnessType` / `witnessTypeToString`) |

#### Why String Names

1. **Self-documenting JSON** — `"query": "order.service"` reads as intent; `1563` is opaque.
2. **Stable across registry renumbering** — names are part of the public contract; numeric IDs are an implementation detail.
3. **Case-insensitive matching** — `isValidGuardQueryName` lowercases both sides, so `"Order.Service"` and `"order.service"` are equivalent. Use the canonical lowercase form in examples.
4. **Lint-friendly** — string names survive refactoring; numeric IDs silently rot when an ID is deprecated.

#### Canonical Name Examples

The most common queries used in allocator Guards (R-C3-05 / R-C3-06 protection):

| Numeric ID | Canonical name | Returns | Typical use |
|------------|----------------|---------|-------------|
| `1253` | `progress.current` | String | Verify order is at a named node (with `convert_witness: 100`) |
| `1563` | `order.service` | Address | Cross-service theft protection (R-C3-05) |
| `1562` | `order.owner` | Address | Signer binding for refunds (R-C3-06 Level 2 dynamic) |
| `1272` | `progress.current_time` | U64 | Time-lock comparisons |
| `1488` | `service.permission` | Address | Verify Service's Permission object |
| `1002` | `permission.owner` | Address | Signer == permission owner (Level 1 fixed) |
| `1004` | `permission.admin has` | Bool | Caller is in admin set (Level 2 identity-set) |
| `1567` | `order.agent has` | Bool | Verify caller is an order agent |

#### WitnessType String Names

The `convert_witness` field accepts both numeric IDs (100-108) and string names. String matching is case-insensitive and accepts both the full enum name (`"TypeOrderProgress"`) and the shortened form without the `"Type"` prefix (`"OrderProgress"`). The shortened form is preferred for readability.

| Numeric ID | Shortened name (preferred) | Full enum name | Source → Target |
|------------|----------------------------|----------------|-----------------|
| `100` | `"OrderProgress"` | `"TypeOrderProgress"` | Order → Progress |
| `101` | `"OrderMachine"` | `"TypeOrderMachine"` | Order → Machine |
| `102` | `"OrderService"` | `"TypeOrderService"` | Order → Service |
| `103` | `"ProgressMachine"` | `"TypeProgressMachine"` | Progress → Machine |
| `104` | `"ArbOrder"` | `"TypeArbOrder"` | Arb → Order |
| `105` | `"ArbArbitration"` | `"TypeArbArbitration"` | Arb → Arbitration |
| `106` | `"ArbProgress"` | `"TypeArbProgress"` | Arb → Progress |
| `107` | `"ArbMachine"` | `"TypeArbMachine"` | Arb → Machine |
| `108` | `"ArbService"` | `"TypeArbService"` | Arb → Service |

SDK functions: `parseWitnessType(input)` converts string→number; `witnessTypeToString(type)` converts number→string (returns the shortened form). The SDK's Guard deserialization (`parseQueryNode`) already returns `convert_witness` as a string name.

#### Deserialization Output — All Protocol Constants Return Strings

The SDK's Guard deserialization (`query_objects` / `guard2file`) returns ALL protocol constants as user-friendly strings, not numeric IDs:

| Field | Returned as | Example | Conversion function |
|-------|-------------|---------|---------------------|
| `query` | String name | `"order.service"` | `GUARDQUERY` registry lookup |
| `value_type` | String name | `"Address"`, `"U64"` | `valueTypeToString()` |
| `convert_witness` | String name | `"OrderProgress"` | `witnessTypeToString()` |
| `context` | String literal | `"Signer"`, `"Clock"`, `"Guard"` | Hardcoded string |
| `object_type` | String name | `"Order"`, `"Service"` | `numberToObjectType` mapping |
| `type` (node discriminator) | String literal | `"logic_and"`, `"query"` | Always string |

This means `guard2file` JSON/Markdown output and `query_objects` results are fully self-documenting without requiring numeric ID lookups.

#### Example — Before and After

**Before (numeric, opaque):**
```json
{
  "type": "logic_equal",
  "nodes": [
    {"type": "query", "query": 1563, "object": {"identifier": 0, "convert_witness": 100}, "parameters": []},
    {"type": "identifier", "identifier": 2}
  ]
}
```

**After (string, self-documenting):**
```json
{
  "type": "logic_equal",
  "nodes": [
    {"type": "query", "query": "order.service", "object": {"identifier": 0, "convert_witness": "OrderProgress"}, "parameters": []},
    {"type": "identifier", "identifier": 2}
  ]
}
```

Both forms are schema-valid and produce identical on-chain behavior; the string form is preferred for all human-readable output.

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
