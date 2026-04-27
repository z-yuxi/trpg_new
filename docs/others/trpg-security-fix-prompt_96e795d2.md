# TRPG 项目安全修缮指令手册

> 本文档是一份分阶段、可逐步执行的提示词，供 AI 按优先级修复 trpg_new 项目中经代码审计确认的安全漏洞。每个任务均附有精确的文件路径、行号和当前缺陷代码，确保可追溯、可验证。

---

## 使用说明

- 按 Phase 顺序执行，Phase 1 为最高优先级（可被利用的安全漏洞），Phase 4 为长期优化。
- 每个任务标注了 `[文件]`、`[行号]`、`[当前代码]` 和 `[修复要求]`，直接定位修改点。
- 修改完成后运行项目已有测试 `pnpm --filter server test` 验证无回归。
- 每个 Phase 完成后提交一次 commit，message 格式：`fix(security): Phase N - 简要描述`。

---

## Phase 1：紧急修复 —— 授权与访问控制（可直接被利用的漏洞）

### 任务 1.1：为 Campaign 路由添加归属权限校验

**问题**：所有 `/api/campaigns/:id/*` 子路由仅通过 `authMiddleware` 验证用户已登录，未校验用户是否为该 Campaign 的 GM 或成员。任意登录用户可通过猜测 ID 读写任意跑团的全部数据。

**[文件]** `packages/server/src/routes/campaigns.ts`
**[当前代码]** 第 11 行仅有全局认证：
```typescript
router.use(authMiddleware);
```
第 60-67 行（GET /:id）、第 70-77 行（PUT /:id）、第 90-98 行（POST /:id/scenes）、第 124-133 行（POST /:id/npcs）、第 146-154 行（PUT /:id/npcs/:npcId）、第 157-180 行（GET /:id/messages）、第 183-190 行（GET /:id/round-state）、第 193-202 行（GET /:id/position-history）均无归属校验。

**对比参考**：`packages/server/src/routes/characters.ts` 已正确实现归属校验：
```typescript
if (sheet.user_id !== req.user!.id) {
  res.status(403).json({ error: 'Forbidden' });
  return;
}
```

**[修复要求]**：

1. 在 `packages/server/src/services/campaign-service.ts` 中新增成员校验方法：
```typescript
async isMemberOrGm(campaignId: string, userId: string): Promise<boolean> {
  // 检查是否为 GM 或 assistant_gm_ids 中的成员
  // 或在 character_sheets 中拥有属于该 campaign 的角色
}

async isGm(campaignId: string, userId: string): Promise<boolean> {
  // 仅检查是否为 gm_user_id 或 assistant_gm_ids 中的成员
}
```

2. 新建中间件 `packages/server/src/middleware/campaign-auth.ts`，提供两个中间件函数：
   - `requireCampaignMember`：校验 `req.user.id` 是否为该 campaign 的 GM 或成员，否则返回 403
   - `requireCampaignGm`：校验 `req.user.id` 是否为该 campaign 的 GM，否则返回 403

3. 在 `campaigns.ts` 中为每个 `/:id` 子路由应用对应中间件：
   - **读取类**（GET /:id, GET /:id/scenes, GET /:id/npcs, GET /:id/messages, GET /:id/round-state, GET /:id/position-history, GET /:id/scenes/connections）→ 使用 `requireCampaignMember`
   - **写入类**（PUT /:id, POST /:id/scenes, POST /:id/scenes/connections, POST /:id/npcs, PUT /:id/npcs/:npcId）→ 使用 `requireCampaignGm`

4. 为 `POST /join` (第 45-57 行) 增加逻辑：加入成功后应在数据库中记录用户与 campaign 的成员关系，而非仅返回 campaign 数据。

---

### 任务 1.2：为 Socket join_room 添加权限校验

**问题**：`join_room` 事件处理中，客户端传入任意 `campaign_id` 和 `character_id` 即可加入房间，无任何归属校验。攻击者可监听任意跑团的实时消息、伪装任意角色发言。

