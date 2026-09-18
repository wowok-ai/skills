---
name: wowok-arbitrator
description: "WoWok Arbitrator — build and operate on-chain arbitration services. Create Arbitration objects, configure voting rules (open or guard-based weighted), manage dispute cases through their full lifecycle, and earn fees from resolution. Core value: achieve trust consensus between merchants and users through transparent, fair, and efficient dispute resolution. Use when: User wants to create/configure an Arbitration service; User needs to handle dispute cases and voting processes; User wants to design voter eligibility and weight mechanisms; User mentions \"arbitration\", \"dispute\", \"voting\", \"arb\", \"judge\"."
metadata:
  version: "2.1.0"
  role: arbitrator
  related: "wowok-order, wowok-messenger"
---

# WoWok Arbitrator Guide

> Build trust through fair dispute resolution — neutral third-party resolution of customer/merchant conflicts, paid per case.
> **Tools**: `onchain_operations` operation_type=`arbitration` (service + most case ops); customer-side case ops live on operation_type=`order`.
> **Related**: [wowok-order](../wowok-order/SKILL.md) · [wowok-provider](../wowok-provider/SKILL.md) · [wowok-messenger](../wowok-messenger/SKILL.md)

---

## What the MCP already handles

- Guard design rules (voting-table design, `FixedValue`/`GuardIdentifier` weight sources, structural checks): `schema_query` action=`get_guard_design_patterns`; safety/confirmation: `get_safety_rules`; applied through `goal_operation` action=`aggregate_risks` and the publish/pre-call gates.
- Move guidance and the arbitration schema (`onchain_operations_arbitration`) carry exact field constraints — read the call output, don't memorize this file.

Keep the conversation flow, the governance questions, and the evidence discipline.

---

## Interaction principles

1. **Review-first**: restate the arbitration design, the build dependency order, and the interaction contract before the first choice.
2. **User-driven**: every governance/business parameter is an explicit user decision; recommend, never auto-advance.
3. **Reuse / customize / discover** for Permission, Guards, Contact.
4. **Default disclosure**: show defaults and consequences before deciding. Default network **testnet** — mainnet is a different trust posture.

---

## Pre-flight: business decisions (gate before any write)

Never invent a fee, a voting structure, or Guard logic — missing → ASK; "make something up" → REFUSE.

1. **Account** (`env.account`, default `""`).
2. **Arbitration name + description/location** — the public brand.
3. **Fee** per case (`fee`, smallest units) — revenue model; customer pays it when filing.
4. **Voting Guards** — open (empty list, permission vote weight 1) or guard-based weighted list (≤50 Guards). Immutable once each Guard is created.
5. **Usage Guard** (`usage_guard` or null) — who is allowed to file; null = anyone.
6. **Contact `um`** — without it evidence exchange breaks.

⛔ All six confirmed before creating. Track pending/confirmed like the provider checklist.

---

## Architecture

Two objects: **Arbitration** (the service: fee, voting/usage Guards, `um`, `bPaused`, `balance`, Permission — permanent) and **Arb** (one per case: state machine, propositions, votes, fee held in escrow, verdict).

Separation of powers: the arbitrator sets process and verdict (`indemnity`); the CUSTOMER confirms filings, objects, and claims compensation. Neither side can finish a case unilaterally.

### Arb state machine (codes are the on-chain names used by `arb_game` too)

| # | State | Who moves, how |
|---|---|---|
| 0 | `Principal_confirming` | Customer via order `arb_confirm` ({arb, confirm, proposition?, description?}) → 1 |
| 1 | `Arbitrator_confirming` | Arbitrator `confirm` → 2 · `reset` (with feedback) → 0 · `feedback` |
| 2 | `Voting` | `vote` · `voting_deadline_change` · `arbitration` (verdict) → 3 · `feedback` |
| 3 | `Arbitrated` | Customer: `arb_objection` → 4 · `arb_claim_compensation` → 5 |
| 4 | `Objectionable` | Arbitrator `reset` → 0 (only exit) · `feedback` |
| 5 | `Finished` | Terminal; fee withdrawable immediately |
| 6 | `Withdrawn` | Terminal |

`feedback` may be written in ANY non-terminal state (0–4) and emits a permanent public `FeedbackEvent`. Flows: standard 1→2→3→5→6; revision loops through 0; objection loops 3→4→0.

---

## Build phase

