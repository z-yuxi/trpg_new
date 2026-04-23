# TRPG Platform — AI 辅助开发提示词文档

> 本文档面向 AI 编程助手（如 Claude / Cursor / Copilot Agent 等），用于在代码修改和持续开发过程中保持一致性和质量。请在每次开发会话开始时加载本文档作为系统上下文。

---

## 一、项目概览

### 技术栈

| 层 | 技术 |
|---|---|
| Monorepo | pnpm workspace，三个包：`shared` / `server` / `client` |
| Server | Express 4 + Socket.IO 4 + Knex 3 (MySQL 8) + ioredis 5 + Zod |
| Client | Vue 3.4 (Composition API `<script setup>`) + Vite 5 + Pinia + Element Plus + TipTap + Vue Flow |
| Shared | TypeScript 类型定义 + 工具函数（Snowflake ID、CSON、ILF、derived-calc、ruleset-merger） |
| 部署 | Docker 多阶段构建 + docker-compose（MySQL + Redis + Node + Nginx） |
| 测试 | Vitest 1.4 + supertest（server e2e） + Vue Test Utils |

### 目录结构约定

```
packages/
  shared/src/
    types/index.ts          # 全局类型定义（User, Campaign, CharacterSheet, ChatMessage 等）
    types/events.ts         # Socket.IO 事件类型（ServerToClientEvents, ClientToServerEvents）
    utils/                  # 公共工具（id.ts, snowflake.ts, cson.ts, ilf.ts, derived-calc.ts, ruleset-merger.ts）
  server/src/
    routes/                 # Express 路由（按资源划分：auth, campaigns, characters, ...）
    services/               # 业务逻辑层（不含 HTTP 概念）
    middleware/             # auth.ts, error-handler.ts
    engine/                 # 规则引擎（原子节点、骰子解析器、图执行器）
    socket/                 # Socket.IO 处理器（chat-handler, user-handler, io-server）
    db/                     # Knex 配置、Redis 客户端、migrations/
    utils/                  # 服务端工具
  client/src/
    views/                  # 页面组件
    components/             # 按域划分：base/, room/, community/, module-editor/, rule-canvas/
    stores/                 # Pinia stores（auth, campaign, message, notification）
    composables/            # Vue composables（useTheme, useBlockRegistry, useRulesetBinding）
    socket/                 # SocketClient 封装
    utils/                  # 客户端工具（api.ts, validators, serializers）
    styles/                 # 设计令牌（tokens.css, theme-day.css, theme-night.css）
    router/                 # Vue Router 配置
```

---

## 二、编码规范与约定（AI 必须遵循）

### 2.1 命名

- 文件名：`kebab-case.ts`（如 `campaign-service.ts`）
- 类型/接口：`PascalCase`（如 `CharacterSheet`）
- 函数/变量：`camelCase`（如 `rowToCampaign`）
- 数据库字段/API 字段：`snake_case`（如 `gm_user_id`）
- 常量：`UPPER_SNAKE_CASE`（如 `PLATFORM_PRESET_COMMAND_NAMES`）
- Vue 组件文件名：`PascalCase.vue`（如 `ChatArea.vue`）

### 2.2 TypeScript

- **严格模式已启用**（`strict: true`），不要添加 `@ts-ignore` 或 `@ts-expect-error`，除非有明确理由并附注释。
- **所有新类型必须定义在 `packages/shared/src/types/index.ts`**，前后端共用。不要在 server 或 client 中重复定义已存在于 shared 的类型。
- **Socket.IO 事件类型必须定义在 `packages/shared/src/types/events.ts`**，新增事件时同时更新 `ServerToClientEvents` 和 `ClientToServerEvents`。

### 2.3 Vue 组件

- 统一使用 `<script setup lang="ts">`，不使用 Options API。
- Props 使用 `defineProps<{ ... }>()` 泛型语法。
- Emits 使用 `defineEmits<{ ... }>()` 泛型语法。
- 组合逻辑提取为 `composables/useXxx.ts`，返回响应式引用和方法。

### 2.4 CSS

