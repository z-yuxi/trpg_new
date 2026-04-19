# TRPG 平台产品完善 —— AI 开发提示词文档

> 本文档基于 `trpg_new/docs/` 全部产品设计文件（主文档 + 附录 A~K）与当前代码实现的逐项比对生成。
> 目标：为 AI 辅助开发提供精确的上下文和分批执行指令，逐步将产品从当前状态推进到设计文档 V1.0 完整交付。

---

## 第一部分：现状与差距总览

### 1.1 已实现功能（可用）

| 模块 | 实现状态 | 备注 |
|------|---------|------|
| 用户注册/登录/JWT 鉴权 | ✅ 完整 | 手机号+密码，access_token 7d / refresh_token 30d |
| 团（Campaign）CRUD + 房间号 | ✅ 完整 | 6位房间码，加入/创建/列表 |
| 多场景管理（空间/虚拟/大厅） | ✅ 完整 | 含场景描述、场景连接（步行/骑行/驾车时长） |
| 实时聊天（Socket.IO） | ✅ 完整 | Snowflake ID 排序、速率限制 5条/秒、Redis 消息缓冲 200条 |
| 角色卡 CRUD + CSON 导入导出 | ✅ 完整 | 属性/技能/装备/背景 |
| 故事时间推进 + 预约移动触发 | ✅ 完整 | GM 推进时间 → 自动执行到时移动 |
| 移动审批流（申请→批准/拒绝） | ✅ 完整 | Socket 事件通知 |
| GM 控制台（基础） | ✅ 基础可用 | 时间推进、场景管理、NPC 管理、广播 |
| 招募系统（发帖/申请/审批/成团） | ✅ 完整 | 双向市场、成团自动创建团 |
| NPC 管理 | ✅ 完整 | 创建/更新、属性/技能/资源 |
| 在线状态追踪 | ✅ Redis 实现 | campaign:online set |
| 日志导出（JSON/Markdown） | ✅ 基础可用 | ILF 中间格式 |
| 角色卡编辑器（6步向导） | ✅ 前端完整 | 规则集→职业→属性→技能→背景→预览 |
| 断线重连（missed_messages） | ✅ 基础可用 | last_event_id 追踪 |

### 1.2 差距总览（按严重程度排序）

#### 🔴 核心功能缺失（影响产品可用性）

| # | 设计要求 | 当前状态 | 差距描述 |
|---|---------|---------|---------|
| G1 | 规则引擎命令执行 API | GET/PUT/POST 均返回 501 | 8种原子节点已实现，但无 HTTP 端点暴露执行能力；命令系统三层模型（通用/检定模板/规则集专属）未接入 |
| G2 | 规则集 CRUD + 发布流程 | 空实现 | 无法创建/编辑/发布规则集；状态机（draft→reviewing→public_notice→published）未实现 |
| G3 | 消息可见性（写扩散） | visible_to 字段存在但未计算 | `computeVisibleTo()` 逻辑未实现：空间场景=当前在场角色、虚拟场景=有效参与者、大厅=全部成员 |
| G4 | 模组编辑器 | 仅占位 UI | Notion 式块编辑器（TipTap/ProseMirror）完全未实现，场景/NPC/事件/线索/检定/对话块均缺失 |
| G5 | 规则工坊（L1 表单 + L3 画布） | 仅占位路由 | L1 表单式模板编辑器、L3 可视化节点画布均未实现 |
| G6 | 论坛/讨论区后端 | 无 API 路由 | 5个子板块（规则/创作/经验/新手/水区）的帖子/回复 CRUD 完全缺失 |
| G7 | 通知系统 | 仅有 DB 表 | 无通知 Service、无 API、无前端展示；系统/交易/社交/审核 4类通知未实现 |
| G8 | 线索卡系统 | 组件存在但无后端 | 8种 CSS 艺术主题（附录G）前端 composable 已有，但线索库 CRUD、GM 发放、玩家查看流程缺失 |

#### 🟡 重要功能不完整（影响用户体验）

