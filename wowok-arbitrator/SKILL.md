---
name: wowok-arbitrator
description: |
  WoWok Arbitrator — build and operate on-chain arbitration services.
  Create Arbitration objects, configure voting rules (open or guard-based weighted),
  manage dispute cases through their full lifecycle, and earn fees from resolution.

  Core value: achieve trust consensus between merchants and users through
  transparent, fair, and efficient dispute resolution.
when_to_use:
  - User wants to create/configure an Arbitration service
  - User needs to handle dispute cases and voting processes
  - User wants to design voter eligibility and weight mechanisms
  - User mentions "arbitration", "dispute", "voting", "arb", "judge"
---

# WoWok Arbitrator Guide

Build trust through fair dispute resolution. Arbitration services enable neutral third parties to resolve conflicts between customers and merchants, earning fees while establishing on-chain reputation.

> **Related Skills**: [wowok-order](../wowok-order/SKILL.md) (customer disputes), [wowok-provider](../wowok-provider/SKILL.md) (service arbitration config), [wowok-machine](../wowok-machine/SKILL.md) (workflow analysis), [wowok-messenger](../wowok-messenger/SKILL.md) (evidence exchange)

---

## MCP Knowledge Layer

The following content has been pushed down to the MCP knowledge layer and is applied automatically — this Skill no longer duplicates it:

| Content | Access via (MCP action) | Applied Via |
|---------|--------------------------|-------------|
| Guard design rules (structural layers, data source classification, voting_guard table design) | `schema_query` action='get_guard_design_patterns' | `project_operation.evaluate_project` |
| Safety rules (confirmation levels, immutability, object reuse) | `schema_query` action='get_safety_rules' | Pre-publish checks + `project_operation.evaluate_project` |
| Arbitration-specific risks | auto-applied | `project_operation.evaluate_project` |

This Skill keeps the arbitration **conversation flow**, **evidence collection** scripts, and **dispute resolution** guidance — the MCP layer handles the rule evaluation.

---

## Core Interaction Principles

These four principles govern every arbitration build/handle step. They mirror the wowok-onboard model and are non-negotiable.

1. **Review-first**: State (a) what the AI understood about the arbitration, (b) the dependency order to build, and (c) the interaction contract — before the first choice.
2. **User-driven**: Every step is an explicit user decision; the AI provides a `recommend` but never auto-advances.
3. **Reuse / Customize / Discover (三选一)**: For every component (Permission, Voting/Usage Guards, Contact), surface all three avenues — reuse an existing object, customize a new one, or discover from other projects / the system.
4. **Default-config disclosure**: Disclose a new object's default config + important info + caveats BEFORE the user decides. No silent defaults.

---

## ⚠️ PRE-FLIGHT: Required Items Checklist

**THIS SECTION IS MANDATORY.** Before ANY arbitration service creation, the AI MUST collect explicit user confirmation for EVERY required item. **Do NOT skip, do NOT fabricate, do NOT proceed with missing items.**

### The Golden Rule

```
NEVER guess the user's fee model, voting structure, or Guard design.
These are BUSINESS and GOVERNANCE decisions that ONLY the user can make.

User hasn't provided it → ASK.
User provides incomplete info → ASK for clarification.
User says "just make something up" → REFUSE and explain why each item matters.
```

### Required Items

| # | Item | User Must Provide | Why Not Fabricate |
|---|------|-------------------|--------------------|
| **R1** | **Account** | Which account to operate from. Default `""` is fine. | Safe default exists |
| **R2** | **Arbitration Name** | Service name. What kind of arbitration? | Your brand and reputation on-chain |
| **R3** | **Fee** | How much per case? (e.g. "10 WOW per dispute") | IS your revenue model — you cannot guess pricing |
| **R4** | **Voting Guard(s)** | Who votes and with what weight? Open voting (centralized) or Guard-based (decentralized)? | ⛔ Guards are **immutable after creation** — wrong design = create replacement Guard |
| **R5** | **Usage Guard** | Who can file disputes? Public or restricted? | Controls your case volume and quality |
| **R6** | **Contact (um)** | Messenger Contact name/ID for evidence exchange | Without this, customers cannot submit evidence — service is broken |

### Information Collection Protocol

Present checklist R1-R6 to user. Each item: "Reuse or create new? Provide details." Track status: [pending] / [confirmed: reuse <id>] / [confirmed: create]. ⛔ GATE: ALL R1-R6 must be [confirmed] before any on-chain action — NOT confirmed → STOP. Ask. Do NOT suggest creating arbitration.

