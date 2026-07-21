# Appendix — wowok-auditor

> This file is loaded on-demand (Progressive Disclosure).
> Main skill: [SKILL.md](./SKILL.md)

---

## Dialogue Scripts (R1-R10)

A 10-round audit dialogue. Each round produces one piece of the audit
report and persists a checkpoint via `local_info_operation` so the audit
can resume after interruption. R1-R9 are read-only; R10 is the publish
decision (still no on-chain write from this Skill — it hands off to
[wowok-onboard](../wowok-onboard/SKILL.md) R10 or [wowok-machine](../wowok-machine/SKILL.md) R10 for execution).

### R1: Audit Scope

**AI Goal**: Pin down exactly what is being audited and the audit tier.

**Key Questions**:
- What are we auditing? (Service + Machine + Guards + Allocators, or a subset?)
- Is this a Tier-1 (single Service + single Guard), Tier-2 (multi-Guard + multi-state Machine), or Tier-3 (complex dependency chains + arbitration) audit?
- Which network? (testnet default; mainnet doubles the confirmation burden)
- Is this a pre-publish audit (Service/Machine still `bPublished: false`) or a post-publish diagnostic?

**Tool Calls**:
1. (Internal) Classify tier per §Tier Layering.
2. `local_info_operation` → create audit session `{ round: R1, scope: [...], tier: 1|2|3, network, phase: pre-publish|diagnostic }`.

**Success Criteria**: Scope, tier, network, and phase recorded. User confirms.

**Fallback**: User is vague ("audit my stuff") → list all owned objects via `query_toolkit` → `local_names`, ask which to include. User doesn't know the tier → default to Tier-2 (Standard).

**Checkpoint**: Persist R1; mark COMPLETE.

### R2: Object Inventory & Dependency Map

**AI Goal**: Enumerate every object in scope and build the dependency graph (Permission → Machine → Guards → Allocators → Service → Progress → Arbitration).

