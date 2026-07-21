# Machine Scenario Ledger

> **Purpose**: Complete, deterministic catalog of all canonical Machine workflows on WoWok protocol.

---

## Scene Definition Interface

```typescript
export interface MachineScene {
    id: string;
    name: string;
    industry: string[];
    scenario: string;
    participants: ParticipantRoleDef[];
    recommended_patterns: string[];
    recommended_topology: string[];
    guard_requirements: GuardRequirement[];
    allocation_integration: string;
    special_constraints: string[];
    mutable_after_publish: boolean;
    m_rounds_focus: string[];
}
```

Each scene defines: (1) business scenario, (2) participants & permission model, (3) recommended execution pattern (Sequential/AND/OR/Vote/Hybrid), (4) recommended branch topology (Linear/ForkMerge/Competing), (5) Guard integration requirements, (6) fund allocation integration, (7) special constraints.

---

## Scene Catalog (10 Scenes)

### 1. Standard E-Commerce
- **ID**: `ecommerce_standard`
- **Industry**: ecommerce
- **Flow**: Order → Payment → Ship → Receive → Complete
- **Pattern**: P-M-SEQ | **Topology**: P-M-LINEAR
- **Participants**: customer (OrderHolder), merchant (Permission)
- **Guards**: `machine_forward_guard` on Ship (verify payment), Receive (verify identity)
- **Allocation**: Complete node → Allocator disburses to merchant
- **Constraints**: Payment must complete before shipping; auto-trigger allocation on receipt
- **Mutable after publish**: false
- **Rounds**: M1, M2, M3, M5, M8

### 2. E-Commerce with Exception Branches
- **ID**: `ecommerce_with_exceptions`
- **Industry**: ecommerce
- **Flow**: Order→Payment→Ship→{Receive→Complete | Lost→Arbitration | Return→Refund}
- **Pattern**: P-M-SEQ, P-M-COMPETING | **Topology**: P-M-LINEAR, P-M-COMPETING
- **Participants**: customer (OrderHolder), merchant (Permission), arbitrator (NamedOperator)
- **Guards**: `machine_forward_guard` (dual-sign lost), `arbitration_usage_guard` (verify arbitration eligibility)
- **Allocation**: Complete→merchant | Refund→refund allocation | Arb→arbitration allocation
- **Constraints**: Lost node threshold=2 (customer+merchant dual-sign); competing Pair: Receive vs Lost (first-wins); arbitration independent of main flow
- **Mutable after publish**: false
- **Rounds**: M1, M2, M3, M5, M6, M8

### 3. Rental Standard
- **ID**: `rental_standard`
- **Industry**: rental
- **Flow**: Book → Pay Deposit → Pick Up → In Use → Return → Refund Deposit
- **Pattern**: P-M-SEQ | **Topology**: P-M-LINEAR
- **Participants**: customer (OrderHolder), merchant (Permission)
- **Guards**: `machine_forward_guard` on Pick Up (verify deposit), Return (verify equipment status)
- **Allocation**: Return complete → deposit refund + rental allocation
- **Constraints**: Deposit and rental separated (two Allocators); equipment damage requires Guard verification via `retained_submission`
- **Mutable after publish**: false
- **Rounds**: M1, M2, M3, M5, M8

### 4. Dual-Signature Consensus
- **ID**: `dual_signature`
- **Industry**: ecommerce, service, logistics
- **Flow**: Critical node requires both customer + merchant confirmation
- **Pattern**: P-M-AND | **Topology**: P-M-LINEAR
- **Participants**: customer (OrderHolder), merchant (Permission)
- **Guards**: `machine_forward_guard` on dual confirmation (verify identity)
- **Allocation**: After dual confirmation → fund allocation
- **Constraints**: threshold=2, two Forwards weight=1 each; customer Forward: namedOperator='' (OrderHolder); merchant Forward: permissionIndex=2
- **Mutable after publish**: false
- **Rounds**: M3, M4, M5

### 5. Weighted Voting
- **ID**: `weighted_voting`
- **Industry**: governance, arbitration
- **Flow**: Multi-party weighted voting, cumulative threshold to advance
- **Pattern**: P-M-VOTE | **Topology**: P-M-LINEAR
- **Participants**: chief (Permission), member (NamedOperator)
- **Guards**: `arbitration_voting_guard` (verify voting eligibility + extract weight)
- **Allocation**: After voting → result execution
- **Constraints**: threshold=100, chief weight=60, member weight=40; GuardIdentifier must be numeric (weight extraction); prevent double-voting (Guard queries arb.voted has)
- **Mutable after publish**: false
- **Rounds**: M3, M4, M5

