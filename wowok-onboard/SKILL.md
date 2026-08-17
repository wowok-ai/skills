---
name: wowok-onboard
description: |
  WoWok First-Touch Onboarding — guides a new user from zero to their first
  published Service through a user-driven, dependency-aware build sequence
  (Review opening + 12 rounds). Bridges the operation_type wall and the
  object_type wall by sequencing every MCP call into a dependency-correct
  build order, while giving the user a reuse/customize/discover choice for
  every component.

  Use when a new user says "I want to open a shop", "I want to sell something",
  "how do I start", or has no published Service yet. Produces a complete merchant
  capability stack: Permission + Service (published) + Machine (published) +
  Progress (bound) + Guards + Allocation + Contact (customer-service) +
  Arbitration (third-party), verified by a user-driven test order.

  Not for existing merchants tuning operations — hand off to wowok-provider.
when_to_use:
  - User is new to WoWok and wants to set up a service
  - User says "open a shop", "create a service", "start selling", "onboard"
  - User has no published Service yet on the current account
  - User completed account creation and asks "what's next"
  - User resumes an interrupted onboarding (read checkpoint state)
---

# WoWok First-Touch Onboarding

Guides a new merchant from zero to first published Service in a **Review opening + 12 user-driven rounds**. Every round collects explicit user decisions (never fabricated), offers a **reuse / customize / discover** choice per component, and verifies success before advancing.

> **Related Skills**: [wowok-provider](../wowok-provider/SKILL.md) (post-onboard operations), [wowok-machine](../wowok-machine/SKILL.md) (workflow design), [wowok-messenger](../wowok-messenger/SKILL.md) (customer-service Contact), [wowok-arbitrator](../wowok-arbitrator/SKILL.md) (third-party Arbitration)

---

## MCP Knowledge Layer

The following content has been pushed down to the MCP knowledge layer and is applied automatically — this Skill no longer duplicates it:

| Content | Access via (MCP action) | Applied Via |
|---------|--------------------------|-------------|
| Scenario mode defaults (per-industry Permission/Machine/Guard/Allocator) | `project_operation` action='list_modes' / 'create_project' | Auto-applied when `project_industry` is passed to `create_project` |
| Safety rules (immutability, confirmation, object reuse) | `schema_query` action='get_safety_rules' | Pre-publish checks + `project_operation.evaluate_project` |
| Guard / Machine / Arbitration / Treasury design rules | `schema_query` action='get_guard_design_patterns' | `project_operation.evaluate_project` |
| Common mistakes (field/unit/workflow pitfalls) | `wowok_buildin_info` action='common mistakes' | Tool calls (proactive warnings) |
| Deployment checklist (publish readiness) | `project_operation` action='evaluate_project' | deployment-scanner D-01..D-20 |

This Skill keeps the **overall onboarding flow**, the **dependency-aware build order**, and the **user-driving interaction rhythm** (see below). Pass the user's industry to `create_project` (via `project_industry` parameter) and the MCP layer auto-fills the scenario defaults.

---

## Core Interaction Principles

These four principles govern EVERY round. They are non-negotiable and replace the old "linear script" model.

1. **Review-first**: Before the first user choice, the AI MUST output a review that states (a) its understanding of the user's task, (b) the dependency-chain overview, and (c) the interaction contract. Only AFTER this review is the first choice presented.
2. **User-driven**: Every round is driven by an explicit user decision. The AI provides a `recommend` option but NEVER auto-advances. The user may pause at any important round to ask questions.
3. **Reuse / Customize / Discover (三选一)**: For every component (Permission, Machine, Guard, Contact, Treasury, Arbitration, etc.), the AI MUST present three avenues — **reuse an existing object** (with its benefit), **customize a new object** (with its sub-task ability), or **discover an object** from other projects / the system. All three are mandatory to surface.
4. **Default-config disclosure**: Before creating any new object, the AI MUST disclose the default configuration and important information (purpose, key settings, caveats), then let the user decide. No silent defaults.

---

## Dependency Chain (Authoritative ODG)

The build order is driven by the object dependency graph verified from on-chain constraints. This is the single narrative used across all rounds:

