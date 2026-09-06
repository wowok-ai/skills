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

## Environment split (read first)

Address rendering differs by environment — pick the correct mode:

| Environment | Default display | Full address |
|---|---|---|
| **WoWok client** (rich renderer available) | Full address — the client converts it into an address chip (name, DEFAULT badge, type icon, popup) | Always |
| **Other AI clients** (plain MCP clients, markdown only) | Name when resolved, otherwise SHORTID; DEFAULT marker on the default account | ONLY when the user explicitly asks |

Rules that hold in BOTH environments:
- **NEVER truncate with `…`** (e.g. `0x00f6…a5839` is FORBIDDEN). It is neither a valid full address nor a valid SHORTID — it cannot be resolved, copied, or acted on. The only compact form allowed is the SHORTID transform defined below.
- The full 66-character address is ALWAYS present in the tool results injected into your context — nothing is lost when you display a name/SHORTID; you can produce the full address on request.

## Inside the WoWok client (rich rendering — authoritative)

The client renders EVERY complete `0x`-prefixed address in your reply
automatically as the canonical address chip — local name, DEFAULT badge,
first-byte object-type icon, and hover popup (Explorer / Analyze / AI / copy).

Therefore:
- Write the full address in prose OR in inline code — both become chips.
- Do NOT attach names, labels, short ids, or parentheses to an address (no `(default)`, no `Name 0x<full-address>`); the client resolves and renders name/type/DEFAULT state itself.

## Other AI clients (generic MCP clients — plain markdown, no custom renderer)

External clients render standard markdown only (no popup, no chips). Default to
a CONCISE display — full 66-char addresses are noisy and are not shown unless
asked:

- **Named** (account name or local_mark resolved via `local_names` / tool
  results): show the NAME ONLY, e.g. `alice_wallet`. Never append an id.
- **Unnamed**: show the SHORTID (format below), e.g. `10EF-A11`.
- **Default account** (the on-chain default account, which has an empty name):
  mark it as `(default)`, e.g. `(default) 10EF-A11`.
- In tables: name or SHORTID in the cell; the full address is omitted by default.
- **Full address on request**: when the user explicitly asks to see full /
  detailed / complete addresses ("show the full address", "give me the complete
  address", "copyable address"), output the COMPLETE `0x` + 64 hex chars
  wrapped in inline code so it is one-click copyable in any markdown client.
  When a name is known, put name + full address together:
  **alice_wallet** `0xFULLADDRESS`.

## User override

- Other clients, "show full / long / complete addresses" → output the full inline-code address for that reply.
- Other clients, "use short / compact" → SHORTID (already the default for unnamed addresses).
- WoWok client: always full addresses regardless — the chip renderer handles display.

## SHORTID format

System-wide rule (identical to the client's `formatAddress`):
1. Remove the `0x` prefix → hex string
2. Keep the FIRST 4 and the LAST 3 hex chars, joined by `-`
3. Convert to UPPERCASE
4. 7 hex chars or fewer → the whole string, uppercased
5. Empty / missing → `--`

**Examples**:
| Full Address | SHORTID | Rule |
|---|---|---|
| `0xa1d421902a3e5f2e4da7590e8f243712b3b3479d1a07c48c2de543184fc97a33` | `A1D4-A33` | first 4 + `-` + last 3 |
| `0x10ef0000000000000000000000000000000000000000000000000000000cda11` | `10EF-A11` | first 4 + `-` + last 3 |
| `0x2` | `2` | ≤7 chars, as-is |

## Resolution priority

**Query Tool**: `query_toolkit` with `query_type: "local_names"`

Returns: `{ account?: string, local_mark?: string, address: string }`

- Named (account or local_mark resolved): display the name ONLY (WoWok client
  renders the name chip itself; other clients show the name).
- Unnamed: WoWok client → full address (chip); other clients → SHORTID.
- The account with an empty name that is the on-chain default → other clients
  tag it `(default)`; the WoWok client adds its DEFAULT badge automatically.
- When both an account name and a local_mark exist, prefer local_mark (object
  names) for objects and the account name for user addresses.

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
| 1 | {time} | {addr-cell} | {addr-cell} | {amount} | {addr-cell} |
```

**Address cells follow the environment split above**:
- WoWok client → the cell contains the full address (rendered as an address chip automatically).
- Other clients → the cell contains the resolved name or the SHORTID (default account tagged `(default)`); full addresses only when the user explicitly asked for them.

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
- **Short Address (SHORTID)**: Compact display form (first 4 + `-` + last 3 hex chars, uppercase). Default for unnamed addresses in other AI clients; the WoWok client applies it automatically inside its address chips. Never hand-truncate with `…`.

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
- [ ] Address display: WoWok client → full `0x`+64 hex addresses (auto chips);
      other clients → resolved name, or SHORTID for unnamed / `(default)` for the
      default account; full inline-code address only when the user asks
- [ ] Never hand-truncate addresses with `…` — SHORTID is the only compact form
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
