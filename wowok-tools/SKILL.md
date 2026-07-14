---
name: wowok-tools
description: |
  WoWok MCP tool reference — canonical documentation for all 13 MCP tools.
  Covers schema-inexpressible constraints, business rules, interaction patterns,
  and design decisions not captured by JSON Schema.

  Core value: prevent common AI failures (wrong tool selection, incorrect
  parameter formats, missing structural wrappers, wrong discriminated unions).
when_to_use:
  - AI needs to select or invoke any WoWok MCP tool
  - AI encounters tool errors and needs debugging
  - MCP tool schemas are not auto-available
  - User asks "how do I..." for any WoWok operation
always: true
---

# WoWok MCP Tool Reference

Canonical reference for all 13 MCP tools. Covers patterns, constraints, and design decisions that **JSON Schema cannot express**. For detailed business workflows, see the Domain and Business Skills below.

> **Domain Skills**: [wowok-guard](../wowok-guard/SKILL.md) (validation logic), [wowok-messenger](../wowok-messenger/SKILL.md) (encrypted messaging), [wowok-machine](../wowok-machine/SKILL.md) (workflows), [wowok-safety](../wowok-safety/SKILL.md) (safety & naming)
> **Business Skills**: [wowok-order](../wowok-order/SKILL.md) (customer), [wowok-provider](../wowok-provider/SKILL.md) (merchant), [wowok-arbitrator](../wowok-arbitrator/SKILL.md) (dispute resolution)

---

## 🔴 Gas and Faucet

On-chain operations require gas. Transactions will fail if the account has insufficient balance.

### For AI Assistant

When assisting users with WoWok operations:

- After a user creates a new account, proactively call `account_operation` → `faucet` to claim test tokens on their behalf
- Before starting any on-chain workflow, check balance via `query_toolkit` → `account_balance`
- If balance is below 1 WOW, automatically request faucet without asking the user
- If a transaction fails due to gas, retry after claiming more tokens

### Tool Reference

- **Claim tokens**: `account_operation` → `faucet` (not `onchain_operations`)
- **Check balance**: `query_toolkit` → `account_balance`

Each faucet claim provides approximately 5 WOW, sufficient for dozens of transactions.

---

## Core Rules

### Structural Wrapper Rules

Most `onchain_operations` branches use `{ operation_type, data: {...}, env?, submission? }`. Three exceptions:

| Branch | Difference |
|--------|-----------|
| `gen_passport` | No `data` wrapper — `guard`/`info` at top level |
| `payment`, `personal` | Has `data` but NO `submission` field |

### CREATE vs MODIFY

> [wowok-safety](../wowok-safety/SKILL.md) §1.1 — **String** = REUSE existing object, **Object** = CREATE new one. SDK-enforced via `GetObjectExisted()`, not Move-level.

### Permission Index Model

Every object creation requires a Permission object. **Strongly recommended**: reuse a single Permission across all services for centralized control. Custom indices range 1000–65535; built-in 0–999 are reserved. The SDK auto-creates a Permission if you pass an object shape.

### Witness Conversion (`convert_witness`)

When a Guard queries a related object (e.g., Progress from an Order), `convert_witness` transforms a submitted ID to the target type. Type compatibility is validated at Guard creation time by the Move contract — mismatches cause creation failure.

### Immutability

| Object | Locked When | Recovery |
|--------|------------|----------|
| Guard | After creation | Create new, update all refs |
| Machine (nodes) | After publish | Create new Machine, rebind Service |
| Service `machine`/`order_allocators` | After publish | Create new Service |
| Passport | After generation | Regenerate with `gen_passport` |
| Payment | After transfer | Irreversible — no protocol refund |

### Submission Loop (Two-Phase)

When an `onchain_operations` call requires Guard validation, the SDK returns a **submission prompt** — a structured request for the data the Guard needs to evaluate. This is a two-phase pattern:

1. **Phase 1**: Call `onchain_operations` **without** the `submission` field. If a Guard requires input, the response returns a submission prompt.
2. **Phase 2**: Present the prompt to the user, collect their inputs, then **re-call** the SAME `onchain_operations` with the `submission` field populated.

This applies whenever `submission` is listed in the structural wrapper (i.e., all branches except `gen_passport`, `payment`, `personal`). For `gen_passport`, each Guard's submission is passed independently via `info`.

### First-Guard-Wins

Ordered Guard evaluation where **the first Guard returning `true` wins** applies to:
- `service`: `order_allocators[].allocators[]`
- `allocation`: evaluated modes (Amount → Rate → Surplus)
- `demand`: presenter submission filtering

### Object-Guard Circular Reference Pattern

When an object and its Guard need to reference each other (Guard queries the object it protects), follow this **universal three-step pattern**:

```
1. CREATE object (without Guard)
2. CREATE Guard (reference object by NAME in table)
3. MODIFY object (bind Guard by name)
```

**Applies to all:** Service, Machine, Reward, Repository, Treasury, Demand, Arbitration — any object with Guard fields.