**[文件]** `packages/server/src/socket/chat-handler.ts`
**[当前代码]** 第 24-37 行：
```typescript
socket.on('join_room', async (data) => {
  const { campaign_id, character_id, last_event_id } = data;
  socket.data.campaignId = campaign_id;
  socket.data.characterId = character_id;
  socket.join(`campaign:${campaign_id}`);
  // ... 无任何权限检查
});
```

**[修复要求]**：

1. 在 `join_room` 处理器中，`socket.join()` 之前增加以下校验：
```typescript
// 校验用户是否为该 campaign 的 GM 或成员
const isMember = await campaignService.isMemberOrGm(campaign_id, userId);
if (!isMember) {
  socket.emit('error_message', { message: '无权加入该房间' });
  return;
}
```

2. 校验 `character_id` 归属——如果提供了 character_id，需验证该角色属于当前用户：
```typescript
if (character_id) {
  const sheet = await db('character_sheets')
    .where({ id: character_id, user_id: userId })
    .first();
  if (!sheet) {
    socket.emit('error_message', { message: '角色不属于当前用户' });
    return;
  }
}
```

3. 对 `gm_approve_move`（第 251 行）和 `gm_reject_move`（第 271 行）增加 GM 身份校验。当前这两个处理器**没有**像 `gm_advance_time`（第 137 行 `campaign.gm_user_id !== userId`）那样校验调用者身份：
```typescript
// gm_approve_move 和 gm_reject_move 中需增加：
const campaign = await db('campaigns').where({ id: move.campaign_id }).first();
if (!campaign || campaign.gm_user_id !== userId) return;
```

---

### 任务 1.3：为 HTTP 认证接口添加速率限制

**问题**：`RedisKeys.rateLimit` 已定义（`packages/server/src/db/redis.ts` 第 33 行），但仅在 WebSocket 聊天中使用（`chat-handler.ts` 第 57-63 行）。所有 HTTP 接口（登录、注册、刷新令牌、加入跑团）完全无限流。

**[文件]** `packages/server/src/routes/auth.ts`
**[当前代码]** 第 20、37、52 行的三个路由处理器均无任何限流逻辑。

**[文件]** `packages/server/src/routes/campaigns.ts`
**[当前代码]** 第 45 行 `POST /join` 也无限流——攻击者可遍历房间码。

**[修复要求]**：

1. 创建通用的限流中间件 `packages/server/src/middleware/rate-limit.ts`：
```typescript
import { redis, RedisKeys } from '../db/redis';
import type { Request, Response, NextFunction } from 'express';

export function rateLimit(opts: {
  windowSeconds: number;  // 时间窗口
  maxRequests: number;    // 最大请求数
  keyPrefix: string;      // Redis key 前缀
  keyExtractor?: (req: Request) => string;  // 提取限流键（默认用 IP）
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${opts.keyPrefix}:${opts.keyExtractor?.(req) ?? req.ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, opts.windowSeconds);
    if (count > opts.maxRequests) {
      res.status(429).json({
        error: '请求过于频繁，请稍后再试',
        retry_after: opts.windowSeconds,
      });
      return;
    }
    next();
  };
}
```

2. 在 `auth.ts` 中应用：
   - `POST /login`：每 IP 每分钟最多 10 次（防暴力破解）
   - `POST /register`：每 IP 每小时最多 20 次（防批量注册）
   - `POST /refresh`：每用户每分钟最多 30 次

3. 在 `campaigns.ts` 的 `POST /join` 中应用：每 IP 每分钟最多 20 次（防房间码遍历）。

---

### 任务 1.4：消除硬编码凭据的静默回退

**问题**：数据库配置在环境变量缺失时静默使用弱默认凭据，而非像 JWT_SECRET 一样强制退出。

**[文件]** `packages/server/src/db/knex-config.ts`
**[当前代码]** 第 9-10 行：
```typescript
user: process.env.DB_USER ?? 'trpg',
password: process.env.DB_PASSWORD ?? 'trpg_password',
```

