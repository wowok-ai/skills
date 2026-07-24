---
name: wowok-machine
description: |
  WoWok Machine Workflow Design — the canonical skill for designing, building,
  and operating automated workflow templates (Machines) on WoWok. Machines are
  directed graphs that define how orders progress through stages, who can
  advance them, and what conditions must be met at each step.

  Covers Machine architecture (Nodes, Pairs, Forwards, Guards, Thresholds),
  lifecycle management (create, configure, publish, pause), node operations
  (add, exchange, rename, granular forward/prior-node manipulation),
  Progress integration, cross-Machine supply chain composition via Guard verification, privacy-preserving
  consensus patterns, and export/import workflows via machineNode2file.
when_to_use:
  - User wants to create or modify a Machine workflow
  - User asks about workflow steps, state transitions, or progress
  - User needs to design order processing pipelines
  - User mentions "machine", "workflow", "progress", "state machine", "pipeline"
  - User wants to export Machine nodes to a file or import from a file
  - User needs to understand threshold mechanics, forward permissions, or guard bindings
---

# WoWok Machine Workflow Design

Design, build, and operate automated workflow templates.

> **Role**: Service Provider or Workflow Designer
> **Key Tools**: `onchain_operations` with `operation_type: "machine"`
> **Related Skills**: [wowok-provider](../wowok-provider/SKILL.md) (Service binding), [wowok-order](../wowok-order/SKILL.md) (customer perspective), [wowok-messenger](../wowok-messenger/SKILL.md) (privacy)

---

## Core Concepts

**Machine** = workflow blueprint (directed graph of Nodes → Pairs → Forwards). **Progress** = live workflow instance, one per order.

Machines are **immutable after `publish: true`**; Guards are **CREATE-only**. Design the complete workflow before publishing.

## MCP Knowledge Layer

The following content has been pushed down to the MCP knowledge layer and is applied automatically — this Skill no longer duplicates it:

| Content | MCP Knowledge Module | Applied Via |
|---------|---------------------|-------------|
| Node design rules (node type specs, forward guard design patterns, topology limits) | `knowledge/machine-risk.ts` (`MACHINE_RISK_RULES`), `machine-topology.ts`, `machine-translation.ts` | `project_operation.create_project` (pass `project_industry`) + `project_operation.evaluate_project` (via `assessMachineRisks`) |
| Machine scene/template selection | `knowledge/machine-ledger.ts`, `machine-templates.ts` | `project_operation.create_project` (pass `project_industry`) |
| Forward Guard design patterns | `knowledge/guard-design-patterns.ts` (`GUARD_DESIGN_PATTERNS`) | `project_operation.evaluate_project` (via `assessGuardRisks`) |
| Safety rules (immutability, confirmation) | `knowledge/safety-rules.ts` | Pre-publish checks + `project_operation.evaluate_project` |
| Publish gate (4-layer fail-closed: checklist → risk → user → environment) | `knowledge/machine-confirm.ts` (`PUBLISH_CHECKLIST`, `confirmPublish`) | `project_operation.evaluate_project` + pre-publish gate |

This Skill keeps the **workflow conversation guidance**, **business flow design patterns**, and **machine lifecycle scripts**. The MCP layer handles node-design rule evaluation, scene/template selection, and risk aggregation.

---

## Machine Architecture

**Machine** → **Nodes** → **Pairs** (`prev_node` ["" = entry, multiple allowed], `threshold` [required total forward weight to advance]) → **Forwards** (`name`, `weight`, `permissionIndex` | `namedOperator` [who can execute], `guard` [optional condition]).

> All field types, limits, and valid values are in the MCP schema (`onchain_operations_machine`). This document focuses on design decisions **not captured** by the schema.

### Forward Permission Model

| Field | Scope | When to Use |
|-------|-------|-------------|
| `permissionIndex` | Shared across ALL Progress instances | Internal staff (warehouse, admin, platform) — same for every order |
| `namedOperator` | Per-Progress namespace | Roles that differ per order (delivery person, reviewer, agent) |

- `namedOperator: ""` (empty string): grants **order owner and agents** the right to execute. Standard way to let customers operate.
- `namedOperator: "<role_name>"`: role-based operators managed per Progress instance. Each Progress independently assigns addresses to role names.
- **Both fields set**: executor needs EITHER permission — internal staff OR external roles.
- **Design principle**: Use custom permissions (dedicated Permission object with custom indices), not built-in indices. Define workflow-specific roles, reference those indices in Forwards.

### Guard on Forwards

A Guard validates the Forward's execution condition. **Retained submissions**: when `retained_submission` is set on a Guard, submitted values are stored in Progress history, uniquely located by `(current_node, next_node, forward_name)`. Later nodes query these values from history.

