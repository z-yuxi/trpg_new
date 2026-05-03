# 附录 C05：故事录 API 合同

> 关联文档：[附录 C04：故事录产品状态机](./附录%20C04：故事录产品状态机.md)、[附录 B01：发现标签设计](./附录%20B01：发现标签设计.md)、[附录 C02-A：ILF 权威 Schema 规范](./附录%20C02-A：ILF%20权威%20Schema%20规范.md)

## 1. 公共约定

1. 前缀：`/api/stories`
2. 认证：`Authorization: Bearer <token>`（公共列表与公开详情除外）
3. 幂等：所有写操作必须携带 `idempotent_key`（UUID）
4. 统一错误结构：

```json
{
  "error": "string",
  "code": "BUSINESS_CODE",
  "request_id": "string"
}
```

5. 时间字段统一 ISO 8601（UTC）

## 2. 数据模型（逻辑）

```sql
CREATE TABLE stories (
  id UUID PRIMARY KEY,
  author_id UUID NOT NULL,
  title VARCHAR(128) NOT NULL,
  summary VARCHAR(100),
  content JSON NOT NULL,
  status ENUM('draft','private','published','unlisted','archived','flagged') NOT NULL,
  campaign_id UUID NULL,
  module_id UUID NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  published_at TIMESTAMP NULL,
  archived_at TIMESTAMP NULL,
  flagged_at TIMESTAMP NULL
);

CREATE INDEX idx_stories_author_status ON stories(author_id, status);
CREATE INDEX idx_stories_status_created ON stories(status, created_at DESC);
CREATE INDEX idx_stories_campaign ON stories(campaign_id);
CREATE INDEX idx_stories_module ON stories(module_id);
```

## 3. 字段约束

| 字段 | 必填 | 约束 | 备注 |
|---|---|---|---|
| `title` | 是 | 1~128 字符 | 故事标题 |
| `summary` | 否 | <=100 字符 | 简介 |
| `content` | 是 | ILF 文档对象（见 C02-A） | 正文 |
| `campaign_id` | 否 | UUID | 关联团 |
| `module_id` | 否 | UUID | 关联模组 |
| `visibility` | 是 | `private|published|unlisted` | 创建/改可见性时使用 |
| `idempotent_key` | 是 | UUID | 写操作幂等 |

## 4. 接口定义

### 4.1 创建故事录

`POST /api/stories`

请求体：

```json
{
  "title": "午夜教堂异闻录",
  "summary": "调查员在三夜内追查钟楼失踪案",
  "content": { "version": "1.0", "metadata": {}, "campaign": {} },
  "campaign_id": "uuid-or-null",
  "module_id": "uuid-or-null",
  "visibility": "private",
  "idempotent_key": "uuid"
}
```

成功响应（201）：

```json
{
  "story_id": "uuid",
  "status": "draft"
}
```

规则：

1. 创建后统一进入 `draft`，再由后续接口切换可见性。
2. 若相同 `idempotent_key` 重放，返回同一 `story_id`。

### 4.2 更新故事录

`PUT /api/stories/{story_id}`

权限：作者或管理员。

请求体（可部分更新）：

```json
{
  "title": "string",
  "summary": "string",
  "content": { "version": "1.0", "metadata": {}, "campaign": {} },
  "campaign_id": "uuid-or-null",
  "module_id": "uuid-or-null",
  "idempotent_key": "uuid"
}
```

规则：

1. 更新 `content`（正文）时：
   1. 若当前状态是 `published/unlisted/private`，自动回退到 `draft`。
   2. 若当前状态是 `archived/flagged`，拒绝更新。
2. `published/unlisted` 状态只允许更新摘要类字段（`title/summary`），不允许改 `content`。

### 4.3 更改可见性/发布

`PATCH /api/stories/{story_id}/visibility`

请求体：

```json
{
  "visibility": "private|published|unlisted",
  "idempotent_key": "uuid"
}
```

规则：

1. 转换必须遵守 C04 状态机。
2. `archived` 不允许转回公开。
3. `flagged` 仅管理员可通过审核接口解除。

### 4.4 公共列表

`GET /api/stories?page=1&limit=20&sort=latest|popular&module_id=xxx`

权限：公开。

返回：仅 `published` 条目。

### 4.5 我的故事录

`GET /api/stories/mine?status=draft|private|published|unlisted|archived|flagged`

权限：登录用户本人。

### 4.6 详情

`GET /api/stories/{story_id}`

权限：

1. `published/unlisted`：任意用户可读。
2. `draft/private/archived/flagged`：仅作者或管理员可读。

返回：

```json
{
  "id": "uuid",
  "author_id": "uuid",
  "title": "string",
  "summary": "string",
  "content": { "version": "1.0", "metadata": {}, "campaign": {} },
  "status": "draft|private|published|unlisted|archived|flagged",
  "campaign_id": "uuid-or-null",
  "module_id": "uuid-or-null",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

### 4.7 删除

`DELETE /api/stories/{story_id}`

权限：

1. 作者：仅 `draft/private` 可删除。
2. 管理员：全部状态可删除（需审计日志）。

### 4.8 分享链接/海报

`POST /api/stories/{story_id}/share`

权限：作者、管理员，或条目为 `published/unlisted` 的任意登录用户。

响应：

```json
{
  "share_url": "https://trpg.com/stories/{story_id}",
  "poster_url": "https://cdn.trpg.com/posters/{story_id}.png"
}
```

## 5. 审核接口（管理员）

### 5.1 标记违规

`POST /api/stories/{story_id}/flag`

```json
{
  "reason": "侵权/违规说明",
  "idempotent_key": "uuid"
}
```

效果：状态变为 `flagged`。

### 5.2 解除标记并回退

`POST /api/stories/{story_id}/unflag`

```json
{
  "idempotent_key": "uuid"
}
```

效果：状态回退到 `draft`。

## 6. 业务错误码

| code | 场景 |
|---|---|
| `STORY_NOT_FOUND` | 条目不存在 |
| `STORY_FORBIDDEN` | 无权限访问/操作 |
| `STORY_INVALID_STATE_TRANSITION` | 非法状态转换 |
| `STORY_ARCHIVED_IMMUTABLE` | 归档后禁止变更 |
| `STORY_FLAGGED_IMMUTABLE` | 标记违规后禁止普通编辑 |
| `STORY_CONTENT_SCHEMA_INVALID` | content 不符合 ILF Schema |
| `STORY_IDEMPOTENT_REPLAY` | 幂等重放命中 |

## 7. 测试验收口径

1. 全接口的鉴权与状态机规则覆盖率必须达到 100%。
2. 写接口幂等可重复调用且结果一致。
3. `content` Schema 校验失败必须返回结构化错误字段路径。
4. 所有管理员操作必须写审计日志。