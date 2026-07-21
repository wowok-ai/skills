# Merchant Service Build Scenario Coordination

> **Purpose**: Standalone reference for the merchant service build scenario, integrating the provider skill with the 22-object system.

---

## §1 Scenario Overview

The merchant service build scenario covers the full lifecycle from naming a project through business puzzle completion, risk calibration, and outputting deployable MD documents for testnet/mainnet.

### 1.1 Why This Document Exists

`wowok-provider/SKILL.md` provides R1-R7 required items and a 5-step build lifecycle, but has three limitations:

1. **Incomplete object coverage**: R1-R7 covers only 7 objects, while at least 12 of the 22-object system are directly relevant to merchant builds.
2. **Topological order misalignment**: The 5-step lifecycle is an operational view, not aligned with the 22-object dependency topology.
3. **Scattered immutability constraints**: Object locking rules are spread across multiple docs.

### 1.2 Core Integration: Provider Skill × 22-Object System

This document bridges the operational perspective of skills (R1-R7, 5-step lifecycle) with the systemic perspective of the 22-object architecture. The key integration points are:

| Integration Layer | Skills View | 22-Object View |
|---|---|---|
| Required items | R1-R7 (7 items) | R1-R7 + C1-C8 (15 items) |
| Lifecycle | 5 steps (operational) | 5 steps × topological order (dual view) |
| Reuse strategy | Implicit | Explicit matrix (CREATE vs MODIFY) |
| Industry modes | Presets per mode | 6 modes with stacking |
| Quality gates | None explicit | 3-tier confirmation gates |

---

## §2 R1-R12 + C1-C8 Extension Mapping

### 2.1 R1-R7 Required Items (from skills, preserved)

| # | Item | User Must Provide | Related Object |
|---|---|---|---|
| **R1** | Account | Account name/address, default `""` | — |
| **R2** | Permission | Reuse existing Permission, or name + type_parameter to create new | Permission (1) |
| **R3** | Service | Service name, type_parameter, service type | Service (4) |
| **R4** | Machine | Nodes, state transition pairs, forward paths | Machine |
| **R5** | Guards | Validation logic and conditions for each Guard | Guard |
| **R6** | Guard Bindings | Which Guard validates which Machine forward | Guard + Machine |
| **R7** | Allocators | Per outcome: who gets what %/amount | Allocation (3) |

### 2.2 C1-C8 Conditionally Required Items (extension)

| # | Item | Trigger Condition | User Must Provide | Related Object |
|---|---|---|---|---|
| **C1** | Contact (um) | `customer_required` is set | Contact name/ID | Contact (13) |
| **C2** | WIP Files | Physical goods | Product descriptions, images | Proof (10) |
| **C3** | Sales Products | Listing products | Name, price, inventory, per-product WIP | Service (4).sales |
| **C4** | Treasury | Fund collection needed | Treasury name/ID | Treasury (2) |
| **C5** | customer_required | Privacy info needed | Privacy field list | Personal (18) |
| **C6** | Arbitration | Dispute resolution needed | Existing Arb service ID list | Arbitration (7) |
| **C7** | Repository | Data attestation needed | Repository name/ID | Repository (11) |
| **C8** | Reward | User incentive needed | Reward name/ID + Guard config | Reward (8) |

