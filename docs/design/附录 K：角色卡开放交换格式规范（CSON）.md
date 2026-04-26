# 附录 K：角色卡开放交换格式规范（CSON）

> **文档版本**：v1.5 | **状态**：正式发布 | **设计参考**：HKTRPG Bot、Session Zero Format (.szf)、rpgsheet | **Schema 版本**：1.0

## 0.1 2026-04-25 对齐声明

本附录遵循 `docs/文档对齐治理.md` 中定义的统一优先级与冲突处理规则。

说明：

- 本次统一到 v1.5 的是**文档版本**，不是 CSON 的 `schema_version`；交换格式仍保持 `1.0`。
- 若角色卡导入/导出界面需要图标、空状态插画或视觉占位，必须服从根目录 SVG 与设计系统准则。

## K.1 设计原则

- **规则无关**：不依赖特定规则包的内部字段名，使用通用语义标识。
- **人类可读**：JSON 格式；规范键名固定使用英文 `snake_case`，中文通过 `display_name/aliases` 显示与匹配。
- **可扩展**：通过 `custom_fields` 容纳任意自定义数据。
- **版本化**：通过 `schema_version` 标识格式版本，保证向后兼容。

## K.2 顶层结构

```typescript
interface CSONDocument {
  schema_version: "1.0";          // 固定值，用于版本识别
  meta: CSONMetadata;             // 角色卡元信息
  character: CSONCharacter;       // 核心角色数据
  source?: CSONSource;            // 来源信息（可选，用于导入时智能匹配）
}
```

### K.2.1 元数据（CSONMetadata）

```typescript
interface CSONMetadata {
  name: string;                   // 角色名（必填）
  player_name?: string;           // 玩家名/所有者
  avatar_url?: string;            // 头像图片链接
  description?: string;           // 背景故事、外貌描述等
  created_at?: string;            // ISO 8601 格式，创建时间
  updated_at?: string;            // ISO 8601 格式，最后更新时间
}
```

### K.2.2 角色数据（CSONCharacter）

```typescript
interface CSONCharacter {
  attributes: Record<string, number>;      // 基础属性，如 "strength": 60
  skills: Record<string, number>;          // 技能，如 "spot_hidden": 60
  resources: Record<string, CSONResource>; // 资源池，如 "hp": { current, max }
  custom_fields?: Record<string, any>;     // 自定义扩展（装备、法术等）
}

interface CSONResource {
  current: number;
  max: number;
  temp?: number;                  // 临时加成
}
```

### K.2.3 来源信息（CSONSource）

```typescript
interface CSONSource {
  ruleset_name?: string;          // 原始规则包名称，如 "克苏鲁的呼唤 第七版"
  ruleset_version?: string;
  platform?: string;              // 来源平台，如 "hktrpg", "dicepp"
  original_format?: string;       // 原始格式，如 "hktrpg_character"
}
```

## K.3 完整示例（COC 7th）

```json
{
  "schema_version": "1.0",
  "meta": {
    "name": "哈维·沃尔特",
    "player_name": "玩家A",
    "avatar_url": "https://cdn.example.com/avatars/harvey.png",
    "description": "一位退役警探，面容沧桑，右脸颊有一道旧刀疤。",
    "created_at": "2026-04-10T08:00:00Z",
    "updated_at": "2026-04-11T12:30:00Z"
  },
  "character": {
    "attributes": { "strength": 60, "constitution": 50, "size": 65, "dexterity": 55, "appearance": 45, "intelligence": 70, "willpower": 60, "education": 75 },
    "skills": { "spot_hidden": 60, "library_use": 40, "psychology": 50, "fighting_brawl": 55, "firearms_handgun": 45 },
    "resources": {
      "hp": { "current": 11, "max": 11 },
      "mp": { "current": 12, "max": 12 },
      "san": { "current": 55, "max": 60 },
      "luck": { "current": 50, "max": 50 }
    },
    "custom_fields": {
      "occupation": "警探",
      "age": 42,
      "equipment": ["手枪", "警徽", "手电筒"],
      "display_labels": {
        "attributes": {
          "strength": "力量",
          "constitution": "体质"
        },
        "skills": {
          "spot_hidden": "侦查",
          "library_use": "图书馆使用"
        }
      }
    }
  },
  "source": {
    "ruleset_name": "克苏鲁的呼唤 第七版",
    "platform": "trpg-platform",
    "original_format": "cson"
  }
}
```