**Key Questions**:
- For each object: name, ID, type, and `bPublished` state?
- Which objects depend on which? (e.g., Machine Forwards reference Permission indices; Allocators reference Guards; Service references Machine + Allocators.)

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` for each named object (use `no_cache: true` — we need fresh state).
2. `guard2file` → export each Guard to a local JSON/Markdown file.
3. `machineNode2file` → export each Machine's node topology.
4. (Internal) Build dependency graph: nodes = objects, edges = "references". Detect cycles in the dependency graph (object-level, not Machine-level — those are R4).

**Success Criteria**: Every object in scope is queried, exported, and placed in the dependency graph. No unresolved references.

**Fallback**: Object not found → check name spelling, switch `env.network`, retry with `no_cache: true`. Circular dependency (Guard references Service that references Guard) → confirm the circular reference pattern was followed (CREATE object → CREATE Guard by name → MODIFY object to bind). Unresolved name → treat as audit FAIL (broken reference, cannot publish).

**Checkpoint**: Persist `{ round: R2, objects: [{name, id, type, bPublished}], dependency_graph, exports: [...] }`.

### R3: Guard Completeness

**AI Goal**: For every operation that moves funds, verify a Guard is bound and the Guard table is well-formed.

**Key Questions**:
- For each Service: is `buy_guard` set? (Required if Service accepts payments.)
- For each Service `order_allocators[].guard`: is a Guard bound to each Allocator?
- For each Machine Forward with fund flow: is `forward.guard` set?
- For each Guard: does the table have all submission entries the host object expects? (e.g., Repository `id_from_submission` must be Address-type; Arbitration `voting_guard` `GuardIdentifier` must be numeric.)

**Tool Calls**:
1. Apply **GUARD_COMPLETENESS_RULES** to every operation type discovered in R2.
2. For each Guard: cross-reference the host object's extraction field against the Guard table (per [wowok-guard](../wowok-guard/SKILL.md) §Type Requirements by Object).
3. `guard2file` → re-export any Guard whose host binding is ambiguous; inspect the table.

**Success Criteria**: Every fund-flow operation has a Guard bound. Every Guard table satisfies its host object's type constraints. Zero FAILs.

**Fallback**: FAIL — list the unguarded operation, the host object, and the recommended Guard pattern (cite [wowok-guard](../wowok-guard/SKILL.md) §Quick Decision). WARN (treasury deposit, repository write) — note for user acknowledgement in R10.

**Checkpoint**: Persist `{ round: R3, guard_checks: [{op, host, guard_bound: bool, action: PASS|WARN|FAIL}] }`.

### R4: Machine Soundness

**AI Goal**: Verify the state graph is acyclic, single-entry, fully reachable, with correct terminals and valid forward permissions.

**Key Questions** (skip if no Machine in scope — Tier-1 single-Guard audit):
- Is there exactly one entry node (Pair with `prev_node: ""`)?
- Are all terminals reachable from the entry?
- Are there cycles in the state graph?
- Does every non-terminal have an outgoing Forward? Every non-entry have an incoming Pair?
- Does every Forward have `permissionIndex` ≥ 1000 OR `namedOperator` set (or both)?
- Are thresholds achievable? (No dead branches where a competing Pair always wins.)

**Tool Calls**:
1. Parse `machineNode2file` output into nodes, Pairs, Forwards.
2. Apply **MACHINE_SOUNDNESS_RULES**: cycle detection (DFS with visited stack), entry count, reachability (BFS from entry), dead-end/orphan checks, forward permission validation, threshold sum vs. Pair threshold.
3. `wowok_buildin_info` → `info: "built-in permissions"` — confirm 0–999 are reserved; user indices must be ≥ 1000.

**Success Criteria**: All MACHINE_SOUNDNESS_RULES pass. Graph drawn and confirmed acyclic.

**Fallback**: Cycle detected → FAIL, recommend splitting into two phases / two Machines (cite [wowok-machine](../wowok-machine/SKILL.md) §Cross-Machine Composition). Multiple entries → FAIL, merge into one. Unreachable terminal → FAIL, add a Forward or remove the terminal. Forward with neither permission → FAIL, set `namedOperator: ""` for customer or add `permissionIndex`. Dead branch → WARN, recommend time-lock auto-advance Forward or removal.

**Checkpoint**: Persist `{ round: R4, machine_checks: [...], graph_acyclic: bool, single_entry: bool, all_reachable: bool }`.

### R5: Fund Flow Analysis

**AI Goal**: Trace every money path: payment → escrow → allocation. Verify refund symmetry and allocation sums.

**Key Questions**:
- For each Service: trace the payment path (customer pays → escrow → Allocator distributes). Does every payment path have a refund path?
- For each Allocator: does the `sharing` array sum to 10000 (100%)?
- Is the treasury balance sufficient for pending allocations?
- Are gas coins (WOW) mixed into business-token allocations?
- Does the escrow amount equal the sum of Allocation paths from that order?

**Tool Calls**:
1. Apply **FUND_FLOW_RULES** to every payment/allocation path discovered in R2.
2. `query_toolkit` → `onchain_objects` for the Service's `order_allocators`; for each Allocator, sum the `sharing` values.
3. `query_toolkit` → `onchain_objects` for the treasury / compensation fund; compare balance to sum of pending allocations.
4. For refund paths: confirm a terminal node exists whose Allocator returns funds to the buyer (`Entity` with buyer address or `GuardIdentifier` resolving to buyer).

**Success Criteria**: Every payment path has a refund path. Every Allocator sums to 10000. No gas coin in business allocations. Escrow symmetry holds.

**Fallback**: No refund path → FAIL, recommend creating a refund Allocator on a dispute terminal (cite [wowok-onboard](../wowok-onboard/SKILL.md) R8). Allocation sum ≠ 10000 → FAIL, recommend adjusting `sharing` percentages (auto-correct to 10000 with user confirmation per [wowok-onboard](../wowok-onboard/SKILL.md) R8 fallback). Gas coin in allocation → WARN, recommend separating gas wallet from business treasury. Low treasury balance → WARN, recommend funding before publish.

**Checkpoint**: Persist `{ round: R5, fund_flow_checks: [...], refund_paths: [...], allocation_sums: [{allocator, sum, valid: bool}] }`.

### R6: Permission Consistency

**AI Goal**: Verify every permission index is in valid range and named operators match intended roles.

**Key Questions**:
- For each Forward's `permissionIndex`: is it ≥ 1000 (user-defined)? (Indices 0–999 are protocol-reserved.)
- Does the referenced Permission object actually have that index configured?
- For each `namedOperator`: does the role name match the intended business role? (e.g., `"delivery_person"` not `"dp"`.)
- For Arbitration `voting_guard` with `GuardIdentifier`: is the referenced table entry numeric (U8–U256)?

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` for the Permission object; list all configured indices.
2. Cross-reference every Forward's `permissionIndex` against the Permission's configured indices.
3. `wowok_buildin_info` → `info: "built-in permissions"` — confirm reserved range.
4. For Arbitration `voting_guard`: `guard2file` → inspect the table entry at `GuardIdentifier`; confirm numeric type.

