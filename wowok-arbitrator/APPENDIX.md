# Appendix — wowok-arbitrator

> This file is loaded on-demand (Progressive Disclosure).
> Main skill: [SKILL.md](./SKILL.md)

---

## Dialogue Scripts (R1-R10)

A guided 10-round dialogue for the arbitrator journey — from service conception to daily case operations. Each round has a specific AI Goal, Key Questions, Tool Calls, Success Criteria, Fallback, and Checkpoint. Checkpoints persist via `local_info_operation` so the journey can resume after interruption.

> **Note**: The R1-R10 below is distinct from the PRE-FLIGHT checklist (R1-R6) in §PRE-FLIGHT above. The PRE-FLIGHT items are the *required inputs*; the R1-R10 dialogue is the *end-to-end journey* that consumes those inputs.

### R1 — Intent Capture & Arbitrator Role Establishment

**AI Goal**: Understand why the user wants to become an arbitrator, what domain they specialize in, and what kind of disputes they intend to resolve. Establish the arbitrator identity before any configuration.

**Key Questions**:
- What is your arbitration domain (e-commerce, freelance work, rentals, general)?
- Are you an individual arbitrator or representing a panel/organization?
- What is your reputation or credentials in this domain?
- Do you have a WoWok account set up? If not, hand off to [wowok-onboard](../wowok-onboard/SKILL.md).

**Tool Calls**:
1. `account_operation` → `get` to confirm the active account exists.
2. `account_operation` → `messenger` to verify a messenger name is set (required for `um` contact).
3. `query_toolkit` → `onchain_objects` to check if the user already owns any Arbitration services.
4. `local_info_operation` → create a session checkpoint `{ round: R1, domain, role, existing_arbitrations: [...] }`.

**Success Criteria**: User's arbitration domain and role confirmed. Account and Messenger verified. Existing Arbitration services (if any) identified for reuse consideration.

**Fallback**: User has no account → hand off to [wowok-onboard](../wowok-onboard/SKILL.md). User has no Messenger name → guide through `account_operation` → `messenger`. User already has an Arbitration service → ask whether to reuse or create a new one (different domain or voting structure).

**Checkpoint**: Persist `{ round: R1, domain, role, account, messenger_name, existing_arbitrations }`. Mark R1 COMPLETE.

### R2 — PRE-FLIGHT Checklist Collection

**AI Goal**: Collect all six required items (R1-R6 from §PRE-FLIGHT) with explicit user confirmation. Enforce the Golden Rule: never guess, never fabricate, never proceed with missing items.

**Key Questions**:
- Account: which account? Default `""` is fine.
- Arbitration Name: what is the service name?
- Fee: how much per case? (e.g., "10 WOW per dispute")
- Voting Guard(s): open voting (centralized) or Guard-based (decentralized)? If Guard-based, who votes and with what weight?
- Usage Guard: who can file disputes? Public or restricted?
- Contact (um): Messenger Contact name/ID for evidence exchange.

**Tool Calls**:
1. Present the PRE-FLIGHT checklist (R1-R6) to the user.
2. For each item: ask "Reuse or create new? Provide details."
3. Track status: `[pending]` / `[confirmed: reuse <id>]` / `[confirmed: create]`.
4. For reuse items: `query_toolkit` → `onchain_objects` to verify the object exists and is owned by the account.
5. `local_info_operation` → persist checklist status after each confirmation.

**Success Criteria**: ALL R1-R6 items are `[confirmed]`. The GATE is passed. If any item is `[pending]`, STOP — do not suggest creating the Arbitration.

**Fallback**: User says "just make something up" → REFUSE and explain why each item matters (fee = revenue model, voting_guard = governance, usage_guard = case quality, um = evidence channel). User provides incomplete info → ask for clarification. User wants to defer a decision → persist partial state and resume later.

**Checkpoint**: Persist `{ round: R2, checklist: { R1_account, R2_name, R3_fee, R4_voting_guard, R5_usage_guard, R6_um }, gate_passed: true }`. Mark R2 COMPLETE.

### R3 — Voting Guard Design (CRITICAL — Immutable)

**AI Goal**: Design the voting_guard(s) — the most critical and irreversible decision in Arbitration creation. Guards are immutable after creation; wrong design requires creating a replacement Guard. This round must be thorough.

