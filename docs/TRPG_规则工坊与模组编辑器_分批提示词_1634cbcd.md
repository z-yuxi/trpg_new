# TRPG 平台 —— 规则工坊 & 模组编辑器 分批实施提示词

> 生成日期：2026-04-19
> 基于：trpg_new 全量代码 + docs/ 产品设计文档 + 附录 A~K 逐项比对

---

## 一、当前进度与设计距离评估

### 规则工坊（Rule Workshop）现状

| 层级 | 设计要求 | 当前实现 | 完成度 |
|------|---------|---------|--------|
| 后端引擎 | 8种原子节点 + 拓扑执行器 | ✅ 全部实现（dice-roll, formula-eval, if-else 等） | 90% |
| 后端 API | CRUD + execute + publish | ✅ 路由和 Service 已实现，execute 端点可用 | 75% |
| 前端 L1 表单 | 动态表单渲染（check_mode/dice/属性/资源/难度等级） | ✅ RulesetEditor.vue 已有完整表单 | 70% |
| 前端 L3 画布 | 可视化节点拖拽/连线/8种核心原子（可按需扩展）/实时预览 | ❌ 完全未实现 | 0% |
| 命令系统三层模型 | 通用 → 检定模板 → 规则集专属 | ⚠ command-defaults.ts 有 roll/check/initiative，但三层合并解析未完成 | 40% |
| 版本控制 | 分支/继承/parent合并/发布状态机 | ⚠ 仅有 draft→published 二态，无分支/继承/版本快照 | 15% |
| L1→L3 双向转换 | 表单配置自动转为节点图，反向亦可 | ❌ 未实现 | 0% |
| 预览执行 | 编辑器内实时试运行命令 | ❌ 未实现 | 0% |

**综合完成度：约 35%**

### 模组编辑器（Module Editor）现状

| 层级 | 设计要求 | 当前实现 | 完成度 |
|------|---------|---------|--------|
| 后端数据模型 | modules 表 + blocks 存储 | ⚠ modules 表已建（migration 008），但无 blocks 字段/子表 | 30% |
| 后端 API | CRUD + 发布流程 + 导入导出 | ⚠ 仅有 list + mine 两个 GET 端点 | 15% |
| TipTap 基座 | ProseMirror 富文本编辑器集成 | ❌ package.json 中无 TipTap 依赖 | 0% |
| 6种业务块 | 场景/NPC/事件/线索/检定/对话 | ❌ 未实现 | 0% |
| 规则集绑定 | 模组引用规则集检定模板 | ❌ 未实现 | 0% |
| 发布状态机 | draft→reviewing→7天公示→published | ❌ 仅有 draft/public/archived 三态 | 10% |
| Word/TXT 导入 | AI 识别场景/NPC/线索结构 | ❌ 未实现 | 0% |
| PDF 导出 | 基础免费 + 精装付费 | ❌ 未实现 | 0% |

**综合完成度：约 8%**

---

## 二、规则工坊 —— 4个子批次

---

### 规则工坊 批次 1/4：命令系统三层模型 + 预览执行

**前置条件**：当前引擎核心和 RulesetEditor.vue 表单已可用
**目标**：打通"编辑 → 试运行"闭环，让创作者能在编辑器内验证规则

```
## 项目背景
TRPG Web 平台，Vue 3 + Express + TypeScript + Socket.IO + MySQL + Redis monorepo。
规则引擎核心已实现 8 种原子节点和拓扑执行器（packages/server/src/engine/）。
RulesetEditor.vue 已有 L1 表单（检定模式、骰子、属性、资源、难度等级、命令勾选）。
当前命令系统仅有 command-defaults.ts 中 3 个预置命令（roll/check/initiative）。

## 本次任务

### 1. 完善三层命令模型（Server）

在 packages/server/src/engine/command-defaults.ts 中：
- 补齐设计文档要求的平台预置命令：ra（属性检定）、rc（标准检定）、sc（理智检定）、
  en（成长检定）、ti（临时疯狂）、li（长期疯狂）、init（先攻）、ds（死亡豁免）
- 每个命令定义为 CommandGraph 结构（nodes + output_node_id），使用现有原子节点组合

在 packages/server/src/engine/command-resolver.ts 中：
- 实现三层解析逻辑：
  1. 先查规则集的 custom_commands（精确匹配 trigger 或正则匹配）
  2. 再查规则集 supported_commands 列表对应的平台预置库
  3. 最后查通用命令（r/rh/nn 等不依赖规则集的命令）
- 命令字符串解析：支持 `/命令名 参数1 参数2` 和 `/命令名 key=value` 两种格式

### 2. 规则集自定义命令编辑（Client）

在 RulesetEditor.vue 中增加"自定义命令"编辑区域：
- 命令列表（可增删）
- 每个命令配置：trigger（触发词）、description、aliases[]、gm_only 开关
- 参数映射表：参数名 → 来源（用户输入 / 角色属性 / 固定值）
- 命令绑定的原子图暂时用 JSON 编辑器（L3 画布在后续批次实现）

### 3. 编辑器内预览执行（Client + Server）

在 RulesetEditor.vue 底部增加"预览测试"面板：
- 命令输入框（可输入如 `/rc 侦查 60`）
- "执行"按钮 → 调用 POST /api/rulesets/:id/execute
- 执行结果展示：骰子结果、成功/失败判定、执行日志（每个原子节点的输入输出）
- 上下文模拟：提供一个模拟角色数据表单（属性值、技能值可手动填写）

Server 端 POST /api/rulesets/:id/execute 需要支持：
> **⚠️ 现状说明**：当前路由实现中，`context.character_id` 和 `context.campaign_id` 是**必填字段**（缺少时返回 400）。
> 本任务需要修改此校验逻辑：当请求体包含 `mock_context` 时，`context` 整个字段可省略。
> 同时更新 `packages/shared/src/types/index.ts` 中 `ExecuteRequest` 接口（见下方类型定义）。
- 接收 mock_context（模拟角色数据），不要求真实 character_id
- 返回 ExecuteResponse 包含 logs 数组（每步执行详情）

### 4. 类型同步（Shared）

> **⚠️ 同时补充**：`GET /api/rulesets/mine` 端点目前**不存在**（当前路由只有带 `author_id` query 参数的 `GET /`）。
> 本批次需在 `packages/server/src/routes/rulesets.ts` 新增该端点（需登录），
> 返回当前用户的所有规则集（含 draft 状态），供创作者工坊列表页使用。
> 同时将 `packages/client/src/views/creator/RulesetWorkshop.vue` 中的
> `GET /api/rulesets?author_id=...` 调用改为 `GET /api/rulesets/mine`。

在 packages/shared/src/types/index.ts 中补充/更新：
- PlatformPresetCommand 枚举（ra/rc/sc/en/ti/li/init/ds/r/rh/nn）
  - r/rh/nn 含义：r = 通用掷骰（`/r 2d6`），rh = 暗骰（结果仅 GM 可见），nn = 旁白（系统消息）
- CustomCommand 接口：{ trigger, description, aliases, gm_only, input_mapping, graph }
- ExecuteRequest **替换**现有定义（现有类型为 `{ ruleset_id, command, params, context }` 已与实际路由不符），新定义如下：

> **⚠️ 类型替换说明**：`packages/shared/src/types/index.ts` 中现有 `ExecuteRequest` 的字段
> 与服务端路由实际接收的字段存在出入。本批次统一以下定义为准，
> 服务端 route handler 和前端调用代码同步更新至此格式。
> `ruleset_id` 已由路径参数 `:id` 承担，不再出现在请求体中。

```typescript
/** 预览执行时传入的模拟角色上下文，key = 属性/技能名，value = 数值 */
interface MockContext {
  attributes: Record<string, number>   // e.g. { "力量": 60, "体质": 55 }
  skills: Record<string, number>       // e.g. { "侦查": 70, "图书馆": 40 }
  resources: Record<string, { current: number; max: number }>  // e.g. { "HP": { current: 10, max: 14 } }
}

