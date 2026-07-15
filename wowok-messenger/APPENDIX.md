# Appendix — wowok-messenger

> This file is loaded on-demand (Progressive Disclosure).
> Main skill: [SKILL.md](./SKILL.md)

---

## Dialogue Scripts (R1-R10)

A guided 10-round dialogue for the messenger journey — from initial setup to evidence pipeline operations. Each round has a specific AI Goal, Key Questions, Tool Calls, Success Criteria, Fallback, and Checkpoint. Checkpoints persist via `local_info_operation` so the journey can resume after interruption.

### R1 — Setup & Account Verification

**AI Goal**: Verify the user's account is configured for Messenger. Ensure a messenger name is set (required for message delivery). Establish the communication role (customer, provider, or arbitrator).

**Key Questions**:
- What is your role? (customer contacting a seller, provider responding to inquiries, arbitrator receiving evidence)
- Have you set a messenger name? Without it, your account has no endpoint.
- Do you have the address of the person you want to contact?

**Tool Calls**:
1. `account_operation` → `get` to confirm the active account exists and capture the address.
2. `account_operation` → `messenger` to verify a messenger name is set. If not, guide the user to set one.
3. `query_toolkit` → `onchain_objects` to check if the user has any existing Contact objects.
4. `local_info_operation` → create a session checkpoint `{ round: R1, role, account, messenger_name, address }`.

**Success Criteria**: Account exists. Messenger name is set. User's address is captured for sharing with counterparties. Role identified.

**Fallback**: User has no account → hand off to [wowok-onboard](../wowok-onboard/SKILL.md). User has no messenger name → guide through `account_operation` → `messenger` to set one. User doesn't have the counterparty's address → query the Service or Arbitration object to find the `um` Contact, then extract the Messenger address.

**Checkpoint**: Persist `{ round: R1, role, account, messenger_name, address, counterparty_address }`. Mark R1 COMPLETE.

### R2 — Protection Profile Selection

**AI Goal**: Help the user choose the right anti-spam protection profile (Open, Guarded, Closed, or Defensive) based on their role and communication needs.

**Key Questions**:
- Do you want strangers to be able to contact you at all?
- If yes, should anyone be able to, or only those who meet certain criteria?
- Are there specific addresses you want to block entirely?

**Tool Calls**:
1. Present the four protection profiles (Open, Guarded, Closed, Defensive) with trade-offs.
2. Based on user's role, recommend a default:
   - Customer → Open (need to contact providers)
   - Provider → Guarded (filter legitimate customers from spam)
   - Arbitrator → Guarded or Closed (control who can submit evidence)
3. `messenger_operation` → `update_settings` to configure `allowStrangerMessages` and initial blacklist.
4. `local_info_operation` → persist the protection profile choice.

**Success Criteria**: User has selected a protection profile. `allowStrangerMessages` is set. At least one inbound path exists (friends list, guard list, or stranger messages enabled).

**Fallback**: User selects Closed profile with no friends and no guard list → warn that nobody can contact them. Recommend adding at least one inbound path. User is unsure → default to Open for customers, Guarded for providers/arbitrators.

**Checkpoint**: Persist `{ round: R2, profile, allowStrangerMessages, blacklist_count, inbound_paths: [...] }`. Mark R2 COMPLETE.

### R3 — Guard List Design (Guarded Profile Only)

**AI Goal**: If the user selected the Guarded profile, design the guard list — which Guards verify strangers before they can message. This is the programmable anti-spam layer.

**Key Questions**:
- What criteria should strangers meet to message you? (token holding, reputation, order status, passport from trusted issuer)
- How many guards do you want? (1-3 recommended for manageability)
- For each guard: what is the `passportValiditySeconds`? (short = higher security, long = better UX)

