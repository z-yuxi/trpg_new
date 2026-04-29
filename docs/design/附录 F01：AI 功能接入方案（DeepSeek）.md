# 附录 F01：AI 功能接入方案（DeepSeek）

> **版本**：V1.0
> **状态**：草案
> **前置依赖**：附录 F（AI 功能产品设计）、附录 H01（会员权限与商业化口径）
> **核心决策**：选用 DeepSeek 最新模型作为 AI 功能的统一后端引擎，区分 flash/pro 两个端点以平衡成本和体验。

---

## 一、模型选择与端点规划

### 1.1 为什么分开用两个端点

AI 功能的体验由两个互相矛盾的因素决定：**响应速度**和**推理质量**。TRPG 场景的特点是"有些任务用户愿意等，有些完全不能等"。

| 任务类型 | 用户心理预期 | 需要什么 |
|:---|:---|:---|
| 模组导入 | "我上传了一份 50 页的 word，去喝杯水回来看结果" | 推理质量优先，延迟可容忍 |
| 日志摘要 | "跑团刚结束，我点一下，等几秒看回顾" | 同上 |
| 智能校对 | "我点校对，光标还在闪，最好马上给我标出来" | 响应速度优先，延迟不可容忍 |

所以用两个端点：

| 端点 | 适用任务 | 核心优势 | 延迟预期 |
|:---|:---|:---|:---|
| **pro** | 模组导入、日志摘要 | 最大上下文、最强推理、复杂结构化输出 | 5-30 秒可接受 |
| **flash** | 智能校对、术语统一 | 低延迟、成本极低、高频调用无压力 | < 2 秒 |

### 1.2 模型版本锁定

不锁定具体版本号（如 `deepseek-v4-xxx`），而是通过配置文件管理，方便后续热切换。

```typescript
// config/ai.config.ts
export const aiConfig = {
  // 生产环境从环境变量读取，防止泄露
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseUrl: 'https://api.deepseek.com/v1',
  
  endpoints: {
    pro: {
      model: process.env.DEEPSEEK_PRO_MODEL || 'deepseek-chat',
      maxTokens: 16384,
      temperature: 0.3,   // 结构化输出保持低温度
    },
    flash: {
      model: process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-chat',
      maxTokens: 4096,
      temperature: 0.1,   // 校对任务几乎不需要随机性
    },
  },
  
  // 调用限制（与会员体系对接）
  rateLimit: {
    free: { daily: 0 },           // 免费用户暂不开放 AI 功能
    pro: { daily: 5 },            // 专业版每日 5 次
    creator: { daily: 15 },       // 创作者版每日 15 次
  },
};
```

---

## 二、三个 P0/P1 功能的 Prompt 工程设计

### 2.1 模组导入（pro）

**目标**：用户上传 Word/TXT/Markdown 文档，AI 识别文档中的场景、NPC、线索、事件，输出结构化 JSON，前端根据 JSON 自动创建实体并回填 Mention 到编辑器。

**核心 Prompt 模板**：

````markdown
你是一个 TRPG 模组结构分析器。你的任务是将用户上传的跑团模组文档，解析为结构化的 JSON 数据。

## 你必须遵守的规则
1. 不要修改原文的任何句子、段落、标点符号。
2. 不要添加原文中不存在的任何信息。
3. 不要对原文做任何润色、缩写、改写。
4. 骰子表达式（1d100、2d6、3d10 等）和规则术语（SAN、HP、DC、检定等）必须原样保留。
5. 中文人名、地点名必须保留原文写法，不要翻译成英文，也不要猜测其含义。

## 你需要识别并输出的实体类型

### 1. 场景（Scene）
- 识别标准：一个明确的地点、区域、空间名称，且该地点的首次描述包含环境细节（声音、气味、光线、天气等）
- 输出字段：`entityType: "scene"`, `entityId`(从scene_001递增), `name`, `description`, `keyDetails`(提取到的环境描写原文)

### 2. NPC（Non-Player Character）
- 识别标准：有名字的、可交互的非玩家角色，且原文明确描述了其外貌、性格、职业或至少一项明显特征
- 输出字段：`entityType: "npc"`, `entityId`(从npc_001递增), `name`, `description`, `location`(该NPC出现的地点/场景), `traits`(性格/外貌/口头禅等特征)

