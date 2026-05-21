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

> **Related Skills**: [wowok-order](../wowok-order/SKILL.md) (customer disputes), [wowok-provider](../wowok-provider/SKILL.md) (service arbitration config), [wowok-guard](../wowok-guard/SKILL.md) (voting_guard design), [wowok-messenger](../wowok-messenger/SKILL.md) (evidence exchange)

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

| State | Available Operations | Next State |
|-------|---------------------|------------|
| **(0) Principal_confirming** | Customer (via Order): `arb_confirm` | → (1) |
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

**Start paused** (`pause: true`). Configure everything before accepting disputes.

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

---

## Phase 2: Handle Cases

### Case Lifecycle

**1. Arrival** (`dispute` by customer)
- Arb created in state (1)
- Fee locked in `arb.fee`
- Customer's propositions recorded

**2. Review** — Two paths:

| Path | Condition | Action | Result |
|------|-----------|--------|--------|
| **Proceed** | Propositions clear, evidence sufficient | `confirm` + `voting_deadline` | → Voting (2) |
| **Revise** | Ambiguous claims, insufficient evidence | `reset` + feedback | → Principal_confirming (0) |

**Best Practice**: Use `reset` proactively. A revision cycle is faster than a flawed arbitration followed by objection.

**3. Voting** (state 2)
- Votes accumulate on propositions
- Voters can change votes (old votes replaced)
- Max 520 voters per case

**4. Finalization** (`arbitration` operation)
- Sets `feedback` (reasoned decision)
- Sets `indemnity` (compensation amount, 0 = provider wins)
- Requires deadline passed (if set)
- → Arbitrated (3)

**5. Resolution** — Customer chooses (via Order operations):

| Choice | Action | Result |
|--------|--------|--------|
| **Accept** | `arb_claim_compensation` | → Finished (5), fee withdrawable |
| **Object** | `arb_objection` | → Objectionable (4) |

**6. Objection Handling**
- Only action: `reset` → back to (0) for revision
- Forces collaborative resolution — no override mechanism

**7. Fee Withdrawal**
- From Finished: Immediate
- From Arbitrated/Objectionable: 30-day wait (protects customer rights)

---

## Phase 3: Business Model

### Revenue Flow

```
Customer pays fee
      │
      ▼
  Arb.fee (locked per case)
      │
      │ arb_withdraw()
      ▼
  Arbitration.balance
      │
      ├──→ Allocation (revenue sharing)
      └──→ Treasury (controlled withdrawal)
```

### Compensation System

Arbitrator sets `indemnity` → Customer claims via `order.arb_claim_compensation` → Funds transfer from `service.compensation_fund` to Order.

**Key Principle**: Arbitrator decides amount, provider's fund pays it. This aligns incentives — providers have reason to avoid disputes, arbitrators have reason to be fair.

> See [wowok-order](../wowok-order/SKILL.md) for customer-side arbitration operations.

---

## Integration Patterns

### Evidence Workflow (Messenger)

1. Customer queries Arbitration's `um` → gets Messenger addresses
2. Customer sends WTS evidence files (encrypted, off-chain)
3. Arbitrator verifies WTS authenticity (`messenger_operation` with `verify_wts`)
4. Only verified evidence considered valid

**Why WTS**: Cryptographically proves communication history without on-chain exposure.

### Guard Relationships

| Guard | Purpose | Effect |
|-------|---------|--------|
| `usage_guard` | Access control | Must satisfy to file dispute |
| `voting_guard` | Authentication + weight | Must satisfy to vote; weight from rule |

**Design Principle**: `usage_guard` = yes/no gate; `voting_guard` = credential-verified weighted participation.

### Service Provider Integration

Providers list approved Arbitrations in their Service. Customers choose from this list when disputes arise.

**Trust Flywheel**: Fair arbitrators get listed by more providers → more cases → more revenue → stronger reputation → more provider listings.

---

## Design Principles

### Fairness Mechanisms

1. **Separated Powers**: Arbitrator cannot force acceptance; customer cannot force ruling
2. **Revision Cycles**: `reset` enables correction without penalty
3. **Objection Rights**: Customer always retains right to contest
4. **Transparent Rules**: All voting logic on-chain, verifiable
5. **Timed Withdrawal**: 30-day wait protects customer claim rights

### Efficiency Mechanisms

1. **State Machine**: Clear progression, no ambiguity about next steps
2. **Weighted Voting**: Credential-based influence reduces voter spam
3. **Deadline Enforcement**: Optional time-boxing prevents indefinite delays
4. **Fee Incentive**: Arbitrator earns per case, motivated to resolve

### Trust Building

1. **On-Chain Reputation**: Past rulings (`feedback`) are public and permanent
2. **Consistent Standards**: Apply uniform criteria across similar cases
3. **Reasoned Decisions**: Detailed `arbitration.feedback` explains logic
4. **Professional Response**: Monitor Messenger, verify WTS promptly

---

## Quick Reference

### Essential Operations

| Operation | State | Purpose |
|-----------|-------|---------|
| `confirm` | (1)→(2) | Start voting, set deadline |
| `reset` | (1)→(0), (4)→(0) | Request revision |
| `vote` | (2) | Cast weighted votes |
| `arbitration` | (2)→(3) | Finalize with indemnity |
| `arb_withdraw` | (5), (3), (4) | Extract fee to balance |

### Common Workflows

**Standard Resolution**:
```
Dispute → Review → Confirm → Vote → Finalize → arb_claim_compensation → Withdraw
```

**With Revision**:
```
Dispute → Reset → arb_confirm → Confirm → Vote → Finalize → arb_claim_compensation → Withdraw
```

**With Objection**:
```
Dispute → Confirm → Vote → Finalize → arb_objection → Reset → arb_confirm → Confirm → Vote → Finalize → arb_claim_compensation → Withdraw
```

### Critical Constraints

- Max 20 propositions per case
- Max 520 voters per case
- Max 50 voting guards per Arbitration
- 30-day withdrawal wait for non-finished cases

### Schema Access

```javascript
schema_query({ action: "get", name: "onchain_operations_arbitration" })
schema_query({ action: "get", name: "onchain_operations_order" })
schema_query({ action: "get", name: "messenger_operation" })
```

---

## Best Practices

1. **Configure before unpause**: Fee, contact, voting rules ready first
2. **Reset proactively**: Unclear case? Send back immediately
3. **Verify all evidence**: Use `verify_wts` before evaluating
4. **Write detailed feedback**: Your on-chain reputation
5. **Set fair indemnity**: Proportional to order value and dispute nature
6. **Test guards first**: Use `gen_passport` to verify voting_guard logic
7. **Monitor compensation funds**: Warn if provider fund insufficient for indemnity

### Common Pitfalls

- **Paused Arbitration**: Silently rejects disputes — remember to unpause
- **Past deadline**: Set future timestamps only
- **Empty reset feedback**: Explain why revision needed
- **Early withdrawal**: Wait for Finished state or 30-day timer
- **Unverified evidence**: Always verify WTS before using