/** execute 端点请求体（replaces old ExecuteRequest in shared types） */
interface ExecuteRequest {
  command: string              // 完整命令字符串，e.g. "/rc 侦查 60"
  params?: Record<string, unknown>  // 命令参数（命令字符串无法解析时的备用）
  context?: {                  // 真实角色上下文（与 mock_context 二选一；两者同时存在时优先 mock_context）
    character_id: string
    campaign_id: string
    scene_id?: string
  }
  mock_context?: MockContext   // 编辑器预览时使用，不需要真实角色/团
}

/** execute 端点返回体 */
interface ExecuteResponse {
  success: boolean
  result: string            // 可读的最终结果描述
  dice_rolls: Array<{ expression: string; value: number; detail: string }>
  logs: Array<{
    node_id: string
    atom_type: string
    inputs: Record<string, unknown>
    output: unknown
    duration_ms: number
  }>
  error?: string
}
```

## 需要阅读的现有文件
- packages/server/src/engine/command-defaults.ts
- packages/server/src/engine/command-resolver.ts
- packages/server/src/engine/executor.ts
- packages/server/src/routes/rulesets.ts
- packages/server/src/services/ruleset-service.ts
- packages/client/src/views/creator/RulesetEditor.vue
- packages/shared/src/types/index.ts
- docs/附录 F：规则引擎.md（完整 COC 示例 YAML 和命令系统规范）

## 全局约束
- Vue 3 `<script setup>` + TypeScript + Scoped CSS
- 颜色通过 CSS 变量引用，禁止硬编码
- 不修改 engine/ 目录下已有原子节点的接口定义
- 新增 API 路由同步更新 shared 类型
- 数据库变更通过 Knex migration
- **测试要求（Vitest，已有 vitest.config.ts）**：
  · `command-resolver.test.ts`：覆盖三层解析优先级（自定义 > 预置 > 通用），至少 6 个用例
  · `command-defaults.test.ts`：验证每条平台预置命令（ra/rc/sc/en/ti/li/init/ds）节点结构非空
  · API 集成测试：`POST /api/rulesets/:id/execute` 传入 `mock_context` 能返回合法 `ExecuteResponse`
```

---

### 规则工坊 批次 2/4：L3 可视化节点画布 —— 基础框架

**前置条件**：批次 1 完成（命令系统可用，预览执行可用）
**目标**：实现节点画布的基础交互能力（拖拽、连线、删除、缩放），先支持现有 8 种原子

```
## 项目背景
TRPG 规则工坊需要实现 L3 可视化节点画布，本质上是一个可视化编程 IDE。
后端引擎已有 8 种原子节点，执行器使用拓扑排序。
数据结构：规则集的 atoms 是节点数组，connections 是连线数组，commands 包含命令到图的绑定。

## 本次任务

### 1. 技术选型与安装

**技术选型已确定：使用 Vue Flow（@vue-flow/core）**，理由如下：
- 基于 React Flow 的 Vue 3 移植，API 成熟稳定
- 原生支持自定义节点/边组件（Vue SFC）、缩放平移、minimap、背景网格
- 拓扑数据格式（nodes/edges）与后端 { atoms, connections } 映射直接
- 社区活跃，支持 TypeScript

**不使用备选方案**（baklava 社区较小；SVG/Canvas 自研工作量过大）。

在 packages/client/ 中安装：
```bash
pnpm add @vue-flow/core @vue-flow/background @vue-flow/minimap @vue-flow/controls
```

### 2. 画布容器组件

创建 packages/client/src/components/rule-canvas/RuleCanvas.vue：
- 三栏布局：左侧原子库面板（240px）| 中央画布区 | 右侧属性面板（280px）
- 中央画布支持：缩放（滚轮，范围 25%-400%）、平移（拖拽空白区域）、minimap（右下角）
- 工具栏（画布上方）：撤销/重做、自动布局、适应画面、缩放百分比显示、运行预览按钮

### 3. 原子库面板

创建 packages/client/src/components/rule-canvas/AtomLibrary.vue：
- 分类展示 8 种现有原子节点：
  · 数据读取类：CharacterSkillReader
  · 计算类：DiceRoll, FormulaEval, Multiply
  · 逻辑类：IfElse, ThresholdCompare
  · 效果类：ResourceModify
  · 输出类：ResultCollector
- 每种原子以卡片展示：图标 + 名称 + 简要说明
- 支持从面板拖拽到画布上创建节点（drag and drop）
- 搜索筛选

### 4. 自定义节点渲染

为每种原子类型创建自定义节点组件 packages/client/src/components/rule-canvas/nodes/：
- AtomNode.vue（通用壳）：节点标题栏（原子类型图标+名称）、输入端口列表（左侧）、
  输出端口列表（右侧）、节点体（显示关键配置摘要）
- 端口（Handle）类型用颜色区分：数值=蓝色、布尔=绿色、字符串=橙色、对象=紫色
- 节点选中态：边框高亮 + 阴影增强
- 节点可折叠（双击标题栏）

各原子节点的端口定义：
- DiceRoll：输入[expression:string] → 输出[result:number, details:string]
- CharacterSkillReader：输入[skill_name:string] → 输出[value:number]
- FormulaEval：输入[formula:string, variables:object] → 输出[result:number]
- IfElse：输入[condition:boolean, if_true:any, if_false:any] → 输出[result:any]
- ThresholdCompare：输入[value:number, threshold:number] → 输出[passed:boolean, margin:number]
- Multiply：输入[a:number, b:number] → 输出[result:number]
- ResourceModify：输入[resource_name:string, delta:number] → 输出[new_value:number]
- ResultCollector：输入[...dynamic] → 输出[result:object]

### 5. 连线交互

- 从输出端口拖拽到输入端口创建连线
- 类型兼容校验（数值端口只能连数值端口，boolean→boolean 等）
- 不兼容时连线显示红色虚线并提示
- 禁止环形连接（实时拓扑校验）
- 连线样式：贝塞尔曲线，数据流动方向动画（可选）
- 右键连线 → 删除

### 6. 数据序列化

- 画布状态（节点位置、连线、配置）↔ 规则集的 { atoms, connections } JSON 双向转换
- 保存时将画布状态序列化为后端期望的格式
- 加载时将后端数据反序列化到画布

### 7. 集成到 RulesetEditor

- RulesetEditor.vue 增加 L1/L3 模式切换标签
- L1 = 现有表单编辑器
- L3 = 新的 RuleCanvas 组件
- 切换时数据同步（但本批次仅实现 L3→后端，L1↔L3 双向转换在下一批次）

## 需要阅读的现有文件
- packages/server/src/engine/atom-interface.ts（原子接口定义）
- packages/server/src/engine/atoms/*.ts（各原子实现，了解输入输出）
- packages/server/src/engine/executor.ts（理解拓扑执行逻辑）
- packages/shared/src/types/index.ts（CommandGraphNode, CommandGraph 等类型）
- packages/client/src/views/creator/RulesetEditor.vue（现有编辑器）

## 全局约束
- Vue 3 `<script setup>` + TypeScript + Scoped CSS
- 颜色通过 CSS 变量引用
- 节点画布需要在 1920x1080 下流畅运行（100+ 节点时不卡顿）
- 所有交互支持键盘快捷键：Delete 删除选中、Ctrl+Z 撤销、Ctrl+Shift+Z 重做、
  Ctrl+A 全选、Space+拖拽 平移
- **测试要求（Vitest + @vue/test-utils）**：
  · `RuleCanvas.spec.ts`：组件挂载冒烟测试，验证三栏布局正常渲染
  · `canvas-serializer.test.ts`：往返测试——`{ atoms, connections }` → Vue Flow 格式 → 反序列化，数据一致
  · 类型不兼容连线：单元测试验证 `number→boolean` 端口连线被拒绝
```

---

### 规则工坊 批次 3/4：L1↔L3 双向转换 + 拓扑校验 + 实时预览

**前置条件**：批次 2 完成（画布基础交互可用）
**目标**：打通 L1 表单与 L3 画布的双向数据流，实现画布内实时预览执行

