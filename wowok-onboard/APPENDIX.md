# Appendix — wowok-onboard

> This file is loaded on-demand (Progressive Disclosure).
> Main skill: [SKILL.md](./SKILL.md)

---

## Onboarding Flow (R1-R10)

Every round follows the same shape: state the goal, ask the key question(s), execute the MCP calls, verify success criteria, persist checkpoint, fall back on failure.

### R1: Welcome + Account Setup

**AI Goal**: Confirm the user is new (or resuming), establish the working account, fund it via faucet if empty.

**Key Questions**:
- Are you creating a new account or importing/reusing an existing one?
- If existing: which account name or address?
- (Resume path) Do you want to resume your last onboarding session?

**Tool Calls**:
1. `query_toolkit` → `local_names` — list existing accounts and local marks
2. If new: `account_operation` → `gen` (with `m: true` if Messenger is needed) → returns account name/address
3. `query_toolkit` → `account_balance` — verify balance > 0
4. If balance = 0: `account_operation` → `faucet` (testnet) OR `account_operation` → `transfer` from a funded account (mainnet)

**Success Criteria**: An account with non-zero balance is committed as the working account; its name is recorded for every subsequent `env.account`.

**Fallback**: Faucet fails → instruct user to wait 60s and retry, or fund via `transfer` from another account they own. Account name collision → append `_v1`, `_v2` per wowok-safety §1.1.

**Checkpoint**: Persist `{ round: R1, account: <name>, balance: <n> }` via `local_info_operation`.

---

### R2: Industry Mode Selection

**AI Goal**: Match the user's business to a wowok-scenario driving mode so subsequent rounds receive pre-filled defaults.

**Key Questions**:
- What are you selling? (services, rentals, courses, travel packages, subscriptions, or something else)
- Do you collect deposits, charge per hour, or charge per milestone?
- Will you need to ship physical goods?

**Tool Calls**:
1. Internally classify the user's answers into `traits` (`has_logistics`, `communication_heavy`, `pure_digital`, `long_cycle`, `deposit_required`, `multi_tier_allocation`).
2. Match to a mode via [wowok-scenario](../wowok-scenario/SKILL.md) §Mode Selection Logic:
   - freelance (Phase 1) — pure digital, no deposit, milestone allocation
   - rental (Phase 1) — deposit required, return inspection
   - education (Phase 2) — long cycle, attendance Guard
   - travel (Phase 2) — multi-segment, multi-tier allocation
   - subscription (Phase 3) — periodic charge, cancel Guard
   - general — escape hatch, manual configuration
3. (Optional) `query_toolkit` → `read_mark` to recall any previously saved industry template the user has used.

**Success Criteria**: A mode is selected and its `IndustryModeSchema` loaded into context for rounds R3-R8.

**Fallback**: User wants a hybrid → load two modes and surface conflicts for user decision (per wowok-scenario §Mode Composition). User wants full manual → switch to `general` mode and skip default pre-fills.

**Checkpoint**: Persist `{ round: R2, mode: <name>, traits: {...} }`.

---

### R3: Service Definition

**AI Goal**: Create the unpublished Service draft with name, type_parameter, and metadata fields. Pull defaults from the selected mode.

**Key Questions**:
- What is the service name? (Mode default: e.g., "Logo Design Service" for freelance)
- What is the type_parameter (token type for payments, e.g., `"0x2::wow::WOW"`)?
- What is the deliverable description and pricing? (Mode template fills placeholders)

**Tool Calls**:
1. `onchain_operations` → `operation_type: "service"` with:
   - `data.name`, `data.type_parameter`, `data.description`
   - `data.permission` left empty for now (Permission comes in R4) OR pass a Permission object shape that auto-creates (wowok-safety §1.1 — SDK auto-creates a Permission if object shape passed)
   - `publish: false` (mandatory — Service stays draft)
   - `env.account` = R1 account
2. (Optional, physical goods) `wip_file` → `generate` to produce WIP file URL + hash for product metadata
3. `local_mark_operation` → tag the new Service with a friendly name (e.g., `freelance_logo_v1`)

