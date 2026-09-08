---
name: wowok-governance
description: |
  WoWok Governance — the canonical skill for on-chain permission, data, and
  financial governance: the account that OWNS the objects keeps them healthy
  after setup.

  Covers Permission lifecycle (indexes, role assignment, entity table, admin
  transfer), Treasury/Allocation fund stewardship (deposit/withdraw, history
  audit, unclaimed payments), and Personal data boundaries (public identity,
  profile records). Governance is a continuous loop — inventory, decide,
  execute, audit — not a one-time setup.

  For building services, see wowok-provider. For market operations, see
  wowok-market.
when_to_use:
  - User wants to manage who can operate their objects (permission indexes, entity table)
  - User wants to deposit/withdraw treasury funds or audit fund history
  - User has unclaimed payments or wants to check claimable balances
  - User wants to update their public on-chain profile or personal data
  - User mentions "permission", "treasury", "governance", "manage assets", "audit funds"
role: shared
loading: on-demand
related:
  - wowok-provider
  - wowok-market
  - wowok-messenger
---

# WoWok Governance Guide

> **Role**: Object owner/admin — the account that carries administrative responsibility for Permission, Treasury, and Personal objects
> **Related Skills**: [wowok-provider](../wowok-provider/SKILL.md) (service build), [wowok-market](../wowok-market/SKILL.md) (market ops), [wowok-messenger](../wowok-messenger/SKILL.md) (contact)

---

## MCP Knowledge Layer

The following content has been pushed down to the MCP knowledge layer and is applied automatically — this Skill does NOT duplicate it:

| Content | Access via (MCP action) | Applied Via |
|---------|--------------------------|-------------|
| Permission safety rules (owner/admin/entity hierarchy) | `schema_query` action='get_safety_rules' | `onchain_operations` permission |
| Treasury/Permission/Personal object schema | `schema_query` action='get_schema' | governance operations |
| Unclaimed-payment detection | `keeper_operation` (payment_unclaimed scan) | monitor loop |
| Fund-flow event meanings (TreasuryEvent / AllocationEvent / RewardClaimEvent / RewardFundEvent) | event semantic registry | audit & monitor |

This Skill keeps the governance **conversation flow** — what to inventory, what to decide, what to execute, and how to audit.

---

## Governance Is a Loop, Not a Setup

Inventory → Decide → Execute → Audit. Governance objects are LIVE: a permission change takes effect on the next call, a withdraw is irreversible, a personal profile record is permanently public. Every change deserves an audit pass after execution.

---

## Domain 1: Permission Governance

A Permission object defines WHO can perform WHICH operations on your business objects (Service / Machine / Treasury …).

- **Indexes** (`permission.index_create`): create named role indexes (e.g. operator=1, finance=2) before assigning.
- **Role assignment** (`permission.role_assign`): bind indexes onto target objects — a mis-assigned role grants unintended operational authority immediately.
- **Entity table**: add/remove addresses per index. Review-first: list current entities before mutating (`query_objects` on the Permission object).
- **Audit**: `query_toolkit` query_type='onchain_table_item_permission_perm' checks what a specific address may do; query_type='address_profile' shows an address's permission memberships across all objects.

Rules of thumb:
- One Permission per business object family; reuse named indexes, don't proliferate unnamed ones.
- Removing an entity is immediate — the next operation by that address fails with "Permission denied" (abort code 5).
- Admin transfer is a high-trust operation: the new admin controls the whole table.

---

## Domain 2: Financial Governance

Fund stewardship across Treasury / Allocation / Reward / Payment.

- **Treasury**: deposit joins coins in (a Payment receipt is minted); withdraw splits balance out — irreversible, and when an `external_guard` is set the guard must validate first. `query_toolkit` query_type='onchain_table_item_treasury_history' audits every flow (op 0 Withdraw / 1 Deposit / 2 Receive) with amount + guard + timestamp.
- **Allocation**: runs distribute pool funds per sharing mode (Amount / Rate ‰ / Surplus). Review allocator guards periodically — a stale guard blocks legitimate distributions.
- **Unclaimed payments**: recipients hold frozen CoinWrappers until they unwrap. The keeper `payment_unclaimed` scan owns this reminder surface — run `keeper_operation` to list claimable payments and nudge recipients via Messenger. NewPaymentEvent is deliberately NOT push-bridged, to avoid duplicate reminders (P2-4 channel split).
- **Reward pools**: RewardFundEvent in / RewardClaimEvent out; a dry pool blocks claims — watch balances before announcing campaigns.

---

## Domain 3: Data Governance

- **Personal profile** (`personal` operations): your public on-chain identity. Everything here is PERMANENTLY PUBLIC — never anchor private data. Review-first: show the current record before every mutation.
- **Entity info**: description/info updates re-emit NewEntityEvent — counterparties' cached profiles refresh; keep descriptions accurate.
- **Repository data**: contribution/usage policies are designed at Repository level (see wowok-provider); governance audits consumption through the event stream.

---

## Monitor Loop

Governance goals close the loop through three channels:

- **Push**: fund-flow events (TreasuryEvent / AllocationEvent / RewardClaimEvent / RewardFundEvent) become goal-bound suggestions via SuggestionBridge.
- **Pull**: keeper scans (payment_unclaimed, balance thresholds) repeat reminders until resolved.
- **Audit**: after every governance write, re-query the object and confirm the post-state matches the intent.

---

## Core Interaction Principles

1. **Review-first**: always show current state + the exact delta before executing.
2. **User-driven**: surface options, never auto-execute — withdraw and admin transfer are irreversible.
3. **Disclose irreversibility**: say it explicitly for withdraw, admin transfer, and any personal-data write.
4. **Audit after**: every governance write ends with a re-query confirmation.

## Quick Reference

- Permission: indexes → role assignment → entity table; audit via permission_perm + address_profile.
- Treasury: deposit/withdraw + history audit; external_guard gates withdrawals.
- Unclaimed payments: keeper scan owns reminders; recipients unwrap CoinWrappers.
- Personal data: permanently public — review before every write.
