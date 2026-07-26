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

> **Mode defaults** (traits, machine_shape, guards, allocator, key_risk, build_notes) are provided by MCP `project_operation` action `create_project` — pass `project_industry` parameter and the MCP auto-fills scenario defaults from `knowledge/scenario-modes.ts`. The AI does NOT need to look up per-industry presets manually.

### Quick Reference (mode summaries)

| Mode | Machine Shape | Guards | Allocators | Key Risk |
|------|---------------|--------|------------|----------|
| `freelance` | 7 nodes (ordered→...→completed→{wonder\|no_wonder}) | 5 (buy/deliver/accept/withdraw/rating_window) | 2 (100% provider at completed / 0 at wonder-no_wonder) | Customer never accepts delivery |
| `rental` | 10 nodes (reserved→...→completed→{wonder\|no_wonder}) | 5 (deposit/return/inspect/damage/rating_window) | 3 (rent at completed / refund-to-order via Allocator / damage deduct) | Owner claims damage without pre-rental WIP |

> **Freelance entry-node forward (CRITICAL)**: the entry node (`prev_node: ""`, typically "Ordered") MUST have ≥1 forward (e.g. `{next_node:"Ordered", namedOperator:"", weight:1}`). Without it, Progress is permanently stuck at `current=""`. The 5-Guard default covers buy/deliver/accept/withdraw/rating_window; `penalty_guard` is OPTIONAL (add only if penalty deduction is needed — most freelance flows omit it).

> **Dispute Independence**: `refunded`/`disputed`/`arb` MUST NOT appear as Machine nodes (R-M1-11 critical). Refunds flow through Allocator (100%→OrderHolder) or Arbitration (dispute → ruling → arb_withdraw), both off-Machine. Wonder/no_wonder are post-completion reputation terminals only.

### Freelance Audit Checklist (pre-publish BLOCKERS)

- `accept_guard` exists + `gen_passport` tested — BLOCKER (no acceptance = funds stuck)
- 100% refund Allocator (sharing.who=OrderHolder) — BLOCKER (no refund path = dispute deadlock)
- Machine MUST NOT contain `refunded`/`disputed`/`arb` nodes (R-M1-11 critical) — BLOCKER. Refund flows through Allocator or Arbitration, both off-Machine
- `withdraw_guard` only triggers at `Progress.current=completed` — BLOCKER (prevents premature payout)
- `deliver_guard` validates WIP hash — recommended
- Optional: wonder/no_wonder terminals after `completed` for post-purchase rating (enables Reward wonder_praise template)

### Freelance Failure Playbooks

- Customer never accepts: `accept_guard` includes timeout auto-accept forward (threshold met by `namedOperator:""` after N days)
- Wrong deliverable hash: `deliver_guard` enforces WIP match → re-generate WIP, re-submit via `progress.hold:false`
- No arbiter assigned: bind Arbitration via `service.arbitrations` AND configure `Arbitration.voting_guard` (NOT Permission index 1500 — arbiters live in voting_guard, never in Permission)

### Rental Audit Checklist (pre-publish BLOCKERS)

