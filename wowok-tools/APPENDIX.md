# Appendix — wowok-tools

> This file is loaded on-demand (Progressive Disclosure).
> Main skill: [SKILL.md](./SKILL.md)

---

## Dialogue Scripts (R1-R10)

A 10-round dialogue for the tool-selection journey: a user (or another Skill) arrives with a vague intent and the AI walks them from "which tool do I even need?" through "called the right tool with the right shape" to "verified the result and persisted state". Each round maps to one decision in the tool-selection tree from §Decision Tree above.

### R1: Intent Capture & Operation Class

**AI Goal**: Classify the user's intent into one of six operation classes (Write / Read / Communicate / Local-only / Export / Discover) so the rest of the rounds narrow to one tool family.

**Key Questions**:
- What are you trying to accomplish in one sentence? (e.g., "I want to create a service", "I want to read on-chain events", "I want to send an encrypted message")
- Is this a one-time action or part of a multi-step build?
- Are you operating on-chain or only locally?

**Tool Calls**:
1. `wowok({ tool: "query_toolkit", data: { query_type: "local_names", ... } })` — list accounts and local marks so the AI can phrase follow-ups in terms the user already knows.
2. (No write call yet — R1 is classification only.)

**Success Criteria**: AI articulates the classified intent back to the user in plain language ("You want to write on-chain state, so we'll use `wowok({ tool: 'onchain_operations', data: {...} })`. Next we pick the operation_type.") and the user confirms.

**Fallback**: User intent is genuinely ambiguous (e.g., "I want to set up a shop" could mean account creation OR service creation) → ask one disambiguating question, do not guess. If user invokes by raw tool name ("use `messenger_operation`"), skip R2-R3 and jump to the parameter-shape rounds.

**Checkpoint**: Persist `{ round: R1, intent: <one_line>, op_class: write|read|communicate|local|export|discover }` via `local_info_operation`.

### R2: Tool Family Selection

**AI Goal**: Map the operation class to exactly one of the 13 tools. For `onchain_operations`, also pre-select the `operation_type` shortlist.

**Key Questions**:
- (Write) Are you creating, modifying, or advancing an object? Which object type?
- (Read) Do you need a single object, a table row, an event stream, or your local address book?
- (Communicate) Plain message, file, or WTS evidence?

**Tool Calls**:
1. `wowok({ tool: "schema_query", data: { action: "list" } })` — confirm available schemas are generated (catches the "empty list → run `npm run generate:schemas`" trap from §13).
2. (For `onchain_operations`) `wowok({ tool: "schema_query", data: { action: "get", name: "onchain_operations_service" } })` for the candidate operation_type schema to surface required fields early.

**Success Criteria**: One tool name and (for `onchain_operations`) one `operation_type` are committed. AI shows the user the high-level parameter shape and gets a "yes, that looks right".

**Fallback**: User wants an action the SDK doesn't expose directly (e.g., "refund a payment") → surface the protocol constraint (Payment is irreversible per §Immutability) and offer the closest valid path (e.g., Allocation-based refund). Never invent a tool.

**Checkpoint**: Persist `{ round: R2, tool: <name>, operation_type?: <name> }`.

### R3: Structural Wrapper Selection

**AI Goal**: Decide the exact envelope shape: `{ operation_type, data, env?, submission? }` vs the three exceptions (`gen_passport`, `payment`, `personal`).

**Key Questions**:
- (Only if user is unsure) Are you generating a passport, making a payment, or updating personal info? These are the three exception branches.
- For everything else: do you have the `data` payload ready, or do you need to collect it across R4-R6?

**Tool Calls**:
1. `wowok({ tool: "schema_query", data: { action: "get", name: "onchain_operations_gen_passport" } })` for the specific branch to lock the exact field set.
2. Cross-reference §Structural Wrapper Rules table to confirm `data` presence and `submission` presence.

**Success Criteria**: The AI presents the exact JSON skeleton with field names (not values yet) and the user confirms the shape.

**Fallback**: User passes `data` to `gen_passport` or `submission` to `payment` → block, cite the §Structural Wrapper Rules table, re-route.

**Checkpoint**: Persist `{ round: R3, wrapper: standard|gen_passport|payment|personal, fields_expected: [...] }`.

### R4: Account, Network & env Block

**AI Goal**: Resolve the `env` block — `account`, `network`, `no_cache`, `gas_budget`.

