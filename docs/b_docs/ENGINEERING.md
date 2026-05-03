代码包B - 工程实施指南
文档版本：V1.0
日期：2026-05-02
状态：正式发布
适用范围：代码包B开发团队

1. 环境搭建与运行指南
1.1 前置依赖
Python：3.11+

PostgreSQL：15+

Redis：7+

可选：Docker & Docker Compose

1.2 安装步骤
bash
# 1. 克隆仓库
git clone [代码包B仓库地址]
cd codebase-b

# 2. 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入实际配置

# 5. 初始化数据库
python scripts/init_db.py

# 6. 启动服务
uvicorn src.main:app --reload --port 8001
1.3 Docker部署（推荐）
bash
docker-compose up -d
1.4 环境变量模板（.env.example）
bash
# ---- 数据库 ----
DATABASE_URL=postgresql://user:password@localhost:5432/codebase_b
REDIS_URL=redis://localhost:6379/0

# ---- DeepSeek API ----
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
DEEPSEEK_PRO_MODEL=deepseek-chat
DEEPSEEK_FLASH_MODEL=deepseek-chat

# ---- 代码包A认证 ----
AGENT_SERVICE_API_KEY=xxxxxxxxxxxxxxxx
CODEBASE_A_BASE_URL=http://localhost:3000/api

# ---- LoRA存储 ----
LORA_STORAGE_PATH=/data/lora
LORA_ENCRYPTION_KEY=xxxxxxxxxxxxxxxx

# ---- 日志 ----
LOG_LEVEL=INFO
2. 技术选型与依赖清单
类别	选型	说明
Web框架	FastAPI	高性能，异步支持，自动生成API文档
Agent编排	LangChain	Agent调度、工具调用、记忆管理
MCP实现	FastMCP	快速构建MCP服务端和客户端
数据库ORM	SQLAlchemy 2.0	异步支持，与FastAPI无缝集成
缓存	Redis + redis-py	任务队列、缓存、分布式锁
任务队列	Celery + Redis	异步任务执行（如LoRA微调触发）
向量数据库	Chroma	轻量级，适合MVP阶段的RAG需求
测试	pytest + pytest-asyncio	单元测试与集成测试
代码质量	Ruff (Linter + Formatter)	快速，兼容Flake8/Black
核心依赖清单 (requirements.txt)：