## K.4 导入时的智能匹配流程

1. **规则包匹配**：
  - `source.ruleset_name` 缺失或为空：不做自动匹配，直接要求用户手动选择规则包。
  - 存在 `source.ruleset_name`：进行相似度匹配；最高分 `>80%` 时进入候选。
  - 若“最高分并列”：不自动选择，要求用户手动选择。
  - 若“唯一最高分且 >80%”：自动选择。
2. **字段映射**：利用目标规则包的 `field_aliases` 将 CSON 键名映射为内部标识。未匹配字段原样存入 `custom_fields`，并记录 `warnings[].code='UNKNOWN_FIELDS_IGNORED'`。
3. **资源初始化**：同名资源导入当前/最大值；不存在的资源放入 `custom_fields.resources` 保留。
4. **冲突处理**：严重不兼容时弹出警告，允许用户“强制导入”；强制导入仍保留未匹配字段到 `custom_fields`，仅跳过无法映射到结构化核心字段的部分。

## K.5 与社区格式的关系

| 格式 | 参考点 | 兼容计划 |
|------|--------|----------|
| HKTRPG Bot 角色卡 | 扁平化存储结构 | 提供官方转换器 `hktrpg2cson` |
| Session Zero Format (.szf) | 元数据与角色数据分离 | 保持字段命名语义一致 |
| rpgsheet | 极简主义，YAML/JSON 双格式支持 | 可直接映射 |

