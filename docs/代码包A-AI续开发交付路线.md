# 代码包A AI 续开发交付路线

> 适用对象：后续接手本仓库继续开发的 AI 编程助手与人类开发者
>
> 目标：不给 AI 留“自己猜产品方向”的空间，直接提供可执行的开发顺序、阅读顺序、代码锚点、验收标准。

---

## 1. 先说结论

当前仓库不是从零开始，而是已经具备：

1. 较完整的服务端业务骨架。
2. 相对扎实的数据模型、迁移与共享类型。
3. 部分核心前端页面与房间交互基础。
4. 一批可以作为回归基线的测试。

当前最大的差距不在“有没有代码”，而在以下四点：

1. 前端大量能力未接到后端现有接口，用户闭环不完整。
2. 管理后台与治理后台仍缺主产品壳层。
3. 商业化链路还是“可跑骨架”，未达到生产级闭环。
4. 规则工坊存在“旧 L3 画布思路”和“新 Recipe 思路”并存的问题。

因此，后续开发必须遵循：

1. 先补闭环，再扩功能。
2. 先收敛模型，再做高阶体验。
3. 先把已有接口接到产品面，再补新接口。
4. 先保证文档口径统一，再做跨模块开发。

---

## 2. AI 开发前必读顺序

每次开始一个具体任务前，必须按下面顺序读取文档；后读到的模块文档可以覆盖前面的细节，但不能违反总纲约束。

### 2.1 总纲必读

1. 产品总约束与术语：docs/design/产品设计.md
2. 文档拆分治理入口：docs/design/产品设计.md 中的 0.3、0.4、0.5

重点关注：

1. 技术红线：纯 Web + PWA、Socket.IO + HTTP、单库 + Redis、AI 不做主持人。
2. 术语统一：房间、招募帖、GM、角色卡、场。
3. 主文档只保留总纲，功能细节以附录为准。

### 2.2 按模块选读

1. 社区与招募：docs/design/附录 B：平台帖子与招募规范.md
2. 跑团房间：docs/design/附录 C：跑团房间交互设计.md
3. 规则引擎：docs/design/附录 D01：规则引擎核心设计.md
4. 角色卡：docs/design/附录 D05：角色卡系统产品设计.md
5. 模组编辑器：docs/design/附录 E：模组编辑器设计方案_v1.0.md
6. AI 功能：docs/design/附录 F：AI功能.md
7. 市场与商业化：docs/design/附录 H、附录 H01、附录 H03、附录 H04
8. 账号与通知：docs/design/附录 I01、附录 I03
9. 法务与治理：docs/design/附录 N01、附录 N02、附录 N03

### 2.3 开发时的代码锚点

AI 不要从全仓库漫游式搜索开始，优先从这些锚点进入：

1. 服务端总入口：packages/server/src/routes/index.ts
2. 房间主链路：packages/server/src/routes/campaigns.ts
3. 招募主链路：packages/server/src/routes/recruitment.ts
4. 模组主链路：packages/server/src/routes/modules.ts
5. 规则集主链路：packages/server/src/routes/rulesets.ts
6. 叙阅器相关接口：packages/server/src/routes/reading-progress.ts、packages/server/src/routes/annotations.ts
7. 管理与治理：packages/server/src/routes/admin-reputation.ts、packages/server/src/routes/reports.ts、packages/server/src/routes/metrics.ts
8. 前端路由：packages/client/src/router/index.ts
9. 房间页：packages/client/src/views/Room.vue
10. 创作者页：packages/client/src/views/creator/ModuleEditor.vue、packages/client/src/views/creator/RulesetEditor.vue
11. 广场页：packages/client/src/views/AssetLibrary.vue
12. 叙阅器：packages/client/src/components/viewer/ViewerShell.vue

---

## 3. 总开发顺序

后续开发按以下阶段推进，不能跳序做大范围扩张：