All subsequent on-chain operations use R1 (Account) as `env.account`.

### Anti-Fabrication Rules (HARD Constraints)

| Never... | Because... |
|----------|------------|
| Invent a fee amount | You don't know their pricing strategy |
| Assume usage_guard logic | You don't know their target audience |
| Skip the checklist | Arbitration design decisions are on-chain and visible |

---

## Core Architecture

### Two-Layer Design

| Layer | Object | Purpose | Lifecycle |
|-------|--------|---------|-----------|
| **Service** | Arbitration | Rules, fees, voter configuration | Permanent |
| **Case** | Arb | Individual dispute with state machine | Per dispute |

**Separation of Powers**:
- **Arbitrator controls**: Who can vote, voting weights, final verdict (`indemnity`)
- **Customer controls**: Accept result or object, claim compensation timing

Neither party can force outcome unilaterally — the design forces collaboration toward consensus.

### Arb State Machine

Customer dispute creates Arb directly at (1). State (0) entered only via `reset`.

| State | Available Operations | Next State |
|-------|---------------------|------------|
| **(0) Revision Pending** | Customer (via Order): `arb_confirm` | → (1) |
| **(1) Arbitrator_confirming** | Arbitrator: `confirm` → (2), `reset` → (0), feedback | → (2) or (0) |
| **(2) Voting** | Arbitrator: vote, set deadline, `arbitration` → (3), feedback | → (3) |
| **(3) Arbitrated** | Customer (via Order): `arb_objection` → (4), `arb_claim_compensation` → (5) | → (4) or (5) |
| **(4) Objectionable** | Arbitrator: `reset` → (0), feedback | → (0) |
| **(5) Finished** | Arbitrator: `withdraw` → (6) | → (6) |
| **(6) Withdrawn** | Terminal | — |

**Key Flows**:
- **Standard**: (1) → confirm → (2) → arbitration → (3) → arb_claim_compensation → (5) → withdraw → (6)
- **With Revision**: (1) → reset → (0) → arb_confirm → (1) → confirm → (2) → ...
- **With Objection**: ... → (3) → arb_objection → (4) → reset → (0) → ...

---

## Phase 1: Build Your Service

### Essential Configuration

| Field | Purpose | Key Decision |
|-------|---------|--------------|
| `fee` | Revenue per case | Balance accessibility with sustainability |
| `voting_guard` | Who votes, with what weight | Open (centralized) vs Guard-based (decentralized) |
| `usage_guard` | Who can file disputes | Public vs invitation-only |
| `um` | Contact for evidence exchange | Messenger addresses for WTS verification |

**⚠️ Start paused** (`pause: true`). **Forgetting to unpause = all disputes silently rejected with no error.** Complete all configuration — fee, guards, um — before unpausing.

**⚠️ Guard Immutability**: Once a Guard is created, its rules **cannot be modified**. If your `voting_guard` design is wrong, you must create a replacement Guard and reconfigure the Arbitration — wasteful but not fatal. Test with `gen_passport` before finalizing.

**⚠️ Permission Isolation from Service** (CRITICAL for mainnet trust): The Arbitration's Permission object MUST be separate from the Service's Permission object. Sharing the same Permission — or having overlapping owner/admin addresses — breaks dispute fairness because the merchant can control arbitration operations (vote, confirm, execute rulings). For mainnet deployment, use a completely independent third-party Permission with a different owner and admin list. The evaluation engine deducts risk scores significantly for Permission overlap (-30 for same Permission, -20 for owner/admin overlap). Testnet may tolerate shared Permission for simplicity, but mainnet users should treat this as a critical trust factor.

### Voting Modes

**Open** (`voting_guard: []`): arbitrator casts votes directly (weight = 1). **Guard-based** (`voting_guard: [{guard, vote_weight}, ...]`): voters authenticate via Passport + Guard; weight from `FixedValue(u32)` or `GuardIdentifier(u8)`; max 50 guards (tiered voting). Voting guard construction rules (table design, computation trees, `GuardIdentifier` requirements) are served by MCP `schema_query` action='get_guard_design_patterns'. Test with `gen_passport` before finalizing.

---

## Phase 2: Handle Cases

### Case Lifecycle

