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
Tool: onchain_operations (allocation)
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

---

## Dialogue Scripts (R1-R10)

A 10-round dialogue for the merchant operations journey: from "I want to set up a service" through "published, live, and accepting orders". This dialogue assumes the merchant has an account (per [wowok-onboard](../wowok-onboard/SKILL.md) R1) and may have a partial configuration. Each round maps to one R-item in the §PRE-FLIGHT checklist or one STEP in the §Service Build Lifecycle. The §Anti-Fabrication Rules are non-negotiable throughout — the AI never invents products, prices, workflow, or fund splits.

### R1: PRE-FLIGHT Checklist Presentation

**AI Goal**: Present the R1-R7 checklist (plus conditional C1-C3) and collect the user's intent for each item: REUSE existing, CREATE new, or PENDING. Do NOT proceed to any on-chain action until all items are confirmed.

**Key Questions**:
- For each of R1 (Account), R2 (Permission), R3 (Service), R4 (Machine), R5 (Guards), R6 (Guard Bindings), R7 (Allocators): reuse or create? Provide details.
- (If physical goods or customer_required) Also confirm C1 (Contact), C2 (WIP Files), C3 (Sales Products).

**Tool Calls**:
1. `query_toolkit` → `local_names` — list accounts and local marks so the user can reference existing objects by friendly name.
2. `query_toolkit` → `onchain_objects` (filter type=Permission) — list candidate Permissions for reuse (strongly recommended per §Object Reuse & Immutability).
3. `query_toolkit` → `onchain_objects` (filter type=Contact) — list candidate Contacts for `um` reuse.

**Success Criteria**: Every R1-R7 item has a status: `[confirmed: reuse <id>]` or `[confirmed: create]`. The §Information Collection Protocol GATE is satisfied.

**Fallback**: User says "just make something up" → REFUSE per §Anti-Fabrication Rules, explain why each item matters. User provides incomplete info → ASK for clarification per the Golden Rule. User wants to skip an item → only R1 (Account, default `""` is safe) and R2 (Permission, reuse recommended) have safe defaults; R3-R7 cannot be skipped.

**Checkpoint**: Persist `{ round: R1, checklist: [{item: R1..R7, status: confirmed, mode: reuse|create, ref?: <id>}] }` via `local_info_operation`.

### R2: Foundation Objects (Permission + Service Draft + Machine Draft)

**AI Goal**: Execute STEP 1 of the §Service Build Lifecycle: Permission (reuse or create), Service (unpublished draft), Machine (unpublished draft). All three are created in dependency order in one round.

**Key Questions**:
- Confirm the Service name and `type_parameter` (default `"0x2::wow::WOW"`).
- Confirm the Machine's node topology (from R4 of the checklist).
- (If Machine is being reused) Confirm the existing Machine's ID/name.

**Tool Calls**:
1. (If Permission reuse) skip to step 2. (If Permission create) `onchain_operations` → `operation_type: "permission"` CREATE with `data.name`, `data.type_parameter`, plus index assignments if needed.
2. `onchain_operations` → `operation_type: "service"` CREATE with `data.name`, `data.type_parameter`, `data.permission` (string for reuse, object for create). `publish: false` (mandatory).
3. `onchain_operations` → `operation_type: "machine"` CREATE with `data.nodes`, `data.pairs`, `data.forwards`, `publish: false`.
4. `query_toolkit` → `onchain_objects` for all three — verify creation with `env.no_cache: true`.
5. `local_mark_operation` → tag each (e.g., `<project>_service_v1`, `<project>_machine_v1`).

**Success Criteria**: Permission, Service (unpublished), and Machine (unpublished) all exist on-chain. Local marks persisted. AI shows the user the three object IDs.

**Fallback**: Permission index < 1000 → SDK rejects, suggest 1000-65535 range. Service name collision → append `_v1` per [wowok-safety](../wowok-safety/SKILL.md) §4. Machine CREATE fails (e.g., node count < 2, forward missing operator) → return to R1's R4 item and fix the topology.

**Checkpoint**: Persist `{ round: R2, permission_id, service_id, machine_id, all_unpublished: true }`.

### R3: Trust Layer (Guards)

**AI Goal**: Execute STEP 2: CREATE all Guards needed for the Service. Use the §Object-Guard Circular Reference Pattern where Guards reference the Service or Machine.