### 3. 线索（Clue）
- 识别标准：需要玩家发现/收集的关键信息、物品、证据、神秘信息；必须是完整的一条线索，而不是零碎的环境描述
- 输出字段：`entityType: "clue"`, `entityId`(从clue_001递增), `title`(简短概括), `content`(完整线索信息), `location`(线索所在地点/场景), `type`(选填：letter/legend/item/dialog/twist)

### 4. 事件/触发器（Event）
- 识别标准：原文明确描述了"当玩家角色做出某行为时，会触发特定的结果"的逻辑
- 输出字段：`entityType: "event"`, `entityId`(从event_001递增), `trigger`(触发条件), `effect`(触发效果), `condition`(检定条件，如有), `location`
- 注意：如果没有明确的触发器描述，不要强行创建事件实体

### 5. 检定（Check）
- 识别标准：原文明确提到了需要掷骰子进行检定的地方（如"进行一次侦查检定"、"需要成功通过 DC 15 的感知豁免"）
- 输出字段：`entityType: "check"`, `entityId`(从check_001递增), `name`, `skill`(技能名称), `difficulty`(难度), `location`

## JSON 输出格式
```json
{
  "moduleTitle": "模组标题",
  "moduleSummary": "两句话以内概括模组核心剧情",
  "entities": [
    {
      "entityType": "scene",
      "entityId": "scene_001",
      "name": "...",
      "description": "...",
      "keyDetails": "..."
    }
  ],
  "warnings": ["任何解析不清楚的地方写在这里，如无法确定某个提及的地名是场景还是单纯的地名"]
}
```

## 输出方式
直接输出 JSON，不要加任何解释文字，不要用 markdown 代码块包裹。
````

**调用接口**：

```typescript
// POST /api/v1/ai/import-module
interface ModuleImportRequest {
  content: string;                 // 文档全文
  format: 'txt' | 'docx' | 'markdown';
  userId: string;
  idempotent_key: string;
}

interface ModuleImportResponse {
  taskId: string;                  // 异步任务 ID
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: {
    entities: RecognizedEntity[];
    warnings: string[];
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  };
}
```

### 2.2 智能校对（flash）

**目标**：用户点击编辑器中的"AI 校对"按钮，系统在 2 秒内返回所有错误标记和修改建议。

**核心 Prompt 模板**：

````markdown
你是一个 TRPG 模组校对助手。你的任务是检查并标出用户文本中的四类问题，每一类给出修改建议，但不要执行修改。

## 你必须严格保护的规则
1. **骰子表达式**：1d100、2d6、3d10、1d20+5 等，一个字都不能动。
2. **规则术语**：SAN、HP、DC、AC、DEX、STR、检定、豁免、先攻、熟练加值 等，不要改动。
3. **TRPG 专有名词**：COC、DND、克苏鲁、龙与地下城、守秘人、KP、GM 等，不要改动。
4. **角色名、地名、物品名**：不要改动。

## 你需要检查的四类问题
1. **错别字**：明显的中文错别字。
2. **标点符号不规范**：中英文标点混用、省略号不是"……"而是"..."、引号混用。
3. **术语不一致**：同一个概念前后用了不同的词（如"检定"和"判定"混用，"SAN值"和"理智值"交替出现）。
4. **角色名/地名不一致**：同一个角色前面叫"老罗"后面叫"罗老板"，给出了统一建议。

## JSON 输出格式
```json
{
  "totalIssues": 5,
  "issues": [
    {
      "position": {
        "paragraphIndex": 2,
        "startOffset": 45,
        "endOffset": 48
      },
      "type": "typo",
      "original": "推开门",
      "suggestion": "推开了门",
      "reason": "可能的错别字：'推开门'缺少了'了'",
      "confidence": 0.92
    },
    {
      "position": {
        "paragraphIndex": 5,
        "startOffset": 12,
        "endOffset": 23
      },
      "type": "terminology",
      "original": "进行判定",
      "suggestion": "进行检定",
      "reason": "术语不一致：前文使用'检定'，此处使用'判定'",
      "confidence": 0.95
    }
  ]
}
```

