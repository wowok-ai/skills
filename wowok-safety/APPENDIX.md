# Appendix — wowok-safety

> This file is loaded on-demand (Progressive Disclosure).
> Main skill: [SKILL.md](./SKILL.md)

---

## Dialogue Scripts (R1-R10)

A guided 10-round dialogue for the safety verification journey — runs before ANY on-chain write operation. Each round has a specific AI Goal, Key Questions, Tool Calls, Success Criteria, Fallback, and Checkpoint. Checkpoints persist via `local_info_operation` so the verification can resume after interruption.

> **Trigger**: This dialogue is automatically invoked when the user requests an on-chain write operation (transfer, publish, create, modify, etc.). It is the safety gate that all writes must pass through.

### R1 — Operation Intent Capture

**AI Goal**: Understand exactly what operation the user wants to perform, which objects are involved, and on which network. Classify the operation as LOCAL, ON-CHAIN, or QUERY to determine the required safety checks.

**Key Questions**:
- What operation do you want to perform? (transfer, publish, create, modify, etc.)
- Which objects are involved? (names, IDs, or types)
- Which network? (testnet default, or mainnet)
- Which account? (default `""` or a specific account)

**Tool Calls**:
1. Classify the operation: LOCAL (`account_operation`, `local_mark_operation`, `local_info_operation`) / ON-CHAIN (`onchain_operations`, `messenger_operation` some ops, `wip_file` sign) / QUERY (read-only).
2. If QUERY → no safety gate needed, proceed directly.
3. If LOCAL → minimal safety checks (no gas, no confirmation).
4. If ON-CHAIN → full safety gate (R2-R10).
5. `local_info_operation` → create a session checkpoint `{ round: R1, operation_type, objects, network, account, classification }`.

**Success Criteria**: Operation classified correctly. All involved objects identified. Network and account confirmed.

**Fallback**: User provides vague intent ("transfer some funds") → ask for specific amount, token, and recipient. User doesn't know the network → default to testnet, inform user. User doesn't specify an account → use default `""`.

**Checkpoint**: Persist `{ round: R1, operation_type, objects: [...], network, account, classification: LOCAL|ONCHAIN|QUERY }`. Mark R1 COMPLETE.

### R2 — Account & Network Verification

**AI Goal**: Verify the account exists and has sufficient balance for the operation. Confirm the network matches the objects' chain.

**Key Questions**:
- Confirm: account `<address>` on `<network>`. Correct?
- Does the account have sufficient balance for gas and the operation amount?

**Tool Calls**:
1. `account_operation` → `get` to confirm the account exists.
2. `query_toolkit` → `onchain_objects` for the account object. Check balance.
3. If balance insufficient → inform user, suggest faucet (`account_operation` → `faucet` on testnet).
4. `local_info_operation` → persist account verification.

**Success Criteria**: Account exists. Balance sufficient for gas + operation amount. Network confirmed.

**Fallback**: Account not found → guide through `account_operation` → `gen`. Balance insufficient → suggest faucet (testnet) or fund the account (mainnet). Wrong network → warn user, switch via `env.network`.

**Checkpoint**: Persist `{ round: R2, account_verified: true, balance_sufficient: true, network_confirmed: true }`. Mark R2 COMPLETE.

### R3 — Object Reuse vs Create Decision

**AI Goal**: For each object involved in the operation, determine whether to reuse an existing object (string reference) or create a new one (object shape). Apply the Object Reuse Principle.

**Key Questions**:
- For each object: do you have an existing one to reuse, or do you need to create new?
- If reusing: provide the name or ID.
- If creating: confirm the need for a new object.

**Tool Calls**:
1. For each object the user wants to reuse: `query_toolkit` → `onchain_objects` to verify it exists and is owned by the account.
2. Confirm the CREATE vs MODIFY pattern:
   - String `"<name>"` or `"<0x...>"` → REUSE existing.
   - Object `{ name?, ... }` → CREATE new.
3. For Permission objects: strongly recommend reuse (centralized control).
4. For Arbitration objects: always reuse (customers choose established arbiters).
5. `local_info_operation` → persist the reuse/create decision per object.

**Success Criteria**: Each object has a clear reuse/create decision. Reused objects verified to exist. Created objects confirmed as necessary.

