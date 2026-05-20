---
name: wowok-arbitrator
description: |
  WoWok Arbitrator — the canonical skill for arbitration service providers
  to create and manage Arbitration objects, configure voting rules and voter
  eligibility, handle the full Arb case lifecycle from dispute through voting
  to resolution, manage arbitration fees, and enable customer compensation.

  Covers the complete Arbitrator journey: building the Arbitration service,
  designing voting mechanisms (open voting and Guard-based weighted voting),
  operating Arb cases through every state transition, handling objections
  and resets, fee accumulation and distribution, and integration with the
  broader WoWok ecosystem.

  For customers filing disputes and managing Arb from the order side, see
  wowok-order. For service providers configuring arbitration integrations
  and compensation funds, see wowok-provider.
when_to_use:
  - User wants to create or configure an Arbitration service on WoWok
  - User wants to handle dispute resolution between customers and merchants
  - User wants to organize voting processes for arbitration cases
  - User wants to design voter eligibility rules and weight mechanisms
  - User wants to manage arbitration fees and revenue distribution
  - User mentions "arbitration", "arbitrator", "dispute", "voting", "arb", "judge", "resolution"
---

# WoWok Arbitrator Guide

Build and operate arbitration services on WoWok as a neutral third-party dispute resolver.

> **Role**: Arbitrator (Dispute Resolution Service Provider)
> **Customer Perspective**: See [wowok-order](../wowok-order/SKILL.md) — Arbitration section for dispute filing, evidence submission, and compensation claiming
> **Service Provider Perspective**: See [wowok-provider](../wowok-provider/SKILL.md) — Arbitration Configuration and Compensation Fund sections
> **Guard Design**: See [wowok-guard](../wowok-guard/SKILL.md) for designing voting_guard and usage_guard validation logic
> **Messenger**: See [wowok-messenger](../wowok-messenger/SKILL.md) for encrypted evidence exchange
> **Tools**: See [wowok-tools](../wowok-tools/SKILL.md)

---

## Core Concepts

### What an Arbitration Service IS

An Arbitration object is a neutral, on-chain third-party service that resolves disputes between customers (order holders) and service providers (merchants). It operates as:

- A **trusted intermediary** — both parties agree to its authority before a dispute arises, by selecting it from the service provider's approved arbitration list
- A **voting-based resolution system** — configurable voter eligibility rules determine who can vote and how much influence they carry
- A **fee-collecting service** — each dispute case generates revenue for the arbitrator
- A **compensation gateway** — the arbitrator's ruling enables customers to claim compensation from the service provider's compensation fund

### The Two-Layer Architecture

The arbitration system separates the permanent service from individual cases:

| Layer | On-Chain Object | Lifecycle | Operator |
|-------|----------------|-----------|----------|
| **Service Layer** | Arbitration | Created once; persists across all cases | Arbitrator |
| **Case Layer** | Arb | Created per dispute; progresses through a state machine | Arbitrator + Customer |

The **Arbitration** object defines the rules: fee amount, voter configuration, access control (usage_guard), and contact information. Each **Arb** object is a single dispute case — created when a customer files against an order — and follows a defined state machine from creation through voting to final resolution.

### Arb State Machine — Full Lifecycle

Every Arb case transitions through a sequence of states. Understanding this state machine is critical because each state restricts which operations are available and who can perform them.

