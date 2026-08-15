---
name: wowok-provider
description: |
  WoWok Service Provider — the canonical skill for service providers (merchants, sellers)
  to build, operate, and manage commercial services on WoWok.

  Covers service design (WIP products, Machine workflows, Allocator strategies),
  trust mechanisms (compensation funds, arbitration), customer attraction
  (discounts, rewards, supply chain promises), and order fulfillment.

  For customers placing orders, see wowok-order. For arbitrators, see wowok-arbitrator.
when_to_use:
  - User is a service provider/merchant/seller on WoWok
  - User wants to create a commercial service/marketplace
  - User wants to design workflow (Machine) for order processing
  - User wants to set up fund distribution strategies (Allocators)
  - User wants to configure trust mechanisms (compensation, arbitration)
  - User wants to handle order fulfillment and customer service
  - User mentions "create service", "merchant", "seller", "provider", "workflow design", "compensation", "arbitration"
---

# WoWok Service Provider Guide

> **Role**: Service Provider (Merchant/Seller)
> **Related Skills**: [wowok-order](../wowok-order/SKILL.md) (customer), [wowok-machine](../wowok-machine/SKILL.md) (workflow), [wowok-messenger](../wowok-messenger/SKILL.md) (communication)

---

## MCP Knowledge Layer

The following rule tables have been pushed down to the MCP knowledge layer and are automatically applied during project operations. You do NOT need to manually check these — the MCP server enforces them.

| Rule Category | Access via (MCP action) | Applied By |
|---------------|--------------------------|------------|
| Safety rules (confirmation, immutability, object reuse) | `schema_query` action='get_safety_rules' | `evaluate_project` + `onchain_operations` pre-publish |
| Guard design patterns | `schema_query` action='get_guard_design_patterns' | `evaluate_project` (guard risk assessment) |
| Machine topology rules | auto-applied | `evaluate_project` (machine risk assessment) |
| Scenario mode defaults | `project_operation` action='list_modes' | `create_project` (pass `project_industry` parameter) |
| Tool reference (gas, faucet, wrappers) | `schema_query` action='get_tool_reference' | All tool calls automatically |

**How to use**: Call `project_operation` with `action: "evaluate_project"` (evaluation_type='risk') after completing your puzzle — the MCP server will automatically apply all relevant safety rules and return risk findings.

---

## Core Interaction Principles

These four principles govern every service build/modify step. They mirror the wowok-onboard model and are non-negotiable.

1. **Review-first**: State (a) what the AI understood about the service, (b) the dependency order to build/modify, and (c) the interaction contract — before the first choice.
2. **User-driven**: Every step is an explicit user decision; the AI provides a `recommend` but never auto-advances. The user may pause at any important step.
3. **Reuse / Customize / Discover (三选一)**: For every component (Permission, Machine, Guard, Treasury, Contact, Arbitration, etc.), surface all three avenues — reuse an existing object (benefit), customize a new one (sub-task ability), or discover from other projects / the system.
4. **Default-config disclosure**: Disclose a new object's default config + important info + caveats BEFORE the user decides. No silent defaults.

---

## ⚠️ PRE-FLIGHT: Required Items Checklist

**THIS SECTION IS MANDATORY.** Before ANY service creation or publication, the AI MUST collect explicit user confirmation for EVERY required item. **Do NOT skip, do NOT fabricate, do NOT proceed with missing items.**

### The Golden Rule

> **Golden Rule**: NEVER guess what the user sells, how their workflow operates, or how funds are distributed — these are BUSINESS decisions only the user can make. Not provided → ASK; incomplete → ASK to clarify; "just make something up" → REFUSE and explain why each item matters.

### Required Items

For each item, the user must provide one of: **"Reuse existing: `<name_or_id>`"** OR **"Create new: `<details>`"** OR **"Discover from system / other projects"** — reuse / customize / discover, all three avenues must be surfaced.