**[文件]** `docker-compose.yml`
**[当前代码]** 第 9-12、27、57-61 行均有硬编码默认值：
```yaml
MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-rootpass}
MYSQL_PASSWORD: ${MYSQL_PASSWORD:-trpgpass}
REDIS_PASSWORD: ${REDIS_PASSWORD:-redispass}
JWT_SECRET: ${JWT_SECRET:-changeme_in_production}
```
第 14 行和第 29 行将 MySQL 3306 和 Redis 6379 端口绑定到宿主机。

**[修复要求]**：

1. 修改 `knex-config.ts`，在生产环境下强制要求环境变量：
```typescript
if (process.env.NODE_ENV === 'production') {
  if (!process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD environment variable is required in production');
  }
}
```

2. 修改 `docker-compose.yml`：
   - 移除 `JWT_SECRET`、`MYSQL_ROOT_PASSWORD`、`MYSQL_PASSWORD`、`REDIS_PASSWORD` 的默认值回退，改为必须显式设置（使用 `${VAR:?error message}` 语法）
   - 将 MySQL 和 Redis 的端口绑定改为仅内部网络访问（移除 `ports` 映射，或绑定到 `127.0.0.1`）：
     ```yaml
     ports:
       - "127.0.0.1:3306:3306"
     ```

3. 在项目根目录添加 `.env.production.example`，列出所有必须配置的环境变量及说明。

---

## Phase 2：重要缺陷 —— 数据一致性与稳定性

### 任务 2.1：为 Campaign 创建引入数据库事务

**问题**：创建 Campaign 包含两步独立数据库操作，无事务保护。若第二步失败，数据库中会留下无大厅场景的"半成品"Campaign。

**[文件]** `packages/server/src/services/campaign-service.ts`
**[当前代码]** 第 51-76 行：
```typescript
await db('campaigns').insert({ ... });

// Create default lobby scene
await this.createScene({
  campaign_id: id,
  name: '大厅',
  type: 'lobby',
  history_visibility: 'all',
});
```

**[修复要求]**：

使用 Knex 事务包裹：
```typescript
async create(params: { ... }): Promise<Campaign> {
  const id = generateId();
  const room_code = await this.generateUniqueRoomCode();

  await db.transaction(async (trx) => {
    await trx('campaigns').insert({ ... });

    const sceneId = generateId();
    await trx('scenes').insert({
      id: sceneId,
      campaign_id: id,
      name: '大厅',
      type: 'lobby',
      history_visibility: 'all',
      visible_history_count: 50,
    });
  });

  return this.findById(id) as Promise<Campaign>;
}
```

同时检查 `generateUniqueRoomCode()`（第 128-135 行）的竞态条件——当前是非原子的读后写模式，应在事务内使用数据库唯一约束 + 重试来保证唯一性。

---

### 任务 2.2：为 JSON.parse 添加错误保护

**问题**：多处 `JSON.parse` 调用未被 `try-catch` 包裹，数据库中存储的损坏 JSON 会导致服务崩溃。

**[文件]** `packages/server/src/services/campaign-service.ts`
**[当前代码]**：
- 第 13-14 行（`assistant_gm_ids`）：
  ```typescript
  assistant_gm_ids: typeof row['assistant_gm_ids'] === 'string'
    ? JSON.parse(row['assistant_gm_ids'] as string)
    : row['assistant_gm_ids'] as string[],
  ```
- 第 16-17 行（`global_story_time`）：同上模式
- 第 173-174 行（`execute_at_story`）：同上模式

**[文件]** `packages/server/src/routes/campaigns.ts`
**[当前代码]** 第 173-175 行（GET /:id/messages 中的 JSON 解析）：
```typescript
visible_to: m.visible_to ? JSON.parse(m.visible_to as string) : null,
story_time: m.story_time ? JSON.parse(m.story_time as string) : null,
metadata: m.metadata ? JSON.parse(m.metadata as string) : null,
```