**Tool Calls**:
1. `wowok_buildin_info` → `info: "guard instructions"` for Guard design reference.
2. For existing Guards: `guard2file` to export and review the logic.
3. For new Guards: design per [wowok-guard](../wowok-guard/SKILL.md) — typically token-gated, reputation-based, or order-based.
4. `messenger_operation` → `guardlist` → `add` to add each Guard with its `passportValiditySeconds`.
5. Test the Guard with `onchain_operations` → `gen_passport` to verify strangers can obtain passports.
6. `local_info_operation` → persist the guard list design.

**Success Criteria**: Guard list configured with 1-3 Guards. Each Guard tested with `gen_passport`. `passportValiditySeconds` matched to the Guard's data volatility. User understands the trade-off between security and UX.

**Fallback**: User selected Open or Closed profile → skip this round, mark as N/A. Guard is too restrictive (no strangers can pass) → redesign with looser criteria. Guard is too loose (anyone can pass) → add additional conditions or use a stricter Guard.

**Checkpoint**: Persist `{ round: R3, guards: [{id, criteria, passportValiditySeconds, tested: true}], profile: guarded }`. Mark R3 COMPLETE.

### R4 — First Contact — Sending to a Stranger

**AI Goal**: Compose and send the first message to a stranger. This is the one-message limit — make it count. Include who you are, why you're contacting them, and what you need.

**Key Questions**:
- Who are you, and why are you contacting this person?
- What specific information do you need from them?
- What is your call to action? (reply, provide info, review a document)

**Tool Calls**:
1. Compose the first message: identity, purpose, specific request, call to action.
2. Check if the recipient has a guard list (message may be rejected with `guard_list` in response).
3. `messenger_operation` → `send_message` with the composed message.
4. If rejected with `guard_list`: obtain a passport via `onchain_operations` → `gen_passport`, then resend with `guardAddress` + `passportAddress`.
5. `local_info_operation` → persist the first contact attempt and result.

**Success Criteria**: Message sent successfully. If rejected, passport obtained and message re-sent. User understands that if the recipient replies, they're auto-added to the friends list.

**Fallback**: Message rejected with `guard_list` → obtain passport from one of the listed Guards, resend. Message rejected without `guard_list` → recipient has `allowStrangerMessages: false` and user is not a friend; no way to contact without being added to friends list. User wants to send a vague message → advise against it; the one-message limit means a vague message wastes the only chance.

**Checkpoint**: Persist `{ round: R4, recipient, message_sent: bool, rejected: bool, passport_obtained: bool, resent: bool }`. Mark R4 COMPLETE.

### R5 — Inbox Management & Triage

**AI Goal**: Set up the daily inbox monitoring routine. Use `watch_conversations` for a quick glance and `watch_messages` for deep dives. Apply list filters to segment the inbox.

**Key Questions**:
- Do you want a quick overview of unread messages, or a deep dive into a specific conversation?
- Which filter mode do you want? (friends, guard, stranger, any)
- Do you want messages auto-marked as viewed, or peek without marking?

**Tool Calls**:
1. `messenger_operation` → `watch_conversations` with `unreadOnly: true` for a quick glance.
2. For a specific conversation: `messenger_operation` → `watch_messages` with `peerAddress`.
3. Apply `listFilterMode` (friends/guard/stranger/any) to segment the inbox.
4. Set `skipAutoMarkViewed: true` if peeking without marking read.
5. `messenger_operation` → `mark_conversation_as_viewed` or `mark_messages_as_viewed` after reviewing.
6. `local_info_operation` → persist the inbox triage routine.

**Success Criteria**: User has a daily inbox monitoring routine. Understands the difference between quick glance and deep dive. Knows how to filter by relationship type. Knows how to control the auto-mark-viewed behavior.

**Fallback**: No unread messages → inbox is clear, set up monitoring for future messages. Too many unread messages → recommend filtering by `listFilterMode: "stranger"` first (highest priority), then `friends`. User wants to search by keyword → use `watch_messages` with keyword search parameter.

**Checkpoint**: Persist `{ round: R5, triage_routine: {quick_glance, deep_dive, filter_mode, auto_mark}, unread_count }`. Mark R5 COMPLETE.