Create the Arbitration **paused** (`pause: true`), configure, then `pause: false` last. While paused, filing ABORTS with arbitration error `E_PAUSED` (4) — it is an on-chain error, not a silent reject, but the practical damage is the same: no cases can arrive. Verify unpaused before going live.

- `fee`, `description`, `location` are settable by Permission.
- `voting_guard: {op:'add'|'set'|'remove'|'clear', guards:[…]}`. Each entry is `{guard, vote_weight}`: fixed u32 weight, or a u8 Guard-table identifier whose submitted number becomes the voter's weight at vote time (`FixedValue` / `GuardIdentifier`). Open = empty list → plain Permission vote, weight 1. Test every Guard with standalone `gen_passport` before adding — Guards are immutable from creation; a flawed voting Guard can only be replaced (the list itself stays mutable while configured pre-service / as allowed).
- `usage_guard`: a Guard address or null; when set, filing MUST pass it via Passport (`dispute_with_passport`), else plain `dispute` aborts `E_NEED_PASSPORT` (6).
- `um`: a Contact; evidence flows through its Messenger addresses.
- **Permission isolation (mainnet trust)**: the Arbitration's Permission MUST differ from every Service it's bound to — binding a shared one aborts `E_ARBITRATION_PERMISSION_CONFLICT` (33, enforced at Service bind). Separately, the buyer-side risk model scores same-Permission as **−6 points (critical)** and overlapping owner/admin as **−4 points (warning)** inside its 20-point trust dimension — even distinct objects with the same controllers fail the intent. Use a genuinely independent third-party Permission.

---

## Handling a case

1. **Arrival**: customer files via `arbitration` `dispute: {order, description?, proposition[], fee:{balance}, namedArb?}` (≤20 propositions; fee locked in the Arb; excess fee is refunded). Arb appears at state 1.
2. **Review (1)**: `confirm: {arb, voting_deadline}` — proceed, or `reset` with feedback when the filing is insufficient (don't escalate thin cases).
   - `voting_deadline` is ms: **0 (default) = already-passed → direct verdict, voting impossible**; **null = open-ended**; a future timestamp = voting window (recommend ≥24h; ~3 days is a convention, NOT a chain limit).
3. **Voting (2)**: `vote: {arb, votes:[indices…], voting_guard?}` — 0-based proposition indices; re-voting REPLACES the prior vote; ≤520 voters. With a deadline set, `arbitration` cannot run until it has passed (`E_VOTING_DEADLINE_NOT_PASSED`).
4. **Verdict (2→3)**: `arbitration: {arb, feedback, indemnity}` — irreversible for the arbitrator; only customer objection/claim follows. **Indemnity is capped at 3× the order amount** (`MAX_INDEMNITY_MULTIPLE`, abort 9) and is paid from the SERVICE's `compensation_fund`, never from arbitrator funds.
5. **Customer branch (3)**: claim → 5, or object with `arb_objection` → 4 → your `reset` sends it to 0 for revision.
6. **Fee withdrawal**: `arb_withdraw: {arb}` — immediate at Finished; from Arbitrated/Objectionable only after 30 days past indemnity time (`WITHDRAW_DURATION_TIME`, abort 8). Then move the balance onward with `fees_transfer: {to:{allocation|{treasury}}, payment_remark, payment_index}`.

**Move advice**: `evaluation_operation` action=`arb_game` with `status` (one of the 7 state names) and `perspective: customer|merchant|arbitrator` returns ranked moves/payoffs/risk — read-only; the role decides.

---

## Evidence & reputation

- Customer reads the Arbitration's `um`, sends WTS evidence off-chain via encrypted Messenger; arbitrator runs `messenger_operation` `verify_wts` before considering anything — unverified evidence is not evidence.
- Tell initiators to pre-sort with `evaluation_operation` action=`evidence_review` (list mode): usable/manual/rejected partition + `proof_candidates` for the dispute description; the human selects — nothing auto-attaches.
- On-chain `feedback` is permanent and public: reasoned, professional, consistent. Use Messenger for anything private.

## Hard constraints (quick reference)

- Propositions ≤20 · voters ≤520 · voting Guards ≤50 · indemnity ≤3× order amount.
- Paused ⇒ filing aborts (4); verdict needs deadline passed when one is set (7); non-finished withdrawal waits 30d (8).
- Guards immutable from creation — `gen_passport` first. Verdict irreversible for the arbitrator. Feedback permanent/public.
