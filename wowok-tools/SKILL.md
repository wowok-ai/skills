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
| Service `machine`/`order_allocators`/`arbitrations` | After publish (SDK-locked) | Create new Service |
| Service `buy_guard` | **NOT locked** — mutable after publish | Can modify directly |
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
| `service` | `machine` must be **published**. Allocators: array order = priority (first-Guard-wins). **Publish locks 3 fields (SDK-level)**: `machine`/`order_allocators`/`arbitrations` — MUST be set BEFORE `publish:true`. **buy_guard is MUTABLE after publish** (no SDK/Move lock). `setting_locked_time_add` is extendable. TIME-LOCKED (need pause + setting_lock_duration): `rewards` remove/clear. REMAIN MUTABLE: `sales`/`discount`/`description`/`location`/`pause`/`repositories`/`rewards`(add)/`compensation_fund_add`/`customer_required`/`um`/`buy_guard`. To change locked fields after publish, clone a new Service. |
| `machine` | Nodes immutable after publish. Forward needs ≥1 of `namedOperator`/`permissionIndex` (both empty = SDK error). `""` = entry node. → [wowok-machine](../wowok-machine/SKILL.md) |
| `progress` | CANONICAL form: `operate: {operation: {next_node_name, forward}, op: "next"\|"hold"\|"unhold"\|"adminUnhold", message?}`. LEGACY `hold: boolean` is auto-converted (`hold:true`→`op:'hold'`, `hold:false`→`op:'next'`). SDK auto-fetches Machine when resolving `object_address`. **⚠ Routing rule**: Use `progress.operate` ONLY for forwards with non-empty `namedOperator` or `permissionIndex`-only. For forwards with `namedOperator=""` (OrderHolder), use `order.progress` instead — direct `progress::next` aborts with Permission denied (code 5). |
| `arbitration` | MAX 20 propositions, 520 voters. Verdict (2→3) **irreversible** — only customer can `order.arb_objection`. Non-Finished withdrawal = 30-day wait. → [wowok-arbitrator](../wowok-arbitrator/SKILL.md) |
| `guard` | `root.type:"node"` (inline) or `"file"` (JSON/MD). MAX 4 `rely`. `rep:false` Guards excluded from others' `rely`. System addresses `0xaab`/`0xaaa` need table entries. → [wowok-guard](../wowok-guard/SKILL.md) |
| `gen_passport` | MAX 20 Guards/call (AND-ed). Omit `info` to auto-fetch. Passport = frozen immutable credential. |
| `order` | Agents can operate but **cannot withdraw** — only builder. `order.progress`+Guard requires Passport. **⚠ Routing rule**: `order.progress` works ONLY for forwards with `namedOperator=""` (OrderHolder) — uses `order.has_op_permission`. For non-empty `namedOperator` or `permissionIndex`-only forwards, use `progress.operate` on the Progress object directly. Arb via `order.arb_confirm`/`arb_objection` (not `arbitration` directly). `arb_claim_compensation` once-only. → [wowok-order](../wowok-order/SKILL.md) |
| `payment` | TWO modes: (1) CREATE: `type_parameter` required, `revenue[]` + `info`. **Irreversible** — no refund. (2) RECEIVE: `{object: '<coinwrapper_id_or_name>', receive: true, type_parameter: '0x2::wow::WOW'}` — unwraps a CoinWrapper (created by Allocation's `alloc_by_guard`) to the caller's wallet via `payment::unwrap_to_myself`. **CoinWrapper DOES arrive** in recipient's wallet via `transfer::public_transfer` (as an owned object), but it is NOT spendable coins — recipient must call `payment receive` to unwrap it into actual coins. Find received CoinWrappers via `query_toolkit` with `query_type='onchain_received'`. |
| `personal` | **Permanently public** — warn users before writing sensitive data. |
| `demand` | Guard-gated: `guards` filter presenters. Separate from Service. |
| `treasury` | Guardable deposits/withdrawals. Each entry creates Payment record for audit. |
| `repository` | Composite key: `name + entity`. Guard validates writer + content. |
| `reward` | `guard_add`: `Fixed` (equal) or `GuardU64Identifier` (dynamic). `guard_expiration_time` freezes Guard list; `null` removes. |
| `allocation` | **Manual trigger** — `alloc_by_guard` does NOT auto-execute on Progress advance. After advancing Progress, call `allocation` with `{object: '<alloc_name>', alloc_by_guard: '<guard_name>'}` to release funds. Order: Amount → Rate → Surplus, first-Guard-wins per mode. Each trigger releases currently-available balance based on Guard validation. Also: `received_coins` unwraps CoinWrappers into the Allocation's pending balance for re-allocation. |
| `contact` | Bridge: Service `um` ↔ Messenger `ims[]`. IM mutations need permission index 453; no events (poll `ims[]`). |
| `permission` | 0–999 reserved; custom ≥1000. SDK rejects <1000. Reusable across objects. |
| `proof` | Immutable (freeze_object). `proof_type=1` reserved for WTS; >100 for custom. Large data → Repository + `about_address`, not inline. |
| `gen_proof` | Convenience wrapper: creates Proof without `namedNew`. Same immutability rules. Use `proof` with `namedNew` when naming is needed. |

### Customer Operation Routing (decision tree)

```
forward.namedOperator?
├─ "" (empty = OrderHolder) → order.progress (NOT progress.operate)
│   └─ progress::next aborts: "Permission denied" (code 5)
│   └─ Needs Passport if forward has guard
└─ "<non-empty>" or permissionIndex-only → progress.operate
    └─ Provider or named operator executes
```

> **Invariant**: `namedOperator === ""` ⟹ MUST use `order.progress`. No exceptions.

**WIP hash anti-bait**: Capture `sale.wip_hash` when browsing; pass in `buy.items[].wip_hash`. Two-layer: SDK verifies file hash off-chain, Move asserts on-chain. Merchant swap = order fails.

### Other Tools (compact)

| Tool | Key Constraints |
|------|----------------|
| `query_toolkit` | `token_list` cached (first query populates). `account_balance`: `balance=true` for totals, `coin={cursor,limit}` for paginated. `onchain_objects` batches 50/req. `local_names` resolves accounts + marks. **To list all local accounts**: use `query_type='account_list'` (account_operation itself has no list action). **To find received CoinWrappers** (for payment receive): use `query_type='onchain_received'`. |
| `onchain_table_data` | 12 types. Global (no `parent`): `entity_registrar`, `entity_linker`. `onchain_table_item_generic` = universal fallback. |
| `account_operation` | `faucet` testnet/localnet only. Mainnet funding: `transfer` from existing account (1 WOW = 10^9 base units). `gen` with `messenger: true` enables Messenger. **Naming convention**: `<role>-<number>` (e.g. `shop-001`, `user-001`, `arb-001`) for easy filtering. `gen.replaceExistName:true` is DISCOURAGED — suspends old account; FORBIDDEN on default account (name=''). Private keys never leave device. **No `list` action** — to enumerate all local accounts, use `query_toolkit` with `query_type='account_list'`. |
| `local_mark_operation` | Max 50 tags/entry (64 chars). `replaceExistName:true` steals names — prefer `_v1`/`_v2`. |
| `local_info_operation` | Max 50 contents/entry, 300 chars each. |
| `messenger_operation` | Stranger: 1 msg before reply (~480 chars). Guard block → rejection includes guard list; sender needs Passport. WTS: `generate` needs continuous sequences. → [wowok-messenger](../wowok-messenger/SKILL.md) |
| `wip_file` | `verify`: hash → signatures stepwise. `wip2html`: single file or directory. |
| `guard2file` | Read-only export to JSON/Markdown. |
| `machineNode2file` | Read-only; exports complete topology. |
| `onchain_events` | 6 event types; cursor `{eventSeq, txDigest}`. |
| `wowok_buildin_info` | 5 info types. Guard instructions filter by `name`/`return_type`/`param_count`. **Never use Value type 19**. |
| `schema_query` | `list` returns empty if schemas not generated → `npm run generate:schemas`. Actions: `list`, `get` (full schema), `get_field` (field-path query e.g. `field_path='data.node'`), `get_output` (output schema), `search`, `list_operations`, `get_guard_templates` (Guard creation templates + best practices + common errors). Use `output_file='.trae/tmp/schema.json'` to write large schemas to workspace temp files (accessible via Read tool). |
| `project_operation` | Sub-tool for project lifecycle: `create_project`, `add_object`, `build_graph`, `evaluate_project`, `pre_evaluate_check`, `verify_deployment`, `create_version`, `get_project_detail`. See §"Project Operation Extended Actions" below for the two pre/post-publish verification actions. |

### Project Operation Extended Actions

Two `project_operation` actions act as **pre-flight and post-flight verification** around `evaluate_project` / deployment. They never mutate on-chain state — they only query and report.

#### `pre_evaluate_check` (Pre-evaluation Readiness)

**Purpose**: Verify input data completeness BEFORE calling `evaluate_project`, so callers can fix missing/stale data without paying the cost of a full evaluation.

**Call pattern**: `wowok({ tool: "project_operation", data: { action: "pre_evaluate_check", project_id: "..." } })`

**Returns**:
- `ready: boolean` — true if `evaluate_project` will produce meaningful results
- `missing[]` — hard blockers (e.g., PE-01 empty project, PE-06 producer without Service)
- `warnings[]` — soft issues (PE-02 no graph edges, PE-03 uncached objects, PE-04 stale cache >24h, PE-05 dangling edges, PE-07 all drafts)
- `counts` — quick metrics: `objects`, `edges`, `uncached`, `stale`, `dangling_edges`, `drafts`
- `summary` — one-line human-readable status

**When to use**: Always call BEFORE `evaluate_project`. If `ready=false`, fix the listed `missing` issues first. If `warnings` exist, decide whether to refresh data (`refresh_objects`, `build_graph`) or proceed with caveats.

#### `verify_deployment` (Post-deployment Drift Detection)

**Purpose**: After deploying objects on-chain, verify the on-chain state matches what SQLite expects. Catches drift caused by manual edits, version bumps, or third-party modifications after initial deployment.

**Call pattern**: `wowok({ tool: "project_operation", data: { action: "verify_deployment", project_id: "..." } })`

**Returns per-object verification status**:
- `matched` — on-chain state matches SQLite
- `mismatched` — on-chain state differs (fields listed in `differences`)
- `missing` — object no longer exists on-chain
- `unreachable` — query failed (network error or rate limit)

**Also checks critical bindings for Service objects**: `machine`, `permission`, `buy_guard`, `order_allocators` are all set to non-null on-chain if they were recorded as bound in SQLite.

**When to use**: After every publish operation (Service publish, Machine publish). Periodically for production monitoring. When debugging "evaluation says bound but on-chain says unbound" discrepancies.

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
| Purpose | Team fund management (deposit/withdraw with audit trail) | Order fund distribution (manual `alloc_by_guard` trigger after Progress advance) |
| Trigger | Manual deposit/withdraw (Guard-gated) | Manual `alloc_by_guard` after Progress advance (NOT automatic) |
| Guard | External guard on withdrawals | Allocation guard on distribution rules |
| Use when | Holding pooled funds, compensation funds, team wallets | Splitting order payments among recipients |

**Compensation fund ≠ Treasury**: `Service.compensation_fund` is `Balance<T>` stored inline on the Service object (per service.move:179), NOT a Treasury address. Treasury is an independent object. Funds are added via `compensation_fund_add` (joins Coin<T> into the balance) and withdrawn via `compensation_fund_receive` after pause + lock duration. Each Treasury entry creates a Payment record for audit; withdrawal requires Guard verification.

### Reward (Incentive Pools)

Guard-gated claim pools: each entry in `Reward.guards[].guard` (array — see wowok-guard SKILL) verifies eligibility before payout. `guard_add` modes: `Fixed` (equal split among claimants) or `GuardU64Identifier` (dynamic amount from Guard table index). `guard_expiration_time` freezes the Guard list (set `null` to remove freeze). Use cases: customer loyalty rewards, referral bonuses, airdrop campaigns, attendance rewards. Query claim history via `query_toolkit` → `onchain_table_item_reward_record`.

### Demand (Customer-Posted Requests)

Demand is the **inverse** of Service: customer posts a request + optional reward pool, providers submit offers. Guard-gated: each entry in `Demand.guards[].guard` (array — see wowok-guard SKILL) filters which providers can present. The `service_identifier` field on each ServiceGuard differentiates filtering roles (e.g., recommend vs. eligibility). Separate `operation_type: "demand"` — NOT `service`. Use when: customer needs competitive bids (custom work, bulk procurement, reverse-auction marketplace). Pair with Reward to incentivize providers.

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

## Cross-Network Name Management (testnet → mainnet)

> Object addresses differ between testnet and mainnet. WoWok uses **local names** to bridge this gap — the same name resolves to different addresses on different networks.

### How Name Resolution Works

- **Local names** are stored per-network in the local SQLite database (`LocalMark`).
- When you create an object with `namedNew.name = "my_service"`, the name→address mapping is stored for the **current network** (specified in `env.network`).
- When you reference `"my_service"` in a subsequent call, the SDK resolves it to the address **for the current network**.
- Names are **NOT shared across networks** — testnet and mainnet have separate name registries.

### Testnet → Mainnet Migration Workflow

1. **Develop and test on testnet**: Create all objects with `replaceExistName: true` and consistent names (e.g., `myshop_permission`, `myshop_machine`, `myshop_service`).
2. **Record the JSON call sequence**: Save all `onchain_operations` calls (with their `data` and `env` fields) that worked on testnet.
3. **Switch `env.network` to `mainnet`**: Change `env.network` from `"testnet"` to `"mainnet"` in all calls. Also switch `env.account` to a mainnet-funded account.
4. **Re-run the same call sequence on mainnet**: With `replaceExistName: true` on all object creations, the same names will be re-registered to new mainnet addresses. All cross-references (e.g., `permission: "myshop_permission"` in Machine) will resolve to the new mainnet addresses automatically.
5. **Fund the mainnet account**: Use `account_operation` with `transfer` from a funded account (1 WOW = 10^9 base units).

### Key Rules

| Rule | Detail |
|------|--------|
| `replaceExistName: true` | Re-creates the name→address mapping for the current network. Use on all object creations when re-deploying. |
| Name consistency | Use the SAME names across testnet and mainnet. The SDK resolves names per-network, so `"my_service"` on testnet ≠ `"my_service"` on mainnet (different addresses). |
| `env.network` | The ONLY field that changes between testnet and mainnet runs. All `data` fields (names, references, configs) stay the same. |
| Object references | Always use names (strings), NOT hardcoded addresses (0x...). Hardcoded addresses break across networks. |
| Account funding | `faucet` works only on testnet/localnet. Mainnet requires `transfer` from an existing funded account. |

### Example: Testnet → Mainnet

```json
// testnet call (works)
{
  "tool": "onchain_operations",
  "data": {
    "operation_type": "service",
    "data": { "object": { "name": "my_service", "permission": "my_permission", ... } },
    "env": { "account": "test_account", "network": "testnet", "confirmed": true }
  }
}

// mainnet call (same data, only env changes)
{
  "tool": "onchain_operations",
  "data": {
    "operation_type": "service",
    "data": { "object": { "name": "my_service", "permission": "my_permission", ... } },
    "env": { "account": "main_account", "network": "mainnet", "confirmed": true }
  }
}
```

### Common Mistakes

- **Hardcoding addresses**: `"machine": "0xabc123..."` breaks on mainnet. Use `"machine": "my_machine"` instead.
- **Forgetting `replaceExistName`**: Without it, re-deploying to a new network creates a name conflict if the name already exists locally.
- **Mixing networks in one session**: All calls in a deployment sequence should use the same `env.network`. Mixing testnet and mainnet calls causes name resolution failures.

---
