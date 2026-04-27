# TRPG 项目安全修复提示词

## 项目概述

你正在修复一个 TRPG（桌面角色扮演游戏）全栈项目，monorepo 结构如下：

```
packages/
  server/    — Express + Socket.IO 后端（TypeScript）
  client/    — Vue 3 + Vite 前端（TypeScript）
  shared/    — 前后端共享类型和工具函数
```

技术栈：Express、Socket.IO、Knex（MySQL）、Redis、JWT、Zod、bcryptjs、multer、mathjs。

**核心原则**：每一步修改后必须通过收尾检查清单，确认编译通过、测试通过、不引入新问题。不要跳步。

---

## 步骤一：消除 `new Function()` 代码注入

### 问题定位

**文件**: `packages/shared/src/utils/derived-calc.ts`，第 48 行：

```typescript
const result = Function('"use strict"; return (' + expr + ')')() as number;
```

此处用 `new Function()` 执行动态字符串，等同于 `eval()`。虽第 43 行有正则白名单 `!/^[\d\s+\-*/().Math,]+$/`，但属性名通过 `new RegExp(\`\\b${key}\\b\`, 'g')` 替换（第 30-31 行），key 来自规则集定义，存在正则注入风险。

### 修改内容

1. **删除** `evalFormula` 函数中第 47-48 行的 `Function()` 调用。
2. 实现一个**纯算术 AST 解析器**替代，仅支持：`+`、`-`、`*`、`/`、`()`、`Math.floor`/`ceil`/`round`/`min`/`max`/`abs`、数字字面量。
   - 推荐方式：递归下降解析器，支持优先级（`*`/`/` > `+`/`-`），识别函数调用和括号。
   - **不要**用 `eval()`、`Function()`、`vm.runInNewContext()` 或任何字符串转代码的方式。
3. 第 30-31 行属性名替换时，对 `key` 进行正则元字符转义：
   ```typescript
   const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
   expr = expr.replace(new RegExp(`\\b${escapedKey}\\b`, 'g'), String(attrs[key] ?? 0));
   ```

### 收尾检查

- [ ] 运行 `npx tsc --noEmit -p packages/shared/tsconfig.json`，确认编译通过
- [ ] 运行 `npx vitest run --config packages/client/vitest.config.ts` 中与 derived-calc 相关的测试
- [ ] 手动验证 `calcDerived({ STR: 55, CON: 60, SIZ: 65 }, COC7_DEFAULT_DERIVED)` 返回值与修改前一致
- [ ] 验证恶意输入如 `calcDerived({ "constructor": 1 }, { x: { formula: "constructor" } })` 不会报错且返回数字

---

## 步骤二：修复 `dice-evaluator.ts` 的 switch fall-through 和 DoS

### 问题定位

**文件**: `packages/server/src/engine/dice-evaluator.ts`

**(a)** 第 75-86 行，`binary_op` case 没有 `return`/`break`，会 fall-through 到 `unary_minus`（第 88 行）：

```typescript
case 'binary_op': {
  const left = evaluateNode(node.left, rng, allRolls);
  const right = evaluateNode(node.right, rng, allRolls);
  switch (node.op) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/':
      if (right === 0) throw new Error('Division by zero');
      return Math.floor(left / right);
  }
}
// ← 没有 return/break，fall-through!
case 'unary_minus':
  return -evaluateNode(node.operand, rng, allRolls);
```

**(b)** 第 59-66 行，`count` 和 `sides` 无上限，`999999d999999` 可耗尽内存：

```typescript
case 'dice_roll': {
  const { count, sides, modifiers } = node;
  if (sides <= 0) throw new Error(`Invalid die sides: ${sides}`);
  if (count <= 0) throw new Error(`Invalid dice count: ${count}`);
  // 缺少上限检查
```

**(c)** `evaluateNode` 递归无深度限制。

### 修改内容

1. 在 `binary_op` case 的内层 switch 之后（第 85-86 行之间），添加：
   ```typescript
   throw new Error(`Unknown operator: ${node.op}`);
   ```
2. 在 `dice_roll` case 的 `count <= 0` 检查之后，添加：
   ```typescript
   if (count > 100) throw new Error(`Dice count too large: ${count} (max 100)`);
   if (sides > 10000) throw new Error(`Die sides too large: ${sides} (max 10000)`);
   ```
