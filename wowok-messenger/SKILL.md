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
---

# WoWok Messenger Guide

End-to-end encrypted messaging for secure business communication and arbitration evidence.

> **Purpose**: Secure off-chain communication with tamper-proof audit trails  
> **Customer Guide**: See [wowok-order](../wowok-order/SKILL.md) for buyer communication flows  
> **Provider Guide**: See [wowok-provider](../wowok-provider/SKILL.md) for seller customer service  
> **Arbitration Guide**: See [wowok-arbitrator](../wowok-arbitrator/SKILL.md) for evidence handling

---

## Core Concepts

### Messenger Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Sender    │ ──────► │  Messenger   │ ──────► │  Recipient  │
│  (Client)   │  E2E    │   Server     │  E2E    │  (Client)   │
└─────────────┘ Encrypt └──────────────┘ Encrypt └─────────────┘
       │                                              │
       └────────────── WTS Evidence ──────────────────┘
```

**Key Features**:
- **End-to-end encryption**: Messages encrypted on sender's device, decrypted on recipient's
- **NOT on-chain**: Communication happens off-chain for privacy and cost efficiency
- **WTS evidence**: Conversations can be exported as tamper-proof evidence files
- **ARK confirmation**: Recipient signs receipt, creating cryptographic proof of delivery

### Message Lifecycle

```
Created → Pending → Confirmed → Read
            │           │          │
            ▼           ▼          ▼
         Server     Recipient   Recipient
         receives   signs ARK   decrypts &
         message    receipt     views
