---
name: wowok-messenger
description: |
  WoWok Messenger — end-to-end encrypted communication for pre-order negotiation,
  evidence collection, and dispute resolution.

  Core features: send/receive encrypted messages, generate WTS evidence files,
  verify message authenticity, manage conversations with anti-spam controls, and
  integrate with arbitration workflows.

  Used by customers, service providers, and arbitrators for secure off-chain
  communication that creates tamper-proof audit trails.
when_to_use:
  - User needs to communicate with another party (buyer, seller, arbitrator)
  - User wants to send encrypted messages for negotiation
  - User needs to generate WTS evidence files from conversations
  - User wants to verify message authenticity
  - User needs to manage conversation lists (friends, blacklist, guard)
  - User mentions "messenger", "message", "chat", "communication", "WTS", "evidence"
always: false
---

# WoWok Messenger Guide

End-to-end encrypted messaging with tamper-proof audit trails.

> **Role**: Any WoWok participant
> **Schema**: `wowok({ tool: "schema_query", data: { action: "get", name: "messenger_operation" } })` — all 16 operations with full parameter types and constraints. This document focuses on **design decisions and strategy** not captured by the schema.
> **Related Skills**: [wowok-guard](../wowok-guard/SKILL.md) (guard design), [wowok-arbitrator](../wowok-arbitrator/SKILL.md) (WTS evidence in disputes), [wowok-order](../wowok-order/SKILL.md) (customer perspective), [wowok-provider](../wowok-provider/SKILL.md) (service provider perspective), [wowok-safety](../wowok-safety/SKILL.md) (safety)

---

## Core Concepts

### Trust Model

Messages are **off-chain**, end-to-end encrypted. The server cannot read content — ciphertext is opaque. The server provides **verifiable message ordering** via Falcon512 signatures on a Merkle tree. On-chain anchoring (`proof_message`) is optional.

### Evidence Closure Principle

> **A message becomes valid evidence ONLY when the recipient explicitly responds to or decrypts it.**

- A message alone proves nothing about the recipient's awareness.
- ARK confirmation (recipient-signed receipt) creates cryptographic proof of acknowledgment.
- A reply is the strongest form of acknowledgment — it proves the recipient held the session key and acted on the message.
- Arbitration requires **confirmed, reciprocated evidence** — never unilateral claims.

### Sessions

Every conversation between two addresses has a deterministic session. Messages are ordered by a monotonically increasing `leafIndex` starting from zero, establishing their absolute position. Both parties share the same session context.

---

## Setup

Before any communication:

1. **Account must exist** → `account_operation` (gen)
2. **Enable messenger** → `account_operation` (messenger), set a messenger name
3. **Get your address** → `account_operation` (get) — share this address with your counterparties

> The messenger name is required for message delivery. Without it, your account has no messenger endpoint and cannot receive messages.

### Account Limit

A single device supports up to 1000 messenger accounts. Exceeding this returns "Maximum 1000 messenger accounts allowed". Use `account_operation → messenger { m: null }` to disable unused accounts.

---

## Daily Communication

The user's daily loop — these are the operations they will return to repeatedly.

### Check Inbox

Two approaches, depending on need:

- **Quick glance** — `watch_conversations` with `unreadOnly: true` lists all conversations with unread messages, sorted by activity. Each conversation shows a preview of the last messages.
- **Deep dive** — `watch_messages` with a specific `peerAddress` to view the full conversation with a particular counterparty. Supports keyword search, time-range filtering, direction filter, and status filter.

**Design note**: By default, retrieving messages auto-marks them as viewed (`viewedAt` timestamp). Set `skipAutoMarkViewed: true` if you want to peek without marking read.

### Send Messages

Plain text via `send_message`; files (WTS, WIP, ZIP) via `send_file`.

**First-time contact with a stranger**: You get exactly one message. Make it count — include who you are, why you're contacting them, and what you need. After the recipient replies, you're auto-added to their friends list and can message freely.

**Guard-protected recipients**: If the recipient has disabled stranger messages, the rejection response includes their `guard_list`. Obtain a passport from one of those guards (`gen_passport` via `onchain_operations`), then resend with `guardAddress` + `passportAddress`.

**ZIP file attachments**: Use `send_file` for file delivery. Recipients extract via `extract_zip_messages`. The file is encrypted end-to-end; `zipMetadata` tracks download status locally.

### Mark as Read

- `mark_conversation_as_viewed` — mark an entire conversation thread as read
- `mark_messages_as_viewed` — mark specific messages by ID

### Manage Contacts

Three independently managed lists. Schema covers all operations — here are the design choices:

| List | Design Intent |
|------|---------------|
| **Friends** | Mutual trust — added automatically when you reply to a stranger, or manually. Friends bypass all spam checks. |
| **Blacklist** | Permanent block — the address can never message you. |
| **Guard list** | Verified strangers — addresses holding a valid passport from any listed Guard can message you. Each entry pairs a Guard object ID with a validity duration (`passportValiditySeconds`: 10s to 10 years). |

---

## Anti-Spam Strategy

The four-layer protection model evaluates every incoming message:

```
Blacklist → Friends List → Guard Verification → Stranger Rules
   (reject)     (accept)      (accept if passport valid)    (one-message limit)
```

This section covers **how to configure these layers intelligently** for different user profiles — configuration combinations, not just field descriptions.

### Stranger Rules

Messages from non-friend, non-guard-verified addresses are subject to a **one-message limit**:

- Stranger sends one message. If the recipient replies, the stranger becomes a friend and messaging is unrestricted.
- If the recipient does not reply within the cool-down window, the stranger may retry with one new message.
- `allowStrangerMessages: false` disables stranger messages entirely.

### Strategy: Choosing Your Protection Profile

The optimal configuration depends on your role and openness needs:

| Profile | Settings | Who Should Use |
|---------|----------|----------------|
| **Open** | `allowStrangerMessages: true`, no guard list, empty blacklist | Public-facing services, open marketplaces |
| **Guarded** | `allowStrangerMessages: false`, guard list with 1-3 guards, friends list for known contacts | Service providers who want verified strangers only; customers discoverable by specific criteria |
| **Closed** | `allowStrangerMessages: false`, no guard list, friends-only | Private negotiations, internal team communication |
| **Defensive** | `allowStrangerMessages: true`, substantial blacklist | Users receiving harassment from specific addresses; open but monitoring |

**How to help the user choose**: Ask:
1. "Do you want strangers to be able to contact you at all?" → determines `allowStrangerMessages`
2. "If yes, should anyone be able to, or only those who meet certain criteria?" → determines Guard list need
3. "Are there specific addresses you want to block entirely?" → determines Blacklist use

### Strategy: Guard List Design

The Guard list is where anti-spam becomes programmable. A Guard validates that a stranger **meets a verifiable condition** before allowing their message through.

**Common Guard designs for messenger**:

| Guard Type | What It Verifies | Example Use |
|------------|-----------------|-------------|
| Token-gated | Sender holds a specific token/NFT | Premium customer community |
| Reputation | Sender's `personal` profile has ≥N likes | Verified reputation threshold |
| Order-based | Sender has an active order on your Service | Only current customers can message |
| Passport-based | Sender holds a valid passport from a trusted issuer | Whitelist of partner organizations |
| Payment | Sender has made a minimum payment | Paid consultation access |

**`passportValiditySeconds` trade-off**: Short (60s) = higher security, re-verification per message. Long (7 days) = better UX, one passport covers a week. Match to your Guard's use case: payment-based guards can use longer durations; order-status guards should use shorter durations (order state changes).

**Multiple guards**: Different guards can serve different purposes. A provider might use: (1) order-based guard for existing customers, (2) token-gated guard for premium access — both listed, either suffices for message delivery.

### Strategy: Troubleshooting Anti-Spam Issues

| Symptom | Diagnosis | Solution |
|---------|-----------|----------|
| "My message was rejected" | Recipient has `allowStrangerMessages: false` and you're not their friend | Check rejection response for `guard_list` → obtain passport → resend with `guardAddress`+`passportAddress` |
| "I'm getting too much spam" | `allowStrangerMessages: true` with no filtering | Switch to Guarded profile: set `allowStrangerMessages: false`, add at least one Guard to guard list |
| "A legitimate customer can't reach me" | Guard requirements too strict, or their passport expired | Lower Guard requirements, extend `passportValiditySeconds`, or add them to friends list manually |
| "Stranger keeps spamming after cool-down" | Working as designed — one retry per cool-down | Add to blacklist |
| "I disabled strangers but my friend can't message" | They may not actually be in your friends list | Use `friendslist` → `exist` to verify; add manually if needed |

### Strategy: Filtering Messages by Source

`watch_messages` supports `listFilterMode` to segment your inbox by relationship type:

- `friends` — only messages from your friends list
- `guard` — only messages from guard-verified senders
- `stranger` — only messages from unknown senders (highest priority for review)
- `any` — all messages (default)

Combine with `customListFilter` for fine-grained include/exclude logic.

**Practical use**: A service provider checking their inbox can first scan `listFilterMode: "friends"` for known-customer messages (low risk), then `listFilterMode: "stranger"` for new-customer inquiries (need attention).

---

## Evidence (WTS)