**Key Questions**:
- For each Guard from R5/R6: confirm the validation logic, table entries, and computation tree.
- For each Guard: confirm the binding target (Service `buy_guard`, Service `order_allocators[].guard`, Machine Forward `guard`).
- Have you tested each Guard with `gen_passport` before binding? (Mandatory — Guards are immutable after creation.)

**Tool Calls**:
1. For each Guard: `onchain_operations` → `operation_type: "guard"` CREATE. (See [wowok-guard](../wowok-guard/SKILL.md) for the full R1-R10 Guard dialogue.)
2. For each Guard: `onchain_operations` → `operation_type: "gen_passport"` with mock submissions — verify PASS.
3. `guard2file` → export each Guard for the audit trail.

**Success Criteria**: All Guards created, all `gen_passport` tests PASS, `guard2file` exports persisted.

**Fallback**: `gen_passport` fails → isolate the failing Guard, consult [wowok-guard](../wowok-guard/SKILL.md) §10 traps, CREATE a new Guard with corrected logic, re-test. Never bind a failing Guard.

**Checkpoint**: Persist `{ round: R3, guards: [{name, id, passport_test: pass}], all_pass: true }`.

### R4: Business Logic (Bind Guards + Allocators + Arbitration + Compensation Fund)

**AI Goal**: Execute STEP 3: bind Guards to Machine Forwards and Service Allocators, configure `order_allocators`, optionally bind Arbitrations and add Compensation Fund.

**Key Questions**:
- Confirm the binding: which Guard binds to which Forward / Allocator?
- For each Allocator: confirm the `sharing` array (who gets what %), the trigger Guard, and the recipient types (`Entity` for known addresses, `GuardIdentifier` for dynamic).
- (Optional) Bind an existing Arbitration service to the Service's `arbitrations.list`?
- (Optional) Add a Compensation Fund (`compensation_fund_add` + `setting_locked_time_add`, default 30 days)?

**Tool Calls**:
1. `onchain_operations` → `operation_type: "machine"` MODIFY to bind Guards to Forwards (via `node` operations).
2. `onchain_operations` → `operation_type: "service"` MODIFY to set `order_allocators` (each Allocator with `guard` + `sharing`).
3. (Optional) `onchain_operations` → `operation_type: "service"` MODIFY to set `arbitrations.list` (reuse existing Arbitration).
4. (Optional) `onchain_operations` → `operation_type: "service"` MODIFY to add `compensation_fund_add` and `setting_locked_time_add`.
5. Verify each Allocator's `sharing` sum = 10000 (basis points). Verify each Allocator's trigger Guard exists and tested.

**Success Criteria**: Guards bound to Forwards. `order_allocators` configured. Each Allocator's `sharing` sum = 10000. Pre-publish Allocation audit returns PASS. Refund path covered (required per [wowok-safety](../wowok-safety/SKILL.md)).

**Fallback**: Sharing sum ≠ 10000 → auto-correct to 10000 with user confirmation. Missing refund path → block and prompt (refund Allocator is required for dispute flow). Recipient uses `Signer` instead of `Entity` → fix per §Recipient Types; using `Signer` for all sharing entries causes all funds to go to whoever calls `alloc_by_guard`. Arbitration reuse fails (Arb service not found) → query candidates via `onchain_objects`, let user pick.

**Checkpoint**: Persist `{ round: R4, allocators: [{name, id, trigger_guard, sharing_sum: 10000}], refund_path_covered: true, arbitration_bound: bool, compensation_fund: bool }`.

### R5: Pre-Publish Audit (Mandatory)

**AI Goal**: Run the §Pre-Publish Verification before the irreversible publish. Export Guards and Machine, verify all bindings, confirm Allocator splits match user intent.

**Key Questions**:
- Confirm: ready for the pre-publish audit? This is the last chance to fix before immutability.
- Re-check R1-R7: any items changed since R1? (e.g., user wants to add a Guard.)
- Confirm: Allocator splits match your stated revenue model?

