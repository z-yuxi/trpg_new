# 前端壳层重构 & 页面迁移方案

> 本文档供 AI 开发助手直接消费，明确"改什么、不改什么、按什么顺序改"。

---

## 一、现状与目标差异总览

| 维度 | 当前实现 | 目标设计（附录 A05/A07） |
|------|---------|------------------------|
| 底部导航 | 5 tab 硬编码：首页/素材库/我的团/社区/我 | 5 tab 配置驱动：探索/招募/房间⇄创作台(动态)/讨论/叙途 |
| 顶栏右侧 | 仅主题切换按钮 | 三入口：铃铛(通知) / 信封(私信) / 头像▼(下拉面板) |
| 身份切换 | 无 | 玩家/主持人 ⇄ 创作者，影响中间 tab + 通知/私信面板 |
| 首页 `/` | 已登录用户的 Dashboard（最近的团+规则集） | 仅未登录可见的品牌页；已登录自动跳转 `/explore` |
| 个人中心 | Personal.vue 单页菜单列表 | "叙途"完整主页 + 独立 `/settings` 页 |
| 创作者后台 | 独立路由 `/creator`，不在 MainLayout 内 | 中间 tab 动态切换至创作台，复用壳层 |
| 通知/私信 | Personal.vue 内的菜单项（无实现） | 顶栏弹窗面板 + 独立页面 `/notifications`、`/messages` |
| 路由结构 | 扁平 children，无身份守卫 | 分层路由，`requiresCreator` 守卫，动态中间 tab |

---

## 二、重构策略：壳层重构 + 内容页分批迁移

### 核心原则

1. **壳层全部重写**：MainLayout、BottomNav、TopBar、身份切换机制。
2. **内容页优先复用**：列表/详情页挂进新壳层，不碰 API 和 store。
3. **重灾区页面选择性重写**：Personal、Home、CreatorDashboard。
4. **数据层零改动**：auth-store、campaign-store、message-store、api.ts 全部保留。

---

## 三、文件级判定：复用 / 重写 / 新建

### 3.1 重写（删旧建新）

| 文件 | 原因 | 目标产物 |
|------|------|---------|
| `layouts/MainLayout.vue` | 顶栏信息架构完全不同，需三入口+身份感知 | `layouts/AppShell.vue`（新壳层容器） |
| `layouts/BottomNav.vue` | tab 配置、中间 tab 动态切换、路由全部不同 | `layouts/BottomNav.vue`（配置驱动重写） |
| `views/Home.vue` | 当前是已登录 Dashboard，目标是未登录品牌页 | `views/LandingPage.vue`（品牌页）|
| `views/Personal.vue` | 目标拆为"叙途"主页 + 独立设置页，IA 完全不同 | `views/Tuantu.vue` + `views/Settings.vue` |
| `views/CreatorDashboard.vue` | 当前空壳，需重新按 A07 §4.6 创作台设计实现 | `views/CreatorStudio.vue` |
| `router/index.ts` | 路由表、守卫、重定向逻辑全部需要重新组织 | `router/index.ts`（原地重写） |

### 3.2 复用（挂入新壳层，微调或零改动）

| 文件 | 复用方式 | 可能的微调 |
|------|---------|-----------|
| `views/Room.vue` | 零改动，独立路由不在壳层内 | 无 |
| `views/CharacterEditor.vue` | 零改动 | 无 |
| `views/MyCampaigns.vue` | 重命名路由为 `/rooms`，挂入新壳层 | meta.title 改为"房间"，tab 状态子路由化 |
| `views/Community.vue` | 拆分挂载到 `/discuss` 下三个子板块路由 | 增加子 tab（技巧交流/跑团分享/同好闲谈） |
| `views/AssetLibrary.vue` | 迁移到 `/explore` 下作为子 tab 之一 | 路由调整，内容不变 |
| `views/asset/DiscoverTab.vue` | 复用 | 无 |
| `views/asset/MyAssetsTab.vue` | 复用 | 无 |
| `views/community/RecruitmentBoard.vue` | 迁移到 `/recruit` 路由 | 路由调整 |
| `views/Login.vue` | 零改动 | 无 |
| `components/room/*` | 全部零改动 | 无 |
| `components/base/*` | 全部零改动 | 无 |
| `components/SvgIcon.vue` | 零改动 | 无 |
| `components/IconSprite.vue` | 零改动 | 无 |
| `stores/auth-store.ts` | 保留，扩展 `isCreator` 字段 | 新增 `activeIdentity` 响应式字段 |
| `stores/campaign-store.ts` | 零改动 | 无 |
| `stores/message-store.ts` | 零改动 | 无 |
| `utils/api.ts` | 零改动 | 无 |
| `composables/useTheme.ts` | 零改动 | 无 |
| `App.vue` | 零改动 | 无 |

