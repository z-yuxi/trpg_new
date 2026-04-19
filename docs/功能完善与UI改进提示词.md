# TRPG 平台 · 功能完善与 UI 改进提示词

> **背景**：项目骨架和基础 API 已通，但与产品设计文档相比，缺失大量页面、功能不完整、UI 风格未对齐设计令牌。
> **用法**：按批次发给 AI（Cursor / Claude），每次附上该批次涉及的现有文件 + 对应的设计文档。
> **项目路径**：`/home/jean/trpg_new/`

---

```
你是一名 TypeScript 全栈工程师 + UI 开发者。我有一个 TRPG 平台项目（pnpm monorepo），需要你按以下批次逐步完善，使其匹配产品设计文档的要求。

## 项目现状（已完成，不要重写）

- 规则引擎（dice/formula/executor/atoms/registry）✅
- 数据库 14 张表 + 迁移 ✅
- 共享类型定义 ✅
- 认证系统（注册/登录/JWT）✅
- 基础路由和 Service 层 ✅
- Socket.IO 聊天收发 ✅
- 基础 UI 组件（TButton/TCard/TInput/TTag）✅
- 房间四区布局（左栏/聊天/助理台/GM 控制台）✅
- 招募系统 CRUD ✅

## 当前与设计文档的差距

### UI 风格差距
- tokens.css 中的颜色值与设计文档（附录 B）不一致，品牌色应为雾蓝 #5B8DB8 + 灰红 #B85450
- 夜间模式 CSS 变量不完整，切换后大部分颜色不变
- 间距/圆角/阴影/字体未完整对齐设计令牌
- 聊天气泡没有按设计文档实现尖角效果
- 标签组件使用硬编码颜色而非 CSS 变量

### 缺失页面
- 广场页（模组集市 + 规则集市 + 筛选器 + 卡片网格）
- 公开个人资料页（/u/{uid}，含玩家/GM/创作者标签页）
- 讨论区（子板块：规则问答/模组创作/游玩体验/新人求助/水区）
- 帖子详情页（楼层式回复）
- 创作台完整版（规则工坊 L1 表单 / L3 画布 / 模组编辑器 / 素材库）
- 角色卡多步创建流程（选规则→选职业→生成属性→分配技能→填背景→预览保存）
- 模组详情页 / 规则包详情页

### 功能差距
- GM 控制台：时间推进缺少"预览将触发的预约移动"、线索库标签页为空
- 助理台：暗骰日志（GM 专属）未实现、指令速查不从 ruleset 读取
- 日志导出：没有可视化拖拽编辑器，只有原始 JSON/Markdown
- 角色卡：缺少 PDF 导出、CSON 导入导出的 UI 入口
- 设置页面：安全/隐私/通知都是占位符

---

## 批次执行计划（共 15 批）

每个批次我会说"执行批次 N"，你需要读取我提供的文件，输出修改/新建后的完整文件内容。

---

### 批次 01：设计令牌全面对齐

读取以下文件：
- packages/client/src/styles/tokens.css
- packages/client/src/styles/theme-day.css
- packages/client/src/styles/theme-night.css
- 设计文档：附录B：UI设计规范.md

要求：
1. 重写 tokens.css，完整实现附录 B 2.1~2.6 的所有 CSS 变量：
   - 品牌色：--color-primary: #5B8DB8, --color-danger: #B85450, --color-success: #6B8E6B, --color-warning: #C9A227
   - 完整灰阶：gray-0 到 gray-900（附录 B 2.1 的精确值）
   - 间距：space-0 到 space-12（4px 为基数）
   - 圆角：radius-none/sm/md/lg/xl/full
   - 字体：sans 和 mono 字体栈、text-xs 到 text-2xl、font-normal 到 font-bold、行高 tight/normal/relaxed
   - 阴影：shadow-xs 到 shadow-xl（附录 B 2.5 的精确值）
   - 动画：duration-instant/fast/normal/slow/slower、ease-out/in-out/spring、transition-fast/normal/slow

2. 重写 theme-day.css：`:root[data-theme="day"]` 下覆盖所有语义色、灰阶、阴影为亮色模式值
3. 重写 theme-night.css：`:root[data-theme="night"]` 下覆盖为暗色模式值（附录 B 2.1 暗色列）
4. 确保默认（无 data-theme 属性时）使用亮色模式

验收：切换日/夜模式时，全站颜色、阴影、背景完整切换。

---

### 批次 02：基础组件对齐设计文档

读取以下文件：
- packages/client/src/components/base/TButton.vue
- packages/client/src/components/base/TCard.vue
- packages/client/src/components/base/TInput.vue
- packages/client/src/components/base/TTag.vue
- packages/client/src/components/room/MessageItem.vue
- 设计文档：附录B：UI设计规范.md（3.1~3.5 节）

要求：
1. TButton：按附录 B 3.1 调整——primary 用 var(--color-primary)，danger 用 var(--color-danger)，尺寸 small(28px)/standard(36px)/large(44px)，padding 用 var(--space-2)
2. TCard：按附录 B 3.2——12px 圆角、20px padding、shadow-sm 默认、hover 时 shadow-md + translateY(-2px)
3. TInput：按附录 B 3.3——focus 时 border 变 primary + primary-light 阴影
4. TTag：删除硬编码颜色，全部使用 CSS 变量，hover 时 primary-light 背景
5. MessageItem（聊天气泡）：按附录 B 3.5——GM 气泡右对齐 + primary-light 背景 + 右下尖角（4px border-radius），玩家气泡左对齐 + gray-100 背景 + 左下尖角，最大宽度 85%

验收：组件在日/夜模式下都正确显示，聊天气泡有尖角效果。

---

### 批次 03：广场页（模组集市 + 规则集市）

读取以下文件：
- packages/client/src/router/index.ts
- packages/client/src/views/AssetLibrary.vue（当前的素材广场页）
- 设计文档：附录D：页面设计.md（3.2 广场页）

要求：
1. 将 AssetLibrary.vue 重构为 Plaza.vue（或重命名），实现附录 D 3.2 的设计：
   - 顶部两个标签页：模组集市 / 规则集市
   - 筛选器行：规则/题材/难度/人数/风格/排序（用 Element Plus 的 Select 组件）
   - 4 列响应式卡片网格（移动端 1 列，平板 2 列，桌面 4 列）
   - 模组卡片：封面图/标题/作者/难度标签/适合人数/风格/价格/评分/下载量
   - 规则卡片：名称/版本/作者/衍生自哪个规则/状态标签
2. 数据来源：GET `/api/rulesets?status=published` + GET `/api/modules`（modules 接口如不存在，先显示空状态）
3. 搜索框：本地过滤当前页数据
4. 更新路由

验收：广场页显示两个标签页，卡片网格布局正确。

---

### 批次 04：社区讨论区

读取以下文件：
- packages/client/src/views/Community.vue
- packages/client/src/views/community/RecruitmentBoard.vue
- packages/client/src/views/community/RecruitmentDetail.vue
- packages/client/src/router/index.ts
- 设计文档：附录D：页面设计.md（3.4 社区页）

要求：
1. 重构 Community.vue 为带左侧导航的布局（附录 D 3.4）：
   - 左侧导航（200px）：招募板 / 讨论区（下设子板块）/ 我的动态
   - 讨论区子板块：规则问答 / 模组创作 / 游玩体验 / 新人求助 / 水区
2. 新建 packages/client/src/views/community/ForumBoard.vue：
   - 帖子列表表格：标题/作者/回复数/浏览数/最后回复
   - 标签支持：置顶/精华/NEW
   - 分页
3. 新建 packages/client/src/views/community/ThreadDetail.vue：
   - 楼层式回复布局
   - 回复输入框
   - 楼层号显示
4. 新建 packages/client/src/views/community/MyActivity.vue：
   - 时间线格式展示用户动态
5. 后端如无对应 API，帖子数据用本地状态管理（标注 TODO），但 UI 必须完整
6. 更新路由：/community/forum/:board, /community/thread/:id, /community/activity

验收：社区页有完整的左侧导航、讨论区帖子列表、帖子详情页。

---

### 批次 05：角色卡多步创建流程

读取以下文件：
- packages/client/src/views/CharacterEditor.vue
- packages/client/src/views/personal/PersonalCharacters.vue
- packages/shared/src/types/index.ts（CharacterSheet）
- 设计文档：附录D：页面设计.md（3.6 角色管理）、产品设计.md（角色卡系统章节）

要求：
1. 重构 CharacterEditor.vue 为多步流程（附录 D 3.6）：
   - Step 1：选择规则包（从 GET /api/rulesets 加载列表，选中后加载 character_card_schema）
   - Step 2：选择职业（从规则包的 occupations 字段读取，无则跳过）
   - Step 3：生成属性（根据规则包 character_card_schema.attributes 的 roll_formula 投骰，显示结果，支持重投）
   - Step 4：分配技能点（根据职业的 skill_points_formula 计算可分配点数，滑块分配）
   - Step 5：填写背景（文本域：外貌、背景故事、信仰、重要之人）
   - Step 6：预览 & 保存（展示完整角色卡，确认后 POST /api/characters）
2. 顶部进度条显示当前步骤（1/6）
3. 支持上一步/下一步导航，已填内容不丢失
4. 如果规则包没有 character_card_schema，显示通用自由填写表单

验收：能走通 6 步创建一个角色卡。

---

### 批次 06：GM 控制台完善

读取以下文件：
- packages/client/src/components/room/GMConsole.vue
- packages/client/src/components/ClueCard.vue
- packages/client/src/styles/text-art.css
- 设计文档：产品设计.md（4.3 GM 控制台章节）、附录G：纯文字艺术设计系统.md

要求：
1. 时间推进面板改进：
   - 点击推进按钮后，先弹出确认框，显示"将触发以下预约移动"列表（从 GET /api/campaigns/{id}/scheduled-moves?status=pending 获取，筛选 execute_at_story <= new_time 的）
   - 确认后才 emit gm_advance_time
2. 线索库标签页完整实现：
   - 线索列表（标题/主题/分发状态）
   - 新建线索表单：标题、内容、主题选择器（8 个 CSS 主题的缩略预览）
   - 主题选择器：8 个小卡片，每个卡片用对应主题渲染示例文字，点击选中
   - 分发按钮：选择接收角色，通过 socket 发送 message_type='clue_card' 消息
   - 预览区：实时预览当前线索在选定主题下的效果
3. NPC 控制完善：
   - "扮演 NPC" 按钮点击后，聊天输入框切换身份（sender_character_id 改为 NPC ID，气泡显示 NPC 名字）

验收：时间推进有确认弹框，线索库能创建、预览、分发线索，NPC 可切换扮演。

---

### 批次 07：助理台完善

读取以下文件：
- packages/client/src/components/room/AssistantDesk.vue
- 设计文档：附录D：页面设计.md（3.8.4 助理台）、产品设计.md（4.4 助理台章节）

要求：
1. 角色卡区域（置顶）：
   - 未绑定状态：显示"选择角色"按钮，点击弹出角色选择模态框
   - 已绑定状态：显示头像+名字+HP 条（从 derived_max 中的 health 资源计算百分比），点击展开完整属性面板
2. 指令速查：
   - 从当前 campaign 的 ruleset 读取 supported_commands + command_overrides + custom_commands
   - 每条指令显示：命令模板 / 说明 / "使用"按钮（点击填入聊天输入框）
3. 暗骰日志（仅 GM 可见）：
   - 显示 visible_to 不为 null 的骰子消息（即非公开骰）
   - 列表：表达式/结果/时间/锁图标
   - 导出 CSV 按钮
4. 骰子历史筛选：
   - 增加按技能名/时间范围筛选

验收：助理台显示绑定角色 HP 条，指令从 ruleset 读取，GM 能看到暗骰日志。

---

### 批次 08：创作台框架

读取以下文件：
- packages/client/src/views/CreatorDashboard.vue
- packages/client/src/router/index.ts
- 设计文档：附录D：页面设计.md（3.5 创作台）

要求：
1. 创作台改为左侧导航布局（附录 D 3.5）：
   - 左侧导航：规则工坊 / 模组编辑器 / 素材库 / 创作者面板 / 我的作品
   - 路由：/creator/workshop, /creator/modules, /creator/assets, /creator/dashboard, /creator/products
2. 规则工坊页面（/creator/workshop）：
   - 我的规则包列表（卡片网格）
   - 新建规则包按钮
   - 点击规则包进入编辑器（L1 表单模式）
3. L1 表单模式（/creator/workshop/:id/edit）：
   - 结构化表单：检定模式(roll_under/roll_over/dice_pool)、默认骰子、成功公式、难度等级、大成功/大失败范围、奖励骰
   - 资源定义列表（可增删）：资源名/最大值公式/恢复条件
   - 属性定义列表（可增删）：属性名/投骰公式/范围
   - 支持的指令列表（勾选）
   - 保存：POST/PUT /api/rulesets
4. 模组编辑器和其他标签页先显示"开发中"占位

验收：创作台有左侧导航，规则工坊能列表和编辑规则包。

---

### 批次 09：公开个人资料页

读取以下文件：
- packages/client/src/views/Personal.vue
- packages/client/src/router/index.ts
- 设计文档：附录D：页面设计.md（3.7 公开个人资料）

要求：
1. 新建 packages/client/src/views/UserProfile.vue，路由 /u/:uid
2. 布局（附录 D 3.7）：
   - 头部：头像 + 昵称 + 个人简介 + 身份徽章（玩家/GM/创作者）+ 关注/粉丝数 + 关注/私信按钮
   - 三个标签页：玩家 / GM / 创作者
   - 玩家标签：参团统计卡片、信誉徽章、评价摘要
   - GM 标签：带团统计、风格徽章、引用模组数
   - 创作者标签：作品列表（卡片网格）、创作数据
3. 数据来源：GET /api/users/:uid/profile（如不存在先用 GET /api/users/:uid 的基础信息 + 空状态）
4. 关注/取消关注：POST /api/users/:uid/follow（如不存在标注 TODO）

验收：能通过 /u/1000000 访问测试 GM 的公开资料页。

---

### 批次 10：设置页完善

读取以下文件：
- packages/client/src/views/personal/SecuritySettings.vue
- packages/client/src/views/personal/PrivacySettings.vue
- packages/client/src/views/personal/NotificationSettings.vue
- packages/client/src/views/personal/About.vue

要求：
1. SecuritySettings：
   - 修改密码表单（当前密码 + 新密码 + 确认新密码）→ PUT /api/users/me/password
   - 密码强度提示（≥8 位、含数字和字母）
   - 手机号显示（脱敏：138****0000）
2. PrivacySettings：
   - 开关列表：个人资料公开/在线状态可见/参团记录公开
   - 保存按钮 → PUT /api/users/me/privacy
3. NotificationSettings：
   - 分组开关：系统通知/招募回复/私信通知/团内@提醒
   - 保存按钮 → PUT /api/users/me/notification-settings
4. About：
   - 版本号从 package.json 读取
   - 链接：使用条款/隐私政策/开源许可（先用 # 占位但不标"占位"）
   - 反馈入口

验收：四个设置页有完整的表单 UI，能提交（后端不存在时显示保存失败提示）。

---

### 批次 11：首页对齐设计文档

读取以下文件：
- packages/client/src/views/Home.vue
- 设计文档：附录D：页面设计.md（3.1 首页）

要求：
按附录 D 3.1 重构首页布局：
1. Banner 区：纯色背景 + 文字 + 按钮（不用图片，CSS 渐变即可），可硬编码 1~2 条欢迎语
2. 进行中的战役：水平滚动卡片（280px 宽），从 GET /api/campaigns 获取
3. 为你推荐：3 列卡片网格，从 GET /api/rulesets 获取
4. 右侧栏（桌面端）：
   - 热门招募（5 条列表，从 GET /api/recruitment?limit=5 获取）
   - 最近动态（时间线列表，暂显示空状态）
5. 移动端：右侧栏内容放到主内容下方

验收：首页布局匹配设计文档，有 banner、卡片滚动、右侧栏。

---

### 批次 12：移动端底部导航 + 响应式

读取以下文件：
- packages/client/src/layouts/BottomNav.vue
- packages/client/src/layouts/MainLayout.vue
- packages/client/src/styles/mobile.css
- 设计文档：附录D：页面设计.md（1.2 移动端导航）、附录J：移动端适配设计指南.md

要求：
1. BottomNav 改为 5 项（附录 D 1.2）：首页 / 广场 / 房间大厅 / 社区 / 我的
2. 桌面端（>768px）隐藏底部导航，显示顶部导航栏
3. 移动端（≤768px）隐藏顶部导航部分内容，显示底部导航
4. 触摸目标 ≥44×44px
5. 安全区域适配（bottom safe area inset）
6. 房间页面（RoomLayout）移动端：隐藏左右侧栏，底部显示快捷操作栏

验收：在 375px 宽度下，底部导航正确显示 5 个图标，房间页面可用。

---

### 批次 13：8 种 CSS 文字艺术主题验证与完善

读取以下文件：
- packages/client/src/styles/text-art.css
- packages/client/src/components/ClueCard.vue
- 设计文档：附录G：纯文字艺术设计系统.md

要求：
1. 逐一检查 text-art.css 中的 8 个主题类（.theme-river / .theme-blur / .theme-fragment / .theme-wave / .theme-ancient / .theme-blood / .theme-ash / .theme-cyber）是否与附录 G 的 CSS 代码一致
2. 缺失的主题补全完整 CSS
3. ClueCard.vue 确保：
   - 接收 theme prop，动态应用对应的主题类
   - 移动端降级：减少动画复杂度
   - 尊重 prefers-reduced-motion：关闭所有动画
4. 创建主题预览组件 packages/client/src/components/ThemePreview.vue：
   - 接收 theme 和 text props
   - 渲染一个小卡片预览（用于 GM 控制台的线索主题选择器）

验收：8 个主题都能正确渲染，移动端不卡顿。

---

### 批次 14：日志导出 UI

读取以下文件：
- packages/server/src/services/log-export-service.ts
- packages/server/src/routes/logs.ts
- 设计文档：产品设计.md（4.7 日志导出章节）、附录H：跑团日志中间格式规范.md

要求：
1. 新建 packages/client/src/views/LogExport.vue，路由 /room/:id/export
2. 导出选项（附录 H + 产品设计 4.7）：
   - 排序模式选择：时间线顺序 / 按场景分组 / 主线穿插
   - 场景筛选：勾选要包含的场景
   - 格式选择：JSON（ILF）/ Markdown / 纯文本
   - 导出按钮 → GET /api/campaigns/:id/export?format=markdown&scenes=...
   - 结果预览区（只读文本框显示导出内容）
   - 下载按钮（Blob 下载）
3. 从 Room.vue 的顶部栏添加"导出日志"入口按钮

验收：能选择格式和场景导出日志并下载。

---

### 批次 15：空状态 + 错误页 + 加载骨架屏

读取以下文件：
- packages/client/src/components/base/TSkeleton.vue
- packages/client/src/assets/icons.svg
- 设计文档：附录D：页面设计.md（六 空状态与错误页）

要求：
1. 创建 packages/client/src/components/base/EmptyState.vue：
   - props: icon（SVG 名）, title, description, actionText, actionRoute
   - 居中布局：图标 + 标题 + 描述 + 可选的操作按钮
2. 创建 packages/client/src/views/NotFound.vue（404 页面）：
   - 使用 EmptyState，标题"页面不存在"，按钮"返回首页"
3. 创建 packages/client/src/views/Forbidden.vue（403 页面）
4. 在 router 中添加 404 catch-all 路由
5. 改进 TSkeleton：支持 type="card" / "list" / "text" 不同骨架样式
6. 在以下页面的加载状态中使用骨架屏替换"加载中..."文字：
   - Home.vue、MyCampaigns.vue、PersonalCharacters.vue、Plaza.vue

验收：访问不存在的路由显示 404 页面，页面加载时显示骨架屏。

---

## 执行规则

1. **每次只执行一个批次**，我会说"执行批次 N"。
2. **输出完整文件**，不用"其余不变"省略。
3. **所有颜色、间距、圆角必须使用 CSS 变量**（var(--color-xxx), var(--space-xxx)），不要硬编码 hex 值。
4. **不要修改 engine 目录**、shared/types 和 shared/utils。
5. **如果后端 API 不存在**，前端按正常流程调用，失败时显示友好提示，不要编造假数据。
6. **组件使用 Vue 3 <script setup> + TypeScript**，样式使用 scoped CSS。
7. **每份文件末尾不要添加设计文档未提及的功能。**
```