**Key point:** Guards are immutable and require the target object's address in their table. Use the object's **name** (string) as the table value; the SDK resolves it to the actual address at runtime.

**Example (Reward):**
```
Step 1: CREATE reward { name: "reward_v1" }                    // no guard
Step 2: CREATE guard { table: [{ value: "reward_v1", ... }] }  // name reference
Step 3: MODIFY reward { object: "reward_v1", guard_add: [...] } // bind guard
```

---

## The 13 Tools

### 1. `onchain_operations` — 16 Sub-Types

> **Schema**: `schema_query({ name: "onchain_operations" })` for the full discriminated union. Per-type schemas: `onchain_operations_service`, `onchain_operations_machine`, etc.

| `operation_type` | Schema-Inexpressible Constraints |
|-----------------|----------------------------------|
| `service` | `machine` field must reference a **published** Machine. Allocators evaluated in array order (first-Guard-wins). Publish locks `machine`/`order_allocators`; `sales`/`discount`/`description` remain mutable. |
| `machine` | Nodes immutable after publish. Forward requires ≥1 of `namedOperator`/`permissionIndex` (both empty = SDK error). Weight `u16` (0–65535), threshold `u32`. `""` = entry node. Full lifecycle → [wowok-machine](../wowok-machine/SKILL.md). |
| `progress` | Two-phase advancement: `hold: true` (lock) → `hold: false` (submit). `adminUnhold: true` force-releases others' locks. SDK fetches Machine internally when resolving `object_address`. |
| `arbitration` | MAX 20 propositions, 520 voters. Non-Finished withdrawal triggers 30-day mandatory wait. Verdict (state 2→3) is **irreversible** by arbitrator — only customer can object via `order.arb_objection`. Voting weight from Guard `b_submission:true` must be numeric (U8–U256→u32). Full workflow → [wowok-arbitrator](../wowok-arbitrator/SKILL.md). |
| `guard` | Two creation modes: `root.type: "node"` (inline) or `"file"` (from JSON/Markdown). MAX 4 `rely` dependencies. Guards with `rep: false` **excluded** from other Guards' `rely` lists. Global system addresses (`0xaab` EntityRegistrar, `0xaaa` EntityLinker) require table entries. Full design → [wowok-guard](../wowok-guard/SKILL.md). |
| `gen_passport` | MAX 20 Guards/call (AND-ed — all must pass). Omit `info` to auto-fetch submissions from Guards. Passport frozen after creation (immutable credential). Usage → [wowok-guard](../wowok-guard/SKILL.md). |
| `order` | Builder-owned: agents can operate but **cannot withdraw** — only builder receives funds. `order.progress` with Guard requires Passport (mandatory, not bypassable). Arbitration via `order.arb_confirm`/`arb_objection` (not via `arbitration` directly). `arb_claim_compensation` once-only, from Service's compensation fund. Full flow → [wowok-order](../wowok-order/SKILL.md). |
| `payment` | `type_parameter` required (e.g., `"0x2::wow::WOW"`). Irreversible — no refund mechanism. |
| `personal` | **Permanently public** — no private field exists. Warn users before writing sensitive data. |
| `demand` | Guard-gated: `guards` filter which presenters can submit solutions. Separate from Service. |
| `treasury` | Guardable deposits (`external_deposit_guard`) and withdrawals (`external_withdraw_guard`). Each entry creates a Payment record in history table for auditability. |
| `repository` | Composite key: `name + entity` (address or number). Guardable writes validate both writer eligibility and data content. |
| `reward` | `guard_add` AmountType: `Fixed` (equal) or `GuardU64Identifier` (dynamic from submission). `guard_expiration_time` freezes the Guard list; `null` to remove. |
| `allocation` | Auto-executes on Progress advancement; modes evaluated in order (Amount → Rate → Surplus), first-Guard-wins per mode. |
| `contact` | Bridge between Service (`um` field) and Messenger: holds `ims[]` (messenger addresses). |
| `permission` | Indices 0–65535 (0–999 reserved for protocol; custom ≥1000). SDK rejects custom below 1000. Reuse across objects. |

### WIP Hash Dispute-Prevention Mechanism

When a customer browses products, the AI agent MUST capture the `wip_hash` from the Service query result (the `sale.wip_hash` field for each product). When creating an order, pass the captured hash in `buy.items[].wip_hash`.

This is a two-layer protection:
1. **Off-chain** (SDK `verify_wip`): downloads the WIP file and verifies its hash matches the captured hash — detects WIP file tampering.
2. **On-chain** (Move contract `assert!(sale.wip_hash == i.wip_hash)`): confirms the Service's sale hasn't been updated between browse and purchase time.

If the merchant swaps the WIP file or changes `sale.wip_hash` after the customer browses, the order will fail — the customer is protected from bait-and-switch.

---

### 2. `query_toolkit` — Read (Local + On-Chain)