**Key Questions**:
- Which account? (Default `""` is fine if the user does not specify.)
- Testnet or mainnet? (Default `testnet`.)
- (If building multiple interdependent objects) OK to set `no_cache: true` to avoid stale-read failures?

**Tool Calls**:
1. `wowok({ tool: "query_toolkit", data: { query_type: "account_balance", ... } })` for the chosen account — verify balance > 0 before any write.
2. If balance = 0: `wowok({ tool: "account_operation", data: { faucet: { ... } } })` (testnet) OR `wowok({ tool: "account_operation", data: { transfer: { ... } } })` from a funded account (mainnet).
3. (Optional) `wowok({ tool: "query_toolkit", data: { query_type: "token_list", ... } })` to confirm token decimals if amounts are involved.

**Success Criteria**: An account with non-zero balance is committed; `network` and `no_cache` are decided. AI shows the final `env` block.

**Fallback**: Faucet rate-limited → wait 60s and retry, or `transfer` 1 WOW from another funded account (sufficient for dozens of txns per §Mainnet operations). Mainnet user with no funded account → halt and instruct acquisition; do not reduce example amounts silently.

**Checkpoint**: Persist `{ round: R4, account: <name>, network: <testnet|mainnet>, balance: <n>, no_cache: <bool> }`.

### R5: CREATE vs MODIFY Disambiguation

**AI Goal**: For every object-typed parameter, decide whether the user means REUSE (string) or CREATE (object shape). This is the most common silent failure per §safety 1.1.

**Key Questions**:
- For each object field (Permission, Machine, Guard, Contact, etc.): "Reuse an existing one (give me name/ID) or create a new one?"
- (If reuse) What is the name or `0x...` address?
- (If create) What are the new object's required fields?

