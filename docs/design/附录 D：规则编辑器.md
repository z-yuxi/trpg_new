# 附录 D：规则编辑器（原附录 F：规则引擎）

| 文档版本 | 日期         | 说明                                                |
| ---- | ---------- | ------------------------------------------------- |
| V1.6 | 2026-04-25 | 已按 Recipe 配方系统、设计令牌与设计系统完成目录级对齐 |

## 0.1 2026-04-25 对齐声明（新增）

本附录遵循 `docs/文档对齐治理.md` 中定义的统一优先级与冲突处理规则。

历史段落中若出现以下旧语义，统一按新语义解释：

- `YAML 直接定义 atoms + connections + commands` -> `Recipe 源码 + 编译产物`
- `entry_atom` -> `recipe_id`
- 运行时参数直接写入规则定义 -> 通过 `runtime_modifiers` 注入

引擎兼容性原则保持不变：执行器只消费 `{ atoms, connections }`，不感知 Recipe 编辑层。

---

## 1. 设计目标与核心原则

### 1.1 目标
- **通用化**：一套引擎支持 COC、DND、FATE 等多种 TRPG 规则。
- **低门槛**：规则作者通过 Recipe 模板、表单和 DSL 定义规则，无需编写代码。
- **可修改**：支持规则包继承，作者可在现有规则基础上“魔改”。

### 1.2 核心原则

| 编号 | 原则 | 说明 |
|------|------|------|
| P-001 | 零硬编码 | 引擎代码不包含任何规则特定字面量（d100、SAN、HP、COC、DND 等） |
| P-002 | 配置即行为 | 所有规则行为通过规则包中的 Recipe、commands 与相关配置定义 |
| P-003 | 引擎无状态 | 状态存储在角色卡 / 会话中，引擎不持久化状态 |
| P-004 | 规则包继承 | 新规则包可继承已有规则包，只覆盖差异字段 |
| P-005 | 热加载数据 | 规则包修改后无需重启引擎 |

---

## 2. 核心概念

### 2.1 原子节点（Atom）
- **定义**：最小执行单元，是一个**纯函数**（给定输入，返回输出）。
- **特点**：无内部状态，可独立测试，可复用。
- **示例**：`dice_roll`、`threshold_compare`、`character_skill_reader`、`resource_modify`。

### 2.2 规则包（Ruleset）
- **定义**：规则包持有 Recipe 源码与编译产物。运行时只读取 `atoms`（节点实例）、`connections`（连线）等编译结果。
- **存储格式**：
```yaml
meta:
  id: "coc7_skill"
  version: "1.0"
  parent: null

atoms:
  - id: "dice"
    type: "dice_roll"
    config:
      expression: "1d100"

connections:
  - from: "dice.total"
    to: "compare.roll"

commands:
  - trigger: "ra {skill}"
    recipe_id: "coc7_skill_check"
    runtime_modifiers: {}
    input_mapping:
      skill: "{skill}"
```

### 2.3 执行器（Executor）
- **职责**：加载规则包 → 构建节点图 → 拓扑排序 → 顺序执行节点 → 返回结果。
- **接口**：
```typescript
interface ExecuteRequest {
  ruleset_id: string;
  command: string;               // 如 "ra"
  params: Record<string, any>;   // 如 { skill: "侦查" }，为意图解析后的实际参数
  context: {
    character_id: string;
    campaign_id: string;
    scene_id?: string;
  };
}

interface ExecuteResponse {
  success: boolean;
  output: any;                   // 最终节点输出
  logs: NodeExecutionLog[];
}
```

---

## 3. 预置原子节点清单

以下节点由引擎内置，规则作者可直接在 YAML 中引用。

| 节点类型 | 功能 | 输入示例 | 输出示例 |
|---------|------|---------|---------|
| `dice_roll` | 掷骰 | `{ expression: "1d100" }` | `{ total: 23, rolls: [23] }` |
| `threshold_compare` | 阈值比较（支持多级） | `{ roll: 23, target: 50, direction: "lte", tiers: [...] }` | `{ success: true, tier: "regular" }` |
| `character_skill_reader` | 读取角色卡技能值 | `{ skill_ref: "侦查" }` | `{ value: 50 }` |
| `resource_modify` | 修改资源（HP/MP 等） | `{ character_id, resource_id: "hp", delta: -5 }` | `{ new_value: 12, overflow: 0 }` |
| `multiply` | 数值乘法 | `{ input: 50, factor: 2 }` | `{ output: 100 }` |
| `if_else` | 条件分支 | `{ condition: true, true_value: 10, false_value: 20 }` | `{ result: 10 }` |
| `result_collector` | 收集最终输出 | 任意输入 | 透传输入 |