**Fallback**: User wants to reuse but object doesn't exist → SDK will throw `GetObjectExisted()` error. Either create new or correct the name/ID. User wants to create but an equivalent object exists → recommend reuse to reduce management overhead.

**Checkpoint**: Persist `{ round: R3, objects: [{name, decision: reuse|create, verified: bool}] }`. Mark R3 COMPLETE.

### R4 — Permission & Guard Pre-Check

**AI Goal**: Verify the account has the required Permission indices for the operation. If Guards are involved, verify the user can satisfy them (or has a valid passport).

**Key Questions**:
- Does the operation require specific Permission indices?
- If Guards are involved: can you satisfy the conditions? Do you have a valid passport?

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` for the Permission object. Check the account's role/indices.
2. For Machine forwards: verify the `namedOperator` and Guard requirements per [wowok-machine](../wowok-machine/SKILL.md).
3. If a Guard is required and user needs a passport: `onchain_operations` → `gen_passport`.
4. `guard2file` to export and review the Guard logic if unclear.
5. `local_info_operation` → persist permission and guard verification.

**Success Criteria**: Account has required Permission indices. Guards are satisfiable (or passport obtained). No permission denied errors expected.

**Fallback**: Permission denied → check the object's Permission configuration. User lacks the required index → request the permission holder to grant access. Guard cannot be satisfied → flag the blocker, consider alternative path or hand off to [wowok-guard](../wowok-guard/SKILL.md) for redesign.

**Checkpoint**: Persist `{ round: R4, permission_verified: true, guard_requirements: [...], passport_obtained: bool }`. Mark R4 COMPLETE.

### R5 — Amount & Token Verification

**AI Goal**: Verify all amounts in the operation are correct. Query token decimals — never assume. Confirm amounts are submitted as U64 integers.

**Key Questions**:
- What is the amount and token for this operation?
- Do you know the token's decimals? (I will query to verify.)
- Confirm: `<human_readable_amount>` = `<u64_integer>`?

**Tool Calls**:
1. `query_toolkit` → `token_list` to get the token's `decimals` and `symbol`.
2. Calculate: `u64_amount = human_amount × (10 ^ decimals)`.
3. Present both: "2 WOW = 2000000000 (U64, 9 decimals)".
4. Verify the operation submits the U64 integer, not the human-readable string.
5. For multi-token operations: verify each token's decimals independently.
6. `local_info_operation` → persist amount verification.

**Success Criteria**: Token decimals queried (not assumed). Amount converted to U64 integer. User confirmed both human-readable and U64 amounts.

**Fallback**: Token decimals cannot be queried → HALT the amount submission. Alert the user. Do not proceed with hardcoded or guessed precision. User specifies "2 WOW" → submit `2000000000`, not the string "2 WOW".

**Checkpoint**: Persist `{ round: R5, token: {symbol, decimals}, human_amount, u64_amount, verified: true }`. Mark R5 COMPLETE.

### R6 — Export & Review (Publish Operations Only)

**AI Goal**: For publish operations (Service, Machine), export and review the definitions before publishing. Warn about immutability — many fields become locked after publish.

**Key Questions**:
- Ready to review the Guard and Machine definitions before publishing?
- Are you aware that after publish, many fields become immutable?
- Have you tested all Guard conditions and Machine transitions?

**Tool Calls**:
1. `guard2file` to export all Guard definitions.
2. `machineNode2file` to export all Machine node definitions.
3. Review the exported files with the user. Confirm logic matches intent.
4. Warn about immutability: list which fields become locked after publish.
5. `local_info_operation` → persist the export review.

**Success Criteria**: All Guards and Machine nodes exported and reviewed. User confirms logic matches intent. User acknowledges immutability constraints.

**Fallback**: Export fails → check file format and schema compliance. User finds a logic error → fix before publishing (after publish, must create replacement objects). User is unsure about logic → hand off to [wowok-guard](../wowok-guard/SKILL.md) or [wowok-machine](../wowok-machine/SKILL.md) for detailed review.

**Checkpoint**: Persist `{ round: R6, guards_exported: [...], machine_exported: bool, reviewed: true, immutability_acknowledged: true }`. Mark R6 COMPLETE. (Skip if not a publish operation.)

### R7 — Immutability Warning & User Confirmation

**AI Goal**: Present the final operation preview. For irreversible operations (publish, arbitration verdict, transfer), obtain explicit user confirmation. Use the confirmation template.

**Key Questions**:
- Here is the operation preview. Proceed?
- Are you aware this operation is irreversible? (if applicable)
- For amount-sensitive operations: confirm the amount and recipient.

**Tool Calls**:
1. Render the confirmation template:
   ```
   📋 Operation Preview
   | Field | Value |
   |-------|-------|
   | Operation | {operation_type} — {op} |
   | Object | {object_name} |
   | Network | {network} |
   | Account | {account} |
   ⚠️ This will {describe_what_will_happen}
   Proceed with execution?
   ```
2. For publish: add the publish confirmation warning.
3. For transfers: display amount with token symbol (from R5).
4. Wait for explicit user confirmation ("yes", "proceed", "confirm").
5. `local_info_operation` → persist the confirmation.

**Success Criteria**: Operation preview rendered. User explicitly confirmed. For irreversible operations, user acknowledged irreversibility.

**Fallback**: User says "no" or hesitates → abort, ask for clarification. User says "maybe" → explain the operation in more detail, re-confirm. User asks to modify → return to the relevant R round for the change.

**Checkpoint**: Persist `{ round: R7, confirmation_template_rendered: true, user_confirmed: true, irreversible_acknowledged: bool }`. Mark R7 COMPLETE.

### R8 — Two-Phase Submission (Call Without Submission)

**AI Goal**: Execute the first phase of the two-phase submission loop. Call the operation WITHOUT `submission` — the SDK returns a prompt confirming the operation details.

**Key Questions**:
- Ready to submit the operation? I will first call without submission to verify.
- Does the SDK prompt match our expectations?

**Tool Calls**:
1. `onchain_operations` (or relevant tool) with the assembled operation, WITHOUT `submission`.
2. SDK returns a prompt confirming the operation details.
3. Verify the prompt matches R1-R7 expectations.
4. If prompt is unexpected → diagnose (wrong object, wrong amount, wrong account).
5. `local_info_operation` → persist the SDK prompt.

**Success Criteria**: SDK prompt received and matches expectations. Operation is ready for the second phase (with submission).

**Fallback**: SDK returns an error → diagnose: wrong object name, insufficient gas, permission denied, Guard validation failure. SDK prompt doesn't match → re-verify R1-R7, correct the issue. `GetObjectExisted()` error → the string reference couldn't be resolved; either create new or correct the name.

**Checkpoint**: Persist `{ round: R8, sdk_prompt_received: true, prompt_matches: true }`. Mark R8 COMPLETE.

### R9 — Execute with Submission

**AI Goal**: Execute the second phase of the two-phase submission loop. Call the operation WITH `submission` to execute it on-chain.

**Key Questions**:
- Confirm: execute the operation on-chain? This is the final step.
- (For publish) Reminder: after this, the object is publicly accessible and many fields are immutable.

**Tool Calls**:
1. `onchain_operations` (or relevant tool) with the same operation AND `submission`.
2. SDK executes the transaction on-chain.
3. Capture the transaction digest and result.
4. `query_toolkit` → `onchain_objects` to verify the result (new object created, balance updated, state changed).
5. `local_info_operation` → persist the transaction digest and result.

**Success Criteria**: Transaction executed on-chain. Digest captured. Result verified via query.

**Fallback**: Transaction fails → check the error: Guard validation failure (review Guard logic and submitted data), insufficient gas (add more), permission denied (check Permission indices), object not found (verify name/ID with `no_cache: true`). Transaction succeeds but result is unexpected → query with `no_cache: true` to bypass cache lag.

**Checkpoint**: Persist `{ round: R9, tx_digest, result: success|failure, verified: true }`. Mark R9 COMPLETE.

### R10 — Post-Operation Verification & Handoff

**AI Goal**: Verify the operation's outcome. Confirm the on-chain state matches expectations. Hand off to the next workflow with a clean state.

**Key Questions**:
- The operation is complete. Would you like to verify the result?
- What's your next operation? (hand off to the appropriate Skill)

**Tool Calls**:
1. `query_toolkit` → `onchain_objects` with `no_cache: true` for the affected objects.
2. `onchain_events` → check for relevant events (NewOrderEvent, ProgressEvent, ArbEvent, etc.).
3. Confirm the state change matches expectations.
4. `local_info_operation` → write the final verification and handoff packet.
5. Recommend next Skills based on the operation type:
   - After `service.buy` → [wowok-order](../wowok-order/SKILL.md) for order operations.
   - After `service.publish` → [wowok-provider](../wowok-provider/SKILL.md) for merchant operations.
   - After `arbitration.create` → [wowok-arbitrator](../wowok-arbitrator/SKILL.md) for case management.
   - After `guard.create` → [wowok-guard](../wowok-guard/SKILL.md) for binding.
   - After `machine.create` → [wowok-machine](../wowok-machine/SKILL.md) for publish.

**Success Criteria**: On-chain state verified. Events checked. Handoff packet written. Next Skill recommended.

**Fallback**: State doesn't match expectations → check with `no_cache: true` (cache lag). If still wrong → diagnose: transaction may have partially failed, or a Guard blocked a sub-operation. User wants to undo → for most operations, impossible (immutable); for some, a reverse operation exists (e.g., `transfer_to` for ownership).

**Checkpoint**: Persist `{ round: R10, state_verified: true, events_checked: true, handoff_emitted: true, next_skill: <recommended> }`. Mark safety verification COMPLETE.

---

## Decision Trees

### D1: Object Reuse vs Create

```
For each object involved in the operation:
├── Does an equivalent object already exist?
│   ├── YES (user provides name/ID)
│   │   ├── Verify via query_toolkit → onchain_objects
│   │   │   ├── Exists and owned by account → REUSE (string reference)
│   │   │   ├── Exists but owned by another → Cannot reuse. CREATE new.
│   │   │   └── Does not exist → Name typo or never created. CREATE new.
│   │   └── Object type matters:
│   │       ├── Permission → STRONGLY recommend reuse (centralized control)
│   │       ├── Arbitration → ALWAYS reuse (established arbiters)
│   │       ├── Machine → Reuse if workflow fits
│   │       ├── Guard → Reuse if logic matches
│   │       └── Contact → Reuse if same customer service point
│   └── NO (no equivalent exists)
│       └── CREATE new (object shape { name?, ... })
├── SDK enforcement:
│   ├── String "<name>" or "<0x...>" → GetObjectExisted() resolves
│   │   ├── Resolution succeeds → REUSE
│   │   └── Resolution fails → Hard error. Fix name or switch to CREATE.
│   └── Object { name?, ... } → Always creates new
└── replaceExistName flag (for name collisions):
    ├── false (default) → Throws error if name in use (safe)
    └── true → Steals name from existing object (development only)
