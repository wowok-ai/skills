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

**The table is the contract with callers**: It declares what data they must provide at runtime (`b_submission: true`) versus what the Guard already knows (`b_submission: false`). Every `identifier` node references exactly one table entry. **The root is the question**: It must return Bool; intermediate nodes return numbers/strings/addresses/vectors. Guard is **strongly typed** — type mismatches cause creation failure. **The rely is composition**: Up to 4 dependent Guards (AND by default, OR if `logic_or: true`). A Guard can only depend on Guards with `rep: true` (deterministic `repository.data` queries independent of runtime submissions). `rep: false` Guards cannot appear in `rely` lists — violations caught at creation time.

### Data Source 4 Classification — The Foundation of Guard Semantics

A Guard is fundamentally a **data computation tree**: deterministic data (on-chain constants + system context) + submitted data (runtime, semi-open) → derived through finite operation rules → a single boolean result. Every leaf node in the computation tree draws data from one of **4 data source classifications**. Understanding these 4 classifications is essential for designing and interpreting Guards.

| Type | Name | SDK Manifestation | Native Opcode | Trust Level | Typical Scenario |
|------|------|-------------------|---------------|-------------|------------------|
| **Type 1** | OnChainConstant | `query` + `identifier` (`b_submission: false`, no witness) | TYPE_QUERY + TYPE_CONSTANT | Highest | Query fields of already-published Service/Machine/Reward objects |
| **Type 2** | WitnessDerived | `query` + `identifier` + `convert_witness` (100-108) | TYPE_QUERY + witness_byte | High (source trusted + deterministic derivation) | Order → Progress query via witness=100 |
| **Type 3** | SubmittedObject | `query` + `identifier` (`b_submission: true`, no witness) | TYPE_QUERY + TYPE_CONSTANT | Medium (requires constraint rules) | User submits Order address for field query |
| **Type 4** | SystemContext | `context` (Signer/Clock/Guard) | TYPE_SIGNER / TYPE_CLOCK / TYPE_GUARD | Highest | Identity verification, time-locks |

**Key insights**: Type 1 and Type 3 are isomorphic at the native layer (both TYPE_QUERY+TYPE_CONSTANT; difference is `b_submission` flag). Type 2 overlays on Type 1 or Type 3 (source object can be constant or submission, then witness derives target). Type 4 is fully independent (no table dependency). Except for Type 4, all data must be declared in the table — the table is the complete data contract: deterministic data (`b_submission: false`, type+value baked at creation) + submitted data (`b_submission: true`, type only, value from caller at runtime — **must have constraint rules designed, otherwise empty data is meaningless**).

**Guard essence**: A deterministic data set (Type 1 + Type 4) + submitted data (Type 3, must have constraint rules and defined types) → derived through finite operation rules → a single boolean result. You only need to fill in the "data object source meaning" and "field meaning" (e.g., "the permission address of service A", "the current node time of workflow B").

### Verifier Constraint Levels — Designing Who Can Pass

Three levels trade off **security** vs **convenience** when using `context(Signer)`:

**Level 1 — Single-Identity** (`logic_equal[context(Signer), identifier[N](fixed_address)]`): Only ONE address passes. ⚠️ Avoid — if address unavailable (key loss, rotation), Guard permanently blocks. Risk rule `R-C4-04` flags this.

**Level 2 — Identity-Set** (recommended): `logic_or` of multiple identity checks. Key distinction:
- **Address-returning queries** (`order.owner`, `permission.owner`, `service.permission`): wrap in `logic_equal[query, context(Signer)]`
- **Bool-returning queries** (suffix "has": `order.agent has`, `permission.admin has`): use directly as `logic_or` child, pass `context(Signer)` as parameter
- **Dynamic permission** (RECOMMENDED): caller submits permission address; Guard verifies `service.permission == submitted_perm` then checks `permission.owner`/`permission.admin has`. Survives permission rotation.

**Level 3 — Scene-Combined** (verify if Signer binding is even needed):

| Scene | Signer needed? | Why |
|-------|---------------|-----|
| Allocators + `sharing.who=Entity` | NO | Funds to fixed recipient (R-C3-06 safe) |
| Allocators + `sharing.who=Signer` | YES (Level 2) | Funds to caller — must bind |
| Machine `forward` guard | MAYBE | `permissionIndex`/`namedOperator` may suffice |
| `buy_guard` | Usually NO | Customer is caller; whitelist/credentials suffice |
| `voting_guard` | NO | Weight from EntityRegistrar, not Signer (R-C3-02) |

**Decision**: If host object already verifies operator OR `sharing.who` routes to fixed recipient → no Signer binding needed. Only add Level 2 when resources flow to caller AND no other layer verifies identity.

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

Query the authoritative `GuardNodeSchema` via `schema_query` (name: `onchain_operations_guard`) — it returns every node type, required fields, input/output types, and validation rules. Categories include: data source nodes (`identifier`, `context`, `query`), logic/arithmetic nodes (`logic_*`, `calc_number_*`), string/conversion/vector nodes (`calc_string_*`, `convert_*`, `vec_*`), and record query nodes (`query_reward_record_*`, `query_progress_history_*`).

**Key principle**: Every node declares its return type and the types it expects from children. The schema enforces these constraints at Guard creation time — type mismatches cause creation to fail. All numeric comparisons normalize to U256, enabling cross-type comparisons without explicit conversion. For the `query` node, discover available instructions via `wowok_buildin_info` ("guard instructions") with `filter` to narrow by name/return type/parameter count/object type.