```
## 项目背景
规则工坊的 L1 表单编辑器和 L3 节点画布已各自可用。
设计要求两者可双向切换：L1 的表单配置能自动转换为 L3 的节点图，
L3 的节点图在满足 L1 模板约束时也能反向映射回表单。

## 本次任务

### 1. L1→L3 转换器（Shared 或 Client）

创建 packages/client/src/utils/l1-to-l3-converter.ts：
- 输入：L1 表单的 _l1_config 对象（check_mode, default_dice, success_formula,
  difficulty_levels, attributes, resources, supported_commands）
- 输出：{ atoms: CommandGraphNode[], connections: Connection[], layout: NodePosition[] }

转换规则：
- check_mode = roll_under 时：
  · 创建 DiceRoll 节点（expression = default_dice）
  · 创建 CharacterSkillReader 节点（读取技能值）
  · 创建 ThresholdCompare 节点（value=骰子结果, threshold=技能值, mode=less_than）
  · 创建 ResultCollector 节点
  · 自动连线：DiceRoll.result → ThresholdCompare.value,
    SkillReader.value → ThresholdCompare.threshold,
    ThresholdCompare → ResultCollector

- check_mode = roll_over 时：
  · 类似，但 ThresholdCompare.mode = greater_than

- check_mode = dice_pool 时：
  · DiceRoll（骰池，expression = default_dice，如 `5d6`）
  · FormulaEval（计数成功骰，公式 = `countSuccesses(dice, threshold)`，
    threshold 来自 `_l1_config.dice_pool_success_threshold`，默认 5；
    示例：roll 5d6，每个 ≥5 的骰子算成功，countSuccesses = 2）
  · ThresholdCompare（value=成功骰数, threshold=`_l1_config.dice_pool_target`, mode=greater_or_equal）
  · ResultCollector
  · 连线：DiceRoll.result → FormulaEval.dice,
    FormulaEval.result → ThresholdCompare.value,
    ThresholdCompare → ResultCollector
  · **注意**：`l1-to-l3-converter.ts` 是**纯函数**，不可产生副作用。若规则集 `_l1_config` 中缺少
    `dice_pool_success_threshold` / `dice_pool_target` 字段，转换器应直接使用默认值
    （`dice_pool_success_threshold = 5`，`dice_pool_target = 1`），并在返回结果中附带
    `used_defaults: ['dice_pool_success_threshold', 'dice_pool_target']` 元数据字段。
    由调用方 `RulesetEditor.vue` 检测 `used_defaults` 后弹出 Toast 提示：
    "已使用默认骰池参数，请在 L1 表单中补充骰池目标值和成功阈值后重新转换"

- difficulty_levels 映射为多个 ThresholdCompare 分支（或 IfElse 链）
- success_formula 映射为 FormulaEval 节点
- crit_success_max / crit_fail_min 映射为额外的 ThresholdCompare 判定

自动布局：节点从左到右排列，按数据流方向，间距 200px 水平 / 100px 垂直

### 2. L3→L1 反向检测

创建 packages/client/src/utils/l3-to-l1-detector.ts：
- 分析当前节点图是否匹配某个 L1 模板模式
- 如果匹配，提取参数回填到 _l1_config
- 如果不匹配（用户在 L3 做了超出 L1 模板的自定义），标记为 "L3 only" 模式，
  L1 标签页显示提示"当前规则已超出模板范围，请在可视化画布中编辑"

### 3. 模式切换交互

在 RulesetEditor.vue 中：
- L1→L3 切换时：调用转换器生成节点图，弹出确认对话框
  "切换到可视化编辑？当前表单配置将转换为节点图。"
- L3→L1 切换时：运行反向检测，若匹配则无缝切回；若不匹配则弹出警告
  "当前节点图包含自定义逻辑，切回表单模式将丢失这些自定义配置。"
- 数据源统一：无论哪个模式编辑，最终保存的都是 { atoms, connections, commands } 格式

### 4. 拓扑校验（实时）

在 RuleCanvas.vue 中实现实时校验：
- 环路检测：每次新增连线后运行 DFS，发现环路时阻止连线并显示红色高亮
- 孤立节点检测：没有任何连线的节点显示黄色警告边框
- 必需输入缺失：节点的必需输入端口未连线时显示红色端口 + tooltip 提示
- 类型不匹配：连线两端类型不兼容时显示警告
- 输出节点检查：必须有且仅有一个 ResultCollector 标记为 output_node
- 校验结果面板：画布底部显示错误/警告列表，点击可定位到问题节点

### 5. 画布内实时预览

在 RuleCanvas.vue 工具栏的"运行预览"按钮：
- 点击后弹出侧面板，输入模拟参数（同批次1的预览测试）
- 执行后在画布上显示数据流动动画：
  · 每个节点显示其输出值（数字气泡）
  · 连线上显示流经的数据值
  · 成功路径高亮绿色，失败路径高亮红色
  · 未执行的节点灰显
- 执行日志面板显示每步详情

## 需要阅读的现有文件
- packages/client/src/views/creator/RulesetEditor.vue（L1 表单的 _l1_config 结构）
- packages/client/src/components/rule-canvas/RuleCanvas.vue（批次2产出）
- packages/server/src/engine/executor.ts（理解执行流程以实现预览动画）
- docs/附录 F：规则引擎.md（COC 示例，理解典型的检定图结构）

## 全局约束
- 转换器为纯函数，可单元测试
- 拓扑校验需在 50ms 内完成（100 节点规模）
- 预览动画可关闭（性能考虑）
- **测试要求（Vitest）**：
  · `l1-to-l3-converter.test.ts`：分别测试 `roll_under`、`roll_over`、`dice_pool` 三种模式的节点数和连线数是否符合预期
  · `l3-to-l1-detector.test.ts`：标准图能反向匹配，自定义图返回 `'l3-only'`
  · `topology-validator.test.ts`：环路检测（有环/无环各一例），孤立节点检测，输出节点唯一性校验
```

---

### 规则工坊 批次 4/4：版本控制 + 继承体系 + 发布状态机

**前置条件**：批次 3 完成（编辑器双模式完整可用）
**目标**：实现规则集的版本快照、分支继承、完整发布流程

