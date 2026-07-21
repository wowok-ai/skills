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
> **Related Skills**: [wowok-guard](../wowok-guard/SKILL.md) (Guards), [wowok-provider](../wowok-provider/SKILL.md) (Service binding), [wowok-order](../wowok-order/SKILL.md) (customer perspective), [wowok-messenger](../wowok-messenger/SKILL.md) (privacy), [wowok-safety](../wowok-safety/SKILL.md) (safety), [wowok-tools](../wowok-tools/SKILL.md) (schema reference)

---

## Core Concepts

**Machine** = workflow blueprint (directed graph of Nodes → Pairs → Forwards). **Progress** = live workflow instance, one per order.

Machines are **immutable after `publish: true`**; Guards are **CREATE-only**. Design the complete workflow before publishing.

## Semantic Layer (Knowledge Modules)

The Machine knowledge system provides 8 TypeScript modules that encode the canonical design knowledge for Machine generation. These modules power the L4 Harness Plan Loop and are the **source of truth** for scene/template selection, pattern matching, risk evaluation, topology analysis, and the fail-closed publish gate.

> **Design reference**: [Machine Design Reference](../references/machine-design-reference.md) — covering architecture, core elements, puzzle model, translation patterns, risk rules, and publish flow. Verification notes (06 §14) are embedded in code as `MACHINE_VERIFICATION_NOTES`.

### Module API Reference

| Module | Entry Points | Purpose |
|--------|--------------|---------|
| `machine-ledger.ts` | `MACHINE_SCENES`, `inferSceneFromFlow(flow)`, `findScene(id)` | 10 industry scenes + keyword-based scene inference |
| `machine-templates.ts` | `MACHINE_TEMPLATES`, `getTemplateById(id)`, `fillTemplate(id, params)`, `forkTemplate(id, overrides)`, `walkDecisionTree(answers)` | 10 starter templates + parameter fill + Q1-Q9 decision tree |
| `machine-translation.ts` | `SEMANTIC_TO_MACHINE_RULES`, `MACHINE_CONSTRAINT_RULES`, `matchSemanticPattern(text)`, `identifyExecutionMode(threshold, fwdCount)`, `identifyTopology(pairs)`, `explainForwardPermission(fwd)` | 12 semantic patterns + 28 on-chain constraints (creation/structure/node_operation/publish/runtime) |
| `machine-topology.ts` | `analyzeTopology(nodes, pairs)`, `identifyTopologyPattern(topology)`, `formatTopologySummary(topology)`, `MAX_NODE_COUNT=200`, `MAX_NODE_PAIR_COUNT=40`, `MAX_FORWARD_COUNT=20` | DAG analysis: entry/terminal/orphaned/dead-branch/cycle, on-chain limit checks |
| `machine-risk.ts` | `MACHINE_RISK_RULES` (39 rules), `assessMachineRisks(machine, ctx)`, `getRiskRulesByCategory(cat)`, `getRiskSummary(assessment)` | 5 risk dimensions (R-M1 structural, R-M2 guard, R-M3 permission, R-M4 immutability, R-M5 environment) |
| `machine-puzzle.ts` | `initPuzzleFromIntent(intent)`, `initPuzzleFromTemplate(id)`, `checkPuzzleCompleteness(puzzle)`, `recommendNextStep(puzzle)`, `derivePuzzleFromMachineJson(json)`, `generateConfirmationText(puzzle)` | 8-dimension information model (A-H): business_flow, node_design, guard_acceptance, permission_model, threshold_weight, branch_topology, overall_objective, risk_assessment |
| `machine-confirm.ts` | `PUBLISH_CHECKLIST` (10 items C-01..C-10), `CONFIRMATION_QUESTIONS` (6 items Q1-Q6), `runStaticChecklist(machine)`, `integrateRiskAssessment(machine, ctx)`, `parseUserConfirmation(input)`, `verifyEnvironment(machine, ctx, isMainnet)`, `confirmPublish(machine, ctx, isMainnet, userInput)`, `progressiveCheck(machine, scope)`, `overrideBlockWithReason(result, reason)`, `generateFullConfirmationText(...)` | 4-layer fail-closed gate: checklist → risk → user → environment. **CRITICAL risks cannot be overridden.** |
| `machine-context.ts` | `injectMachineContext(intent, mode, options)`, `suggestWorkflow(intent)`, `buildPromptFromContext(bundle)`, `getMachineKnowledgeSnapshot()`, `getRelatedGuardScenes(sceneId)`, `getVerificationNotes(mode?)`, `CONTEXT_PRESETS.{newUserIntent, midDesignReview, prePublishFull, crossMachine, guardIntegration, allocationIntegration}` | Aggregator module. **8 injection modes** select curated subset of knowledge based on user task. Use this as the main entry point. |

