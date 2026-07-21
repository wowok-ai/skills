# Guard Scenario Ledger

> Compiled from the WoWok Guard system documentation. This is a standalone reference covering all 9 Guard binding scenarios, their host objects, binding fields, verification results, constraints, and the scenario matching function.

---

## 9 Guard Binding Scenarios — Overview

| # | Scenario | Host Object | Binding Field | Pass Result | Fail Result | Iterable |
|---|----------|-------------|---------------|-------------|-------------|----------|
| 1 | Service Purchase Verification | Service | `buy_guard` | Order created, enters payment | Transaction rejected | Yes |
| 2 | Allocation Strategy Selection | Service | `order_allocators` | Allocator executed for split | Skipped, next allocator tried | No (after publish) |
| 3 | Workflow Forward Verification | Machine | `Forward.guard` | Progress advances | Forward blocked | No (after publish) |
| 4 | Submission Data Verification | Progress | `submission` | Forward completed | Awaiting resubmission | No |
| 5 | Reward Claim Verification | Reward | `guard` | Reward disbursed | Claim rejected | Yes |
| 6 | Repository Write Verification | Repository | `write_guard` | Write success + optional data extraction | Write rejected | Yes |
| 7 | Dispute Initiation Verification | Arbitration | `usage_guard` | Arb case created | Dispute rejected | Yes |
| 8 | Arbitration Vote Verification | Arbitration | `voting_guard` | Vote counted (weight from GuardIdentifier) | Vote rejected | Yes |
| 9 | gen_passport Verification | Standalone | none | Standalone Guard, passport test | Test failure | Yes |

---

## Detailed Scenario Descriptions

### 1. Service Purchase Verification (Service.buy_guard)

- **Host Object**: Service
- **Binding Field**: `buy_guard`
- **Pass Result**: Order created, enters payment
- **Fail Result**: Transaction rejected (buy operation fails directly)
- **Iterable**: Yes (replaceable before Service is published; after publish, only by recreating Service)

**Typical Validation Rules**:
- Authorized address check (Signer == Provider)
- Whitelist check (Signer ∈ authorized address list)
- Service paused status check (service.paused == false)
- Service published status check (service.published == true)
- Membership verification (EntityRegistrar records query)

**Typical Patterns**: P03 (single-address identity), P04 (whitelist), P02 (published object + system context), P11 (entity registration check)

**Key Risks**: R-C4-01 (Signer check direction error), R-X1-08 (bound to immutable object)

---

### 2. Allocation Strategy Selection (Service.order_allocators)

- **Host Object**: Service
- **Binding Field**: `order_allocators`
- **Pass Result**: Allocator executed (funds distributed per sharing config)
- **Fail Result**: Skipped, next allocator tried
- **Iterable**: No (not replaceable after Service publish)

**Key Constraints**:
- **First-match-wins**: Multiple allocators are evaluated in order; the first passing Guard's allocator executes
- **sharing.who couples fund flow**: `sharing.who=Signer` → funds flow to caller (Guard must bind Signer); `sharing.who=Entity` → funds flow to fixed address (no Signer binding needed)

**Typical Validation Rules**:
- Order node status check (progress.current == "Complete" / "Cancelled" / etc.)
- Service ownership verification (order.service == service_address)
- Merchant win node check (order in {"Order Complete", "Wonderful", "Return Fail"})
- Customer win node check (order in {"Lost", "Return Complete"})

**Key Risks**: R-X1-05 (first-match-wins gaming), R-C3-05 (cross-project submission bypass), R-C3-06 (allocator fund theft)

---

### 3. Workflow Forward Verification (Machine.Forward.guard)

- **Host Object**: Machine
- **Binding Field**: `Forward.guard` (bound to a specific Forward: from_node → to_node)
- **Pass Result**: Progress advances to the next node
- **Fail Result**: Forward blocked, Progress stays at current node
- **Iterable**: No (not replaceable after Machine publish)

**Key Constraints**:
- A Forward is a node pair: from_node, to_node, permissionIndex, guard
- Guard is verified before Forward execution
- Old Guard becomes inactive after node switch
- Re-entry is ALLOWED (same forward on same node can be triggered repeatedly)

