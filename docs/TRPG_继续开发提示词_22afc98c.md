# TRPG 平台继续开发提示词

> 本提示词基于当前代码库（截至2026-04-20）与《产品设计》及附录 A–K 的完整对比分析生成。
> 按模块拆分为独立批次，每批可单独投喂给 AI 编程助手执行。

---

## 使用说明

1. **每次开始新会话时**，先投喂下方的「项目上下文摘要」段落，让 AI 了解技术栈和现有架构。
2. 然后按批次编号投喂对应段落，一个批次完成并验证后再投喂下一个。
3. 每批末尾附有「验收清单」，逐条确认后再进入下批。
4. 标注 `[P0]` 为核心闭环必需，`[P1]` 为重要功能，`[P2]` 为增强体验。建议严格按编号顺序执行。

---

## 项目上下文摘要（每次新会话必贴）

```
你正在继续开发一个 TRPG（桌上角色扮演游戏）在线平台，代码已有一定进度。

技术栈：
- Monorepo (pnpm workspace)，三个包：server / client / shared
- 后端：Express 4 + Socket.IO 4 + Knex (MySQL 8) + Redis (IORedis)
- 前端：Vue 3 + Vite 5 + Pinia + Element Plus + TipTap (ProseMirror)
- 共享：TypeScript 类型定义 + Snowflake ID + CSON/ILF 工具函数
- 部署：Docker + nginx 反向代理
- 测试：Vitest

已完成的核心功能：
- 用户注册/登录 (JWT)、角色权限 (player/GM/creator/admin)
- 团（Campaign）CRUD、房间码加入、GM/助理GM
- 场景（Scene）三种类型 (spatial/virtual/lobby) 的 CRUD
- 角色卡 CRUD、属性/技能/装备/背景 JSON 存储
- 实时聊天 (Socket.IO + Snowflake ID)、消息类型 (narrative/dice/OOC/system/announcement/clue_card)
- 规则集 CRUD、8 个 P0 原子 (dice_roll/formula_eval/threshold_compare/multiply/if_else/result_collector/character_skill_reader/resource_modify)
- 骰子表达式解析器 (dN/kh/kl/+-*/括号)
- 指令系统：3 条平台预设 (roll/check/initiative)
- 模组 CRUD + TipTap 编辑器 (6 种自定义块: Scene/NPC/Event/Clue/Check/Dialog)
- 模组 Word 导入预览 + 自动保存 + 发布审核流程
- 社区论坛 + 招募板 + 通知系统
- 网格地图 (grid_maps 表 + token 基础移动)
- 线索卡 (campaign_clues 表 + 8 种文字艺术主题定义)
- 日志导出 (ILF 中间格式 + PDF 生成基础)
- 前端路由：Home/AssetLibrary/MyCampaigns/Room/CharacterEditor/CreatorDashboard/RulesetWorkshop/RulesetEditor/ModuleEditor/Community/Personal 等

未完成但已有 DB schema 或类型定义的：
- 角色场景状态 (character_scene_states)、预约移动 (scheduled_moves)、位置历史 (position_history)
- 场景连接 (scene_connections) + 交通时长
- 规则集版本 (ruleset_versions) + fork 机制
- 角色卡实例隔离（campaign 内独立副本）
- write-spread 消息可见性模型（visible_to 字段已存在但未填充）

关键设计文档路径：
- docs/产品设计.md (主设计文档)
- docs/附录 A–K (ID规范/UI规范/技术约定/页面设计/数据字典/规则引擎/文字艺术/日志格式/SVG资源/移动端/角色卡交换格式)
- docs/项目启动与验收指南.md
```

---

## 批次 1/10：指令系统补全 [P0]

```
请补全三层指令解析系统，使其完整实现《产品设计》中描述的「平台预设 → 规则集覆写 → 自定义指令」三级合并逻辑。

当前状态：
- packages/server/src/engine/command-defaults.ts 只有 3 条指令 (roll/check/initiative)
- packages/server/src/engine/command-resolver.ts 存在但只做简单查找
- 规则集 DB 中 commands 字段为 JSON，包含 preset_overrides 和 custom_commands

需要完成：

1. 补全 command-defaults.ts 中的 8 条 COC7 预设指令：
   - ra (属性检定)：参数 attribute_name, difficulty(normal/hard/extreme)
   - rc (技能检定)：参数 skill_name, difficulty, bonus_dice/penalty_dice
   - sc (理智检定)：参数 无（读取当前 SAN 值）
   - en (技能成长)：参数 skill_name（d100 > 当前值则 +1d10）
   - ti (幕间成长)：参数 无（批量 en 所有标记技能）
   - li (灵感检定)：参数 skill_name（反向检定，> 值为成功）
   - init (先攻)：参数 无（读取 DEX）
   - ds (伤害/送葬骰)：参数 weapon_damage_formula
   每条指令需定义：name, description, parameters (Zod schema), graph_template (原子图引用或内联定义)

2. 重写 command-resolver.ts 的 resolve() 方法：
   - 输入：commandName, rulesetId, rawArgs
   - 解析优先级：ruleset.commands.custom_commands[commandName] → ruleset.commands.preset_overrides[commandName] → platformDefaults[commandName]
   - 合并策略：自定义指令完全覆盖；preset_overrides 仅覆盖 graph_template，保留默认参数 schema
   - 返回 ResolvedCommand { name, parameters, graph, source: 'custom'|'preset_override'|'platform_default' }

3. 更新 packages/server/src/routes/rulesets.ts 的 POST /:id/execute 端点：
   - 接受 { command: string, args: Record<string, any>, context?: { character_id?, mock_values? } }
   - 调用 resolve() → 注入参数到图 → 执行图 → 返回结果
   - 如果 context.character_id 存在，从 DB 读取角色属性注入
   - 如果 context.mock_values 存在，用 mock 值替代角色读取

4. 前端 ChatInput.vue 指令自动补全：
   - 输入 "/" 时弹出当前房间规则集的可用指令列表（从 campaign store 中获取 ruleset commands）
   - 显示指令名 + 描述 + 参数提示
   - 选中后填入指令模板（如 "/rc 侦查"）
   - 发送时解析指令格式，通过 Socket.IO 发送 { type: 'command', command, args }

5. Socket.IO 服务端处理：
   - 在 room namespace 的 chat 事件中，检测 message_type === 'command'
   - 调用 command-resolver → graph-executor
   - 将执行结果包装为 dice 类型消息广播
   - metadata 中存储原始指令、骰子结果明细、成功/失败判定

验收清单：
- [ ] /ra 力量 → 执行属性检定，返回 d100 结果 + 成功等级
- [ ] /rc 侦查 hard → 执行困难技能检定
- [ ] /sc → 读取角色 SAN 值执行理智检定
- [ ] /en 侦查 → 技能成长判定（d100 > 当前值则 +1d10）
- [ ] 自定义指令覆盖预设：规则集中定义同名指令后优先使用
- [ ] ChatInput 中输入 "/" 弹出指令列表
- [ ] 指令执行结果作为 dice 消息出现在聊天中
```