```
## 项目背景
当前规则集仅有 draft→published 二态切换。
设计要求：版本快照、分支创建、parent 继承合并、完整的发布审核流程。
这是为了支持社区二创——用户可以 fork 官方规则集并自定义修改。

## 本次任务

### 1. 数据库扩展（Server - Knex migration）

> **⚠️ 现状说明**：`rulesets` 表当前 `status` 字段类型为 MySQL `ENUM('draft','published')`。
> MySQL 扩展 ENUM 需用 `ALTER TABLE ... MODIFY COLUMN status ENUM(...)` 语法，
> 新 migration 中应同时扩展枚举值并添加新字段（放在同一个 migration 文件中）。
> 同时需更新 `packages/shared/src/types/index.ts` 中 `RulesetStatus` 联合类型，
> 增加 `'reviewing' | 'deprecated'`。

新建 migration（按实际顺序编号，例如 `009_ruleset_versions.ts`）：
- ruleset_versions 表：
  · id (UUID), ruleset_id (FK), version_number (semver string),
    snapshot (JSON, 完整的 atoms+connections+commands+character_card_schema),
    changelog (text), created_at
  · 每次保存自动创建版本快照

- 修改 rulesets 表增加字段并扩展 status 枚举：
  · parent_id (UUID, nullable, FK→rulesets.id) —— 继承来源
  · fork_count (int, default 0) —— 被 fork 次数
  · **version (int, default 0, NOT NULL)** —— 乐观锁字段，每次 UPDATE 前校验并 +1
  · latest_version_id (UUID, FK→ruleset_versions.id)
  · status 枚举扩展为：`ENUM('draft', 'reviewing', 'published', 'deprecated')`

### 2. 版本控制 Service（Server）

在 RulesetService 中增加：
- saveVersion(rulesetId, changelog)：创建版本快照，自动递增版本号
- listVersions(rulesetId)：版本历史列表（id, version_number, changelog, created_at）
- getVersion(versionId)：获取特定版本的完整快照
- rollbackToVersion(rulesetId, versionId)：将当前 draft 内容回滚到指定版本
- compareVersions(versionIdA, versionIdB)：返回两个版本的 diff
  （新增/删除/修改的原子节点和连线）

### 3. 分支与继承（Server）

- forkRuleset(sourceId, userId)：
  · 创建新规则集，parent_id = sourceId
  · 复制最新版本的 snapshot 作为初始内容
  · 使用乐观锁更新源规则集 fork_count：
    `UPDATE rulesets SET fork_count = fork_count + 1, version = version + 1
     WHERE id = sourceId AND version = :currentVersion`
    若受影响行数为 0，抛出 409 Conflict（并发冲突），客户端可重试
  · 新规则集 status = draft

- mergeFromParent(rulesetId)：
  · 获取 parent 的最新版本
  · 与当前 draft 做三方合并（base = fork 时的 parent 版本, theirs = parent 最新,
    ours = 当前 draft）
  · 原子节点级别的合并：
    - 新增的节点：自动合并
    - 删除的节点：如果本地未修改则删除，否则标记冲突
    - 修改的节点：如果本地也修改了同一节点则标记冲突
  · 返回合并结果 + 冲突列表
  · 冲突需要用户手动解决

### 4. 发布状态机（Server）

完整流程：draft → reviewing → published（规则集暂不需要7天公示，模组才需要）
- submitForReview(rulesetId)：draft → reviewing，创建版本快照
- approvePublish(rulesetId)：reviewing → published（V1.0 自动通过，无人工审核）
- deprecate(rulesetId)：published → deprecated，已使用的团不受影响
- unpublish(rulesetId)：published → draft（仅当无团正在使用时允许）

API 端点：
- POST /api/rulesets/:id/submit-review
- POST /api/rulesets/:id/approve（V1.0 调用 submit 后自动 approve）
- POST /api/rulesets/:id/deprecate
- POST /api/rulesets/:id/fork

### 5. 前端版本管理 UI

在 RulesetEditor.vue 中增加"版本"标签页：
- 版本历史列表（时间线样式），每个版本显示版本号、changelog、时间
- "保存版本"按钮 + changelog 输入框
- "回滚到此版本"按钮（需二次确认）
- "对比版本"：选择两个版本，以 diff 视图展示变更（新增=绿色，删除=红色，修改=黄色）
- 如果有 parent_id，显示"从上游同步"按钮，触发 mergeFromParent
- 冲突解决 UI：列出冲突节点，每个可选择"保留我的"/"采用上游"/"手动编辑"

在 RulesetWorkshop.vue（列表页）中：
- 规则集卡片显示 fork 来源（如果有 parent）
- "Fork"按钮（对公开规则集）
- 状态标签增加 reviewing / deprecated 展示

## 需要阅读的现有文件
- packages/server/src/services/ruleset-service.ts
- packages/server/src/routes/rulesets.ts
- packages/server/src/db/migrations/（了解现有表结构）
- packages/client/src/views/creator/RulesetEditor.vue
- packages/client/src/views/creator/RulesetWorkshop.vue
- packages/shared/src/types/index.ts（Ruleset 类型）

## 全局约束
- 版本快照使用 JSON 存储，单个快照体积限制在 1MB 以内
- 合并算法在 shared 包中实现（前后端都可能用到）
- 回滚操作需要记录审计日志
- fork_count 使用乐观锁（version 字段）防止并发问题
- **测试要求（Vitest）**：
  · `ruleset-merger.test.ts`：三方合并——"双方新增"自动合并，"同一节点双方修改"产生冲突
  · `POST /api/rulesets/:id/fork` 集成测试：fork 后新规则集 `parent_id` 正确，源 `fork_count` +1
  · `POST /api/rulesets/:id/versions/:vid/rollback` 集成测试：回滚后 draft 内容与快照一致
```

---

## 三、模组编辑器 —— 5个子批次

---

### 模组编辑器 批次 1/5：TipTap 基座 + 基础块架构

**前置条件**：无（可独立开始）
**目标**：集成 TipTap 编辑器，建立自定义块的扩展架构，实现纯文本编辑能力

```
## 项目背景
TRPG 模组编辑器需要实现 Notion 式的块编辑器，使用 TipTap 2（ProseMirror）作为基座。
模组内容由富文本 + 6种业务块（场景/NPC/事件/线索/检定/对话）组成。
当前 packages/client/ 中无 TipTap 相关依赖，模组编辑器仅有占位组件。

**⚠️ 现状说明（已核查）**：
- `ModuleEditor.vue` 文件**不存在**，需从头创建
- `packages/server/src/routes/modules.ts` 已有 `GET /` 和 `GET /mine` 两个端点；`POST/PUT/DELETE` 均需新增
- `packages/server/src/services/module-service.ts` 已有 `listPublic` 和 `listMine`；其他方法需新增
- `packages/server/src/db/migrations/008_modules_table.ts` 已有基础 modules 表，但缺少 `content/outline/word_count/auto_saved_at` 字段；新建 migration `009_module_content_fields.ts` 添加
- `modules` 表的 `status` 枚举当前为 `['draft','public','archived']`；`'public'` 对应文档中的 `'published'`（注意**命名差异**，Shared 类型 `ModuleStatus` 已定义为 `'draft' | 'public' | 'archived'`）

## 本次任务

### 1. 安装 TipTap 依赖

在 packages/client/ 中安装：
- @tiptap/vue-3（核心 Vue 3 绑定）
- @tiptap/starter-kit（基础扩展：段落、标题、列表、粗体、斜体、代码等）
- @tiptap/extension-placeholder（输入占位提示）
- @tiptap/extension-character-count（字数统计）
- @tiptap/pm（ProseMirror 工具包，用于自定义节点）

> **注意**：`@tiptap/extension-collaboration`（Y.js 协作）**不在 V1.0 安装范围内**，
> 会引入 Y.js 等大型依赖（+200KB gzip）。协作功能留待后期版本，届时单独安装。

### 2. 模组编辑器主页面

创建/替换 packages/client/src/views/creator/ModuleEditor.vue：
- 页面布局：
  · 顶部：模组标题（可编辑）、绑定规则集选择、状态标签、保存/发布按钮
  · 左侧大纲面板（200px，可折叠）：自动从内容中提取的结构树
    （H1/H2/H3 + 业务块标题），点击跳转
  · 中央：TipTap 编辑区域（最大宽度 800px，居中）
  · 右侧属性面板（280px，可折叠）：选中业务块时显示其详细属性编辑表单

- 路由更新：/creator/modules/:id/edit → ModuleEditor.vue

### 3. TipTap 编辑器基础配置

创建 packages/client/src/components/module-editor/ModuleEditorCore.vue：
- 使用 @tiptap/vue-3 的 useEditor 初始化
- 启用扩展：StarterKit、Placeholder、CharacterCount
- 工具栏：标题级别（H1-H3）、粗体、斜体、有序列表、无序列表、分割线、撤销/重做
- "/" 命令菜单（Slash Commands）：
  · 输入 "/" 弹出菜单，显示可插入的内容类型：
    - 基础：段落、标题1/2/3、列表、分割线
    - 业务块：场景块、NPC块、事件块、线索块、检定块、对话块
  · 上下键选择，回车插入
  · 支持搜索过滤（输入 /npc 过滤出 NPC 块）

### 4. 自定义块节点架构

创建 TipTap 自定义 Node 扩展的基础架构：
packages/client/src/components/module-editor/extensions/

- BaseBlockExtension.ts：所有业务块的基类扩展
  · 定义为 TipTap Node（atom: false, group: 'block', content: 'block+'）
  · 支持 attrs 存储结构化数据
  · 支持 draggable: true（拖拽排序）
  · 支持折叠/展开
  · 统一的块容器样式：左侧色条（每种块不同颜色）+ 块标题 + 折叠按钮

- 为 6 种块创建空壳扩展（仅注册节点，详细内容在后续批次）：
  · SceneBlockExtension.ts
  · NpcBlockExtension.ts
  · EventBlockExtension.ts
  · ClueBlockExtension.ts
  · CheckBlockExtension.ts
  · DialogBlockExtension.ts

每种块的 NodeView 使用 Vue 组件渲染（@tiptap/vue-3 的 VueNodeViewRenderer）。

### 5. 数据模型更新

Server 端 Knex migration（新建 migration 文件 `009_module_content_fields.ts`）：
- 修改 modules 表**增加**以下字段（`ruleset_id` 已存在，勿重复添加）：
  · content (LONGTEXT) —— 存储 TipTap 的 JSON 文档
  · outline (JSON) —— 大纲缓存（发布时生成）
  · word_count (INT)
  · auto_saved_at (DATETIME)

Shared 类型更新：
- Module 接口增加 content, ruleset_id, outline, word_count 字段
- ModuleBlock 接口：{ id, type, attrs: Record<string, any> }

Server API 补充：
- POST /api/modules —— 创建模组（name, ruleset_id）
- GET /api/modules/:id —— 获取模组详情（含 content）
- PUT /api/modules/:id —— 更新模组（content, name 等）
- PUT /api/modules/:id/auto-save —— 自动保存端点（仅更新 content + auto_saved_at）
- DELETE /api/modules/:id —— 删除（仅 draft 状态）

### 6. 自动保存

在 ModuleEditor.vue 中实现：
- 内容变更后 3 秒无操作自动保存（debounce）
- 保存时调用 auto-save 端点
- 顶部状态显示："已保存" / "保存中..." / "未保存更改"
- 离开页面前如有未保存更改，弹出确认对话框

## 需要阅读的现有文件
- packages/client/src/views/creator/ 目录（了解现有创作者工具的 UI 模式）
- packages/client/src/router/index.ts（路由配置）
- packages/server/src/routes/modules.ts（现有模组 API；**⚠️ 目前仅有 `GET /` 公开列表和 `GET /mine` 两个端点**，`POST/PUT/DELETE` 均需新增）
- packages/server/src/services/module-service.ts（现有模组 Service；目前仅有 `listPublic` 和 `listMine` 两个方法）
- packages/server/src/db/migrations/008_modules_table.ts（现有表结构；**⚠️ `content`/`outline`/`word_count`/`auto_saved_at` 字段尚未存在**，本批次需新建 migration 添加）
- packages/shared/src/types/index.ts（Module 类型；**⚠️ `ModuleEditor.vue` 文件目前不存在**，需从头创建）

## 全局约束
- TipTap 编辑器需在 1920x1080 下流畅运行（文档长度 100+ 块时不卡顿）
- 自动保存使用 debounce，不使用定时器轮询
- 块的 attrs 数据变更由 TipTap transaction 管理，确保撤销/重做正常工作
- 编辑器内容存储为 TipTap JSON 格式（ProseMirror doc JSON），不存储 HTML
- **测试要求（Vitest）**：
  · Server API 集成测试：`POST /api/modules`、`GET /api/modules/:id`、`PUT /api/modules/:id/auto-save` 各一个正向用例
  · `ModuleEditorCore.spec.ts`：组件挂载后编辑器实例非空，工具栏 H1 按钮可点击
```

