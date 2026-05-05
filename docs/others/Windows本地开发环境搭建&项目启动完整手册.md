# Windows本地开发环境搭建&项目启动完整手册

适用系统：Windows 10/11
适用场景：本地开发、联调、验收（不使用 Docker / Linux）
项目结构：pnpm monorepo（packages/client + packages/server + packages/shared）
文档版本：2026-05（与当前仓库脚本对齐）

---

## 0. 先读这一节（避免踩坑）

1. 本项目是 pnpm workspace，必须使用 pnpm，不要混用 npm/yarn 安装主项目依赖。
2. Windows 本地不要执行 start.sh（这是类 Unix 脚本）。
3. 正确启动方式：先构建 shared，再启动 server，再启动 client。
4. TypeScript 本地导入必须带 .js 扩展名（ESM + node16 解析）。
5. 敏感信息只放本地 .env 或本机私有文件，不进仓库。

---

## 1. 环境准备

### 1.1 Node.js 20 LTS

下载并安装 Node.js 20（LTS）后，打开 PowerShell 验证：

```powershell
node -v
npm -v
```

预期：Node 版本为 v20.x.x。

### 1.2 pnpm（建议 >= 9）

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
JWT_REFRESH_SECRET=replace-with-your-own-long-refresh-secret
PORT=3000

# 可选：仅当你要启用手机号加密存储时配置（必须是64位十六进制）
# ENCRYPTION_KEY=
# PHONE_HMAC_KEY=

# 可选：机器人内容生成使用 AI 时配置
# DEEPSEEK_API_KEY=
# DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
# DEEPSEEK_FLASH_MODEL=deepseek-chat
```

说明：
1. 服务端会自动读取 monorepo 根目录 .env。
2. 生产密钥、数据库密码、API Key 不要写进文档或提交到 Git。

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

## 6. 执行数据库迁移

步骤 1：重启正常的 MySQL 服务

在管理员 PowerShell 里执行：

```powershell
net start MySQL80
```

成功提示：MySQL80 服务已成功启动。

步骤 2：执行迁移

```powershell
cd E:\Desktop\trpg_new
pnpm --filter @trpg/server migrate
```

步骤 3（建议）：验证迁移一致性

```powershell
pnpm verify:migrations
```

### 6.1 若你之前迁移失败过，先清库再迁移

```sql
DROP DATABASE trpg_platform;
CREATE DATABASE trpg_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

然后重跑：

```powershell
cd E:\Desktop\trpg_new
pnpm --filter @trpg/server migrate
```

---

## 7. 启动后端

终端 A：

```powershell
cd E:\Desktop\trpg_new
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

### 10.3 回退方案（尽量用非破坏性方式）

未提交时撤销某文件（推荐）：

```powershell
git restore <文件路径>
```

撤销最后一次提交但保留改动：

```powershell
git reset --soft HEAD~1
```

强制回退会丢失改动（仅在你完全确认时使用）：

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
操作：启动 MySQL 服务并确认端口。

4. Redis connection error  
操作：启动 Redis 服务并确认端口。

5. Missing required environment variable: JWT_SECRET/DB_HOST/REDIS_HOST  
操作：检查根目录 .env 是否存在并包含对应键。

6. 端口 3000/5173 被占用  
操作：结束占用进程后重启服务。

7. TS2835（import 缺扩展名）  
操作：本地 TS 导入统一补 .js 扩展名。

8. 执行 bash start.sh 失败（Windows）  
操作：不要用 start.sh，按第 12 节顺序分别启动 server/client。

9. server 性能测试偶发失败（P99 抖动）  
操作：使用性能阈值倍率开关 PERF_P99_MULTIPLIER。

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
- Windows 本地开发机：2
- Linux CI（稳定机器）：1 或 1.2
- 仅在性能压测任务中放宽，不建议长期全局设置

---

## 12. 每次开发的快速启动顺序

方式 A（推荐，使用根脚本）：

```powershell
cd E:\Desktop\trpg_new
pnpm --filter @trpg/shared build
pnpm dev:server
# 新开一个终端
cd E:\Desktop\trpg_new
pnpm dev:client
```

方式 B（等价）：

```powershell
cd E:\Desktop\trpg_new
pnpm --filter @trpg/shared build
pnpm --filter @trpg/server dev
# 新开一个终端
cd E:\Desktop\trpg_new
pnpm --filter @trpg/client dev
```

---

## 13. 机器人账号与种子内容脚本（当前版本）

本节说明如何使用 server 内置 seed runner，在本地创建机器人账号、生成内容、执行互动、并在上线前清理。

适用场景：社区功能联调、种子内容投放、全链路验收。

### 13.1 前置条件

1. 后端服务可连接 MySQL（已完成第 6 节迁移）。
2. Redis 正常可用（互动与异步流程依赖）。
3. 如需 AI 生成文案，根目录 .env 已配置 DEEPSEEK_API_KEY；否则使用 --no-ai。

### 13.2 命令总览

在项目根目录执行：

```powershell
cd E:\Desktop\trpg_new