```

### D2: Confirmation Level Required

```
What level of confirmation does this operation need?
├── Operation type:
│   ├── QUERY (read-only) → No confirmation needed
│   ├── LOCAL (account_operation, local_mark, local_info) → No confirmation needed
│   ├── ON-CHAIN write (modify, create) → Standard confirmation (R7 template)
│   ├── Amount-sensitive (transfer, payment, reward) → AMOUNT VERIFICATION required
│   │   ├── Query token decimals (never assume)
│   │   ├── Convert to U64 integer
│   │   ├── Display both human-readable and U64
│   │   └── Explicit user confirmation
│   ├── Publish (Service, Machine) → PUBLISH CONFIRMATION required
│   │   ├── Export and review (guard2file, machineNode2file)
│   │   ├── Warn about immutability
│   │   └── Explicit user confirmation
│   └── Irreversible (arbitration verdict, transfer) → DOUBLE CONFIRMATION
│       ├── First: standard R7 template
│       └── Second: "Are you absolutely sure? This cannot be undone."
├── Amount threshold (user-configurable):
│   ├── Small (< 1 WOW) → Standard confirmation
│   ├── Medium (1-100 WOW) → Standard + amount display
│   └── Large (> 100 WOW) → Explicit verbal confirmation + amount display
└── Network:
    ├── testnet → Standard confirmation (low risk)
    └── mainnet → Heightened confirmation (real funds)
