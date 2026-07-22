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

### On-Chain Capacity Limits (Inline Reference)

Mode defaults respect these on-chain constants. When a mode's suggested count exceeds a limit, the SDK will reject the operation.

| Constant | Value | Scope |
|----------|-------|-------|
| `MAX_NODE_COUNT_SDK` | 100 | Max nodes per Machine (SDK limit; on-chain allows 200) |
| `MAX_FORWARD_COUNT` | 20 | Max global forwards per Machine |
| `MAX_FORWARD_ORDER_COUNT` | 20 | Max forwards per node pair |
| `MAX_NODE_PAIR_COUNT` | 40 | Max pairs per node |
| `USER_DEFINED_PERM_INDEX_START` | 1000 | Custom permission_index start (0-999 reserved for built-in) |
| `MAX_PERM_FOR_ENTITY` | 1000 | Max permissions per Entity |
| `MAX_ADMIN_COUNT` | 500 | Max admins per Permission object |
| `MAX_AGENT_COUNT` | 10 | Max agents per Order |
| `MAX_DISPUTE_COUNT` | 10 | Max concurrent disputes per Order |
| `MAX_SHARING_COUNT` | 100 | Max sharing entries per allocator |
| `MAX_VOTING_GUARD_COUNT` | 50 | Max voting guards per Arbitration |
| `MAX_POLICY_COUNT` | 50 | Max policies per Repository |
| `MAX_ID_COUNT_ONCE` | 100 | Max IDs per Repository operation |
| `MAX_REWARD_COUNT` | 20 | Max rewards per Demand/Repository |
| `MAX_CONTEXT_REPOSITORY_COUNT` | 30 | Max context repositories per Progress |
| `MAX_NAMED_OPERATOR_COUNT` | 60 | Max named operators per Forward |
| `MAX_NAMED_OPERATOR_ADDRESS_COUNT` | 80 | Max addresses per named operator |

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

Industry traits used for mode selection: `has_logistics` (physical goods to ship?), `communication_heavy` (lots of back-and-forth before delivery?), `pure_digital` (deliverable is a file/digital artifact?), `long_cycle` (multi-week or multi-month engagement?), `deposit_required` (collect refundable deposit?), `multi_tier_allocation` (pay multiple parties per segment?).

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

> **Mode defaults** (traits, machine_shape, guards, allocator, key_risk, build_notes) are provided by MCP `project_operation` action `analyze_intent` — pass `industry` parameter and the MCP auto-fills scenario defaults from `knowledge/scenario-modes.ts`. The AI does NOT need to look up per-industry presets manually.

### Quick Reference (mode summaries)

| Mode | Machine Shape | Guards | Allocators | Key Risk |
|------|---------------|--------|------------|----------|
| `freelance` | 7 nodes (ordered→...→completed/refunded) | 5 (buy/deliver/accept/withdraw/refund) | 2 (100% provider / 100% refund) | Customer never accepts delivery |
| `rental` | 10 nodes (reserved→...→deposit_refunded/deducted) | 5 (deposit/return/inspect/refund/damage) | 3 (rent / refund / deduct) | Owner claims damage without pre-rental WIP |

### Freelance Audit Checklist (pre-publish BLOCKERS)

- `accept_guard` exists + `gen_passport` tested — BLOCKER (no acceptance = funds stuck)
- `refund_guard` + 100% refund Allocator — BLOCKER (no refund = dispute deadlock)
- Machine has terminal nodes for both `completed` and `refunded` — BLOCKER (dead-end = stuck funds)
- `withdraw_guard` only triggers at `Progress.current=completed` — BLOCKER (prevents premature payout)
- `deliver_guard` validates WIP hash — recommended

### Freelance Failure Playbooks

- Customer never accepts: `accept_guard` includes timeout auto-accept forward (threshold met by `namedOperator:""` after N days)
- Wrong deliverable hash: `deliver_guard` enforces WIP match → re-generate WIP, re-submit via `progress.hold:false`
- No arbiter assigned: Permission must include `permissionIndex:1500`, bind Arbitration via `service.arbitrations.list` before publish

### Rental Audit Checklist (pre-publish BLOCKERS)