**Tool Calls**:
1. `guard2file` → export all Guards, present for review.
2. `machineNode2file` → export the Machine, present for review.
3. `query_toolkit` → `onchain_objects` for the Service — re-check `machine`, `order_allocators`, `buy_guard`, `permission` all bound correctly.
4. (Internal) Run the audit checklist: Permission exists, Service `machine` bound, Machine `bPublished: false` (will publish in R6), Guards all created and tested, Allocators sum to 10000, refund path covered.

**Success Criteria**: All audit items PASS. AI presents the audit report and the user explicitly confirms "proceed to publish".

**Fallback**: Audit blocker (e.g., Machine not bound to Service) → return to R4 and fix. Audit warning (e.g., no Compensation Fund) → ask user, then publish or add fund. User hesitates → offer to defer publish and keep the Service in draft state.

**Checkpoint**: Persist `{ round: R5, audit_pass: true, user_confirmed: true, guard_exports: [...], machine_export: <path> }`.

### R6: Publish (Machine First, Then Service)

**AI Goal**: Execute STEP 4: publish the Machine (irreversible), bind it to the Service, then publish the Service (irreversible). Both `machine`/`order_allocators` fields become immutable on Service publish.

**Key Questions**:
- Final confirmation: publish is irreversible. Machine nodes, Forwards, Guards, thresholds all become immutable. Service `machine` and `order_allocators` will be locked. Proceed?
- Confirm the operating account has sufficient gas.

**Tool Calls**:
1. `onchain_operations` → `operation_type: "machine"` with `publish: true` — Machine locked.
2. `onchain_operations` → `operation_type: "service"` MODIFY to bind `data.machine = "<published_machine_id>"`.
3. `onchain_operations` → `operation_type: "service"` with `publish: true` — Service `machine` and `order_allocators` locked.
4. Post-publish verification: `query_toolkit` → `onchain_objects` for the Service — confirm `bPublished: true`, `machine` field locked, `order_allocators` locked.
5. `onchain_events` → confirm Publish event fired.

**Success Criteria**: Both Machine and Service `bPublished: true`. Service `machine` and `order_allocators` fields are immutable. Publish event recorded.

**Fallback**: Pre-publish audit fails → return to R5 and fix; do NOT publish. Publish transaction fails (gas) → re-faucet, retry. Service publish fails with "machine not published" → confirm Machine publish succeeded first (use `env.no_cache: true`). Post-publish immutability check fails (rare) → escalate; protocol-level invariant violated.

**Checkpoint**: Persist `{ round: R6, machine_published: true, service_published: true, publish_digest, immutable_fields_locked: true }`.

### R7: Post-Publish Mutable Configuration

**AI Goal**: Execute STEP 5: configure the post-publish mutable fields — `description`, `location`, `sales` (products with WIP), `customer_required`, `um` (Contact).

**Key Questions**:
- (If physical goods) For each sales product: name, price, stock, WIP file? (User MUST provide — §Anti-Fabrication Rules.)
- (If customer_required) What fields does the customer need to submit? What is the Contact (`um`) for Messenger communication?
- (If `customer_required` is set) `um` MUST be set — confirm the Contact.

**Tool Calls**:
1. (Optional) `wip_file` → `generate` for each product's WIP file (markdown_text + images → outputPath + hash).
2. `onchain_operations` → `operation_type: "service"` MODIFY to set `sales` (each product: name, price, stock, wip, wip_hash), `description`, `location`, `customer_required`.
3. (If `um` reuse) `onchain_operations` → `operation_type: "service"` MODIFY to set `um = "<contact_name_or_id>"`.
4. (If `um` create) `onchain_operations` → `operation_type: "contact"` CREATE, then bind via `service` MODIFY.

**Success Criteria**: All post-publish mutable fields configured. `customer_required` (if set) has a matching `um`. Sales products have WIP files. AI shows the user the final Service state.

**Fallback**: User hasn't provided product details → ASK, do not invent (§Anti-Fabrication Rules). WIP generation fails → retry, or skip WIP and accept weaker evidence (per [wowok-order](../wowok-order/SKILL.md) E2, empty `wip_hash` is "auto-verified, weaker evidence"). Contact creation fails → check name collision, append `_v1`.

**Checkpoint**: Persist `{ round: R7, sales_count, um_bound: true, customer_required_set: bool }`.

### R8: Test Order (Dry Run)

**AI Goal**: Validate the full stack end-to-end with a test order. Use a second account as the buyer.