### R6 — Conversation Deep Dive & Search

**AI Goal**: Use `watch_messages` for full conversation history with a specific counterparty. Apply keyword search, time-range filtering, direction filter, and status filter for targeted retrieval.

**Key Questions**:
- Which conversation do you want to dive into?
- Are you looking for specific information? (keyword search)
- What time range? Direction (sent/received)? Status (viewed/unviewed)?

**Tool Calls**:
1. `messenger_operation` → `watch_messages` with `peerAddress` for the full conversation.
2. Apply `keyword` for content search.
3. Apply `startTime` and `endTime` for time-range filtering.
4. Apply `direction` filter (sent/received).
5. Apply `status` filter (viewed/unviewed).
6. Use `customListFilter` for fine-grained include/exclude logic.
7. `local_info_operation` → persist the search query and results summary.

**Success Criteria**: User can retrieve specific messages from a conversation using filters. Understands the difference between conversation-level and message-level queries.

**Fallback**: Conversation not found → verify the `peerAddress` is correct. No messages match filters → broaden the search criteria. User wants to export the conversation → proceed to R7 (WTS generation).

**Checkpoint**: Persist `{ round: R6, peerAddress, search_params: {keyword, time_range, direction, status}, results_count }`. Mark R6 COMPLETE.

### R7 — WTS Evidence Generation

**AI Goal**: Generate a WTS (Witness Testimony Statement) file from a conversation. This is the tamper-proof, self-verifiable evidence export used for arbitration.

**Key Questions**:
- Which conversation do you want to export as WTS?
- What range? (by time, messageId, or seqIndex)
- Have you included the FULL conversation? Selective exports undermine credibility.

**Tool Calls**:
1. `messenger_operation` → `generate_wts` with the conversation's `peerAddress` and range parameters.
2. Verify the WTS file includes the full conversation — not just favorable messages.
3. `messenger_operation` → `sign_wts` to add the user's Falcon512 signature.
4. (Optional) `messenger_operation` → `wts2html` to convert to human-readable HTML for review.
5. `local_info_operation` → persist the WTS file path and metadata.

**Success Criteria**: WTS file generated covering the full conversation. User has signed the WTS. File is ready for verification by the counterparty or arbitrator.

**Fallback**: WTS generation fails → check the range parameters (time, messageId, or seqIndex). User wants to export only favorable messages → advise against it; arbitrators need the full context. User wants both parties to sign → generate WTS, sign it, send to counterparty via `send_file`, counterparty signs and returns.

**Checkpoint**: Persist `{ round: R7, wts_file_path, range, signed: true, html_generated: bool }`. Mark R7 COMPLETE.

### R8 — WTS Verification & Signing (Arbitrator/Counterparty)

**AI Goal**: Verify a received WTS file's authenticity. Validate the hash chain, continuity, and all signatures. This is the arbitrator's evidence verification step.

**Key Questions**:
- Have you received a WTS file from a counterparty?
- Ready to verify its authenticity? (hash chain, continuity, signatures)
- After verification, do you want to add your signature (attestation)?

**Tool Calls**:
1. `messenger_operation` → `verify_wts` on the received WTS file.
2. Check verification results: hash chain intact, continuity preserved, all signatures valid.
3. If verification passes: `messenger_operation` → `sign_wts` to add an attestation signature (optional, for arbitrators).
4. If verification fails: document the failure reason (broken hash chain, gap in messages, invalid signature).
5. `local_info_operation` → persist the verification result.

**Success Criteria**: WTS file verified. Hash chain intact. All signatures valid. If arbitrator, attestation signature added. If verification fails, failure reason documented.

**Fallback**: Hash chain broken → the WTS file was tampered with or messages were modified. Reject as evidence. Continuity gap → messages are missing from the export. Request a complete WTS. Invalid signature → the signer's key may be compromised or the file was altered after signing. Reject as evidence.