- `deposit_guard` validates `Order.balance ≥ deposit_amount` — BLOCKER (renter runs off with item)
- `refund_guard` + 100% refund Allocator — BLOCKER (no refund = deposit theft)
- `damage_guard` requires pre+post WIP hash diff — BLOCKER (no evidence = arbitrary deduction)
- Machine has both `deposit_refunded` and `deposit_deducted` terminals — BLOCKER
- Pre-rental WIP generated + hash stored — BLOCKER (can't prove damage without pre-hash)
- Rental period timeout forward on `in_use` node — recommended

### Rental Failure Playbooks

- Renter never returns: timeout forward to `damage_confirmed`, `deposit_deduct` Allocator fires
- No pre-rental WIP: impossible post-publish — audit checklist blocks this at publish time
- Owner refuses inspect: timeout forward auto-passes `inspect_guard`, `refund_guard` fires, deposit returns
- Double-spend dispute: Machine topology ensures mutually exclusive forwards (first-Pair-wins), `escalate_arbiter` routes to Arbitration

---

## Education Mode (Phase 2 — Outline)

**Traits**: communication_heavy, long_cycle, deposit_required (tuition pre-pay), not pure_digital.

### Mode Outline

- **Default Machine**: enroll → pay_tuition → session_1 → session_2 → ... → session_N → completed / refunded
- **Default Guards**: `attendance_guard` (per session, student signs), `refund_guard` (institution approval OR arbiter)
- **Default Allocator**: 1/N of tuition released per session attendance; unearned portion refundable on `refund_guard`
- **Key trait**: `setting_locked_time` on Service prevents institution from changing rules mid-semester (regulatory compliance)
- **GTM angle**: targets "tutoring institutions run away with prepaid tuition" pain point; policy-driven adoption

---

## Travel Mode (Phase 2 — Outline)

**Traits**: communication_heavy, long_cycle, deposit_required (deposit + final payment), multi_tier_allocation (agency → hotel → guide → driver).

### Mode Outline

- **Default Machine**: order → pay_deposit → pay_final → segment_D1 → segment_D2 → ... → return → completed / refunded
- **Default Guards**: `segment_guard` (per-segment arrival WIP, e.g., hotel check-in), `refund_guard` (agency approval OR arbiter for trip interruption)
- **Default Allocator**: multi-tier — deposit 20% to agency, final 80% to agency, then agency-side Allocation splits to hotel/guide/driver per segment
- **Key trait**: multi-tier Allocation is WoWok's unique advantage over traditional travel platforms
- **GTM angle**: targets "paid in full then service shrinks" pain point

---

## Subscription Mode (Phase 3 — Outline)

**Traits**: pure_digital, long_cycle, not deposit_required, not communication_heavy.

### Mode Outline

- **Default Machine**: subscribe → charge_period_1 → deliver_period_1 → charge_period_2 → ... → cancel / expire
- **Default Guards**: `charge_guard` (user confirms each charge — no auto-renew trap), `cancel_guard` (user cancels anytime, takes effect next period), `deliver_guard` (creator WIP hash per period — prevents content abandonment)
- **Default Allocator**: each charge → 100% to creator; unearned periods → refund to subscriber
- **Key trait**: pure digital, native WoWok soil; directly attacks "auto-renew trap" and "platform takes 30%" pain points
- **GTM angle**: independent creators (Indie Hackers, niche SaaS, paid newsletters)

---

## Escape Hatch

Any user can switch from a driving mode to `general` (free) mode at any time. This ditches all defaults and exposes raw MCP operations.

### When to Use the Escape Hatch

- User's business doesn't fit any Phase 1-3 mode
- User wants a hybrid not supported by Mode Composition
- Expert user wants full manual control
- Industry-specific edge case (e.g., freelance with deposit requirement that's not rental)

### How to Switch

When user says "switch to general mode" or "configure manually": stop applying mode defaults to remaining rounds, surface the `IndustryModeSchema` shape as a blank template, let user provide Permission indexes/Machine nodes/Guards/Allocators manually. wowok-onboard R3-R8 still execute with empty defaults; wowok-machine / wowok-guard / wowok-provider become primary references.

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

- **Novice**: Full driving mode — mode defaults fill all rounds, user only confirms
- **Advanced**: Customize defaults — user overrides specific fields (e.g., Allocator split), audit checklist still runs
- **Expert**: General mode — no defaults, raw MCP operations, wowok-machine/guard/provider become primary references