### The 8 Context Injection Modes

The user's current task determines what context to surface (never dump everything):

| Mode | When to Use | What It Surfaces |
|------|-------------|------------------|
| `initial_design` | User just described intent | Matched scene + top 3 templates + initial puzzle |
| `mid_design_review` | User is mid-design | Missing puzzle dimensions + structure/node_op constraints |
| `pre_publish_check` | User about to publish | Full risk assessment + progressive checklist (R5 subset) + verification notes |
| `post_publish_runtime` | Machine already published | Runtime-only constraints + environment risks |
| `intent_match` | Lightweight intent inference | Top 2 templates + creation constraints (no verification notes) |
| `cross_machine` | Cross-Machine dependency design | P-M-CROSS-MACHINE pattern + structure/publish constraints |
| `guard_integration` | Deep-dive on Guard binding | Guard bridge to `guard-ledger.ts` + R-M2 risks |
| `allocation_integration` | Deep-dive on Allocator at terminals | P-M-ALLOCATION-INTEGRATED pattern + Allocator-related risks |

### Recommended Usage Pattern

```typescript
// 1. First user message — lightweight workflow suggestion
const suggestion = suggestWorkflow(userIntent);
// suggestion.matched_scene, suggestion.suggested_templates, suggestion.initial_puzzle, suggestion.next_step

// 2. Mid-design — inject context to surface missing info
const bundle = injectMachineContext(intent, 'mid_design_review', { existing_puzzle: puzzle });

// 3. Pre-publish — full ConfirmGate
const gate = confirmPublish(machineJson, projectContext, isMainnet, userConfirmationInput);
if (gate.status !== 'approved') {
    // STOP — do not call onchain_operations with publish: true
    console.log(gate.block_reason);
}

// 4. Or use the preset wrapper for common cases
const preset = CONTEXT_PRESETS.prePublishFull(intent, machineJson, projectContext);
const prompt = buildPromptFromContext(preset);  // inject into AI prompt
```

### Verification Notes (06 §14)

Five topics were verified at the code level. These notes are embedded in `MACHINE_VERIFICATION_NOTES` and surfaced whenever the consumer's mode touches them:

| Topic | Judgment | Verified Semantic |
|-------|----------|-------------------|
| `bReplace` | YES | Acts at pairs-list level of an existing node (NOT whole-Machine). `false`=merge, `true`=replace that node's pairs list. |
| `um` | PARTIAL | Messenger Contact reference (off-chain metadata). Omitting has zero on-chain impact. |
| `consensus_repositories` | PARTIAL | Declarative-only field. Not consumed by on-chain flow. Hint for off-chain tooling. |
| `namedOperator_assignment` | PARTIAL | Move `progress::new` does NOT accept namedOperator. MCP/SDK translates to separate `namedOperator_add` tx (permission index 221). |
| `cross_machine_dependency` | PARTIAL | Indirect via `progress::new -> assert_published`. Use `convert_witness` TypeOrderProgress (100) / TypeOrderProgressSession (103). |

> **Test coverage**: 8 `.spec.ts` files covering machine-ledger, machine-templates, machine-translation, machine-topology, machine-risk, machine-puzzle, machine-confirm, and machine-context — over 400 tests, all passing.

---

## Machine Architecture