# Phase 1：创建机器人账号（UID 1000095-1000099）
pnpm --filter @trpg/server seed:phase1

# Phase 2：内容预览（不写库）
pnpm --filter @trpg/server seed:phase2

# Phase 3：批量发帖+互动（无 AI）
pnpm --filter @trpg/server seed:phase3

# Phase 3（AI）
pnpm --filter @trpg/server seed:phase3:ai

# Phase 4：上线前清理（休眠机器人并打印统计）
pnpm --filter @trpg/server seed:phase4
```

### 13.3 各阶段说明

1. Phase 1：写入 5 个机器人账号（is_bot=1，bot_status=active）。
2. Phase 2：预览内容生成质量（默认 dry-run，不写库）。
3. Phase 3：批量发帖并自动执行点赞/回复互动。
4. Phase 4：休眠机器人账号，输出生成内容统计，便于上线前验收。

提示：当前机器人账号为脚本驱动账号（不可人工登录），无需维护“机器人密码”或“机器人登录 Token”。

### 13.4 验收与清理

脚本执行后可核查：

```sql
SELECT COUNT(*) AS thread_count FROM forum_threads WHERE is_bot_generated = 1;
SELECT COUNT(*) AS post_count FROM forum_posts WHERE is_bot_generated = 1;
SELECT uid, nickname, bot_status FROM users WHERE is_bot = 1 ORDER BY uid;
```

上线前建议执行：

```powershell
pnpm --filter @trpg/server seed:phase4
```

### 13.5 常见问题

| 错误 | 原因 | 解决方式 |
|------|------|---------|
| seed 命令报 DB 连接失败 | MySQL 未启动或 .env 错误 | 先完成第 3/4/6 节 |
| seed 命令报 Redis 连接失败 | Redis 未启动 | 启动 Redis 后重试 |
| AI 文案未生效 | 未配置 DEEPSEEK_API_KEY | 配置根目录 .env 或改用 --no-ai |
| UID 已存在 | 机器人账号已创建 | 可直接跳过 Phase 1 |

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

---

## 15. 测试账号与密码管理规范（重要）

结论先说：

不建议把所有真实密码直接写进这份手册，即使不上传 GitHub，也不建议。

原因：

1. 本地文档容易被误传、误备份、误同步到网盘。
2. 多人协作时难以追踪谁看过明文密码。
3. 账号体系一旦接近生产口径，泄漏成本会迅速变高。

推荐做法（兼顾你的非技术测验需求）：

1. 手册里写清楚账号用途、登录方式、重置方式。
2. 真实密码放在本机私有文件，不进仓库。
3. 测试时通过“复制粘贴”使用密码，不在群聊或截图中暴露。

### 15.1 手册中可以写的内容

| 项目 | 是否建议写入手册 | 说明 |
|------|------|------|
| 测试账号 UID/手机号/昵称 | 建议 | 便于你执行测验 |
| 账号角色（玩家/GM/创作者/机器人） | 建议 | 便于覆盖权限测试 |
| 登录入口与步骤 | 建议 | 便于非技术人员操作 |
| 真实密码 | 不建议 | 改为写“从本机私有凭据文件获取” |
| API Key、JWT_SECRET、数据库密码 | 不建议 | 改为写“在本地环境变量文件配置” |

### 15.2 本机私有凭据文件（推荐）

在项目根目录创建一个本地私有文件，名称建议：

- .local-secrets.md

文件仅在你本机保存，内容示例结构：

- 测试账号 A：手机号、密码、角色
- 测试账号 B：手机号、密码、角色
- 测试账号 C：手机号、密码、角色
- 机器人账号 1000095-1000099：由脚本维护状态（active/hibernated），记录最近一次 seed 执行时间

注意：

1. 该文件不允许提交到 Git。
2. 该文件不放网盘公开目录。
3. 若团队多人使用，改为每人本地各自保存。

### 15.3 机器人账号口径（写进手册）

机器人账号建议在手册中写“脚本驱动规则”，而不是写“登录密码明文”：

1. 账号范围：UID 1000095-1000099。
2. 使用方式：由 seed 脚本驱动创建与互动，不作为人工登录账号。
3. 状态维护：开发期 active，上线前执行第 13.4 节清理流程切换为 hibernated。

这样你可以完成内容联调，但不需要维护机器人密码/Token。

### 15.4 你可直接执行的账号台账模板

| 账号标识 | 角色 | 登录方式 | 凭据获取方式 | 最近验证时间 |
|------|------|------|------|------|
| 账号 A | 玩家 | 手机号 + 密码 | 本机私有凭据文件 | YYYY-MM-DD |
| 账号 B | 玩家 | 手机号 + 密码 | 本机私有凭据文件 | YYYY-MM-DD |
| 账号 C | GM/创作者 | 手机号 + 密码 | 本机私有凭据文件 | YYYY-MM-DD |
| 1000095 | 机器人 | 不人工登录（脚本驱动） | 第 13.2 节 seed 命令 | YYYY-MM-DD |
| 1000096 | 机器人 | 不人工登录（脚本驱动） | 第 13.2 节 seed 命令 | YYYY-MM-DD |
| 1000097 | 机器人 | 不人工登录（脚本驱动） | 第 13.2 节 seed 命令 | YYYY-MM-DD |
| 1000098 | 机器人 | 不人工登录（脚本驱动） | 第 13.2 节 seed 命令 | YYYY-MM-DD |
| 1000099 | 机器人 | 不人工登录（脚本驱动） | 第 13.2 节 seed 命令 | YYYY-MM-DD |

### 15.5 最低安全红线

1. 不在任何文档中写生产环境密码。
2. 不在截图、录屏、演示中展示明文密码。
3. 每次交付前，统一轮换一次测试账号密码。
4. 发现泄漏风险时，立即重置相关账号和 Token。

---

## 16. 非技术人员 10 分钟密码轮换与复验步骤

本节目标：不写代码、不进数据库，也能完成测试账号密码轮换并验证可用。

### 16.1 适用范围

适用于以下账号：

1. 账号 A（玩家）
2. 账号 B（玩家）
3. 账号 C（GM/创作者）

机器人账号（UID 1000095-1000099）为脚本驱动账号，不参与密码轮换。

### 16.2 轮换前准备（2 分钟）

1. 打开你的本机私有凭据文件（见第 15.2 节）。
2. 先记录旧密码，不删除，标记为“待失效”。
3. 准备 3 个新密码，要求：
  - 至少 12 位
  - 包含大小写字母、数字、符号
  - 三个账号密码互不相同

建议命名方式：

- A_YYYYMM
- B_YYYYMM
- C_YYYYMM

说明：命名仅用于你自己识别版本，不要把这个命名规则当作真实密码内容。

### 16.3 轮换步骤（4 分钟）

对每个账号重复以下流程：

1. 用旧密码登录。
2. 进入 设置 -> 账号安全 -> 修改密码。
3. 输入旧密码与新密码，保存。
4. 立即退出登录。
5. 使用新密码重新登录一次。

通过标准：

1. 新密码登录成功。
2. 旧密码登录失败。
3. 登录后首页、探索页可正常打开。

### 16.4 复验清单（3 分钟）

全部通过才算本轮轮换完成。

| 检查项 | 账号 A | 账号 B | 账号 C |
|------|:---:|:---:|:---:|
| 新密码可登录 | [ ] | [ ] | [ ] |
| 旧密码已失效 | [ ] | [ ] | [ ] |
| 私信功能可用 | [ ] | [ ] | [ ] |
| 招募/房间入口可用 | [ ] | [ ] | [ ] |
| AI 入口可用（有结果或配额提示） | [ ] | [ ] | [ ] |

### 16.5 失败时处理（1 分钟）

若任一账号轮换后无法登录，按顺序处理：

1. 先用旧密码再试一次。
2. 使用找回密码流程重置。
3. 在缺陷模板中记录为 P1，并通知程序员处理。

禁止操作：

1. 不要连续多次盲试，避免触发风控限流。
2. 不要把新密码发到群聊。

### 16.6 执行频率建议

1. 常规：每 2 周轮换一次测试账号密码。
2. 版本发布前：强制轮换一次。
3. 出现泄漏风险：立即轮换，不等周期。

### 16.7 轮换记录模板

```markdown
【密码轮换记录】
时间：2026-xx-xx
执行人：

账号 A：已完成 / 未完成
账号 B：已完成 / 未完成
账号 C：已完成 / 未完成

复验结果：通过 / 未通过
异常说明：
后续动作：
```

完成。
