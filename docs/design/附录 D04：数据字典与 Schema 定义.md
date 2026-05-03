
# 附录D04：全局数据字典与 Schema 定义（原附录 E）

## 文档信息
- 版本：V1.8（2026-04-30 AI 使用日志与异步任务字段补充）
- 上一版本：v1.5（2026-04-25）
- 变更：新增 `ai_usage_log` 表字段定义与 AI 异步任务事件结构，补充配额统计索引口径

## 0.1 2026-04-25 对齐声明

本附录遵循 `docs/文档对齐治理.md` 中定义的统一优先级与冲突处理规则。

对齐范围说明：

- 本附录的数据表与运行时结构继续有效；若涉及规则定义编辑层，一律按 Recipe 源码 + compiled 产物模型理解。
- 若涉及视觉资产命名、界面占位图或图标引用，统一服从根目录 SVG 资产准则，不以本附录的历史示例反向约束 UI 实现。

## 0.2 前置说明

1. `scene_participations`：**实时状态表**，记录角色的进出，用于消息可见性的动态计算。
2. `narrative_fragments.participants`：**历史快照字段**，在生成日志片段时固化，确保导出内容的准确性和性能。两者分工不同，不冲突。

内部存储可自由使用键名（如中文），但对外交换必须遵循 CSON 规范（英文 snake_case），通过规则包的 field_aliases 完成映射。

## 0.3 创作者权限字段约定（2026-04-27 新增）

用户表 `users` 中以下两个字段共同决定创作者身份：

| 字段 | 类型 | 创作者判定条件 |
|------|------|--------------|
| `subscription_type` | `'free' \| 'pro' \| 'creator'` | `=== 'creator'` |
| `user_type` | `string[]` | 包含 `'creator'` 或 `'admin'` |

两个条件**任意一个**满足即视为创作者（OR 语义）。

**前端缓存键**：`localStorage.is_creator`（`'1'` = 是，`'0'` = 否），由 `useAuthStore` 维护，每次 `/users/me` 成功返回后同步刷新。

**后端中间件**：`requireCreator`（`packages/server/src/middleware/auth.ts`），必须接在 `authMiddleware` 之后使用，非创作者返回 `{ error: 'Creator permission required' }` (HTTP 403)。

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

### 1.6 module_terms（模组术语表）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string(64) | 是 | 主键 |
| module_id | string(64) | 是 | 关联 `modules.id` |
| term | string(64) | 是 | 术语原文 |
| created_at | timestamp | 否 | 创建时间，默认 `now()` |

约束：`unique(module_id, term)`。

### 1.7 热度统计字段扩展（modules / forum_threads）

| 表 | 字段 | 类型 | 必填 | 说明 |
|----|------|------|------|------|
| modules | reaction_count | int unsigned | 是 | 用户表态计数，默认 0 |
| modules | comment_count | int unsigned | 是 | 评论计数，默认 0 |
| modules | is_featured | boolean | 是 | 申精推荐标记，默认 false |
| forum_threads | like_count | int unsigned | 是 | 帖子点赞数，默认 0 |
| forum_threads | is_featured | boolean | 是 | 申精推荐标记，默认 false |

### 1.8 机器人支持字段扩展（users / forum_threads / forum_posts）

| 表 | 字段 | 类型 | 必填 | 说明 |
|----|------|------|------|------|
| users | is_bot | tinyint unsigned | 是 | 是否机器人账号，默认 0 |
| users | bot_status | enum('active','hibernated') | 否 | 机器人状态 |
| users | bot_label | string(64) | 否 | 机器人角色标签 |
| forum_threads | is_bot_generated | tinyint unsigned | 是 | 主题是否机器人生成 |
| forum_posts | is_bot_generated | tinyint unsigned | 是 | 回复是否机器人生成 |

### 1.9 campaign_feedback（跑团反馈表）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string(64) | 是 | 主键 |
| campaign_id | string(64) | 是 | 关联 `campaigns.id` |
| user_id | string(64) | 是 | 反馈提交者 |
| star | string(500) | 否 | Star 文本 |
| wish | string(500) | 否 | Wish 文本 |
| visibility | enum('gm_only','all_members') | 是 | 可见范围 |
| is_deleted | boolean | 是 | 软删除标记，默认 false |
| submitted_at | timestamp | 是 | 提交时间 |
| updated_at | timestamp | 否 | 更新时间 |

