---
name: wowok-auditor
description: |
  WoWok pre-publish auditor — the static-analysis Skill that verifies
  Guard completeness, Machine soundness, fund-flow safety, permission
  consistency, and publish readiness BEFORE any irreversible publish
  operation (Service publish, Machine publish, Allocator binding freeze).

  This Skill is the knowledge base for the L4 Harness Verify Loop. It does
  not mutate objects. It queries, exports, and rules — emitting a
  pass/warn/fail audit report plus a publish decision.
when_to_use:
  - User is about to publish a Service, Machine, or lock an Allocator set
  - User asks to "audit", "verify", "review", "check before publish"
  - L4 Harness Verify Loop is invoked before an irreversible operation
  - User mentions "fund flow", "refund path", "allocation sum", "guard completeness"
  - User mentions "machine cycle", "unreachable state", "permission index conflict"
  - User wants a pre-publish go/no-go decision
  - A publish operation failed and root-cause analysis is needed
---

# WoWok Pre-Publish Auditor

Static-analysis rules that gate every irreversible publish. The auditor never
writes on-chain; it queries (`query_toolkit`, `onchain_events`), exports
(`guard2file`, `machineNode2file`), evaluates rule tables, and emits a
pass / warn / fail report. A FAIL blocks the publish in R10.

> **Role**: Auditor (read-only). The pre-write safety gate now lives in the MCP knowledge layer (`knowledge/safety-rules.ts`), applied on every write; this auditor runs only on publish.
> **Layer**: L3 Skill, knowledge base for L4 Verify Loop.
> **Related Skills**: [wowok-machine](../wowok-machine/SKILL.md) (Machine design), [wowok-onboard](../wowok-onboard/SKILL.md) (publish flow).

---

## MCP Knowledge Layer

The following content has been pushed down to the MCP knowledge layer and is applied automatically — this Skill no longer duplicates it:

| Content | MCP Knowledge Module | Applied Via |
|---------|---------------------|-------------|
| Safety rules (confirmation levels, immutability rules, object reuse rules) | `knowledge/safety-rules.ts` (`CONFIRMATION_RULES`, `ConfirmLevel`) | Pre-publish checks + `project_operation.aggregate_risks` |
| Machine-executable audit rules | `knowledge/audit-rules.ts` (`AUDIT_RULES`, `auditService`) | `project_operation.aggregate_risks` |
| Guard completeness / Machine soundness / fund-flow risks | `knowledge/guard-risk.ts`, `machine-risk.ts`, per-object risk modules | `project_operation.aggregate_risks` (via per-object assessors) |

This Skill keeps the **audit flow**, the **4 audit dimensions** (Guard completeness, Machine soundness, fund flow, publish readiness), and the **checklist structure** as the human-readable knowledge base for the L4 Harness Verify Loop. The MCP layer runs the machine-executable rule evaluation.

---

## Core Principles

1. **Read-only**: The auditor never calls `onchain_operations` with `submission`. It only queries and exports. Mutations belong to the Skill being audited.
2. **Rule-driven**: Every check is a row in a rule table (GUARD_COMPLETENESS_RULES, MACHINE_SOUNDNESS_RULES, FUND_FLOW_RULES, PUBLISH_READINESS_RULES). Adding a check = adding a row, not editing control flow.
3. **FAIL blocks, WARN asks**: A FAIL verdict blocks R10 publish until fixed. A WARN verdict proceeds after explicit user acknowledgement. PASS is silent.
4. **Blast-radius first**: Before reporting, classify each issue by irreversibility — a Guard logic bug post-publish is permanent; an untested Guard is recoverable.
5. **Semantic-aware**: Use the `semantic` field returned by recent operations (`semantic.created`, `semantic.modified`, `semantic.released`, `semantic.events`) to cross-check that the intended roles were actually created/modified/released.
6. **Tiered**: A Tier-1 audit (single Service + single Guard) skips R4 Machine soundness if no Machine is bound. Tier-3 runs every rule including cross-Machine dependency chains.

---

## Audit Rule Tables

### GUARD_COMPLETENESS_RULES

| Operation Type | Fund Flow? | Guard Required? | Audit Action |
|---|---|---|---|
| payment (negative amount) | Yes | Yes | FAIL if no Guard bound |
| treasury deposit | Yes | Recommended | WARN if no Guard |
| allocation execute | Yes | Yes | FAIL if no Guard |
| service publish | No | No | PASS |
| machine publish | No | No | PASS |
| order create | Yes (escrow) | Yes | FAIL if no Guard on refund path |
| progress forward (no fund) | No | Optional | PASS (skip) |
| progress forward (fund release) | Yes | Yes | FAIL if no Guard on forward |
| reward claim | Yes | Yes | FAIL if no Guard |
| repository write | No | Recommended | WARN if no Guard |

### MACHINE_SOUNDNESS_RULES

| Check | Pass Condition | Fail Action |
|---|---|---|
| Acyclicity | No cycles in state graph | FAIL: cycle detected |
| Single entry | Exactly one node with no inbound Pair | FAIL: multiple/zero entries |
| Terminal reachability | All terminals reachable from entry | FAIL: unreachable terminal |
| No dead-end non-terminals | Every non-terminal node has an outgoing Forward | FAIL: dead-end node |
| No orphan non-entries | Every non-entry node has an incoming Pair | FAIL: orphaned node |
| Forward permissions | Each forward has `permissionIndex` ≥ 1000 OR `namedOperator` set (or both) | WARN: missing permission; FAIL if neither |
| Guard bindings | Each forward with fund flow has a Guard bound | FAIL: unguarded fund flow |
| Threshold achievability | Each Pair's threshold is reachable by its Forwards' weights | WARN: dead branch (competing Pair always wins) |

### FUND_FLOW_RULES

| Check | Pass Condition | Fail Action |
|---|---|---|
| Refund path exists | Every payment path has a corresponding refund path | FAIL: no refund path |
| Allocation sum | Each Allocator's `sharing` array sums to 10000 (100%) | FAIL: allocation doesn't sum to 100% |
| Treasury balance | Treasury has sufficient balance for pending allocations | WARN: low balance |
| Gas coin separation | Gas coins (WOW) are not mixed with business tokens in allocations | WARN: gas coin in allocation |
| Recipient type | Refund path uses `Entity`/`Signer` for known parties, `GuardIdentifier` for dynamic | WARN: ambiguous recipient |
| Escrow symmetry | Order escrow amount equals sum of all Allocation paths from that order | FAIL: escrow mismatch |

### PUBLISH_READINESS_RULES

| Check | Pass Condition | Fail Action |
|---|---|---|
| Service unpublished | `bPublished === false` | PASS: ready to publish |
| Machine published | Machine is published (if bound to Service) | FAIL: publish Machine first |
| Guards tested | All Guards have a passing `gen_passport` test on record | WARN: untested Guard |
| Permission configured | Permission object exists with correct indices for every Forward | FAIL: no Permission |
| Allocators configured | `order_allocators` non-empty and each Allocator audited | FAIL: no Allocators |
| User confirmation | User has explicitly confirmed publish intent | FAIL: no confirmation |
| Compensation fund | `compensation_fund` funded (recommended for trust) | WARN: empty fund |
| Backup export | `machineNode2file` + `guard2file` backups persisted | WARN: no backup |

---
