# Appendix — wowok-guard

> This file is loaded on-demand (Progressive Disclosure).
> Main skill: [SKILL.md](./SKILL.md)

---

## Dialogue Scripts (R1-R10)

A 10-round dialogue for the Guard authoring journey: from "I need a validation rule" through "tested, bound, and live". Guards are CREATE-only and immutable — this dialogue is deliberately heavy on design (R1-R6) before any on-chain write (R7), because there is no edit phase after creation. The sequence covers the four canonical Guard contexts (buy_guard, machine Forward guard, Allocator guard, Arbitration voting_guard) but the same shape applies to reward, repository, and demand Guards.

> **Tool Call Convention**: All tool references in this document are sub-tools invoked via the single unified `wowok` tool. Translate every reference to `wowok({ tool: "<sub-tool-name>", data: {<params>} })`. See [wowok-tools](../wowok-tools/SKILL.md) for the full interface.

### R1: Validation Intent Capture

**AI Goal**: Articulate the business requirement the Guard will enforce, in plain language, before any technical design. Identify which of the §Quick Decision patterns fits.

**Key Questions**:
- What action is being protected? (Buying, advancing a node, releasing funds, voting, filing a dispute, claiming a reward, writing to a repository?)
- What single sentence describes the rule? (e.g., "Only the author can purchase this service", "Customer must wait 8 hours before completing", "Only sunny weather on the activity date".)
- What should cause the Guard to FAIL? (Listing the failure conditions often clarifies the logic more than listing success conditions.)

**Tool Calls**:
1. `wowok_buildin_info` → `info: "guard instructions"` — pre-fetch the full query instruction catalog so R3's design references real IDs.
2. `wowok_buildin_info` → `info: "value types"` — pre-fetch the type code mapping so R2's table uses correct `value_type` strings.
3. (Internal) Map the user's intent to one of the §Quick Decision patterns: identity check, time-lock, external data, progress state, one-time claim, dynamic weight, repository data, entity reputation.

**Success Criteria**: AI restates the validation intent as "The Guard passes when X, Y, Z are all true; otherwise it fails." The user confirms.

**Fallback**: User's intent doesn't fit any pattern → treat as a multi-condition Guard (combine multiple `query` nodes with `logic_and`). User's intent is genuinely unclear → ask for a concrete scenario: "Walk me through a case where the Guard should pass, and a case where it should fail."

**Checkpoint**: Persist `{ round: R1, intent: <sentence>, pattern: <name>, host_object: <Service|Machine|Arbitration|...> }` via `local_info_operation`.

### R2: Table Declaration

**AI Goal**: Define every piece of data the Guard touches — constants (`b_submission: false`) and runtime submissions (`b_submission: true`) — each with a unique `identifier` (0–255) and a `value_type`.

**Key Questions**:
- For each piece of data: is it a constant baked in at creation, or a value the caller submits at runtime?
- For each submission entry: what is its `value_type`? (Bool, Address, String, U8–U256, or vector types — confirm codes via `wowok_buildin_info`.)
- For each submission entry: what should its `name` field say? (The `name` is the contract with callers — natural language describing what they must provide.)
- Will the Guard query EntityRegistrar (`0xaab`) or EntityLinker (`0xaaa`)? If yes, add Address-type constant entries for these system addresses.

**Tool Calls**:
1. (Internal) Build the table: `[{identifier, b_submission, value_type, value?, name, object_type?}]`.
2. Validate: no duplicate identifiers; every non-submission entry has a `value`; query target objects are Address-type with correct `object_type`; max 256 entries; total serialized size ≤ 40000 bytes.
3. For submission entries, draft the `name` in natural language (per §Design Rules): e.g., "The order ID that identifies the target Order for verification", not "order_id".

**Success Criteria**: AI presents the full table with all fields populated. The user confirms each submission entry's `name` is clear enough that a caller would know what to provide.

**Fallback**: User wants more than 256 entries → decompose into multiple Guards composed via `rely`. User wants to query an object whose type is ambiguous → confirm the `object_type` field per §Design Rules. User submits a Value type 19 → block, cite [wowok-safety](../wowok-safety/SKILL.md) §8.1 ("Never use Value type 19").