| # | Item | User Must Provide | Why Not Fabricate |
|---|------|-------------------|--------------------|
| **R1** | **Account** | Account name/address. Default `""` is fine. | Safe default exists |
| **R2** | **Permission** | Existing Permission to reuse, OR name + type_parameter for new. **Reuse strongly recommended.** | Controls access to ALL your services |
| **R3** | **Service (DRAFT)** | Service name, type_parameter. Create the draft FIRST (unpublished) so Guards can reference it by LocalMark NAME. | Your brand identity on-chain; breaks Guard↔Service cycle |
| **R4** | **Machine** | Nodes, state transitions (pairs), forward paths. | IS your business process |
| **R5** | **Guards** | For each Guard: validation logic, conditions. Reuse or define new. | Enforces your business rules |
| **R6** | **Guard Bindings** | Which Guard validates which Machine forward? | Wrong binding = unauthorized access |
| **R7** | **Allocators** | For each outcome: who gets what %/amount? (e.g. "success: 95% me, 5% platform") | IS your revenue model |

**Conditionally Required:**

| # | Item | Trigger | User Must Provide |
|---|------|---------|-------------------|
| **C1** | **Contact (um)** | If `customer_required` is set (or customer service is desired) | Contact name/ID; if NEW → local account as messenger (`enabled: true`) + anti-spam profile (Open/Guarded/Closed/Defensive) |
| **C2** | **WIP Files** | Physical goods | Product description, images |
| **C3** | **Sales Products** | Listing products | Name, price, stock, WIP per product |

### Information Collection Protocol

```
STEP 0: Present checklist R1-R7 to user
├── Each item: "Reuse or create new? Provide details."
├── Track status: [pending] / [confirmed: reuse <id>] / [confirmed: create]
├── If user indicates physical goods / customer_required → also confirm C1-C3
└── ⛔ GATE: ALL R1-R7 must be [confirmed] before any on-chain action
    └── NOT confirmed → STOP. Ask. Do NOT suggest creating service.
```

### Anti-Fabrication Rules (HARD Constraints)

| Never... | Because... |
|----------|------------|
| Invent product names, prices, descriptions | You don't know what they sell |
| Design workflow nodes without user input | You don't know their business process |
| Decide fund splits | You don't know their revenue model |
| Assume Guard logic | You don't know their security requirements |
| Skip the checklist | Even if user seems to know what they want |

---

## Service Build Lifecycle

Once R1-R7 confirmed, execute in strict order. Sub-tools are invoked via `wowok({ tool: "<name>", data: { operation_type: "<type>", ... } })`; all use R1 (Account) as `env.account`.

**STEP 1 — Foundation**: Account (`account_operation` gen) → Permission (`onchain_operations` permission) → Service DRAFT (`onchain_operations` service, `publish: false` — Guards reference it by LocalMark NAME) → Machine unpublished (`onchain_operations` machine: nodes/pairs/forwards). Discovery `query_toolkit` (account_list/local_mark_list/onchain_objects); template `machineNode2file`.

**STEP 2 — Trust Layer (Guards)**: `onchain_operations` guard (logic/instructions). Design per target: buy_guard / allocator / reward = pass/fail only; machine forward guard = retained_submission needs `b_submission: true` entries matching types. Patterns: `schema_query` action='get_guard_design_patterns'.

**STEP 3 — Bind + Publish Machine, Bind Service**: `onchain_operations` machine (`add forward`/`set` with guard) → machine `publish: true` (nodes/forwards IMMUTABLE; verify via machineNode2file) → `onchain_operations` service bind machine + buy_guard (machine must be PUBLISHED).

**STEP 4 — Products (Sales + WIP)**: `onchain_operations` service sales (name/price/stock/wip/wip_hash); ⛔ user provides name/price(u64 min unit)/stock. `wip` = public URL + hash (on-chain stores URL+hash, not file); AI sub-task: generate WIP from web/doc → deploy to public URL (GitHub Pages). `wip <= MAX_WIP_LENGTH`, `wip_hash <= MAX_WIP_HASH_LENGTH`.