| # | 设计要求 | 当前状态 | 差距描述 |
|---|---------|---------|---------|
| G9 | GM 控制台增强 | 基础可用 | 缺少：预约移动预览时间线、线索库标签页、NPC 扮演发言、暗骰日志、轨迹矩阵标签页 |
| G10 | 助手台（Assistant Desk） | 组件存在 | 缺少：角色卡绑定摘要、命令参考（从规则集加载）、暗骰记录（仅GM）、快捷广播 |
| G11 | 网格地图（Grid Map） | 组件占位 | 设计要求 V1.0 最小实现：单层方格、GM 拖拽 token、无战争迷雾；当前完全空壳 |
| G12 | 轨迹矩阵 | 组件占位 | 会员功能：角色×时间×场景的位置可视化，当前无实际渲染 |
| G13 | 日志导出 UI | 仅 JSON/MD 接口 | 缺少：三种导出模式（我的故事/完整剧本）、四种排序策略、可视化拖拽编辑器 |
| G14 | 用户公开主页 | 路由存在 | `/u/:uid` 缺少：玩家/GM/创作者三标签页、作品列表、参团记录 |
| G15 | 角色头像定制系统 | 字段已定义 | 14+图层 Canvas 合成系统（附录C）完全未实现：体型/眼睛/发型/服装/配饰 + 颜色滤镜 |
| G16 | 私信系统 | 未实现 | 微信式 DM 界面、Socket /user 命名空间已规划但未接入 |

#### 🟢 UI/UX 待完善（影响视觉品质）

| # | 设计要求 | 当前状态 | 差距描述 |
|---|---------|---------|---------|
| G17 | 设计令牌对齐 | 部分实现 | 附录B 的 Slate 色系、语义变量（--color-primary 等）、日/夜模式切换需全面校准 |
| G18 | SVG 图标精灵表 | 附录I 完整定义 | 27个 SVG 图标需确认全部内联到项目并通过 `<use>` 引用 |
| G19 | 移动端适配 | 未实现 | 附录J 完整规范：底部导航56px、手势支持、功能降级策略、PWA Service Worker |
| G20 | 空状态/错误页/骨架屏 | 部分有 EmptyState | 404/403/离线/空数据/加载中 全套状态页面需补全 |
| G21 | 广场页面 | 路由存在 | 模组+规则集市场的完整浏览/搜索/筛选 UI 缺失 |
| G22 | 首页改版 | 基础可用 | 缺少：快速组队卡片、推荐网格3列、右侧边栏新手指南+平台动态 |
| G23 | 文件上传 | 完全缺失 | 无头像/图片上传端点，设计要求图片≤5MB |

---

## 第二部分：分批执行计划与 AI 提示词

> **执行规则**：
> - 每次只执行一个批次，完成后验证再进入下一批
> - 所有代码使用 Vue 3 `<script setup>` + TypeScript + scoped CSS
> - 所有颜色通过 CSS 变量引用，禁止硬编码色值
> - 不修改已通过测试的引擎核心（`packages/shared/src/utils/`、`packages/server/src/engine/`）
> - 新增 API 路由需同步更新 shared 类型定义
> - 数据库变更通过 Knex migration 文件实现

---

### 批次 1：规则引擎 API 打通 + 命令系统

**优先级**：🔴 最高（G1 + G2 的基础部分）

**上下文**：
- 引擎核心已实现 8 种原子节点：dice-roll, character-skill-reader, formula-eval, if-else, multiply, resource-modify, result-collector, threshold-compare
- 执行器支持拓扑排序 + 顺序执行
- 命令解析器已实现（`/command param1=value1` 格式）
- 规则集存储结构：`{ atoms: [], connections: [], commands: {} }`
- 设计要求三层命令模型：通用命令（平台预置 ra/init/sc/en/ti/li/ds）、检定模板（规则集声明支持）、规则集专属命令

**任务**：
```
请完成以下工作：

1. 【Server】实现规则集 CRUD API（packages/server/src/routes/ruleset-routes.ts）：
   - GET /api/rulesets — 分页列表，支持 status/keyword 筛选
   - GET /api/rulesets/:id — 详情（含 atoms/connections/commands）
   - POST /api/rulesets — 创建规则集（需登录）
   - PUT /api/rulesets/:id — 更新规则集（仅作者）
   - POST /api/rulesets/:id/publish — 发布（draft → published）

2. 【Server】实现命令执行端点（POST /api/rulesets/:id/execute）：
   - 接收参数：{ command: string, context: { character_id, campaign_id, scene_id } }
   - 解析命令字符串 → 匹配规则集 commands 定义
   - 调用引擎执行器，传入角色数据作为上下文
   - 返回 ExecuteResponse（results, logs, side_effects）

3. 【Server】创建 RulesetService（packages/server/src/services/ruleset-service.ts）：
   - CRUD 操作封装
   - 命令匹配逻辑：先查 custom_commands → 再查 supported_commands → 最后查平台预置库
   - 平台预置命令定义（ra/init/sc/en/ti/li/ds 的 atom 图）

4. 【Shared】在 types/index.ts 补充：
   - RulesetCommand 接口（name, description, atom_graph, aliases）
   - PlatformPresetCommands 常量

5. 【测试】为命令执行写至少 3 个集成测试（COC 技能检定、骰子表达式、条件分支）

参考文件：
- 设计文档：docs/附录 F：规则引擎.md（完整 COC 示例 YAML）
- 现有引擎：packages/server/src/engine/
- 现有类型：packages/shared/src/types/index.ts
- 现有路由：packages/server/src/routes/ruleset-routes.ts（当前返回 501）
```