**Checkpoint**: Persist `{ round: R2, table: [...], submission_count, constant_count }`.

### R3: Computation Tree Sketch

**AI Goal**: Sketch the root computation tree that produces the final Bool verdict. Identify each node's type and return type before writing any JSON.

**Key Questions**:
- What is the root node? (Must return Bool — typically `logic_and`, `logic_or`, `logic_equal`, or a comparison.)
- What are the data source nodes? (`identifier` for table values, `context` for Clock/Signer/self-ID, `query` for on-chain objects.)
- What are the intermediate transformation nodes? (`calc_number_*` for arithmetic, `convert_*` for type transformations, `vec_*` for vector operations, `query_progress_history_*` / `query_reward_record_*` for historical data.)
- Are there cross-object queries? If yes, which `convert_witness` type derives the target from a submitted ID?

**Tool Calls**:
1. `schema_query` → `get` for `onchain_operations_guard` — retrieve the complete `GuardNodeSchema` with every node type, its required fields, and input/output types.
2. `wowok_buildin_info` → `info: "guard instructions"` (filtered by `name`, `return_type`, `param_count`, or `object_type`) — confirm each `query` node's instruction ID and parameter count.
3. (Internal) Walk the tree: every `identifier` index exists in the table; every comparison receives compatible operand types; every `query` node's parameter count matches the instruction; the root returns Bool.

**Success Criteria**: AI presents the tree as an indented outline showing each node's type and the data flow. The user confirms the logic matches their R1 intent.

**Fallback**: Type mismatch at a comparison node → insert an explicit `convert_*` node (e.g., `convert_string_number`, `convert_number_string`) or use `logic_as_u256_*` variants for cross-width numeric comparisons. Root returns non-Bool → wrap with a final `logic_equal` or `logic_and` that produces Bool. `query` node parameter count off-by-one → re-check the instruction definition, fix the parameter list.

**Checkpoint**: Persist `{ round: R3, root_node_type, tree_depth, query_nodes: [{instruction_id, param_count, convert_witness?}] }`.

### R4: `rely` Composition (Optional)

**AI Goal**: Decide whether the Guard depends on other Guards via `rely` (up to 4 dependencies, AND/OR logic). Use composition to avoid monolithic trees.

