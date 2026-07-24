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

| Content | MCP Knowledge Module | Applied Via |
|---------|---------------------|-------------|
| Guard design rules (structural layers, data source classification, voting_guard table design) | `knowledge/guard-design-patterns.ts` (`GUARD_DESIGN_PATTERNS`) | `project_operation.evaluate_project` (via `assessGuardRisks`) |
| Safety rules (confirmation levels, immutability, object reuse) | `knowledge/safety-rules.ts` (`CONFIRMATION_RULES`) | Pre-publish checks + `project_operation.evaluate_project` |
| Arbitration-specific risks | `knowledge/arb-risk.ts` (`assessArbitrationRisks`) | `project_operation.evaluate_project` |

This Skill keeps the arbitration **conversation flow**, **evidence collection** scripts, and **dispute resolution** guidance — the MCP layer handles the rule evaluation.

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

### Voting Modes

**1. Open Voting** (`voting_guard: []`)
- Arbitrator casts votes directly (weight = 1)
- Best for: Small trusted panels, centralized resolution

**2. Guard-Based Voting** (`voting_guard: [{guard, vote_weight}, ...]`)
- Voters authenticate via Passport + Guard
- Weight determined by `vote_weight` rule:
  - `FixedValue(u32)`: Equal weight for all qualified voters
  - `GuardIdentifier(u8)`: Dynamic weight from credential (e.g., reputation score, token balance)
- Max 50 guards — enables tiered voting (experts + community, token-holders + NFT-holders)

**Voting Flow**: Voter selects a voting guard → System verifies voter's Passport against that guard → Calculates weight based on guard's rule → Applies weight to selected propositions. One vote per voter per case.

> **Guard Design Reference**: Voting guard construction rules (table design, computation trees, `GuardIdentifier` submission-type requirements) now live in the MCP knowledge layer — see `knowledge/guard-design-patterns.ts` (`GUARD_DESIGN_PATTERNS`), auto-applied via `project_operation.evaluate_project`. Test voting logic with `gen_passport` before finalizing.

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

| Pitfall | Consequence | Prevention |
|---------|------------|------------|
| **Paused Arbitration** | All disputes silently rejected | Verify `pause: false` after configuration |
| **Wrong Guard design** | Must create replacement Guard | Test with `gen_passport` before creating |
| **Past deadline** | Vote cannot be finalized | Set future timestamps only |
| **Empty reset feedback** | Customer doesn't know what to fix | Always provide feedback on reset |
| **Early withdrawal** | Funds locked for 30 days if not finished | Wait for Finished state |
| **Unverified evidence** | Ruling based on invalid claims | Always verify WTS first |

---