**Success Criteria**: All `permissionIndex` values ≥ 1000 and present in the Permission object. All `namedOperator` names are descriptive. All `GuardIdentifier` entries are numeric.

**Fallback**: Index < 1000 → FAIL, recommend switching to a user-defined index ≥ 1000. Index not in Permission → FAIL, add the index to the Permission object (if mutable) or recreate Permission. Non-numeric `GuardIdentifier` → FAIL, recreate Guard with numeric table entry (cite [wowok-guard](../wowok-guard/SKILL.md) F5). Cryptic `namedOperator` name → WARN, recommend rename pre-publish.

**Checkpoint**: Persist `{ round: R6, permission_checks: [...], named_operators: [...] }`.

### R7: Semantic Verification

**AI Goal**: Read the `semantic` field from recent operations on the audited objects. Confirm the intended roles were created/modified/released and the event stream matches expectations.

**Key Questions**:
- For each recent operation on the audited objects: what does `semantic.created` list? (Should match the objects we expect to exist.)
- What does `semantic.modified` list? (Should match intended field updates.)
- What does `semantic.released` list? (Should match fund movements — escrow, allocation, refund.)
- What does `semantic.events` show? (Cross-reference with `onchain_events` query results.)

**Tool Calls**:
1. `onchain_events` → query recent events for each object in scope (NewOrderEvent, ProgressEvent, PublishEvent, ArbEvent, AllocationEvent).
2. For each event: map to the corresponding `semantic` field. E.g., a `PublishEvent` should appear in `semantic.events`; an `AllocationEvent` should appear in `semantic.released`.
3. Cross-check: every object we expect to exist (from R2) should appear in `semantic.created` of the operation that created it.
4. Cross-check: every fund movement we expect (from R5) should appear in `semantic.released` of the corresponding operation.

**Success Criteria**: `semantic.created` / `modified` / `released` / `events` all match the expected object and fund-flow inventory. No phantom objects, no missing events.

**Fallback**: Phantom object in `semantic.created` (created but not in our inventory) → WARN, investigate — may be an orphan from a failed prior attempt. Missing event (operation succeeded but event not in `semantic.events`) → WARN, retry query with `no_cache: true` (cache lag). Fund movement in `semantic.released` that doesn't match R5's expected path → FAIL, investigate — may indicate an unintended Allocator fired.

**Checkpoint**: Persist `{ round: R7, semantic_cross_check: {created_ok, modified_ok, released_ok, events_ok} }`.

### R8: Risk Assessment & Blast Radius

**AI Goal**: Classify each remaining issue by irreversibility and estimate blast radius if publish proceeds.

**Key Questions**:
- Which operations in scope are irreversible? (Publish, arbitration verdict, transfer.)
- For each FAIL/WARN: if the user publishes anyway, what breaks? Can it be recovered?
- What is the blast radius? (Single order, all orders on the Service, all Services using this Machine, all arbitrations using this Guard?)

**Tool Calls**:
1. (Internal) For each open issue, classify:
   - **Permanent** (post-publish, no recovery): Guard logic bug on a published Machine, allocation sum ≠ 10000 on a published Service, cycle in a published Machine.
   - **Recoverable** (post-publish, with new object creation): missing Guard on a Forward (create new Machine), wrong `namedOperator` name (create new Machine).
   - **Cosmetic** (no operational impact): cryptic role name, missing backup export.
2. Estimate blast radius per issue: `single_order | all_orders_on_service | all_services_on_machine | all_arbitrations_on_guard`.
3. Rank issues by `severity = permanence × blast_radius`.

**Success Criteria**: Every open issue has a severity label and a documented recovery path (or "no recovery — permanent").

**Fallback**: User wants to publish despite a Permanent issue → refuse the R10 approval, cite the irreversibility, recommend the recovery path (usually: create replacement object pre-publish).

