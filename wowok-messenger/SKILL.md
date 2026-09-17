---
name: wowok-messenger
description: "WoWok Messenger — end-to-end encrypted communication for pre-order negotiation, evidence collection, and dispute resolution. Core features: send/receive encrypted messages, generate WTS evidence files, verify message authenticity, manage conversations with anti-spam controls, and integrate with arbitration workflows. Used by customers, service providers, and arbitrators for secure off-chain communication that creates tamper-proof audit trails. Use when: User needs to communicate with another party (buyer, seller, arbitrator); User wants to send encrypted messages for negotiation; User needs to generate WTS evidence files from conversations; User wants to verify message authenticity; User needs to manage conversation lists (friends, blacklist, guard); User mentions \"messenger\", \"message\", \"chat\", \"communication\", \"WTS\", \"evidence\"."
metadata:
  version: "2.0.0"
  role: shared
  related: "wowok-order, wowok-provider, wowok-arbitrator"
---

# WoWok Messenger Guide

End-to-end encrypted messaging with tamper-proof audit trails.

> **Role**: Any WoWok participant
> All 18 operations with full parameter types and constraints are in the MCP schema (`messenger_operation`) — query it via `schema_query` action='get' name='messenger_operation' before an unfamiliar call. This document focuses on **design decisions, timing, and cross-role strategy** not captured by the schema.
> **Related Skills**: [wowok-arbitrator](../wowok-arbitrator/SKILL.md) (WTS evidence in disputes), [wowok-order](../wowok-order/SKILL.md) (customer perspective), [wowok-provider](../wowok-provider/SKILL.md) (service provider perspective)
> Guard design patterns and safety rules live in the MCP knowledge layer — query via `schema_query` actions `get_guard_design_patterns` / `get_safety_rules`; the per-tool action/parameter reference lives there too (`get_tool_reference`).

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
2. **Enable messenger** → `account_operation` (messenger), set `enabled: true`
3. **Get your address** → `account_operation` (get) — share this address with your counterparties

> Messenger must be enabled for message delivery. Without it, your account has no messenger endpoint and cannot receive messages. Account name is used for messenger identity lookup.

### Account Limit

A single device supports up to 20 messenger accounts (`MAX_MESSENGER_ACCOUNTS`). Exceeding this returns "Maximum 20 messenger accounts allowed, current count: N". Use `account_operation → messenger { enabled: false }` to disable unused accounts.

### Contact Object (On-Chain Bridge)

The on-chain **Contact** object (`operation_type: "contact"`) is the bridge between a Service and Messenger: `Service.um` → Contact → `ims[]` (Messenger endpoint addresses). Customers query the Contact's `ims[]` to find where to send messages.

**When to create**: before Service publish, when `customer_required` is set (Service.um must point to a Contact). Reuse one Contact across multiple Services sharing the same support channel.

**Timing/gotchas (the mutable-object discipline)**: Contact stays mutable (unlike Proof/Guard); IM mutations require built-in permission index 453 (CONTACT_IM) and emit no events — re-poll `ims[]` after changing it. Before deleting a Contact bound as `Service.um`, clear the binding first or you leave a dangling pointer. Op shapes, limits, and field constraints are authoritative in the schema — `schema_query` action='get' name='contact'.

---

## Daily Communication

The user's daily loop — these are the operations they will return to repeatedly.

### Check Inbox

Two approaches, depending on need:

- **Quick glance** — `watch_conversations` with `unreadOnly: true` lists all conversations with unread messages, sorted by activity. Each conversation shows a preview of the last messages.
- **Deep dive** — `watch_messages` with a specific `peerAddress` to view the full conversation with a particular counterparty. Supports keyword search, time-range filtering, direction filter, and status filter.
- **Server sync** — `pull_messages` fetches the latest messages from the server into local storage (optional `limit` caps batch size). Use this first when the local view looks stale (e.g. after downtime or on a new device session), then read via `watch_conversations` / `watch_messages`. Pass `allAccounts: true` (or `accounts: [...]`, optional `concurrency`, default 5) to fan out across every messenger-enabled account in one call — the result is one entry per account `{account, pulled, messages, error?}` with per-account failure isolation.

**Read boundary for attachments**: Attachment messages (those with `zipMetadata`) never expose their base64 payload in `watch_messages` / `watch_conversations` / `pull_messages` output — `plaintext` is omitted and a byte-free `attachment` descriptor is attached instead (`kind`: image/video/audio/voice/file/wts/wip, `fileName`, `mimeType`, `size`, optional `caption`/`durationMs`/`width`/`height`). This prevents multi-megabyte base64 blobs from flooding every read. Bytes are fetched on demand only (see Save Attachments below). Keyword search is a `watch_messages` filter (`keyword`, plus `direction` / `status` / `startTime`-`endTime` filters) — there is no separate search operation.

