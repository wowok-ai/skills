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

## Dialogue Scripts (R1-R10)

A guided 10-round dialogue for the output processing journey — runs after EVERY WoWok tool response. Each round has a specific AI Goal, Key Questions, Tool Calls, Success Criteria, Fallback, and Checkpoint. This skill is `always: true` and post-processes all responses for human-readable presentation.

> **Trigger**: This dialogue is automatically invoked after any WoWok MCP tool returns a response. It does NOT require user interaction unless field explanations are requested.

### R1 — Response Detection & Classification

**AI Goal**: Detect that a WoWok tool response has been received. Classify the response type (object, list, event, transaction result, error) to determine which formatting rules apply.

**Key Questions**:
- What type of response is this? (single object, object list, event list, transaction digest, error message)
- Does it contain addresses? Amounts? Events?
- Does the user want a summary or full detail?

**Tool Calls**:
1. Parse the response structure: identify top-level fields and their types.
2. Classify: `object` / `list` / `event` / `transaction` / `error` / `mixed`.
3. Extract: addresses (66-char hex starting with `0x`), amounts (numeric fields), events (objects with `type` field matching known event types).
4. `local_info_operation` → create a processing checkpoint `{ round: R1, response_type, has_addresses, has_amounts, has_events }`.

**Success Criteria**: Response classified. Addresses, amounts, and events identified for further processing.

**Fallback**: Response is empty → display "No results found." Response is an error → display the error message clearly, suggest remediation per [wowok-safety](../wowok-safety/SKILL.md) Error Patterns. Response is unknown type → display raw JSON with a note.

**Checkpoint**: Persist `{ round: R1, response_type, extraction: {addresses: N, amounts: N, events: N} }`. Mark R1 COMPLETE.

### R2 — Address Extraction & Shortening

**AI Goal**: Extract all unique addresses from the response. Apply the short address format (first 5 chars, uppercase, in parentheses) to every address.

**Key Questions**:
- (Internal) Did the user request full addresses? If so, skip shortening.
- (Internal) Are there any duplicate addresses? Deduplicate before resolution.

**Tool Calls**:
1. Scan the response for all 66-character hex strings starting with `0x`.
2. Deduplicate: collect unique addresses.
3. For each unique address, apply the short format:
   - Remove `0x` prefix.
   - Take first 5 characters.
   - Convert to UPPERCASE.
   - Wrap in parentheses `()`.
   - Example: `0xa1d421902a...` → `(A1D42)`.
4. `local_info_operation` → persist the address mapping.

**Success Criteria**: All addresses shortened to the `(ABCDE)` format. No raw 66-character addresses displayed (unless override condition is active).

**Fallback**: User explicitly requested full addresses ("show full addresses", "do not abbreviate") → OVERRIDE: display complete 66-character addresses. Disable shortening for this response. Address is less than 66 characters → may be a malformed address; display as-is with a warning.

**Checkpoint**: Persist `{ round: R2, address_count, shortening_applied: true|false, override_active: bool }`. Mark R2 COMPLETE.

### R3 — Name Resolution (local_names Query)

**AI Goal**: Query `local_names` to resolve addresses to human-readable names (account names, local_mark names). Apply the Display Format Rules based on resolution results.

**Key Questions**:
- (Internal) Which addresses have associated account or local_mark names?
- (Internal) What is the correct display format for each address based on the resolution priority?

**Tool Calls**:
1. `query_toolkit` → `local_names` with the unique addresses from R2.
2. For each address, capture: `account` (account name, if exists) and `local_mark` (local_mark name, if exists).
3. Apply the Display Format Rules:
   - Both account AND local_mark exist → `{account_name} | {local_mark_name} (ABCDE)`
   - Only account exists → `{account_name} (ABCDE)`
   - Only local_mark exists → `{local_mark_name} (ABCDE)`
   - Neither exists → `(ABCDE)`
4. Enforce the Name Length Limit: max 20 characters. Overflow → truncate to 17 chars + `...`.
5. `local_info_operation` → persist the name resolution mapping.