**Checkpoint**: Persist `{ round: R8, risk_assessment: [{issue, permanence, blast_radius, severity, recovery_path}] }`.

### R9: Audit Report

**AI Goal**: Present the consolidated pass/warn/fail report with specific issues and fix recommendations.

**Key Questions**:
- (None — this round presents findings and asks for acknowledgement of WARNs.)

**Tool Calls**:
1. (Internal) Aggregate R2-R8 findings into a report:
   ```
   AUDIT REPORT — <scope> (Tier <n>)
   ─────────────────────────────────────
   PASS: <count> checks passed
   WARN: <count> issues requiring acknowledgement
   FAIL: <count> blocking issues

   FAIL details:
   - [R3] Guard completeness: <op> on <host> has no Guard bound.
     Fix: <recommended Guard pattern>
   - [R4] Machine soundness: cycle detected at <node> → <node>.
     Fix: split into two Machines
   ...

   WARN details:
   - [R5] Treasury balance low (<amount> < <pending>).
     Acknowledge: fund treasury before publish, or accept risk.
   ...

   Risk assessment (R8):
   - <issue> — Permanent, blast radius: all_orders_on_service.
     Recovery: create replacement <object> pre-publish.
   ```
2. `local_info_operation` → persist the full report.

**Success Criteria**: Report presented. User acknowledges each WARN. Each FAIL has a documented fix.

**Fallback**: User disputes a FAIL → re-run the specific check with `no_cache: true`; if still FAIL, the rule is binding. User wants to override a FAIL → only possible via explicit "publish anyway" confirmation recorded in the checkpoint (the auditor still records it as a FAIL-with-override; [wowok-safety](../wowok-safety/SKILL.md) R7 will re-confirm).

**Checkpoint**: Persist `{ round: R9, report: {...}, warns_acknowledged: [...], fails_overridden: [...] }`.

### R10: Publish Decision

**AI Goal**: Emit the publish go/no-go decision. This Skill does NOT execute the publish — it hands off to [wowok-onboard](../wowok-onboard/SKILL.md) R10 or [wowok-machine](../wowok-machine/SKILL.md) R10.

**Key Questions**:
- (Decision logic; no user questions unless a WARN needs final confirmation.)

**Tool Calls**:
1. (Internal) Apply decision logic:
   - If any FAIL (not overridden) → **BLOCK**. List fixes needed. Do not hand off.
   - If only WARNs and all acknowledged → **APPROVE WITH WARNINGS**. Hand off to the publish Skill.
   - If all PASS → **APPROVE**. Hand off.
2. Emit handoff packet:
   ```
   AUDIT DECISION: <APPROVE | APPROVE_WITH_WARNINGS | BLOCK>
   Scope: <objects>
   Tier: <n>
   Fails: <count> (list)
   Warns: <count> (acknowledged: <count>)
   Risk max severity: <level>
   Next: wowok-onboard R10 (publish) — or wowok-machine R10 (Machine-only publish)
   ```
3. `local_info_operation` → persist the decision and handoff packet.

**Success Criteria**: Decision emitted. Handoff packet persisted. If BLOCK, the user has a clear list of fixes. If APPROVE, the publish Skill receives a clean audit reference.

**Fallback**: User insists on publishing despite BLOCK → refuse handoff; advise that [wowok-safety](../wowok-safety/SKILL.md) R7 will still require confirmation and the audit FAIL will be visible in the session log. Recommend fixing the FAILs first.

**Checkpoint**: Persist `{ round: R10, decision, handoff_emitted: true }`. Mark audit COMPLETE.

---

## Decision Trees

### D1: Guard Necessity (operation type + fund flow direction)

```
For each operation in scope:
├── Does it move funds?
│   ├── YES
│   │   ├── payment / allocation execute / order create / fund-release forward / reward claim?
│   │   │   └── YES → Guard REQUIRED. FAIL if none bound. (GUARD_COMPLETENESS_RULES)
│   │   └── treasury deposit / repository write?
│   │       └── Guard RECOMMENDED. WARN if none bound.
│   └── NO (service publish, machine publish, non-fund forward)
│       └── Guard NOT required. PASS.
└── Is the bound Guard's table well-formed for the host extraction field?
    ├── Repository id_from_submission → Address? data_from_submission → matches value_type?
    │   └── NO → FAIL (type constraint violation).
    ├── Arbitration voting_guard GuardIdentifier → numeric (U8–U256)?
    │   └── NO → FAIL (E_GUARD_IDENTIFIER_NOT_NUMBER risk).
    └── OK → PASS.
```