1. 阶段 A：前端闭环补全
2. 阶段 B：管理后台与治理后台落地
3. 阶段 C：规则工坊模型收敛
4. 阶段 D：商业化与支付生产化
5. 阶段 E：房间高阶体验与产品打磨
6. 阶段 F：AI Agent 管理台与运营接入

每个阶段完成后都要做一轮“文档口径回查”，确认没有和总纲或附录冲突。

---

## 4. 阶段 A：前端闭环补全

### 4.1 阶段目标

把已经存在的服务端能力真正接到用户能看到、能点到、能完成任务的前端页面上。

### 4.2 为什么先做这一阶段

当前后端已经有大量接口和数据结构，但前端仍存在“功能建设中”“尚未开放”的占位文案。优先补这部分，开发收益最高，风险最低。

### 4.3 要完成的子任务

#### A1. 广场页接真实模组与规则包能力

目标：去掉前端“模组接口尚未开放”的状态，把广场页真正接到已存在的 modules 和 rulesets 接口。

实施步骤：

1. 盘点 packages/client/src/views/AssetLibrary.vue 当前哪些 tab 还是占位。
2. 对照 packages/server/src/routes/modules.ts 和 packages/server/src/routes/rulesets.ts，明确列表、详情、筛选、状态字段。
3. 接通“模组集市”“规则集市”“公示处”的真实数据。
4. 修正空状态和按钮行为，避免继续显示“敬请期待”但后端实际上已提供能力。
5. 校对文案，统一使用“房间”“招募帖”“GM”等术语。

参考文档：

1. docs/design/产品设计.md 第 6、7、14 章
2. docs/design/附录 B：平台帖子与招募规范.md
3. docs/design/附录 E：模组编辑器设计方案_v1.0.md
4. docs/design/附录 H：市场与创作者经济.md

代码锚点：

1. packages/client/src/views/AssetLibrary.vue
2. packages/client/src/api/modules.ts
3. packages/client/src/api/rulesets.ts
4. packages/server/src/routes/modules.ts
5. packages/server/src/routes/rulesets.ts

验收标准：

1. 模组和规则包列表可真实展示。
2. 筛选、排序、空状态和跳转路径可用。
3. 公示处展示处于审核/公示期的真实内容。

#### A2. 创作者工作台补齐真实闭环

目标：让创作者端从“能打开编辑器”升级到“能完成作品创建、编辑、发布、公示、收益查看”的最小闭环。

实施步骤：

1. 对照 packages/client/src/views/creator 下各页面，确认哪些还是半成品展示。
2. 补齐模组列表、规则工坊、收益页、作品页与后端接口之间的数据映射。
3. 对齐发布状态、撤回、公示期、申诉、收益列表与提现入口。
4. 统一创作者状态判定与权限拦截逻辑。

参考文档：

1. docs/design/产品设计.md 第 0.2、6、12、13、14 章
2. docs/design/附录 E：模组编辑器设计方案_v1.0.md
3. docs/design/附录 H：市场与创作者经济.md
4. docs/design/附录 H01：会员体系设计.md
5. docs/design/附录 H03：支付与货币系统.md

代码锚点：

1. packages/client/src/views/creator/ModuleEditor.vue
2. packages/client/src/views/creator/RulesetEditor.vue
3. packages/client/src/views/creator/CreatorEarnings.vue
4. packages/server/src/routes/creator-earnings.ts
5. packages/server/src/routes/modules.ts
6. packages/server/src/routes/rulesets.ts

验收标准：

1. 创作者可以从创建到发布完成一条主路径。
2. 收益、提现、申诉状态可见且可操作。
3. 前端不再保留明显与后端能力相矛盾的占位区。

#### A3. 叙阅器统一入口补齐

目标：把“统一作品阅览器”从组件级能力提升为全站统一阅读入口。

实施步骤：

1. 以 ViewerShell 为核心，梳理模组、规则包、故事录三类内容的加载模式。
2. 接通阅读进度、划线批注、权限裁剪、作品保护开关。
3. 修复管理员权限识别 TODO，补上当前用户权限分层。
4. 给作品详情建立一致的阅读入口，而不是分散多个页面逻辑。