**[文件]** `packages/server/src/socket/reconnection-handler.ts`
**[当前代码]** 第 43-45 行：
```typescript
visible_to: row.visible_to ? JSON.parse(row.visible_to as string) : null,
story_time: row.story_time ? JSON.parse(row.story_time as string) : null,
metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
```
以及第 65 行：
```typescript
const globalTime = campaignRow?.global_story_time
  ? JSON.parse(campaignRow.global_story_time as string)
  : { day: 1, hour: 8, minute: 0 };
```

**[修复要求]**：

1. 创建工具函数 `packages/server/src/utils/safe-json.ts`：
```typescript
export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value);
  } catch {
    console.error(`Failed to parse JSON: ${value.slice(0, 100)}`);
    return fallback;
  }
}
```

2. 将上述所有 `JSON.parse` 调用替换为 `safeJsonParse`，并为每个字段提供合理的默认值：
   - `assistant_gm_ids` → 默认 `[]`
   - `global_story_time` → 默认 `{ day: 1, hour: 8, minute: 0 }`
   - `execute_at_story` → 默认 `{ day: 1, hour: 8, minute: 0 }`
   - `visible_to` → 默认 `null`
   - `story_time` → 默认 `null`
   - `metadata` → 默认 `null`

---

### 任务 2.3：统一错误处理，防止信息泄露

**问题**：错误处理不一致，部分接口直接将 `err.message` 返回给客户端，可能暴露数据库错误、堆栈等敏感信息。

**[文件]** `packages/server/src/routes/auth.ts`
**[当前代码]** 第 31 行，通过字符串匹配判断状态码：
```typescript
const status = err?.message?.includes('已注册') ? 409 : 400;
res.status(status).json({ error: err?.message ?? 'Registration failed' });
```

**[文件]** `packages/server/src/routes/campaigns.ts`
**[当前代码]** 多处（第 30、40、75、85 等）直接返回 err.message：
```typescript
res.status(500).json({ error: err?.message ?? 'Create failed' });
```

**[文件]** `packages/client/src/utils/api.ts`
**[当前代码]** 第 15-28 行，后端错误消息直接传播到前端：
```typescript
const body = await res.json();
message = body.message ?? body.error ?? message;
throw new Error(message);
```

**[修复要求]**：

1. 创建自定义错误类 `packages/server/src/utils/app-error.ts`：
```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public userMessage: string,  // 安全的、可展示给用户的消息
    public internalMessage?: string  // 仅记录日志的详细信息
  ) {
    super(userMessage);
  }
}
```

2. 在 `auth.ts` 第 31 行修改注册错误处理，使用 `AppError` 或自定义错误码，不再依赖字符串匹配：
```typescript
// user-service.ts 中抛出：
throw new AppError(409, '该手机号已注册');
// auth.ts 中捕获：
catch (err) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.userMessage });
  } else {
    res.status(400).json({ error: '注册失败' });
  }
}
```

3. 创建全局错误处理中间件 `packages/server/src/middleware/error-handler.ts`：
   - 生产环境：仅返回通用错误消息和状态码，将详细错误写入日志
   - 开发环境：可返回详细信息辅助调试

4. 在 `campaigns.ts` 的所有 `catch` 块中，不再直接返回 `err?.message`，改为返回固定的业务错误消息。

---

### 任务 2.4：对命令解析器进行输入净化

**问题**：`parseCommand` 解析 `key=value` 时，key 和 value 均未做任何过滤，存在原型污染风险。

**[文件]** `packages/server/src/engine/command-parser.ts`
**[当前代码]** 第 47-54 行：
```typescript
for (const part of restParts) {
  const eqIdx = part.indexOf('=');
  if (eqIdx > 0) {
    const key = part.slice(0, eqIdx);
    const value = part.slice(eqIdx + 1);
    params[key] = value;
  }
}
```
注意：命令名（第 30 行）有正则校验 `/^[a-z_][a-z0-9_]*$/`，但 key 没有。

**[修复要求]**：