**Checkpoint**: Persist `{ round: R8, wts_file, verified: bool, hash_chain: intact|broken, continuity: preserved|gap, signatures: valid|invalid, attestation_added: bool }`. Mark R8 COMPLETE.

### R9 — File Exchange (ZIP, WIP, Documents)

**AI Goal**: Exchange files via Messenger. Use `send_file` for WTS, WIP, or ZIP attachments. Recipients extract via `extract_zip_messages`. Files are encrypted end-to-end.

**Key Questions**:
- What type of file are you sending? (WTS evidence, WIP product file, ZIP archive, document)
- Who is the recipient?
- Have you verified the recipient's address?

**Tool Calls**:
1. `messenger_operation` → `send_file` with the file path, recipient address, and file type.
2. For ZIP files: `messenger_operation` → `extract_zip_messages` on the recipient side.
3. Track `zipMetadata` for download status (local tracking).
4. `messenger_operation` → `watch_messages` to confirm file delivery.
5. `local_info_operation` → persist the file exchange record.

**Success Criteria**: File sent and delivered. Recipient confirmed receipt. For ZIP files, contents extracted successfully.

**Fallback**: File delivery fails → verify the recipient's address and messenger name. File too large → consider splitting into multiple files or using a different format. Recipient cannot extract ZIP → guide them through `extract_zip_messages`. File type not supported → check the supported types (WTS, WIP, ZIP).

**Checkpoint**: Persist `{ round: R9, file_type, recipient, sent: true, delivered: bool, extracted: bool }`. Mark R9 COMPLETE.

### R10 — Operations Handoff

**AI Goal**: Hand off the user to daily Messenger operations. Equip them with the inbox monitoring routine, WTS evidence pipeline, contact list management, and anti-spam strategy.

**Key Questions**:
- Do you understand your daily inbox monitoring routine?
- Do you know how to generate WTS evidence when a dispute arises?
- Do you know how to manage your contact lists (friends, blacklist, guard list)?

**Tool Calls**:
1. `local_info_operation` → write the handoff packet: messenger address, protection profile, guard list, inbox routine, WTS pipeline.
2. Orient the user to the role-specific touchpoints (Customer, Provider, Arbitrator) documented in §Messenger Across Roles.
3. Set up ongoing monitoring: `messenger_operation` → `watch_conversations` with `unreadOnly: true`.
4. Recommend next Skills: [wowok-order](../wowok-order/SKILL.md) for customer journey, [wowok-provider](../wowok-provider/SKILL.md) for provider journey, [wowok-arbitrator](../wowok-arbitrator/SKILL.md) for arbitrator journey.

**Success Criteria**: User has the handoff packet. User understands the daily inbox routine. User knows how to generate and verify WTS evidence. User knows how to manage contact lists.

**Fallback**: User wants to change protection profile → re-run R2 (Protection Profile Selection). User wants to add a new guard → re-run R3 (Guard List Design). User wants to archive old conversations → use `watch_messages` with time-range filter, then `mark_conversation_as_viewed`.

**Checkpoint**: Persist `{ round: R10, handoff_emitted: true, messenger_address, journey: complete }`. Mark messenger setup COMPLETE.

**Handoff Packet** (emitted to [wowok-order](../wowok-order/SKILL.md) for customer communication, [wowok-provider](../wowok-provider/SKILL.md) for provider communication, [wowok-arbitrator](../wowok-arbitrator/SKILL.md) for evidence exchange):
- Messenger address + name
- Protection profile + guard list
- Inbox monitoring routine
- WTS evidence pipeline (generate → sign → verify → send)
- Contact list management operations
- Recommended next Skill: role-specific (wowok-order, wowok-provider, or wowok-arbitrator)

---

## Decision Trees

### D1: Protection Profile Selection