参考文档：

1. docs/design/产品设计.md 第 14 章
2. docs/design/附录 H：市场与创作者经济.md
3. docs/design/附录 N01：法律合规与内容安全.md

代码锚点：

1. packages/client/src/components/viewer/ViewerShell.vue
2. packages/server/src/routes/reading-progress.ts
3. packages/server/src/routes/annotations.ts
4. packages/server/src/routes/modules.ts
5. packages/server/src/routes/rulesets.ts

验收标准：

1. 阅读进度、划线批注、权限裁剪真实可用。
2. 模组和规则包都可通过统一阅览壳层阅读。
3. 作者、已获取用户、游客、管理员四类权限表现符合设计。

---

## 5. 阶段 B：管理后台与治理后台落地

### 5.1 阶段目标

把现有管理类接口真正变成后台产品，而不是只停留在服务端路由层。

### 5.2 要完成的子任务

#### B1. 建立独立 admin 前端路由与壳层

目标：增加真正的后台入口、布局、鉴权与导航骨架。

实施步骤：

1. 新增后台路由组与布局页。
2. 建立管理员鉴权守卫与菜单入口。
3. 把现有 admin 接口按内容审核、举报、信誉申诉、指标看板分类挂进去。

参考文档：

1. docs/design/产品设计.md 第 10、11 章
2. docs/design/附录 N02：业务安全与核心信誉.md
3. docs/design/附录 N03：社区治理与用户公约.md

代码锚点：

1. packages/client/src/router/index.ts
2. packages/server/src/routes/admin-reputation.ts
3. packages/server/src/routes/reports.ts
4. packages/server/src/routes/metrics.ts

验收标准：

1. 管理员有独立后台入口。
2. 非管理员无法访问后台页面。
3. 后台页面不是空壳，能读取真实数据。

#### B2. 举报与内容审核工作台

目标：完成举报处理、内容审核、申诉处理的页面级闭环。

实施步骤：

1. 把内容举报列表、详情、处理结果页做出来。
2. 接入模组/规则包的审核通过、暂停上架、申诉处理。
3. 建立统一状态流转显示，而不是分散按钮操作。

参考文档：

1. docs/design/附录 B：平台帖子与招募规范.md 第 9 到 15 章
2. docs/design/附录 N01：法律合规与内容安全.md
3. docs/design/附录 N03：社区治理与用户公约.md

代码锚点：

1. packages/server/src/routes/reports.ts
2. packages/server/src/routes/admin-reputation.ts
3. packages/client/src/api/reports.ts
4. packages/client/src/components/room/MessageItem.vue

验收标准：

1. 举报提交、后台查看、处理结果通知形成闭环。
2. 内容审核与申诉在后台中可操作。
3. 操作过程有明确状态与审计留痕。

#### B3. 运营指标与运营工具面板

目标：让已有 metrics、payments admin 能力可被运营使用。

实施步骤：

1. 建立基础运营仪表盘。
2. 展示招募转化、异常告警、业务指标。
3. 接入运营补单、退款等后台动作。

参考文档：

1. docs/design/附录 H03：支付与货币系统.md
2. docs/design/附录 H04：AI 功能接入与商业化.md
3. docs/design/附录 N02：业务安全与核心信誉.md

代码锚点：

1. packages/server/src/routes/metrics.ts
2. packages/server/src/routes/payments.ts
3. packages/server/src/services/recruitment-metrics-service.ts
4. packages/server/src/services/payment-service.ts

验收标准：

1. 运营可查看指标。
2. 运营动作有权限控制。
3. 敏感操作有审计。

---

## 6. 阶段 C：规则工坊模型收敛

### 6.1 阶段目标

统一规则工坊的模型方向，避免继续在 L1 表单、L3 画布、Recipe 三套体系上并行加功能。

### 6.2 决策原则