---

### 批次 2：消息可见性（写扩散）实现

**优先级**：🔴 最高（G3）

**上下文**：
- chat_messages 表已有 `visible_to` JSON 字段
- 三种场景类型的可见性规则不同（附录C 伪代码）
- character_scene_states 追踪角色当前位置
- scene_participations 追踪虚拟场景参与记录

**任务**：
```
请完成以下工作：

1. 【Server】在 packages/server/src/socket/chat-handler.ts 的 chat_message 处理中：
   - 实现 computeVisibleTo(sceneId, campaignId) 函数：
     · 空间场景（spatial）：查询 character_scene_states 中 current_spatial_scene_id = sceneId 的所有角色 ID
     · 虚拟场景（virtual）：查询 scene_participations 中 scene_id = sceneId 且 left_at IS NULL 的角色 ID
     · 大厅场景（lobby）：查询该团所有活跃成员的角色 ID
   - 消息发送时自动计算 visible_to 并写入 DB
   - 广播时，仅向 visible_to 列表中角色的在线用户发送（不再 room 广播）

2. 【Server】修改 GET /api/campaigns/:id/messages：
   - 查询时追加过滤条件：visible_to 包含当前用户的角色 ID，或发送者是 GM/系统
   - GM 可查看所有消息

3. 【Client】MessageItem 组件增加"私密消息"视觉标识（非全员可见时显示锁图标）

4. 【Shared】在 events.ts 中确认 new_message 事件已携带 visible_to 字段

参考文件：
- 设计文档：docs/附录 C：技术约定.md 中 computeVisibleTo() 伪代码
- 现有代码：packages/server/src/socket/chat-handler.ts
```

---

### 批次 3：通知系统 + 私信基础

**优先级**：🔴 高（G7 + G16）

**上下文**：
- user_notifications 表已创建（id, user_id, type, title, content, metadata, is_read）
- Socket.IO `/user` 命名空间已规划但未实现
- 设计要求 4 类通知：系统/交易/社交/审核

**任务**：
```
请完成以下工作：

1. 【Server】创建 NotificationService（packages/server/src/services/notification-service.ts）：
   - createNotification(userId, type, title, content, metadata)
   - getUserNotifications(userId, { type?, is_read?, page, limit })
   - markAsRead(notificationId, userId)
   - markAllAsRead(userId, type?)
   - getUnreadCount(userId)

2. 【Server】创建通知 API 路由（packages/server/src/routes/notification-routes.ts）：
   - GET /api/notifications — 我的通知列表（分页、按类型筛选）
   - PUT /api/notifications/:id/read — 标记已读
   - PUT /api/notifications/read-all — 全部标记已读
   - GET /api/notifications/unread-count — 未读数

3. 【Server】实现 Socket.IO /user 命名空间（packages/server/src/socket/user-handler.ts）：
   - 连接时认证，加入 user:${userId} 房间
   - 新通知时推送 notification_new 事件
   - 未读数变更时推送 unread_count_changed 事件

4. 【Server】在现有业务流程中触发通知：
   - 招募申请被审批 → 通知申请者
   - 招募帖有新评论 → 通知帖主
   - 移动请求被审批/拒绝 → 通知玩家
   - 成团成功 → 通知所有成员

5. 【Client】创建通知页面组件（packages/client/src/views/personal/Notifications.vue）：
   - 标签页切换 4 类通知
   - 未读红点
   - 点击标记已读

6. 【Client】在 socket-client.ts 增加 /user 命名空间连接逻辑

参考文件：
- 数据库：migration 002 中 user_notifications 表结构
- 设计文档：docs/附录 D：页面设计.md 2.5 个人中心 - 通知部分
```

