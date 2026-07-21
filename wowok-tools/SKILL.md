---
name: wowok-tools
description: |
  WoWok MCP tool reference — canonical documentation for the single unified
  `wowok` tool and its 17 sub-tools. Covers schema-inexpressible constraints,
  business rules, interaction patterns, and design decisions not captured by
  JSON Schema.

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

Canonical reference for the single unified `wowok` tool and its 17 sub-tools. Covers patterns, constraints, and design decisions that **JSON Schema cannot express**. For detailed business workflows, see the Domain and Business Skills below.

> **Domain Skills**: [wowok-guard](../wowok-guard/SKILL.md) (validation logic), [wowok-messenger](../wowok-messenger/SKILL.md) (encrypted messaging), [wowok-machine](../wowok-machine/SKILL.md) (workflows), [wowok-safety](../wowok-safety/SKILL.md) (safety & naming)
> **Business Skills**: [wowok-order](../wowok-order/SKILL.md) (customer), [wowok-provider](../wowok-provider/SKILL.md) (merchant), [wowok-arbitrator](../wowok-arbitrator/SKILL.md) (dispute resolution)

---

## Single-Tool Interface (Schema-Gated Execution)

MCP `tools/list` returns **only one tool**: `wowok`. All operations go through it.

**Call pattern**: `wowok({ tool: "<sub-tool-name>", data: {<sub-tool params>} })`

When any skill (including this one) says "Call `onchain_operations`" or "Use `schema_query`", translate it to:
```
wowok({ tool: "onchain_operations", data: { operation_type: "service", ... } })
wowok({ tool: "schema_query", data: { action: "get", name: "onchain_operations" } })
```

**Schema-gated execution**: If `data` doesn't match the sub-tool's schema, the response includes:
- `result.status = "schema_mismatch"` — validation failed
- `result.errors` — specific field errors
- `result.hint` — instructions to fix and retry
- `schema.input` — the correct JSON schema for the sub-tool
- `schema.tool` — which sub-tool this schema belongs to

**Schema caching**: Each sub-tool has a different schema. When you receive a schema in a mismatch response, cache it in your context for future calls to the same sub-tool. You should only need to see each sub-tool's schema once per conversation.

---

## 🔴 Gas and Faucet

On-chain operations require gas. Transactions will fail if the account has insufficient balance.

### For AI Assistant

When assisting users with WoWok operations:

- After a user creates a new account, proactively call `wowok({ tool: "account_operation", data: { faucet: { ... } } })` to claim test tokens
- Before starting any on-chain workflow, check balance via `wowok({ tool: "query_toolkit", data: { query_type: "account_balance", ... } })`
- If balance is below 1 WOW, automatically request faucet without asking the user
- If a transaction fails due to gas, retry after claiming more tokens

### Tool Reference

- **Claim tokens**: `wowok({ tool: "account_operation", data: { faucet: { ... } } })` (not `onchain_operations`)
- **Check balance**: `wowok({ tool: "query_toolkit", data: { query_type: "account_balance", ... } })`

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

## The 17 Sub-Tools (all via `wowok({ tool, data })`)

### 1. `onchain_operations` — 16 Sub-Types

> **Schema**: `wowok({ tool: "schema_query", data: { action: "get", name: "onchain_operations" } })` for the full discriminated union. Per-type schemas: `onchain_operations_service`, `onchain_operations_machine`, etc.

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
All calls via: wowok({ tool: "<sub-tool>", data: {<params>} })

Write state? → tool: "onchain_operations" (choose operation_type in data)
├── No data wrapper? → only gen_passport
├── No submission?    → only payment, personal
└── String (MODIFY) vs Object (CREATE)? → safety §1.1

Read state?  → tool: "query_toolkit" / "onchain_table_data"
Communicate? → tool: "messenger_operation" (encrypted)
Local only?  → tool: "account_operation" / "local_mark_operation" / "local_info_operation"
Export?      → tool: "guard2file" / "machineNode2file"
Discover?    → tool: "schema_query" / "wowok_buildin_info" / "onchain_events"
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
| **Calling sub-tool name directly** | MCP only exposes `wowok`. Use `wowok({ tool: "onchain_operations", data: {...} })`, not `onchain_operations({...})` |
| **Schema validation error** | The response includes `schema.input` — read it, fix params, retry. Cache the schema for future calls to the same sub-tool. |
| **Transaction fails, gas error** | → [Pre-Flight: Gas & Faucet](#pre-flight-gas--faucet). AI should auto-check balance + faucet. |
| **Don't know how to build a service** | → [Examples Reference](#examples-reference). Match user intent → example, extract JSON templates. |
| `gen_passport` called as standalone tool | It's not — use `wowok({ tool: "onchain_operations", data: { operation_type: "gen_passport", ... } })` |
| Missing `data` wrapper | Only `gen_passport` omits it; `payment`/`personal` omit `submission` |
| String `object` passed expecting CREATE | String = existing (MODIFY), Object = new (CREATE) → [safety §1.1](../wowok-safety/SKILL.md) |
| Missing `submission` on Guard call | See [Submission Loop](#submission-loop-two-phase) — two-phase pattern: call without `submission` first, collect data, re-call with it |
| Publishing before all deps ready | Guard/Machine immutable after create/publish. Test via `gen_passport` before finalizing |
| `demand` via `service` operation_type | Separate `operation_type: "demand"` — Demand posts are not Services |
| Arbitration called directly | Customer path: `order.arb_confirm` / `order.arb_objection`. Order is the interface |

---

## Appendices (Progressive Disclosure)

> The following sections have been extracted to [APPENDIX.md](./APPENDIX.md) for on-demand loading:
> - Dialogue Scripts (R1-R10) — guided conversation scripts
> - Decision Trees — branching logic reference
> - Failure Playbooks — recovery scenarios
> - Tier Layering — expertise-tier based guidance
>
> Load APPENDIX.md when the user needs guided dialogue, recovery help, or tier-specific guidance.
