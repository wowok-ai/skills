---
name: wowok-machine
description: |
  WoWok Machine Workflow Design — the canonical skill for designing, building,
  and operating automated workflow templates (Machines) on WoWok. Machines are
  directed graphs that define how orders progress through stages, who can
  advance them, and what conditions must be met at each step.

  Covers Machine architecture (Nodes, Pairs, Forwards, Guards, Thresholds),
  lifecycle management (create, configure, publish, pause), node operations
  (add, exchange, rename, granular forward/prior-node manipulation),
  Progress integration, cross-Machine supply chain composition via Guard verification, privacy-preserving
  consensus patterns, and export/import workflows via machineNode2file.
when_to_use:
  - User wants to create or modify a Machine workflow
  - User asks about workflow steps, state transitions, or progress
  - User needs to design order processing pipelines
  - User mentions "machine", "workflow", "progress", "state machine", "pipeline"
  - User wants to export Machine nodes to a file or import from a file
  - User needs to understand threshold mechanics, forward permissions, or guard bindings
---

# WoWok Machine Workflow Design

Design, build, and operate automated workflow templates.

> **Role**: Service Provider or Workflow Designer
> **Key Tools**: `onchain_operations` with `operation_type: "machine"`
> **Related Skills**: [wowok-guard](../wowok-guard/SKILL.md) (Guards), [wowok-provider](../wowok-provider/SKILL.md) (Service binding), [wowok-order](../wowok-order/SKILL.md) (customer perspective), [wowok-messenger](../wowok-messenger/SKILL.md) (privacy), [wowok-safety](../wowok-safety/SKILL.md) (safety), [wowok-tools](../wowok-tools/SKILL.md) (schema reference)

---

## Core Concepts

**Machine** = workflow blueprint (directed graph of Nodes → Pairs → Forwards). **Progress** = live workflow instance, one per order.

Machines are **immutable after `publish: true`**; Guards are **CREATE-only**. Design the complete workflow before publishing.

## Machine Architecture

```
Machine
└── Nodes
    └── Pairs
        ├── prev_node: which prior node ("" = entry point, multiple allowed)
        ├── threshold: required total forward weight to advance
        └── Forwards (MachineForward)
            ├── name, weight
            ├── permissionIndex | namedOperator: who can execute
            └── guard (optional): condition that must pass
```

> **Schema**: `schema_query({ action: "get", name: "onchain_operations_machine" })` — all field types, limits, valid values. This document focuses on design decisions **not captured** by the schema.

### Forward Permission Model

| Field | Scope | When to Use |
|-------|-------|-------------|
| `permissionIndex` | Shared across ALL Progress instances | Internal staff (warehouse, admin, platform) — same for every order |
| `namedOperator` | Per-Progress namespace | Roles that differ per order (delivery person, reviewer, agent) |

- `namedOperator: ""` (empty string): grants **order owner and agents** the right to execute. Standard way to let customers operate.
- `namedOperator: "<role_name>"`: role-based operators managed per Progress instance. Each Progress independently assigns addresses to role names.
- **Both fields set**: executor needs EITHER permission — internal staff OR external roles.
- **Design principle**: Use custom permissions (dedicated Permission object with custom indices), not built-in indices. Define workflow-specific roles, reference those indices in Forwards.

### Guard on Forwards

A Guard validates the Forward's execution condition. **Retained submissions**: when `retained_submission` is set on a Guard, submitted values are stored in Progress history, uniquely located by `(current_node, next_node, forward_name)`. Later nodes query these values from history.

> **Guard construction**: See [wowok-guard](../wowok-guard/SKILL.md) for table design, computation trees, and query instructions.

### Threshold Mechanics

Users execute Forwards from the current node, accumulating weight within a **session**. When the sum of completed Forward weights meets or exceeds the Pair's threshold, the session finalizes and the workflow advances.

**Session behavior**: Each Forward is counted once per session. Repeated execution of the same Forward within one session adds no extra weight. A completed Forward cannot be re-executed until session reset (on node transition).

**Competing Transitions**: If a node has multiple Pairs to different targets, the **first Pair to meet its threshold wins** — remaining incomplete Forwards in other Pairs are **abandoned**. Competing paths are mutually exclusive by design. A Pair whose threshold can never be met because users always prefer another path creates a **dead branch**.

**Execution Patterns**:

| Pattern | Mechanism | Use Case |
|---------|-----------|----------|
| Sequential | `threshold=1`, single Forward `weight=1` | Single actor each step |
| Parallel AND | `threshold=N`, N Forwards `weight=1` | All parties must contribute |
| Parallel OR | Multiple Pairs, each `threshold=1` | Mutually exclusive branches |
| Weighted Voting | `threshold=100`, varied weights (e.g., 60+40) | Unequal stakeholder power |
| Hybrid | `threshold=5`, mixed weights (3+1+1) | Key party required, others optional |

---

## Machine Lifecycle

### Dependency-First Construction

Build in this exact order:

```
1. Permission (CREATE/MODIFY) → access control foundation
2. Machine (CREATE, unpublished) → define all nodes
3. Guards (CREATE) → build validation conditions
4. Bind Guards to Forwards (MODIFY Machine) → set `guard` on each Forward; all operations (`add`, `set`, `add forward`) accept full `MachineForward` including `guard` + `retained_submission`
5. Publish Machine → nodes IMMUTABLE
6. Bind Machine to Service → workflow goes live
```

**Why this order matters**: Publishing locks the Machine. Guards are immutable. Publishing before Guards are ready means Guards can never be added — the Machine is frozen without validation rules. **Create Guards, test them, then publish.**

### Node Operations (Pre-Publish Only)

Nine operations are available via the `node` field. Query schema for full parameters. Key design notes not captured by schema:

- `add` / `set` with `bReplace: false` (default) **merges** into existing nodes; `true` replaces all.
- `clear` is **irreversible** — instant wipe with no undo. Export via `machineNode2file` first.
- `exchange` swaps two node positions without delete/recreate. `rename` auto-updates all Pair references.
- `add forward` supports the full `MachineForward` structure including `guard` with `retained_submission`.

> **Schema**: `schema_query({ action: "get", name: "onchain_operations_machine" })` for full operation parameters.

### File-Based Workflow

```
1. machineNode2file → export nodes to JSON/Markdown
2. Edit locally
3. node.json_or_markdown_file → COMPLETE REPLACEMENT of all nodes
```

Always start from an on-chain export when available — exact current state beats rebuilding from scratch.

---

## Progress: The Live Workflow Instance

### Machine vs Progress

- **Machine**: Workflow blueprint — defines the topology, permissions, thresholds, and Guards. Shared across all orders.
- **Progress**: Live instance — tracks current node, session state, history. One per order (when Service-bound) or standalone.

### Progress Creation

Two paths: **Service Order** (automatic when Order created on Service with bound Machine) or **Direct Creation** (via `progress_new`). For direct creation, pre-configure via `progress_new` fields on the Machine operation — this sets initial named operators, task binding, and repository list before the first Progress is spawned.

### Execution Paths

- **Order-associated Progress**: When a Forward uses `namedOperator: ""`, the order owner/agents execute via `order` operations.
- **Standalone Progress**: All other cases — advance via direct `progress` operations.

Two-phase operations (`hold`/`unhold`) allow locking resources during multi-step operations; `adminUnhold` force-releases stale locks.

> **Querying**: Progress state via `onchain_objects`, history via `onchain_table` / `onchain_table_item_progress_history`. Schema: `schema_query({ action: "get", name: "onchain_table_data" })`.

### Runtime: Advancing the Workflow

The runtime loop (schema: `onchain_operations` with `operation_type: "progress"` or `"order"`):

```
1. Query active Forwards → onchain_objects reveals current node name and available Pairs/Forwards
2. Execute Forward → weight accumulates in session; Guard validates (pass/fail);
                    retained_submission stores values indexed by (current_node, next_node, forward_name)
3. Threshold met → session commits to history (all completed Forwards recorded);
                    node transitions; session resets; new Forwards unlocked
4. OR threshold NOT met → session stays open; more Forwards can execute in same session;
                          weight from repeated same Forwards ignored
5. OR competing Pair wins first → other incomplete Pairs abandoned; next session starts on winner node
```

**What the user sees**: At any node, callers can discover which Forwards are available (by querying the Machine definition and cross-referencing with their permissions). Executing a Forward that requires a Guard triggers Guard verification — the caller must submit required data. Successful Forward execution is recorded on-chain; failed Guard rejections are visible as transaction errors.

**Session lifecycle**: A session begins when the first Forward executes from a new node. It stays open until threshold is met (closing the session and advancing) or the order completes/aborts. No session timeout — sessions persist until resolved. `hold`/`unhold` lock the session during multi-step external operations; `adminUnhold` force-releases stale locks.

> **Order-associated execution**: Forwards with `namedOperator: ""` are executable via `order` operations by the order owner/agents. All other Forwards use `progress` operations. See [wowok-order](../wowok-order/SKILL.md) for the customer execution flow.

---

## Workflow Design Patterns

### Multi-Path Workflow Example

**MyShop Advanced** — demonstrates branching, dual-signature, and time guards:
```
Shipping → Delivery Complete → Order Complete
    │  ├──→ Wonderful (rating, reward)
    │  ├──→ Order Complete (time guard: ≥10 days, anyone push)
    │  └──→ Lost (threshold: 2, merchant+customer dual-sig)
    │
    └── Delivery Complete → Non-receipt Return (threshold: 2)
                     └──→ Receipt Return (threshold: 2) → Return Fail (time guard)
                                                   └──→ Return Complete
```

### Cross-Machine Supply Chain Composition

Decompose complex workflows into multiple Machines connected by Guard-based validation — avoiding monolithic bloat.

**Sub-Progress Dependency**: Machine A's Forward Guards query Machine B's Progress to verify it has reached a target node before advancing.

**Sub-Order Verification**: Machine A's Forward Guard validates an Order exists on another Service with its Progress at the required state. The sub-order is created independently — the Guard only verifies.

**Multi-Party Chain**: Supplier → Manufacturer → Retailer, each Machine's entry condition verifies upstream completion via Guards querying `retained_submission` values.