---

## 批次 2/10：消息可见性与场景完善 [P0]

```
请实现 write-spread 消息可见性模型，并补全 virtual/lobby 场景类型的完整行为。

当前状态：
- chat_messages 表有 visible_to JSON 字段但未填充
- Scene 有 type 枚举 (spatial/virtual/lobby) 和 history_visibility 字段
- character_scene_states 表存在但未使用
- scene_participations 表存在但未使用

需要完成：

1. Write-Spread 可见性计算 (packages/server/src/services/visibility.ts 新建)：
   消息创建时根据以下规则计算 visible_to 数组并存入 DB：
   - spatial 场景：visible_to = 该场景所有当前在场角色的 user_id + GM + 助理GM
   - virtual 场景：visible_to = 该私密场参与者（scene_participations 中 left_at IS NULL）的 user_id + GM
   - lobby 场景：visible_to = ['*']（所有团成员可见）
   - GM 隐藏消息 (metadata.gm_hidden=true)：visible_to = [gm_user_id]
   - OOC 消息：visible_to = ['*']（全团可见，不受场景限制）
   - system/announcement 消息：visible_to = ['*']
   - clue_card 消息：visible_to = clue.visible_to（从 campaign_clues 表读取）

2. 场景参与管理 (packages/server/src/services/scene-participation.ts 新建)：
   - joinScene(characterId, sceneId)：插入 scene_participations，更新 character_scene_states.current_spatial_scene_id
   - leaveScene(characterId, sceneId)：设置 left_at，清空 current_spatial_scene_id
   - getParticipants(sceneId)：返回当前在场角色列表
   - 进出场景时广播 system 消息（"[角色名] 进入了 [场景名]" / "离开了"）

3. history_visibility 限制：
   - 'none'：新加入者看不到历史消息
   - 'recent'：新加入者只能看到最近 visible_history_count 条
   - 'all'：新加入者可看全部历史
   实现：GET /api/campaigns/:id/scenes/:sceneId/messages 端点中，根据角色加入时间和设置过滤

4. 前端消息过滤：
   - message-store.ts 中，收到 new_message 事件时检查 visible_to
   - 如果 visible_to 包含 '*' 或当前 user_id，则显示
   - 否则不渲染（不是前端安全屏障，后端已过滤，这只是防护性检查）

5. 私密场 (virtual) 完整流程：
   - GM Console 中增加「创建私密场」按钮
   - 创建时选择参与角色（多选）
   - 创建后只有参与者可见该场景频道
   - LeftSidebar 中私密场显示🔒图标，非参与者不可见

6. 公共场 (lobby) 完整流程：
   - 每个团自动创建一个默认 lobby（加入团时自动生成）
   - lobby 不消耗故事时间（发送消息时 story_time = null）
   - lobby 中 OOC 和闲聊不纳入日志导出

7. Socket.IO 消息下发过滤：
   - 服务端 new_message 事件发送前，检查接收者 socket 对应的 user_id 是否在 visible_to 中
   - 仅向有权限的 socket 发送

验收清单：
- [ ] spatial 场景中发送的消息只有在场角色的玩家和 GM 收到
- [ ] virtual 场景仅参与者可见（左侧栏不显示给其他人）
- [ ] lobby 消息全团可见
- [ ] GM 隐藏消息只有 GM 自己能看到
- [ ] 新角色进入 history_visibility='none' 的场景看不到历史消息
- [ ] 进出场景产生 system 消息
- [ ] Socket.IO 服务端按 visible_to 过滤下发
```

---

## 批次 3a/10：故事时间系统与移动后端 [P0]

```
请实现故事时间推进系统和预约移动后端逻辑。本批只做后端 service + API + Socket.IO 事件，不涉及 GM 控制台 UI（留给 3b）。

当前状态：
- GMConsole.vue 存在但功能不完整
- global_story_time JSON 字段 (day/hour/minute) 在 campaigns 表中
- personal_story_time JSON 字段在 character_scene_states 中
- scheduled_moves 表存在但未使用
- Socket.IO 已有 time_advanced / move_approved / move_rejected 事件定义

需要完成：

1. 时间推进后端 (packages/server/src/services/time.ts 新建)：
   - advanceTime(campaignId, delta: {day, hour, minute}, gmUserId)：
     a. 计算新时间（处理进位：minute>=60→hour+1, hour>=24→day+1）
     b. 更新 campaigns.global_story_time
     c. 查询 scheduled_moves WHERE campaign_id=? AND status='approved' AND execute_at_story <= new_time
     d. 对每条到期移动执行 executeMove()：
        - 更新 character_scene_states.current_spatial_scene_id
        - 插入 position_history (move_type='scheduled')
        - 更新 scheduled_moves.status = 'executed'
        - 广播 position_changed 事件
     e. 广播 time_advanced 事件 { new_time, executed_moves: [...] }

2. 预约移动后端 (packages/server/src/services/movement.ts 新建)：
   - requestMove(characterId, campaignId, toSceneId, executeAtStory)：创建 pending 记录
   - approveMove(moveId, gmUserId)：status → approved
   - rejectMove(moveId, gmUserId, reason)：status → cancelled，通知玩家
   - forceMove(characterId, toSceneId, campaignId, gmUserId)：立即执行，不需审批
   - 所有操作通过 Socket.IO 通知相关玩家

3. 前端时间显示（轻量 UI）：
   - Room 顶栏显示当前全局故事时间（实时更新）
   - 收到 time_advanced 事件时更新 campaign store
   - 如果有自己角色的移动被执行，弹出提示 "你已到达 [场景名]"

4. API 端点：
   - POST /api/campaigns/:id/time/advance { delta } (GM only)
   - POST /api/campaigns/:id/moves/request { character_id, to_scene_id, execute_at_story }
   - POST /api/campaigns/:id/moves/:moveId/approve (GM only)
   - POST /api/campaigns/:id/moves/:moveId/reject { reason } (GM only)
   - POST /api/campaigns/:id/moves/force { character_id, to_scene_id } (GM only)
   - GET /api/campaigns/:id/moves?status=pending (GM only)

验收清单：
- [ ] POST /time/advance 正确推进时间并处理进位
- [ ] 时间推进触发到期的预约移动自动执行
- [ ] requestMove 创建 pending 记录
- [ ] approveMove/rejectMove 状态变更正确
- [ ] forceMove 立即执行，position_history 有记录
- [ ] 前端顶栏时间实时更新
- [ ] Socket.IO time_advanced 事件携带 executed_moves 数组
```

---

## 批次 3b/10：GM 控制台 UI [P0]