- 使用 `tokens.css` 中定义的 CSS 变量，不要硬编码颜色、间距、阴影值。
- 间距：`--space-1` (4px) 到 `--space-10` (40px)。
- 圆角：`--radius-sm` (4px) 到 `--radius-full` (9999px)。
- 阴影：`--shadow-xs` 到 `--shadow-xl`。
- 颜色：语义变量 `--color-primary`, `--surface-card`, `--text-body` 等，不要直接用 `--slate-500` 这类原始色。
- 过渡：`--transition-fast` (150ms), `--transition-normal` (200ms), `--transition-slow` (300ms)。

### 2.5 语言

- **代码注释、日志标签、错误 code 字段**：英文。
- **面向用户的错误消息（message 字段）**：中文。
- **测试描述（describe/it）**：中文。
- 不要在同一个字符串中混合中英文（日志标签 + 中文消息的拼接除外）。

---

## 三、已知问题与修复指南

以下是代码审查中发现的具体问题，按优先级排列。修改时请严格参照示例，保持风格一致。

### P0：阻断性问题

#### 3.1 `@trpg/shared` 类型声明构建问题

**现状**：`type-errors.log` 中有 60+ 条 TS7016 错误，server 包无法找到 `@trpg/shared` 的类型声明。

**根因**：`shared` 包的 `dist/` 目录可能未正确生成，或 pnpm workspace 的依赖链接未正确建立。

**修复方向**：
1. 确认 `packages/shared/tsconfig.json` 中 `declaration: true` 和 `composite: true` 已设置（当前已设置）。
2. 确认 `packages/server/tsconfig.json` 和 `packages/client/tsconfig.json` 中有 `references` 指向 shared：
   ```json
   {
     "references": [{ "path": "../shared" }]
   }
   ```
3. 确认 `packages/server/package.json` 和 `packages/client/package.json` 的 `dependencies` 中有：
   ```json
   "@trpg/shared": "workspace:*"
   ```
4. 构建顺序必须是 `shared → server / client`，在根 `package.json` 的 build 脚本中确认。
5. 验证：运行 `pnpm --filter @trpg/shared build`，检查 `packages/shared/dist/index.d.ts` 是否生成。

#### 3.2 源文件编码损坏

**现状**：存在 6 个 PowerShell 脚本（`fix-quotes.ps1`、`fix-coc7.ps1`、`fix-skills.ps1`、`fix-ruleset.ps1` 等）在字节级别修复 `ruleset-service.ts` 中的乱码字符和引号丢失问题。

**修复方向**：
1. 对 `packages/server/src/services/ruleset-service.ts` 执行全文审查，搜索以下特征：
   - 非 ASCII 乱码字符（如 `锛团` 等 GB2312 误编码）
   - 模板字符串中 `$` 符号缺失（如 `{o['total']}` 应为 `${o['total']}`）
   - 字符串字面量缺少闭合引号
2. 以 UTF-8 without BOM 重新保存所有受影响文件。
3. 在 `.editorconfig` 中明确指定 `charset = utf-8`。
4. 修复完成后删除所有 `fix-*.ps1` 和 `check-*.ps1`、`find-*.ps1` 脚本，不应依赖手工修补脚本。

---

### P1：错误处理统一

#### 3.3 Server 路由错误处理不一致

**现状**：项目已有完善的错误类层次（`AppError` → `ValidationError` / `NotFoundError` / `ForbiddenError` / `BadRequestError`，定义在 `middleware/error-handler.ts`），但路由中大量使用内联 `res.status().json()` 而不是抛出错误类。

**当前写法（不一致的）**：
```typescript
// routes/campaigns.ts — 内联错误响应
if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can update' }); return; }

// catch 中
catch (err: any) {
  res.status(500).json({ error: err?.message ?? 'Create failed' });
}
```

**要求的写法**：
```typescript
import { NotFoundError, ForbiddenError } from '../middleware/error-handler';

// 用错误类 + asyncHandler 包装
const campaign = await campaignService.findById(id);
if (!campaign) throw new NotFoundError('Campaign', id);
if (campaign.gm_user_id !== req.user!.id) throw new ForbiddenError('Only GM can update campaign');
```