优先以文档最新约束为准：V1.0 主体模型应是 Recipe 配方源 + 编译产物，而不是继续扩张 L3 画布。

### 6.3 要完成的子任务

#### C1. 明确 L3 画布的定位

目标：把 L3 从“主编辑方式”降为“迁移兼容工具”或“高级调试面板”。

实施步骤：

1. 盘点 RulesetEditor 中哪些能力还依赖 L3。
2. 明确哪些字段必须保留在 Recipe 编辑器中。
3. 在 UI 和文档层给出单一主路径，避免新用户默认进入旧模型。

参考文档：

1. docs/design/产品设计.md 第 2 章与关键约束
2. docs/design/附录 D01：规则引擎核心设计.md
3. docs/design/附录 D03：规则配方系统技术方案.md

代码锚点：

1. packages/client/src/views/creator/RulesetEditor.vue
2. packages/client/src/components/rule-canvas/RecipeEditor.vue
3. packages/server/src/engine/recipe-compiler.ts
4. packages/server/src/engine/executor.ts

验收标准：

1. 规则编辑的主路径唯一且清晰。
2. 新增功能优先落在 Recipe 体系。
3. 旧 L3 仅作为兼容或辅助能力存在。

#### C2. 规则执行链路对齐 Recipe 契约

目标：让前端编辑输出、后端编译执行、测试样例三者使用同一份契约。

实施步骤：

1. 对照附录 D01 和共享类型，检查前后端字段是否仍有旧命名残留。
2. 补齐 Recipe 导入、导出、测试、错误码回显。
3. 保证失败时返回结构化错误，而不是简单字符串报错。

参考文档：

1. docs/design/附录 D01：规则引擎核心设计.md
2. docs/design/附录 D04：数据字典与 Schema 定义.md
3. docs/design/附录 D03：规则配方系统技术方案.md

代码锚点：

1. packages/shared/src/types/recipe.ts
2. packages/server/src/routes/rulesets.ts
3. packages/server/src/engine/recipe-compiler.ts
4. packages/server/src/engine/executor.ts

验收标准：

1. 前后端字段命名一致。
2. Recipe 测试链路可用。
3. 错误码与失败阶段符合文档约束。

---

## 7. 阶段 D：商业化与支付生产化

### 7.1 阶段目标

把现在的支付、会员、收益体系从“占位骨架”升级到“可上线的生产闭环”。

### 7.2 要完成的子任务

#### D1. 接入真实支付渠道

目标：替换当前 membership 支付路由里的占位支付实现。

实施步骤：

1. 明确支付渠道适配层接口。
2. 补齐下单、预支付参数、回调验签、查单、补单逻辑。
3. 对接订单状态机与 subscription event 写入。

参考文档：

1. docs/design/产品设计.md 第 12、13 章
2. docs/design/附录 H03：支付与货币系统.md
3. docs/design/附录 H01：会员体系设计.md

代码锚点：

1. packages/server/src/routes/membership.ts
2. packages/server/src/routes/payments.ts
3. packages/server/src/services/payment-service.ts
4. packages/server/src/services/payment-verifier.ts

验收标准：

1. 下单到支付成功的主链路可用。
2. 回调验签是真实逻辑，不再是 stub。
3. 支付异常可补单、可审计。

#### D2. 收益、提现、退款、审计闭环

目标：打通创作者收益系统的生产级闭环。

实施步骤：

1. 审查 creator earnings 当前的数据口径。
2. 补齐提现审核、退款联动、对账补偿。
3. 确保后台运营有可追踪的审计记录。

参考文档：

1. docs/design/附录 H：市场与创作者经济.md
2. docs/design/附录 H03：支付与货币系统.md
3. docs/design/附录 H05：支付闭环技术设计.md

代码锚点：

1. packages/server/src/routes/creator-earnings.ts
2. packages/server/src/services/creator-earnings-service.ts
3. packages/server/src/services/payment-scheduler.ts

验收标准：

1. 收益明细、提现、退款状态一致。
2. 有清晰的审计日志。
3. 不存在前端状态和账务状态脱节。