```
User needs to configure anti-spam:
├── What is the user's role?
│   ├── Customer
│   │   └── Open Profile (allowStrangerMessages: true, no guard list, empty blacklist)
│   │       - Needs to contact providers freely
│   │       - Low spam risk (customer-initiated contact)
│   ├── Service Provider
│   │   ├── High-volume public service → Open Profile + substantial blacklist (Defensive)
│   │   └── Premium/verified service → Guarded Profile (guard list with 1-3 guards)
│   ├── Arbitrator
│   │   ├── Public arbitration → Guarded Profile (guard list for evidence submitters)
│   │   └── Private/invitation-only → Closed Profile (friends-only)
│   └── Private individual
│       └── Closed Profile (friends-only, no stranger messages)
├── Verify: at least one inbound path exists?
│   ├── Open: strangers can message → OK
│   ├── Guarded: guard list non-empty → OK
│   ├── Closed: friends list non-empty → OK (or user accepts no inbound)
│   └── Defensive: strangers enabled + blacklist → OK
└── Test: send a message to yourself (if possible) to verify the setup.
```

### D2: Stranger Message Handling

```
A message arrives from an unknown address:
├── Is the sender in the blacklist?
│   ├── YES → Reject. Do not deliver.
│   └── NO → continue
├── Is the sender in the friends list?
│   ├── YES → Accept. Deliver to inbox.
│   └── NO → continue
├── Is the sender guard-verified?
│   ├── YES (valid passport) → Accept. Deliver to inbox.
│   ├── NO (expired/invalid passport) → Reject with guard_list in response
│   └── No guard list configured → continue
├── Is allowStrangerMessages enabled?
│   ├── YES → Apply one-message limit:
│   │   ├── First message from this stranger → Accept. Deliver.
│   │   ├── Already sent one, no reply → Reject (cool-down period)
│   │   └── Already sent one, user replied → Stranger is now a friend. Accept.
│   └── NO → Reject. No stranger messages allowed.
└── After acceptance:
    ├── Auto-mark as viewed? (configurable)
    └── Add to inbox with "stranger" label for filtering
```

### D3: WTS Generation Decision

```
User wants to create evidence from a conversation:
├── Is this for arbitration/dispute?
│   ├── YES → Generate WTS. This is the standard evidence format.
│   └── NO (archiving) → WTS is not for archiving. Normal conversations are preserved server-side.
├── Which conversation?
│   └── Specify peerAddress
├── What range?
│   ├── By time (startTime, endTime) → good for date-bounded disputes
│   ├── By messageId → good for specific message inclusion
│   └── By seqIndex → good for precise sequence exports
├── Include the FULL conversation?
│   ├── YES → Strong evidence, credible
│   └── NO (selective) → Undermines credibility. Arbitrator may reject.
├── After generation:
│   ├── Sign the WTS (sign_wts) → adds non-repudiation
│   ├── Convert to HTML (wts2html) → for human review
│   └── Send to counterparty/arbitrator (send_file)
└── Optional: On-chain proof (proof_message) → anchors a message to the blockchain
    - Creates immutable timestamp proving message existed before that point
    - Anyone can independently verify
```

### D4: Evidence Verification Flow

```
Arbitrator/counterparty receives a WTS file:
├── Run verify_wts:
│   ├── Hash chain intact?
│   │   ├── YES → messages are cryptographically chained, no tampering
│   │   └── NO → WTS was tampered with. REJECT as evidence.
│   ├── Continuity preserved?
│   │   ├── YES → no gaps in the message sequence
│   │   └── NO → messages are missing. Request complete WTS.
│   ├── All signatures valid?
│   │   ├── YES → signers' keys are authentic, file unaltered after signing
│   │   └── NO → signer's key compromised or file altered post-signing. REJECT.
│   └── Participant signatures present?
│       ├── Both parties signed → strongest evidence (mutual acknowledgment)
│       ├── One party signed → valid but weaker (unilateral)
│       └── No signatures → only hash chain integrity, no non-repudiation
├── After verification:
│   ├── Accept as evidence → proceed with arbitration review
│   ├── Add attestation signature (sign_wts) → arbitrator endorses authenticity
│   └── Reject with documented reason → inform submitting party
└── Key principle: Only verified evidence is valid evidence.
    Never evaluate unverified WTS content.
```