**Success Criteria**: Service draft created on-chain, returns `service_id`, `bPublished: false`. Local mark persisted.

**Fallback**: Name conflict on local mark → use versioned name. Type parameter unknown → default to `"0x2::wow::WOW"` and confirm with user. Missing description → use mode template's default description with user edits.

**Checkpoint**: Persist `{ round: R3, service_id, service_name, type_parameter }`.

---

### R4: Permission Setup

**AI Goal**: Configure the merchant access control matrix — who can read, advance, allocate, arbitrate. Reuse existing Permission when possible (wowok-safety §1.1 strong recommendation).

**Key Questions**:
- Do you already have a Permission object to reuse? (recommended)
- If creating new: which roles do you need? Mode defaults apply (e.g., freelance: provider=1000, customer uses namedOperator:"", arbiter=1500; rental: owner=1000, renter uses namedOperator:"", arbiter=1500).

**Tool Calls**:
1. If reuse: `query_toolkit` → `onchain_objects` (filter type=Permission) to list candidates; confirm with user by name.
2. If create: `onchain_operations` → `operation_type: "permission"` with `data.name`, `data.type_parameter`, plus index assignments if needed.
3. `onchain_operations` → `operation_type: "service"` MODIFY the R3 Service draft to bind `data.permission = "<permission_name_or_id>"`.

**Success Criteria**: Permission exists (reused or created) and is bound to the Service. Permission indexes referenced by later Machine Forwards are recorded.

**Fallback**: User wants complex role split (beyond mode defaults) → flag as Advanced tier, switch to manual Permission design, hand off context to [wowok-safety](../wowok-safety/SKILL.md) for index rules. Custom index below 1000 → SDK rejects, instruct user to use 1000-65535 range.

**Checkpoint**: Persist `{ round: R4, permission_id, indexes_used: [...] }`.

---

### R5: Machine Configuration

**AI Goal**: Build the workflow state machine for the Service. Mode templates provide default node graph — user confirms or customizes.

**Key Questions**:
- Confirm the default nodes from your industry mode (e.g., freelance: ordered → in_progress → delivered → accepted → completed; rental: reserved → paid_deposit → in_use → returned → deposit_refunded → completed).
- Who advances each transition? (Mode default assigns permissionIndex)
- Any timeout/auto-advance rules? (e.g., customer auto-accept after 7 days)

**Tool Calls**:
1. `onchain_operations` → `operation_type: "machine"` CREATE with:
   - `data.nodes` from mode template (names + node keys)
   - `data.pairs` (prev_node, threshold)
   - `data.forwards` (name, weight, permissionIndex, namedOperator if needed)
   - Guards NOT bound yet (come in R7)
   - `publish: false`
2. (Optional) `machineNode2file` → export the Machine for user review before publish
3. `local_mark_operation` → tag Machine (e.g., `freelance_machine_v1`)

**Success Criteria**: Machine created on-chain, returns `machine_id`, `bPublished: false`. All Forwards reference valid permission indexes (validated against R4 Permission).

**Fallback**: Node count < 2 → enforce minimum 2 (entry + terminal). Forward missing permissionIndex AND namedOperator → SDK error, fill with mode default. User wants a non-mode workflow → switch to `general` mode, hand off to [wowok-machine](../wowok-machine/SKILL.md) for full design guidance.

**Checkpoint**: Persist `{ round: R5, machine_id, node_count, forward_count }`.

---

### R6: Progress Binding

**AI Goal**: Create the Progress template that will track each customer's order through the Machine. Bind it to the Machine.

**Key Questions**:
- Confirm the Progress should mirror every Machine node (typical) or only customer-visible milestones (alternative).
- Do you want customer-facing labels for each state? (e.g., "In Progress" vs. internal "Node 3")

**Tool Calls**:
1. `onchain_operations` → `operation_type: "progress"` CREATE with:
   - `data.machine = "<machine_name_or_id>"` (resolves via `GetObjectExisted()`)
   - `data.belong_to` = the Service (so Progress instances spawn per Order)
   - Optional metadata fields
