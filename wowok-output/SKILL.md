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

**MUST APPLY TO ALL ADDRESSES** (0x prefix + 64 hex chars = 66 chars total):
1. Remove `0x` prefix
2. Take first 5 characters
3. Convert to UPPERCASE
4. Wrap in parentheses `()`

**Example**: `0xa1d421902a3e5f2e4da7590e8f243712b3b3479d1a07c48c2de543184fc97a33` → `(A1D42)`

## Resolution Priority & Display Format

**Query Tool**: `query_toolkit` with `query_type: "local_names"`

Returns: `{ account?: string, local_mark?: string, address: string }`

### Display Format Rules (STRICT)

| Condition | Display Format | Example |
|-----------|----------------|---------|
| **Both account AND local_mark exist** | `{account_name} \| {local_mark_name} (ABCDE)` | `alice \| my_mark (A1D42)` |
| **Only account exists** | `{account_name} (ABCDE)` | `alice_wallet (A1D42)` |
| **Only local_mark exists** | `{local_mark_name} (ABCDE)` | `my_service (A1D42)` |
| **Neither exists** | `(ABCDE)` | `(A1D42)` |

---

## Name Length Limit

- **Maximum display length**: 20 characters
- **Overflow handling**: Truncate to 17 chars + `...`
- **Example**: `three_body_signature_service_v2` → `three_body_sig...`

# Amount Formatting Rules

## Conservative Principle

**When in doubt, display raw value.**

| Condition | Display | Example |
|-----------|---------|---------|
| Token info UNAVAILABLE | Raw amount | `500000000` |
| Token info AVAILABLE | Converted + symbol + precision | `0.5 WOW (9P)` |

## Conversion Requirements

ONLY convert when ALL conditions met:
1. Token type explicitly identified
2. Successfully queried via `query_toolkit` with `query_type: "token_list"`
3. Metadata contains valid `decimals` and `symbol`

**Formula**: `converted = raw / (10 ^ decimals)`  
**Format**: `{amount} {symbol} ({decimals}P)`

---

# Event Display Format

## Table Format

```
| # | Time | Sender | Service | Amount | Order |
|---|------|--------|---------|--------|-------|
| 1 | {time} | {name} (ABCDE) | {name} (ABCDE) | {amount} | (ABCDE) |
```

**Note**: `{name}` follows Display Format Rules above (account | local_mark). If no name, show only `(ABCDE)`.

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
- **Short Address (ABCDE)**: First 5 chars for quick visual identification

## Amounts
- **Raw**: Actual U64 integer stored on-chain
- **Converted**: Human-readable after applying decimals
- **Precision (XP)**: Number of decimal places

## Time
- **Timestamp**: Unix milliseconds since epoch
- **Human-readable**: Converted local time

---

# Implementation Checklist

- [ ] Extract unique addresses from response
- [ ] Query `local_names` for resolution
- [ ] Query `token_list` for amount formatting
- [ ] Apply address format rules
- [ ] Apply amount format rules (conservative)
- [ ] Render final output

---

# Related Skills

| Skill | Purpose |
|-------|---------|
| [wowok-safety](../wowok-safety/SKILL.md) | Pre-operation safety checks |
| [wowok-guard](../wowok-guard/SKILL.md) | Guard design & validation |
| [wowok-tools](../wowok-tools/SKILL.md) | Tool selection patterns |
| [wowok-order](../wowok-order/SKILL.md) | Order lifecycle (buyer) |
| [wowok-provider](../wowok-provider/SKILL.md) | Service management (merchant) |
| [wowok-arbitrator](../wowok-arbitrator/SKILL.md) | Dispute resolution |
| [wowok-machine](../wowok-machine/SKILL.md) | Workflow design |
| [wowok-messenger](../wowok-messenger/SKILL.md) | Encrypted communication |

---