3. 为 `evaluateNode` 添加深度参数，超过 50 层抛出错误：
   ```typescript
   function evaluateNode(node: DiceASTNode, rng: () => number, allRolls: SingleRoll[], depth = 0): number {
     if (depth > 50) throw new Error('Expression too deeply nested');
     // 所有递归调用传入 depth + 1
   ```

### 引用关系

- 步骤三（`formula-evaluator.ts`）同样需要类似的深度限制和沙箱加固，修改模式相同。

### 收尾检查

- [ ] 运行 `npx vitest run packages/server/src/engine/__tests__/dice.test.ts`
- [ ] 运行 `npx vitest run packages/server/src/engine/__tests__/executor.test.ts`
- [ ] 验证正常表达式 `3d6+2`、`2d20kh1`、`4d6kh3` 结果正确
- [ ] 验证 `999999d6` 抛出 `Dice count too large` 错误
- [ ] 验证 50 层以上嵌套括号的表达式抛出 `too deeply nested` 错误

---

## 步骤三：加固 `formula-evaluator.ts` mathjs 沙箱

### 问题定位

**文件**: `packages/server/src/engine/formula-evaluator.ts`

- 第 11-18 行 `BLOCKED_FUNCTIONS` 列表不完整，缺少 `parse`/`compile`/`help`/`typed`/`config`。
- 第 38-46 行 `dangerousPatterns` 黑名单过于简单，可通过编码绕过。
- 第 114 行 `validateFormula()` 在验证阶段调用了 `math.evaluate(formula, dummyScope)`，验证本身就可能触发副作用。

### 修改内容

1. 在 `BLOCKED_FUNCTIONS` 中追加：`'parse'`, `'compile'`, `'help'`, `'typed'`, `'config'`, `'import'`, `'createUnit'`, `'simplify'`, `'derivative'`, `'rationalize'`。
2. `validateFormula()` 改用 `math.parse(formula)` 做 AST 分析，不要调用 `math.evaluate`。遍历 AST 节点检查是否引用了被屏蔽函数或全局对象。
3. 给 `evaluateFormula` 添加超时保护：在 scope 中不要传入任何全局引用，确保 `scope` 仅包含数字键值对。

### 引用关系

- 步骤一中建议"可用 formula-evaluator.ts 替代 derived-calc.ts 的 Function()"——但前提是本步骤先完成沙箱加固。如果你在步骤一中选择了自建 AST 解析器，则两步独立。

### 收尾检查

- [ ] 运行 `npx vitest run packages/server/src/engine/__tests__/formula.test.ts`
- [ ] 运行 `npx vitest run packages/server/src/engine/__tests__/ruleset-execute.test.ts`
- [ ] 验证 `evaluateFormula("2 + 3", {})` 返回 5
- [ ] 验证 `evaluateFormula("process.env", {})` 抛出错误
- [ ] 验证 `validateFormula("1 + x")` 不再实际执行表达式

---

## 步骤四：修复 Auth 模块 — JWT、密码哈希泄露、速率限制

### 问题定位

**(a)** `packages/server/src/services/auth-service.ts`：
- 第 10 行 `JWT_EXPIRES_IN = '7d'` — access token 7 天有效期过长。
- 第 29-30 行 — access/refresh token 使用同一密钥 `_JWT_SECRET`。
- 第 70-77 行 `refreshTokens()` — 无服务端 token 撤销机制。

**(b)** `packages/server/src/routes/auth.ts`：
- 第 29 行 `res.status(201).json({ user, tokens })` — `user` 对象含 `password_hash`。
- 第 45 行同理。
- 第 10 行 `password: z.string().min(6)` — 密码策略过弱。
- 第 52-64 行 `/refresh` 端点无 Zod 输入验证。
- 全文无速率限制。

**(c)** `packages/server/src/services/user-service.ts`：
- 第 192-206 行 `rowToUser()` 返回了 `password_hash`（第 197 行）。

### 修改内容

1. **`auth-service.ts`**:
   - 将 `JWT_EXPIRES_IN` 改为 `'15m'`（15 分钟）。
   - 新增 `JWT_REFRESH_SECRET` 环境变量（或在原 secret 后拼接固定后缀如 `_JWT_SECRET + '-refresh'`），refresh token 使用不同密钥。
   - 在 `refreshTokens()` 中添加 Redis 白名单校验：每次签发 refresh token 时存入 Redis（key = `refresh:<userId>:<jti>`，TTL = 30天）；刷新时验证 Redis 中存在；刷新后删除旧 token 并存入新 token。
   - 新增 `revokeAllTokens(userId)` 方法，删除该用户所有 Redis 中的 refresh token（供改密码/注销时调用）。