**Key Questions**:
- Does this Guard's logic naturally decompose into independent sub-rules? (e.g., " KYC verified AND amount within cap AND not blacklisted" = 3 sub-Guards.)
- For each candidate dependency: does it have `rep: true`? (Guards with `rep: false` — those depending on a Repository — cannot serve as dependencies.)
- AND or OR logic? (Default AND — all must pass. OR — any passing is sufficient.)

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` for each candidate dependency Guard — confirm it exists and inspect its `rep` field.
2. (Internal) Validate: max 4 dependencies; all dependencies have `rep: true`; logic_or flag set correctly.

**Success Criteria**: Either: the Guard has no dependencies (skip R4), OR the `rely` list is finalized with verified `rep: true` Guards and the AND/OR logic is set.

**Fallback**: A desired dependency has `rep: false` → either inline its logic into the current Guard's tree, or create a new standalone Guard with `rep: true` that captures the same logic. User wants more than 4 dependencies → consolidate by combining related sub-rules into fewer Guards.

**Checkpoint**: Persist `{ round: R4, rely: [{guard_id, guard_name}], logic_or: bool }`.

### R5: Host Object & Binding Plan

**AI Goal**: Decide where the Guard attaches and confirm the binding pattern (especially the circular reference pattern for object-Guard mutual references).

**Key Questions**:
- Which host object will this Guard bind to? (Service `buy_guard`, Service `order_allocators[].guard`, Machine Forward `guard`, Arbitration `usage_guard` / `voting_guard[]`, Reward `guard`, Repository `write_guard`, Demand `ServiceGuard`.)
- Does the Guard reference the object it protects? (If yes, use the circular reference pattern: CREATE object without Guard → CREATE Guard referencing object by NAME → MODIFY object to bind Guard.)
- For Arbitration `voting_guard` with `GuardIdentifier`: is the referenced table entry numeric (U8–U256)? (Required — the value is cast to u32 as vote weight.)
- For Repository `write_guard`: are `id_from_submission` entries Address-type and `data_from_submission` entries matching the Repository's `value_type`?

**Tool Calls**:
1. (Internal) Classify the binding target per the §Where Guards Attach table.
2. For circular references: confirm the object's NAME (string) is used in the Guard table, NOT the object's address (which doesn't exist yet at Guard creation time). The SDK resolves the name at runtime.
3. For Arbitration `voting_guard`: validate the `GuardIdentifier` index points to a numeric table entry.
4. For Repository `write_guard`: validate `id_from_submission` and `data_from_submission` index types.

**Success Criteria**: The binding plan is documented: Guard name, host object, binding field, circular-reference steps (if applicable), type constraints satisfied.

**Fallback**: User wants to bind to a Machine that's already published → impossible to attach new Guards (immutable). Must create a new Machine. User wants `voting_guard` weight from a non-numeric submission → re-design the table to use a numeric type (U8/U16/U32/U64/U128/U256).

**Checkpoint**: Persist `{ round: R5, host_object, binding_field, circular_reference: bool, type_constraints_verified: true }`.

### R6: Pre-Create Review

**AI Goal**: Walk through the full Guard definition one final time before the irreversible CREATE. Cross-reference the §10 Common Pitfalls traps.

**Key Questions**:
- Confirm: every `identifier` in the tree exists in the table? (Trap 1.)
- Confirm: every comparison node receives compatible operand types? (Trap 2 — use explicit `convert_*` nodes where types differ.)
- Confirm: every `query` node's instruction ID and parameter count match the spec from `wowok_buildin_info`? (Trap 3.)
- Confirm: every cross-object query has the correct `convert_witness`? (Trap 4 — e.g., `TypeOrderProgress` = 100 to query Progress from an Order ID.)
- Confirm: time-lock durations are small (e.g., 1000ms) for testing, not production values? (Trap 5.)
- Confirm: root returns Bool? (Trap 7.)
- Confirm: all `rely` dependencies have `rep: true`? (Trap 8.)

**Tool Calls**:
1. (Internal) Run the §10 Common Pitfalls checklist.
2. `guard2file` → (if iterating on an existing Guard) export the previous version as a reference. The new Guard will be a fresh CREATE with a versioned name.
3. (Optional) Write the full Guard definition to a local scratch file via `local_info_operation` for the user to review before CREATE.

**Success Criteria**: All 10 pitfalls pass. AI presents the final Guard definition (table + tree + rely) and the user explicitly confirms "create it".

**Fallback**: Any pitfall fails → return to R2/R3/R4 and fix. User hesitates → offer to export the design as a scratch file for offline review. Never CREATE without explicit confirmation.

**Checkpoint**: Persist `{ round: R6, audit_pass: true, user_confirmed: true, design_frozen: true }`.

### R7: CREATE the Guard

**AI Goal**: Execute the single atomic `onchain_operations` → `operation_type: "guard"` CREATE. There is no draft state, no editing, no deletion — this either succeeds (Guard frozen on-chain) or fails (nothing created).

**Key Questions**:
- Confirm the Guard name (versioned: `<project>_guard_<purpose>_v1` per [wowok-safety](../wowok-safety/SKILL.md) §4).
- Confirm `root.type`: `"node"` (inline tree) or `"file"` (from a `guard2file` export).
- Confirm the operating account and `env.no_cache: true`.

**Tool Calls**:
1. `onchain_operations` → `operation_type: "guard"` CREATE with the full `data`: `name`, `description`, `table`, `root`, `rely` (if any).
2. If CREATE succeeds: `query_toolkit` → `onchain_objects` for the new `guard_id` — verify the table and tree are present and `rep` is set correctly.
3. `local_mark_operation` → tag the Guard (e.g., `freelance_buy_guard_v1`).

**Success Criteria**: Guard created on-chain. Query confirms table, root tree, and `rely` are all present. Local mark persisted.

**Fallback**: CREATE fails with type-validation error → return to R3, inspect the error message (usually names the offending node and expected vs actual types), fix the tree, re-attempt CREATE. CREATE fails with "identifier not in table" → return to R2/R3, fix the missing entry. CREATE fails with "rely references non-standalone Guard" → return to R4, replace the `rep: false` dependency. Name collision → append `_v1`/`_v2`.

**Checkpoint**: Persist `{ round: R7, guard_id, guard_name, created: true, rep: bool }`.

### R8: `gen_passport` Static Test

**AI Goal**: Verify the Guard's logic with mock submissions via `gen_passport`. This is the only way to test a Guard in isolation before binding it to a live object.

**Key Questions**:
- For each submission entry, what test value should I use? (Use edge cases: empty, boundary values, unusual addresses per [wowok-guard](../wowok-guard/SKILL.md) §Phase 5.)
- Should I test multiple scenarios? (Pass case, fail case, edge case.)
- For time-lock Guards: is the test duration small (1000ms)? (Production durations like 30 days cannot produce results for a month — trap 5.)

**Tool Calls**:
1. `onchain_operations` → `operation_type: "gen_passport"` with the Guard ID and mock `info` submissions. (Each Guard's submission is passed independently via `info` — NOT via `data.submission`.)
2. Omit `info` to auto-fetch existing submissions from the Guard (if any) — useful for re-testing with the same data.
3. Capture the result: PASS (Passport generated) or FAIL (which logic/query node returned false).
4. On PASS: `query_toolkit` → `onchain_objects` for the new Passport — inspect its data, validated Guards, and timestamp.

**Success Criteria**: `gen_passport` returns PASS for the expected-pass scenario. (Optional but recommended: also test the expected-fail scenario and confirm it fails for the right reason.)

**Fallback**: `gen_passport` fails → inspect the error to identify which node returned false. Use `guard2file` to export the Guard, walk the tree manually, identify the logic gap. If the Guard logic is genuinely wrong → CREATE a new Guard with corrected logic (immutable — cannot edit), re-test. Do NOT bind a failing Guard to a host object.

**Checkpoint**: Persist `{ round: R8, passport_id, test_result: pass, scenarios_tested: [...] }`.

### R9: Bind to Host Object

**AI Goal**: Attach the tested Guard to its host object per the R5 binding plan. Use the circular reference pattern where applicable.

**Key Questions**:
- Confirm the host object exists and is in the right state (e.g., Machine unpublished for Forward Guards, Arbitration paused for voting_guard).
- For circular references: is the host object's NAME used in the Guard table? (The SDK resolves it at runtime — the address didn't exist when the Guard was created.)

**Tool Calls**:
1. For Machine Forward binding: `onchain_operations` → `operation_type: "machine"` MODIFY, using `node` operations (`add forward` or `set` with `bReplace: false`) to set the Forward's `guard` field (with optional `retained_submission`).
2. For Service `buy_guard`: `onchain_operations` → `operation_type: "service"` MODIFY to set `buy_guard`.
3. For Service `order_allocators[].guard`: `onchain_operations` → `operation_type: "service"` MODIFY to set the Allocator's `guard`.
4. For Arbitration `voting_guard` / `usage_guard`: `onchain_operations` → `operation_type: "arbitration"` MODIFY.
5. For Reward `guard_add`: `onchain_operations` → `operation_type: "reward"` MODIFY.
6. For Repository `write_guard`: `onchain_operations` → `operation_type: "repository"` MODIFY.
7. `guard2file` → export the bound Guard for the audit trail.

**Success Criteria**: Guard is bound to the host object. Querying the host object (via `query_toolkit` → `onchain_objects`) shows the Guard reference in the correct field.

**Fallback**: Binding fails because host object is immutable (Machine published, Service published, etc.) → must create a new host object. Binding fails with type constraint (e.g., `voting_guard` `GuardIdentifier` not numeric) → return to R2, fix the table entry type, CREATE a new Guard, re-test, rebind.

**Checkpoint**: Persist `{ round: R9, bound_to: <host_object_id>, binding_field, export_path }`.

### R10: Post-Bind Verification & Iteration Plan

**AI Goal**: Verify the Guard is live and effective. Document the iteration workflow for future changes (Guards are immutable — iteration = export → edit → CREATE new → rebind).

**Key Questions**:
- Want me to query the host object and show the Guard in context?
- Do you anticipate needing to change this Guard's logic later? (If yes, document the export → edit → CREATE new → rebind workflow now while context is fresh.)
- For Arbitration `voting_guard`: is the Arbitration still paused? (Unpause only after all Guards are bound and tested.)

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` for the host object — confirm the Guard reference is present and `_guard_node_comments` (human-readable annotations) match the intended logic.
2. `onchain_events` → confirm any Guard-related events fired (e.g., Guard bound event).
3. `guard2file` → export the final bound Guard as the canonical reference for future iteration.
4. `local_info_operation` → persist the iteration workflow: "To change this Guard: (1) `guard2file` export, (2) edit JSON, (3) CREATE new Guard with versioned name, (4) re-test via `gen_passport`, (5) rebind to host object, (6) update all references."