**Success Criteria**: All addresses resolved (or confirmed as unresolved). Display format applied per the rules. Name length limit enforced.

**Fallback**: `local_names` query fails → display addresses with short format only: `(ABCDE)`. No names available. Query returns empty → no names exist for these addresses; display `(ABCDE)`.

**Checkpoint**: Persist `{ round: R3, resolution: {address: {account, local_mark, display_format}} }`. Mark R3 COMPLETE.

### R4 — Amount Detection & Token Query

**AI Goal**: Detect all numeric amount fields in the response. Query token metadata (decimals, symbol) for conversion. Apply the Conservative Principle: when in doubt, display raw value.

**Key Questions**:
- (Internal) Which amounts have identifiable token types?
- (Internal) Can we query the token metadata, or is it unavailable?

**Tool Calls**:
1. Scan the response for numeric fields that represent amounts (balance, amount, fee, indemnity, etc.).
2. For each amount, identify the token type (if possible from context or explicit `token_type` field).
3. `query_toolkit` → `token_list` to get `decimals` and `symbol` for each identified token.
4. Apply the Conservative Principle:
   - Token info UNAVAILABLE → display raw amount (e.g., `500000000`).
   - Token info AVAILABLE → proceed to R5 for conversion.
5. `local_info_operation` → persist the amount detection and token metadata.

**Success Criteria**: All amounts detected. Token metadata queried for identifiable tokens. Conservative principle applied for unidentifiable tokens.

**Fallback**: Token type cannot be identified → display raw amount. `token_list` query fails → display raw amount. Token metadata is incomplete (missing decimals or symbol) → display raw amount.

**Checkpoint**: Persist `{ round: R4, amounts: [{field, raw_value, token_type, metadata_available: bool}] }`. Mark R4 COMPLETE.

### R5 — Amount Conversion & Formatting

**AI Goal**: Convert raw amounts to human-readable format using token decimals. Format as `{amount} {symbol} ({decimals}P)`.

**Key Questions**:
- (Internal) Is the conversion formula correct? `converted = raw / (10 ^ decimals)`.
- (Internal) Is the display format correct? `{amount} {symbol} ({decimals}P)`.

**Tool Calls**:
1. For each amount with available token metadata:
   - Calculate: `converted = raw / (10 ^ decimals)`.
   - Format: `{converted} {symbol} ({decimals}P)`.
   - Example: `500000000` with WOW (9 decimals) → `0.5 WOW (9P)`.
2. For amounts without token metadata: display raw value.
3. Present both raw and converted when clarifying with users (per [wowok-safety](../wowok-safety/SKILL.md) §2.2).
4. `local_info_operation` → persist the converted amounts.

**Success Criteria**: All convertible amounts formatted as `{amount} {symbol} ({decimals}P)`. Non-convertible amounts displayed as raw values.

**Fallback**: Conversion results in a very small number (e.g., `0.000000001`) → display with full precision, do not round. Conversion results in overflow (very large number) → display in scientific notation or with thousand separators. Decimals is 0 → display as integer with symbol.

**Checkpoint**: Persist `{ round: R5, converted_amounts: [{field, raw, converted, display_format}] }`. Mark R5 COMPLETE.

### R6 — Event Detection & Classification

**AI Goal**: Detect events in the response. Classify by event type to determine which fields to display in the event table.

**Key Questions**:
- (Internal) What event types are present? (NewOrderEvent, ProgressEvent, ArbEvent, DemandPresentEvent, DemandFeedbackEvent, NewEntityEvent)
- (Internal) Which key fields should be displayed for each event type?

**Tool Calls**:
1. Scan the response for objects with a `type` field matching known event types.
2. Classify each event:
   - `NewOrderEvent` → key fields: sender, service, amount, object.
   - `ProgressEvent` → key fields: order, operator, machine.
   - `ArbEvent` → key fields: arbitration, voter, order, service.
   - `DemandPresentEvent` → key fields: demand, presenter, service.
   - `DemandFeedbackEvent` → key fields: demand, feedbacker.
   - `NewEntityEvent` → key fields: entity.
3. For unknown event types → display all available fields.
4. `local_info_operation` → persist the event classification.

