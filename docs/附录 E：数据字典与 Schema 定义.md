

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-04-08 | 从原 Excel 蓝图和附录 G 抽取，适配轻量节点图架构 |
1. `scene_participations`：**实时状态表**，记录角色的进出，用于消息可见性的动态计算。  
2. `narrative_fragments.participants`：**历史快照字段**，在生成日志片段时固化，确保导出内容的准确性和性能。两者分工不同，不冲突。
---

## 1. 数据表 Schema

以下数据表用于存储静态定义数据（技能、物品、状态、职业等），所有表均遵循 **P-003 数据无逻辑** 原则：只存储数值与标识符，不嵌入行为逻辑（如 if-then、条件表达式）。

### 1.1 character_templates（角色模板表）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| template_id | string | 是 | 模板唯一标识 |
| version | string | 是 | 版本号 |
| attributes[] | array | 是 | 属性定义列表（如 `["str","con","dex"]`） |
| skills[] | array | 是 | 技能定义列表 |
| resources[] | array | 是 | 资源定义列表（如 `["hp","mp"]`） |
| derived_formulas[] | array | 否 | 派生值计算公式列表 |

### 1.2 skill_definitions（技能定义表）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| skill_id | string | 是 | 技能唯一标识（如 `"skill_listen"`） |
| display_name | string | 是 | 显示名称（如 `"聆听"`） |
| base_attribute | string | 是 | 关联的基础属性（如 `"int"`） |
| category | string | 是 | 分类（如 `"combat"`, `"social"`） |
| default_value | number | 是 | 默认值（如 `0`） |
| max_value | number | 否 | 最大值限制 |
| growth_method | string | 否 | 成长方式（`"check_mark"`, `"point_buy"`） |

### 1.3 item_definitions（物品定义表）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| item_id | string | 是 | 物品唯一标识 |
| display_name | string | 是 | 显示名称 |
| category | string | 是 | 分类（`"weapon"`, `"armor"`, `"consumable"`, `"tool"`） |
| properties{} | object | 否 | 属性键值对（如 `{"damage":"1d8","finesse":true}`） |
| effects[] | array | 否 | 效果链 ID 列表 |

### 1.4 status_effects（状态效果表）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status_id | string | 是 | 状态唯一标识（如 `"status_prone"`） |
| display_name | string | 是 | 显示名称 |
| category | string | 是 | 分类（`"buff"`, `"debuff"`, `"condition"`） |
| duration_type | string | 是 | 持续时间类型（`"rounds"`, `"minutes"`, `"permanent"`） |
| stackable | boolean | 否 | 是否可叠加 |
| mutual_exclusive[] | array | 否 | 互斥的状态 ID 列表 |

### 1.5 occupation_definitions（职业定义表）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| occupation_id | string | 是 | 职业唯一标识 |
| display_name | string | 是 | 显示名称 |
| credit_rating_range | object | 否 | 信用评级范围 `{min, max}`（COC） |
| skill_bindings[] | array | 是 | 技能绑定列表（如 `[{"skill_ref":"library","value":20}]`） |
| special_traits[] | array | 否 | 特殊特性 ID 列表 |

---

## 2. 运行时数据结构

以下结构用于内存中的运行时数据交换。

### 2.1 CharacterCard（角色卡）

| 顶层字段                   | 类型                                | 说明                                                |
| ---------------------- | --------------------------------- | ------------------------------------------------- |
| card_id                | string                            | 角色卡唯一标识                                           |
| template_ref           | string                            | 引用的角色模板 ID                                        |
| attributes             | Record<string, number>            | 基础属性键值对（如 `{"str":65, "con":50}`）                 |
| skills                 | Record<string, number>            | 技能值键值对（如 `{"侦查":50, "图书馆":40}`）                   |
| resources              | Record<string, ResourceState>     | 资源池状态（当前值/最大值），如 `{"hp":{"current":10,"max":10}}` |
| statuses               | StatusInstance[]                  | 当前生效的状态列表（含剩余时间/层数）                               |
| **avatar_custom_data** | **AvatarCustomData \| undefined** | **拼拼乐捏人配置，见下方接口定义**                               |
| **initial_snapshot**   | **object \| undefined**           | **创建时初始快照，用于重置功能**                                |