> **开放承诺**：本规范采用 [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可，欢迎社区实现转换工具。

## K.6 版本演进策略

- **主版本号**：不兼容的结构变更。
- **次版本号**：新增可选字段，向后兼容。
- **修订号**：文档勘误，不改变语义。

消费者遇到无法识别的字段应忽略，不报错；同时记录 `warnings[].code='UNKNOWN_FIELDS_IGNORED'` 以便审计与排查。

## K.7 导入响应契约（联调基线）

### K.7.1 响应结构

```typescript
type ImportStatus = 'success' | 'partial_success' | 'failed' | 'needs_confirmation';
type FailedStage = 'import';

type EngineErrorCode =
  | 'INVALID_VERSION_FORMAT'
  | 'IMPORT_SCHEMA_INVALID'
  | 'IMPORT_RELATION_MISSING'
  | 'IMPORT_PERMISSION_DENIED'
  | 'IMPORT_RULESET_REQUIRED'
  | 'IMPORT_ALIAS_CONFLICT';

interface ImportWarning {
  code: 'UNKNOWN_FIELDS_IGNORED';
  message: string;
  field_path?: string;
}

interface ImportMeta {
  import_format: 'cson';
  version: string;
  imported_at: string;          // ISO 8601
  source_ruleset_name: string | null;
  matched_ruleset_id: string | null;
  match_score: number;          // 0-1
  fields_matched: number;
  fields_total: number;
  forced?: boolean;
}

interface ImportError {
  code: EngineErrorCode;
  message: string;
  failed_stage: FailedStage;    // 固定为 'import'
  failed_node_id: null;         // 导入链路无节点语义
  details?: Record<string, any>;
}

interface ImportCsonResponse {
  status: ImportStatus;
  data: Record<string, any> | null;
  warnings: ImportWarning[];
  error?: ImportError;
  meta: ImportMeta;
}
```

约束：
- 所有响应字段统一使用 `snake_case`。
- 强制导入成功统一返回 `status='partial_success'`。
- 存在别名冲突且需要用户确认时，统一返回 `status='needs_confirmation'`。
- 失败响应固定返回 `failed_stage='import'`。
- 错误码沿用全局 `EngineErrorCode` 体系，并可使用 CSON 导入扩展码（如 `IMPORT_RULESET_REQUIRED`）。

### K.7.2 响应示例

**示例 A：完全成功**

```json
{
  "status": "success",
  "data": {
    "character_id": "char_abc123",
    "name": "张三",
    "ruleset_id": "coc7",
    "attributes": {
      "strength": 60,
      "dexterity": 70,
      "intelligence": 80
    },
    "skills": {
      "spot_hidden": 45,
      "library_use": 30
    },
    "resources": {
      "hp": { "current": 12, "max": 12 },
      "san": { "current": 60, "max": 60 }
    },
    "custom_fields": {}
  },
  "warnings": [],
  "meta": {
    "import_format": "cson",
    "version": "1.0",
    "imported_at": "2026-04-26T15:23:00Z",
    "source_ruleset_name": "coc7",
    "matched_ruleset_id": "coc7",
    "match_score": 0.95,
    "fields_matched": 12,
    "fields_total": 12
  }
}
```

**示例 B：强制导入（部分成功）**

```json
{
  "status": "partial_success",
  "data": {
    "character_id": "char_def456",
    "name": "李四",
    "ruleset_id": "coc7",
    "attributes": {
      "strength": 55,
      "dexterity": 60
    },
    "skills": {
      "spot_hidden": 40
    },
    "resources": {
      "hp": { "current": 10, "max": 10 }
    },
    "custom_fields": {
      "luck_points": 50,
      "credit_rating": 30,
      "personal_notes": "来自旧平台的自定义字段"
    }
  },
  "warnings": [
    {
      "code": "UNKNOWN_FIELDS_IGNORED",
      "message": "字段 'luck_points' 未被当前规则包识别，已保留到 custom_fields",
      "field_path": "luck_points"
    },
    {
      "code": "UNKNOWN_FIELDS_IGNORED",
      "message": "字段 'credit_rating' 未被当前规则包识别，已保留到 custom_fields",
      "field_path": "credit_rating"
    }
  ],
  "meta": {
    "import_format": "cson",
    "version": "1.0",
    "imported_at": "2026-04-26T15:23:00Z",
    "source_ruleset_name": "coc7",
    "matched_ruleset_id": "coc7",
    "match_score": 0.88,
    "fields_matched": 9,
    "fields_total": 12,
    "forced": true
  }
}
```

**示例 C：失败（未指定规则包且未手选）**

```json
{
  "status": "failed",
  "data": null,
  "warnings": [],
  "error": {
    "code": "IMPORT_RULESET_REQUIRED",
    "message": "导入数据未指定规则包，请选择目标规则包",
    "failed_stage": "import",
    "failed_node_id": null,
    "details": {
      "requires_manual_selection": true,
      "available_rulesets": [
        { "id": "coc7", "name": "COC 7th Edition" },
        { "id": "dnd5e", "name": "D&D 5th Edition" }
      ]
    }
  },
  "meta": {
    "import_format": "cson",
    "version": "1.0",
    "imported_at": "2026-04-26T15:23:00Z",
    "source_ruleset_name": null,
    "matched_ruleset_id": null,
    "match_score": 0,
    "fields_matched": 0,
    "fields_total": 0
  }
}
```

**示例 D：失败（版本格式错误）**

```json
{
  "status": "failed",
  "data": null,
  "warnings": [],
  "error": {
    "code": "INVALID_VERSION_FORMAT",
    "message": "版本格式必须为 major.minor（如 1.0），收到: \"v1.0-beta\"",
    "failed_stage": "import",
    "failed_node_id": null,
    "details": {
      "received_version": "v1.0-beta",
      "expected_format": "major.minor"
    }
  },
  "meta": {
    "import_format": "cson",
    "version": "v1.0-beta",
    "imported_at": "2026-04-26T15:23:00Z",
    "source_ruleset_name": "coc7",
    "matched_ruleset_id": null,
    "match_score": 0,
    "fields_matched": 0,
    "fields_total": 0
  }
}
```

**示例 E：失败（结构校验失败）**

```json
{
  "status": "failed",
  "data": null,
  "warnings": [],
  "error": {
    "code": "IMPORT_SCHEMA_INVALID",
    "message": "角色卡结构校验失败：必填字段 'meta.name' 缺失",
    "failed_stage": "import",
    "failed_node_id": null,
    "details": {
      "validation_errors": [
        {
          "field_path": "meta.name",
          "constraint": "required",
          "message": "必填字段缺失"
        }
      ]
    }
  },
  "meta": {
    "import_format": "cson",
    "version": "1.0",
    "imported_at": "2026-04-26T15:23:00Z",
    "source_ruleset_name": "coc7",
    "matched_ruleset_id": null,
    "match_score": 0,
    "fields_matched": 0,
    "fields_total": 0
  }
}
```

## K.8 字段映射字典最小基线（COC7）

### K.8.1 目标与边界

- 本节定义的是导入兼容层的“字段映射规范”，不是平台内置规则数据。
- COC7 技能规范键名固定复用 `skill_id`（与规则包一致）。
- 平台必须保证：COC7 官方技能全量可映射（约 100+）；未列入本节示例的条目由规则包映射注册表补齐。
- 技能默认值、分类、成长方式等业务数据来自导入 JSON（`skill_definitions`），不写死在平台代码中。

### K.8.2 归一化与匹配流程

导入匹配前，键名统一执行以下归一化：

1. 去除首尾空格。
2. 全角转半角（仅对可转换字符）。
3. 英文字符转小写。

匹配顺序：

1. 规范键名精确匹配。
2. 别名集合精确匹配。
3. 若仍未命中：写入 `custom_fields`，并记录 `warnings[].code='UNKNOWN_FIELDS_IGNORED'`。

### K.8.3 别名冲突处理

- 当同一别名命中多个规范键名时：禁止自动判定。
- 系统返回待人工确认（含候选列表）；用户未确认前不写入冲突字段。
- 用户选择“强制导入”时，冲突字段写入 `custom_fields`，并记录 `warnings[].code='UNKNOWN_FIELDS_IGNORED'`。

### K.8.4 资源键名基线

COC7 资源规范键名最小基线固定为：

- `hp`
- `mp`
- `san`
- `luck`

其他资源允许扩展，但默认进入 `custom_fields.resources`。

### K.8.5 最小映射样例（示例）

```json
{
  "ruleset_id": "coc7",
  "attributes": {
    "strength": { "aliases": ["str", "STR", "力量"] },
    "constitution": { "aliases": ["con", "CON", "体质"] },
    "size": { "aliases": ["siz", "SIZ", "体型"] },
    "dexterity": { "aliases": ["dex", "DEX", "敏捷"] },
    "appearance": { "aliases": ["app", "APP", "外貌"] },
    "intelligence": { "aliases": ["int", "INT", "智力"] },
    "willpower": { "aliases": ["pow", "POW", "意志"] },
    "education": { "aliases": ["edu", "EDU", "教育"] }
  },
  "skills": {
    "spot_hidden": { "aliases": ["侦查", "目星", "spot hidden"] },
    "library_use": { "aliases": ["图书馆使用", "图书馆", "library use"] },
    "psychology": { "aliases": ["心理学", "psychology"] },
    "fighting_brawl": { "aliases": ["斗殴", "徒手格斗", "fighting brawl"] },
    "firearms_handgun": { "aliases": ["射击（手枪）", "手枪", "firearms handgun"] }
  },
  "resources": {
    "hp": { "aliases": ["HP", "生命值"] },
    "mp": { "aliases": ["MP", "魔法值"] },
    "san": { "aliases": ["SAN", "理智值", "sanity"] },
    "luck": { "aliases": ["幸运", "Luck"] }
  }
}
```

说明：

- 上述仅为最小样例；COC7 生产映射表必须覆盖全部官方 `skill_id`。
- 全量映射建议由规则包发布流程自动生成并版本化，避免手工维护遗漏。

## K.9 冲突确认交互契约

### K.9.1 触发条件

以下场景进入人工确认：

- 同一原始字段命中多个规范键名候选。
- 系统无法在不丢失语义的前提下自动决策。

该场景不计为最终失败，统一返回 `status='needs_confirmation'`。

### K.9.2 冲突响应结构

```typescript
interface ImportConflictCandidate {
  key: string;
  display_name: string;
  type: 'attribute' | 'skill' | 'resource';
  confidence: number;            // 0-1
}

interface ImportConflictItem {
  field_path: string;            // 原始 JSONPath，如 "character.skills.侦查"
  raw_key: string;               // 原始字段名，如 "侦查"
  candidates: ImportConflictCandidate[];
}

interface ImportNeedsConfirmationResponse {
  status: 'needs_confirmation';
  data: null;
  warnings: ImportWarning[];
  error: {
    code: 'IMPORT_ALIAS_CONFLICT';
    message: string;
    failed_stage: 'import';
    failed_node_id: null;
    details: {
      conflicts: ImportConflictItem[];
    };
  };
  meta: ImportMeta;
}

interface ImportCsonConfirmRequest {
  file_content: string;          // 原始 CSON JSON
  preferred_ruleset_id?: string;
  force_import?: boolean;
  resolution_map: Record<string, string>; // field_path -> chosen key
}
```

约束：

- `resolution_map` 的 key 固定使用原始 JSONPath。
- 候选项最小结构固定为 `{ key, display_name, type, confidence }`。
- 若存在多个冲突字段，用户必须本次全部确认后才可完成正式导入。
- 若用户选择强制导入，则全部冲突字段写入 `custom_fields`，并记录 `warnings[].code='UNKNOWN_FIELDS_IGNORED'`。

### K.9.3 冲突响应示例

```json
{
  "status": "needs_confirmation",
  "data": null,
  "warnings": [],
  "error": {
    "code": "IMPORT_ALIAS_CONFLICT",
    "message": "检测到 2 个字段存在别名冲突，需用户确认后才能完成导入",
    "failed_stage": "import",
    "failed_node_id": null,
    "details": {
      "conflicts": [
        {
          "field_path": "character.skills.侦查",
          "raw_key": "侦查",
          "candidates": [
            {
              "key": "spot_hidden",
              "display_name": "侦查",
              "type": "skill",
              "confidence": 0.92
            },
            {
              "key": "search",
              "display_name": "搜索",
              "type": "skill",
              "confidence": 0.61
            }
          ]
        },
        {
          "field_path": "character.resources.幸运",
          "raw_key": "幸运",
          "candidates": [
            {
              "key": "luck",
              "display_name": "幸运",
              "type": "resource",
              "confidence": 0.95
            },
            {
              "key": "san",
              "display_name": "理智值",
              "type": "resource",
              "confidence": 0.22
            }
          ]
        }
      ]
    }
  },
  "meta": {
    "import_format": "cson",
    "version": "1.0",
    "imported_at": "2026-04-26T16:10:00Z",
    "source_ruleset_name": "coc7",
    "matched_ruleset_id": "coc7",
    "match_score": 0.91,
    "fields_matched": 10,
    "fields_total": 12
  }
}
```

### K.9.4 二次确认请求示例

```json
{
  "file_content": "{...原始 CSON JSON...}",
  "preferred_ruleset_id": "coc7",
  "force_import": false,
  "resolution_map": {
    "character.skills.侦查": "spot_hidden",
    "character.resources.幸运": "luck"
  }
}
```

### K.9.5 二次确认后成功响应示例

```json
{
  "status": "success",
  "data": {
    "character_id": "char_xyz789",
    "name": "王五",
    "ruleset_id": "coc7",
    "attributes": {
      "strength": 55,
      "dexterity": 65
    },
    "skills": {
      "spot_hidden": 60
    },
    "resources": {
      "luck": { "current": 45, "max": 45 }
    },
    "custom_fields": {}
  },
  "warnings": [],
  "meta": {
    "import_format": "cson",
    "version": "1.0",
    "imported_at": "2026-04-26T16:12:00Z",
    "source_ruleset_name": "coc7",
    "matched_ruleset_id": "coc7",
    "match_score": 0.91,
    "fields_matched": 12,
    "fields_total": 12
  }
}
```

## K.10 导出约束与 Round-Trip 保真规则

### K.10.1 导出规则

- 导出字段键名始终使用规范英文 `snake_case`，不回写导入时的原始中文键名。
- `schema_version` 固定输出当前支持版本 `1.0`。
- `display_labels`：若存在则作为 `custom_fields.display_labels` 原样保留；若不存在不自动生成。
- `custom_fields`：原样回写，不做语义提升或结构裁剪。
- 标准资源（`hp/mp/san/luck`）写入 `character.resources`；未知资源保留在 `custom_fields.resources`。
- 若系统判断“导入 -> 平台内表示 -> 导出”后无法满足结构等价，允许导出，但必须返回 `warnings[].code='ROUNDTRIP_LOSSY'`。

### K.10.2 导出响应结构

```typescript
type ExportStatus = 'success';

interface ExportWarning {
  code: 'ROUNDTRIP_LOSSY';
  message: string;
  field_path?: string;
}

interface ExportMeta {
  export_format: 'cson';
  schema_version: '1.0';
  exported_at: string;           // ISO 8601
  roundtrip_equivalent: boolean;
}

interface ExportCsonResponse {
  status: ExportStatus;
  data: CSONDocument;
  warnings: ExportWarning[];
  meta: ExportMeta;
}
```

### K.10.3 结构等价判定标准

“Round-trip 结构等价”定义如下：

- 对象层面：键集合一致，且对应值递归等价。
- 数组层面：元素数量一致，且按顺序递归等价。
- 允许差异：JSON 键顺序、空白格式、`meta.created_at`、`meta.updated_at`、`meta.exported_at` 等纯时间戳差异。
- 不允许差异：标准字段值变化、`custom_fields` 内容缺失、未知资源丢失、结构类型变化。

### K.10.4 导出示例

**示例 A：标准导出**

```json
{
  "status": "success",
  "data": {
    "schema_version": "1.0",
    "meta": {
      "name": "哈维·沃尔特",
      "player_name": "玩家A",
      "created_at": "2026-04-10T08:00:00Z",
      "updated_at": "2026-04-26T16:30:00Z"
    },
    "character": {
      "attributes": {
        "strength": 60,
        "constitution": 50,
        "dexterity": 55
      },
      "skills": {
        "spot_hidden": 60,
        "library_use": 40
      },
      "resources": {
        "hp": { "current": 11, "max": 11 },
        "san": { "current": 55, "max": 60 }
      },
      "custom_fields": {
        "occupation": "警探",
        "resources": {
          "energy_shield": { "current": 3, "max": 3 }
        },
        "display_labels": {
          "skills": {
            "spot_hidden": "侦查"
          }
        }
      }
    },
    "source": {
      "ruleset_name": "克苏鲁的呼唤 第七版",
      "platform": "trpg-platform",
      "original_format": "cson"
    }
  },
  "warnings": [],
  "meta": {
    "export_format": "cson",
    "schema_version": "1.0",
    "exported_at": "2026-04-26T16:30:00Z",
    "roundtrip_equivalent": true
  }
}
```

**示例 B：有损导出但允许完成**

```json
{
  "status": "success",
  "data": {
    "schema_version": "1.0",
    "meta": {
      "name": "旧版角色卡"
    },
    "character": {
      "attributes": {
        "strength": 50
      },
      "skills": {},
      "resources": {
        "hp": { "current": 10, "max": 10 }
      },
      "custom_fields": {
        "legacy_fields": {
          "migrated_from_v0": true
        }
      }
    }
  },
  "warnings": [
    {
      "code": "ROUNDTRIP_LOSSY",
      "message": "导出结果无法与原始导入文件保持结构等价，未识别旧版字段已集中保留到 custom_fields.legacy_fields",
      "field_path": "character.custom_fields.legacy_fields"
    }
  ],
  "meta": {
    "export_format": "cson",
    "schema_version": "1.0",
    "exported_at": "2026-04-26T16:35:00Z",
    "roundtrip_equivalent": false
  }
}
```

### K.10.5 Round-Trip 判定示例

**示例 C：判定为结构等价**

导入前：

```json
{
  "schema_version": "1.0",
  "meta": {
    "name": "测试角色",
    "created_at": "2026-04-01T00:00:00Z"
  },
  "character": {
    "skills": {
      "spot_hidden": 50
    },
    "resources": {
      "hp": { "current": 10, "max": 10 }
    }
  }
}
```

导出后：

```json
{
  "schema_version": "1.0",
  "meta": {
    "name": "测试角色",
    "created_at": "2026-04-26T16:40:00Z"
  },
  "character": {
    "resources": {
      "hp": { "max": 10, "current": 10 }
    },
    "skills": {
      "spot_hidden": 50
    }
  }
}
```

判定：结构等价。原因：仅存在键顺序差异与时间戳差异。

**示例 D：判定为有损**

导入前：

```json
{
  "schema_version": "1.0",
  "meta": {
    "name": "测试角色"
  },
  "character": {
    "resources": {
      "hp": { "current": 10, "max": 10 },
      "morale": { "current": 3, "max": 5 }
    }
  }
}
```

导出后：

```json
{
  "schema_version": "1.0",
  "meta": {
    "name": "测试角色"
  },
  "character": {
    "resources": {
      "hp": { "current": 10, "max": 10 }
    },
    "custom_fields": {
      "resources": {
        "morale": { "current": 3, "max": 5 }
      }
    }
  }
}
```

判定：不满足结构等价，但允许导出并返回 `ROUNDTRIP_LOSSY`。原因：未知资源从标准 `resources` 迁移到了 `custom_fields.resources`。

## K.11 实现约束与测试基线

### K.11.1 测试分层

本节测试基线分为两层：

- **协议级必测**：任何实现 CSON 的平台都必须满足，用于验证协议兼容性与数据保真。
- **平台实现级建议测试**：针对本平台导入器、导出器、规则包映射器的工程质量保障，建议纳入自动化测试。

### K.11.2 协议级必测矩阵

| 场景 | 输入 | 期望状态 | 关键断言 |
|------|------|----------|----------|
| 标准导入成功 | 合法 CSON 1.0 | `success` | 标准字段进入结构化字段；无 warning |
| 强制导入 | 含未知字段/未知资源 | `partial_success` | 未知字段进入 `custom_fields`；未知资源进入 `custom_fields.resources`；返回 warning |
| ruleset 缺失 | `source.ruleset_name` 缺失且未手选 | `failed` | `error.code='IMPORT_RULESET_REQUIRED'` |
| alias 冲突 | 同一原始键命中多个候选 | `needs_confirmation` | `error.code='IMPORT_ALIAS_CONFLICT'`；返回候选列表 |
| 结构校验失败 | 缺失必填字段或结构错误 | `failed` | `error.code='IMPORT_SCHEMA_INVALID'` |
| 版本格式错误 | 非 `major.minor` | `failed` | `error.code='INVALID_VERSION_FORMAT'` |
| 标准导出成功 | 平台内合法角色卡 | `success` | 导出键名为英文 `snake_case`；`schema_version='1.0'` |
| round-trip 有损 | 未知资源或旧版遗留字段 | `success` | 返回 `ROUNDTRIP_LOSSY`；`roundtrip_equivalent=false` |

### K.11.3 平台实现级建议测试

建议额外覆盖以下实现级测试：

- 键名归一化：trim、全角转半角、英文小写。
- 映射注册表：COC7 官方 `skill_id` 全量覆盖校验。
- 冲突确认：多个冲突字段必须一次全部确认，未全部确认不得完成导入。
- 强制导入：冲突字段与未知字段必须完整保留，不得静默丢失。
- 导出保真：`custom_fields` 原样回写，不做隐式语义提升。

### K.11.4 自动化断言清单

Round-trip 自动化断言直接复用 K.10 的“结构等价”定义，至少包含：

1. 标准字段值不得变化。
2. `custom_fields` 内容不得丢失。
3. unknown resource 不得丢失，必须迁移到 `custom_fields.resources`。
4. 时间戳变化、键顺序变化不计为失败。
5. alias 冲突场景中，未全部确认前不得生成最终导入结果。

### K.11.5 兼容性测试矩阵

首批兼容性矩阵固定覆盖以下来源：

| 来源格式 | 测试目标 |
|----------|----------|
| CSON 1.0 | 协议自洽、导入导出闭环 |
| HKTRPG 角色卡 | 扁平字段映射与中文别名兼容 |
| Session Zero Format (.szf) | 元数据/角色数据分离结构兼容 |
| rpgsheet | 极简 JSON/YAML 字段映射兼容 |

### K.11.6 用例命名模板

自动化测试推荐使用统一命名模板：

- `should_<expected_result>_when_<condition>`

示例：

- `should_return_success_when_importing_valid_cson_1_0`
- `should_return_partial_success_when_force_import_contains_unknown_fields`
- `should_return_needs_confirmation_when_alias_conflict_detected`
- `should_preserve_custom_fields_when_exporting_roundtrip_document`
- `should_emit_roundtrip_lossy_warning_when_unknown_resource_moves_to_custom_fields`

### K.11.7 最低验收要求

- 协议级必测矩阵 8 类场景全部通过，方可宣称“兼容 CSON 1.0”。
- 平台实现级建议测试未全部覆盖时，不得宣称“完整保真 round-trip”，只能标注为“基础兼容”。

## K.12 封版前末次检查清单

发布前请逐条确认以下事项：

- [ ] **状态与错误码一致性**：`success/partial_success/needs_confirmation/failed` 与 `EngineErrorCode`（含 `IMPORT_ALIAS_CONFLICT`、`IMPORT_RULESET_REQUIRED`）在接口定义、流程说明、示例 JSON 三处一致。
- [ ] **warning 表达一致性**：全文仅使用 `warnings[].code` 作为 warning 标识表达，不再出现 `warning_code` 旧口径。
- [ ] **键名规范一致性**：规范字段全部采用英文 `snake_case`；中文仅出现在 `display_labels`/`aliases` 或说明文案中。
- [ ] **冲突确认闭环**：存在 alias 冲突时必须返回 `needs_confirmation`，并要求一次性完成全部 `resolution_map` 确认后才能完成正式导入。
- [ ] **未知字段保真**：unknown fields 与 unknown resources 均可追踪保留（分别进入 `custom_fields` 与 `custom_fields.resources`），不得静默丢失。
- [ ] **导出与版本规则**：导出固定 `schema_version='1.0'`，`custom_fields` 原样回写，`display_labels` 若存在则作为 `custom_fields.display_labels` 保留。
- [ ] **round-trip 告警规则**：不满足结构等价时允许导出，但必须返回 `warnings[].code='ROUNDTRIP_LOSSY'` 且 `roundtrip_equivalent=false`。
- [ ] **测试基线达成**：K.11 协议级 8 类必测场景全部通过，兼容性矩阵（CSON/HKTRPG/SZF/rpgsheet）至少完成首轮验证。

> **关联文档**：《附录 H：跑团日志中间格式规范（ILF）》、《产品设计.md》第 5.6 节。

---