**Key Questions**:
- Open voting (you cast votes directly, weight=1) or Guard-based (voters authenticate via Passport)?
- If Guard-based: how many voting guards? (max 50)
- For each guard: `FixedValue(u32)` (equal weight) or `GuardIdentifier(u8)` (dynamic weight from credential)?
- If `GuardIdentifier`: which table index holds the weight value? It must be `b_submission: true` and numeric (U8–U256).
- What credentials should voters hold? (reputation, token balance, NFT, partner org membership)

**Tool Calls**:
1. `wowok_buildin_info` → `info: "guard instructions"` for instruction reference.
2. `wowok_buildin_info` → `info: "value types"` for type annotation reference.
3. `guard2file` → export any existing Guard the user wants to reuse as a template.
4. For new Guards: design the table, computation tree, and submission requirements per [wowok-guard](../wowok-guard/SKILL.md).
5. `local_info_operation` → persist the voting_guard design (table schemas, weight rules, voter criteria).

**Success Criteria**: User has explicitly chosen open vs Guard-based. If Guard-based: each Guard's table, weight rule, and voter criteria are documented. The `GuardIdentifier` index (if used) is confirmed as `b_submission: true` and numeric. User understands immutability — this design cannot be changed after creation.

**Fallback**: User is unsure between open and Guard-based → present the trade-offs: open = centralized, simpler, faster; Guard-based = decentralized, transparent, scales to more voters. User wants to modify an existing Guard → impossible (immutable); must create a new one. User's `GuardIdentifier` index is not numeric or not `b_submission: true` → flag the error, redesign.

**Checkpoint**: Persist `{ round: R3, voting_mode, guards: [{id_or_design, weight_rule, voter_criteria}], immutability_acknowledged: true }`. Mark R3 COMPLETE.

### R4 — Usage Guard & Contact Configuration

**AI Goal**: Configure the usage_guard (who can file disputes) and the Contact (`um`) for evidence exchange. These control case volume and the evidence channel.

**Key Questions**:
- Usage Guard: public (anyone can file) or restricted (specific criteria)?
- If restricted: what criteria? (token holding, reputation, invitation, partner org)
- Contact: reuse an existing Contact or create new? What Messenger addresses should be in `ims[]`?
- Have you tested that your Messenger address can receive WTS files?

**Tool Calls**:
1. For usage_guard reuse: `query_toolkit` → `onchain_objects` to verify the Guard exists.
2. For usage_guard create: design per [wowok-guard](../wowok-guard/SKILL.md) — typically simpler than voting_guard.
3. For Contact reuse: `query_toolkit` → `onchain_objects` for the Contact ID. Verify `ims[]` is non-empty.
4. For Contact create: `schema_query` → `onchain_operations` to confirm the `contact` operation shape.
5. `local_info_operation` → persist usage_guard and Contact configuration.

**Success Criteria**: Usage_guard configured (public or restricted with documented criteria). Contact configured with at least one active Messenger address in `ims[]`. User has verified they can receive messages at that address.

**Fallback**: User wants public usage_guard but is worried about spam → suggest a minimal Guard (e.g., small fee or basic reputation threshold). Contact `ims[]` empty → 🔴 cannot unpause without evidence channel. User's Messenger address is wrong → guide through `account_operation` → `messenger` to fix.

**Checkpoint**: Persist `{ round: R4, usage_guard: {mode, criteria}, contact: {id, ims: [...]} }`. Mark R4 COMPLETE.

### R5 — CREATE Arbitration Service

**AI Goal**: Execute the Arbitration creation transaction with all R2-R4 inputs. Start paused (`pause: true`) — unpause happens at R7 after testing.

**Key Questions**:
- Ready to create the Arbitration service with the confirmed configuration?
- Confirm: name, fee, voting_guard, usage_guard, um, pause=true.
- This is an on-chain write operation. Do you want to proceed? (per [wowok-safety](../wowok-safety/SKILL.md))

**Tool Calls**:
1. `schema_query` → `onchain_operations_arbitration` to confirm the `create` operation shape.
2. Assemble the operation with all R2-R4 inputs. Set `pause: true`.
3. First call without `submission` — SDK returns a prompt confirming the operation.
4. Re-call with `submission` after user confirmation per [wowok-safety](../wowok-safety/SKILL.md).
5. `query_toolkit` → `onchain_objects` for the new Arbitration ID. Verify all fields.
6. `local_info_operation` → persist the Arbitration ID and configuration snapshot.

