# Appendix — wowok-planner

> This file is loaded on-demand (Progressive Disclosure).
> Main skill: [SKILL.md](./SKILL.md)

---

## Dialogue Scripts (R1-R10)

Each round follows: state the goal, ask the minimum questions needed, gather inputs (LLM translation only when free text is ambiguous), update the ODG in memory, persist checkpoint, advance.

### R1: Intent Capture

**AI Goal**: Capture the user's natural-language intent and classify it against the Scenario Registry.

**Key Questions**:
- What do you want to build? (one or two sentences)
- Who is your customer, and what do they pay for?
- Is there a deposit, milestone, or instant exchange of value?

**Tool Calls**:
1. `query_toolkit` → `local_names` — check for any prior planning checkpoint to offer a resume path.
2. (Internal) Match intent against the Scenario Registry §Intent Keywords. If two candidates score equally, ask one disambiguating question (LLM-translated to a typed choice).
3. If no candidate matches → select `general` scenario (no failure — the fallback is intentional).

**Success Criteria**: A `scenario` field is set on the ODG (one of `freelance`, `rental`, `digital_goods`, `travel_package`, `general`). The scenario's ODG template is loaded as the working skeleton.

**Fallback**: If intent is too vague to match even `general` confidently → ask one clarifying question and retry once. After two retries, proceed with `general` and flag the uncertainty in the ODG `notes`.

**Checkpoint**: Persist `{ round: R1, task_id, scenario, intent_text, traits }`.

---

### R2: Account Status

**AI Goal**: Determine the working account and inventory existing objects so later rounds can decide reuse vs create.

**Key Questions**:
- Which account is the working account? (name or address)
- (If multiple) Which one holds your existing WoWok objects?

**Tool Calls**:
1. `query_toolkit` → `local_names` — list accounts and local marks.
2. `query_toolkit` → `account_balance` — verify balance > 0; if zero, surface a funding reminder (do not auto-faucet — the Harness owns execution).
3. `query_toolkit` → `onchain_objects` (filter types: Permission, Service, Machine, Guard, Allocation) — build an inventory map keyed by object type and friendly name.

**Success Criteria**: Working account recorded. Object inventory persisted so R3-R7 can resolve reuse candidates by name without re-querying.

**Fallback**: Account has zero balance → record `funding_required: true` in the ODG as a phase-0 prerequisite; do not block planning. Inventory query returns empty → all objects will be CREATE in subsequent rounds.

**Checkpoint**: Persist `{ round: R2, account, balance, inventory: { permission: [...], service: [...], machine: [...], guard: [...], allocation: [...] } }`.

---

### R3: Service Definition

**AI Goal**: Define the Service object's identity fields. Reuse is NOT an option for Service when the intent is a new service — a new Service draft is always planned; existing Services are only candidates if the user explicitly wants to extend one.

**Key Questions**:
- Service name? (scenario default applied, user confirms or overrides)
- type_parameter (payment token type)? Default `0x2::wow::WOW`.
- Deliverable description and base price?

**Tool Calls**:
1. (Internal) Load scenario template's Service defaults.
2. If user references an existing Service by name → `query_toolkit` → `onchain_objects` to confirm it exists and is unpublished (published Services cannot be extended); record as `reuse_candidate`.
3. No on-chain writes — the planner only records the intended Service shape in the ODG. Execution is deferred to the Harness.

**Success Criteria**: ODG `objects[]` contains a Service entry with `status: planned`, `dependencies: []` (Service is the root), and `user_decisions: { name, type_parameter, description, price }`.

**Fallback**: type_parameter unknown → default to `0x2::wow::WOW`, flag for confirmation. Description too short → prompt for one more sentence (LLM translates to a typed string).

**Checkpoint**: Persist `{ round: R3, service: { name, type_parameter, description, price, reuse: false } }`.

---

### R4: Permission Model

**AI Goal**: Decide reuse vs create for the Permission object and record the role-to-index map. This is the highest-leverage reuse decision — wowok-safety §1.1 strongly recommends a single shared Permission.

