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
> **Related Skills**: [wowok-order](../wowok-order/SKILL.md) (customer), [wowok-machine](../wowok-machine/SKILL.md) (workflow), [wowok-guard](../wowok-guard/SKILL.md) (validation rules), [wowok-messenger](../wowok-messenger/SKILL.md) (communication), [wowok-safety](../wowok-safety/SKILL.md) (safety), [wowok-tools](../wowok-tools/SKILL.md) (MCP tools)

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
STEP 1: Foundation
├── Permission — REUSE existing (strongly recommended)
│     Tool: onchain_operations (permission) | Fields: name, type_parameter
├── Service (unpublished) — CREATE new
│     Tool: onchain_operations (service) | Fields: name, type_parameter, permission
└── Machine (unpublished) — CREATE new or REUSE template
      Tool: onchain_operations (machine) | Fields: nodes, pairs, forwards
      Discovery: query_toolkit (account_list, local_mark_list, onchain_objects)
      Template: machineNode2file (export existing for editing)

STEP 2: Trust Layer
└── Guards — CREATE new or REUSE existing
      Tool: onchain_operations (guard) | Fields: logic, instructions
      Template: guard2file (export existing for editing)
      ⚠️ Design your Guard tables based on how the target object reads data:
         - buy_guard → pass/fail only, no data extraction
         - Allocator guard → pass/fail only
         - Machine forward guard → if retained_submission is used, ensure b_submission:true entries match expected types
         - Reward guard → pass/fail only
      Full design reference: [wowok-guard](../wowok-guard/SKILL.md)

STEP 3: Business Logic (MODIFY)
├── Machine — bind Guards to forwards
│     Tool: onchain_operations (machine)
├── Service — set Allocators
│     Tool: onchain_operations (service) | Fields: order_allocators
├── Arbitrations (optional) — REUSE existing Arb services
│     Tool: onchain_operations (service) | Fields: arbitrations.list
├── Compensation Fund (optional): compensation_fund_add + setting_locked_time_add (default 30 days, configurable)
│     Tool: onchain_operations (service)
└── Reward (optional) — incentive pools

STEP 4: Publication
├── Publish Machine → IMMUTABLE
│     Tool: onchain_operations (machine) | publish: true
├── Bind Machine to Service
│     Tool: onchain_operations (service) | machine: "<machine_id>"
└── Publish Service → machine/allocators LOCKED
      Tool: onchain_operations (service) | publish: true

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

```
Service (merchant storefront)
├── machine → Machine (workflow)
├── order_allocators → Fund distribution rules
├── arbitrations → Dispute resolution (optional)
├── compensation_fund → Customer protection (optional)
├── sales → Products with WIP files
├── rewards → Incentive pools (optional)
└── um → Contact (customer service)

Order (per purchase)
├── builder → Customer
├── progress → Workflow state
└── allocation → Fund distribution engine
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

### WIP Files (Witness Immutable Promise)

Immutable product commitment for arbitration evidence.

```
Create:  wip_file → generate → markdown_text + images → outputPath
Attach: onchain_operations (service) → sales.sales[{
          name, price, stock, wip: "<URL>", wip_hash: "" (auto)
        }]
```

### Compensation Fund (Optional but Recommended)

- Add: `compensation_fund_add` | Lock: `setting_locked_time_add` (default 30 days = 2592000000ms, configurable via `setting_lock_duration_add`)
- **Withdraw**: Pause Service → Wait lock duration → `compensation_fund_receive`

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

**Export**: `machineNode2file`, `guard2file` | **Query Schema**: `schema_query({ action: "get", name: "<name>" })`