```
   Customer files dispute
          │
          ▼
 ┌────────────────────┐
 │  Arbitrator_       │  ◄── Arb is born here (dispute creates it directly in this state)
 │  confirming (1)    │
 └────────┬───────────┘
          │
          ├──── arbitrator_confirm() ────┐
          │                              ▼
          │                     ┌─────────────────┐
          │                     │  Voting (2)     │  ◄── Voters cast votes on propositions
          │                     └────────┬────────┘
          │                              │
          │                     arbitration() — sets feedback + indemnity
          │                              │
          │                              ▼
          │                     ┌─────────────────┐
          │                     │  Arbitrated (3) │  ◄── Result published; customer decides
          │                     └───┬─────────┬───┘
          │                         │         │
          │                    finish()    objection()
          │                    (via order)     │
          │                         │         ▼
          │                         │  ┌──────────────┐
          │                         │  │ Objectionable │  ◄── Customer contests the result
          │                         │  │ (4)           │
          │                         │  └──────┬────────┘
          │                         │         │
          │                         │    reset() ────────────────┐
          │                         │                             │
          │                         ▼                             ▼
          │                  ┌────────────┐            ┌────────────────────┐
          │                  │ Finished   │            │ Principal_         │  ◄── Back for revision
          │                  │ (5)        │            │ confirming (0)     │
          │                  └─────┬──────┘            └────────┬───────────┘
          │                        │                            │
          │                        │               principal_confirm() — customer re-submits
          │                        │                            │
          │                        │                            └──── back to Arbitrator_confirming
          │                        │
          │                   withdraw() ──────────────────────┐
          │                                                    │
          ▼                                                    ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                        Withdrawn (6)                             │  ◄── Terminal state; Arb fee extracted
 └──────────────────────────────────────────────────────────────────┘
```

**Alternative entry path**: From `Arbitrator_confirming`, the arbitrator can `reset()` directly to `Principal_confirming` if the propositions or description need revision before voting even begins. This creates an optional pre-voting revision cycle.

### State Permissions — Who Can Do What

| State | Available to Arbitrator | Available to Customer (via Order) |
|-------|------------------------|----------------------------------|
| **Principal_confirming (0)** | — | proposition_change, description_change, principal_confirm |
| **Arbitrator_confirming (1)** | arbitrator_confirm, reset, feedback | — |
| **Voting (2)** | vote, voting_deadline_change, arbitration, feedback | — |
| **Arbitrated (3)** | feedback | objection, finish (claim compensation) |
| **Objectionable (4)** | reset, feedback | — |
| **Finished (5)** | withdraw, feedback | — |
| **Withdrawn (6)** | — (terminal) | — (terminal) |

### The Core Principle: Separated Powers

The system deliberately separates the two most consequential powers:

- **Arbitrator controls the verdict**: When voting starts (`arbitrator_confirm`), who votes (via `voting_guard`), and what the final result is (`arbitration` with `indemnity` amount)
- **Customer controls acceptance**: Whether to accept the result or file an `objection`, and when to claim compensation (`finish`)

Neither party can unilaterally force a final outcome. The arbitrator cannot make the customer accept a ruling — the customer always retains the right to object. The customer cannot force a ruling — only the arbitrator can finalize the voting result.

---

## Phase 1: Create the Arbitration Service

Build the Arbitration object that will serve as your dispute resolution platform.

### 1.1 Dependency-First Construction

An Arbitration object depends on a Permission object, just like other WoWok services. The same CREATE vs MODIFY pattern applies:

- **Object shape** (`{ name?, ... }`) = CREATE a new Arbitration
- **String value** (`"<name>"`) = MODIFY an existing Arbitration

You must first have (or create) a Permission. The Arbitration's permission indexes start at 350 and define which roles can perform which operations.

**Operation**: `onchain_operations` with `operation_type: "arbitration"`.

**Schema Reference**: `schema_query({ action: "get", name: "onchain_operations_arbitration" })`

### 1.2 Core Configuration

| Field | Purpose | Notes |
|-------|---------|-------|
| `object` | Arbitration identity | Shape for CREATE, string for MODIFY |
| `description` | Public service description | Stored on-chain; visible to all who query the Arbitration |
| `location` | Physical or digital jurisdiction | Where the arbitration service operates; visible to potential users |
| `fee` | Fee charged per dispute case | Paid by the customer when filing; stored temporarily in the Arb, eventually flows to `arbitration.balance` |
| `pause` | Accept or reject new disputes | Defaults to `true` (paused) on creation — you must explicitly unpause before customers can file |

**Why start paused**: The Arbitration is created in a paused state by default. This gives you time to configure voting rules, set up your Contact for Messenger communication, and ensure everything is ready before accepting real disputes.

### 1.3 Set Up Contact for Encrypted Communication

The `um` field links the Arbitration to a Contact object that carries Messenger addresses. This is the private channel through which customers submit WTS evidence files.

**Steps**:

1. **Create a Contact**: Use `onchain_operations` with `operation_type: "contact"`. Add Messenger addresses to the `ims` array, each with a `name` (identifier) and `at` (Messenger address).