### 3.3 新建

| 文件 | 职责 |
|------|------|
| `layouts/AppShell.vue` | 新壳层：TopBar + router-view + BottomNav |
| `layouts/TopBar.vue` | 顶栏组件：左侧 Logo/返回，右侧三入口 |
| `components/shell/NotificationPanel.vue` | 铃铛弹窗面板（身份 tab 切换） |
| `components/shell/MessagePanel.vue` | 信封弹窗面板（身份 tab 切换） |
| `components/shell/UserDropdown.vue` | 头像下拉面板（身份切换+快捷入口） |
| `composables/useIdentity.ts` | 身份切换 composable（玩家/主持人 ⇄ 创作者） |
| `views/LandingPage.vue` | 未登录品牌首页 |
| `views/Explore.vue` | 探索页容器（4 子 tab：模组集/规则包/故事录/公示处） |
| `views/Recruit.vue` | 招募页容器（2 子 tab：找房间/开团招人） |
| `views/Discuss.vue` | 讨论页容器（3 子板块） |
| `views/Tuantu.vue` | 叙途主页（个人名片/角色档案/创作台/馆藏/履迹/羁绊） |
| `views/Settings.vue` | 独立设置页（账号安全/主题/内容偏好/通知/隐私/数据） |
| `views/Notifications.vue` | 通知中心页 |
| `views/Messages.vue` | 私信页 |

---

## 四、执行顺序（6 个 Phase）

### Phase 0：基础设施准备（前置依赖）

**改动范围**：store 扩展 + composable 新建，不触碰任何页面

| 任务 | 文件 | 说明 |
|------|------|------|
| 0-1 | `stores/auth-store.ts` | 新增 `isCreator` computed + `activeIdentity` ref（'player' \| 'creator'） |
| 0-2 | `composables/useIdentity.ts` | 封装身份切换逻辑：读写 `activeIdentity`，持久化到 localStorage |
| 0-3 | `layouts/nav-config.ts` | 导航配置表：5 个 tab 的 name/label/icon/path，中间 tab 根据 identity 动态返回 |

**验收**：单元测试通过，不影响现有页面渲染。

---

### Phase 1：壳层重构（核心工程）

**改动范围**：替换 MainLayout + BottomNav + TopBar

| 任务 | 文件 | 说明 |
|------|------|------|
| 1-1 | `layouts/AppShell.vue` | 新壳层容器：引入 TopBar + BottomNav + `<router-view>`，替代 MainLayout |
| 1-2 | `layouts/TopBar.vue` | 左：Logo（一级页）或返回按钮（二级页）；右：铃铛+信封+头像▼ |
| 1-3 | `layouts/BottomNav.vue` | 消费 `nav-config.ts`，中间 tab 响应 `activeIdentity` 变化，200ms 淡入淡出 |
| 1-4 | `components/shell/UserDropdown.vue` | 头像下拉面板：身份切换区 + 快捷入口 + 主题切换（移入此处） + 退出 |
| 1-5 | `components/shell/NotificationPanel.vue` | 弹窗面板骨架，内部身份 tab，内容先用 EmptyState 占位 |
| 1-6 | `components/shell/MessagePanel.vue` | 同上 |
| 1-7 | `router/index.ts` | 重写路由表（见下方路由结构），替换守卫逻辑 |

**路由结构目标**：

