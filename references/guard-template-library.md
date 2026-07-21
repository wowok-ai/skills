# Guard Template Library Reference

> Contains 13 scenario templates covering 9 binding scenarios + 1 test scenario.

---

## Template Unified Structure

```typescript
interface GuardTemplate {
    id: string;                       // e.g. "tpl_buy_guard_whitelist"
    name: string;
    description: string;
    scene_id: string;                 // binding scenario ID
    applicable_industries: string[];  // industry tags
    patterns: string[];               // associated Patterns (P02-P17)
    risk_rules: string[];             // associated risk rule IDs
    params: GuardTemplateParam[];     // parameter definitions
    skeleton: GuardSkeleton;          // JSON skeleton with ${param} placeholders
}

interface GuardTemplateParam {
    name: string;
    type: "Address" | "String" | "U64" | "Bool" | "String[]";
    required: boolean;
    description: string;
    default?: string;
    validation?: string;
}
```

---

## The 13 Templates

### 1. `tpl_buy_guard_whitelist` — Whitelist Purchase Validation

| Field | Value |
|-------|-------|
| **Scene** | `service_buy_guard` |
| **Patterns** | P03 (single address), P04 (whitelist), P16 (circular reference) |
| **Industries** | rental, ecommerce, education, travel, subscription |
| **Verifier Level** | level2_identity_set |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `authorized_address` | Address | Yes | Authorized address (P03) or first whitelist address |
| `service_address` | Address | Yes (name for circular ref) | Service object address or name |
| `whitelist` | Address[] | No | P04 whitelist variant, overrides authorized_address |

**Risk Rules:** R-C4-01, R-X1-08

---

### 2. `tpl_allocator_threshold` — Allocation Amount Threshold Validation

| Field | Value |
|-------|-------|
| **Scene** | `service_order_allocators_guard` |
| **Patterns** | P02, P10 |
| **Industries** | ecommerce, rental, education, travel |
| **Verifier Level** | level3_scene_combined |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `order_id` | Address | Yes (submission) | Order address submitted by user |
| `node_names` | String[] | Yes | Expected current node name(s) |
| `service_address` | Address | No | Service address (project binding, strongly recommended) |

**Risk Rules:** R-C3-01, R-X1-05, R-X1-03, R-C3-05 (CRITICAL)

---

### 3. `tpl_allocator_treasury_personal` — Treasury + Personal Address Allocation

| Field | Value |
|-------|-------|
| **Scene** | `service_order_allocators_guard` |
| **Patterns** | P02, P10, P16 |
| **Industries** | insurance, ecommerce, travel, rental, subscription |
| **Verifier Level** | level3_scene_combined |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_names` | String[] | Yes | Expected current node name(s) |
| `service_address` | Address | Yes | Service address (project binding) |
| `treasury_address` | Address | Yes | Treasury address for fund allocation |
| `personal_address` | Address | Yes | Personal address for fund allocation |

**Risk Rules:** R-C3-05, R-C3-06 (CRITICAL), R-X1-05, R-X1-01

---

### 4. `tpl_allocator_identity_set_order_holder` — Order-Holder Identity-Set Allocation (Level 2)

| Field | Value |
|-------|-------|
| **Scene** | `service_order_allocators_guard` |
| **Patterns** | P02, P10, P16 |
| **Industries** | ecommerce, rental, travel, subscription |
| **Verifier Level** | level2_identity_set |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service_name` | string | Yes | Service object name (P16 circular reference, resolved to address after publish) |

**Key Feature:** Level 2 identity-set binding — Signer is `order.owner` (1562, Address) OR `order.agent` (1567, Bool with [Signer] param). Uses `logic_or` to wrap Signer checks. Suppresses R-C4-04 (Level 1 strict binding convenience warning).

**Risk Rules:** R-C3-01, R-C3-05, R-C3-06, R-C4-04

---

### 5. `tpl_allocator_identity_set_service_provider_dynamic` — Service-Provider Identity-Set Allocation with Dynamic Permission (Level 2)