> **Guard construction**: Forward Guard design patterns (table design, computation trees, query instructions) now live in the MCP knowledge layer — see `knowledge/guard-design-patterns.ts` (`GUARD_DESIGN_PATTERNS`), auto-applied via `project_operation.evaluate_project`. Query available Guard instructions via `wowok_buildin_info`.

### Threshold Mechanics

Users execute Forwards from the current node, accumulating weight within a **session**. When the sum of completed Forward weights meets or exceeds the Pair's threshold, the session finalizes and the workflow advances.

**Session behavior**: Each Forward is counted once per session. Repeated execution of the same Forward within one session adds no extra weight. A completed Forward cannot be re-executed until session reset (on node transition).

**Competing Transitions**: If a node has multiple Pairs to different targets, the **first Pair to meet its threshold wins** — remaining incomplete Forwards in other Pairs are **abandoned**. Competing paths are mutually exclusive by design. A Pair whose threshold can never be met because users always prefer another path creates a **dead branch**.

**Execution Patterns**:

| Pattern | Mechanism | Use Case |
|---------|-----------|----------|
| Sequential | `threshold=1`, single Forward `weight=1` | Single actor each step |
| Parallel AND | `threshold=N`, N Forwards `weight=1` | All parties must contribute |
| Parallel OR | Multiple Pairs, each `threshold=1` | Mutually exclusive branches |
| Weighted Voting | `threshold=100`, varied weights (e.g., 60+40) | Unequal stakeholder power |
| Hybrid | `threshold=5`, mixed weights (3+1+1) | Key party required, others optional |

---

## Machine Lifecycle

### Dependency-First Construction

Build in this exact order: (1) Permission (CREATE/MODIFY) → access control foundation; (2) Machine (CREATE, unpublished) → define all nodes; (3) Guards (CREATE) → build validation conditions; (4) Bind Guards to Forwards (MODIFY Machine) → set `guard` on each Forward; all operations (`add`, `set`, `add forward`) accept full `MachineForward` including `guard` + `retained_submission`; (5) Publish Machine → nodes IMMUTABLE; (6) Bind Machine to Service → workflow goes live.

**Why this order matters**: Publishing locks the Machine. Guards are immutable. Publishing before Guards are ready means Guards can never be added — the Machine is frozen without validation rules. **Create Guards, test them, then publish.**

### Node Operations (Pre-Publish Only)

Nine operations are available via the `node` field. Key design notes not captured by schema:

- `add` / `set` with `bReplace: false` (default) **merges** into existing nodes; `true` replaces all.
- `clear` is **irreversible** — instant wipe with no undo. Export via `machineNode2file` first.
- `exchange` swaps two node positions without delete/recreate. `rename` auto-updates all Pair references.
- `add forward` supports the full `MachineForward` structure including `guard` with `retained_submission`.

### File-Based Workflow

```
1. machineNode2file → export nodes to JSON/Markdown
2. Edit locally
3. node.json_or_markdown_file → COMPLETE REPLACEMENT of all nodes
```

Always start from an on-chain export when available — exact current state beats rebuilding from scratch.

---

## Progress: The Live Workflow Instance

### Machine vs Progress

- **Machine**: Workflow blueprint — defines the topology, permissions, thresholds, and Guards. Shared across all orders.
- **Progress**: Live instance — tracks current node, session state, history. One per order (when Service-bound) or standalone.

### Progress Creation

Two paths: **Service Order** (automatic when Order created on Service with bound Machine) or **Direct Creation** (via `progress_new`). For direct creation, pre-configure via `progress_new` fields on the Machine operation — this sets initial named operators, task binding, and repository list before the first Progress is spawned.

### Execution Paths

- **Order-associated Progress**: When a Forward uses `namedOperator: ""`, the order owner/agents execute via `order` operations.
- **Standalone Progress**: All other cases — advance via direct `progress` operations.

Two-phase operations (`hold`/`unhold`) allow locking resources during multi-step operations; `adminUnhold` force-releases stale locks.

> **Querying**: Progress state via `onchain_objects`, history via `onchain_table` / `onchain_table_item_progress_history`.

### Runtime: Advancing the Workflow

The runtime loop: (1) Query active Forwards via `onchain_objects` (reveals current node + available Pairs/Forwards); (2) Execute Forward → weight accumulates in session, Guard validates (pass/fail), `retained_submission` stores values indexed by `(current_node, next_node, forward_name)`; (3) Threshold met → session commits to history, node transitions, session resets, new Forwards unlocked; (4) Threshold NOT met → session stays open, more Forwards can execute, repeated same Forwards ignored; (5) Competing Pair wins first → other incomplete Pairs abandoned.

**What the user sees**: At any node, callers can discover which Forwards are available (by querying the Machine definition and cross-referencing with their permissions). Executing a Forward that requires a Guard triggers Guard verification — the caller must submit required data. Successful Forward execution is recorded on-chain; failed Guard rejections are visible as transaction errors.