---

### 批次 4：论坛/讨论区后端 + 前端完善

**优先级**：🟡 中高（G6）

**上下文**：
- 前端已有路由和页面骨架（ForumBoard.vue, ThreadDetail.vue, MyActivity.vue）
- 5 个子板块：规则讨论、创作交流、跑团经验、新手求助、灌水闲聊
- 设计要求楼层式回复

**任务**：
```
请完成以下工作：

1. 【Server】创建 DB migration（forum 相关表）：
   - forum_threads: id, board(enum), author_id, title, content, view_count, reply_count,
     is_pinned, is_locked, last_reply_at, created_at, updated_at
   - forum_posts: id, thread_id, author_id, content, floor_number, reply_to_post_id,
     created_at, updated_at

2. 【Server】创建 ForumService + API 路由（/api/forum）：
   - GET /api/forum/boards/:board/threads — 帖子列表（分页、排序：最新/最热/最新回复）
   - POST /api/forum/threads — 发帖
   - GET /api/forum/threads/:id — 帖子详情（含楼层分页）
   - POST /api/forum/threads/:id/posts — 回帖
   - GET /api/users/me/activity — 我的发帖+回帖记录

3. 【Client】完善 ForumBoard.vue：
   - 帖子列表卡片（标题、作者、回复数、最后回复时间）
   - 排序切换
   - 发帖按钮 + 发帖弹窗

4. 【Client】完善 ThreadDetail.vue：
   - 楼层式回复列表
   - 引用回复
   - 分页加载更多

5. 【Client】完善 MyActivity.vue：
   - 我发的帖 + 我的回复 标签切换

参考文件：
- 前端页面：packages/client/src/views/community/ForumBoard.vue
- 前端页面：packages/client/src/views/community/ThreadDetail.vue
- 设计文档：docs/附录 D：页面设计.md 社区部分
```

---

### 批次 5：GM 控制台增强

**优先级**：🟡 中高（G9）

**上下文**：
- GMConsole.vue 已有基础功能（时间推进、场景管理、NPC CRUD、广播）
- 缺少：预约移动预览、线索库、NPC 扮演发言、暗骰日志

**任务**：
```
请完成以下工作：

1. 【GM控制台 - 预约移动预览】：
   - 在 GMConsole.vue 增加"待审批移动"标签页
   - 可视化时间线显示：各角色的预约移动及其 execute_at_story 时间点
   - 时间推进前预览：输入推进量后显示"将触发哪些移动"
   - 一键批量审批

2. 【GM控制台 - 线索库】：
   - 新增 Server 端：
     · DB migration：campaign_clues 表（id, campaign_id, title, content, theme,
       is_revealed, revealed_to JSON, revealed_at, created_at）
     · ClueService + API：POST/GET/PUT /api/campaigns/:id/clues
   - GM 创建线索卡时选择 CSS 艺术主题（river/blur/fragment/wave/ancient/blood/ash/cyber）
   - GM 发放线索 → 指定可见角色 → 聊天中以 clue_card 类型消息展示
   - 玩家端 ClueCard 组件应用对应主题 CSS 动画（参考附录G）

3. 【GM控制台 - NPC 扮演发言】：
   - 在聊天输入框增加"扮演身份"下拉选择（GM本人 / 团内各NPC）
   - 选择 NPC 后发送的消息 sender_type='npc'，sender_character_id=npc_id
   - MessageItem 显示 NPC 名称和特殊标识

4. 【GM控制台 - 暗骰日志】：
   - 暗骰：message_type='dice' 且 visible_to 仅含 GM
   - GM 控制台增加"暗骰记录"标签页，显示所有暗骰历史
   - 支持"公开暗骰"操作（修改 visible_to 为全员并广播）

参考文件：
- 设计文档：docs/产品设计.md 第4节 GM 控制台
- 设计文档：docs/附录 G：纯文字艺术设计系统.md
- 现有组件：packages/client/src/components/room/GMConsole.vue
- 现有组件：packages/client/src/components/room/ClueCard.vue
```

---

### 批次 6：助手台完善

**优先级**：🟡 中（G10）