---

### 模组编辑器 批次 2/5：6种业务块的 Schema 与编辑 UI

**前置条件**：批次 1 完成（TipTap 基座和块架构就绪）
**目标**：实现所有 6 种业务块的完整数据 Schema 和内嵌编辑表单

```
## 项目背景
模组编辑器的 TipTap 基座和 6 种块的空壳扩展已就绪。
本批次实现每种块的详细数据 schema 和嵌入式编辑 UI。
模组已绑定规则集，块内可引用规则集定义的属性、技能、检定模板。

## 本次任务

### 1. 场景块（SceneBlock）

数据 Schema：
{
  scene_name: string,           // 场景名称
  scene_type: 'spatial' | 'virtual' | 'lobby',
  opening_time: { day: number, hour: number, minute: number } | null,
  atmosphere: string,           // 氛围描述（短文本）
  description: string,          // 详细描述（富文本段落）
  connections: Array<{          // 与其他场景的连接
    target_scene_block_id: string,
    travel_mode: 'walk' | 'ride' | 'drive',
    duration_minutes: number
  }>,
  checks: string[],             // 关联的检定块 ID
  gm_notes: string,             // GM 专属备注（玩家不可见）
  map_description: string       // 地图说明文本
}

NodeView 组件（SceneBlockView.vue）：
- 顶部色条：绿色，图标：地图钉
- 展开态显示：场景名编辑、类型选择、氛围输入、描述区（内嵌 mini 富文本）、
  连接列表（可增删，下拉选择其他场景块）、GM 备注区（灰色底色区分）
- 折叠态显示：图标 + 场景名 + 类型标签

### 2. NPC 块（NpcBlock）

数据 Schema：
{
  npc_name: string,
  appearance: string,           // 外貌描述
  personality: string,          // 性格特征
  background: string,           // 背景故事
  attributes: Record<string, number>,  // 从规则集加载属性列表
  skills: Record<string, number>,
  resources: Record<string, { current: number, max: number }>,
  combat_data: {
    initiative_modifier: number,
    armor: number,
    weapons: Array<{ name: string, damage: string, range: string }>
  },
  location_scene_block_id: string | null,  // 初始位置
  relationships: Array<{ target_npc_name: string, relation: string }>
}

NodeView 组件（NpcBlockView.vue）：
- 顶部色条：蓝色，图标：人物
- 展开态：名称、外貌、性格（文本区）、属性/技能表格（从绑定规则集动态生成列）、
  资源编辑（HP/MP 等）、武器列表、关系网络（简单列表）
- 折叠态：图标 + NPC 名称 + 所在场景标签

### 3. 事件块（EventBlock）

数据 Schema：
{
  event_name: string,
  trigger: string,              // 触发条件描述
  difficulty: 'easy' | 'normal' | 'hard' | 'deadly',
  description: string,
  associated_check_block_id: string | null,  // 关联检定
  forced_movement: {            // 强制移动效果
    target_scene_block_id: string,
    delay_minutes: number
  } | null,
  time_effect: {                // 时间效果
    advance_minutes: number
  } | null,
  branches: Array<{             // 分支结果
    condition: string,          // 条件描述（如"检定成功"）
    outcome: string,            // 结果描述
    next_event_block_id: string | null
  }>
}

NodeView 组件（EventBlockView.vue）：
- 顶部色条：红色，图标：闪电
- 展开态：事件名、触发条件、难度选择、描述区、关联检定（下拉选择检定块）、
  分支编辑器（可增删分支，每个分支：条件+结果+跳转事件）
- 折叠态：图标 + 事件名 + 难度标签

### 4. 线索块（ClueBlock）

数据 Schema：
{
  clue_name: string,
  clue_type: 'physical' | 'testimonial' | 'documentary' | 'digital',
  content: string,              // 线索内容
  unlock_condition: string,     // 解锁条件
  reveal_method: 'auto' | 'gm_manual' | 'check_success',
  associated_scene_block_id: string | null,
  associated_check_block_id: string | null,
  theme: 'river' | 'blur' | 'fragment' | 'wave' | 'ancient' | 'blood' | 'ash' | 'cyber'
}

NodeView 组件（ClueBlockView.vue）：
- 顶部色条：金色，图标：放大镜
- 展开态：线索名、类型选择、内容编辑、解锁条件、揭示方式选择、
  关联场景（下拉）、主题预览（选择主题后显示 CSS 效果预览卡片）
- 折叠态：图标 + 线索名 + 类型标签

### 5. 检定块（CheckBlock）

数据 Schema：
{
  check_name: string,
  description: string,
  check_type: string,           // 从规则集加载的检定类型（如 ra/rc/sc）
  skill_or_attribute: string,   // 检定的技能或属性名
  difficulty_override: number | null,  // 自定义难度值（覆盖规则集默认）
  success_effect: string,       // 成功效果描述
  failure_effect: string,       // 失败效果描述
  critical_effect: string,      // 大成功效果
  fumble_effect: string,        // 大失败效果
  ruleset_command: string       // 对应的规则集命令（如 "/rc 侦查"）
}

NodeView 组件（CheckBlockView.vue）：
- 顶部色条：紫色，图标：骰子
- 展开态：检定名、描述、检定类型下拉（从绑定规则集加载可用命令列表）、
  技能/属性选择（从规则集的 character_card_schema 加载）、
  难度覆盖输入、四种结果效果文本区
- 折叠态：图标 + 检定名 + 技能名 + 命令

### 6. 对话块（DialogBlock）

数据 Schema：
{
  dialog_title: string,
  participants: Array<{ name: string, type: 'npc' | 'pc' | 'narrator' }>,
  lines: Array<{
    speaker: string,            // 参与者 name
    content: string,
    emotion: string | null,     // 情绪标签
    action: string | null       // 伴随动作
  }>,
  trigger_condition: string | null
}

NodeView 组件（DialogBlockView.vue）：
- 顶部色条：青色，图标：对话气泡
- 展开态：标题、参与者列表（可增删）、对话行编辑器
  （每行：说话人下拉 + 台词输入 + 情绪标签 + 动作，可拖拽排序）
- 折叠态：图标 + 标题 + 参与者数量

### 7. 规则集数据加载

创建 composable：packages/client/src/composables/useRulesetBinding.ts
- 接收 ruleset_id，加载规则集定义
- 提供：availableAttributes, availableSkills, availableResources, availableCommands,
  availableCheckTypes
- 供各业务块的编辑 UI 作为下拉选项使用
- 规则集变更时自动刷新

### 8. 块间引用系统

创建 composable：packages/client/src/composables/useBlockRegistry.ts
- 维护当前文档中所有业务块的注册表（id → { type, name }）
- 供下拉选择器使用（如事件块选择关联检定、场景块选择连接目标）
- 实时更新（块增删、重命名时自动同步）

## 需要阅读的现有文件
- packages/client/src/components/module-editor/extensions/*.ts（批次1 产出的空壳扩展）
- packages/client/src/views/creator/ModuleEditor.vue（批次1 产出）
- packages/shared/src/types/index.ts（Ruleset 类型中 character_card_schema 的结构）
- docs/产品设计.md 中模组编辑器相关章节
- docs/附录 E：数据字典与 Schema 定义.md

## 全局约束
- 每种块的 NodeView 组件独立文件，不超过 300 行
- 块的 attrs 变更通过 TipTap 的 updateAttributes 方法，确保进入 undo 历史
- 下拉选项从规则集动态加载，不硬编码
- 所有块在折叠态和展开态之间平滑过渡（transition 动画）
- **测试要求（Vitest + @vue/test-utils）**：
  · 每种 NodeView 组件（共 6 个）各一个快照测试（snapshot test），验证折叠态渲染不崩溃
  · `useBlockRegistry.test.ts`：注册、重命名、删除块后注册表数量正确
```

