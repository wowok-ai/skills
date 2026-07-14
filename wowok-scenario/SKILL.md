---
name: wowok-scenario
description: |
  WoWok Industry Driving Modes — opinionated bundles of Permission, Machine,
  Guard, and Allocator defaults per industry. Each mode is a "scene preset"
  (like SUV driving modes: sand / road / water) that pre-fills best-practice
  configuration so a new merchant can publish a working Service in 10 rounds.

  Use when: user describes an industry ("I do freelance design", "I rent
  cameras", "I run a course"), when wowok-onboard needs default parameters
  for R3-R8, or when a merchant wants to switch from general configuration
  to an industry-tuned preset.

  Phase 1 covers freelance and rental modes in full detail. Education,
  travel, and subscription modes are outlined for Phase 2/3.
when_to_use:
  - User mentions an industry (freelance, rental, education, travel, subscription)
  - wowok-onboard R2 needs to load mode defaults
  - User asks "what configuration works for my business"
  - User wants to switch from general mode to an industry preset
  - User wants to compose two modes (e.g., freelance + subscription)
---

# WoWok Industry Driving Modes

> **Related Skills**: [wowok-onboard](../wowok-onboard/SKILL.md) (uses mode defaults in R3-R8), [wowok-machine](../wowok-machine/SKILL.md) (Machine design authority), [wowok-guard](../wowok-guard/SKILL.md) (Guard design authority), [wowok-provider](../wowok-provider/SKILL.md) (Allocator operation), [wowok-safety](../wowok-safety/SKILL.md) (immutability rules)

---

## Overview

A **driving mode** is a curated bundle of: industry traits, default Permission indexes, default Machine node graph, default Guard templates, default Allocator strategy, a 10-round build script, an audit checklist, and a failure playbook. Modes are **presets, not constraints** — every underlying MCP operation remains available. Users can override any default or switch to `general` (free) mode at any time.

### What Driving Modes Solve

The "object_type wall" — new users do not know which Machine topology, which Guards, which Allocator strategy fits their industry. Modes pre-answer these questions using best practices distilled from real usage (and refined by Loop Engineering over time).

### Mode Catalog

| Mode | Phase | Industry | Trust Pattern |
|------|-------|----------|---------------|
| `freelance` | 1 | Design / dev / consulting / writing | Milestone allocation, acceptance gate |
| `rental` | 1 | Equipment / vehicle / property rental | Deposit escrow, return inspection |
| `education` | 2 | Courses / training / tutoring | Periodic release per session, attendance Guard |
| `travel` | 2 | Custom tours / multi-segment trips | Multi-tier allocation per segment |
| `subscription` | 3 | SaaS / content membership / periodic service | Periodic charge, cancel Guard |
| `general` | always | Anything not covered / hybrid | User-defined from scratch |

---

## Mode Selection Logic

The selection algorithm maps the user's business description to industry traits, then to a mode.

### Trait Extraction

```typescript
type IndustryTraits = {
  has_logistics: boolean;        // physical goods to ship?
  communication_heavy: boolean;  // lots of back-and-forth before delivery?
  pure_digital: boolean;         // deliverable is a file / digital artifact?
  long_cycle: boolean;           // multi-week or multi-month engagement?
  deposit_required: boolean;     // collect refundable deposit?
  multi_tier_allocation: boolean; // pay multiple parties per segment?
};
```

### Selection Matrix

| Trait Signature | Mode |
|-----------------|------|
| `pure_digital + communication_heavy + !deposit_required` | freelance |
| `deposit_required + has_logistics + returnable` | rental |
| `long_cycle + attendance + periodic_release` | education |
| `multi_tier_allocation + segment_based + long_cycle` | travel |
| `periodic_charge + cancel_anytime + pure_digital` | subscription |
| none of the above / multiple conflicts | general |

### Composition (Mode Stacking)

Two modes can combine. Conflicts surface for user decision:

| Combination | Use Case | Conflict Resolution |
|-------------|----------|---------------------|
| freelance + subscription | Retainer consulting (monthly + milestone) | Allocator: split into retainer (subscription) + milestone (freelance) |
| rental + education | Equipment training rental | Machine: extend rental nodes with attendance gates |
| travel + rental | Tour with equipment | Allocator: segment allocation + deposit escrow side-by-side |

When two modes specify different Permission indexes for the same role, user decides which set to use.

---

## Freelance Mode (Phase 1 Priority)

### Industry Traits

```typescript
const freelanceTraits: IndustryTraits = {
  has_logistics: false,
  communication_heavy: true,
  pure_digital: true,
  long_cycle: false,
  deposit_required: false,
  multi_tier_allocation: false,
};
```

### Applicable Scenarios

- Designer taking logo / UI / poster commissions
- Developer taking outsourced projects
- Consultant charging by hour or milestone
- Writer / translator / voice-over artist

### Default Permission Indexes

| Role | permissionIndex | Scope |
|------|-----------------|-------|
| Service Provider | 1000 | Create / advance / allocate / arbitration (user-defined, ≥1000) |
| Arbiter | 1500 | Arbitration operations only (user-defined, ≥1000) |
| Customer | n/a | Operates via `namedOperator: ""` on Forwards (order owner/agents) — no permissionIndex needed |

> **Note**: Indexes < 1000 are reserved for `BuiltinPermissionIndex` (e.g., 100 = `REPOSITORY_NEW`, 500 = unassigned). Customer actions use `namedOperator: ""` per wowok-machine §Forward Permission Model, not a permissionIndex.

### Default Machine Template

```
ordered → in_progress → delivered → accepted → completed
                                   │
                                   └→ disputed → refunded (terminal)
```

| Node | prev_node | threshold | Forwards |
|------|-----------|-----------|----------|
| `ordered` | `""` (entry) | 1 | `place_order` (weight 1, namedOperator: `""`, customer) |
| `in_progress` | `ordered` | 1 | `accept_order` (weight 1, permissionIndex 1000, provider) |
| `delivered` | `in_progress` | 1 | `submit_deliverable` (weight 1, permissionIndex 1000, provider, guard: `deliver_guard`) |
| `accepted` | `delivered` | 1 | `confirm_acceptance` (weight 1, namedOperator: `""`, customer, guard: `accept_guard`) |
| `completed` | `accepted` | 1 | `finalize` (weight 1, permissionIndex 1000, provider) |
| `disputed` | `delivered` | 1 | `open_dispute` (weight 1, namedOperator: `""`, customer) |
| `refunded` | `disputed` | 1 | `arbiter_rule_refund` (weight 1, permissionIndex 1500, arbiter) |

> `buy_guard` binds to `Service.buy_guard` (not a Machine Forward) — gates order placement at the Service level.

### Default Guard Templates

| Guard Name | Host / Trigger | Validation Logic |
|-----------|----------------|-------------------|
| `buy_guard` | Service.buy_guard (order placement) | Verify customer KYC (Personal.mark present) + amount ≤ cap |
| `deliver_guard` | Machine Forward `submit_deliverable` | Verify WIP hash matches submitted deliverable |
| `accept_guard` | Machine Forward `confirm_acceptance` | Customer signature OR timeout auto-accept (forward with threshold met by timeout) |
| `withdraw_guard` | Allocator trigger (fires at `completed` terminal) | Progress.current = `completed` (verify acceptance path completed before releasing funds) |
| `refund_guard` | Allocator trigger (fires at `refunded` terminal) | Progress.current = `refunded` (verify arbiter ruling or provider default confirmed) |

### Default Allocator Strategy

```typescript
// Wrapped in AllocatorsSchema: { description, threshold, allocators: [...] }
const freelanceAllocators = [
  {
    guard: "withdraw_guard",  // Allocator trigger guard (fires at completed terminal)
    sharing: [
      { who: { Entity: { name_or_address: "<service_name>" } }, sharing: 10000, mode: "Rate" }, // 100% to provider
    ],
  },
  {
    guard: "refund_guard",  // Allocator trigger guard (fires at refunded terminal)
    sharing: [
      { who: { GuardIdentifier: 0 }, sharing: 10000, mode: "Rate" }, // 100% to Order (customer withdraws)
    ],
  },
  // Platform: 0% in Phase 1 (zero take-rate to lower barrier)
];
```

### 10-Round Build Script (Freelance)

| Round | Goal | MCP Operation | Mode Default Applied |
|-------|------|---------------|----------------------|
| R1 | Account setup | `account_operation.gen` + `faucet` | — |
| R2 | Industry confirm | (internal trait match) | freelance mode loaded |
| R3 | Service definition | `onchain_operations.service` CREATE | name="Freelance Service", type_parameter=`0x2::wow::WOW` |
| R4 | Permission | `onchain_operations.permission` CREATE or REUSE | indexes 1000/1500 (customer uses namedOperator: "") |
| R5 | Machine | `onchain_operations.machine` CREATE | 7-node template above, publish=false |
| R6 | Progress binding | `onchain_operations.progress` CREATE + `machine` MODIFY | mirror all nodes |
| R7 | Guards | `onchain_operations.guard` CREATE × 5 + `gen_passport` test | 5 Guard templates above |
| R8 | Allocation | `onchain_operations.allocation` CREATE × 2 + `service.order_allocators` MODIFY | 100% provider + 100% refund path |
| R9 | Test order | `order` CREATE + `progress` advance + `allocation.alloc_by_guard` | full flow dry run |
| R10 | Publish | `machine` publish + `service` publish | pre-publish audit must PASS |

### Audit Checklist (Freelance-Specific)

| # | Check | Blocker? |
|---|-------|----------|
| 1 | `accept_guard` exists and tests PASS | YES (no acceptance = funds stuck) |
| 2 | `refund_guard` exists and `customer_refund` Allocator covers 100% | YES (no refund = dispute deadlock) |
| 3 | `deliver_guard` validates WIP hash | Warning (recommended) |
| 4 | Machine has terminal nodes for both `completed` and `refunded` paths | YES (dead-end = stuck funds) |
| 5 | All Forwards reference valid permissionIndex (≥1000) OR `namedOperator` in R4 Permission | YES |
| 6 | `withdraw_guard` only triggers when `Progress.current = completed` | YES (prevents premature payout) |
| 7 | Service `description` includes deliverable scope (for arbitration evidence) | Warning |

### Failure Playbooks (Freelance-Specific)

**P1: Customer never accepts delivery**
- Mitigation: `accept_guard` includes timeout auto-accept forward (threshold met by `namedOperator: ""` after N days).
- Recovery: call `progress.hold: false` on the timeout forward to auto-advance.

**P2: Provider submits wrong deliverable hash**
- Mitigation: `deliver_guard` enforces WIP hash match.
- Recovery: provider re-generates WIP via `wip_file.generate`, re-submits via `progress.hold: false` with corrected hash.

**P3: Dispute opens but no arbiter assigned**
- Mitigation: R4 Permission must include `permissionIndex: 1500` for arbiter role; R8 must bind an existing Arbitration Service.
- Recovery: bind Arbitration via `service.arbitrations.list` MODIFY before publish.

---

## Rental Mode (Phase 1 Priority)

### Industry Traits

```typescript
const rentalTraits: IndustryTraits = {
  has_logistics: true,
  communication_heavy: false,
  pure_digital: false,
  long_cycle: false,
  deposit_required: true,
  multi_tier_allocation: false,
};
```

### Applicable Scenarios

- Photography equipment rental
- Vehicle rental
- Property short-let
- Power tools / luxury goods rental

### Default Permission Indexes

| Role | permissionIndex | Scope |
|------|-----------------|-------|
| Owner | 1000 | Publish / inspect / deduct deposit / refund (user-defined, ≥1000) |
| Arbiter | 1500 | Damage dispute resolution (user-defined, ≥1000) |
| Renter | n/a | Operates via `namedOperator: ""` on Forwards (order owner/agents) — no permissionIndex needed |

> **Note**: Indexes < 1000 are reserved for `BuiltinPermissionIndex` (e.g., 100 = `REPOSITORY_NEW`, 500 = unassigned). Renter actions use `namedOperator: ""` per wowok-machine §Forward Permission Model.

### Default Machine Template

```
reserved → paid_deposit → in_use → returned → inspected → deposit_refunded → completed
                                                    │
                                                    ├→ damage_confirmed → deposit_deducted (terminal)
                                                    └→ arbiter_rule (terminal)
```

| Node | prev_node | threshold | Forwards |
|------|-----------|-----------|----------|
| `reserved` | `""` | 1 | `place_reservation` (weight 1, namedOperator: `""`, renter) |
| `paid_deposit` | `reserved` | 1 | `pay_deposit_and_rent` (weight 1, namedOperator: `""`, renter) |
| `in_use` | `paid_deposit` | 1 | `pickup` (weight 1, permissionIndex 1000, owner) — gated by `deposit_guard` |
| `returned` | `in_use` | 1 | `trigger_return` (weight 1, namedOperator: `""`, renter, guard: `return_guard`) OR timeout auto-return |
| `inspected` | `returned` | 1 | `inspect_item` (weight 1, permissionIndex 1000, owner) — gated by `inspect_guard` |
| `deposit_refunded` | `inspected` | 1 | `approve_return` (weight 1, permissionIndex 1000, owner) — gated by `refund_guard` |
| `completed` | `deposit_refunded` | 1 | `finalize` (weight 1, permissionIndex 1000, owner) |
| `damage_confirmed` | `inspected` | 1 | `claim_damage` (weight 1, permissionIndex 1000, owner) — gated by `damage_guard` |
| `deposit_deducted` | `damage_confirmed` | 1 | `deduct_deposit` (weight 1, permissionIndex 1000, owner) |
| `arbiter_rule` | `inspected` | 1 | `escalate_arbiter` (weight 1, namedOperator: `""` AND permissionIndex 1000, either party) |

> The `arbiter_rule` terminal has no Service-level Allocator — disputes filed via this path are resolved by the bound Arbitration object's compensation fund mechanism (see Audit Checklist #5).

### Default Guard Templates

| Guard Name | Host / Trigger | Validation Logic |
|-----------|----------------|-------------------|
| `deposit_guard` | Machine Forward `pickup` AND Allocator trigger (fires at `in_use`) | Order.balance ≥ deposit amount (deposit frozen in escrow) |
| `return_guard` | Machine Forward `trigger_return` | Renter signature OR rental period timeout |
| `inspect_guard` | Machine Forward `inspect_item` | Owner submission confirming item state (WIP hash of return condition) |
| `refund_guard` | Machine Forward `approve_return` AND Allocator trigger (fires at `deposit_refunded`) | Inspection passed (Progress history shows `inspect_item` accomplished) |
| `damage_guard` | Machine Forward `claim_damage` AND Allocator trigger (fires at `damage_confirmed`) | Owner submission + WIP hash diff (pre-rental vs post-rental) |

### Default Allocator Strategy

```typescript
// Wrapped in AllocatorsSchema: { description, threshold, allocators: [...] }
const rentalAllocators = [
  {
    guard: "deposit_guard",  // Allocator trigger guard (fires at pickup)
    sharing: [
      { who: { Entity: { name_or_address: "<service_name>" } }, sharing: 10000, mode: "Rate" }, // 100% rent to owner immediately
    ],
  },
  {
    guard: "refund_guard",  // Allocator trigger guard (fires on inspection pass)
    sharing: [
      { who: { GuardIdentifier: 0 }, sharing: 10000, mode: "Rate" }, // 100% deposit back to renter (Order)
    ],
  },
  {
    guard: "damage_guard",  // Allocator trigger guard (fires on damage claim)
    sharing: [
      { who: { Entity: { name_or_address: "<service_name>" } }, sharing: 10000, mode: "Rate" }, // 100% deposit to owner as compensation
    ],
  },
];
```

### 10-Round Build Script (Rental)

| Round | Goal | MCP Operation | Mode Default Applied |
|-------|------|---------------|----------------------|
| R1 | Account setup | `account_operation.gen` + `faucet` | — |
| R2 | Industry confirm | (internal trait match) | rental mode loaded |
| R3 | Service definition | `onchain_operations.service` CREATE | name includes item + deposit terms in description |
| R4 | Permission | `onchain_operations.permission` CREATE or REUSE | indexes 1000/1500 (renter uses namedOperator: "") |
| R5 | Machine | `onchain_operations.machine` CREATE | 10-node template above |
| R6 | Progress binding | `onchain_operations.progress` CREATE | mirror all nodes |
| R7 | Guards | `onchain_operations.guard` CREATE × 5 + `gen_passport` test | 5 Guard templates above |
| R8 | Allocation | `onchain_operations.allocation` CREATE × 3 + `service.order_allocators` MODIFY | rent + refund + deduct paths |
| R9 | Test order | `order` CREATE + `progress` advance × 10 + `allocation.alloc_by_guard` × 3 | full flow dry run including damage path |
| R10 | Publish | `machine` publish + `service` publish | pre-publish audit must PASS, deposit path verified |

### Audit Checklist (Rental-Specific)

| # | Check | Blocker? |
|---|-------|----------|
| 1 | `deposit_guard` validates `Order.balance ≥ deposit_amount` | YES (no deposit = renter can run off with item) |
| 2 | `refund_guard` + `deposit_refund_to_renter` Allocator covers 100% refund | YES (no refund path = deposit theft) |
| 3 | `damage_guard` requires WIP hash diff (pre vs post rental) | YES (no evidence = arbitrary deduction) |
| 4 | Machine includes both `deposit_refunded` and `deposit_deducted` terminal paths | YES |
| 5 | Arbitration bound to Service via `arbitrations.list` | Warning (recommended for damage disputes) |
| 6 | Rental period timeout forward exists on `in_use` node | Warning (prevents items never returned) |
| 7 | Deposit amount recorded in Service `description` for evidence | Warning |
| 8 | Pre-rental WIP generated and hash stored for post-rental comparison | YES (without pre-hash, damage cannot be proven) |

### Failure Playbooks (Rental-Specific)

**P1: Renter never returns item**
- Mitigation: `in_use` node has timeout forward to `returned` (auto-return) or directly to `damage_confirmed` (treat as non-return).
- Recovery: after timeout, owner calls `progress.hold: false` on the timeout forward; `damage_guard` validates non-return; `deposit_deduct_to_owner` Allocator fires.

**P2: Owner claims damage but no pre-rental WIP exists**
- Mitigation: R8 audit checklist #8 blocks publish without pre-rental WIP.
- Recovery: impossible post-publish — must create new Service with WIP. Surface this as a hard lesson; prevent with audit.

**P3: Deposit amount insufficient for damage**
- Mitigation: Service `description` records deposit amount; `deposit_guard` validates balance.
- Recovery: Arbitration can rule additional payment via `arbiter_rule` node, but only up to deposited amount. For excess, off-chain recovery.

**P4: Owner refuses to inspect (blocks refund)**
- Mitigation: `returned` node has timeout forward to `inspected` (auto-inspect pass) if owner doesn't act within N days.
- Recovery: renter calls timeout forward, `inspect_guard` auto-passes, `refund_guard` fires, deposit returns to renter.

**P5: Double-spend dispute (both parties claim deposit)**
- Mitigation: Machine topology ensures `inspected` has mutually exclusive forwards (`approve_return` vs `claim_damage`), first-Pair-wins rule.
- Recovery: if contested, `escalate_arbiter` forward routes to Arbitration.

---

## Education Mode (Phase 2 — Outline)

### Industry Traits

```typescript
const educationTraits: IndustryTraits = {
  has_logistics: false,
  communication_heavy: true,
  pure_digital: false,
  long_cycle: true,
  deposit_required: true,  // tuition pre-pay
  multi_tier_allocation: false,
};
```

### Mode Outline

- **Default Machine**: enroll → pay_tuition → session_1 → session_2 → ... → session_N → completed / refunded
- **Default Guards**: `attendance_guard` (per session, student signs), `refund_guard` (institution approval OR arbiter)
- **Default Allocator**: 1/N of tuition released per session attendance; unearned portion refundable on `refund_guard`
- **Key trait**: `setting_locked_time` on Service prevents institution from changing rules mid-semester (regulatory compliance)
- **GTM angle**: targets "tutoring institutions run away with prepaid tuition" pain point; policy-driven adoption

### Phase 2 Build Status

- Machine template: drafted, needs 1 pilot institution test
- Guards: `attendance_guard` needs WIP hash for session content commitment
- Allocator: per-session release needs threshold-based trigger
- Audit checklist: pending real-world pilot

---

## Travel Mode (Phase 2 — Outline)

### Industry Traits

```typescript
const travelTraits: IndustryTraits = {
  has_logistics: false,
  communication_heavy: true,
  pure_digital: false,
  long_cycle: true,
  deposit_required: true,  // deposit + final payment
  multi_tier_allocation: true,  // agency → hotel → guide → driver
};
```

### Mode Outline

- **Default Machine**: order → pay_deposit → pay_final → segment_D1 → segment_D2 → ... → return → completed / refunded
- **Default Guards**: `segment_guard` (per-segment arrival WIP, e.g., hotel check-in), `refund_guard` (agency approval OR arbiter for trip interruption)
- **Default Allocator**: multi-tier — deposit 20% to agency, final 80% to agency, then agency-side Allocation splits to hotel/guide/driver per segment
- **Key trait**: multi-tier Allocation is WoWok's unique advantage over traditional travel platforms
- **GTM angle**: targets "paid in full then service shrinks" pain point

### Phase 2 Build Status

- Machine template: drafted, needs multi-tier Allocation pilot
- Guards: `segment_guard` needs standardized WIP templates per segment type (hotel, transport, activity)
- Allocator: multi-tier waterfall needs guard chaining validation
- Audit checklist: pending real-world pilot

---

## Subscription Mode (Phase 3 — Outline)

### Industry Traits

```typescript
const subscriptionTraits: IndustryTraits = {
  has_logistics: false,
  communication_heavy: false,
  pure_digital: true,
  long_cycle: true,
  deposit_required: false,
  multi_tier_allocation: false,
};
```

### Mode Outline

- **Default Machine**: subscribe → charge_period_1 → deliver_period_1 → charge_period_2 → ... → cancel / expire
- **Default Guards**: `charge_guard` (user confirms each charge — no auto-renew trap), `cancel_guard` (user cancels anytime, takes effect next period), `deliver_guard` (creator WIP hash per period — prevents content abandonment)
- **Default Allocator**: each charge → 100% to creator; unearned periods → refund to subscriber
- **Key trait**: pure digital, native WoWok soil; directly attacks "auto-renew trap" and "platform takes 30%" pain points
- **GTM angle**: independent creators (Indie Hackers, niche SaaS, paid newsletters)

### Phase 3 Build Status

- Machine template: planned
- Guards: `charge_guard` needs periodic trigger mechanism (off-chain scheduler + on-chain Guard)
- Allocator: per-period release straightforward
- Audit checklist: pending design review

---

## Escape Hatch

Any user can switch from a driving mode to `general` (free) mode at any time. This ditches all defaults and exposes raw MCP operations.

### When to Use the Escape Hatch

- User's business doesn't fit any Phase 1-3 mode
- User wants a hybrid not supported by Mode Composition
- Expert user wants full manual control
- Industry-specific edge case (e.g., freelance with deposit requirement that's not rental)

### How to Switch

```
User says: "switch to general mode" or "configure manually"
├── Stop applying mode defaults to remaining rounds
├── Surface the IndustryModeSchema shape as a blank template
├── User provides: Permission indexes, Machine nodes, Guards, Allocators manually
├── wowok-onboard R3-R8 still execute, but with empty defaults
└── wowok-machine / wowok-guard / wowok-provider become primary references
```

### Warning

Switching to general mode mid-onboarding does NOT discard already-created objects. The Service draft, Permission, and Machine created under a previous mode remain on-chain. The user can:
- Continue building on top of them (REUSE pattern)
- Abandon them and start fresh (CREATE new objects)

### Recommitting to a Mode

User can switch back to a driving mode after using general mode:
- wowok-onboard re-loads mode defaults for any unconfigured rounds
- Already-configured objects are kept (REUSE); only missing pieces get mode defaults
- Checkpoint is updated with the new mode

---

## Tier Layering

### Novice Tier — Full Driving Mode

- User selects an industry; mode defaults fill R3-R8 with no manual configuration
- 10-round build completes with user only confirming mode defaults
- Audit checklist enforces all blocker items
- Failure playbook provides step-by-step recovery

### Advanced Tier — Customize Defaults

- User selects a mode but overrides specific fields (e.g., freelance Allocator changed from 100% provider to 80% provider + 20% platform)
- Mode template is the starting point, not the contract
- Audit checklist still runs; user can dismiss warnings with explicit confirmation
- Trigger: user says "I want to customize" or has done this before

### Expert Tier — Free Mode

- User invokes `general` mode (escape hatch)
- No defaults applied; raw MCP operations exposed
- wowok-machine, wowok-guard, wowok-provider become the primary references
- Audit checklist is optional but recommended
- Trigger: user explicitly asks for "expert mode" or invokes MCP operations by name

---

## IndustryModeSchema (Reference)

```typescript
type IndustryModeSchema = {
  name: "freelance" | "rental" | "education" | "travel" | "subscription" | "general";
  display_name: string;
  traits: IndustryTraits;
  defaults: {
    permission_indexes: { role: string; index: number | null; scope: string }[]; // null = uses namedOperator: ""
    machine_template: {
      nodes: { name: string; prev_node: string; threshold: number }[];
      forwards: {
        name: string;
        weight: number;
        permissionIndex?: number;   // user-defined ≥1000; absent if using namedOperator
        namedOperator?: string;     // "" = order owner/agents (customer/renter)
        guard?: string;             // Forward guard name (binds via Machine MODIFY)
      }[];
    };
    guard_templates: {
      name: string;
      host: string;              // Service.buy_guard | Machine Forward <name> | Allocator trigger
      validation_logic: string;
      table_entries: { identifier: number; b_submission: boolean; value_type: string; value?: string; name: string }[];
    }[];
    // Mirrors AllocatorSchema: each allocator has guard + sharing[] (each item has who + sharing + mode)
    allocator_strategy: {
      guard: string;             // Allocator trigger guard name (NOT trigger_guard — matches AllocatorSchema)
      sharing: { who: RecipientType; sharing: number; mode: "Amount" | "Rate" | "Surplus" }[];
      fix?: number;              // optional fixed amount
      max?: number | null;       // optional cap
    }[];
    arbitration_enabled: boolean;
  };
  dialogue_script: { round: string; goal: string; mcp_calls: string[] }[];
  audit_checklist: { id: number; check: string; blocker: boolean }[];
  failure_playbook: { scenario: string; mitigation: string; recovery: string }[];
  escape_hatch: {
    available: true;
    warning: string;
  };
};

type RecipientType =
  | { Entity: { name_or_address: string } }
  | { GuardIdentifier: number }
  | { Signer: "signer" };
```

Every mode definition in this Skill follows this schema. Phase 2/3 modes (education, travel, subscription) will fill in the same schema when promoted to Phase 1 detail level.

---

## Quick Reference

| Want to... | Use this |
|------------|----------|
| Pick a mode for a new user | §Mode Selection Logic |
| Get freelance defaults | §Freelance Mode |
| Get rental defaults | §Rental Mode |
| Combine two modes | §Mode Composition |
| Switch to manual config | §Escape Hatch |
| Validate before publish | Mode-specific §Audit Checklist |
| Recover from a stuck flow | Mode-specific §Failure Playbooks |