| Field | Value |
|-------|-------|
| **Scene** | `service_order_allocators_guard` |
| **Patterns** | P02, P10, P16 |
| **Industries** | ecommerce, rental, insurance, travel, subscription |
| **Verifier Level** | level2_identity_set |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service_name` | string | Yes | Service object name (P16 circular reference) |

**Key Feature:** Level 2 identity-set binding + dynamic permission address verification. Signer is `permission.owner` (1002, Address) OR `has admin` (1004, Bool with [Signer] param). Permission address is submitted by caller and validated against `service.permission` (1488) — Guard survives permission rotation without rebuilding.

**Risk Rules:** R-C3-01, R-C3-05, R-C3-06, R-C4-04

---

### 6. `tpl_forward_node_check` — Workflow Node State Validation

| Field | Value |
|-------|-------|
| **Scene** | `machine_forward_guard` |
| **Patterns** | P06, P09 |
| **Industries** | rental, ecommerce, education, travel, subscription |
| **Verifier Level** | level3_scene_combined |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `order_id` | Address | Yes (submission) | Order address submitted by user |
| `node_names` | String[] | Yes | Expected current node name(s) |
| `service_address` | Address | No | Service address (project binding, strongly recommended) |
| `timeout_ms` | U64 | No (timelock variant) | Timelock duration in milliseconds |
| `progress_query_id` | U64 | No (default 1272) | Time reference query, default `progress.current_time` (1272) |

**Sub-variants:**
- **Node matching variant**: Uses P09 + P06 to verify progress.current matches expected node. Must include project binding (query 1563 order.service) to suppress R-C3-05.
- **Timelock variant**: Uses P05. Verifies `Clock > progress.current_time + timeout`. Uses query 1272 (progress.current_time), NOT 1271 (progress.session.forward.time) — the latter returns 0 when the forward hasn't occurred yet.

**Risk Rules:** R-C2-01, R-C2-03, R-X1-08; Timelock variant: R-X1-01, R-X1-06, R-C2-03

---

### 7. `tpl_forward_privacy_delivery_proof` — Privacy-Delivery Proof Verification (Strict Mode)

| Field | Value |
|-------|-------|
| **Scene** | `machine_forward_guard` |
| **Patterns** | P10, P15 (broad mode) |
| **Industries** | ecommerce, logistics, service, privacy delivery |
| **Verifier Level** | level3_scene_combined |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service_name` | string | Yes | Service object name (P16 circular reference) |

**Key Feature:** Strict-mode Guard for privacy-sensitive information (delivery details, return addresses, private credentials). Verifier submits a Proof object address (generated by `messenger.submitChainProof`) and an Order address. Three conditions:
1. Signer == proof.signer (submitter accountability)
2. proof.time > order.time (freshness, prevents stale proof replay)
3. order.service == service (project binding, suppresses R-C3-05)

**Broad Mode Alternative:** Uses P15 retained_submission + String submission (Merkle Root). Validates `calc_string_length == 66` (0x prefix + 64 hex chars). Trusts submitter honesty.

**Risk Rules:** R-C3-01, R-C3-05, R-X1-12

---

### 8. `tpl_submission_signer_binding` — Submission Data Signer Binding Validation

| Field | Value |
|-------|-------|
| **Scene** | `progress_submission_guard` |
| **Patterns** | P08, P15 |
| **Industries** | rental, ecommerce, education, travel |
| **Verifier Level** | level1_strict |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `expected_value` | string | Yes | Expected submission value (e.g., node name, status code) |
| `provider_address` | address | Yes | Service provider address (for identity verification) |

**Key Feature:** Validates that the submitting user is a legitimate Progress participant and the submitted value matches expectations. E.g., user submits 'return' for equipment return; Guard verifies submitter is the service provider and operation type is correct.

**Risk Rules:** R-C3-01, R-C3-03, R-X1-12

---

### 9. `tpl_reward_one_time_claim` — One-Time Reward Claim Validation

| Field | Value |
|-------|-------|
| **Scene** | `reward_guard` |
| **Patterns** | P07, P13 |
| **Industries** | ecommerce, education, travel, subscription |
| **Verifier Level** | level3_scene_combined |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `order_id` | Address | Yes (submission) | Order address submitted by user |
| `reward_address` | Address | Yes | Reward object address |
| `expected_node` | String | Yes | Expected node name (e.g., "Wonderful") |
| `service_address` | Address | No | Service address (project binding, recommended) |