约束：`unique(campaign_id, user_id)`。

### 1.10 社区版模组字段扩展（modules / module_claim_letters / module_contributors）

`modules` 新增：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| source_label | enum | 是 | 来源标签（original / author_version / community_pending / community_authorized / derivative / certified_independent） |
| community_status | enum | 否 | 社区态（private_use / public_share / pending_review / archived_by_author） |
| upstream_module_id | string(64) | 否 | 上游模组 ID |
| contributor_user_id | string(64) | 否 | 贡献者用户 ID |
| original_source_url | string(1024) | 否 | 原发布链接 |
| original_source_note | text | 否 | 来源说明 |
| claim_deadline_at | datetime | 否 | 认领截止时间 |
| derivative_policy | enum('open','closed','review') | 否 | 衍生策略 |

`module_claim_letters`：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string(64) | 是 | 主键 |
| module_id | string(64) | 是 | 关联模组 |
| applicant_user_id | string(64) | 是 | 申请人 |
| letter_type | enum('public_share','derivative') | 是 | 申请类型 |
| content | longtext | 是 | 信件正文 |
| attachments | json | 否 | 附件 |
| ai_report | json | 否 | AI 审核报告 |
| status | enum('pending','approved','rejected') | 是 | 审核状态 |
| author_reply | text | 否 | 作者回复 |
| created_at | timestamp | 否 | 创建时间 |
| reviewed_at | datetime | 否 | 审核时间 |
| reviewed_by | string(64) | 否 | 审核人 |

`module_contributors`：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string(64) | 是 | 主键 |
| module_id | string(64) | 是 | 关联模组 |
| user_id | string(64) | 是 | 贡献者用户 |
| role | enum('contributor','honorary_collaborator') | 是 | 贡献身份 |
| created_at | timestamp | 否 | 创建时间 |

### 1.11 scenes 氛围字段扩展

| 表 | 字段 | 类型 | 必填 | 说明 |
|----|------|------|------|------|
| scenes | atmosphere_keywords | json | 否 | 氛围关键词数组，默认 `[]` |

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
| **initial_snapshot**   | **object \| undefined**           | **创建时初始快照，V1.0 不做重置功能，字段保留供迭代**                                |