```
Account (account + network)
 └─ Permission (centralized access control — referenced by ALL objects)
     ├─ Service DRAFT (skeleton first → Guards reference it by LocalMark NAME, breaks Guard↔Service cycle)
     ├─ Machine nodes/forwards (business workflow)
     │    └─ Guards (depend on node names + service name) → bind to forwards (unpublished) → PUBLISH Machine (immutable)
     └─ Service Phase 1: bind machine + buy_guard + sales + order_allocators
          ├─ Sales (WIP URL + hash) · order_allocators (split → owner/Treasury) · Contact (Service.um → ims[])
          ├─ Arbitration (third-party; permission ≠ Service)
          └─ optional + audit → PUBLISH Service (L1-locked) → TEST ORDER
```

**Irreversibility constraints (Move/SDK-verified):**
- `service.machine` must reference a **published** Machine; `order_allocators` + `arbitrations` are **L1-locked** (set before publish); Machine nodes/forwards and Guard logic are **immutable after publish** — bind everything while unpublished.
- `compensation_fund > 0` REQUIRES non-empty `arbitrations` (`E_ARBITRATION_NOT_SET_WITH_COMPENSATION_FUND` 25); Arbitration MUST NOT share the Service's Permission (`E_ARBITRATION_PERMISSION_CONFLICT` 33 — owner would control dispute resolution).
- Guard references Service/Machine by **LocalMark NAME** (not address) to break the Guard↔Service cycle.

---

## Review Opening Protocol (before R1)

When a new user expresses intent ("open a shop", "sell something"), the AI MUST output this review FIRST, then ask the first question:

1. **Understanding framework** — restate what the AI understood: what the user sells, the rough industry, the business model.
2. **Dependency-chain overview** — show the chain above (abridged), so the user sees the whole journey and where they can intervene.
3. **Interaction contract** — state clearly:
   - Every round is driven by the user; the AI provides a `recommend` but waits for confirmation.
   - The user may pause at any round to ask questions or revisit an earlier decision.
   - Every component offers **reuse / customize / discover**.
   - Any default configuration is disclosed BEFORE the user decides.
4. **First question** — confirm the understanding is correct, then proceed to R1.

> ⚠️ The first user-choice interaction MUST NOT happen before this review is complete.

---

## R1-R12 Build Order

Each round below lists: **Semantic meaning**, **Core elements to confirm**, **Default config** (disclosed before the user decides), **Reuse / Customize / Discover**, and **Dependencies**. (Order: R1 Account → R2 Permission → R3 Service draft → R4 Machine+Guards → R5 publish Machine → R6 Sales → R7 order_allocators → R8 Contact → R9 Arbitration → R10 optional+audit → R11 publish Service → R12 test order.)

---

### R1 — Account & Network

- **Semantic meaning**: Decide WHO operates on-chain (fund ownership + signing identity) and WHERE (testnet vs mainnet). This identity owns all subsequent objects and receives settlement.
- **Core elements to confirm**:
  - Account: **reuse an existing account** (name/address) or **create new** (default name).
  - Network: **testnet first** (recommended) or **mainnet directly**.
  - Industry mode: pass to `create_project` as `project_industry` — see the Industry Selection Guide below.
- **Default config**: new account with a default name; testnet network; industry mode auto-fills scenario defaults (Machine shape, Guards, Allocator).
- **Reuse / Customize / Discover**: Reuse an existing account (benefit: keeps objects under one identity) — or create new.
- **Dependencies**: none (foundation).

### R2 — Permission (access control)

- **Semantic meaning**: Permission is the **central control point** answering "who can operate this service's objects". Index 1000+ are user-defined roles (indexes 0–999 are built-in). Reusing one Permission across services keeps a single, auditable control surface.
- **Core elements to confirm**:
  - **Reuse an existing Permission** (strongly recommended) OR **create new**.
  - If new: `name`, `type_parameter`, and indexes (e.g. `1000 = provider`).
- **Default config**: a new Permission with index `1000 = provider`.
- **Reuse / Customize / Discover**: Reuse is strongly recommended (benefit: centralized control, no orphan Permission). Discover: check `local_mark_list` / `account_list` for existing Permissions.
- **Dependencies**: Account (R1).

### R3 — Service DRAFT (skeleton first)

- **Semantic meaning**: The Service is your brand's on-chain identity. Creating a **draft first** (unpublished) lets later Guards reference it by **LocalMark NAME**, breaking the Guard↔Service circular dependency (Guard needs Service name; Service needs Guard address). The draft is fully editable until publish.
- **Core elements to confirm**:
  - Service `name` and `type_parameter` (what kind of service).