### 6. Cross-Machine Supply Chain
- **ID**: `cross_machine_supply_chain`
- **Industry**: manufacturing, logistics, retail
- **Flow**: Supplier → Manufacturer → Retailer, each step an independent Machine
- **Pattern**: P-M-CROSS-MACHINE | **Topology**: P-M-LINEAR
- **Participants**: supplier (Permission, Machine A), manufacturer (Permission, Machine B), retailer (Permission, Machine C)
- **Guards**: `machine_forward_guard` on Start Manufacturing (verify supplier Progress complete), Start Retail (verify manufacturer Progress complete)
- **Allocation**: Each Machine allocates independently
- **Constraints**: Machine B Guard uses `convert_witness=100` to query Machine A's Progress; cross-Machine dependency is one-way (no cycles); each Machine must be published independently
- **Mutable after publish**: false
- **Rounds**: M1, M3, M8

### 7. Privacy Delivery
- **ID**: `privacy_delivery`
- **Industry**: ecommerce, logistics
- **Flow**: Deliver private info (address/credentials) via Messenger; only Proof stored on-chain
- **Pattern**: P-M-SEQ | **Topology**: P-M-LINEAR
- **Participants**: customer (OrderHolder, Submit Proof), merchant (Permission, Verify Proof)
- **Guards**: `machine_forward_guard` on Submit Proof (verify Proof signature + timestamp)
- **Allocation**: After Proof verification → continue flow
- **Constraints**: Uses `tpl_forward_privacy_delivery_proof` template; `retained_submission` retains Proof address for arbitration queries; Proof must be generated by `messenger.submitChainProof`
- **Mutable after publish**: false
- **Rounds**: M1, M3, M7

### 8. Reward Incentive
- **ID**: `reward_incentive`
- **Industry**: ecommerce, subscription, education
- **Flow**: Trigger Reward claim upon completing specific nodes
- **Pattern**: P-M-SEQ | **Topology**: P-M-LINEAR
- **Participants**: customer (OrderHolder, Claim reward), platform (Permission, Issue reward)
- **Guards**: `reward_guard` (verify claim eligibility + prevent duplicates)
- **Allocation**: Reward independent of Allocation
- **Constraints**: Reward Guard must prevent duplicates (R-X1-14 CRITICAL); uses `query_reward_record_count == 0` for reentrancy prevention; Reward object must have been created
- **Mutable after publish**: false
- **Rounds**: M1, M3, M8

### 9. Arbitration Flow
- **ID**: `arbitration_flow`
- **Industry**: ecommerce, service, rental
- **Flow**: Dispute → Submit Arbitration → Vote → Ruling → Execute
- **Pattern**: P-M-VOTE, P-M-SEQ | **Topology**: P-M-LINEAR
- **Participants**: disputant (OrderHolder), arbitrator (NamedOperator), system (Permission)
- **Guards**: `arbitration_usage_guard` (verify dispute eligibility + prevent duplicates), `arbitration_voting_guard` (verify voting eligibility + extract weight)
- **Allocation**: After ruling → disburse funds per ruling
- **Constraints**: Arbitration object must exist; prevent duplicate disputes (R-X1-14 HIGH); prevent duplicate votes (R-X1-14 CRITICAL); MAX_DISPUTE_COUNT=10 per order
- **Mutable after publish**: false
- **Rounds**: M1, M3, M4, M5, M8

### 10. Subscription / Membership
- **ID**: `subscription`
- **Industry**: subscription, service
- **Flow**: Subscribe → Pay → Activate → Periodic Renewal → Expire/Cancel
- **Pattern**: P-M-SEQ, P-M-COMPETING | **Topology**: P-M-LINEAR, P-M-COMPETING
- **Participants**: subscriber (OrderHolder), provider (Permission)
- **Guards**: `machine_forward_guard` on Renewal (time-lock verification), Cancel (verify subscription status)
- **Allocation**: Renewal → fund allocation | Expire → stop service
- **Constraints**: Time-lock: `context(Clock) >= progress.entry_time + duration`; competing Pair: Renewal vs Expire (first-wins); requires Repository to record subscription status
- **Mutable after publish**: false
- **Rounds**: M1, M3, M6, M8