| # | Step | State | Action |
|---|------|-------|--------|
| 1 | **Arrival** | (1) | Arb created via customer `dispute`. Fee locked, propositions recorded. |
| 2 | **Review** ⚠️ | (1) | `confirm` (proceed) or `reset` (send back). **Insufficient → MUST reset.** |
| 3 | **Voting** | (2) | Vote, set `voting_deadline` (≤ 3 days). Max 520 voters. |
| 4 | **Finalize** ⛔ | (2)→(3) | `arbitration`: sets `feedback` + `indemnity`. **Irreversible** by arbitrator. |
| 5 | **Resolution** | (3) | Customer: `arb_claim_compensation` → (5), or `arb_objection` → (4). |
| 6 | **Objection** | (4) | Only `reset` → (0) for revision. |
| 7 | **Withdraw** | (5)/(3)/(4) | Finished: **immediate**. Others: ⛔ **30-day mandatory wait**. |

**Reset feedback channels**:

| Channel | Use | Visibility |
|---------|-----|------------|
| **Messenger** (preferred) | Specific evidence, privacy-sensitive | Encrypted, off-chain |
| **on-chain feedback** | General clarification, procedural | Public, permanent |

**Best-move advice** (`evaluation_operation` → `arb_game`): pass `status` (7-state) + `perspective` (`customer`/`merchant`/`arbitrator`) to get ranked moves (optimal + payoff + risk). Read the result; the role decides and acts.

---

## Phase 3: Business Model

### Revenue Flow

Customer pays fee → locked in `Arb.fee` per case → `arb_withdraw()` transfers to `Arbitration.balance` → distributed via Allocation (revenue sharing) or Treasury (controlled withdrawal).

### Compensation System

Arbitrator sets `indemnity` → Customer claims via `order.arb_claim_compensation` → Funds transfer from `service.compensation_fund` to Order.

> **Note**: The compensation payout comes from the **provider's** compensation_fund, not the arbitrator's funds. Customers should assess the provider's fund balance before purchase — this is covered in [wowok-order](../wowok-order/SKILL.md) Phase 1.1.

---

## Integration

### Evidence (Messenger)

1. Customer queries Arbitration's `um` → gets Messenger addresses
2. Customer sends WTS evidence files (encrypted, off-chain)
3. Arbitrator verifies WTS authenticity (`verify_wts`)
4. Only verified evidence considered valid

**⚠️ `um` must be configured before unpausing** — without it customers cannot submit evidence.

### Service Provider

Providers list approved Arbitrations in their Service. Customers choose from this list when disputes arise.

---

## Design Principles

- **Fairness**: Separated powers (neither side can force outcome), revision cycles (`reset`), customer objection rights, transparent on-chain rules, 30-day withdrawal protection.
- **Efficiency**: Clear state machine, weighted voting to reduce spam, deadline enforcement, fee incentive for timely resolution.
- **Trust**: ⚠️ Feedback is permanently public — be reasoned and professional. Apply consistent standards. Monitor Messenger, verify WTS promptly.

---

## Quick Reference

### Critical Constraints

- Max 20 propositions per case
- Max 520 voters per case
- Max 50 voting guards per Arbitration
- ⛔ 30-day withdrawal wait for non-finished cases (mandatory, cannot bypass)
- ⛔ Guard is **immutable after creation** — test before finalizing
- ⛔ `arbitration` verdict is **irreversible** by arbitrator — only customer can object
- ⛔ `feedback` is **permanently public on-chain** — use Messenger for privacy-sensitive communication

---

## Best Practices

1. **Configure before unpause**: Fee, contact, voting rules ready first. ⚠️ Unpause is the last step.
2. **Reset proactively**: Unclear case? Send back immediately with clear feedback (Messenger preferred for privacy).
3. **Verify all evidence**: Use `verify_wts` before evaluating — unverified evidence is not evidence.
4. **Write detailed feedback**: Your on-chain reputation is permanent. Be professional, reasoned, and fair.
5. **Set fair indemnity**: Proportional to order value and dispute nature.
6. **Test guards first**: Use `gen_passport` to verify voting_guard logic before deployment.
7. **Set reasonable deadlines**: Suggest ≤ 3 days for voting — balances efficiency with thoroughness.

### Common Pitfalls

Served by `wowok_buildin_info` action='common mistakes' + MCP `schema_query` action='get_safety_rules'. Key ones: paused Arbitration rejects disputes silently (verify `pause: false`); wrong Guard design is immutable (test with `gen_passport` first); non-finished withdrawal has a 30-day lock; always `verify_wts` before ruling.

---