- **Default config**: unpublished draft; only name + type_parameter set now; machine/order_allocators/sales filled in R5–R7.
- **Reuse / Customize / Discover**: New Service (you have none). Name is the brand identity — confirm it carefully.
- **Dependencies**: Permission (R2).

### R4 — Business Flow + Permissions + Acceptance (Machine + Guards, INTEGRATED)

- **Semantic meaning**: The **core round** — design the order's state transitions (Machine nodes/forwards), WHO can advance each transition (forward permissions), and WHAT must be verified at each step (Guard acceptance). These three are designed together because a forward's Guard depends on the Machine's node names, and the Allocator's Guard depends on both Machine and Service.
- **Internal sub-order** (disclosed to the user):
  1. Define Machine **nodes + forwards** (business states + transitions) — permissions resolved from R2's Permission indexes.
  2. Define **Guards** (acceptance logic) — reference machine node names + service name via LocalMark NAME.
  3. **Bind** Guards to forwards (still unpublished, reversible).
- **Core elements to confirm** (all three, explicitly):
  - Business flow: node list + forward paths.
  - Permissions: per-forward `namedOperator` (`""`=OrderHolder / role name) or `permissionIndex`.
  - Acceptance: per-forward Guard (or inline) — what must be verified before the transition executes.
- **Default config**: the industry mode's `machine_shape` + `guards` (query `project_operation` action='list_modes'). Disclose these defaults FIRST, then let the user accept or customize.
- **Reuse / Customize / Discover**: Reuse an existing Machine template (`machineNode2file` export) or an existing Guard (`guard2file`). Customize: define your own nodes/forwards/guards. Discover: `machineNode2file` / `local_mark_list` for other projects' Machines/Guards.
- **Dependencies**: Service draft (R3) + Permission (R2).
- **R-M1-11 compliance**: Machine MUST use business-state nodes (e.g. `cancelled`, `returned`, `return_approved`), NOT dispute/refund terminal nodes (`refunded`, `deposit_refunded`, `disputed`, `arb`). Refund routes via Allocator; dispute routes via Arbitration.

### R5 — Publish Machine

- **Semantic meaning**: Freeze the business workflow on-chain. After this, nodes/forwards are **immutable**.
- **Core elements to confirm**: confirm the Machine topology is final (export `machineNode2file` for backup/verification first).
- **Default config**: n/a — confirmation gate.
- **Reuse / Customize / Discover**: n/a (publication, not creation).
- **Dependencies**: R4.

### R6 — Sales (products with WIP)

- **Semantic meaning**: Define the sellable products — name, price, stock, and the **WIP file** (work-in-progress / product description). The WIP is a **public URL + hash** (`Sale.wip` = URL, `Sale.wip_hash` = hash), which customers fetch to understand the deliverable.
- **Core elements to confirm** (per product):
  - `name`, `price` (u64, min unit), `stock`.
  - `wip` (URL) + `wip_hash` — **the WIP MUST be deployed to a public endpoint** (on-chain only stores the URL + hash, not the file).
- **WIP public deployment (strongly recommended sub-task)**: user provides web/doc material → AI generates the WIP file + deploys to a public URL (recommend GitHub Pages / free static hosting).
- **⚠️ NO "set-without-deploy" option**: `sale.wip` is stored ON-CHAIN and every customer fetches it when ordering. The ONLY two valid choices are: (1) deploy the .wip file to a publicly reachable URL and set `wip` to that URL, or (2) leave `wip: ""` (TESTING ONLY — WIP verification skipped). Do NOT offer a placeholder/local path/localhost/LAN URL as `wip` — it passes merchant-side verification but aborts customer `order_new` 100% (INTERNAL TEST USE ONLY: local-network URLs require `env.network: "localnet"`).
- **Default config**: n/a — products are user business decisions (never fabricated).
- **Reuse / Customize / Discover**: Reuse an existing `sales` item (rare). Customize: define your own products. Discover: n/a.
- **Dependencies**: Service draft (R3).

### R7 — order_allocators (fund distribution + Treasury)

