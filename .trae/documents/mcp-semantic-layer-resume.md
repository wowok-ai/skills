# 计划：恢复并完成 MCP 语义层实现

## 摘要

恢复并完成 MCP 语义层（S-3 → S-2 → S-4 → JSON schema 重生成 → vitest），为后续 Phase 1 行业模板（自由职业+租赁）和 MCP 原生 Tauri 本地客户端提供 AI 可直接理解的业务语义基础。

用户最新确认的 5 项战略收敛决策（Phase 1 = 自由职业+租赁；客户端 = MCP 形态本地化优先、不做中心化 web；遥测 = 无需明示同意；模式市场 = 官方审核+社区评分；技术栈 = Tauri 跨平台本地客户端）已记录，将指导后续 Phase 1 计划，**不在本计划范围内**。

## 当前状态分析（基于实际文件读取）

### ✅ S-1 已完成 — base.ts (schema/call)
- `ObjectRoleSchema`（L109-122）：18 值 role enum + relation 子对象
- `FundRoleSchema`（L125-131）：9 值 fund role enum
- `NextActionSchema`（L134-140）：action/reason/tool/prerequisite/priority
- `SemanticSummarySchema`（L143-152）：intent/status/summary/created/modified/released/next_actions/warnings
- `CallResponseErrorSchema`（L155-162）：扩展 `error_code`（9 值 enum）/`retryable`/`recovery_hint`/`related_object`
- `CallOutputSchema`（L229-233）：新增 optional `semantic` 字段
- 类型导出：`ObjectRole`, `FundRole`, `NextAction`, `SemanticSummary`
- `npx tsc --noEmit` 已通过

### 🔄 S-3 半完成
- `semantic.ts` (schema/call)：`SemanticContext` 接口、`ErrorCode` 类型、`ErrorClassification` 接口、`ERROR_RULES` 表（8 规则 + fallback）、`classifyError(errorMsg)` 函数 — **全部已实现**
- `handler.ts` (schema/call)：L7 已 `import { classifyError } from "./semantic.js"` — **import 完成**
- **未完成**：两个 error 分支（L35-45 error 分支、L54-67 tx-failure 分支）仍构建原始 `{ type: "error", error: enrichedError }`，未调用 classifyError、未注入 `error_code`/`retryable`/`recovery_hint`

### ⏳ S-2 未开始
- `semantic.ts` L142-145：`buildSemantic` 仍是占位注释
- `handler.ts`：tx-success 分支（L69-79）和 submission 分支（L83-95）未注入 `semantic`
- `handleCallResult` 签名未扩展 context 参数

### ⏳ S-4 未开始
- `index.ts` (MCP main) `handleOnchainOperations`（L435-710）：
  - 16 个 case（L456-694）：service, machine, progress, repository, arbitration, contact, treasury, reward, allocation, permission, guard, personal, payment, demand, order, gen_passport — 每个调用 `handleCallResult(result)` 无 context
  - catch 块（L697-709）：直接构建 error CallOutput，绕过 handleCallResult（不获得 error 分类）

### ⏳ 其他未开始
- JSON schema 重生成未执行（MCP 客户端无法发现新字段）
- vitest 未配置（package.json 无 test 脚本、无 vitest devDep）

## 提议的变更

### 变更 1 — S-3 完成：handler.ts error 分支接线

**文件**：handler.ts (schema/call)

**1a. Error 分支（当前 L35-45）**

当前代码：
```typescript
if (safeResult && "error" in safeResult) {
    const enrichedError = enrichMoveError(safeResult.error);
    const output: CallOutput = {
        message: `Error: ${enrichedError}`,
        result: { type: "error" as const, error: enrichedError },
    };
    return { content: [...], structuredContent: output };
}
```

改为：
```typescript
if (safeResult && "error" in safeResult) {
    const enrichedError = enrichMoveError(safeResult.error);
    const classified = classifyError(enrichedError);
    const output: CallOutput = {
        message: `Error: ${enrichedError}`,
        result: {
            type: "error" as const,
            error: enrichedError,
            error_code: classified.error_code,
            retryable: classified.retryable,
            recovery_hint: classified.recovery_hint,
        },
    };
    return { content: [...], structuredContent: output };
}
```

**1b. Tx-failure 分支（当前 L54-67）**

同样模式：调用 `classifyError(enrichedError)`，注入 `error_code`/`retryable`/`recovery_hint`。

**为什么**：`handleCallResult` 是所有 onchain 工具构建 CallOutput 的单一 chokepoint。在此处注入一次，所有 16 个 case 自动获得结构化错误分类，驱动 Recover Loop 策略选择。

