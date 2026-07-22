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
> **Related Skills**: [wowok-order](../wowok-order/SKILL.md) (customer), [wowok-machine](../wowok-machine/SKILL.md) (workflow), [wowok-messenger](../wowok-messenger/SKILL.md) (communication), [wowok-distill](../wowok-distill/SKILL.md) (distillation review)

---

## MCP Knowledge Layer

The following rule tables have been pushed down to the MCP knowledge layer and are automatically applied during project operations. You do NOT need to manually check these — the MCP server enforces them.

| Rule Category | MCP Knowledge Module | Applied By |
|---------------|---------------------|------------|
| Safety rules (confirmation, immutability, object reuse) | `knowledge/safety-rules.ts` | `aggregate_risks` + `onchain_operations` pre-publish |
| Guard design patterns | `knowledge/guard-design-patterns.ts` | `aggregate_risks` (guard risk assessment) |
| Machine topology rules | `knowledge/machine-risk.ts` | `aggregate_risks` (machine risk assessment) |
| Scenario mode defaults | `knowledge/scenario-modes.ts` | `analyze_intent` (pass `industry` parameter) |
| Tool reference (gas, faucet, wrappers) | `knowledge/tools-reference.ts` | All tool calls automatically |

**How to use**: Call `project_operation` with `action: "aggregate_risks"` after completing your puzzle — the MCP server will automatically apply all relevant safety rules and return risk findings.

---

## ⚠️ PRE-FLIGHT: Required Items Checklist

**THIS SECTION IS MANDATORY.** Before ANY service creation or publication, the AI MUST collect explicit user confirmation for EVERY required item. **Do NOT skip, do NOT fabricate, do NOT proceed with missing items.**

### The Golden Rule

```
NEVER guess what the user sells, how their workflow operates, or how funds are distributed.
These are BUSINESS decisions that ONLY the user can make.

User hasn't provided it → ASK.
User provides incomplete info → ASK for clarification.
User says "just make something up" → REFUSE and explain why each item matters.
```

### Required Items

For each item, the user must provide one of: **"Reuse existing: `<name_or_id>`"** OR **"Create new: `<details>`"**

| # | Item | User Must Provide | Why Not Fabricate |
|---|------|-------------------|--------------------|
| **R1** | **Account** | Account name/address. Default `""` is fine. | Safe default exists |
| **R2** | **Permission** | Existing Permission to reuse, OR name + type_parameter for new. **Reuse strongly recommended.** | Controls access to ALL your services |
| **R3** | **Service** | Service name, type_parameter. What kind of service? | Your brand identity on-chain |
| **R4** | **Machine** | Nodes, state transitions (pairs), forward paths. | IS your business process |
| **R5** | **Guards** | For each Guard: validation logic, conditions. Reuse or define new. | Enforces your business rules |
| **R6** | **Guard Bindings** | Which Guard validates which Machine forward? | Wrong binding = unauthorized access |
| **R7** | **Allocators** | For each outcome: who gets what %/amount? (e.g. "success: 95% me, 5% platform") | IS your revenue model |

**Conditionally Required:**

| # | Item | Trigger | User Must Provide |
|---|------|---------|-------------------|
| **C1** | **Contact (um)** | If `customer_required` is set | Contact name/ID |
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

Once R1-R7 confirmed, execute in strict order. All operations use R1 (Account) as `env.account`.