> 更多节点（如 `attribute_reader`、`status_apply`、`formula_eval`）可在后续版本按需增加。

---

## 4. 规则包 Schema 完整示例（COC 7th 技能检定）

```yaml
meta:
  id: "coc7_skill_check"
  version: "1.0"
  display_name: "克苏鲁呼唤 第七版 技能检定"
  parent: null

# 节点实例
atoms:
  - id: "get_skill"
    type: "character_skill_reader"
    config:
      skill_ref: "{skill}"        # 从指令参数获取技能名

  - id: "dice"
    type: "dice_roll"
    config:
      expression: "1d100"

  - id: "apply_difficulty"
    type: "multiply"
    config:
      factor: 1                   # 默认常规难度，可被 GM 动态覆盖

  - id: "compare"
    type: "threshold_compare"
    config:
      direction: "lte"
      tiers:
        - name: "critical"
          condition: "roll == 1"
        - name: "extreme"
          condition: "roll <= target/5"
        - name: "hard"
          condition: "roll <= target/2"
        - name: "regular"
          condition: "roll <= target"
        - name: "fail"
          condition: "true"

  - id: "output"
    type: "result_collector"

# 连线
connections:
  - from: "get_skill.value"
    to: "apply_difficulty.input"
  - from: "apply_difficulty.output"
    to: "compare.target"
  - from: "dice.total"
    to: "compare.roll"
  - from: "compare.result"
    to: "output.check_result"

# 指令映射
commands:
  - trigger: "ra {skill}"
    recipe_id: "coc7_skill_check"
    runtime_modifiers: {}
    input_mapping:
      skill: "{skill}"
      
      
# 角色卡模板配置（新增）
character_card_schema:
  attributes:
    - id: "str"
      name: "力量"
    - id: "dex"
      name: "敏捷"
  field_aliases:
    力量: ["STR", "str", "strength"]
    敏捷: ["DEX", "dex", "dexterity"]
    侦查: ["spot", "侦查", "Spot Hidden"]
    
    
 # 招募帖专属字段配置（发帖时动态渲染）
recruitment_fields:
  - name: "credit_rating_max"
    label: "信誉限制"
    type: "number"
    placeholder: "≤30"
    default: 30
  - name: "age_education"
    label: "年龄/教育限制"
    type: "text"
    placeholder: "例如：16岁高一，教育≤60"
  - name: "allow_mixed"
    label: "是否允许混孤"
    type: "boolean"
    default: false
  - name: "recommended_skills"
    label: "推荐技能"
    type: "select"
    options: ["侦查", "图书馆", "心理学", "潜行", "社交"]
    multiple: true
    
```

---

## 5. 规则包继承与合并

### 5.1 继承声明
子规则包通过 `parent` 字段指定父包：
```yaml
meta:
  id: "coc7_pulp"
  parent: "coc7_skill_check"
```

### 5.2 合并规则
- `atoms` 数组：按 `id` 合并，子包中同 `id` 的节点覆盖父包节点。
- `connections` 数组：子包直接追加到父包后面。
- 其他字段（如 `commands`）：子包完全覆盖父包，若需合并需显式配置。

### 5.3 示例：Pulp COC 规则（仅覆盖难度因子）
```yaml
meta:
  id: "coc7_pulp"
  parent: "coc7_skill_check"

atoms:
  - id: "apply_difficulty"
    type: "multiply"
    config:
      factor: 0.5                 # Pulp 规则下所有检定更容易
```

---

## 6. 角色卡数据结构

