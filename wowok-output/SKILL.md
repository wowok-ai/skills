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

## Short Address Format

**MUST APPLY TO ALL ADDRESSES AND OBJECT IDs** (0x prefix + 64 hex chars = 66 chars total).

Generate a short ID by the following rules:
1. Remove `0x` prefix → get the hex string
2. Take the first 5 characters (or fewer if the address is shorter)
3. Convert to UPPERCASE
4. **If all 5 characters are the same character** (e.g., `00000` → `AAAAA`), fall back to the last 5 characters, prefixed with `...`
5. **If even the last 5 are all the same character** (extremely rare), find 5 consecutive characters near the middle that differ, wrapped with `...` on both sides
6. **Display rule**: no parentheses by default; parentheses are only used when paired with a name (see Display Format Rules below)

**Examples**:
| Full Address | Short ID | Rule |
|---|---|---|
| `0xa1d421902a3e5f2e4da7590e8f243712b3b3479d1a07c48c2de543184fc97a33` | `A1D42` | Normal: first 5 |
| `0x00000123456789abcdef0123456789abcdef0123456789abcdef000000000000` | `...00000` | First 5 all same → last 5 |
| `0x00000000000000000000000000000000000000000000000000000000000000000` | `...00000...` | Both ends all same → middle 5 |
| `0x2` | `2` | Short address, take actual length |

## Resolution Priority & Display Format

**Query Tool**: `query_toolkit` with `query_type: "local_names"`

Returns: `{ account?: string, local_mark?: string, address: string }`

### Display Format Rules (STRICT)

| Condition | Display Format | Example |
|-----------|----------------|---------|
| **Both account AND local_mark exist** | `{account_name} \| {local_mark_name}({ID})` | `alice \| my_mark(A1D42)` |
| **Only account exists** | `{account_name}({ID})` | `alice_wallet(A1D42)` |
| **Only local_mark exists** | `{local_mark_name}({ID})` | `my_service(A1D42)` |
| **Neither exists** | `{ID}` | `A1D42` |

---

## Name Length Limit

- **Maximum display length**: 20 characters
- **Overflow handling**: Truncate to 17 chars + `...`
- **Example**: `three_body_signature_service_v2` → `three_body_sig...`

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
| 1 | {time} | {name}(ABCDE) | {name}(ABCDE) | {amount} | ABCDE |
```

**Note**: `{name}` follows Display Format Rules above (account | local_mark). If no name, show only the short ID (no parentheses).

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
- **Short Address (ABCDE)**: Shortened ID for quick visual identification — see Short Address Format rules (first 5 chars; fallback to last 5 or middle 5 if all same)

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
