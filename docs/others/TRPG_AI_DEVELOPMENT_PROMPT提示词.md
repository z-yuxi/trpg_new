# TRPG 规则集编辑器 — AI 继续开发提示词

## 项目概况

这是一个 TRPG（桌面角色扮演游戏）规则集编辑器平台，采用 pnpm monorepo 架构：
- `packages/client` — Vue 3 + TypeScript + Element Plus + Vue Flow 前端
- `packages/server` — Express + Knex + MySQL + Redis + Socket.io 后端
- `packages/shared` — 共享类型定义

系统核心功能是让用户通过两种模式创建规则集：
- **L1 模式**：表单式配置（简单掷骰规则）
- **L3 模式**：可视化节点画布编辑器（复杂规则图）

两种模式可互相转换，支持预览执行、版本管理、角色卡模板、招募帖字段等功能。

---

## 当前代码状态评估

所有 P1/P2 功能的前端组件框架已搭建完成，但存在以下实质性缺陷：

### 关键缺陷清单

| # | 问题 | 位置 | 严重度 |
|---|------|------|--------|
| 1 | ~~5 种原子执行器缺失~~ **已更正：16 种原子执行器后端均已实现并注册**，但前端 `canvas-serializer.ts` 的端口定义与后端执行器的实际输入参数名存在不一致 | 见附录 A 对比表 | 高 |
| 2 | L1→L3 转换器中 `difficulty_modifier` 从未注入图中，`formula_eval` 节点的 `variables` 输入指向 `character_skill_reader` 的 `value` 输出，但公式引用了不存在的 `difficulty_modifier` 变量 | `l1-to-l3-converter.ts` L96-112 | 高 |
| 3 | L3→L1 检测器只回填 4 个字段（`check_mode`/`default_dice`/`crit_success_max`/`crit_fail_min`），缺失 `difficulty_levels`/`attributes`/`resources`/`supported_commands` | `l3-to-l1-detector.ts` L135-144 | 高 |
| 4 | 画布预览执行时 `mock_context` 格式未校验，`character_skill_reader` 读不到字段时后端抛错但前端只显示 `String(e)` 通用错误 | `RuleCanvas.vue` L407-460 | 高 |
| 5 | `mergeFromParent()` 只做双方浅对比（无共同祖先基准），connections 直接用 parent 的覆盖本地，conflicts 数组返回但前端从未展示 | `ruleset-service.ts` L441-487 | 高 |
| 6 | 自定义命令的 `graph_json` 解析失败时 catch 块为空（`catch { /* keep empty */ }`），静默丢弃错误 | `RulesetEditor.vue` L367-377 | 中 |
| 7 | L1 表单无任何字段校验，可保存空名称、无效骰子表达式、重复难度名 | `RulesetEditor.vue` | 中 |
| 8 | `compareVersions()` 用 `JSON.stringify` 浅比较只对比 atoms 的 node_id，`added_connections` 和 `removed_connections` 始终返回空数组 | `ruleset-service.ts` L336-356 | 中 |
| 9 | 所有后端路由 catch 块返回 `res.status(500).json({ error: 'Internal server error' })`，无日志记录 | `routes/rulesets.ts` | 中 |

---

## 架构参考（开发前必读）

### 原子执行器接口

所有原子执行器位于 `packages/server/src/engine/atoms/`，实现以下接口：

```typescript
// packages/server/src/engine/atom-interface.ts
export interface AtomOutput {
  result: unknown;  // 其他节点通过 output_key 读取此对象的字段
  logs: { input_summary: string; output_summary: string };
}

export interface AtomNode {
  type: string;
  execute(inputs: Record<string, unknown>): AtomOutput;
}
```

### 已有执行器模板示例（DiceRollAtom）

```typescript
// packages/server/src/engine/atoms/dice-roll.ts
import type { AtomNode, AtomOutput } from '../atom-interface';
import { evaluateDiceWithRng, evaluateDice, type SingleRoll } from '../dice-evaluator';

export class DiceRollAtom implements AtomNode {
  type = 'dice_roll';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const expression = inputs['expression'] as string;
    const rng = inputs['rng'] as (() => number) | undefined;

    if (!expression || typeof expression !== 'string') {
      throw new Error("dice_roll: 'expression' input must be a non-empty string");
    }

    const result = rng
      ? evaluateDiceWithRng(expression, rng)
      : evaluateDice(expression);

    return {
      result: {
        total: result.total,      // 其他节点通过 output_key='total' 引用
        details: result.details,  // output_key='details'
        rolls: result.rolls as SingleRoll[],  // output_key='rolls'
      },
      logs: {
        input_summary: `expression="${expression}"`,
        output_summary: `total=${result.total}, details="${result.details}"`,
      },
    };
  }
}
```

### 注册表（已注册全部 16 种原子）

```typescript
// packages/server/src/engine/registry.ts
export class AtomRegistry {
  private atoms = new Map<string, new () => AtomNode>();
  register(type: string, ctor: new () => AtomNode): void { this.atoms.set(type, ctor); }
  get(type: string): AtomNode {
    const Ctor = this.atoms.get(type);
    if (!Ctor) throw new Error(`AtomRegistry: unknown atom type '${type}'`);
    return new Ctor();
  }
}

// 全局实例已注册：dice_roll, threshold_compare, multiply, if_else, result_collector,
// character_skill_reader, resource_modify, formula_eval, resource_modify_batch,
// table_lookup, random_table, effect_apply, effect_remove, loop, aggregate, conditional_branch
```

### 图执行器核心流程

```typescript
// packages/server/src/engine/executor.ts
export interface InputSource =
  | { type: 'static'; value: unknown }    // 静态值
  | { type: 'ref'; node_id: string; output_key: string };  // 引用其他节点输出

export interface GraphNodeDef {
  node_id: string;
  atom_type: string;
  inputs: Record<string, InputSource>;  // key = 输入端口名
}

export interface GraphDef {
  nodes: GraphNodeDef[];
  output_node_id: string;
}

// 执行流程：
// 1. 拓扑排序（Kahn 算法）
// 2. 按序执行每个节点：解析 inputs（static 直接取值，ref 从已执行节点结果中取 output_key 字段）
// 3. 调用 atom.execute(resolvedInputs)，将 result 存入 nodeResults Map
// 4. 返回 output_node_id 对应节点的结果
```