**Key Questions**:
- Do you have a second account to play the customer, or should we create one?
- Confirm test parameters: test amount, test deliverable hash.

**Tool Calls**:
1. `account_operation` → `gen` (second account, the "buyer") + `faucet`.
2. `onchain_operations` → `operation_type: "order"` CREATE — buyer places order on the published Service.
3. `onchain_operations` → `operation_type: "progress"` with `hold: true` then `hold: false` to advance through each Machine node.
4. At each terminal node: `onchain_operations` → `operation_type: "allocation"` with `alloc_by_guard` to verify fund distribution.
5. `onchain_operations` → `operation_type: "order"` to verify buyer can withdraw refund if applicable.
6. `query_toolkit` → `onchain_events` to verify all expected events fired.

**Success Criteria**: Test order traverses the full Machine, all Guards pass with mock submissions, Allocation distributes funds correctly. Event log matches expected sequence.

**Fallback**: Guard blocks at a node → check `gen_passport` output, re-collect correct submission, retry. Allocation distributes wrong amount → halt, review Allocator `sharing` array. Order creation fails → check Service is published and Permission allows buyer role.

**Checkpoint**: Persist `{ round: R8, test_order_id, test_passed: true, event_log_summary }`.

### R9: Customer Channel Setup

**AI Goal**: Ensure the merchant can receive customer inquiries via Messenger. Configure the merchant's Messenger endpoint and verify the Contact (`um`) is reachable.

**Key Questions**:
- Have you enabled Messenger on your merchant account? (Required to receive customer messages.)
- What Messenger name do you want? (Required for delivery — without it, the account has no messenger endpoint.)
- (Optional) Do you want to configure a Guard list for stranger filtering? (Open, Guarded, Closed, or Defensive per [wowok-messenger](../wowok-messenger/SKILL.md).)

**Tool Calls**:
1. `account_operation` → `messenger` (set a messenger name on the merchant account).
2. `account_operation` → `get` to retrieve the messenger address — share this with customers.
3. `messenger_operation` → `watch_conversations` with `unreadOnly: true` — verify inbox is functional.
4. (Optional) `messenger_operation` → configure `allowStrangerMessages`, guard list, blacklist per the chosen protection profile.

**Success Criteria**: Merchant Messenger endpoint active. `um` Contact on the Service points to this Messenger. Inbox returns (empty is fine — just confirm it works).

**Fallback**: Messenger name not set → customers cannot message; set it now. `um` Contact's `ims[]` empty → no Messenger addresses; add the merchant's messenger address to the Contact. Guard list added without testing → run `gen_passport` on each Guard to confirm what conditions strangers must meet.

**Checkpoint**: Persist `{ round: R9, messenger_enabled: true, messenger_name, um_ims_count, protection_profile: open|guarded|closed|defensive }`.

### R10: Operations Handoff

**AI Goal**: Transition the merchant from setup to ongoing operations. Produce the handoff packet and orient them to daily operations (order fulfillment, customer communication, dispute handling).