2. `onchain_operations` → `operation_type: "machine"` MODIFY (if Machine needs Progress reference)
3. `onchain_operations` → `operation_type: "service"` MODIFY to bind `data.progress` if the Service schema requires it

**Success Criteria**: Progress template created and bound to Machine. Subsequent `order.create` will spawn a Progress instance per order.

**Fallback**: Binding fails because Machine is already published → unpublish is impossible (immutable); create a NEW Machine and rebind. Progress field missing → use mode default template.

**Checkpoint**: Persist `{ round: R6, progress_id }`.

---

### R7: Guard Configuration

**AI Goal**: Create the validation rules that gate order placement, advancement, and fund release. Use the circular reference pattern (wowok-tools §Object-Guard Circular Reference Pattern).

**Key Questions** (mode-specific defaults shown):
- Freelance: buy_guard (KYC + amount cap), deliver_guard (customer acceptance), withdraw_guard (acceptance triggers allocation), refund_guard (100% refund on dispute)
- Rental: deposit_guard (deposit frozen before pickup), return_guard (renter triggers return), inspect_guard (owner verifies condition), refund_guard (deposit release on inspection pass), damage_guard (deduct deposit)
- Which subset? Any custom conditions?

**Tool Calls** (per Guard, repeat):
1. `onchain_operations` → `operation_type: "guard"` CREATE — for Guards that reference the protected object, use the object's NAME in the table (SDK resolves at runtime)
2. `onchain_operations` → `operation_type: "gen_passport"` — static test each Guard with a mock submission to verify logic before binding
3. `onchain_operations` → `operation_type: "machine"` MODIFY to bind Guards to specific Forwards (for workflow Gates)
4. `onchain_operations` → `operation_type: "service"` MODIFY to bind Guards to `order_allocators` (for fund gates)
5. `guard2file` → export Guards for review

**Success Criteria**: All planned Guards created, `gen_passport` returned PASS for each with mock submissions, Guards bound to the correct Machine Forwards and Service Allocators.

**Fallback**: `gen_passport` fails → isolate the failing Guard via `guard2file` export, inspect logic, consult [wowok-guard](../wowok-guard/SKILL.md) §10 traps, fix and re-test. Type mismatch in `convert_witness` → re-create Guard with correct target type (Guard is immutable after creation).

**Checkpoint**: Persist `{ round: R7, guards: [{name, id, bound_to}], passport_tests: [...] }`.

---

### R8: Allocation Setup

**AI Goal**: Configure the fund distribution strategy. Bind Allocators to the Service's `order_allocators` and to Guards that trigger release.

**Key Questions** (mode defaults):
- Freelance: 100% to provider on acceptance, 100% refund on dispute, 0% platform
- Rental: rent → 100% owner at pickup, deposit → 100% renter on inspection pass, deposit → 100% owner on damage
- What are your split percentages? Confirm sharing sum = 10000 (basis points).
- Who is the recipient? (Entity for known addresses, GuardIdentifier for dynamic Order/customer)

**Tool Calls**:
1. `onchain_operations` → `operation_type: "allocation"` CREATE — one Allocation per terminal path, each with Guard-gated sharing array
2. `onchain_operations` → `operation_type: "service"` MODIFY to set `data.order_allocators = [{ allocators: [...] }]`
3. Verify each Allocator's Guard references R7 Guards and recipient types are correct (`Entity` for merchant, `GuardIdentifier` for customer/Order)
4. (Optional) `onchain_operations` → `operation_type: "reward"` CREATE if the mode includes incentive pools

**Success Criteria**: `order_allocators` configured on the Service. Sum of `sharing` per Allocator path = 10000. Each Allocator's trigger Guard exists and tested. Pre-publish Allocation audit returns PASS.

**Fallback**: Sharing sum ≠ 10000 → auto-correct to 10000 with user confirmation. Missing refund path → block and prompt (per wowok-safety — refund Allocator is required for dispute flow). Recipient uses `Signer` instead of `Entity` → fix per [wowok-provider](../wowok-provider/SKILL.md) §Recipient Types.