**Design note**: By default, retrieving messages auto-marks them as viewed (`viewedAt` timestamp). Set `skipAutoMarkViewed: true` if you want to peek without marking read.

### Send Messages

Plain text via `send_message`; files and media (images, audio, video, voice, documents, WTS/WIP evidence) via `send_file`.

**First-time contact with a stranger**: You get exactly one message. Make it count — include who you are, why you're contacting them, and what you need. After the recipient replies, you're auto-added to their friends list and can message freely.

**Guard-protected recipients**: If the recipient has disabled stranger messages, the rejection response includes their `guard_list`. Obtain a passport from one of those guards (`gen_passport` via `onchain_operations`), then resend with `guardAddress` + `passportAddress`.

**Attachments (envelope v2)**: `send_file` transports the file as an E2EE attachment envelope — a zip container with an encrypted `.wowok-manifest.json` (original file name, MIME, kind, caption, media metadata) plus a `payload/<original-name>` entry. The server only sees the unchanged `zipMetadata` (transport file name + size + sha256 + wts/wip/zip class); media (jpg/mp4/webm/…) is stored uncompressed, documents and evidence are deflated. Options: `kind` (media type is auto-inferred from extension; pass `kind: "voice"` explicitly for voice messages — webm cannot be distinguished from video automatically), `mimeType`, `caption` (E2EE, invisible to the server), `durationMs`/`width`/`height`. Old single-entry zips without a manifest remain readable forever (extension/type inference).

**Structured sends**:
- `send_required_info` — the dedicated path for a Service's `customer_required` fields: pass LocalInfo field names (`fields: ['phone','shipping_address']`) and the op assembles `field: value` lines in one E2E message (explicit `content` overrides; missing fields must be added first via `local_info_operation`). Prefer it over hand-formatting `send_message` — the result also reports `sent_fields`. Never send without the user's per-item confirmation.
- Quote-reply: pass `options.replyTo: {messageId}` (same conversation; the id must exist in local storage) instead of hand-quoting text.
- Goal-linked acts: when an evidence-bearing act belongs to an active Goal (e.g. submitting a WTS/evidence file via `send_file`, or anchoring via `proof_message`), stamp `goal_id` so it is recorded as communication evidence on the goal's TaskProcess — omit it for ordinary chatter.

### Save Attachments

- `save_attachment` with `{account?, messageId, outputDir?, saveAs?}` — decode the attachment and persist the **original file** (transport `.zip` suffix stripped; wts/wip keep their extension). Defaults to `<workspace>/attachments`; filename collisions get a ` (1)` suffix; returns the absolute path. The zip blob is sha256-verified against `zipMetadata.fileHash` before extraction. This is the replacement for the retired `extract_zip_messages` — to verify an incoming WTS, save it first, then call `verify_wts` on the returned path.
- Desktop clients additionally have an in-memory read bridge for inline media rendering (no temp files); AI flows use `save_attachment`.

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

> **"Friends" are local, not on-chain.** The friends list lives in the Messenger layer (`friendslist` op — server-side, per account) and gates message delivery only. The on-chain carrier is the Contact object's `ims[]` — owner-managed endpoints (permission 453, no request-accept flow). The two NEVER sync: replying to a stranger auto-adds them to YOUR local friends list; it does not touch any Contact. If a business flow needs an on-chain "friend" relationship, that is a contract-level feature request, not a messenger setting.

---

## Anti-Spam Strategy

The four-layer protection model evaluates every incoming message: Blacklist (reject) → Friends List (accept) → Guard Verification (accept if passport valid) → Stranger Rules (one-message limit).

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

The Guard list is where anti-spam becomes programmable. A Guard validates that a stranger **meets a verifiable condition** before allowing their message through (token/reputation/order/passport/payment gates — the design catalog with table shapes and query instructions lives in the MCP knowledge layer: `schema_query` action='get_guard_design_patterns'; do not re-derive Guard logic here).

**`passportValiditySeconds` trade-off**: Short (e.g. 60s) = higher security, re-verification per message. Long (e.g. 7 days) = better UX, one passport covers a week. Match to data volatility: payment-based guards tolerate longer durations; order-state guards should stay short (order state changes). Bounds (10s–10y) and the max-10 list size are enforced by the schema.

**Multiple guards**: listed guards are alternatives, not conjunctions — a passport from ANY one passes delivery. Use them to open different audience doors (e.g. one for existing customers, one for token holders).

### Strategy: Troubleshooting Anti-Spam Issues

