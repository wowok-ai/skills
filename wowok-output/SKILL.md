---
name: wowok-output
description: "WoWok output processing and display — post-processes all WoWok tool responses for human-readable presentation. Handles address resolution, name mapping, amount formatting, and data visualization. Use when: AI has received response from any WoWok MCP tool; Response contains addresses requiring name resolution; Response contains amounts requiring human-readable formatting; User queries on-chain data (events, objects, tables)."
metadata:
  version: "2.1.0"
  role: shared
  loading: always
---

# WoWok Output Rules

Post-process every WoWok tool response before showing it: resolve addresses, format monetary fields from `_money_display`, render tables consistently.

# Addresses

## Environment split (decide first)

| Environment | Default display | Full address |
|---|---|---|
| **WoWok client** (rich chip renderer) | Full `0x`+64 hex in prose or inline code — the client converts it to a chip (name, DEFAULT badge, type icon, popup). Attach NO labels yourself | always |
| **Other / plain-markdown clients** | Resolved **name only**, else **SHORTID**; empty-name default account tagged `(default)` | only when the user explicitly asks |

Both environments:
- **NEVER hand-truncate with `…`** (`0x00f6…a5839` is forbidden — not resolvable, not copyable). SHORTID is the only compact form.
- The full address is always present in the tool result in context, so a name/SHORTID display loses nothing.
- Named → name ONLY, never `name 10EF-A11` and never append an id.

Explicit user overrides: "show full/complete/copyable address" → complete address in inline code (plus name when known: **alice_wallet** `0xFULL…`). "use short/compact" → SHORTID. WoWok client always stays full (the chip owns display).

## SHORTID (system rule, same as client `formatAddress`)

1. Strip `0x`; 2. first 4 + `-` + last 3 hex chars; 3. UPPERCASE; 4. ≤7 hex chars → whole string uppercased; 5. empty/missing → `--`.
Special: the blueprint sentinel `draft:<name>` is not an on-chain address — render `Draft`.

| Full | SHORTID |
|---|---|
| `0xa1d42190…184fc97a33` | `A1D4-A33` |
| `0x10ef0000…000cda11` | `10EF-A11` |
| `0x2` | `2` |

## Resolution

Batch-resolve with `query_toolkit` query_type=`local_names` → `{ account?, local_mark?, address }[]`. Prefer `local_mark` for objects, account name for user addresses. Unnamed → chip (WoWok client) or SHORTID + `(default)` for the empty-name on-chain default account elsewhere.

# Amounts

## Primary: `_money_display`

Monetary query results carry `_money_display`: a map of field paths → `{raw, display, symbol?, decimals?, token_type, precision_known, text}`. Use it directly — it is the authoritative precision-resolved display.

- `precision_known: true` → show `text` as-is, e.g. `2.2 WOW (decimals: 9; raw: 2200000000)`.
- `precision_known: false` → `display === raw`, no conversion happened; show the raw value (optionally retry token resolution via `token_list`).

Annotated query types: `account_balance`; `onchain_objects` (Treasury/Service/Order/Allocation/Payment/Reward/Arb/Discount monetary fields); `onchain_table_item_treasury_history`, `onchain_table_item_reward_record`; `onchain_received` (CoinWrapper); `onchain_transaction` (balance_changes, each with its own `coin_type`, signed); `onchain_events` (`NewOrderEvent.amount`, resolved via the order's Service token type).

## Fallback (no annotation)

When in doubt, raw. Token info unavailable → raw integer (`500000000`). Available → `raw / 10^decimals`, formatted `{amount} {symbol} (decimals: {N}; raw: {raw})`.

# Events

Table template: `| # | Time | Sender | Service | Amount | Order |` — address cells follow the environment split.

Key fields of the common built-in events (authoritative list + triggers live in the MCP Event Semantics Registry):

| Event | Key fields |
|---|---|
| `NewOrderEvent` | sender (base), object (Order), service, amount, allocation, progress |
| `ProgressEvent` | object (Progress), machine, task (usually the Order), node, forward, hold |
| `ArbEvent` | object (Arb case), arbitration, order, status, indemnity_amount, compensation_time |
| `VoteEvent` | object (Arb), voter, agrees, weight |
| `FeedbackEvent` | object (Arb), feedback |
| `ArbitrationEvent` | object (service), location, description, fee, voting_guard_count |
| `DemandPresentEvent` | object (Demand), service (Option), recommend |
| `DemandFeedbackEvent` | object (Demand), service (Option), feedback, acceptance_score (0–100, Option) |
| `DemandChangedEvent` | object (Demand), location, description, rewards |
| `NewEntityEvent` | resource, referrer (Option) |
| `ServiceEvent` / `AllocationEvent` / `TreasuryEvent` / `NewPaymentEvent` / `RewardClaimEvent` / `RewardFundEvent` | resolve via the registry rather than guessing field names |

# Field glossary

- **Raw**: on-chain u64 in smallest units. **Converted**: after dividing by 10^decimals. **Decimals**: token precision.
- **Time**: Unix **milliseconds**; render in the user's local time.
- **Sender**: transaction initiator; **Service**: the ordered object; **Order object** (`object` field on `NewOrderEvent`): the order's unique id.
- **SHORTID**: compact display (first4-`-`-last3 uppercase); never `…` truncation.

# Checklist

1. Collect unique addresses → one `local_names` batch.
2. Read `_money_display` first; only fall back to `token_list` + manual conversion when absent.
3. Apply the environment split (WoWok client: full addresses; others: name/SHORTID/`(default)`).
4. Keep event field names exact per the table above.
5. Render (tables: name/SHORTID cells unless full was requested).

> Design patterns and tool selection stay in the MCP knowledge layer: `schema_query` `get_safety_rules` / `get_guard_design_patterns` / `get_tool_reference`.
