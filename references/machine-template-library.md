# Machine Template Library

> Reference covering the WoWok Machine semantic layer template library design specification.

---

## Core Thesis

The Machine Template Library is a parameterized template catalog for the Machine semantic layer (`machine-templates.ts`). Its goals:

1. **Lower design barrier**: Provide parameterized skeletons for common scenarios — AI only replaces variables instead of designing from scratch
2. **Guarantee correctness**: Templates embed Pattern matching, constraint rules, and risk pre-assessment
3. **Support Fork-Modify**: Templates serve as fork starting points; users adapt them into custom workflows (participation mode P-M5)
4. **Cross-reference, not duplicate**: Templates cross-reference the Ledger scene catalog, Translation patterns, and Risk rules rather than redefining them

### Design Principles (aligned with Guard Template Library)

- **Pure Data, No I/O**: Templates are pure data, no file I/O or MCP calls
- **Parameterized**: Use `${param}` placeholders with constrained types
- **Aligned with Ledger**: Each template binds a `scene_id` matching `machine-ledger.ts`
- **Aligned with Pattern**: Each template declares `recommended_patterns` matching `machine-translation.ts`
- **Cross-referenced with Risk**: Each template declares `relevant_risks` matching `machine-risk.ts`
- **Fork-Friendly**: Templates annotate `forkable_fields` — which fields users may safely modify

---

## Template Interface

### Parameter Types

```typescript
export type MachineTemplateParamType =
    | "address"
    | "string"
    | "number"
    | "boolean"
    | "vec_address"
    | "vec_string"
    | "node_name_list"      // Uniqueness + naming rule validation
    | "permission_ref"      // Permission object address or name
    | "guard_ref"           // Guard object address or name
    | "machine_ref"         // Machine object address or name (cross-machine)
    | "service_ref"         // Service object address or name
    | "arbitration_ref"     // Arbitration object address or name
    | "reward_ref";         // Reward object address or name
```

### Parameter Definition

```typescript
export interface MachineTemplateParam {
    name: string;              // Variable placeholder, e.g. "merchant_permission"
    type: MachineTemplateParamType;
    description: string;       // Semantic description (business meaning)
    required: boolean;
    default?: string;          // Optional default value
    constraint?: string;       // Constraint rule description
    validation?: string;       // Validation regex or rule (optional)
}
```

### Template Definition

```typescript
export interface MachineTemplate {
    id: string;
    scene_id: string;                          // Maps to machine-ledger.ts MACHINE_SCENES
    name: string;
    description: string;
    recommended_patterns: string[];            // Maps to machine-translation.ts
    recommended_topology: string[];
    parameters: MachineTemplateParam[];
    example_nodes: object;                     // Uses ${param} placeholders
    example_pairs: object;
    example_forwards: object;
    required_guards: Array<{                   // Cross-ref to guard-templates.ts
        guard_template_id: string;
        bound_to_forward: string;
        purpose: string;
    }>;
    required_permissions: Array<{
        index: number;
        name: string;
        description: string;
    }>;
    required_allocators: Array<{
        name: string;
        trigger_node: string;
        description: string;
    }>;
    forkable_fields: string[];                 // Fields safe to modify when forking
    applicable_industries: string[];
    relevant_risks: string[];                  // Cross-ref to machine-risk.ts
    creation_notes: string[];
    example_use_case: string;
    publish_checklist: string[];               // Must be verified before publish
}
```

---

## Template Catalog (10 Scenarios)

### 1. `tpl_machine_ecommerce_standard` — Standard E-commerce Flow

| Field | Value |
|---|---|
| **scene_id** | `ecommerce_standard` |
| **Patterns** | `P-M-SEQ` |
| **Topology** | `P-M-LINEAR` |
| **Description** | Linear e-commerce: Order → Pay → Ship → Receive → Complete. Funds auto-allocated to merchant at Complete. Recommended baseline for new merchants. |
| **Key params** | `merchant_permission`, `ship_forward_name`, `receive_forward_name`, `pay_guard_name`, `complete_node_name` |
| **Nodes** | OrderCreated → Paid → Shipped → Received → `${complete_node_name}` |
| **Key Guards** | `tpl_buy_guard_whitelist` on Pay forward (verify payment) |
| **Permissions** | index 2: merchant (Ship + Finish), index 3: admin (optional) |
| **Allocators** | MerchantAllocation triggered at `${complete_node_name}` (100% to merchant) |
| **Industries** | ecommerce, retail |
| **Risks** | R-M1-01, R-M1-02, R-M1-08, R-M2-01, R-M3-02, R-M4-01 |