**Checkpoint**: Persist `{ round: R8, allocators: [{name, id, trigger_guard}], refund_path_covered: true }`.

---

### R9: Test Order (Dry Run)

**AI Goal**: Validate the full stack end-to-end before the irreversible publish step. Use a second account as the buyer.

**Key Questions**:
- Do you have a second account to play the customer, or should we create one?
- Confirm test parameters: test amount, test deliverable hash.

**Tool Calls**:
1. `account_operation` → `gen` (second account, the "buyer")
2. `account_operation` → `faucet` for the buyer
3. `onchain_operations` → `operation_type: "order"` CREATE — buyer places order on the Service draft
4. `onchain_operations` → `operation_type: "progress"` with `hold: true` then `hold: false` to advance through each Machine node
5. At each terminal node: `onchain_operations` → `operation_type: "allocation"` with `alloc_by_guard` to verify fund distribution
6. `onchain_operations` → `operation_type: "order"` to verify buyer can withdraw refund if applicable
7. `query_toolkit` → `onchain_events` to verify all expected events fired

**Success Criteria**: Test order traverses the full Machine, all Guards pass with mock submissions, Allocation distributes funds correctly to merchant and (if tested) refund path returns funds to buyer. Event log matches expected sequence.

**Fallback**: Guard blocks at a node → check `gen_passport` output, re-collect correct submission, retry. Allocation distributes wrong amount → halt, review Allocator sharing array. Order creation fails → check Service is in correct state and Permission allows buyer role.

**Checkpoint**: Persist `{ round: R9, test_order_id, test_passed: true, event_log_summary }`.

---

### R10: Publish + Post-Publish Verification

**AI Goal**: Execute the irreversible publish sequence with full pre-publish audit, then verify immutability locks are in place and hand off to operations.

**Key Questions**:
- Final confirmation: publish is irreversible. Machine nodes, Service `machine` and `order_allocators` will be locked forever. Proceed?
- Do you want to add a Compensation Fund before publish (recommended for trust)?

**Tool Calls**:
1. Pre-publish audit (mandatory, per wowok-safety):
   - `machineNode2file` → export Machine, verify topology
   - `guard2file` → export all Guards, verify logic
   - `query_toolkit` → `onchain_objects` → re-check Permission, Service, Machine, Progress, Guards, Allocation all exist and are correctly bound
2. `onchain_operations` → `operation_type: "machine"` with `publish: true` — Machine locked
3. `onchain_operations` → `operation_type: "service"` MODIFY to bind `data.machine = "<published_machine_id>"`
4. `onchain_operations` → `operation_type: "service"` with `publish: true` — Service locked
5. (Optional) `onchain_operations` → `operation_type: "service"` MODIFY to add `compensation_fund_add` and `setting_locked_time_add`
6. Post-publish verification:
   - `query_toolkit` → `onchain_objects` (Service) → confirm `bPublished: true`, `machine` field is locked, `order_allocators` is locked
   - `onchain_events` → confirm Publish event fired

**Success Criteria**: Both Machine and Service `bPublished: true`. Service `machine` and `order_allocators` fields are immutable. Publish event recorded on-chain. Handoff packet produced.

**Fallback**: Pre-publish audit fails → return to the failing round (R5/R6/R7/R8) and fix; do NOT publish. Publish transaction fails (gas) → re-faucet, retry. Post-publish immutability check fails (rare) → escalate to manual intervention, this should not happen at the protocol level.

**Checkpoint**: Persist `{ round: R10, published: true, machine_immutable: true, service_immutable: true, publish_digest }`. Mark onboarding COMPLETE.

**Handoff Packet** (emitted to user and to [wowok-provider](../wowok-provider/SKILL.md)):
- Service ID + name + publish digest
- Machine ID + node topology summary
- Permission ID + role/index map
- Progress template ID
- Guard IDs + bindings
- Allocator IDs + trigger map
- Test order digest + result
- Recommended next Skill: wowok-provider (operations), wowok-analytics (post-30-day audit), wowok-arbitrator (dispute setup)

---

## Decision Trees

### D1: Account Path