### 2.3 Necessity Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│              Merchant Scenario Necessity Hierarchy        │
├─────────────────┬───────────────────────────────────────┤
│ R1-R7 Required  │ Account / Permission / Service /      │
│                 │ Machine / Guards / GuardBindings /     │
│                 │ Allocators                             │
├─────────────────┼───────────────────────────────────────┤
│ C1-C8 Conditional│ Contact / WIP / Sales / Treasury /   │
│                  │ Privacy / Arbitration / Repository /  │
│                  │ Reward                                │
├─────────────────┼───────────────────────────────────────┤
│ Passive Response │ Order / Passport / Progress (partial) │
│                  │ / Proof                               │
├─────────────────┼───────────────────────────────────────┤
│ Not Relevant    │ Demand / Resource / Payment /          │
│                 │ Registrar+Entity / Bridge              │
└─────────────────┴───────────────────────────────────────┘
```

---

## §3 5-Step Lifecycle × 22-Object Topology

### 3.1 Provider 5-Step Lifecycle (Operational View)

| Step | Name | Involved Objects | Key Operations |
|---|---|---|---|
| **1** | Foundation | Permission, Service, Machine | Create/reuse Permission → create unpublished Service → create unpublished Machine |
| **2** | Trust Layer | Guards | Create/reuse Guards (per Guard design table) |
| **3** | Business Logic | Machine, Service, Arbitration, Guard, Reward | Machine binds Guards → Service sets Allocators → optional arbitration/reward |
| **4** | Publication | Machine, Service | Publish Machine → bind Service → publish Service (locks machine/order_allocators) |
| **5** | Post-Publish | Service | Modify description/location/sales/customer_required/um |

### 3.2 22-Object Topological Order (Dependency View)

| Topo Pos | Object | Creation Timing | Merchant Action |
|---|---|---|---|
| 1 | Permission | Step 1 | Reuse or create new |
| 2 | Treasury | Step 3 (optional) | Reuse or create new |
| 3 | Allocation | Step 3 | Configure within Service (not independently created) |
| 4 | Service | Step 1 (unpublished) → Step 4 (published) | Create → configure → publish |
| 5 | Order | Passive response | Merchant does not create |
| 6 | Progress | Passive response | Merchant advances (hold/submit) |
| 7 | Arbitration | Step 3 (optional) | Reuse existing Arb service |
| 8 | Reward | Step 3 (optional) | Create Reward + Guard |
| 9 | Passport | Passive response | Merchant does not operate |
| 10 | Proof | Post-Publish | Create WIP files |
| 11 | Repository | Step 3 (optional) | Create Repository + Guard |
| 12 | Demand | Not relevant | — |
| 13 | Contact | Step 5 (conditional) | Reuse or create new |
| — | Guard | Step 2 | Create/reuse |
| — | Machine | Step 1 (unpublished) → Step 4 (published) | Create → bind Guards → publish |

### 3.3 Dual-View Cross-Reference Matrix

| Object | Topo Pos | Step 1 Foundation | Step 2 Trust | Step 3 Business | Step 4 Publish | Step 5 Post |
|---|---|---|---|---|---|---|
| Permission | 1 | **Create/Reuse** | — | — | — | — |
| Service | 4 | Create (unpublished) | — | Configure Allocators/Arb | **Publish** | Modify desc/sales/um |
| Machine | — | Create (unpublished) | — | Bind Guards | **Publish** | — |
| Guard | — | — | **Create/Reuse** | — | — | — |
| Allocation | 3 | — | — | **Configure in Service** | (locked) | — |
| Treasury | 2 | — | — | (optional) Create | — | — |
| Arbitration | 7 | — | — | (optional) Reuse | — | — |
| Reward | 8 | — | — | (optional) Create | — | — |
| Repository | 11 | — | — | (optional) Create | — | — |
| Contact | 13 | — | — | — | — | (conditional) |
| Proof | 10 | — | — | — | — | (optional) WIP |

> **Key insight**: Step 1 Foundation skips topo positions 2/3 (Treasury/Allocation); Step 2 Trust skips topo pos 7 (Arbitration). This is because Treasury/Allocation are only needed in Step 3, and Arbitration is optional reuse. Topological order = dependency graph, lifecycle = execution sequence — they are complementary.

---

## §4 Object Reuse & Immutability Decision Matrix

### 4.1 Immutability Timeline

| Object | Created (Locked) | Published (Locked) | Never Locked | Recovery |
|---|---|---|---|---|
| Permission | — | — | ✅ | — |
| Service | — | machine/order_allocators | description/sales/um | Create new Service |
| Machine | — | nodes/forwards | — | Create new Machine, rebind Service |
| Guard | ✅ all fields | — | — | Create new Guard, update all references |
| Allocation | — | (as Service field) | — | Create new Service |
| Contact | — | — | ✅ | — |
| Arbitration | — | — | ✅ | — |
| Reward | guard_expiration_time | — | other fields | Create new Reward |
| Repository | — | — | ✅ | — |
| Treasury | — | — | ✅ | — |

### 4.2 Reuse Decision Matrix

| Object | Recommended? | Condition | Method |
|---|---|---|---|
| **Permission** | ✅ **Strongly recommended** | Centralized access control | String reference `"<name_or_id>"` |
| **Machine** | ⚠️ Depends | Workflow match | `machineNode2file` export → edit |
| **Guard** | ⚠️ Depends | Validation logic match | Immutable after creation |
| **Contact** | ✅ Recommended | Customer service channel reuse | String reference |
| **Arbitration** | ✅ **Strongly recommended** | Customer chooses established arbitrators | String reference to Arb service ID |
| **Treasury** | ⚠️ Depends | Fund collection need | String reference |
| **Repository** | ⚠️ Depends | Data attestation need | String reference |
| **Reward** | ❌ Usually create new | Incentive logic varies | Object shape creation |
| **Service** | ❌ Must create new | Brand identity is unique | Object shape creation |

### 4.3 CREATE vs MODIFY Decision Flow

```
Whether to reuse an existing object?
├── Yes → MODIFY mode (string reference)
│   ├── String `"<name>"` or `"<0x...>"`
│   ├── SDK resolves via GetObjectExisted()
│   └── Resolution failure → hard error
└── No → CREATE mode (object shape)
    ├── `{ name?, ... }`
    └── SDK creates new object