2. **Link to Arbitration**: Set the `um` field on the Arbitration to the Contact's name or address.

**Why this matters**:
- Evidence (WTS files) is sent through Messenger — encrypted and off-chain
- The arbitrator verifies WTS authenticity using `messenger_operation` with `verify_wts`
- All case communication remains private and self-verifiable
- Setting `um` to `null` unlinks the Contact

### 1.4 Configure Usage Guard — Access Control

The `usage_guard` field optionally restricts who can file disputes against this Arbitration. When set, customers must present a valid Passport proving they satisfy the guard before the `dispute` operation succeeds.

**When to use a usage guard**:
- Private arbitration services (invitation-only)
- Industry-specific arbitration requiring credentials or registration
- KYC-verified dispute resolution
- Membership-gated arbitration

**When to leave it empty**:
- Public arbitration open to all users
- Trust established through service providers' approved arbitration lists

**Setting**: Provide a Guard name/address to enable access control, or `null` to remove it. The validation happens during `dispute` — if a usage guard is configured but the customer lacks a valid Passport, the dispute is rejected.

---

## Phase 2: Configure Voting Rules

Voting is the mechanism through which arbitration decisions are made. The system supports two modes: open voting (arbitrator-controlled) and guard-based voting (decentralized, credential-weighted).

### 2.1 Open Voting — No Voting Guards

When the `voting_guard` vector is empty, the Arbitration operates in **open voting mode**. In this mode:

- The arbitrator calls `vote` directly, specifying the Arb and which proposition indices to vote for
- Every vote carries **weight 1** (one person, one vote)
- The `tx_context::sender` (transaction signer) is recorded as the voter

**Operation**: `vote` field with `arb` and `votes` (array of u8 indices). No `voting_guard` parameter is needed.

**Best for**: Centralized arbitration where a single arbitrator or small trusted panel makes decisions directly. The arbitrator acts as the sole voter or coordinates a known group.

### 2.2 Voting Guards — Decentralized Weighted Voting

Voting guards enable decentralized voting by tying each voter's eligibility and influence to a Guard. Each entry in the `voting_guard` vector pairs a Guard with a vote weight rule.

**How it works**:
1. A voter calls `gen_passport` to satisfy a specific voting guard — proving they meet the eligibility criteria
2. The voter's weight is determined by the `VoteValue` rule associated with that guard
3. The voter casts votes on propositions with their calculated weight
4. Different guards can have different weight rules, creating tiered voting power

**Two VoteValue Types**:

| Type | Meaning | Use Case |
|------|---------|----------|
| **FixedValue(u32)** | Every voter satisfying this guard votes with a fixed weight | Equal-weight voting pools; all qualified voters have the same influence |
| **GuardIdentifier(u8)** | The voter's weight is extracted from one of the guard's submission values | Dynamic weighting based on credentials (e.g., reputation score, stake amount, experience level) |

**GuardIdentifier in detail**: When using `GuardIdentifier(index)`, the system looks at the voter's Passport submission for the specified guard. The value at the given identifier index is interpreted as a number and becomes the vote weight. The guard's submission value type at that identifier must be numeric. This enables sophisticated weighting — for example, a "reputation" guard where the voter's reputation score determines their voting power.

### 2.3 Managing Voting Guards

Use the `voting_guard` field with one of four operations:

| Operation | Behavior | When to Use |
|-----------|----------|-------------|
| `add` | Appends new voting guards; existing ones preserved | Adding a new voter pool without disrupting current configuration |
| `set` | Clears all existing voting guards, then adds the new ones | Replacing the entire voter configuration |
| `remove` | Removes specific voting guards by name or address | Deprecating specific voter pools |
| `clear` | Removes all voting guards (returns to open voting mode) | Switching from guarded to open voting |

**Constraints**: Maximum 50 voting guards per Arbitration. Each guard referenced must exist on-chain.

### 2.4 Voting Deadline — Time-Boxing the Process

Each Arb case can have an optional `voting_deadline` — a U64 timestamp in milliseconds.

**Setting the deadline**: During `confirm`, set `voting_deadline` to a future timestamp, or `null` for no deadline.