**Success Criteria**: All events classified. Key fields identified for each event type.

**Fallback**: Event type is unknown → display all available fields with a note. Event is missing expected fields → display available fields, note the missing ones. Event list is empty → display "No events found."

**Checkpoint**: Persist `{ round: R6, events: [{type, key_fields: [...]}] }`. Mark R6 COMPLETE.

### R7 — Event Table Rendering

**AI Goal**: Render events in a table format with the standard columns: #, Time, Sender, Service, Amount, Order. Apply address and amount formatting from R2-R5.

**Key Questions**:
- (Internal) Are all addresses in the event table formatted per R2-R3?
- (Internal) Are all amounts in the event table formatted per R4-R5?

**Tool Calls**:
1. Render the event table:
   ```
   | # | Time | Sender | Service | Amount | Order |
   |---|------|--------|---------|--------|-------|
   | 1 | {time} | {name} (ABCDE) | {name} (ABCDE) | {amount} | (ABCDE) |
   ```
2. Apply address formatting: `{name}` follows Display Format Rules (R3). If no name, show only `(ABCDE)`.
3. Apply amount formatting: converted amount with symbol (R5), or raw value if token info unavailable.
4. Format time: convert Unix milliseconds to human-readable local time.
5. `local_info_operation` → persist the rendered table.

**Success Criteria**: Event table rendered with all columns populated. Addresses and amounts formatted per rules. Time converted to human-readable format.

**Fallback**: Event has no sender → display `(UNKNOWN)`. Event has no amount → display `-`. Event has no time → display `N/A`. Table is too wide for the display → wrap or truncate non-essential columns.

**Checkpoint**: Persist `{ round: R7, table_rendered: true, row_count }`. Mark R7 COMPLETE.

### R8 — Field Explanation (On User Request)

**AI Goal**: When the user asks about field meanings ("what does sender mean?", "what is XP?"), provide clear explanations using the Field Explanations reference.

**Key Questions**:
- Which field does the user want explained?
- Is the explanation about addresses, amounts, time, or event-specific fields?

**Tool Calls**:
1. Identify the field the user is asking about.
2. Look up the explanation in the Field Explanations section:
   - **Addresses**: Sender (initiated the transaction), Service (object being ordered), Order Object (unique identifier), Short Address (first 5 chars for visual ID).
   - **Amounts**: Raw (actual U64 integer on-chain), Converted (human-readable after decimals), Precision (XP = decimal places).
   - **Time**: Timestamp (Unix milliseconds since epoch), Human-readable (converted local time).
3. Present the explanation in plain language.
4. `local_info_operation` → persist the field explanation request (for improving documentation).

**Success Criteria**: User's question answered clearly. Field meaning explained in plain language.

**Fallback**: Field is not in the reference → explain based on context and schema. If still unclear → query the schema via `schema_query` for the field definition. User asks about a complex field → break down the explanation into components.