---

### 模组编辑器 批次 3/5：规则集绑定 + 检定模板引用 + 大纲生成

**前置条件**：批次 2 完成（6种块可编辑）
**目标**：打通模组与规则集的数据链路，实现大纲自动提取和跳转

```
## 项目背景
模组编辑器已有 6 种业务块和对应编辑 UI。模组在创建时绑定一个规则集。
本批次实现深度绑定：检定块能直接引用规则集中的命令图，
NPC 块能从规则集 schema 动态生成属性表格。

## 本次任务

### 1. 规则集绑定深度集成

模组创建流程：
- 创建模组时必须选择绑定的规则集
- 绑定后不可更改（或更改时警告"将清空所有检定块和属性配置"）
- 编辑器加载时预取规则集完整定义

规则集数据自动填充：
- NPC 块的 attributes 表格列名从 character_card_schema.attributes 动态生成
- NPC 块的 skills 列表从规则集定义的技能分类加载
- NPC 块的 resources 从规则集定义的资源池生成
- 检定块的 check_type 下拉从规则集的 supported_commands 加载
- 检定块的 skill_or_attribute 下拉从规则集属性+技能列表加载

### 2. 检定模板引用与预览

检定块编辑 UI 增强：
- 选择 check_type 后，显示该命令的原子图摘要（简化版：
  "DiceRoll(1d100) → ThresholdCompare(≤技能值) → 判定结果"）
- "测试检定"按钮：输入模拟技能值，调用 POST /api/rulesets/:id/execute
  测试该检定命令，显示结果
- 检定块的 ruleset_command 字段自动生成（如选择 rc + 侦查 → "/rc 侦查"）

### 3. 大纲面板

在 ModuleEditor.vue 左侧大纲面板实现：
- 自动从 TipTap 文档中提取：
  · 所有 H1/H2/H3 标题节点
  · 所有业务块（按类型图标+名称展示）
- 树形结构：H1 下包含后续的 H2、H2 下包含后续的 H3 和业务块
- 点击大纲项 → 编辑器滚动到对应位置并高亮闪烁
- 实时更新（文档变更时 debounce 200ms 重新提取）
- 支持拖拽大纲项重排文档结构（可选，复杂度高则标记 TODO）

### 4. 块间引用完整性校验

在保存/发布时运行校验：
- 场景块的 connections.target_scene_block_id 指向存在的场景块
- 事件块的 associated_check_block_id 指向存在的检定块
- 线索块的 associated_scene_block_id 指向存在的场景块
- 对话块的 participants 中 NPC 类型的 name 对应存在的 NPC 块
- 校验失败时：
  · 保存仍然允许（draft 状态宽松）
  · 发布时阻止，显示错误列表，点击可定位到问题块

模组元数据编辑

在 ModuleEditor.vue 顶部区域增加：
- 封面图上传：
  · `POST /api/upload/` 端点（注意：**实际已存在**，路由文件 `packages/server/src/routes/upload.ts` 已实现，
    在 `app.ts` 中挂载为 `/api/upload`，可通过 `POST /api/upload/` 访问）。
    现有实现文件大小限制为 5MB；封面图上传时需在**客户端**额外校验 ≤ 500KB / 1024×1024px，
    超出则拒绝上传并提示"封面图请控制在 500KB 以内"。
  · 预览使用 `<img>` 标签展示已上传 URL，**不使用 base64**（大图 base64 存入 DB 是反模式）
  · 若上传 API 未就绪，封面字段可暂留空，发布时校验提示"请上传封面图"
- 标签编辑（输入+回车添加，最多 10 个）
- 简介编辑（纯文本，最多 500 字）
- 适合人数（min-max 数值输入）
- 预计时长（小时）
- 难度等级（新手友好/普通/困难/专家）
- 这些字段存储在 modules 表的 metadata JSON 字段中

## 需要阅读的现有文件
- packages/client/src/composables/useRulesetBinding.ts（批次2产出）
- packages/client/src/composables/useBlockRegistry.ts（批次2产出）
- packages/client/src/components/module-editor/extensions/CheckBlockExtension.ts
- packages/server/src/engine/command-defaults.ts（命令定义）
- packages/shared/src/types/index.ts

## 全局约束
- 大纲提取使用 TipTap 的 editor.getJSON() 遍历，不使用 DOM 查询
- 校验逻辑在 shared 包中实现（前后端都可调用）
- 封面图上传复用 `POST /api/upload/`（已存在，封面图需客户端校验≤500KB），不使用 base64
- **测试要求（Vitest）**：
  · `block-integrity-validator.test.ts`："场景块指向不存在的场景块 ID"返回 error，"所有引用合法"返回 ok
  · `outline-extractor.test.ts`：给定含 H1/H2 + 2 种业务块的 TipTap JSON，验证提取的大纲节点数正确
```

---

### 模组编辑器 批次 4/5：发布流程 + 状态机 + 公示期

**前置条件**：批次 3 完成（编辑器功能完整）
**目标**：实现完整的模组发布审核流程和社区公示机制