**Key Questions**:
- Reuse an existing Permission, or create a new one? (default: reuse if any candidate exists)
- If creating: confirm the scenario's default indexes (e.g., freelance: provider=1000, arbiter=1500, customer uses `namedOperator: ""`).

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` (filter type=Permission) — already in R2 inventory; present candidates by friendly name.
2. (Internal) Apply Decision Tree §D1 Reuse-vs-Create.
3. (Internal) Validate chosen indexes: user-defined must be ≥ 1000; < 1000 is reserved (wowok-tools §Permission Index Model). Reject and re-prompt if invalid.

**Success Criteria**: ODG contains a Permission entry with `status: planned` (create) or `status: reuse` (with the existing object ID), and a `role_index_map` consumed by R5 Machine Forwards.

**Fallback**: User wants a role split beyond scenario defaults → flag as Tier 3, hand the Permission design detail to wowok-safety for index rules, but keep the planner's record of the chosen map.

**Checkpoint**: Persist `{ round: R4, permission: { reuse: bool, id?, indexes: { provider, arbiter, ... } } }`.

---

### R5: Machine Design

**AI Goal**: Define the state graph: entry node, intermediate states, terminal nodes, forward transitions, and operator bindings per forward.

**Key Questions**:
- Confirm the scenario's default node graph, or list your custom states?
- Per forward: who advances it? (permissionIndex from R4, or `namedOperator: ""` for the order owner)
- Any timeout / auto-advance forwards? (recommended for acceptance and return nodes)

**Tool Calls**:
1. (Internal) Load scenario template's Machine graph.
2. `machineNode2file` — if the user is editing an existing Machine draft, export it for visual review. (Read-only; the planner does not publish.)
3. (Internal) Validate: every forward's `permissionIndex` exists in R4's map OR uses `namedOperator`; every non-entry node has at least one inbound forward; at least one terminal node exists.

**Success Criteria**: ODG contains a Machine entry with `status: planned`, `dependencies: [Permission]`, and a `node_graph` payload (nodes, forwards, guard bindings referenced by name, not yet created).

**Fallback**: User wants a workflow beyond the scenario template → switch to `general` scenario for the Machine only, delegate detail design to wowok-machine, but retain the planner's record of the final graph. Cycle detected in the graph → trigger §F1 Dependency Cycle playbook.

**Checkpoint**: Persist `{ round: R5, machine: { nodes: [...], forwards: [...], terminal_nodes: [...] } }`.

---

### R6: Guard Strategy

**AI Goal**: Decide which operations need Guards, define each Guard's host (Service.buy_guard, a Machine Forward, or an Allocator trigger), and record the validation logic and submission requirements.

**Key Questions**:
- Which operations move funds or mark irreversible state? (Those need Guards.)
- For each: what must the submitter prove? (KYC, WIP hash, signature, balance threshold)
- Apply scenario's default Guard set, or customize?

**Tool Calls**:
1. (Internal) Apply Decision Tree §D2 Guard Necessity.
2. (Internal) Load scenario template's Guard table.
3. `guard2file` — if the user is editing existing Guard drafts, export for review. (Read-only.)
4. (Internal) Validate: every Guard referenced by a Machine Forward (R5) or an Allocator trigger (R7) has a corresponding entry; `convert_witness` target types are consistent with the host object type.

**Success Criteria**: ODG contains one Guard entry per planned Guard, each with `host`, `validation_logic`, `submission_fields`, and `bound_to` (Forward name or Allocator). Guards are listed before Allocators because R7 references them.

**Fallback**: A Guard's logic is too complex for the scenario template → delegate to wowok-guard for the detailed table, retain the planner's record of host and trigger. `gen_passport` testing is deferred to the Harness execution phase (the planner does not write).

**Checkpoint**: Persist `{ round: R6, guards: [{ name, host, bound_to, submission_fields }] }`.

---

### R7: Allocation Plan

**AI Goal**: Define the fund distribution rules — one Allocator per terminal path, each Guard-gated, with a sharing array whose basis-point sum equals 10000.

**Key Questions**:
- Per terminal path (completed, refunded, damage_confirmed, etc.): who receives funds and in what ratio?
- Confirm sharing sum = 10000 (basis points) per Allocator.
- Recipient type per share: `Entity` (known address), `GuardIdentifier` (dynamic Order/customer), or `Signer`.

**Tool Calls**:
1. (Internal) Apply Decision Tree §D3 Allocation Strategy.
2. (Internal) Load scenario template's Allocator strategy.
3. (Internal) Validate: every Allocator's trigger Guard exists in R6; refund path is covered (wowok-safety requires a refund Allocator for any dispute-capable service); sharing sum = 10000 per Allocator.

**Success Criteria**: ODG contains one Allocation entry per terminal path, each with `trigger_guard`, `sharing[]`, and `dependencies: [Guard, Service]`. The `order_allocators` field on the Service entry is marked for binding at execution time.

**Fallback**: Sharing sum ≠ 10000 → auto-normalize to 10000 with user confirmation (§F6). Missing refund path → block, prompt user to add one (hard requirement, not a warning). User wants multi-tier allocation (travel scenario) → flag as Tier 2/3, ensure each tier's Guard chain is recorded.

**Checkpoint**: Persist `{ round: R7, allocations: [{ trigger_guard, sharing, refund_path_covered }] }`.

---

### R8: ODG Review

**AI Goal**: Present the complete Object Dependency Graph and phased execution plan for explicit user confirmation before any execution begins.

**Key Questions**:
- Review the ODG summary (object count, phases, irreversible actions). Approve?
- Any object you want to reconfigure before we hand off?

**Tool Calls**:
1. (Internal) Assemble the full ODG from R1-R7 records.
2. (Internal) Run §D4 Publishing Timing check — Service publish must come AFTER all Guards tested and Machine published.
3. (Internal) Detect dependency cycles via §F1; abort review if any found.
4. Present the ODG in human-readable form: object table, phase list, reversibility flags.

**Success Criteria**: User explicitly approves the ODG. `status: confirmed` is set on the ODG root. No on-chain writes have occurred.

**Fallback**: User requests changes → return to the relevant round (R3-R7), apply the change, re-run R8 review. Do not partially confirm — the ODG is confirmed as a whole.

**Checkpoint**: Persist `{ round: R8, odg_confirmed: true, odg_snapshot: <full ODG> }`.

---

### R9: Risk Assessment

**AI Goal**: Flag irreversibility, fund risk, and estimated time per phase so the user gives informed consent before execution.

**Key Questions**:
- Confirm you accept the irreversible actions listed (Machine publish, Service publish, Guard creation)?
- Confirm the fund-risk paths (deposit escrow, refund Allocator)?

**Tool Calls**:
1. (Internal) Compute `reversible` per object (see §Reversibility Matrix).
2. (Internal) Estimate `estimated_time` per phase from scenario template defaults (Tier 1 ≈ 10 min, Tier 2 ≈ 30 min, Tier 3 ≈ 60 min, excluding human response time).
3. (Internal) List every object whose creation or publish is irreversible; require explicit per-item acknowledgment.

**Success Criteria**: Every irreversible object has `user_acknowledged: true`. ODG `risk_assessment` block is populated with `irreversible_count`, `fund_risk_paths`, and `estimated_total_time`.

**Fallback**: User declines to acknowledge an irreversible action → loop back to R8, offer the alternative (e.g., defer publish, create as draft only). If no safe alternative exists → block handoff and surface the conflict.

**Checkpoint**: Persist `{ round: R9, risk_assessment, acknowledgments: [...] }`.

---

### R10: Execution Handoff

**AI Goal**: Pass the confirmed, risk-assessed ODG to the L4 Harness with a checkpoint plan and per-phase verification hooks.

**Key Questions**:
- Ready to hand off to the Harness for execution?
- Which execution delegate should run the phases? (default: wowok-onboard for a fresh build; wowok-provider for extensions)

**Tool Calls**:
1. (Internal) Emit the Harness handoff packet (see §Handoff Protocol).
2. `local_info_operation` → persist the final ODG under a stable `task_id` key so the Harness can read it.
3. (Internal) Register per-phase verification hooks: after each phase, the Harness must re-query on-chain state and reconcile with the ODG before advancing.

**Success Criteria**: Harness acknowledges receipt of the ODG and begins phase 1. Planner's role ends; control passes to the execution loop.

**Fallback**: Harness unavailable or rejects the ODG → keep the checkpoint, surface the rejection reason, loop back to the offending round. Do not re-plan from scratch — the ODG is the source of truth and only the flagged phase needs revision.

**Checkpoint**: Persist `{ round: R10, handed_off: true, harness_phase: 1, delegate: <skill_name> }`. Mark planning COMPLETE.

---

## Scenario Registry

Each scenario is a deterministic ODG template. The planner loads the matched scenario at R1 and fills it across R2-R7. Scenarios are presets, not constraints — every field is overridable.

| Scenario | Intent Keywords | Trust Pattern | Default Tier |
|----------|-----------------|---------------|--------------|
| `freelance` | "freelance", "commission", "design", "develop", "consult", "deliverable" | Milestone allocation, acceptance gate | Tier 1 |
| `rental` | "rent", "rental", "deposit", "lease", "borrow", "return" | Deposit escrow, return inspection | Tier 2 |
| `digital_goods` | "sell digital", "download", "instant", "e-book", "template", "license key" | Instant delivery, no escrow | Tier 1 |
| `travel_package` | "tour", "travel", "itinerary", "trip", "package", "multi-segment" | Multi-tier allocation per segment | Tier 3 |
| `general` | (fallback) | User-defined | Tier 1+ |

### Scenario: freelance

- **Intent keywords**: freelance, commission, design, develop, consult, deliverable
- **ODG template**: Permission → Service → Machine (ordered→in_progress→delivered→accepted→completed, disputed→refunded) → Progress → Guards (buy, deliver, accept, withdraw, refund) → Allocation (100% provider on completed, 100% refund on refunded)
- **Default permission indexes**: provider=1000, arbiter=1500, customer uses `namedOperator: ""`
- **Typical Machine states**: ordered, in_progress, delivered, accepted, completed, disputed, refunded
- **Guard recommendations**: buy_guard (KYC + cap), deliver_guard (WIP hash), accept_guard (signature or timeout), withdraw_guard (completed gate), refund_guard (refunded gate)
- **Allocation template**: 2 Allocators — completed path 100% to provider Entity; refunded path 100% to Order via GuardIdentifier:0
- **Reference**: [wowok-scenario §Freelance Mode](../wowok-scenario/SKILL.md)

### Scenario: rental

- **Intent keywords**: rent, rental, deposit, lease, borrow, return, inspect
- **ODG template**: Permission → Service → Machine (reserved→paid_deposit→in_use→returned→inspected→deposit_refunded→completed / damage_confirmed→deposit_deducted) → Progress → Guards (deposit, return, inspect, refund, damage) → Allocation (rent to owner, deposit refund to renter, deposit deduct to owner)
- **Default permission indexes**: owner=1000, arbiter=1500, renter uses `namedOperator: ""`
- **Typical Machine states**: reserved, paid_deposit, in_use, returned, inspected, deposit_refunded, completed, damage_confirmed, deposit_deducted, arbiter_rule
- **Guard recommendations**: deposit_guard (balance ≥ deposit), return_guard (signature or timeout), inspect_guard (WIP hash of return condition), refund_guard (inspection passed), damage_guard (WIP hash diff pre vs post)
- **Allocation template**: 3 Allocators — deposit_guard 100% rent to owner; refund_guard 100% deposit to renter; damage_guard 100% deposit to owner
- **Reference**: [wowok-scenario §Rental Mode](../wowok-scenario/SKILL.md)

### Scenario: digital_goods

- **Intent keywords**: sell digital, download, instant, e-book, template, license, asset
- **ODG template**: Permission → Service → Machine (paid → delivered → completed, refunded) → Progress → Guards (buy_guard with cap + KYC, instant_deliver_guard with WIP hash, refund_guard) → Allocation (100% provider on completed, 100% refund on refunded)
- **Default permission indexes**: provider=1000, arbiter=1500 (optional for low-value goods), customer uses `namedOperator: ""`
- **Typical Machine states**: paid, delivered, completed, refunded
- **Guard recommendations**: buy_guard (KYC + cap), instant_deliver_guard (auto-fires on payment, verifies WIP hash), refund_guard (failure-to-deliver within timeout)
- **Allocation template**: 2 Allocators — completed 100% to provider; refunded 100% to Order. No deposit, no inspection.
- **Notes**: Simplest trust pattern. Machine is short (3-4 nodes). Suitable for Tier 1 default.

### Scenario: travel_package

- **Intent keywords**: tour, travel, itinerary, trip, package, multi-segment, agency
- **ODG template**: Permission → Service → Machine (booked→paid_deposit→paid_final→segment_D1→segment_D2→...→return→completed / interrupted→refunded) → Progress → Guards (segment_guard per segment with WIP, refund_guard for interruption) → Allocation (multi-tier: deposit to agency, final to agency, then agency-side Allocation waterfall to hotel/guide/driver)
- **Default permission indexes**: agency=1000, arbiter=1500, customer uses `namedOperator: ""`
- **Typical Machine states**: booked, paid_deposit, paid_final, segment_D1..Dn, return, completed, interrupted, refunded
- **Guard recommendations**: segment_guard (per-segment arrival WIP), refund_guard (agency approval or arbiter for interruption), no auto-advance (each segment requires explicit proof)
- **Allocation template**: multi-tier — primary Allocators pay agency; secondary Allocators (chained) split agency receipts to hotel/guide/driver per segment. Tier 3.
- **Reference**: [wowok-scenario §Travel Mode](../wowok-scenario/SKILL.md)

### Scenario: general (Fallback)

- **Intent keywords**: (none — selected when no other scenario matches)
- **ODG template**: empty skeleton — Permission → Service → Machine (entry→terminal minimum) → Progress → Guards (buy_guard + refund_guard minimum) → Allocation (at least one completed path + one refund path)
- **Default permission indexes**: provider=1000, arbiter=1500, customer uses `namedOperator: ""` (same as freelance; user can override)
- **Typical Machine states**: user-defined; planner enforces minimum 2 nodes (entry + terminal)
- **Guard recommendations**: buy_guard and refund_guard are mandatory minimums; user adds others as needed
- **Allocation template**: one completed-path Allocator + one refund-path Allocator; user defines sharing
- **Notes**: This is the escape hatch, not an error. The planner loads `general` confidently and continues R2-R7 with empty defaults filled by user input.

---

## ODG Data Structure

The ODG is the single output artifact of the planner. It is persisted via `local_info_operation` and consumed by the Harness.

```json
{
  "task_id": "task_20260714_001",
  "scenario": "freelance",
  "version": 1,
  "status": "confirmed",
  "account": "merchant_v1",
  "objects": [
    {
      "id": "obj_permission",
      "type": "permission",
      "status": "planned",
      "reversible": true,
      "dependencies": [],
      "user_decisions": {
        "reuse": false,
        "indexes": { "provider": 1000, "arbiter": 1500 }
      },
      "estimated_time": "1 min"
    },
    {
      "id": "obj_service",
      "type": "service",
      "status": "planned",
      "reversible": true,
      "dependencies": ["obj_permission"],
      "user_decisions": {
        "name": "Logo Design Service",
        "type_parameter": "0x2::wow::WOW",
        "description": "Custom logo, 3 revisions, 5-day delivery",
        "price": 500,
        "publish": "deferred"
      },
      "estimated_time": "2 min"
    },
    {
      "id": "obj_machine",
      "type": "machine",
      "status": "planned",
      "reversible": false,
      "dependencies": ["obj_permission"],
      "user_decisions": {
        "nodes": ["ordered", "in_progress", "delivered", "accepted", "completed", "disputed", "refunded"],
        "forwards": [
          { "name": "place_order", "namedOperator": "" },
          { "name": "accept_order", "permissionIndex": 1000 },
          { "name": "submit_deliverable", "permissionIndex": 1000, "guard": "deliver_guard" },
          { "name": "confirm_acceptance", "namedOperator": "", "guard": "accept_guard" },
          { "name": "finalize", "permissionIndex": 1000 },
          { "name": "open_dispute", "namedOperator": "" },
          { "name": "arbiter_rule_refund", "permissionIndex": 1500 }
        ],
        "publish": "deferred"
      },
      "estimated_time": "3 min"
    },
    {
      "id": "obj_progress",
      "type": "progress",
      "status": "planned",
      "reversible": true,
      "dependencies": ["obj_machine", "obj_service"],
      "user_decisions": { "mirror_machine": true },
      "estimated_time": "1 min"
    },
    {
      "id": "obj_guard_withdraw",
      "type": "guard",
      "status": "planned",
      "reversible": false,
      "dependencies": [],
      "user_decisions": {
        "host": "allocator_trigger",
        "bound_to": "obj_allocation_withdraw",
        "validation_logic": "Progress.current == completed",
        "submission_fields": ["progress_id"]
      },
      "estimated_time": "2 min"
    },
    {
      "id": "obj_allocation_withdraw",
      "type": "allocation",
      "status": "planned",
      "reversible": false,
      "dependencies": ["obj_guard_withdraw", "obj_service"],
      "user_decisions": {
        "trigger_guard": "obj_guard_withdraw",
        "sharing": [
          { "who": { "Entity": { "name_or_address": "obj_service" } }, "sharing": 10000, "mode": "Rate" }
        ]
      },
      "estimated_time": "2 min"
    }
  ],
  "phases": [
    {
      "name": "phase_1_draft_objects",
      "objects": ["obj_permission", "obj_service", "obj_machine", "obj_progress", "obj_guard_withdraw", "obj_allocation_withdraw"],
      "verification": "query_toolkit.onchain_objects confirms all objects exist with bPublished=false"
    },
    {
      "name": "phase_2_guard_test",
      "objects": ["obj_guard_withdraw"],
      "verification": "gen_passport returns PASS for each Guard with mock submission"
    },
    {
      "name": "phase_3_test_order",
      "objects": ["obj_service"],
      "verification": "Test order traverses full Machine, Allocation distributes correctly"
    },
    {
      "name": "phase_4_publish",
      "objects": ["obj_machine", "obj_service"],
      "verification": "bPublished=true on Machine then Service; immutability locks confirmed"
    }
  ],
  "risk_assessment": {
    "irreversible_count": 4,
    "fund_risk_paths": ["refund path covered: obj_allocation_refund"],
    "estimated_total_time": "12 min (excluding human response)"
  },
  "handoff": {
    "delegate": "wowok-onboard",
    "checkpoint_key": "odg_task_20260714_001",
    "verification_hooks": ["post_phase_1", "post_phase_2", "post_phase_3", "pre_phase_4_publish"]
  },
  "notes": []
}
```

### Reversibility Matrix

| Object | `reversible` before publish | `reversible` after publish | Recovery |
|--------|------------------------------|----------------------------|----------|
| Permission | true | true (modifiable) | MODIFY in place |
| Service (draft) | true | false | Create new Service |
| Machine (draft) | true | false (nodes locked) | Create new Machine, rebind Service |
| Progress | true | true (template modifiable) | MODIFY |
| Guard | false (immutable on creation) | false | Create new Guard, update all refs |
| Allocation | false (immutable on creation) | false | Create new Allocation, rebind Service |

---

## Decision Trees

### D1: Reuse vs Create (per object)

```
For each of Permission / Machine / Guard / Allocation / Progress:
├── R2 inventory contains a candidate AND user confirms reuse?
│   ── YES ──→ REUSE: record existing object ID, status: reuse, skip creation in execution
├── User explicitly says "create new"?
│   ── YES ──→ CREATE: status: planned, dependencies resolved at execution
└── User unsure?
    ──→ query on-chain, present candidates by friendly name, let user pick
    ──→ Default: Permission = REUSE (wowok-safety §1.1 strong recommendation);
        Machine/Guard/Allocation = CREATE (scenario-specific)