```

---

## §5 6 Industry Modes — Merchant Perspective

### 5.1 Mode Quick Reference

| Mode | Phase | Industry | Trust Model | Machine Shape | Guards | Allocators |
|---|---|---|---|---|---|---|
| `freelance` | 1 | Design/Dev/Consulting/Writing | Milestone escrow + acceptance gate | 7 nodes | 5 (buy/deliver/accept/withdraw/refund) | 2 (100% provider / 100% refund) |
| `rental` | 1 | Equipment/Vehicle/Property | Deposit escrow + return inspection | 10 nodes | 5 (deposit/return/inspect/refund/damage) | 3 (rent/refund/deduct) |
| `education` | 2 | Courses/Training/Tutoring | Per-session release + attendance guard | Multi-node | attendance/refund | 1/N release |
| `travel` | 2 | Custom tours/Multi-leg itineraries | Multi-tier escrow per segment | Multi-node | segment/refund | Multi-tier waterfall |
| `subscription` | 3 | SaaS/Content membership/Periodic service | Periodic billing + cancel guard | Cyclic | charge/cancel/deliver | Periodic release |
| `general` | Always | Any uncovered/mixed | User-defined | Custom | Custom | Custom |

### 5.2 Mode Selection Algorithm

```typescript
type IndustryTraits = {
  has_logistics: boolean;
  communication_heavy: boolean;
  pure_digital: boolean;
  long_cycle: boolean;
  deposit_required: boolean;
  multi_tier_allocation: boolean;
};

// Selection matrix
pure_digital + communication_heavy + !deposit_required          → freelance
deposit_required + has_logistics + returnable                   → rental
long_cycle + attendance + periodic_release                      → education
multi_tier_allocation + segment_based + long_cycle              → travel
periodic_charge + cancel_anytime + pure_digital                 → subscription
none of above                                                   → general
```

### 5.3 Mode Stacking

| Combination | Use Case | Conflict Resolution |
|---|---|---|
| freelance + subscription | Monthly retainer + milestones | Allocator split: retainer (sub) + milestone (freelance) |
| rental + education | Equipment training rental | Machine extension: rental + attendance nodes |
| travel + rental | Travel with equipment | Allocator side-by-side: segment + deposit escrow |

### 5.4 Merchant Perspective: Key Decisions Per Mode

| Decision | freelance | rental | education | travel | subscription | general |
|---|---|---|---|---|---|---|
| Machine complexity | Medium | High | Medium-High | High | Low (cyclic) | Custom |
| Guard count | 5 | 5 | 2-3 | 2-3 | 3 | Custom |
| Pricing model | Fixed milestone | Deposit + rent + refund | Per-session | Multi-segment | Periodic | Custom |
| Customer interaction | Milestone review | Return inspection | Attendance | Trip segments | Cancel anytime | Custom |
| Refund logic | Per milestone | Conditional | Pro-rated | Per segment | Pro-rated | Custom |

---

## §6 Quality Gates & Risk Rules

### 6.1 Three-Tier Confirmation Gates

```
Gate 1: Information Collection Confirmation (R1-R7 + C1-C8)
├── Each R-item: user explicitly states "reuse X" or "create Y"
├── Each C-item: trigger condition check
└── ⛔ All R-items unconfirmed → no on-chain operations allowed

Gate 2: Pre-Publish Audit (before Step 4)
├── guard2file export all Guards → user review
├── machineNode2file export Machine → user review
├── Allocator ratios → user confirmation
├── Invoke wowok-auditor for 5 checks
└── ⛔ Any CRITICAL risk → block publish

Gate 3: Publish Confirmation (during Step 4)
├── Show "about to publish" warning + irreversibility notice
├── List fields that will be locked after publish
├── User explicitly confirms "Proceed with publish?"
└── ⛔ No explicit confirmation → no publish
```

### 6.2 Key Risk Rules

| Risk ID | Object | Severity | Description | Merchant Impact |
|---|---|---|---|---|
| R-S-01 | Service | CRITICAL | 15 constants not synced | SDK/MCP users cannot query limits |
| R-S-02 | Service | CRITICAL | WIP hash tampering risk | Undetected WIP file replacement |
| R-M-01 | Machine | HIGH | Node count > 100 (SDK limit) | SDK rejects creation |
| R-G-01 | Guard | HIGH | 4 rely dependency limit | Complex rules must split |
| R-A-01 | Allocation | HIGH | Surplus recipients > 1 | Ambiguous fund allocation |
| R-P-01 | Permission | MEDIUM | Custom index < 1000 | Conflicts with built-in permissions |
| R-T-01 | Treasury | CRITICAL | SDK/Move permission index mismatch | Operations rejected by Permission |

---

## §7 Skill Collaboration in Merchant Scenario

### 7.1 Skill Call Chain

```
User: "I want to open a shop on WoWok"
  │
  ▼