```
## 项目背景
模组的发布流程比规则集更复杂，设计要求：
draft → reviewing → public_notice (7天公示) → published → suspended
公示期内社区可查看模组内容并举报问题。

## 本次任务

### 1. 发布状态机（Server）

修改 ModuleService 实现完整状态机：

- submitForReview(moduleId, userId)：
  · 校验：仅作者、仅 draft 状态、必须有至少 1 个场景块
  · draft → reviewing
  · 创建内容快照（防止审核期间作者修改）

- startPublicNotice(moduleId)：
  · reviewing → public_notice
  · 设置 public_notice_end_at = now + 7天
  · V1.0 无人工审核，submitForReview 后自动调用此方法

- completePublicNotice()：
  · 定时任务（或请求时检查）：if public_notice_end_at < now → published
  · 如果公示期内被举报且确认违规 → suspended

- suspend(moduleId, reason)：
  · 任何状态 → suspended
  · 记录原因

- revertToDraft(moduleId, userId)：
  · reviewing 或 public_notice → draft（仅作者，相当于撤回）

DB migration（按实际顺序编号，例如 `010_module_workflow.ts` 或 `011_module_workflow.ts`）：
> **⚠️ 枚举扩展说明**：`modules.status` 当前为 `ENUM('draft','public','archived')`。
> 注意现有代码中"已发布"状态对应的枚举值是 `'public'`（不是 `'published'`），
> 扩展时保持 `'public'` 不变，新增 `'reviewing'`/`'public_notice'`/`'suspended'`：
> `ALTER TABLE modules MODIFY COLUMN status ENUM('draft','public','archived','reviewing','public_notice','suspended')`
> 同时更新 `packages/shared/src/types/index.ts` 中 `ModuleStatus` 联合类型。
- 修改 modules 表 status 枚举，完整枚举为：`draft | public | archived | reviewing | public_notice | suspended`
- 增加字段：public_notice_end_at (DATETIME), suspended_reason (TEXT),
  review_snapshot (LONGTEXT), submitted_at (DATETIME)

API 端点：
- POST /api/modules/:id/submit —— 提交审核
- POST /api/modules/:id/withdraw —— 撤回
- GET /api/modules/:id/public-notice —— 公示期信息
- POST /api/modules/:id/report —— 举报

### 2. 公示期展示（Client）

在模组详情页（公开浏览）：
- 公示期模组的特殊标识：黄色"公示中"标签 + 倒计时（X天X小时后正式发布）
- 公示期内模组内容可查看但不可购买/使用
- "举报问题"按钮 → 弹出举报表单（举报类型：抄袭/违规内容/其他 + 说明文字）

在创作者的模组列表中：
- 显示各模组的当前状态和相应操作按钮：
  · draft → "提交审核"按钮
  · reviewing → "审核中"状态 + "撤回"按钮
  · public_notice → "公示中 (剩余X天)" + "撤回"按钮
  · published → "已发布"状态
  · suspended → "已下架 (原因: xxx)" + "申诉"按钮（V1.0 先不实现申诉流程；
    点击"申诉"按钮时弹出 Toast："申诉功能即将上线，敬请期待"，不做任何网络请求）

### 3. 模组编辑器内发布交互

在 ModuleEditor.vue 中：
- 顶部增加发布操作区域：
  · draft 状态：显示"提交发布"按钮
  · 点击后运行完整性校验（批次3的校验逻辑）
  · 校验通过 → 确认对话框："提交后进入7天公示期，公示期间内容不可编辑。确认提交？"
  · reviewing/public_notice 状态：编辑器变为只读模式，顶部显示状态信息
  · published 状态：编辑器只读，显示"创建新版本"按钮（fork 当前版本为新 draft）

### 4. 定时任务 —— 公示期自动完成

在 packages/server/ 中安装 `node-cron`（轻量级 cron 调度器，无需 Redis 依赖）：
```bash
pnpm add node-cron
pnpm add -D @types/node-cron
```

在 `packages/server/src/app.ts` 启动时注册定时任务：
```typescript
import cron from 'node-cron'

// 每小时第 0 分执行，检查公示期到期模组
cron.schedule('0 * * * *', async () => {
  await moduleService.completeExpiredPublicNotices()
})
```

> **Docker 注意事项**：`node-cron` 运行在 Node.js 进程内，无需系统 crontab，
> 但多副本部署时会重复触发。V1.0 单实例部署不受影响；
> 若将来水平扩展，需改用 Redis 分布式锁（`SET NX PX`）保证幂等。

`moduleService.completeExpiredPublicNotices()` 实现：
- 查询所有 `status='public_notice' AND public_notice_end_at <= NOW()`
- 批量 UPDATE `status='published'`，记录 `module_status_logs`
- 为每个作者创建系统通知："您的模组《{name}》已通过公示期，正式发布！"

## 需要阅读的现有文件
- packages/server/src/services/module-service.ts
- packages/server/src/routes/modules.ts
- packages/server/src/db/migrations/008_modules_table.ts
- packages/shared/src/types/index.ts（Module 类型的 status 定义）

## 全局约束
- 状态转换必须经过校验，不允许跳过状态
- 公示期内容快照为不可变，即使作者在 draft 中修改也不影响公示版本
- 举报记录单独存表（module_reports）
- 状态变更记录审计日志（module_status_logs 表）
- 举报记录存入 module_reports 表

> **⚠️ 缺失 Migration**：本批次必须新建 migration 文件（按实际执行顺序编号，如 `010_module_workflow.ts` 或 `011_module_workflow.ts`），包含以下两张表：
>
> **module_reports 表字段**：id(UUID PK), module_id(FK), reporter_user_id, report_type ENUM('plagiarism','violation','other'), description TEXT, status ENUM('pending','resolved','dismissed') DEFAULT 'pending', created_at
>
> **module_status_logs 表字段**：id(UUID PK), module_id(FK), from_status VARCHAR(32), to_status VARCHAR(32), operator_user_id(nullable，系统触发时为 null), reason TEXT nullable, created_at

- **测试要求（Vitest）**：
  · `module-state-machine.test.ts`：合法转换（draft→reviewing）成功，非法跳转（draft→published）抛异常
  · API 集成测试：`POST /api/modules/:id/submit` 后状态变 `reviewing`，`POST /api/modules/:id/withdraw` 回到 `draft`
```

---

### 模组编辑器 批次 5/5：Word/TXT 导入 + PDF 导出

**前置条件**：批次 4 完成（编辑器和发布流程完整）
**目标**：实现文档导入（将现有模组文稿转换为结构化块）和 PDF 导出

