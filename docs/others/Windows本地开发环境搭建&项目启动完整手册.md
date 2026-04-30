# Windows本地开发环境搭建&项目启动完整手册

适用系统：Windows 10/11
适用场景：本地开发、联调、验收（不使用 Docker / Linux）
项目结构：pnpm monorepo（packages/client + packages/server + packages/shared）

---

## 1. 环境准备

### 1.1 Node.js 20 LTS

下载并安装 Node.js 20（LTS）后，打开 PowerShell 验证：

```powershell
node -v
npm -v
```

预期：Node 版本为 v20.x.x。

### 1.2 pnpm

```powershell
npm install -g pnpm
pnpm -v
```

### 1.3 MySQL 8

安装后确认服务已启动（服务名通常是 MySQL80）。

### 1.4 Redis（Windows 兼容版）

安装后验证：

```powershell
redis-cli ping
```

预期：PONG

### 1.5 Git

```powershell
git -v
```

---

## 2. 获取代码

```powershell
cd E:\Desktop
git clone <你的仓库地址> trpg_new
cd trpg_new
```

如果代码已在 E:\Desktop\trpg_new，可直接进入目录。

---

## 3. 初始化数据库

登录 MySQL 后执行：

```sql
CREATE DATABASE trpg_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'trpg'@'localhost' IDENTIFIED BY 'Trpg@2024!';
GRANT ALL PRIVILEGES ON trpg_platform.* TO 'trpg'@'localhost';
FLUSH PRIVILEGES;
```

---

## 4. 配置 .env（项目根目录）

在 E:\Desktop\trpg_new\.env 填写：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=trpg
DB_PASSWORD=Trpg@2024!
DB_NAME=trpg_platform

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

JWT_SECRET=replace-with-your-own-long-secret
PORT=3000
```

说明：服务端已支持自动读取 monorepo 根目录 .env。

---

## 5. 安装依赖并构建共享模块

```powershell
cd E:\Desktop\trpg_new
pnpm install
pnpm --filter @trpg/shared build
```

如果出现 @trpg/shared 找不到：

```powershell
pnpm install --force
pnpm --filter @trpg/shared build
```

---

## 6. 执行数据库迁移（最新修复版）

步骤 1：重启正常的 MySQL 服务

在管理员 PowerShell 里执行：

```powershell
net start MySQL80
```

成功提示：MySQL80 服务已成功启动。

步骤 2：用 `trpg` 用户连接 MySQL（代替 `root`）

打开普通 PowerShell（不用管理员），执行：

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u trpg -h 127.0.0.1 -P 3306 -pTrpg@2024! trpg_platform
```

成功表现：直接进入 MySQL 命令行（提示符变成 `mysql>`）。


```powershell
pnpm --filter @trpg/server migrate
```

当前迁移已改为 tsx 程序化执行，避免旧问题：
- Failed to load ts-node/register
- __dirname is not defined in ES module scope

### 6.1 若你之前迁移失败过，先清库再迁移