**具体改造步骤**：

1. 在 `server/src/middleware/` 中新增 `async-handler.ts`（路由异步包装器），确保 async 路由中的异常自动被 `next(err)` 捕获：
   ```typescript
   import type { Request, Response, NextFunction, RequestHandler } from 'express';

   export function asyncHandler(
     fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
   ): RequestHandler {
     return (req, res, next) => {
       fn(req, res, next).catch(next);
     };
   }
   ```

2. 在 `error-handler.ts` 中新增 `UnauthorizedError`：
   ```typescript
   export class UnauthorizedError extends AppError {
     constructor(message = '认证失败') {
       super(401, 'UNAUTHORIZED', message);
     }
   }
   ```

3. 改造所有路由文件（共 15 个），将 `try/catch + res.status().json()` 模式替换为 `asyncHandler + throw ErrorClass` 模式。需要改造的文件：
   - `routes/auth.ts`
   - `routes/campaigns.ts`（最多内联错误，约 30+ 处）
   - `routes/characters.ts`
   - `routes/modules.ts`
   - `routes/rulesets.ts`
   - `routes/recruitment.ts`
   - `routes/forum.ts`
   - `routes/users.ts`
   - `routes/logs.ts`
   - `routes/notifications.ts`
   - `routes/upload.ts`
   - `routes/occupations.ts`
   - `routes/reports.ts`
   - `routes/gm-notes.ts`

4. Zod 校验失败也统一用错误类：
   ```typescript
   // 之前
   if (!parsed.success) {
     res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
     return;
   }

   // 之后
   if (!parsed.success) {
     throw new ValidationError('输入校验失败', parsed.error.flatten());
   }
   ```

5. 错误响应格式统一为：
   ```json
   {
     "code": "NOT_FOUND",
     "message": "Campaign 'xxx' not found",
     "details": {}
   }
   ```
   不再出现 `{ "error": "..." }` 格式。

---

### P1：日志系统

#### 3.4 引入结构化日志

**现状**：全局使用 `console.log` / `console.error`，约 30+ 处。

**要求**：

1. 安装 `pino`（轻量高性能，适合 Node 服务）：
   ```bash
   pnpm --filter @trpg/server add pino
   ```

2. 创建 `server/src/utils/logger.ts`：
   ```typescript
   import pino from 'pino';

   export const logger = pino({
     level: process.env.LOG_LEVEL ?? 'info',
     transport: process.env.NODE_ENV === 'development'
       ? { target: 'pino-pretty', options: { colorize: true } }
       : undefined,
   });
   ```

3. 全局替换规则：
   - `console.log('[Seed]', ...)` → `logger.info({ module: 'seed' }, ...)`
   - `console.error('[500]', ...)` → `logger.error({ statusCode: 500 }, ...)`
   - `console.error('[chat_message]', ...)` → `logger.error({ handler: 'chat_message' }, ...)`
   - `console.log('Server running on port', ...)` → `logger.info({ port }, 'Server started')`

4. 需要替换的文件清单：
   - `server.ts`（5 处）
   - `middleware/error-handler.ts`（2 处）
   - `socket/chat-handler.ts`（11 处）
   - `db/migrate.ts`（4 处）

---

### P1：安全加固

#### 3.5 Socket.IO CORS

**文件**：`packages/server/src/socket/io-server.ts:11`

**当前**：
```typescript
cors: { origin: '*' },
```

**修改为**：
```typescript
cors: {
  origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
  credentials: true,
},
```

同时在 `docker-compose.yml` 中的 server 环境变量中添加：
```yaml
CORS_ORIGIN: "https://yourdomain.com"
```

#### 3.6 HTTP 接口限流

**现状**：仅 WebSocket chat_message 有限流（5条/秒），HTTP API 无任何限流。

**修复**：在 `server/src/app.ts` 中添加全局限流中间件：
```typescript
import { rateLimit } from 'express-rate-limit';

// 全局限流
app.use('/api', rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' },
}));

// 认证接口更严格的限流
app.use('/api/auth', rateLimit({
  windowMs: 300_000,
  max: 10,
  message: { code: 'RATE_LIMITED', message: '登录尝试过于频繁' },
}));
```