```ts
const routes = [
  // 未登录品牌页
  { path: '/', name: 'Landing', component: LandingPage, meta: { guestOnly: true } },

  // 主壳层
  {
    path: '/',
    component: AppShell,
    children: [
      { path: 'explore', name: 'Explore', component: Explore, meta: { title: '探索' } },
      { path: 'recruit', name: 'Recruit', component: Recruit, meta: { title: '招募' } },
      { path: 'rooms', name: 'Rooms', component: MyCampaigns, meta: { title: '房间' } },
      { path: 'creator', name: 'CreatorStudio', component: CreatorStudio, meta: { requiresCreator: true, title: '创作台' } },
      { path: 'discuss', name: 'Discuss', component: Discuss, meta: { title: '讨论' } },
      { path: 'tuantu', name: 'Tuantu', component: Tuantu, meta: { requiresAuth: true, title: '叙途' } },
    ],
  },

  // 独立页面（不在壳层内或有独立壳层）
  { path: '/room/:id', name: 'Room', component: Room, meta: { requiresAuth: true } },
  { path: '/character/editor/:id?', name: 'CharacterEditor', component: CharacterEditor, meta: { requiresAuth: true } },
  { path: '/settings', name: 'Settings', component: Settings, meta: { requiresAuth: true } },
  { path: '/notifications', name: 'Notifications', component: Notifications, meta: { requiresAuth: true } },
  { path: '/messages', name: 'Messages', component: Messages, meta: { requiresAuth: true } },
  { path: '/u/:uid', name: 'UserProfile', component: UserProfile },
  { path: '/login', name: 'Login', component: Login },
];
```

**路由守卫逻辑**：

```ts
router.beforeEach((to, from, next) => {
  const auth = useAuthStore();
  // 已登录用户访问 Landing → 重定向到探索
  if (to.name === 'Landing' && auth.isLoggedIn) return next({ name: 'Explore' });
  // guestOnly 页面已登录跳走
  if (to.meta.guestOnly && auth.isLoggedIn) return next({ name: 'Explore' });
  // 需要登录
  if (to.meta.requiresAuth && !auth.isLoggedIn) return next({ name: 'Login', query: { redirect: to.fullPath } });
  // 需要创作者
  if (to.meta.requiresCreator && !auth.isCreator) return next({ name: 'Forbidden' });
  next();
});
```

**验收**：壳层渲染正确，5 tab 可切换，身份切换 → 中间 tab 动态变化，三入口可点击弹出面板。内容页暂用占位。

---

### Phase 2：内容页挂载（零改动复用）

**改动范围**：将现有页面挂入新路由，不修改页面内部逻辑

| 任务 | 原文件 | 挂载到 | 改动点 |
|------|--------|--------|--------|
| 2-1 | `MyCampaigns.vue` | `/rooms` | 仅改 router 引用，页面零改动 |
| 2-2 | `AssetLibrary.vue` | `/explore`（临时全量，后续拆子 tab） | 仅改路由 |
| 2-3 | `RecruitmentBoard.vue` | `/recruit` | 仅改路由 |
| 2-4 | `Community.vue` | `/discuss` | 仅改路由 |
| 2-5 | `Room.vue` | `/room/:id`（已是独立路由） | 零改动 |
| 2-6 | `CharacterEditor.vue` | `/character/editor/:id?` | 零改动 |
| 2-7 | `Login.vue` | `/login` | 零改动 |

**验收**：所有现有业务功能在新壳层下可正常使用，API 调用不受影响。

---

### Phase 3：重灾区页面重写

**改动范围**：重写 3 个 IA 完全不匹配的页面

| 任务 | 新文件 | 设计依据 | 说明 |
|------|--------|---------|------|
| 3-1 | `views/LandingPage.vue` | A07 §4.1 | 品牌文案 + "进入叙事"按钮 + 页脚；内容预览区按条件展示 |
| 3-2 | `views/Tuantu.vue` | A07 §4.6 + 附录 I | 6 模块 tab：个人名片/角色档案/创作台/个人馆藏/成长履迹/羁绊名录 |
| 3-3 | `views/Settings.vue` | A07 §4.7 | 6 区块：账号安全/主题/内容偏好/通知/隐私/数据管理 |
| 3-4 | `views/CreatorStudio.vue` | A07 §4.6 创作台 + 附录 H | 模组管理/规则包管理/讨论区内容管理 |

**验收**：新页面符合设计文档 IA，使用 PageLayout 容器，设计令牌变量，EmptyState 组件。

---

### Phase 4：探索/招募/讨论子 Tab 拆分

**改动范围**：将复用的列表页拆分为设计文档定义的子 tab 结构

| 任务 | 页面 | 子 Tab 结构 |
|------|------|------------|
| 4-1 | `Explore.vue` | 模组集 / 规则包 / 故事录 / 公示处 |
| 4-2 | `Recruit.vue` | 找房间 / 开团招人 |
| 4-3 | `Discuss.vue` | 技巧交流 / 跑团分享 / 同好闲谈 |