**Success Criteria**: Arbitration created on-chain. ID captured. All fields verified (fee, voting_guard, usage_guard, um, pause=true). Two-phase submission loop completed.

**Fallback**: Creation fails → check for name collision (`replaceExistName` flag), insufficient gas, or invalid Guard references. Voting_guard references a non-existent Guard → create the Guard first, then retry. `um` Contact not found → verify the ID, recreate if needed.

**Checkpoint**: Persist `{ round: R5, arbitration_id, config_snapshot, pause: true }`. Mark R5 COMPLETE.

### R6 — Test Guards with gen_passport

**AI Goal**: Validate all Guard designs (voting_guard and usage_guard) before unpausing. Use `gen_passport` to simulate voter and complainant authentication. Catch design errors while the service is still paused.

**Key Questions**:
- Ready to test your voting_guard? I will simulate a voter obtaining a passport.
- For each voting_guard: can a valid voter obtain a passport? Does the weight calculation work?
- For usage_guard: can a valid complainant obtain a passport? Does an invalid complainant get rejected?

**Tool Calls**:
1. `onchain_operations` → `gen_passport` for each voting_guard with test voter data.
2. Verify the passport is issued and the weight (if `GuardIdentifier`) is calculated correctly.
3. `onchain_operations` → `gen_passport` for the usage_guard with test complainant data.
4. Verify valid complainants pass and invalid complainants fail.
5. `guard2file` → export each Guard to review the logic if any test fails.
6. `local_info_operation` → persist test results.

**Success Criteria**: All voting_guard tests pass — valid voters obtain passports with correct weights. Usage_guard tests pass — valid complainants pass, invalid ones fail. No design errors detected.

**Fallback**: `gen_passport` fails for a valid voter → the Guard logic is wrong. Since Guards are immutable, must create a replacement Guard and reconfigure the Arbitration. Weight calculation is wrong → check the `GuardIdentifier` index: is it `b_submission: true`? Is it numeric? Is the value being cast to u32 correctly? Usage_guard is too restrictive → create a replacement with looser criteria.

**Checkpoint**: Persist `{ round: R6, guard_tests: [{guard_id, valid_voter_pass, weight_correct, invalid_voter_rejected}], all_passed: true }`. Mark R6 COMPLETE.

### R7 — Unpause & Go Live

**AI Goal**: Unpause the Arbitration service. This is the point of no return — disputes can now be filed. Confirm all configuration is complete and tested.

**Key Questions**:
- Final check: fee set? voting_guard tested? usage_guard tested? Contact configured?
- Ready to unpause? After this, disputes can be filed immediately.
- Do you want to notify any Service providers that your Arbitration is live?

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` for the Arbitration. Verify: `fee`, `voting_guard`, `usage_guard`, `um`, `pause: true`.
2. `onchain_operations` → `arbitration.modify` to set `pause: false`.
3. `query_toolkit` → `onchain_objects` to confirm `pause: false`.
4. `messenger_operation` → `send_message` to notify partner Service providers (optional).
5. `local_info_operation` → persist the go-live timestamp and notification list.

**Success Criteria**: Arbitration is unpaused (`pause: false`). Service providers notified (if applicable). User understands disputes can now be filed.

**Fallback**: Unpause fails → check if all required fields are set (fee, um). If `um` is null → 🔴 cannot unpause (no evidence channel). User wants to re-pause later → possible via `arbitration.modify` with `pause: true`, but filed disputes are already in the pipeline.

**Checkpoint**: Persist `{ round: R7, unpaused: true, go_live_timestamp, notifications_sent: [...] }`. Mark R7 COMPLETE.

### R8 — First Case — Review & Confirm

**AI Goal**: Handle the first dispute case. Arrive at state (1) Arbitrator_confirming. Review evidence, decide whether to `confirm` (proceed to voting) or `reset` (send back for revision).

**Key Questions**:
- A case has been filed. Here are the propositions and evidence. Do you understand the dispute?
- Is the evidence sufficient to proceed, or does the customer need to provide more?
- If insufficient: what feedback should I send with the `reset`?

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` for the Arb case. Capture propositions, fee, state.
2. `onchain_events` → `type: "ArbEvent"`, filter for this Arb ID — check case history.
3. `messenger_operation` → `watch_messages` or `watch_conversations` for WTS evidence files from the customer.
4. `messenger_operation` → `verify_wts` on all received evidence files. Only verified evidence is valid.
5. Decision: `confirm` (proceed) or `reset` (send back with feedback).
6. `onchain_operations` → `arb.confirm` or `arb.reset` with feedback.
7. `local_info_operation` → persist case review notes and decision.