**STEP 5 — Revenue (order_allocators + Treasury)**: `onchain_operations` service order_allocators (L1-locked). Mode: amount / rate (bps sum=10000) / surplus. Recipient: `{Entity}` / `{GuardIdentifier}` / `{Signer}`. Personal → Permission owner (Entity); Org → Treasury (`Treasury.receive` index 253). Offer new/select Treasury (query onchain_objects type=treasury).

**STEP 6 — Customer Service (Contact + Messenger)**: `onchain_operations` contact (ims) + `account_operation` messenger (`enabled: true`). Contact mutable; `im_add`/`im_remove` need permission index 453 (CONTACT_IM). Anti-spam profiles: Open / Guarded / Closed / Defensive. Bind `onchain_operations` service `um` (if customer_required).

**STEP 7 — Trust (Arbitration + compensation_fund)**: REUSE third-party Arbitration (MUST NOT share Service's Permission — E_ARBITRATION_PERMISSION_CONFLICT 33; don't create your own). `compensation_fund_add` (internal Balance<T>, not Treasury); fund>0 requires non-empty arbitrations (E_ARBITRATION_NOT_SET_WITH_COMPENSATION_FUND 25); withdraw needs bPaused + lock elapsed.

**STEP 8 — Publication**: pre-publish verify — (1) machineNode2file, (2) guard2file, (3) evaluate_project risk → fix CRITICAL, (4) permission indexes granted, (5) arb permission isolation, (6) contact ims+enabled → `onchain_operations` service `publish: true` (L1-LOCKED: machine/order_allocators/arbitrations).

**STEP 9 — Post-publish + Test Order**: mutable fields (description/location/sales/customer_required/rewards add/repositories add). Test order: `order_new` (requires bPublished, else E_NOT_PUBLISHED) → disclose next nodes → advance (order.progress / progress.operate) → alloc_by_guard → verify distribution. User chooses test account (default: service-creation account).

### Post-Publish Mutability (SDK-LOCKED vs mutable)

Served by MCP `schema_query` action='get_safety_rules' (immutability-after-publish). Summary: `buy_guard` / `sales` / `description` / `repositories` / `rewards` are mutable; `machine` / `order_allocators` / `arbitrations` are SDK-LOCKED (fork required to change).

---

## Key Concepts

### Service Object Relationships

> **Boundary conditions**: Service/Machine are IMMUTABLE after publish; Payment is FROZEN at creation; Order/Progress/Arbitration operations are irreversible. Use `get_project_detail` to check whether a project has published objects.

```
Service → permission, machine (immutable), order_allocators (immutable),
          arbitrations, compensation_fund (Balance<T>, NOT a Treasury ref),
          repositories, sales, rewards, um (Contact), customer_required, buy_guard
Order (runtime) → builder, service snapshot, machine, progress, dispute (Arb[]), allocation
```

Cross-object references (which 9 object types hold a Guard and which 4 hold a Machine) are served by MCP `schema_query` action='get_guard_design_patterns'. Permission is the central hub — 11 objects hold BuiltinPermissionIndex.

### Allocators + Machine Integration