**Tool Calls**:
1. `wowok({ tool: "query_toolkit", data: { query_type: "onchain_objects", ... } })` — verify any "reuse" string actually resolves (catches typos before the SDK's `GetObjectExisted()` hard-errors).
2. `wowok({ tool: "local_mark_operation", data: { ... } })` → optional: tag a reused object with a friendly name for future reference.

**Success Criteria**: Every object-typed field is annotated as REUSE (with verified name/address) or CREATE (with field draft). The full `data` payload skeleton is now populated with placeholders.

**Fallback**: User passes a string that doesn't resolve → either offer to CREATE (with explicit confirmation) or query candidates via `onchain_objects` and let the user pick. Never silently swap string→object.

**Checkpoint**: Persist `{ round: R5, fields: [{name, mode: reuse|create, resolved?: <addr>}] }`.

### R6: Permission Index Resolution

**AI Goal**: Resolve every `permissionIndex` and `namedOperator` reference against a real Permission object.

**Key Questions**:
- Which Permission object governs this operation? (Strongly recommended: reuse one Permission across all services.)
- For Machine Forwards: is this role shared across all Progress instances (`permissionIndex`) or per-order (`namedOperator`)?
- Custom indices must be ≥ 1000 (0–999 reserved). What indices does your Permission define?

**Tool Calls**:
1. `wowok({ tool: "query_toolkit", data: { query_type: "onchain_objects", filter: { type: "Permission" } } })` — list candidates for reuse.
2. `wowok({ tool: "wowok_buildin_info", data: { info: "built-in permissions" } })` — confirm which 0–999 indices are protocol-reserved so the user doesn't try to claim one.

**Success Criteria**: Every `permissionIndex` value exists in the chosen Permission; every `namedOperator` is either `""` (order owner/agents) or a role name the user explicitly defined.

**Fallback**: User picks an index < 1000 → block, cite §Permission Index Model, suggest 1000–65535 range. User doesn't have a Permission yet → create one first (R5 CREATE path), then return.

**Checkpoint**: Persist `{ round: R6, permission_id, indices_used: [...] }`.

### R7: Submission Loop Preparation

**AI Goal**: Pre-stage the two-phase submission pattern so R8's actual call doesn't surprise the user.

**Key Questions**:
- Will this operation require Guard validation? (If `submission` is in the schema, yes.)
- What data will the Guard prompt for? (Inspect Guard table via `guard2file`.)
- Do you have that data ready, or do we collect it in R8?

**Tool Calls**:
1. `wowok({ tool: "guard2file", data: { ... } })` → export every Guard the operation will hit — inspect `table` entries with `b_submission: true` to know what the prompt will ask.
2. `wowok({ tool: "wowok_buildin_info", data: { info: "guard instructions" } })` — confirm any `query` node's instruction ID and parameter count.

**Success Criteria**: AI can enumerate the exact submission fields the user will be prompted for, and the user has confirmed they can provide each.

**Fallback**: User cannot provide a submission value (e.g., KYC address they don't have) → halt, surface the Guard logic via `guard2file`, discuss whether to relax the Guard or pause the operation. Never submit placeholder data to a Guard.

**Checkpoint**: Persist `{ round: R7, expected_submissions: [{identifier, name, value_type}] }`.

### R8: Execute (Phase 1 — Probe)

**AI Goal**: Fire the operation WITHOUT `submission` to trigger the SDK's submission prompt. This is the safe first shot.

**Key Questions**:
- Confirm: I'm calling `<tool>` with `<operation_type>` and the data we prepared, but no submission yet. The SDK may return a prompt. Proceed?
- (If the call has no Guard) Confirm the full execution, since this is the only shot.

**Tool Calls**:
1. `wowok({ tool: "onchain_operations", data: { operation_type: "<type>", data: {<full payload>}, env: {<env block>}, /* omit submission */ } })` with the full payload, omitting `submission`.
2. Capture the response: either success (no Guard) or a structured submission prompt.

**Success Criteria**: Either the operation succeeds (no Guard involved) OR a structured submission prompt is returned and parsed.

**Fallback**: Call reverts with a gas error → re-faucet (R4 fallback), retry. Call reverts with "object not found" despite just creating it → set `env.no_cache: true` and retry (stale-cache trap from §Error Patterns). Schema validation error → the response includes `schema.input`; read it, fix the field, retry. Or use `wowok({ tool: "schema_query", data: { action: "get", name: "..." } })` to re-read the schema.

**Checkpoint**: Persist `{ round: R8, phase: probe, response: success|prompt, prompt_fields?: [...] }`.

### R9: Execute (Phase 2 — Submit) or Verify

**AI Goal**: If R8 returned a submission prompt, collect the user's answers and re-call with `submission` populated. If R8 succeeded, verify the on-chain state matches expectations.

**Key Questions**:
- (Phase 2) For each prompted field, what value should I submit?
- (Verify) Want me to query the resulting object and show you the diff?

**Tool Calls**:
1. (Phase 2) `wowok({ tool: "onchain_operations", data: { operation_type: "<type>", data: {<same payload>}, env: {<env>}, submission: {<collected answers>} } })` with `submission` populated.
2. (Verify) `wowok({ tool: "query_toolkit", data: { query_type: "onchain_objects", ... } })` for the resulting object ID; `wowok({ tool: "onchain_events", data: { ... } })` for the emitted event.
3. (Optional) `wowok({ tool: "local_mark_operation", data: { ... } })` → tag the new object with a friendly name.

**Success Criteria**: Operation finalizes successfully; on-chain query confirms the expected state; local mark persisted for future reference.

**Fallback**: Guard rejects the submission → consult the Guard's logic via `guard2file`, identify which `logic_*` or `query` node returned false, re-collect correct data, retry. Never bypass a Guard.

**Checkpoint**: Persist `{ round: R9, phase: submit|verify, object_id, tx_digest, verified: true }`.

### R10: Handoff & Next-Action Routing

**AI Goal**: Determine the next tool call from the current state, using the §Handoff triggers (from strategy doc §4) — make tool-to-tool transitions deterministic, not semantic guesses.

**Key Questions**:
- What do you want to do next? (If unsure, I can suggest based on what we just did.)
- (Internal) Does the just-completed operation have a deterministic next action per the Handoff table?

**Tool Calls**:
1. (Internal) Consult the Handoff trigger table: e.g., `service create` → next is `machine create`; `service publish` → next is `query_toolkit.verify`; `messenger WTS` → next is `arbitration.dispute`.
2. (Optional) `local_info_operation` → write a handoff packet with `current_state`, `completed_objects`, `next_actions`, `carry_context`.

**Success Criteria**: AI presents 1–3 candidate next actions with rationale; user picks one or declares done. Handoff packet persisted for resume.

**Fallback**: User wants an action that doesn't fit the Handoff table → treat as a new R1 intent and re-classify. User wants to stop → persist checkpoint with `journey: paused` and a resume hint.

**Checkpoint**: Persist `{ round: R10, handoff: { next_tool, next_op_type, carry: [...] }, journey: complete|paused }`.

---

## Decision Trees

### D1: Tool Family by Operation Class

```
All calls via: wowok({ tool: "<sub-tool>", data: {<params>} })

User intent
├── Write on-chain state? ──→ tool: "onchain_operations"
│   ├── Generating a credential? ──→ operation_type: gen_passport (no data wrapper)
│   ├── Transferring tokens? ──→ operation_type: payment (no submission)
│   ├── Updating personal profile? ──→ operation_type: personal (no submission)
│   └── Anything else? ──→ operation_type: service|machine|progress|guard|order|allocation|arbitration|treasury|reward|demand|contact|repository|permission (full wrapper)
├── Read on-chain state? ──→ tool: "query_toolkit" OR "onchain_table_data"
│   ├── Single object or simple list? ──→ tool: "query_toolkit"
│   ├── Dynamic table row? ──→ tool: "onchain_table_data" (needs parent except entity_registrar / entity_linker)
│   └── Historical events? ──→ tool: "onchain_events"
├── Communicate? ──→ tool: "messenger_operation"
├── Local-only? ──→ tool: "account_operation" | "local_mark_operation" | "local_info_operation"
├── Export for review? ──→ tool: "guard2file" | "machineNode2file" | "wip_file" (verify/wts2html)
└── Discover schemas/instructions? ──→ tool: "schema_query" | "wowok_buildin_info"
```

### D2: CREATE vs MODIFY (per object-typed field)

```
All calls via: wowok({ tool: "<sub-tool>", data: {<params>} })

For each field whose value could be a string OR an object:
├── User said "reuse <name>" or gave 0x address? ──→ REUSE
│   ├── wowok({ tool: "query_toolkit", data: { query_type: "onchain_objects" } }) verifies it resolves? ──→ use string value
│   └── Does not resolve? ──→ ask: typo, or did you mean CREATE?
├── User said "create new" with details? ──→ CREATE (object shape)
├── User unsure? ──→ query on-chain candidates, present list, let user pick or create
└── SDK auto-create shortcut ──→ pass object shape to a parent field (e.g., service.permission) and SDK creates the Permission implicitly — only for Permission, only when user accepts the auto-defaults
```

### D3: Submission Loop Branch

```
About to call wowok({ tool: "onchain_operations", data: { ... } }):
├── Branch is gen_passport, payment, or personal? ──→ ONE-SHOT (no submission field)
├── Branch has submission in schema?
│   ├── Call WITHOUT submission first ──→ SDK returns prompt? ──→ collect answers, re-call WITH submission
│   └── SDK returns success (no Guard gated this op)? ──→ done, no phase 2 needed
└── gen_passport special case ──→ each Guard's submission passed via top-level info, not data.submission
```

### D4: Error Recovery Routing

```
wowok() call returned error:
├── Gas / insufficient balance? ──→ wowok({ tool: "query_toolkit", data: { query_type: "account_balance" } }) → faucet or transfer → retry
├── "Object not found" right after create? ──→ env.no_cache: true → retry (stale cache)
├── Guard validation failure? ──→ wowok({ tool: "guard2file", data: { ... } }) export → inspect logic tree → fix submission → retry
├── Schema validation error (result.status = "schema_mismatch")? ──→ read schema.input from response → fix → retry. Or wowok({ tool: "schema_query", data: { action: "get" } }) for full schema.
├── Permission denied? ──→ query Permission object → verify caller's index → add index or switch account
├── "machine not published" on service.publish? ──→ publish Machine first, then retry Service publish
└── Network timeout? ──→ retry once; if persists, switch network or escalate
```

### D5: Handoff Next-Action

```
All calls via: wowok({ tool: "<sub-tool>", data: {<params>} })

Just-completed operation:
├── service CREATE ──→ next: machine CREATE (Service needs a Machine before publish)
├── machine CREATE ──→ next: guard CREATE × N (Guards must exist before binding)
├── guard CREATE ──→ next: gen_passport test (verify logic before binding)
├── service publish ──→ next: wowok({ tool: "query_toolkit", data: { query_type: "onchain_objects" } }) verify bPublished=true
├── query Service ──→ next (if user wants contact): wowok({ tool: "messenger_operation", data: { ... } })
├── messenger WTS send ──→ next: arbitration.dispute (evidence closed)
├── order.advance ──→ next: query allocation balance (verify fund flow)
└── None of the above ──→ re-invoke R1 intent classification
```

---

## Failure Playbooks

### F1: Schema List Returns Empty

**Trigger**: `wowok({ tool: "schema_query", data: { action: "list" } })` returns `[]` or throws "schemas not generated".

**Diagnosis**: The MCP server's schema files were not generated at deploy time. This is a deployment gap, not a usage error.

**Recovery**:
1. Surface the issue to the user plainly: "The schema files are missing on the server side."
2. Instruct running `npm run generate:schemas` on the MCP server host (per §The 17 Sub-Tools, sub-tool #13).
3. While waiting, fall back to the field shapes documented in this Skill and in [wowok-safety](../wowok-safety/SKILL.md) — they are authoritative even without the generated schema.
4. After regeneration, re-run `wowok({ tool: "schema_query", data: { action: "list" } })` to confirm.

**Prevention**: Add a `wowok({ tool: "schema_query", data: { action: "list" } })` health check at the start of every fresh session. If empty, fail fast and surface the deploy issue before any write attempt.

### F2: Stale Cache After Sequential Creates

**Trigger**: Operation B fails with "object not found" immediately after operation A created that object.

**Diagnosis**: The SDK's read cache hasn't invalidated between dependent calls. This is the #1 cache trap per §Error Patterns.

**Recovery**:
1. Retry operation B with `env.no_cache: true`.
2. If still failing, query the object directly via `wowok({ tool: "query_toolkit", data: { query_type: "onchain_objects", no_cache: true, ... } })` to confirm it actually exists on-chain.
3. If on-chain confirms existence, retry B once more with `no_cache: true`.

**Prevention**: When building multiple interdependent objects in one session (the common case in onboarding), set `env.no_cache: true` on EVERY operation from the start. The minor latency cost is far cheaper than debugging stale-cache failures mid-flow.

### F3: Submission Loop Misuse

**Trigger**: User (or AI) calls `wowok({ tool: "onchain_operations", data: { ..., submission: {...} } })` with `submission` populated on the first try, and the call either reverts or silently accepts wrong data.

**Diagnosis**: The two-phase pattern was skipped. Either the AI guessed the submission fields, or the user pasted a submission from a previous unrelated call.

**Recovery**:
1. Re-call the operation WITHOUT `submission` to get the authoritative prompt.
2. Diff the prompt's requested fields against what was previously submitted.
3. Re-collect any mismatched fields from the user.
4. Re-call WITH the corrected `submission`.

**Prevention**: Treat the submission prompt as the single source of truth for what the Guard needs. Never pre-fill `submission` from memory or past calls. The `gen_passport` exception (submissions via top-level `info`) is the only branch where submission data is passed differently — and even there, each Guard's submission is independent.

### F4: Guard creation fails with type mismatch

**Trigger**: `wowok({ tool: "onchain_operations", data: { operation_type: "guard", ... } })` CREATE reverts with a type-validation error (e.g., `logic_equal` received String vs U64).

**Diagnosis**: The computational tree has a type incompatibility that the schema-layer validation caught. Common variants: comparing across numeric widths without `logic_as_u256_*`, missing `convert_witness` when querying Progress from an Order, or a `query` node with the wrong parameter count.

**Recovery**:
1. Inspect the error message — it usually names the offending node and the expected vs actual types.
2. Cross-reference `wowok({ tool: "wowok_buildin_info", data: { info: "value types" } })` to confirm numeric codes.
3. Cross-reference `wowok({ tool: "wowok_buildin_info", data: { info: "guard instructions" } })` to confirm the `query` node's instruction ID and parameter count.
4. Fix the tree, re-attempt CREATE. Guards are CREATE-only — there is no MODIFY, so a failed CREATE simply retries.

**Prevention**: Before any Guard CREATE, mentally (or via a scratch file) walk the tree: every `identifier` index exists in the table; every comparison node receives compatible operand types; every `query` node's parameter count matches the instruction. The §Guard Best Practices traps 1–4 catch 90% of pre-flight issues.

### F5: Tool Returns "Permission Denied"

**Trigger**: Operation reverts with a permission error despite the user believing they have access.

**Diagnosis**: The operating account lacks the required `permissionIndex` in the governing Permission object, OR the Forward's `namedOperator` doesn't match the caller's role.

**Recovery**:
1. `wowok({ tool: "query_toolkit", data: { query_type: "onchain_objects", filter: { type: "Permission" } } })` for the governing Permission — list its indices.
2. Cross-reference the operation's required index (from the schema or the Machine Forward definition).
3. Either: switch to an account that holds the index, OR have the Permission owner add the index for the current account, OR (if Forward uses `namedOperator`) assign the role via `wowok({ tool: "onchain_operations", data: { operation_type: "progress", ... } })` MODIFY.

**Prevention**: During onboarding R6 (Permission resolution), record the full index→role map in the checkpoint. Before any operation, verify the caller's account holds the required index — this is a 1-query pre-flight that prevents 100% of permission-denied failures.

### F6: Faucet Exhausted on Testnet

**Trigger**: `wowok({ tool: "account_operation", data: { faucet: { ... } } })` returns rate-limit or timeout.

**Diagnosis**: Testnet faucet has per-account and per-IP rate limits. Common during onboarding loops with many test orders.

**Recovery**:
1. Wait 60 seconds and retry once.
2. If still failing, `wowok({ tool: "account_operation", data: { transfer: { amount: 1000000000, ... } } })` 1 WOW (10^9 base units) from another funded account the user owns.
3. If no other account exists, surface the issue and pause — do not silently reduce example amounts (per §Mainnet operations, this rule applies to mainnet too).

**Prevention**: Pre-fund each new account with 5+ WOW at creation time via a single `transfer` from a treasury account, rather than relying on faucet per-operation. Track each account's balance in `wowok({ tool: "local_info_operation", data: { ... } })` and proactively top up below 1 WOW threshold.

---

## Tier Layering

### Novice Tier — Tool Discovery Path

- Always start with `wowok({ tool: "query_toolkit", data: { query_type: "local_names" } })` to ground the conversation in objects the user already knows.
- Use the §Decision Tree D1 (Tool Family by Operation Class) as a rigid router — do not let the user invoke sub-tools by raw name until they've classified their intent.
- For every `wowok({ tool: "onchain_operations", data: { ... } })` call, follow the full R1-R10 sequence: classify → select → wrap → env → CREATE/MODIFY → permission → submission prep → probe → submit → handoff.
- The two-phase submission loop is non-negotiable: never pre-fill `submission`.
- Always set `env.no_cache: true` when building multiple objects in one session.
- After every write, verify via `wowok({ tool: "query_toolkit", data: { query_type: "onchain_objects" } })` before declaring success.
- Trigger: user is new, or any time the AI is unsure which sub-tool fits.

### Advanced Tier — Direct Tool Invocation

- User invokes sub-tools by name (e.g., "call `wowok({ tool: 'onchain_operations', data: { operation_type: 'machine' } })`"); AI provides the parameter shape and verifies, but does not re-classify intent from scratch.
- The R1-R3 rounds can be collapsed into a single confirmation: "You want `<tool>` + `<operation_type>`. Confirm?"
- `env.no_cache` is set selectively — only on operations known to depend on just-created objects.
- Submission loop is still two-phase, but the AI pre-fetches the Guard's expected submissions via `wowok({ tool: "guard2file", data: { ... } })` in parallel with R8's probe call, so R9 is faster.
- Handoff next-actions are surfaced as suggestions, not enforced.
- Trigger: user says "I know what I'm doing" or has completed prior sessions.

### Expert Tier — Raw Schema & Edge Cases

- User reads schemas directly via `wowok({ tool: "schema_query", data: { action: "get", name: "..." } })` and constructs payloads by hand; AI's role is to catch schema-inexpressible traps (the three wrapper exceptions, first-Guard-wins ordering, convert_witness type rules) rather than to route.
- R1-R7 are skipped; AI engages at R8 (execute) and R10 (handoff).
- The §Common Pitfalls table and §Structural Wrapper Rules become the primary reference, not the decision trees.
- Expert users may compose multiple `wowok` calls in a single transaction batch (where the SDK supports it) — AI verifies dependency ordering but does not serialize.
- Expert users may use `wowok({ tool: "onchain_operations", data: { operation_type: "gen_passport", ... } })` as a standalone credential issuer (off-chain verification use case), not just as a Guard test — AI supports this path directly.
- Trigger: user explicitly asks for "expert mode", references sub-tools by raw name with parameters, or invokes `wowok({ tool: "schema_query", data: { ... } })` themselves.