---

## Scene Identification Patterns

```typescript
export function inferSceneFromFlow(description: string): MachineScene | undefined {
    const lower = description.toLowerCase();

    if (lower.includes("supply chain") || lower.includes("cross machine"))   return findScene("cross_machine_supply_chain");
    if (lower.includes("arbitration") || lower.includes("dispute"))          return findScene("arbitration_flow");
    if (lower.includes("reward") || lower.includes("incentive"))             return findScene("reward_incentive");
    if (lower.includes("privacy") || lower.includes("messenger"))            return findScene("privacy_delivery");
    if (lower.includes("voting") || lower.includes("weighted"))              return findScene("weighted_voting");
    if (lower.includes("dual sign") || lower.includes("dual confirmation"))  return findScene("dual_signature");
    if (lower.includes("subscription") || lower.includes("membership"))      return findScene("subscription");
    if (lower.includes("rental"))                                            return findScene("rental_standard");
    if (lower.includes("lost") || lower.includes("return") || lower.includes("refund")) return findScene("ecommerce_with_exceptions");
    if (lower.includes("ecommerce") || lower.includes("order"))              return findScene("ecommerce_standard");

    return undefined;
}
```

---

## Scene-to-Guard Mapping

| Machine Scene | Guard Scene(s) | Relationship |
|---|---|---|
| ecommerce_standard | `machine_forward_guard` | Forward binds Guard |
| ecommerce_with_exceptions | `machine_forward_guard` + `arbitration_usage_guard` | Exception branches bind arbitration Guard |
| rental_standard | `machine_forward_guard` | Standard Forward Guard |
| dual_signature | `machine_forward_guard` | Dual-sign Forwards each bind Guard |
| weighted_voting | `arbitration_voting_guard` | Voting uses voting_guard |
| cross_machine_supply_chain | `machine_forward_guard` | Cross-Machine query via Forward Guard |
| privacy_delivery | `machine_forward_guard` | Uses `tpl_forward_privacy_delivery_proof` template |
| reward_incentive | `reward_guard` | Reward claim uses reward_guard |
| arbitration_flow | `arbitration_usage_guard` + `arbitration_voting_guard` | Full arbitration lifecycle |
| subscription | `machine_forward_guard` + `repository_write_guard` | Subscription status written to Repository |

---

## Key Constraints Summary

| Scene | Key Special Constraints |
|---|---|
| ecommerce_standard | Payment must complete before shipping |
| ecommerce_with_exceptions | Lost node dual-sign; competing Pair first-wins |
| rental_standard | Deposit and rental separated; equipment damage `retained_submission` |
| dual_signature | threshold=2; customer+merchant different permissions |
| weighted_voting | threshold=100; prevent double-vote (R-X1-14 CRITICAL) |
| cross_machine_supply_chain | One-way cross-Machine dependency; `convert_witness=100` |
| privacy_delivery | Uses `tpl_forward_privacy_delivery_proof`; `retained_submission` retains Proof |
| reward_incentive | Prevent duplicate claim (R-X1-14 CRITICAL); `query_reward_record_count==0` |
| arbitration_flow | Prevent duplicate dispute (R-X1-14 HIGH); MAX_DISPUTE_COUNT=10 |
| subscription | Time-lock; competing Pair (Renewal vs Expire); Repository records status |

---

## Execution Patterns & Topologies Reference

### Patterns
- **P-M-SEQ**: Sequential execution — nodes advance one by one in order
- **P-M-AND**: AND-join — multiple Forwards must all fire before the node advances
- **P-M-VOTE**: Weighted voting — Forwards carry weights; node advances when cumulative weight reaches threshold
- **P-M-COMPETING**: Competing branches — first Forward to fire wins, others are invalidated
- **P-M-CROSS-MACHINE**: Cross-Machine — one Machine's Progress gates another Machine's Forward

### Topologies
- **P-M-LINEAR**: Linear chain — nodes arranged in a straight sequence
- **P-M-FORKMERGE**: Fork-Merge — branches split and later rejoin
- **P-M-COMPETING**: Competing — mutually exclusive branches, first-wins semantics

---

*All 10 scenes are immutable after publish (`mutable_after_publish: false`).*