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

Build and operate commercial services on WoWok as a service provider.

> **Role**: Service Provider (Merchant/Seller)  
> **Prerequisites**: Understand CREATE vs MODIFY pattern — use `schema_query({ action: "get", name: "onchain_operations" })`  
> **Related Skills**: [wowok-order](../wowok-order/SKILL.md) (customer), [wowok-machine](../wowok-machine/SKILL.md) (workflow), [wowok-messenger](../wowok-messenger/SKILL.md) (communication)

---

## AI Decision Framework

When user wants to create/publish a service, follow this **strict dependency order**:

```
STEP 1: Foundation (CREATE or REUSE)
├── Permission — REUSE existing if available (strongly recommended)
├── Service (unpublished) — CREATE new
└── Machine (unpublished) — CREATE new or REUSE template

STEP 2: Trust Layer (CREATE or REUSE)
└── Guards — CREATE new or REUSE existing

STEP 3: Business Logic (MODIFY)
├── Machine — bind Guards to nodes
├── Service — set Allocators
├── Service — add Arbitrations (optional, REUSE existing Arb services)
├── Service — add Compensation Fund (optional)
└── Reward — incentive pools (optional)

STEP 4: Publication
├── Publish Machine → IMMUTABLE
├── Bind Machine to Service
└── Publish Service → machine/allocators LOCKED

STEP 5: Post-Publish (MODIFY Service)
├── description, location
├── sales (products with WIP)
├── customer_required
└── um (REUSE existing Contact or CREATE new)
```

### Object Reuse (See [wowok-safety](../wowok-safety/SKILL.md))

**General Rule**: Reuse existing objects when available. See wowok-safety for detailed reuse principles and CREATE vs MODIFY patterns.

**Provider-Specific Reuse Notes**:
| Object | Reuse Strategy |
|--------|----------------|
| **Permission** | **Strongly recommended** — enables centralized permission control across all your services |
| Machine | Reuse via `machineNode2file` export/import for similar workflows |
| Contact (um) | Reuse existing customer service Contact |
| Arbitration | Always reuse existing Arbitration services (customers choose from your approved list) |

**Immutability Rules**:
| Object | When Locked | Impact |
|--------|-------------|--------|
| Guard | After creation | Cannot modify |
| Machine | After publish | Nodes frozen |
| Service | After publish | machine, order_allocators frozen |

---

## Service Build Checklist

Use this checklist when guiding users through service creation:

| Phase | Step | Required | Tool/Operation | Key Fields |
|-------|------|----------|----------------|------------|
| 1 | Permission | ✅ | `onchain_operations` (permission) | name, type_parameter |
| 1 | Service (unpublished) | ✅ | `onchain_operations` (service) | object: {name, type_parameter, permission} |
| 1 | Machine (unpublished) | ✅ | `onchain_operations` (machine) | nodes, pairs, forwards |
| 2 | Guards | ✅ | `onchain_operations` (guard) | logic, instructions |
| 3 | Machine + Guards | ✅ | `onchain_operations` (machine) | bind guards to forwards |
| 3 | Allocators | ✅ | `onchain_operations` (service) | order_allocators |
| 3 | Arbitrations | ❌ | `onchain_operations` (service) | arbitrations.list |
| 3 | Compensation Fund | ❌ | `onchain_operations` (service) | compensation_fund_add, setting_locked_time_add |
| 4 | Publish Machine | ✅ | `onchain_operations` (machine) | publish: true |
| 4 | Bind Machine | ✅ | `onchain_operations` (service) | machine: "<machine_id>" |
| 4 | Publish Service | ✅ | `onchain_operations` (service) | publish: true |
| 5 | Description/Location | ❌ | `onchain_operations` (service) | description, location |
| 5 | Sales Products | ❌ | `onchain_operations` (service) | sales.sales[] |
| 5 | Customer Required | ❌ | `onchain_operations` (service) | customer_required[], um |

**Critical Rules**:
1. **Reuse First**: Always ask if user has existing Permission/Machine/Guard/Contact to reuse
2. If `customer_required` is set → `um` (Contact) **MUST** be set
3. Physical goods **MUST** have WIP files
4. `wip_hash` default `""` (uses embedded hash)

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