2. **`user-service.ts`**:
   - 新增 `toSafeUser()` 方法，复制 `rowToUser()` 结果但删除 `password_hash` 字段：
     ```typescript
     toSafeUser(row: Record<string, unknown>): Omit<User, 'password_hash'> {
       const { password_hash, ...safe } = this.rowToUser(row);
       return safe;
     }
     ```
   - 注意：`verifyPassword(user, password)` 内部需要 `user.password_hash`，因此内部逻辑继续使用 `rowToUser`，仅在**返回给路由层**时使用 `toSafeUser`。

3. **`routes/auth.ts`**:
   - 第 29 行改为：`res.status(201).json({ user: userService.toSafeUser(user), tokens });`
   - 第 45 行同理（注意 `authService.login` 返回的 `user` 需要同样处理）。
   - 密码策略增强：`password: z.string().min(8).regex(/(?=.*[a-zA-Z])(?=.*\d)/, '密码需包含字母和数字')`
   - `/refresh` 端点添加 Zod 验证：
     ```typescript
     const refreshSchema = z.object({ refresh_token: z.string().min(1) });
     ```
   - 安装 `express-rate-limit` + `rate-limit-redis`，对 `/register`、`/login`、`/refresh` 添加速率限制（建议：每 IP 每 15 分钟 10 次登录尝试，每 IP 每小时 5 次注册）。

### 引用关系

- 步骤四修改了 `User` 返回结构，步骤九（`routes/users.ts` `/me` 端点）也返回 `req.user`，需同步处理。
- `toSafeUser` 需要在 `UserService` 上定义为 **public** 方法，因为 `routes/auth.ts` 要调用它。
- 如果 `shared/src/types/index.ts` 中 `User` 接口定义了 `password_hash` 为必填字段，考虑新增 `SafeUser = Omit<User, 'password_hash'>` 类型导出。

### 收尾检查

- [ ] 运行 `npx vitest run packages/server/src/__tests__/e2e/auth.e2e.test.ts`
- [ ] 手动测试注册 → 登录 → 返回的 JSON 中不含 `password_hash` 字段
- [ ] 手动测试弱密码 `123456` 被拒绝
- [ ] 手动测试同一 IP 连续 11 次登录，第 11 次被 429 拒绝
- [ ] 手动测试 refresh token 使用后旧 token 失效（再次使用返回 401）
- [ ] `npx tsc --noEmit -p packages/server/tsconfig.json` 编译通过

---

## 步骤五：添加安全中间件（Helmet、CORS、Body 限制）

### 问题定位

**文件**: `packages/server/src/app.ts`（完整文件仅 17 行）：

```typescript
const app: Application = express();
app.use(express.json());                              // 第 10 行 — 无 body size 限制
app.use('/uploads', express.static(uploadsDir));      // 第 11 行 — 无安全头
app.use('/api', routes);
```

**文件**: `packages/server/src/socket/io-server.ts` 第 12 行：
```typescript
cors: { origin: '*' },
```

**文件**: `packages/server/src/middleware/index.ts` — 空文件。

### 修改内容

1. 安装依赖：`pnpm add helmet cors` + `pnpm add -D @types/cors`（在 `packages/server` 目录下）。
2. **`app.ts`**：
   ```typescript
   import helmet from 'helmet';
   import cors from 'cors';
   
   const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',');
   
   app.use(helmet());
   app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
   app.use(express.json({ limit: '100kb' }));
   app.use('/uploads', express.static(uploadsDir, {
     setHeaders: (res) => {
       res.setHeader('X-Content-Type-Options', 'nosniff');
       res.setHeader('Content-Disposition', 'inline');
     }
   }));
   ```
3. **`io-server.ts`**：将 `origin: '*'` 改为 `origin: ALLOWED_ORIGINS`（从环境变量读取，与 `app.ts` 保持一致）。
4. 在 `.env.example` 中添加 `CORS_ORIGINS=http://localhost:5173`。

### 引用关系

- 步骤六（文件上传安全）依赖本步骤设置的 `nosniff` 头，确保本步骤先完成。

