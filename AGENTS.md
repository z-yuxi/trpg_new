# AGENTS.md — 共叙平台（代码包A）开发指南

> 本文档是写给 AI 编程助手的项目说明书。
> 在动手修改任何代码之前，请先阅读对应章节的设计文档。

---

## 1. 项目定位

**共叙**是一个 TRPG（桌面角色扮演）社区平台，提供：
- 跑团招募与日程协调
- 实时聊天房间（带骰子引擎）
- 模组编辑器与规则配方系统
- AI Agent 集成（通过 MCP Bridge 接入代码包B）

本仓库为**代码包A**（主平台后端 + 前端），与**代码包B**（AI Agent 调度框架）通过 API 契约解耦。

---

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 后端运行时 | Node.js ≥ 20，TypeScript 5.4，ESM（`node16` moduleResolution） |
| Web 框架 | Express 4 |
| 实时通信 | Socket.IO 4 |
| ORM / 查询 | Knex.js（MySQL） |
| 认证 | JWT（access 15min + refresh 7d），passport-jwt |
| 前端 | Vue 3 + Vite，`@trpg/client` |
| 共享类型 | `@trpg/shared`（`packages/shared/`） |
| 包管理 | pnpm workspaces |
| 测试 | Vitest + supertest；E2E 使用内存 mock DB |

---

## 3. Monorepo 结构

```
packages/
  server/          # @trpg/server  — Express 后端
    src/
      routes/      # API 路由（已按 campaigns/recruitment/engine 拆分）
      services/    # 业务逻辑层
      middleware/  # 认证、限流、日志
      engine/      # 骰子引擎 + GraphExecutor（规则配方）
      db/          # Knex 实例 + migrations/
      socket/      # Socket.IO 命名空间处理器
      utils/       # encryption.ts, structured-logger.ts 等
      types/       # express.d.ts（扩展 Express.Request）
      config/      # features.ts（功能开关）
      __tests__/   # 所有测试（e2e/, security/, characterization/ ...）
  client/          # @trpg/client  — Vue 3 前端
  shared/          # @trpg/shared  — 类型定义（User, Campaign, Message ...）
docs/
  design/          # 产品设计文档（权威规范）
  api-contracts/   # OpenAPI YAML（代码包A ↔ 代码包B 接口契约）
  b_docs/          # 附录 R01：AI Agent 框架设计规范
```

---

## 4. 开发命令

```bash
# 启动
pnpm dev:server          # 后端 (ts-node / tsx watch)
pnpm dev:client          # 前端 Vite

# 构建
pnpm build               # 全量构建（-r）
pnpm --filter @trpg/server build

# 测试
pnpm --filter @trpg/server test --run         # 单次全量
pnpm --filter @trpg/server test -- <文件名>   # 单文件

# 代码检查
pnpm lint
pnpm lint:terms          # 术语一致性（scripts/lint-terminology.ts）

# 数据库迁移验证
pnpm verify:migrations
```

---

## 5. 核心设计原则

### 5.1 先读文档，再写代码
修改任何功能前必须对照 `docs/design/` 中的对应附录：

| 功能区 | 权威文档 |
|---|---|
| 招募系统状态机 | `附录 C01：招募系统状态机图（v2.0）` |
| 规则引擎 / 骰子 | `附录 D01：规则引擎核心设计` |
| 消息可见性策略 | `附录 C：跑团房间交互设计` §可见性 |
| ID 设计规范 | `附录 A01：ID 设计规范` |
| AI Agent 接口契约 | `docs/api-contracts/agent-mcp-bridge.yaml` |
| Agent 角色/权限 | `docs/b_docs/附录 R01：AI Agent框架设计规范.md` |

### 5.2 ESM 导入规范
`moduleResolution: node16` — TypeScript 文件里导入本地模块**必须加 `.js` 扩展名**：
```typescript
// ✅ 正确
import { phoneHmac } from '../../utils/encryption.js';
// ❌ 错误（会导致 TS2835 build 失败）
import { phoneHmac } from '../../utils/encryption';
```