```sql
DROP DATABASE trpg_platform;
CREATE DATABASE trpg_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

然后重跑：

```powershell
pnpm --filter @trpg/server migrate
```

---

## 7. 启动后端

终端 A：

```powershell
cd /d E:\Desktop\trpg_new
pnpm --filter @trpg/server dev
```

预期日志：Server running on port 3000

---

## 8. 启动前端

终端 B：

```powershell
cd E:\Desktop\trpg_new
pnpm --filter @trpg/client dev
```

访问：http://localhost:5173

---

## 9. 功能验收最小清单

1. 首页可访问（http://localhost:5173）。
2. 注册/登录可用。
3. 房间列表可加载并可创建房间。
4. 招募列表可加载。
5. 角色编辑页可保存角色卡。

---

## 10. Git 版本管理规范

### 10.1 基本流程

1. 本地修改
2. 本地启动并测试
3. 提交本地仓库
4. 推送到 GitHub

### 10.2 常用命令

```powershell
git status
git diff
git add -A
git commit -m "feat: 本次改动说明"
git push
```

### 10.3 回退方案

未提交时撤销某文件：

```powershell
git checkout -- <文件路径>
```

撤销最后一次提交但保留改动：

```powershell
git reset --soft HEAD~1
```

强制回退（会丢失改动，谨慎）：

```powershell
git reset --hard <commit_id>
```

---

## 11. 常见问题排查

1. pnpm: command not found
操作：重装 pnpm，并重开终端。

2. Cannot find module '@trpg/shared'
操作：先执行 pnpm --filter @trpg/shared build。

3. ECONNREFUSED 127.0.0.1:3306
操作：启动 MySQL 服务。

4. Redis connection error
操作：启动 Redis 服务。

5. Missing required environment variable: JWT_SECRET/DB_HOST/REDIS_HOST
操作：检查根目录 .env 是否存在并包含对应键。

6. 端口 3000/5173 被占用
操作：结束占用进程后重启服务。

7. server 性能测试偶发失败（P99 抖动）
操作：使用性能阈值倍率开关 `PERF_P99_MULTIPLIER`。

PowerShell 临时放宽（仅当前终端生效）：

```powershell
$env:PERF_P99_MULTIPLIER = "2"
pnpm --filter @trpg/server exec vitest run src/__tests__/perf/recruitment.perf.test.ts
```

执行 server 全量测试：

```powershell
$env:PERF_P99_MULTIPLIER = "2"
pnpm --filter @trpg/server test
```

恢复默认（移除环境变量）：

```powershell
Remove-Item Env:PERF_P99_MULTIPLIER
```

建议：
- Windows 本地开发机：`2`
- Linux CI（稳定机器）：`1` 或 `1.2`
- 仅在性能压测任务中放宽，不建议长期全局设置。

---

## 12. 每次开发的快速启动顺序

```powershell
cd E:\Desktop\trpg_new
pnpm --filter @trpg/shared build
pnpm --filter @trpg/server dev
# 新开一个终端
cd E:\Desktop\trpg_new
pnpm --filter @trpg/client dev
```

---

## 13. AI 机器人测试脚本使用指南

本节说明如何使用 `packages/scripts/seeds/` 目录下的自动化测试脚本，一键驱动 5 个机器人账号完成发帖、表态、评论、举报的全链路测试。

**适用场景**：社区功能联调、种子内容投放、全链路验收。

---

### 13.1 前置条件

1. 后端服务已启动（见第 7 节），本地 API 地址为 `http://localhost:3000/api`。
2. 数据库迁移已完成（见第 6 节），`users` 表中已存在 UID `1000095–1000099` 的机器人账号（若无，手动插入，见 13.4 节）。
3. `.env.local` 文件中已填写 `DEEPSEEK_API_KEY`（测试时 AI 生成文案才能工作）。

---

### 13.2 环境变量配置

在项目根目录新建或编辑 `.env.local`（**不提交到 Git**）：

```env
# DeepSeek API Key（用于 AI 生成帖子文案）
DEEPSEEK_API_KEY=sk-your-deepseek-key

# 本地 API 地址（默认即可）
API_BASE_URL=http://localhost:3000/api
```

---

### 13.3 安装脚本依赖

```powershell
cd E:\Desktop\trpg_new\packages\scripts
npm install axios dotenv
```

---

### 13.4 初始化机器人账号 Token

**首次使用**或机器人账号 Token 过期时执行。

脚本会用测试环境的固定验证码 `000000` 登录 5 个机器人账号，并打印各自的 `access_token`：

```powershell
cd E:\Desktop\trpg_new\packages\scripts\seeds
node init-bot-tokens.js
```

输出示例：