---

## 8. 阶段 E：房间高阶体验与产品打磨

### 8.1 阶段目标

在房间主链路已经可用的基础上，补全高阶体验，而不是先在主链路未稳时堆新花样。

### 8.2 要完成的子任务

#### E1. 场景与导演台体验打磨

目标：把场景切换、导演台、GM 控制面板打磨到接近附录 C 的交互水平。

实施步骤：

1. 对照附录 C，补齐场景管理、角色列表、路线图、时间快照的交互细节。
2. 校验剧情场、私密场、公共场的入口与权限表达。
3. 统一房间内术语与按钮文案。

参考文档：

1. docs/design/附录 C：跑团房间交互设计.md
2. docs/design/附录 A05：页面框架与布局规范 .md
3. docs/design/附录 A06：移动端适配总则.md

代码锚点：

1. packages/client/src/views/Room.vue
2. packages/client/src/components/room/GMConsole.vue
3. packages/client/src/components/room/LeftSidebar.vue
4. packages/client/src/components/room/TrajectoryMatrix.vue

验收标准：

1. 三类场景表达清晰。
2. GM 核心操作可在 2 到 3 步内完成。
3. 移动端不出现结构性断裂。

#### E2. 消息可见性与日志导出体验对齐

目标：把当前实现的消息可见性与导出规则完全对齐附录 C。

实施步骤：

1. 用现有 message visibility 测试作为回归底座。
2. 检查剧情场、私密场、公共场历史裁剪行为。
3. 对接日志导出预览、正式导出、付费门槛和前端提示。

参考文档：

1. docs/design/附录 C：跑团房间交互设计.md
2. docs/design/附录 N02：业务安全与核心信誉.md
3. docs/design/附录 H01：会员体系设计.md

代码锚点：

1. packages/server/src/routes/campaigns.ts
2. packages/server/src/routes/logs.ts
3. packages/server/src/services/visibility.ts
4. packages/server/src/__tests__/message-visibility.test.ts

验收标准：

1. 历史裁剪规则符合文档。
2. 玩家导出结果与可见范围一致。
3. 付费门槛与提示符合产品预期。

#### E3. 氛围系统、白噪音与模组联动

目标：在房间与模组之间补齐氛围关键词、白噪音与场景联动。

实施步骤：

1. 先在模组侧落地氛围关键词存储与编辑。
2. 再在房间侧接场景切换触发白噪音。
3. 保持可关闭、可静音、可降级。

参考文档：

1. docs/design/附录 C：跑团房间交互设计.md 中场景氛围部分
2. docs/design/附录 E：模组编辑器设计方案_v1.0.md 中白噪音策略

代码锚点：

1. packages/client/src/views/Room.vue
2. packages/client/src/views/creator/ModuleEditor.vue
3. packages/server/src/routes/campaigns.ts
4. packages/server/src/routes/modules.ts

验收标准：

1. 场景切换可触发氛围变化。
2. 用户可单独关闭该能力。
3. 与房间主链路解耦，不影响基础使用。

---

## 9. 阶段 F：AI Agent 管理台与运营接入

### 9.1 阶段目标

在后台壳层和治理流程成熟后，再把 AI Agent 管理能力接入，不要反过来做。

### 9.2 要完成的子任务

#### F1. AI 创作辅助现有能力产品化

目标：先把当前已上线的 AI 校对、模组分析、配额与任务列表做成稳定的产品能力。

实施步骤：

1. 补齐任务中心、失败重试、状态提示、历史记录。
2. 对齐配额显示和会员限制。
3. 补足编辑器内采纳闭环与回滚体验。

参考文档：

1. docs/design/附录 F：AI功能.md
2. docs/design/附录 H04：AI 功能接入与商业化.md
3. docs/design/附录 N01：法律合规与内容安全.md

代码锚点：

1. packages/client/src/views/creator/ModuleEditor.vue
2. packages/server/src/routes/ai.ts
3. packages/server/src/services/ai-service.ts
4. packages/server/src/queue