### 数据库 Schema

```sql
-- rulesets 表（Migration 001 + 004 + 009）
CREATE TABLE rulesets (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255),
  version VARCHAR(50),
  description TEXT,
  author_id VARCHAR(36),
  parent_ruleset_id VARCHAR(36),  -- 旧字段
  parent_id VARCHAR(36) REFERENCES rulesets(id),  -- M009 新增，fork 来源
  atoms JSON,                     -- CommandGraphNode[] 序列化
  connections JSON,               -- 连接信息（前端 Vue Flow edges 格式）
  commands JSON,                  -- 命令配置（含 custom_commands 及其 graph_json）
  character_card_schema JSON,     -- CharacterCardSchema
  status ENUM('draft','reviewing','published','deprecated') DEFAULT 'draft',
  fork_count INT DEFAULT 0,       -- M009
  lock_version INT DEFAULT 0,     -- M009 乐观锁
  latest_version_id VARCHAR(36),  -- M009
  created_at TIMESTAMP
);

-- ruleset_versions 表（Migration 009）
CREATE TABLE ruleset_versions (
  id VARCHAR(36) PRIMARY KEY,
  ruleset_id VARCHAR(36) REFERENCES rulesets(id) ON DELETE CASCADE,
  version_number VARCHAR(50),     -- 如 "1.0.0-snapshot.1"
  snapshot JSON,                  -- { atoms, connections, commands, character_card_schema }
  changelog TEXT DEFAULT '',
  created_at TIMESTAMP,
  INDEX(ruleset_id, created_at)
);

-- 注意：ruleset_versions 表无 created_by 字段，无 base_version/fork_point 记录
```

### 共享类型定义（关键摘录）

```typescript
// packages/shared/src/types/index.ts
export interface CommandInputSource {
  type: 'static' | 'ref';
  value?: unknown;           // type='static' 时
  node_id?: string;          // type='ref' 时
  output_key?: string;       // type='ref' 时
}

export interface CommandGraphNode {
  node_id: string;
  atom_type: string;
  inputs: Record<string, CommandInputSource>;
}

export interface CommandGraph {
  nodes: CommandGraphNode[];
  output_node_id: string;
}

export interface RulesetVersionDiff {
  added_nodes: string[];       // node_id 列表
  removed_nodes: string[];
  modified_nodes: string[];
  added_connections: string[];  // 当前始终为 []
  removed_connections: string[];  // 当前始终为 []
}

export interface MergeConflict {
  node_id: string;
  type: 'modified_both' | 'deleted_ours' | 'deleted_theirs';
  our_node?: object;
  their_node?: object;
}

export interface MergeResult {
  merged_graph: { atoms: object[]; connections: object[] };
  conflicts: MergeConflict[];
}
```

---

## 附录 A：前端端口定义 vs 后端执行器输入参数对比

**开发前必须对照此表**，确保前端 `canvas-serializer.ts` 中 `ATOM_DEFINITIONS` 的端口名与后端 `execute(inputs)` 读取的 key 完全一致。以下列出需关注的差异点：

| 原子类型 | 前端端口定义（canvas-serializer.ts） | 后端 execute() 读取的 key | 是否一致 |
|----------|--------------------------------------|--------------------------|----------|
| `table_lookup` | inputs: `table_data`, `lookup_key`, `mode` | `inputs['table_data']`, `inputs['lookup_key']`, `inputs['mode']` | ✅ 一致 |
| `table_lookup` | output: `result` | `result: { result_row, found }` | ⚠️ 前端定义的 output port 名为 `result`，但实际输出对象有两个字段 `result_row` 和 `found`，其他节点需用 `output_key='result_row'` 或 `output_key='found'` 引用 |
| `random_table` | inputs: `table_entries`, `roll_expression` | `inputs['table_entries']`, `inputs['roll_expression']` | ✅ 一致 |
| `random_table` | output: `selected_value` | `result: { selected_entry, roll_result }` | ⚠️ 前端 output port 名为 `selected_value`，但后端输出字段名为 `selected_entry` |
| `effect_apply` | inputs: `target_character_id`, `effect_name`, `duration_type`, `duration_value` | 后端还读取 `inputs['modifiers']`（Modifier[] 数组） | ⚠️ 前端缺少 `modifiers` 输入端口 |
| `conditional_branch` | inputs: `value`, `branches` | `inputs['value']`, `inputs['branches']`（Branch[] 数组） | ✅ 一致 |
| `loop` | inputs: `iterations`, `initial_value`, `step_value`, `operation` | 同名 | ✅ 一致 |
| `loop` | 前端可能定义了 `items` 输入 | 后端无 `items` 输入，使用 `iterations`+`step_value` 模式 | ⚠️ 需确认前端定义 |

**行动项**：在修改前端或后端之前，先完整对照 `canvas-serializer.ts` 的 `ATOM_DEFINITIONS` 数组和 `packages/server/src/engine/atoms/` 下每个文件的 `execute()` 方法，统一端口名和输出字段名。修改原则：**以后端执行器为准，修改前端定义**（因为已有图数据引用的是后端 key）。

---

## 开发任务清单（按执行顺序）

### 阶段一：修复核心执行链路（确保画布模式能跑通）

#### 任务 1.1：统一前后端原子端口定义

**目标**：确保 `canvas-serializer.ts` 中每个原子的 inputs/outputs 端口名与后端执行器完全匹配。

**前置条件**：无

**操作步骤**：