```
请实现 GM 控制台的完整 UI 面板。后端 API 已在批次 3a 中完成。

前置依赖：批次 3a（时间系统与移动后端）已完成

需要完成：

1. GM 控制台面板重构 (packages/client/src/views/room/GMConsole.vue)：
   折叠式面板，包含以下子面板：

   A. 时间控制面板：
      - 显示当前全局故事时间 "第X天 HH:MM"
      - 快捷按钮：+10分 / +30分 / +1时 / +6时 / +1天
      - 自定义推进：输入框（天/时/分）+ 确认按钮
      - 推进时广播 system 消息 "故事时间推进到 第X天 HH:MM"
      - 推进时检查 scheduled_moves 中 execute_at_story <= new_time 的待执行移动

   B. 预约移动审批面板：
      - 列出所有 status='pending' 的 scheduled_moves
      - 每条显示：角色名 → 目标场景名、预约执行时间
      - 操作按钮：批准 / 拒绝（拒绝需填写原因）
      - 批准后 status 改为 'approved'，时间到达时自动执行

   C. 场景管理面板：
      - 快捷创建新场景（输入名称 + 选择类型）
      - 现有场景列表（可编辑名称、类型、历史可见性）
      - 删除场景（需确认，仅无角色在场时可删）

   D. NPC 控制面板：
      - 列出当前团中 GM 创建的 NPC 角色
      - 选择 NPC 后可在当前场景以该 NPC 身份发言
      - NPC 发言消息 sender_character_id 设为 NPC 的 character_id
      - 快捷创建 NPC（名称 + 简述，不需完整角色卡）

   E. 线索分发面板：
      - 列出模组中定义的线索 + 已创建的临时线索
      - 选择线索 → 选择目标角色 → 发放
      - 发放后在对应角色所在场景发送 clue_card 消息
      - 更新 campaign_clues.visible_to 数组

   F. 广播面板：
      - 文本输入框 + 发送按钮
      - 发送 announcement 类型消息，visible_to = ['*']

验收清单：
- [ ] GM 点击 +1时 → 全局时间推进，所有客户端同步更新
- [ ] 玩家请求移动 → GM 审批面板显示 → 批准/拒绝
- [ ] GM 强制移动角色到指定场景
- [ ] NPC 发言显示 NPC 名称和头像
- [ ] 线索分发后目标角色场景出现线索卡消息
- [ ] 广播消息全团可见
- [ ] 各面板折叠/展开正常，不相互干扰
```

---

## 批次 4/10：规则引擎原子扩展与 L3 画布 [P1]

```
请扩展规则引擎原子库并实现 L3 可视化画布编辑器。

当前状态：
- 8 个 P0 原子已实现并注册在 atom-registry.ts
- graph-executor.ts 支持拓扑排序执行
- RulesetEditor.vue 存在但画布部分未完成
- Vue Flow (@vue-flow/core) 已在 client package.json 中

需要完成：

### Part A: 原子扩展

在 packages/server/src/engine/atoms/ 下新增以下原子：

P1 原子（8个）：
1. ResourceModifyBatchAtom：批量修改多个资源 (如 HP-=damage, SAN-=loss)
   - inputs: modifications: Array<{resource_name, operation: 'add'|'sub'|'set', value}>
   - outputs: results: Array<{resource_name, old_value, new_value, clamped}>

2. TableLookupAtom：查表（如伤害奖励表、追击表）
   - inputs: table_data (二维数组), lookup_key (number|string), mode: 'exact'|'range'|'closest'
   - outputs: result_row

3. RandomTableAtom：随机表（如疯狂症状表、随机遭遇表）
   - inputs: table_entries: Array<{weight, value}>, roll_expression (可选，默认 d100)
   - outputs: selected_entry, roll_result

4. EffectApplyAtom：施加临时效果
   - inputs: target_character_id, effect_name, duration_type ('rounds'|'story_time'|'permanent'), duration_value, modifiers: Array<{attribute, operation, value}>
   - outputs: effect_id, applied_success

5. EffectRemoveAtom：移除临时效果
   - inputs: target_character_id, effect_id | effect_name
   - outputs: removed_success

6. LoopAtom：循环执行子图 N 次
   - inputs: iterations (number), sub_graph_id
   - outputs: iteration_results: Array

7. AggregateAtom：聚合多个输入值 (sum/min/max/avg/count/concat)
   - inputs: values: Array<number|string>, operation
   - outputs: result

8. ConditionalBranchAtom：多分支条件 (switch-case 风格)
   - inputs: value, branches: Array<{condition, target_output_port}>
   - outputs: 动态输出端口 (branch_0, branch_1, ..., default)

注册所有新原子到 atom-registry.ts。

### Part B: L3 画布编辑器

重构 packages/client/src/views/creator/RulesetEditor.vue：

1. 画布基础设施 (基于 Vue Flow)：
   - 无限画布 + 缩放/平移
   - 网格背景（可关闭）
   - 小地图 (MiniMap 插件)

2. 原子节点渲染：
   - 每个原子类型一个自定义 Vue Flow 节点组件
   - 节点显示：图标 + 原子名称 + 输入端口（左侧）+ 输出端口（右侧）
   - 端口类型用颜色区分：number(蓝) / string(绿) / boolean(橙) / any(灰)
   - 选中节点时右侧属性面板显示该原子的配置项

3. 原子库面板（左侧）：
   - 按分类折叠：骰子/比较/运算/流控/角色/资源/效果/表
   - 拖拽原子到画布添加节点
   - 搜索过滤

4. 连线交互：
   - 从输出端口拖拽到输入端口创建连线
   - 类型检查：端口类型不兼容时连线显示红色警告
   - 右键连线可删除

5. 属性面板（右侧）：
   - 选中节点时显示：原子类型、实例名称（可编辑）、各输入端口的值配置
   - 输入端口值来源：static (直接填写) / connection (来自其他节点输出)
   - static 值根据类型渲染不同输入控件 (number input / text input / dropdown / checkbox)

6. 序列化与执行格式对接：
   画布 JSON 与 graph-executor.ts 的输入格式关系：

   graph-executor.ts 现有的执行输入格式为：
   - atoms: Record<string, { type: string, config: Record<string, any> }>
   - connections: Array<{ from: { atom_id: string, port: string }, to: { atom_id: string, port: string } }>

   画布序列化格式在此基础上扩展 position 字段（仅用于 UI 布局，执行时忽略）：
   - atoms: Record<string, { type: string, position: { x: number, y: number }, config: Record<string, any>, inputs: Record<string, { source: 'static' | 'connection', value?: any }> }>
   - connections: 与执行格式完全相同

   因此不需要额外的转换层。graph-executor 读取 atoms 时只取 type + config，忽略 position 和 inputs.source 等 UI 字段。
   保存到 DB 的 rulesets.atoms 和 rulesets.connections 使用画布格式（超集），执行时 graph-executor 自然兼容。

   确保 graph-executor.ts 中读取 atom 配置的代码做了字段白名单或忽略未知字段（不会因为多了 position 字段报错）。

   序列化具体步骤：
   - 保存时将 Vue Flow 的 nodes + edges 转换为上述 atoms + connections JSON
   - 加载时反向转换
   - atoms JSON 格式: { [atomInstanceId]: { type, position: {x,y}, config: {...}, inputs: {...} } }
   - connections JSON 格式: Array<{ from: {atom_id, port}, to: {atom_id, port} }>

7. 工具栏：
   - 保存 / 撤销 / 重做
   - 自动布局（dagre 算法）
   - 验证图（拓扑排序 + 类型检查 + 无孤立节点）
   - 测试执行（弹出 mock context 面板 → 调用 POST /rulesets/:id/execute）

验收清单：
- [ ] 8 个新原子通过单元测试
- [ ] 画布可拖拽添加原子节点
- [ ] 连线时端口类型不兼容有视觉警告
- [ ] 属性面板可配置节点参数
- [ ] 保存后重新加载画布布局不丢失
- [ ] 工具栏验证按钮能检测出环形依赖并提示
- [ ] 测试执行面板可输入 mock 值并看到执行结果
```