### 2. `tpl_machine_ecommerce_exceptions` — E-commerce with Exception Branches

| Field | Value |
|---|---|
| **scene_id** | `ecommerce_with_exceptions` |
| **Patterns** | `P-M-SEQ`, `P-M-COMPETING` |
| **Topology** | `P-M-LINEAR`, `P-M-COMPETING` |
| **Description** | Multi-path: Pay → Ship → Receive/Lost/Return. Lost uses dual-sig (threshold=2). Return path opens Refund → Complete. Competing pairs first-wins. |
| **Key params** | `merchant_permission`, `lost_threshold` (default 2), `arbitration_ref`, `time_guard_days` (default 10), `return_node_name` |
| **Nodes** | OrderCreated → Paid → Shipped → {Received, Lost, Return} → {Complete, Refund → Complete} |
| **Key Guards** | `tpl_forward_node_check` (Pay), `tpl_forward_dual_signature` (MerchantConfirm), `tpl_forward_time_guard` (TimeGuard) |
| **Permissions** | index 2: merchant, index 3: admin / time-guard trigger |
| **Allocators** | CompleteAllocation (normal), RefundAllocation (refund to customer), LostAllocation (optional) |
| **Industries** | ecommerce, logistics |

### 3. `tpl_machine_rental` — Equipment Rental Flow

| Field | Value |
|---|---|
| **scene_id** | `rental_standard` |
| **Patterns** | `P-M-SEQ` |
| **Topology** | `P-M-LINEAR` |
| **Description** | Reserve → Pay Deposit → Pickup → In Use → Return → Refund Deposit. Separates deposit from rental fee (two Allocators). Damage report via `retained_submission`. |
| **Key params** | `merchant_permission`, `deposit_amount`, `damage_inspection_node` (default DamageCheck), `return_node_name` |
| **Nodes** | Reserved → DepositPaid → PickedUp → InUse → Return → {DamageCheck → DepositRefund, Complete} → Complete |
| **Key Guards** | `tpl_allocator_threshold` (PayDeposit), `tpl_forward_privacy_delivery_proof` (Inspect) |
| **Permissions** | index 2: merchant (rental provider) |
| **Allocators** | RentalFeeAllocation (Complete), DepositRefundAllocation (DepositRefund, to customer), DamageDeductionAllocation (DamageCheck, to merchant) |
| **Industries** | rental, equipment, vehicle |

### 4. `tpl_machine_dual_signature` — Dual-Signature Consensus Flow

| Field | Value |
|---|---|
| **scene_id** | `dual_signature` |
| **Patterns** | `P-M-AND` |
| **Topology** | `P-M-LINEAR` |
| **Description** | Critical node requires customer + merchant confirmation. threshold=2 with two Forwards (weight=1 each). Customer = OrderHolder, merchant = permissionIndex=2. |
| **Key params** | `merchant_permission`, `critical_node_name` (default Approve), `next_node_after_approval` (default Execute) |
| **Nodes** | Initiated → `${critical_node_name}` → `${next_node_after_approval}` → Complete |
| **Key Guards** | `tpl_forward_node_check` (CustomerApprove + MerchantApprove) |
| **Permissions** | index 2: merchant |
| **Industries** | ecommerce, service, logistics, escrow |
| **Note** | threshold=2 means BOTH Forwards must execute (AND semantics) |

### 5. `tpl_machine_weighted_voting` — Weighted Voting Flow

| Field | Value |
|---|---|
| **scene_id** | `weighted_voting` |
| **Patterns** | `P-M-VOTE` |
| **Topology** | `P-M-LINEAR` |
| **Description** | Multi-party voting with unequal weights. threshold=100, chief weight=60, members weight=40 total. Each member's weight extracted via Guard query from Arbitration object. |
| **Key params** | `arbitration_ref`, `threshold_total` (default 100), `chief_weight` (default 60), `member_count` (default 5) |
| **Nodes** | VoteOpened → Voting → {Approved, Rejected} |
| **Key Guards** | `tpl_arb_voting_guard` (ChiefVote + MemberVote — prevents double-vote) |
| **Permissions** | index 2: chief, index 3: admin |
| **Industries** | governance, arbitration, dao |
| **Critical Risk** | R-X1-14: double-vote prevention — Guard MUST check `arb.voted has [Signer]` |