1. 读取 `packages/client/src/utils/canvas-serializer.ts` 中的 `ATOM_DEFINITIONS` 数组（约 L29-300），提取每个原子的 inputs 和 outputs 端口定义。
2. 逐一读取 `packages/server/src/engine/atoms/` 下的 16 个执行器文件，提取每个 `execute(inputs)` 方法实际读取的 key 和 `result` 对象的字段名。
3. 制作对照表，标记不一致项。
4. **修改前端** `canvas-serializer.ts` 的 `ATOM_DEFINITIONS`，使端口名与后端一致。修改原则：
   - input port 的 `id` 必须等于后端 `inputs['xxx']` 的 key 名。
   - output port 的 `id` 必须等于后端 `result` 对象的字段名。
   - 如果后端 `result` 是嵌套对象（如 `{ result_row, found }`），则前端应定义多个 output port。
5. 特别注意以下已知差异（见附录 A）：
   - `table_lookup` 的 output 应拆分为 `result_row` 和 `found` 两个端口。
   - `random_table` 的 output 端口 `selected_value` 应改为 `selected_entry` 和 `roll_result`。
   - `effect_apply` 需新增 `modifiers` 输入端口（类型 `any`，JSON 格式）。
6. 修改后运行 `pnpm --filter @trpg/client typecheck`。

**验证标准**：前端每个原子定义的端口名，与后端执行器的输入 key 和输出字段名完全一致，TypeScript 编译无新增错误。

---

#### 任务 1.2：修复 L1→L3 转换器的难度等级注入

**目标**：L1 表单中配置的 `difficulty_levels` 在转换为 L3 图后能正确影响判定阈值。

**前置条件**：任务 1.1 完成（确保 `table_lookup` 端口定义正确）

**当前问题的精确位置**：

`l1-to-l3-converter.ts` L96-112：
```typescript
// 当前代码
if (nonTrivialLevels.length > 0) {
  modifierId = uid('formula_eval');
  nodes.push({
    node_id: modifierId,
    atom_type: 'formula_eval',
    inputs: {
      formula: { type: 'static', value: 'skill_value + difficulty_modifier' },
      // ← 问题：variables 指向 reader 的 value，但公式引用了 difficulty_modifier
      //   formula_eval 会尝试求值 'skill_value + difficulty_modifier'
      //   其中 skill_value 来自 variables，但 difficulty_modifier 无来源
      variables: { type: 'ref', node_id: readerId, output_key: 'value' },
    },
  });
}
```

**修复方案**：

1. 在 `l1-to-l3-converter.ts` 的 `convertL1ToL3()` 函数中，当 `nonTrivialLevels.length > 0` 时：

   a) 生成一个 `table_lookup` 节点，将 `difficulty_levels` 编码为查找表：
   ```typescript
   // difficulty_levels 的数据格式示例：
   // [{ name: '普通', threshold: 0 }, { name: '困难', threshold: -20 }, { name: '极难', threshold: -40 }]
   // 编码为 table_data：[[\"普通\", 0], [\"困难\", -20], [\"极难\", -40]]
   const tableData = l1.difficulty_levels.map(d => [d.name, d.threshold]);

   const lookupId = uid('table_lookup');
   nodes.push({
     node_id: lookupId,
     atom_type: 'table_lookup',
     inputs: {
       table_data: { type: 'static', value: tableData },
       lookup_key: { type: 'static', value: '普通' }, // 默认值，运行时由命令参数覆盖
       mode: { type: 'static', value: 'exact' },
     },
   });
   ```

   b) 修改 `formula_eval` 节点，使其输入来自 `character_skill_reader` 和 `table_lookup`：
   ```typescript
   modifierId = uid('formula_eval');
   nodes.push({
     node_id: modifierId,
     atom_type: 'formula_eval',
     inputs: {
       formula: { type: 'static', value: 'skill_value + modifier' },
       skill_value: { type: 'ref', node_id: readerId, output_key: 'value' },
       modifier: { type: 'ref', node_id: lookupId, output_key: 'result_row' },
       // 注意：result_row 返回整行数组 [name, threshold]
       // 需要确认 formula_eval 是否支持数组索引，或改用其他方式提取 threshold
     },
   });
   ```

   c) **关键确认**：读取 `packages/server/src/engine/atoms/formula-eval.ts`，确认 `formula_eval` 如何解析 `variables` 输入。如果它期望一个 `Record<string, number>` 而不是多个独立输入，则需要调整连线方式。

2. 同步更新 `l3-to-l1-detector.ts`，使检测器能从 `table_lookup` 节点反推 `difficulty_levels`（见任务 2.1）。

**验证标准**：
- L1 配置 `difficulty_levels: [{name:'普通',threshold:0},{name:'困难',threshold:-20}]` 转换后的 L3 图中包含 `table_lookup` 节点。
- 在画布预览中选择不同难度，技能阈值应相应变化。

---

#### 任务 1.3：修复画布预览的 mock_context 校验与错误展示

**目标**：预览执行前验证 mock 数据完整性，执行出错时在画布上精确标记出错节点。

**前置条件**：无

**当前代码位置**：`RuleCanvas.vue` L370-460

当前 `runPreview()` 的问题：
- L416-421：构造 mock_context 时无校验，`character_skill_reader` 节点通过 `inputs['field_name']` 指定要读取的字段名（如 `'侦查'`），但如果 mockSkills 中没有 `'侦查'`，后端 `CharacterSkillReaderAtom.execute()` 会抛错。
- L455-456：catch 块只做 `previewError.value = String(e)`，无法区分是哪个节点出错。
- 后端 `GraphExecutor.execute()` 在节点出错时返回 `{ success: false, error: "Node 'xxx' (yyy) threw: zzz" }`，前端未解析此结构化错误。

**操作步骤**：