```
All Tool: references below are sub-tools invoked via wowok({ tool: "<name>", data: { operation_type: "<type>", ... } })

STEP 1: Foundation
├── Permission — REUSE existing (strongly recommended)
│     Tool: "onchain_operations" (permission) | Fields: name, type_parameter
├── Service (unpublished) — CREATE new
│     Tool: "onchain_operations" (service) | Fields: name, type_parameter, permission
└── Machine (unpublished) — CREATE new or REUSE template
      Tool: "onchain_operations" (machine) | Fields: nodes, pairs, forwards
      Discovery: "query_toolkit" (account_list, local_mark_list, onchain_objects)
      Template: "machineNode2file" (export existing for editing)

STEP 2: Trust Layer
└── Guards — CREATE new or REUSE existing
      Tool: "onchain_operations" (guard) | Fields: logic, instructions
      Template: "guard2file" (export existing for editing)
      ⚠️ Design your Guard tables based on how the target object reads data:
         - buy_guard → pass/fail only, no data extraction
         - Allocator guard → pass/fail only
         - Machine forward guard → if retained_submission is used, ensure b_submission:true entries match expected types
         - Reward guard → pass/fail only
      Guard design patterns: MCP `knowledge/guard-design-patterns.ts` (auto-applied via `aggregate_risks`)

STEP 3: Business Logic (MODIFY)
├── Machine — bind Guards to forwards
│     Tool: "onchain_operations" (machine)
├── Service — set Allocators
│     Tool: "onchain_operations" (service) | Fields: order_allocators
├── Arbitrations (optional) — REUSE existing Arb services
│     Tool: "onchain_operations" (service) | Fields: arbitrations.list
├── Compensation Fund (optional): compensation_fund_add + setting_locked_time_add (default 30 days, configurable)
│     Tool: "onchain_operations" (service)
└── Reward (optional) — incentive pools

STEP 4: Publication
├── Publish Machine → IMMUTABLE
│     Tool: "onchain_operations" (machine) | publish: true
├── Bind Machine to Service
│     Tool: "onchain_operations" (service) | machine: "<machine_id>"
└── Publish Service → machine/allocators LOCKED
      Tool: "onchain_operations" (service) | publish: true

      ⚠️ Pre-Publish Verification:
      1. Re-check PRE-FLIGHT: all R1-R7 still confirmed?
      2. guard2file export Guards → review
      3. machineNode2file export Machine → review
      4. Allocator splits match user's stated model?
      5. Warn: publish = immutable. Proceed?

STEP 5: Post-Publish (MODIFY Service — mutable after publish)
├── description, location
├── sales (products with WIP) — ⛔ user MUST provide: name, price, stock, WIP
├── customer_required
└── um — Contact (REUSE existing or CREATE new)
      ⚠️ If customer_required is set → um MUST be set
```

### Object Reuse & Immutability

| Object | Reuse Strategy | When Locked |
|--------|---------------|-------------|
| **Permission** | **Strongly recommended** — centralized control | Never |
| Machine | Reuse via `machineNode2file` template | After publish |
| Contact (um) | Reuse existing customer service Contact | Never |
| Arbitration | Always reuse existing Arb services | — |
| Guard | Reuse if logic matches | After creation |
| Service | — | After publish: machine, order_allocators frozen |

---

## Key Concepts

### Service Object Relationships

> **Boundary conditions**: Use MCP `project_operation` with action `get_reversibility` to query the full 22-object lifecycle reversibility matrix (mutability, prerequisites, capacity limits, irreversibility). Key rules: Service/Machine are IMMUTABLE after publish; Payment is FROZEN at creation; Order/Progress/Arbitration operations are irreversible.

```
Service (merchant storefront)
├── permission → Permission (required, mutable after publish)
├── machine → Machine (required, IMMUTABLE after publish)
├── order_allocators → Allocation[] (optional, mutable after publish)
├── arbitrations → Arbitration[] (optional, mutable after publish, max 20)
├── compensation_fund → Treasury (optional, mutable after publish)
├── sales → Repository (optional, mutable after publish; products with WIP files)
├── rewards → Reward[] (optional, mutable after publish)
├── um → Contact (optional, mutable after publish; customer service)
├── customer_required → Personal (optional, mutable after publish; customer data schema)
└── buy_guard → Guard (optional, mutable after publish; gates order placement)

Order (per purchase, runtime-created)
├── builder → Customer (immutable after creation)
├── service → Service snapshot (immutable after creation)
├── machine → Machine (immutable after creation)
├── progress → Progress (immutable after binding)
├── arbitration → Arbitration (optional, immutable once set)
└── allocation → Fund distribution engine (triggered via Progress.forward)

Cross-object references:
- Guard is referenced by 9 object types (Service.buy_guard, Machine.forward.guard, Allocation.allocation_guard, Arbitration.voting_guard, Reward.claim_guard, Repository.write_guard, Treasury.external_guard, Demand.recommend_guard, Passport.guard)
- Machine is referenced by 4 object types (Service.machine, Order.machine, Progress.machine, Order snapshot)
- Permission is the central hub — 11 objects hold BuiltinPermissionIndex
```