- **Semantic meaning**: Define how order funds are distributed — your revenue model. This is written to `service.order_allocators` and is **L1-locked after publish**, so it must be correct now.
- **Core elements to confirm**:
  - Allocation mode per terminal outcome: **amount** (fixed) / **rate** (basis points, sum = 10000) / **surplus** (remainder, at most one).
  - Recipient (`who`): `{Entity: name_or_address}` / `{GuardIdentifier: N}` / `{Signer: "signer"}`.
- **Merchant-type guidance (disclosed to the user)**:
  - **Personal merchant** → route funds to the **Permission owner** (`Entity` referencing the owner's account) — simple, single-owner revenue.
  - **Organization / multi-party** → route funds to a **Treasury** object (referenced as an `Entity` recipient; `Treasury.receive` index 253 intakes CoinWrapper). The AI MUST offer to **new or select a Treasury** via a sub-task, and surface a list of existing Treasury objects (query `onchain_objects` type=treasury) for convenience.
- **Default config**: industry mode's `allocator` strategy (e.g. `retail_d2c` = Merchant 97% + Processor 3% rate split). Disclose, then let the user confirm or change.
- **Reuse / Customize / Discover**: Reuse an existing Allocator pattern / Treasury. Customize the split. Discover other projects' allocator/Treasury setups.
- **Dependencies**: Machine published (R5); Guards (R4); Service draft (R3).
- **⚠️ L1-LOCKED**: `order_allocators` MUST be set here — after `service.publish` it is permanently frozen.

### R8 — Contact (customer-service channel)

- **Semantic meaning**: Contact is the bridge between the Service and Messenger: `Service.um → Contact → ims[]` (messenger endpoint addresses). Customers query the Contact's `ims[]` to find where to send messages. Without it, your service has no customer-service inbox.
- **Core elements to confirm**:
  - **Reuse an existing Contact** OR **create new**.
  - If new: configure the **local account as messenger** (`account_operation` → messenger, `enabled: true`) and set **anti-spam** policy.
- **Default config** (disclosed before creation):
  - Contact is **mutable**; `im_add`/`im_remove` require permission index `453` (CONTACT_IM).
  - Messenger must be `enabled: true` or the account has no endpoint.
  - **Anti-spam four-layer model** (Blacklist → Friends → Guard → Stranger one-message limit): **Open** (public storefront) / **Guarded** (verified strangers) / **Closed** (friends-only) / **Defensive** (open + blacklist).
- **Reuse / Customize / Discover**: Reuse an existing Contact (one inbox for multiple services). Customize: new Contact + own messenger/anti-spam. Discover: `local_mark_list` for existing Contacts.
- **Dependencies**: Permission (R2) + Account (R1). Must happen BEFORE R11 (Service publish) if `customer_required` is set.

### R9 — Arbitration (third-party dispute resolution)

- **Semantic meaning**: Route disputes to an independent third party so neither you nor the customer controls the verdict — this builds trust. **Optional but strongly recommended.**
- **Core elements to confirm**:
  - **Skip** arbitration, OR **REUSE an existing third-party Arbitration** (recommended).
  - ⚠️ **Do NOT create your own Arbitration for your own Service** — `service.arbitration_add` asserts `arbitration.permission != service.permission` (`E_ARBITRATION_PERMISSION_CONFLICT`, 33): if the Arbitration shares your Service's Permission, you (the owner) would control dispute resolution, breaking fairness.
  - If adding arbitration: also configure the **compensation fund** (see below).
- **Compensation fund**: internal `Balance<T>` on the Service (NOT a Treasury object), consumed by `arbitration::compensation_claim`. If `compensation_fund > 0`, `arbitrations` MUST be non-empty (else publish aborts `E_ARBITRATION_NOT_SET_WITH_COMPENSATION_FUND` 25). Deposit via `compensation_fund_add`; withdraw via `compensation_fund_withdraw` requires `bPaused=true` + lock elapsed. Amount = user decision (cover realistic payouts).
- **Reuse / Customize / Discover**: Reuse an existing Arbitration (safety rules mark arbitration as `always_reuse` — query `schema_query` action='get_safety_rules'; customers choose from established arbiters). Discover: query `onchain_objects` type=arbitration for existing Arb services.
- **Dependencies**: Service draft (R3) + Permission (R2). Must happen BEFORE R11 (Service publish) if compensation_fund is configured.

### R10 — Optional Components + Pre-Publish Audit

- **Semantic meaning**: Add optional trust/attraction components (Reward for loyalty, supply-chain promises, Repository), then run a **final risk audit** before publishing.
- **Core elements to confirm** (each optional, each with default disclosure + reuse/customize/discover):
  - Reward (discounts/loyalty).
  - Supply-chain promises / Repository.
  - Audit: `evaluate_project` (risk) — fix ALL CRITICAL findings.
- **Default config**: none required — these are opt-in. The audit itself is mandatory.
- **Reuse / Customize / Discover**: each optional component can be created or discovered.
- **Dependencies**: R1–R9.

### R11 — Publish Service

- **Semantic meaning**: Make the service live. Irreversible — `machine`, `order_allocators`, and `arbitrations` become permanently frozen. Confirmation gate (Phase 2: only flips `publish: true`; all L1 fields were set in R5–R9). After publish the Service is immediately orderable — `publish` auto-sets `bPaused=false` (per MCP `ServicePublishedEvent` semantic; do NOT call a separate `pause:false`/unpause operation).
- **Dependencies**: R10 audit passed.

### R12 — Test Order (user-driven, next-node disclosure)

- **Semantic meaning**: Run a real order end-to-end to verify the flow. Unlike other rounds, this one advances through the Machine step by step, with the AI disclosing every reachable next node before each move.
- **Core elements to confirm**:
  - **Test account**: which account places the order — default is the **service-creation account**, but the user may choose another account to simulate a buyer.
  - **Advance path**: at each node, the user chooses which next node to advance to.
- **Per-node disclosure (before each advance)**: the MCP injects `semantic.workflow_guidance` (on query_toolkit Progress results: `_workflow_guidance` / `_workflow_guidance_text`) listing **ALL** reachable next nodes with their operator (`namedOperator=""` → order holder / `permissionIndex` → role / named operator), forward, weight, guard, business meaning, and a K3-framed recommendation (gains/risks/consistency). Relay this full list to the user (who can act, with which permission/account), then let the user choose — **AI 推荐、人决策** (K3 P3).
- **After each advance**: relay `semantic.workflow_receipt` — which account did what, whether the node migrated; if it did NOT migrate and threshold > 0, report threshold / accumulated weight / remaining / who must act next (K3 G4 阈值配合).
- **Default config**: test account = service-creation account.
- **Reuse / Customize / Discover**: n/a (verification).
- **Dependencies**: Service published (R11) — `order_new` requires `bPublished=true`.
- **Sequence**: `order_new` → read `workflow_guidance` (current node + reachable nodes) → user picks a next node → advance (`order.progress` for `namedOperator=""` / `progress.operate` otherwise) → relay `workflow_receipt` → repeat until terminal → `allocation.alloc_by_guard` → verify fund distribution.

---

## Industry Selection Guide

When the user describes their business (R1), query the authoritative industry list via `project_operation` action='list_modes' — 8 entries: `freelance` / `rental` / `education` / `travel` / `subscription` / `retail` / `retail_d2c` / `general`. If unsure which fits, call `project_operation` action='recommend_industry' with the business description. Pass the chosen `project_industry` to `create_project` — MCP auto-fills the scenario defaults (Machine shape, Guards, Allocator). Mid-onboarding iteration: `derive_user_mode` / `evolve_user_mode`.

---

## Deployment Checklist

Before declaring onboarding complete, run `project_operation` action='evaluate_project' (risk) — MCP auto-checks machine binding, order_allocators, buy_guard, arbitration isolation, R-M1-11 compliance, and publish readiness (deployment-scanner D-01..D-20). Fix ALL CRITICAL findings, then verify the remaining hard gates via `query_toolkit` (onchain_objects). The authoritative checklist is served by MCP — do not re-derive it here.

---

## Common Errors

Known field-name / unit / workflow pitfalls are served by `wowok_buildin_info` action='common mistakes' (filter by `operation` or `category`). Error-code guidance (`E_ARBITRATION_PERMISSION_CONFLICT` 33, `E_ARBITRATION_NOT_SET_WITH_COMPENSATION_FUND` 25, R-M1-11 refund routing) already appears in the R-rounds above plus MCP `schema_query` action='get_safety_rules' / 'get_guard_design_patterns'. Consult those instead of a duplicated table.