```
## 项目背景
很多 TRPG 模组作者已有 Word 或纯文本格式的模组文稿。
导入功能需要智能解析文稿结构，识别出场景、NPC、事件等，转换为编辑器块。
PDF 导出用于分发和线下使用。
注意：V1.0 不使用 AI，导入采用规则匹配 + 用户手动确认。

## 本次任务

### 1. 文件上传与解析（Server）

创建 packages/server/src/services/module-import-service.ts：

TXT 导入：
- 接收上传的 .txt 文件
- 解析规则（基于常见模组文稿格式）：
  · 以 "场景"/"Scene"/"地点" 开头的段落 → 识别为场景块候选
  · 以 "NPC"/"角色"/"人物" 开头的段落 → 识别为 NPC 块候选
  · 以 "事件"/"Event"/"遭遇" 开头的段落 → 识别为事件块候选
  · 以 "线索"/"Clue"/"证据" 开头的段落 → 识别为线索块候选
  · 以 "检定"/"Check"/"投骰" 开头的段落 → 识别为检定块候选
  · 包含对话格式（"角色名：台词" 或 "角色名「台词」"）→ 识别为对话块候选
  · 其他段落 → 普通富文本
  · 空行分隔段落，"# " "## " "### " 识别为标题
- 输出：解析结果数组，每项标注 { type, confidence, raw_text, suggested_attrs }

DOCX 导入：
- 使用 mammoth.js 将 .docx 转为 HTML
- 然后转为纯文本再走 TXT 解析流程
- 保留标题层级信息（从 docx 的 heading 样式提取）

API 端点：
- POST /api/modules/:id/import —— 上传文件，返回解析结果（不直接写入）
- POST /api/modules/:id/import/confirm —— 确认导入，将解析结果写入 content

### 2. 导入确认 UI（Client）

创建 packages/client/src/components/module-editor/ImportConfirmDialog.vue：
- 上传文件后弹出全屏对话框
- 左右分栏：左侧原文（高亮已识别区域）、右侧解析结果预览
- 每个识别项：
  · 类型标签（场景/NPC/事件...）+ 置信度指示（高/中/低）
  · 用户可修改类型（下拉切换）或标记为"普通文本"
  · 用户可编辑解析出的属性
- "确认导入"按钮 → 将结果写入编辑器
- "取消"按钮 → 丢弃解析结果

### 3. PDF 导出（Server）

创建 packages/server/src/services/module-export-service.ts：

使用 puppeteer（或 @react-pdf/renderer 的 Node 等价物，但推荐 puppeteer 更灵活）：
- 将模组内容渲染为 HTML 模板
- 使用 puppeteer 转为 PDF

基础版（免费）：
- 简洁排版：标题、正文、块内容以表格形式展示
- 无封面、无页眉页脚
- A4 纵向

精装版（会员/付费）：
- 定制封面页（模组名称、作者、封面图）
- 页眉（模组名）+ 页脚（页码）
- 目录页（从大纲自动生成，带页码）
- 场景块以卡片样式渲染
- NPC 块以角色卡样式渲染
- 线索块应用对应 CSS 主题样式

API 端点：
- POST /api/modules/:id/export/pdf?style=basic|premium
- 返回 PDF 文件流

安装依赖：mammoth（docx 解析）、puppeteer（PDF 生成）

### 4. 导出入口（Client）

在 ModuleEditor.vue 工具栏增加：
- "导入"按钮 → 弹出文件选择（支持 .txt, .docx）→ 上传 → 打开确认对话框
- "导出 PDF"按钮 → 选择样式（基础/精装）→ 生成并下载
- 生成中显示 loading 状态（puppeteer 渲染可能需要几秒）

### 5. Server 依赖安装

在 packages/server/package.json 中添加：
- mammoth（docx→html）
- puppeteer 或 puppeteer-core + chromium（PDF 生成）

注意 puppeteer 在 Docker 环境中需要安装 chromium 依赖，
在 Dockerfile 中补充相应的 apt-get 安装。

## 需要阅读的现有文件
- packages/client/src/views/creator/ModuleEditor.vue
- packages/server/src/routes/modules.ts
- packages/server/src/services/module-service.ts
- docs/产品设计.md 中导入/导出相关章节

## 全局约束
- 导入解析为纯规则匹配，不使用 AI（V1.0 约束）
- PDF 导出超时限制 30 秒
- 上传文件大小限制：txt ≤ 2MB，docx ≤ 10MB
- puppeteer 使用 headless: 'new' 模式
- 导入结果必须经用户确认才能写入，不自动覆盖
- **测试要求（Vitest）**：
  · `module-import-parser.test.ts`：用 fixture TXT（含场景/NPC/对话各一段）验证各类型至少识别 1 条且 type 正确
  · `POST /api/modules/:id/export/pdf` 集成测试：响应 Content-Type 为 `application/pdf`，Body 长度 > 0
  · 文件大小校验：超过限制的文件返回 HTTP 413
```

---

## 四、当前项目整体进度评估与后续优先级建议

### 整体完成度矩阵

| 模块 | 完成度 | 备注 |
|------|--------|------|
| 基础设施（Auth/DB/Socket） | 95% | 稳定可用 |
| 团管理 + 场景 + 移动 | 90% | 核心流程完整 |
| 实时聊天 | 85% | 缺消息可见性计算 |
| 角色卡系统 | 85% | 缺头像上传 |
| 招募系统 | 90% | 完整 |
| GM 控制台 | 50% | 缺线索库/暗骰/NPC扮演/轨迹 |
| 规则引擎后端 | 75% | 原子和执行器完整，命令三层模型不全 |
| **规则工坊前端** | **35%** | L1 表单基本可用，L3 画布/版本控制/继承全无 |
| **模组编辑器** | **8%** | 仅有数据表和占位路由 |
| 论坛 | 30% | 前端骨架有，后端 API 缺失 |
| 通知系统 | 5% | 仅有 DB 表 |
| 广场/市场 | 20% | 基础列表，缺搜索/筛选/详情 |
| UI/UX | 50% | 基础组件有，设计令牌未对齐，无移动端适配 |

### 建议执行顺序

**阶段一（核心功能闭环）** —— 必须先于一切：
1. 原提示词文档的批次 1-3（规则引擎 API / 消息可见性 / 通知系统）
2. 规则工坊 批次 1（命令系统 + 预览执行）

**阶段二（两大模块主体）** —— 产品核心差异化：
3. 模组编辑器 批次 1-2（TipTap 基座 + 6 种块）
4. 规则工坊 批次 2-3（L3 画布 + L1↔L3 转换）

**阶段三（完善闭环）**：
5. 模组编辑器 批次 3-4（规则集绑定 + 发布流程）
6. 规则工坊 批次 4（版本控制 + 继承）
7. 原提示词文档的批次 4-7（论坛/GM控制台/助手台/网格地图）

**阶段四（体验打磨）**：
8. 模组编辑器 批次 5（导入导出）
9. 原提示词文档的批次 8-15（设计令牌/广场/首页/移动端/日志/上传/空状态/轨迹矩阵）

---

## 五、附录：API 鉴权矩阵

> 所有端点均位于 `/api/` 前缀下。  
> 鉴权方式：Bearer JWT（`Authorization: Bearer <token>` 请求头）。  
> 角色说明：`public`=无需登录，`user`=已登录用户，`author`=资源作者本人，`admin`=管理员。

### 规则工坊 API

| 方法 | 路径 | 最低权限 | 说明 |
|------|------|----------|------|
| GET | /rulesets | public | 获取已发布规则集列表 |
| GET | /rulesets/mine | user | 获取我的规则集（含 draft） |
| POST | /rulesets | user | 创建规则集 |
| GET | /rulesets/:id | public（已发布）/ author（draft） | 获取规则集详情 |
| PUT | /rulesets/:id | author | 更新规则集 |
| DELETE | /rulesets/:id | author | 删除规则集（仅 draft） |
| POST | /rulesets/:id/execute | user | 预览执行命令（带 mock_context 时无需角色归属） |
| POST | /rulesets/:id/submit-review | author | 提交审核 |
| POST | /rulesets/:id/approve | admin | 审核通过（V1.0 提交后自动调用，无人工） |
| POST | /rulesets/:id/deprecate | author/admin | 废弃规则集 |
| POST | /rulesets/:id/fork | user | Fork 规则集（源规则集须为 published） |
| GET | /rulesets/:id/versions | author | 版本历史列表 |
| POST | /rulesets/:id/versions | author | 保存版本快照 |
| GET | /rulesets/:id/versions/:vid | author | 获取特定版本快照 |
| POST | /rulesets/:id/versions/:vid/rollback | author | 回滚到指定版本 |
| GET | /rulesets/:id/versions/compare | author | 对比两个版本 |
| POST | /rulesets/:id/merge-from-parent | author | 从上游同步更新 |

### 模组编辑器 API

| 方法 | 路径 | 最低权限 | 说明 |
|------|------|----------|------|
| GET | /modules | public | 获取已发布/公示中模组列表 |
| GET | /modules/mine | user | 获取我的模组（含 draft） |
| POST | /modules | user | 创建模组 |
| GET | /modules/:id | public（已发布）/ author（draft） | 获取模组详情 |
| PUT | /modules/:id | author | 更新模组内容 |
| PUT | /modules/:id/auto-save | author | 自动保存（仅更新 content + auto_saved_at） |
| DELETE | /modules/:id | author | 删除模组（仅 draft） |
| POST | /modules/:id/submit | author | 提交审核发布 |
| POST | /modules/:id/withdraw | author | 撤回（reviewing/public_notice → draft） |
| GET | /modules/:id/public-notice | public | 公示期信息和倒计时 |
| POST | /modules/:id/report | user | 举报模组 |
| POST | /modules/:id/import | author | 上传文件获取解析结果（不写入） |
| POST | /modules/:id/import/confirm | author | 确认导入，写入 content |
| POST | /modules/:id/export/pdf | user | 导出 PDF（style=basic\|premium） |

### 文件上传 API

| 方法 | 路径 | 最低权限 | 说明 |
|------|------|----------|------|
| POST | /upload/ | user | 上传图片（封面图/头像等），服务端限制≤5MB；封面图场景需客户端额外校验≤500KB，返回 `{ url, filename, size, mimeType }` |
