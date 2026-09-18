---
name: wowok-machine
description: "WoWok Machine Workflow Design — design, build and operate workflow templates (Machines): directed graphs that define how orders progress through stages, who can advance them, and what conditions must be met at each step. Covers Nodes/Pairs/Forwards/Guards/Thresholds, lifecycle (create, configure, publish, pause), node and forward operations, Progress integration, cross-Machine supply chains via Guard verification, and machineNode2file import/export. Use when: User wants to create or modify a Machine workflow; User asks about workflow steps, state transitions, or progress; User needs to design order processing pipelines; User mentions \"machine\", \"workflow\", \"progress\", \"state machine\", \"pipeline\"; User wants to export/import Machine nodes via a file; User needs threshold mechanics, forward permissions, or guard bindings."
metadata:
  version: "2.1.0"
  role: provider
  related: "wowok-provider"
---

# WoWok Machine Workflow Design

> **Role**: Service Provider or Workflow Designer
> **Main tool**: `onchain_operations` operation_type=`machine` (schema file `onchain_operations_machine`)
> **Related**: [wowok-provider](../wowok-provider/SKILL.md) (Service binding) · [wowok-order](../wowok-order/SKILL.md) (execution) · [wowok-messenger](../wowok-messenger/SKILL.md) (privacy)

---

## What the MCP already handles

- Node topology validation (entry forward required, malformed pairs) at schema + publish time; risk aggregation via `goal_operation` action=`aggregate_risks`, incl. the R-M1-11 refund-terminal rule.
- Guard design patterns / Guard instructions / safety rules: `schema_query` actions `get_guard_design_patterns`, `get_safety_rules` (instructions list also via `wowok_buildin_info`).
- Industry default shapes: `industry_pack_operation` action=`list_modes` (e.g. the `rental` mode ships an R-M1-11-compliant topology).
- **Runtime execution routing**: `query_toolkit` query_type=`participation_radar` → `operable[].recommended_call` picks the exact tool/path for the signing account. Designers still need the identity model below; executors do not hand-route.

This skill keeps design conversation, topology patterns, and the lifecycle discipline.

---

## Model

- **Machine** = blueprint. Node-centric encoding: each Node `{name, pairs: [{prev_node, threshold, forwards[]}]}` declares how work ENTERS it. `prev_node: ""` = entry pair (Progress starts at current node `""`). A `prev_node` must be unique within one node's pairs (`E_DUPLICATE_NODE_PREV` = 7); several different first nodes may each declare an entry pair.
- **Forward** = `{name, weight, namedOperator | permissionIndex (≥1 required), guard?}`. String shorthand `"g"` or object `{guard:"g", retained_submission:[1,2]}`.
- **Progress** = one live instance per order (auto-created by `order_new` on a Service with a bound Machine) or standalone via machine data `progress_new: {task?, repository?, progress_namedOperator?, namedNew?}`.
- **Freeze points**: a published Machine's nodes/pairs/forwards are immutable (`publish:true` also gates Service binding). A Guard is immutable **from creation** — a flawed Guard can never be edited, only replaced.
- `pause: true` stops NEW Progress being generated from the Machine; it does not freeze existing instances.

## Forward identity model (design-time)

| Binding | Shared across instances | Typical operator |
|---|---|---|
| `permissionIndex` (custom index ≥1000 recommended) | Yes — same role for every order | Internal staff, platform ops |
| `namedOperator: "<role>"` | No — addresses assigned per Progress namespace | Delivery person, reviewer, agent |
| `namedOperator: ""` | Order-scoped wildcard | The order owner + order agents |

