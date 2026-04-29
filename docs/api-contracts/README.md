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
| 创建房间 | [campaign-create.yaml](campaign-create.yaml) |
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