---

## 批次 5a/10：角色卡创建向导 [P0]

```
请实现角色卡多步骤创建向导。本批只做角色卡模板的创建流程（character_sheets 表），不涉及团内实例化和跨团同步（留给 5b）。

当前状态：
- character_sheets 表存在，CRUD 基本可用
- CharacterEditor.vue 是简单的表单
- 规则集中有 character_card_schema 字段（定义属性/技能/派生值/职业模板）

需要完成：

1. 角色卡创建向导 (CharacterEditor.vue 重构为多步骤)：

   Step 1 - 选择规则集：
   - 如果从团内创建，自动锁定该团的规则集
   - 如果独立创建，从已发布规则集中选择
   - 加载 character_card_schema

   Step 2 - 基本信息：
   - 姓名、性别、年龄（如果 schema 要求）
   - 背景描述（文本域）
   - 头像上传或选择默认

   Step 3 - 选择职业（如果规则集定义了 occupations）：
   - 列出规则集中的职业列表
   - 选中后自动填充该职业的 base_skills 和 credit_rating_range
   - 显示职业描述和特殊能力

   Step 4 - 分配属性：
   - 根据 schema.attributes 渲染属性列表
   - 如果有随机生成规则（如 COC 的 3d6*5），提供「随机生成」按钮
   - 手动微调（在规则允许范围内）
   - 实时计算派生值 (derived_max)：HP = (CON + SIZ) / 10, MP = POW / 5, SAN = POW 等

   Step 5 - 分配技能点：
   - 职业技能点 = schema 中定义的公式（如 EDU*4）
   - 兴趣技能点 = INT*2
   - 拖拽或点击分配到各技能
   - 实时显示剩余点数
   - 技能上限检查（如 COC7 职业技能不超过初始值+该轮可分配上限）

   Step 6 - 确认 & 保存：
   - 角色卡预览（只读卡片样式）
   - 生成 8 位 character_code
   - 保存到 character_sheets 表

2. 派生值计算工具 (packages/shared/src/utils/derived-calc.ts 新建)：
   - 输入：attributes Record + schema.derived_formulas
   - 输出：derived_max Record
   - 使用 mathjs（服务端已安装）或纯 JS 实现公式求值
   - 前端和后端共用（放在 shared 包中）

验收清单：
- [ ] 角色卡创建向导 6 步完整走通
- [ ] 随机生成属性后派生值自动计算
- [ ] 技能点分配有剩余点数实时显示和上限检查
- [ ] 选择职业后自动填充职业技能
- [ ] 保存后 character_code 为 8 位唯一编码
- [ ] 编辑已有角色卡时正确回填所有步骤数据
```

---

## 批次 5b/10：角色卡实例化与跨团同步 [P0]

```
请实现角色卡的团内实例化、团内编辑和跨团技能同步。

前置依赖：批次 5a（角色卡创建向导）已完成

当前状态：
- character_scene_states 表存在但未使用
- 角色卡创建向导已完成（批次 5a）

需要完成：

1. 角色卡实例化（加入战团时）：
   - POST /api/campaigns/:campaignId/characters/:characterId/join 时：
     a. 从 character_sheets 复制一份快照到 character_scene_states
     b. 初始化 current_hp = derived_max.hp, current_mp = derived_max.mp 等
     c. 初始化 personal_story_time = campaign.global_story_time（当前值）
     d. 默认进入团的第一个 spatial 场景
     e. 插入 scene_participations 记录
     f. 插入 position_history 记录 (move_type='join')

2. 团内角色卡编辑：
   - 在 Room 中点击角色卡弹出编辑 modal
   - 显示提示："修改仅影响本团内的角色实例"
   - 可修改：当前 HP/MP/SAN（GM 或自己）、临时效果、装备
   - 不可修改：基础属性（除非 GM 特批）
   - 修改后广播 character_state_sync 事件

3. 派生值联动：
   - 修改基础属性时自动重算派生值（调用 5a 中实现的 derived-calc.ts）
   - 如果新的 derived_max < 当前值，自动截断并发送 system 消息提示

4. 技能成长记录：
   - /en 指令成功时在 character_sheets（模板）上也标记该技能待成长
   - /ti 幕间成长时批量处理所有标记技能
   - 跨团同步提示：如果模板技能值与团内实例差异 ≥ 5 点，进入团时弹出同步确认

5. API 补充：
   - GET /api/characters/:id/instance?campaign_id=xxx（获取团内实例数据）
   - PUT /api/characters/:id/instance/:campaignId（更新团内实例）
   - POST /api/characters/:id/grow { skill_name, new_value }（技能成长同步到模板）

验收清单：
- [ ] 加入团时创建角色实例，默认进入第一个场景
- [ ] 团内编辑角色卡广播同步到其他客户端
- [ ] 派生值截断时聊天区出现 system 消息
- [ ] /en 成功后技能值变更同步到模板
- [ ] 跨团技能差异 ≥ 5 点时弹出同步确认对话框
- [ ] 拒绝同步后不再重复提示（本次会话内）
```

---

## 批次 6/10：场景连接与轨迹矩阵 [P1]

