# 附录 H：跑团日志中间格式规范（开放标准）

## 文档信息

| 属性   | 值                                |
| ---- | -------------------------------- |
| 文档版本 | V1.6                             |
| 日期   | 2026-04-25                       |
| 状态   | 正式发布                             |
| 适用范围 | 跑团日志导出、跨平台叙事数据交换、Replay 制作、AI 分析 |
| Schema 版本 | 1.0.0                        |

## 0.1 2026-04-25 对齐声明

本附录遵循 `docs/文档对齐治理.md` 中定义的统一优先级与冲突处理规则。

说明：

- 本次统一到 V1.6 的是**文档版本**，不是 ILF 的 `schema_version`；数据交换格式仍保持 `1.0.0` 以保证兼容性。
- 若 ILF 被渲染为 HTML、PDF 或前端预览界面，其配色、图标和缺省插画应遵循根目录设计准则，而不是由本附录单独定义。

---

## H.1 设计目标

本规范定义了一种**开放、结构化、可扩展**的跑团日志中间格式（Intermediate Log Format, ILF），用于：

- **跨平台交换**：任何 TRPG 平台（如本平台、海豹骰、FVTT、DicePP）可将跑团数据导出为 ILF，供其他工具消费
- **叙事重构**：保留场（Scene）、角色（Character）、剧情时间（Story Time）等高级语义，而非纯文本行
- **下游生态**：ILF 可作为转换器的**统一输入源**，生成回声工坊、HTML、PDF、Markdown、视频脚本等多种输出
- **AI 友好**：结构化数据便于大模型理解、检索、生成摘要、制作时间轴
- **版本可演**：支持向前兼容，字段可增不可删，值语义不变

> **核心定位**：ILF 是 **“跑团数据的源代码”**——不是最终制品，但可以被编译成任何制品。

---

## H.2 核心数据结构

### H.2.1 顶层结构（ILF Document）

```typescript
interface ILFDocument {
  version: "1.0.0";
  metadata: ILFMetadata;
  campaigns: ILFCampaign[];        // 可包含多个团（通常只有一个）
}
```

### H.2.2 元数据（ILFMetadata）

```typescript
interface ILFMetadata {
  exporter: {                       // 导出工具信息
    name: string;                   // 如 "TRPG通用引擎平台"
    version: string;
    url?: string;
  };
  exported_at: string;              // ISO 8601
  ruleset_id: string;               // 使用的规则包 ID
  ruleset_name: string;             // 人类可读名称
  license: "CC-BY-NC-SA-4.0" | "proprietary" | string;  // 数据许可
}
```

### H.2.3 团（ILFCampaign）

```typescript
interface ILFCampaign {
  id: string;
  name: string;
  gm: ILFCharacterRef;              // GM 信息
  players: ILFCharacterRef[];       // 所有玩家角色
  npcs: ILFNPC[];                   // 团内出现的 NPC（可选）
  scenes: ILFScene[];               // 所有场
  timeline: ILFTimeline;            // 时序叙事片段列表
  global_story_time_range: {        // 全局时间范围
    start: StoryTime;
    end: StoryTime;
  };
  real_time_range: {                // 现实时间范围
    start: string;                  // ISO 8601
    end: string;
  };
}
```

### H.2.4 角色引用（ILFCharacterRef）

```typescript
interface ILFCharacterRef {
  id: string;                       // 平台内部 ID（可选）
  name: string;                     // 显示名称
  type: "player" | "npc" | "gm";
  avatar_url?: string;
}
```

### H.2.5 NPC 定义（ILFNPC）

```typescript
interface ILFNPC {
  id: string;
  name: string;
  display_name?: string;
  avatar_url?: string;
  description?: string;             // 简要描述
}
```

### H.2.6 场（ILFScene）

```typescript
interface ILFScene {
  id: string;
  name: string;
  type: "spatial" | "virtual" | "lobby";
  parent_campaign_id: string;
  visibility: "public" | "private" | "gm_only";
  participants?: string[];          // 参与者角色 ID 列表（私密场）
}
```

### H.2.7 时间线（ILFTimeline）

时间线是一个**叙事片段数组**，每个片段包含连续的消息、场景上下文、参与者快照等。