**Typical Validation Rules**:
- Submission data format (Merkle Root length == 66)
- Time lock (Clock > progress.current_time + duration)
- Provider authorization (Signer == Provider or Customer timeout override)
- Service ownership (order.service == service_address)
- Repository data query (specified data exists in weather_repo)

**Key Risks**: R-C2-03 (Progress data depends on Machine immutability), R-X1-08 (Machine immutable after publish), R-X1-06 (time lock direction), R-C3-05 (cross-project bypass)

---

### 4. Submission Data Verification (Progress.submission)

- **Host Object**: Progress
- **Binding Field**: `submission` (submission data Guard during Forward execution)
- **Pass Result**: Forward completed, submission data written to Progress history
- **Fail Result**: Awaiting resubmission, Forward does not advance
- **Iterable**: No (immutable once set)

**Typical Validation Rules**:
- Submission string length validation
- Submission numeric range validation
- Submission data format (signature, Merkle Root, JSON structure)
- Submission data consistency with Repository data

**Typical Patterns**: P15 (retained_submission), P17 (query parameter translation)

**Key Risks**: R-X1-12 (retained_submission ambiguous name), R-C3-01 (submission not bound to Signer)

---

### 5. Reward Claim Verification (Reward.guard)

- **Host Object**: Reward
- **Binding Field**: `guard`
- **Pass Result**: Reward disbursed (funds transferred to caller)
- **Fail Result**: Claim rejected (Guard not passed)
- **Iterable**: Yes (replaceable)

**Typical Validation Rules**:
- Node status check (progress.current == "Wonderful" / "Lost" / "Shipping")
- Order owner verification (order.owner == Signer)
- Service ownership (order.service == service_address)
- One-time claim check (query_reward_record_count == 0 or query_reward_record_exists == false)
- Reward expiration check (reward.guard.expiration_time >= Clock)

**Key Risks**: R-X1-14 (reentrancy — CRITICAL; REQUIRED: use query 1613 + logic_not, or 1612 + logic_equal(0), or 1626 + logic_not), R-C3-01 (order_id not bound to Signer)

---

### 6. Repository Write Verification (Repository.write_guard)

- **Host Object**: Repository
- **Binding Field**: `write_guard`
- **Pass Result**: Write success + optional data extraction
- **Fail Result**: Write rejected
- **Iterable**: Yes (replaceable)