**任务**：
```
请完成以下工作：

1. 【角色卡绑定摘要】：
   - AssistantDesk.vue 顶部显示当前操作角色的摘要卡片
   - 显示：姓名、职业、核心属性（HP/MP/SAN等）、当前场景、个人故事时间
   - 从 character_scene_states 实时获取
   - 资源值变化时高亮闪烁动画

2. 【命令参考面板】：
   - 从当前团绑定的规则集加载 commands 定义
   - 展示可用命令列表（名称、别名、参数说明、示例）
   - 点击命令自动填入聊天输入框
   - 三层命令合并显示：平台通用 + 规则集声明 + 规则集自定义

3. 【暗骰记录（仅GM）】：
   - 如果当前用户是 GM，显示"暗骰记录"标签
   - 拉取 visible_to 仅含 GM 自己的 dice 类型消息
   - 支持"公开"操作

4. 【骰子历史】：
   - 显示当前玩家本局所有骰子记录（从消息中筛选 message_type='dice'）
   - 按时间倒序
   - 显示表达式和结果

参考文件：
- 设计文档：docs/产品设计.md "助手台"章节
- 设计文档：docs/附录 F：规则引擎.md 命令系统
- 现有组件：packages/client/src/components/room/AssistantDesk.vue
```

---

### 批次 7：网格地图 V1.0 最小实现

**优先级**：🟡 中（G11）

**任务**：
```
请完成以下工作（V1.0 最小实现，不含战争迷雾/动态光照/测量工具）：

1. 【数据结构】：
   - DB migration：campaign_grid_maps 表（id, campaign_id, scene_id, width, height,
     cell_size, background_image_url, tokens JSON, created_at, updated_at）
   - Token 结构：{ id, character_id|npc_id, label, color, x, y, size }

2. 【Server API】：
   - GET /api/campaigns/:id/scenes/:sceneId/grid-map
   - PUT /api/campaigns/:id/scenes/:sceneId/grid-map（GM only）
   - Socket 事件：grid_token_moved（GM 拖拽 token 后广播）

3. 【Client - GridMap.vue】：
   - Canvas/SVG 渲染方格网格
   - 显示 token（角色/NPC 以圆形色块+名字缩写表示）
   - GM 可拖拽 token 到新位置
   - 玩家只读查看
   - 支持滚轮缩放、拖拽平移
   - 在 GM 控制台作为标签页嵌入

参考文件：
- 设计文档：docs/产品设计.md "网格地图"章节（明确 V1.0 范围极简）
- 现有组件：packages/client/src/components/room/GridMap.vue
```

---

### 批次 8：设计令牌对齐 + 日/夜模式

**优先级**：🟢 中（G17）

**任务**：
```
请完成以下工作：

1. 【CSS 变量体系】对照附录B v2.3.1 全面校准：
   - 确保以下语义变量存在且值正确：
     · --color-primary / --color-primary-hover / --color-primary-active
     · --surface-page / --surface-card / --surface-hover
     · --text-primary / --text-body / --text-caption / --text-disabled
     · --border-default / --border-strong
     · --btn-primary-bg / --btn-primary-text
     · --shadow-sm / --shadow-md / --shadow-lg / --shadow-xl
     · 功能色：--color-success / --color-warning / --color-danger / --color-info
   - 日间模式：Slate 900 为主色（近黑按钮 + 白色文字）
   - 夜间模式：Slate 200 为主色（浅灰按钮 + 深色文字）—— 反转策略

2. 【主题切换】：
   - 实现 useTheme composable 的日/夜切换功能
   - 在 <html> 标签上切换 data-theme="light" / "dark"
   - 所有 CSS 变量通过 [data-theme] 选择器分组定义
   - 用户偏好持久化到 localStorage，默认跟随系统 prefers-color-scheme

3. 【组件校准】：
   - TButton：primary 使用 --btn-primary-bg，hover 态 translateY(-1px) + shadow 增强
   - TCard：8px 圆角、20px 内边距、shadow-sm、hover 态 translateY(-2px) + shadow-md
   - TInput：focus 态 primary 边框 + shadow
   - TTag：语义色背景（success 绿底/warning 琥珀底/danger 红底/info 蓝底）
   - 骨架屏：shimmer 动画（左→右渐变扫过）

4. 【SVG 图标】：
   - 确认附录I 的 27 个 SVG 图标已全部内联到项目
   - 确认 SvgIcon 组件通过 <use href="#icon-name"> 引用
   - 图标使用 fill="currentColor" 自动跟随主题色

参考文件：
- 设计文档：docs/附录 B：UI设计规范.md（完整色值表和组件规范）
- 设计文档：docs/附录 I：svg项目静态资源.md（完整 SVG 代码）
- 现有样式文件：packages/client/src/ 下的 CSS/样式文件
```