```

### D2: Guard Necessity (which operations need Guards)

```
For each operation that changes state or moves funds:
├── Does the operation release funds from escrow?
│   ── YES ──→ Guard REQUIRED (allocator trigger guard)
├── Does the operation mark an irreversible state transition?
│   ── YES ──→ Guard REQUIRED (machine forward guard)
├── Does the operation accept an order / take custody?
│   ── YES ──→ Guard REQUIRED (service buy_guard: KYC + amount cap)
├── Does the operation only read or advance a non-fund, non-terminal node?
│   ── YES ──→ Guard OPTIONAL (logistics-only forward)
└── No fund flow AND no irreversible state change?
    ──→ Guard NOT NEEDED
```

### D3: Allocation Strategy (single vs multi-allocator)

```
How many terminal nodes does the Machine have?
├── 1 terminal (e.g., digital_goods: completed only)
│   ──→ SINGLE Allocator: 100% to provider on completed
├── 2 terminals (e.g., freelance: completed + refunded)
│   ──→ DUAL Allocators: one per terminal, refund path mandatory
├── 3+ terminals (e.g., rental: completed + refunded + damage_deducted)
│   ──→ MULTI Allocators: one per terminal, each with its trigger Guard
└── Multi-tier distribution (travel: agency then hotel/guide/driver)?
    ──→ TIER 3: chained Allocators, primary pays agency, secondary splits agency receipts
    ──→ Validate each tier's trigger Guard chain is acyclic