```typescript
interface CharacterCard {
  card_id: string;
  ruleset_id: string;
  player_id: string;
  attributes: Record<string, number>;   // 基础属性 { str: 60, dex: 50, ... }
  skills: Record<string, number>;       // 技能值 { 侦查: 50, 图书馆: 40 }
  resources: Record<string, {           // 资源池 { hp: { current: 10, max: 10 } }
    current: number;
    max: number;
  }>;
  statuses: {                           // 当前生效的状态
    status_id: string;
    remaining_rounds?: number;
  }[];
  equipment: string[];
  background?: string;
}
```

> 实际存储使用 JSON 字段，详见数据库设计（第 9 节）。

---

## 7. 执行器 API

### 7.1 检定接口
`POST /api/engine/execute`

**请求体**：
```json
{
  "ruleset_id": "coc7_skill_check",
  "command": "ra",
  "params": { "skill": "侦查" },
  "context": {
    "character_id": "char_123",
    "campaign_id": "camp_456",
    "scene_id": "scene_789"
  }
}
```

**响应体**：
```json
{
  "success": true,
  "output": {
    "check_result": {
      "success": true,
      "tier": "regular",
      "roll": 23,
      "target": 50
    }
  },
  "logs": [
    { "node_id": "get_skill", "input": { "skill_ref": "侦查" }, "output": { "value": 50 } },
    { "node_id": "dice", "input": { "expression": "1d100" }, "output": { "total": 23 } },
    { "node_id": "compare", "input": { "roll": 23, "target": 50 }, "output": { "success": true, "tier": "regular" } }
  ]
}
```

### 7.1.1 上下文自动注入规则

引擎在执行指令时，自动从当前会话中提取以下上下文字段，**规则包作者无需在 YAML 中声明**：

| 上下文字段 | 注入来源 | 何时可用 | 示例值 |
|-----------|---------|---------|--------|
| `character_id` | 当前用户在当前团绑定的角色卡ID | 必须已绑定角色卡 | `"char_123"` |
| `campaign_id` | 当前房间ID | 必须在房间内 | `"camp_456"` |
| `scene_id` | 用户当前所在的场ID（剧情场/私密场/公共场） | 必须在场内 | `"scene_789"` |
| `scene_type` | 当前场的类型（`spatial`/`virtual`/`lobby`） | 必须在场内 | `"spatial"` |
| `scene_modifiers` | 从 `scenes.extras.modifiers` 读取 | 仅当在剧情场时 | `{ "light": "dark", "penalty": -20 }` |
| `global_story_time` | 当前团的全局剧情时间 | 必须在房间内 | `{ "day": 1, "hour": 8, "minute": 30 }` |

**注入时机**：
1. 用户输入指令（如 `ra 侦查`）
2. 前端封装请求时，自动附带 `campaign_id` 和 `scene_id`（从当前 URL 和状态管理获取）
3. 服务端收到请求后，从数据库查询 `character_id`（通过 `user_id` + `campaign_id` 关联），并补充 `scene_modifiers` 等

**规则包中使用**：
atoms:
  - id: "apply_scene_penalty"
    type: "multiply"
    config:
      factor: "{scene_modifiers.penalty}"   # 自动从上下文注入


**私密场/公共场的特殊处理**：

- 若 `scene_type` 为 `virtual` 或 `lobby`，`scene_modifiers` 始终为空对象 `{}`。
    
- 指令仍可执行，但不会应用场景修正。

### 7.2 错误响应
```json
{
  "success": false,
  "error": {
    "code": "CYCLIC_DEPENDENCY",
    "message": "节点图存在循环依赖，无法执行"
  }
}
```

---

## 8. 断线重连与消息补发

（本节直接引用《附录 A03：技术约定》第 10 章，内容保持不变）

核心要点：
- Socket.IO 自动重连（指数退避，最多 5 次）
- 服务端维护每房间消息环形缓冲区（最近 500 条）
- 重连时客户端携带 `last_event_id`，服务端补发断线期间消息
- 角色卡状态以服务端快照为准，重连后强制覆盖本地

---

## 9. 数据库核心表设计

（仅列出与引擎直接相关的表，完整设计见《附录 A03：技术约定》第 12 章）