需要安装：`pnpm --filter @trpg/server add express-rate-limit`

#### 3.7 JWT 过期时间与吊销

**文件**：`packages/server/src/services/auth-service.ts`

**当前**：access token 7 天，refresh token 30 天，无吊销机制。

**修改建议**：
- 将 access token 过期时间缩短至 **2 小时**。
- 将 refresh token 过期时间缩短至 **7 天**。
- 在 Redis 中维护一个 refresh token 黑名单（用于登出场景）：
  ```typescript
  async logout(refreshToken: string): Promise<void> {
    const key = `revoked:${refreshToken}`;
    await redis.set(key, '1', 'EX', 7 * 24 * 3600); // 与 refresh token 同寿命
  }

  async refreshTokens(refreshToken: string): Promise<Tokens> {
    const revoked = await redis.get(`revoked:${refreshToken}`);
    if (revoked) throw new UnauthorizedError('Token has been revoked');
    // ... 原有逻辑
  }
  ```

---

### P2：类型安全

#### 3.8 Client Socket 事件处理器去除 `any`

**文件**：`packages/client/src/socket/socket-client.ts`

**现状**：所有 `onXxx` 方法的 handler 参数类型为 `any`，但 `ServerToClientEvents` 已在 shared 中定义了完整类型。

**修改要求**：利用已有的 `TypedSocket` 类型，移除所有 `any`。由于 `TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>`，事件监听器的类型会被自动推断，无需手动指定参数类型：

```typescript
// 之前
onNewMessage(handler: (msg: any) => void): void {
  this.roomSocket?.on('new_message', handler);
}

// 之后 — 使用 ServerToClientEvents 中已定义的类型
import type { ChatMessage, ServerToClientEvents } from '@trpg/shared';

onNewMessage(handler: ServerToClientEvents['new_message']): void {
  this.roomSocket?.on('new_message', handler);
}
```

对以下所有方法执行此修改：
- `onNewMessage` → `new_message` 事件类型
- `onTimeTagAnnounced` → `time_tag_announced` 事件类型
- `onPositionChanged` → `position_changed` 事件类型
- `onCharacterStateSync` → `character_state_sync` 事件类型
- `onMoveApproved` → `move_approved` 事件类型
- `onMoveRejected` → `move_rejected` 事件类型
- `onRateLimited` → `rate_limited` 事件类型
- `onMissedMessages` → `missed_messages` 事件类型
- `onNotificationNew` → `notification_new` 事件类型

#### 3.9 Server `rowToXxx` 函数增加运行时校验

**现状**：所有 service 的 `rowToXxx` 函数用 `as` 强转类型，无运行时校验：
```typescript
function rowToCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: row['id'] as string,          // 如果 id 为 null 则静默传播错误
    name: row['name'] as string,
    ...
  };
}
```

**修改方案**：使用 Zod 创建与业务类型对应的 schema，在水合时校验。在 `packages/server/src/utils/` 下新建 `row-parser.ts`：

```typescript
import { z } from 'zod';

// 通用安全解析函数
export function parseRow<T>(schema: z.ZodType<T>, row: Record<string, unknown>, entity: string): T {
  const result = schema.safeParse(row);
  if (!result.success) {
    logger.warn({ entity, errors: result.error.flatten(), row }, 'Row parse warning');
    // 降级到 as 转换，避免阻断业务
  }
  return result.success ? result.data : (row as unknown as T);
}

// 使用示例（campaign-service.ts）：
const campaignRowSchema = z.object({
  id: z.string(),
  room_code: z.string(),
  name: z.string(),
  ruleset_id: z.string(),
  module_id: z.string().nullable(),
  gm_user_id: z.string(),
  // ...
});
```

注意：此项为渐进式改进，不要求一次性改完所有 service。优先改造 `campaign-service.ts` 和 `character-sheet-service.ts` 这两个核心 service 作为模板，其余文件后续对齐。

---