```

### D3: LOCAL vs ON-CHAIN vs QUERY

```
Classifying the operation:
├── LOCAL ONLY (no gas, no confirmation)
│   ├── account_operation (gen, get, faucet, messenger, etc.)
│   ├── local_mark_operation
│   └── local_info_operation
├── ON-CHAIN (gas required, confirmation required)
│   ├── onchain_operations (all 16 operation_types)
│   ├── messenger_operation (some ops — sign, proof_message)
│   └── wip_file (sign)
├── QUERY (read-only, no gas, no confirmation)
│   ├── query_toolkit
│   ├── onchain_table_data
│   ├── onchain_events
│   ├── guard2file
│   ├── machineNode2file
│   └── wowok_buildin_info
└── ENCRYPTED (local encryption, no gas)
    └── messenger_operation (watch/send messages — local ops)
```

### D4: Publish Readiness Check

```
Before publishing a Service or Machine:
├── Have all Guards been created and tested?
│   ├── YES → continue
│   └── NO → STOP. Create and test Guards first (gen_passport).
├── Has the Machine been created and nodes exported?
│   ├── YES → machineNode2file export reviewed
│   └── NO → STOP. Create Machine first.
├── Has the Permission object been configured with required indices?
│   ├── YES → continue
│   └── NO → STOP. Machine forwards reference Permission indices.
├── Have all mutable fields been finalized?
│   ├── YES → continue
│   └── NO → STOP. After publish, many fields are immutable.
├── Has the Contact (um) been configured?
│   ├── YES → continue
│   └── NO → STOP. Customers need a contact channel.
├── Has the compensation_fund been funded (for Services)?
│   ├── YES → continue
│   └── NO → Warn. Fund may be insufficient for arbitration awards.
├── Are you on the correct network?
│   ├── testnet → OK for testing
│   └── mainnet → DOUBLE CHECK. Real users, real funds.
└── All checks pass → Proceed with publish confirmation (R7).
```

### D5: Error Recovery Path

```
An operation failed. What's the error?
├── Guard validation failure
│   ├── Review Guard's rule tree via guard2file
│   ├── Check submitted data values
│   ├── Re-submit with corrected data
│   └── If Guard logic is wrong → create replacement Guard (immutable)
├── Cache stale reads
│   ├── Retry with env.no_cache: true
│   ├── If still fails → wait, then retry
│   └── For sequential operations → always set no_cache: true
├── Permission denied
│   ├── Check the object's Permission configuration
│   ├── Verify account has required indices
│   └── Request permission holder to grant access
├── Object not found
│   ├── Verify name/ID spelling
│   ├── Check env.network matches
│   ├── Retry with no_cache: true
│   └── If truly doesn't exist → create new or correct reference
├── Insufficient gas
│   ├── Add more gas to the account
│   ├── Faucet on testnet (account_operation → faucet)
│   └── Retry the operation
├── File parsing failure
│   ├── Check machineNode2file / guard2file output format
│   ├── Verify schema compliance
│   └── Regenerate the export
└── GetObjectExisted() error
    ├── String reference couldn't be resolved
    ├── Check name spelling
    ├── Check if object exists via query_toolkit
    └── Switch to CREATE (object shape) if object doesn't exist