### D2: Machine State Graph Validation

```
Parse machineNode2file output → graph (nodes, Pairs, Forwards):
├── Cycle check (DFS with recursion stack):
│   ├── Cycle found → FAIL: cycle at <path>. Recommend split into two Machines.
│   └── Acyclic → continue.
├── Entry check:
│   ├── Zero nodes with no inbound Pair → FAIL: no entry.
│   ├── More than one → FAIL: multiple entries <list>. Recommend merging.
│   └── Exactly one → continue.
├── Reachability (BFS from entry):
│   ├── Any terminal unreachable → FAIL: unreachable terminal <name>.
│   ├── Any non-terminal with no outgoing Forward → FAIL: dead-end <name>.
│   └── All reachable, no dead-ends → continue.
├── Threshold achievability (per Pair):
│   ├── Sum of Forward weights < threshold → WARN: unreachable threshold (dead branch).
│   ├── Competing Pair always wins first (first-Pair-wins rule) → WARN: dead branch.
│   └── Achievable → continue.
└── Forward permissions:
    ├── Neither permissionIndex nor namedOperator set → FAIL: forward <name> has no operator.
    ├── permissionIndex < 1000 → FAIL: reserved index.
    ├── permissionIndex not in Permission object → FAIL: index not configured.
    └── OK → PASS.
```

### D3: Allocation Correctness

```
For each Allocator in order_allocators:
├── Sum the sharing array:
│   ├── Sum ≠ 10000 → FAIL: allocation sums to <sum>, must be 10000.
│   └── Sum = 10000 → continue.
├── Refund path check (for Service that accepts payments):
│   ├── Is there a terminal whose Allocator returns funds to buyer?
│   │   ├── YES → PASS.
│   │   └── NO → FAIL: no refund path. Recommend refund Allocator on dispute terminal.
│   └── (Skip if Service is non-payment, e.g., repository-only.)
├── Gas coin separation:
│   ├── Allocation contains WOW (gas coins) alongside business tokens?
│   │   ├── YES → WARN: gas coin in allocation. Recommend separate treasury.
│   │   └── NO → PASS.
│   └── (Skip if Service is single-token WOW only.)
├── Recipient type:
│   ├── Known party (merchant, platform) → uses Entity with explicit address? PASS.
│   ├── Dynamic party (buyer, order-specific) → uses GuardIdentifier? PASS.
│   └── Uses Signer for a non-signer role → WARN: ambiguous recipient.
└── Escrow symmetry:
    ├── Sum of Allocation paths from order ≠ order escrow amount → FAIL: escrow mismatch.
    └── Equal → PASS.
```

### D4: Publish Approval

```
Aggregate R2-R9 results:
├── Any FAIL (not overridden)?
│   ├── YES → BLOCK. List fixes. Do not hand off.
│   └── NO → continue.
├── Any WARN?
│   ├── YES → all acknowledged by user?
│   │   ├── YES → APPROVE WITH WARNINGS. Hand off to publish Skill.
│   │   └── NO → request acknowledgement; pause.
│   └── NO → continue.
├── PUBLISH_READINESS_RULES:
│   ├── Service bPublished === false? (must be false to publish)
│   ├── Machine published (if bound)?
│   ├── Permission configured with all Forward indices?
│   ├── Allocators configured and audited?
│   ├── User confirmed publish intent?
│   └── Any FAIL above → BLOCK.
└── All pass → APPROVE. Hand off to [wowok-onboard](../wowok-onboard/SKILL.md) R10 or [wowok-machine](../wowok-machine/SKILL.md) R10.
```

---

## Failure Playbooks

### F1: Missing Guard on Refund Path

**Trigger**: R3 or R5 finds a Service that accepts payments but has no Allocator returning funds to the buyer on any terminal (no refund path), or the refund-path Allocator has no Guard bound.

**Diagnosis**: The Service can collect escrow but cannot return it on dispute. Funds would be locked permanently if a customer disputes and wins.