```typescript
interface ILFTimeline {
  entries: ILFTimelineEntry[];
}

interface ILFTimelineEntry {
  id: string;
  scene_id: string;                 // 所属场
  story_time: StoryTime;            // { day, hour, minute }
  real_time: string;                // ISO 8601，真实发生时间
  type: "message" | "scene_transition" | "system_event" | "gm_note";
  
  // 根据 type 不同，携带不同的 payload
  payload: ILFMessagePayload | ILFSceneTransitionPayload | ILFSystemEventPayload | ILFGMNotePayload;
  
  // 可选：角色卡快照（仅在关键时刻记录）
  character_snapshots?: ILFCharacterSnapshot[];
}

// 消息负载
interface ILFMessagePayload {
  speaker: ILFCharacterRef;         // 发送者
  content: string;                  // 原始消息文本
  formatted?: string;               // 富文本（可选）
  is_dice: boolean;                 // 是否为掷骰消息
  dice_result?: {                   // 若为掷骰，可提供详情
    expression: string;
    total: number;
    rolls: number[];
    success_level?: string;
  };
}

// 场景切换负载
interface ILFSceneTransitionPayload {
  from_scene_id: string | null;
  to_scene_id: string;
  trigger: "gm_manual" | "scheduled_move" | "force_move";
}

// 系统事件负载
interface ILFSystemEventPayload {
  event_type: "character_joined" | "character_left" | "status_applied" | "resource_changed";
  target_character_id: string;
  details: Record<string, any>;
}

// GM 笔记负载（仅 GM 可见，导出时根据权限过滤）
interface ILFGMNotePayload {
  content: string;
  is_secret: boolean;               // 是否仅 GM 可见
  tags?: string[];                  // 如 ["clue", "motivation"]
}

// 角色卡快照（可选，用于关键时刻记录）
interface ILFCharacterSnapshot {
  character_id: string;
  character_name: string;
  story_time: StoryTime;
  attributes?: Record<string, number>;
  resources?: Record<string, { current: number; max: number }>;
  statuses?: string[];
}
```

### H.2.8 故事时间（StoryTime）——复用已有定义

```typescript
interface StoryTime {
  day: number;
  hour: number;   // 0-23
  minute: number; // 0-59
}
```

---

## H.3 JSON Schema 示例