1. 在 `runPreview()` 调用 API 之前，增加预检逻辑：
```typescript
// 提取图中所有 character_skill_reader 节点需要的字段名
const requiredFields: { nodeId: string; fieldName: string; fieldType: 'skill' | 'attribute' }[] = [];
for (const node of nodes.value) {
  if (node.data?.atom_type === 'character_skill_reader') {
    // 从节点的 inputs 配置中提取 field_name 的静态值
    const fieldInput = node.data?.inputs?.field_name;
    if (fieldInput?.type === 'static' && fieldInput.value) {
      requiredFields.push({
        nodeId: node.id,
        fieldName: String(fieldInput.value),
        fieldType: 'skill', // 或根据节点配置判断
      });
    }
  }
}

// 与当前 mock 数据对比
const mockSkillNames = new Set(mockSkills.value.map(s => s.name));
const mockAttrNames = new Set(mockAttrs.value.map(a => a.name));
const missing = requiredFields.filter(f =>
  !mockSkillNames.has(f.fieldName) && !mockAttrNames.has(f.fieldName)
);

if (missing.length > 0) {
  previewError.value = `模拟数据缺少以下字段：${missing.map(m => m.fieldName).join(', ')}。请在下方添加或点击「自动生成」。`;
  return;
}
```

2. 增加「从图中自动生成 mock 数据」按钮：
```typescript
function autoGenerateMock() {
  const existingSkills = new Set(mockSkills.value.map(s => s.name));
  const existingAttrs = new Set(mockAttrs.value.map(a => a.name));

  for (const node of nodes.value) {
    if (node.data?.atom_type === 'character_skill_reader') {
      const fieldName = node.data?.inputs?.field_name;
      if (fieldName?.type === 'static' && fieldName.value) {
        const name = String(fieldName.value);
        if (!existingSkills.has(name) && !existingAttrs.has(name)) {
          mockSkills.value.push({ name, value: 50 });
        }
      }
    }
  }
}
```

3. 改进错误展示——解析后端返回的结构化错误：
```typescript
// 在 catch 块和 API 响应处理中
if (data && !data.success && data.error) {
  previewError.value = data.error;
  // 解析错误中的 node_id（格式："Node 'xxx' (yyy) threw: zzz"）
  const nodeMatch = data.error.match(/Node '([^']+)'/);
  if (nodeMatch) {
    const errorNodeId = nodeMatch[1];
    // 将出错节点标红
    const errNode = nodes.value.find(n => n.id === errorNodeId);
    if (errNode) {
      errNode.data = { ...errNode.data, hasError: true, errorMessage: data.error };
    }
    // 将连向出错节点的边标红
    edges.value.forEach(e => {
      if (e.target === errorNodeId) {
        (e as any).style = { stroke: '#e74c3c', strokeWidth: 2, strokeDasharray: '5,5' };
      }
    });
  }
}
```

**验证标准**：
- 创建含 `character_skill_reader(field_name='侦查')` 的图，mock 数据中无 `侦查`，应显示缺失字段提示。
- 点击自动生成后，mockSkills 中自动出现 `{name:'侦查', value:50}`。
- 后端执行出错时，出错节点在画布上标红，预览面板显示具体错误。

---

### 阶段二：完善双向转换与版本管理

#### 任务 2.1：完善 L3→L1 检测器的字段回填

**目标**：L3 画布图如果符合 L1 模式的模式，能完整回填所有 L1 字段。

**前置条件**：任务 1.2 完成（确保 L1→L3 正确生成 `table_lookup` 难度节点）

**当前代码位置**：`l3-to-l1-detector.ts`

当前 `detectL3ToL1()` 返回的 `extracted` 只有：
```typescript
// roll_under/roll_over 模式，L135-144
extracted: {
  check_mode: checkMode,
  default_dice: defaultDice,
  crit_success_max: critSuccessMax,
  crit_fail_min: critFailMin,
  // 缺失：difficulty_levels, attributes, resources, supported_commands
  // 缺失：success_formula, bonus_dice
}
```

**操作步骤**：

1. **回填 `difficulty_levels`**：
   - 在图中查找 `table_lookup` 节点。
   - 如果找到且其 `table_data` 是 static 输入，解析为 `difficulty_levels`：
   ```typescript
   const lookupNode = nodes.find(n => n.atom_type === 'table_lookup');
   if (lookupNode) {
     const tableData = getStaticValue(lookupNode, 'table_data') as Array<[string, number]>;
     if (Array.isArray(tableData)) {
       extracted.difficulty_levels = tableData.map(([name, threshold]) => ({ name, threshold }));
     }
   }
   ```

2. **回填 `attributes`**：
   - 遍历所有 `character_skill_reader` 节点，提取 `field_name` 静态值。
   - 注意：仅能回填 `name`，`roll_formula` 无法从图中推断，标记为需用户确认：
   ```typescript
   const readers = nodes.filter(n => n.atom_type === 'character_skill_reader');
   extracted.attributes = readers.map(r => ({
     name: getStaticString(r, 'field_name') ?? '',
     roll_formula: '', // 无法推断，需用户补充
   }));
   ```

3. **回填 `resources`**：
   - 遍历所有 `resource_modify` 节点，提取 `resource_name` 静态值。
   - 注意：`resource_modify` 出现意味着图已超出 L1 模板范围。当前 `L1_ALLOWED_ATOM_TYPES` 不包含 `resource_modify`，所以含 `resource_modify` 的图会被判为 `l3-only`。
   - **决策点**：是否将 `resource_modify` 加入 `L1_ALLOWED_ATOM_TYPES`？如果加入，需要扩展 L1 表单来展示资源修改配置。建议暂不加入，resources 字段留空。

4. **回填 `supported_commands`**：
   - 此信息不存储在图中，而是存储在 ruleset 的 `commands` 字段。
   - 检测器无法从图中推断，需要在调用层（`RulesetEditor.vue`）另行处理。
   - 在 `extracted` 中标注 `supported_commands: undefined`，由调用层保留原值。

5. **增加 `used_defaults` 返回字段**，标记哪些回填值是猜测的：
```typescript
export type DetectResult =
  | { matched: true; check_mode: ...; extracted: Partial<L1Config>; guessed_fields: string[] }
  | { matched: false; reason: ... };
```

6. 在 `RulesetEditor.vue` 中切换到 L1 模式时，如果 `guessed_fields` 非空，用 `ElMessage.warning()` 提示用户确认。