**验证**：`npx tsc --noEmit` 通过（在 MCP 目录）。

---

### 变更 2 — S-2 实现：buildSemantic + tx-success/submission 分支接线

**文件**：semantic.ts (schema/call)（在 classifyError 之后追加）

**2a. INTENT_RULES 规则表 + inferIntent**

数据驱动的规则表，覆盖 16 个 operation_type。每条规则：`{ operation_type, signals?, intent, confidence }`。signals 是可选的 data 字段检查函数（用于区分同一 operation_type 下的子意图，如 service 的 create vs publish）。

```typescript
interface IntentRule {
    operation_type: string;
    signals?: (data: any) => boolean;  // 可选子意图区分
    intent: string;
    confidence: number;
}

const INTENT_RULES: IntentRule[] = [
    { operation_type: "service", signals: d => d?.publish === true, intent: "publish_service", confidence: 0.95 },
    { operation_type: "service", signals: d => d?.name && !d?.publish, intent: "create_service", confidence: 0.9 },
    { operation_type: "service", intent: "modify_service", confidence: 0.7 },
    { operation_type: "machine", intent: "configure_machine", confidence: 0.9 },
    { operation_type: "progress", intent: "update_progress", confidence: 0.9 },
    { operation_type: "order", signals: d => d?.arb, intent: "apply_arbitration", confidence: 0.9 },
    { operation_type: "order", intent: "manage_order", confidence: 0.85 },
    { operation_type: "payment", intent: "send_payment", confidence: 0.95 },
    { operation_type: "reward", intent: "manage_reward", confidence: 0.9 },
    { operation_type: "demand", intent: "post_demand", confidence: 0.9 },
    { operation_type: "treasury", intent: "manage_treasury", confidence: 0.9 },
    { operation_type: "allocation", intent: "allocate_funds", confidence: 0.9 },
    { operation_type: "permission", intent: "manage_permission", confidence: 0.9 },
    { operation_type: "guard", intent: "configure_guard", confidence: 0.9 },
    { operation_type: "arbitration", intent: "manage_arbitration", confidence: 0.9 },
    { operation_type: "contact", intent: "manage_contact", confidence: 0.9 },
    { operation_type: "repository", intent: "manage_repository", confidence: 0.9 },
    { operation_type: "personal", intent: "manage_personal", confidence: 0.9 },
    { operation_type: "gen_passport", intent: "generate_passport", confidence: 0.95 },
];

function inferIntent(operation_type: string, data: any): string {
    const rules = INTENT_RULES.filter(r => r.operation_type === operation_type);
    // 优先匹配带 signals 的规则
    const signaled = rules.find(r => r.signals && r.signals(data));
    if (signaled) return signaled.intent;
    // 否则取无 signals 的兜底规则
    const fallback = rules.find(r => !r.signals);
    return fallback?.intent ?? operation_type;
}
```

**2b. inferStatus**

```typescript
function inferStatus(safeResult: any): "success" | "partial" | "failed" | "pending_input" {
    // pending_input 由 submission 分支单独处理，此处不返回
    if (safeResult && "error" in safeResult) return "failed";
    if (safeResult && "digest" in safeResult) {
        return safeResult?.effects?.status?.status === "success" ? "success" : "failed";
    }
    return "success";  // data/null/array 分支
}
```

**2c. tagObjectRoles**

strip generics → split "::" → 取最后段 → 映射到 role enum。

```typescript
function objectTypeToRole(objectType: string): ObjectRole["role"] {
    if (!objectType) return "Other";
    const base = objectType.replace(/<.*>/, "").trim();
    const segments = base.split("::");
    const last = (segments[segments.length - 1] || "").toLowerCase();
    const map: Record<string, ObjectRole["role"]> = {
        service: "Service", machine: "Machine", progress: "Progress",
        permission: "Permission", guard: "Guard", order: "Order",
        arb: "Arbitration", arbcase: "ArbCase", messenger: "Messenger",
        contact: "Contact", demand: "Demand", reward: "Reward",
        personal: "Personal", repository: "Repository", treasury: "Treasury",
        discount: "Discount", allocation: "Allocation",
    };
    return map[last] ?? "Other";
}

function tagObjectRoles(objectChanges: any[]): ObjectRole[] {
    if (!Array.isArray(objectChanges)) return [];
    return objectChanges
        .filter(c => c?.objectId || c?.object?.objectId)
        .map(c => {
            const id = c.objectId || c.object?.objectId;
            const type = c.objectType || c.object?.objectType || "";
            return {
                id,
                role: objectTypeToRole(type),
                immutable: c.objectType?.includes("Service") && c.type === "published",
            };
        });
}
```