---

### 批次 9：广场页面 + 资产库

**优先级**：🟢 中（G21）

**任务**：
```
请完成以下工作：

1. 【广场页面（/assets）】：
   - 两级结构：发现（公共市场） / 我的（个人资产）
   - 模组市场标签页：
     · 卡片网格展示（封面、名称、适配规则集、评分、价格/免费标签）
     · 状态标签：未拥有/已拥有/公示期中
     · 搜索 + 筛选（规则集、价格范围、排序）
   - 规则集市场标签页：
     · 卡片展示（名称、版本、作者、使用人数）
     · 搜索 + 分类筛选
   - 我的资产标签页：
     · 已购买/已创建的模组和规则集
     · 编辑/删除操作

2. 【Server API 扩展】：
   - GET /api/rulesets 增加分页和搜索参数
   - GET /api/modules（新增，即使模组编辑器未完成，先建立数据模型和列表接口）
   - modules 表 migration（id, name, author_id, ruleset_id, description, cover_url,
     status, price, created_at）

参考文件：
- 设计文档：docs/附录 D：页面设计.md 2.2 资产库
```

---

### 批次 10：首页改版 + 个人中心完善

**优先级**：🟢 中（G22 + G14）

**任务**：
```
请完成以下工作：

1. 【首页改版（Home.vue）】：
   - 快速组队卡片区：4个入口（找团/做GM/发招募/发求组）
   - 推荐网格：3列布局，展示热门模组/规则集/招募
   - 组队动态 Feed：最新招募帖流
   - 右侧边栏：新手指南链接、平台动态公告
   - 已登录时顶部显示"我的团"快捷卡片

2. 【用户公开主页（/u/:uid）】：
   - 三标签页：玩家（参团记录、角色展示）/ GM（主持记录、评价）/ 创作者（发布的模组和规则集）
   - 基础信息卡：头像、昵称、UID、注册时间、关注/粉丝数
   - Server API：GET /api/users/:uid/profile（公开信息）

3. 【个人中心完善】：
   - 安全设置（Security.vue）：修改密码
   - 隐私设置（Privacy.vue）：公开资料范围
   - 关于页面（About.vue）：版本信息、反馈入口

参考文件：
- 设计文档：docs/附录 D：页面设计.md 2.1 首页、2.5 个人中心
- 现有页面：packages/client/src/views/Home.vue
```

---

### 批次 11：移动端适配基础

**优先级**：🟢 中低（G19）

**任务**：
```
请完成以下工作（参照附录J完整规范）：

1. 【响应式断点】：
   - 在全局 CSS 中定义：Desktop >=1024px, Tablet 768-1023px, Mobile <768px
   - 底部导航栏（56px）：首页/资产库/我的团/社区/个人，仅 <1024px 显示
   - 顶部导航栏桌面端保留，移动端简化为 logo + 通知铃铛

2. 【关键页面移动适配】：
   - 首页：单列布局，快速组队改为 2x2 网格，推荐改为 2列
   - 招募列表：筛选折叠为"更多筛选"抽屉
   - 个人中心：全屏 drawer 替代弹窗

3. 【团房间移动布局】：
   - 左侧导航 → 汉堡菜单抽屉（85%宽度）
   - 助手台 → 底部快捷栏（4按钮：骰子/角色卡/命令/更多）
   - GM 控制台 → 底部 action sheet + 标签切换
   - 聊天区全屏，每次加载 20 条消息

4. 【功能降级】：
   - 规则工坊 L3 画布、模组编辑器、可视化日志编辑器：显示"请使用电脑端"提示
   - 网格地图：静态预览 + 坐标列表
   - 轨迹矩阵：纵向时间线视图

5. 【PWA 基础】：
   - 添加 manifest.json
   - 注册 Service Worker（基础离线缓存）

参考文件：
- 设计文档：docs/附录 J：移动端适配设计指南.md（完整规范）
```

---

### 批次 12：日志导出 UI 完善

**优先级**：🟢 中低（G13）

