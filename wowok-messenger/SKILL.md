---
name: wowok-messenger
description: "WoWok Messenger — end-to-end encrypted communication for pre-order negotiation, evidence collection, and dispute resolution. Core features: send/receive encrypted messages, generate WTS evidence files, verify message authenticity, manage conversations with anti-spam controls, and integrate with arbitration workflows. Used by customers, service providers, and arbitrators for secure off-chain communication that creates tamper-proof audit trails. Use when: User needs to communicate with another party (buyer, seller, arbitrator); User wants to send encrypted messages for negotiation; User needs to generate WTS evidence files from conversations; User wants to verify message authenticity; User needs to manage conversation lists (friends, blacklist, guard); User mentions \"messenger\", \"message\", \"chat\", \"communication\", \"WTS\", \"evidence\"."
metadata:
  version: "2.1.0"
  role: shared
  related: "wowok-order, wowok-provider, wowok-arbitrator"
---

# WoWok Messenger Guide

End-to-end encrypted off-chain messaging with tamper-proof audit trails.

> **Role**: any WoWok participant.
> All 18 operations and exact parameter constraints are authoritative in the MCP schema — `schema_query` action=`get` name=`messenger_operation` before an unfamiliar call. This file covers **timing, evidence discipline, and anti-spam strategy** the schema can't tell you.
> Guard table design: `schema_query` actions `get_guard_design_patterns` / `get_safety_rules`.
> Related: [wowok-arbitrator](../wowok-arbitrator/SKILL.md) · [wowok-order](../wowok-order/SKILL.md) · [wowok-provider](../wowok-provider/SKILL.md)

---

## Core concepts

- **Trust model**: messages are off-chain and E2EE — the server stores opaque ciphertext. Ordering is verifiable: each message carries Merkle-tree data (`leafIndex` from 0, `prevRoot`/`newRoot`) with a server signature; identities use Falcon512 keys. On-chain anchoring (`proof_message`) is optional.
- **Evidence closure**: a message proves nothing about the recipient until the recipient **responds or decrypts it**. ARK is the recipient-signed receipt (message status `read`); a reply is stronger — it proves the recipient held the session key and acted. Arbitration needs reciprocated evidence, never unilateral claims.
- **Session**: one deterministic session per address pair, shared by both sides; `leafIndex` gives the absolute position of every message.

---

## Setup

1. Account exists — `account_operation` (gen).
2. Messenger enabled — `account_operation` `{messenger:{enabled:true, name_or_account}}`, or implicitly via `send_message`/`send_file` option `enable_messenger: true`.
3. Share the account's address with counterparties (`account_operation` get).

Without an enabled endpoint the account cannot receive. The local SDK enforces a per-device messenger-account cap — do NOT hardcode the number (it is a versioned constant and layers may differ). When enabling throws `Maximum <N> messenger accounts allowed, current count: <M>` (W_ERROR InvalidParam), quote N/M from the error verbatim and offer to disable an unused account (`messenger:{enabled:false}`) to free a slot.

### Contact object — the on-chain bridge

`Service.um`/`Arbitration.um` → a Contact → its `ims[]` endpoint addresses. Parties read `ims[]` to find where to send. IM mutations use built-in permission index **453 (CONTACT_IM)**, emit **no events** (re-poll after changes), and the Contact stays mutable (unlike Proof/Guard). Clear the `um` binding before deleting a bound Contact — schema: `onchain_operations_contact`.

---

## Daily loop

**Read.** `watch_conversations` (`unreadOnly`, previews, sort) for the inbox; `watch_messages` with `peerAddress` for one thread (keyword/direction/status/time/relationship filters, pagination). `pull_messages` syncs from server first when local data looks stale (new device, downtime); `allAccounts:true` fans out bounded concurrency (default 5) with one `{account, pulled, messages, error?}` entry per account. Reads auto-mark viewed — pass `skipAutoMarkViewed:true` to peek.

**Attachment read boundary.** Messages with `zipMetadata` never include payload bytes in any read op — only a byte-free `attachment` descriptor (`kind` image/video/audio/voice/file/wts/wip, `fileName`, `mimeType`, `size`, optional `caption`/media dims). Fetch bytes on demand with `save_attachment {messageId, outputDir?, saveAs?}` — sha256-verified before extraction, returns the absolute path, original filename restored.

