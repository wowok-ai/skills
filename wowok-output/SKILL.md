---
name: wowok-output
description: |
  WoWok output processing and display — post-processes all WoWok tool responses
  for human-readable presentation. Handles address resolution, name mapping,
  amount formatting, and data visualization.
when_to_use:
  - AI has received response from any WoWok MCP tool
  - Response contains addresses requiring name resolution
  - Response contains amounts requiring human-readable formatting
  - User queries on-chain data (events, objects, tables)
always: true
---

# Address Display Rules

## Override Condition

If user explicitly requests full/long addresses (e.g., "show full addresses", "do not abbreviate"),
this skill's shortening rules are DISABLED — display complete 66-character addresses.

## Client Rendering (authoritative)

Inside the WoWok client, AI replies render every `0x…` address AUTOMATICALLY as
the canonical address pill — local name (if any), system short id, auto-resolved
object-type icon, and hover actions (copy / message / AI / on-chain query).
Therefore: **write full `0x`-prefixed addresses in replies**; the client does the
display formatting. The text rules below apply only to plain-text contexts
where the client renderer is unavailable (CLI, raw logs).

## Short Address Format

**MUST APPLY TO ALL ADDRESSES AND OBJECT IDs** (0x prefix + up to 64 hex chars).

System-wide rule (identical to the client's `formatAddress`):
1. Remove the `0x` prefix → hex string
2. Keep the FIRST 4 and the LAST 3 hex chars, joined by `-`
3. Convert to UPPERCASE
4. 7 hex chars or fewer → the whole string, uppercased
5. Empty / missing → `--`

**Examples**:
| Full Address | Short ID | Rule |
|---|---|---|
| `0xa1d421902a3e5f2e4da7590e8f243712b3b3479d1a07c48c2de543184fc97a33` | `A1D4-A33` | first 4 + `-` + last 3 |
| `0x10ef0000000000000000000000000000000000000000000000000000000cda11` | `10EF-A11` | first 4 + `-` + last 3 |
| `0x2` | `2` | ≤7 chars, as-is |

## Resolution Priority & Display Format

**Query Tool**: `query_toolkit` with `query_type: "local_names"`

Returns: `{ account?: string, local_mark?: string, address: string }`

### Display Format Rules (STRICT — mirrors the client's `displayLabelOf`)

| Condition | Display Format | Example |
|-----------|----------------|---------|
| **Named** (account or local_mark resolved) | `{name}` only — NEVER append the short id | `alice_wallet` |
| **Unnamed** | `{SHORTID}` | `10EF-A11` |

- A named object shows ONLY its name — no parentheses, no short id after it.
- When both an account name and a local_mark exist, prefer the local_mark
  (object names) for objects and the account name for user addresses.

---

## Name Display

- Display the resolved name in full — the client does NOT truncate names.

# Amount Formatting Rules

## Primary Source: `_money_display`

The MCP fund layer now annotates all monetary query results with `_money_display` — a map of field paths to `ChainValueDisplay` objects containing `{raw, display, symbol, decimals, precision_known, text}`. **Use `_money_display` directly when present** — it is the authoritative formatted display, consistent with the MCP's own precision resolution.

- `precision_known === true` → `text` field already contains the complete formatted string: e.g. `"2.2 WOW (decimals: 9; raw: 2200000000)"`
- `precision_known === false` → `text` contains the raw value with a retry hint; show as-is (the true raw value is authoritative)

Supported query types with `_money_display`:
- `account_balance` — balance and coin amounts
- `onchain_objects` — Treasury, Service, Order, Allocation, Payment, Reward, Arb, Discount monetary fields
- `onchain_table_item_treasury_history` / `onchain_table_item_reward_record` — table entry amounts
- `onchain_received` — CoinWrapper balances
- `onchain_transaction` — balance_changes (each change has its own `coin_type`)
- `onchain_events` — NewOrderEvent.amount (via the order's Service generic token type)

## Fallback (when `_money_display` is absent)

**When in doubt, display raw value.**

| Condition | Display | Example |
|-----------|---------|---------|
| Token info UNAVAILABLE | Raw amount | `500000000` |
| Token info AVAILABLE | Converted + symbol + precision | `2.2 WOW (decimals: 9; raw: 2200000000)` |

**Formula**: `converted = raw / (10 ^ decimals)`  
**Format**: `{amount} {symbol} (decimals: {N}; raw: {raw})`

---

# Event Display Format

## Table Format

```
| # | Time | Sender | Service | Amount | Order |
|---|------|--------|---------|--------|-------|
| 1 | {time} | {name-or-SHORTID} | {name-or-SHORTID} | {amount} | SHORTID |
```

**Note**: `{name-or-SHORTID}` follows Display Format Rules above — name ONLY when
resolved, otherwise the short id (no parentheses in either case).

## Event Type Fields

| Event Type | Key Fields |
|------------|------------|
| `NewOrderEvent` | sender, service, amount, object |
| `ProgressEvent` | order, operator, machine |
| `ArbEvent` | arbitration, voter, order, service |
| `DemandPresentEvent` | demand, presenter, service |
| `DemandFeedbackEvent` | demand, feedbacker |
| `NewEntityEvent` | entity |

---

# Field Explanations

When user asks about field meanings:

## Addresses
- **Sender**: Account that initiated the transaction
- **Service**: Service object being ordered/interacted with
- **Order Object**: Unique on-chain identifier for this order
- **Short Address**: System-wide shortened id for quick visual identification — first 4 + `-` + last 3 hex chars, uppercase (see Short Address Format rules)

## Amounts
- **Raw**: Actual U64 integer stored on-chain
- **Converted**: Human-readable after applying decimals
- **Precision (N decimals)**: Number of decimal places
- **`_money_display`**: MCP-annotated display map (see Amount Formatting Rules above)

## Time
- **Timestamp**: Unix milliseconds since epoch
- **Human-readable**: Converted local time

---

# Implementation Checklist

- [ ] Extract unique addresses from response
- [ ] Query `local_names` for resolution
- [ ] Check for `_money_display` annotations in query results (primary amount source)
- [ ] If `_money_display` absent, query `token_list` for manual amount formatting
- [ ] Apply address format rules
- [ ] Apply amount format rules (use `_money_display` first; fallback to conservative)
- [ ] Render final output

---

# Related Skills

| Skill / MCP Knowledge | Purpose |
|-------|---------|
| MCP `schema_query` action='get_safety_rules' | Pre-operation safety checks (sunk from wowok-safety) |
| MCP `schema_query` action='get_guard_design_patterns' | Guard design & validation (sunk from wowok-guard) |
| MCP `schema_query` action='get_tool_reference' | Tool selection patterns (sunk from wowok-tools) |
| [wowok-order](../wowok-order/SKILL.md) | Order lifecycle (buyer) |
| [wowok-provider](../wowok-provider/SKILL.md) | Service management (merchant) |
| [wowok-arbitrator](../wowok-arbitrator/SKILL.md) | Dispute resolution |
| [wowok-machine](../wowok-machine/SKILL.md) | Workflow design |
| [wowok-messenger](../wowok-messenger/SKILL.md) | Encrypted communication |

---
