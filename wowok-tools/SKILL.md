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

## Sub-Tool Schema-Inexpressible Constraints

> MCP schemas define field types/validation. The constraints below are business rules NOT expressible in schemas — AI must know them before calling.

### `onchain_operations` (18 sub-types)

| `operation_type` | Key Constraints (not in schema) |
|-----------------|----------------------------------|
| `service` | `machine` must be **published**. Allocators: array order = priority (first-Guard-wins). Publish locks `machine`/`order_allocators`; `sales`/`discount`/`description` stay mutable. |
| `machine` | Nodes immutable after publish. Forward needs ≥1 of `namedOperator`/`permissionIndex` (both empty = SDK error). `""` = entry node. → [wowok-machine](../wowok-machine/SKILL.md) |
| `progress` | Two-phase: `hold:true` (lock) → `hold:false` (submit). `adminUnhold:true` force-releases. SDK auto-fetches Machine when resolving `object_address`. |
| `arbitration` | MAX 20 propositions, 520 voters. Verdict (2→3) **irreversible** — only customer can `order.arb_objection`. Non-Finished withdrawal = 30-day wait. → [wowok-arbitrator](../wowok-arbitrator/SKILL.md) |
| `guard` | `root.type:"node"` (inline) or `"file"` (JSON/MD). MAX 4 `rely`. `rep:false` Guards excluded from others' `rely`. System addresses `0xaab`/`0xaaa` need table entries. → [wowok-guard](../wowok-guard/SKILL.md) |
| `gen_passport` | MAX 20 Guards/call (AND-ed). Omit `info` to auto-fetch. Passport = frozen immutable credential. |
| `order` | Agents can operate but **cannot withdraw** — only builder. `order.progress`+Guard requires Passport. Arb via `order.arb_confirm`/`arb_objection` (not `arbitration` directly). `arb_claim_compensation` once-only. → [wowok-order](../wowok-order/SKILL.md) |
| `payment` | `type_parameter` required. **Irreversible** — no refund. |
| `personal` | **Permanently public** — warn users before writing sensitive data. |
| `demand` | Guard-gated: `guards` filter presenters. Separate from Service. |
| `treasury` | Guardable deposits/withdrawals. Each entry creates Payment record for audit. |
| `repository` | Composite key: `name + entity`. Guard validates writer + content. |
| `reward` | `guard_add`: `Fixed` (equal) or `GuardU64Identifier` (dynamic). `guard_expiration_time` freezes Guard list; `null` removes. |
| `allocation` | Auto-executes on Progress advance. Order: Amount → Rate → Surplus, first-Guard-wins per mode. |
| `contact` | Bridge: Service `um` ↔ Messenger `ims[]`. IM mutations need permission index 453; no events (poll `ims[]`). |
| `permission` | 0–999 reserved; custom ≥1000. SDK rejects <1000. Reusable across objects. |
| `proof` | Immutable (freeze_object). `proof_type=1` reserved for WTS; >100 for custom. Large data → Repository + `about_address`, not inline. |
| `gen_proof` | Convenience wrapper: creates Proof without `namedNew`. Same immutability rules. Use `proof` with `namedNew` when naming is needed. |

**WIP hash anti-bait**: Capture `sale.wip_hash` when browsing; pass in `buy.items[].wip_hash`. Two-layer: SDK verifies file hash off-chain, Move asserts on-chain. Merchant swap = order fails.

### Other Tools (compact)

| Tool | Key Constraints |
|------|----------------|
| `query_toolkit` | `token_list` cached (first query populates). `account_balance`: `balance=true` for totals, `coin={cursor,limit}` for paginated. `onchain_objects` batches 50/req. `local_names` resolves accounts + marks. |
| `onchain_table_data` | 12 types. Global (no `parent`): `entity_registrar`, `entity_linker`. `onchain_table_item_generic` = universal fallback. |
| `account_operation` | `faucet` testnet/localnet only. Mainnet funding: `transfer` from existing account (1 WOW = 10^9 base units). `gen` with `m` enables Messenger. Private keys never leave device. |
| `local_mark_operation` | Max 50 tags/entry (64 chars). `replaceExistName:true` steals names — prefer `_v1`/`_v2`. |
| `local_info_operation` | Max 50 contents/entry, 300 chars each. |
| `messenger_operation` | Stranger: 1 msg before reply (~480 chars). Guard block → rejection includes guard list; sender needs Passport. WTS: `generate` needs continuous sequences. → [wowok-messenger](../wowok-messenger/SKILL.md) |
| `wip_file` | `verify`: hash → signatures stepwise. `wip2html`: single file or directory. |
| `guard2file` | Read-only export to JSON/Markdown. |
| `machineNode2file` | Read-only; exports complete topology. |
| `onchain_events` | 6 event types; cursor `{eventSeq, txDigest}`. |
| `wowok_buildin_info` | 5 info types. Guard instructions filter by `name`/`return_type`/`param_count`. **Never use Value type 19**. |
| `schema_query` | `list` returns empty if schemas not generated → `npm run generate:schemas`. |