**验证标准**：
- L1 配置 `{check_mode:'roll_under', default_dice:'1d100', difficulty_levels:[...], crit_success_max:5, crit_fail_min:96}` → L3 → L1，回填结果应包含完整的 `difficulty_levels`。
- 回填的 `attributes` 的 `roll_formula` 为空时，UI 中该字段高亮提示。

---

#### 任务 2.2：修复版本对比的 diff 算法

**目标**：版本对比能显示节点、连接、命令三个维度的差异。

**前置条件**：无

**当前代码位置**：`ruleset-service.ts` L336-356

```typescript
// 当前实现——只对比 atoms 的 node_id，connections 始终为空
const added = atomsB.filter((id) => !setA.has(id));
const removed = atomsA.filter((id) => !setB.has(id));
const modified = both.filter((id) => {
  const a = (vA.snapshot.atoms as any[]).find((n: any) => n.node_id === id);
  const b = (vB.snapshot.atoms as any[]).find((n: any) => n.node_id === id);
  return JSON.stringify(a) !== JSON.stringify(b);  // ← 浅比较
});
return { added_nodes: added, removed_nodes: removed, modified_nodes: modified,
         added_connections: [], removed_connections: [] };  // ← 始终空
```

**snapshot 的实际数据结构**（由 `saveVersion()` 生成）：
```typescript
snapshot: {
  atoms: any[],              // CommandGraphNode[]
  connections: any[],         // Vue Flow Edge[] 格式，每项有 { id, source, target, sourceHandle, targetHandle }
  commands: any,              // 命令配置 JSON
  character_card_schema: any  // CharacterCardSchema JSON
}
```

**操作步骤**：

1. 先修改 `packages/shared/src/types/index.ts` 中的 `RulesetVersionDiff` 类型，扩展结构：
```typescript
export interface RulesetVersionDiff {
  nodes: {
    added: Array<{ node_id: string; atom_type: string }>;
    removed: Array<{ node_id: string; atom_type: string }>;
    modified: Array<{ node_id: string; atom_type: string; changed_fields: string[] }>;
  };
  connections: {
    added: Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
    removed: Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
  };
  commands: {
    added: string[];
    removed: string[];
    modified: string[];
  };
}
```

2. 重写 `compareVersions()` 方法：

   **节点 diff**：按 `node_id` 对齐，对 `both` 中的节点逐字段对比（`atom_type`、`inputs` 各 key），记录具体变化的字段名到 `changed_fields`。

   **连接 diff**：将每条连接的唯一键设为 `${source}:${sourceHandle}->${target}:${targetHandle}`，做集合差运算。

   **命令 diff**：对比 `snapshot.commands.supported_commands` 数组和各命令配置。

3. 更新前端 `VersionPanel.vue` 的 diff 展示部分，适配新数据结构。当前 `VersionPanel.vue` 使用的类型是 `RulesetVersionDiff`，改了类型后前端会有编译错误，逐一修复。

**验证标准**：两个版本间添加了一个节点、删除了一条连接、修改了一个节点的输入值，diff 应分别正确反映。

---

#### 任务 2.3：修复 merge-from-parent 的冲突处理

**目标**：用户能看到合并冲突并选择保留哪一方的修改。

**前置条件**：无

**当前代码的精确问题**：

`ruleset-service.ts` L441-487 的 `mergeFromParent()`：
```typescript
// 问题 1：只做双方对比（无 base 基准），无法区分「我改了」vs「上游改了」vs「双方都改了」
// 问题 2：connections 直接用 parent 的覆盖本地（L484）
//   return { merged_graph: { atoms: merged, connections: (parent.connections as any[]) ?? [] }, ... }
// 问题 3：冲突时默认保留本地（L469），但前端无法展示冲突
```

**数据库限制**：`ruleset_versions` 表无 `fork_point_version_id` 字段，无法自动确定共同祖先。

**务实方案**（不依赖三方合并）：

1. **后端修改** `mergeFromParent()`：
   - 保持现有双方对比逻辑，但不再默认保留本地。
   - 当 `conflicts.length > 0` 时，返回 `{ status: 'conflicts', conflicts, merged_graph: null }`。
   - 当 `conflicts.length === 0` 时，返回 `{ status: 'clean', conflicts: [], merged_graph }`。
   - 为 connections 也做合并：按连接唯一键对比，双方独有的保留，双方都有但不同的加入 conflicts。

2. **新增后端端点** `POST /rulesets/:id/resolve-merge`：
   ```typescript
   // 请求体
   {
     resolutions: Array<{
       node_id: string;
       keep: 'ours' | 'theirs';  // 用户选择
     }>;
   }
   // 逻辑：根据 resolutions 构建最终 merged 结果，写入 rulesets 表
   ```
   在 `routes/rulesets.ts` 中添加路由，在 `ruleset-service.ts` 中实现 `resolveMerge()` 方法。

3. **前端修改** `VersionPanel.vue`：
   - 当 merge 返回 `status: 'conflicts'`，弹出 `el-dialog` 显示冲突列表。
   - 每个冲突项用左右对比布局：左侧「本地」（JSON pretty print），右侧「上游」（JSON pretty print）。
   - 每项一个 radio 选择「保留本地 / 采用上游」。
   - 底部「确认合并」按钮，调用 `resolve-merge` 端点。

4. **修改** `MergeResult` 类型（`packages/shared/src/types/index.ts`）：
```typescript
export interface MergeResult {
  status: 'clean' | 'conflicts';
  merged_graph: { atoms: object[]; connections: object[] } | null;
  conflicts: MergeConflict[];
}
```

**验证标准**：
- Fork 规则集 A → B。A 和 B 各修改同一节点 N 的不同输入值。B 执行 merge-from-parent，应弹出冲突 UI 展示 N 的两份值。
- 无冲突场景（A 加了新节点，B 未修改），应自动合并成功。

---

### 阶段三：表单校验与错误处理

#### 任务 3.1：L1 表单字段校验

**目标**：保存前拦截无效配置，给出具体错误提示。

**前置条件**：无