### 6. `tpl_machine_cross_machine` — Cross-Machine Supply Chain

| Field | Value |
|---|---|
| **scene_id** | `cross_machine_supply_chain` |
| **Patterns** | `P-M-CROSS-MACHINE` |
| **Topology** | `P-M-LINEAR` |
| **Description** | Decomposed supply chain across multiple Machines. Machine B's Forward Guard queries Machine A's Progress via `convert_witness=100` to verify upstream completion. |
| **Key params** | `machine_a_id` (must be published first), `machine_a_complete_node`, `machine_b_permission` |
| **Nodes** | UpstreamVerified → Production → Complete |
| **Key Guards** | `tpl_forward_cross_machine_progress` (VerifyUpstream — queries Machine A's Progress) |
| **Permissions** | index 2: manufacturer |
| **Industries** | manufacturing, logistics, retail, supply_chain |
| **Constraint** | Machine A MUST be published before Machine B (dependency order, no cycles) |

### 7. `tpl_machine_privacy_delivery` — Privacy-Preserving Delivery Flow

| Field | Value |
|---|---|
| **scene_id** | `privacy_delivery` |
| **Patterns** | `P-M-SEQ` |
| **Topology** | `P-M-LINEAR` |
| **Description** | Customer submits privacy data via Messenger (encrypted, off-chain). Chain stores only Merkle Root Proof. Guard verifies Proof signature + timestamp + service binding. |
| **Key params** | `merchant_permission`, `proof_node_name` (default ProofSubmitted), `delivery_node_name` (default DeliveryConfirmed) |
| **Nodes** | OrderCreated → `${proof_node_name}` → `${delivery_node_name}` → Complete |
| **Key Guards** | `tpl_forward_privacy_delivery_proof` (strict mode — 3 conditions: Signer + time + service binding) |
| **Permissions** | index 2: merchant |
| **Industries** | ecommerce, logistics, privacy_service |
| **Note** | Guard table item name MUST be <64 BCS bytes (MAX_NAME_LENGTH=64) |

### 8. `tpl_machine_reward` — Reward Incentive Flow

| Field | Value |
|---|---|
| **scene_id** | `reward_incentive` |
| **Patterns** | `P-M-SEQ` |
| **Topology** | `P-M-LINEAR` |
| **Description** | Customer triggers Reward claim at specific node. Guard prevents double-claim via `query_reward_record_count==0`. Reward object independent of Allocator. |
| **Key params** | `reward_ref` (must be created before publishing), `claim_node_name` (default ClaimReward) |
| **Nodes** | Eligible → `${claim_node_name}` → Rewarded → Complete |
| **Key Guards** | `tpl_reward_anti_double` (TriggerClaim — prevents double-claim) |
| **Permissions** | index 2: merchant, index 3: reward_admin |
| **Industries** | ecommerce, subscription, education, loyalty |
| **Critical Risk** | R-X1-14: double-claim prevention — MUST check `query_reward_record_count == 0` |

### 9. `tpl_machine_arbitration` — Arbitration Flow

| Field | Value |
|---|---|
| **scene_id** | `arbitration_flow` |
| **Patterns** | `P-M-VOTE`, `P-M-SEQ` |
| **Topology** | `P-M-LINEAR` |
| **Description** | Dispute → Submit → Vote → Ruling → Execute. Uses `arbitration_usage_guard` + `arbitration_voting_guard`. MAX_DISPUTE_COUNT=10 per order. Dual-vote prevention mandatory. |
| **Key params** | `arbitration_ref`, `max_disputes` (default 10, hard limit), `voting_threshold` (default 100) |
| **Nodes** | DisputeOpened → EvidenceSubmitted → Voting → Ruling → Executed |
| **Key Guards** | `tpl_arb_usage_anti_double` (OpenDispute — dispute count < 10), `tpl_arb_voting_guard` (ChiefVote + MemberVote) |
| **Permissions** | index 2: chief_arbitrator, index 3: admin |
| **Industries** | arbitration, ecommerce, service, rental |
| **Critical Risk** | R-X1-14: double-dispute + double-vote prevention |

### 10. `tpl_machine_subscription` — Subscription / Membership Flow

| Field | Value |
|---|---|
| **scene_id** | `subscription` |
| **Patterns** | `P-M-SEQ`, `P-M-COMPETING` |
| **Topology** | `P-M-LINEAR`, `P-M-COMPETING` |
| **Description** | Subscribe → Pay → Activate → [Renew | Expire] → Cancel/End. Time-lock on Renew. Competing Pair: Renew vs Expire (first-wins). Repository stores status. |
| **Key params** | `merchant_permission`, `subscription_duration_days` (default 30), `repository_ref` |
| **Nodes** | Subscribed → Active → RenewEligible → {Renewed → Active, Expired → Ended, Cancelled → Ended} |
| **Key Guards** | `tpl_forward_time_guard` (TimeUnlock + AutoExpire), `tpl_repository_write_guard` (Activate) |
| **Permissions** | index 2: provider, index 3: admin |
| **Allocators** | RenewAllocation triggered at Renewed |
| **Industries** | subscription, saas, membership, service |

---

## Cross-Reference: Template ↔ Pattern / Risk

| Template ID | Patterns | Topology | Risk IDs |
|---|---|---|---|
| `tpl_machine_ecommerce_standard` | P-M-SEQ | P-M-LINEAR | R-M1-01, R-M1-02, R-M1-08, R-M2-01, R-M3-02, R-M4-01 |
| `tpl_machine_ecommerce_exceptions` | P-M-SEQ, P-M-COMPETING | P-M-LINEAR, P-M-COMPETING | R-M1-01, R-M1-03, R-M1-08, R-M2-01, R-M2-05, R-M3-02, R-M3-04, R-M3-05, R-M4-01, R-M5-03 |
| `tpl_machine_rental` | P-M-SEQ | P-M-LINEAR | R-M1-01, R-M1-08, R-M2-01, R-M2-04, R-M3-02, R-M4-01, R-M5-02 |
| `tpl_machine_dual_signature` | P-M-AND | P-M-LINEAR | R-M1-08, R-M2-01, R-M3-02, R-M3-04 |
| `tpl_machine_weighted_voting` | P-M-VOTE | P-M-LINEAR | R-M1-08, R-M2-05, R-M3-04, R-M5-04, R-X1-14 |
| `tpl_machine_cross_machine` | P-M-CROSS-MACHINE | P-M-LINEAR | R-M1-01, R-M1-08, R-M2-01, R-M2-04, R-M3-04, R-M5-04, R-M5-05, R-M5-06 |
| `tpl_machine_privacy_delivery` | P-M-SEQ | P-M-LINEAR | R-M1-01, R-M1-08, R-M2-01, R-M2-04, R-M3-02, R-M5-03 |
| `tpl_machine_reward` | P-M-SEQ | P-M-LINEAR | R-M1-08, R-M2-05, R-M3-04, R-X1-14 |
| `tpl_machine_arbitration` | P-M-VOTE, P-M-SEQ | P-M-LINEAR | R-M1-08, R-M2-05, R-M3-04, R-M5-04, R-X1-14 |
| `tpl_machine_subscription` | P-M-SEQ, P-M-COMPETING | P-M-LINEAR, P-M-COMPETING | R-M1-01, R-M1-08, R-M2-01, R-M2-05, R-M3-02, R-M3-04, R-M4-01, R-M5-04 |

---

## Cross-Reference: Template ↔ Industry

| Industry | Recommended Templates |
|---|---|
| ecommerce | `tpl_machine_ecommerce_standard`, `tpl_machine_ecommerce_exceptions`, `tpl_machine_dual_signature`, `tpl_machine_privacy_delivery`, `tpl_machine_reward`, `tpl_machine_arbitration` |
| rental | `tpl_machine_rental`, `tpl_machine_ecommerce_exceptions` |
| logistics | `tpl_machine_cross_machine`, `tpl_machine_privacy_delivery`, `tpl_machine_arbitration` |
| manufacturing | `tpl_machine_cross_machine` |
| governance | `tpl_machine_weighted_voting`, `tpl_machine_arbitration` |
| arbitration | `tpl_machine_arbitration`, `tpl_machine_weighted_voting` |
| subscription | `tpl_machine_subscription`, `tpl_machine_reward` |
| service | `tpl_machine_dual_signature`, `tpl_machine_arbitration`, `tpl_machine_subscription` |
| dao | `tpl_machine_weighted_voting` |
| escrow | `tpl_machine_dual_signature` |

---

## Template Selection Decision Tree

```
START
  ↓
Q1: Does the workflow involve multiple independent services/parties?
  ├─ YES → Q2
  └─ NO  → Q3

Q2: Are these services already published as separate Machines?
  ├─ YES → tpl_machine_cross_machine
  └─ NO  → Decompose into multiple Machines first

Q3: Does any node require multiple parties' confirmation to advance?
  ├─ YES → Q4
  └─ NO  → Q5

Q4: Do all parties have EQUAL weight?
  ├─ YES → tpl_machine_dual_signature (AND semantics, threshold=2)
  └─ NO  → tpl_machine_weighted_voting (VOTE semantics, threshold=100)

Q5: Does the workflow need exception branches (lost, return, dispute)?
  ├─ YES → tpl_machine_ecommerce_exceptions
  └─ NO  → Q6

Q6: Does it involve recurring payments or time-based state changes?
  ├─ YES → tpl_machine_subscription
  └─ NO  → Q7

Q7: Does it need privacy-preserving data delivery (Messenger)?
  ├─ YES → tpl_machine_privacy_delivery
  └─ NO  → Q8

Q8: Does it involve deposit/refund separation?
  ├─ YES → tpl_machine_rental
  └─ NO  → Q9

Q9: Does it need reward/incentive distribution at a specific node?
  ├─ YES → tpl_machine_reward
  └─ NO  → tpl_machine_ecommerce_standard (default baseline)
```

---

## Template Usage Flow (aligned with wowok-onboard R3-R7)

```
M1 (within R3): Initial intent collection
  - User describes business flow
  - inferSceneFromFlow() suggests scene
  - suggestTemplateForIntent() suggests template
  - AI presents template + parameters to user
       ↓
M2 (within R3): Parameter collection
  - AI collects values for each template parameter
  - Validates types + constraints
  - fillTemplate() generates filled nodes/pairs JSON
       ↓
M3-M5 (within R4): Node + Guard design refinement
  - Review filled JSON with user
  - Adjust node names, forwards, thresholds per user input
  - Identify required Guards (from required_guards list)
  - Design each Guard using guard-templates.ts
       ↓
M6 (within R5): Topology + permission model verification
  - Verify branching (competing vs parallel)
  - Verify permission indices are consistent
  - Assess risks using machine-risk.ts
       ↓
M7 (within R6): Guard integration verification
  - All required_guards created on-chain
  - Each Guard bound to correct Forward
  - gen_passport verifies each Guard
       ↓
M8 (within R7): Pre-publish confirmation
  - Run full publish_checklist
  - Generate confirmation text (machine-confirm.ts)
  - User MUST approve before publish
  - Testnet test run MANDATORY before mainnet publish
```

---

## Template Operations

### Query Functions

| Function | Signature | Description |
|---|---|---|
| `getAllTemplates` | `(): MachineTemplate[]` | Get all templates |
| `getTemplateById` | `(id: string): MachineTemplate \| undefined` | Get template by ID |
| `getTemplatesByScene` | `(scene_id: string): MachineTemplate[]` | Get templates by scene ID |
| `getTemplatesByIndustry` | `(industry: string): MachineTemplate[]` | Get templates by industry tag |
| `suggestTemplateForIntent` | `(intent: string): MachineTemplate \| undefined` | Suggest template based on user intent |

### Template Filling

```typescript
export interface TemplateFillResult {
    success: boolean;
    filled_nodes?: object;       // nodes with ${param} replaced
    filled_pairs?: object;       // pairs with ${param} replaced
    missing_params?: string[];   // required params not provided
    validation_errors?: string[];
}
```

The `fillTemplate(template, params)` function:
1. Validates all required params are provided
2. Validates param types
3. Substitutes `${param}` placeholders in `example_nodes` / `example_pairs` via `deepSubstitute`

### Fork-Modify

```typescript
export interface ForkResult {
    template_id: string;
    forkable_fields: string[];
    current_values: Record<string, unknown>;
    instructions: string[];
}
```

`forkTemplate(template)` returns editable fields for user customization. Instructions:
- Modify fields below to customize the workflow
- Keep template structure intact unless explicitly noted
- Run risk assessment after modification (machine-risk.ts)
- User MUST confirm final JSON before publish (ConfirmGate)

---

## Extension Mechanism

### Adding a New Template

1. Define scene in `machine-ledger.ts` first (if new scene)
2. Define template with full parameterization
3. Cross-reference to `guard-templates.ts` (`required_guards`)
4. Cross-reference to `machine-translation.ts` (`recommended_patterns`)
5. Cross-reference to `machine-risk.ts` (`relevant_risks`)
6. Add `publish_checklist` items
7. Test on testnet before promoting to production

### Version Control

```typescript
export interface MachineTemplateVersion {
    template_id: string;
    version: string;          // semver
    breaking_changes: string[];
    migration_notes: string[];
    deprecated: boolean;
    successor_id?: string;
}
```

Templates are immutable once published (like Guards/Machines). New requirements → new template ID.

---

## Alignment with Guard Template Library

| Dimension | Guard Templates | Machine Templates |
|---|---|---|
| Count | 10 | 10 (one per Machine scene) |
| Param types | address/string/number/boolean/vec_address | + node_name_list, permission_ref, guard_ref, machine_ref, service_ref, arbitration_ref, reward_ref |
| Cross-refs | → Pattern (P02-P17), Risk (R-C*) | → Pattern (P-M-*), Risk (R-M*), → Guard templates (via required_guards) |
| Forkable | N/A (Guards are CREATE-only) | `forkable_fields` per template (P-M5 mode) |
| Post-publish modification | NO (immutable) | NO (immutable) |
| Testing | `gen_passport` | Testnet Progress run |
| Entry point | wowok-guard skill | wowok-machine + wowok-onboard skills |

---

## Module Dependencies

```
machine-ledger.ts (scene definitions)
        ↓
machine-templates.ts (this module)
        ↓
machine-translation.ts (Patterns + constraints)
        ↓
machine-risk.ts (risk assessment)
        ↓
machine-confirm.ts (publish confirmation gate)
        ↓
machine-puzzle.ts (information puzzle integration)
        ↓
machine-context.ts (context injection)
        ↓
machine-topology.ts (DAG topology analysis)
```

**Key dependencies**:
- `machine-ledger.ts`: Provides `scene_id` and scene definitions
- `guard-templates.ts`: Provides Guard templates referenced in `required_guards`
- `machine-translation.ts`: Provides Patterns referenced in `recommended_patterns`
- `machine-risk.ts`: Provides risk rules referenced in `relevant_risks`
- `machine-confirm.ts`: Executes `publish_checklist` mandatory checks

---

## Implementation Status

### Implemented in `guard-templates.ts`
- ✅ Complete Guard 10 template definitions
- ✅ Guard template parameterization + type constraints
- ✅ Guard template cross-references to Pattern/Risk
- ✅ Guard template `verifier_constraint_level` grading

### Implemented in `machine-templates.ts` (Phase M-7 complete)
- ✅ `MachineTemplate` / `MachineTemplateParam` / `RequiredGuardRef` / `RequiredPermission` / `RequiredAllocator` interfaces
- ✅ 10 Machine templates complete data (ecommerce, rental, reward, crowdfunding, etc.)
- ✅ `getAllTemplates` / `getTemplateById` / `getTemplatesByScene` / `getTemplatesByIndustry` / `getTemplatesByPattern`
- ✅ `suggestTemplateForIntent` (depends on `inferSceneFromFlow` from machine-ledger.ts)
- ✅ `getTemplateParameters` / `getRequiredParameters` / `getOptionalParameters`
- ✅ `fillTemplate` (returns `TemplateFillResult`, uses `deepSubstitute` for recursive placeholder replacement)
- ✅ `forkTemplate` (Fork-Modify support, returns `ForkResult`, corresponds to participation mode P-M5)
- ✅ Template version metadata (`MACHINE_TEMPLATES_VERSION` / `MACHINE_TEMPLATES_COUNT`)
- ✅ Decision tree (`DECISION_TREE` + `walkDecisionTree`)
- ✅ Template consistency self-check (`verifyTemplateSceneReferences` / `getReferencedGuardTemplateIds` / `getReferencedRiskIds`)
- ✅ Template listing (`listTemplates` for UI display)

### Implemented in `machine-confirm.ts`
- ✅ Decision tree (`DECISION_TREE` + `walkDecisionTree`)
- ✅ Template usage flow integrated with wowok-onboard R3-R7 (`progressiveCheck`)
- ✅ Template `publish_checklist` enforcement (`PUBLISH_CHECKLIST` + `runStaticChecklist` + `confirmPublish` 4-layer ConfirmGate)

---

*Reference document for the Machine Template Library — 10 parameterized templates for the Machine semantic layer. Each template includes complete parameters, node structure, Guard references, permission configuration, Allocator integration, and publish checklist.*