// [REVISED] 角色立绘捏人数据结构 - 技术规范版
// 美术资源生产规范见内部美术文档，此处仅定义程序接口
interface AvatarCustomDataBase {
  gender: 'male' | 'female';
  body_base: string;           // body_base_m 或 body_base_f
  body_skin: string;           // 皮肤色号ID（滤镜换色）
  brow: string;                // 眉毛款式ID，如 "brow_01"
  eye_base: string;            // 眼白眼眶ID，如 "eye_01_base"
  pupil: string;               // 瞳孔ID，如 "eye_01_pupil"（滤镜换色）
  mouth: string;               // 嘴巴款式ID，如 "mouth_01"
  hair_back: string;           // 后发套系ID，如 "hair_01"
  hair_front: string;          // 前发片套系ID，如 "hair_01"
  cloth_inner: string;         // 内搭套系ID，如 "cloth_01"
  cloth_outer: string;         // 外套套系ID，如 "cloth_01"
  acc_glasses?: string;        // 眼镜款式ID，如 "acc_glasses_01"
}

interface MaleAvatarData extends AvatarCustomDataBase {
  gender: 'male';
  // 男性无鬓发拆分，hair_back已包含鬓角区域
}

interface FemaleAvatarData extends AvatarCustomDataBase {
  gender: 'female';
  hair_side_L?: string;        // 左鬓发套系ID（可选）
  hair_side_R?: string;        // 右鬓发套系ID（可选）
  acc_necklace?: string;       // 项链款式ID（可选），如 "acc_necklace_01"
}

type AvatarCustomData = MaleAvatarData | FemaleAvatarData;

// 文件命名规则（前端拼接URL用）
// {部件}_{ID}[_side_{L|R}]_{line|color}.png
// 示例：hair_01_back_color.png, hair_01_side_L_line.png, cloth_02_inner_color.png

// 图层合成顺序（从下到上，z-index递增）：
// 1. body_skin_{gender}      // 肤色层（滤镜换色）
// 2. body_base_{gender}      // 身体线稿
// 3. eye_base                // 眼白眼眶
// 4. pupil                   // 瞳孔（滤镜换色）
// 5. brow                    // 眉毛
// 6. mouth                   // 嘴巴
// 7. hair_back_color → hair_back_line         // 后发
// 8. hair_front_color → hair_front_line       // 前发片
// 9. [女性] hair_side_L_color → hair_side_L_line   // 左鬓发
// 10. [女性] hair_side_R_color → hair_side_R_line  // 右鬓发
// 11. cloth_inner_color → cloth_inner_line    // 内搭
// 12. cloth_outer_color → cloth_outer_line    // 外套
// 13. [女性] acc_necklace                     // 项链
// 14. acc_glasses                             // 眼镜

// 画布规格：1024×1024，PNG透明背景，角色居中半身像


interface CharacterCard {
  card_id: string;
  template_ref: string;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, ResourceState>;
  statuses: StatusInstance[];
  
  // [ADDED] 拼拼乐捏人数据
  avatar_custom_data?: AvatarCustomData;


  // [ADDED] 创建时初始快照，用于重置功能
  // 存储角色卡创建时的完整状态，支持"一键重置为初始状态"
  initial_snapshot?: {
    attributes: Record<string, number>;           // 基础属性副本
    skills: Record<string, number>;               // 技能值副本（含职业点、兴趣点分配）
    equipment: Array<{                            // 装备列表副本
      item_id: string;                             // 物品定义ID
      name: string;                                // 物品名称（快照时固化）
      quantity?: number;                           // 数量，默认为1
    }>;
    resources?: Record<string, { max: number }>; // 资源最大值副本（如HP/MP上限）
  };


  
  equipment: string[];
  background?: string;
}





> **ResourceState** 结构：`{ current: number, max: number, temp?: number }`

### 2.2 SessionContext（会话上下文）