**2d. tagFundRoles**（基础版，仅 payment/refund/gas 三类）

```typescript
function tagFundRoles(balanceChanges: any[], operation_type: string): FundRole[] {
    if (!Array.isArray(balanceChanges)) return [];
    return balanceChanges
        .filter(c => c?.amount || c?.coinType)
        .map(c => {
            const amount = String(c.amount || "0");
            const isNegative = amount.startsWith("-");
            let role: FundRole["role"] = "other";
            if (operation_type === "payment") role = isNegative ? "payment" : "refund";
            else if (operation_type === "reward") role = isNegative ? "reward" : "release";
            else if (operation_type === "treasury") role = isNegative ? "deposit" : "release";
            else role = isNegative ? "payment" : "release";
            return {
                amount,
                coinType: c.coinType || "",
                role,
                from: c.sender || null,
                to: c.recipient || null,
            };
        });
}
```

**2e. inferNextActions**（数据驱动，覆盖关键 workflow 推进点）

```typescript
interface NextActionRule {
    when: (operation_type: string, data: any, status: string) => boolean;
    action: string;
    reason: string;
    tool?: string;
    priority: "required" | "recommended" | "optional";
}

const NEXT_ACTION_RULES: NextActionRule[] = [
    { when: (ot) => ot === "service", action: "publish the Service when configuration is complete", reason: "Service must be published before customers can order", tool: "onchain_operations (service with publish:true)", priority: "recommended" },
    { when: (ot) => ot === "service", action: "add Machine nodes to define the service workflow", reason: "Machine drives order state transitions", tool: "onchain_operations (machine)", priority: "recommended" },
    { when: (ot) => ot === "machine", action: "bind Progress to track order execution", reason: "Progress provides customer-visible status updates", tool: "onchain_operations (progress)", priority: "recommended" },
    { when: (ot) => ot === "order", action: "wait for customer payment or proceed to allocation", reason: "Order lifecycle: payment → allocation → completion", priority: "optional" },
    { when: (ot) => ot === "demand", action: "wait for presenter submissions or evaluate existing ones", reason: "Demand lifecycle: presenters submit solutions for reward", priority: "optional" },
    { when: (ot) => ot === "reward", action: "deposit funds into the reward pool", reason: "Reward pool must be funded before claimants can withdraw", tool: "onchain_operations (treasury)", priority: "recommended" },
];
```

**2f. inferWarnings**（业务级警告）

```typescript
function inferWarnings(operation_type: string, data: any, safeResult: any): string[] {
    const warnings: string[] = [];
    // 示例：service 未配置 order_allocators
    if (operation_type === "service" && data?.order_allocators === undefined) {
        warnings.push("order_allocators not configured; order funds cannot be distributed automatically");
    }
    // 示例：reward 余额不足
    if (operation_type === "reward" && data?.balance === "0") {
        warnings.push("Reward pool balance is zero; claimants cannot withdraw");
    }
    return warnings;
}
```

**2g. composeSummary**

```typescript
function composeSummary(intent: string, status: string, created: ObjectRole[], modified: ObjectRole[], released: FundRole[], operation_type: string): string {
    const intentVerb = intent.replace(/_/g, " ");
    if (status === "failed") return `Failed to ${intentVerb}`;
    if (status === "pending_input") return `${intentVerb} requires Guard submission to proceed`;
    const parts: string[] = [];
    if (created.length) parts.push(`created ${created.length} object(s)`);
    if (modified.length) parts.push(`modified ${modified.length} object(s)`);
    if (released.length) parts.push(`${released.length} fund movement(s)`);
    return `Successfully ${intentVerb}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}