```
User enters onboarding
├── Has account with balance > 0? ── YES ──→ use it, advance to R2
├── Has account but balance = 0? ── YES ──→ faucet/transfer, advance to R2
└── No account ──→ account.gen ──→ faucet ──→ advance to R2
```

### D2: Industry Mode Match

```
User's business description
├── deposit_required? ── YES ──→ rental mode
├── multi_tier_allocation? ── YES ──→ travel mode
├── long_cycle + attendance? ── YES ──→ education mode
├── periodic_charge + cancel_anytime? ── YES ──→ subscription mode
├── pure_digital + milestone? ── YES ──→ freelance mode
└── none of the above ──→ general mode (escape hatch)
```

### D3: Reuse vs Create (per object)

```
For each of Permission / Machine / Guard / Contact / Arbitration:
├── User provides existing name/ID? ──→ REUSE (string reference)
├── User says "create new"? ──→ CREATE (object shape)
└── User unsure? ──→ query on-chain, present candidates, let user pick
```

### D4: Resume from Checkpoint

```
Onboarding session starts
├── local_info_operation returns R{N} checkpoint? ── YES
│   ├── Query on-chain: are R{N} objects still valid? ── YES ──→ resume at R{N+1}
│   └── On-chain state changed (e.g., Service published by another path)? ──→ restart at R1 with warning
└── No checkpoint ──→ start fresh at R1
```

### D5: Pre-Publish Audit Outcome

```
R10 pre-publish audit
├── All checks PASS ──→ publish Machine, then Service ──→ post-publish verify ──→ COMPLETE
├── Warnings only (e.g., no Compensation Fund) ──→ ask user, then publish or fix
└── Blockers (e.g., Machine not bound to Service) ──→ return to specific round, fix, re-audit
```

---

## Failure Playbooks

### F1: Faucet Exhausted / Gas Unavailable

**Symptom**: `account_operation.faucet` returns rate-limit or mainnet has no faucet.

**Recovery**:
1. Check if user has another funded account → `account_operation.transfer` to the working account (1 WOW = 10^9 base units is enough for dozens of txns).
2. If no other account → instruct user to acquire WOW from an exchange or another wallet, then resume.
3. Do NOT reduce example prices/stock on mainnet without user confirmation (per wowok-tools §Mainnet operations).

### F2: Guard `gen_passport` Test Fails

**Symptom**: Static Guard test returns FAIL on a specific Guard.

**Recovery**:
1. `guard2file` export the failing Guard.
2. Inspect: table entry type, `convert_witness` target type, `rely` chain completeness.
3. Cross-reference [wowok-guard](../wowok-guard/SKILL.md) §10 traps.
4. Guard is immutable after creation → CREATE a new Guard with corrected logic, re-test.
5. Update all references (Machine Forwards, Service Allocators) to the new Guard via MODIFY.

### F3: Test Order Stuck at a Node

**Symptom**: `progress.hold` succeeds but advancing to next node fails.

**Recovery**:
1. `query_toolkit` → `onchain_objects` (Progress) → inspect `current_node`, `forward_history`.
2. Identify which Forward is missing — likely a `namedOperator` not assigned, or a Guard blocking.
3. If Guard blocking → re-collect submission, re-call `progress.hold: false` with correct submission.
4. If namedOperator missing → `progress` MODIFY to assign the role address.
5. If terminal node reached but Allocation didn't fire → call `allocation.alloc_by_guard` manually with Order ID submission.

### F4: Publish Fails

**Symptom**: `service.publish: true` transaction reverts.

**Recovery**:
1. Check Machine is published FIRST (Service publish requires published Machine).
2. Check `service.machine` field is bound to the published Machine ID.
3. Check `order_allocators` is configured and each Allocator's Guard exists.
4. Re-run pre-publish audit, fix any blockers, retry.
5. NEVER use `--no-verify` or skip checks — publish is irreversible, must be correct.

### F5: User Abandons Mid-Onboarding

**Symptom**: User stops responding or explicitly says "I'll come back later".

