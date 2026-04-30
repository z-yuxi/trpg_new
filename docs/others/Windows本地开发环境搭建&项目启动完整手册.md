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

---

## 14. 非技术负责人可执行的产品进度测验手册

本节目标：你不需要写代码，也能独立判断“本周版本是否可用、是否可进入下一阶段”。

### 14.1 测验前准备（5 分钟）

1. 确认后端与前端都已启动（见第 7、8 节）。
2. 打开浏览器无痕窗口，访问 http://localhost:5173。
3. 准备 3 个测试账号：
  - 账号 A：普通玩家（新用户）
  - 账号 B：普通玩家（老用户）
  - 账号 C：GM 或创作者账号
4. 清空浏览器缓存后再开始，避免旧状态干扰。

### 14.2 每日冒烟测验（建议每天 15-20 分钟）

全部通过记为“今日可用”；任一失败记为“今日阻断”。

| 编号 | 测验项 | 操作步骤 | 通过标准 |
|------|------|------|------|
| S1 | 首页与登录入口 | 未登录访问首页，点击主按钮进入登录/注册 | 页面可打开，无白屏，无报错弹窗 |
| S2 | 注册登录 | 使用账号 A 完成登录 | 登录成功后可进入探索页 |
| S3 | 探索加载 | 打开探索页，切换 2 个以上标签 | 列表可刷新，不卡死 |
| S4 | 招募主链路 | 用账号 C 发 1 条招募帖；账号 A 申请加入 | 发布成功、申请成功、状态可见 |
| S5 | 私信链路 | 账号 A 给账号 B 发送 1 条消息 | 双方都能看到消息和会话预览更新 |
| S6 | 房间可见性 | 进入房间列表并打开任意房间详情 | 页面可进入，关键信息可见 |
| S7 | AI 校对入口 | 在模组编辑器触发 AI 校对 1 次 | 返回结果或明确提示配额不足，不可无响应 |

### 14.3 每周回归测验（建议每周一次，60-90 分钟）

用于判断“阶段目标是否真正落地”，不是只看页面能否打开。

| 模块 | 关键验证点 | 通过标准 |
|------|------|------|
| 账号与权限 | 未登录/已登录/创作者的可见入口是否符合预期 | 不出现越权页面或缺失入口 |
| 招募状态机 | 申请、待审核、通过、拒绝、满员后的状态变化 | 状态前后一致，文案正确 |
| 私信与通知 | 发消息、读消息、未读数变化 | 未读数和会话最新消息同步 |
| 支付闭环（公测模式） | 下单、回调、权益发放、重复回调幂等 | 不重复发放权益，日志可追踪 |
| AI 配额 | 免费/会员账号分别调用 AI | 配额扣减规则正确，超额时提示正确 |
| 首页内容预览区 | 内容足够与不足两种情况下展示 | 足够时最多 4+4；不足时不凑数；全 0 时隐藏 |

### 14.4 可视化进度判定（红黄绿）

每次测验后按下表打标，便于你与程序员快速对齐。

| 颜色 | 判定标准 | 对应动作 |
|------|------|------|
| 绿灯 | 每日冒烟全通过，周回归通过率 >= 95% | 可以继续推进下一阶段功能 |
| 黄灯 | 每日冒烟有 1-2 项偶发失败，或周回归通过率 85%-94% | 暂停新需求，优先修复本周缺陷 |
| 红灯 | 每日冒烟存在阻断项，或周回归通过率 < 85% | 立即冻结新增功能，只做修复与回归 |

### 14.5 缺陷记录模板（直接复制使用）

每个问题都按同一模板记录，避免沟通损耗。

```markdown
【问题标题】
【发现时间】2026-xx-xx xx:xx
【环境】Windows 本地 / Chrome 版本
【账号】A/B/C
【操作步骤】
1. 
2. 
3. 
【实际结果】
【期望结果】
【影响范围】仅自己 / 部分用户 / 全体用户
【严重级别】P0 阻断 / P1 高 / P2 中 / P3 低
【截图或录屏】
```

严重级别建议口径：
- P0：核心流程不可用（登录失败、无法发帖、无法支付回调）
- P1：主流程可用但结果错误（状态错乱、重复发放、消息丢失）
- P2：有替代路径（文案错、样式错、偶发超时）
- P3：体验优化项（动画、排版、提示语优化）

### 14.6 你每周给团队的验收结论模板

```markdown
【本周版本验收结论】绿灯 / 黄灯 / 红灯

1. 本周通过情况
- 每日冒烟：x/7 天通过
- 周回归：通过率 xx%

2. 本周阻断问题（P0/P1）
- [P0] xxx
- [P1] xxx

3. 是否允许进入下一阶段
- 结论：允许 / 不允许
- 条件：需先修复 xxx 后再继续
```

### 14.7 推荐补充到你的日常节奏

1. 每天固定一个时间做 15 分钟冒烟。
2. 每周固定一次 60 分钟回归，输出红黄绿结论。
3. 红灯周禁止加新功能，先清阻断问题。
4. 黄灯周只做小范围新功能，必须带回归验证。

完成。