```
请实现场景连接配置和轨迹矩阵功能。

当前状态：
- scene_connections 表存在 (from_scene_id, to_scene_id, walk/bike/drive_duration, is_bidirectional)
- position_history 表存在 (character_id, scene_id, story_time_entered/left, move_type)
- TrajectoryMatrix.vue 存在但为空组件
- SceneRoadmap.vue 存在但为空组件

需要完成：

### Part A: 场景连接

1. 场景连接管理 API (已有部分路由，需补全 service)：
   - POST /api/campaigns/:id/connections { from_scene_id, to_scene_id, walk_duration, bike_duration, drive_duration, is_bidirectional }
   - PUT /api/campaigns/:id/connections/:connId
   - DELETE /api/campaigns/:id/connections/:connId
   - GET /api/campaigns/:id/connections（返回所有连接 + 场景名称）

2. 场景路线图 (SceneRoadmap.vue)：
   - 纯文字 + 线条的可视化（不用复杂图形库）
   - 场景节点：圆角矩形，显示场景名 + 当前在场人数
   - 连接线：显示交通时长标注（如 "步行30分"）
   - 双向连接用双箭头，单向用单箭头
   - 当前角色所在场景高亮
   - GM 可右键连接线编辑时长
   - 布局：简单的力导向或层级布局（用 CSS flexbox + 固定位置即可）

3. 移动时交通时长计算：
   - 玩家请求移动时，根据场景连接的 walk_duration 自动计算到达时间
   - execute_at_story = current_personal_story_time + travel_duration
   - 如果无直连路径，提示"没有到达该场景的已知路线"

### Part B: 轨迹矩阵

4. 轨迹矩阵后端 API：
   - GET /api/campaigns/:id/trajectory-matrix
   - 返回数据结构：
     {
       time_axis: Array<{ day, hour }>（按小时粒度）,
       characters: Array<{ id, name }>,
       matrix: { [characterId]: Array<{ scene_id, scene_name, from_time, to_time, move_type }> }
     }
   - 从 position_history 聚合

5. 轨迹矩阵 UI (TrajectoryMatrix.vue)：
   - 桌面端：表格布局
     - Y 轴：角色名列表
     - X 轴：时间轴（小时粒度，可滚动）
     - 单元格：显示场景名缩写 + 背景色（每个场景固定色）
     - 移动中的单元格：斜条纹背景 + 交通方式图标
     - 点击单元格：显示详情弹窗（完整场景名、进入/离开时间、移动方式）

   - 移动端：时间轴视图
     - 每个角色一列纵向时间线
     - 场景块为不同颜色的色带
     - 可左右滑动切换角色

   - GM 特权操作：
     - 右键矩阵单元格 → 强制移动该角色到指定场景
     - 右键空白时间段 → 查看该时间点所有角色位置快照

6. 位置历史记录补全：
   - 角色进入场景时自动记录 position_history (story_time_entered)
   - 角色离开场景时更新 story_time_left
   - 移动方式记录 (move_type: join/leave/scheduled/force_move)

验收清单：
- [ ] 场景路线图显示所有场景和连接关系
- [ ] 连接线标注交通时长
- [ ] 移动请求自动计算到达时间
- [ ] 轨迹矩阵正确渲染角色在各时间段的位置
- [ ] 移动中状态有斜条纹视觉区分
- [ ] 移动端时间轴视图可滑动
- [ ] GM 可从矩阵强制移动角色
```

---

## 批次 7/10：线索卡系统与文字艺术 [P1]

```
请实现完整的线索卡系统和文字艺术主题渲染。

当前状态：
- campaign_clues 表存在 (title, content, theme enum, visible_to)
- ClueCard.vue 组件存在但渲染简单
- 附录 G 定义了 8 种文字艺术主题的完整 CSS 规范

需要完成：

1. 线索卡完整 CRUD API：
   - POST /api/campaigns/:id/clues { title, content, theme, visible_to }
   - PUT /api/campaigns/:id/clues/:clueId
   - DELETE /api/campaigns/:id/clues/:clueId
   - GET /api/campaigns/:id/clues（GM 看全部，玩家只看 visible_to 包含自己的）
   - POST /api/campaigns/:id/clues/:clueId/reveal { character_ids }（追加 visible_to）

2. 8 种文字艺术主题 CSS 实现 (参考附录 G)：
   创建 packages/client/src/styles/clue-themes.css，实现以下主题：

   - river（河流流淌）：
     触发：自动（isRevealing=true 时播放一次）
     实现：每个字符用 span 包裹，opacity 从 0→1，translateX 从 20px→0
     animation: river-char 0.4s ease-out forwards; 每字符 animation-delay 递增 0.05s
     总时长 ≈ 0.4s + 字数*0.05s，不循环

   - blur（虚焦之眼）：
     触发：hover 或 click（移动端 tap）
     实现：整段文字 filter: blur(8px)，hover 时 transition: filter 0.6s ease → blur(0)
     静态态保持模糊，激活后清晰；不循环

   - fragment（碎片化）：
     触发：自动（播放一次）
     实现：每个字符 span，初始 translate(random(-30,30)px, random(-30,30)px) + opacity:0 + rotate(random(-15,15)deg)
     animation: fragment-assemble 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards; delay 递增 0.03s
     用 CSS custom properties --dx/--dy/--dr 在 JS 中随机赋值（mounted 时计算一次）

   - wave（浪潮涌动）：
     触发：自动持续循环
     实现：每字符 span，animation: wave-bob 2s ease-in-out infinite; delay 递增 0.08s
     @keyframes wave-bob { 0%,100% { translateY(0) } 50% { translateY(-6px) } }

   - ancient（古籍残卷）：
     触发：无动画，纯静态主题
     实现：容器 writing-mode: vertical-rl; background: #f5e6c8; font-family: 'Noto Serif SC', serif
     border: 1px solid #c4a87a; padding: 24px; 四角用 CSS border-image 做毛边效果
     字体 fallback: 'Noto Serif SC' 从 Google Fonts 加载（<link> 动态注入或 @import）

   - blood（血字告白）：
     触发：自动（播放一次）
     实现：容器 background: #1a0000; 文字 color: #8b0000
     每字符 span，用 CSS mask-image: linear-gradient(to bottom, black var(--reveal), transparent var(--reveal))
     animation: blood-drip 1.5s ease-in forwards; delay 递增 0.06s
     @keyframes blood-drip { from { --reveal: 0% } to { --reveal: 100% } }
     需要 @property --reveal 注册为 <percentage> 以支持动画插值

   - ash（烬余残篇）：
     触发：自动（播放一次）
     实现：整段文字 opacity:1，动画结束后部分字符保持 opacity:0.3
     随机选取 20-30% 字符作为"烧毁"字符（mounted 时随机标记）
     烧毁字符：animation: ash-burn 1.2s ease-in forwards (opacity 1→0.3, filter blur(0)→blur(1px))
     容器 background: #2a2218; border 用 clip-path: polygon() 做不规则边缘（固定5-7个顶点，略微偏移）

   - cyber（赛博解码）：
     触发：自动（播放一次，完成后静态显示）
     实现：容器 background: #0a0a0a; color: #00ff41; font-family: 'JetBrains Mono', monospace
     打字机效果：每字符依次显示，animation: cyber-type 0.03s step-end forwards; delay 递增 0.03s
     显示过程中每字符先闪烁 2-3 个随机字符再定格（用 JS setInterval 在 span.textContent 上轮换，40ms/帧，120ms 后停止）
     完成后整段文字有微弱的 0.5s 周期 opacity 闪烁（animation: cyber-flicker 3s ease-in-out infinite, opacity 在 0.85-1.0 之间）

3. ClueCard.vue 组件增强：
   - Props: { title, content, theme, isRevealing (是否播放揭示动画) }
   - 根据 theme 应用对应 CSS class
   - 首次揭示时播放主题入场动画（isRevealing=true）
   - 之后查看为静态展示（isRevealing=false）
   - 卡片尺寸：宽度 100%（最大 400px），高度自适应
   - 底部显示发放时间

4. 线索笔记本（玩家侧）：
   - AssistantDesk.vue 中新增「线索」tab
   - 列出已获得的所有线索卡（按获取时间倒序）
   - 点击展开查看详情
   - 搜索/过滤功能

5. GM 线索管理面板（GMConsole.vue 线索分发面板增强）：
   - 模组预设线索列表（如果绑定了模组，从模组 content 中提取 Clue 类型块）
   - 临时创建线索（标题 + 内容 + 选择主题）
   - 主题预览（创建/编辑时实时预览文字艺术效果）
   - 分发操作：选择线索 → 选择目标角色 → 确认
   - 分发后：
     a. 更新 visible_to
     b. 在目标角色所在场景发送 clue_card 消息
     c. 消息 content 存储 clue_id 引用
     d. 客户端收到后渲染 ClueCard 组件（isRevealing=true）

6. 聊天区线索卡渲染：
   - ChatArea.vue 中 message_type === 'clue_card' 时渲染 ClueCard 组件
   - 从 message.metadata.clue_id 获取线索数据
   - 首次出现播放揭示动画

验收清单：
- [ ] 8 种主题 CSS 动画效果正常（逐一截图验证）
- [ ] GM 创建线索时可预览主题效果
- [ ] 线索分发后目标角色聊天区出现带动画的线索卡
- [ ] 玩家线索笔记本可查看所有已获线索
- [ ] 非目标角色看不到该线索卡消息
- [ ] 重新进入房间后线索卡以静态模式显示（不重播动画）
```