### 收尾检查

- [ ] `npx tsc --noEmit -p packages/server/tsconfig.json` 编译通过
- [ ] 启动服务器，检查响应头包含 `X-Content-Type-Options: nosniff`、`X-Frame-Options`、`Strict-Transport-Security`
- [ ] 跨域请求测试：从非允许域发起请求被 CORS 拒绝
- [ ] Socket.IO 跨域测试：从非允许域连接 WebSocket 被拒绝

---

## 步骤六：修复文件上传安全

### 问题定位

**文件**: `packages/server/src/routes/upload.ts`

- 第 15 行：`const safeExt = path.extname(file.originalname).toLowerCase() || '.jpg'` — 扩展名来自客户端，未做白名单校验。
- 第 24-31 行：`fileFilter` 仅检查 `file.mimetype`（客户端可伪造）。

### 修改内容

1. 安装 `file-type` 库：`pnpm add file-type`（在 `packages/server`）。
2. 改写 `fileFilter`，添加扩展名白名单：
   ```typescript
   const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
   fileFilter: (_req, file, cb) => {
     const ext = path.extname(file.originalname).toLowerCase();
     if (!ALLOWED_EXTS.has(ext)) {
       cb(new Error('不支持的文件扩展名'));
       return;
     }
     cb(null, true);
   },
   ```
3. 在上传成功后、返回响应前，使用 `file-type` 检测真实文件类型：
   ```typescript
   import { fileTypeFromFile } from 'file-type';
   
   const detectedType = await fileTypeFromFile(req.file.path);
   if (!detectedType || !['image/jpeg','image/png','image/webp','image/gif'].includes(detectedType.mime)) {
     fs.unlinkSync(req.file.path); // 删除恶意文件
     res.status(400).json({ error: '文件内容与声明类型不匹配' });
     return;
   }
   ```
4. `filename` 生成不再使用客户端扩展名，改为从 `detectedType.ext` 获取。

### 引用关系

- 步骤五中为 `/uploads` 静态目录设置的 `nosniff` 头是本步骤的辅助防御层。

### 收尾检查

- [ ] 编译通过
- [ ] 测试上传正常 JPEG 文件 → 成功，返回 URL
- [ ] 测试上传 `.html` 文件但 MIME 伪装为 `image/jpeg` → 被拒绝
- [ ] 测试上传 `.php` 文件 → 被拒绝
- [ ] 验证上传后的文件通过浏览器访问 `/uploads/xxx` 时 `Content-Type` 正确

---

## 步骤七：修复战役路由授权缺失（最大面积问题）

### 问题定位

**文件**: `packages/server/src/routes/campaigns.ts`

以下路由已有 `authMiddleware`（第 23 行 `router.use(authMiddleware)`），但**不验证用户是否为该战役的 GM 或成员**：

| 路由 | 行号 | 问题 |
|------|------|------|
| `GET /:id` | 100-107 | 任意用户可查看任何战役（含 room_code） |
| `GET /:id/scenes` | 123-130 | 任意用户可查看任何战役场景列表 |
| `GET /:id/scenes/:sceneId/grid-map` | 133-140 | 任意用户可查看任何网格地图 |
| `GET /:id/npcs` | 546-553 | 任意用户可查看任何战役 NPC |
| `GET /:id/connections` | 503-510 | 任意用户可查看场景连接 |
| `GET /:id/round-state` | 698-705 | 任意用户可查看战斗轮次状态 |
| `GET /:id/position-history` | 708-717 | 任意用户可查看位置历史 |
| `GET /:id/trajectory-matrix` | 720-797 | 任意用户可查看轨迹矩阵 |
| `GET /:id/scenes/:sceneId/participants` | 289-297 | 任意用户可查看场景参与者 |
| `GET /:id/messages` | 570-694 | 非成员可看到部分消息 |

### 修改内容

1. 创建一个可复用的授权中间件函数 `ensureCampaignMember`（建议放在 `campaigns.ts` 文件顶部或 `middleware/` 下）：
   ```typescript
   async function ensureCampaignMember(campaignId: string, userId: string): Promise<{
     ok: boolean;
     isGm: boolean;
     campaign?: Record<string, unknown>;
   }> {
     const campaign = await db('campaigns').where({ id: campaignId }).first();
     if (!campaign) return { ok: false, isGm: false };
     if (campaign.gm_user_id === userId) return { ok: true, isGm: true, campaign };
     // 检查用户是否有角色在该战役中
     const member = await db('character_scene_states as css')
       .join('character_sheets as cs', 'cs.id', 'css.character_id')
       .where('css.campaign_id', campaignId)
       .where('cs.user_id', userId)
       .first();
     if (member) return { ok: true, isGm: false, campaign };
     return { ok: false, isGm: false };
   }
   ```