```
Machine
└── Nodes
    └── Pairs
        ├── prev_node: which prior node ("" = entry point, multiple allowed)
        ├── threshold: required total forward weight to advance
        └── Forwards (MachineForward)
            ├── name, weight
            ├── permissionIndex | namedOperator: who can execute
            └── guard (optional): condition that must pass
```

> **Schema**: `wowok({ tool: "schema_query", data: { action: "get", name: "onchain_operations_machine" } })` — all field types, limits, valid values. This document focuses on design decisions **not captured** by the schema.

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

> **Guard construction**: See [wowok-guard](../wowok-guard/SKILL.md) for table design, computation trees, and query instructions.

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

Build in this exact order:

```
1. Permission (CREATE/MODIFY) → access control foundation
2. Machine (CREATE, unpublished) → define all nodes
3. Guards (CREATE) → build validation conditions
4. Bind Guards to Forwards (MODIFY Machine) → set `guard` on each Forward; all operations (`add`, `set`, `add forward`) accept full `MachineForward` including `guard` + `retained_submission`
5. Publish Machine → nodes IMMUTABLE
6. Bind Machine to Service → workflow goes live
```

**Why this order matters**: Publishing locks the Machine. Guards are immutable. Publishing before Guards are ready means Guards can never be added — the Machine is frozen without validation rules. **Create Guards, test them, then publish.**

### Node Operations (Pre-Publish Only)

Nine operations are available via the `node` field. Query schema for full parameters. Key design notes not captured by schema:

- `add` / `set` with `bReplace: false` (default) **merges** into existing nodes; `true` replaces all.
- `clear` is **irreversible** — instant wipe with no undo. Export via `machineNode2file` first.
- `exchange` swaps two node positions without delete/recreate. `rename` auto-updates all Pair references.
- `add forward` supports the full `MachineForward` structure including `guard` with `retained_submission`.

> **Schema**: `wowok({ tool: "schema_query", data: { action: "get", name: "onchain_operations_machine" } })` for full operation parameters.

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

> **Querying**: Progress state via `onchain_objects`, history via `onchain_table` / `onchain_table_item_progress_history`. Schema: `wowok({ tool: "schema_query", data: { action: "get", name: "onchain_table_data" } })`.

### Runtime: Advancing the Workflow

The runtime loop (schema: `onchain_operations` with `operation_type: "progress"` or `"order"`):

```
1. Query active Forwards → onchain_objects reveals current node name and available Pairs/Forwards
2. Execute Forward → weight accumulates in session; Guard validates (pass/fail);
                    retained_submission stores values indexed by (current_node, next_node, forward_name)
3. Threshold met → session commits to history (all completed Forwards recorded);
                    node transitions; session resets; new Forwards unlocked
4. OR threshold NOT met → session stays open; more Forwards can execute in same session;
                          weight from repeated same Forwards ignored
5. OR competing Pair wins first → other incomplete Pairs abandoned; next session starts on winner node
```

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

> **Guard construction**: Cross-Machine Guards use `convert_witness` with Progress query instructions. See [wowok-guard](../wowok-guard/SKILL.md). Query available Guard instructions via `wowok_buildin_info`.

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

Both Guards and published Machines are **immutable**:

```
Guard created with bug → Cannot fix (immutable)
  → Must create new Guard
    → Must rebind to Machine
      → Machine already published? Cannot modify (immutable)
        → DEADLOCK: new Guard exists but cannot be attached
```

**Prevention**: Test every Guard via `gen_passport` before binding. Verify computation tree, submission types, and query instructions against all scenarios.

**If deadlocked**: Only recovery is a completely new Machine with new nodes and Guard bindings, then rebind to Service. Keep Machines unpublished until all Guards are verified.

---

## Appendices (Progressive Disclosure)

> The following sections have been extracted to [APPENDIX.md](./APPENDIX.md) for on-demand loading:
> - Dialogue Scripts / Onboarding Flow (R1-R10) — guided conversation scripts
> - Decision Trees — branching logic reference
> - Failure Playbooks — recovery scenarios
> - Tier Layering — expertise-tier based guidance
>
> Load APPENDIX.md when the user needs guided dialogue, recovery help, or tier-specific guidance.