```
===== 初始化机器人账号 Token =====

✅ 叙言者 (UID 1000095) Token: eyJhbGci...
✅ 帷幕之后 (UID 1000096) Token: eyJhbGci...
✅ 墨菲斯 (UID 1000097) Token: eyJhbGci...
✅ 夜骐 (UID 1000098) Token: eyJhbGci...
✅ 旅人说书人 (UID 1000099) Token: eyJhbGci...
```

将每个账号的完整 Token 复制到 `ai-bot-test.config.js` 对应的 `token` 字段中：

```javascript
{ uid: 1000095, nickname: '叙言者', persona: 'coc_investigator', token: '在这里粘贴 Token' },
```

> **注意**：若后端验证码登录要求真实短信码，可临时将 `000000` 替换为数据库 `sms_verifications` 表中手动插入的固定验证码。

---

### 13.5 手动插入机器人账号（若数据库中不存在）

以下 5 个账号是系统保留号段 `1000095–1000099`，不会与正式用户冲突：

```sql
INSERT INTO users (uid, nickname, phone, is_bot, user_type, status)
VALUES
  (1000095, '叙言者',   '13800000095', TRUE, 'player', 'active'),
  (1000096, '帷幕之后', '13800000096', TRUE, 'player', 'active'),
  (1000097, '墨菲斯',   '13800000097', TRUE, 'player', 'active'),
  (1000098, '夜骐',     '13800000098', TRUE, 'player', 'active'),
  (1000099, '旅人说书人','13800000099', TRUE, 'player', 'active');
```

---

### 13.6 执行全链路测试

确认配置和 Token 已就绪后，执行：

```powershell
cd E:\Desktop\trpg_new\packages\scripts\seeds
node ai-bot-test.js
```

脚本会自动完成：

| 步骤 | 操作 | 默认数量 |
|:---:|------|:---:|
| 1 | 调用 DeepSeek API 生成帖子文案 | 20 篇 |
| 2 | 调用 `POST /api/posts` 发帖 | 20 次 |
| 3 | 调用 `POST /api/posts/{id}/reactions` 表态 | 每帖 3 条 |
| 4 | 调用 `POST /api/posts/{id}/replies` 评论 | 每帖 2 条 |
| 5 | 调用 `POST /api/reports` 提交举报 | 每帖 1 条 |
| 6 | 打印测试报告 | — |

**调整参数**：修改 `ai-bot-test.config.js` 中的 `AI_POSTS` 和 `SIMULATION` 字段，无需改动主脚本。

---

### 13.7 测试报告解读

脚本结束后会打印如下报告：

```
===== 测试完成 =====
总发帖: 20 | 表态: 60 | 评论: 40 | 举报: 20
耗时: X.X 分钟
结论: 全部通过。
```

若有失败，错误会以 `❌` 开头打印具体的帖子 ID 和 HTTP 错误码，便于定位。

---

### 13.8 上线前清理机器人内容

社区正式上线前，在 MySQL 中执行以下 SQL，将测试内容从信息流中隐藏，并将账号置为休眠：

```sql
-- 将所有机器人帖子从信息流中隐藏
UPDATE posts SET is_hidden_from_feed = TRUE WHERE author_uid BETWEEN 1000095 AND 1000099;

-- 将机器人账号置为休眠状态
UPDATE users SET status = 'dormant' WHERE uid BETWEEN 1000095 AND 1000099;
```

---

### 13.9 常见问题

| 错误 | 原因 | 解决方式 |
|------|------|---------|
| `Cannot find module 'axios'` | 脚本依赖未安装 | 见 13.3 节 |
| `401 Unauthorized` | Token 无效或过期 | 重新执行 `init-bot-tokens.js` |
| `404 Not Found` on /api/posts | 后端未启动或路由未注册 | 确认后端服务正常运行 |
| `DEEPSEEK_API_KEY is not defined` | 未配置 `.env.local` | 见 13.2 节 |
| `ER_DUP_ENTRY` on uid | 机器人账号已存在 | 跳过 13.5 节 |

完成。