**操作步骤**：

1. 在 `packages/client/src/utils/` 下新建 `ruleset-validator.ts`：
```typescript
export interface ValidationError {
  field: string;      // 字段路径，如 'defaultDice'、'difficulty_levels[1].name'
  message: string;
}

export function validateRulesetForm(form: {
  name: string;
  defaultDice: string;
  checkMode: string;
  critSuccessMax: number;
  critFailMin: number;
  difficultyLevels: Array<{ name: string; threshold: number }>;
  attributes: Array<{ name: string; roll_formula: string }>;
  resources: Array<{ name: string; max_formula: string }>;
  supportedCommands: string[];
  customCommands?: Array<{ name: string; param_mapping: Array<{ source: string; field?: string }> }>;
}): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. 名称
  if (!form.name.trim()) errors.push({ field: 'name', message: '规则集名称不能为空' });
  if (form.name.length > 100) errors.push({ field: 'name', message: '名称不超过100字' });

  // 2. 骰子表达式（支持复杂格式如 3d6+2, 1d100, 2d10+1d6）
  const diceRegex = /^\d+d\d+([+-]\d+(d\d+)?)*$/i;
  if (!diceRegex.test(form.defaultDice)) {
    errors.push({ field: 'defaultDice', message: `无效的骰子表达式: ${form.defaultDice}` });
  }

  // 3. 大成功/大失败阈值逻辑
  if (form.checkMode === 'roll_under' && form.critSuccessMax >= form.critFailMin) {
    errors.push({ field: 'critSuccessMax', message: 'roll_under 模式下大成功阈值应 < 大失败阈值' });
  }

  // 4. 难度等级去重
  const diffNames = new Set<string>();
  form.difficultyLevels.forEach((d, i) => {
    if (!d.name.trim()) errors.push({ field: `difficultyLevels[${i}].name`, message: '难度名不能为空' });
    if (diffNames.has(d.name)) errors.push({ field: `difficultyLevels[${i}].name`, message: `重复的难度名: ${d.name}` });
    diffNames.add(d.name);
  });

  // 5. 属性和资源的必填项
  form.attributes.forEach((a, i) => {
    if (!a.name.trim()) errors.push({ field: `attributes[${i}].name`, message: '属性名不能为空' });
  });
  form.resources.forEach((r, i) => {
    if (!r.name.trim()) errors.push({ field: `resources[${i}].name`, message: '资源名不能为空' });
    if (!r.max_formula.trim()) errors.push({ field: `resources[${i}].max_formula`, message: '资源最大值公式不能为空' });
  });

  // 6. 至少一个命令
  if (form.supportedCommands.length === 0) {
    errors.push({ field: 'supportedCommands', message: '至少需要一个支持的命令' });
  }

  // 7. 自定义命令参数映射
  form.customCommands?.forEach((cmd, ci) => {
    cmd.param_mapping?.forEach((p, pi) => {
      if ((p.source === 'character_attribute' || p.source === 'character_skill') && !p.field?.trim()) {
        errors.push({
          field: `customCommands[${ci}].param_mapping[${pi}].field`,
          message: `命令 ${cmd.name} 的参数映射缺少字段名`,
        });
      }
    });
  });

  return errors;
}
```

2. 在 `RulesetEditor.vue` 的 `handleSave()` 函数开头调用 `validateRulesetForm()`，如返回非空数组则阻止保存。
3. 使用 Element Plus 的 `ElMessage.error()` 显示第一条错误，并用 `document.querySelector(`[data-field="${errors[0].field}"]`)?.scrollIntoView()` 滚动到对应字段。
4. 为每个表单字段添加 `data-field` 属性以支持滚动定位。

**验证标准**：骰子写 `abc` 保存时提示无效；两个难度同名提示重复；属性名为空提示必填。

---

#### 任务 3.2：后端错误处理标准化

**目标**：API 返回有意义的错误信息，替换通用 500。

**前置条件**：无

**操作步骤**：

1. 创建 `packages/server/src/middleware/error-handler.ts`：
```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) { super(400, 'VALIDATION_ERROR', message, details); }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) { super(404, 'NOT_FOUND', `${resource} '${id}' not found`); }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(403, 'FORBIDDEN', message); }
}

// Express error handler middleware
import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = { code: err.code, message: err.message };
    if (err.details) body.details = err.details;
    if (process.env.NODE_ENV === 'development') body.stack = err.stack;
    console.error(`[${err.statusCode}] ${err.code}: ${err.message}`);
    return res.status(err.statusCode).json(body);
  }

  // 未预期的错误
  console.error('[500] Unhandled error:', err);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
}
```

2. 在 Express app 中注册此中间件（在所有路由之后）。
3. 修改 `ruleset-service.ts` 中已有的 `throw Object.assign(new Error(...), { code: '...' })` 模式，改用 `throw new NotFoundError('Ruleset', id)` 等。
4. 修改 `routes/rulesets.ts` 中的 catch 块，将 `try/catch` 改为 `next(err)` 传递给中间件：
```typescript
// 修改前
router.get('/:id', async (req, res) => {
  try {
    const ruleset = await rulesetService.findById(req.params.id);
    res.json(ruleset);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 修改后
router.get('/:id', async (req, res, next) => {
  try {
    const ruleset = await rulesetService.findById(req.params.id);
    if (!ruleset) throw new NotFoundError('Ruleset', req.params.id);
    res.json(ruleset);
  } catch (e) {
    next(e);  // 交给 errorHandler 中间件
  }
});
```

**验证标准**：`GET /rulesets/nonexistent` 返回 `{"code":"NOT_FOUND","message":"Ruleset 'nonexistent' not found"}`，HTTP 404。

---

#### 任务 3.3：自定义命令 graph_json 持久化验证

**目标**：自定义命令的画布图数据能正确保存、读取和校验。

**前置条件**：无

**当前问题位置**：`RulesetEditor.vue` L366-377