**Checkpoint**: Persist `{ round: R8, field_explained, user_satisfied: bool }`. Mark R8 COMPLETE. (Skip if user doesn't ask.)

### R9 — Final Output Assembly

**AI Goal**: Assemble all formatted components (addresses, amounts, events, field explanations) into the final human-readable output. Apply the Implementation Checklist.

**Key Questions**:
- (Internal) Have all addresses been extracted and resolved?
- (Internal) Have all amounts been converted (or displayed raw per conservative principle)?
- (Internal) Have all events been rendered in table format?
- (Internal) Is the output clean and readable?

**Tool Calls**:
1. Run through the Implementation Checklist:
   - [ ] Extract unique addresses from response
   - [ ] Query `local_names` for resolution
   - [ ] Query `token_list` for amount formatting
   - [ ] Apply address format rules
   - [ ] Apply amount format rules (conservative)
   - [ ] Render final output
2. Assemble the final output: formatted addresses, converted amounts, event tables, and any field explanations.
3. Ensure consistency: same address always displays the same way within a single output.
4. `local_info_operation` → persist the final output snapshot.

**Success Criteria**: Implementation Checklist complete. Final output assembled with all formatting rules applied. Output is clean, readable, and consistent.

**Fallback**: Checklist has unchecked items → go back to the relevant R round. Output is inconsistent → re-apply formatting rules. Output is too long → summarize, offer to show full details on request.

**Checkpoint**: Persist `{ round: R9, checklist_complete: true, output_assembled: true }`. Mark R9 COMPLETE.

### R10 — Delivery & User Feedback

**AI Goal**: Deliver the formatted output to the user. Offer follow-up actions (view full addresses, explain fields, query more data).

**Key Questions**:
- Is the output clear? Would you like me to explain any field?
- Would you like to see full addresses instead of shortened ones?
- Would you like to query more data (related objects, more events)?

**Tool Calls**:
1. Present the final formatted output.
2. Offer follow-up actions:
   - "Would you like full addresses? Say 'show full addresses'."
   - "Would you like me to explain any field?"
   - "Would you like to see more events or related objects?"
3. If user requests full addresses → re-render with override condition (R2 fallback).
4. If user asks for field explanation → proceed to R8.
5. `local_info_operation` → persist the delivery and user feedback.

**Success Criteria**: Output delivered. User acknowledges or requests follow-up. Follow-up actions offered.

**Fallback**: User is confused → offer to explain fields (R8). User wants raw data → display the raw JSON response. User wants different formatting → adjust per user preference (e.g., full addresses, raw amounts).

**Checkpoint**: Persist `{ round: R10, output_delivered: true, user_feedback, follow_up_offered: true }`. Mark output processing COMPLETE.

---

## Decision Trees

### D1: Address Display Format Selection

```
An address is found in the response:
├── Did the user request full addresses?
│   ├── YES ("show full addresses", "do not abbreviate")
│   │   └── OVERRIDE: Display complete 66-character address.
│   │       Example: 0xa1d421902a3e5f2e4da7590e8f243712b3b3479d1a07c48c2de543184fc97a33
│   └── NO (default)
│       └── Apply Short Address Format:
│           1. Remove 0x prefix
│           2. Take first 5 characters
│           3. Convert to UPPERCASE
│           4. Wrap in parentheses ()
│           Example: (A1D42)
├── After shortening, query local_names for resolution:
│   ├── Both account AND local_mark exist
│   │   └── Format: {account_name} | {local_mark_name} (ABCDE)
│   │       Example: alice | my_mark (A1D42)
│   ├── Only account exists
│   │   └── Format: {account_name} (ABCDE)
│   │       Example: alice_wallet (A1D42)
│   ├── Only local_mark exists
│   │   └── Format: {local_mark_name} (ABCDE)
│   │       Example: my_service (A1D42)
│   └── Neither exists
│       └── Format: (ABCDE)
│           Example: (A1D42)
└── Name Length Limit:
    ├── Name ≤ 20 characters → Display as-is
    └── Name > 20 characters → Truncate to 17 chars + "..."
        Example: three_body_signature_service_v2 → three_body_sig...
```

### D2: Amount Conversion Decision

```
A numeric amount is found in the response:
├── Is the token type identifiable?
│   ├── NO (no token_type field, no context)
│   │   └── Display raw amount
│   │       Example: 500000000
│   └── YES (token_type field present or inferable from context)
│       └── Query token_list for metadata:
│           ├── Query fails or returns empty
│           │   └── Display raw amount (Conservative Principle)
│           │       Example: 500000000
│           └── Query succeeds with decimals and symbol
│               └── Convert and format:
│                   ├── Formula: converted = raw / (10 ^ decimals)
│                   ├── Format: {converted} {symbol} ({decimals}P)
│                   └── Example: 500000000 → 0.5 WOW (9P)
├── Special cases:
│   ├── Decimals = 0 → Display as integer with symbol
│   │   Example: 100 USDC (0P)
│   ├── Very small converted value → Display with full precision
│   │   Example: 1 → 0.000000001 WOW (9P)
│   └── Very large converted value → Use thousand separators
│       Example: 1000000000000 → 1,000 WOW (9P)
└── When clarifying with users: Show BOTH raw and converted
    Example: "Amount: 500000000 (0.5 WOW, 9 decimals)"
```

### D3: Event Rendering Format

```
Events are detected in the response:
├── How many events?
│   ├── 0 → Display "No events found."
│   ├── 1-20 → Render in a single table
│   └── >20 → Render first 20, offer pagination
├── Table columns:
│   | # | Time | Sender | Service | Amount | Order |
│   ├── #: Sequential index (1, 2, 3, ...)
│   ├── Time: Unix ms → human-readable local time
│   ├── Sender: {name} (ABCDE) per D1
│   ├── Service: {name} (ABCDE) per D1
│   ├── Amount: {converted} per D2
│   └── Order: (ABCDE) per D1
├── Event type-specific fields (supplementary):
│   ├── NewOrderEvent → sender, service, amount, object
│   ├── ProgressEvent → order, operator, machine
│   ├── ArbEvent → arbitration, voter, order, service
│   ├── DemandPresentEvent → demand, presenter, service
│   ├── DemandFeedbackEvent → demand, feedbacker
│   └── NewEntityEvent → entity
├── Missing fields:
│   ├── No sender → (UNKNOWN)
│   ├── No amount → -
│   └── No time → N/A
└── {name} follows Display Format Rules:
    ├── Both names → account | local_mark (ABCDE)
    ├── One name → {name} (ABCDE)
    └── No name → (ABCDE)
```

### D4: Response Type Classification

```
A WoWok tool response is received:
├── What is the top-level structure?
│   ├── Single object (has fields like id, name, balance, etc.)
│   │   └── Type: object → Apply address/amount formatting to fields
│   ├── Array of objects (has length, items)
│   │   └── Type: list → Apply formatting to each item, render as table or list
│   ├── Event list (items have type field matching event types)
│   │   └── Type: event → Apply event table rendering (D3)
│   ├── Transaction digest (has digest field)
│   │   └── Type: transaction → Display digest, offer to query result
│   ├── Error message (has error field)
│   │   └── Type: error → Display error, suggest remediation
│   └── Mixed (object with nested events, amounts, addresses)
│       └── Type: mixed → Apply all relevant formatting rules
└── After classification, route to the appropriate formatting rounds:
    ├── Has addresses → R2 (shortening) + R3 (resolution)
    ├── Has amounts → R4 (detection) + R5 (conversion)
    ├── Has events → R6 (classification) + R7 (table rendering)
    └── Has unknown fields → R8 (explanation on request)
```

### D5: Name Resolution Priority

```
Querying local_names for an address:
├── Query: query_toolkit → local_names with the address
├── Response contains:
│   ├── account field (account name)
│   │   ├── Present → Use as primary name
│   │   └── Absent → No account name
│   ├── local_mark field (local_mark name)
│   │   ├── Present → Use as secondary name
│   │   └── Absent → No local_mark name
│   └── address field (the queried address)
│       └── Always present (confirms the query matched)
├── Display format based on resolution:
│   ├── Both present → {account} | {local_mark} (ABCDE)
│   │   Priority: account name first, then local_mark
│   ├── Only account → {account} (ABCDE)
│   ├── Only local_mark → {local_mark} (ABCDE)
│   └── Neither → (ABCDE)
├── Name Length Limit (max 20 chars):
│   ├── account name > 20 chars → truncate to 17 + "..."
│   ├── local_mark name > 20 chars → truncate to 17 + "..."
│   └── Combined format > 20 chars → truncate the longer name first
└── Consistency: Same address always displays the same way
    within a single output (cache the resolution for the session)
```

---

## Failure Playbooks

### F1: Address Resolution Fails (No local_names Match)

**Trigger**: An address in the response has no entry in `local_names`. The `query_toolkit` → `local_names` query returns empty for this address.

**Diagnosis**:
- The address has never been assigned a local name (account or local_mark).
- The address belongs to an external account not in the user's local registry.
- The local_names query failed (network error, cache issue).

**Recovery**:
1. Display the address with short format only: `(ABCDE)`.
2. Do not display a name (since none exists).
3. If the user asks "who is this address?" → query `onchain_objects` for the address to see if it's a known object type (Service, Machine, Guard, etc.).
4. If the user wants to assign a name → `local_mark_operation` to create a local mark for this address.

**Prevention**: Always handle the "neither exists" case in the Display Format Rules. Display `(ABCDE)` without a name. Do not fabricate names.

### F2: Token Metadata Unavailable

**Trigger**: An amount in the response has an identifiable token type, but `query_toolkit` → `token_list` fails to return metadata (decimals, symbol).

**Diagnosis**:
- The token is not in the local token registry.
- The token has been delisted or is unknown to the WoWok SDK.
- The `token_list` query failed (network error, cache issue).
- The token type was inferred incorrectly.

**Recovery**:
1. Apply the Conservative Principle: display the raw amount.
   - Example: `500000000` (no symbol, no conversion).
2. Do NOT guess or hardcode token decimals.
3. Inform the user: "Token metadata unavailable. Displaying raw amount."
4. If the user knows the token decimals → let them specify, then convert manually.
5. If the token is WOW (`0x2::wow::WOW`) → it's safe to use 9 decimals (protocol default), but still query to confirm.

**Prevention**: NEVER assume token decimals. ALWAYS query via `query_toolkit` with `query_type: "token_list"`. If the query fails, display raw amounts. This is documented in the Conservative Principle and §Amount Formatting Rules.

### F3: Event Type Unknown

**Trigger**: An event in the response has a `type` field that doesn't match any known event type (NewOrderEvent, ProgressEvent, ArbEvent, DemandPresentEvent, DemandFeedbackEvent, NewEntityEvent).

**Diagnosis**:
- The event is a new type added in a recent WoWok protocol upgrade.
- The event type string is malformed or uses a different naming convention.
- The event is from a custom module not covered by the standard event types.

**Recovery**:
1. Display all available fields in the event.
2. Note: "Unknown event type. Displaying all fields."
3. Do NOT attempt to map it to a known type.
4. If the user asks → query the schema via `schema_query` for the event type definition.
5. If the event type is from a custom module → display the raw event data.

**Prevention**: Maintain the event type field reference table (§Event Type Fields). When new event types are added to the WoWok protocol, update the table. For unknown types, always display all fields rather than omitting data.

### F4: User Requests Full Addresses (Override Condition)

**Trigger**: The user explicitly says "show full addresses", "do not abbreviate", or similar. The shortening rules must be disabled for this response.

**Diagnosis**:
- The user wants to see complete 66-character addresses for verification or copying.
- The override condition is active for this response (or session).

**Recovery**:
1. Disable the Short Address Format for this response.
2. Display complete 66-character addresses: `0xa1d421902a3e5f2e4da7590e8f243712b3b3479d1a07c48c2de543184fc97a33`.
3. Still apply name resolution (if names exist, display `{name} {full_address}`).
4. If the user later says "shorten addresses" or "use short format" → re-enable shortening.

**Prevention**: Always check for the override condition at R2 (Address Extraction & Shortening). The condition is documented in §Override Condition. Respect the user's preference for the session.

### F5: Amount Overflow / Precision Loss

**Trigger**: An amount conversion results in a very small number (e.g., `0.000000001`) or a very large number (e.g., `1000000000000`), causing display issues.

**Diagnosis**:
- Very small: the raw amount is small relative to the token's decimals (e.g., 1 unit with 9 decimals = 0.000000001).
- Very large: the raw amount is very large (e.g., billions of units).
- Standard float display may lose precision or use scientific notation.

**Recovery**:
1. For very small numbers: display with full precision. Do NOT round.
   - Example: `0.000000001 WOW (9P)` (not `1e-9 WOW`).
2. For very large numbers: use thousand separators for readability.
   - Example: `1,000,000 WOW (9P)` (not `1000000 WOW`).
3. If precision is critical (financial contexts): display both raw and converted.
   - Example: `500000000 (0.5 WOW, 9 decimals)`.
4. If the number is too large for standard display → use scientific notation with a note.
   - Example: `1e18 WOW (9P) — very large amount, verify raw value: 1000000000000000000`.

**Prevention**: Always use integer arithmetic for conversion (raw / 10^decimals). Avoid float precision loss. For display, format with appropriate precision based on the token's decimals.

### F6: Mixed Response Types (Addresses + Amounts + Events)

**Trigger**: A single response contains multiple types of data: addresses, amounts, and events. The formatting rules must be applied consistently across all types.

**Diagnosis**:
- The response is a complex object with nested fields (e.g., a Service object with `machine`, `sales`, `arbitrations`).
- Addresses, amounts, and events are intermixed.
- Risk of inconsistent formatting (same address displayed differently in different parts of the response).

**Recovery**:
1. Extract ALL addresses first (R2), deduplicate, and resolve names (R3) in a single pass.
2. Extract ALL amounts (R4), query token metadata once per token type (R5).
3. Extract ALL events (R6), render in table format (R7).
4. Assemble the final output (R9) with consistent formatting:
   - Same address always displays the same way (cache the resolution).
   - Same token always uses the same decimals/symbol (cache the metadata).
5. If the response is very complex → summarize, offer to show full details on request.

**Prevention**: Process all addresses, amounts, and events in separate passes (R2-R3, R4-R5, R6-R7) before assembling the final output (R9). Cache resolutions and metadata for consistency. The Implementation Checklist (R9) ensures all types are processed.

---

## Tier Layering

### Novice — Basic Address Shortening and Amount Display

**Profile**: First-time user. Needs simple, readable output. Not concerned with advanced formatting or field explanations.

**AI Behavior**:
- Always apply the Short Address Format: `(ABCDE)`.
- For amounts: always query `token_list` for WOW (9 decimals). For unknown tokens, display raw.
- For events: render in the standard table format with all columns.
- Do NOT offer field explanations unless the user asks.
- Do NOT offer full address override unless the user asks.
- Keep output concise: summaries over full details.
- For complex responses: display a summary, offer to show more on request.

**Typical Journey**: R1 (detect) → R2 (shorten addresses) → R3 (resolve names, basic) → R4-R5 (WOW amounts only) → R7 (event table) → R9 (assemble) → R10 (deliver).

### Advanced — Full Name Resolution and Event Table Rendering

**Profile**: Experienced user. Wants full name resolution, multi-token support, and detailed event tables. May ask for field explanations.

**AI Behavior**:
- Apply full Display Format Rules: `{account} | {local_mark} (ABCDE)`.
- For amounts: query `token_list` for all identifiable tokens. Support multi-token responses.
- For events: render in table format with type-specific key fields.
- Proactively offer field explanations for non-obvious fields.
- Support full address override: detect when the user requests full addresses.
- For complex responses: display full details with consistent formatting.
- Support pagination for large event lists (>20 events).

**Typical Journey**: R1 (detect) → R2 (shorten) → R3 (full resolution) → R4-R5 (multi-token) → R6-R7 (event classification + table) → R8 (field explanations on request) → R9 (assemble) → R10 (deliver with follow-up offers).

### Expert — Custom Formatting and Batch Processing

**Profile**: Power user. Manages multiple queries. Wants custom formatting, batch processing, and consistent display across responses.

**AI Behavior**:
- Support custom display preferences: user-configurable name length limit, preferred address format, amount precision.
- For batch queries: process multiple responses in a single pass, maintain consistent formatting across all.
- Cache name resolutions and token metadata across responses for consistency.
- Support advanced event filtering: filter by event type, time range, sender, service.
- Support export format: render output as Markdown table, CSV, or JSON for external use.
- For very large responses: paginate, summarize, offer drill-down.
- Support comparative display: show before/after state for operations that modify objects.
- Integrate with [wowok-safety](../wowok-safety/SKILL.md) R10 (Post-Operation Verification): display state changes clearly, highlight differences.

**Typical Journey**: R1 (detect, batch) → R2 (shorten, batch) → R3 (full resolution, cached) → R4-R5 (multi-token, cached) → R6-R7 (event classification, filtered table) → R8 (field explanations, proactive) → R9 (assemble, custom format) → R10 (deliver with export options).