**How it enforces timing**:
- **During voting**: If a deadline is set, votes submitted after it has passed are **rejected**
- **During finalization**: The `arbitration` operation checks that the deadline (if set) has passed before allowing finalization
- **No deadline (`null`)**: Voting can continue indefinitely; finalization is always allowed

**Adjusting the deadline**: Use `voting_deadline_change` with the Arb name and new deadline value. This is useful for extending voting periods when more deliberation is needed.

---

## Phase 3: Handle Arbitration Cases — The Full Arb Lifecycle

This phase covers every operation an arbitrator performs on an Arb case, from initial review through final fee withdrawal.

### 3.1 Case Arrival — What Happens During Dispute

When a customer files a dispute (see wowok-order for the customer-side workflow), the following occurs on-chain:

1. The Arbitration's `bPaused` flag is checked — if paused, the dispute is rejected
2. If a `usage_guard` is configured, the customer's Passport is verified against it
3. The Arbitration's `fee` is deducted from the customer's payment; any excess is refunded
4. An **Arb object** is created in **Arbitrator_confirming (1)** state
5. The Arb's `fee` holds the dispute fee; its `proposition` vector contains the customer's claims
6. The customer's Order is linked to the Arb via `order::dispute`

The arbitrator does not need to take any action to "receive" the case — the Arb appears on-chain automatically.

### 3.2 Initial Review — Confirm or Reset

The Arb arrives in **Arbitrator_confirming** state. You have two paths:

#### Path A: Proceed to Voting

If the propositions are clear and evidence is sufficient, call `confirm`:

**Operation**: `confirm` with the `arb` name and an optional `voting_deadline`.

This transitions the Arb to **Voting (2)** state, clears any previous voting records, and (optionally) sets the voting deadline.

#### Path B: Request Revision (Reset)

If the propositions are ambiguous, the description needs clarification, or more evidence is required, call `reset`:

**Operation**: `reset` with the `arb` name and `feedback` explaining what needs revision.

This transitions the Arb to **Principal_confirming (0)** state. The customer can then use their order operations (`order.arb_confirm`) to revise propositions, change the description, and re-confirm, which sends the Arb back to **Arbitrator_confirming (1)**. You can then `confirm` to proceed.

**Reset from Arbitrator_confirming is the primary pre-voting revision mechanism.** Use it whenever the case is not ready for voting.

### 3.3 Organizing and Conducting Voting

During the **Voting (2)** state, votes are cast on the Arb's propositions.

#### Voting Mechanics (from arb.move)

- Each proposition in `arb.proposition[]` starts with 0 votes
- A voter selects which proposition indices they agree with (as `votes: vector<u8>`)
- Each agreed proposition receives the voter's weight
- If a voter votes again, their **old votes are removed** and replaced with the new selection — voters can change their minds
- Maximum voters per Arb: **520**

**Important**: The vote operation uses u8 indices (0–255) to reference propositions. Ensure your Arb has at most 20 propositions (enforced by `MAX_PROPOSITION_COUNT`), so indices are always valid.

#### Open Voting Flow

For each voter (or voting round you conduct):

**Operation**: `vote` with `arb`, `votes` (array of u8 indices), and no `voting_guard`.

The transaction signer (`tx_context::sender`) is recorded as the voter.

#### Guard-Based Voting Flow

For decentralized voting where voters authenticate themselves:

**Operation**: `vote` with `arb`, `votes`, and `voting_guard` (name/address of the specific voting guard the voter is satisfying).

The voter must have previously obtained a Passport by calling `gen_passport` for that guard. The guard determines the voter's weight. The system looks up the matching VotingGuard entry in the Arbitration's `voting_guard` vector to compute the weight.

### 3.4 Finalizing the Result — The Arbitration Operation

After voting concludes (deadline passed, or you determine sufficient votes have been cast), finalize the case:

**Operation**: `arbitration` with `arb`, `feedback`, and `indemnity`.

**What this does**:
1. Verifies the voting deadline has passed (if one was set)
2. Records `feedback` as the official arbitration decision — this is the reasoned explanation of the outcome
3. Sets `indemnity` (U64) — the compensation amount the customer is entitled to claim from the service provider's compensation fund
4. Transitions the Arb to **Arbitrated (3)** state
5. Emits an `ArbEvent` notifying all parties