### WIP Files (Witness Immutable Promise)

**Purpose**: Immutable product commitment for arbitration evidence.

**Creating WIP**:
```
Tool: wip_file
type: "generate"
options.markdown_text: Product description
options.images: Product visuals
outputPath: Output file path
```

**Attaching to Service**:
```
Operation: onchain_operations (service)
sales.op: "add"
sales.sales: [{
  name: Product name
  price: Token amount
  stock: Quantity
  wip: URL to WIP file
  wip_hash: "" (default, uses embedded hash)
}]
```

### Allocators + Machine Integration

Design together for coherent fund flow:

```
Example: Delivery workflow
"delivered" → "order_complete" (threshold: 1)
└── Forward: "customer_signed"
└── Allocator: 95% merchant, 5% platform

"delivered" → "package_lost" (threshold: 2)
├── Forward: "customer_reports_lost"
├── Forward: "merchant_confirms_lost"
└── Allocator: 100% to order (buyer withdraws)
```

**Allocation Modes** (execute in order):
1. **Amount**: Fixed U64 per recipient
2. **Rate**: Basis points (10000 = 100%)
3. **Surplus**: Receives remainder (max 1 per allocator)

---

## Phase Details

### Phase 1: Foundation

Create base objects. Service starts unpublished.

**Pre-Build Discovery**:
- `query_toolkit` (account_list) — list accounts
- `query_toolkit` (local_mark_list) — list marks
- `query_toolkit` (onchain_objects) — query existing

**Reuse Templates**:
- `machineNode2file` — export Machine for editing
- `guard2file` — export Guard for editing

### Phase 2: Trust Layer

Create all Guards needed for workflow validation.

### Phase 3: Business Logic

**Compensation Fund** (optional but recommended):
- `compensation_fund_add`: Add funds
- `setting_locked_time_add`: Lock duration (min 30 days = 2592000000ms)

**Merchant Withdrawal Constraints**:
1. Pause Service
2. Wait lock duration
3. Withdraw via `compensation_fund_receive`

**Arbitration** (optional):
- Without it: Lower setup, but customers bear full dispute risk
- With it: Customer trust ↑, dispute resolution available

### Phase 4: Publication

**Order Matters**: Publish Machine → Bind → Publish Service

After publish: machine, order_allocators are **LOCKED**

### Phase 5: Post-Publish Configuration

These can be updated after publication:

| Field | Purpose | Required |
|-------|---------|----------|
| description | Service description | ❌ |
| location | Service area | ❌ |
| sales | Products with WIP | ❌ (but needed to sell) |
| customer_required | Required customer info | ❌ |
| um | Contact for customer service | ❌ (REQUIRED if customer_required set) |

**Customer Required + Contact Rule**:
```
If customer_required: ["phone", "address"]
Then um: "<contact_id>"  ← MUST be set
```

**Contact Setup**:
1. Create Contact object
2. Set `um` to Contact ID
3. Customers use Messenger to provide info securely

---

## Order Fulfillment

### Progress Operations

| Object | Purpose | Target |
|--------|---------|--------|
| Order | Fund escrow | Read-only |
| Progress | Workflow state | **Operate this** |

**Two-Phase Pattern**:
1. Lock: `hold: true` (prevents race conditions)
2. Submit: `hold: false` (after off-chain work)

### Customer Service

**AI Reminder**: When fulfilling orders, check if `customer_required` fields are provided. If missing, prompt provider to request via Messenger.

---

## Quick Reference

### Essential Schemas

| Purpose | Schema |
|---------|--------|
| Service ops | `onchain_operations_service` |
| Machine ops | `onchain_operations_machine` |
| Guard ops | `onchain_operations_guard` |
| Progress ops | `onchain_operations_progress` |
| WIP generation | `wip_file` |
| Messenger | `messenger_operation` |
| Query | `query_toolkit` |

### Common Operations

**Query Schema**: `schema_query({ action: "get", name: "<schema_name>" })`

**Export Templates**:
- `machineNode2file` — Machine → JSON
- `guard2file` — Guard → JSON
