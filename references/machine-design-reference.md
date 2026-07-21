# Machine Design Reference

> Consolidated design reference covering Machine architecture, core elements, puzzle model, translation patterns, risk rules, and publish flow.

---

## 1. Architecture Overview

### Core Concept

A **Machine** is a **directed graph** (allows cycles): Node set + NodePair migration rules + Forward permissions and guards = a uniquely executable workflow blueprint.

**Cycles are allowed** (e.g., rework → re-ship → re-inspect). Each cycle MUST have a reachable exit condition via competing Pair (first-threshold-wins), time-lock Guard, or externally triggered Forward.

### Three-Layer Reversibility

```
[Business Process] ←→ [Semantic Puzzle (8D)] ←→ [Executable Machine JSON] ←→ [On-chain Machine]
    natural language       8 dimensions             nodes+pairs+forwards+guards    immutable object
```

1. **Semantic ↔ JSON**: N Patterns forward-generate JSON; field rules reverse-interpret JSON
2. **JSON ↔ Machine**: CREATE on-chain; machineNode2file reverse-exports JSON
3. **Business ↔ Semantic**: 8D puzzle forward-completes; confirmation text reverse-traces intent

### Two Flow Separation

| Dimension | Provider (Design-Time) | Customer/Order (Run-Time) |
|-----------|----------------------|--------------------------|
| Party | Service provider / workflow designer | Customer / buyer |
| Core objects | Permission, Service(draft), Machine(draft), Guard, Allocation | Order, Progress, Payment |
| Lifecycle | Create → configure → audit → publish (irreversible) | Order → fulfill → settle → complete/arbitrate |
| Progress role | **NOT a design-time object** | **Core**: each Order gets one Progress instance |
| Trigger | Provider actively builds | Customer order auto-spawns Progress via Service+Machine |

### Key Differences from Guard

| Dimension | Guard | Machine |
|-----------|-------|---------|
| Nature | Data computation tree (bool root) | Directed graph (nodes + migration, cycles allowed) |
| Mutability | CREATE-only (immutable) | Mutable before publish, frozen after |
| Risk types | Reentrancy / forgery / logic gaps | Structural integrity / cycle exit / Guard integration / permission博弈 / immutability |
| Confirmation | 1 confirmation before CREATE | 100% confirmation before publish (irreversible) |
| Puzzle dimensions | 6 (A-F) | 8 (A-H) |

### M1-M5 Sub-Process (Machine Design Lifecycle)

| Step | Phase | Description |
|------|-------|-------------|
| **M1** | Flow & Node Design | Extract business process, design nodes (entry/normal/terminal/branch), Pair + threshold, Forward + permissions |
| **M2** | Machine Creation (unpublished) | `onchain_operations(machine) CREATE publish:false`, verify node/forward completeness |
| **M3** | Guard Creation & Binding | Guard design (table + root tree), CREATE Guard, `gen_passport` static test, MODIFY Machine to bind Guards to Forwards |
| **M4** | Pre-Publish Audit | 8D puzzle completeness, 5D risk assessment, topology analysis, on-chain limit checks, machineNode2file backup, independent Progress test |
| **M5** | Publish & Bind Service | User explicit confirmation, `publish:true` (nodes frozen), bind Machine to Service, publish Service |