**Success Criteria**: Guard is live, verified, and the iteration workflow is documented. Handoff packet produced for the host object's Skill ([wowok-provider](../wowok-provider/SKILL.md), [wowok-machine](../wowok-machine/SKILL.md), [wowok-arbitrator](../wowok-arbitrator/SKILL.md), etc.).

**Fallback**: Post-bind verification shows the Guard isn't where expected → check the binding field name (common mistake: binding to `buy_guard` when the user meant `order_allocators[].guard`). Re-call the MODIFY with the correct field. If the host object is now immutable → create a new host object.

**Checkpoint**: Persist `{ round: R10, verified: true, iteration_workflow_documented: true, handoff_emitted: true }`. Mark Guard design COMPLETE.

---

## Decision Trees

### D1: Guard Pattern Selection

```
What are you validating?
├── Identity (single address or allowlist)? ──→ context(Signer) + logic_equal / vec_contains_address
├── Time constraint? ──→ context(Clock) + calc_number_* comparisons
├── External on-chain data? ──→ query + table entry declaring target object address
├── Progress state / forward history? ──→ query_progress_history_* + convert_witness (TypeOrderProgress=100)
├── One-time claim (no prior record)? ──→ query_reward_record_count + logic_equal(0)
├── Dynamic vote weight? ──→ GuardIdentifier + numeric table entry (b_submission: true)
├── External Repository data? ──→ query + table entry declaring Repository address
├── Entity reputation / tier? ──→ query + table entry for ENTITY_REGISTRAR_ADDRESS (0xaab) or ENTITY_LINKER_ADDRESS (0xaaa)
└── Multi-condition (combine above)? ──→ multiple query/logic nodes joined with logic_and / logic_or
```

