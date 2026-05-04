你是资深后端契约工程师。请仅做一件事：补齐代码包A缺失的 OpenAPI 契约文档，不修改业务逻辑代码。

# 目标
为以下缺失端点生成正式 OpenAPI 3.0.3 契约（每个端点至少包含 path、method、security、requestBody、responses、schemas）：
1) POST /api/posts
2) POST /api/comments
3) POST /api/help/chat
4) GET /api/help/faq
5) GET /api/admin/reports/{id}
6) POST /api/agent/review-suggestion
7) GET /api/admin/stats/trends
8) POST /api/agent/daily-report
9) POST /api/agent/legal-search
10) POST /api/agent/evidence-analysis

# 输入上下文（必须阅读）
- docs/b_docs/附录 R01：AI Agent框架设计规范.md
- docs/b_docs/AGENT蓝图.md
- docs/api-contracts/README.md
- docs/api-contracts/ai-check-text.yaml
- docs/api-contracts/ai-import-module.yaml
- docs/api-contracts/ai-quota.yaml
- packages/server/src/routes/index.ts
- packages/server/src/routes/*.ts（尤其 forum.ts、reports.ts、admin-ai.ts、metrics.ts、ai.ts）
- packages/server/src/middleware/auth.ts
- packages/server/src/utils/error-response.ts

# 约束
1) 只新增/更新 docs/api-contracts 下的 yaml，不改其他目录代码。
2) 不推测数据库结构，不写表字段细节。
3) 不补前端内容，不改业务实现。
4) 与现有风格一致：OpenAPI 3.0.3、统一 ErrorResponse、bearerAuth。
5) 若某字段在现有代码中不可确定，使用最小可用占位并加注释：
   - description: TODO(confirm with code owner)
   - 允许 additionalProperties: true
6) 保持可被 Mock Server 直接消费（例如 Prism）。

# 鉴权与错误处理要求
- 鉴权头统一：Authorization: Bearer <token>
- L3 端点若存在 API Key 模式，使用可并存 security（bearerAuth 与 apiKeyAuth 二选一）并在 description 说明。
- 错误码需覆盖：
  - R01 专用：AGENT_NOT_FOUND, INSUFFICIENT_PERMISSION, COMMAND_PARSE_ERROR, MODEL_TIMEOUT
  - 通用：INVALID_PARAM, FORBIDDEN, NOT_FOUND, IDEMPOTENT_CONFLICT, TOO_MANY_REQUESTS, INTERNAL_ERROR
  - AI：AI_FEATURE_LOCKED, AI_QUOTA_EXCEEDED, AI_UNAVAILABLE, QUEUE_UNAVAILABLE

# 输出要求
请直接输出可落盘的改动内容：
1) 新增或更新的 yaml 文件清单
2) 每个文件完整内容
3) 变更说明（每个端点一句）
4) 未决问题清单（必须列出无法从代码确定的字段）

# 自检清单（输出前必须自查）
- 是否所有 10 个端点都已覆盖
- 是否每个端点都有 success + 4xx/5xx 响应
- 是否所有 schema 的 required 字段合理
- 是否 security 与 auth 中间件约束一致
- 是否没有修改 docs/api-contracts 之外的文件

# 可选执行方式
优先将 10 个端点拆分为 3~5 个主题文件，避免单文件过大，例如：
- agent-community-tools.yaml（posts/comments/help）
- agent-governance-tools.yaml（reports/review-suggestion/trends）
- agent-legal-tools.yaml（daily-report/legal-search/evidence-analysis）

如果仓库已有更合适命名规范，遵循现有规范。