```

**2h. buildSemantic**（编排函数）

```typescript
export function buildSemantic(safeResult: any, context?: SemanticContext): SemanticSummary | undefined {
    if (!context) return undefined;  // 无 context = 向后兼容，不注入 semantic

    const intent = inferIntent(context.operation_type, context.data);
    const status = inferStatus(safeResult);

    const objectChanges = safeResult?.objectChanges || [];
    const balanceChanges = safeResult?.balanceChanges || [];

    const created = tagObjectRoles(objectChanges.filter((c: any) => c?.type === "created"));
    const modified = tagObjectRoles(objectChanges.filter((c: any) => c?.type === "mutated"));
    const released = tagFundRoles(balanceChanges, context.operation_type);

    const next_actions = NEXT_ACTION_RULES
        .filter(r => r.when(context.operation_type, context.data, status))
        .map(r => ({ action: r.action, reason: r.reason, tool: r.tool, priority: r.priority }));

    const warnings = inferWarnings(context.operation_type, context.data, safeResult);

    return {
        intent,
        status,
        summary: composeSummary(intent, status, created, modified, released, context.operation_type),
        created: created.length ? created : undefined,
        modified: modified.length ? modified : undefined,
        released: released.length ? released : undefined,
        next_actions: next_actions.length ? next_actions : undefined,
        warnings: warnings.length ? warnings : undefined,
    };
}
```

**2i. handler.ts 签名扩展 + tx-success/submission 分支接线**

扩展签名（L30）：
```typescript
export function handleCallResult(result: any, context?: SemanticContext): { content: any[]; structuredContent: CallOutput } {
```

import 扩展（L7）：
```typescript
import { classifyError, buildSemantic, type SemanticContext } from "./semantic.js";
```

Tx-success 分支（L69-79）：注入 `semantic: buildSemantic(safeResult, context)`
Submission 分支（L83-95）：构造固定 semantic：
```typescript
const semantic: SemanticSummary = {
    intent: "guard_submission_required",
    status: "pending_input",
    summary: "Guard verification required — fill the submission data and resubmit",
    next_actions: [{
        action: "fill guard submission data and resubmit via call_with_submission",
        reason: "Guard rejected the call; submission must satisfy the Guard table requirements",
        tool: "onchain_operations (with submission field)",
        priority: "required",
    }],
};
```

**为什么**：per-branch enrichment（非单次末尾调用），因为 tx-success 分支有 objectChanges/balanceChanges/events，submission 分支无交易数据但有固定语义。数据驱动规则表形式（TS const 数组 + signal fns）是 Loop Engineering 演化的最佳形式 — 加规则 = 加数组条目，无需改控制流。

**验证**：`npx tsc --noEmit` 通过（在 MCP 目录）。

---

### 变更 3 — S-4：16 个 call site 接线 + catch 块补丁

**文件**：index.ts (MCP main)

**3a. 16 个 case**（L456-694）

每个 `handleCallResult(result)` → `handleCallResult(result, { operation_type: "<case>", data: validated.data })`

具体 16 处（gen_passport 例外，使用 `{ operation_type: "gen_passport", data: { guard: validated.guard, info: validated.info } }`）：
- service (L461), machine (L497), progress (L504), repository (L511), arbitration (L518), contact (L525), treasury (L532), reward (L541), allocation (L548), permission (L553), guard (L612), personal (L670), payment (L675), demand (L682), order (L689), gen_passport (L693)

**3b. catch 块（L697-709）**

改为路由到 handleCallResult，使 catch 错误也获得 classifyError 分类：
```typescript
} catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return handleCallResult(
        { error: errorMessage },
        { operation_type: (validated as any)?.operation_type, data: (validated as any)?.data }
    );
}
```

注意：`validated` 可能在 strictParse 抛错时未定义，需用可选链 + try-catch 包裹。若 `validated` 未定义，传 `undefined` context（handleCallResult 向后兼容）。

**为什么**：16 个 case 一次性接线，使所有 onchain 操作获得语义层。catch 块路由确保参数验证错误、文件读取错误等也获得结构化分类（如 `invalid_parameter`）。

**验证**：`npx tsc --noEmit` 通过（在 MCP 目录）。

---

### 变更 4 — JSON schema 重生成

**命令**（在 MCP 目录）：
```bash
pnpm generate:schemas
```

**为什么**：MCP 客户端通过 JSON schema 发现工具的输入/输出字段。新增的 `semantic`、`error_code`、`retryable`、`recovery_hint` 必须出现在生成的 JSON schema 中，否则客户端无法感知。

**验证**：检查生成的 JSON schema 文件包含 `semantic` 字段定义。

---

### 变更 5 — vitest 配置 + 4 个 spec 文件

**5a. package.json**（MCP package.json）

devDependencies 添加：
```json
"vitest": "^2.1.0"
```

scripts 添加：
```json
"test": "vitest run",
"test:watch": "vitest"
```

**5b. vitest.config.ts**（新建 MCP vitest.config.ts）

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        include: ["src/**/*.spec.ts"],
    },
});
```

**5c. 4 个 spec 文件**（新建于 MCP __tests__ 目录）