### D2: Submission vs Constant Table Entry

```
For each piece of data the Guard touches:
├── Value known at Guard creation time and never changes? ──→ CONSTANT (b_submission: false, value: <baked_in>)
│   ├── System address (EntityRegistrar, EntityLinker)? ──→ Address-type constant with the system address
│   ├── Query target object address? ──→ Address-type constant OR name reference (circular pattern)
│   └── Threshold / cap / duration? ──→ Numeric constant (use small values for testing per trap 5)
├── Value provided by the caller at runtime? ──→ SUBMISSION (b_submission: true, value: <placeholder>)
│   ├── Will the host object read this value? ──→ ensure type matches host's extraction field (e.g., Repository data_from_submission must match value_type)
│   └── Will this value be retained in Progress? ──→ ensure Machine Forward's retained_submission references the right index
└── Value derived from another submitted object? ──→ SUBMISSION of the source ID + convert_witness in the query node
```

### D3: `convert_witness` Selection

```
Guard needs to query object B, but caller submits object A's ID:
├── A = Order, B = Progress? ──→ convert_witness: TypeOrderProgress (100)
├── A = Arb (case), B = Arbitration (parent service)? ──→ convert_witness: TypeArbArbitration (105)
├── A = Order, B = Service? ──→ convert_witness: TypeOrderService
├── A = Progress, B = Machine? ──→ convert_witness: TypeProgressMachine
├── A = Reward, B = Service? ──→ convert_witness: TypeRewardService
├── Other source→target pairs? ──→ query `wowok({ tool: "wowok_buildin_info", data: { info: "guard instructions" } })` for the complete witness type catalog
└── No conversion needed (caller submits the exact object the Guard queries)? ──→ omit convert_witness
```