2. 在上述每个路由的 handler 开头调用此函数，非成员返回 403。
3. 对 `GET /:id/messages`（第 570 行），在现有的 `isGm` 判断之前添加成员校验，非成员直接返回 403，不再依赖 `visible_to` 过滤。

### 引用关系

- 步骤八（Mass Assignment）也在 `campaigns.ts` 中修改，但修改的是写入路由，不与本步骤冲突。建议先做本步骤（读取授权），再做步骤八（写入安全）。
- `ensureCampaignMember` 函数在步骤七和步骤八中都会用到。

### 收尾检查

- [ ] 编译通过
- [ ] 运行 `npx vitest run packages/server/src/__tests__/e2e/campaign.e2e.test.ts`
- [ ] 手动测试：用非成员用户 GET `/api/campaigns/<其他人的战役id>` → 返回 403
- [ ] 手动测试：用 GM 用户 GET 同一战役 → 正常 200
- [ ] 手动测试：用团内玩家 GET 同一战役 → 正常 200
- [ ] 逐一验证上表中所有 10 个路由都返回 403 对非成员

---

## 步骤八：修复 Mass Assignment（请求体直接写入数据库）

### 问题定位

| 位置 | 行号 | 问题 |
|------|------|------|
| `routes/campaigns.ts` NPC 创建 | 537 | `...req.body` 可覆盖 `id`/`campaign_id`/`created_by` |
| `routes/campaigns.ts` NPC 更新 | 561 | `.update(req.body)` 可改任意列 |
| `routes/campaigns.ts` 战役更新 | 115 | `campaignService.update(id, req.body)` 可改 `gm_user_id` |
| `routes/characters.ts` 角色卡更新 | 70 | `characterSheetService.update(id, req.body)` 可改 `user_id` |

### 修改内容

1. **NPC 创建**（第 537 行）—— 用白名单替代 `...req.body`：
   ```typescript
   const { name, description, avatar_url, scene_id, is_public } = req.body;
   await db('campaign_npcs').insert({
     id, campaign_id: req.params.id, created_by: req.user!.id,
     name, description, avatar_url, scene_id, is_public,
   });
   ```

2. **NPC 更新**（第 561 行）—— 同样白名单：
   ```typescript
   const allowed = ['name', 'description', 'avatar_url', 'scene_id', 'is_public'];
   const updates: Record<string, unknown> = {};
   for (const key of allowed) {
     if (req.body[key] !== undefined) updates[key] = req.body[key];
   }
   await db('campaign_npcs').where({ id: req.params.npcId, campaign_id: req.params.id }).update(updates);
   ```

3. **战役更新**（第 115 行）—— 在调用 `campaignService.update` 之前过滤：
   ```typescript
   const allowed = ['name', 'description', 'status', 'global_story_time', 'ruleset_id'];
   const safeBody: Record<string, unknown> = {};
   for (const key of allowed) {
     if (req.body[key] !== undefined) safeBody[key] = req.body[key];
   }
   const updated = await campaignService.update(req.params.id, safeBody);
   ```

4. **角色卡更新**（`routes/characters.ts` 第 70 行）—— 同理：
   ```typescript
   const allowed = ['name', 'avatar_url', 'background', 'attributes', 'skills', 'occupation_id'];
   const safeBody: Record<string, unknown> = {};
   for (const key of allowed) {
     if (req.body[key] !== undefined) safeBody[key] = req.body[key];
   }
   const updated = await characterSheetService.update(req.params.id, safeBody);
   ```

### 引用关系

- NPC 字段白名单需对照数据库 migration `006_campaign_clues.ts` 或 `001_init.ts` 中 `campaign_npcs` 表结构确认实际列名。请在修改前先 `cat` 对应 migration 文件确认。
- 角色卡字段白名单需对照 `character-sheet-service.ts` 的 `update` 方法和 `character_sheets` 表结构确认。

### 收尾检查