**任务**：
```
请完成以下工作：

1. 【导出模式】：
   - "我的故事"：仅包含玩家可见消息，以角色视角叙述
   - "完整剧本"：GM 视角，包含所有消息和暗骰

2. 【排序策略】：
   - 严格时间顺序（按 Snowflake ID）
   - 场景优先（按场景分组，组内按时间）
   - 主线穿插（主场景为主线，虚拟场景按时间插入）
   - 自定义（GM 拖拽排序）

3. 【导出格式】：
   - JSON（ILF 格式，已有）
   - Markdown（已有，需完善模板）
   - 纯文本

4. 【Client UI（LogExport.vue）】：
   - 模式选择
   - 场景筛选复选框
   - 排序策略选择
   - 预览面板
   - 下载按钮

参考文件：
- 设计文档：docs/产品设计.md 4.7 日志导出
- 设计文档：docs/附录 H：跑团日志中间格式规范.md
- 现有页面：packages/client/src/views/LogExport.vue
```

---

### 批次 13：文件上传 + 头像系统

**优先级**：🟢 低（G23 + G15 基础部分）

**任务**：
```
请完成以下工作：

1. 【Server 文件上传】：
   - POST /api/upload — multipart 文件上传
   - 限制：图片类型（jpg/png/webp/gif），大小 ≤ 5MB
   - 存储到本地 uploads/ 目录（V1.0 简单实现）
   - 返回访问 URL
   - Express 静态文件服务 /uploads

2. 【用户头像上传】：
   - PUT /api/users/me/avatar — 上传并更新头像
   - 前端个人中心增加头像上传交互

3. 【角色卡头像上传】：
   - 角色编辑器支持上传头像图片
   - 保存到 character_sheets.avatar_url

注：完整的 14 层 Canvas 头像定制系统（附录C）可放到后续版本，V1.0 先支持图片上传即可。

参考文件：
- 设计文档：docs/附录 C：技术约定.md 头像定制系统部分
- 数值限制：图片上传 ≤ 5MB
```

---

### 批次 14：空状态 / 错误页 / 骨架屏

**优先级**：🟢 低（G20）

**任务**：
```
请完成以下工作：

1. 【错误页面】：
   - 404 页面：使用 SVG 图标 state-404，友好文案 + 返回首页按钮
   - 403 页面：使用 SVG 图标 state-forbidden
   - 网络错误页：使用 state-offline
   - 服务器错误页：使用 state-error

2. 【空状态统一】：
   - 完善 EmptyState 组件：支持自定义图标、标题、描述、操作按钮
   - 在以下页面使用：我的团（无团时）、角色列表（无角色时）、招募列表（无结果时）、
     通知列表（无通知时）、论坛（无帖子时）、聊天区（无消息时）

3. 【骨架屏】：
   - 为以下页面添加加载骨架屏：
     · 首页推荐列表
     · 招募帖列表
     · 团房间加载
     · 角色卡详情
   - 骨架使用 shimmer 动画（附录B 规范）

参考文件：
- 设计文档：docs/附录 B：UI设计规范.md 骨架屏规范
- 设计文档：docs/附录 I：svg项目静态资源.md 状态占位图标
```

---

### 批次 15：轨迹矩阵 + 场景连接可视化

**优先级**：🟢 低（G12）

**任务**：
```
请完成以下工作：

1. 【轨迹矩阵（TrajectoryMatrix.vue）】：
   - 数据源：GET /api/campaigns/:id/position-history
   - 矩阵视图：X轴=故事时间段，Y轴=角色列表，单元格=所在场景（色块标识）
   - 鼠标悬停显示详情（角色名、场景名、进入时间、离开时间）
   - 在 GM 控制台作为标签页嵌入
   - 会员功能标识

2. 【场景连接路线图】：
   - 在左侧导航的场景列表下方增加"路线图"简易可视化
   - 使用简单的节点+连线图展示场景间连接关系
   - 节点显示场景名，连线显示通行时长
   - GM 可点击编辑连接

参考文件：
- 设计文档：docs/产品设计.md 轨迹矩阵部分
- 现有组件：packages/client/src/components/room/TrajectoryMatrix.vue
- 现有 API：GET /api/campaigns/:id/position-history
```

---

## 第三部分：全局约束与技术规范速查