### D4: Binding Target & Circular Reference

```
Where will this Guard attach?
├── Service buy_guard? ──→ CREATE Service (no guard) → CREATE Guard (reference Service by name in table) → MODIFY Service (set buy_guard)
├── Service order_allocators[].guard? ──→ CREATE Service (no allocators) → CREATE Guard (may reference Service) → MODIFY Service (set order_allocators with guard)
├── Machine Forward guard? ──→ CREATE Machine (unpublished, no guard) → CREATE Guard (reference Machine if needed) → MODIFY Machine (set Forward.guard)
├── Arbitration voting_guard / usage_guard? ──→ CREATE Arbitration (paused, no guards) → CREATE Guard → MODIFY Arbitration (add voting_guard / set usage_guard)
├── Reward guard? ──→ CREATE Reward (no guard) → CREATE Guard (reference Reward by name) → MODIFY Reward (guard_add)
├── Repository write_guard? ──→ CREATE Repository (no guard) → CREATE Guard → MODIFY Repository (set write_guard)
└── Demand ServiceGuard? ──→ CREATE Demand (no guard) → CREATE Guard → MODIFY Demand (set ServiceGuard)
```

### D5: Iteration Workflow (When Guard Logic Must Change)

```
Guard logic needs to change:
├── Guard already created (immutable, cannot edit)? ──→ YES, always
│   ├── Export current Guard? ──→ guard2file → JSON/Markdown
│   ├── Edit file (table, root tree, rely)? ──→ offline edit
│   ├── Review edited JSON with user? ──→ confirm
│   ├── CREATE new Guard from file? ──→ `wowok({ tool: "onchain_operations", data: { operation_type: "guard", root: { type: "file", ... } } })`
│   ├── Test new Guard? ──→ gen_passport with mock submissions
│   ├── Rebind to host object? ──→ MODIFY host (if host is mutable)
│   │   └── Host is immutable (published Machine/Service)? ──→ must create new host object too
│   └── Update all references? ──→ update Machine Forwards, Service allocators, Arbitration voting_guard, etc.
└── Guard not yet created? ──→ just edit the design and CREATE
```

---

## Failure Playbooks

### F1: Guard CREATE Fails with Type Mismatch

**Trigger**: `onchain_operations` → `operation_type: "guard"` CREATE reverts with a type-validation error naming a specific node and the expected vs actual types.

**Diagnosis**: The computation tree has a type incompatibility. Common variants: (a) `logic_equal` comparing String to U64; (b) `query` node's parameter count off-by-one; (c) missing `convert_witness` when querying Progress from an Order; (d) `rely` referencing a Guard with `rep: false`.

**Recovery**:
1. Read the error message — it identifies the offending node and the type mismatch.
2. Cross-reference `wowok_buildin_info` → `info: "value types"` to confirm numeric codes if any are used.
3. Cross-reference `wowok_buildin_info` → `info: "guard instructions"` to confirm the `query` node's instruction ID and parameter count.
4. Insert an explicit `convert_*` node where types differ, or use `logic_as_u256_*` variants for cross-width numeric comparisons.
5. Re-attempt CREATE. Guards are CREATE-only — there is no MODIFY, so a failed CREATE simply retries with the fixed tree.

**Prevention**: R6's pre-create review walks the tree and checks every comparison node's operand types. The §10 Common Pitfalls traps 1–4 catch 90% of these issues before CREATE.

### F2: `gen_passport` Returns FAIL

**Trigger**: The static test returns FAIL — the Guard rejected the mock submission when it was expected to pass.