9 query types. Schema-inexpressible: `token_list` is **cached** (populated on first query). `account_balance` dual-mode: `balance=true` for totals, `coin={cursor,limit}` for paginated coin objects. `onchain_objects` batches 50/request internally. `local_names` resolves to account names AND local marks simultaneously.

### 3. `onchain_table_data` — Dynamic Table Queries

12 query types. **Global** (no `parent`): `entity_registrar`, `entity_linker`. All others require `parent`. `onchain_table_item_generic` accepts arbitrary key types — universal fallback for custom objects.

### 4. `account_operation` — Wallet (ALL LOCAL)

`faucet` only testnet/localnet. `gen` with `m` enables Messenger. `signData` supports UTF-8/base64/hex. `get` with `balance_required` splits existing coins (no minting). Private keys never leave the device.

**Mainnet operations**: `faucet` is unavailable on mainnet. To fund new accounts, use `transfer` from an existing account with sufficient balance:
```
{"transfer": {"amount": 1000000000, "name_or_address_from": "", "name_or_address_to": "new_account", "network": "mainnet"}}
```
- 1 WOW (10^9 base units) per account is sufficient for dozens of transactions
- `name_or_address_from: ""` uses the default account

### 5. `local_mark_operation` — Address Book (ALL LOCAL)

Max 50 tags/entry (64 chars each). `replaceExistName:true` steals existing names — prefer versioned names (`_v1`, `_v2`).

### 6. `local_info_operation` — Private Data (ALL LOCAL)

Max 50 contents/entry, 300 chars each.

---

### 7. `messenger_operation` — Encrypted Messaging

**Stranger rules** (not in schema): 1 message before reply required (max ~480 chars); reply auto-adds stranger to friends; cool-down window after rejection.

**Guard flow** (not in schema): When guard blocks a stranger message, rejection reply includes guard list — sender must obtain valid Passport to resend.

**WTS** (not in schema): `generate` requires continuous sequences (gaps break chain). `verify` → `sign` → `wts2html` pipeline. `proof_message` anchors to blockchain. Full design → [wowok-messenger](../wowok-messenger/SKILL.md).

---

| # | Tool | Schema-Inexpressible |
|---|------|---------------------|
| 8 | `wip_file` | `verify` checks hash → signatures stepwise. `wip2html` accepts single file or directory. |
| 9 | `guard2file` | Read-only export to JSON/Markdown. |
| 10 | `machineNode2file` | Read-only; exports complete topology. |
| 11 | `onchain_events` | 6 event types; paginated via cursor `{eventSeq, txDigest}`. |
| 12 | `wowok_buildin_info` | 5 info types. Guard instructions filter by `name`/`return_type`/`param_count`. **Never use Value type 19** (internal, SDK rejects). |
| 13 | `schema_query` | `list` returns empty if schemas not generated → run `npm run generate:schemas`. |

---

## Decision Tree

```
Write state? → onchain_operations (choose operation_type)
├── No data wrapper? → only gen_passport
├── No submission?    → only payment, personal
└── String (MODIFY) vs Object (CREATE)? → safety §1.1

Read state?  → query_toolkit / onchain_table_data
Communicate? → messenger_operation (encrypted)
Local only?  → account_operation / local_mark_operation / local_info_operation
Export?      → guard2file / machineNode2file
Discover?    → schema_query / wowok_buildin_info / onchain_events
```

---

## Examples Reference

The deployment package includes 5 complete examples in the `examples/` directory. These serve as reference implementations to help explain concepts and demonstrate patterns to users.

### Matching User Intent to Examples

When a user describes their needs, reference the appropriate example to illustrate the approach:

| User Intent | Example | Complexity | Key Techniques Demonstrated |
|-------------|---------|------------|----------------------------|
| Simple service with time-lock | Insurance | ⭐ Low | Two-node workflow, convert_witness, time-lock Guard |
| E-commerce store setup | MyShop | ⭐⭐ Medium | Four-node workflow, Permission indexes, Messenger integration, discounts |
| Complex multi-path order flow | MyShop_Advanced | ⭐⭐⭐ High | 11+ nodes, dual-signature (threshold=2), Merkle Root verification, Reward pool |
| Weather/data validation service | Travel | ⭐⭐⭐ High | Repository queries, convert_number_address, supply chain sub-orders |
| Signature/authorization service | ThreeBody_Signature | ⭐ Low | Buy Guard for access control, Machine-Service binding |

### Finding Examples by Technique

When explaining a specific technique to users, reference where it appears:

| Technique | Example | Location |
|-----------|---------|----------|
| convert_witness: 100 (Order to Progress) | Insurance, Travel | Insurance Step 2 |
| Repository data query Guard | Travel | Step 3.1 |
| Dual-signature (threshold=2) | MyShop_Advanced | Lost/Return nodes |
| Reward pool with Guard verification | MyShop_Advanced | reward_wonderful_v2 Guards |
| Buy Guard (restricting purchasers) | ThreeBody_Signature | Step 2 |
| Discount coupons | MyShop | Step 8 |
| Arbitration with voting_guard | MyShop_Advanced | Step 9 |
| Time-lock Guard | Insurance, Travel | Step 2 / Step 3.2 |