## 输出方式
直接输出 JSON，不要加任何解释文字，不要用 markdown 代码块包裹。
````

**调用接口**：

```typescript
// POST /api/v1/ai/check-text
interface TextCheckRequest {
  content: string;                  // 需要校对的一段文本（单次最多 5000 字）
  moduleId?: string;                // 关联模组 ID（用于术语白名单）
  customTerms?: string[];           // 用户自定义白名单术语
  userId: string;
  idempotent_key: string;
}

interface TextCheckResponse {
  totalIssues: number;
  issues: CheckIssue[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  };
}
```

### 2.3 跑团日志摘要（pro）

**目标**：用户点击"AI 生成摘要"，系统从完整的跑团日志 JSON 中生成 300-500 字的剧情回顾。

**核心 Prompt 模板**：

````markdown
你是一个跑团复盘助手。你收到了一份完整的跑团日志（ILF 格式），需要生成以下内容：

## 输出要求
1. 一段 **300-500 字**的剧情回顾，用"本团讲述了……"开头
2. 回顾应包含：核心冲突是什么、玩家角色做了哪些关键决定、最终结局如何
3. 使用"时间+事件"的结构：例如"第一日 20:00，调查员们抵达酒馆……"
4. 出现的所有角色名必须用双引号包裹，如"老罗"、"调查员张三"、"侦探"
5. 保持客观中立，不要评价玩家的表现或选择

## JSON 输出格式
```json
{
  "summaryTitle": "15 字以内的标题",
  "summary": "300-500 字的剧情回顾全文",
  "playerCharacters": ["玩家角色名列表"],
  "keyMoments": [
    { "time": "第1日 20:00", "description": "关键剧情节点描述", "who": ["参与者角色名"] }
  ],
  "wordCount": 0
}
```

## 输出方式
直接输出 JSON，不要加任何解释文字，不要用 markdown 代码块包裹。

## 日志内容
{日志 JSON}
````
### 2.4 规则生成（pro）

#### 2.4.1 目标

创作者在规则工坊的 Recipe 编辑器中，选择“AI 辅助生成”，用自然语言描述一条游戏规则。系统自动分析描述，输出可预填到 Recipe 编辑表单的结构化 JSON，创作者检查无误后保存，正常编译为 `{ atoms, connections }`。

#### 2.4.2 核心 Prompt 模板

````markdown
你是一个 TRPG 规则引擎的配置生成器。你的任务是将用户提供的自然语言规则描述，转换为指定的 Recipe 参数 JSON 格式。

## 可用的 Recipe 类型及参数定义（完整 9 种类型）

