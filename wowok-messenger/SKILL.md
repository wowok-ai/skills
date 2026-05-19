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

```typescript
messenger_operation({
  operation: "send_message",
  from: "<your_account>",      // Optional, uses default if omitted
  to: "<recipient_address>",   // Can be address or account name
  content: "Your message here..."
})
```

**Result**: Message ID, Merkle tree proof data, server confirmation

### Watch Conversations

```typescript
messenger_operation({
  operation: "watch_conversations",
  filter: {
    unreadOnly: true,              // Only show conversations with unread messages
    previewMessageCount: 3,        // Include last 3 messages per conversation
    sortBy: "lastMessageAt",       // Sort by most recent activity
    sortOrder: "desc"
  }
})
```

### Watch Messages

```typescript
messenger_operation({
  operation: "watch_messages",
  filter: {
    peerAddress: "<other_party_address>",
    direction: "received",         // or "sent"
    decryptedOnly: true,
    confirmedOnly: true
  }
})
```

### Send Files

```typescript
messenger_operation({
  operation: "send_file",
  to: "<recipient_address>",
  filePath: "./document.pdf",
  options: {
    contentType: "zip",           // Files are compressed as ZIP
    fileName: "custom-name.zip"
  }
})
```

---

## Evidence Management (WTS)

WTS (Witness Transaction Statement) files are tamper-proof exports of conversation history for arbitration.

### Generate WTS Evidence

```typescript
messenger_operation({
  operation: "generate_wts",
  params: {
    myAccount: "<your_account>",
    peerAccount: "<other_party_address>",
    range: {
      type: "time",
      start: 1704067200000,        // Start timestamp (ms)
      end: 1706745600000           // End timestamp (ms)
    },
    outputDir: "./evidence/"
  }
})
```

**Range Types**:
- `time`: By timestamp range
- `messageId`: By message ID range
- `seqIndex`: By sequence index range

### Verify WTS Authenticity

```typescript
messenger_operation({
  operation: "verify_wts",
  wtsFilePath: "./evidence/conversation.wts"
})
```

**Verification checks**:
- Hash integrity
- Signature validity
- Message authenticity

### Sign WTS

Add your signature to WTS for submission as arbitration evidence:

```typescript
messenger_operation({
  operation: "sign_wts",
  wtsFilePath: "./evidence/conversation.wts",
  account: "<your_account>",
  outputPath: "./evidence/signed-conversation.wts"
})
```

### Convert WTS to HTML

```typescript
messenger_operation({
  operation: "wts2html",
  wtsPath: "./evidence/conversation.wts",
  options: {
    title: "Order Negotiation Evidence",
    theme: "light",
    outputPath: "./evidence/conversation.html"
  }
})
```

---

## List Management

### Friends List

Manage trusted contacts for easier messaging:

```typescript
// Add friends
messenger_operation({
  operation: "friendslist",
  friendslist: { op: "add", users: ["alice", "bob"] }
})

// Check if in friends list
messenger_operation({
  operation: "friendslist",
  friendslist: { op: "exist", users: ["alice"] }
})

// Get friends list
messenger_operation({
  operation: "friendslist",
  friendslist: { op: "get" }
})
```

### Blacklist

Block unwanted contacts:

```typescript
messenger_operation({
  operation: "blacklist",
  blacklist: { op: "add", users: ["spammer_address"] }
})
```

### Guard List

Add Guards for message validation:

```typescript
messenger_operation({
  operation: "guardlist",
  guardlist: {
    op: "add",
    guards: [
      { guard: "my-guard", passportValiditySeconds: 86400 }
    ]
  }
})
```

---

## Role-Specific Communication Patterns

### Customer → Service Provider

**Pre-Purchase Negotiation**:
```typescript
// 1. Get Service contact
query_toolkit({ query_type: "onchain_objects", objects: ["<service_name>"] })
// Extract: service.um → Contact → ims[].at

// 2. Send inquiry
messenger_operation({
  operation: "send_message",
  to: "<service_im_address>",
  content: "Questions about: deliverables, timeline, refund policy, shipping..."
})

// 3. Wait for explicit confirmation (ARK)
// 4. Generate WTS for evidence
```

**Required Clarifications** (AI should proactively suggest):
- Exact deliverables and acceptance criteria
- Timeline and milestones
- Refund/cancellation terms
- Shipping/delivery details
- Custom requirements

### Service Provider → Customer

**Customer Service Response**:
```typescript
messenger_operation({
  operation: "send_message",
  to: "<customer_address>",
  content: "Response to inquiry with clear terms..."
})
```

**Best Practices**:
- Respond promptly to maintain trust
- Document all agreements in messages
- Confirm understanding before proceeding
- Generate WTS for important commitments

### Arbitration Evidence Submission

```typescript
// 1. Generate WTS from conversation history
messenger_operation({
  operation: "generate_wts",
  params: {
    myAccount: "<your_account>",
    peerAccount: "<other_party_address>",
    range: { type: "time", start: <order_start>, end: <now> },
    outputDir: "./arbitration-evidence/"
  }
})

// 2. Sign WTS
messenger_operation({
  operation: "sign_wts",
  wtsFilePath: "./arbitration-evidence/negotiation.wts"
})

// 3. Send to Arbitration contact
messenger_operation({
  operation: "send_file",
  to: "<arbitration_im_address>",
  filePath: "./arbitration-evidence/signed-negotiation.wts"
})
```

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

```typescript
// All messenger operations
schema_query({ action: "get", name: "messenger_operation" })

// WIP file operations (for product info)
schema_query({ action: "get", name: "wip_file" })
```

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