Design together for coherent fund flow. **Allocation modes** (amount / rate / surplus) and **recipient types** (`Entity` / `GuardIdentifier` / `Signer`) are served by MCP allocation knowledge — the authoritative table + customer-refund design pattern live there. Summary: `Entity` = fixed known recipient; `GuardIdentifier` = runtime-submitted address (customer/Order ID); `Signer` = the `alloc_by_guard` caller (rare — don't use for all entries or splits collapse to one recipient).

### Triggering Allocation Distribution

After the Progress reaches a terminal state, the fund allocation is NOT automatic — it must be triggered explicitly. **Anyone can call this operation**; the caller does not need to be the merchant or customer. The Guard verification determines which allocator's rules apply.

```
Tool: wowok({ tool: "onchain_operations", data: { operation_type: "allocation", ... } })
Operation: alloc_by_guard
Required submission: Order ID (matching the Guard's b_submission identifier)
```

**Two-phase pattern** (same as other Guard operations):
1. Call without `submission` → SDK returns submission prompt
2. Re-call with `submission` containing the Order ID at the matching identifier

**Post-allocation**: A Payment object is created with the distributed funds. Query the Allocation object to verify `balance` dropped to 0 and `payment` array has the new Payment ID.

### WIP Files (Witness Immutable Promise)

Immutable product commitment for arbitration evidence.

```
Create:  wowok({ tool: "wip_file", data: { type: "generate", ... } }) → markdown_text + images → outputPath
Attach: wowok({ tool: "onchain_operations", data: { operation_type: "service", ... } }) → sales.sales[{
          name, price, stock, wip: "<URL>", wip_hash: "" (auto)
        }]
```

### Compensation Fund (Optional but Recommended)

- Add: `compensation_fund_add` | Lock: `setting_lock_duration_add` (default 30 days = 2592000000ms, configurable via `setting_lock_duration_add`)
- **Withdraw**: Pause Service → Wait lock duration → `compensation_fund_receive`

### Payment Tokens & Stablecoin Bridging (Mainnet Only)

WOW is the default settlement token. For stablecoin-denominated revenue (fiat-pegged pricing, large cross-period escrow), mainnet funds move via `bridge_operation`:

- `query_supported_tokens` / `query_supported_evm_chains` — discover supported Bridge tokens (ETH/WETH/WBTC/USDC/USDT) and chains
- `cross_chain_wow_to_evm` / `cross_chain_evm_to_wow` — WOW↔EVM transfer (mainnet env required; assets route through the auto-managed activeEvmAccount)
- `query_transfer_status` / `query_transfer_list` — track transfers; `manage_evm_rpc` — handle EVM RPC rate limits (429)

> Supported token addresses per network: `wowok_buildin_info` → 'mainnet bridge tokens'. Bridge is mainnet-only — testnet has no cross-chain path.

---

## Project Iteration: Fork vs In-Place

When a merchant wants to modify an existing service (change workflow, add allocators, update guards), the AI must determine whether to modify the current version (in-place) or fork a new version.

### Decision Rule

| Scenario | Strategy | MCP Action |
|----------|----------|------------|
| Service NOT yet published | **In-place** — modify the current version directly | `onchain_operations` (modify) |
| Service IS published | **Fork** — create a new version, preserve original as read-only | `project_operation` → `create_version` (with `fork_from_version`) |

### Fork Workflow

When the service is already published and the user wants structural changes, use MCP `project_operation` action `create_version` (with `fork_from_version` parameter; original v1 stays read-only; no on-chain objects copied since they're immutable). Then work on v2 reusing v1 on-chain objects by address and creating new objects only for changed parts. Publish v2 when ready — v1 continues running uninterrupted.

Before forking, verify necessity via `get_project_detail` → `has_published_object=true` confirms fork is required (published objects are immutable).

### When to Recommend Forking

- User says "I want to change my workflow" → check if published → recommend fork
- User says "I want to add a new product line" → if same Machine can handle it, in-place modify Service.sales; if needs new Machine, fork
- User says "I want to change fund distribution" → if Service not published, in-place; if published, fork (allocators are frozen after publish)

---

## Order Fulfillment

| Object | Purpose | Operation |
|--------|---------|-----------|
| Order | Fund escrow | Read-only |
| **Progress** | Workflow state | **Operate this** — `hold: true` (lock) → work → `hold: false` (submit) |

**⚠ Progress Routing Rule** (critical): served by MCP `schema_query` action='get_safety_rules' (operation classification). Summary: empty `namedOperator` (`""`) → `order.progress`; non-empty role name or `permissionIndex` → `progress.operate`. Wrong path → "Permission denied" (abort code 5).

**AI Reminder**: When fulfilling, check `customer_required` fields. Missing → prompt via Messenger.

---
