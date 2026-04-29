# 附录 H04：AI 功能接入与商业化

> 文档版本：V1.7
> 状态：正式发布
> 来源整合：原附录 F01（AI 功能接入方案 DeepSeek），按“计费/限流/异步任务”职责迁入 H 组

## 1. 职责边界

本附录负责：

1. AI 供应商接入、模型端点规划与任务分流。
2. 会员配额、成本计量、失败不计费、异步任务与重试策略。
3. AI 输入输出安全、内容预检、日志留痕与隐私口径。

本附录不负责：

1. AI 功能的产品能力规划与交互总纲，归附录 F。
2. 会员等级定义与订阅身份语义，归附录 H01。
3. 支付扣费、钱包账本与订单结算，归附录 H03。

## 2. 模型选择与端点规划

| 端点 | 适用任务 | 核心优势 | 延迟预期 |
| --- | --- | --- | --- |
| pro | 模组导入、日志摘要、规则生成 | 大上下文、强推理、结构化输出稳定 | 5-30 秒 |
| flash | 智能校对、术语统一 | 低延迟、低成本、高频可用 | < 2 秒 |

```typescript
export const aiConfig = {
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseUrl: 'https://api.deepseek.com/v1',
  endpoints: {
    pro: {
      model: process.env.DEEPSEEK_PRO_MODEL || 'deepseek-chat',
      maxTokens: 16384,
      temperature: 0.3,
    },
    flash: {
      model: process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-chat',
      maxTokens: 4096,
      temperature: 0.1,
    },
  },
};
```

## 3. 会员配额与计费口径

| 会员等级 | 模组导入 | 智能校对 | 日志摘要 | 规则生成 |
| --- | --- | --- | --- | --- |
| 免费版 | 0 | 0 | 0 | 0 |
| 专业版 | 3 次/月 | 20 次/月 | 5 次/月 | 3 次/月 |
| 创作者版 | 10 次/月 | 100 次/月 | 15 次/月 | 10 次/月 |

规则：

1. 会员层级归属以附录 H01 为准，本附录只定义 AI 任务配额。
2. 任务失败、供应商异常、Schema 校验失败时不消耗用户配额。
3. 若未来接入按次计费或积分扣费，账本只通过附录 H03 的钱包体系结算。

### 3.1 使用日志

```sql
CREATE TABLE ai_usage_log (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  task_type ENUM('import_module', 'check_text', 'log_summary', 'generate_recipe') NOT NULL,
  endpoint ENUM('pro', 'flash') NOT NULL,
  status ENUM('success', 'failed', 'queued') NOT NULL,
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  cost_cents INT NOT NULL,
  duration_ms INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_month (user_id, task_type, created_at)
);
```

## 4. 异步任务架构

1. AI 调用统一经 Redis 队列（BullMQ）分发，避免阻塞主业务。
2. 客户端可通过 ai_task_update Socket 事件或轮询任务接口获取进度。
3. API 调用失败自动重试 2 次，间隔 3 秒与 9 秒。
4. 连续失败后标记为 failed，并提示“本次不会消耗使用次数”。

## 5. 任务分流基线

| 任务 | 默认端点 | 结算单位 | 备注 |
| --- | --- | --- | --- |
| 模组导入 | pro | 次数 | 异步任务，支持结果预览后二次确认 |
| 智能校对 | flash | 次数 | 高频低延迟，不直接改写原文 |
| 跑团日志摘要 | pro | 次数 | 输入 ILF，输出结构化摘要 |
| 规则生成 | pro | 次数 | 需注入规则包 schema 上下文 |

## 6. 安全与合规

### 6.1 输入预检

1. 所有送入模型的文本必须先过敏感词过滤和 XSS 消毒。
2. 命中违规内容时拒绝处理、记录审计日志且不消耗配额。
3. 长度异常、连续无意义字符或明显提示词注入的输入应直接拦截。

### 6.2 输出约束

1. 模型返回必须通过 JSON Schema 校验。
2. 非 JSON 或字段不完整时，任务标记失败，不自动伪造结果。
3. 导入类任务允许对单个实体失败进行局部容错，但不允许静默吞掉结构错误。

### 6.3 数据隐私

1. 提交给供应商的内容仅用于当次任务，不作为训练数据。
2. 平台隐私政策需明确“用户模组、跑团日志不用于模型训练”。
3. 用户在设置中关闭 AI 后，入口隐藏且对应前端 chunk 不加载。

## 7. 交叉引用

1. AI 产品能力总纲见附录 F。
2. 会员身份与配额层级见附录 H01。
3. 若未来接入余额扣费、积分兑换或套餐升级，支付账本见附录 H03。

## 8. 变更记录

- 2026-04-29：由原附录 F01 迁入 H 组，改名为“AI 功能接入与商业化”。