完整的 JSON Schema 文件可独立提供。以下是核心结构的示例，用于验证和代码生成。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TRPG Intermediate Log Format (ILF) v1.0",
  "type": "object",
  "required": ["version", "metadata", "campaigns"],
  "properties": {
    "version": { "const": "1.0.0" },
    "metadata": { "$ref": "#/definitions/metadata" },
    "campaigns": {
      "type": "array",
      "items": { "$ref": "#/definitions/campaign" }
    }
  },
  "definitions": {
    "metadata": {
      "type": "object",
      "required": ["exporter", "exported_at", "ruleset_id", "ruleset_name"],
      "properties": {
        "exporter": {
          "type": "object",
          "required": ["name", "version"],
          "properties": {
            "name": { "type": "string" },
            "version": { "type": "string" },
            "url": { "type": "string" }
          }
        },
        "exported_at": { "type": "string", "format": "date-time" },
        "ruleset_id": { "type": "string" },
        "ruleset_name": { "type": "string" },
        "license": { "type": "string" }
      }
    },
    "campaign": {
      "type": "object",
      "required": ["id", "name", "gm", "players", "scenes", "timeline"],
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "gm": { "$ref": "#/definitions/characterRef" },
        "players": { "type": "array", "items": { "$ref": "#/definitions/characterRef" } },
        "npcs": { "type": "array", "items": { "$ref": "#/definitions/npc" } },
        "scenes": { "type": "array", "items": { "$ref": "#/definitions/scene" } },
        "timeline": { "$ref": "#/definitions/timeline" },
        "global_story_time_range": {
          "type": "object",
          "required": ["start", "end"],
          "properties": {
            "start": { "$ref": "#/definitions/storyTime" },
            "end": { "$ref": "#/definitions/storyTime" }
          }
        },
        "real_time_range": {
          "type": "object",
          "required": ["start", "end"],
          "properties": {
            "start": { "type": "string", "format": "date-time" },
            "end": { "type": "string", "format": "date-time" }
          }
        }
      }
    },
    "characterRef": {
      "type": "object",
      "required": ["name", "type"],
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "type": { "enum": ["player", "npc", "gm"] },
        "avatar_url": { "type": "string" }
      }
    },
    "npc": {
      "type": "object",
      "required": ["id", "name"],
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "display_name": { "type": "string" },
        "avatar_url": { "type": "string" },
        "description": { "type": "string" }
      }
    },
    "scene": {
      "type": "object",
      "required": ["id", "name", "type", "visibility"],
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "type": { "enum": ["spatial", "virtual", "lobby"] },
        "visibility": { "enum": ["public", "private", "gm_only"] },
        "participants": { "type": "array", "items": { "type": "string" } }
      }
    },
    "timeline": {
      "type": "object",
      "required": ["entries"],
      "properties": {
        "entries": {
          "type": "array",
          "items": { "$ref": "#/definitions/timelineEntry" }
        }
      }
    },
    "timelineEntry": {
      "type": "object",
      "required": ["id", "scene_id", "story_time", "real_time", "type", "payload"],
      "properties": {
        "id": { "type": "string" },
        "scene_id": { "type": "string" },
        "story_time": { "$ref": "#/definitions/storyTime" },
        "real_time": { "type": "string", "format": "date-time" },
        "type": { "enum": ["message", "scene_transition", "system_event", "gm_note"] },
        "payload": { "type": "object" },
        "character_snapshots": {
          "type": "array",
          "items": { "$ref": "#/definitions/characterSnapshot" }
        }
      }
    },
    "storyTime": {
      "type": "object",
      "required": ["day", "hour", "minute"],
      "properties": {
        "day": { "type": "integer" },
        "hour": { "type": "integer", "minimum": 0, "maximum": 23 },
        "minute": { "type": "integer", "minimum": 0, "maximum": 59 }
      }
    },
    "characterSnapshot": {
      "type": "object",
      "required": ["character_id", "character_name", "story_time"],
      "properties": {
        "character_id": { "type": "string" },
        "character_name": { "type": "string" },
        "story_time": { "$ref": "#/definitions/storyTime" },
        "attributes": { "type": "object", "additionalProperties": { "type": "number" } },
        "resources": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "required": ["current", "max"],
            "properties": {
              "current": { "type": "number" },
              "max": { "type": "number" }
            }
          }
        },
        "statuses": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

---

## H.4 与现有平台的转换器设计原则

### H.4.1 转换器架构

```
ILF 文件（标准格式）
       ↓
【转换器核心】（可插拔）
       ↓
   ┌───┴───┬───────────┬───────────┐
   ↓       ↓           ↓           ↓
回声工坊  海豹骰log   HTML/PDF   Markdown
（特定格式）（特定格式）（渲染）    （纯文本）
```

### H.4.2 转换器实现原则

| 原则 | 说明 |
|------|------|
| **单向转换** | 仅 ILF → 目标格式，不要求反向 |
| **可配置** | 用户可选择保留哪些字段（如是否包含 GM 笔记） |
| **元数据保留** | 在目标格式允许的情况下，嵌入 ILF 原始 ID 以便追溯 |
| **错误容错** | 遇到不识别的扩展字段时，忽略并继续 |

### H.4.3 面向“回声工坊”的转换示例（伪代码）

```python
def ilf_to_echoworkshop(ilf_doc):
    output = []
    for campaign in ilf_doc.campaigns:
        output.append(f"# 团名：{campaign.name}")
        output.append(f"## GM：{campaign.gm.name}")
        for entry in campaign.timeline.entries:
            if entry.type == "message":
                speaker = entry.payload.speaker.name
                content = entry.payload.content
                output.append(f"[{entry.story_time.hour:02d}:{entry.story_time.minute:02d}] {speaker}：{content}")
            elif entry.type == "scene_transition":
                output.append(f"\n--- 切换至场景：{get_scene_name(entry.payload.to_scene_id)} ---\n")
    return "\n".join(output)
```