---

## 批次 8/10：日志导出系统 [P1]

```
请完善跑团日志导出功能，实现三种视角和多种格式。

当前状态：
- GET /api/logs/:campaignId/export 基础路由存在
- ILF (Intermediate Log Format) 转换工具在 shared 包中
- pdf-lib 已安装
- 日志导出页面 LogExport.vue 存在

需要完成：

1. 三种导出视角 (packages/server/src/services/log-export.ts)：

   A. "我的故事"（个人剧本）：
      - 仅包含 visible_to 包含当前用户的消息
      - 按角色的 personal_story_time 排序
      - 不包含 GM 隐藏消息和其他私密场消息
      - 标题："[角色名] 的故事 - [团名]"

   B. "完整剧本"（GM 视角）：
      - 包含所有消息（包括 GM 隐藏的）
      - 按 global_story_time 排序
      - 仅 GM 可导出
      - 标题："[团名] 完整剧本"

   C. "场景剧本"（按场景分章）：
      - 按场景分组，每个场景一章
      - 章内按时间排序
      - 可选择包含哪些场景
      - 标题："[团名] - [场景名]"

2. 排序策略 (ILF 层面处理)：
   - strict：严格按消息创建时间排序（Snowflake ID 自然序）
   - scene_first：先按场景分组，组内按时间排序
   - main_interleave：主线场景优先，支线场景在时间间隙中插入

3. 导出格式：

   A. PDF 导出（基础版）：
      - 使用 pdf-lib 生成
      - 中文字体处理步骤：
        a. 安装依赖：pnpm add -F @trpg/server @pdf-lib/fontkit（已安装则跳过）
        b. 下载字体：从 https://github.com/google/fonts/raw/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf 下载可变字体文件
           保存到 packages/server/assets/fonts/NotoSansSC.ttf（约 9MB，git 中用 .gitattributes 标记为 LFS 或加入 .gitignore 由部署脚本下载）
        c. 运行时子集化（可选优化）：如果 PDF 体积敏感，用 fontkit 的 subset() 方法在生成时只嵌入用到的字符
           不做子集化也可以，完整嵌入约增加每份 PDF 9MB，对服务端生成可接受
        d. 加载代码：
           ```ts
           import { PDFDocument } from 'pdf-lib';
           import fontkit from '@pdf-lib/fontkit';
           import fs from 'fs';
           const fontBytes = fs.readFileSync('assets/fonts/NotoSansSC.ttf');
           const pdfDoc = await PDFDocument.create();
           pdfDoc.registerFontkit(fontkit);
           const customFont = await pdfDoc.embedFont(fontBytes, { subset: true });
           ```
        e. 字体 fallback：标题用 NotoSansSC weight 700，正文用 weight 400（可变字体通过 embedFont 的 features 参数控制）
      - 布局：标题页 → 目录 → 正文
      - 正文格式：[时间] [角色名] 消息内容
      - 骰子消息特殊格式：[🎲 角色名 掷骰 skill_name: d100=XX (成功/失败)]
      - OOC 消息灰色字体
      - system 消息居中显示

   B. Markdown 导出：
      - .md 文件
      - 场景作为 ## 二级标题
      - 角色发言 **角色名**：内容
      - 骰子用代码块显示

   C. 纯文本导出：
      - .txt 文件
      - 简洁格式

   D. ILF 导出（给其他工具用）：
      - 已有基础，确保完整性

4. 导出页面 UI (LogExport.vue 重构)：

   - Step 1：选择视角（我的故事 / 完整剧本 / 场景剧本）
   - Step 2：选项配置
     - 排序策略（strict / scene_first / main_interleave）
     - 包含 OOC 消息（开关）
     - 包含 system 消息（开关）
     - 包含骰子详情（开关）
     - 如果场景剧本：场景多选列表
   - Step 3：预览（在线预览前 50 条消息的排版效果）
   - Step 4：选择格式 (PDF / Markdown / 纯文本 / ILF) → 下载

5. API：
   - GET /api/logs/:campaignId/export?perspective=my|full|scene&sort=strict|scene_first|main_interleave&format=pdf|md|txt|ilf&scenes=id1,id2&include_ooc=true&include_system=true
   - 返回文件流（Content-Disposition: attachment）

验收清单：
- [ ] "我的故事"只包含自己可见的消息
- [ ] "完整剧本"包含 GM 隐藏消息
- [ ] PDF 中文显示正常
- [ ] Markdown 格式可被标准编辑器正确渲染
- [ ] 排序策略切换后预览显示不同排列
- [ ] OOC 开关关闭后导出文件中无 OOC 消息
```

---

## 批次 9/10：社区与招募板完善 [P1]