| 顶层字段 | 类型 | 说明 |
|----------|------|------|
| session_id | string | 会话唯一标识 |
| ruleset_id | string | 当前加载的规则包 ID |
| participants | ActorRef[] | 参与者列表（角色引用） |
| round_state | RoundState \| null | 回合状态（仅当启用回合制时存在） |

> **RoundState** 结构（轻量）：`{ round_number: number, turn_order: string[], current_index: number }`


```typescript
/**
 * 招募帖表单数据（发帖时提交的结构）
 * 存储于 recruitment_posts 表的 car_rules JSON 字段中
 */
interface RecruitmentFormData {
  // 共性字段（所有规则包共有，用于筛选）
  ruleset_id: string;
  type: 'gm_recruit' | 'player_seek';
  player_count_current: number;
  player_count_max: number;
  schedule_time: string;
  frequency: string;           // 每周1次 / 每周2-3次 / 人齐后定
  total_duration: string;      // 短团(<10h) / 中团(10-30h) / 长团(>30h)
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  allow_ob: boolean;
  has_secret_ho: boolean;
  description: string;
  
  // 模组状态（成团时确认）
  module_status: 'selected' | 'pending' | 'none';
  module_id?: string;
  
  // 规则专属字段（由 recruitment_fields 动态生成）
  custom_rules: Record<string, any>;
}
```


### 2.3 招募帖表单数据结构

```typescript
interface RecruitmentFormData {
  // 共性字段（所有规则包共有，用于筛选）
  ruleset_id: string;
  type: 'gm_recruit' | 'player_seek';
  player_count_current: number;
  player_count_max: number;
  schedule_time: string;
  frequency: string;           // 每周1次 / 每周2-3次 / 人齐后定
  total_duration: string;      // 短团(<10h) / 中团(10-30h) / 长团(>30h)
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  allow_ob: boolean;
  has_secret_ho: boolean;
  description: string;
  
  // 模组状态（成团时确认）
  module_status: 'selected' | 'pending' | 'none';
  module_id?: string;
  
  // 规则专属字段（由 recruitment_fields 动态生成）
  custom_rules: Record<string, any>;
}
```

### 2.4 预约移动与位置数据结构

TypeScript

复制

```typescript
interface ScheduledMove {
  id: string;
  character_id: string;
  campaign_id: string;
  to_scene_id: string;
  travel_method?: 'walk' | 'bike' | 'drive';  // 启用场景连通时
  execute_at_story: StoryTime;                 // 剧情时间到达时执行
  status: 'pending' | 'approved' | 'executed' | 'cancelled';
  created_at: Timestamp;
  approved_at?: Timestamp;
  executed_at?: Timestamp;
}

interface PositionHistory {
  id: string;
  campaign_id: string;
  character_id: string;
  scene_id: string;
  story_time_entered: StoryTime;   // 进入时间
  story_time_left?: StoryTime;       // 离开时间，NULL表示仍在
  move_type: 'scheduled' | 'force_move' | 'join' | 'leave';
}
```

### 2.5 角色卡运行时实例结构

TypeScript

复制

```typescript
interface CharacterInstance {
  id: string;
  character_id: string;            // 关联 CharacterCard 模板
  campaign_id: string;
  user_id: string;
  
  // 按团隔离的状态（与模板分离）
  current_hp: number;
  current_mp: number;
  current_resources: Record<string, ResourceState>;
  temporary_effects: Array<{
    effect_id: string;
    remaining_rounds?: number;
    source: string;
  }>;
  
  // 位置与时间
  current_spatial_scene_id?: string;
  personal_story_time: StoryTime;
  scheduled_move_id?: string;
  
  status: 'active' | 'left' | 'dead';
  joined_at: Timestamp;
  left_at?: Timestamp;
}
```

### 2.6 通用类型定义

TypeScript

复制

```typescript
// 剧情时间：{ day, hour, minute }
interface StoryTime {
  day: number;
  hour: number;      // 0-23
  minute: number;    // 0-59
}

// 雪花ID：19位数字，全局单调递增
type SnowflakeId = string;  // 如 "1234567890123456789"
```