- `deposit_guard` validates `Order.balance ≥ deposit_amount` — BLOCKER (renter runs off with item)
- 100% refund Allocator (sharing.who=OrderHolder) — BLOCKER (no refund = deposit theft)
- `damage_guard` requires pre+post WIP hash diff — BLOCKER (no evidence = arbitrary deduction)
- Machine MUST NOT contain `deposit_refunded`/`deposit_deducted`/`refunded` nodes (R-M1-11 critical) — BLOCKER. Deposit refund/deduction flows through Allocator, not Machine terminals
- Pre-rental WIP generated + hash stored — BLOCKER (can't prove damage without pre-hash)
- Rental period timeout forward on `in_use` node — recommended

### Rental Failure Playbooks

- Renter never returns: timeout forward to `damage_confirmed`, `damage_deduct` Allocator fires (deduct deposit to host)
- No pre-rental WIP: impossible post-publish — audit checklist blocks this at publish time
- Owner refuses inspect: timeout forward auto-passes `inspect_guard`, `refund_guard` fires on `return_approved`, deposit returns to customer
- Double-spend dispute: Machine topology ensures mutually exclusive forwards (first-Pair-wins), `escalate_arbiter` routes to Arbitration

### Rental Mode Template (R-M1-11 Compliant)

> **P3-03 fix**: The original Turo deployment used `deposit_refunded`/`deposit_deducted` as Machine nodes, which violates R-M1-11. This template replaces them with R-M1-11-compliant node names (`return_approved` / `damage_confirmed`). Deposit refund/deduction flows through Allocator triggered by these nodes, NOT through "refund terminal" nodes.

#### Corrected 10-Node Machine Topology

```
reserved → paid_deposit → in_use → returned → inspected ─┬─→ return_approved → completed
                                                            ├─→ damage_confirmed → completed
                                                            └─→ arbiter_rule → completed

completed → wonder | no_wonder (rating terminals, optional)
```

**Node inventory (10 nodes)**:

| # | Node | Operator | Business meaning | Entry forward |
|---|------|----------|------------------|---------------|
| 1 | `reserved` | system | Renter selected item, pending payment | Order creation (auto) |
| 2 | `paid_deposit` | customer | Paid rent + deposit | `pay_deposit_and_rent` (Customer, `namedOperator:""`) |
| 3 | `in_use` | host | Item handed over, renter using | `pickup` (Host, `permissionIndex:1000`) |
| 4 | `returned` | customer | Renter returned item | `trigger_return` (Customer, `namedOperator:""`) |
| 5 | `inspected` | host | Host inspected condition | `inspect_item` (Host, `permissionIndex:1000`) |
| 6 | `return_approved` | host | No damage — refund deposit | `approve_return` (Host, `permissionIndex:1000`) — **path 1** |
| 7 | `damage_confirmed` | host | Damage confirmed — deduct deposit | `claim_damage` (Host, `permissionIndex:1000`) — **path 2** |
| 8 | `arbiter_rule` | system | Escalated to arbitration | `escalate_arbiter` (Customer, `namedOperator:""`) — **path 3** |
| 9 | `completed` | host | Trip finalized | `finalize` (Host, `permissionIndex:1000`) |
| 10 | `wonder` / `no_wonder` | customer | Rating terminal (one of two) | `rate_good` / `rate_bad` (Customer, `namedOperator:""`) |

**R-M1-11 compliance**: NO `deposit_refunded`, `deposit_deducted`, or `refunded` nodes. Deposit refund/deduction flows through Allocator triggered by `return_approved` / `damage_confirmed` nodes. `arbiter_rule` is allowed (it routes to Arbitration, not a refund terminal).

#### 3 Mutually Exclusive Forwards from `inspected`

| Forward | Next node | Operator | Trigger condition | Allocator fired |
|---------|-----------|----------|-------------------|----------------|
| `approve_return` | `return_approved` | Host (perm 1000) | No damage WIP diff | Allocator 1 (refund to customer) |
| `claim_damage` | `damage_confirmed` | Host (perm 1000) | Damage WIP diff > 0 | Allocator 2 (deduct to host) |
| `escalate_arbiter` | `arbiter_rule` | Customer (`namedOperator:""`) | Dispute | Arbitration (off-Machine) |

Move contract guarantees first-Forward-wins: Progress can only advance from `inspected` to ONE of the three next nodes.

#### 3 Allocator Templates (Amount mode recommended)

> **Why Amount mode**: Rate mode requires sum == 10000 (hard constraint). Amount mode is clearer for fixed rent/deposit amounts. See [Allocation Mode Documentation](../../wiki/market/行业/租赁-Turo/06-Allocation模式说明-待审核.md) for details.

**Allocator 0 — Rent payment (triggers on `completed`)**:
```json
{
  "guard": "rent_completed_guard",
  "sharing": [
    { "who": { "Entity": { "name_or_address": "<host>" } }, "sharing": "750000000", "mode": "Amount" }
  ]
}
```
- Fires when `progress.current == "completed"` (via `rent_completed_guard`)
- Pays 0.75 WOW rent to host

**Allocator 1 — Deposit refund (triggers on `return_approved`)**:
```json
{
  "guard": "refund_guard",
  "sharing": [
    { "who": { "GuardIdentifier": 0 }, "sharing": "250000000", "mode": "Amount" }
  ]
}
```
- Fires when `progress.current == "return_approved"` (via `refund_guard`)
- Refunds 0.25 WOW deposit to customer (Order owner, via `GuardIdentifier:0`)

**Allocator 2 — Damage deduction (triggers on `damage_confirmed`)**:
```json
{
  "guard": "damage_guard",
  "sharing": [
    { "who": { "Entity": { "name_or_address": "<host>" } }, "sharing": "250000000", "mode": "Amount" }
  ]
}
```
- Fires when `progress.current == "damage_confirmed"` (via `damage_guard`)
- Deducts 0.25 WOW deposit to host

#### 5 Guard Templates

| Guard | Type | Trigger condition | Purpose |
|-------|------|-------------------|---------|
| `deposit_guard` | Permission | `progress.current == "paid_deposit"` + signer is Customer | Verify customer paid rent + deposit |
| `return_guard` | Permission | `progress.current == "returned"` + signer is Host | Verify item returned |
| `inspect_guard` | Permission | `progress.current == "inspected"` + signer is Host | Verify inspection done |
| `damage_guard` | WIP | Pre + post WIP hash diff > 0 | Verify damage evidence |
| `rating_window_guard` | Permission | `progress.current == "completed"` + within N days | Rating window timer |

#### Permission Index Design

| Role | Permission Index | Operations |
|------|------------------|------------|
| Host | 1000 | pickup / inspect / approve_return / claim_damage / finalize |
| Arbiter | 1500 | arbitration ruling (via `voting_guard`, NOT Permission index) |
| Customer | (no index) | pay_deposit / trigger_return / escalate_arbiter (via `namedOperator:""`) |

**Customer authorization**: uses `namedOperator: ""` (empty string = OrderHolder). Set automatically by `service::buy` when Order is created. No Permission index needed.

#### Migration Guide (from R-M1-11 violating deployment)

If you have an existing rental Machine with `deposit_refunded`/`deposit_deducted` nodes:

1. **Clone the Machine** (nodes are immutable after publish)
2. **Rename nodes**: `deposit_refunded` → `return_approved`; `deposit_deducted` → (remove, merge into `damage_confirmed`)
3. **Rebind Allocators**: Allocator 1 trigger node `deposit_refunded` → `return_approved`; Allocator 2 trigger node `deposit_deducted` → `damage_confirmed`
4. **Publish new Machine** and rebind to Service (requires Service to be in draft state; if already published, use `service.machine_rebind` with setting_lock_duration wait)

---

## Education Mode (Phase 2 — Outline)

**Traits**: communication_heavy, long_cycle, deposit_required (tuition pre-pay), not pure_digital.

### Mode Outline

- **Default Machine**: enroll → pay_tuition → session_1 → session_2 → ... → session_N → completed → {wonder | no_wonder}
- **Default Guards**: `attendance_guard` (per session, student signs), `refund_guard` (institution approval OR arbiter)
- **Default Allocator**: 1/N of tuition released per session attendance; unearned portion refundable on `refund_guard`
- **Key trait**: `setting_locked_time` on Service prevents institution from changing rules mid-semester (regulatory compliance)
- **GTM angle**: targets "tutoring institutions run away with prepaid tuition" pain point; policy-driven adoption

---

## Travel Mode (Phase 2 — Outline)

**Traits**: communication_heavy, long_cycle, deposit_required (deposit + final payment), multi_tier_allocation (agency → hotel → guide → driver).

### Mode Outline

- **Default Machine**: order → pay_deposit → pay_final → segment_D1 → segment_D2 → ... → return → completed → {wonder | no_wonder}
- **Default Guards**: `segment_guard` (per-segment arrival WIP, e.g., hotel check-in), `refund_guard` (agency approval OR arbiter for trip interruption)
- **Default Allocator**: multi-tier — deposit 20% to agency, final 80% to agency, then agency-side Allocation splits to hotel/guide/driver per segment
- **Key trait**: multi-tier Allocation is WoWok's unique advantage over traditional travel platforms
- **GTM angle**: targets "paid in full then service shrinks" pain point

### Travel Mode Preset (Reference)

> Concise preset for quick deployment. For full template, see Phase 2 expansion.

**10-Node Machine Workflow**:
```
inquiry → booking → payment → confirmation → preparation → departure → in-progress → completion → review → refund
```
- `refund` is a routing node (Allocator-triggered), NOT a refund terminal — R-M1-11 compliant
- Rating terminals (`wonder` / `no_wonder`) optional after `review`

**4 Guards**:

| Guard | Type | Trigger | Purpose |
|-------|------|---------|---------|
| `buy_guard` | Permission | Order creation | Validate customer eligibility + segment WIP |
| `withdraw_guard` | Permission | `progress.current == "completion"` | Verify trip completed before host payout |
| `refund_guard` | Permission | `progress.current == "refund"` | Verify trip interruption / agency approval |
| `dispute_guard` | Permission | Arb escalation | Route to Arbitration (off-Machine) |

**2 Allocators** (Rate mode, sum = 10000 each):

| Allocator | Trigger Node | sharing[0] | sharing[1] |
|-----------|--------------|------------|------------|
| Withdraw | `completion` | Agency 80% (Entity) | Hotel/Guide/Driver 20% (Entity) |
| Refund | `refund` | Customer 100% (GuardIdentifier:0 = Order owner) | — |

**Required flags**: `require_compensation_fund = true` (protects customer prepayment if agency defaults)

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