### 9.1 规则包表（rulesets）
```sql
CREATE TABLE rulesets (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  version VARCHAR(32) NOT NULL,
  parent_ruleset_id VARCHAR(64),
  atoms JSON NOT NULL,
  connections JSON NOT NULL,
  commands JSON,
  character_card_schema JSON,
  status ENUM('draft','published') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 9.2 角色卡表（character_sheets）
```sql
CREATE TABLE character_sheets (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  ruleset_id VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  attributes JSON,
  skills JSON,
  resources JSON,
  statuses JSON,
  equipment JSON,
  background TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 9.3 角色在场状态（character_scene_states）
```sql
CREATE TABLE character_scene_states (
  id VARCHAR(64) PRIMARY KEY,
  character_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(64) NOT NULL,
  current_spatial_scene_id VARCHAR(64),
  personal_story_time JSON,
  temporary_effects JSON,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

> 其他表（campaigns、scenes、chat_messages 等）详见附录 C。

---

## 10. 部署与性能基线

### 10.1 推荐配置
| 配置项 | 推荐值 | 最低要求 |
|--------|--------|----------|
| CPU | 2 核 | 1 核 |
| 内存 | 4 GB | 2 GB |
| 存储 | 20 GB SSD | 10 GB |
| 操作系统 | Ubuntu 22.04 | Linux x86_64 |
| Node.js | v20 LTS | v18+ |
| 数据库 | PostgreSQL 15+ | SQLite 3.40+ |

### 10.2 性能目标
| 指标 | 目标值（p99） |
|------|--------------|
| 单次检定（含骰子+节点执行） | < 20ms |
| 规则包加载（含继承合并） | < 2s |
| 并发会话数 | 100+ |

---

## 11. 废弃概念清单（不再使用）

以下概念来自早期工业级设计，在轻量架构中**不再出现**：

- FC / FB 区分
- 背景数据块（BDB）生命周期
- 组件分级（P0/P1/P2/P3）
- 强类型端口编译时校验
- L2 契约（`l2` 字段）
- 工业控制方法论对应

---
## 规则引擎缺失模块补充设计（必须改进项）

> **基于附录 D01 当前版的扩展**，解决指令系统、派生值、职业解析器、动作调度器、事务处理、热加载等关键缺失。  
> **目标**：使引擎完整支撑当前 v1.5 设计体系中的规则工坊、角色卡系统与回合战术需求。

---

## 一、指令系统完善（三层模型）

### 11.1 引擎指令解析器接口

```typescript
// 规则包中的指令声明（扩展附录 D01 的 commands 字段）
interface RulesetCommands {
  // 平台预置指令中，本规则包支持哪些（如 ["ra", "sc", "init"]）
  supported_commands: string[];
  
  // 覆盖平台预置指令的参数
  command_overrides?: Record<string, CommandOverride>;
  
  // 规则包自定义的全新指令（平台未预置）
  custom_commands?: CustomCommand[];
}
// ========== 招募帖动态表单配置（新增） ==========

// 规则包中定义的招募帖专属字段（用于发帖时动态渲染）
interface RecruitmentField {
  name: string;           // 字段标识，如 "credit_rating"
  label: string;          // 显示标签，如 "信誉限制"
  type: 'number' | 'range' | 'text' | 'boolean' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];     // 当 type='select' 时使用
  min?: number;           // 当 type='range' 时使用
  max?: number;
  default?: any;
}

// 在 RulesetPackage 接口中增加 recruitment_fields
interface RulesetPackage {
  // ... 现有字段（id, name, version, atoms, connections, commands, ...）
  recruitment_fields?: RecruitmentField[];  // 用于招募帖发帖表单的规则专属字段
}

interface CommandOverride {
  component?: string;              // 替换入口组件
  dice_expression?: string;        // 覆盖骰子表达式
  success_direction?: 'lte' | 'gte';
  difficulty_divisors?: number[];
  input_mapping?: Record<string, string>;
  description?: string;
  [key: string]: any;
}