### Allocators + Machine Integration

Design together for coherent fund flow. **Allocation Modes** (execute in order):
1. **Amount** — Fixed U64 per recipient
2. **Rate** — Basis points (10000 = 100%)
3. **Surplus** — Receives remainder (max 1)

```
Example: Delivery workflow
"delivered" → "order_complete" (threshold: 1)
└── Forward: "customer_signed"    → Allocator: 95% merchant, 5% platform

"delivered" → "package_lost" (threshold: 2)
├── Forward: "customer_reports_lost"
├── Forward: "merchant_confirms_lost"
└── Allocator: 100% to order (buyer withdraws)
```

### Recipient Types in Allocators

Each `sharing[].who` field determines where funds go. Choose the correct type based on who the recipient is and whether their address is known at Service creation time.

| Type | Syntax | Resolves To | When to Use |
|------|--------|-------------|-------------|
| `Entity` | `{"Entity": {"name_or_address": "travel_service"}}` | Fixed address (resolved from account/mark/address) | Known recipient at creation time (merchant, platform) |
| `GuardIdentifier` | `{"GuardIdentifier": N}` | Address from Guard table index N (submitted at runtime) | Dynamic recipient known only at order time (customer/Order ID) |
| `Signer` | `{"Signer": "signer"}` | The caller of `alloc_by_guard` | Rare — only when the caller should receive all funds |

> **⚠️ Common Mistake**: Using `{"Signer": "signer"}` for all sharing entries causes ALL funds to go to whoever calls `alloc_by_guard`, making differentiated splits (e.g., 80% merchant + 20% customer) impossible. Use `Entity` for known recipients and `GuardIdentifier` for dynamic ones.

**Design Pattern for Customer Refunds**:
- Merchant receipt → `{"Entity": {"name_or_address": "<service_name>"}}` — funds go to the Service object
- Customer refund → `{"GuardIdentifier": 0}` — funds go to the Order object (customer as builder can withdraw)
- The allocation Guard must have `identifier: 0` with `b_submission: true` and `value_type: "Address"` to accept the Order ID at runtime

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
Create:  wowok({ tool: "wip_file", data: { op: "generate", ... } }) → markdown_text + images → outputPath
Attach: wowok({ tool: "onchain_operations", data: { operation_type: "service", ... } }) → sales.sales[{
          name, price, stock, wip: "<URL>", wip_hash: "" (auto)
        }]
```

### Compensation Fund (Optional but Recommended)

- Add: `compensation_fund_add` | Lock: `setting_locked_time_add` (default 30 days = 2592000000ms, configurable via `setting_lock_duration_add`)
- **Withdraw**: Pause Service → Wait lock duration → `compensation_fund_receive`

---

## Project Iteration: Fork vs In-Place

When a merchant wants to modify an existing service (change workflow, add allocators, update guards), the AI must determine whether to modify the current version (in-place) or fork a new version.

### Decision Rule

| Scenario | Strategy | MCP Action |
|----------|----------|------------|
| Service NOT yet published | **In-place** — modify the current version directly | `onchain_operations` (modify) |
| Service IS published | **Fork** — create a new version, preserve original as read-only | `project_operation` → `fork_project` |

### Fork Workflow

When the service is already published and the user wants to make structural changes:

```
STEP 1: Check if fork is needed
├── Call: project_operation({ action: "get_reversibility", query_object_type: "service", query_lifecycle_state: "published" })
├── Result: struct_reversible="immutable" → must fork
└── Call: project_operation({ action: "get_project_status", project, version })
    → If has_published_object=true → fork required