**Recovery**:
1. Identify the dispute terminal node (or create one if absent).
2. Design a refund Allocator: `sharing: [{recipient: GuardIdentifier|Signer, share: 10000}]` returning 100% to the buyer.
3. CREATE the refund Allocator's trigger Guard (cite [wowok-guard](../wowok-guard/SKILL.md) §Quick Decision — typically a progress-state check confirming the dispute terminal was reached).
4. Test the Guard via `gen_passport`.
5. Bind the Allocator + Guard to the Service's `order_allocators` (pre-publish only; post-publish `order_allocators` is immutable).

**Prevention**: Always design refund symmetry alongside the payment path. [wowok-onboard](../wowok-onboard/SKILL.md) R8 includes "refund path covered" in its checkpoint.

### F2: Allocation Sum Mismatch

**Trigger**: R5 finds an Allocator whose `sharing` array sums to a value other than 10000 (100%).

**Diagnosis**: Either the percentages were mis-entered, or a recipient was omitted. On-chain, the Allocator will either fail to execute (sum < 10000 leaves funds undistributed) or revert (sum > 10000 is impossible).

**Recovery**:
1. Recalculate the intended percentages with the user.
2. Auto-correct to 10000 by scaling or by adjusting the last recipient's share (cite [wowok-onboard](../wowok-onboard/SKILL.md) R8 fallback — auto-correct with user confirmation).
3. MODIFY the Service's `order_allocators` with the corrected `sharing` array (pre-publish only).

**Prevention**: R5 always sums the `sharing` array. The PUBLISH_READINESS_RULES table treats sum ≠ 10000 as FAIL.

### F3: Machine Cycle Detected

**Trigger**: R4 finds a cycle in the state graph (e.g., node A → B → A).

**Diagnosis**: The Machine would loop forever on the cycle. Progress instances entering the cycle never terminate. Allocation never fires. Funds are locked.

**Recovery**:
1. Identify the cycle path.
2. Break the cycle by either:
   - Removing one Forward in the cycle (if the back-edge is unintended).
   - Splitting into two Machines connected via Guard-based sub-Progress verification (cite [wowok-machine](../wowok-machine/SKILL.md) §Cross-Machine Composition). Each Machine is acyclic; the cross-Machine Guard enforces ordering.
3. Re-run R4 to confirm acyclicity.

**Prevention**: R4's cycle detection runs before publish. Post-publish, a cyclic Machine is permanently broken — must create a new Machine.

### F4: Permission Index Conflict

**Trigger**: R6 finds a Forward with `permissionIndex` < 1000 (reserved range) or an index not configured in the Permission object.

**Diagnosis**: Reserved indices (0–999) are protocol-defined and will collide with built-in roles. Unconfigured indices cause "permission denied" at runtime.

**Recovery**:
1. For a reserved index: switch the Forward to a user-defined index ≥ 1000 (recommend a dedicated Permission object with custom roles per [wowok-machine](../wowok-machine/SKILL.md) §Forward Permission Model).
2. For an unconfigured index: add the index to the Permission object (if mutable) or recreate the Permission with all required indices, then update the Machine (if mutable).
3. Alternative: replace `permissionIndex` with `namedOperator` for per-order roles (avoids the index entirely).
4. Re-run R6.

**Prevention**: Design the Permission object first, then the Machine (per [wowok-machine](../wowok-machine/SKILL.md) §Dependency-First Construction). R6 cross-references every index.

### F5: Untested Guard

**Trigger**: R3 finds a Guard bound to a fund-flow operation, but no passing `gen_passport` test is on record for that Guard.

**Diagnosis**: The Guard's logic has not been verified against any submission. A logic bug would only surface after publish, when the Guard is immutable and the host is immutable.

**Recovery**:
1. For each untested Guard: design mock submissions covering pass, fail, and edge cases (empty, boundary, unusual addresses).
2. Run `onchain_operations` → `operation_type: "gen_passport"` with each mock submission.
3. If `gen_passport` returns FAIL for the expected-pass case: `guard2file` → export, walk the tree, identify the failing node, CREATE a new Guard with corrected logic (immutable — cannot edit), re-test, rebind.
4. Record the passing test in the audit checkpoint (R3 expects a passing `gen_passport` on record).

**Prevention**: R3's PUBLISH_READINESS_RULES treats an untested Guard as WARN. R8 escalates to Permanent risk if the Guard is bound to a published host. Always run `gen_passport` before binding (cite [wowok-guard](../wowok-guard/SKILL.md) §Phase 5).

### F6: Semantic Mismatch (Phantom or Missing Object)