**Key Questions**:
- Want a summary of your published Service and how to share the purchase link?
- Do you know how to fulfill incoming orders? (Monitor Progress, advance nodes, trigger Allocation.)
- Do you know how to handle disputes? (Arbitration flow, evidence via Messenger WTS.)

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` for the Service — produce the final state summary (ID, name, publish digest, machine, allocators, guards, sales, um).
2. `local_info_operation` → write the handoff packet with all object IDs, the test order digest, and recommended next Skills.
3. (Internal) Orient the user to daily operations per §Order Fulfillment: monitor Progress, advance nodes via `hold: true`/`hold: false`, trigger Allocation via `alloc_by_guard`.

**Success Criteria**: Merchant has the Service address to share with customers. Handoff packet persisted. User understands the daily ops loop.

**Fallback**: User wants to make changes → clarify which fields are still mutable post-publish (`description`, `location`, `sales`, `customer_required`, `um`) vs immutable (`machine`, `order_allocators`). User wants to unpublish → impossible; must create a new Service. User asks about analytics → hand off to [wowok-analytics](../wowok-scenario/SKILL.md) (Phase 2).

**Checkpoint**: Persist `{ round: R10, handoff_emitted: true, service_address, purchase_link, journey: complete }`. Mark merchant setup COMPLETE.

**Handoff Packet** (emitted to [wowok-order](../wowok-order/SKILL.md) for the buyer perspective, and to [wowok-arbitrator](../wowok-arbitrator/SKILL.md) for dispute setup):
- Service ID + name + publish digest
- Machine ID + node topology
- Permission ID + role/index map
- Guard IDs + bindings
- Allocator IDs + trigger map
- Contact (`um`) ID + Messenger address
- Test order digest + result
- Recommended next Skill: wowok-order (buyer perspective), wowok-arbitrator (dispute setup), wowok-analytics (post-30-day audit)

---

## Decision Trees

### D1: Reuse vs Create (per object)

```
For each of Permission / Machine / Guard / Contact / Arbitration:
├── User provides existing name/ID? ──→ REUSE (string reference)
│   └── Verify via query_toolkit.onchain_objects that it resolves? ──→ use string
├── User says "create new"? ──→ CREATE (object shape)
├── User unsure? ──→ query on-chain candidates, present list, let user pick or create
└── Special cases:
    ├── Permission: STRONGLY RECOMMENDED reuse (centralized control across all services)
    ├── Arbitration: ALWAYS reuse existing Arb services (customers choose from established arbiters)
    └── Contact (um): reuse existing customer service Contact when possible
```

### D2: Allocator Recipient Type

```
For each sharing[].who field in an Allocator:
├── Recipient address known at Service creation time (merchant, platform)? ──→ Entity { name_or_address: "<name>" }
├── Recipient address dynamic, known only at order time (customer/Order)? ──→ GuardIdentifier: N (N = table index of Address submission)
├── Recipient is the caller of alloc_by_guard (rare)? ──→ Signer: "signer"
└── ⚠️ Common mistake: using Signer for all entries → all funds go to whoever calls alloc_by_guard, differentiated splits impossible
```

### D3: Post-Publish Mutability

```
Service is published (bPublished: true). What can still change?
├── description, location? ──→ YES, mutable (MODIFY service)
├── sales (products with WIP)? ──→ YES, mutable (MODIFY service) — but user MUST provide name/price/stock/WIP
├── customer_required? ──→ YES, mutable (MODIFY service)
├── um (Contact)? ──→ YES, mutable (MODIFY service) — required if customer_required is set
├── machine? ──→ NO, immutable after publish (must create new Service to change Machine)
├── order_allocators? ──→ NO, immutable after publish (must create new Service to change Allocators)
├── buy_guard? ──→ NO, immutable after publish (must create new Service)
├── arbitrations.list? ──→ NO, immutable after publish (must create new Service)
├── compensation_fund? ──→ Addable via compensation_fund_add, but setting_locked_time_add locks withdrawal for N days
└── rewards? ──→ Mutable (add/modify/remove)
```

### D4: Compensation Fund Strategy

```
Should I add a Compensation Fund?
├── Service involves high-value orders? ──→ YES (customer protection builds trust)
├── Service involves physical goods with dispute risk? ──→ YES
├── Service is purely digital with low dispute risk? ──→ OPTIONAL (low priority)
├── Service already has Arbitration bound? ──→ YES (Compensation Fund is the payout source for arb rulings)
└── If YES:
    ├── compensation_fund_add: deposit WOW into the fund
    ├── setting_locked_time_add: lock duration (default 30 days = 2592000000ms)
    ├── setting_lock_duration_add: customize lock duration
    └── ⚠️ Withdrawal: Pause Service → Wait lock duration → compensation_fund_receive (cannot withdraw while active)