```

### D4: Publishing Timing (when to publish Service)

```
Service publish readiness:
├── Machine published? ── NO ──→ BLOCK: publish Machine first
├── All Guards created and gen_passport PASS? ── NO ──→ BLOCK: re-test Guards
├── order_allocators bound and each Allocator's Guard exists? ── NO ──→ BLOCK: bind Allocators
├── Test order completed phase_3 successfully? ── NO ──→ BLOCK: run dry-run
└── All checks PASS ──→ publish Machine (phase_4), then publish Service
    ──→ Post-publish: verify bPublished=true, machine + order_allocators immutable
```

### D5: Scenario Match (R1 intent classification)

```
User intent text
├── keywords match freelance? ──→ scenario = freelance (Tier 1)
├── keywords match rental? ──→ scenario = rental (Tier 2)
├── keywords match digital_goods? ──→ scenario = digital_goods (Tier 1)
├── keywords match travel_package? ──→ scenario = travel_package (Tier 3)
├── multiple scenarios match equally?
│   ──→ ask one disambiguating question (LLM-translated to typed choice)
│   ──→ retry once; if still ambiguous → general
└── no scenario matches ──→ scenario = general (fallback, not an error)
```

---

## Failure Playbooks

### F1: Dependency Cycle Detection

**Symptom**: The ODG assembler detects a cycle — object A depends on B, B depends on A (directly or transitively).

**Recovery**:
1. Run a topological sort on `objects[].dependencies`. If it fails, a cycle exists.
2. Identify the cycle's edges. Most cycles come from the Object-Guard Circular Reference Pattern (wowok-tools §Object-Guard Circular Reference Pattern) being modeled as a hard dependency instead of a name-resolved soft reference.
3. Replace the hard dependency with a `name_reference` field: Guards reference their host object by name (string), not by ODG id. The SDK resolves the name at runtime.
4. Re-run the sort. If still cyclic → the Machine graph itself has a cycle; hand off to wowok-machine §Cycle Detection.
5. Do NOT hand off to the Harness until the ODG is acyclic.

### F2: Missing User Decisions (R1-R7 incomplete)

**Symptom**: The planner reaches R8 review but one or more objects have empty `user_decisions`.

**Recovery**:
1. Identify which round owns each empty decision (R3=Service fields, R4=Permission, R5=Machine, R6=Guards, R7=Allocation).
2. Return to the earliest incomplete round; apply scenario defaults for any field the user skipped, flag each auto-filled field in `notes`.
3. Re-run R8 review. If the user rejects an auto-fill → loop back to that specific field.
4. Never hand off an ODG with empty `user_decisions` — the Harness will fail at execution.

### F3: Scenario Miss (intent doesn't match any template)

**Symptom**: No scenario keywords match the user's intent, or the user explicitly says "none of these fit".

**Recovery**:
1. Select `general` scenario. This is the intended fallback, not an error.
2. Load the empty ODG skeleton (Permission + Service + 2-node Machine + buy_guard + refund_guard + 2 Allocators).
3. Walk R3-R7 with empty defaults; the user provides every field.
4. If the user's intent is actually a hybrid (e.g., freelance + deposit) → load the dominant scenario and add the conflicting trait as an override, recording the hybrid in `notes`.
5. Flag the ODG as Tier 1+ (user-defined complexity).

### F4: LLM Fallback (LLM unavailable or rate-limited)

**Symptom**: The LLM cannot be invoked for intent clarification or free-text translation.

**Recovery**:
1. Fall back to pure rule-based planning: skip clarification questions, apply the first scenario whose keywords match (or `general` if none).
2. For free-text fields (description, deliverable), use the scenario template's placeholder text verbatim and flag `needs_user_edit: true` in `notes`.
3. For typed choices, apply the scenario default without asking.
4. Mark the ODG `planning_mode: "rule_only"` so the Harness knows human review of free-text fields is required before phase 4 publish.
5. Do NOT block planning on LLM unavailability — the deterministic path must always produce a valid ODG.

### F5: Resume Conflict (checkpoint vs on-chain state)

**Symptom**: On resume, an object in the ODG checkpoint no longer exists on-chain, or its state has changed (e.g., a draft Service was published by another path).

**Recovery**:
1. `query_toolkit` → `onchain_objects` for every object ID in the checkpoint.
2. For each mismatch:
   - Object missing → mark `status: missing`, re-plan that object as CREATE in the next phase.
   - Object published unexpectedly → mark `status: published`, skip its creation phase, verify its fields match the ODG (if not, surface conflict).
   - Object modified → re-read its current fields, update the ODG, flag `user_review: true`.
3. On-chain state is the source of truth; the checkpoint is only a hint.
4. If more than 30% of objects are mismatched → recommend restarting planning from R1.

### F6: Sharing Sum Invalid

**Symptom**: An Allocator's `sharing` array sums to a value other than 10000 (basis points).

**Recovery**:
1. Auto-normalize: scale each share proportionally so the sum equals 10000. Round to whole basis points; assign any remainder to the largest share.
2. Present the normalized array to the user for confirmation at R8.
3. If the user rejects → return to R7, let the user re-enter shares manually.
4. Never hand off an ODG with an invalid sharing sum — the Move contract will reject the Allocation at creation.

---

## Tier Layering

### Tier 1 (Basic)

- Single Service + simple Machine (≤ 5 nodes) + 1 Guard set (buy + refund minimum) + 1-2 Allocators
- Single allocator recipient (provider only)
- Scenario templates drive all defaults; user only confirms
- Typical scenarios: freelance (simple), digital_goods
- Estimated planning time: 5 minutes
- Estimated execution time: 10 minutes

### Tier 2 (Standard)

- Multi-Guard (3-5 Guards including deposit/inspect/damage) + multi-state Machine (6-10 nodes) + multi-Allocator (3+ terminal paths)
- Multiple recipient types (Entity + GuardIdentifier)
- Timeout/auto-advance forwards on acceptance and return nodes
- Typical scenarios: rental, freelance with arbitration
- Estimated planning time: 10 minutes
- Estimated execution time: 30 minutes

### Tier 3 (Advanced)

- Complex dependency chains (chained Allocators, multi-tier distribution) + conditional flows (arbiter routing) + arbitration integration
- Multi-tier Allocation (primary → secondary waterfall)
- Hybrid scenarios (e.g., travel + rental)
- Guard chains where one Guard's output feeds another's submission
- Typical scenarios: travel_package, general with custom complexity
- Estimated planning time: 20 minutes
- Estimated execution time: 60 minutes

### Tier Escalation Rules

- If the user overrides more than 3 scenario defaults → escalate one tier.
- If the Machine has > 10 nodes → escalate one tier.
- If multi-tier Allocation is selected → minimum Tier 3.
- If arbitration is bound → minimum Tier 2.
- Tier can be escalated mid-planning; it never downgrades within a single task.

---

## Handoff Protocol

### When to Hand Off

| Trigger | Target | Reason |
|---------|--------|--------|
| R10 confirmed, fresh build | [wowok-onboard](../wowok-onboard/SKILL.md) | Guided R1-R10 execution of the ODG |
| R10 confirmed, extending existing Service | [wowok-provider](../wowok-provider/SKILL.md) | Operations-phase execution |
| R5 Machine design exceeds scenario template | [wowok-machine](../wowok-machine/SKILL.md) | Custom workflow detail design |
| R6 Guard logic exceeds scenario template | [wowok-guard](../wowok-guard/SKILL.md) | Custom Guard table design |
| R9 reveals dispute scenario | [wowok-arbitrator](../wowok-arbitrator/SKILL.md) | Arbitration setup before publish |
| User asks about buyer-side flow | [wowok-order](../wowok-order/SKILL.md) | Customer perspective |

### Handoff Packet Format

When handing off to the Harness or a delegate Skill, emit this context bundle:

```yaml
handoff:
  from: wowok-planner
  to: <harness_or_delegate>
  state:
    journey: planning
    completed_rounds: R1-R10
    scenario: freelance
    tier: 1
    account: merchant_v1
  odg:
    task_id: task_20260714_001
    checkpoint_key: odg_task_20260714_001
    object_count: 6
    phase_count: 4
    irreversible_count: 4
    status: confirmed
  carry_context:
    - scenario_template  # so delegate knows what was pre-filled
    - user_decisions     # any deviations from scenario defaults
    - risk_acknowledgments  # R9 acknowledgments
  next_actions:
    - phase: phase_1_draft_objects
      delegate: wowok-onboard
      verification: query_toolkit.onchain_objects confirms all objects exist with bPublished=false
    - phase: phase_2_guard_test
      verification: gen_passport returns PASS for each Guard
    - phase: phase_3_test_order
      verification: test order traverses full Machine
    - phase: phase_4_publish
      verification: bPublished=true, immutability locks confirmed