```typescript
// 当前代码——graph_json 解析失败时静默忽略
try {
  const parsed = JSON.parse(cmd.graph_json);
  // ...
} catch {
  /* keep empty */  // ← 问题：用户不知道图数据损坏
}
```

**操作步骤**：

1. 修改 catch 块，增加错误提示：
```typescript
catch (e) {
  console.error(`Custom command '${cmd.name}' graph_json parse failed:`, e);
  ElMessage.warning(`自定义命令「${cmd.name}」的画布数据损坏，已跳过`);
}
```

2. 在后端 `ruleset-service.ts` 的 `update()` 方法中增加 graph_json 验证：
```typescript
// 在保存 commands 到数据库之前
if (data.commands?.custom_commands) {
  for (const cmd of data.commands.custom_commands) {
    if (cmd.graph_json) {
      const graph = typeof cmd.graph_json === 'string' ? JSON.parse(cmd.graph_json) : cmd.graph_json;
      // 校验
      if (graph.nodes) {
        const nodeIds = new Set(graph.nodes.map((n: any) => n.node_id));
        for (const node of graph.nodes) {
          if (!node.node_id || !node.atom_type) {
            throw new ValidationError(`Custom command graph: node missing node_id or atom_type`);
          }
          if (!globalRegistry.has(node.atom_type)) {
            throw new ValidationError(`Custom command graph: unknown atom_type '${node.atom_type}'`);
          }
        }
      }
    }
  }
}
```

3. 确认前端读取链路：`findById()` 返回的 `commands` JSON → 前端解析 `custom_commands[].graph_json` → `deserializeFromGraph()` → Vue Flow nodes/edges。验证此链路是否完整。

**验证标准**：
- 创建自定义命令 + 画布图 → 保存 → 刷新页面 → 图完整恢复。
- 提交含未知 `atom_type` 的 graph_json → 后端返回 400 `VALIDATION_ERROR`。
- 损坏的 graph_json → 前端显示警告而非静默忽略。

---

### 阶段四：UI 细节打磨

#### 任务 4.1：画布预览面板增强

**目标**：预览结果更可读，支持执行步骤可视化。

**前置条件**：任务 1.3 完成

**当前预览结果数据结构**（后端返回）：
```typescript
// GraphExecuteResult
{
  success: boolean;
  output: unknown;  // output_node_id 节点的 result
  error?: string;
  logs: Array<{
    node_id: string;
    node_type: string;    // atom_type
    inputs: Record<string, unknown>;
    output: unknown;      // 该节点的 result
    duration_ms: number;
  }>;
}
```

**操作步骤**：

1. **执行步骤时间线**：在预览面板中用 `el-timeline` 组件展示 `logs` 数组，每个时间线项显示：
   - 节点名（`node_type` + `node_id` 截断前 6 位）
   - 输入值摘要
   - 输出值摘要
   - 耗时 `duration_ms`
   - 点击时调用 Vue Flow 的 `fitView({ nodes: [node_id] })` 聚焦到对应节点

2. **骰子结果高亮**：在 logs 中找到 `node_type === 'dice_roll'` 的项，提取 `output.total` 和 `output.rolls`，用大字体彩色展示。暴击（≤ crit_success_max）用绿色，大失败（≥ crit_fail_min）用红色。

3. **资源变更摘要**：在 logs 中找到 `node_type === 'resource_modify'` 或 `resource_modify_batch` 的项，汇总为 `资源名: 变更前 → 变更后 (±差值)` 格式。

4. **增加按钮**：「重新执行」（保留 mock 数据调用 `runPreview()`）和「清除结果」（重置 `previewResult` 和节点高亮）。

---

#### 任务 4.2：指令参数映射 UI 改进

**目标**：参数映射更直观，减少手动输入。

**前置条件**：无

**当前代码位置**：`RulesetEditor.vue` 中的自定义命令参数映射表（搜索 `param_mapping`）

**操作步骤**：

1. 当 source 为 `character_attribute` 或 `character_skill` 时，field 下拉列表从当前 `CharacterCardSchema` 动态生成：
```typescript
const availableAttributes = computed(() =>
  characterCardSchema.value?.attributes?.map(a => a.name) ?? []
);
const availableSkills = computed(() =>
  characterCardSchema.value?.skills?.map(s => s.name) ?? []
);
// source === 'character_attribute' 时用 availableAttributes
// source === 'character_skill' 时用 availableSkills
```

2. 增加参数类型选择（`el-select`：string/number/boolean），存入 `param_mapping[i].type`。

3. 增加参数描述字段（`el-input` placeholder="参数说明，用于生成帮助文本"）。

4. 参数名校验：blur 时检查 `/^[a-z][a-z0-9_]*$/`，不合格时红框提示。

---

#### 任务 4.3：版本管理面板增强

**目标**：版本操作更安全、信息更丰富。

**前置条件**：任务 2.2 完成（diff 算法已修复）

**操作步骤**：

1. **回滚确认**：在 `rollbackToVersion()` 调用前弹出 `ElMessageBox.confirm()`，提示「将回滚到版本 X，当前未保存的修改将丢失，是否继续？」。

2. **快照去重**：保存版本前，将当前 atoms/connections/commands/schema 序列化后计算简单 hash（如 `JSON.stringify(...).length + 某个特征值`），与最后一个版本的 snapshot 比较，相同则提示「当前内容与最新版本一致，无需保存」。

3. **自动 changelog 建议**：保存版本时，如果已有历史版本，调用 `compareVersions()` 获取 diff，自动生成 changelog 模板填入 textarea：
```
- 新增 X 个节点
- 删除 Y 个节点
- 修改 Z 个节点
- 新增 M 条连接
```

---

## 集成测试场景（每个阶段完成后执行）

### 阶段一完成后

**场景 E2E-1：完整 L1 创建与预览**
1. L1 模式创建规则集：`check_mode=roll_under`，`default_dice=1d100`，`difficulty_levels=[{普通,0},{困难,-20}]`，`crit_success_max=5`，`crit_fail_min=96`
2. 切换到 L3 模式，确认画布中包含 `dice_roll`、`character_skill_reader`、`table_lookup`（难度）、`formula_eval`、`threshold_compare`、`result_collector` 节点
3. 在预览面板点击「自动生成 mock 数据」，确认自动填充了 skill_value
4. 执行预览，确认结果包含骰子值和成功/失败判定