**Trigger**: R7 finds an object in `semantic.created` that isn't in our R2 inventory (phantom), or an expected object missing from `semantic.created` (missing), or a fund movement in `semantic.released` that doesn't match R5's expected path.

**Diagnosis**:
- **Phantom**: An orphan object from a failed prior attempt. Not referenced by anything, but exists on-chain and may confuse future queries.
- **Missing**: The creation operation may have partially failed, or the object was created under a different name/account/network.
- **Unexpected fund movement**: An unintended Allocator fired, or a Guard passed when it should have failed.

**Recovery**:
1. Phantom: query the object via `query_toolkit` → `onchain_objects` by ID; if truly orphaned, leave it (immutable) but flag it in the report so the user knows it exists.
2. Missing: retry the creation query with `no_cache: true` (cache lag is the most common cause). If still missing, check `env.account` and `env.network` match the creation operation.
3. Unexpected fund movement: FAIL — investigate which Allocator fired and why. May indicate an Allocator Guard with too-broad a trigger condition.

**Prevention**: R7 cross-checks `semantic` against R2's inventory. Run audits with `no_cache: true` to avoid cache-lag false negatives.

---

## Tier Layering

### Tier 1 — Basic Audit

**Profile**: Single Service + single Guard + single Allocator. No Machine (or a trivial 2-node Machine). The user is publishing a simple payment service.

**AI Behavior**:
- Run R1 (scope = single Service), R2 (inventory), R3 (Guard completeness — one Guard), skip R4 (no Machine or trivial), R5 (fund flow — one payment path, one refund path, one Allocator sum), R6 (permission — one index), R7 (semantic — cross-check the single Service's recent operations), R8 (risk — low, recoverable), R9 (report), R10 (decision).
- GUARD_COMPLETENESS_RULES and FUND_FLOW_RULES are the primary tables. MACHINE_SOUNDNESS_RULES is skipped or trivial.
- Trigger: user says "audit my service" with a single Service in scope.

### Tier 2 — Standard Audit

**Profile**: Multi-Guard + multi-state Machine + multi-Allocator. The user is publishing a Service with a non-trivial workflow (e.g., freelance, rental, e-commerce with dispute flow).

**AI Behavior**:
- Full R1-R10. All four rule tables apply.
- R3 checks every Guard binding across Service `buy_guard`, `order_allocators[].guard`, and Machine Forward `guard`.
- R4 runs full Machine soundness (acyclicity, single entry, reachability, terminal correctness, forward permissions, threshold achievability).
- R5 traces every payment → escrow → allocation path, including branches and dispute refund paths.
- R6 cross-references every Forward's `permissionIndex` against the Permission object.
- R7 cross-checks `semantic.created`/`modified`/`released`/`events` against the full object inventory.
- Trigger: user has a Service with a bound published Machine, multiple Guards, and multiple Allocators.

### Tier 3 — Advanced Audit

**Profile**: Complex dependency chains + conditional flows + arbitration integration. The user is publishing a multi-Machine supply chain, a Service with cross-Machine Guard verification, or an Arbitration-bound Service.

**AI Behavior**:
- Full R1-R10 with extended checks.
- R2 builds a dependency graph spanning multiple Machines, multiple Services, and Arbitration objects. Detects object-level cycles across the supply chain.
- R3 includes Arbitration `voting_guard` and `usage_guard` completeness — every voting_guard has a numeric `GuardIdentifier`; every usage_guard has a valid Passport path.
- R4 includes cross-Machine Guard verification: Machine A's Forward Guard queries Machine B's Progress via `convert_witness`. Verify the witness type and query instruction ID are correct (cite [wowok-machine](../wowok-machine/SKILL.md) F5).
- R5 traces fund flow across Machines: payment on Service A → escrow → Allocation on Service A triggers sub-order on Service B → escrow on Service B → Allocation on Service B. Verify refund symmetry across the entire chain.
- R7 cross-checks `semantic` across all Machines and Services — every expected object creation and fund movement appears in the right operation's semantic field.
- R8 classifies blast radius up to `all_services_on_machine` and `all_arbitrations_on_guard`. A Guard logic bug on a shared voting_guard affects every Arbitration using it.
- Trigger: user explicitly asks for "advanced audit", references cross-Machine composition, or has an Arbitration-bound Service with voting guards.