---

## Supporting Objects — When to Use

> MCP handles risk assessment + confirmation rules automatically. This section covers business decisions NOT in schemas — WHEN and WHY to choose each object type.

### Proof vs WIP

| Aspect | Proof (on-chain) | WIP (off-chain file) |
|--------|-----------------|---------------------|
| Purpose | Cryptographic attestation (merkle root, server signature, timestamp) | Product description + images for arbitration evidence |
| Immutability | `freeze_object` — permanent on-chain record | File hash anchored on-chain; file stored off-chain |
| Size | `MAX_PROOF_SIZE` (compact digests only) | Unlimited (file-based) |
| Use when | Need on-chain timestamp + signature verification | Need product evidence for order disputes |

`gen_proof` = convenience (no `namedNew` wrapper). `proof` with `namedNew` = named object for reuse by reference. For large data, store in Repository and set `about_address` to the Repository ID.

### Treasury vs Allocation

| Aspect | Treasury | Allocation |
|--------|----------|------------|
| Purpose | Team fund management (deposit/withdraw with audit trail) | Order fund distribution (auto-trigger on Progress advance) |
| Trigger | Manual deposit/withdraw (Guard-gated) | Automatic when Progress reaches configured node |
| Guard | External guard on withdrawals | Allocation guard on distribution rules |
| Use when | Holding pooled funds, compensation funds, team wallets | Splitting order payments among recipients |

Compensation fund = Treasury bound to Service. Each Treasury entry creates a Payment record for audit. Withdrawal requires Guard verification.

### Reward (Incentive Pools)

Guard-gated claim pools: `claim_guard` verifies eligibility before payout. `guard_add` modes: `Fixed` (equal split among claimants) or `GuardU64Identifier` (dynamic amount from Guard table index). `guard_expiration_time` freezes the Guard list (set `null` to remove freeze). Use cases: customer loyalty rewards, referral bonuses, airdrop campaigns, attendance rewards. Query claim history via `query_toolkit` → `onchain_table_item_reward_record`.

### Demand (Customer-Posted Requests)

Demand is the **inverse** of Service: customer posts a request + optional reward pool, providers submit offers. Guard-gated: `guards` filter which providers can present. `recommend_guard` filters presenter submissions. Separate `operation_type: "demand"` — NOT `service`. Use when: customer needs competitive bids (custom work, bulk procurement, reverse-auction marketplace). Pair with Reward to incentivize providers.

### Repository (On-Chain Database)

Composite key: `name + entity`. Guard validates writer identity + content integrity. `id_from_submission` (must be Address) and `data_from_submission` (must match Repository's `value_type`) extract structured data from Guard submissions. Use cases: supply-chain tracking, multi-party attestation, dynamic pricing data, KYC registries. MAX 50 policies per Repository, 100 IDs per operation. Guard design: see [wowok-guard](../wowok-guard/SKILL.md) §"Where Guards Attach".

### Contact (Service.um Bridge)

Contact is the on-chain bridge: `Service.um` → `Contact` → `ims[]` (Messenger endpoints). Create BEFORE Service publish when `customer_required` is set. Contact can also bind to `Permission.um` (bidirectional dependency — clear `Permission.um` via `permission_um_set(null)` before deleting Contact). IM list mutations (`im_add`/`im_remove`) require permission index 453; no events emitted (poll `ims[]` field). Full Messenger integration: see [wowok-messenger](../wowok-messenger/SKILL.md).

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

5 examples in `examples/` directory: **Insurance** (⭐ time-lock Guard), **MyShop** (⭐⭐ e-commerce, Messenger, discounts), **MyShop_Advanced** (⭐⭐⭐ 11+ nodes, dual-sig, Merkle Root, Reward), **Travel** (⭐⭐⭐ Repository Guard, supply chain), **ThreeBody_Signature** (⭐ Buy Guard). Each includes `*_TestResults.md` with real testnet data. Match user intent → example complexity → extract JSON patterns.

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