### D5: Contact List Management

```
User wants to manage contacts:
├── Which list?
│   ├── Friends List
│   │   ├── Add: manual add, or auto-added when you reply to a stranger
│   │   ├── Remove: friendslist → remove
│   │   ├── Check: friendslist → exist (verify before assuming)
│   │   └── Friends bypass all spam checks
│   ├── Blacklist
│   │   ├── Add: blacklist → add (permanent block, cannot message you)
│   │   ├── Remove: blacklist → remove (careful — re-enables messaging)
│   │   └── Use case: harassment, spam, bad actors
│   └── Guard List
│   ├── Add: guardlist → add (Guard ID + passportValiditySeconds)
│   │   ├── Choose Guard: token-gated, reputation, order-based, passport-based
│   │   ├── Set validity: 60s (high security) to 10 years (low maintenance)
│   │   └── Test with gen_passport before adding
│   ├── Remove: guardlist → remove (stops accepting new passports from this Guard)
│   │   └── Note: existing valid passports still work until expiry
│   └── Update: remove + re-add with new passportValiditySeconds
└── Strategy: Multiple guards serve different purposes
    - Provider: order-based guard (existing customers) + token-gated guard (premium access)
    - Either guard passing = message accepted
```

---

## Failure Playbooks

### F1: One-Message Limit Wasted

**Trigger**: User sends a vague or incomplete first message to a stranger. The message is delivered, but the recipient doesn't reply. The user cannot send another message until the cool-down period elapses.

**Diagnosis**:
- The first message lacked identity, purpose, or a clear call to action.
- The recipient didn't understand what was being asked or why they should reply.
- The one-message limit is a protocol invariant — no bypass.

**Recovery**:
1. Wait for the cool-down period to elapse (protocol-defined).
2. Compose a new message that is complete and actionable:
   - Who you are (identity, role, context).
   - Why you're contacting them (specific purpose).
   - What you need (clear request).
   - Call to action (reply, provide info, review document).
3. Resend via `messenger_operation` → `send_message`.
4. If the recipient has a guard list, obtain a passport first and resend with `guardAddress` + `passportAddress`.

**Prevention**: Always compose the first message carefully. Use the template: "I am [identity]. I'm contacting you because [purpose]. I need [specific request]. Please [call to action]." Never send a vague "hi" or "can we talk?" as a first message to a stranger.

### F2: Disabled Messenger (No Name Set)

**Trigger**: The user tries to send or receive messages, but the operations fail. Counterparties cannot find the user's endpoint.

**Diagnosis**:
- The user's account has no messenger name set.
- Without a messenger name, the account has no messenger endpoint.
- `account_operation` → `get` returns an account, but the messenger name field is empty.

**Recovery**:
1. `account_operation` → `messenger` to set a messenger name.
2. Verify the name is set via `account_operation` → `get`.
3. Share the address with counterparties.
4. Retry sending or receiving messages.

**Prevention**: Always set a messenger name during onboarding (R1 of this dialogue). Verify the name is set before attempting any messenger operations. Hand off to [wowok-onboard](../wowok-onboard/SKILL.md) if the user hasn't completed onboarding.

### F3: Guard List Blocks Legitimate Contact

**Trigger**: A legitimate customer or partner tries to message the user, but their message is rejected because they cannot obtain a valid passport from any Guard on the user's guard list.

