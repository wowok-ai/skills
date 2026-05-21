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
> **Guard Design**: See [wowok-guard](../wowok-guard/SKILL.md) if configuring guard-based spam protection  
> **Tool Reference**: See [wowok-tools](../wowok-tools/SKILL.md) for MCP tool schemas

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

Every conversation between two addresses has a deterministic session, ensuring both parties share the same session context.

- Messages are ordered by a monotonically increasing index starting from zero, establishing their absolute position in the conversation.
- Each message includes the index of the last message the sender received, enabling both parties to track what the other has seen and detect gaps.
- The sequence is verifiable: anyone can confirm a chain of messages is complete and untampered by checking that successive entries chain correctly and indices are consecutive.

---

## 2. Anti-Spam Mechanism

### 2.1 Three-Tier Protection Model

The server evaluates every incoming message against the recipient's configuration in this exact order:

```
Incoming Message
       │
       ▼
┌─ Blacklist Check ─────────────────────────────────────────────┐
│  Is sender in recipient's blacklist?                          │
│  YES → Reject immediately ("You are in the blacklist")        │
│  NO  → Continue                                               │
└───────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ Friends List Check ──────────────────────────────────────────┐
│  Is sender in recipient's friends list?                       │
│  YES → Accept immediately (bypass all further checks)         │
│  NO  → Continue                                               │
└───────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ Guard Message Check ─────────────────────────────────────────┐
│  Did sender provide guardAddress + passportAddress?           │
│  YES → Route to guard verification queue (pending path)       │
│  NO  → Continue                                               │
└───────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ Stranger Message Check ──────────────────────────────────────┐
│  Is allow_stranger_messages enabled for recipient?            │
│  NO  → Reject with guard_list (enables guard retry)           │
│  YES → Has sender already sent a stranger message?            │
│        YES → Reject ("one stranger message only")             │
│        NO  → Accept, set stranger key with TTL                │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 List Management

Three independently managed lists control who can reach you:

| List | Purpose | Operations | Hard Limits |
|------|---------|------------|-------------|
| **Blacklist** | Block specific addresses completely | `add`, `remove`, `clear`, `get`, `exist` | Server-configured max (default 1000) |
| **Friends List** | Allow trusted contacts to bypass all checks | `add`, `remove`, `clear`, `get`, `exist` | Server-configured max (default 1000) |
| **Guard List** | Specify which guards can verify strangers | `add`, `remove`, `get` | Server-configured max (default 100) |

**Tool**: `messenger_operation` with `blacklist`, `friendslist`, or `guardlist` operation.

**Guard List Configuration**: Each guard entry requires:
- `guard`: The on-chain Guard object ID or name. This Guard defines the validation rules a stranger must satisfy (e.g., "holds a verified identity passport", "has staked above X tokens").
- `passportValiditySeconds`: Duration in seconds that a passport from this guard remains valid for messaging. Must be within server-defined bounds (typically 60s to 7 days). A shorter TTL means more frequent re-verification but tighter security.

**How guards work for messaging**: A guard is an on-chain programmable validation rule (see [wowok-guard](../wowok-guard/SKILL.md)). When added to your guard list, it becomes a filter: strangers who hold a valid passport from that guard can message you. The passport is generated on-chain via `onchain_operations` with `gen_passport` and serves as a cryptographic proof that the holder satisfies the guard's conditions.

### 2.3 Settings Control

Each user can configure two spam-protection parameters:

**Tool**: `messenger_operation` with `settings` operation (`get` or `set`).

- **`allowStrangerMessages`**: Toggle whether strangers (non-friends, non-guard-verified) can send you messages at all.
  - `true` (default): Strangers can send one message each (subject to the one-message limit).
  - `false`: All stranger messages are rejected. The rejection response includes your `guard_list` so the sender can obtain a passport and retry.
  
- **`maxInboxSize`**: Maximum number of messages retained in your server inbox. Must be within server-defined bounds (typically 10–1000). Older messages beyond this limit are dropped (FIFO eviction).

**Server defaults**: The server also has global defaults for `allow_stranger_messages` and message TTLs, configurable by the server operator.
---

## 3. WTS (Witness Timestamped Sequence) Mechanism

### 3.1 What WTS Is

A WTS file is a **tamper-proof, self-verifying export** of a **continuous** conversation message sequence between two parties. Every message in the chain is cryptographically linked to its predecessor; any gap or modification breaks the entire chain, making tampering immediately detectable. Participant signatures can be added for non-repudiation. Anyone can use a WTS file to verify the authenticity, continuity, and integrity of the conversation content.


### 3.2 The Reciprocity Principle

> **Only messages that the other party has replied to have evidentiary value.**

This principle is fundamental to WTS:

- A message that was sent but never acknowledged proves nothing about the recipient.
- When the **recipient replies**, their reply's `lastReceivedLeafIndex` references the message they are responding to. This creates cryptographic proof of receipt.
- A WTS file shows the full conversation, including which messages were acknowledged (via `lastReceivedLeafIndex` tracking) and which were not.
- The WTS HTML view highlights the sender's `lastReceivedLeafIndex` to clearly show what each party had seen at each point.

**In practice**: When generating WTS for arbitration, include the full conversation so the arbitrator can see who said what, who acknowledged what, and the exact sequence of events.

### 3.3 Message Sequence is Deterministic

Every message in a conversation has a **deterministic, verifiable position**:

- **leaf_index** is strictly sequential (0, 1, 2, ...) within each conversation session
- The Merkle tree links all messages: `Merkle(message[N]) = SHA256(message[N-1].merkleRoot, SHA256(message[N].plaintextHash, serverTimestamp))`
- **No gaps are possible**: If leaf indices are 0, 1, 3, then message 2 is missing — the WTS verifier detects this as a chain discontinuity.
- **No tampering is possible**: Changing any message changes its hash, which changes all subsequent merkle roots, which breaks the chain and the final hash.

**This means**: A WTS file is a complete, untampered record. Either all messages are present and intact, or the verification fails.

### 3.4 WTS Workflow

**Step 1 — Generate WTS**:

**Tool**: `messenger_operation` with `generate_wts` operation.

Key decisions:
- **Range selection**: Choose which messages to include by time range, message ID range, or sequence index (leafIndex) range.
- **Plaintext inclusion**: By default, plaintext is included. Set `excludePlaintext: true` if you want the file to contain only hashes (smaller, more privacy-preserving, but less human-readable).
- **Output**: One or more `.wts` files are written to the specified output directory (files are split if the total exceeds file size limits).

**Step 2 — Verify WTS**:

**Tool**: `messenger_operation` with `verify_wts` operation.

Verification checks performed:
1. File structure integrity (required fields present)
2. Merkle chain continuity (each `prev_root` matches previous `merkle_root`, leaf indices are consecutive)
3. Plaintext hash validation (computed hash matches stored hash for each message)
4. Server signature validation (Falcon512 signature on each `(prev_root, merkle_root, timestamp, server_public_key)`)
5. Content hash validation (SHA256 of the entire payload matches `meta.hash`)

**Step 3 — Sign WTS**:

**Tool**: `messenger_operation` with `sign_wts` operation.

Adds your Falcon512 signature to the WTS metadata. This proves you endorse the conversation record as accurate. Multiple signatures are supported — both parties can sign the same WTS for mutual agreement.

**Step 4 — Convert to HTML (optional)**:

**Tool**: `messenger_operation` with `wts2html` operation.

Produces a human-readable HTML document with:
- Conversation transcript with timestamps
- Visual indicators for acknowledged messages (via `lastReceivedLeafIndex`)
- Verification status summary
- Themed output (light or dark)
- Ready for sharing with arbitrators or other third parties

**Step 5 — Submit as evidence**:

Use `send_file` to send the signed WTS file to an arbitrator's messenger address. The arbitrator can then independently verify the WTS using their own `verify_wts` call.

### 3.5 On-Chain Proof (Optional)

**Tool**: `messenger_operation` with `proof_message` operation.

Anchors a single message's Merkle root to the WoWok blockchain, creating an **immutable timestamp** for that message. This is useful when:
- You need to prove a message existed before a certain time
- You want the strongest possible evidence for arbitration
- The conversation involves high-value commitments

The proof creates an on-chain object that stores the Merkle root and timestamp. Anyone can verify the message against this on-chain record.

---

## 4. All Features and Usage

### 4.1 Unified Tool: `messenger_operation`

All messenger functionality is accessed through a single MCP tool with sub-operations:

**Schema Reference**: `schema_query({ action: "get", name: "messenger_operation" })`

| Operation | Category | Description |
|-----------|----------|-------------|
| `send_message` | Messaging | Send encrypted text to a recipient |
| `send_file` | Messaging | Send a file (ZIP-compressed) to a recipient |
| `watch_conversations` | Query | List all conversations with unread counts and previews |
| `watch_messages` | Query | List messages with extensive filtering |
| `extract_zip_messages` | Utility | Decrypt and extract ZIP files from messages |
| `generate_wts` | Evidence | Export conversation as WTS evidence file |
| `verify_wts` | Evidence | Verify WTS file integrity and authenticity |
| `sign_wts` | Evidence | Add your signature to a WTS file |
| `wts2html` | Evidence | Convert WTS to human-readable HTML |
| `proof_message` | Evidence | Anchor a message's Merkle root on-chain |
| `blacklist` | Spam | Manage your blacklist (add, remove, clear, get, exist) |
| `friendslist` | Contacts | Manage your friends list (add, remove, clear, get, exist) |
| `guardlist` | Spam | Manage your guard verification list (add, remove, get) |
| `settings` | Spam | Configure spam protection settings (get, set) |
| `mark_messages_as_viewed` | Read Status | Mark specific messages as viewed |
| `mark_conversation_as_viewed` | Read Status | Mark entire conversation as viewed |

### 4.2 Sending Messages

**Tool**: `messenger_operation` with `send_message`.

**Key parameters**:
- `from`: Sender account (optional, uses default if omitted)
- `to`: Recipient address, account name, or local mark
- `content`: Plaintext message body
- `options.guardAddress` and `options.passportAddress`: Required for guard-mediated messages (when the recipient blocks strangers)
- `options.force`: Force-send to override a pending guard message and send immediately

**What happens on success**:
- Returns the `messageId`, `status` (confirmed or pending), and `merkleData` (leaf_index, prev_root, new_root, server_signature)
- For guard messages, also receives `pendingMerkleData` — Merkle proofs for other verified messages in the same conversation that the sender may have missed

**Message size limit**: Plaintext is limited to approximately 10KB for normal text messages.

### 4.3 Sending Files

**Tool**: `messenger_operation` with `send_file`.

Files are ZIP-compressed before encryption. The file metadata (name, size, SHA256 hash, content type) is embedded in the message for integrity verification on the recipient side.

**Key parameters**:
- `filePath`: Absolute path to the local file
- `options.fileName`: Custom display name for the recipient
- `options.contentType`: Semantic type — `"wts"` for WTS evidence files, `"wip"` for product promises, `"zip"` for generic files
- Also supports guard parameters for spam bypass

**File extraction**: The recipient uses `extract_zip_messages` to decrypt and extract received ZIP files to a local directory. The file hash is verified against the embedded metadata.

### 4.4 Querying Conversations and Messages

#### watch_conversations

Lists all conversations for the current (or specified) account. Each conversation entry includes:
- `peerAddress`: The other party's address
- `lastMessageAt`: Timestamp of the most recent message
- `messageCount`: Total messages exchanged
- `unreadCount`: Messages received but not yet viewed (based on `viewedAt` field)
- `previewMessages`: Latest N messages with full content (configurable, default 2)

**Filter parameters**:
- `unreadOnly`: Show only conversations with unread messages
- `startTime` / `endTime`: Filter by last message time (milliseconds)
- `previewMessageCount`: How many recent messages to include (0 = no preview, just stats)
- `sortBy`: `"lastMessageAt"` (default), `"unreadCount"`, or `"messageCount"`
- `sortOrder`: `"desc"` (default) or `"asc"`
- `skipAutoMarkViewed`: If `true`, does not automatically mark preview messages as viewed

**Auto-mark-viewed behavior**: By default, when you query conversations with preview messages, the returned messages are automatically marked as viewed (viewedAt timestamp set). Set `skipAutoMarkViewed: true` for background queries that should not affect read status.

#### watch_messages

Lists individual messages with comprehensive filtering. All filter fields are optional and can be combined.

**Identity and direction filters**:
- `account`: Which account's messages to query
- `peerAddress`: Filter to a specific conversation partner
- `direction`: `"sent"` or `"received"`
- `status`: Filter by message status (pending, confirmed, decrypted, etc.)

**Content filters**:
- `contentType`: `"text"`, `"zip"`, `"wts"`, or `"wip"` — filter by message content type
- `msgType`: Underlying Signal Protocol type (PREKEY_MESSAGE = 3 for session establishment, NORMAL_MESSAGE = 1)
- `keyword`: Search within decrypted plaintext
- `decryptedOnly`: Only messages successfully decrypted
- `confirmedOnly`: Only messages with Merkle tree confirmation

**Time filters**:
- `timeField`: Which timestamp to filter on — `"createdAt"` (client send time), `"receivedAt"` (local receive time), or `"serverTimestamp"` (server confirmation time). Defaults to `"createdAt"`.
- `startTime` / `endTime`: Generic range applied to the selected `timeField`
- Specific field ranges: `createdAtStart`/`createdAtEnd`, `receivedAtStart`/`receivedAtEnd`, `serverTimestampStart`/`serverTimestampEnd`

**Evidence-related filters**:
- `arkConfirmedOnly`: Messages that have recipient ARK confirmation
- `arkTimestampStart` / `arkTimestampEnd`: Filter by ARK confirmation time
- `proofedOnly`: Messages with on-chain proof
- `hasLastReceivedIndexOnly`: Messages where the sender included a `lastReceivedLeafIndex`

**View status filters**:
- `viewed`: `true` (only viewed), `false` (only unviewed), or omitted (all)
- `viewedAtStart` / `viewedAtEnd`: Filter by view timestamp range
- `skipAutoMarkViewed`: Do not auto-mark returned messages as viewed

**List-based filters** (for spam-aware queries):
- `listFilterMode`: `"friends"` (only friends), `"guard"` (only guard-verified), `"stranger"` (only strangers), `"any"` (all)
- `customListFilter`: Advanced combination with `includeAddresses`, `excludeAddresses`, and `relation` (`"union"` or `"intersection"`)

**Pagination**: `limit` (result count) and `offset` (starting position). `sortOrder`: `"asc"` (oldest first) or `"desc"` (newest first, default).

### 4.5 Read Status Management

**Tool**: `messenger_operation` with `mark_messages_as_viewed` or `mark_conversation_as_viewed`.

- `mark_messages_as_viewed`: Sets `viewedAt` timestamp on specific message IDs. Used when the user explicitly reads messages.
- `mark_conversation_as_viewed`: Marks all unviewed received messages in a conversation with a given peer as viewed. Used when entering a chat screen.

The `viewedAt` timestamp is local metadata (stored on the device, not synced to the server). It drives unread counts in `watch_conversations`.

### 4.6 File Extraction

**Tool**: `messenger_operation` with `extract_zip_messages`.

Decrypts and extracts ZIP-compressed files from received messages. Accepts either message objects (from `watch_messages`) or message ID strings. Extracted files are written to the specified output directory, and the message's `zipMetadata` is updated with the local cache path.

### 4.7 Proof on Chain

**Tool**: `messenger_operation` with `proof_message`.

Anchors a confirmed message's Merkle root to the blockchain. The message must have:
- Server signature (proving server attestation)
- Complete Merkle proof data (leaf_index, prev_root, new_root, server_timestamp)
- Decrypted plaintext (for hash verification)

Returns the on-chain proof object address, which can be queried via `query_toolkit`.

---

## 5. Role-Specific Patterns

### 5.1 Customer → Service Provider

**Pre-purchase negotiation**:

1. **Discover the service's messenger contact**:
   - Query the Service object via `query_toolkit` with `query_type: "onchain_objects"` to extract `service.um` (Contact object ID)
   - Query the Contact object to get `ims[].at` (list of messenger addresses the provider accepts messages at)

2. **Send initial inquiry**:
   - Use `messenger_operation` with `send_message`
   - Be specific: what do you want to know about the product, delivery, refund policy, etc.
   - If this is first contact, you have exactly one message — make it count

3. **Wait for explicit confirmation**:
   - The provider's reply confirms they received and read your message
   - Their reply's `lastReceivedLeafIndex` proves they saw your specific message

4. **Generate WTS for key commitments**:
   - Use `generate_wts` after important agreements (price, timeline, deliverables)
   - Keep WTS files as evidence in case of disputes

**AI should proactively suggest clarifying**:
- Exact deliverables and acceptance criteria
- Timeline and milestones
- Refund and cancellation terms
- Shipping and delivery specifics
- Any custom requirements not in the service listing

### 5.2 Service Provider → Customer

**Customer service response**:

1. **Check conversations**: Use `watch_conversations` to see pending inquiries.
2. **Respond promptly**: Use `send_message` to reply. Your reply automatically adds the customer to your friends list if they were a stranger.
3. **Document agreements**: For any commitments (pricing, timeline changes, custom work), confirm them in messages. These become evidence if disputes arise.
4. **Generate WTS for important commitments**: Export and sign WTS for significant agreements. This demonstrates professionalism and builds trust.

**Best practices for providers**:
- Respond promptly to maintain trust
- Document all agreements and changes in messages
- Confirm understanding before proceeding with orders
- Generate WTS for commitments that affect order fulfillment
- Use guard list to allow verified strangers to reach you without opening to all strangers

### 5.3 Arbitration Evidence Submission

**Process**:

1. **Generate WTS**: Use `generate_wts` to export the relevant conversation. Set the range to cover the negotiation period for the disputed order.

2. **Verify integrity**: Use `verify_wts` to confirm the WTS is valid before submitting.

3. **Sign the WTS**: Use `sign_wts` to add your cryptographic endorsement.

4. **Submit to arbitrator**: Use `send_file` to send the signed WTS to the arbitrator's messenger address (obtained from the Arbitration object's contact info).

5. **Optional — Convert to HTML**: Use `wts2html` for a human-readable version to accompany the submission.

---

## 6. Operation Order and Dependencies

### 6.1 Account Setup Prerequisites

Before using the messenger, the account must be properly initialized:

1. **Account must exist**: Created via `account_operation` (LOCAL operation).
2. **Messenger must be enabled**: The account must have a messenger name set (`m` field in account data).
3. **Device registration**: On first use, the Messenger SDK automatically registers the device with the server (uploads identity key, signed prekey, one-time prekeys, PQ prekey).
4. **Prekey replenishment**: The SDK monitors one-time prekey counts and automatically refills when below threshold.

The SDK handles initialization automatically — AI does not need to manually trigger these steps.

### 6.2 List and Settings Order

When configuring spam protection:
1. **Get current state**: Use `settings` (`get`) and list operations (`get`) to see the current configuration.
2. **Add trusted contacts**: Use `friendslist` (`add`) for known counterparties.
3. **Configure guards**: Use `guardlist` (`add`) if you want to accept verified strangers. The Guard objects must already exist on-chain (see [wowok-guard](../wowok-guard/SKILL.md)).
4. **Set stranger policy**: Use `settings` (`set`) with `allowStrangerMessages` to toggle stranger access.
5. **Block unwanted**: Use `blacklist` (`add`) for addresses you never want to hear from.

### 6.3 WTS and Evidence Order

For evidence submission:
1. **Collect messages**: Use `watch_messages` with appropriate filters to confirm you have all messages.
2. **Generate WTS**: Creates the evidence file from local message storage.
3. **Verify WTS**: Confirms the file is internally consistent before submission.
4. **Sign WTS**: Adds your endorsement.
5. **Submit**: Send file to arbitrator.
6. **Optionally, prove on-chain**: Use `proof_message` on key messages for immutable timestamps.

---

## 7. Security Model

### 7.1 End-to-End Encryption

- **Algorithm**: Signal Protocol (X25519 + ML-KEM-768 double ratchet)
- **Forward secrecy**: Compromising a session key does not reveal past messages (ratchet steps forward only)
- **Post-compromise security**: Compromising a session key reveals only a window of future messages before the next ratchet step
- **Key establishment**: First message uses one-time prekeys (X25519) and PQ prekeys (ML-KEM-768) for hybrid post-quantum security

### 7.2 Identity Verification

- Every API request is signed with the user's Falcon512 private key
- The server derives the user's address from their public key using WoWok's address scheme
- The server validates the signature against the derived address before processing
- Different request types use different signature messages to prevent cross-context replay

### 7.3 Server Trust Model

The server is **trusted for availability and ordering**, but **not trusted for confidentiality**:

| What the server CAN do | What the server CANNOT do |
|------------------------|---------------------------|
| Store encrypted messages | Read message plaintext |
| Order messages in Merkle tree | Tamper with message sequence (detectable via Merkle verification) |
| Verify spam protection rules | Impersonate users (Falcon512 signatures are client-side) |
| Reject messages (spam rules) | Create fake messages with valid signatures |
| Provide Merkle proofs | Forge Merkle proofs (its signature is verifiable against its public key) |

### 7.4 Key Rotation

- **Server keys**: The messenger server uses Falcon512 key pairs with automatic rotation. Old public keys are retained for signature verification of historical messages.
- **WTS server keys**: WTS files include a `serverPublicKeys` array in metadata with validity periods, enabling verification of messages signed under different server keys.
- **Client keys**: Signal Protocol sessions periodically ratchet, and one-time prekeys are consumed and replenished.

---

## 8. Schema Reference

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

---

## 9. Quick Reference

| Goal | Operation | Key Parameters |
|------|-----------|----------------|
| Send text | `send_message` | `from`, `to`, `content`, `options.guardAddress?`, `options.passportAddress?` |
| Send file | `send_file` | `from`, `to`, `filePath`, `options.contentType?` |
| View conversations | `watch_conversations` | `filter.unreadOnly?`, `filter.previewMessageCount?`, `filter.sortBy?` |
| View messages | `watch_messages` | `filter.peerAddress?`, `filter.direction?`, `filter.contentType?`, `filter.keyword?` |
| Export evidence | `generate_wts` | `params.myAccount`, `params.peerAccount`, `params.range?`, `params.outputDir` |
| Verify evidence | `verify_wts` | `wtsFilePath` |
| Sign evidence | `sign_wts` | `wtsFilePath`, `account`, `outputPath?` |
| View as HTML | `wts2html` | `wtsPath`, `options.title?`, `options.theme?` |
| Prove on-chain | `proof_message` | `account`, `messageId`, `network` |
| Extract ZIP files | `extract_zip_messages` | `account`, `messages`, `outputDir` |
| Add friend | `friendslist` (`add`) | `account`, `users` (addresses/names) |
| Block user | `blacklist` (`add`) | `account`, `users` (addresses/names) |
| Add guard | `guardlist` (`add`) | `account`, `guards[].guard`, `guards[].passportValiditySeconds` |
| Toggle strangers | `settings` (`set`) | `account`, `allowStrangerMessages` |
| Mark as read | `mark_messages_as_viewed` | `messageIds`, `account?` |
| Mark convo read | `mark_conversation_as_viewed` | `peerAddress`, `account?` |

---

## 10. Safety Checklist

**Before sending critical messages**:
- [ ] Recipient address is correct (double-check via `local_mark_operation` if using marks)
- [ ] Message content is clear and unambiguous
- [ ] Important terms (prices, deadlines, deliverables) are explicitly stated
- [ ] Request explicit confirmation for binding agreements
- [ ] Consider guard parameters if the recipient blocks strangers

**Before using messages as evidence**:
- [ ] Messages have server confirmation (status is `confirmed`)
- [ ] Recipient has replied or acknowledged (ARK confirmation, or their reply references your message via `lastReceivedLeafIndex`)
- [ ] WTS file has been generated and verified (`verify_wts` returns valid)
- [ ] WTS file has been signed with your key (`sign_wts`)
- [ ] Submit within any applicable arbitration deadline
- [ ] File size is within limits (WTS max 5MB total, 500 messages per file)