每个子 Tab 内先复用现有列表组件（如 RecruitmentBoard），后续按需细化。

**验收**：子 tab 切换正常，URL 参数正确（如 `/recruit?tab=find`），筛选标签渲染。

---

### Phase 5：通知/私信独立页 + 顶栏面板填充

**改动范围**：实现通知和私信的完整交互

| 任务 | 文件 | 设计依据 |
|------|------|---------|
| 5-1 | `views/Notifications.vue` | A07 §4.8 |
| 5-2 | `views/Messages.vue` | A07 §4.9 |
| 5-3 | `NotificationPanel.vue` 填充 | A07 §顶栏铃铛 |
| 5-4 | `MessagePanel.vue` 填充 | A07 §顶栏信封 |

**验收**：通知筛选标签（全部/跑团/社区/系统）可用，私信会话列表+聊天区渲染正确。

---

## 五、可复用资产清单（禁止重写）

以下代码在整个迁移过程中**不得重写**，仅允许扩展接口：

| 资产 | 路径 | 复用理由 |
|------|------|---------|
| 认证 Store | `stores/auth-store.ts` | token 管理、登录态判断完整可用 |
| 战役 Store | `stores/campaign-store.ts` | 房间数据流不变 |
| 消息 Store | `stores/message-store.ts` | Socket 消息管理不变 |
| API 封装 | `utils/api.ts` | 请求拦截、token 注入不变 |
| 主题切换 | `composables/useTheme.ts` | 日夜模式逻辑不变 |
| 基础组件 | `components/base/*` | TButton/TCard/TInput/TSkeleton/TSpinner/TTag |
| 图标系统 | `SvgIcon.vue` + `IconSprite.vue` | 全局图标注入不变 |
| 房间组件 | `components/room/*` | 跑团核心交互不变 |
| Socket 客户端 | `socket/socket-client.ts` | 实时通信不变 |

---

## 六、风险与注意事项

| 风险 | 缓解措施 |
|------|---------|
| 路由重写导致现有书签/深链失效 | 在 router 中添加旧路由 → 新路由的 redirect 映射（`/personal` → `/tuantu`，`/campaigns` → `/rooms`，`/assets` → `/explore`） |
| 身份切换状态丢失 | `activeIdentity` 持久化到 localStorage，刷新后恢复 |
| Phase 1 期间页面空白 | Phase 1 和 Phase 2 合并为一个 PR，确保壳层和内容页同时就绪 |
| 旧 MainLayout.vue 被其他文件引用 | 全局搜索 `MainLayout` 引用，确认仅 router/index.ts 一处 |
| 移动端底部导航高度变化 | 保持 56px 不变，与现有实现一致 |

---

## 七、删除清单（迁移完成后）

以下文件在所有 Phase 完成后可安全删除：

| 文件 | 替代品 |
|------|--------|
| `layouts/MainLayout.vue` | `layouts/AppShell.vue` |
| `views/Home.vue` | `views/LandingPage.vue` + 已登录重定向到 Explore |
| `views/Personal.vue` | `views/Tuantu.vue` + `views/Settings.vue` |
| `views/CreatorDashboard.vue` | `views/CreatorStudio.vue` |

---

## 八、给 AI 开发助手的执行指令

1. **每个 Phase 是一个独立 PR**，Phase 0+1+2 可合并为首个大 PR。
2. **严格遵循设计令牌**：颜色用 `var(--color-*)`，间距用 `var(--space-*)`，圆角用 `var(--radius-*)`。
3. **图标只用 SvgIcon**：`<SvgIcon name="icon-xxx" :size="20" />`，禁止 emoji。
4. **后台型页面复用 PageLayout**：Tuantu、Settings、CreatorStudio 必须包裹在 PageLayout 内。
5. **配置驱动 > 硬编码**：BottomNav 的 tab 列表、TopBar 的入口列表都从配置文件读取。
6. **状态机用 Composable**：身份切换用 `useIdentity()`，按钮状态用对应映射表驱动的 composable。
7. **不碰 API 层**：所有 HTTP 请求继续通过 `utils/api.ts`，不引入新的请求方式。
8. **旧路由兼容**：添加 redirect 规则，确保 `/personal`、`/campaigns`、`/assets`、`/community` 仍可访问。