interface CustomCommand {
  trigger: string;                 // 支持精确字符串、模板（如 "flip {coin}"）、正则
  description: string;
  component: string;               // 入口原子 ID
  dice_expression?: string;
  input_mapping: Record<string, string>;
  output_format?: string;
  gm_only?: boolean;
  visible_in_assistant?: boolean;
}
```

### 11.2 平台预置指令库（引擎内置）

```yaml
# 引擎内置默认配置（不可修改）
platform_command_defaults:
  ra:
    component: "threshold_check_generic"
    dice_expression: "1d100"
    success_direction: "lte"
    difficulty_divisors: [1, 2, 5]
    auto_fetch_skill: true
    description: "技能检定"
  init:
    component: "sort_and_set_initiative"
    dice_expression: "1d20 + dex_mod"
    sort_order: "desc"
    description: "先攻检定"
  sc:
    component: "chain_resolver"
    chain_id: "san_check"
    dice_expression: "1d100"
    description: "理智检定"
  # ... 其他预置指令
```

### 11.3 引擎执行流程（支持规则包覆盖）

```
用户输入指令（如 "ra 侦查"）
       ↓
意图解析器匹配：
  1. 先匹配规则包的 custom_commands（正则/模板）
  2. 若未匹配，检查指令是否在 supported_commands 中
  3. 若在，取 platform_command_defaults[cmd] 作为基础配置
  4. 用 command_overrides[cmd] 深度合并覆盖
       ↓
根据最终配置的 component 字段找到入口原子 ID
       ↓
先解析 input_mapping 中的占位符（如 `{skill}` -> `params.skill`），
再将绑定后的用户参数填入入口原子或步骤输入端口
       ↓
执行节点图，返回结果
```

### 11.4 前端助理台指令速查接口

```typescript
// GET /api/rulesets/{ruleset_id}/commands
// 返回当前规则包可用的所有指令（合并后）
interface AvailableCommand {
  name: string;               // "ra"
  description: string;        // 规则包覆盖后的描述
  syntax: string;             // 如 "ra {skill}"
  gm_only: boolean;
  visible: boolean;
  parameters: { name: string; type: string; optional: boolean }[];
}

// 实现逻辑：取 platform_command_defaults 的所有 keys，
// 与规则包的 supported_commands 取交集，再合并 custom_commands，
// 并应用 command_overrides 覆盖描述等。
```

### 11.5 获取规则包的招募表单字段

前端在 GM 选择规则包后，调用此接口获取动态表单配置。

**接口**：`GET /api/rulesets/{ruleset_id}/recruitment-fields`

**响应**：
```json
{
  "fields": [
    { "name": "credit_rating_max", "label": "信誉限制", "type": "number", "placeholder": "≤30", "default": 30 },
    { "name": "age_education", "label": "年龄/教育限制", "type": "text" }
  ]
}
```


如果规则包未配置 `recruitment_fields`，返回空数组，前端则显示一个多行文本框“车卡要求及其他说明”。

---

## 二、派生值实时计算（formula_eval 原子）

### 11.6 新增原子节点

```yaml
- id: "formula_eval"
  type: "formula_eval"
  config:
    expression: "(CON + SIZ) / 10"   # 支持 + - * / ( ) 及变量引用
    precision: 0                      # 取整方式：0 向下取整，1 四舍五入
  inputs:
    - name: "variables"
      type: "object"                  # 如 { "CON": 60, "SIZ": 50 }
  outputs:
    - name: "result"
      type: "number"
```

### 11.7 引擎实现

- 使用安全表达式解析库（如 `expr-eval` 或 `mathjs`），禁止 `eval`。
- 变量名从 inputs.variables 中读取，支持嵌套（如 `derived.dex_mod`）。
- 错误处理：表达式非法或变量缺失时返回 `null`，并记录错误日志。

### 11.8 角色卡编辑器集成

前端在用户修改基础属性后，调用引擎执行 `formula_eval` 节点（通过 `/api/engine/evaluate` 接口），实时刷新派生值显示。

```json
POST /api/engine/evaluate
{
  "ruleset_id": "coc7",
  "node_id": "formula_eval",
  "inputs": {
    "expression": "(CON + SIZ) / 10",
    "variables": { "CON": 60, "SIZ": 50 }
  }
}
// 响应: { "result": 11 }
```

---

## 三、职业解析器（occupation_apply + level_up）

### 11.9 职业模板数据结构（扩展附录 E）

```typescript
interface OccupationTemplate {
  id: string;
  ruleset_id: string;
  name: string;
  description: string;
  