```

### Evidence Closure Principle

> **Critical**: A message only becomes valid evidence when the recipient **explicitly confirms** it.

**Why This Matters**:
- One-sided claims are not evidence
- Recipient's ARK confirmation creates cryptographic proof both parties saw the message
- WTS files include both sent and confirmed messages for complete context
- Arbitration requires confirmed evidence, not unilateral claims

---

## Basic Operations

### Send a Message

**Tool**: `messenger_operation` with `send_message` operation.

**Key Fields**:
- `from`: Sender account (optional, uses default if omitted)
- `to`: Recipient address or account name
- `content`: Message text content

**Result**: Message ID, Merkle tree proof data, server confirmation

**Schema Reference**: `schema_query({ action: "get", name: "messenger_operation" })`

### Watch Conversations

**Tool**: `messenger_operation` with `watch_conversations` operation.

**Key Fields**:
- `filter.unreadOnly`: Show only conversations with unread messages
- `filter.previewMessageCount`: Number of recent messages to include per conversation
- `filter.sortBy`: Sort field (e.g., "lastMessageAt")
- `filter.sortOrder`: Sort direction ("asc" or "desc")

### Watch Messages

**Tool**: `messenger_operation` with `watch_messages` operation.

**Key Fields**:
- `filter.peerAddress`: Filter by specific peer
- `filter.direction`: "received" or "sent"
- `filter.decryptedOnly`: Show only successfully decrypted messages
- `filter.confirmedOnly`: Show only confirmed messages

### Send Files

**Tool**: `messenger_operation` with `send_file` operation.

**Key Fields**:
- `to`: Recipient address
- `filePath`: Path to file to send
- `options.contentType`: File type (files compressed as ZIP)
- `options.fileName`: Custom filename for the sent file

---

## Evidence Management (WTS)

WTS (Witness Transaction Statement) files are tamper-proof exports of conversation history for arbitration.

### Generate WTS Evidence

**Tool**: `messenger_operation` with `generate_wts` operation.

**Key Fields**:
- `params.myAccount`: Your account address/name
- `params.peerAccount`: Other party's address/name
- `params.range.type`: Range type ("time", "messageId", "seqIndex")
- `params.range.start`: Start boundary (timestamp, message ID, or sequence index)
- `params.range.end`: End boundary
- `params.outputDir`: Directory for output WTS file

**Range Types**:
- `time`: By timestamp range (milliseconds)
- `messageId`: By message ID range
- `seqIndex`: By sequence index range

### Verify WTS Authenticity

**Tool**: `messenger_operation` with `verify_wts` operation.

**Key Field**:
- `wtsFilePath`: Path to WTS file to verify

**Verification checks**:
- Hash integrity
- Signature validity
- Message authenticity

### Sign WTS

Add your signature to WTS for submission as arbitration evidence.

**Tool**: `messenger_operation` with `sign_wts` operation.

**Key Fields**:
- `wtsFilePath`: Path to WTS file to sign
- `account`: Your account for signing
- `outputPath`: Output path for signed WTS file

### Convert WTS to HTML

**Tool**: `messenger_operation` with `wts2html` operation.

**Key Fields**:
- `wtsPath`: Path to WTS file
- `options.title`: HTML document title
- `options.theme`: Visual theme ("light" or "dark")
- `options.outputPath`: Output path for HTML file

---

## List Management

### Friends List

Manage trusted contacts for easier messaging.

**Tool**: `messenger_operation` with `friendslist` operation.

**Operations**:
- `op: "add"`: Add users to friends list
  - `users`: Array of user addresses/names to add
- `op: "exist"`: Check if users are in friends list
  - `users`: Array of user addresses/names to check
- `op: "get"`: Retrieve current friends list

### Blacklist

Block unwanted contacts.

**Tool**: `messenger_operation` with `blacklist` operation.

**Key Fields**:
- `op`: Operation type ("add", "remove", "get")
- `users`: Array of user addresses/names (for add/remove)

### Guard List

Add Guards for message validation.

**Tool**: `messenger_operation` with `guardlist` operation.

**Key Fields**:
- `op`: Operation type ("add", "remove", "get")
- `guards`: Array of guard configurations with:
  - `guard`: Guard object ID/name
  - `passportValiditySeconds`: Passport validity duration

---

## Role-Specific Communication Patterns

### Customer → Service Provider

**Pre-Purchase Negotiation**:

1. **Get Service contact**:
   - Query Service object to extract `service.um` (Contact ID)
   - Query Contact object to get `ims[].at` (Messenger addresses)
   - **Tool**: `query_toolkit` with `onchain_objects` query type

2. **Send inquiry**:
   - Use `messenger_operation` with `send_message` operation
   - Include clear questions about deliverables, timeline, refund policy

3. **Wait for explicit confirmation (ARK)**:
   - Ensure recipient confirms understanding

4. **Generate WTS for evidence**:
   - Use `generate_wts` operation to export conversation

**Required Clarifications** (AI should proactively suggest):
- Exact deliverables and acceptance criteria
- Timeline and milestones
- Refund/cancellation terms
- Shipping/delivery details
- Custom requirements

### Service Provider → Customer

**Customer Service Response**:

Use `messenger_operation` with `send_message` operation to respond to customer inquiries.

**Best Practices**:
- Respond promptly to maintain trust
- Document all agreements in messages
- Confirm understanding before proceeding
- Generate WTS for important commitments

### Arbitration Evidence Submission

**Process**:

1. **Generate WTS from conversation history**:
   - Use `generate_wts` operation
   - Set range to cover order negotiation period
   - Specify output directory

2. **Sign WTS**:
   - Use `sign_wts` operation
   - Add your cryptographic signature

3. **Send to Arbitration contact**:
   - Use `send_file` operation
   - Send signed WTS file to arbitration's IM address

---

## Message Status Reference

| Status | Meaning | Evidence Value |
|--------|---------|----------------|
| `pending` | Sent, waiting for server | Low |
| `confirmed` | Server received | Medium |
| `read` | Recipient decrypted | High |
| `failed` | Delivery failed | N/A |
| `rejected` | Recipient rejected | N/A |
| `decrypted` | Successfully decrypted | High |
| `decrypt_failed` | Decryption error | N/A |

> **For Arbitration**: Only `read`/`decrypted` messages with ARK confirmation are strong evidence.

---

## Schema Reference

| Purpose | Schema Name |
|---------|-------------|
| All messenger operations | `messenger_operation` |
| WIP file operations (for product info) | `wip_file` |
| Query on-chain objects | `query_toolkit` |

**Query Schema**: `schema_query({ action: "get", name: "<schema_name>" })`

---

## Quick Reference

| Task | Operation |
|------|-----------|
| Send text message | `send_message` |
| Send file | `send_file` |
| View conversations | `watch_conversations` |
| View messages | `watch_messages` |
| Export evidence | `generate_wts` |
| Verify evidence | `verify_wts` |
| Sign evidence | `sign_wts` |
| Convert to HTML | `wts2html` |
| Manage friends | `friendslist` |
| Block users | `blacklist` |
| Configure Guards | `guardlist` |
| Mark as viewed | `mark_messages_as_viewed` |

---

## Safety Checklist

Before sending critical messages:
- [ ] Recipient address is correct
- [ ] Message content is clear and unambiguous
- [ ] Important terms are explicitly stated
- [ ] Request confirmation for agreements

Before using as evidence:
- [ ] Messages have ARK confirmation (recipient signed receipt)
- [ ] Generate and verify WTS file
- [ ] Sign WTS with your key
- [ ] Submit to arbitration within deadline