**CRITICAL Constraint (R-X1-14):** Must include re-entrancy protection — query 1613 `reward.record has` + `logic_not` wrapping, or 1612 count == 0. Without this → CRITICAL risk.

**Risk Rules:** R-X1-14 (CRITICAL re-entrancy), R-C4-01

---

### 10. `tpl_write_guard_type_check` — Storage Write Type Validation

| Field | Value |
|-------|-------|
| **Scene** | `repository_write_guard` |
| **Patterns** | P08, P11 |
| **Industries** | ecommerce, education, travel, subscription, rental |
| **Verifier Level** | level1_strict |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo_address` | Address | Yes | Repository object address |
| `policy_name` | String | Yes | Repository policy name (e.g., "Condition") |

**Special Constraints (BINDING_02 + BINDING_03):**
- Repository write_guard `id_from_submission` must be Address
- Repository write_guard `data_from_submission` type must match Repository value_type

**Key Issue:** `quote_guard` authentication in `verify_guard` stage always has an empty `impack_list`, so repository queries with quote_guard will fail with `IMPACK_GUARD_NOT_FOUND` in gen_passport flow.

**Risk Rules:** R-C1-03, R-C3-04, R-X1-10, R-X1-14 (LOW)

---

### 11. `tpl_usage_guard_threshold` — Dispute Initiation Threshold Validation

| Field | Value |
|-------|-------|
| **Scene** | `arbitration_usage_guard` |
| **Patterns** | P02, P10 |
| **Industries** | ecommerce, rental, education, travel |
| **Verifier Level** | level3_scene_combined |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `arbitration_address` | Address | Yes | Arbitration object address |
| `threshold` | U64 | Yes | Dispute initiation threshold (e.g., minimum reputation score) |

**Key Constraint:** EntityRegistrar address is fixed at `0xaab`, EntityLinker at `0xaaa` (R-C1-02 system address misuse risk).

**Risk Rules:** R-X1-01, R-X1-07, R-C3-03

---

### 12. `tpl_voting_guard_numeric_weight` — Numeric Voting Weight Validation

| Field | Value |
|-------|-------|
| **Scene** | `arbitration_voting_guard` |
| **Patterns** | P12 |
| **Industries** | ecommerce, rental, education, travel |
| **Verifier Level** | level2_identity_set |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `arbitration_address` | Address | Yes | Arbitration object address |
| `weight_threshold` | U64 | No | Weight comparison threshold (optional) |

**Special Constraint (BINDING_01):** voting_guard's GuardIdentifier must be numeric (U8/U256), otherwise Move layer throws `E_GUARD_IDENTIFIER_NOT_NUMBER`. Root must return a numeric type (e.g., U64), not Bool — the only exception among the 9 binding scenarios.

**CRITICAL Constraint (R-X1-14):** Must include re-entrancy protection — query 1404 `arb.voted has` + `logic_not` wrapping, or 1405 count == 0. Note: 1403 `arb.voted_count` is the total count and **cannot be used** for re-entrancy protection.

**Risk Rules:** R-C3-02 (CRITICAL weight forgery), R-X1-14 (CRITICAL re-entrancy), BINDING_01 (numeric)

---

### 13. `tpl_gen_passport_identity` — Passport Identity Credential Generation Validation

| Field | Value |
|-------|-------|
| **Scene** | `gen_passport_guard` |
| **Patterns** | P03, P14 |
| **Industries** | ecommerce, education, travel, subscription, rental |
| **Verifier Level** | level1_strict |

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `authorized_address` | address | Yes | Authorized address (or use Vec\<Address\> whitelist) |

**Key Feature:** Standalone Guard — does not bind to a Host Object (`host_object: Standalone`). Verifies user identity and generates a signed Passport credential, which can be used as submission data in subsequent operations.

**Constraints:**
- `impack_list` is always empty during verify stage; quote_guard queries will fail
- Can be relied upon by other Guards via `rely` (requires `rep=true`)
- Generated Passport can be used as submission data in subsequent operations

**Risk Rules:** R-C1-01, R-X1-10, R-X1-13

---

## Pattern-to-Template Mapping

| Pattern | Data Source Combination | Typical Templates |
|---------|----------------------|-------------------|
| P02 | Type1 + Type4 | `tpl_allocator_threshold`, `tpl_usage_guard_threshold` |
| P03 | Type1 + Type4 + Type1 constant | `tpl_buy_guard_whitelist`, `tpl_gen_passport_identity` |
| P04 | Type1 + Type4 + Type1 constant | `tpl_buy_guard_whitelist` (whitelist) |
| P05 | Type2 + Type4 + Type1 constant | `tpl_forward_node_check` (timelock) |
| P06 | Type2 + Type1 constant | `tpl_forward_node_check`, `tpl_allocator_threshold` (node matching) |
| P07 | Type3 + Type1 constant | `tpl_reward_one_time_claim` |
| P08 | Type3 + Type4 | `tpl_reward_one_time_claim` (Signer binding), `tpl_submission_signer_binding` |
| P09 | Type2 + Type3 | `tpl_forward_node_check`, `tpl_allocator_treasury_personal` |
| P10 | Type1+2+3+4 | `tpl_reward_one_time_claim` (quadruple verification), `tpl_allocator_treasury_personal` |
| P11 | Type3 + Type1 system address | `tpl_write_guard_type_check` |
| P12 | Type3 + Type4 + Type1 constant | `tpl_voting_guard_numeric_weight` |
| P13 | Type1 + Type2 | `tpl_reward_one_time_claim` (Repository query) |
| P14 | rely only | `tpl_gen_passport_identity` (P14 variant) |
| P15 | retained_submission | `tpl_forward_privacy_delivery_proof` (broad mode), `tpl_submission_signer_binding` |
| P16 | Circular reference | `tpl_buy_guard_whitelist` (circular ref), `tpl_allocator_treasury_personal` |
| P17 | Query parameter translation | `tpl_write_guard_type_check` (parameter translation) |

---

## Scene Distribution

| Scene | Templates |
|-------|-----------|
| `service_buy_guard` | `tpl_buy_guard_whitelist` |
| `service_order_allocators_guard` | `tpl_allocator_threshold`, `tpl_allocator_treasury_personal`, `tpl_allocator_identity_set_order_holder`, `tpl_allocator_identity_set_service_provider_dynamic` |
| `machine_forward_guard` | `tpl_forward_node_check`, `tpl_forward_privacy_delivery_proof` |
| `progress_submission_guard` | `tpl_submission_signer_binding` |
| `reward_guard` | `tpl_reward_one_time_claim` |
| `repository_write_guard` | `tpl_write_guard_type_check` |
| `arbitration_usage_guard` | `tpl_usage_guard_threshold` |
| `arbitration_voting_guard` | `tpl_voting_guard_numeric_weight` |
| `gen_passport_guard` | `tpl_gen_passport_identity` |

---

## Template-to-Risk-Rule Binding (Mandatory Checks)

| Template | Mandatory Risk Rules |
|----------|---------------------|
| `tpl_buy_guard_whitelist` | R-C1-01, R-C3-01, R-C4-01 |
| `tpl_allocator_threshold` | R-X1-01, R-X1-05, R-X1-08 |
| `tpl_allocator_treasury_personal` | R-C3-05, **R-C3-06 (CRITICAL)**, R-X1-05, R-X1-01 |
| `tpl_allocator_identity_set_order_holder` | R-C3-01, R-C3-05, R-C3-06, R-C4-04 |
| `tpl_allocator_identity_set_service_provider_dynamic` | R-C3-01, R-C3-05, R-C3-06, R-C4-04 |
| `tpl_forward_node_check` | R-C2-01, R-C2-03, R-X1-08 |
| `tpl_forward_privacy_delivery_proof` | R-C3-01, R-C3-05, R-X1-12 |
| `tpl_submission_signer_binding` | R-C3-01, R-C3-03, R-X1-12 |
| `tpl_reward_one_time_claim` | R-C1-03, R-X1-01, R-X1-10 |
| `tpl_write_guard_type_check` | R-C1-02, R-C3-03, R-C3-04 |
| `tpl_usage_guard_threshold` | R-X1-01, R-X1-07, R-C3-03 |
| `tpl_voting_guard_numeric_weight` | R-C3-02 (CRITICAL weight forgery), R-C2-01, R-C2-02, BINDING_01 (numeric) |
| `tpl_gen_passport_identity` | R-C1-01, R-X1-10, R-X1-13 |

---

## Template Recommendation Functions

### `suggestTemplateForScene(sceneId)`
Returns the first matching template for a given scene ID.

| Scene | Recommended Template |
|-------|---------------------|
| `service_buy_guard` | `tpl_buy_guard_whitelist` |
| `service_order_allocators_guard` | `tpl_allocator_threshold` (+3 alternatives) |
| `machine_forward_guard` | `tpl_forward_node_check` (+1 alternative) |
| `progress_submission_guard` | `tpl_submission_signer_binding` |
| `reward_guard` | `tpl_reward_one_time_claim` |
| `repository_write_guard` | `tpl_write_guard_type_check` |
| `arbitration_usage_guard` | `tpl_usage_guard_threshold` |
| `arbitration_voting_guard` | `tpl_voting_guard_numeric_weight` |
| `gen_passport_guard` | `tpl_gen_passport_identity` |

### `getTemplatesByScene(sceneId)`
Returns all available templates for a scene (e.g., order_allocators has 4 templates).

### `getTemplatesByIndustry(industryTag)`
Filters templates by industry tag (e.g., `"ecommerce"` returns buy_guard, order_allocator, reward_guard, etc.).

### `validateTemplateParams(template, params)`
Validates user-provided parameters against template definition:
- Required parameters present
- Type matching (Address must be valid Wow address format)
- Numeric range validity (U64 must be ≥ 0)
- String length constraints

---

## Special Pattern Templates

### Retained Submission (P15)
Forward execution retains audit data; caller submits constrained scalar values (not object addresses). Typical use: Machine Forward.guard requiring Merkle Root, signature results, etc.

**Constraint (R-X1-12):** Each `b_submission=true` entry's name must be a complete natural-language description (≥10 characters). A `binding_constraint` field is recommended to describe value rules.

### Circular Reference (P16)
Guard binds to a Host Object and simultaneously queries the Host Object's own fields (e.g., Service.buy_guard querying `service.paused`).

**Workflow:** CREATE host (no guard) → CREATE guard (table references host by name) → MODIFY host (bind guard).

**Constraint (R-X1-13):** Host Object's value in table must use a name (e.g., `"my_service"`) not an address, since the Host Object may not be published yet when Guard is created. `host_object_state` must be `created_unpublished` — if already `published_immutable`, a new Host Object must be created.

### Query Parameter Translation (P17)
Witness query parameter type doesn't match the table-declared type, requiring a type conversion node.

**Conversion Nodes:**

| Node | Source → Target | Typical Use |
|------|----------------|-------------|
| `convert_number_address` | number → Address | U64 timestamp → Address key |
| `convert_address_number` | Address → U256 | Address key → numeric comparison |
| `convert_number_string` | number → String | Numeric → string concatenation |
| `convert_string_number` | String → U256 | String numeric → numeric |
| `convert_safe_u8/u16/u32/u64/u128/u256` | number → width | Width narrowing (overflow errors) |

---

## Witness Reference (9 Types)

| Witness | Name | Source → Target | Hops |
|---------|------|----------------|------|
| 100 | TypeOrderProgress | Order → Progress | 1 |
| 101 | TypeOrderMachine | Order → Machine | 1 |
| 102 | TypeOrderService | Order → Service | 1 |
| 103 | TypeProgressMachine | Progress → Machine | 1 |
| 104 | TypeArbOrder | Arb → Order | 1 |
| 105 | TypeArbArbitration | Arb → Arbitration | 1 |
| 106 | TypeArbProgress | Arb → Progress | 2 |
| 107 | TypeArbMachine | Arb → Machine | 2 |
| 108 | TypeArbService | Arb → Service | 2 |

---

## Verifier Constraint Levels

| Level | Description | Templates |
|-------|-------------|-----------|
| level1_strict | Strict single identity | `tpl_submission_signer_binding`, `tpl_write_guard_type_check`, `tpl_gen_passport_identity` |
| level2_identity_set | Identity set | `tpl_buy_guard_whitelist`, `tpl_allocator_identity_set_order_holder`, `tpl_allocator_identity_set_service_provider_dynamic`, `tpl_voting_guard_numeric_weight` |
| level3_scene_combined | Scene combined, no Signer binding needed | Remaining 7 templates |