**Recovery**:
1. Persist final checkpoint via `local_info_operation` with current round, all object IDs, and user decisions.
2. Confirm to user: "Your progress is saved at round R{N}. Resume anytime by saying 'continue onboarding'."
3. Do NOT clean up draft objects — they remain on-chain unpublished and can be resumed.
4. On resume, re-validate all checkpoint objects via `query_toolkit` before continuing (on-chain state is source of truth).

### F6: Mode Mismatch Detected Late

**Symptom**: User picks freelance mode in R2 but in R5 describes a deposit requirement (rental trait).

**Recovery**:
1. Acknowledge the mismatch: "Your description sounds more like rental mode. Switch?"
2. If user confirms → load rental mode defaults, re-evaluate R3-R5 parameters with new defaults (do NOT discard user's Service name/description unless they conflict).
3. If user wants hybrid → load both modes, surface conflicting fields, let user decide per field.
4. Update checkpoint with the corrected mode.

---

## Tier Layering

### Novice Tier (default)

- Full guided R1-R10 sequence
- Mode defaults auto-applied, user only confirms
- Pre-publish audit is mandatory and blocking
- Every round shows a plain-language explanation before the MCP call
- Checkpoint persistence is automatic

### Advanced Tier

- User can skip non-essential rounds via "skip R6 Progress, I'll bind later"
- Mode defaults shown but user can override any field
- Pre-publish audit runs but warnings are non-blocking (blockers still block)
- User can call MCP tools directly with the Skill providing context, not commands
- Trigger: user says "I know what I'm doing" or has completed prior onboardings

### Expert Tier

- User invokes MCP tools directly; Skill provides only the dependency graph and audit checklist
- Mode selection optional — user can build fully custom configuration
- Pre-publish audit optional but strongly recommended
- Skill acts as a reference card, not a guide
- Trigger: user explicitly asks for "expert mode" or invokes MCP operations by name

---

## Handoff Protocol

### When to Hand Off

| Trigger | Target Skill | Reason |
|---------|-------------|--------|
| R10 publish succeeds | [wowok-provider](../wowok-provider/SKILL.md) | Merchant enters operations phase |
| User asks about a specific industry scenario | [wowok-scenario](../wowok-scenario/SKILL.md) | Industry mode lookup |
| R7 Guard design gets complex | [wowok-guard](../wowok-guard/SKILL.md) | Advanced Guard patterns |
| R5 Machine design goes beyond mode template | [wowok-machine](../wowok-machine/SKILL.md) | Custom workflow design |
| User mentions a customer-side flow | [wowok-order](../wowok-order/SKILL.md) | Buyer perspective |
| Test order reveals dispute scenario | [wowok-arbitrator](../wowok-arbitrator/SKILL.md) | Dispute resolution setup |
| Publish completed + 30 days elapsed | wowok-analytics (Phase 2) | Usage and business audit |

### Handoff Packet Format

When handing off, emit this context bundle so the receiving Skill does not need to re-query:

```yaml
handoff:
  from: wowok-onboard
  to: <target_skill>
  state:
    journey: onboarding
    completed_rounds: R1-R10
    mode: freelance  # or rental / general / etc.
    account: <name>
  objects:
    service_id: 0x...
    machine_id: 0x...
    permission_id: 0x...
    progress_id: 0x...
    guard_ids: [0x..., 0x...]
    allocator_ids: [0x..., 0x...]
    test_order_id: 0x...
    publish_digest: <tx_digest>
  carry_context:
    - mode_defaults  # so receiving Skill knows what was pre-filled
    - user_decisions  # any deviations from mode defaults
  next_actions:
    - tool: query_toolkit
      action: onchain_objects
      reason: "Verify published Service state"
```

### Resumption Protocol

When `wowok-onboard` is invoked and a checkpoint exists:
1. Read checkpoint via `local_info_operation`.
2. For each object ID in the checkpoint, `query_toolkit` → `onchain_objects` to verify it still exists and is in the expected state.
3. If all valid → resume at the next round.
4. If any object is missing or state changed → surface the discrepancy, ask user whether to restart or attempt recovery.
5. **Invariant**: on-chain state is the source of truth. Checkpoint is a hint, not a guarantee.
