---
name: wowok-governance
description: "WoWok Governance — the canonical skill for on-chain permission, data, and financial governance: the account that OWNS the objects keeps them healthy after setup. Covers Permission lifecycle (indexes, role assignment, entity table, admin transfer), Treasury/Allocation fund stewardship (deposit/withdraw, history audit, unclaimed payments), and Personal data boundaries (public identity, profile records). Governance is a continuous loop — inventory, decide, execute, audit — not a one-time setup. For building services, see wowok-provider. For market operations, see wowok-market. Use when: User wants to manage who can operate their objects (permission indexes, entity table); User wants to deposit/withdraw treasury funds or audit fund history; User has unclaimed payments or wants to check claimable balances; User wants to update their public on-chain profile or personal data; User mentions \"permission\", \"treasury\", \"governance\", \"manage assets\", \"audit funds\"."
metadata:
  version: "1.1.0"
  role: shared
  related: "wowok-provider, wowok-market, wowok-messenger"
---

# WoWok Governance Guide

> **Role**: Object owner/admin — the account that carries administrative responsibility for Permission, Treasury, and Personal objects
> **Related Skills**: [wowok-provider](../wowok-provider/SKILL.md) (service build), [wowok-market](../wowok-market/SKILL.md) (market ops), [wowok-messenger](../wowok-messenger/SKILL.md) (contact)
> Exact op shapes, field lists and enums live in the tool schemas — read `schema_query` `get` with `onchain_operations` (see the `permission` / `treasury` / `personal` `operation_type` branches) before mutating. Safety rules: `get_safety_rules`.

## Governance is a loop, not a setup

Inventory → decide → execute → **audit (re-query the post-state every time)**. These objects are live: a grant change applies on the next call, a withdraw is irreversible, a profile record is permanently public.

## Domain 1 — Permission governance

- **Inventory before mutating**: read the Permission via `query_toolkit` `onchain_objects`; audit one address with `onchain_table_item_permission_perm`; see every membership an address holds across objects with `address_profile` (batch form `address_profiles`, up to 50).
- **Index naming is not an "index creation"**: custom permission indexes are the numeric IDs 1000–65535 (built-ins reserved below); a readable name is just a `remark` write (`set` / `remove` / `clear`).
- **Choose the op family by shape** (`permission_operation`, exact params in schema):
  - one index → many entities: `add|set|remove perm by index`;
  - one entity → many indexes: `add|set|remove perm by entity`;
  - `set` REPLACES the whole list — warn before using; prefer `add`/`remove`;
  - entity hygiene: `swap` / `replace` / `copy` / `del`;
  - admins: `admin` `add|remove|set` — high-trust: a new admin controls the whole table.
- A removed entity's next call fails with permission#5 "Permission denied". Prefer one Permission per business-object family; reuse named indexes.

## Domain 2 — Financial governance

- **Treasury**: deposit joins coins in (Payment receipt minted); withdraw splits balance out — irreversible, and an `external_guard` on the Treasury must authorize it. Audit every flow with `query_toolkit` `onchain_table_item_treasury_history` (op `0` Withdraw / `1` Deposit / `2` Receive; amount + guard + timestamp).
- **Allocation**: modes Amount (fixed) / Rate (basis points, 10000 = 100%; pure-Rate must sum to 10000) / Surplus (remainder drain, ≤1 per Allocator). Review allocator guards periodically — a stale guard blocks legitimate distributions.
- **Unclaimed payments**: recipients own frozen CoinWrappers until unwrapped. The keeper owns this reminder surface: `keeper_operation` `scan` then `tasks` with `detector: "payment_unclaimed"`; nudge recipients via Messenger. `NewPaymentEvent` is deliberately NOT push-suggestion-bridged, to avoid duplicate reminders.
- **Reward pools**: funds in (RewardFundEvent) / claims out (RewardClaimEvent); a dry pool blocks claims — watch balances before announcing campaigns.

## Domain 3 — Data governance

- **Personal profile is permanently public** — never anchor private data; show the current record before every mutation.
- **Profile/contact description updates emit NO on-chain event** (`NewEntityEvent` fires only on entity registration). Counterparties see updates on their next object read — there is no push; tell the user this instead of promising a refresh.
- Repository contribution/usage policy belongs to [wowok-provider](../wowok-provider/SKILL.md); governance audits consumption via the event stream.

## Loop channels

- **Push**: fund-flow events (Treasury / Allocation / RewardFund / RewardClaim) become goal-bound suggestions through the monitor SuggestionBridge.
- **Pull**: keeper scans (`payment_unclaimed`, `progress_actionable`) repeat reminders until resolved; standing `auto_execute` exists only for claim-to-self.
- **Audit**: after every governance write, re-query and confirm the post-state matches intent.

## Interaction rules

1. **Review-first**: current state + exact delta before executing.
2. **User-driven**: never auto-execute — withdraw and admin changes are irreversible.
3. **Disclose irreversibility** for withdraw, admin transfer, and any personal-data write.
4. **Audit after**: end every governance write with a re-query confirmation.