**Special Constraints**:
- **id_from_submission must be Address**: The write key (id) from submission must be Address type
- **data_from_submission type matching**: The written data type must match Repository's value_type
- **quote_guard fails in verify phase**: impack_list is always empty during verify phase (passport.move#L289), causing Repository queries with quote_guard (query 1167) to fail with `IMPACK_GUARD_NOT_FOUND` in gen_passport flow

**Typical Validation Rules**:
- Writer permission verification (Signer == authorized_address)
- Write data format validation
- Repository policy validation
- Write idempotency (optional anti-reentrancy: query 1166 + logic_not)

**Key Risks**: R-C1-03 (Repository data manipulable), R-C3-04 (id_from_submission type not verified), R-X1-10 (quote_guard fails in verify phase)

---

### 7. Dispute Initiation Verification (Arbitration.usage_guard)

- **Host Object**: Arbitration
- **Binding Field**: `usage_guard`
- **Pass Result**: Arb case created
- **Fail Result**: Dispute rejected
- **Iterable**: Yes (replaceable)

**Key Constraints**:
- **Arbitration bPaused=true blocks first**: Dispute initiation is rejected before Guard check when Arbitration is paused
- **Protocol limit**: `MAX_DISPUTE_COUNT = 10` (order.move)
- **Threshold balance**: Too high prevents disputes, too low enables malicious filings

**Typical Validation Rules**:
- Dispute initiator permission verification
- Dispute reason format validation
- Dispute count limit (query 1565 + logic_not or 1564 + logic_equal(0))
- Time window verification

**Key Risks**: R-X1-07 (too many AND conditions), R-X1-14 (reentrancy — HIGH; REQUIRED: use query 1565 + logic_not or 1564 + logic_equal(0))

---

### 8. Arbitration Vote Verification (Arbitration.voting_guard)

- **Host Object**: Arbitration
- **Binding Field**: `voting_guard`
- **Pass Result**: Vote counted (GuardIdentifier extracts weight)
- **Fail Result**: Vote rejected
- **Iterable**: Yes (replaceable)

**Key Constraints**:
- **GuardIdentifier must be numeric**: voting_guard's GuardIdentifier must be numeric (U8/U256), otherwise `E_GUARD_IDENTIFIER_NOT_NUMBER`. Used to extract weight value from voting_guard output.
- **bPaused=true blocks first**: Same as usage_guard — blocks before Guard check
- **Voter address typically from submission**: Type3 submission, must be paired with Signer verification to prevent forgery

**Typical Validation Rules**:
- Voter identity verification (Signer == submitted.voter_address)
- Vote weight equals reputation score (query EntityRegistrar records + numeric comparison)
- Voter has not already voted (query 1404 + logic_not or 1405 + logic_equal(0))
- Vote time window verification

**Key Risks**: R-C3-02 (voting weight from submission — forgeable; must use numeric identifier), R-X1-14 (reentrancy — CRITICAL; REQUIRED: use query 1404 + logic_not, 1406 + logic_not, or 1405 + logic_equal(0); NOTE: 1403 is total count, NOT per-voter)

---

### 9. gen_passport Verification (Standalone)

- **Host Object**: Standalone (no binding)
- **Binding Field**: none
- **Pass Result**: Standalone Guard, used for passport testing
- **Fail Result**: Test failure (does not block business flow)
- **Iterable**: Yes (not bound to any object, can create new tests anytime)

**Use Cases**:
- Test Guard logic via `wowok({ tool: "onchain_operations", data: { operation_type: "gen_passport", ... } })` without binding to any Host Object
- Verify Guard behavior under mock submission
- Verify expected-pass and expected-fail boundary scenarios
- Protected by `guard_gen_passport_test` confirmation rule (standard level)

**No business risks** (testing-only purpose).

---

## Scenario Special Constraints

### voting_guard GuardIdentifier Must Be Numeric

Arbitration voting_guard's GuardIdentifier must be numeric (U8/U16/U32/U64/U128/U256), otherwise `E_GUARD_IDENTIFIER_NOT_NUMBER`. The root output is a weighted numeric value used as vote weight, not a Bool. A Bool or non-numeric output cannot compute weight.

**Impact**: BINDING_01 constraint (creation-time validation), voting_guard root cannot return a Bool constant (e.g., P14 variant always-true Guard is inapplicable), must have a query returning a numeric value.

### Repository write_guard Type Matching

- **id_from_submission must be Address**: The write key from submission must be Address type
- **data_from_submission type match**: The written data type must match Repository's value_type

**Impact**: BINDING_02 (Repository id_from_submission must be Address), BINDING_03 (Repository data_from_submission type match), R-C3-04 risk rule

### Arbitration bPaused=true Blocks First

When Arbitration's `bPaused=true`:
- Blocks before Guard check: directly rejects usage_guard and voting_guard verification
- Used for emergency pause of the entire Arbitration flow (vulnerability, attack, or governance decision)

**Impact**: Guard passing does not guarantee execution — Arbitration must also not be paused.

### order_allocators Sequential First-Match-Wins

Service's `order_allocators` is an ordered array evaluated at runtime:
- First Guard-passing allocator executes
- Subsequent Guards do not execute (even if conditions are met)
- If no Guard passes, no allocation occurs

**Impact**: R-X1-05 (first-match-wins gaming), Guard order must be carefully designed (merchant win Guard typically before customer win Guard), multiple Guard root conditions should be mutually exclusive.

---

## Scenario Auto-Matching (inferSceneFromAction)

### Function Signature

```typescript
inferSceneFromAction(action: string): GuardScene | undefined
```

### Action → Scene Mapping

| Action | Matched Scene ID | Scenario Name |
|--------|------------------|---------------|
| `buy` | `service_buy_guard` | Service Purchase Verification |
| `allocate` | `service_order_allocators_guard` | Allocation Strategy Selection |
| `forward` | `machine_forward_guard` | Workflow Forward Verification |
| `submit_progress` | `progress_submission_guard` | Submission Data Verification |
| `claim_reward` | `reward_guard` | Reward Claim Verification |
| `write_repository` | `repository_write_guard` | Repository Write Verification |
| `dispute` | `arbitration_usage_guard` | Dispute Initiation Verification |
| `vote` | `arbitration_voting_guard` | Arbitration Vote Verification |
| `gen_passport` | `gen_passport_guard` | gen_passport Verification |
| `custom` | undefined | Custom (no match) |

### Usage Context

`inferSceneFromAction` is called during the R5 binding planning round. It automatically infers the Host Object, binding field, and scenario-specific constraints from the user-described action. The result populates `GuardAdvice.matched_scene` and `GuardAdvice.scene_constraints`, guiding the AI to satisfy scenario constraints during subsequent design.

### Example

```typescript
// User says: "I want to design a reward Guard so customers can claim rewards after reaching the Wonderful node"
inferSceneFromAction("claim_reward")
// → Returns reward_guard scene with special_constraints:
//   - Reentrancy: CRITICAL — use query 1613 + logic_not to prevent duplicate claims
//   - One-time claim: query_reward_record_count == 0
//   - Reward expiration: reward.guard.expiration_time >= Clock
```

---

## Scenario Iterability Analysis

### Immutable Scenes (getImmutableScenes)

Scenes where Guard cannot be replaced after the Host Object is published:

| Scene ID | Scenario Name | Reason |
|----------|---------------|--------|
| `machine_forward_guard` | Workflow Forward Verification | Machine Forward.guard not replaceable after publish |
| `service_order_allocators_guard` | Allocation Strategy Selection | Service order_allocators not replaceable after publish |

**Impact**: Guard design must be 100% accurate (cannot be fixed after creation). Confirmation flow must be strict (`guard_create_immutable`, irreversible level).

### Numeric Identifier Scenes (getNumericIdentifierScenes)

Scenes requiring numeric GuardIdentifier:

| Scene ID | Scenario Name | Numeric Reason |
|----------|---------------|----------------|
| `arbitration_voting_guard` | Arbitration Vote Verification | GuardIdentifier extracts weight value, must be numeric |

**Impact**: BINDING_01 constraint (Move Arbitration layer validation), voting_guard root cannot directly return Bool (P14 variant always-true Guard inapplicable)

### Iterable Scene Replacement Flow

For iterable scenes (buy_guard, Reward.guard, Repository.write_guard, Arbitration usage_guard/voting_guard, gen_passport):

1. **Export old Guard**: `guard2file` exports JSON backup
2. **Edit JSON**: Modify based on old JSON (preserve identifier order, update table/root)
3. **Create new Guard**: `wowok({ tool: "onchain_operations", data: { operation_type: "guard", ... } })` CREATE
4. **Rebind**: MODIFY Host Object's binding_field to point to new Guard
5. **gen_passport test**: Run `gen_passport` on the new Guard
6. **Post-verification**: Verify new Guard is active

---

## Example Scenario Cases

### Pattern Coverage Across Examples

| Pattern | Count | Description |
|---------|-------|-------------|
| P04 (Whitelist — single address) | 1 | Signer == authorized address |
| P05 (Time lock) | 4 | Clock-based time checks |
| P06 (Node status check) | 8 | progress.current == specified node |
| P07 (One-time claim) | 3 | Anti-reentrancy claims |
| P08 (Submission identity) | 3 | Signer == order.owner |
| P09 (Witness derivation) | 12 | convert_witness=100 (Order→Progress) |
| P10 (Multi-condition combo) | 6 | Combined node + Signer + service checks |
| P13 (Repository data query) | 1 | Repository existence check |
| P14 variant (Always-true / pure dependency) | 1 | Permission controlled by Forward permissionIndex |
| P15 (Retained submission) | 1 | Submission data validation |

### Data Source Usage

| Source | Usage Count | Typical Scenarios |
|--------|-------------|-------------------|
| Type 1 (Constant objects/values) | 20 | Node names, durations, service addresses, author addresses |
| Type 2 (Witness derivation) | 14 | convert_witness=100 (Order→Progress) |
| Type 3 (Submission objects/values) | 18 | order_id, Merkle Root, timestamps |
| Type 4 (System context) | 8 | Clock (time lock), Signer (identity verification) |