```

---

## Failure Playbooks

### F1: Cache Stale Reads

**Trigger**: Sequential operations fail unexpectedly. For example, "object not found" when the object was just created in the previous step.

**Diagnosis**:
- WoWok's caching layer hasn't propagated the latest state.
- The previous operation succeeded, but the cache still returns the old state.
- Common in rapid sequential operations (create object → reference object in next call).

**Recovery**:
1. Retry the failing operation with `env.no_cache: true`.
2. If the retry succeeds → cache lag confirmed. Always use `no_cache: true` for sequential operations.
3. If the retry still fails → the object truly doesn't exist or the operation has a different error.
4. For ongoing sequential operations: set `no_cache: true` on ALL operations in the chain.

**Prevention**: When building multiple interdependent objects, set `env.no_cache: true` on all operations. This is listed in §Common Mistakes as "Forgetting no_cache."

### F2: Missing Permission Indices

**Trigger**: A Machine forward references a Permission index that doesn't exist. The operation fails with "permission denied" or "index out of bounds."

**Diagnosis**:
- The Machine's forward specifies a `namedOperator` index that the Permission object doesn't have.
- The Permission object was created with fewer indices than the Machine requires.
- The Machine was designed before the Permission object was fully configured.

**Recovery**:
1. `machineNode2file` to export the Machine and identify all `namedOperator` indices.
2. `query_toolkit` → `onchain_objects` for the Permission object. Check available indices.
3. If the Permission object is mutable → add the missing indices.
4. If the Permission object is immutable → create a new Permission with the required indices, then update the Machine (if mutable) or create a new Machine.
5. If the Machine is already published → cannot modify. Must create a new Machine with correct references.

**Prevention**: Before creating a Machine, verify the Permission object has all required indices. This is listed in §Common Mistakes as "Missing permission indices." Design the Permission object first, then the Machine.

### F3: Token Decimals Assumption

**Trigger**: An amount-sensitive operation fails or produces unexpected results because the token's decimals were assumed rather than queried.

**Diagnosis**:
- The AI assumed WOW has 9 decimals (correct, but should still query).
- The AI assumed a custom token has the same decimals as WOW (wrong).
- The amount was submitted as a human-readable string ("2 WOW") instead of a U64 integer (`2000000000`).
- The token's decimals couldn't be queried, and the AI guessed (wrong).

**Recovery**:
1. `query_toolkit` → `token_list` to get the correct `decimals` and `symbol`.
2. Recalculate: `u64_amount = human_amount × (10 ^ decimals)`.
3. Re-submit the operation with the correct U64 integer.
4. If the token's decimals cannot be queried → HALT. Alert the user. Do not proceed with guessed precision.

**Prevention**: NEVER assume token decimals. ALWAYS query via `query_toolkit` with `query_type: "token_list"` before any amount-sensitive operation. This is documented in §2.2 Amount Verification and §5.1 Multi-Token Support.

### F4: Name Collision (replaceExistName)

**Trigger**: An operation fails because an object with the same name already exists. Or, `replaceExistName: true` was used accidentally, stealing the name from an existing object.

**Diagnosis**:
- `replaceExistName: false` (default) → throws error if name is in use.
- `replaceExistName: true` → steals the name; the old object becomes unnamed (potentially orphaned).
- The user didn't realize the name was already in use.
- The user used `replaceExistName: true` in production (should be development only).

**Recovery**:
1. If `replaceExistName: false` and name collision → either:
   - Choose a different name (e.g., append `_v2`).
   - Use `replaceExistName: true` intentionally if the old object is obsolete.
2. If `replaceExistName: true` was used accidentally → the old object is now unnamed. Query by ID to find it. Re-name it or accept the orphaned state.
3. For production systems → use versioned names (`_v1`, `_v2`) instead of `replaceExistName`.

**Prevention**: Default to `replaceExistName: false` in production. Use versioned names for iterations. Only use `replaceExistName: true` during development with fixed test names. This is documented in §4.1 replaceExistName Flag.

### F5: Guard Validation Failure

**Trigger**: An operation with `submission` fails because the Guard logic evaluated to false. The Guard rejected the submitted data.

**Diagnosis**:
- The Guard's rule tree was satisfied by the conditions, but the submitted data didn't meet the requirements.
- The Guard logic itself may be correct, but the data values are wrong.
- The Guard logic may be wrong (designed incorrectly), but since Guards are immutable, it cannot be patched.

**Recovery**:
1. `guard2file` to export and review the Guard's rule tree.
2. Compare the submitted data values against the Guard's requirements.
3. If the data is wrong → correct the data and re-submit.
4. If the Guard logic is wrong → create a replacement Guard with corrected logic. Update the host object (if mutable) to reference the new Guard.
5. If the host object is immutable → cannot update the Guard reference. Must create a new host object.

**Prevention**: Test Guards with `gen_passport` before binding them to objects. Review the Guard's rule tree via `guard2file` before finalizing. This is documented in §7 Error Patterns.

### F6: Immutable Field Modification Attempt

**Trigger**: The user tries to modify a field that became immutable after publish (e.g., Service machine, Service order_allocators, Guard rules, Machine node topology).

**Diagnosis**:
- After a Service is published, `machine` and `order_allocators` are locked.
- After a Guard is created, all rules are locked.
- After a Machine is published, node topology and forwards are locked.
- The operation fails with an error indicating the field cannot be modified.

**Recovery**:
1. Identify which field is immutable.
2. If the field is on a Service:
   - `machine` and `order_allocators` → immutable after publish. Must create a new Service.
   - `description`, `location`, `sales`, `customer_required`, `um` → mutable. Can modify.
3. If the field is on a Guard → all rules immutable. Must create a replacement Guard.
4. If the field is on a Machine → node topology and forwards immutable after publish. Must create a new Machine.
5. Communicate to the user: the only path is creating a new object (Service, Guard, or Machine) with the desired configuration.

**Prevention**: Before publishing, thoroughly test and review all configurations. Use the Export & Review step (R6) to verify. Warn about immutability in the confirmation template (R7). This is documented in §2.3 Publish Confirmation.

---

## Tier Layering

### Novice — Always Confirm, Always Query First

**Profile**: First-time user. Unfamiliar with WoWok safety rules. Needs explicit confirmation for every operation.

**AI Behavior**:
- Always run the full R1-R10 safety dialogue for ON-CHAIN operations.
- Always query token decimals before amount-sensitive operations (never assume).
- Always use the confirmation template (R7) with full operation preview.
- Always set `env.no_cache: true` for sequential operations.
- Always verify object existence before referencing (R3).
- For publish operations: always export and review (R6) before confirming.
- Default to conservative: if any check is uncertain, STOP and ask the user.

**Typical Journey**: R1 (intent) → R2 (account) → R3 (reuse/create) → R4 (permission) → R5 (amount) → R6 (export if publish) → R7 (confirmation) → R8 (call without submission) → R9 (execute) → R10 (verify).

### Advanced — Batch Operations, Incremental Building

**Profile**: Experienced user. Understands WoWok safety rules. Wants efficient operations without redundant checks.

**AI Behavior**:
- Batch related operations: verify all objects in R3 before proceeding.
- For incremental object building: allow step-by-step creation with verification at each step, but don't re-run the full R1-R10 for each step.
- For amount-sensitive operations: query token decimals once, cache for the session.
- For sequential operations: set `no_cache: true` globally for the session.
- For publish operations: export and review, but allow the user to skip detailed review if they've tested independently.
- Use `replaceExistName` strategically during development (with user awareness).
- Support multi-account operations: verify permissions for each account independently.

**Typical Journey**: R1 (intent, batch) → R2 (account, batch) → R3 (reuse/create, batch) → R4 (permission, batch) → R5 (amount, cached) → R6 (export if publish) → R7 (confirmation, batch) → R8-R9 (execute, batch) → R10 (verify, batch).

### Expert — Complex Multi-Object Systems, Circular References

**Profile**: Power user. Builds complex systems with circular references (CREATE object → CREATE Guard → MODIFY object). Needs advanced safety patterns.

**AI Behavior**:
- Support circular reference patterns: CREATE object (without Guard binding) → CREATE Guard (references object by name) → MODIFY object (binds Guard).
- Manage dependency chains: track which objects depend on which, execute in the correct order.
- For multi-object systems: create a dependency graph, execute in topological order.
- Support `replaceExistName` for iterative development with fixed names.
- Support multi-network operations: testnet for development, mainnet for production, with explicit network switching.
- For publish operations: comprehensive readiness check (D4) before proceeding.
- Support custom confirmation thresholds: user-configurable amount thresholds for heightened confirmation.
- Track immutability constraints across the system: warn when a modification would require creating replacement objects.
- Support rollback planning: before irreversible operations, document the recovery path (e.g., "if this publish fails, create a new Service with corrected config").

**Typical Journey**: R1 (intent, system-level) → R2 (account, multi-account) → R3 (reuse/create, dependency graph) → R4 (permission, multi-account) → R5 (amount, multi-token) → R6 (export, full system review) → R7 (confirmation, system-level) → R8-R9 (execute, dependency-ordered) → R10 (verify, system-level handoff).