### 1. threshold_check（阈值检定）
```typescript
{
  dice_expression: string;        // 例如 "1d100"、"1d20"
  target_source: 'skill' | 'attribute' | 'fixed' | 'formula';
  target_ref?: string;            // 技能名如 "侦查"，或属性名如 "STR"
  target_fixed?: number;          // 当 target_source='fixed' 时
  target_formula?: string;        // 当 target_source='formula' 时
  success_direction: 'lte' | 'gte'; // lte=掷低成功(COC)，gte=掷高成功(DND)
  modifier_sources?: Array<{
    source: 'attribute_mod' | 'proficiency' | 'fixed' | 'formula';
    ref?: string;
    value?: number;
    formula?: string;
  }>;
  difficulty?: {
    mode: 'divisor' | 'none';
    divisors?: number[];          // [1,2,5] = 常规/困难/极难
    default_level?: number;       // 默认难度索引
  };
  advantage_system?: {
    enabled: boolean;
    extra_dice: number;           // 通常 1
    keep: 'highest' | 'lowest';
  };
  tiers: Array<{
    name: string;                  // 程序标识 "critical"、"extreme" 等
    label: string;                 // 显示名 "大成功"、"极难成功" 等
    condition: string;             // 表达式，变量：roll, target, natural_roll, total
    is_success: boolean;
  }>;
}
2. opposed_check（对抗检定）
typescript
{
  attacker: {
    dice_expression: string;
    target_source: 'skill' | 'attribute';
    target_ref: string;
  };
  defender: {
    dice_expression: string;
    target_source: 'skill' | 'attribute';
    target_ref: string;
  };
  resolution: 'tier_compare' | 'value_compare'; // 比较方式
  tie_rule: 'attacker_wins' | 'defender_wins' | 'reroll';
}
3. resource_modify（资源修改）
typescript
{
  resource_ref: string;           // "hp"、"mp"、"san" 等
  delta: {
    mode: 'fixed' | 'dice' | 'formula';
    value?: number;               // fixed 模式
    expression?: string;          // dice 或 formula 模式
  };
  direction: 'decrease' | 'increase';
  clamp_min?: number | 'zero';
  clamp_max?: 'resource_max' | number;
  on_zero?: string;               // 归零时触发的事件ID
  on_overflow?: string;           // 溢出时触发的事件ID
}
4. random_table（随机表）
typescript
{
  dice_expression: string;        // "1d10"
  entries: Array<{
    range: [number, number];      // 如 [1,3]
    result: string;               // 结果文本
    effect_recipe_id?: string;    // 可触发其他配方
  }>;
}
5. initiative（先攻排序）
typescript
{
  formula: string;                 // "1d20 + attr.DEX_mod"
  sort_order: 'desc' | 'asc';
  tiebreaker?: string;             // 平局参考属性
}
6. growth_check（成长检定）
typescript
{
  check_dice: string;              // "1d100"
  check_condition: string;         // "roll > current_value"
  growth_dice: string;             // "1d10"
  growth_target: 'skill' | 'attribute';
  max_value: number;
}
7. accumulation（累积判定）
typescript
{
  dice_expression: string;
  success_condition: string;
  success_target: number;          // 需要累计的成功次数
  failure_target: number;          // 需要累计的失败次数
  critical_success_effect?: string;
  critical_failure_effect?: string;
  on_success_reached: string;
  on_failure_reached: string;
}
8. chain（连锁配方）
typescript
{
  steps: Array<{
    step_id: string;
    recipe_ref: string;            // 引用其他配方ID（不能是chain）
    input_mapping?: Record<string, string>;
    condition?: {
      depends_on: string;          // 依赖的 step_id
      when: 'success' | 'failure' | 'always' | 'expression';
      expression?: string;         // 当 when='expression' 时
    };
  }>;
}
9. raw（原始原子图，高级模式，一般不主动使用）
typescript
{
  atoms: Array<{
    id: string;                    // 节点ID
    type: string;                  // 原子类型
    config: Record<string, any>;   // 节点配置
  }>;
  connections: Array<{
    from: string;                  // "节点ID.输出端口"
    to: string;                    // "节点ID.输入端口"
  }>;
  entry_atom_id: string;
  output_atom_id: string;
}
表达式语法
运算：+, -, *, /, %，==, !=, <, <=, >, >=, &&, ||

变量：roll, target, natural_roll, total, attrs.XXX, skills.XXX, resources.XXX

函数：floor, ceil, round, min, max, abs

常见规则映射参考
COC 7th 技能检定 → threshold_check
dice_expression: "1d100"

target_source: "skill", target_ref: "{skill}"

success_direction: "lte"

tiers:

critical: "roll == 1"

extreme: "roll <= target / 5"

hard: "roll <= target / 2"

regular: "roll <= target"

fail: "true" (is_success: false)

特殊失败：大失败 "(roll >= 96 && target < 50) || roll == 100"（添加为单独的fail前tier）

DND5e 属性检定 → threshold_check
dice_expression: "1d20"

target_source: "fixed", target_ref: "DC"

success_direction: "gte"

modifier_sources 包括 attribute_mod 和 proficiency

tiers: critical("natural_roll == 20"), success("total >= DC"), fail("true", false)

伤害掷骰 → resource_modify
direction: "decrease"

delta: { mode: "dice", expression: "1d8+2" }

resource_ref: "hp"

攻击流程 → chain
step1: 命中检定（threshold_check）

step2: 伤害掷骰（resource_modify），condition: depends_on=step1, when="success"

输出要求
直接输出 JSON，不含 markdown 标记，不含解释文字：

json
{
  "detectedRecipeType": "threshold_check",
  "confidence": 0.95,
  "recipe": {
    "id": "generated_rule_001",
    "type": "threshold_check",
    "name": "自动生成的规则名称",
    "params": { /* 完整的 Recipe 参数对象 */ }
  },
  "notes": "任何无法确定或需要人工检查的地方"
}
收到的用户描述：

text

#### 2.4.3 与编辑器整合的交互细则

##### 入口

在规则工坊的 Recipe 编辑器顶部，增加一个「✨ AI 生成」按钮。点击后弹出模态框：

```
┌─────────────────────────────────────────────────┐
│ AI 辅助生成规则                                  │
│                                                 │
│ 请用自然语言描述你的游戏规则，                     │
│ AI 将自动识别规则类型并预填表单：                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ 例如：玩家进行技能检定，掷1d100。            │ │
│ │ 如果结果小于等于技能值则成功，                │ │
│ │ 1为大成功，96-100且技能<50为大失败...        │ │
│ └─────────────────────────────────────────────┘ │
│                                      [取消] [生成]│
└─────────────────────────────────────────────────┘
```

##### 调用与反馈

| 状态 | 前端反馈 | 后端动作 | 异常处理 |
|:---|:---|:---|:---|
| 点击【生成】 | 按钮显示 loading，弹出任务已提交提示 | 创建异步任务，返回 `taskId`，通过 Redis 队列调用 DeepSeek pro 端点 | 网络问题 → 进入重试队列 |
| 生成中 | 模态框切换为“生成中”状态，显示进度条（非精确进度，仅表示未完成） | Worker 执行 Prompt 并等待响应 | 超时（30s）→ 返回超时错误 |
| 生成完成 | 模态框关闭，Recipe 编辑表单自动填入所有字段。顶部显示横幅：“AI 已生成规则草案，请仔细检查所有字段后再保存。” | - | - |
| 生成失败 | 模态框显示错误信息：“生成失败，请检查网络后重试或改用手动编辑。” | 记录失败日志，不消耗使用次数 | 用户可点击【重试】或【放弃，手动编辑】 |
| 置信度 < 0.8 | 生成结果仍预填表单，但顶部横幅变为警告色：“⚠️ AI 对本次生成的置信度较低（{confidence}），强烈建议逐字段核实。” | 无 | - |

##### 后续操作

生成后，创作者必须在 Recipe 编辑表单中：
1. 检查每个字段是否正确（尤其是 tiers 条件表达式）。
2. 修改 `id`、`name` 等非业务字段。
3. 点击【保存】→ 正常触发编译流程，产出 `{ atoms, connections }`。

**关键原则**：AI 生成的结果是“草案”，必须经人工确认后才能编译入库。不允许不经过表单预览直接保存。

#### 2.4.4 会员调用限制

| 会员等级 | 规则生成次数 | 备注 |
|:---|:---|:---|
| 免费版 | 0 | 暂不开放 |
| 专业版 | 3 次/月 | 满足轻度规则魔改需求 |
| 创作者版 | 10 次/月 | 满足规则包创作需求 |

每次调用计入 `ai_usage_log` 表，task_type 为 `generate_recipe`，endpoint 为 `pro`。

#### 2.4.5 前端加载方式

规则生成功能及其模态框通过 `dynamic import` 在用户首次点击「✨ AI 生成」时加载，避免影响编辑器首屏性能。若用户关闭了 AI 功能（隐私设置），该按钮不渲染。

---

## 三、与会员体系的对接

### 3.1 调用次数限制

| 会员等级 | 模组导入（pro） | 智能校对（flash） | 日志摘要（pro） | 说明 |
|:---|:---|:---|:---|:---|
| 免费版 | 0 | 0 | 0 | 公测/早期暂不开放 |
| 专业版 | 3 次/月 | 20 次/月 | 5 次/月 | 满足轻度 GM 需求 |
| 创作者版 | 10 次/月 | 100 次/月 | 15 次/月 | 满足高频创作需求 |

### 3.2 计费统计

每次 AI 调用写入 `ai_usage_log` 表：

```sql
CREATE TABLE ai_usage_log (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  task_type ENUM('import_module', 'check_text', 'log_summary') NOT NULL,
  endpoint ENUM('pro', 'flash') NOT NULL,
  status ENUM('success', 'failed', 'queued') NOT NULL,
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  cost_cents INT NOT NULL COMMENT '消耗费用（单位：分）',
  duration_ms INT NOT NULL COMMENT 'API 调用耗时（毫秒）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_month (user_id, task_type, created_at)
);
```

### 3.3 每月额度重置

通过定时任务在每月 1 日 00:00 重置所有用户的 AI 使用计数。当月剩余次数通过 API 实时查询：

```typescript
// GET /api/v1/ai/quota
interface AIQuotaResponse {
  quotas: {
    importModule: { used: number; limit: number };
    checkText: { used: number; limit: number };
    logSummary: { used: number; limit: number };
  };
}
```

---

## 四、异步任务架构

AI 调用（尤其是 pro 端点的模组导入）耗时较长，必须通过异步任务处理，避免阻塞 HTTP 请求。

### 4.1 任务队列设计

```
用户提交请求 → HTTP API 立即返回 taskId
         ↓
   Redis 队列（BullMQ）
         ↓
   Worker 进程调用 DeepSeek API
         ↓
   完成后通知：
   - 服务端通过 Socket.IO 推送给用户 taskId 对应的状态变化
   - 或用户通过 GET /api/v1/ai/tasks/{taskId} 轮询