  // COC 风格：一次性应用
  skill_bindings?: { skill_id: string; base_value: number }[];
  credit_rating_range?: { min: number; max: number };
  skill_point_formula?: string;        // 如 "EDU*2 + APP*2"
  
  // DND 风格：等级成长
  progression_table?: Record<number, {
    features: string[];                // 特性 ID 列表
    attribute_bonuses?: Record<string, number>;
    skill_choices?: { choose: number; from: string[] }[];
  }>;
  
  // 特性节点图（复用原子图格式）
  feature_graph?: {
    atoms: AtomDefinition[];
    connections: Connection[];
  };
}
```

### 11.10 新增原子节点

#### `occupation_apply`（创建角色卡时调用）

```yaml
- id: "occupation_apply"
  type: "occupation_apply"
  inputs:
    - name: "occupation_id"
    - name: "character_id"
    - name: "ruleset_id"
  outputs:
    - name: "success"
    - name: "applied_skills"     # 应用后的技能值
    - name: "skill_points_used"  # 消耗的技能点
```

**行为**：
1. 根据 `occupation_id` 加载职业模板。
2. 若模板有 `skill_bindings`，将对应技能设为指定基础值（覆盖角色卡默认值）。
3. 若模板有 `skill_point_formula`，计算可用技能点，并返回给前端分配界面。
4. 若模板有 `feature_graph`，将其合并到角色卡的 `active_features` 中（后续可触发）。

#### `level_up`（DND 升级时调用）

```yaml
- id: "level_up"
  type: "level_up"
  inputs:
    - name: "character_id"
    - name: "new_level"
  outputs:
    - name: "unlocked_features"
    - name: "attribute_changes"
```

**行为**：
1. 读取角色卡当前等级和职业模板的 `progression_table`。
2. 从旧等级+1 到新等级，逐级收集获得的特性、属性加成。
3. 将特性 ID 列表写入角色卡的 `features` 字段。
4. 应用属性加成（如增加力量值）。

### 11.11 与角色卡系统的集成

- 创建角色卡流程的“选择职业”步骤，前端调用 `occupation_apply` 预览效果，确认后保存。
- 角色卡详情页的“升级”按钮，调用 `level_up` 并刷新界面。
- 所有职业数据存储在 `occupation_definitions` 表（附录 D04 已有结构，需补充 `progression_table` 和 `feature_graph` 字段）。

---

## 四、动作调度器（回合制抽象原子）

### 11.12 新增原子节点

| 原子类型 | 功能 | 输入 | 输出 |
|---------|------|------|------|
| `sort_initiative` | 排序先攻 | `actors: ActorRef[]`, `formula: string` | `sorted_ids: string[]` |
| `set_turn_pointer` | 设置当前回合角色 | `turn_order: string[]`, `index: number` | `current_actor_id: string` |
| `advance_turn` | 推进到下一回合 | `turn_order: string[]`, `current_index: number` | `new_index: number`, `new_actor_id: string` |
| `get_turn_state` | 查询回合状态 | `campaign_id: string` | `turn_order: string[]`, `current_index: number`, `round_number: number` |
| `on_turn_start` | 特殊钩子（系统自动触发） | `actor_id: string` | 执行规则包定义的子图 |

### 11.13 回合状态存储

引擎不持久化回合状态，但允许规则包将状态写入 `campaign_round_state` 表（业务层负责）。引擎提供原子节点读写该表的能力：

```yaml
- id: "save_turn_state"
  type: "db_update"
  config:
    table: "campaign_round_state"
    key: "campaign_id"
  inputs:
    - name: "campaign_id"
    - name: "turn_state"   # { turn_order, current_index, round_number }
```

### 11.14 规则包使用示例（DND 战斗开始）

```yaml
# 在规则包的 custom_commands 中定义
custom_commands:
  - trigger: "战斗开始"
    component: "combat_start_flow"
    
# 战斗开始流程（组合原子）
atoms:
  - id: "roll_initiative_all"
    type: "sort_initiative"
    config:
      formula: "1d20 + dex_mod"
  - id: "save_state"
    type: "save_turn_state"
  - id: "broadcast"
    type: "result_collector"

connections:
  - from: "roll_initiative_all.sorted_ids" → to: "save_state.turn_order"
  - from: "save_state.success" → to: "broadcast.message"