### How to Use Examples with Users

1. **Assess complexity** — Match user requirements to the appropriate complexity level
2. **Reference the example** — Show users the relevant example path and explain which techniques it demonstrates
3. **Extract patterns** — Use JSON snippets from examples as templates to help users understand the structure
4. **Reference test results** — Each example includes `*_TestResults.md` with real testnet execution results for troubleshooting

---

## Common Pitfalls

| Trap | Fix |
|------|-----|
| **Transaction fails, gas error** | → [Pre-Flight: Gas & Faucet](#-pre-flight-gas--faucet前置必读). AI should auto-check balance + faucet. |
| **Don't know how to build a service** | → [Examples Reference](#examples-reference内置示例导航). Match user intent → example, extract JSON templates. |
| `gen_passport` called as standalone tool | It's not — use `onchain_operations` with `operation_type: "gen_passport"` |
| Missing `data` wrapper | Only `gen_passport` omits it; `payment`/`personal` omit `submission` |
| String `object` passed expecting CREATE | String = existing (MODIFY), Object = new (CREATE) → [safety §1.1](../wowok-safety/SKILL.md) |
| Missing `submission` on Guard call | See [Submission Loop](#submission-loop-two-phase) — two-phase pattern: call without `submission` first, collect data, re-call with it |
| Publishing before all deps ready | Guard/Machine immutable after create/publish. Test via `gen_passport` before finalizing |
| `demand` via `service` operation_type | Separate `operation_type: "demand"` — Demand posts are not Services |
| Arbitration called directly | Customer path: `order.arb_confirm` / `order.arb_objection`. Order is the interface |

---

## Dialogue Scripts (R1-R10)

A 10-round dialogue for the tool-selection journey: a user (or another Skill) arrives with a vague intent and the AI walks them from "which tool do I even need?" through "called the right tool with the right shape" to "verified the result and persisted state". Each round maps to one decision in the tool-selection tree from §Decision Tree above.

### R1: Intent Capture & Operation Class

**AI Goal**: Classify the user's intent into one of six operation classes (Write / Read / Communicate / Local-only / Export / Discover) so the rest of the rounds narrow to one tool family.

**Key Questions**:
- What are you trying to accomplish in one sentence? (e.g., "I want to create a service", "I want to read on-chain events", "I want to send an encrypted message")
- Is this a one-time action or part of a multi-step build?
- Are you operating on-chain or only locally?

**Tool Calls**:
1. `query_toolkit` → `local_names` — list accounts and local marks so the AI can phrase follow-ups in terms the user already knows.
2. (No write call yet — R1 is classification only.)

**Success Criteria**: AI articulates the classified intent back to the user in plain language ("You want to write on-chain state, so we'll use `onchain_operations`. Next we pick the operation_type.") and the user confirms.

**Fallback**: User intent is genuinely ambiguous (e.g., "I want to set up a shop" could mean account creation OR service creation) → ask one disambiguating question, do not guess. If user invokes by raw tool name ("use `messenger_operation`"), skip R2-R3 and jump to the parameter-shape rounds.

**Checkpoint**: Persist `{ round: R1, intent: <one_line>, op_class: write|read|communicate|local|export|discover }` via `local_info_operation`.

### R2: Tool Family Selection

**AI Goal**: Map the operation class to exactly one of the 13 tools. For `onchain_operations`, also pre-select the `operation_type` shortlist.

**Key Questions**:
- (Write) Are you creating, modifying, or advancing an object? Which object type?
- (Read) Do you need a single object, a table row, an event stream, or your local address book?
- (Communicate) Plain message, file, or WTS evidence?

**Tool Calls**:
1. `schema_query` → `list` — confirm available schemas are generated (catches the "empty list → run `npm run generate:schemas`" trap from §13).
2. (For `onchain_operations`) `schema_query` → `get` for the candidate operation_type schema (e.g., `onchain_operations_service`) to surface required fields early.

**Success Criteria**: One tool name and (for `onchain_operations`) one `operation_type` are committed. AI shows the user the high-level parameter shape and gets a "yes, that looks right".

**Fallback**: User wants an action the SDK doesn't expose directly (e.g., "refund a payment") → surface the protocol constraint (Payment is irreversible per §Immutability) and offer the closest valid path (e.g., Allocation-based refund). Never invent a tool.

**Checkpoint**: Persist `{ round: R2, tool: <name>, operation_type?: <name> }`.

### R3: Structural Wrapper Selection

**AI Goal**: Decide the exact envelope shape: `{ operation_type, data, env?, submission? }` vs the three exceptions (`gen_passport`, `payment`, `personal`).

**Key Questions**:
- (Only if user is unsure) Are you generating a passport, making a payment, or updating personal info? These are the three exception branches.
- For everything else: do you have the `data` payload ready, or do you need to collect it across R4-R6?

**Tool Calls**:
1. `schema_query` → `get` for the specific branch (e.g., `onchain_operations_gen_passport`) to lock the exact field set.
2. Cross-reference §Structural Wrapper Rules table to confirm `data` presence and `submission` presence.

**Success Criteria**: The AI presents the exact JSON skeleton with field names (not values yet) and the user confirms the shape.

**Fallback**: User passes `data` to `gen_passport` or `submission` to `payment` → block, cite the §Structural Wrapper Rules table, re-route.

**Checkpoint**: Persist `{ round: R3, wrapper: standard|gen_passport|payment|personal, fields_expected: [...] }`.

### R4: Account, Network & env Block

**AI Goal**: Resolve the `env` block — `account`, `network`, `no_cache`, `gas_budget`.

**Key Questions**:
- Which account? (Default `""` is fine if the user does not specify.)
- Testnet or mainnet? (Default `testnet`.)
- (If building multiple interdependent objects) OK to set `no_cache: true` to avoid stale-read failures?

**Tool Calls**:
1. `query_toolkit` → `account_balance` for the chosen account — verify balance > 0 before any write.
2. If balance = 0: `account_operation` → `faucet` (testnet) OR `account_operation` → `transfer` from a funded account (mainnet).
3. (Optional) `query_toolkit` → `token_list` to confirm token decimals if amounts are involved.

**Success Criteria**: An account with non-zero balance is committed; `network` and `no_cache` are decided. AI shows the final `env` block.

**Fallback**: Faucet rate-limited → wait 60s and retry, or `transfer` 1 WOW from another funded account (sufficient for dozens of txns per §Mainnet operations). Mainnet user with no funded account → halt and instruct acquisition; do not reduce example amounts silently.

**Checkpoint**: Persist `{ round: R4, account: <name>, network: <testnet|mainnet>, balance: <n>, no_cache: <bool> }`.

### R5: CREATE vs MODIFY Disambiguation

**AI Goal**: For every object-typed parameter, decide whether the user means REUSE (string) or CREATE (object shape). This is the most common silent failure per §safety 1.1.

**Key Questions**:
- For each object field (Permission, Machine, Guard, Contact, etc.): "Reuse an existing one (give me name/ID) or create a new one?"
- (If reuse) What is the name or `0x...` address?
- (If create) What are the new object's required fields?

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` — verify any "reuse" string actually resolves (catches typos before the SDK's `GetObjectExisted()` hard-errors).
2. `local_mark_operation` → optional: tag a reused object with a friendly name for future reference.

**Success Criteria**: Every object-typed field is annotated as REUSE (with verified name/address) or CREATE (with field draft). The full `data` payload skeleton is now populated with placeholders.

**Fallback**: User passes a string that doesn't resolve → either offer to CREATE (with explicit confirmation) or query candidates via `onchain_objects` and let the user pick. Never silently swap string→object.

**Checkpoint**: Persist `{ round: R5, fields: [{name, mode: reuse|create, resolved?: <addr>}] }`.

### R6: Permission Index Resolution

**AI Goal**: Resolve every `permissionIndex` and `namedOperator` reference against a real Permission object.

**Key Questions**:
- Which Permission object governs this operation? (Strongly recommended: reuse one Permission across all services.)
- For Machine Forwards: is this role shared across all Progress instances (`permissionIndex`) or per-order (`namedOperator`)?
- Custom indices must be ≥ 1000 (0–999 reserved). What indices does your Permission define?

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` (filter type=Permission) — list candidates for reuse.
2. `wowok_buildin_info` → `info: "built-in permissions"` — confirm which 0–999 indices are protocol-reserved so the user doesn't try to claim one.

**Success Criteria**: Every `permissionIndex` value exists in the chosen Permission; every `namedOperator` is either `""` (order owner/agents) or a role name the user explicitly defined.

**Fallback**: User picks an index < 1000 → block, cite §Permission Index Model, suggest 1000–65535 range. User doesn't have a Permission yet → create one first (R5 CREATE path), then return.

**Checkpoint**: Persist `{ round: R6, permission_id, indices_used: [...] }`.

### R7: Submission Loop Preparation

**AI Goal**: Pre-stage the two-phase submission pattern so R8's actual call doesn't surprise the user.

**Key Questions**:
- Will this operation require Guard validation? (If `submission` is in the schema, yes.)
- What data will the Guard prompt for? (Inspect Guard table via `guard2file`.)
- Do you have that data ready, or do we collect it in R8?

**Tool Calls**:
1. `guard2file` → export every Guard the operation will hit — inspect `table` entries with `b_submission: true` to know what the prompt will ask.
2. `wowok_buildin_info` → `info: "guard instructions"` — confirm any `query` node's instruction ID and parameter count.

**Success Criteria**: AI can enumerate the exact submission fields the user will be prompted for, and the user has confirmed they can provide each.

**Fallback**: User cannot provide a submission value (e.g., KYC address they don't have) → halt, surface the Guard logic via `guard2file`, discuss whether to relax the Guard or pause the operation. Never submit placeholder data to a Guard.

**Checkpoint**: Persist `{ round: R7, expected_submissions: [{identifier, name, value_type}] }`.

### R8: Execute (Phase 1 — Probe)

**AI Goal**: Fire the operation WITHOUT `submission` to trigger the SDK's submission prompt. This is the safe first shot.

**Key Questions**:
- Confirm: I'm calling `<tool>` with `<operation_type>` and the data we prepared, but no submission yet. The SDK may return a prompt. Proceed?
- (If the call has no Guard) Confirm the full execution, since this is the only shot.

**Tool Calls**:
1. `onchain_operations` (or other write tool) with the full `data` and `env`, omitting `submission`.
2. Capture the response: either success (no Guard) or a structured submission prompt.

**Success Criteria**: Either the operation succeeds (no Guard involved) OR a structured submission prompt is returned and parsed.

**Fallback**: Call reverts with a gas error → re-faucet (R4 fallback), retry. Call reverts with "object not found" despite just creating it → set `env.no_cache: true` and retry (stale-cache trap from §Error Patterns). Schema validation error → re-read the schema via `schema_query`, fix the field, retry.

**Checkpoint**: Persist `{ round: R8, phase: probe, response: success|prompt, prompt_fields?: [...] }`.

### R9: Execute (Phase 2 — Submit) or Verify

**AI Goal**: If R8 returned a submission prompt, collect the user's answers and re-call with `submission` populated. If R8 succeeded, verify the on-chain state matches expectations.

**Key Questions**:
- (Phase 2) For each prompted field, what value should I submit?
- (Verify) Want me to query the resulting object and show you the diff?

**Tool Calls**:
1. (Phase 2) `onchain_operations` with the same `data` + `env` + `submission` populated.
2. (Verify) `query_toolkit` → `onchain_objects` for the resulting object ID; `onchain_events` for the emitted event.
3. (Optional) `local_mark_operation` → tag the new object with a friendly name.

**Success Criteria**: Operation finalizes successfully; on-chain query confirms the expected state; local mark persisted for future reference.

**Fallback**: Guard rejects the submission → consult the Guard's logic via `guard2file`, identify which `logic_*` or `query` node returned false, re-collect correct data, retry. Never bypass a Guard.

**Checkpoint**: Persist `{ round: R9, phase: submit|verify, object_id, tx_digest, verified: true }`.

### R10: Handoff & Next-Action Routing

**AI Goal**: Determine the next tool call from the current state, using the §Handoff triggers (from strategy doc §4) — make tool-to-tool transitions deterministic, not semantic guesses.

**Key Questions**:
- What do you want to do next? (If unsure, I can suggest based on what we just did.)
- (Internal) Does the just-completed operation have a deterministic next action per the Handoff table?

**Tool Calls**:
1. (Internal) Consult the Handoff trigger table: e.g., `service create` → next is `machine create`; `service publish` → next is `query_toolkit.verify`; `messenger WTS` → next is `arbitration.dispute`.
2. (Optional) `local_info_operation` → write a handoff packet with `current_state`, `completed_objects`, `next_actions`, `carry_context`.

**Success Criteria**: AI presents 1–3 candidate next actions with rationale; user picks one or declares done. Handoff packet persisted for resume.

**Fallback**: User wants an action that doesn't fit the Handoff table → treat as a new R1 intent and re-classify. User wants to stop → persist checkpoint with `journey: paused` and a resume hint.

**Checkpoint**: Persist `{ round: R10, handoff: { next_tool, next_op_type, carry: [...] }, journey: complete|paused }`.

---

## Decision Trees

### D1: Tool Family by Operation Class

```
User intent
├── Write on-chain state? ──→ onchain_operations
│   ├── Generating a credential? ──→ operation_type: gen_passport (no data wrapper)
│   ├── Transferring tokens? ──→ operation_type: payment (no submission)
│   ├── Updating personal profile? ──→ operation_type: personal (no submission)
│   └── Anything else? ──→ operation_type: service|machine|progress|guard|order|allocation|arbitration|treasury|reward|demand|contact|repository|permission (full wrapper)
├── Read on-chain state? ──→ query_toolkit OR onchain_table_data
│   ├── Single object or simple list? ──→ query_toolkit
│   ├── Dynamic table row? ──→ onchain_table_data (needs parent except entity_registrar / entity_linker)
│   └── Historical events? ──→ onchain_events
├── Communicate? ──→ messenger_operation
├── Local-only? ──→ account_operation | local_mark_operation | local_info_operation
├── Export for review? ──→ guard2file | machineNode2file | wip_file (verify/wts2html)
└── Discover schemas/instructions? ──→ schema_query | wowok_buildin_info
```

### D2: CREATE vs MODIFY (per object-typed field)

```
For each field whose value could be a string OR an object:
├── User said "reuse <name>" or gave 0x address? ──→ REUSE
│   ├── query_toolkit.onchain_objects verifies it resolves? ──→ use string value
│   └── Does not resolve? ──→ ask: typo, or did you mean CREATE?
├── User said "create new" with details? ──→ CREATE (object shape)
├── User unsure? ──→ query on-chain candidates, present list, let user pick or create
└── SDK auto-create shortcut ──→ pass object shape to a parent field (e.g., service.permission) and SDK creates the Permission implicitly — only for Permission, only when user accepts the auto-defaults
```

### D3: Submission Loop Branch

```
About to call onchain_operations:
├── Branch is gen_passport, payment, or personal? ──→ ONE-SHOT (no submission field)
├── Branch has submission in schema?
│   ├── Call WITHOUT submission first ──→ SDK returns prompt? ──→ collect answers, re-call WITH submission
│   └── SDK returns success (no Guard gated this op)? ──→ done, no phase 2 needed
└── gen_passport special case ──→ each Guard's submission passed via top-level info, not data.submission
```

### D4: Error Recovery Routing

```
Tool call returned error:
├── Gas / insufficient balance? ──→ query_toolkit.account_balance → faucet or transfer → retry
├── "Object not found" right after create? ──→ env.no_cache: true → retry (stale cache)
├── Guard validation failure? ──→ guard2file export → inspect logic tree → fix submission → retry
├── Schema validation error? ──→ schema_query.get for the branch → diff against payload → fix → retry
├── Permission denied? ──→ query Permission object → verify caller's index → add index or switch account
├── "machine not published" on service.publish? ──→ publish Machine first, then retry Service publish
└── Network timeout? ──→ retry once; if persists, switch network or escalate
```

### D5: Handoff Next-Action

```
Just-completed operation:
├── service CREATE ──→ next: machine CREATE (Service needs a Machine before publish)
├── machine CREATE ──→ next: guard CREATE × N (Guards must exist before binding)
├── guard CREATE ──→ next: gen_passport test (verify logic before binding)
├── service publish ──→ next: query_toolkit.onchain_objects verify bPublished=true
├── query Service ──→ next (if user wants contact): messenger_operation
├── messenger WTS send ──→ next: arbitration.dispute (evidence closed)
├── order.advance ──→ next: query allocation balance (verify fund flow)
└── None of the above ──→ re-invoke R1 intent classification
```

---

## Failure Playbooks

### F1: Schema List Returns Empty

**Trigger**: `schema_query` → `list` returns `[]` or throws "schemas not generated".

**Diagnosis**: The MCP server's schema files were not generated at deploy time. This is a deployment gap, not a usage error.

**Recovery**:
1. Surface the issue to the user plainly: "The schema files are missing on the server side."
2. Instruct running `npm run generate:schemas` on the MCP server host (per tool #13 in §The 13 Tools).
3. While waiting, fall back to the field shapes documented in this Skill and in [wowok-safety](../wowok-safety/SKILL.md) — they are authoritative even without the generated schema.
4. After regeneration, re-run `schema_query.list` to confirm.

**Prevention**: Add a `schema_query.list` health check at the start of every fresh session. If empty, fail fast and surface the deploy issue before any write attempt.

### F2: Stale Cache After Sequential Creates

**Trigger**: Operation B fails with "object not found" immediately after operation A created that object.

**Diagnosis**: The SDK's read cache hasn't invalidated between dependent calls. This is the #1 cache trap per §Error Patterns.

**Recovery**:
1. Retry operation B with `env.no_cache: true`.
2. If still failing, query the object directly via `query_toolkit` → `onchain_objects` with `no_cache: true` to confirm it actually exists on-chain.
3. If on-chain confirms existence, retry B once more with `no_cache: true`.

**Prevention**: When building multiple interdependent objects in one session (the common case in onboarding), set `env.no_cache: true` on EVERY operation from the start. The minor latency cost is far cheaper than debugging stale-cache failures mid-flow.

### F3: Submission Loop Misuse

**Trigger**: User (or AI) calls `onchain_operations` with `submission` populated on the first try, and the call either reverts or silently accepts wrong data.

**Diagnosis**: The two-phase pattern was skipped. Either the AI guessed the submission fields, or the user pasted a submission from a previous unrelated call.

**Recovery**:
1. Re-call the operation WITHOUT `submission` to get the authoritative prompt.
2. Diff the prompt's requested fields against what was previously submitted.
3. Re-collect any mismatched fields from the user.
4. Re-call WITH the corrected `submission`.

**Prevention**: Treat the submission prompt as the single source of truth for what the Guard needs. Never pre-fill `submission` from memory or past calls. The `gen_passport` exception (submissions via top-level `info`) is the only branch where submission data is passed differently — and even there, each Guard's submission is independent.

### F4: Guard creation fails with type mismatch

**Trigger**: `onchain_operations` → `operation_type: "guard"` CREATE reverts with a type-validation error (e.g., `logic_equal` received String vs U64).

**Diagnosis**: The computational tree has a type incompatibility that the schema-layer validation caught. Common variants: comparing across numeric widths without `logic_as_u256_*`, missing `convert_witness` when querying Progress from an Order, or a `query` node with the wrong parameter count.

**Recovery**:
1. Inspect the error message — it usually names the offending node and the expected vs actual types.
2. Cross-reference `wowok_buildin_info` → `info: "value types"` to confirm numeric codes.
3. Cross-reference `wowok_buildin_info` → `info: "guard instructions"` to confirm the `query` node's instruction ID and parameter count.
4. Fix the tree, re-attempt CREATE. Guards are CREATE-only — there is no MODIFY, so a failed CREATE simply retries.

**Prevention**: Before any Guard CREATE, mentally (or via a scratch file) walk the tree: every `identifier` index exists in the table; every comparison node receives compatible operand types; every `query` node's parameter count matches the instruction. The §Guard Best Practices traps 1–4 catch 90% of pre-flight issues.

### F5: Tool Returns "Permission Denied"

**Trigger**: Operation reverts with a permission error despite the user believing they have access.

**Diagnosis**: The operating account lacks the required `permissionIndex` in the governing Permission object, OR the Forward's `namedOperator` doesn't match the caller's role.

**Recovery**:
1. `query_toolkit` → `onchain_objects` for the governing Permission — list its indices.
2. Cross-reference the operation's required index (from the schema or the Machine Forward definition).
3. Either: switch to an account that holds the index, OR have the Permission owner add the index for the current account, OR (if Forward uses `namedOperator`) assign the role via `progress` MODIFY.

**Prevention**: During onboarding R6 (Permission resolution), record the full index→role map in the checkpoint. Before any operation, verify the caller's account holds the required index — this is a 1-query pre-flight that prevents 100% of permission-denied failures.

### F6: Faucet Exhausted on Testnet

**Trigger**: `account_operation` → `faucet` returns rate-limit or timeout.

**Diagnosis**: Testnet faucet has per-account and per-IP rate limits. Common during onboarding loops with many test orders.

**Recovery**:
1. Wait 60 seconds and retry once.
2. If still failing, `account_operation` → `transfer` 1 WOW (10^9 base units) from another funded account the user owns.
3. If no other account exists, surface the issue and pause — do not silently reduce example amounts (per §Mainnet operations, this rule applies to mainnet too).

**Prevention**: Pre-fund each new account with 5+ WOW at creation time via a single `transfer` from a treasury account, rather than relying on faucet per-operation. Track each account's balance in `local_info_operation` and proactively top up below 1 WOW threshold.

---

## Tier Layering

### Novice Tier — Tool Discovery Path

- Always start with `query_toolkit` → `local_names` to ground the conversation in objects the user already knows.
- Use the §Decision Tree D1 (Tool Family by Operation Class) as a rigid router — do not let the user invoke tools by raw name until they've classified their intent.
- For every `onchain_operations` call, follow the full R1-R10 sequence: classify → select → wrap → env → CREATE/MODIFY → permission → submission prep → probe → submit → handoff.
- The two-phase submission loop is non-negotiable: never pre-fill `submission`.
- Always set `env.no_cache: true` when building multiple objects in one session.
- After every write, verify via `query_toolkit` → `onchain_objects` before declaring success.
- Trigger: user is new, or any time the AI is unsure which tool fits.

### Advanced Tier — Direct Tool Invocation

- User invokes tools by name (e.g., "call `onchain_operations` with `operation_type: machine`"); AI provides the parameter shape and verifies, but does not re-classify intent from scratch.
- The R1-R3 rounds can be collapsed into a single confirmation: "You want `<tool>` + `<operation_type>`. Confirm?"
- `env.no_cache` is set selectively — only on operations known to depend on just-created objects.
- Submission loop is still two-phase, but the AI pre-fetches the Guard's expected submissions via `guard2file` in parallel with R8's probe call, so R9 is faster.
- Handoff next-actions are surfaced as suggestions, not enforced.
- Trigger: user says "I know what I'm doing" or has completed prior sessions.

### Expert Tier — Raw Schema & Edge Cases

- User reads schemas directly via `schema_query` and constructs payloads by hand; AI's role is to catch schema-inexpressible traps (the three wrapper exceptions, first-Guard-wins ordering, convert_witness type rules) rather than to route.
- R1-R7 are skipped; AI engages at R8 (execute) and R10 (handoff).
- The §Common Pitfalls table and §Structural Wrapper Rules become the primary reference, not the decision trees.
- Expert users may compose multiple tool calls in a single transaction batch (where the SDK supports it) — AI verifies dependency ordering but does not serialize.
- Expert users may use `gen_passport` as a standalone credential issuer (off-chain verification use case), not just as a Guard test — AI supports this path directly.
- Trigger: user explicitly asks for "expert mode", references tools by raw name with parameters, or invokes `schema_query` themselves.