### 5.3 安全常量单一来源
引擎执行限制全部定义在 `src/engine/sandbox-limits.ts`，**禁止在其他文件直接写数字字面量**：
- `DICE_MAX_COUNT = 100`，`DICE_MAX_SIDES = 10000`
- `GRAPH_MAX_NODES = 200`
- `EXEC_TIMEOUT_MS = 500`，`MEMORY_LIMIT_MB = 64`
- `MAX_RECURSION_DEPTH = 16`，`MAX_LOOP_ITERATIONS = 1000`

### 5.4 Auth 类型安全
- 扩展类型：`src/types/express.d.ts`（`Express.Request.user?: User`）
- 路由内获取已认证用户：`import { getAuthedUser } from '../middleware/auth-typed.js'`
- **禁止** `(req as any).user`

### 5.5 功能开关
所有 feature flag 定义在 `src/config/features.ts`（`FEATURES` 常量），不要在业务代码里直接读 `process.env`。

### 5.6 手机号加密
- 明文手机号**禁止**存库；入库前调用 `encryptPhone()`，查询用 `phoneHmac()` 盲索引
- 实现：`src/utils/encryption.ts`

---

## 6. AI Agent 集成（MCP Bridge）

本平台通过 `POST /api/agent/*` 接入代码包B（参见 `docs/api-contracts/agent-mcp-bridge.yaml`）：

| 端点 | 功能 |
|---|---|
| `POST /api/posts` | Agent 以机器人 UID 发帖 |
| `POST /api/comments` | Agent 回复评论 |
| `POST /api/help/chat` | 智能客服对话（L2 权限） |
| `POST /api/help/faq` | FAQ 查询 |
| `POST /api/agent/daily-report` | 每日运营报告（L3 权限） |
| `POST /api/agent/legal-search` | 法律条文检索（L3 权限） |
| `POST /api/agent/evidence-analysis` | 证据分析（L3 权限） |

Agent 权限分级（`docs/b_docs/附录 R01` §3.4）：
- **L2**：前台社区成员（迎/圭/寻/砚）使用机器人 UID 的 JWT Token
- **L3**：后台治理 Agent（AB/OS/LX）使用管理后台专用 API Key
- 代码包A 的 `agent-mcp-bridge.ts` 路由负责验证权限级别

---

## 7. 测试规范

- **单元 / 集成测试**：`packages/server/src/__tests__/` 下各子目录
- **E2E**：`__tests__/e2e/`，使用 `setup.ts` 中的内存 mock DB（**不连接真实 MySQL**）
- **基线快照**（characterization tests）：`__tests__/characterization/`，修改前先运行，确认基线
- **安全测试**：`__tests__/security/`，关注 401/403 边界、注入防护

⚠️ `setup.ts` 中 `registerAndLoginAsAdmin()` 使用 `phoneHmac` 盲索引查找用户，动态 import 必须写 `encryption.js` 扩展名。

---

## 8. 常见坑

| 坑 | 解决方案 |
|---|---|
| `TS2835` import 缺扩展名 | 所有本地 import 加 `.js` |
| `(req as any).user` 类型泄漏 | 改用 `req.user!` 或 `getAuthedUser(req)` |
| 引擎常量魔法数字 | 改从 `sandbox-limits.ts` 导入 |
| 招募状态流转写错 | 核对 `附录 C01` 状态机图 |
| 手机号明文存表 | 必须加密，见 `utils/encryption.ts` |
| build 报 `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` | 先查 `pnpm --filter @trpg/server build` 的 TS 错误 |

---

## 9. 提交规范

```
<type>(<scope>): <summary>

type: feat | fix | refactor | test | docs | security | perf | chore
scope: server | client | shared | engine | auth | recruitment | ...
```

---

## 10. 禁止事项清单

- ❌ 在非 `sandbox-limits.ts` 的文件里硬编码引擎数字常量
- ❌ `(req as any).user` —— 改用 `express.d.ts` 扩展类型
- ❌ 明文手机号存库
- ❌ 在 PII 字段（手机/邮箱/IP）的日志里输出明文（见 `log-sanitizer.ts`）
- ❌ 修改招募状态流转逻辑前不核对 `附录 C01` 状态机
- ❌ `import ... from '../../utils/xxx'`（没有 `.js`）