- [ ] 编译通过
- [ ] 运行 `npx vitest run packages/server/src/__tests__/e2e/campaign.e2e.test.ts`
- [ ] 手动测试：创建 NPC 时 body 中带 `"gm_user_id": "hacker"` → 该字段不被写入
- [ ] 手动测试：更新战役时 body 中带 `"gm_user_id": "hacker"` → 403 或字段被忽略
- [ ] 手动测试：更新角色卡时 body 中带 `"user_id": "other"` → 字段被忽略

---

## 步骤九：修复模组/规则集/用户路由的认证和授权

### 问题定位

**(a)** `packages/server/src/routes/modules.ts`：
- 第 52-60 行 `GET /api/modules/:id` — 无 `authMiddleware`，不检查模组状态，任何人可读取草稿内容。

**(b)** `packages/server/src/routes/rulesets.ts`：
- 第 35-46 行 `GET /api/rulesets/:id` — 同上。

**(c)** `packages/server/src/routes/users.ts`：
- 第 63-79 行 `GET /api/users/:uid/campaigns` 和 `/hosted-campaigns` — 未检查用户 `campaign_history_public` 隐私设置。
- 第 21 行 `GET /api/users/me` — 返回 `req.user`，可能含 `password_hash`。

**(d)** `packages/server/src/routes/logs.ts`：
- 第 23 行 `simulate_user_id` 参数允许任意用户冒充他人视角导出日志，无权限校验。

### 修改内容

1. **`modules.ts` GET /:id**：添加逻辑 — 如果模组状态不是 `published`，则必须认证且为作者本人，否则返回 404：
   ```typescript
   router.get('/:id', async (req, res) => {
     const module = await moduleService.findById(req.params.id);
     if (!module) { res.status(404).json({ error: 'Not found' }); return; }
     if (module.status !== 'published') {
       // 非公开模组需要认证且为作者
       const authHeader = req.headers.authorization;
       // 验证 token 并比对 author_id...
       // 或改为添加可选的 authMiddleware
     }
     res.json(module);
   });
   ```
   推荐做法：创建 `optionalAuthMiddleware`，总是尝试解析 token 但不强制，然后在 handler 中判断。

2. **`rulesets.ts` GET /:id**：同上模式。

3. **`users.ts`**：
   - `GET /me`（第 21 行）：改为返回 `userService.toSafeUser(req.user)`（**依赖步骤四中创建的 `toSafeUser` 方法**）。
   - `GET /:uid/campaigns` 和 `/hosted-campaigns`：查询用户隐私设置，如 `campaign_history_public === false` 且请求者不是本人，返回空或 403。

4. **`logs.ts`**：
   - `simulate_user_id` 仅允许 GM 使用。在使用该参数前，查询战役的 `gm_user_id`，与当前用户比对：
   ```typescript
   if (simulate_user_id && simulate_user_id !== req.user!.id) {
     const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
     if (!campaign || campaign.gm_user_id !== req.user!.id) {
       res.status(403).json({ error: 'Only GM can simulate other user views' });
       return;
     }
   }
   ```

### 引用关系

- `toSafeUser` 方法来自**步骤四**，务必先完成步骤四。
- `optionalAuthMiddleware` 如果在步骤九中创建，步骤七中也可能用到（如果后续有公开可读的战役场景），但当前优先满足模组/规则集需求。

### 收尾检查

- [ ] 编译通过
- [ ] 运行 `npx vitest run packages/server/src/__tests__/e2e/module.e2e.test.ts`
- [ ] 手动测试：未登录访问 `GET /api/modules/<草稿模组id>` → 404
- [ ] 手动测试：作者登录后访问同一草稿模组 → 200
- [ ] 手动测试：未登录访问 `GET /api/modules/<已发布模组id>` → 200
- [ ] 手动测试：`GET /api/users/me` 返回无 `password_hash`
- [ ] 手动测试：用户 A 设置 `campaign_history_public = false`，用户 B 访问 `/api/users/<A的uid>/campaigns` → 返回空或 403
- [ ] 手动测试：非 GM 用户使用 `simulate_user_id` 导出日志 → 403

---

## 步骤十：修复竞态条件

### 问题定位

