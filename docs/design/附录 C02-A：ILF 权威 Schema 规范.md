# 附录 C02-A：ILF 权威 Schema 规范

> 关联文档：[附录 C02：跑团日志中间格式规范（开放标准）](./附录%20C02：跑团日志中间格式规范（开放标准）.md)
>
> 说明：本文档是 ILF **P1（当前实现）** 的权威 Schema 来源。`packages/shared/src/utils/ilf.ts`、日志导出服务与解析器必须与本文一致。C02 主文档包含更完整的设计目标（含 P2 规划），代码实现以本文为准。

## 1. 版本锁定

1. Schema 版本：`1.0`
2. 版本格式：`major.minor`
3. 兼容策略：主版本 `1` 不变时，只允许新增可选字段，不允许修改现有字段语义

## 2. 顶层结构

```typescript
interface ILFDocument {
  campaign: ILFCampaign;
}
```

```typescript
interface ILFCampaign {
  metadata: ILFMetadata;
  players: ILFPlayer[];
  scenes: ILFScene[];
}

interface ILFMetadata {
  version: '1.0';
  campaign_title: string;
  rule_system: string;
  export_at: string; // ISO 8601
  author?: string;
}

interface ILFPlayer {
  character_id: string;
  character_name: string;
  player_name: string;
}
```

说明：

1. 顶层使用 `campaign` 单对象，不使用 `campaigns[]`。
2. 版本号字段位于 `campaign.metadata.version`。

## 3. 场景与消息结构

```typescript
interface ILFScene {
  id: string;
  name: string;
  description?: string;
  messages: ILFMessage[];
}

interface ILFMessage {
  seq: number;
  scene_id: string;
  scene_name: string;
  story_time: StoryTime | null;
  speaker: string;
  type: 'dialogue' | 'narration' | 'dice' | 'system' | 'ooc';
  content: string;
  dice_result?: {
    expression: string;
    total: number;
    detail: string;
  };
}
```

消息类型约定：

| type | 含义 |
|---|---|
| `dialogue` | 角色对话 |
| `narration` | 叙事描述 |
| `dice` | 骰子检定结果 |
| `system` | 系统消息（进出场、公告等） |
| `ooc` | 场外闲聊 |

## 4. 与 C02 的差异归并说明

为消除历史歧义，以下定义以 C02-A 为准：

1. 废弃 `scene_transition`、`system_event`、`gm_note` 独立类型。
2. 场景过渡统一编码为 `type='system'` + `content` 文本描述。
3. GM 私有笔记不进入 ILF 日志流（不导出）。

## 5. 时间字段约束

1. `story_time` 可空，用于剧情内时间。
2. 现实时间统一通过 `campaign.metadata.export_at` 以及消息序号 `seq` 保序表达。
3. 不新增 `real_time` 强制字段，避免与既有实现冲突。

## 6. 解析与兼容规则

1. 解析器必须忽略未知字段，不得因扩展字段中断解析。
2. 新增字段必须可选，或可被默认值安全填充。
3. 反序列化失败必须返回可定位错误（至少包含路径与原因）。

## 7. 校验规则（最小集）

1. `campaign.metadata.version` 必须为 `"1.0"`。
2. `scene_id` 必须能在 `scenes[].id` 中找到对应项。
3. `seq` 在同一文档内必须严格递增且唯一。
4. `dice_result` 仅允许在 `type='dice'` 时出现。

## 8. 最小合法示例

```json
{
  "campaign": {
    "metadata": {
      "version": "1.0",
      "campaign_title": "午夜教堂异闻录",
      "rule_system": "COC7",
      "export_at": "2026-05-03T08:00:00Z"
    },
    "players": [
      {
        "character_id": "char_1",
        "character_name": "阿尔文",
        "player_name": "user_123"
      }
    ],
    "scenes": [
      {
        "id": "scene_1",
        "name": "钟楼",
        "messages": [
          {
            "seq": 1,
            "scene_id": "scene_1",
            "scene_name": "钟楼",
            "story_time": { "day": 1, "hour": 20, "minute": 15 },
            "speaker": "阿尔文",
            "type": "dialogue",
            "content": "我推开门，手电照向楼梯。"
          }
        ]
      }
    ]
  }
}
```

## 9. 实施要求

1. 代码与测试必须以本文为准，旧结构文档仅保留历史说明。
2. 导出端与导入端均应复用同一套 Schema 校验器。
3. PR 合入前必须附 ILF 快照样例与校验结果。