**Anti-patterns**: Publishing Machine before creating Guards (Machine frozen, can't bind); binding Guards without testing; using Order test for pre-publish validation (Service not yet published).

### 5 Participation Modes

| Mode | ID | Description |
|------|----|-------------|
| Reference | P-M1 | Import existing published Machine via ID, modify, publish new |
| Composition | P-M2 | Merge multiple Machine fragments into one complete Machine |
| Cross-Machine | P-M3 | Machine A's Forward Guard queries Machine B's Progress |
| Description | P-M4 | Natural language business process → translated to Machine |
| Fork-Modify | P-M5 | Export Machine by ID to JSON, user edits, publish as new |

### 8 Semantic Modules

| Module | File | Responsibility |
|--------|------|---------------|
| Info Puzzle | `machine-puzzle.ts` | 8D structured modeling + completeness check + confirmation text |
| Scenario Ledger | `machine-ledger.ts` | N scene recognition + scene-specific constraints |
| Translation | `machine-translation.ts` | Semantic ↔ JSON bidirectional mapping + constraint rules |
| Topology Analysis | `machine-topology.ts` | Graph analysis + cycle detection + main/sub-branch identification |
| Risk Assessment | `machine-risk.ts` | 5D risk rules (structural/Guard/permission/immutability/environment) |
| Template Library | `machine-templates.ts` | N parameterized scene templates |
| Context Awareness | `machine-context.ts` | Project object dependency table + integration analysis |
| Confirmation Gate | `machine-confirm.ts` | 100% user confirmation before publish |

---

## 2. Core Element Types and Rule System

### 4-Layer Nested Structure

```
Machine
  └── Node × N
       └── NodePair × M
            ├── prev_node: String       — previous node name ("" = entry)
            ├── threshold: U32          — migration threshold
            └── Forward × K
                 ├── name: String
                 ├── namedOperator: Option<String>     — permission type 1
                 ├── permissionIndex: Option<U16>      — permission type 2
                 ├── weight: U16                       — contribution weight
                 └── guard: Option<ForwardGuard>
                      ├── guard: String                — Guard object ID
                      └── retained_submission: Vec<U8> — submission retention indices
```

### Key On-Chain Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_NODE_COUNT` | 200 (chain) / 100 (SDK) | Max nodes; SDK uses stricter 100 |
| `MAX_NODE_PAIR_COUNT` | 40 | Max pairs per node |
| `MAX_FORWARD_COUNT` | 20 | Max forwards per pair |
| `MAX_FORWARD_ORDER_COUNT` | 20 | Max retained_submission indices |
| `USER_DEFINED_PERM_INDEX_START` | 1000 | Custom permission indices start here |

### Immutability Constraints

- `publish:true` is irreversible (false → true only)
- After publish: all 9 node operations (add/set/remove/clear/exchange/rename/remove prior node/add forward/remove forward) fail with `E_ALREADY_PUBLISHED`
- `description`, `consensus_repositories`, `bPaused`, `um`, `permission` remain modifiable after publish

### Node Semantic Roles

| Role | Condition | Meaning |
|------|-----------|---------|
| Entry | At least one Pair with `prev_node == ""` | Flow start point |
| Normal | Has incoming Pair AND outgoing Pair | Intermediate node |
| Terminal | No outgoing Pairs (empty pairs) | Flow endpoint |
| Branch | Multiple Pairs pointing to different next_node | Decision point |
| Merge | Multiple Pairs' next_node points to same node | Merge point |

### Threshold Semantics

| Pattern | threshold | Forward weight | Meaning |
|---------|-----------|---------------|---------|
| Sequential | 1 | 1 | Single executor, execute = migrate |
| Parallel AND | N | 1 (×N) | All N parties must execute |
| Parallel OR | 1 | 1 (multiple Pairs) | Any party executes (competing) |
| Weighted Voting | 100 | 60+40 | Unequal weight voting |
| Hybrid | 5 | 3+1+1 | Key party required, others optional |

### 3 Permission Types

| Type | Field | Scope | When to Use |
|------|-------|-------|-------------|
| Permission | `permissionIndex` | Organization | Internal staff (warehouse/admin/platform) — shared across orders |
| NamedOperator | `namedOperator` | Per-order | Role varies per order (deliverer/reviewer/agent) |
| OrderHolder | `namedOperator: ""` | Order holder | Customer (order owner and agents) |

**Iron Law**: Every Forward must have at least one permission type. `permissionIndex` must be ≥ 1000 (chain-enforced).

### 9 Node Operations

| # | Operation | Description |
|---|-----------|-------------|
| 1 | `add` | Add node(s); `bReplace:true` = replace, `bReplace:false` = merge |
| 2 | `set` | Set node (similar to add, clearer semantics) |
| 3 | `remove` | Remove node; invalidates referencing Pairs |
| 4 | `clear` | Clear all nodes (irreversible data loss; backup first) |
| 5 | `exchange` | Swap two nodes' positions |
| 6 | `rename` | Rename node; auto-updates all prev_node references |
| 7 | `remove prior node` | Remove specific prev_node from a node's Pairs |
| 8 | `add forward` | Add Forward to a specific Pair |
| 9 | `remove forward` | Remove Forward from a specific Pair |

---

## 3. Information Puzzle Model (8 Dimensions)

> Building a Machine requires completing 8 dimensions of information. AI acts as strategic advisor.

| Dim | Name | Sub-process | Info |
|-----|------|------------|------|
| **A** | Business Flow | M1 | Main flow node sequence + business semantics (cycle annotations) |
| **B** | Node Design | M1 | Each node's name + semantic role (entry/normal/terminal/branch) |
| **C** | Guard Acceptance | M3 | Each Forward's Guard binding + retained_submission |
| **D** | Permission Model | M1 | Each Forward's namedOperator/permissionIndex/OrderHolder |
| **E** | Threshold & Weight | M1 | Each Pair's threshold + each Forward's weight |
| **F** | Branch Topology | M1 | Main/sub-branch / competing Pairs / cycle exit / graph connectivity |
| **G** | Overall Objective | M4 | Allocation/reward/arbitration integration + Service context |
| **H** | Risk Assessment | M4 | 5D risk (structural/Guard/permission/immutability/environment) |

### Completeness Check

Each dimension has an `isComplete()` function. The overall `checkMachinePuzzleCompleteness()` returns which dimensions are missing and recommends the next step.

### 5 Participation Mode Initialization

- **P-M1 (Reference)**: `initPuzzleFromMachineId(machineId)` → machineNode2file → derivePuzzleFromMachineJson
- **P-M2 (Composition)**: `initPuzzleFromFragments(fragments)` → merge fragments → resolve conflicts → validate connectivity
- **P-M3 (Cross-Machine)**: `initPuzzleForCrossChain(machineBId)` → identify Progress query points → Guard design with convert_witness
- **P-M4 (Description)**: `initPuzzleFromIntent(description)` → match scene → recommend Pattern → initialize dimension A
- **P-M5 (Fork-Modify)**: `initPuzzleForForkModify(machineId)` → export JSON → derive puzzle → wait for user changes

### Reverse Derivation

`derivePuzzleFromMachineJson(json)` → reconstructs all 8 dimensions from existing Machine JSON.

---

## 4. Translation Rules and Patterns

### Direction A: Business Semantics → Machine JSON (12 Patterns)

**Execution Patterns (5)**:

| Pattern | ID | Intent | Threshold | Weight |
|---------|----|--------|-----------|--------|
| Sequential | P-M-SEQ | Single executor, step by step | 1 | 1 |
| Parallel AND | P-M-AND | All parties must execute (dual-sig) | N | 1×N |
| Parallel OR | P-M-OR | Any party executes (competing) | 1 per Pair | 1 |
| Weighted Voting | P-M-VOTE | Weighted vote to reach threshold | 100 | e.g., 60+40 |
| Hybrid | P-M-HYBRID | Key party required + optional | 5 | 3+1+1 |

**Topology Patterns (3)**: P-M-LINEAR (linear), P-M-FORKMERGE (fork & merge), P-M-COMPETING (competing exclusive branches)

**Permission Patterns (2)**: P-M-PERM-SINGLE (single permission type), P-M-PERM-MIXED (either namedOperator or permissionIndex)

**Integration Patterns (2)**: P-M-CROSS-MACHINE (cross-Machine dependency), P-M-ALLOCATION-INTEGRATED (fund allocation integration)

### Direction B: Machine JSON → Business Semantics

Field explanation rules for all node/pair/forward/guard fields. Node role identification (entry/terminal/normal/branch/merge). Execution pattern reverse-identification from JSON features.

### Constraint Rules (29 total)

| Category | Count | Scope |
|----------|-------|-------|
| Creation (MC-C) | 19 | Node count, pair count, forward count, name uniqueness, permission validity, Guard existence, etc. |
| Structure (MC-S) | 5 | Entry point, terminal, no orphan nodes, no dead branches, no cycles |
| Publish (MC-P) | 5 | Guards tested, backup exported, testnet validation, user confirmation, Service exists |
| Runtime (MC-R) | 3 | Post-publish immutability, session accumulation, competing Pair first-wins |

---

## 5. Risk Assessment Rules (40 Rules, 5 Dimensions)

### R-M1: Structural Integrity (10 rules)

| ID | Risk | Severity | Description |
|----|------|----------|-------------|
| R-M1-01 | No entry point | CRITICAL | No Pair with `prev_node == ""` |
| R-M1-02 | No terminal node | CRITICAL | No node with empty outgoing Pairs |
| R-M1-03 | Dead-end node | MEDIUM | Non-terminal node with no outgoing Pair |
| R-M1-04 | Orphan node | HIGH | Non-entry node with no incoming Pair |
| R-M1-05 | Dead branch | HIGH | Competing Pair threshold never achievable |
| R-M1-06 | Cycle reference | CRITICAL | Internal cycle via DFS detection |
| R-M1-07 | Node count exceeded | CRITICAL | `nodes.length > MAX_NODE_COUNT_SDK(100)` |
| R-M1-08 | Pair count exceeded | HIGH | Single node `pairs.length > 40` |
| R-M1-09 | Forward count exceeded | HIGH | Single Pair `forwards.length > 20` |
| R-M1-10 | Duplicate node name | CRITICAL | Multiple nodes with same name |

### R-M2: Guard Integration (8 rules)

| ID | Risk | Severity | Description |
|----|------|----------|-------------|
| R-M2-01 | Guard not created | CRITICAL | Referenced Guard object doesn't exist |
| R-M2-02 | Guard not tested | HIGH | Guard not verified via gen_passport |
| R-M2-03 | Guard+Machine deadlock | CRITICAL | Bug found after both are immutable |
| R-M2-04 | retained_submission mismatch | HIGH | Index doesn't match Guard table b_submission=true |
| R-M2-05 | Guard reentrancy | HIGH | Missing anti-reentry mechanism |
| R-M2-06 | Guard scene mismatch | MEDIUM | Guard scene doesn't match Forward purpose |
| R-M2-07 | Cross-Machine cycle | CRITICAL | A depends on B, B depends on A |
| R-M2-08 | Guard references unpublished object | HIGH | Guard table references unpublished object |

### R-M3: Permission博弈 (8 rules)

| ID | Risk | Severity | Description |
|----|------|----------|-------------|
| R-M3-01 | Forward has no permission | CRITICAL | Both namedOperator and permissionIndex are null |
| R-M3-02 | permissionIndex out of bounds | CRITICAL | `>= Permission.indices.length` |
| R-M3-03 | Permission rotation | HIGH | indices reordered after Permission update |
| R-M3-04 | OrderHolder misuse | MEDIUM | `namedOperator: ""` on non-customer operation |
| R-M3-05 | NamedOperator not assigned | HIGH | Progress created without namedOperator values |
| R-M3-06 | Imbalanced permission博弈 | MEDIUM | Single party can unilaterally advance |
| R-M3-07 | Mixed permission OR misuse | MEDIUM | Both permissions set, OR semantics misunderstood |
| R-M3-08 | permissionIndex < 1000 | CRITICAL | Uses system-reserved index range |

### R-M4: Immutability & Publish (6 rules)

| ID | Risk | Severity | Description |
|----|------|----------|-------------|
| R-M4-01 | No backup before publish | HIGH | machineNode2file not executed |
| R-M4-02 | No testnet validation | MEDIUM | Direct mainnet publish without testnet test |
| R-M4-03 | Guard not all created | CRITICAL | Some required Guards still null |
| R-M4-04 | Wrong publish order | CRITICAL | Published Machine before creating Guards |
| R-M4-05 | Allocation not configured | MEDIUM | Terminal nodes not mapped to Allocator |
| R-M4-06 | No backup before clear | HIGH | `clear` operation without machineNode2file |

### R-M5: Environment Awareness (8 rules)

| ID | Risk | Severity | Description |
|----|------|----------|-------------|
| R-M5-01 | Service not created | HIGH | No Service object for Machine to bind |
| R-M5-02 | Permission mismatch | HIGH | Machine and Service use different Permission |
| R-M5-03 | Allocation incomplete | HIGH | order_allocators not configured |
| R-M5-04 | Reward not created | MEDIUM | Reward object missing |
| R-M5-05 | Arbitration not created | MEDIUM | Arbitration object missing |
| R-M5-06 | Cross-Machine not published | CRITICAL | Machine B (dependency) not published |
| R-M5-07 | Repository not created | MEDIUM | Guard-referenced Repository missing |
| R-M5-08 | Incomplete dependency table | LOW | Missing objects in project scan |

### Risk Level & Publish Decision

| Overall Risk | Decision | User Confirmation |
|-------------|----------|-------------------|
| CRITICAL | ❌ Block | Must fix all critical |
| HIGH | ⚠️ Warn | User acknowledges risk |
| MEDIUM | ✅ Allow | Informational |
| LOW | ✅ Allow | No confirmation needed |

### Auto-Fixable Rules

| Risk ID | Auto-Fix | Method |
|---------|----------|--------|
| R-M2-04 | ✅ | Auto-correct retained_submission indices |
| R-M4-01 | ✅ | Auto-execute machineNode2file |
| R-M4-06 | ✅ | Auto-export backup before clear |

---

## 6. User Confirmation & Publish Flow

### 4-Layer ConfirmGate Architecture

```
Layer 1: Static Checklist (11 hard constraints)
  → topology, permission, Guard binding, on-chain limits, Allocator
  ↓ [Pass?]
Layer 2: Risk Assessment (40 rules, 5 dimensions)
  → identify blocking risks
  ↓ [No CRITICAL/HIGH?]
Layer 3: User Confirmation Dialog
  → 6 questions (Q1-Q6), all must be "Yes"
  ↓ [User approves?]
Layer 4: Environment Verification
  → testnet test mandatory for mainnet, dependency check, gas estimation
  ↓ [All green?]
EXECUTE: onchain_operations publish: true
```

### 11 Static Checklist Items (C-01 to C-11)

| ID | Check | Description |
|----|-------|-------------|
| C-01 | Entry point exists | At least one Pair with `prev_node=""` |
| C-02 | Outgoing Forwards | Every non-terminal node has outgoing Pairs |
| C-03 | Incoming Pairs | Every non-entry node has incoming Pair |
| C-04 | Thresholds achievable | No dead branches (competing Pair always loses) |
| C-05 | Guards exist on-chain | All referenced Guard addresses are valid |
| C-06 | Forward permissions correct | Each Forward has namedOperator or permissionIndex |
| C-07 | On-chain limits respected | `MAX_NODE_COUNT_SDK=100`, `MAX_NODE_PAIR_COUNT=40`, `MAX_FORWARD_COUNT=20`, `MAX_FORWARD_ORDER_COUNT=20` |
| C-08 | Terminal → Allocator mapping | Terminal nodes mapped for fund distribution |
| C-09 | Testnet test passed | End-to-end test on testnet (mandatory for mainnet) |
| C-10 | machineNode2file backup | Current state exported before publish |
| C-11 | permissionIndex ≥ 1000 | Custom permission indices respect `USER_DEFINED_PERM_INDEX_START` |

### User Confirmation Questions (Q1-Q6)

1. Reviewed topology and confirmed all nodes/forwards are correct?
2. Tested on TESTNET with a successful Progress run?
3. All Guards created, bound, and verified via gen_passport?
4. All Allocators configured for terminal nodes?
5. Acknowledge publishing is IRREVERSIBLE and gas will be consumed?
6. Proceed with publishing NOW?

### Override Mechanism

- **HIGH risks**: Override allowed with explicit reason (for audit trail)
- **CRITICAL risks**: Override NOT allowed — must fix
- **Other statuses**: No override

### Testnet-First Policy

**All projects must test on testnet before mainnet deployment**:
- Testnet: free gas, repeatable, discardable
- Mainnet: real gas, irreversible, errors require new Machine
- Same JSON config for both networks (only `env.network` differs)
- `replaceExistName: true` ensures repeatable execution

### Key Design Decisions

1. **Fail-closed**: Default deny; all checks pass + user confirmation = proceed
2. **4 layers (not 3)**: Static checklist + Risk + User + Environment — no blind spots
3. **Testnet mandatory for mainnet**: Low test cost vs. extremely high mainnet fix cost
4. **CRITICAL risks never overridable**: Some risks (funds, reentrancy, Guard binding) are absolute blockers
5. **C-07 uses SDK limit (100) not chain limit (200)**: Ensures human-reviewable Machine size
6. **C-11 enforces 1000 boundary**: Prevents confusion between built-in (0-999) and custom (≥1000) permission indices

---

## 7. Additional Design Principles

1. **Deterministic-first**: All rules are deterministic rule tables and algorithms, not AI "understanding"
2. **Reversibility guarantee**: Semantic ↔ JSON ↔ On-chain, each layer has forward generation and reverse explanation
3. **Context awareness**: Machine design must perceive Service/Permission/Guard/Allocation/Reward objects
4. **Irreversibility protection**: 100% user confirmation before publish, ConfirmGate fail-closed
5. **Object dependency order**: Machine(unpublished) → Guard(references Machine) → bind Forward → publish
6. **Cycle-friendly**: Directed graph (not DAG), cycles allowed but each must have reachable exit condition
7. **Complete deployment file**: Each project delivers a unified execution manual (testnet + mainnet) with `replaceExistName: true`
8. **Post-publish testing cannot replace pre-publish audit**: Core fields are frozen after publish