// [REVISED] 角色立绘捏人数据结构 - 技术规范版
// 美术资源生产规范见内部美术文档，此处仅定义程序接口
interface AvatarCustomDataBase {
  gender: 'male' | 'female';
  body_type: 'slim' | 'standard' | 'heavy';  // V1.0 新增：基础体型，控制基础轮廓
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

### 2.3.1 模组直达招募查询结构

```typescript
interface RecruitmentListQuery {
  page?: number;
  limit?: number;
  sort?: 'latest' | 'oldest' | 'hottest';
  status?: 'open' | 'full' | 'grouped' | 'closed';
  type?: 'gm_recruit' | 'player_seek';
  ruleset_id?: string;
  module_id?: string;      // 模组详情直达入口核心参数（精确筛选）
  module_name?: string;    // 历史兼容参数（仅兜底，不建议新逻辑依赖）
  keyword?: string;
  tag?: string;
}

interface RecruitmentListItem {
  id: string;
  title: string;
  type: 'gm_recruit' | 'player_seek';
  ruleset_id: string;
  ruleset_name?: string;
  module_id?: string | null;
  module_name?: string | null;
  player_count_joined: number;
  player_count_max: number;
  status: 'open' | 'full' | 'closed';
  status_view: 'open' | 'full' | 'grouped' | 'closed';
  created_at: string;
}
```

说明：

1. 模组详情页进入招募列表时，必须传递 `module_id`。
2. 若历史帖子尚未回填 `module_id`，可在后端兜底使用 `module_name` 参与补充查询。
3. 新增/编辑招募帖时，应尽量保证 `module_id` 与 `module_name` 同步写入。

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
  execute_at_story?: StoryTime;                // （可选）移动关联的剧情时间，供记录用；不再用于触发执行
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
  story_time_entered?: StoryTime;  // 进入时间（可选，GM审批移动时填写；不填则为null）
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

### 2.6 叙阅器配置结构

```typescript
interface ReaderSettings {
  plugin_flags: {
    annotation: boolean;
    toc: boolean;
    reading_progress: boolean;
    share: boolean;
    import_campaign?: boolean;
    export_structured_data?: boolean;
    quote_house_rules?: boolean;
  };
  protection_flags: {
    anti_bulk_copy: boolean;
    disable_public_comments: boolean;
    disable_pdf_export: boolean;
    trace_watermark: boolean;
    embed_copyright_notice: boolean;
    forbid_redistribution?: boolean;
  };
  preview_policy: {
    preview_ratio?: number;
    preview_section_ids?: string[];
  };
  appearance?: {
    theme_color?: string;
    font_family?: string;
    line_height?: 'compact' | 'comfortable' | 'relaxed';
  };
}
```

说明：

1. `ReaderSettings` 适用于模组、规则包、故事录等所有可阅览作品。
2. 作品未显式配置时，前端按叙阅器默认策略渲染，后端按最严格权限校验兜底。
3. 品类专属插件字段可为空，未配置即视为关闭。

### 2.7 通用类型定义

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

### 2.8 社区反馈与作品互动结构

```typescript
interface CampaignFeedback {
  id: string;
  campaign_id: string;
  reviewer_id: string;
  review_type: 'campaign';
  feedback_type: 'star' | 'wish';
  visibility: 'gm_only' | 'party';
  content: string;
  is_edited: boolean;
  edited_at?: Timestamp;
  created_at: Timestamp;
}

interface ProductReview {
  id: string;
  product_id: string;
  reviewer_id: string;
  review_type: 'product';
  rating?: 1 | 2 | 3 | 4 | 5;
  content: string;
  is_edited: boolean;
  edited_at?: Timestamp;
  is_pinned: boolean;
  created_at: Timestamp;
}

interface ProductCollection {
  id: string;
  user_id: string;
  product_id: string;
  product_type: 'module' | 'ruleset';
  created_at: Timestamp;
}

interface RecruitmentApplicationMeta {
  id: string;
  recruitment_id: string;
  user_id: string;
  character_id?: string;
  status: 'pending' | 'invited' | 'confirmed' | 'rejected' | 'waiting' | 'dispute';
  reject_reason?: string;
  rejected_at?: Timestamp;
  retry_after?: Timestamp;
  invite_revoked_by_gm?: boolean;
  invited_expire_at?: Timestamp;
  waiting_position?: number;
}

interface DisputeTicket {
  id: string;
  recruitment_id: string;
  application_id: string;
  applicant_id: string;
  gm_id: string;
  status: 'open' | 'processing' | 'resolved' | 'closed';
  summary: {
    reject_count: number;
    latest_reject_reason?: string;
    latest_reject_at?: Timestamp;
  };
  created_at: Timestamp;
  resolved_at?: Timestamp;
}
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



-- ========== 社区评论系统（贴吧模式） ==========

-- 主楼层表（对主题帖的直接回复）
-- 说明：1楼为帖子正文，存储于 posts 表，此表楼层号从 2 起分配。
CREATE TABLE post_replies (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,          -- 关联的招募帖ID（外键逻辑：post_id 必须存在于 posts 表，建议在应用层校验；如数据库性能允许，可添加 FOREIGN KEY）
  user_id VARCHAR(64) NOT NULL,
  floor_number INT NOT NULL,              -- 楼层号（从2开始，1 预留给帖子正文）
  content TEXT NOT NULL,
  like_count INT DEFAULT 0,              -- 冗余字段，与 floor_likes 表保持同步；更新时须在同一事务内完成，或使用触发器
  reply_count INT DEFAULT 0,             -- 冗余字段（楼中楼数量），与 reply_comments 表保持同步；同上
  is_original_post BOOLEAN DEFAULT FALSE, -- 标记该条是否为楼主原帖内容（仅 posts 表正文映射时使用，通常为 FALSE）
  deleted BOOLEAN DEFAULT FALSE,          -- 软删除标记：deleted=TRUE 时前端显示"该楼层已删除"，楼层号保留
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- MySQL 语法；PostgreSQL 需使用触发器实现等效功能
  INDEX idx_post_floor (post_id, floor_number),
  INDEX idx_post_created (post_id, created_at)
);

-- 楼中楼表（单楼层下的二级评论）
-- 设计限制：parent_comment_id 只能指向 post_replies 中的记录（一级回复），
-- 不允许指向 reply_comments 中的记录，应用层须强制校验，确保嵌套层数 ≤ 1。
CREATE TABLE reply_comments (
  id VARCHAR(64) PRIMARY KEY,
  reply_id VARCHAR(64) NOT NULL,           -- 关联的主楼层ID（外键逻辑：须存在于 post_replies 表）
  user_id VARCHAR(64) NOT NULL,
  parent_comment_id VARCHAR(64) NULL,      -- 可选：指定回复的是楼中楼中哪条评论（仅用于 @提及展示，不增加嵌套层数）
  content TEXT NOT NULL,
  like_count INT DEFAULT 0,
  deleted BOOLEAN DEFAULT FALSE,           -- 楼中楼软删除（可改为物理删除，需在产品层统一）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_reply (reply_id, created_at)
);

-- 楼层点赞记录表（防重复点赞）
CREATE TABLE floor_likes (
  id VARCHAR(64) PRIMARY KEY,
  reply_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_floor (reply_id, user_id)
);

-- 楼中楼点赞记录表（防重复点赞）
CREATE TABLE comment_likes (
  id VARCHAR(64) PRIMARY KEY,
  comment_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_comment (comment_id, user_id)
);

/*
设计决策说明：
1. floor_number 采用物理存储（非实时计算），避免因软删除导致楼层号混乱。
2. like_count / reply_count 为冗余计数，须在事务中与点赞/评论操作同步更新（或使用触发器），防止数据不一致。
3. parent_comment_id 仅用于标记"回复了楼中楼中的哪条"，不构成新的嵌套层；应用层在写入时须校验 parent_comment_id 不指向 reply_comments 记录。
4. ON UPDATE CURRENT_TIMESTAMP 为 MySQL 5.7+ 专有语法；若使用 PostgreSQL，需改为：
   updated_at TIMESTAMPTZ DEFAULT NOW()，并建立触发器：
   CREATE TRIGGER set_updated_at BEFORE UPDATE ON <table> FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
5. 外键约束出于性能考虑未在 DDL 中显式声明，应在应用层或 ORM 层保证数据一致性。
*/


## 5. V2.1 新增数据结构

### 5.1 SceneStatus（场景状态枚举）

| 值 | 说明 |
|---|---|
| `active` | 活跃场景，可进入 |
| `archived` | 已归档，不可进入，消息保留 |
| `hidden` | GM 预准备中，玩家不可见 |

### 5.2 MessageType（消息类型枚举，V2.1 修订）

| 值 | 说明 | 时序裁剪 | 进入聊天流 |
|---|---|:---:|:---:|
| `narrative` | 角色剧情对话/叙事 | 是 | 是 |
| `dice` | 骰子检定结果 | 是 | 是 |
| `ooc` | 场外闲聊 | 是 | 是 |
| `clue_card` | 线索卡 | 是 | 是 |
| `scene_event` | 场景事件（角色进出） | 是 | 是 |
| `time_tag` | 时间标签 | 否（豁免） | 是 |
| `announcement` | GM 公告 | 否（豁免） | 是 |
| `system` | 系统通知 | 否（豁免） | 是 |
| `gm_ledger` | GM 台账 | 不适用 | 否 |

**变更说明**：原 `system` 类型中的"角色进出场景"提示拆分为独立的 `scene_event` 类型，受时序裁剪约束。新增 `gm_ledger` 类型用于记录仅 GM 可见的完整操作台账（如移动完整路径）。

### 5.3 scene_groups（场景分组表）

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| id | string | 是 | UUID v4 |
| campaign_id | string | 是 | 关联战役 ID |
| name | string | 是 | 分组名称（如"第一幕"） |
| sort_order | int | 是 | 排序顺序 |
| created_at | timestamp | 是 | 创建时间 |

### 5.4 scenes 表新增字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| status | SceneStatus | 是 | 场景状态，默认 `active` |
| group_id | string | 否 | 所属分组 ID，NULL 表示未分组 |

### 5.5 社区反馈与作品互动持久化字段

#### 5.5.1 `reviews` 表扩展字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| review_type | ENUM('campaign','product') | 是 | 区分跑团反馈与作品评价 |
| feedback_type | ENUM('star','wish') | 否 | 仅 `review_type='campaign'` 时使用 |
| visibility | ENUM('gm_only','party') | 否 | 跑团反馈可见范围，默认 `gm_only` |
| product_id | string | 否 | 仅 `review_type='product'` 时必填 |
| rating | int | 否 | 1-5 星，仅 `review_type='product'` 时有效 |
| is_edited | boolean | 是 | 是否编辑过，默认 `false` |
| edited_at | timestamp | 否 | 最后编辑时间 |
| is_pinned | boolean | 是 | 作品评价是否被创作者置顶，默认 `false` |

约束：

1. `review_type='campaign'` 时，`rating` 必须为 `NULL`，`feedback_type` 必填。
2. `review_type='product'` 时，`product_id` 必填，`content` 必填且最少 10 字，`rating` 可为空。
3. 跑团反馈不参与信誉分、排序和推荐算法。

#### 5.5.2 `applications` 表补充字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| reject_reason | varchar(200) | 否 | GM 拒绝理由；当状态流转为 `rejected` 时必填 |
| rejected_at | timestamp | 否 | 最近一次被拒时间 |
| retry_after | timestamp | 否 | 再次申请冷却截止时间 |
| invite_revoked_by_gm | boolean | 是 | 是否由 GM 主动撤回邀请导致拒绝，默认 `false` |

约束：

1. `action=reject` 时必须写入 `reject_reason`。
2. `invited -> rejected` 且由 GM 撤回时，`invite_revoked_by_gm=true`，`reject_reason='GM 撤回邀请'`。
3. 同一用户对同一招募帖在冷却期内最多允许 1 次再次申请。

#### 5.5.3 `dispute_tickets` 表

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| id | string | 是 | 工单 ID |
| recruitment_id | string | 是 | 关联招募帖 |
| application_id | string | 是 | 关联申请记录 |
| applicant_id | string | 是 | 申请人 |
| gm_id | string | 是 | 对应 GM |
| status | ENUM('open','processing','resolved','closed') | 是 | 工单状态 |
| summary_json | json | 是 | 历史申请摘要、拒绝次数、最新理由 |
| created_at | timestamp | 是 | 创建时间 |
| resolved_at | timestamp | 否 | 处理完成时间 |

#### 5.5.4 `product_collections` 表

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| id | string | 是 | 收藏记录 ID |
| user_id | string | 是 | 收藏用户 |
| product_id | string | 是 | 商品 ID |
| product_type | ENUM('module','ruleset') | 是 | 商品类型 |
| created_at | timestamp | 是 | 收藏时间 |

约束：`UNIQUE(user_id, product_id)`，同一用户对同一商品只能收藏一次。

#### 5.5.5 作品叙阅器配置字段

适用范围：挂载于 `modules`、`rulesets`、`story_posts` 等可阅览作品主表。

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| reader_settings | json | 否 | 叙阅器配置，结构见 `ReaderSettings` |
| preview_ratio | decimal(4,3) | 否 | 试读比例，0-1；为空表示仅按章节白名单控制 |
| watermark_enabled | boolean | 是 | 是否开启溯源水印，默认 `true`（付费作品） |
| copy_limit_chars | int | 否 | 单次允许选中的最大字符数，默认 `200` |
| copyright_notice | text | 否 | 自动嵌入的版权声明文本 |

约束：

1. `reader_settings` 为作品阅览能力的唯一配置入口，前后端不得再为单一品类另建独立阅览配置结构。
2. `watermark_enabled=true` 时，叙阅器渲染层必须输出与当前访问用户关联的可追溯标识。
3. `copy_limit_chars` 仅控制前台单次选中上限，不替代后台权限校验。

### 5.6 AI 使用日志与配额统计字段（2026-04-30 新增）

#### 5.6.1 `ai_usage_log` 表

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| id | string | 是 | 日志主键（雪花 ID） |
| user_id | string | 是 | 用户 ID |
| task_type | ENUM('import_module','check_text','log_summary','generate_recipe') | 是 | 任务类型 |
| endpoint | ENUM('pro','flash') | 是 | 模型端点 |
| status | ENUM('queued','success','failed') | 是 | 任务状态 |
| input_tokens | int | 是 | 输入 token 数，默认 `0` |
| output_tokens | int | 是 | 输出 token 数，默认 `0` |
| cost_cents | int | 是 | 成本（分），MVP 可先写 `0` |
| duration_ms | int | 是 | 本次任务耗时（毫秒） |
| created_at | timestamp | 是 | 创建时间 |

索引约束：

1. 必须建立按用户+任务+月份聚合索引：`idx_ai_user_month(user_id, task_type, created_at)`。
2. 配额统计口径只统计 `status='success'` 记录；`queued/failed` 不计入月度额度。

### 5.7 AI 异步任务事件结构（2026-04-30 新增）

```typescript
interface AiTaskUpdateEvent {
  task_id: string;
  status: 'queued' | 'success' | 'failed';
  result?: unknown;
  error?: string;
}
```

说明：

1. 该事件通过 Socket.IO 事件名 `ai_task_update` 推送给目标用户房间（`user:{user_id}`）。
2. `status='success'` 时应返回 `result`；`status='failed'` 时应返回 `error`。
3. 客户端收到事件后应更新任务卡片状态，并在必要时触发结果拉取或错误提示。

### 5.8 System Prompt 组成规范（从参考项目学习）

为保证 LLM 输出的稳定性与可控性，System Prompt 应分层组成，而非单一巨型提示词：

```typescript
// 层级 1：系统角色与定位
const SYSTEM_ROLE = `
你是一个 TRPG 跑团平台的 AI 助手，专门帮助 GM 和玩家处理规则文本、模组导入、日志分析等任务。
你的职责是理解、解析、总结跑团相关内容，但不参与游戏规则的执行——规则执行由本地规则引擎负责。
`;

// 层级 2：业务上下文（运行时组成）
function buildContext(ruleTerms: string[], systemName: string) {
  return `
系统规则集：${systemName}
核心术语库：${ruleTerms.join('、')}
输出格式约束：严格 JSON，无 Markdown 装饰
  `;
}

// 层级 3：具体任务指令
const TASK_CHECK_TEXT = `
任务：检查用户文本中的术语一致性与拼写错误
输入：纯文本 + 术语列表
输出：{ issues: Array<{type: 'spelling'|'terminology', original: string, suggestion: string, reason: string}> }
`;

const TASK_IMPORT_MODULE = `
任务：解析 TRPG 模组文本，提取结构化内容
输入：纯文本 + 可选前置总结 + 术语白名单
输出：{ entities: Array<{name, type, properties}>, summary: string }
规则：不创建不在术语列表内的新术语；模糊内容以 confidence 标记
`;

// 组装：在 callAI 时动态拼接
function buildFullPrompt(taskType: TaskType, customContext?: string): string {
  return `${SYSTEM_ROLE}\n${buildContext(...)}\n${getTaskInstruction(taskType)}\n${customContext || ''}`;
}
```

关键原则：

1. **分离：** 系统角色、业务上下文、任务指令独立定义，便于单独调试与版本管理。
2. **重用：** 相同 Context 下不同 Task 可共享系统角色部分，减少冗余。
3. **版本化：** 每类 prompt 绑定版本号，运行时记录，便于效果对比与回溯。
4. **可测：** 单元测试隔离 prompt 组成逻辑，确保输出稳定性。

### 5.9 任务类型与应用层工具集合（从参考项目学习）

遵循"规则与叙事分离"原则，LLM 不直接修改平台状态，而是调用工具返回结果供用户预览或确认：

| 任务类型 | 对应工具 | LLM 职责 | 本地引擎职责 | 用户确认 |
| --- | --- | --- | --- | --- |
| check_text | 术语校验工具 | 识别错误与建议 | 应用用户选中的修改 | 需确认每处修改 |
| import_module | 模组解析工具 | 提取字段 + 转换格式 | 验证 Schema、入库 | 需预览后二次确认 |
| generate_recipe | 规则生成工具 | 基于规则包生成配方 | 编译配方、验证依赖 | 需审阅后保存 |
| log_summary | 日志分析工具 | 提取事件、生成摘要 | 关键帧识别、链接存储 | 可自动生成 |

说明：

1. **LLM 输出不直接入库**：所有 import/generate 任务需用户二次确认后由本地引擎处理。
2. **工具封装**：每个工具应有独立的入参 Schema 与输出 Schema，由 Zod 或 JSON Schema 约束。
3. **失败容错**：单条失败（如单个字段无法解析）应返回 partial result，而非整体失败。
4. **幂等性**：相同输入应返回相同结果，便于客户端重试与缓存。