**Send.** Text via `send_message` (≤10240 bytes); files/media/evidence via `send_file {filePath}` as an E2EE attachment envelope (encrypted `.wowok-manifest.json` + payload; server sees only `zipMetadata` — transport name/size/sha256/class; media uncompressed, docs/evidence deflated). Options include `kind` (set `voice` explicitly — webm can't be told apart from video), `caption` (E2EE), and `replyTo:{messageId}` for quote-reply (id must exist locally).

**First contact with a stranger = exactly one message.** Say who you are, why, and what you need. If delivery is rejected, the error carries `guardList`: get a passport from one of those Guards (`onchain_operations` `gen_passport`) and resend with `options.guardAddress` + `passportAddress` + `network` (Guard messages are a separate data system per network). When the recipient REPLIES, you are auto-added to **their** friends list and messaging opens up.

**Structured sends.**
- `send_required_info {fields:['phone',…]}` assembles a merchant's `customer_required` LocalInfo fields into one E2EE message (omit `fields` = all; explicit `content` overrides); result reports `sent_fields`. Never send without per-item user confirmation.
- Evidence-bearing acts inside an active Goal (`send_file` WTS/evidence, `proof_message`) take `goal_id` so they land on the Goal's TaskProcess stream.

**Mark read.** `mark_conversation_as_viewed` (whole thread) or `mark_messages_as_viewed` (1–1000 ids).

---

## Lists & anti-spam

Three independent **local, per-account** lists (never on-chain, never synced to any Contact):

| List | Ops | Intent |
|---|---|---|
| friends | add/remove/clear/get/exist | Mutual trust; auto-added when you reply to a stranger; friends bypass every gate |
| blacklist | add/remove/clear/get/exist | Hard block |
| guard | add/remove/get (max 10 entries) | Holder of a valid passport from a listed Guard may pass; entry `{guard, passportValiditySeconds}` = 10s…10y |

Delivery evaluates, in order: **blacklist (reject) → friends (accept) → guard passport (accept if valid) → stranger rule**. `settings {op:set, allowStrangerMessages, maxInboxSize}` toggles strangers entirely; the rejection error tells the sender what applies. The stranger window/retry timing is **server policy** — surface the server's rejection message rather than assuming a fixed cooldown; to stop repeat contact, blacklist the address.

`watch_messages` segments by relationship: `listFilterMode: friends|guard|stranger|any` (+ `customListFilter` include/exclude). Multiple guards are OR-ed — any one passing passport grants delivery. Match `passportValiditySeconds` to data volatility (payment gates tolerate days; order-state gates should be short) and test every guard with `gen_passport` before publishing it.

> Advisory profiles (NOT system states, just setting combinations): **Open** = strangers on, no guards, public-facing; **Guarded** = strangers off + 1–3 guards, verified-only; **Closed** = strangers off, no guards, friends-only; **Blocklist mode** = strangers on + a maintained blacklist. Choose by asking: may strangers reach you at all → if yes, anyone or guard-verified → anyone to hard-block. Always leave at least one inbound path.

---

## Evidence: WTS

WTS = tamper-proof, self-verifying export of a continuous conversation: messages are hash-chained (any gap/edit breaks verification), signatures give non-repudiation.

Workflow: `generate_wts {myAccount, peerAccount, range?}` (range by time/messageId/seqIndex; writes the `.wts` **and** a human-readable HTML companion — `htmlFiles`) → `sign_wts` (Falcon512; both parties may sign) → `verify_wts {wtsFilePath}` (`hashValid`, `signatureValid`, per-signer detail) → `wts2html` only for a custom theme/re-render (always writes files) → `send_file` to the arbitrator (stamp `goal_id`). To verify an incoming WTS, `save_attachment` it first, then `verify_wts` on the path.

- Export the **full conversation**, not favorable excerpts — selective exports destroy credibility.
- `proof_message {messageId, network}` anchors a message on-chain and returns `proofAddress` — a Proof object Guards can consume (`proof.signer`/`proof.time`), proving existence-before-time.
- WTS is dispute preparation, not routine archiving. Before filing, pre-sort with `evaluation_operation` action=`evidence_review` (usable/manual/rejected + `proof_candidates`; the human selects; nothing auto-attaches).

## Cross-role quick map

- **Customer**: inquire → `send_required_info` → track inbox → on dispute, full-range WTS, sign, send to arbitrator (see [wowok-order](../wowok-order/SKILL.md)).
- **Provider/merchant**: triage `stranger` inbox, reply (auto-friends), document agreements, defend with WTS (see [wowok-provider](../wowok-provider/SKILL.md)).
- **Arbitrator**: receive, `save_attachment` + `verify_wts` every piece, clarify via `send_message`, treat unverified material as non-evidence (see [wowok-arbitrator](../wowok-arbitrator/SKILL.md)).

## Pitfalls

- Vague first message to a stranger wastes the only shot; a `friendslist exist` check answers "why can't my friend reach me".
- Strangers off + no guards + empty friends = nobody inbound.
- Guards are immutable from creation — untested guard-list entries block legitimate contacts; expired passports show as guard rejection, not friend failure.
- Never treat on-chain Contact `ims[]` and the local friends list as the same system.