**Diagnosis**: Either the Guard's logic is wrong, or the mock submission doesn't match what the Guard expects. The error usually indicates which `logic_*` or `query` node returned false.

**Recovery**:
1. `guard2file` → export the failing Guard to a JSON/Markdown file.
2. Walk the computation tree manually, evaluating each node with the mock submission values.
3. Identify the first node that returns an unexpected value.
4. Common causes: (a) `query` node returns empty because the target object doesn't exist or the wrong ID was submitted; (b) `convert_witness` produces the wrong target type; (c) time-lock duration is in milliseconds but the test used seconds; (d) `logic_equal` compares Address to String representation.
5. If the logic is genuinely wrong: CREATE a new Guard with corrected logic (immutable — cannot edit the original), re-test.
6. If the submission was wrong: re-run `gen_passport` with corrected mock data.

**Prevention**: R6's pre-create review includes a mental walkthrough with edge cases. R8's test should include both an expected-pass scenario and an expected-fail scenario — if the expected-fail scenario passes, the logic is inverted.

### F3: Guard Bound to Wrong Host Field

**Trigger**: The Guard was bound to `buy_guard` when the user meant `order_allocators[].guard`, or vice versa. The Guard is live but in the wrong place.

**Diagnosis**: Querying the host object shows the Guard in the wrong field. The intended field is empty or has a different Guard.

**Recovery** (host object still mutable):
1. `onchain_operations` → MODIFY the host object: clear the wrong field (set to null/empty), set the correct field to the Guard.
2. Re-query to confirm the Guard is now in the intended field.

**Recovery** (host object immutable — published Machine/Service):
1. Cannot modify the host. The Guard is permanently in the wrong field.
2. If the wrong field is harmless (e.g., `buy_guard` set when no buy was intended) → the Service may reject all purchases. Must create a new Service.
3. If the wrong field leaves the intended field empty → the intended gate has no validation. Must create a new host object with correct binding.

**Prevention**: R5's binding plan explicitly documents `host_object` and `binding_field` before R9's MODIFY call. R9 lists the exact field name for each binding target. Always re-query the host object after binding to confirm the Guard is in the expected field.

### F4: Circular Reference Fails to Resolve

**Trigger**: Guard CREATE fails because a table entry references an object by NAME, but the SDK cannot resolve the name to an address.

**Diagnosis**: The object either (a) doesn't exist yet (circular reference pattern not followed — object should be CREATEd first), (b) was created but under a different name (typo), or (c) was created on a different account/network.

**Recovery**:
1. Confirm the object exists via `query_toolkit` → `onchain_objects` with the intended name.
2. If it doesn't exist: CREATE the object first (without the Guard), then CREATE the Guard referencing the object's name, then MODIFY the object to bind the Guard.
3. If it exists under a different name: fix the table entry's `value` to match the actual name.
4. If it's on a different account/network: switch `env.account` / `env.network` to match, or re-create the object on the current account.

**Prevention**: R5's binding plan explicitly documents the circular reference steps. The §Object-Guard Circular Reference Pattern in [wowok-tools](../wowok-tools/SKILL.md) is the universal three-step pattern: CREATE object → CREATE Guard (reference by name) → MODIFY object (bind Guard). Never CREATE the Guard before the object it references.

### F5: `voting_guard` Weight Type Error

**Trigger**: Adding a `voting_guard` with `GuardIdentifier` to an Arbitration reverts with `E_GUARD_IDENTIFIER_NOT_NUMBER`.

**Diagnosis**: The table entry at the `GuardIdentifier` index is either (a) not `b_submission: true`, or (b) not a numeric type (U8–U256). The Arbitration's `voting_guard` validation requires a numeric submission to cast as u32 vote weight.

**Recovery**:
1. `guard2file` → export the Guard, inspect the table entry at the `GuardIdentifier` index.
2. If `b_submission` is false → CREATE a new Guard with `b_submission: true` at that index.
3. If `value_type` is non-numeric (e.g., Address, String) → CREATE a new Guard with a numeric `value_type` (U8/U16/U32/U64/U128/U256).
4. Re-test via `gen_passport` with a numeric mock submission.
5. Re-add the new Guard to the Arbitration's `voting_guard[]`.