### Concept

A WTS file is a **tamper-proof, self-verifying export** of a continuous conversation. Every message is cryptographically chained; any gap or modification breaks the chain. Participant signatures add non-repudiation.

### The Workflow

When a dispute requires evidence:

```
1. generate_wts  → export messages by time/messageId/seqIndex range
2. sign_wts      → add your Falcon512 signature (both parties can sign)
3. verify_wts    → validate hash chain, continuity, and all signatures
4. wts2html      → (optional) convert to human-readable HTML
5. send_file     → submit signed WTS to the arbitrator via messenger
```

> **Key design decision**: Include the **full conversation** when generating WTS for arbitration — not just favorable messages. The arbitrator needs to see who said what, who acknowledged what, and the exact sequence. Selective exports undermine your credibility.

### On-Chain Proof (Optional)

`proof_message` anchors a message to the blockchain, creating an immutable timestamp proving the message existed before that point. Anyone can independently verify against this on-chain record.

### When to Generate WTS

- **Disputes only** — normal conversations are preserved server-side. WTS is evidence preparation, not archiving.
- **When the other party disputes a fact** — the WTS proves what was actually said and acknowledged.
- **When arbitration requires evidence submission** — signed WTS is the standard evidence format.

---

## Messenger Across Roles

This section shows **how Messenger fits into each participant's workflow** — not detailed SOP (see the role-specific skills for complete workflows), but the Messenger-specific touchpoints.

### Customer

| Touchpoint | Messenger Operation | When |
|------------|-------------------|------|
| Pre-order inquiry | `send_message` to service provider | Before order creation — ask about service details, pricing, custom requirements |
| Submit required info | `send_message` with delivery address, phone, etc. | After order creation — the Service's `customer_required` fields dictate what to send |
| Track progress | `watch_messages` with provider | During order fulfillment — receive status updates |
| Raise dispute | `generate_wts` + `sign_wts` + `send_file` to arbitrator | When resolution fails — submit evidence |

> **Full workflow**: See [wowok-order](../wowok-order/SKILL.md) for the complete customer journey.

### Service Provider

| Touchpoint | Messenger Operation | When |
|------------|-------------------|------|
| Monitor inquiries | `watch_conversations` with `unreadOnly` or `listFilterMode: "stranger"` | Daily — check for new customer messages |
| Respond to customers | `send_message` (reply auto-adds to friends) | As needed — timely response builds trust |
| Request customer info | `send_message` asking for `customer_required` fields | After order creation if not yet provided |
| Document agreements | `send_message` confirming terms, changes, custom work | Immediately after agreement — creates evidence trail |
| Dispute defense | `generate_wts` + `sign_wts` + `send_file` | When a customer escalates — prove good-faith communication |

> **Full workflow**: See [wowok-provider](../wowok-provider/SKILL.md) for the complete service provider journey.

### Arbitrator

| Touchpoint | Messenger Operation | When |
|------------|-------------------|------|
| Receive evidence | `watch_messages` or `watch_conversations` | When parties submit WTS files |
| Verify evidence | `verify_wts` on received files | Before reviewing — ensure evidence integrity |
| Communicate with parties | `send_message` for clarification requests | During dispute review |
| Sign attestation | `sign_wts` on verified evidence | After verification — arbitrator endorses authenticity |

> **Full workflow**: See [wowok-arbitrator](../wowok-arbitrator/SKILL.md) for the complete arbitration process.

---

## Common Pitfalls

- **One-message limit trap**: Sending a vague first message to a stranger wastes your only chance. Make the first message complete and actionable.
- **Disabled messenger**: Without a messenger name set, your account has no endpoint — counterparties cannot find or message you.
- **WTS range too narrow**: Selecting only favorable messages undermines evidence credibility. Include the full conversation.
- **Guard list without strategy**: Adding a Guard to your list without testing it (`gen_passport`) means you don't know what conditions strangers must meet — you may be blocking legitimate contacts.
- **`allowStrangerMessages: false` with no guard list and no friends**: Nobody can contact you. Always ensure at least one inbound path exists.
- **Stale passports**: `passportValiditySeconds` too short causes frequent re-verification failures. Match duration to your Guard's data volatility.

---

## Appendices (Progressive Disclosure)

> The following sections have been extracted to [APPENDIX.md](./APPENDIX.md) for on-demand loading:
> - Dialogue Scripts (R1-R10) — guided conversation scripts
> - Decision Trees — branching logic reference
> - Failure Playbooks — recovery scenarios
> - Tier Layering — expertise-tier based guidance
>
> Load APPENDIX.md when the user needs guided dialogue, recovery help, or tier-specific guidance.