1. 对 key 增加与命令名相同的格式校验：
```typescript
if (!key.match(/^[a-z_][a-z0-9_]*$/)) {
  throw new Error(`Invalid parameter key: "${key}"`);
}
```

2. 对 value 增加长度限制（如最大 200 字符）。

3. 使用 `Object.create(null)` 代替 `{}` 来创建 params 对象，从根本上防止原型污染：
```typescript
const params: Record<string, string> = Object.create(null);
```

---

## Phase 3：认证机制加固

### 任务 3.1：增强密码策略

**[文件]** `packages/server/src/routes/auth.ts`
**[当前代码]** 第 10 行：
```typescript
password: z.string().min(6),
```

**[修复要求]**：

增加密码复杂度校验：
```typescript
password: z.string()
  .min(8, '密码至少8位')
  .regex(/[a-zA-Z]/, '密码必须包含字母')
  .regex(/[0-9]/, '密码必须包含数字'),
```

---

### 任务 3.2：增强 Refresh Token 安全性

**[文件]** `packages/server/src/services/auth-service.ts`
**[当前代码]** 第 70-77 行：
```typescript
async refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const payload = this.verifyRefreshToken(refreshToken);
  const user = await userService.findById(payload.userId);
  if (!user) {
    throw new Error('User not found');
  }
  return this.generateTokens(user);
}
```
当前问题：同一个 refresh_token 在 30 天内可无限次重复使用，无轮换、无黑名单。

**[修复要求]**：

1. 在数据库中新建 `refresh_tokens` 表：
```sql
CREATE TABLE refresh_tokens (
  id VARCHAR(26) PRIMARY KEY,
  user_id VARCHAR(26) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,  -- 存储 token 的 SHA-256 哈希
  expires_at DATETIME NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

2. 修改 `generateTokens`：生成 refresh_token 时同时将其哈希存入数据库。

3. 修改 `refreshTokens`：
   - 验证 JWT 签名后，查询数据库确认该 token 未被吊销（`revoked = FALSE`）
   - 签发新 token 对后，将旧 refresh_token 标记为已吊销（`revoked = TRUE`），实现 **Token 轮换**
   - 如果检测到已被吊销的 token 被再次使用，吊销该用户的所有 refresh_token（可能的 token 泄露）

4. 提供 `logout` 接口，吊销当前 refresh_token。

---

### 任务 3.3：修复注册接口的手机号枚举泄露

**[文件]** `packages/server/src/routes/auth.ts`
**[当前代码]** 第 31 行：
```typescript
const status = err?.message?.includes('已注册') ? 409 : 400;
```
注册时返回 409 状态码明确告知攻击者该手机号已注册。

**[修复要求]**：

无论手机号是否已注册，统一返回相同的响应格式和状态码（如 200），但仅对实际新注册的用户发送验证短信。或者至少将错误消息模糊化为通用的"注册失败，请稍后再试"，不区分 409 和 400。

---

### 任务 3.4：修复前端路由守卫与 Token 管理

**[文件]** `packages/client/src/router/index.ts`
**[当前代码]** 第 46-53 行：
```typescript
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token');
  if (to.meta.requiresAuth && !token) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
  } else {
    next();
  }
});
```
仅检查 token 是否存在（非空字符串），不验证格式或有效期。

**[文件]** `packages/client/src/stores/auth-store.ts`
**[当前代码]** 第 5 行和第 17 行：
```typescript
const token = ref<string>(localStorage.getItem('token') || '');
localStorage.setItem('token', data.token);
```
Token 明文存储于 localStorage，无过期时间管理。

**[修复要求]**：

1. 在 `auth-store.ts` 中增加 token 过期时间管理：
```typescript
function setAuth(data: { token: string; expiresIn: number; ... }): void {
  const expiresAt = Date.now() + data.expiresIn * 1000;
  localStorage.setItem('token', data.token);
  localStorage.setItem('token_expires_at', String(expiresAt));
}