| Symptom | Diagnosis | Solution |
|---------|-----------|----------|
| "My message was rejected" | Recipient has `allowStrangerMessages: false` and you're not their friend | Check rejection response for `guard_list` → obtain passport → resend with `guardAddress`+`passportAddress` |
| "I'm getting too much spam" | `allowStrangerMessages: true` with no filtering | Switch to Guarded profile: set `allowStrangerMessages: false`, add at least one Guard to guard list |
| "A legitimate customer can't reach me" | Guard requirements too strict, or their passport expired | Lower Guard requirements, extend `passportValiditySeconds`, or add them to friends list manually |
| "Stranger keeps spamming after cool-down" | Working as designed — one retry per cool-down | Add to blacklist |
| "I disabled strangers but my friend can't message" | They may not actually be in your friends list | Use `friendslist` → `exist` to verify; add manually if needed |

### Strategy: Filtering Messages by Source

`watch_messages` segments the inbox by relationship via `listFilterMode` (`friends` / `guard` / `stranger` / `any`, default any; `customListFilter` adds include/exclude lists — exact semantics in the schema).

**Operational rhythm**: a service provider triaging inbox first scans `friends` (known customers, low risk), then `stranger` (new inquiries need attention); guard-verified traffic is checked last.

---

## Evidence (WTS)

### Concept

A WTS file is a **tamper-proof, self-verifying export** of a continuous conversation. Every message is cryptographically chained; any gap or modification breaks the chain. Participant signatures add non-repudiation.

### The Workflow

When a dispute requires evidence: (1) `generate_wts` → export messages by time/messageId/seqIndex range — each WTS file is written **together with a human-readable HTML companion** (`htmlFiles`; no separate conversion needed); (2) `sign_wts` → add your Falcon512 signature (both parties can sign); (3) `verify_wts` → validate hash chain, continuity, and all signatures; (4) `wts2html` → only if you need a custom theme/title or a standalone re-render (it always writes files); (5) `send_file` → submit the signed WTS to the arbitrator via messenger (stamp the active goal's `goal_id`).

> **Key design decision**: Include the **full conversation** when generating WTS for arbitration — not just favorable messages. The arbitrator needs to see who said what, who acknowledged what, and the exact sequence. Selective exports undermine your credibility.

### On-Chain Proof (Optional)

`proof_message` anchors a message to the blockchain, creating an immutable timestamp proving the message existed before that point. Anyone can independently verify against this on-chain record.

### When to Generate WTS

- **Disputes only** — normal conversations are preserved server-side. WTS is evidence preparation, not archiving.
- **When the other party disputes a fact** — the WTS proves what was actually said and acknowledged.
- **When arbitration requires evidence submission** — signed WTS is the standard evidence format.

> Before filing a dispute, pre-screen your evidence collection via `evaluation_operation` action `evidence_review` (list mode): it partitions items into usable/manual/rejected and yields `proof_candidates` to reference in the dispute description (the human picks — nothing attaches automatically). Arbitrator-side flow: [wowok-arbitrator](../wowok-arbitrator/SKILL.md).

---

## Messenger Across Roles

**Customer**: Pre-order inquiry (`send_message` to provider) → submit required info (`send_required_info` over the `customer_required` fields) → track progress (`watch_messages`) → raise dispute (`generate_wts` + `sign_wts` + `send_file` to arbitrator). Full workflow: [wowok-order](../wowok-order/SKILL.md).

**Service Provider**: Monitor inquiries (`watch_conversations` with `unreadOnly` or `listFilterMode: "stranger"`) → respond to customers (reply auto-adds to friends) → request customer info → document agreements (creates evidence trail) → dispute defense (`generate_wts` + `sign_wts` + `send_file`). Full workflow: [wowok-provider](../wowok-provider/SKILL.md).

**Arbitrator**: Receive evidence (`watch_messages`/`watch_conversations`) → verify evidence (`verify_wts`) → communicate with parties (`send_message` for clarifications) → sign attestation (`sign_wts` on verified evidence). Full workflow: [wowok-arbitrator](../wowok-arbitrator/SKILL.md).

---

## Common Pitfalls

- **One-message limit trap**: Sending a vague first message to a stranger wastes your only chance. Make the first message complete and actionable.
- **Disabled messenger**: Without messenger enabled, your account has no endpoint — counterparties cannot find or message you.
- **WTS range too narrow**: Selecting only favorable messages undermines evidence credibility. Include the full conversation.
- **Guard list without strategy**: Adding a Guard to your list without testing it (`gen_passport`) means you don't know what conditions strangers must meet — you may be blocking legitimate contacts.
- **`allowStrangerMessages: false` with no guard list and no friends**: Nobody can contact you. Always ensure at least one inbound path exists.
- **Stale passports**: `passportValiditySeconds` too short causes frequent re-verification failures. Match duration to your Guard's data volatility.

---