### P2：优雅关闭与进程管理

#### 3.10 Graceful Shutdown

**文件**：`packages/server/src/server.ts`

**现状**：无 graceful shutdown 逻辑。MySQL 连接池、Redis 连接、Socket.IO 在进程退出时不会被清理。

**需要添加**：
```typescript
import { db } from './db';
import { redis, redisPub, redisSub } from './db/redis';

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received');

  // 1. 停止接受新连接
  httpServer.close();

  // 2. 关闭 Socket.IO
  io.close();

  // 3. 关闭 Redis
  await Promise.all([redis.quit(), redisPub.quit(), redisSub.quit()]);

  // 4. 关闭数据库连接池
  await db.destroy();

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

---

### P2：测试覆盖提升

#### 3.11 Server 端核心逻辑测试

**现状**：仅 9 个测试文件，核心业务逻辑测试薄弱。

**需要新增的测试**（按优先级排列）：

1. **`visibility.test.ts`**
   - 空间场景：只有在该场景的角色 + GM 可见
   - 虚拟场景：未退出的角色可见
   - 大厅：所有人可见
   - `visible_to` 指定用户列表
   - GM 总是可见

2. **`time.test.ts`**
   - `addTime` 跨天进位
   - `storyTimeToMinutes` 和 `compareStoryTime` 边界值
   - `announceTime` 格式校验（非 HH:MM 格式应抛错）

3. **`dice-evaluator.test.ts`**
   - 基本骰子表达式（`3d6`, `1d20+5`）
   - 复合表达式（`2d6+1d4+3`）
   - 边界情况（`0d6`, `1d0`, 负数修正）

4. **`auth-service.test.ts`**
   - Token 生成与验证往返
   - 过期 token 拒绝
   - Refresh token 刷新

5. **`campaign-service.test.ts`**
   - 创建战役并验证 room_code 格式
   - `rowToCampaign` JSON 解析容错

**测试文件存放位置**：`packages/server/src/__tests__/`，文件名格式 `xxx.test.ts`。

#### 3.12 Client 端视图测试

**现状**：11 个测试文件，主要覆盖工具函数和验证器，页面级组件测试缺失。

**建议新增**：
- `Room.spec.ts` — Socket 事件绑定与场景切换逻辑
- `Login.spec.ts` — 表单校验与认证流程
- `CharacterEditor.spec.ts` — 角色卡编辑与保存

---

### P2：注释与文档

#### 3.13 JSDoc 注释要求

**适用范围**：以下类型的代码必须添加 JSDoc 注释。

1. **所有 service 的公开方法**：
   ```typescript
   /**
    * 计算消息在指定场景中的可见用户列表。
    *
    * 规则：
    * - system/announcement 类型：所有人可见
    * - visible_to 非空：仅指定用户 + GM
    * - 空间场景：当前在该场景的角色对应的用户 + GM
    * - 虚拟场景：未退出的角色对应的用户 + GM
    * - 大厅：null（所有人可见）
    */
   async computeVisibility(
     message: ChatMessage,
     sceneParticipantUserIds: string[],
     gmUserId: string
   ): Promise<string[] | null>
   ```

2. **规则引擎原子节点**（`engine/atoms/` 下所有文件）：每个原子必须说明输入输出含义和执行逻辑。

3. **共享工具函数**（`shared/src/utils/`）：说明参数格式和返回值语义。

4. **复杂的 Vue composable**（`composables/useBlockRegistry.ts` 等）：说明使用场景和返回值。

**不需要注释的**：
- 简单 getter/setter
- 类型定义（类型名本身就是文档）
- 测试文件

#### 3.14 API 端点文档

在 `packages/server/src/routes/` 每个路由文件顶部添加端点列表摘要：

```typescript
/**
 * Campaign Routes
 *
 * POST   /api/campaigns              创建战役
 * GET    /api/campaigns              获取当前用户的战役列表
 * POST   /api/campaigns/join         通过房间码加入战役
 * GET    /api/campaigns/:id          获取战役详情
 * PUT    /api/campaigns/:id          更新战役设置（仅 GM）
 * GET    /api/campaigns/:id/scenes   获取战役的场景列表
 * POST   /api/campaigns/:id/scenes   创建场景（仅 GM）
 * ...
 */