| 位置 | 行号 | 问题 |
|------|------|------|
| `services/user-service.ts` UID 生成 | 27-28 | 并发注册产生相同 UID |
| `services/forum-service.ts` 楼层号 | 213 | 并发回复产生相同楼层号 |
| `services/post-comment-service.ts` 楼层号 | 190-195 | 并发评论产生相同楼层号 |
| `services/post-comment-service.ts` 点赞 | 335-363 | 并发双击导致计数错误 |
| `routes/campaigns.ts` 场景删除 | 213-218 | 检查与删除不在事务中 |

### 修改内容

1. **UID 生成**（`user-service.ts:27-28`）：将 `register` 方法中的 UID 生成和 insert 包在 Knex 事务 + 数据库级锁中：
   ```typescript
   await db.transaction(async (trx) => {
     const maxUidRow = await trx('users').max('uid as maxUid').forUpdate().first();
     const uid = Math.max(UID_START, ((maxUidRow?.maxUid as number) ?? UID_START - 1) + 1);
     await trx('users').insert({ id, uid, phone, password_hash, ... });
   });
   ```

2. **楼层号**（`forum-service.ts:213`）：使用数据库原子 `UPDATE ... SET reply_count = reply_count + 1 RETURNING reply_count` 或在事务中 `forUpdate` 锁定 thread 行：
   ```typescript
   await db.transaction(async (trx) => {
     const thread = await trx('forum_threads').where({ id: threadId }).forUpdate().first();
     const floor = Number(thread.reply_count) + 2;
     await trx('forum_threads').where({ id: threadId }).increment('reply_count', 1);
     await trx('forum_posts').insert({ ..., floor_number: floor });
   });
   ```

3. **楼中楼楼层号**（`post-comment-service.ts:190-195`）：同上模式，用 `forUpdate` 锁定。

4. **点赞**（`post-comment-service.ts:335-363`）：添加数据库唯一约束 `(floor_id, user_id)`，用 INSERT IGNORE / ON CONFLICT 代替 check-then-act。

5. **场景删除**（`campaigns.ts:213-218`）：将 occupant 检查和删除放入事务。

### 收尾检查

- [ ] 编译通过
- [ ] 运行所有 e2e 测试确保无回归
- [ ] 编写并发测试脚本：并行发送 10 个注册请求 → 10 个不同 UID
- [ ] 编写并发测试脚本：并行发送 5 个论坛回复 → 5 个不同楼层号

---

## 步骤十一：修复 Redis 和进程生命周期

### 问题定位

**文件**: `packages/server/src/db/redis.ts` — 三个 Redis 客户端无 `error` 事件监听。
**文件**: `packages/server/src/server.ts` — 无 graceful shutdown。
**文件**: `packages/server/src/db/knex-config.ts` — 第 10-12 行硬编码默认密码。

### 修改内容

1. **`redis.ts`**：为每个客户端添加错误监听：
   ```typescript
   redis.on('error', (err) => console.error('[Redis] connection error:', err));
   redisPub.on('error', (err) => console.error('[Redis Pub] error:', err));
   redisSub.on('error', (err) => console.error('[Redis Sub] error:', err));
   ```

2. **`server.ts`**：添加 graceful shutdown：
   ```typescript
   async function shutdown() {
     console.log('Shutting down gracefully...');
     httpServer.close();
     await redis.quit();
     await redisPub.quit();
     await redisSub.quit();
     await db.destroy();
     process.exit(0);
   }
   process.on('SIGTERM', shutdown);
   process.on('SIGINT', shutdown);
   ```

3. **`knex-config.ts`**：移除默认密码，改为启动时检查：
   ```typescript
   if (!process.env.DB_PASSWORD) {
     throw new Error('DB_PASSWORD environment variable is required');
   }
   ```

### 收尾检查

- [ ] 编译通过
- [ ] 启动服务器后发送 SIGTERM → 日志输出 "Shutting down gracefully..."，进程正常退出
- [ ] 在 Redis 不可达时启动服务器 → 日志输出 Redis 错误，进程不 crash
- [ ] 未设置 `DB_PASSWORD` 时启动 → 报错并退出

---

## 步骤十二：修复错误信息泄露

### 问题定位

几乎所有路由的 `catch` 块都直接返回 `err.message`，例如：
- `routes/campaigns.ts:70`: `res.status(500).json({ error: err?.message ?? 'Create failed' })`

`err.message` 可能包含数据库表名、列名、SQL 片段。

### 修改内容