**Session lifecycle**: A session begins when the first Forward executes from a new node. It stays open until threshold is met (closing the session and advancing) or the order completes/aborts. No session timeout — sessions persist until resolved. `hold`/`unhold` lock the session during multi-step external operations; `adminUnhold` force-releases stale locks.

> **Order-associated execution**: Forwards with `namedOperator: ""` are executable via `order` operations by the order owner/agents. All other Forwards use `progress` operations. See [wowok-order](../wowok-order/SKILL.md) for the customer execution flow.

---

## Workflow Design Patterns

### Multi-Path Workflow Example

**MyShop Advanced** — demonstrates branching, dual-signature, and time guards:
```
Shipping → Delivery Complete → Order Complete
    │  ├──→ Wonderful (rating, reward)
    │  ├──→ Order Complete (time guard: ≥10 days, anyone push)
    │  └──→ Lost (threshold: 2, merchant+customer dual-sig)
    │
    └── Delivery Complete → Non-receipt Return (threshold: 2)
                     └──→ Receipt Return (threshold: 2) → Return Fail (time guard)
                                                   └──→ Return Complete
```

### Cross-Machine Supply Chain Composition

Decompose complex workflows into multiple Machines connected by Guard-based validation — avoiding monolithic bloat.

**Sub-Progress Dependency**: Machine A's Forward Guards query Machine B's Progress to verify it has reached a target node before advancing.

**Sub-Order Verification**: Machine A's Forward Guard validates an Order exists on another Service with its Progress at the required state. The sub-order is created independently — the Guard only verifies.

**Multi-Party Chain**: Supplier → Manufacturer → Retailer, each Machine's entry condition verifies upstream completion via Guards querying `retained_submission` values.

**When to decompose** into multiple Machines:
- A sub-process is independently valuable as a standalone Service
- Different participant sets operate in different phases
- The sub-process is reusable across multiple parent workflows

**When to keep in one**:
- Same participants and permission model throughout
- Dense sequential data flow with no clear boundary

**Questions to ask the user**:
1. "Are there phases handled by different teams or services?"
2. "Could any part be offered as a standalone service?"
3. "Does any step depend on an external process completing first?"
4. "Which party creates the sub-order, and which party verifies it?"

> **Guard construction**: Cross-Machine Guards use `convert_witness` with Progress query instructions. Design rules now live in the MCP knowledge layer — see `knowledge/guard-design-patterns.ts` (`GUARD_DESIGN_PATTERNS`), applied via `project_operation.evaluate_project`. Query available Guard instructions via `wowok_buildin_info`.

### Dual-Signature Consensus

Require both customer and merchant to confirm: `threshold=2` with two Forwards (`namedOperator: ""` for customer, `permissionIndex` for merchant), each `weight=1`. Both must execute to advance.

### Privacy (Messenger)

Sensitive data flows through Messenger's end-to-end encryption; only Merkle Root proofs go on-chain. The principle: **who performs the action submits the proof**.

> **Full Guide**: See [wowok-messenger](../wowok-messenger/SKILL.md) for WTS evidence generation.

---

## Common Pitfalls

### Mutability Traps

All stem from the same root: **every on-chain object has a publish/create freeze point**. See [Guard + Machine Immutability Deadlock](#guard--machine-immutability-deadlock). Key rules:
- Never publish before all Guards are created, tested, and bound.
- `clear` is irreversible — export via `machineNode2file` first.

### Pre-Publish Validation Checklist

Before `publish: true`, verify:

- [ ] **Entry point exists**: at least one Pair with `prev_node: ""` — workflow cannot start otherwise
- [ ] **Every node has outgoing Forwards** (except terminals): no dead-end nodes
- [ ] **Every node has incoming Pair** (except entry): no orphaned nodes
- [ ] **All thresholds independently achievable**: no dead branches (competing Pair always wins first)
- [ ] All Guards exist on-chain and tested (use `gen_passport`)
- [ ] `namedOperator` vs `permissionIndex` correct per Forward
- [ ] Every Forward has at least one of `namedOperator` or `permissionIndex`
- [ ] Terminal nodes mapped to Allocator entries for fund distribution
- [ ] Tested end-to-end on testnet via a test Progress
- [ ] Current state exported via `machineNode2file` as backup

**Always test on testnet before mainnet** — Machines are immutable after publish.

---

## Guard + Machine Immutability Deadlock

Both Guards and published Machines are **immutable**. A Guard created with a bug cannot be fixed (immutable) → must create new Guard → must rebind to Machine → but Machine already published cannot be modified (immutable) → **DEADLOCK**: new Guard exists but cannot be attached.

**Prevention**: Test every Guard via `gen_passport` before binding. Verify computation tree, submission types, and query instructions against all scenarios.

**If deadlocked**: Only recovery is a completely new Machine with new nodes and Guard bindings, then rebind to Service. Keep Machines unpublished until all Guards are verified.

---