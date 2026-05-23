---
name: wowok-messenger
description: |
  WoWok Messenger — end-to-end encrypted communication for pre-order negotiation,
  evidence collection, and dispute resolution.

  Core features: send/receive encrypted messages, generate WTS evidence files,
  verify message authenticity, manage conversation lists, and integrate with
  arbitration workflows.

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

End-to-end encrypted messaging for secure off-chain business communication with tamper-proof audit trails.

> **Role**: Any WoWok participant (customer, service provider, arbitrator)  
> **Prerequisites**: Understand the tool pattern — use `schema_query({ action: "get", name: "messenger_operation" })`  
> **Related Skills**: [wowok-guard](../wowok-guard/SKILL.md) (guard-based spam protection), [wowok-arbitrator](../wowok-arbitrator/SKILL.md) (WTS evidence in disputes), [wowok-safety](../wowok-safety/SKILL.md) (safety), [wowok-tools](../wowok-tools/SKILL.md) (tool reference)

---

## Core Concepts

### Trust Model

The messenger operates on a **triple-trust model**. For detailed architecture and communication mechanisms, see the [Messenger Deep Dive Documentation](https://github.com/wowok-ai/docs/blob/main/docs/stage-03b-messenger.md).

**Key Design Decisions**:
- Messages are **NOT on-chain**. Communication is off-chain for privacy and cost efficiency.
- The server **cannot read** messages. Ciphertext is opaque; only endpoints hold decryption keys.
- The server **proves message order**. Its Falcon512 signature on the Merkle tree is verifiable by anyone.
- On-chain proof is **optional**. A message's Merkle root can be anchored to the blockchain via `proof_message`.

### Evidence Closure Principle

> **A message becomes valid evidence ONLY when the recipient explicitly responds to or decrypts it.**

One-sided claims are not evidence. The system enforces this through cryptographic and behavioral rules:
- A message alone proves nothing about the recipient's awareness.
- ARK confirmation (recipient-signed receipt) creates cryptographic proof both parties acknowledge the message.
- A reply is the strongest form of acknowledgment — it proves the recipient held the session key and acted on the message.
- WTS files include both sides of the conversation for complete context.
- Arbitration requires **confirmed**, reciprocated evidence — never unilateral claims.

---

## 1. Message Delivery Mechanism

### 1.1 Message Delivery & Stranger Rules
Messages from **strangers** (addresses not in the recipient's friends list) are subject to additional restrictions:

- **One-message limit**: A stranger may send exactly one message. Until the recipient replies, any further messages from the same stranger are rejected.
- **Reply unlocks**: When the recipient replies, the stranger is automatically added to the recipient's friends list, and both parties can message freely thereafter.
- **Cool-down window**: The one-message restriction persists for a configurable duration. If the recipient does not reply within this window, the stranger may retry one message.
- **Recipient opt-out**: A recipient can disable stranger messages entirely. When blocked, the sender receives the recipient's guard list as an alternative contact path.

**Rationale**: This design prevents unsolicited spam while allowing legitimate first contact. The one-message limit forces the stranger to make their opening message count, and auto-friend-on-reply ensures smooth continuation once the recipient engages.

### 1.2 Guard Message Flow (Spam-Bypass Path)

When a sender provides both `guardAddress` and `passportAddress`, the server verifies the guard and passport are valid. On success the message is delivered; on failure the sender is notified.

**When to use**: When the recipient has disabled stranger messages and you are not in their friends list, the rejection response includes the recipient's guard list. Obtain a valid passport from one of those guards and resend with both `guardAddress` and `passportAddress`.

### 1.3 Session and Message Sequence

Every conversation between two addresses has a deterministic session, ensuring both parties share the same session context. Messages are ordered by a monotonically increasing index starting from zero, establishing their absolute position in the conversation.

---

## 2. Anti-Spam Mechanism

### 2.1 Protection Model

Messages are evaluated in four sequential layers: **Blacklist** → **Friends List** → **Guard Verification** → **Stranger Rules**. See the [technical documentation](https://github.com/wowok-ai/docs/blob/main/docs/stage-03b-messenger.md) for implementation details.

### 2.2 List Management

Three independently managed lists control who can reach you:

| List | Purpose | Operations | Hard Limits |
|------|---------|------------|-------------|
| **Blacklist** | Block specific addresses completely | `add`, `remove`, `clear`, `get`, `exist` | Server-configured max (default 1000) |
| **Friends List** | Allow trusted contacts to bypass all checks | `add`, `remove`, `clear`, `get`, `exist` | Server-configured max (default 1000) |
| **Guard List** | Specify which guards can verify strangers | `add`, `remove`, `get` | Server-configured max (default 100) |

**Tool**: `messenger_operation` with `blacklist`, `friendslist`, or `guardlist` operation.

**Guard List Configuration**: Each entry requires:
- `guard`: The on-chain Guard object ID or name (see [wowok-guard](../wowok-guard/SKILL.md) for Guard design)
- `passportValiditySeconds`: How long a passport from this guard remains valid for messaging (typically 60s to 7 days)

Strangers with a valid passport from any guard in your list can message you. Passports are generated via `onchain_operations` with `gen_passport`.

### 2.3 Settings Control

Each user can configure two spam-protection parameters:

**Tool**: `messenger_operation` with `settings` operation (`get` or `set`).

- **`allowStrangerMessages`**: Toggle whether strangers (non-friends, non-guard-verified) can send you messages at all.
  - `true` (default): Strangers can send one message each (subject to the one-message limit).
  - `false`: All stranger messages are rejected. The rejection response includes your `guard_list` so the sender can obtain a passport and retry.
  
- **`maxInboxSize`**: Maximum messages retained in your inbox (typically 10–1000). Older messages are removed when the limit is reached.

**Note**: The server also has global defaults for these settings.

---

## 3. WTS (Witness Timestamped Sequence) Mechanism

### 3.1 What WTS Is

A WTS file is a **tamper-proof, self-verifying export** of a **continuous** conversation message sequence between two parties. Every message in the chain is cryptographically linked to its predecessor; any gap or modification breaks the entire chain, making tampering immediately detectable. Participant signatures can be added for non-repudiation. Anyone can use a WTS file to verify the authenticity, continuity, and integrity of the conversation content.


### 3.2 The Reciprocity Principle

> **Only messages that the other party has replied to have evidentiary value.**

A message alone proves nothing about the recipient's awareness. When the **recipient replies**, their reply references the last message they received, creating cryptographic proof of receipt. A WTS file shows the full conversation — which messages were acknowledged and which were not.

**In practice**: When generating WTS for arbitration, include the full conversation so the arbitrator can see who said what, who acknowledged what, and the exact sequence of events.

### 3.3 WTS Workflow

**Step 1 — Generate WTS**:

**Tool**: `messenger_operation` with `generate_wts` operation.

Key decisions:
- **Range selection**: Choose which messages to include by time range, message ID range, or sequence index (leafIndex) range.
- **Output**: One or more `.wts` files are written to the specified output directory (files are split if the total exceeds file size limits).

**Step 2 — Sign WTS**:

**Tool**: `messenger_operation` with `sign_wts` operation.

Adds your Falcon512 (post-quantum) signature to the WTS metadata, proving you endorse the conversation record as accurate. Multiple signatures from any party are supported — participants, arbitrators, or other third parties can all sign to attest to the content.

**Step 3 — Verify WTS**:

**Tool**: `messenger_operation` with `verify_wts` operation.

Verification validates each message's authenticity, the sequence's continuity, the payload's integrity, and all signatures added in Step 2. When all pass, the WTS is **proven authentic, complete, and untampered** — admissible as cryptographic evidence.

**Step 4 — Convert to HTML (optional)**:

**Tool**: `messenger_operation` with `wts2html` operation. Produces a human-readable HTML document.


**Step 5 — Submit as evidence**:

Use `send_file` to send the signed WTS file to an arbitrator's messenger address. The arbitrator can then independently verify the WTS using their own `verify_wts` call.

### 3.4 On-Chain Proof (Optional)

**Tool**: `messenger_operation` with `proof_message` operation.

Anchors a message to the WoWok blockchain, creating an **immutable on-chain timestamp** that proves the message existed before that point in time. Anyone can verify the message against this on-chain record independently.

---

## 4. Role-Specific Patterns

### 4.1 Customer → Service Provider

**Order creation and information delivery**:

1. **Discover the service's messenger contact**:
   - Query the Service object via `query_toolkit` with `query_type: "onchain_objects"` to extract `service.um` (Contact object ID)
   - Query the Contact object to get `ims[].at` (list of messenger addresses the provider accepts messages at)

2. **Send required customer information** (post-order):
   - After order creation, check the Service's `customer_required` field (phone, email, delivery address, etc.)
   - **AI should prompt**: Ask if the user wants to save this information to `local_info` for future use, or retrieve existing info from `local_info_list` to avoid re-entry
   - Retrieve matching private information from local storage using `query_toolkit` → `local_info_list`
   - Send via `messenger_operation` with `send_message` to the provider's customer service address
   - **Request explicit confirmation** — unconfirmed delivery may stall order progress
   - If this is first contact, you have exactly one message — make it count

3. **WTS is for disputes only**: Generate WTS only when a disagreement escalates and arbitration evidence is required. Normal conversations are already preserved.

### 4.2 Service Provider → Customer

**Customer service response**:

1. **Check conversations**: Use `watch_conversations` to see pending inquiries.
2. **Respond promptly**: Use `send_message` to reply. Your reply automatically adds the customer to your friends list if they were a stranger.
3. **Document agreements**: For any commitments (pricing, timeline changes, custom work), confirm them in messages. These become evidence if disputes arise.
4. **WTS for disputes**: If a disagreement escalates, the provider may generate and sign WTS to demonstrate good faith and support their position.

**Best practices for providers**:
- Respond promptly to maintain trust
- Document all agreements and changes in messages
- Confirm understanding before proceeding with orders
- Use guard list to allow verified strangers to reach you without opening to all strangers

---

## 5. Operation Order and Dependencies

### 5.1 Account Setup Prerequisites

Before using the messenger, the account must be properly initialized:

1. **Account must exist**: Created via `account_operation` (LOCAL operation).
2. **Messenger must be enabled**: Set a messenger name on the account via `account_operation` to enable Messenger functionality; clear it to disable.


### 5.2 List and Settings Order

When configuring spam protection:
1. **Get current state**: Use `settings` (`get`) and list operations (`get`) to see the current configuration.
2. **Add trusted contacts**: Use `friendslist` (`add`) for known counterparties.
3. **Configure guards**: Use `guardlist` (`add`) if you want to accept verified strangers. The Guard objects must already exist on-chain (see [wowok-guard](../wowok-guard/SKILL.md)).
4. **Set stranger policy**: Use `settings` (`set`) with `allowStrangerMessages` to toggle stranger access.
5. **Block unwanted**: Use `blacklist` (`add`) for addresses you never want to hear from.

---

## 6. Schema Reference

All messenger operations and their parameters are defined in a single schema:

**Query**: `schema_query({ action: "get", name: "messenger_operation" })`

This returns the complete discriminated union schema covering all 16 sub-operations with their parameter shapes and constraints.

Related schemas for cross-workflow operations:

| Purpose | Schema Name |
|---------|-------------|
| All messenger operations | `messenger_operation` |
| Query on-chain objects (services, guards, contacts) | `query_toolkit` |
| On-chain operations (gen_passport for guard) | `onchain_operations` |
| Local account management | `account_operation` |
| Local address book (marks) | `local_mark_operation` |
| Local private info storage | `local_info_operation` |
---

## 7. Quick Reference

### Messaging

| Goal | Operation | Key Parameters |
|------|-----------|----------------|
| Send text | `send_message` | `from`, `to`, `content`, `options.guardAddress?`, `options.passportAddress?` |
| Send file | `send_file` | `from`, `to`, `filePath`, `options.contentType?` |
| View conversations | `watch_conversations` | `filter.unreadOnly?`, `filter.previewMessageCount?`, `filter.sortBy?` |
| View messages | `watch_messages` | `filter.peerAddress?`, `filter.direction?`, `filter.contentType?`, `filter.keyword?` |
| Mark as read | `mark_messages_as_viewed` | `messageIds`, `account?` |
| Mark convo read | `mark_conversation_as_viewed` | `peerAddress`, `account?` |

### Evidence (WTS)

| Goal | Operation | Key Parameters |
|------|-----------|----------------|
| Export | `generate_wts` | `params.myAccount`, `params.peerAccount`, `params.range?`, `params.outputDir` |
| Sign | `sign_wts` | `wtsFilePath`, `account`, `outputPath?` |
| Verify | `verify_wts` | `wtsFilePath` |
| View HTML | `wts2html` | `wtsPath`, `options.title?`, `options.theme?` |
| Prove on-chain | `proof_message` | `account`, `messageId`, `network` |
| Extract ZIP | `extract_zip_messages` | `account`, `messages`, `outputDir` |

### List Management

| Goal | Operation | Key Parameters |
|------|-----------|----------------|
| Add friend | `friendslist` (`add`) | `account`, `users` (addresses/names) |
| Block user | `blacklist` (`add`) | `account`, `users` (addresses/names) |
| Add guard | `guardlist` (`add`) | `account`, `guards[].guard`, `guards[].passportValiditySeconds` |
| Toggle strangers | `settings` (`set`) | `account`, `allowStrangerMessages` |

### Local Storage

| Goal | Tool | Key Parameters |
|------|------|----------------|
| Write private info | `local_info_operation` (add) | `data`: array of `{ name, default, contents }` |
| Read private info | `query_toolkit` → `local_info_list` | `filter.name?` |