1. 创建统一的错误处理函数 `packages/server/src/utils/error-response.ts`：
   ```typescript
   export function safeErrorMessage(err: unknown, fallback: string): string {
     if (process.env.NODE_ENV === 'development') {
       return (err as Error)?.message ?? fallback;
     }
     return fallback;
   }
   ```
2. 在所有路由 catch 块中用 `safeErrorMessage(err, 'Create failed')` 替代 `err?.message ?? 'Create failed'`。
3. 在 catch 块中添加 `console.error(err)` 确保错误仍记录到日志。
4. 在 `app.ts` 中添加全局错误处理中间件作为最后一道防线：
   ```typescript
   app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
     console.error('Unhandled error:', err);
     res.status(500).json({ error: 'Internal server error' });
   });
   ```

### 收尾检查

- [ ] 编译通过
- [ ] 在 `NODE_ENV=production` 下触发一个数据库错误 → 返回通用错误信息，不含表名
- [ ] 在 `NODE_ENV=development` 下触发同一错误 → 返回详细错误信息（方便开发调试）
- [ ] 检查服务器日志中仍然记录了完整错误堆栈

---

## 步骤十三：其余中低优先级修复

以下修复可在前 12 步完成后批量处理：

### 13.1 LIKE 通配符转义

**文件**: `forum-service.ts:57-59`, `recruitment-service.ts:132-133`, `module-service.ts:67-68`, `ruleset-service.ts:77`

在所有 `%${keyword}%` 模式前添加转义：
```typescript
function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}
// 使用：`%${escapeLike(keyword)}%`
```

### 13.2 viewCount 去重

**文件**: `forum-service.ts:152`

用 Redis 记录 `viewed:<threadId>:<userId>`（TTL 5 分钟），重复访问不再 +1。

### 13.3 Snowflake 忙等待

**文件**: `shared/src/utils/snowflake.ts:37-39`

改为抛出错误而非忙等待：
```typescript
if (timestamp <= this.lastTimestamp) {
  throw new Error('Snowflake: clock moved backwards or sequence overflow');
}
```

### 13.4 YAML 解析大小限制

**文件**: `engine/ruleset-validator.ts:106-108`

在 `parseRulesetYAML` 中添加大小检查：
```typescript
if (yamlString.length > 512 * 1024) throw new Error('YAML too large (max 512KB)');
```

### 13.5 条件分支正则修复

**文件**: `engine/atoms/conditional-branch.ts:35`

将 `[<>=!]+` 改为精确匹配：`(<=|>=|!=|<|>|==|=)`

### 13.6 recruitment-service 中删除重复的桩服务

**文件**: `recruitment-service.ts:470-529`

删除 `RulesetService` 和 `ModuleService` 的桩定义，改为从正式模块导入。

### 收尾检查

- [ ] 对每个子步骤单独编译测试
- [ ] 运行全量测试套件 `npx vitest run` 确认无回归

---

## 执行顺序总结

```
步骤 1  → 消除 Function() 注入         [独立]
步骤 2  → 修复 dice-evaluator          [独立]
步骤 3  → 加固 formula-evaluator       [独立，但与步骤 1 有可选引用]
步骤 4  → Auth 模块（JWT + 密码哈希 + 限流） [独立，产出 toSafeUser]
步骤 5  → 安全中间件                    [独立]
步骤 6  → 文件上传安全                  [依赖步骤 5 的 nosniff 头]
步骤 7  → 战役路由授权                  [独立，产出 ensureCampaignMember]
步骤 8  → Mass Assignment              [可与步骤 7 并行，同文件但不同路由]
步骤 9  → 模组/规则集/用户路由          [依赖步骤 4 的 toSafeUser]
步骤 10 → 竞态条件                      [独立]
步骤 11 → Redis + 进程生命周期          [独立]
步骤 12 → 错误信息泄露                  [独立]
步骤 13 → 其余中低优先级               [独立]
```

**依赖链**：步骤 4 → 步骤 9（toSafeUser）；步骤 5 → 步骤 6（nosniff）。其余步骤可并行或任意顺序执行。

**每一步结束后必须执行的通用检查**：
1. `npx tsc --noEmit` — 全项目编译无错误
2. `npx vitest run` — 全量测试通过
3. `git diff` 复查改动范围，确认未引入新的安全问题
4. 如有新增依赖（`pnpm add xxx`），确认是必要的且版本无已知漏洞