```

---

### P3：架构改进

#### 3.15 Client 全局错误边界

**现状**：无 Vue ErrorBoundary，组件内未捕获异常会导致白屏。

**修复**：创建 `client/src/components/base/ErrorBoundary.vue`：

```vue
<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';

const hasError = ref(false);
const errorMessage = ref('');

onErrorCaptured((err: Error) => {
  hasError.value = true;
  errorMessage.value = err.message;
  // 这里后续可接入错误上报
  return false; // 阻止继续向上传播
});

function retry(): void {
  hasError.value = false;
  errorMessage.value = '';
}
</script>

<template>
  <slot v-if="!hasError" />
  <div v-else class="error-boundary">
    <p>页面出现异常</p>
    <p class="error-detail">{{ errorMessage }}</p>
    <button @click="retry">重试</button>
  </div>
</template>
```

在 `App.vue` 中包裹 `<router-view>`：
```vue
<ErrorBoundary>
  <router-view />
</ErrorBoundary>
```

#### 3.16 Room.vue 拆分

**文件**：`packages/client/src/views/Room.vue`（584 行）

**拆分建议**：
- 提取 `composables/useRoomSocket.ts` — 所有 socket 事件绑定与清理逻辑
- 提取 `composables/useRoomState.ts` — 场景列表、角色列表、全局时间等状态管理
- 提取 `composables/useRoomCharacter.ts` — 角色卡查看、角色状态相关
- Room.vue 本身只负责布局编排和组合以上 composable

---

## 四、修改时的检查清单

每次修改代码后，AI 应检查以下事项：

- [ ] 新增的类型是否定义在 `@trpg/shared` 中？
- [ ] 新增的 API 端点是否有 Zod 输入校验？
- [ ] 错误是否通过 `throw new XxxError()` 抛出，而非 `res.status().json()`？
- [ ] 路由 handler 是否使用 `asyncHandler()` 包装？
- [ ] 日志是否使用 `logger.xxx()` 而非 `console.xxx()`？
- [ ] 新增的 CSS 是否使用了 `tokens.css` 中的变量？
- [ ] Socket 事件是否在 `events.ts` 中声明了类型？
- [ ] 公开方法是否有 JSDoc 注释？
- [ ] 是否有对应的测试用例？
- [ ] 面向用户的文本是否为中文？

---

## 五、数据库变更规范

1. 新增 migration 文件命名：`0XX_描述.ts`（序号递增，如 `018_add_user_badges.ts`）。
2. migration 必须实现 `up` 和 `down`。
3. 新增字段默认值不能为 `undefined`，必须为 `null` 或具体值。
4. JSON 类型字段（attributes, skills 等）存储为 `text` / `longtext`，在 service 层做 `JSON.parse`，并在 `rowToXxx` 中做安全解析（try-catch + 空对象兜底）。
5. 索引策略：查询条件中频繁出现的字段必须加索引，复合查询加联合索引。

---

## 六、Git 与协作规范

1. 分支命名：`feat/xxx`、`fix/xxx`、`refactor/xxx`、`test/xxx`。
2. Commit message 格式：`<type>(<scope>): <description>`
   - 示例：`fix(server): unify route error handling with AppError classes`
   - 示例：`feat(shared): add UnauthorizedError to error hierarchy`
   - 示例：`refactor(client): remove any types from SocketClient handlers`
3. 一个 PR 解决一个问题，不要在修错误处理的 PR 中夹带功能修改。

---

## 七、依赖安装命令速查

```bash
# 结构化日志
pnpm --filter @trpg/server add pino
pnpm --filter @trpg/server add -D pino-pretty

# HTTP 限流
pnpm --filter @trpg/server add express-rate-limit

# 完整构建验证
pnpm -r build

# 运行全部测试
pnpm -r test

# 仅运行 server 测试
pnpm --filter @trpg/server test

# 数据库迁移
pnpm --filter @trpg/server migrate
```