text
fastapi==0.115.0
uvicorn[standard]==0.30.0
langchain==0.3.0
langchain-openai==0.2.0
fastmcp==0.1.0
sqlalchemy[asyncio]==2.0.35
asyncpg==0.29.0
redis==5.1.0
celery==5.4.0
chromadb==0.5.0
pytest==8.3.0
pytest-asyncio==0.24.0
ruff==0.6.0
python-dotenv==1.0.0
cryptography==43.0.0
3. 数据库与缓存设计
3.1 数据表设计（PostgreSQL）
sql
-- Agent配置表
CREATE TABLE agent_configs (
    id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(64) NOT NULL UNIQUE,
    nickname VARCHAR(64) NOT NULL,
    uid VARCHAR(20),
    persona TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    permission_level INT NOT NULL DEFAULT 2,
    allowed_tools JSONB DEFAULT '[]',
    lora_version VARCHAR(32),
    status VARCHAR(16) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 任务队列表
CREATE TABLE agent_tasks (
    id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(64) NOT NULL,
    command TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    status VARCHAR(16) DEFAULT 'queued',  -- queued/processing/success/failed
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- 执行日志表
CREATE TABLE agent_logs (
    id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64),
    action VARCHAR(64) NOT NULL,
    input JSONB,
    output JSONB,
    duration_ms INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- LoRA版本表
CREATE TABLE lora_versions (
    id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(64) NOT NULL,
    version VARCHAR(32) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_hash VARCHAR(128) NOT NULL,
    status VARCHAR(16) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
3.2 缓存策略（Redis）
缓存键模式	用途	TTL
agent:config:{agent_id}	Agent配置缓存	3600s
task:lock:{task_id}	任务去重锁	300s
rate_limit:{agent_id}:{action}	Agent操作频率限制	60s
lora:active:{agent_id}	当前激活的LoRA版本号	永久
4. 安全设计
4.1 API Key管理
DeepSeek API Key、AGENT_SERVICE_API_KEY 等敏感信息仅通过环境变量注入

禁止在代码、配置文件、日志中硬编码或输出

定期轮换（建议每90天），轮换时需同步更新代码包A和B的配置

4.2 LoRA加密策略
加密算法：AES-256-GCM

密钥管理：LORA_ENCRYPTION_KEY 通过环境变量注入，不存储在代码仓库中

解密仅在Agent需要加载LoRA时在内存中进行，不写入磁盘明文

4.3 沙箱执行边界
Agent生成的用户内容（帖子、评论）在发送前，必须经过内容安全检测

Agent调用的MCP工具参数，必须在服务端再次校验权限（不能仅依赖Agent自觉）

禁止Agent执行任何系统命令或文件操作（除非通过预定义的MCP工具）

4.4 审计日志规范
日志内容	格式	保留期限
Agent每次API调用	JSON结构化日志	90天
管理员对Agent的反馈（确认/驳回/修正）	同上	永久
LoRA更新记录	同上	永久
异常/错误事件	同上 + 告警	90天
5. 开发规范与贡献指南
5.1 代码风格
使用 ruff 进行代码检查和格式化

配置文件：pyproject.toml 中的 [tool.ruff] 段

CI中强制通过Lint检查才能合并

5.2 Git工作流
主分支：main（受保护）

开发分支：feature/{功能名} 或 fix/{问题描述}

PR流程：创建PR → 自动运行测试 → 至少1人Code Review → 合并

提交信息格式：<type>: <简短描述>，如 feat: add agent_ying prompt

5.3 测试规范
单元测试覆盖率目标：≥80%

所有MCP工具必须有单元测试

所有API接口必须有集成测试

运行测试：pytest tests/ -v --cov=src --cov-report=html

5.4 新增Agent的标准流程
在 .ai/prompts/ 下创建Agent的System Prompt文件（如 agent_ying.md）

在 src/agents/ 下创建Agent实现类，继承 BaseAgent

在数据库中插入Agent配置记录

为Agent编写单元测试

更新 docs/R01-AI-Agent框架设计规范.md 中的角色清单

提交PR，通过Code Review后合并

6. 测试策略与验收标准
6.1 测试分层
测试类型	覆盖范围	运行频率
单元测试	所有MCP工具、Agent调度逻辑、模型调用封装	每次提交
集成测试	Agent完整工作流（模拟代码包A的API）	每次PR
端到端测试	与代码包A的联调测试	发版前
6.2 Agent行为验收标准
验收项	标准
回复风格一致性	Agent的回复必须符合其System Prompt中定义的语言风格
违规内容拒绝率	当用户输入包含违规内容时，Agent必须拒绝回复或给出合规回应
身份声明准确	用户问及身份时，Agent必须明确说明自己是AI
不编造经历	Agent的回复中不得出现虚假的个人跑团经历
6.3 性能测试基线
指标	可接受阈值
Agent单次推理延迟	< 5秒
并发处理能力	10个Agent同时工作不互相阻塞
API可用性	99.5%以上
7. 运维与监控
7.1 健康检查端点
GET /health：返回服务状态和各依赖服务（数据库、Redis、DeepSeek API）的连接状况

GET /health/agents：返回各Agent的运行状态

7.2 告警规则
告警项	阈值	处理方式
Agent长时间无响应	10分钟内无任何任务完成	检查DeepSeek API状态，必要时重启Agent服务
API调用失败率	5分钟内失败率超过10%	检查API Key是否过期，网络是否正常
任务队列积压	待处理任务超过100个	增加Worker数量或优化处理速度
LoRA加载失败	任何一次加载失败	立即回滚到上一个可用版本，通知管理员
7.3 LoRA更新操作手册
在测试环境对新LoRA进行验证（人工评估 + 自动化测试）

验证通过后，将LoRA文件加密上传到生产环境存储路径

更新数据库中 lora_versions 表，将新版本标记为 active，旧版本标记为 archived

重启对应Agent的Worker进程，使其加载新LoRA

监控Agent行为，如发现异常立即回滚

8. FAQ与问题排查
常见启动错误
错误信息	原因	解决方法
Could not connect to database	PostgreSQL未启动或连接串错误	检查 DATABASE_URL 配置和数据库服务状态
DeepSeek API returned 401	API Key无效或过期	检查 DEEPSEEK_API_KEY 是否配置正确
LoRA file not found	LoRA文件路径错误或未上传	检查 LORA_STORAGE_PATH 和文件是否存在
Agent not found	数据库中无此Agent配置	运行 scripts/init_db.py 初始化Agent配置
Agent行为异常排查
查看 agent_logs 表中该Agent的最近执行日志

检查Agent的System Prompt是否被误修改

查看对应的LoRA版本是否正确加载

用测试工具单独调用DeepSeek API + System Prompt，排除API问题

模型切换指南
如需从DeepSeek切换到其他模型（如本地模型）：

在 src/models/ 下创建新模型的适配器，实现 BaseModelAdapter 接口

修改环境变量 DEEPSEEK_PRO_MODEL 等配置

更新 requirements.txt，安装新模型的SDK

更新本文档中的技术栈说明

文档维护者：开发团队
下次评审：V1.0上线前

本回答由 AI 生成，内容仅供参考，请仔细甄别。