### 阶段二完成后

**场景 E2E-2：L1↔L3 往返**
1. 创建完整 L1 配置（含难度等级）
2. 转到 L3 模式
3. 转回 L1 模式，确认 `difficulty_levels` 完整回填
4. `check_mode`、`default_dice`、`crit_success_max`、`crit_fail_min` 应完全一致

**场景 E2E-3：版本 diff 与合并**
1. 创建规则集 A，保存版本 v1
2. 添加一个节点，保存版本 v2
3. 对比 v1 vs v2，确认 diff 显示新增节点和新增连接
4. Fork A → B，A 修改节点 X，B 也修改节点 X
5. B 执行 merge-from-parent，确认冲突 UI 弹出

### 阶段三完成后

**场景 E2E-4：校验拦截**
1. L1 模式，名称为空，骰子写 `abc`，保存 → 应被拦截
2. 自定义命令的 graph_json 中引用不存在的 `atom_type` → 后端返回 400
3. 访问 `/rulesets/不存在的id` → 返回 404 带结构化错误

---

## 技术约束与注意事项

1. **前端框架**：Vue 3 Composition API + `<script setup>` 语法，不使用 Options API。
2. **UI 库**：Element Plus，所有新 UI 组件应使用 `el-` 前缀组件。
3. **画布库**：Vue Flow（@vue-flow/core），节点和边的操作使用其 API。
4. **状态管理**：Pinia，但部分视图直接用 `ref/reactive`，新代码按现有模式即可。
5. **类型定义**：共享类型在 `packages/shared/src/types/index.ts`，新增类型应加到此文件。
6. **数据库**：MySQL + Knex，migration 文件在 `packages/server/src/db/migrations/`，新表需创建 migration。
7. **测试**：后端使用 Jest，测试文件在 `packages/server/src/__tests__/`。
8. **构建**：`pnpm --filter @trpg/client dev` 启动前端，`pnpm --filter @trpg/server dev` 启动后端。
9. **不要**修改已有的数据库 migration 文件，只能新增。
10. **不要**删除已有的原子定义或修改其端口签名（会破坏已保存的图数据），只能新增端口。
11. **不要**修改 `atom-interface.ts` 中 `AtomNode` 和 `AtomOutput` 接口签名。

## 文件定位索引

| 模块 | 关键文件路径 |
|------|-------------|
| 规则集编辑器主页 | `packages/client/src/views/creator/RulesetEditor.vue` |
| L3 画布组件 | `packages/client/src/components/rule-canvas/RuleCanvas.vue` |
| 原子节点库面板 | `packages/client/src/components/rule-canvas/AtomLibrary.vue` |
| 角色卡 Schema 编辑器 | `packages/client/src/components/rule-canvas/CharacterCardSchemaEditor.vue` |
| 原子定义 & 序列化 | `packages/client/src/utils/canvas-serializer.ts` |
| L1→L3 转换器 | `packages/client/src/utils/l1-to-l3-converter.ts` |
| L3→L1 检测器 | `packages/client/src/utils/l3-to-l1-detector.ts` |
| 招募帖字段编辑器 | `packages/client/src/components/RecruitmentFieldsEditor.vue` |
| 指令覆盖编辑器 | `packages/client/src/components/CommandOverridesEditor.vue` |
| 版本管理面板 | `packages/client/src/components/VersionPanel.vue` |
| 路由配置 | `packages/client/src/router/index.ts` |
| 后端规则集路由 | `packages/server/src/routes/rulesets.ts` |
| 后端规则集服务 | `packages/server/src/services/ruleset-service.ts` |
| 原子执行接口 | `packages/server/src/engine/atom-interface.ts` |
| 图执行器 | `packages/server/src/engine/executor.ts` |
| 原子注册表 | `packages/server/src/engine/registry.ts` |
| 原子执行器目录 | `packages/server/src/engine/atoms/` （16 个文件） |
| 骰子求值器 | `packages/server/src/engine/dice-evaluator.ts` |
| 公式求值器 | `packages/server/src/engine/formula-evaluator.ts` |
| 数据库 migration | `packages/server/src/db/migrations/` |
| 共享类型定义 | `packages/shared/src/types/index.ts` |
| E2E 测试 | `packages/server/src/__tests__/e2e/` |

---

## 执行顺序总结

```
阶段一（核心修复）→ 阶段二（转换与版本）→ 阶段三（校验与错误）→ 阶段四（UI 打磨）

1.1 统一前后端端口定义 ──┐
1.3 修复预览 mock 校验 ──┼── 可并行（1.1 和 1.3 互不依赖）
                          │
1.2 修复 L1→L3 难度注入 ─┘ ← 依赖 1.1 完成（table_lookup 端口名需统一）
         │
         ▼
2.1 完善 L3→L1 检测器 ──── ← 依赖 1.2 完成（需知道 L1→L3 生成了哪些新节点）
2.2 修复版本 diff 算法 ───┐
2.3 实现合并冲突 UI ──────┼── 可并行（2.2 和 2.3 互不依赖）
                          │
         ├────────────────┘
         ▼
3.1 L1 表单校验 ──────────┐
3.2 后端错误处理标准化 ───┼── 全部可并行
3.3 自定义命令持久化验证 ─┘
         │
         ▼
4.1 画布预览面板增强 ───── ← 依赖 1.3 完成
4.2 参数映射 UI 改进 ─────┐
4.3 版本管理面板增强 ─────┼── 4.2 可独立；4.3 依赖 2.2
                          │
         ├────────────────┘
         ▼
      运行集成测试场景 E2E-1 ~ E2E-4
```

每个任务完成后，运行 `pnpm --filter @trpg/client typecheck` 和 `pnpm --filter @trpg/server test` 确保无回归。