Both may be set (executor needs EITHER). At runtime the radar resolves the path per account: order-holder wildcard → `onchain_operations` operation_type=`order` `data.progress` (calling the Progress entrypoint directly aborts permission#5); permission index / named role → `workflow_operation` action=`operate`. Do not put this routing table in application code — read `recommended_call`.

Every custom `permissionIndex` used MUST be granted in the bound Permission (`permission` op `add perm by index`) before publish. An ungranted index means the forward can never execute — Progress stuck forever; the handler warns, but the design review must catch it.

## Guards on forwards

- The Guard validates BEFORE the transition. A Guard reading the SAME Progress sees the source node — never write "current == target_node" (always fails). For post-transition verification, bind the Guard to the **Allocator** (`alloc` runs after the state transition).
- `retained_submission: [identifier…]` stores the submitted values on the forward's execution record in the Progress session/history (located by node + forward), so later nodes and cross-machine Guards can read them.
- **No on-chain cron (T1 lossy point)**: "after N days, auto-X" decomposes into a time Guard PLUS an off-chain keeper that submits the forward once it passes. A time Guard without a keeper never fires.
- Design every Guard via `get_guard_design_patterns`; test it with the standalone `gen_passport` operation BEFORE binding — immutability makes post-hoc fixes impossible.

## Sessions & thresholds

- Executing forwards accumulates weight in a session keyed by target node; when total ≥ the pair's `threshold`, the session finalizes, history is appended, and the node transitions.
- **One forward = one weight contribution.** It locks to its first accomplisher: that account may re-submit to update message/evidence (no extra weight); any OTHER account re-executing it aborts `E_NOT_THE_HOLDER`. Threshold > 1 therefore requires DISTINCT forwards per contributor (e.g. `a` weight 1 + `b` weight 1), never one shared forward.
- If achievable weight (sum of distinct forwards) < threshold, the pair can NEVER complete — dead branch by construction.
- Competing pairs from one node: the first pair to reach its threshold wins; the other open sessions are abandoned. Mutual exclusion is intentional.
- Sessions persist on-chain until they finalize — there is no automatic expiry; only an explicit transition or order terminal resolves them.

| Pattern | Shape | Use |
|---|---|---|
| Sequential | threshold 1, one forward weight 1 | Single actor per step |
| Parallel AND | threshold N, N distinct forwards weight 1 | All parties must contribute |
| Parallel OR | multiple pairs each threshold 1 | Mutually exclusive branches |
| Weighted vote | threshold 100, weights 60/40/… | Unequal power |
| Hybrid | threshold 5, weights 3+1+1 | One required party + optional others |

---

## Lifecycle

1. Permission → 2. Machine unpublished (`object:{name, type_parameter, permission}`) → 3. Guards created + tested (`gen_passport`) → 4. bind Guards on forwards → 5. test end-to-end → 6. `publish:true` → 7. Service binds the Machine.

**Node field ops** (`data.node`, pre-publish only — 9): `add` / `set` (with `bReplace`, default false = MERGE into existing nodes; true = full replace), `remove`, `clear` (irreversible wipe — export first), `exchange` (swap two node positions), `rename` (updates pair references), `remove prior node`, `add forward`, `remove forward`. All forward-bearing ops accept the full forward shape including the Guard object with `retained_submission`.

**File workflow**: `machineNode2file` exports the exact on-chain node set; edit; then `data.node: {json_or_markdown_file: "<path>"}` performs a COMPLETE replacement (node array, not an op object; JSON or ```json markdown). Always start from an export.

---

## Runtime: operating a Progress

- Operators see their actionable view in `workflow_operation` action=`list` and in the participation radar (`operable[]` with `recommended_call`, guard requirements, waiting roles). Execute only what the radar returns for the signing account.
- Canonical forward op (`workflow_operation operate` / order `data.progress`): `next` (accomplish; default), `hold` (reserve this forward slot for yourself while doing external work), `unhold` (release own hold), `adminUnhold` (force-release via permission 224).
- Guard-gated forwards require a valid Passport carrying the submitted fields (progress#9 "Passport required"); the call's submission prompt lists exactly what to provide.
- Read state via `onchain_objects`; completed sessions via query type `onchain_table_item_progress_history`; full context via `machine_panorama`.

---

## Composition & design patterns

**Cross-Machine supply chain**: a forward Guard on Machine A queries Machine B's Progress/Order state (convert_witness with Progress query instructions — patterns in `get_guard_design_patterns`). The Guard only VERIFIES; the sub-order is created independently. Decompose when a sub-process is a standalone sellable Service, has a different participant set, or is reusable; keep one Machine when participants and dense sequential flow are shared. Ask: which phases are run by different teams? What external completion must be awaited? Who creates the sub-order, who verifies it?

**Dual-signature**: threshold 2 with two DISTINCT forwards — `namedOperator:""` for the customer, `permissionIndex` for the merchant, each weight 1.

**Privacy**: sensitive material goes through Messenger E2E encryption; only WTS/Merkle proofs go on-chain. Whoever performs the action submits the proof (see [wowok-messenger](../wowok-messenger/SKILL.md)).

---

## Pre-publish checklist (publishing is irreversible)

- [ ] Entry pair `prev_node:""` exists on ≥1 first node AND carries ≥1 forward (schema/P0-enforced) — empty entry forwards = Progress stuck at `""`.
- [ ] Every non-terminal node has a reachable outgoing path; every non-entry node has an incoming pair.
- [ ] Every pair's threshold ≤ the sum of its DISTINCT forward weights (no dead branches); competing transitions are intended.
- [ ] Every forward binds exactly the intended identity (wildcard / role / permission index), and ALL custom indexes are already granted.
- [ ] Guards created, `gen_passport`-tested (all submission scenarios), bound; time Guards have a keeper plan; post-transition checks live on Allocators, not forwards.
- [ ] R-M1-11: NO node named `refunded`/`deposit_refunded`/`deposit_deducted`/`disputed` or implying the Machine moves funds. Machines never move money — refund/deduction terminals route to Allocator slots (`return_approved` → Allocator), disputes route to the bound Arbitration. The pre-publish gate rejects violations.
- [ ] Terminal nodes are mapped to Allocator entries, or funds lock in escrow.
- [ ] Export via `machineNode2file`; run a test Progress on testnet first.

**Deadlock recovery**: published Machine + buggy bound Guard = unrecoverable (both immutable). The only fix is a NEW Machine (new nodes, new Guards), re-bound to a NEW Service version. Prevention is the only cheap path.