**Prevention**: R5's binding plan explicitly checks the `GuardIdentifier` type constraint for Arbitration `voting_guard`. The §Type Requirements by Object table lists this constraint. Always validate before CREATE.

### F6: Guard Logic Correct but Host Object Rejects Operation

**Trigger**: The Guard passes `gen_passport` in isolation, but when bound to a live Machine Forward, the operation still fails.

**Diagnosis**: The Guard's logic is correct in isolation but the host object's context provides different data. Common causes: (a) the Machine Forward's `retained_submission` index doesn't match the Guard's table; (b) the Service's `order_allocators` evaluation order means a different Allocator's Guard wins first (first-Guard-wins); (c) the Arbitration is paused (`bPaused: true`), which blocks before the Guard is even evaluated.

**Recovery**:
1. Query the host object via `query_toolkit` → `onchain_objects` — check `bPaused`, `order_allocators` order, Forward `retained_submission` indices.
2. If Arbitration is paused → unpause first (after confirming all config is ready).
3. If `order_allocators` order is wrong → MODIFY the Service to reorder (pre-publish only; post-publish, `order_allocators` is immutable).
4. If `retained_submission` index mismatches → CREATE a new Guard with the correct index, rebind.
5. Re-test the live operation.

**Prevention**: R9's binding verifies the host object's state. For Arbitration, confirm `pause: false` before expecting Guard evaluation. For Service `order_allocators`, confirm the evaluation order matches the intended priority. For Machine Forwards, confirm `retained_submission` indices align with the Guard's table.

---

## Tier Layering

### Novice Tier — Single-Purpose Guard

- One Guard, one purpose: e.g., a `buy_guard` that checks a single condition (signer equals authorized address, or amount ≤ cap).
- Table has 1–3 entries, all clearly typed. Computation tree is a single `logic_equal` or `logic_and` of 2–3 nodes.
- No `rely` dependencies, no `convert_witness`, no cross-object queries.
- R1-R6 reduce to "fill in this template". R7-R8 are the only interactive rounds.
- The §Quick Decision pattern table is the primary reference.
- Trigger: user is new, or the validation rule is genuinely simple.

### Advanced Tier — Multi-Condition & Cross-Object

- Guards combine multiple conditions via `logic_and` / `logic_or`. Tables have 4–10 entries including submissions and constants.
- Cross-object queries via `convert_witness` (e.g., query Progress from an Order ID, query Machine from a Progress).
- `rely` composition with up to 4 standalone (`rep: true`) Guards for modular logic.
- Time-lock Guards with `context(Clock)` and `calc_number_*` arithmetic.
- R1-R6 are full design sessions. R8 tests multiple scenarios (pass, fail, edge).
- The §Phase 1-5 design phases and §Quick Decision pattern table are the primary references.
- Trigger: user says "I want a complex Guard" or has completed prior single-purpose Guards.

### Expert Tier — Dynamic Data & Composition

- Guards provide dynamic data to host objects: Arbitration `voting_guard` with `GuardIdentifier` for weighted voting, Repository `write_guard` with `id_from_submission` and `data_from_submission` for data extraction.
- `rely` composition with OR logic (any dependency passing is sufficient) for flexible eligibility.
- Cross-Machine Guards querying sub-Progress and sub-Orders via `convert_witness` (per [wowok-machine](../wowok-machine/SKILL.md) §Cross-Machine Composition).
- `retained_submission` on Machine Forwards for audit trails and subsequent validation.
- Multi-Guard `gen_passport` calls (up to 20 Guards AND-ed) for complex credential issuance.
- Off-chain Passport use cases: Guards as credential issuers for off-chain permission verification, not just on-chain gates.
- R1-R6 are expert design sessions; the AI's role is to validate types and constraints, not to suggest patterns.
- The §Guard Data Flow and §Type Requirements by Object tables are the primary references.
- Trigger: user explicitly asks for "expert mode", references `convert_witness` types by number, or designs Guards for Arbitration voting / Repository data extraction.