wowok-onboard (first-time onboarding)
  ├── R1-R10 guided dialogue
  ├── Calls wowok-scenario (mode selection)
  └── Calls wowok-planner (ODG generation)
       │
       ▼
wowok-planner (planning)
  ├── Generates Object Dependency Graph
  ├── Calls wowok-safety (security checks)
  └── Calls wowok-machine + wowok-guard (template loading)
       │
       ▼
wowok-provider (merchant build)
  ├── 5-step lifecycle execution
  ├── Each step calls wowok-safety (tx confirmation)
  ├── Each step calls wowok-tools (MCP tool selection)
  └── Post-Publish calls wowok-auditor (pre-publish audit)
       │
       ▼
wowok-auditor (pre-publish audit)
  ├── Guard completeness check
  ├── Machine soundness check
  ├── Fund flow safety check
  ├── Permission consistency check
  └── Publish readiness check
       │
       ▼
wowok-safety (publish confirmation)
  └── User confirms → execute publish
```

### 7.2 Skills Responsibility Matrix

| Skill | Role in Merchant Scenario | Trigger | Output |
|---|---|---|---|
| wowok-onboard | First-time guidance | New user | 10-round dialogue script |
| wowok-scenario | Mode selection | R3-R8 needs defaults | Industry mode config |
| wowok-planner | ODG generation | Business intent clear | Object dependency graph |
| wowok-safety | Security checks + tx confirmation | Every on-chain operation | Confirm/warn/block |
| wowok-tools | MCP tool selection | Any MCP call | Tool + parameters |
| wowok-provider | Merchant build main flow | R1-R7 confirmed | 5-step lifecycle |
| wowok-machine | Machine design | R4 requirement | Node graph + forwards |
| wowok-guard | Guard design | R5 requirement | Guard definitions |
| wowok-auditor | Pre-publish audit | Before Step 4 | Audit report |
| wowok-messenger | Customer communication | Post-Publish | Encrypted messages |
| wowok-arbitrator | Arbitration service | Step 3 (optional) | Arb service reuse |
| wowok-output | Result display | After tool response | Human-readable format |

---

## §8 Summary

### 8.1 Core Insights

1. **12 of 22 objects are directly relevant to merchants**: R1-R7 required + C1-C8 conditional + passive response.
2. **5-step lifecycle × topological order are complementary**: Operational view + dependency view, not conflicting.
3. **Object reuse is the core optimization**: Permission strongly recommended for reuse; others depend on context.
4. **Three-tier gates ensure publish quality**: Information collection → pre-publish audit → publish confirmation.
5. **6 industry modes accelerate builds**: freelance/rental complete; education/travel/subscription in Phase 2/3.

### 8.2 Deployment Outputs

After completing the 5-step lifecycle + 3-tier confirmation gates, the merchant receives:

- **testnet deployment MD**: For testnet verification
- **mainnet deployment MD**: For mainnet production deployment
- **Risk calibration report**: 22-object risk rule execution results
- **User confirmation letter**: R1-R7 + C1-C8 all confirmed

---

## Appendix A: Quick Checklist

### R1-R7 Required Items
- [ ] R1 Account confirmed
- [ ] R2 Permission confirmed (reuse/create new)
- [ ] R3 Service confirmed (name, type)
- [ ] R4 Machine confirmed (nodes, forwards)
- [ ] R5 Guards confirmed (each Guard logic)
- [ ] R6 Guard Bindings confirmed (which Guard validates which forward)
- [ ] R7 Allocators confirmed (revenue share ratios)

### C1-C8 Conditionally Required Items
- [ ] C1 Contact (if customer_required is set)
- [ ] C2 WIP Files (if physical goods)
- [ ] C3 Sales Products (if listing products)
- [ ] C4 Treasury (if fund collection needed)
- [ ] C5 customer_required (if privacy info needed)
- [ ] C6 Arbitration (if dispute resolution needed)
- [ ] C7 Repository (if data attestation needed)
- [ ] C8 Reward (if user incentive needed)

### Three-Tier Gates
- [ ] Gate 1 Information collection confirmed (all R + C items)
- [ ] Gate 2 Pre-publish audit (guard2file + machineNode2file + auditor)
- [ ] Gate 3 Publish confirmation (user explicitly proceeds)

### Deployment Outputs
- [ ] testnet deployment MD document
- [ ] mainnet deployment MD document
- [ ] Risk calibration report
- [ ] User confirmation letter