```

### D5: Daily Operations Triage

```
Merchant daily check-in:
├── New orders? ──→ query_toolkit.onchain_events (NewOrderEvent) → fulfill per Machine workflow
├── Orders stuck at a node? ──→ query Progress → check Forward operators / Guard submissions → advance or contact customer
├── Customer messages? ──→ messenger_operation.watch_conversations (unreadOnly: true) → respond
├── Funds to claim? ──→ allocation.alloc_by_guard (anyone can trigger; verify fund flow)
├── Disputes opened? ──→ query Arb events → respond via Messenger + WTS evidence
└── Low balance? ──→ query_toolkit.account_balance → faucet or transfer
```

---

## Failure Playbooks

### F1: Publish Fails Because Machine Not Published

**Trigger**: `service` publish with `publish: true` reverts with "machine not published" or similar.

**Diagnosis**: The Service's `machine` field references a Machine that is not yet published. Service publish requires a published Machine per [wowok-tools](../wowok-tools/SKILL.md) §service constraints.

**Recovery**:
1. `query_toolkit` → `onchain_objects` for the Machine — confirm `bPublished: false`.
2. `onchain_operations` → `operation_type: "machine"` with `publish: true` — publish the Machine first.
3. Re-attempt `service` publish.
4. If Machine publish also fails → diagnose separately (gas, schema, etc.).

**Prevention**: R6 of the dialogue explicitly publishes the Machine BEFORE the Service. The §Service Build Lifecycle STEP 4 documents this order. Never attempt Service publish without confirming Machine publish first.

### F2: Allocator `sharing` Sum ≠ 10000

**Trigger**: Pre-publish audit or post-publish test reveals an Allocator's `sharing` array sums to something other than 10000 basis points (100%).

**Diagnosis**: The user's stated revenue model doesn't match the on-chain configuration. Either the user changed their mind, or the AI mis-entered the rates.

**Recovery** (pre-publish):
1. `onchain_operations` → `operation_type: "service"` MODIFY to correct the `order_allocators[].sharing` rates.
2. Re-verify the sum = 10000.

**Recovery** (post-publish — `order_allocators` immutable):
1. Cannot modify the existing Allocator. The fund distribution is locked.
2. For future orders, create a new Service with corrected Allocators and deprecate the old Service.
3. For existing orders, the incorrect distribution will execute — surface this to the user and the affected customers.

**Prevention**: R4 of the dialogue explicitly verifies each Allocator's `sharing` sum = 10000 before publish. The §Pre-Publish Verification re-checks. Always display the splits in human-readable form (e.g., "95% merchant, 5% platform") and confirm against the user's stated model.

### F3: Customer Cannot Place Order (buy_guard Blocks)

**Trigger**: A legitimate customer attempts to place an order and the transaction reverts at the `buy_guard` check.

**Diagnosis**: The `buy_guard` is rejecting the customer. Common causes: (a) KYC requirement the customer hasn't met; (b) amount cap exceeded; (c) allowlist doesn't include the customer's address; (d) Guard logic is wrong.

**Recovery**:
1. `guard2file` → export the `buy_guard`, inspect the logic.
2. Query the customer's address via `query_toolkit` → `onchain_objects` (Personal, EntityRegistrar) to see what data the Guard would see.
3. If the Guard is correctly rejecting (customer genuinely doesn't meet criteria) → inform the customer what they need to provide.
4. If the Guard is wrongly rejecting (logic bug) → CREATE a new Guard with corrected logic, re-test via `gen_passport`, rebind to the Service (pre-publish only; post-publish, `buy_guard` is immutable — must create a new Service).

**Prevention**: R3 of the dialogue tests every Guard via `gen_passport` with multiple scenarios (pass, fail, edge) before binding. R5's pre-publish audit re-verifies. For `buy_guard`, test with a customer address that should pass AND one that should fail.

### F4: Compensation Fund Withdrawal Blocked

**Trigger**: Merchant attempts `compensation_fund_receive` and the operation reverts.

**Diagnosis**: The `setting_locked_time` has not elapsed. Withdrawal requires: (a) pause the Service, (b) wait the full lock duration (default 30 days), (c) then call `compensation_fund_receive`.

**Recovery**:
1. `query_toolkit` → `onchain_objects` for the Service — check `setting_locked_time` and `pause` state.
2. If not paused → pause the Service first (`onchain_operations` → `operation_type: "service"` MODIFY with `pause: true`).
3. If lock duration hasn't elapsed → wait. Surface the remaining wait time to the user.
4. If both conditions met → retry `compensation_fund_receive`.

**Prevention**: Clearly communicate the lock duration at R4 when the Compensation Fund is added. The default 30 days is intentional — it prevents merchants from withdrawing funds that customers might still claim via arbitration. Merchants should treat the Compensation Fund as a committed reserve, not a liquid balance.

### F5: Test Order Stuck at a Node

**Trigger**: The R8 test order's Progress cannot advance past a specific node — the Forward either fails or the threshold is never met.

**Diagnosis**: Query the Progress via `query_toolkit` → `onchain_objects` — inspect `current_node`, `session`, `forward_history`. Common causes: (a) Forward's `namedOperator` not assigned; (b) Guard blocking with unmet submission; (c) threshold requires multiple Forwards but only one executed.

**Recovery**:
1. If `namedOperator` is a role name not yet assigned → `progress` MODIFY to assign the role address, then execute the Forward.
2. If Guard is blocking → re-collect the correct submission, re-call `progress` with `hold: false` and the submission.
3. If threshold not met → identify which other Forwards need to execute; execute them.
4. If the session is locked by another party → `progress` with `adminUnhold: true` to force-release stale locks.
5. If the Forward is genuinely unreachable → the Machine has a dead branch (per [wowok-machine](../wowok-machine/SKILL.md) F2); must create a new Machine.

**Prevention**: R5's pre-publish audit includes "all thresholds independently achievable" and "every Forward has at least one operator". R8's test order traverses every path before publish, catching stuck nodes while the Machine is still mutable.

### F6: Customer Files Dispute But No Arbitration Bound

**Trigger**: A customer attempts to file a dispute via `order.arb_confirm`, but the Service has no Arbitration in `arbitrations.list`.

**Diagnosis**: The Service was published without binding an Arbitration service. Post-publish, `arbitrations.list` is immutable — cannot add one.

**Recovery**:
1. Acknowledge: the customer has no on-chain dispute path via this Service.
2. Off-chain resolution: communicate via Messenger, attempt to reach consensus manually.
3. For future orders: create a new Service with Arbitration bound before publish. Migrate customers to the new Service.
4. For the current stuck order: if the Machine has a refund path that doesn't require Arbitration (e.g., a timeout auto-refund Forward), use it. Otherwise, the funds may be stuck.

**Prevention**: R1's checklist includes Arbitration as a recommended item (R7 in [wowok-arbitrator](../wowok-arbitrator/SKILL.md) requires `um` for evidence exchange). R4 of the dialogue binds Arbitration to `arbitrations.list` BEFORE publish. The §Pre-Publish Verification should flag "no Arbitration bound" as a warning (blocker for high-value services, optional for low-risk digital services).

---

## Tier Layering

### Novice Tier — Guided Setup

- Full R1-R10 dialogue sequence with the §PRE-FLIGHT checklist as a mandatory gate.
- Every R1-R7 item is collected explicitly; no defaults beyond R1 (Account) and R2 (Permission reuse).
- Pre-publish audit is mandatory and blocking — no overrides.
- The §Anti-Fabrication Rules are strict: AI never invents products, prices, workflows, or fund splits.
- Post-publish, the merchant is handed off to daily operations with a clear handoff packet.
- Trigger: merchant is new, or says "I want to set up a service".

### Advanced Tier — Custom Configuration

- Merchant provides a partial configuration (e.g., "I have a Permission and a Machine already, just need the Service and Guards").
- R1's checklist items can be skipped if the merchant confirms they're already handled (with verified object IDs).
- R4 may include advanced Allocator patterns: multi-tier distribution, Surplus mode, Amount mode for fixed payouts.
- R7 may include Rewards (incentive pools), multiple sales products with individual WIPs, custom `customer_required` fields.
- Pre-publish audit runs; warnings are non-blocking with explicit confirmation, blockers still block.
- Trigger: merchant says "I've done this before" or has completed prior Service setups.

### Expert Tier — Multi-Service & Supply Chain

- Merchant operates multiple Services with shared Permission, Contact, and Arbitration objects.
- R1-R3 are collapsed into "I know what I'm doing; here are the object IDs".
- R4 includes cross-Service Allocation (e.g., platform takes a cut from multiple services into a single Treasury).
- R7 includes supply chain composition (multiple Machines connected via Guard-based sub-Progress verification per [wowok-machine](../wowok-machine/SKILL.md) §Cross-Machine Composition).
- Compensation Fund strategy is deliberate: lock durations tuned to dispute risk per Service tier.
- The §Object Reuse & Immutability table is the primary reference — centralized control across many Services.
- Trigger: merchant explicitly asks for "expert mode", operates multiple published Services, or invokes `onchain_operations` by raw operation_type with parameters.