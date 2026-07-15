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

## Phase 1 Mode Details (Freelance & Rental)

> The full detail for Phase 1 priority modes (Freelance & Rental) — including industry traits, Machine templates, Guard templates, Allocator strategies, 10-round build scripts, audit checklists, and failure playbooks — has been extracted to [MODE-DETAILS.md](./MODE-DETAILS.md) for on-demand loading.
>
> **Load MODE-DETAILS.md when:**
> - User selects `freelance` or `rental` mode
> - wowok-onboard R3-R8 needs Machine/Guard/Allocator defaults
> - User asks "what does the freelance/rental mode include?"
> - Pre-publish audit needs mode-specific checklist

### Quick Reference (mode summaries)

| Mode | Machine Shape | Guards | Allocators | Key Risk |
|------|---------------|--------|------------|----------|
| `freelance` | 7 nodes (ordered→...→completed/refunded) | 5 (buy/deliver/accept/withdraw/refund) | 2 (100% provider / 100% refund) | Customer never accepts delivery |
| `rental` | 10 nodes (reserved→...→deposit_refunded/deducted) | 5 (deposit/return/inspect/refund/damage) | 3 (rent / refund / deduct) | Owner claims damage without pre-rental WIP |

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

## Appendices (Progressive Disclosure)

> The following sections have been extracted to [APPENDIX.md](./APPENDIX.md) for on-demand loading:
> - Tier Layering — expertise-tier based guidance
> - IndustryModeSchema — schema reference
> - Quick Reference — lookup table
>
> Load APPENDIX.md when the user needs tier-specific guidance, schema reference, or quick lookup.