---

## 3. 部署配置与性能基线

### 3.1 推荐配置

| 配置项     | 推荐值              | 说明             |
| ------- | ---------------- | -------------- |
| CPU     | 2 核              | 引擎核心计算         |
| 内存      | 4 GB             | 规则包+角色卡缓存      |
| 存储      | 20 GB SSD        | 规则包、日志、备份      |
| 带宽      | 200 Mbps         | WebSocket 推送   |
| 操作系统    | Ubuntu 22.04 LTS | —              |
| Node.js | v20 LTS          | TypeScript 运行时 |
| 数据库     | PostgreSQL 15+   | 数据持久化          |
| 缓存      | Redis 7+         | 会话/角色卡热缓存      |

### 3.2 性能基线

| 指标 | 目标值 (p99) | 说明 |
|------|--------------|------|
| 骰子投掷延迟 | <5ms | 单次骰子表达式解析与求值 |
| 完整检定流程延迟 | <20ms | 从指令输入到结果返回 |
| 规则包加载（含继承合并） | <2s | 首次加载或热重载 |
| 热重载延迟 | <500ms | 增量校验+原子切换 |
| 并发会话数 | 100+ | 单实例 |
| 单会话角色数 | 50+ | 含 NPC |

### 3.3 监控告警规则

| 指标 | 告警阈值 | 说明 |
|------|----------|------|
| 内存使用率 | >80% | 触发扩容或缓存清理 |
| CPU 使用率 | >70% 持续 5 分钟 | 检查热点组件或规则包 |
| 检定响应 P99 | >200ms | 检查规则包复杂度或性能瓶颈 |
| WebSocket 连接数 | >安全并发值的 90% | 准备水平扩展 |
| 组件执行超时/错误率 | >1% 请求失败 | 排查规则包或引擎 Bug |

---

## 4. 设计原则与校验

### 4.1 零硬编码检查清单

引擎核心代码（规则无关部分）不得包含任何特定 TRPG 系统的字面量。

#### 4.1.1 禁用词汇正则表达式

```regex
/\b(d100|d20|d6|d8|d10|d12|SAN|HP|MP|COC|DND|STR|DEX|CON|INT|WIS|CHA|POW|SIZ|APP|EDU)\b/i
```

#### 4.1.2 扫描范围

| 扫描目标 | 文件类型 | 说明 |
|----------|----------|------|
| 引擎核心源代码 | `.ts`, `.js` | 所有实现代码 |
| 规则包加载器 | `.ts`, `.js` | 不得内置规则特定逻辑 |
| 节点实现代码 | `.ts`, `.js` | 预置节点也不应包含规则特定字面量 |

#### 4.1.3 例外情况

以下位置允许出现系统特定词汇，不触发告警：
- **规则包 YAML 文件**（配置层）
- **测试夹具文件**（标注 `@system-specific`）
- **文档注释中的示例**（标注 `@example`）

### 4.2 设计原则校验矩阵（核心原则）

| 原则 ID | 原则名称 | 核心要求 | 检查方式 |
|---------|----------|----------|----------|
| **P-001** | 零硬编码 | 引擎代码不含任何规则特定字面量（d100/SAN/HP等） | 正则扫描引擎源码，CI 阻断 |
| **P-002** | 配置即行为 | 规则包 YAML 完整定义所有行为，引擎只执行配置 | 检查引擎代码无业务分支逻辑 |
| **P-003** | 数据无逻辑 | 数据表只存数值与标识符，不嵌入 if-then 等逻辑 | 扫描数据表定义，禁止 formula/condition 字段 |
| **P-004** | 引擎无状态 | 状态存储在角色卡/会话中，引擎不持久化任何状态 | 检查引擎组件无全局变量、无文件 IO |
| **P-005** | 向前兼容/继承 | 新规则包可继承已有规则包，只覆盖差异字段 | 验证继承链解析正确合并 |

> **违规等级**：违反 P-001/P-002/P-003/P-004 为 **FATAL**，阻断发布；违反 P-005 为 **ERROR**，需修复。

---