```
请完善社区论坛和招募板功能。

当前状态：
- 论坛 CRUD 基本可用 (forum_threads / forum_posts)
- 招募板 CRUD 基本可用 (recruitment_posts / recruitment_applications)
- Community.vue / RecruitSection.vue 存在但功能不完整

需要完成：

1. 招募板增强：

   A. 筛选与搜索：
      - 按规则集筛选（下拉选择）
      - 按类型筛选（找团玩 gm_recruit / 当KP player_seek）
      - 按标签筛选
      - 关键词搜索（标题 + 描述）
      - 按时间/热度排序

   B. 规则集动态字段：
      - 招募帖创建时，如果选择了规则集，渲染该规则集的 recruitment_fields
      - COC 示例字段：信用评级范围 (credit_rating)、年龄/学历要求 (age_education)、是否允许混合 (allow_mixed)
      - DND 示例字段：等级范围 (level_range)、阵营限制 (alignment_restrictions)
      - 这些字段存储在 recruitment_posts.metadata JSON 中

   C. 申请流程完善：
      - 申请时可选择已有角色卡（从 my character_sheets 中选，需匹配规则集）
      - 申请消息（自我介绍文本域）
      - 发布者查看申请列表：头像 + 昵称 + 角色卡摘要 + 申请消息
      - 批准后自动创建 campaign membership（如果关联了 campaign_id）
      - 批准后发送通知给申请者
      - 拒绝后发送通知（可附理由）

   D. "我的"招募管理：
      - 我发布的帖子列表（可编辑/关闭/删除）
      - 我的申请列表（状态：pending/approved/rejected）
      - 未读申请数量角标

2. 论坛增强：

   A. 板块完善：
      - rules（规则讨论）、creation（创作交流）、experience（经验分享）、newbie（新手入门）、lounge（休息室）
      - 每个板块有描述和图标
      - 板块列表页显示最新帖子数和活跃度

   B. 帖子功能增强：
      - 富文本编辑（简单的 markdown 支持即可，用 Element Plus 的 markdown 渲染）
      - 楼层号显示 (#1, #2, ...)
      - 引用回复（引用某楼层内容）
      - 点赞功能 (like_count + user_likes 表)
      - 置顶帖 (is_pinned boolean, 板块前置显示)

   C. 搜索：
      - 全文搜索帖子标题 + 内容
      - 按板块、时间范围过滤

3. 通知集成：
   - 招募申请提交 → 通知发布者
   - 招募审批结果 → 通知申请者
   - 帖子被回复 → 通知作者
   - 回复被引用 → 通知被引用者

4. 前端 UI 补全：

   A. RecruitSection.vue：
      - 三个 tab：找团玩 / 当KP / 我的
      - 帖子卡片：标题 + 规则集标签 + 当前/最大人数 + 标签列表 + 发帖时间
      - 点击进入详情页
      - 详情页：完整描述 + 动态字段 + 申请按钮
      - 申请 modal：选择角色卡 + 填写消息

   B. Community.vue：
      - 板块切换（tab 或左侧菜单）
      - 帖子列表（卡片样式：标题 + 摘要 + 作者 + 回复数 + 最后活跃时间）
      - 发帖按钮 → 编辑器 modal
      - 帖子详情页：主帖 + 按楼层的回复列表 + 回复输入框

验收清单：
- [ ] 招募帖筛选（规则集 + 类型 + 标签）正常工作
- [ ] COC 规则集的招募帖显示信用评级等额外字段
- [ ] 申请时可选择角色卡
- [ ] 批准申请后申请者收到通知
- [ ] 论坛帖子可引用回复
- [ ] 帖子被回复后作者收到通知
```

---

## 批次 10/10：移动端适配与 PWA [P1]

```
请完成移动端响应式适配和 PWA 离线能力。

当前状态：
- 附录 J 定义了完整的移动端适配方案
- BottomNav.vue 已有底部导航组件
- main.ts 中有 service worker 注册代码
- vite.config.ts 中有 PWA 相关配置基础

需要完成：

1. 响应式断点系统 (packages/client/src/styles/responsive.css)：
   - mobile: < 640px
   - tablet: 640px - 1024px
   - desktop: > 1024px
   - 使用 CSS custom properties + media queries

2. Room 页面移动端适配（最核心）：

   A. 布局切换：
      - 桌面：三栏（左侧栏 + 聊天区 + 助理台）
      - 移动：单栏 + 底部 tab 切换
        - Tab 1：聊天区（全屏宽度）
        - Tab 2：场景列表（替代左侧栏）
        - Tab 3：角色卡/助理台
        - Tab 4：GM 控制台（仅 GM 可见）

   B. 聊天输入优化：
      - 移动端输入框固定在底部
      - 虚拟键盘弹出时自动上推
      - 指令补全面板从底部滑出

   C. GM 控制台移动端：
      - 全屏抽屉（从底部滑出）
      - 功能项列表式排列
      - 时间控制用底部 sheet

3. 各页面适配：

   A. Home.vue：
      - 卡片单列排列
      - 快捷入口 2x2 网格

   B. AssetLibrary.vue：
      - Tab 切换（发现/我的规则/我的模组）
      - 卡片列表单列

   C. CharacterEditor.vue：
      - 向导步骤底部导航
      - 技能分配改为列表 + 点击调整（替代桌面的拖拽）

   D. Community.vue / RecruitSection.vue：
      - 帖子卡片单列
      - 板块切换用顶部 scrollable tab

   E. Personal.vue：
      - 移动端标准设置页样式（头像 + 菜单列表）

4. 底部导航 (BottomNav.vue 完善)：
   - 5 个 tab：首页 / 资产库 / 我的团 / 社区 / 我的
   - 当前 tab 高亮
   - 未读消息角标（团消息数 + 通知数）
   - 仅移动端显示（桌面端隐藏，用顶部导航）

5. 手势支持：
   - 聊天区下拉加载历史消息
   - 左右滑动切换场景（Room 移动端）
   - 长按消息显示操作菜单（复制/引用/举报）

6. PWA 配置：
   - manifest.json：name, short_name, icons, theme_color, background_color, display: standalone
   - Service Worker 策略：
     - 静态资源：Cache First
     - API 请求：Network First (回退到缓存)
     - Socket.IO：不缓存
   - 离线提示：检测到离线时顶部显示 banner "当前离线，部分功能不可用"
   - 安装提示：首次访问移动端时弹出 "添加到主屏幕" 引导

7. 性能优化：
   - 路由级代码分割（已有 lazy loading，确认所有路由都是 () => import()）
   - 图片懒加载
   - 聊天消息虚拟滚动（超过 200 条时仅渲染可视区域）：
     使用 @vueuse/core 的 useVirtualList 或安装 vue-virtual-scroller（pnpm add -F @trpg/client vue-virtual-scroller@2）
     选型理由：vue-virtual-scroller 对不定高度项（聊天气泡）支持好，提供 DynamicScroller + DynamicScrollerItem 组件
     不使用 Element Plus 的虚拟列表（el-table-v2 仅适用于表格场景）
     不使用 @tanstack/virtual（React 生态优先，Vue 适配器维护频率低）
     实现要点：
       - ChatArea.vue 中用 <DynamicScroller :items="messages" :min-item-size="48"> 包裹消息列表
       - 每条消息组件需通过 <DynamicScrollerItem> 包裹以支持动态高度测量
       - 滚动到底部检测 + 新消息自动滚动（仅当用户在底部时）
       - 向上滚动到顶部时触发历史消息加载（分页拉取）
   - 骨架屏 (TSkeleton) 在数据加载时显示

验收清单：
- [ ] 移动端 Room 页面四个 tab 切换流畅
- [ ] 虚拟键盘弹出时聊天输入框不被遮挡
- [ ] 底部导航角标显示未读数
- [ ] PWA 安装到手机主屏幕后可打开
- [ ] 离线时显示离线 banner
- [ ] 聊天区虚拟滚动在 1000+ 条消息时不卡顿
- [ ] 所有页面在 375px 宽度下无水平溢出
```

