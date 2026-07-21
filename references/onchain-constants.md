# On-Chain Constants — Unified Management Reference

> **Status**: Unified management reference for on-chain numeric constants across three layers (Move contracts, SDK, MCP).

## Why Unified Management

Before GLM4, on-chain numeric constants were scattered across three layers:

- **Smart contract layer**: Each `.move` file has its own `const MAX_* = N;` (on-chain authority)
- **SDK layer**: Each `.ts` call file has its own `export const MAX_* = N;` (prone to drift from chain)
- **MCP layer**: Hardcoded magic numbers (`100`, `1000`, etc.) with no import links

This caused drift risk, magic numbers in MCP, and implicit differences between SDK and on-chain values.

**Solution**: SDK is the single authoritative TS definition; MCP imports from SDK; Move contracts remain unchanged.

## 3-Layer Sync Architecture

```
┌──────────────────────┐    import    ┌──────────────────────┐
│ Move smart contracts │ ──────────► │ SDK onchain-constants │
│ (*.move const MAX_*) │              │ (canonical TS source) │
└──────────────────────┘              └──────────┬───────────┘
                                                 │ import
                                                 ▼
                                       ┌──────────────────────┐
                                       │ MCP onchain-constants │
                                       │ (re-export from SDK)  │
                                       └──────────────────────┘
```

### Sync Guarantees

- **SDK ↔ Move**: A spec test parses `.move` files and asserts SDK values match Move `const` declarations
- **MCP ↔ SDK**: The same test asserts MCP import values equal SDK export values
- **CI Integration**: Sync tests run on every PR to prevent drift across all three layers

## 18 Constant Entries

| # | Name | Value | Move Source | Purpose |
|---|------|-------|-------------|---------|
| 1 | `MAX_NODE_COUNT_ONCHAIN` | 200 | `machine.move:23` | Max nodes on-chain (chain authority) |
| 2 | `MAX_NODE_COUNT_SDK` | 100 | (SDK custom) | Stricter limit for SDK/MCP (easier human review) |
| 3 | `MAX_FORWARD_COUNT` | 20 | `machine.move:26` | Max global forwards per Machine |
| 4 | `MAX_FORWARD_ORDER_COUNT` | 20 | `machine.move:21` | Max forwards per pair |
| 5 | `MAX_NODE_PAIR_COUNT` | 40 | `machine.move:22` | Max pairs per node |
| 6 | `USER_DEFINED_PERM_INDEX_START` | 1000 | (convention) | Custom permission_index start (0-999 reserved for built-in) |
| 7 | `MAX_PERM_FOR_ENTITY` | 1000 | `permission.move:15` | Max permissions per Entity |
| 8 | `MAX_ADMIN_COUNT` | 500 | `permission.move:17` | Max admins per Permission object |
| 9 | `MAX_AGENT_COUNT` | 10 | `order.move:12` | Max agents per Order |
| 10 | `MAX_DISPUTE_COUNT` | 10 | `order.move:13` | Max concurrent disputes per Order |
| 11 | `MAX_SHARING_COUNT` | 100 | `allocation.move:17` | Max sharing entries per allocator |
| 12 | `MAX_VOTING_GUARD_COUNT` | 50 | `arbitration.move:25` | Max voting guards per Arbitration |
| 13 | `MAX_POLICY_COUNT` | 50 | `repository.move:22` | Max policies per Repository |
| 14 | `MAX_ID_COUNT_ONCE` | 100 | `repository.move:25` | Max IDs per Repository operation |
| 15 | `MAX_REWARD_COUNT` | 20 | `demand.move:21` + `repository.move:26` | Max rewards per Demand/Repository (same name, same value, different scopes) |
| 16 | `MAX_CONTEXT_REPOSITORY_COUNT` | 30 | `progress.move:23` | Max context repositories per Progress |
| 17 | `MAX_NAMED_OPERATOR_COUNT` | 60 | `progress.move:24` | Max named operators per Forward |
| 18 | `MAX_NAMED_OPERATOR_ADDRESS_COUNT` | 80 | `progress.move:25` | Max addresses per named operator |

> Note: 18 entries total (including `MAX_NODE_COUNT_ONCHAIN` and `MAX_NODE_COUNT_SDK` as two variants), corresponding to 15 unique on-chain constant concepts.

## Naming Conventions

- Constant names match Move names exactly (e.g., `MAX_FORWARD_ORDER_COUNT`, not rewritten)
- When the SDK is intentionally stricter than on-chain: chain value uses `*_ONCHAIN` suffix, SDK value uses `*_SDK` suffix, bare name (e.g., `MAX_NODE_COUNT`) aliases the SDK value
- `USER_DEFINED_PERM_INDEX_START` is a **convention**, not a Move `const` (permission.move implicitly reserves 0-999)

## Special Case: `MAX_REWARD_COUNT`

`MAX_REWARD_COUNT = 20` is defined in both `demand.move:21` (Demand reward cap) and `repository.move:26` (Repository reward cap). Same name and value but semantically independent. If the chain ever diverges, split into `MAX_REWARD_COUNT_DEMAND` and `MAX_REWARD_COUNT_REPOSITORY`.

## Key Design Principles

1. **Move contracts are the ultimate source of truth**: SDK must always align with Move. When a discrepancy is found, **fix the SDK** (unless the Move contract itself has a bug requiring an on-chain upgrade).
2. **SDK is the single authoritative definition**: `onchain-constants.ts` in the SDK is the sole canonical source for the SDK/MCP layer; MCP does not redefine constants.
3. **Explicit imports**: MCP uses explicit imports (not `export *`) for auditability.
4. **Three-way sync**: SDK ↔ Move ↔ MCP are kept consistent via automated tests.
5. **On-chain vs SDK distinction**: When the SDK is stricter than on-chain, use `*_ONCHAIN` / `*_SDK` suffixes to make the difference explicit.
6. **JSDoc with Move source**: Every constant's JSDoc must annotate the source Move file location.
7. **Consumer mapping**: `ONCHAIN_CONSTANT_MCP_CONSUMERS` records where each constant is used in MCP for audit purposes.