**When to decompose** into multiple Machines:
- A sub-process is independently valuable as a standalone Service
- Different participant sets operate in different phases
- The sub-process is reusable across multiple parent workflows

**When to keep in one**:
- Same participants and permission model throughout
- Dense sequential data flow with no clear boundary

**Questions to ask the user**:
1. "Are there phases handled by different teams or services?"
2. "Could any part be offered as a standalone service?"
3. "Does any step depend on an external process completing first?"
4. "Which party creates the sub-order, and which party verifies it?"

> **Guard construction**: Cross-Machine Guards use `convert_witness` with Progress query instructions. See [wowok-guard](../wowok-guard/SKILL.md). Query available Guard instructions via `wowok_buildin_info`.

### Dual-Signature Consensus

Require both customer and merchant to confirm: `threshold=2` with two Forwards (`namedOperator: ""` for customer, `permissionIndex` for merchant), each `weight=1`. Both must execute to advance.

### Privacy (Messenger)

Sensitive data flows through Messenger's end-to-end encryption; only Merkle Root proofs go on-chain. The principle: **who performs the action submits the proof**.

> **Full Guide**: See [wowok-messenger](../wowok-messenger/SKILL.md) for WTS evidence generation.

---

## Common Pitfalls

### Mutability Traps

All stem from the same root: **every on-chain object has a publish/create freeze point**. See [Guard + Machine Immutability Deadlock](#guard--machine-immutability-deadlock). Key rules:
- Never publish before all Guards are created, tested, and bound.
- `clear` is irreversible — export via `machineNode2file` first.

### Pre-Publish Validation Checklist

Before `publish: true`, verify:

- [ ] **Entry point exists**: at least one Pair with `prev_node: ""` — workflow cannot start otherwise
- [ ] **Every node has outgoing Forwards** (except terminals): no dead-end nodes
- [ ] **Every node has incoming Pair** (except entry): no orphaned nodes
- [ ] **All thresholds independently achievable**: no dead branches (competing Pair always wins first)
- [ ] All Guards exist on-chain and tested (use `gen_passport`)
- [ ] `namedOperator` vs `permissionIndex` correct per Forward
- [ ] Every Forward has at least one of `namedOperator` or `permissionIndex`
- [ ] Terminal nodes mapped to Allocator entries for fund distribution
- [ ] Tested end-to-end on testnet via a test Progress
- [ ] Current state exported via `machineNode2file` as backup

**Always test on testnet before mainnet** — Machines are immutable after publish.

---

## Guard + Machine Immutability Deadlock

Both Guards and published Machines are **immutable**:

```
Guard created with bug → Cannot fix (immutable)
  → Must create new Guard
    → Must rebind to Machine
      → Machine already published? Cannot modify (immutable)
        → DEADLOCK: new Guard exists but cannot be attached
```

**Prevention**: Test every Guard via `gen_passport` before binding. Verify computation tree, submission types, and query instructions against all scenarios.

**If deadlocked**: Only recovery is a completely new Machine with new nodes and Guard bindings, then rebind to Service. Keep Machines unpublished until all Guards are verified.

---

## Dialogue Scripts (R1-R10)

A 10-round dialogue for the Machine design journey: from "I need a workflow" through "published and bound to a Service". Each round produces one piece of the Machine blueprint and verifies it before advancing. The sequence enforces the dependency-first construction order (Permission → unpublished Machine → Guards → bind → publish → bind Service) — publishing too early is the single most expensive mistake in this domain.

### R1: Workflow Intent Capture

**AI Goal**: Understand the user's business process at the node-graph level: what stages exist, who advances each, what conditions gate each transition.

**Key Questions**:
- In plain language, what are the stages an order goes through from start to finish? (e.g., "ordered → in progress → delivered → accepted → completed")
- Are there any branches? (e.g., "if disputed, go to refund instead of complete")
- Who advances each transition? (customer, provider, system auto-advance, named operator like a delivery person)

**Tool Calls**:
1. `query_toolkit` → `local_names` — confirm the working account and any existing Machines that might be reusable.
2. `wowok_buildin_info` → `info: "guard instructions"` — pre-fetch the query instruction catalog so R7's Guards reference real instruction IDs.
3. (Internal) Cross-reference [wowok-scenario](../wowok-scenario/SKILL.md) for a mode template that matches the user's described stages — load it as a starting point, not a constraint.

**Success Criteria**: AI sketches the proposed node graph in ASCII and the user confirms the topology matches their mental model.

**Fallback**: User cannot articulate stages → suggest a mode template (freelance/rental/education) and ask "does this look right?". User wants a non-mode workflow → switch to `general` mode and proceed with manual design, leaning on [wowok-machine](../wowok-machine/SKILL.md) §Workflow Design Patterns.

**Checkpoint**: Persist `{ round: R1, nodes: [...], branches: [...], actors: [...] }` via `local_info_operation`.

### R2: Node List Finalization

**AI Goal**: Lock the full node name list with no duplicates, no orphans, and at least one entry node (prev_node = "") and one terminal node.

**Key Questions**:
- Confirm the node names. Names are immutable after publish — pick names that future-you will understand.
- For each node, is it an entry (no incoming), terminal (no outgoing), or intermediate?
- Any node that should auto-advance on timeout? (Records the need for a time-lock Forward.)

**Tool Calls**:
1. (Internal) Validate node list: at least 2 nodes (entry + terminal), no duplicate names, every non-entry has at least one incoming Pair, every non-terminal has at least one outgoing Forward.
2. `machineNode2file` → (only if iteratively editing an existing Machine) export current state as the starting JSON.

**Success Criteria**: AI returns a table of nodes with `prev_node`, classification (entry/intermediate/terminal), and the user confirms.

**Fallback**: Node count < 2 → enforce minimum (entry + terminal). User wants to rename later → fine pre-publish via `node.rename` (auto-updates Pair references); impossible post-publish. User has too many nodes (>20) → suggest decomposition into multiple Machines via §Cross-Machine Supply Chain Composition.

**Checkpoint**: Persist `{ round: R2, node_count, nodes: [{name, type: entry|intermediate|terminal}] }`.

### R3: Pair & Threshold Design

**AI Goal**: For each target node, configure the incoming Pair: which `prev_node`(s) feed it and what `threshold` of Forward weight is required to advance.

**Key Questions**:
- For each transition, is it single-actor (threshold=1, one Forward weight=1) or multi-actor (threshold=N, multiple Forwards)?
- Are there competing transitions from the same node? (Mutually exclusive branches — first Pair to meet threshold wins.)
- Any dual-signature requirements? (Both customer and merchant must confirm — threshold=2 with two weight=1 Forwards.)

**Tool Calls**:
1. (Internal) Build the Pair table: `(prev_node, target_node, threshold)`. Validate that no Pair creates an unreachable branch (a Pair whose threshold can never be met because users always prefer another path = dead branch per §Threshold Mechanics).
2. `schema_query` → `get` for `onchain_operations_machine` to confirm threshold is `u32` and weight is `u16` (0–65535).

**Success Criteria**: Pair table is complete and validated; every Pair is independently achievable. AI shows the graph with thresholds annotated.

**Fallback**: User wants weighted voting (e.g., 60+40) → use threshold=100 with weights 60 and 40. User wants parallel-AND (all must contribute) → threshold=N with N weight=1 Forwards. User wants parallel-OR (mutually exclusive) → multiple Pairs each threshold=1, accepting that first-Pair-wins abandons the others.

**Checkpoint**: Persist `{ round: R3, pairs: [{prev_node, target_node, threshold}], pattern: sequential|and|or|weighted|hybrid }`.

### R4: Forward & Operator Design

**AI Goal**: For each Pair, define its Forward(s): `name`, `weight`, and exactly one of (`permissionIndex` | `namedOperator` | both).

**Key Questions**:
- For each Forward, who can execute it? (Internal staff via `permissionIndex`, per-order role via `namedOperator`, order owner/agents via `namedOperator: ""`.)
- Should the Forward require BOTH a permission AND a named operator? (Rare; use both fields.)
- Any Forward that should be auto-executable by anyone after a timeout? (Set `namedOperator: ""` and bind a time-lock Guard in R7.)

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` (filter type=Permission) — list the user's Permission objects and their indices.
2. `wowok_buildin_info` → `info: "built-in permissions"` — confirm 0–999 are protocol-reserved; user indices must be ≥ 1000.
3. (Internal) Validate every Forward has at least one of `permissionIndex` or `namedOperator` — both empty = SDK error per §Forward Permission Model.

**Success Criteria**: Forward table is complete with `(name, weight, permissionIndex?, namedOperator?)` for every Pair. Every `permissionIndex` exists in the chosen Permission.

**Fallback**: User wants a role that varies per order (delivery person, reviewer) → use `namedOperator: "<role_name>"` and assign addresses per Progress via `progress` MODIFY later. User wants customer to operate → `namedOperator: ""`. User picks an index < 1000 → block, cite §Permission Index Model.

**Checkpoint**: Persist `{ round: R4, forwards: [{pair, name, weight, permissionIndex?, namedOperator?}], permission_id }`.

### R5: CREATE the Unpublished Machine

**AI Goal**: Execute `onchain_operations` → `operation_type: "machine"` CREATE with `publish: false`. This is the first on-chain action — everything before was design.

**Key Questions**:
- Confirm the Machine name (versioned: `<project>_machine_<purpose>_v1`).
- Confirm `publish: false` — we publish only after Guards are created and bound (R8).
- Confirm the operating account and `env.no_cache: true` (we'll immediately query the Machine in R6).

**Tool Calls**:
1. `onchain_operations` → `operation_type: "machine"` with `data.name`, `data.nodes`, `data.pairs`, `data.forwards`, `publish: false`.
2. `query_toolkit` → `onchain_objects` for the new `machine_id` — verify all nodes are present and `bPublished: false`.
3. `local_mark_operation` → tag the Machine (e.g., `freelance_machine_v1`).

**Success Criteria**: Machine created on-chain, `bPublished: false`, all nodes/forwards present in the query. Local mark persisted.

**Fallback**: CREATE fails with "node count < 2" → return to R2 and enforce minimum. CREATE fails with "forward missing permissionIndex and namedOperator" → return to R4 and fill the empty field. CREATE fails with name collision → append `_v1`/`_v2` per [wowok-safety](../wowok-safety/SKILL.md) §4.

**Checkpoint**: Persist `{ round: R5, machine_id, machine_name, bPublished: false }`.

### R6: Progress Template Decision

**AI Goal**: Decide whether to bind a Progress template now or after Guard binding. Most flows bind Progress now (R6) so R7's Guard tests can use a real Progress instance.

**Key Questions**:
- Should Progress mirror every Machine node (typical) or only customer-visible milestones (alternative)?
- Do you want customer-facing labels per state? (Stored as Progress metadata.)
- Will the Progress be Service-bound (auto-spawned per Order) or standalone?

**Tool Calls**:
1. `onchain_operations` → `operation_type: "progress"` CREATE with `data.machine = "<machine_name>"` (resolves via `GetObjectExisted()`), `data.belong_to` = the Service (if known), optional metadata fields.
2. (If Service not yet created) defer Progress binding to [wowok-onboard](../wowok-onboard/SKILL.md) R6 — just record the intent in the checkpoint.

**Success Criteria**: Progress template created and bound to Machine (or intent recorded for later binding).

**Fallback**: Binding fails because Machine is already published → impossible to unpublish (immutable); create a NEW Machine and rebind. Progress field missing → use mode default template.

**Checkpoint**: Persist `{ round: R6, progress_id, mirrored_nodes: [...] }`.

### R7: Guard Design & Binding Plan

**AI Goal**: Design the Guards that gate specific Forwards (workflow gates) and the Guards that gate fund release (Allocator gates). Use the circular reference pattern (object first, Guard second, bind third).

**Key Questions**:
- Which Forwards need Guards? (Common: pickup, delivery, acceptance, refund trigger.)
- For each Forward Guard, what does it validate? (Identity, time-lock, external data, progress history, reward record count.)
- Should the Guard retain submissions for later query? (`retained_submission` indexed by `(current_node, next_node, forward_name)`.)

**Tool Calls**:
1. `wowok_buildin_info` → `info: "guard instructions"` — confirm each `query` node's instruction ID and parameter count before designing the tree.
2. `wowok_buildin_info` → `info: "value types"` — confirm table entry types.
3. (Internal) For each Guard, sketch the table + computation tree per [wowok-guard](../wowok-guard/SKILL.md) §Phase 1-3. Guards are CREATE-only — design before building.
4. Plan the binding: which Guard binds to which Forward via `onchain_operations` → `operation_type: "machine"` MODIFY (Forward `guard` field).

**Success Criteria**: Each planned Guard has a table draft, a computation tree draft, and a designated Forward to bind to. AI presents the full binding plan.

**Fallback**: User wants a Guard that queries an object not yet created (e.g., queries Order from a Forward) → use `convert_witness` (e.g., `TypeOrderProgress` = 100) to derive the target from a submitted ID. User wants a Guard that depends on another Guard → use `rely` (max 4, AND/OR logic, all dependencies must have `rep: true`).

**Checkpoint**: Persist `{ round: R7, guards: [{name, target_forward, table_sketch, tree_sketch, convert_witness?}] }`.

### R8: Guard CREATE & gen_passport Test

**AI Goal**: Create each Guard on-chain, immediately test it via `gen_passport`, and bind the passing Guards to their Forwards.

**Key Questions**:
- Confirm: I'm creating `<n>` Guards. Each is immutable after creation — logic must be correct.
- For each `gen_passport` test, what mock submission should I use? (Use small time-locks like 1000ms during testing per [wowok-guard](../wowok-guard/SKILL.md) trap 5.)
- Confirm binding: Guard A → Forward X, Guard B → Forward Y, etc.

**Tool Calls**:
1. For each Guard: `onchain_operations` → `operation_type: "guard"` CREATE (with `root.type: "node"` inline, or `root.type: "file"` from a `guard2file` export).
2. For each Guard: `onchain_operations` → `operation_type: "gen_passport"` with mock `info` submissions — verify PASS.
3. For each passing Guard: `onchain_operations` → `operation_type: "machine"` MODIFY to bind `guard` on the target Forward (use the `node` operations: `add forward` with full `MachineForward` including `guard` + `retained_submission`).
4. `guard2file` → export each bound Guard for the audit trail.

**Success Criteria**: All Guards created, all `gen_passport` tests PASS, all Guards bound to the correct Forwards. `guard2file` exports persisted.

**Fallback**: `gen_passport` fails → isolate the failing Guard via `guard2file` export, inspect the computation tree, consult [wowok-guard](../wowok-guard/SKILL.md) §10 traps, CREATE a new Guard with corrected logic (immutable — cannot edit), re-test, rebind. Type mismatch in `convert_witness` → re-create Guard with correct target type.

**Checkpoint**: Persist `{ round: R8, guards: [{name, id, bound_to, passport_test: pass|fail}], all_pass: true }`.

### R9: Pre-Publish Audit & Test Progress

**AI Goal**: Run the full §Pre-Publish Validation Checklist against the unpublished Machine, then execute a test Progress through every path to catch runtime issues the static checks miss.

**Key Questions**:
- Confirm: ready to run the pre-publish audit? This is the last chance to fix before immutability.
- For the test Progress, can you provide a second account to play the customer role?

**Tool Calls**:
1. (Internal) Run the §Pre-Publish Validation Checklist: entry point exists, no dead-end nodes, no orphaned nodes, all thresholds achievable, all Guards exist and tested, `namedOperator` vs `permissionIndex` correct, every Forward has at least one operator, terminal nodes mapped to Allocators.
2. `machineNode2file` → export the current Machine as a backup (pre-publish state).
3. `account_operation` → `gen` (second account for testing) + `faucet`.
4. `onchain_operations` → `operation_type: "progress"` (or `order` if Service-bound) — advance a test instance through every node, including branch paths.
5. At each terminal node: verify Allocation triggers correctly (if Allocators are configured).

**Success Criteria**: All checklist items pass. Test Progress traverses every path. `machineNode2file` backup persisted. AI presents the audit report.

**Fallback**: Checklist blocker (e.g., dead-end node) → return to R2/R3 and fix. Test Progress stuck at a node → check Forward operators, check Guard submissions, check threshold accumulation. Competing Pair always wins → dead branch; either remove the losing Pair or restructure to make it achievable.

**Checkpoint**: Persist `{ round: R9, audit_pass: true, test_progress_id, paths_tested: [...], backup_export_path }`.

### R10: Publish & Bind to Service

**AI Goal**: Execute the irreversible `publish: true`, then bind the published Machine to its Service. Post-publish, verify immutability locks are in place.

**Key Questions**:
- Final confirmation: publish is irreversible. Nodes, Forwards, Guards, thresholds all become immutable. Proceed?
- Is the target Service already created and unpublished? (Service publish requires a published Machine per [wowok-tools](../wowok-tools/SKILL.md) §service constraints.)

**Tool Calls**:
1. `onchain_operations` → `operation_type: "machine"` with `publish: true` — Machine locked.
2. `onchain_operations` → `operation_type: "service"` MODIFY to bind `data.machine = "<published_machine_id>"`.
3. (If Service is also ready to publish) `onchain_operations` → `operation_type: "service"` with `publish: true` — Service `machine` and `order_allocators` fields locked.
4. Post-publish verification: `query_toolkit` → `onchain_objects` for the Machine → confirm `bPublished: true`. For the Service → confirm `machine` field is locked.
5. `onchain_events` → confirm Publish event fired.

**Success Criteria**: Machine `bPublished: true`. Service `machine` field bound and (if published) immutable. Publish event recorded. Handoff packet produced for [wowok-provider](../wowok-provider/SKILL.md).

**Fallback**: Pre-publish audit fails → return to R9 and fix; do NOT publish. Publish transaction fails (gas) → re-faucet, retry. Service publish fails with "machine not published" → confirm Machine publish succeeded first (cache may be stale — use `env.no_cache: true`). Post-publish immutability check fails (rare) → escalate; protocol-level invariant violated.

**Checkpoint**: Persist `{ round: R10, machine_published: true, service_bound: true, service_published: bool, publish_digest }`. Mark Machine design COMPLETE.

**Handoff Packet** (emitted to [wowok-provider](../wowok-provider/SKILL.md) and [wowok-order](../wowok-order/SKILL.md)):
- Machine ID + name + publish digest
- Node topology summary (entry, terminals, branches)
- Forward → Guard binding map
- Progress template ID
- Test Progress digest + result
- Recommended next Skill: wowok-provider (operations), wowok-order (buyer perspective)

---

## Decision Trees

### D1: Execution Pattern Selection

```
Transition requirement:
├── Single actor each step? ──→ Sequential: threshold=1, one Forward weight=1
├── All parties must contribute? ──→ Parallel AND: threshold=N, N Forwards weight=1
├── Mutually exclusive branches? ──→ Parallel OR: multiple Pairs each threshold=1 (first-Pair-wins)
├── Unequal stakeholder power? ──→ Weighted Voting: threshold=100, varied weights (60+40)
└── Key party required + others optional? ──→ Hybrid: threshold=5, mixed weights (3+1+1)
```

### D2: Forward Operator Selection

```
Who executes this Forward?
├── Internal staff (same for every order)? ──→ permissionIndex (≥1000, from governing Permission)
├── Per-order role (delivery person, reviewer)? ──→ namedOperator: "<role_name>" (assigned per Progress)
├── Order owner / agents (the customer)? ──→ namedOperator: "" (empty string)
├── Both internal staff AND per-order roles? ──→ set BOTH fields (executor needs EITHER)
└── Auto-advance on timeout (anyone can push)? ──→ namedOperator: "" + time-lock Guard
```

### D3: Decompose into Multiple Machines?

```
Workflow complexity check:
├── Same participants and permission model throughout? ──→ KEEP in one Machine
├── Dense sequential data flow with no clear boundary? ──→ KEEP in one Machine
├── Sub-process is independently valuable as a standalone Service? ──→ DECOMPOSE
├── Different participant sets operate in different phases? ──→ DECOMPOSE
├── Sub-process is reusable across multiple parent workflows? ──→ DECOMPOSE
└── If decomposed: connect via Guard-based sub-Progress / sub-Order verification (§Cross-Machine Composition)
```

### D4: Guard Binding Target

```
Guard validates... 
├── A specific Forward's execution? ──→ bind to Machine Forward `guard` field (workflow gate)
├── Fund release at a terminal node? ──→ bind to Service `order_allocators[].guard` (Allocator gate)
├── Order placement eligibility? ──→ bind to Service `buy_guard` (purchase gate)
├── Vote weight in arbitration? ──→ bind to Arbitration `voting_guard[]` (governance)
├── Dispute filing eligibility? ──→ bind to Arbitration `usage_guard` (case gate)
├── Reward claim eligibility? ──→ bind to Reward `guard` (claim gate)
└── Repository write eligibility? ──→ bind to Repository `write_guard` (storage gate)
```

### D5: Pre-Publish Audit Outcome

```
R9 pre-publish audit:
├── All checklist items PASS + test Progress traversed every path? ──→ proceed to R10 publish
├── Warnings only (e.g., no Compensation Fund on Service)? ──→ ask user, then publish or fix
├── Blockers (dead-end node, missing Guard, unreachable Pair)? ──→ return to R2/R3/R7/R8, fix, re-audit
└── Test Progress stuck at a node? ──→ diagnose Forward operator / Guard / threshold, fix, re-test
```

---

## Failure Playbooks

### F1: Guard + Machine Immutability Deadlock

**Trigger**: A Guard is created with a bug, bound to a Forward on a Machine, and then the Machine is published. The Guard cannot be edited (immutable) and the Machine cannot be modified (immutable after publish).

**Diagnosis**: Both immutability locks have fired. The Guard's bug is now permanent on this Machine.

**Recovery**:
1. Accept that this Machine is permanently broken at the buggy Forward.
2. `machineNode2file` → export the Machine's topology as a starting point.
3. Create a NEW Machine (unpublished) with the same topology, but leave the buggy Forward's `guard` field empty.
4. CREATE a new Guard with corrected logic (use `guard2file` on the buggy Guard as a reference, fix the tree).
5. Test the new Guard via `gen_passport`.
6. Bind the new Guard to the corresponding Forward on the new Machine.
7. Publish the new Machine, rebind the Service to it.

**Prevention**: NEVER publish a Machine before all Guards are created, tested via `gen_passport`, and bound. The §Pre-Publish Validation Checklist exists for exactly this reason. Test every Guard with mock submissions including edge cases (empty, boundary values, unusual addresses) before binding.

### F2: Dead Branch (Unreachable Pair)

**Trigger**: A Pair's threshold can never be met because users always prefer another competing path from the same node. Funds or orders get stuck if they reach the dead branch's preconditions.

**Diagnosis**: Static analysis of the Machine topology. The dead branch's Pair is reachable in principle, but in practice every executor chooses the competing Pair first (first-Pair-wins rule).

**Recovery** (pre-publish):
1. Either: remove the dead Pair entirely (if the branch is truly unwanted), OR
2. Restructure so the dead branch's Forward is the ONLY path from its source node, OR
3. Add a time-lock Forward on the dead branch's path that auto-advances after a deadline (so even if no human picks it, the timeout triggers).

**Recovery** (post-publish — Machine immutable):
1. Cannot modify the Machine. Accept the dead branch exists.
2. Ensure Service-level Allocation rules route funds correctly regardless of which branch wins.
3. For future orders, create a new Machine without the dead branch and rebind the Service.

**Prevention**: R3's Pair validation explicitly checks "is every Pair independently achievable?" — if any Pair's threshold can never be met because a competing Pair always wins first, flag it as a dead branch before CREATE.

### F3: Threshold Not Met (Session Stuck)

**Trigger**: A Progress instance is stuck at a node because the accumulated Forward weight in the current session is below the Pair's threshold, and no further Forwards can be executed.

**Diagnosis**: Query the Progress via `query_toolkit` → `onchain_objects` — inspect `current_node`, `session`, and `forward_history`. Identify which Forwards have executed and which haven't.

**Recovery**:
1. If a Forward was missed (e.g., a named operator didn't execute): `progress` MODIFY to assign the role address, then execute the Forward.
2. If a Guard is blocking a Forward: re-collect the correct submission, re-call `progress` with `hold: false` and the submission.
3. If the session is locked by another party: `progress` with `adminUnhold: true` to force-release stale locks (use with care — this overrides others' locks).
4. If the threshold is genuinely unreachable (e.g., a required Forward's operator is permanently unavailable): the only recovery is to escalate to a dispute path or accept the order is stuck.

**Prevention**: During R3 Pair design, verify that every threshold is achievable by the Forwards defined. During R4 Forward design, ensure every Forward has a clear operator (not "nobody"). For customer-side Forwards, set a time-lock auto-advance so the session can't stick indefinitely.

### F4: `node.clear` Wipes Machine

**Trigger**: The user (or AI) calls `onchain_operations` → `operation_type: "machine"` with `node.clear`, expecting a confirm prompt, and the Machine's nodes are instantly wiped with no undo.

**Diagnosis**: `clear` is irreversible by design (§Node Operations). The Machine's topology is gone.

**Recovery**:
1. If `machineNode2file` was run before the clear (R9 backup), the topology is recoverable: re-create the nodes via `node.add` or `node.json_or_markdown_file` (complete replacement from the file).
2. If no backup exists: rebuild from memory / design notes. This is painful but the Machine itself (object ID, publish state) is not destroyed — only its node graph.
3. If the Machine was already published: clearing is impossible (nodes are immutable post-publish), so this failure mode cannot occur.

**Prevention**: ALWAYS `machineNode2file` before any `node.clear`, `node.exchange`, or `node.set` with `bReplace: true`. Treat the export as a mandatory pre-flight, not an optional step. The §Pre-Publish Validation Checklist explicitly includes "Current state exported via `machineNode2file` as backup".

### F5: Cross-Machine Guard Fails to Query Sub-Progress

**Trigger**: A Guard on Machine A queries Machine B's Progress (sub-Progress dependency) and returns false even though Machine B's Progress has reached the expected node.

**Diagnosis**: The `convert_witness` type is wrong, the query instruction ID is wrong, or the sub-Progress's `current_node` field name doesn't match what the Guard expects.

**Recovery**:
1. `guard2file` → export the failing Guard, inspect the `query` node's instruction and `convert_witness`.
2. `wowok_buildin_info` → `info: "guard instructions"` — confirm the instruction ID targets Progress and accepts the witness type.
3. Query the sub-Progress directly via `query_toolkit` → `onchain_objects` — confirm `current_node` matches the Guard's expected value.
4. If the Guard logic is wrong: CREATE a new Guard with corrected logic (immutable — cannot edit), rebind to Machine A's Forward.
5. If Machine A is already published (immutable): see F1 deadlock recovery — must create a new Machine A.

**Prevention**: During R7 Guard design, for every cross-Machine query, validate the witness type and instruction ID against `wowok_buildin_info` BEFORE creating the Guard. Test the Guard via `gen_passport` with a real sub-Progress instance before binding.

### F6: Publish Fails Because Service Already Bound to Another Machine

**Trigger**: `service` MODIFY with `data.machine = "<new_machine_id>"` reverts because the Service is already published and its `machine` field is immutable.

**Diagnosis**: The Service was published with a different Machine bound. Post-publish, `service.machine` cannot be changed.

**Recovery**:
1. Confirm the Service's `bPublished` state via `query_toolkit` → `onchain_objects`.
2. If published: the only path is to create a NEW Service (unpublished), bind the new Machine to it, publish the new Service. The old Service remains on-chain but is deprecated.
3. If not published: the previous bind was a draft — re-call `service` MODIFY with the new Machine ID, it should succeed.
4. Migrate any active orders to the new Service if applicable (or honor the old Service's commitments until they complete).

**Prevention**: During [wowok-onboard](../wowok-onboard/SKILL.md) R5-R10, bind the Machine to the Service BEFORE either is published. The dependency order is: create Machine (unpublished) → bind to Service (unpublished) → publish Machine → publish Service. Never publish the Service before the Machine is bound.

---

## Tier Layering

### Novice Tier — Mode-Template Path

- Start from a [wowok-scenario](../wowok-scenario/SKILL.md) mode template (freelance, rental, education, travel, subscription) — the node graph, thresholds, and Forward operators are pre-filled.
- R1-R4 reduce to "confirm the template" rather than "design from scratch".
- R7 Guards are also templated — the user confirms which subset of template Guards to use.
- The full R1-R10 sequence still executes, but each round is a confirmation, not a design decision.
- Pre-publish audit is mandatory and blocking — no overrides.
- Trigger: user is new, or says "I want the standard freelance/rental workflow".

### Advanced Tier — Template Customization

- Start from a mode template but override specific fields: add/remove nodes, change thresholds, swap Forward operators, add custom Guards.
- R1-R4 are interactive design sessions, with the template as a starting point.
- R7 may include Guards not in the template (e.g., a custom time-lock, a custom Repository query).
- Pre-publish audit runs; warnings are non-blocking with explicit user confirmation, blockers still block.
- Cross-Machine composition becomes available (§Cross-Machine Supply Chain Composition) — decompose complex flows into multiple Machines.
- Trigger: user says "I want to customize" or has completed prior Machine designs.

### Expert Tier — Free-Form Design

- No mode template; the user designs the full topology from scratch using §Workflow Design Patterns as the reference.
- R1-R4 are full design sessions; the AI's role is to validate (no dead branches, no orphaned nodes, thresholds achievable) rather than to suggest.
- R7 may include advanced Guard patterns: `rely` composition (AND/OR across up to 4 Guards), `convert_witness` cross-object queries, `retained_submission` for audit trails.
- R9 pre-publish audit is optional but strongly recommended; the user may publish without it (at their own risk).
- Dual-signature consensus, weighted voting, and hybrid threshold patterns are all available.
- Cross-Machine composition via Guard-based sub-Progress / sub-Order verification is the norm for complex business processes.
- Trigger: user explicitly asks for "expert mode", invokes `machineNode2file` and `guard2file` themselves, or has published multiple Machines previously.