function isTokenExpired(): boolean {
  const expiresAt = Number(localStorage.getItem('token_expires_at') || '0');
  return Date.now() >= expiresAt;
}
```

2. 修改路由守卫，增加过期检查：
```typescript
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();
  if (to.meta.requiresAuth && (!authStore.token || authStore.isTokenExpired())) {
    authStore.logout();
    next({ name: 'Login', query: { redirect: to.fullPath } });
  } else {
    next();
  }
});
```

3. 在 `packages/client/src/utils/api.ts` 的 `handleResponse` 中增加 401 拦截器：
```typescript
if (res.status === 401) {
  // 自动登出并跳转登录页
  const authStore = useAuthStore();
  authStore.logout();
  window.location.href = '/login';
  throw new Error('登录已过期');
}
```

4. **(长期)** 将 token 迁移至 `httpOnly` + `secure` + `SameSite=Strict` 的 Cookie 中，从根本上防御 XSS 窃取 token。这需要服务端配合设置 Cookie 响应头，前端不再手动管理 token。

---

## Phase 4：架构优化（长期健康）

### 任务 4.1：补全 WebSocket 重连的消息完整性保证

**[文件]** `packages/server/src/socket/reconnection-handler.ts`
**[当前代码]** 第 29-47 行：Redis ring buffer 容量 200 条（`chat-handler.ts` 第 126 行 `ltrim(key, 0, 199)`），MySQL fallback 限 100 条（第 37 行 `.limit(100)`）。

**[修复要求]**：
- MySQL fallback 应移除固定 100 条限制，改为按时间范围查询（如最近 24 小时内的消息）
- 在客户端 `socket-client.ts` 中增加基于消息 ID 的去重逻辑
- 如果断线时间过长导致消息不完整，应通过事件通知客户端刷新完整状态

### 任务 4.2：引入基于角色的访问控制模型

**[修复要求]**：
- 新建 `campaign_members` 表，记录用户与 Campaign 的关系及角色（gm / player / observer）
- 所有权限校验统一通过查询此表完成，替代当前分散在各处的 `gm_user_id` 比对
- Socket 连接时从 `campaign_members` 表验证身份，而非信任客户端传入的角色信息

### 任务 4.3：添加输入校验与请求体白名单

**[文件]** `packages/server/src/routes/campaigns.ts`
**[当前代码]** 第 93 行直接将 `req.body` 展开写入数据库：
```typescript
await db('scenes').insert({ id, campaign_id: req.params.id, ...req.body });
```
第 127 行同理：
```typescript
await db('campaign_npcs').insert({ id, campaign_id: req.params.id, created_by: req.user!.id, ...req.body });
```
第 148 行同理：
```typescript
await db('campaign_npcs').where({ ... }).update(req.body);
```

**[修复要求]**：
- 为每个写入接口定义 Zod Schema，仅允许白名单字段写入
- 禁止直接展开 `req.body` 到数据库操作中

---

## 执行检查清单

完成所有修改后，逐项验证：

- [ ] 未登录用户无法访问任何 `/api/campaigns/:id/*` 接口
- [ ] 已登录但非成员的用户访问其他人的 Campaign 返回 403
- [ ] 非 GM 用户无法创建场景、NPC 或修改 Campaign 配置
- [ ] Socket join_room 对非成员用户拒绝加入
- [ ] Socket 不允许用户使用他人的 character_id
- [ ] gm_approve_move / gm_reject_move 仅 GM 可调用
- [ ] 登录接口连续请求超过限制后返回 429
- [ ] 注册接口不再通过不同状态码暴露手机号是否已注册
- [ ] Campaign 创建失败时不会留下半成品数据
- [ ] 数据库中的损坏 JSON 不会导致服务崩溃
- [ ] 生产环境下缺少必要环境变量时服务拒绝启动
- [ ] docker-compose 中 MySQL 和 Redis 端口不再暴露到公网
- [ ] 所有 API 错误响应不包含内部错误详情
- [ ] 前端持有过期 Token 时能正确跳转到登录页
