# API Contracts

本目录存放 TRPG 平台核心接口的 OpenAPI 3.0 契约文件，用于：

- 前端生成 API Client 与类型定义
- 后端对齐请求/响应字段与错误码
- 测试与产品生成 Mock 服务

## 统一约定

1. 幂等请求必须携带 `idempotent_key`（UUID v4）。
2. 同一幂等键重复请求时，服务端返回首次成功结果（而非创建新资源）。
3. `409` 仅用于真实业务状态冲突，不用于幂等重放。
4. 错误结构统一为 `ErrorResponse`。

## 文件索引

| 接口 | 文件 |
|---|---|
| 发布招募帖 | [recruitment-publish.yaml](recruitment-publish.yaml) |
| 申请加入招募帖 / 确认入团 | [recruitment-apply.yaml](recruitment-apply.yaml) |
| 跑团反馈（Stars and Wishes） | [campaign-feedback.yaml](campaign-feedback.yaml) |
| 作品评价与收藏 | [product-reviews-collections.yaml](product-reviews-collections.yaml) |
| AI 智能校对（同步） | [ai-check-text.yaml](ai-check-text.yaml) |
| AI 模组分析（异步入队） | [ai-import-module.yaml](ai-import-module.yaml) |
| AI 月度配额查询 | [ai-quota.yaml](ai-quota.yaml) |
| 创建房间 | [campaign-create.yaml](campaign-create.yaml) |
| 统一搜索与推荐标签 | [search-query.yaml](search-query.yaml) |
| 规则引擎执行检定 | [engine-execute.yaml](engine-execute.yaml) |
| GM 审批/拒绝移动 | [gm-approve-move.yaml](gm-approve-move.yaml) |
| 拉取历史消息 | [messages-list.yaml](messages-list.yaml) |

### 补充接口（导演台与轨迹矩阵）

| 接口 | 文件 |
|---|---|
| 获取规则包的招募字段 | [recruitment-fields-get.yaml](recruitment-fields-get.yaml) |
| GM 导演台 - 待审批移动列表 | [gm-pending-moves-get.yaml](gm-pending-moves-get.yaml) |
| GM 导演台 - 即将自动执行预约 | [gm-upcoming-moves-get.yaml](gm-upcoming-moves-get.yaml) |
| 玩家申请移动 | [move-apply-post.yaml](move-apply-post.yaml) |
| GM 强制移动 | [gm-force-move-post.yaml](gm-force-move-post.yaml) |
| 拉取轨迹矩阵数据 | [trajectory-matrix-get.yaml](trajectory-matrix-get.yaml) |

## 版本建议

- 采用语义化版本（`info.version`）。
- 破坏性变更必须升级主版本。

## AI 错误码参照表

| 错误码 | HTTP 状态 | 说明 | 前端处理建议 |
|--------|----------|------|------------|
| `AI_FEATURE_LOCKED` | 403 | 会员等级不支持此 AI 功能 | 弹窗提示"请升级为专业版或创作者版"，附带升级按钮 |
| `AI_QUOTA_EXCEEDED` | 429 | 月度调用次数已达上限 | 弹窗显示"本月 AI 使用次数已达上限（X/Y），下月自动重置"，同时返回 `used` 与 `quota` |
| `AI_UNAVAILABLE` | 502 | AI 服务暂时不可用 | 弹窗"AI 服务暂时不可用，请稍后重试"，可重试 |
| `QUEUE_UNAVAILABLE` | 503 | 异步队列不可用 | 弹窗"任务入队失败，请稍后重试"，可重试 |
| `Validation failed` | 400 | 请求参数不合法 | 检查参数合法性，前端表单校验增强 |