```

### 4.2 API 设计

```typescript
// POST /api/v1/ai/import-module → 提交任务
// 返回 { taskId: "ai_task_abc123", status: "queued" }

// GET /api/v1/ai/tasks/{taskId} → 查询任务状态
// 返回 { taskId, status: "processing" | "completed" | "failed", result?, error? }
```

### 4.3 重试与降级

- API 调用失败（超时/服务端错误）自动重试 2 次，间隔 3s、9s。
- 3 次均失败后，任务状态变为 `failed`，**不计入用户的使用次数**。
- 对用户提示：“AI 暂时不可用，请稍后重试。本次不会消耗您的使用次数。”

---

## 五、安全与合规

### 5.1 输入消毒

- 所有用户提交的文本在发送给 DeepSeek API 前，经过以下处理：
  - 删除长度 > 500 字符的连续无意义字符串（防垃圾输入）
  - 检测并拒绝包含代码注入特征的 payload（如 `ignore previous instructions`）

### 5.2 输出过滤

- 所有模型返回的 JSON 在返回给前端前，校验结构是否符合预期 Schema
- JSON 以外的格式（如纯文本、markdown 块）转换为兼容格式后返回

### 5.3 数据隐私

- 提交给 DeepSeek API 的内容**仅用于当次任务**，不存储在 DeepSeek 侧
- 平台明确声明：用户跑团日志、模组内容**绝不用于**模型训练
- 用户可随时在“设置 → 隐私 → AI”中彻底关闭 AI 功能，关闭后所有 AI 入口隐藏

### 5.4 Prompt 注入防护

- 用户输入中若检测到以下模式，拒绝处理并返回该用户不可见的日志告警标记：
  - “忽略/无视之前的指令”
  - “你现在是 / 你现在扮演”
  - “以管理员身份”
  - “system:”、“prompt:”等越权前缀

---

## 六、前端加载策略

- 所有 AI 功能的代码均通过 `dynamic import` 拆分为独立 chunk。
- 用户点击第一个 AI 入口时，前端才开始加载对应的 JS 模块。
- 若用户关闭了 AI 功能（通过隐私设置），AI 模块永不加载。

---

## 七、后续迭代方向（P2）

- **AI 跑团助理**：GM 在导演模式中可调用 AI 辅助生成场景描述、NPC 对白
- **AI 角色卡生成**：输入一段角色背景描述，AI 自动填入角色卡字段
- **AI 战斗日志整理**：将骰子结果自动转化为可读的战斗描述

---

> **本附录状态**：草案，待评审。Prompt 内容为工程参考，实际效果需在接入后再迭代优化。