**Setting indemnity**:
- `0` = Customer wins no compensation (provider prevails)
- Positive value = Amount the customer can claim via `order.arb_claim_compensation`

The indemnity amount should reflect your assessment of the case. It can be any U64 value — consider the order's payment amount, the nature of the dispute, and fairness principles.

### 3.5 Handling Customer Objections

After finalization, the customer has two choices:
- **Accept**: Proceed to claim compensation (`finish`)
- **Object**: File an objection and send the case back for revision

#### When the Customer Objects

The customer calls `order.arb_objection`, which transitions the Arb to **Objectionable (4)** and records their objection reason in `arb.objection`.

#### Arbitrator Response to Objection

Your only operation in the **Objectionable** state is `reset`:

**Operation**: `reset` with `arb` and `feedback` explaining your response to the objection.

This returns the Arb to **Principal_confirming (0)**. The customer can revise and re-submit via `order.arb_confirm`, starting a new round. The entire voting process restarts.

**Reset from Objectionable is the objection resolution mechanism.** It is the only way to move forward from an objection — there is no "override" operation. The system forces a collaborative revision cycle.

### 3.6 Case Completion — Finish and Withdraw

#### Finish (Customer-Initiated)

When the customer accepts the result and claims compensation:

The customer calls `order.arb_claim_compensation`, which internally calls `arb::finish`. This:
- Transitions from **Arbitrated (3)** to **Finished (5)**
- Returns the indemnity amount (used by the compensation claim process)
- Records `compensation_time` for withdrawal timing reference
- Emits an `ArbEvent`

The arbitrator does not trigger `finish` — this is exclusively the customer's action via their order.

#### Withdraw (Arbitrator-Initiated)

After a case concludes, extract the Arb's fee back to the Arbitration's balance pool:

**Operation**: `arb_withdraw` with the `arb` name.

**Withdrawal conditions**:
- From **Finished (5)**: Immediate — fee can be withdrawn right away
- From **Arbitrated (3)** or **Objectionable (4)**: **30-day waiting period** (WITHDRAW_DURATION_TIME) from the indemnity timestamp — this protects the customer's right to object or claim compensation
- From other states: Not allowed

The withdrawn fee joins the `arbitration.balance` pool, which you can later transfer to an Allocation or Treasury (see Phase 4).

### 3.7 Providing Feedback at Any Stage

The `feedback` operation is available in nearly all states (except Finished and Withdrawn). Use it to record interim observations, procedural notes, or communication summaries.

**Operation**: `feedback` with `arb` and `feedback` string.

This is distinct from the `arbitration` operation's feedback — `feedback` is an ongoing case note, while `arbitration.feedback` is the official final decision.

---

## Phase 4: Fee Management

### 4.1 Fee Flow Overview

```
Customer pays fee at dispute creation
        │
        ▼
   Arb.fee (locked per case; acts as collateral)
        │
        │ arb_withdraw() — after case concludes
        ▼
   Arbitration.balance (accumulated revenue pool)
        │
        ├──→ fees_transfer { to: allocation }  → Distributed by Allocation rules
        └──→ fees_transfer { to: treasury }    → Stored in Treasury for later withdrawal
```

### 4.2 Setting the Dispute Fee