**Diagnosis**:
- The Guard criteria are too restrictive (e.g., requires a token the customer doesn't hold).
- The `passportValiditySeconds` is too short, causing passports to expire before the customer can message.
- The Guard logic is buggy or references non-existent data.
- The customer doesn't know how to obtain a passport.

**Recovery**:
1. Review the guard list: `messenger_operation` → `guardlist` → `list`.
2. For each Guard: `guard2file` to export and review the logic.
3. Test with `onchain_operations` → `gen_passport` using the customer's data.
4. If the Guard is too restrictive:
   - Create a replacement Guard with looser criteria per [wowok-guard](../wowok-guard/SKILL.md).
   - `messenger_operation` → `guardlist` → `remove` the old Guard.
   - `messenger_operation` → `guardlist` → `add` the new Guard.
5. If `passportValiditySeconds` is too short: remove and re-add the Guard with a longer duration.
6. Manually add the customer to the friends list as a workaround: `messenger_operation` → `friendslist` → `add`.

**Prevention**: Test Guards with `gen_passport` before adding them to the guard list. Set `passportValiditySeconds` based on the Guard's data volatility (order-based = short, token-based = long). Provide clear instructions to customers on how to obtain passports.

### F4: Stale Passport Rejection

**Trigger**: A guard-verified sender's message is rejected because their passport has expired. The sender was previously able to message, but now cannot.

**Diagnosis**:
- `passportValiditySeconds` was set too short (e.g., 60 seconds).
- The sender obtained a passport, but it expired before they could send the next message.
- The Guard's data is volatile (e.g., order status changes), justifying a short duration, but the UX is poor.

**Recovery**:
1. The sender must re-obtain a passport via `onchain_operations` → `gen_passport`.
2. Resend the message with the new `guardAddress` + `passportAddress`.
3. If this happens frequently: review the `passportValiditySeconds` setting.
   - For stable data (token holdings): extend to 7 days or longer.
   - For volatile data (order status): keep short, but inform senders they need to re-verify per message.
4. `messenger_operation` → `guardlist` → `remove` + `add` with updated `passportValiditySeconds`.

**Prevention**: Match `passportValiditySeconds` to the Guard's data volatility. Token-based guards can use 7 days; order-based guards should use shorter durations (e.g., 1 hour) to ensure order status is current. Document the expected re-verification frequency for senders.

### F5: WTS Verification Fails

**Trigger**: The arbitrator or counterparty runs `verify_wts` on a received WTS file, and verification fails. The hash chain is broken, continuity has gaps, or signatures are invalid.

**Diagnosis**:
- **Broken hash chain**: The WTS file was tampered with after generation, or messages were modified.
- **Continuity gap**: Messages are missing from the export (selective export or generation error).
- **Invalid signature**: The signer's key is compromised, or the file was altered after signing.
- **Generation error**: The `generate_wts` range parameters were incorrect, excluding messages.

**Recovery**:
1. Document the specific verification failure (hash chain, continuity, signatures).
2. If hash chain broken → REJECT as evidence. The file is tampered.
3. If continuity gap → request a complete WTS from the sender. Selective exports undermine credibility.
4. If signatures invalid → REJECT. The signer's key may be compromised.
5. If generation error → ask the sender to regenerate with correct range parameters (full conversation).
6. If the sender cannot produce a valid WTS → their evidence is not admissible.

**Prevention**: Always generate WTS with the full conversation range. Sign the WTS immediately after generation. Verify WTS before evaluating content. Never accept unverified evidence in arbitration.

### F6: No Inbound Path (Closed Profile Mistake)

**Trigger**: The user configures `allowStrangerMessages: false` with an empty friends list and no guard list. Nobody can contact them. Legitimate customers and partners are blocked.

**Diagnosis**:
- The user selected the Closed profile but didn't add any friends.
- The user selected the Guarded profile but didn't add any Guards to the guard list.
- The result: all inbound messages are rejected.

**Recovery**:
1. `messenger_operation` → `watch_conversations` to check for any rejected messages (may not be visible).
2. Review the protection profile settings:
   - `allowStrangerMessages`: false
   - Friends list: empty
   - Guard list: empty
3. Fix by enabling at least one inbound path:
   - Add friends manually: `messenger_operation` → `friendslist` → `add`.
   - Add a guard: `messenger_operation` → `guardlist` → `add` (after designing/testing the Guard).
   - Enable stranger messages: `messenger_operation` → `update_settings` with `allowStrangerMessages: true`.
4. Notify affected counterparties to retry messaging.

**Prevention**: At R2 (Protection Profile Selection), always verify at least one inbound path exists before finalizing the configuration. The Closed profile requires a non-empty friends list. The Guarded profile requires a non-empty guard list. The Open profile always has an inbound path (strangers).

---

## Tier Layering

### Novice — Basic Send/Receive, Open Profile

**Profile**: First-time Messenger user. Needs simple send/receive capability. Not concerned about spam filtering or evidence generation yet.

**AI Behavior**:
- Recommend the Open profile (`allowStrangerMessages: true`, no guard list, empty blacklist).
- Guide through `send_message` step-by-step. Help compose clear first messages to strangers.
- For inbox: teach `watch_conversations` with `unreadOnly: true` for quick glance.
- For contact management: explain the auto-friend behavior (replying to a stranger adds them to friends).
- Skip WTS generation unless a dispute arises. If it does, guide through `generate_wts` + `sign_wts` step-by-step.
- Skip guard list design entirely (Open profile doesn't need it).

**Typical Journey**: R1 (setup) → R2 (Open profile) → R3 (skip — no guard list) → R4 (first contact guided) → R5 (basic inbox monitoring) → R10 (handoff with simple routine).

### Advanced — Guarded Profile, WTS Evidence, Contact Management

**Profile**: Experienced user (provider or arbitrator). Needs spam filtering, evidence generation, and contact list management.

**AI Behavior**:
- Recommend the Guarded profile with 1-3 Guards.
- Help design Guards based on the user's role (order-based for providers, reputation-based for arbitrators).
- At R3: thoroughly test each Guard with `gen_passport`. Set `passportValiditySeconds` based on data volatility.
- For inbox: teach `listFilterMode` to segment by relationship type (friends, guard, stranger).
- For WTS: guide through the full pipeline — `generate_wts` (full conversation) → `sign_wts` → `verify_wts` → `send_file`.
- For contact management: teach proactive blacklist management and guard list updates.
- Support pre-order negotiation: help compose messages that clarify deliverables, timeline, refund terms.

**Typical Journey**: R1 (setup) → R2 (Guarded profile) → R3 (guard list design + testing) → R4 (first contact with guard handling) → R5 (filtered inbox monitoring) → R6 (search and retrieval) → R7 (WTS generation) → R8 (WTS verification) → R10 (handoff with evidence pipeline).

### Expert — Multi-Guard Strategy, Automated WTS Pipeline, Evidence Library

**Profile**: Power user (high-volume provider or professional arbitrator). Needs sophisticated anti-spam, automated evidence pipelines, and multi-conversation management.

**AI Behavior**:
- Support complex multi-Guard strategies: different Guards for different voter/customer segments.
- Design dynamic Guards using `GuardIdentifier` for weight-based or score-based filtering.
- At R5: support batch inbox processing with custom filters and prioritization.
- At R6: support advanced search across multiple conversations with `customListFilter`.
- At R7-R8: automate the WTS pipeline — generate, sign, verify, and archive WTS files for all dispute-related conversations. Maintain an evidence library indexed by order ID and counterparty.
- Support on-chain proof anchoring (`proof_message`) for critical messages that need immutable timestamps.
- Manage contact lists at scale: bulk import friends, systematic blacklist management, guard list A/B testing.
- Integrate with role-specific workflows: for providers, monitor customer inquiries and route to appropriate response templates; for arbitrators, batch-process evidence submissions and verify WTS files in bulk.

**Typical Journey**: R1 (setup) → R2 (Guarded profile) → R3 (multi-Guard strategy) → R4 (first contact with dynamic guard handling) → R5 (batch inbox processing) → R6 (advanced multi-conversation search) → R7 (automated WTS pipeline) → R8 (bulk WTS verification) → R9 (file exchange with ZIP) → R10 (full operations dashboard with evidence library).
