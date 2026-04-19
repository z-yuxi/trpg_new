

> **版本**：v1.0.0 | **状态**：正式发布 | **设计参考**：HKTRPG Bot、Session Zero Format (.szf)、rpgsheet

## K.1 设计原则

- **规则无关**：不依赖特定规则包的内部字段名，使用通用语义标识。
- **人类可读**：JSON 格式，字段名优先使用中文（可配置别名）。
- **可扩展**：通过 `custom_fields` 容纳任意自定义数据。
- **版本化**：通过 `schema_version` 标识格式版本，保证向前兼容。

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
  attributes: Record<string, number>;      // 基础属性，如 "力量": 60
  skills: Record<string, number>;          // 技能，如 "侦查": 60
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
    "attributes": { "力量": 60, "体质": 50, "体型": 65, "敏捷": 55, "外貌": 45, "智力": 70, "意志": 60, "教育": 75 },
    "skills": { "侦查": 60, "图书馆使用": 40, "心理学": 50, "斗殴": 55, "射击（手枪）": 45 },
    "resources": {
      "hp": { "current": 11, "max": 11 },
      "mp": { "current": 12, "max": 12 },
      "san": { "current": 55, "max": 60 },
      "luck": { "current": 50, "max": 50 }
    },
    "custom_fields": {
      "occupation": "警探",
      "age": 42,
      "equipment": ["手枪", "警徽", "手电筒"]
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

1. **规则包匹配**：根据 `source.ruleset_name` 进行相似度匹配（>80% 自动选择），否则提示用户手动选择。
2. **字段映射**：利用目标规则包的 `field_aliases` 将 CSON 中的中文键名映射为内部标识。未匹配字段原样存入 `custom_fields`。
3. **资源初始化**：同名资源导入当前/最大值；不存在的资源放入 `custom_fields.resources` 保留。
4. **冲突处理**：严重不兼容时弹出警告，允许用户“强制导入”（仅保留匹配部分）。

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

消费者遇到无法识别的字段应忽略，不报错。

> **关联文档**：《附录 H：跑团日志中间格式规范（ILF）》、《产品设计.md》第 5.6 节。

---

整理后的版本已合并重复说明，精简了章节层级，保留了全部技术细节和示例。可直接复制保存为 `.md` 文件使用。