**Success Criteria**: Evidence reviewed and verified. Decision made: confirm (case proceeds to voting) or reset (case sent back with clear feedback). If reset, feedback is specific and actionable.

**Fallback**: Evidence is unverified → do not evaluate until `verify_wts` passes. Evidence is insufficient → MUST reset with specific feedback (what's missing, what to clarify). Reset feedback is empty → 🔴 customer doesn't know what to fix; always provide feedback. Evidence is encrypted but no WTS file → ask customer to generate and send via Messenger.

**Checkpoint**: Persist `{ round: R8, case_id, propositions, evidence_verified: bool, decision: confirm|reset, feedback }`. Mark R8 COMPLETE.

### R9 — Voting & Finalization

**AI Goal**: Conduct the voting phase and finalize the verdict. Set voting deadline, cast votes (open mode) or monitor voter participation (Guard-based mode), execute `arbitration` to set `feedback` + `indemnity`. This is irreversible.

**Key Questions**:
- What is the voting deadline? (≤ 3 days recommended)
- For open voting: how do you vote on each proposition?
- For Guard-based voting: are voters participating? Do you need to extend the deadline?
- What is the `indemnity` (compensation amount)? Proportional to order value and dispute nature?
- What is the `feedback` (public, permanent on-chain rationale)?

**Tool Calls**:
1. `onchain_operations` → `arb.vote` on each proposition (open mode) or monitor voter participation (Guard-based mode).
2. Set `voting_deadline` — future timestamp, ≤ 3 days recommended.
3. `onchain_events` → `type: "ArbEvent"` to monitor vote submissions.
4. After voting concludes: `onchain_operations` → `arbitration` to finalize. Sets `feedback` + `indemnity`. **IRREVERSIBLE**.
5. `local_info_operation` → persist the verdict, indemnity, and feedback.

**Success Criteria**: Voting conducted. Deadline enforced. Verdict finalized via `arbitration` operation. `feedback` is professional, reasoned, and fair (permanently public). `indemnity` is proportional to the dispute.

**Fallback**: Past voting deadline → vote cannot be finalized. Must set a new future deadline. Voter participation is low → extend deadline or accept the votes cast. `arbitration` fails → check that voting_deadline has passed and at least one vote was cast. User wants to revise the verdict after `arbitration` → impossible (irreversible by arbitrator); only customer can object.

**Checkpoint**: Persist `{ round: R9, case_id, votes: {...}, deadline, verdict: {feedback, indemnity}, irreversible: true }`. Mark R9 COMPLETE.

### R10 — Operations Handoff

**AI Goal**: Hand off the arbitrator to daily operations. Equip them with the withdrawal process, reputation management guidance, and case pipeline monitoring. The arbitrator journey transitions to ongoing service operation.

**Key Questions**:
- Do you understand the withdrawal timing? Finished cases = immediate; others = 30-day mandatory wait.
- Do you know how to monitor your case pipeline? (onchain_events for ArbEvent)
- Do you know how to maintain your on-chain reputation? (feedback is permanent)

**Tool Calls**:
1. `local_info_operation` → write the handoff packet: Arbitration ID, voting_guard design, usage_guard design, Contact ID, case pipeline monitoring query.
2. Orient the user to Phase 3 (Business Model): revenue flow, withdrawal timing, compensation system.
3. Set up case monitoring: `onchain_events` → `type: "ArbEvent"`, filter by Arbitration ID.
4. Recommend next Skills: [wowok-messenger](../wowok-messenger/SKILL.md) for ongoing evidence exchange, [wowok-guard](../wowok-guard/SKILL.md) for advanced Guard design, [wowok-output](../wowok-output/SKILL.md) for event display.

**Success Criteria**: User has the handoff packet. User understands withdrawal timing (immediate for Finished, 30-day wait for others). User knows how to monitor the case pipeline. User understands feedback is permanent and reputation matters.

**Fallback**: User wants to withdraw immediately after a non-Finished case → explain the 30-day mandatory wait (cannot bypass). User wants to modify the Arbitration configuration → some fields are mutable (fee, pause, um), but voting_guard and usage_guard require replacement Guard creation. User wants to pause the service → `arbitration.modify` with `pause: true`; existing cases continue, new filings blocked.

**Checkpoint**: Persist `{ round: R10, handoff_emitted: true, arbitration_id, journey: complete }`. Mark arbitrator setup COMPLETE.

**Handoff Packet** (emitted to [wowok-messenger](../wowok-messenger/SKILL.md) for evidence exchange, and to [wowok-order](../wowok-order/SKILL.md) for customer-side dispute filing):
- Arbitration ID + name + fee
- Voting_guard design (mode, weight rules, voter criteria)
- Usage_guard design (criteria for filing)
- Contact (`um`) ID + Messenger address
- Case pipeline monitoring query (onchain_events filter)
- Withdrawal timing rules
- Recommended next Skill: wowok-messenger (evidence), wowok-guard (advanced Guard design), wowok-output (event display)

---

## Decision Trees

### D1: Voting Mode Selection

```
Designing voting_guard for Arbitration:
├── How many voters do you expect?
│   ├── Just me (or a small trusted panel)
│   │   └── Open Voting (voting_guard: [])
│   │       - You cast votes directly, weight = 1
│   │       - Centralized, fast, simple
│   │       - Best for: individual arbitrators, small panels
│   └── Many voters (community, token holders, experts)
│       └── Guard-Based Voting (voting_guard: [{guard, vote_weight}, ...])
│           ├── How should weight be determined?
│           │   ├── Equal weight for all qualified voters
│           │   │   └── FixedValue(u32) — e.g., every voter has weight 1
│           │   └── Dynamic weight from credential
│           │       └── GuardIdentifier(u8) — e.g., reputation score, token balance
│           │           ├── Referenced index must be b_submission: true
│           │           ├── Must be numeric (U8–U256)
│           │           └── Value cast to u32 as voter's weight
│           └── How many guards? (max 50)
│               ├── 1-3 guards: simple tiered voting
│               └── 4-50 guards: complex multi-stakeholder voting
└── Immutability reminder: Guard design CANNOT be changed after creation.
    Test with gen_passport before finalizing.
```

### D2: Case Review Decision (Confirm vs Reset)

```
Arb case arrives at state (1) Arbitrator_confirming:
├── Is the evidence verified? (verify_wts passed)
│   ├── NO → Do not evaluate. Ask customer to send valid WTS.
│   └── YES → continue
├── Is the evidence sufficient to understand the dispute?
│   ├── YES → `confirm` → state (2) Voting
│   └── NO → `reset` → state (0) Revision Pending
│       ├── What's missing? (specific evidence, clarification, documents)
│       ├── Write feedback: specific, actionable, professional
│       ├── Feedback channel:
│       │   ├── Messenger (preferred for privacy-sensitive details)
│       │   └── on-chain feedback (general clarification, procedural)
│       └── Customer revises → `arb_confirm` → back to (1)
├── Is the case outside your domain?
│   ├── YES → reset with feedback recommending a different Arbitration
│   └── NO → continue
└── Are there conflicts of interest?
    ├── YES → reset with feedback declaring conflict
    └── NO → confirm
```

### D3: Verdict & Indemnity Setting

```
Voting concluded, ready for `arbitration` (irreversible):
├── Review vote distribution across propositions
├── Determine the winning proposition(s)
├── Set `indemnity` (compensation amount):
│   ├── Proportional to order value?
│   ├── Proportional to dispute nature? (minor delay vs major breach)
│   ├── Covers customer's actual loss? (from verified evidence)
│   ├── Within provider's compensation_fund balance? (from E7)
│   │   ├── YES → set indemnity
│   │   └── NO → set indemnity = fund balance (can't pay more than available)
│   └── Zero indemnity if provider is not at fault
├── Set `feedback` (permanently public on-chain):
│   ├── Professional, reasoned, fair
│   ├── References specific evidence (WTS)
│   ├── Explains the verdict logic
│   └── Avoids personal attacks, emotional language
└── Execute `arbitration` → state (3) Arbitrated
    ⛔ IRREVERSIBLE by arbitrator
    Only customer can: arb_claim_compensation → (5) or arb_objection → (4)
```

### D4: Withdrawal Timing

```
Arbitrator wants to withdraw fee (arb_withdraw):
├── What state is the Arb case in?
│   ├── (5) Finished
│   │   └── Immediate withdrawal. No wait.
│   ├── (3) Arbitrated
│   │   └── ⛔ 30-day mandatory wait from arbitration timestamp
│   ├── (4) Objectionable
│   │   └── ⛔ 30-day mandatory wait from objection timestamp
│   ├── (6) Withdrawn
│   │   └── Already withdrawn. Nothing to do.
│   └── (0), (1), (2) — case still in progress
│       └── ⛔ 30-day mandatory wait (case not resolved)
├── Has the 30-day wait elapsed (for non-Finished states)?
│   ├── YES → `arb_withdraw` succeeds
│   └── NO → `arb_withdraw` fails. Wait.
└── Why the 30-day wait?
    - Protects customer's right to object or claim compensation
    - Prevents arbitrator from extracting fee before resolution is final
```

### D5: Objection Handling

```
Customer executes `arb_objection` → state (4) Objectionable:
├── Why did the customer object?
│   ├── Disagrees with verdict
│   │   ├── Review the objection feedback (if provided)
│   │   ├── Re-examine evidence (verify_wts again if needed)
│   │   └── Decide: reset for revision, or maintain verdict
│   ├── Disagrees with indemnity amount
│   │   ├── Too low: customer wants more compensation
│   │   ├── Too high: provider may push back (rare, provider doesn't object directly)
│   │   └── Reset allows adjusting indemnity in next arbitration call
│   ├── Procedural concern
│   │   ├── Voting deadline was too short
│   │   ├── Evidence wasn't properly reviewed
│   │   └── Reset, address concern, re-arbitrate
│   └── No reason given
│       └── Reset with feedback asking for specific objection grounds
├── After reset → state (0) → customer `arb_confirm` → (1) → re-review
└── Multiple objection cycles possible:
    - Each cycle: reset → (0) → arb_confirm → (1) → confirm → (2) → arbitration → (3) → objection → (4)
    - No hard limit on cycles, but reputation impact for both parties
```

---

## Failure Playbooks

### F1: Paused Arbitration Silently Rejects Disputes

**Trigger**: A customer files a dispute via `arbitration.dispute`, but the case never appears in the arbitrator's pipeline. No error message is returned to the customer.

**Diagnosis**:
- The Arbitration service is still paused (`pause: true`). This is the default after creation.
- Paused services silently reject all disputes — no error, no feedback.
- The arbitrator forgot to unpause after configuration (R7 was skipped).

**Recovery**:
1. `query_toolkit` → `onchain_objects` for the Arbitration. Check `pause` field.
2. If `pause: true` → verify all required fields are set (fee, voting_guard, usage_guard, um).
3. If all fields set → `onchain_operations` → `arbitration.modify` with `pause: false`.
4. If `um` is null → 🔴 cannot unpause. Configure Contact first (R4).
5. Notify affected customers to re-file their disputes.

**Prevention**: Always unpause at R7 after R6 (Guard testing) confirms all configuration is correct. Add a post-creation checklist: fee set? voting_guard tested? usage_guard tested? um configured? → unpause.

### F2: Wrong Voting Guard Design (Immutable)

**Trigger**: After creating the Arbitration and testing with `gen_passport`, the arbitrator discovers the voting_guard logic is wrong — weights are miscalculated, voter criteria are too restrictive, or the `GuardIdentifier` index is invalid.

**Diagnosis**:
- `GuardIdentifier` references an index that is not `b_submission: true` → weight cannot be read.
- `GuardIdentifier` references a non-numeric index → cast to u32 fails.
- Voter criteria are too restrictive → no voters can obtain passports.
- Voter criteria are too loose → unqualified voters can participate.
- Guards are immutable after creation — the design cannot be patched.

**Recovery**:
1. Design a replacement Guard with the corrected logic per [wowok-guard](../wowok-guard/SKILL.md).
2. `onchain_operations` → `guard.create` for the replacement Guard.
3. Test the replacement with `gen_passport` before proceeding.
4. `onchain_operations` → `arbitration.modify` to update `voting_guard` with the replacement Guard ID.
5. Archive the old Guard (it remains on-chain but unused).
6. Update the handoff packet (R10) with the new Guard ID.

**Prevention**: Always test Guards with `gen_passport` at R6 BEFORE unpausing. Design Guards per [wowok-guard](../wowok-guard/SKILL.md) guidelines. For `GuardIdentifier`, verify the index is `b_submission: true` and numeric before creating the Guard.

### F3: Past Voting Deadline

**Trigger**: The arbitrator tries to finalize the verdict via `arbitration`, but the operation fails because the `voting_deadline` has not passed, or votes were cast after the deadline.

**Diagnosis**:
- `voting_deadline` was set to a past timestamp initially, then votes came in after — votes are invalid.
- `voting_deadline` was set too far in the future, and the arbitrator tries to finalize early.
- The deadline timestamp was in seconds but the system expects milliseconds (or vice versa).

**Recovery**:
1. `query_toolkit` → `onchain_objects` for the Arb case. Check `voting_deadline`.
2. If deadline hasn't passed → wait, or extend the deadline if needed.
3. If deadline has passed → `arbitration` should succeed. If it still fails, check for other issues (no votes cast, proposition format error).
4. If votes were cast after the deadline → those votes are invalid. Only votes before the deadline count.
5. If no valid votes were cast → reset the case (state (2) → not directly possible; must go through objection flow or wait for customer action).

**Prevention**: Set `voting_deadline` to a future timestamp ≤ 3 days from now. Verify the timestamp unit (milliseconds since epoch). Use `onchain_events` to monitor vote submissions before the deadline.

### F4: Unverified Evidence Accepted

**Trigger**: The arbitrator evaluates evidence and makes a ruling, only to discover later that the WTS file was tampered with or never verified via `verify_wts`.

**Diagnosis**:
- The arbitrator skipped `verify_wts` and reviewed the WTS content directly.
- The WTS hash chain was broken (messages were modified or gaps exist).
- The WTS file was generated selectively (not the full conversation), undermining credibility.
- The arbitrator's ruling is now based on invalid evidence.

**Recovery**:
1. If the case is still in progress (state (1) or (2)) → pause evaluation, request complete and verified WTS from the customer.
2. If the verdict has been finalized (`arbitration` executed) → the ruling is irreversible by the arbitrator. Only the customer can object.
3. If the customer objects based on the evidence issue → reset (state (4) → (0)), re-evaluate with verified evidence.
4. Document the evidence verification failure in the feedback (permanently public).
5. For future cases: always run `verify_wts` before evaluating any evidence.

**Prevention**: Always run `verify_wts` on every WTS file before evaluating. Never accept unverified evidence. Require the full conversation (not selective exports) per [wowok-messenger](../wowok-messenger/SKILL.md) guidelines.

### F5: Premature Withdrawal Attempt

**Trigger**: The arbitrator tries to withdraw the fee via `arb_withdraw` on a case that is not in state (5) Finished, expecting immediate access. The operation fails or funds are locked.

**Diagnosis**:
- The case is in state (3) Arbitrated, (4) Objectionable, or still in progress (0/1/2).
- Non-Finished states have a mandatory 30-day wait before withdrawal.
- The arbitrator did not track the case state and tried to withdraw too early.

**Recovery**:
1. `query_toolkit` → `onchain_objects` for the Arb case. Check the current state.
2. If state is (3), (4), or in-progress → calculate the 30-day wait expiry from the last state transition timestamp.
3. Wait until the 30-day period elapses, then retry `arb_withdraw`.
4. If state is (5) Finished → withdrawal should be immediate. If it fails, check for other issues (insufficient balance, permission error).
5. If state is (6) Withdrawn → already withdrawn, nothing to do.

**Prevention**: Track case states carefully. Only attempt immediate withdrawal on (5) Finished cases. For other states, set a reminder for the 30-day expiry. Use `onchain_events` to monitor state transitions.

### F6: Empty Reset Feedback

**Trigger**: The arbitrator executes `reset` to send a case back for revision, but provides no feedback or vague feedback. The customer doesn't know what to fix and resubmits unchanged.

**Diagnosis**:
- The `reset` operation was called without the `feedback` field, or feedback was an empty string.
- The customer received no guidance on what was insufficient.
- The case cycles: (1) → reset → (0) → arb_confirm → (1) → reset → ... with no progress.

**Recovery**:
1. If the case is at (0) Revision Pending → wait for the customer to `arb_confirm`.
2. When it returns to (1) → if still insufficient, `reset` again WITH specific feedback.
3. Feedback should include: what evidence is missing, what needs clarification, what documents are required.
4. Use Messenger for privacy-sensitive feedback details; on-chain feedback for general procedural guidance.
5. If the customer cycles multiple times without addressing feedback → consider rejecting (maintain reset with escalating specificity) or confirm with noted evidence gaps.

**Prevention**: Always provide specific, actionable feedback on every `reset`. Use the feedback template: "Insufficient: [specific gap]. Required: [what to provide]. Channel: [Messenger for details]." Never submit an empty feedback field.

---

## Tier Layering

### Novice — Open Voting, Single Arbitrator

**Profile**: First-time arbitrator. Individual operator. Wants a simple setup with direct control over voting.

**AI Behavior**:
- Recommend open voting (`voting_guard: []`) — simplest mode, arbitrator casts votes directly.
- Guide through PRE-FLIGHT checklist step-by-step. Confirm each item explicitly.
- For Contact (`um`): recommend reusing an existing Contact or creating a simple one with one Messenger address.
- For usage_guard: recommend public (no restriction) to maximize case volume initially.
- At R8 (case review): guide through `verify_wts` step-by-step. Explain state machine transitions.
- At R9 (voting): recommend short deadlines (1-2 days) for faster resolution. Help draft `feedback` text.
- At R10 (handoff): explain withdrawal timing clearly. Set up basic case monitoring.

**Typical Journey**: R1 (individual arbitrator) → R2 (guided checklist) → R3 (open voting) → R4 (public usage_guard, simple Contact) → R5 (create paused) → R6 (test — minimal for open voting) → R7 (unpause) → R8-R9 (first case guided) → R10 (basic operations).

### Advanced — Guard-Based Voting, Weighted Panel

**Profile**: Experienced arbitrator. Represents a panel or wants decentralized voting. Needs Guard-based voter authentication with weighted voting.

**AI Behavior**:
- Recommend Guard-based voting with 1-3 voting guards.
- Help design `FixedValue(u32)` guards for equal-weight panels, or `GuardIdentifier(u8)` for dynamic-weight (reputation-based) panels.
- For usage_guard: suggest a minimal Guard (e.g., small fee or basic reputation) to filter spam.
- At R6 (Guard testing): thoroughly test each guard with `gen_passport` — verify weight calculation, voter eligibility.
- At R8 (case review): assume familiarity with `verify_wts`. Focus on evidence analysis and feedback drafting.
- At R9 (voting): monitor voter participation via `onchain_events`. Help manage deadlines and quorum.
- At R10 (handoff): set up advanced case monitoring, track multiple active cases, manage withdrawal timing across cases.

**Typical Journey**: R1 (panel arbitrator) → R2 (checklist with Guard designs) → R3 (Guard-based voting, 1-3 guards) → R4 (restricted usage_guard, multi-address Contact) → R5 (create paused) → R6 (thorough Guard testing) → R7 (unpause) → R8-R9 (case with voter participation) → R10 (multi-case operations).

### Expert — Multi-Guard Tiered Voting, Decentralized Panel

**Profile**: Large-scale arbitration service. Complex multi-stakeholder voting (experts + community, token holders + NFT holders). Up to 50 voting guards.

**AI Behavior**:
- Support complex tiered voting: multiple Guard types for different voter segments.
- Design `GuardIdentifier(u8)` guards that reference dynamic credentials (reputation scores, token balances, stake durations).
- For usage_guard: design sophisticated filtering (multi-criteria, partner org whitelists, time-bound eligibility).
- At R6 (Guard testing): comprehensive test suite — valid voters, invalid voters, edge cases, weight boundary conditions.
- At R8 (case review): support batch case processing. Prioritize cases by complexity and stakes.
- At R9 (voting): manage large voter pools (up to 520 voters). Monitor participation rates. Extend deadlines strategically.
- At R10 (handoff): full operations dashboard — case pipeline, voter analytics, revenue tracking, reputation monitoring.
- Support service evolution: create replacement Guards for improved voting logic, migrate voting_guard configuration, maintain service continuity.

**Typical Journey**: R1 (large-scale service) → R2 (complex checklist) → R3 (multi-guard tiered design, 4-50 guards) → R4 (sophisticated usage_guard, multi-channel Contact) → R5 (create paused) → R6 (comprehensive test suite) → R7 (unpause) → R8-R9 (high-volume case management) → R10 (full operations dashboard).