Configure `fee` on the Arbitration object. This is the amount (in the Arbitration's coin type) charged to customers per dispute case. The fee is:
- Deducted from the customer's payment during `dispute`
- Any excess payment is automatically refunded to the customer
- Stored in the Arb until withdrawal

### 4.3 Transferring Accumulated Fees

Once fees have been withdrawn from Arbs into `arbitration.balance`, transfer them out:

**To an Allocation**: `fees_transfer` with `to: { allocation: "<name>" }`. The Allocation's sharing rules determine how funds are distributed among recipients. Provide `payment_remark` and `payment_index` for the Payment record.

**To a Treasury**: `fees_transfer` with `to: { treasury: "<name>" }`. Funds are stored in the Treasury for controlled withdrawal. Same `payment_remark` and `payment_index` apply.

Both operations create a Payment object. Optionally name it with `newPayment` for easy reference.

### 4.4 Receiving External Transfers

The `owner_receive` operation lets the Arbitration receive coins or objects transferred to it — useful for accepting additional revenue, returned payments, or operational tokens.

---

## Phase 5: Integration with the WoWok Ecosystem

### 5.1 Services Link to Arbitration

Service providers select which Arbitrations their service supports via the `arbitrations` field in their Service object. This is configured through `onchain_operations` with `operation_type: "service"`.

**Why providers list multiple arbitrations**: Different arbitrations may specialize in different dispute types (product quality, delivery, intellectual property). Customers evaluate available arbitrations and select the one they trust most.

**For the arbitrator**: Being listed on reputable services increases case volume and revenue. Your reputation is visible on-chain — customers can query your Arbitration's description, fee, voting rules, and past cases.

### 5.2 Compensation Fund — How Customers Get Paid

The service provider's `compensation_fund` is a dedicated pool that pays out when arbitration rules in the customer's favor.

**The full compensation flow**:
1. Arbitrator sets `indemnity` during `arbitration` finalization
2. Customer calls `order.arb_claim_compensation` — this internally calls `arb::finish` and transfers from `service.compensation_fund` to the customer's Order
3. Customer extracts funds from their Order via `order.receive`

The arbitrator's role is to set a fair `indemnity`. The actual fund transfer is handled between the customer and the service provider's compensation fund.

### 5.3 Relationship with Guards

Arbitration uses two distinct guard integrations:

| Guard Type | Purpose | Where Configured | Effect |
|------------|---------|-----------------|--------|
| `usage_guard` | Controls who can file disputes | Arbitration object | Customer must provide Passport proving they satisfy this guard |
| `voting_guard` | Controls who can vote and their weight | Arbitration object (vector) | Voters must satisfy a specific guard; weight is determined by VoteValue rule |

Both use the Guard system for validation. See [wowok-guard](../wowok-guard/SKILL.md) for designing guard logic, tables, and computational trees.

### 5.4 Messenger Integration for Evidence

The arbitration evidence workflow relies on Messenger:

1. Customer queries Arbitration's `um` (Contact) → extracts `ims[]` Messenger addresses
2. Customer sends WTS evidence files through Messenger (encrypted, off-chain)
3. Arbitrator receives and **verifies** WTS authenticity using `messenger_operation` with `verify_wts`
4. Only verified WTS files should be considered valid evidence

**WTS (Witness Tamper-proof Seal)** files are generated from Messenger conversations and cryptographically prove the communication history without revealing it on-chain. See [wowok-messenger](../wowok-messenger/SKILL.md) for the complete evidence generation and verification workflow.

---

## Quick Reference

### Essential Schemas

| Purpose | Schema Name |
|---------|-------------|
| Arbitration operations (create, configure, case management) | `onchain_operations_arbitration` |
| Order operations (customer-side Arb interactions) | `onchain_operations_order` |
| Guard creation and design | `onchain_operations_guard` |
| Messenger communication and WTS verification | `messenger_operation` |
| Query on-chain objects and state | `query_toolkit` |
| Generate verified credentials (Passport) | `gen_passport` |

**Query any schema**: `schema_query({ action: "get", name: "<schema_name>" })`

### Arb State Transition Table

| From State | To State | Operation | Performed By | Notes |
|------------|----------|-----------|-------------|-------|
| (creation) | Arbitrator_confirming (1) | `dispute` | Customer | Creates Arb; pays fee |
| Arbitrator_confirming (1) | Voting (2) | `confirm` | Arbitrator | Sets voting deadline |
| Arbitrator_confirming (1) | Principal_confirming (0) | `reset` | Arbitrator | Pre-voting revision |
| Principal_confirming (0) | Arbitrator_confirming (1) | `principal_confirm` | Customer (via order) | Customer re-submits |
| Voting (2) | Voting (2) | `vote` | Arbitrator / Voters | State unchanged |
| Voting (2) | Arbitrated (3) | `arbitration` | Arbitrator | Sets feedback + indemnity |
| Arbitrated (3) | Objectionable (4) | `objection` | Customer (via order) | Customer contests |
| Arbitrated (3) | Finished (5) | `finish` (via order) | Customer | Claims compensation |
| Objectionable (4) | Principal_confirming (0) | `reset` | Arbitrator | Back for revision |
| Finished (5) | Withdrawn (6) | `withdraw` | Arbitrator | Immediate fee extraction |
| Arbitrated (3) | Withdrawn (6) | `withdraw` | Arbitrator | After 30-day wait |
| Objectionable (4) | Withdrawn (6) | `withdraw` | Arbitrator | After 30-day wait |

### Common Workflows

**Arbitration Service Setup**:
```
Create Permission → Create Arbitration → Configure fee → Set Contact (um) → 
Configure voting rules → Unpause → Service providers link to you
```

**Typical Case Resolution** (no revision needed):
```
Customer disputes → Review evidence → Confirm (start voting) → Vote → 
Arbitration (finalize) → Customer claims compensation → Withdraw fee
```

**Case Resolution with Revision**:
```
Customer disputes → Reset (request revision) → Customer revises + re-confirms → 
Confirm → Vote → Arbitration → Finished → Withdraw
```

**Case Resolution with Objection**:
```
Customer disputes → Confirm → Vote → Arbitration → Customer objects → 
Reset (address objection) → Customer revises → Confirm → Vote → 
Arbitration → Finished → Withdraw
```

---

## Best Practices

### Building Trust as an Arbitrator

1. **Transparent rules**: Set clear fee structure and publish detailed voting criteria. Customers and providers should understand exactly how disputes are resolved before they file.
2. **Well-reasoned feedback**: Write detailed, logical explanations in the `arbitration.feedback` field. This is your on-chain reputation — future participants will read past rulings.
3. **Fair indemnity amounts**: Set indemnity proportional to the order value and the nature of the dispute. Arbitrary amounts undermine trust.
4. **Consistent standards**: Apply uniform criteria across similar cases. Inconsistency damages credibility.
5. **Professional communication**: Monitor Messenger and respond promptly. Unresponsive arbitrators lose business.

### Voting Design Principles

1. **Match voting mechanism to dispute complexity**: Simple disputes may only need open voting; complex multi-stakeholder cases benefit from guard-based weighted voting.
2. **Set reasonable deadlines**: Too short frustrates voters and risks incomplete deliberation. Too long delays resolution and frustrates both parties.
3. **Use GuardIdentifier weighting thoughtfully**: Dynamic weights from credentials (reputation, stake) create merit-based influence but require careful guard design — ensure the credential is hard to game.
4. **Test voting guards independently**: Use `gen_passport` to verify guard logic before configuring voting guards. A misconfigured guard can block all voting.

### Operational Guidelines

1. **Unpause only when ready**: The Arbitration starts paused. Only unpause after fee, contact, and voting rules are fully configured.
2. **Use reset proactively**: If propositions are unclear, reset immediately rather than proceeding with ambiguous voting. A revision cycle is faster than a flawed arbitration followed by an objection.
3. **Always verify WTS evidence**: Call `messenger_operation` with `verify_wts` before evaluating evidence. Unverified evidence has no probative value.
4. **Withdraw fees promptly**: After cases finish, withdraw fees to reduce exposure to locked funds. For Arbitrated/Objectionable cases, note the 30-day waiting period.
5. **Monitor service compensation fund levels**: If a provider's compensation fund is too low, your indemnity ruling may not be fully payable — warn customers of this risk.
6. **Keep feedback records**: Use the `feedback` operation to document procedural steps, even when not required. This creates an on-chain audit trail.

### Common Pitfalls

1. **Forgetting to unpause**: A paused Arbitration silently rejects all disputes. Customers cannot file cases.
2. **Setting voting deadline in the past**: Votes are rejected and finalization requires the deadline to have passed. Always set future timestamps.
3. **Using reset without feedback**: The `feedback` field in `reset` explains to the customer why revision is needed. Empty feedback causes confusion.
4. **Withdrawing too early**: Attempting `withdraw` from Arbitrated or Objectionable before the 30-day wait fails. Wait for Finished or let the timer expire.
5. **Confusing feedback vs arbitration.feedback**: `feedback` is procedural notes; `arbitration.feedback` is the binding decision. Use the right one.