### 架构约束
- **前端**：Vue 3 + TypeScript + `<script setup>` + Scoped CSS + Element Plus + Pinia + Vue Router
- **后端**：Express + TypeScript + Knex.js + MySQL/MariaDB + Redis + Socket.IO + JWT
- **共享包**：packages/shared — 所有接口类型和工具函数的唯一来源
- **不使用 AI**：V1.0 不包含任何 AI 功能
- **纯 Web + PWA**：不使用 Electron 或原生应用

### ID 规范（附录A）
| 实体 | 用户可见格式 | 内部格式 |
|------|-------------|---------|
| 用户 UID | 7位数字（从1000000起） | UUID v4 |
| 房间号 | 6位字母数字（排除I,O,Z,0,1） | UUID v4 |
| 角色编号 | 8位十六进制 | UUID v4 |
| 模组/规则集编号 | 8位字母数字 | UUID v4 |
| 消息 ID | 19位 Snowflake | BIGINT UNSIGNED |

### 数值限制（附录C）
- 房间名：2-32字符 | 昵称：2-16字符
- 骰子：最多100颗/1000面 | 聊天：最多2000字符
- 每团最多20个角色 | 图片上传 ≤ 5MB
- 消息速率限制：5条/秒/用户

### Socket.IO 事件清单（附录C）
**Server→Client**：new_message, time_advanced, position_changed, character_state_sync, move_approved, move_rejected, rate_limited, missed_messages, notification_new, grid_token_moved
**Client→Server**：join_room, leave_room, subscribe_scene, chat_message, request_move, gm_approve_move, gm_reject_move, gm_advance_time

### 错误码规范（附录C）
- 400: BAD_REQUEST | 401: UNAUTHORIZED | 403: FORBIDDEN | 404: NOT_FOUND | 429: RATE_LIMITED | 500: INTERNAL_ERROR
- 业务码：ROOM_NOT_FOUND, ROOM_FULL, MOVE_CONFLICT, ENGINE_TIMEOUT, ENGINE_ATOM_ERROR 等

### 状态机（附录C）
- 招募帖：open → full → closed
- 团状态：preparing → running → paused → ended
- 预约移动：pending → approved → executed / cancelled
- 模组：draft → reviewing → public_notice(7天) → published → suspended
- 规则集：draft → published

### 文件结构参考
```
packages/
├── client/src/
│   ├── components/    # 基础组件 + 房间组件
│   ├── composables/   # useTheme 等
│   ├── router/        # 路由配置
│   ├── socket/        # Socket.IO 客户端
│   ├── stores/        # Pinia stores
│   ├── utils/         # API 工具
│   └── views/         # 页面组件
├── server/src/
│   ├── db/            # Knex 配置 + migrations
│   ├── engine/        # 规则引擎（原子节点 + 执行器）
│   ├── middleware/     # 认证中间件
│   ├── routes/        # API 路由
│   ├── services/      # 业务逻辑层
│   └── socket/        # Socket.IO 处理器
└── shared/src/
    ├── types/         # 全部接口定义
    └── utils/         # ID生成、Snowflake、CSON、ILF
```

---

## 第四部分：使用说明

### 如何使用本文档

1. **按批次顺序执行**：批次 1-3 为核心功能，优先完成；批次 4-7 为重要功能；批次 8-15 为体验优化
2. **每批次提交给 AI 时**：将"批次N 的完整内容"+ "第三部分全局约束"一起提供
3. **AI 需要额外上下文时**：让 AI 阅读对应的 `docs/` 原始设计文档
4. **每批次完成后**：运行现有测试确保无回归，手动验证新功能
5. **跨批次依赖**：批次 2（消息可见性）是批次 5（暗骰）的前置；批次 1（规则集API）是批次 6（命令参考）的前置

### 提示词模板

向 AI 提交任务时，使用以下模板：

```
## 项目背景
这是一个 TRPG（桌面角色扮演）Web 平台，使用 Vue 3 + Express + TypeScript + Socket.IO + MySQL + Redis。
项目为 monorepo 结构，包含 client/server/shared 三个包。

## 本次任务
[粘贴对应批次的任务内容]

## 全局约束
[粘贴第三部分的全局约束内容]

## 需要阅读的现有文件
[列出该批次涉及的现有代码文件路径]

## 输出要求
- 输出完整文件内容（不要用省略号或"其余不变"）
- 新增文件说明放置路径
- 数据库变更提供 Knex migration 文件
- 类型变更同步更新 packages/shared/src/types/
- 如有新的 Socket 事件，同步更新 packages/shared/src/types/events.ts
```