实际生产级转换器会复杂一些（处理头像、表情、骰子高亮等），但核心逻辑相同。

---

## H.5 版本管理与扩展机制

### H.5.1 版本策略

- **主版本号**：不兼容的结构变更（如删除字段、重定义核心概念）
- **次版本号**：新增可选字段，保持向后兼容
- **修订号**：文档勘误、示例更新，不改变语义

### H.5.2 扩展机制

允许消费者在以下位置添加自定义字段，前缀 `x_` 以避免未来冲突：

```json
{
  "metadata": {
    "x_custom_platform": "my_platform"
  },
  "timeline": {
    "entries": [
      {
        "payload": {
          "x_emotion": "happy"
        }
      }
    ]
  }
}
```

消费者遇到无法识别的 `x_*` 字段应忽略，不应报错。

---

## H.6 使用场景示例

| 场景 | 使用方式 |
|------|----------|
| **导出个人剧本** | 平台根据玩家权限过滤 ILF 中的 `gm_only` 和私密场条目，生成“我的剧本”ILF，再转换为 PDF/Markdown |
| **故事坊发布** | 平台生成“公共剧本”ILF（过滤私密信息），用户手动导出草稿后在「探索→故事坊」中二次确认发布；不自动公开，不做高光裁剪 |
| **制作 Replay** | 视频作者将 ILF 导入到自定义工具，自动生成时间轴、角色立绘、字幕文件 |
| **AI 分析** | 将 ILF 输入大模型，生成剧情摘要、角色弧光分析、线索网络图 |
| **跨平台迁移** | 用户从海豹骰导出 ILF，再导入到本平台，保留所有叙事结构和时间信息 |

---

## H.7 附录：示例 ILF 文件片段

```json
{
  "version": "1.0.0",
  "metadata": {
    "exporter": { "name": "TRPG通用引擎平台", "version": "0.9.0" },
    "exported_at": "2026-04-04T10:30:00Z",
    "ruleset_id": "coc7",
    "ruleset_name": "克苏鲁的呼唤 第七版",
    "license": "CC-BY-NC-SA-4.0"
  },
  "campaigns": [
    {
      "id": "camp_123",
      "name": "黑暗边缘",
      "gm": { "id": "user_001", "name": "守秘人K", "type": "gm" },
      "players": [
        { "id": "char_001", "name": "侦探A", "type": "player" },
        { "id": "char_002", "name": "记者B", "type": "player" }
      ],
      "npcs": [
        { "id": "npc_001", "name": "酒馆老板", "description": "矮人男性" }
      ],
      "scenes": [
        { "id": "scene_001", "name": "酒馆", "type": "spatial", "visibility": "public" }
      ],
      "timeline": {
        "entries": [
          {
            "id": "entry_001",
            "scene_id": "scene_001",
            "story_time": { "day": 1, "hour": 20, "minute": 0 },
            "real_time": "2026-04-03T12:00:00Z",
            "type": "message",
            "payload": {
              "speaker": { "name": "酒馆老板", "type": "npc" },
              "content": "欢迎光临，冒险者们！",
              "is_dice": false
            }
          },
          {
            "id": "entry_002",
            "scene_id": "scene_001",
            "story_time": { "day": 1, "hour": 20, "minute": 5 },
            "real_time": "2026-04-03T12:05:00Z",
            "type": "message",
            "payload": {
              "speaker": { "id": "char_001", "name": "侦探A", "type": "player" },
              "content": "我点一杯威士忌。",
              "is_dice": false
            }
          }
        ]
      },
      "global_story_time_range": { "start": { "day": 1, "hour": 20, "minute": 0 }, "end": { "day": 1, "hour": 22, "minute": 30 } },
      "real_time_range": { "start": "2026-04-03T12:00:00Z", "end": "2026-04-03T14:30:00Z" }
    }
  ]
}
```

---

## H.8 结语

ILF 不是某个平台的私有格式，而是一个**开放倡议**。我们鼓励其他 TRPG 工具（骰子机器人、跑团平台、Replay 制作器）支持导入/导出 ILF，让跑团数据不再被锁定在单一生态中。

本规范将随平台迭代持续更新，欢迎社区贡献扩展建议。