---

## Phase 4: Create the Guard

Guard creation is a **single atomic operation** — it either succeeds (the Guard is frozen on-chain) or fails (nothing is created). There is no intermediate draft state, no editing phase, and no deletion mechanism.

Use `onchain_operations` (`operation_type: "guard"`) with `root.type: "node"` (inline tree) or `root.type: "file"` (load from `guard2file`-exported JSON/MD — use this to iterate on existing Guards: export → edit → create new).

---

## Phase 5: Test, Export, and Query

**Test**: `gen_passport` verifies one or more Guards (AND-ed) and generates an immutable Passport on success. Omit `info` to auto-fetch submissions, or provide explicitly for custom test inputs.

**Query**: `query_toolkit` → `onchain_objects` for any Guard. Results include `_guard_node_comments` (human-readable annotations per node). Guards are public consensus — all parties can inspect validation rules.

**Iteration**: `guard2file` → edit JSON/MD → create new Guard via `root.type:"file"` → update all references.

---

## Guard Data Flow: How Objects Read Guard Data

Guards are validators AND data sources. When bound, objects read structured data for decisions. Design your Guard table based on what data the target object needs to read — objects don't just validate, they consume Guard submissions as structured data inputs.

### Type Requirements by Object

Each object extracts Guard data with precise type expectations. Mismatches cause creation or runtime failure:

| Object | Extraction Field | Table Index Requirement | Type Constraint |
|--------|-----------------|------------------------|-----------------|
| **Arbitration** `voting_guard` | Vote weight via `GuardIdentifier(u8)` | Index must be `b_submission: true` | **Numeric** (U8–U256, cast to u32) |
| **Demand** `ServiceGuard` | `service_identifier` mapping | Index must be `b_submission: true` | Depends on Service validation |
| **Machine** Forward | `retained_submission` | Index must be `b_submission: true`; uniquely located by `node→next_node→forward` triple | As declared in table |
| **Repository** | `id_from_submission` | Index must be `b_submission: true` | **Must be Address** |
| **Repository** | `data_from_submission` | Index must be `b_submission: true` | **Must match Repository's value_type** |

**Notes**: Arbitration uses `usage_guard` for eligibility (pass/fail) and `voting_guard` for weight (fixed or dynamic via `GuardIdentifier`). Demand's `ServiceGuard` passes the submission value at `service_identifier` to the service for validation (if unset, only pass/fail checked). Machine's `retained_submission` stores submission values in Progress for audit. Repository's `id_from_submission`/`data_from_submission` extract structured data from Guard submissions.

**⚠️ Critical — impack_list semantics in verify phase**: When a Guard queries Repository data (query 1167 `repository.data`) with a policy that has a `quote_guard` set, the verification checks whether the quote_guard address is in the `impack_list`. However, `impack_list` is **always empty during the `verify_guard` phase** — `Passport.new()` initializes `impack:vector[]` and the verify loop never modifies it; `impack` is only populated in `result_for_permission` (after verify completes). This means a Repository query with `quote_guard = Some(addr)` will always fail with `IMPACK_GUARD_NOT_FOUND` in the gen_passport flow; only `quote_guard = None` passes. Verify the quote_guard mechanism's design intent before relying on it.

---

## Best Practices

### Common Pitfalls

> The full constraint system has **33 rules: 22 creation-phase + 11 runtime-phase**. The 22 creation-phase constraints below are all enforced by SDK + native `validate_guard_data`; runtime constraints are enforced by native `verify_guard`.

#### Creation-Phase Constraints (22 rules, all enforced by SDK + `validate_guard_data`)

**Root**: Must return Bool (logic/comparison nodes only).
**Table**: Unique identifiers (0–255), tree-to-table referential integrity, non-empty constants, max 256 entries / 40KB BCS, submission entries = 1-byte type code.
**Query**: Discover valid IDs via `wowok_buildin_info` ("guard instructions"); parameter count/types must match; return type must be compatible with parent (use `convert_string_number`/`convert_number_string` for type mismatches; `logic_as_u256_*` for numeric comparisons); `object.identifier` must be Address type.
**Witness**: 100–108 only; target type must match query's expected object; source type must match table's `object_type`. **Missing `convert_witness`** when accessing Progress from Order ID = runtime failure (looks for Progress at Order's address).
**Rely**: Max 4; must have `rep:true`; no self-reference.
**Binding**: `voting_guard` identifier must be numeric (U8–U256); Repository `id_from_submission` must be Address; `data_from_submission` type must match Repository's `value_type`.
**Immutable**: Guard frozen after `guard::create` — to change, export via `guard2file` and create new.

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

### Readability Convention — Prefer String Names

**Always use string names** (not numeric IDs) for `query` (`"order.service"` not `1563`), `value_type` (`"Address"` not `1`), `convert_witness` (`"OrderProgress"` not `100`), and `context` (`"Signer"`). Matching is case-insensitive. SDK deserialization (`guard2file`/`query_objects`) returns all constants as strings. Discover valid query names via `wowok_buildin_info` with info `"guard instructions"`.

Common allocator-guard queries: `order.service` (theft protection), `order.owner` (refund binding), `progress.current` (node check), `progress.current_time` (time-lock), `service.permission`, `permission.owner`, `permission.admin has` (identity-set).

---