1. `classifyError.spec.ts` — 测试 8 个 error_code 模式匹配 + fallback 到 unknown
2. `inferIntent.spec.ts` — 测试 16 个 operation_type → intent 映射 + signals 子意图区分
3. `tagObjectRoles.spec.ts` — 测试 objectType generics strip、`::` split、last segment → role enum 映射
4. `buildSemantic.spec.ts` — 端到端：构造 mock tx result + context，验证完整 SemanticSummary 结构

**为什么**：vitest 是该 mcp 包的首个测试基础设施。4 个 spec 覆盖语义层核心逻辑，防止规则表回归。

**验证**：`pnpm test` 全部通过。

## 假设与决策

1. **语义层语言**：英文实现（per 用户 E4 决策："英文实现。其他语言 LLM 会自动做处理，语义层核心用英文表达"）
2. **数据驱动规则表**：TS const 数组 + signal fns + confidence（Loop Engineering 最佳演化形式 — 加规则 = 加数组条目，无需改控制流，全类型检查）
3. **向后兼容**：所有新字段 optional；无 context 调用 `handleCallResult` 行为与之前完全一致（`buildSemantic(undefined, undefined)` 返回 `undefined`）
4. **objectType 解析**：strip generics `replace(/<.*>/,"")`，split `"::"`，取最后段 → role enum
5. **单 chokepoint**：`handleCallResult` 是所有 onchain 工具构建 CallOutput 的唯一入口
6. **per-branch enrichment**：buildSemantic 在每个分支单独调用（非单次末尾调用），因为各分支可用数据不同
7. **FundRole 基础版**：仅推断 payment/refund/gas/deposit/release/reward 六类，不涉及完整业务上下文推断（范围外）
8. **Phase 1 行业（自由职业+租赁）+ Tauri 客户端**：本计划范围外，待语义层完成后另立计划

## 范围外（per approved plan）

- bridge/local/query 工具的语义增强（仅 onchain_operations 接线）
- 完整 FundRole 推断（仅基础六类）
- EventSemantic 映射
- 现有字段 description 重写
- Loop Engineering 遥测采集（无 consent 需求已确认，但采集机制另立计划）
- Phase 1 行业模板（自由职业+租赁）
- Tauri 本地客户端

## 验证步骤

1. `npx tsc --noEmit`（在 mcp 目录）— 类型检查通过
2. `pnpm build` — 构建成功（tsc + generate:schemas）
3. `pnpm generate:schemas` — JSON schema 重生成
4. 检查生成的 JSON schema 包含 `semantic` 字段、扩展的 error 字段（`error_code`/`retryable`/`recovery_hint`）
5. `pnpm test` — 4 个 spec 全部通过
6. 向后兼容验证：无 context 调用 `handleCallResult(result)` 返回的 CallOutput 无 `semantic` 字段（与之前一致）

## 任务清单（执行顺序）

- [ ] **S-3a**: handler.ts error 分支接线（L35-45）— 调用 classifyError，注入 error_code/retryable/recovery_hint
- [ ] **S-3b**: handler.ts tx-failure 分支接线（L54-67）— 同上
- [ ] **S-3 验证**: `npx tsc --noEmit`
- [ ] **S-2a**: semantic.ts 实现 INTENT_RULES + inferIntent
- [ ] **S-2b**: semantic.ts 实现 inferStatus, objectTypeToRole, tagObjectRoles, tagFundRoles, NEXT_ACTION_RULES, inferNextActions, inferWarnings, composeSummary
- [ ] **S-2c**: semantic.ts 实现 buildSemantic
- [ ] **S-2d**: handler.ts 扩展签名（handleCallResult + context 参数）+ import buildSemantic/SemanticContext + tx-success 分支注入 semantic + submission 分支注入固定 semantic
- [ ] **S-2 验证**: `npx tsc --noEmit`
- [ ] **S-4a**: index.ts 16 个 case 传 context（service/machine/progress/repository/arbitration/contact/treasury/reward/allocation/permission/guard/personal/payment/demand/order/gen_passport）
- [ ] **S-4b**: index.ts catch 块路由到 handleCallResult
- [ ] **S-4 验证**: `npx tsc --noEmit`
- [ ] **schema 重生成**: `pnpm generate:schemas`，验证 JSON schema 包含新字段
- [ ] **vitest 配置**: package.json 添加 vitest devDep + test 脚本；新建 vitest.config.ts
- [ ] **vitest spec 1**: classifyError.spec.ts
- [ ] **vitest spec 2**: inferIntent.spec.ts
- [ ] **vitest spec 3**: tagObjectRoles.spec.ts
- [ ] **vitest spec 4**: buildSemantic.spec.ts
- [ ] **最终验证**: `pnpm build` + `pnpm test` + 检查生成的 JSON schema