验收标准：

1. AI 异步任务可追踪。
2. 失败不计费、限额逻辑可见。
3. 编辑器内结果采纳链路稳定。

#### F2. AI Agent 管理后台

目标：落地文档中的 Agent 管理、工单辅助、审查建议展示等后台能力。

实施步骤：

1. 先在后台增加 AI 模块容器页。
2. 接入只读建议能力，再接指挥式交互。
3. 所有 Agent 操作必须可审计、可禁用、可降级。

参考文档：

1. docs/design/产品设计.md 第 0.0B 章
2. docs/B_DOCS/AGENT蓝图.md
3. docs/B_DOCS/附录 R01：AI Agent框架设计规范.md

验收标准：

1. 后台能看到 AI 建议而不是直接执行处罚。
2. AI 行为全量留痕。
3. AI 模块可单独关闭，不影响主站运行。

---

## 10. 每轮开发的统一执行模板

后续任何 AI 接手一个子任务时，必须严格按下面模板执行：

### 10.1 任务输入模板

1. 本轮目标是什么。
2. 所属阶段是哪一阶段。
3. 对应功能附录是哪一份。
4. 起始代码锚点是哪一个文件。
5. 预期完成的验收点是什么。

### 10.2 AI 实施步骤模板

1. 先读产品总纲约束与对应附录。
2. 只读起始锚点和最近相关调用链，不要全仓库漫游。
3. 确认现有实现、缺口和最小变更面。
4. 先改最小闭环，再做相邻补充。
5. 改完立刻跑最小验证。
6. 最后补文档或注释中的必要口径。

### 10.3 建议使用的验证命令

1. shared 变更后先执行：pnpm --filter @trpg/shared build
2. 服务端测试：pnpm --filter @trpg/server test
3. 前端测试：pnpm --filter @trpg/client test
4. 全仓构建：pnpm -r build

说明：如果本轮只改单侧，优先跑窄验证，不要每次都先跑全仓。

---

## 11. 不允许 AI 自行改变的事项

1. 不允许绕过产品总纲约束，自行新增语音团、AI 主持人、原生 App 等方向。
2. 不允许在未确认文档口径前，自行扩展状态机字段。
3. 不允许继续把旧 L3 画布当成唯一主模型扩张。
4. 不允许先做后台 AI 花哨能力，再跳过后台壳层与审计体系。
5. 不允许在支付能力还是 stub 时，对外承诺“已完成支付闭环”。

---

## 12. 推荐交付方式

如果要把任务继续交给下一个 AI，建议每次只交付一个明确子任务，格式如下：

1. 任务名称：例如“补齐广场页模组列表真实数据接入”。
2. 必读文档：列出 2 到 4 份，不要让 AI 自己猜。
3. 起始文件：列出 1 到 3 个。
4. 禁止扩散范围：例如“不改支付、不改后台、不改规则工坊”。
5. 验收方式：例如“前端页面可展示真实模组列表，client test 通过”。

推荐一句话模板：

“请按阶段 A1 执行，只处理广场页模组与规则包真实数据接入。先读 产品设计.md 的 0.3、0.4、14 和 附录 E、附录 H；从 AssetLibrary.vue、modules.ts、rulesets.ts 开始；不要扩展到支付、后台或规则工坊；完成后跑 client test 和必要的 API 验证。”

---

## 13. 最终目标状态

当这份路线执行完毕时，代码包A 应达到以下状态：

1. 用户主路径完整：探索、招募、房间、团途、创作者、叙阅器都可闭环使用。
2. 管理主路径完整：举报、审核、申诉、运营指标、支付运营可在后台完成。
3. 规则主路径统一：Recipe 成为单一主模型，旧模型只作兼容。
4. 商业化主路径完整：会员、支付、收益、提现、退款、对账可生产运行。
5. AI 主路径可控：AI 仅作为辅助能力接入，并在后台中可审计、可降级、可关闭。