```

### 11.15 引擎职责边界重申

- 引擎提供上述**抽象能力**，不内置任何具体规则（如“回合开始自动恢复动作点”）。
- 规则包通过组合这些原子实现 DND 的附赠动作、COC 的追逐轮等。
- 若规则包未使用任何调度器原子，房间默认处于**自由流程**（无回合概念）。

---

## 五、节点图事务与错误处理

### 11.16 事务语义

每个节点执行时，若该节点有副作用（如 `resource_modify`、`db_update`），引擎应记录**补偿操作**。当后续节点失败时，根据 `on_error` 策略决定是否回滚。

```typescript
interface NodeExecution {
  node_id: string;
  side_effects: Array<{
    type: 'resource_change' | 'db_insert' | 'db_update';
    compensate: () => Promise<void>;   // 补偿函数
  }>;
}
```

### 11.17 规则包级错误策略

在规则包 YAML 中可配置：

```yaml
error_handling:
  default_strategy: "rollback"   # "rollback" 或 "continue"
  on_cycle_detected: "reject"
  on_node_timeout: "rollback"
```

### 11.18 引擎实现要点

- 执行节点图前先进行**拓扑排序**并检测循环依赖。
- 使用**执行栈**记录已完成节点的副作用，若失败则逆序调用补偿。
- 补偿操作应幂等（多次调用结果相同）。
- 对于无副作用的节点（如 `dice_roll`、`threshold_compare`），无需事务保护。

---

## 六、规则包热加载 API

### 11.19 接口定义

```http
POST /api/rulesets/{ruleset_id}/reload
Authorization: Bearer <token>
Content-Type: application/json

{
  "campaign_ids": ["camp_123", "camp_456"]   // 可选，指定要热更新的团，不传则全局
}
```

### 11.20 引擎行为

1. 从数据库重新加载规则包 YAML，解析 `atoms`、`connections`、`commands` 等。
2. 校验新规则包的节点图无循环依赖，且所有引用的原子类型仍存在。
3. 若校验通过，**原子切换**：将内存中的规则包实例替换为新版本。
4. 对于正在进行的房间：
   - 若规则包仅修改了指令映射或显示文本，无需中断。
   - 若修改了节点图结构（如增加/删除节点），需通知房间内的 GM：“规则包已更新，部分进行中的检定可能使用旧规则，请手动刷新。”
5. 记录热加载日志到 `ruleset_reload_logs` 表。

### 11.21 安全限制

- 仅规则包作者或平台管理员可调用。
- 热加载频率限制：同一规则包 1 分钟内最多 5 次。
- 若新规则包与旧规则包不兼容（如删除了某个被房间指令引用的组件），返回 `409 Conflict`，并列出影响范围。

---

## 七、补充数据表（数据库）

```sql
-- 职业模板表（扩展附录 E）
ALTER TABLE occupation_definitions ADD COLUMN progression_table JSON;
ALTER TABLE occupation_definitions ADD COLUMN feature_graph JSON;

-- 回合状态表（业务层）
CREATE TABLE campaign_round_state (
  campaign_id VARCHAR(64) PRIMARY KEY,
  turn_order JSON NOT NULL,        -- 角色 ID 数组
  current_index INT NOT NULL,
  round_number INT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 规则包热加载日志
CREATE TABLE ruleset_reload_logs (
  id VARCHAR(64) PRIMARY KEY,
  ruleset_id VARCHAR(64) NOT NULL,
  operator_id VARCHAR(64) NOT NULL,
  campaign_ids JSON,                -- 受影响的团 ID 列表
  status ENUM('success', 'failed') NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 八、移动端适配边界（按附录 A06 收敛）

### 11.22 Recipe 编辑器移动端策略

1. 移动端保留查看入口，仅支持只读查看已发布规则配方。
2. 编辑控件统一隐藏，点击编辑入口统一提示“请在电脑上使用此功能”。
3. 任何未在本附录声明的移动端编辑能力不得自行开放。

### 11.23 与全局降级规则关系

本附录仅定义规则编辑器模块边界；通用降级原则、触摸规范、兼容性与验收指标统一遵循 A06，不在本附录重复维护。