```

### Resumption Protocol

When `wowok-planner` is invoked and a checkpoint exists:
1. Read the ODG checkpoint via `local_info_operation` using the `task_id`.
2. For each object in the ODG, `query_toolkit` → `onchain_objects` to verify current state (apply §F5 Resume Conflict if mismatched).
3. If all valid → resume at the next unconfirmed round.
4. If the ODG was already `status: confirmed` but Harness execution was interrupted → hand back to the Harness with the phase pointer, do not re-plan.
5. **Invariant**: on-chain state is the source of truth. The ODG is the plan; the chain is the reality.

---

## Quick Reference

| Want to... | Use this |
|------------|----------|
| Classify a new intent | §Scenario Registry + §D5 Scenario Match |
| Decide reuse vs create | §D1 Reuse vs Create |
| Decide if a Guard is needed | §D2 Guard Necessity |
| Pick an Allocation strategy | §D3 Allocation Strategy |
| Know when to publish | §D4 Publishing Timing |
| Recover from a dependency cycle | §F1 Dependency Cycle Detection |
| Recover from missing decisions | §F2 Missing User Decisions |
| Handle unmatched intent | §F3 Scenario Miss |
| Plan without an LLM | §F4 LLM Fallback |
| Resume an interrupted plan | §F5 Resume Conflict + §Resumption Protocol |
| Estimate planning/execution time | §Tier Layering |