STEP 2: Fork the project
├── Call: project_operation({ action: "fork_project", project: "<prefix>", version: "v1", fork_to_version: "v2" })
├── This creates a new version v2 with:
│   - Copy of stage.json (reset to stage 1)
│   - Copy of manifest.json (new version, needs_recalibration=true)
│   - Copy of deployment/ docs (for reference)
│   - No on-chain objects copied (they're immutable on-chain)
└── The original v1 remains as a read-only historical snapshot

STEP 3: Modify in the new version
├── Work on v2 using the normal 5-stage flow
├── Reuse on-chain objects from v1 (reference by address)
├── Create new objects for changed parts
└── Publish v2 when ready — v1 continues running uninterrupted
```

### When to Recommend Forking

- User says "I want to change my workflow" → check if published → recommend fork
- User says "I want to add a new product line" → if same Machine can handle it, in-place modify Service.sales; if needs new Machine, fork
- User says "I want to change fund distribution" → if Service not published, in-place; if published, fork (allocators are frozen after publish)

---

## Distillation Review

The MCP server runs an offline flywheel that collects operational signals from your deployments and generates improvement proposals. Periodically review these proposals to optimize your service.

### When to Review

- After publishing a service and running it for a while
- When the user asks "any improvements?" or "what did the system learn?"
- As part of routine service maintenance

### How to Review

Use the [wowok-distill](../wowok-distill/SKILL.md) skill for guided review, or call MCP actions directly:

```
STEP 1: Check for pending proposals
├── Call: project_operation({ action: "get_improvement_queue", queue_filter_status: "pending" })
├── Review each proposal: title, priority, confidence, description
└── If no proposals → inform user "No pending improvements. The flywheel is idle."

STEP 2: Apply or reject
├── To apply: project_operation({ action: "apply_improvement", proposal_id: "<id>", review_status: "approved" })
├── To reject: project_operation({ action: "apply_improvement", proposal_id: "<id>", review_status: "rejected" })
└── Applied proposals write overrides to ~/.wowok/overrides/ (config changes) or patches/ (source changes)

STEP 3: Verify
├── Call: project_operation({ action: "get_flywheel_config" })
├── Check: applied_count increased, pending_count decreased
└── Overrides are hot-loaded — next operation uses the new config immediately
```

### Override Categories

Only these categories can be overridden (no arbitrary changes):

| Category | What It Controls | Example |
|----------|-----------------|---------|
| risk-thresholds | Risk assessment cutoffs | max_retries, min_deposit |
| descriptions | AI guidance text | industry descriptions |
| industry-profiles | Industry trait profiles | rental traits, freelance traits |
| scenario-defaults | Default parameters per scenario | default allocators, machine nodes |
| recovery-priorities | Error recovery order | which failures to fix first |

---

## Order Fulfillment

| Object | Purpose | Operation |
|--------|---------|-----------|
| Order | Fund escrow | Read-only |
| **Progress** | Workflow state | **Operate this** — `hold: true` (lock) → work → `hold: false` (submit) |

**AI Reminder**: When fulfilling, check `customer_required` fields. Missing → prompt via Messenger.

---

## Quick Reference

| Purpose | Schema |
|---------|--------|
| Service ops | `onchain_operations_service` |
| Machine ops | `onchain_operations_machine` |
| Guard ops | `onchain_operations_guard` |
| Progress ops | `onchain_operations_progress` |
| WIP generation | `wip_file` |
| Messenger | `messenger_operation` |
| Query | `query_toolkit` |

**Export**: `machineNode2file`, `guard2file` | **Query Schema**: `wowok({ tool: "schema_query", data: { action: "get", name: "<name>" } })`

---

---

## Appendices (Progressive Disclosure)

> The following sections have been extracted to [APPENDIX.md](./APPENDIX.md) for on-demand loading:
> - Dialogue Scripts (R1-R10) — guided conversation scripts
> - Decision Trees — branching logic reference
> - Failure Playbooks — recovery scenarios
> - Tier Layering — expertise-tier based guidance
>
> Load APPENDIX.md when the user needs guided dialogue, recovery help, or tier-specific guidance.