---

## 附加批次 A：创作者中心 [P2]

```
请实现创作者仪表盘和资产管理功能。

当前状态：
- CreatorDashboard.vue 存在但大部分子页面是 DevPlaceholder

需要完成：

1. 创作者仪表盘 (CreatorDashboard.vue)：
   - 数据概览卡片：我的规则集数量 / 我的模组数量 / 总下载量 / 平均评分
   - 最近编辑列表（规则集 + 模组混合，按最后编辑时间排序）
   - 快捷入口：新建规则集 / 新建模组 / 进入规则工坊

2. 我的规则集列表 (RulesetWorkshop.vue 增强)：
   - 卡片列表：规则集名称 + 状态标签 + 版本号 + fork 数 + 最后编辑时间
   - 筛选：全部/草稿/已发布/已弃用
   - 操作：编辑 / 发布 / 创建新版本 / Fork / 删除(仅草稿)

3. 我的模组列表：
   - 卡片列表：模组名称 + 封面缩略图 + 状态标签 + 字数 + 下载量
   - 筛选：全部/草稿/审核中/已发布
   - 操作：编辑 / 提交审核 / 下架

4. 规则集版本管理：
   - 版本列表页：版本号 + 创建时间 + 变更日志摘要
   - 创建新版本：自动快照当前 atoms/connections/commands/schema 到 ruleset_versions
   - 变更日志输入（文本域）
   - 回滚到指定版本（复制快照覆盖当前）

5. 规则集 Fork：
   - Fork 时创建新规则集，parent_ruleset_id 指向原始
   - 复制 atoms/connections/commands/schema
   - 原始规则集 fork_count + 1
   - 显示 "Forked from [原始名称]" 标签

验收清单：
- [ ] 仪表盘显示正确的统计数据
- [ ] 规则集版本列表可查看历史
- [ ] 创建新版本后可回滚到旧版本
- [ ] Fork 规则集后独立编辑不影响原始
```

---

## 附加批次 B：网格地图增强 [P2]

```
请增强网格地图功能，实现战斗场景支持。

当前状态：
- grid_maps 表存在 (cols, rows, cell_size, background_image_url, tokens JSON)
- GridMap.vue 组件存在但功能基础

需要完成：

1. 地图渲染 (GridMap.vue 重构为 Canvas 或 SVG)：
   - 网格线渲染（可调间距）
   - 背景图层（支持上传地图图片）
   - Token 渲染：圆形 + 首字 + 颜色，可拖拽移动
   - 坐标标注（列 A-Z，行 1-N）
   - 缩放 + 平移（鼠标滚轮 + 拖拽）

2. Token 管理：
   - GM 可添加/删除 token
   - Token 类型：player_character / npc / object
   - Player 只能移动自己的 token（需 GM 开启自由移动权限或 GM 手动移动）
   - 移动时 Socket.IO 广播 grid_token_moved 事件
   - 移动动画（平滑过渡到新位置）

3. GM 工具：
   - 绘制工具：矩形区域高亮（用于标记区域效果如火焰、毒雾）
   - 标记工具：在格子上放置标记（数字/字母/图标）
   - 测距工具：点击两点显示格子距离
   - 清除所有标记

4. 移动端适配：
   - 双指缩放
   - 单指拖拽移动地图
   - 长按 token 选中 → 拖拽移动
   - 只读预览模式（非 GM 默认）

5. 实时同步：
   - Token 移动实时同步
   - 区域标记实时同步
   - 新加入者加载完整地图状态

验收清单：
- [ ] 网格地图正确渲染网格线和背景图
- [ ] Token 拖拽移动实时同步到其他客户端
- [ ] GM 可绘制区域高亮
- [ ] 测距工具显示正确格数
- [ ] 移动端双指缩放流畅
```

---

## 执行顺序建议

| 顺序 | 批次 | 优先级 | 依赖 |
|------|------|--------|------|
| 1 | 批次 1：指令系统补全 | P0 | 无 |
| 2 | 批次 2：消息可见性与场景 | P0 | 无 |
| 3 | 批次 3a：故事时间系统与移动后端 | P0 | 依赖批次 2 |
| 4 | 批次 3b：GM 控制台 UI | P0 | 依赖批次 3a |
| 5 | 批次 5a：角色卡创建向导 | P0 | 依赖批次 1 |
| 6 | 批次 5b：角色卡实例化与跨团同步 | P0 | 依赖批次 5a, 3a |
| 7 | 批次 4：原子扩展与 L3 画布 | P1 | 依赖批次 1 |
| 8 | 批次 6：场景连接与轨迹矩阵 | P1 | 依赖批次 3a |
| 9 | 批次 7：线索卡与文字艺术 | P1 | 依赖批次 2, 3b |
| 10 | 批次 8：日志导出 | P1 | 依赖批次 2 |
| 11 | 批次 9：社区与招募板 | P1 | 无 |
| 12 | 批次 10：移动端适配与 PWA | P1 | 建议在功能稳定后执行 |
| 13 | 附加 A：创作者中心 | P2 | 依赖批次 4 |
| 14 | 附加 B：网格地图增强 | P2 | 依赖批次 3a |

---

## 全局注意事项

每次投喂批次前请附加以下约束提醒：

```
全局约束：
1. 所有新增文件遵循现有项目结构和命名规范
2. 后端新增 service 必须有对应的路由注册（在 routes/index.ts 中挂载）
3. 数据库变更通过 Knex migration 文件（编号递增）
4. Socket.IO 事件类型定义同步更新到 packages/shared/src/types/socket-events.ts
5. 前端新增页面必须在 router/index.ts 中注册路由
6. 所有 API 端点遵循 RESTful 规范，错误返回 { error: string, code: number }
7. 使用 Zod 验证所有用户输入
8. 新增功能需考虑 GM 权限检查（campaign.gm_user_id === req.user.id）
9. 前端状态管理统一使用 Pinia store
10. CSS 使用项目已定义的 design token（见 附录B 中的 CSS 变量）
11. 不引入 AI 功能（V1 明确排除）
12. 写完代码后列出需要手动验证的测试步骤
```
