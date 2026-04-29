# 招募系统发布回滚 SOP

> 适用场景：招募状态机 v2.0 相关变更上线与回退
> 版本：v1.0 | 2026-04-29

---

## 一、上线前检查清单（Pre-Release Checklist）

### 代码层面
- [ ] 所有 PR 已通过 Code Review
- [ ] `pnpm tsc --noEmit`（服务端/客户端）无新增错误
- [ ] 单元测试通过：`pnpm --filter @trpg/server test src/__tests__/recruitment-state-machine.test.ts`
- [ ] E2E 冒烟通过：`pnpm --filter @trpg/server test src/__tests__/e2e/recruitment.e2e.test.ts`
- [ ] 安全测试通过：`pnpm --filter @trpg/server test src/__tests__/security/`

### 迁移层面
- [ ] 在**预生产环境**执行迁移回滚演练：
  ```bash
  pnpm --filter @trpg/server tsx src/scripts/migrate-rollback-test.ts
  # 输出最后一行必须包含：=== 演练完成 ✓ ===
  ```
- [ ] 确认迁移脚本有对应 `down()` 回滚逻辑

### 基础设施
- [ ] 数据库已备份（上线前 30 分钟内）
  ```bash
  mysqldump -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME > backup_$(date +%Y%m%d_%H%M%S).sql
  ```
- [ ] Redis 数据（如需）已备份：`redis-cli -a $REDIS_PASSWORD save`
- [ ] 灰度实例已准备就绪：`docker compose --profile canary ps`

---

## 二、灰度上线流程（推荐流程）

```
阶段一：灰度验证（0% → 5%）
  1. 部署新版本到 server-canary:3001
  2. QA / 内测用户使用 X-Canary: 1 验证主链路
  3. 观察 15 分钟，检查错误率和响应时间

阶段二：扩大灰度（5% → 30%）
  4. 将 5% 真实流量通过 nginx upstream 权重切换（需修改 nginx.conf）
  5. 继续观察 30 分钟

阶段三：全量上线（100%）
  6. 更新 server 镜像为新版本
  7. 停止 server-canary
  8. 执行数据库迁移（若有）
```

### 分阶段 nginx 权重示例（阶段二参考）
```nginx
upstream app_stable {
    server server:3000 weight=7;         # 70% 流量
    server server-canary:3001 weight=3;  # 30% 灰度
}
```
> 注意：调整权重后需 `nginx -s reload`（无损重载）

---

## 三、标准上线步骤

### Step 1：部署新镜像
```bash
# 构建
docker build -t trpg-server:v2.0 -f Dockerfile --target server .

# 更新 server 服务（滚动重启，约 5-10 秒）
docker compose up -d --no-deps --build server
```

### Step 2：执行数据库迁移
```bash
# 进入 server 容器
docker exec -it trpg_new-server-1 sh

# 执行迁移
pnpm tsx src/db/migrate.ts
# 或：
pnpm migrate
```

### Step 3：验证服务健康
```bash
# 等待服务启动（约 15-30 秒）
for i in 1 2 3 4 5; do
  curl -s http://localhost/api/health | jq .status
  sleep 5
done
# 期望全部输出 "ok"
```

### Step 4：运行冒烟验证
```bash
# 在 CI 或本地（需真实 DB）
curl http://localhost/api/recruitment?limit=1
# 期望：200 + { items: [...], total: N }
```

---

## 四、回滚决策树

```
发现异常
    │
    ├─ 是数据库迁移问题？──▶ 是 ──▶ 执行"数据库回滚"（见 4.1）
    │
    ├─ 是应用代码问题（5xx 激增）？──▶ 是 ──▶ 执行"镜像回滚"（见 4.2）
    │
    └─ 是配置/环境变量问题？──▶ 是 ──▶ 修正环境变量后 docker compose restart server
```

### 4.1 数据库回滚

> **⚠️ 警告：回滚迁移可能导致数据丢失，必须先评估影响。**

```bash
# Step A：确认当前 batch
docker exec -it trpg_new-server-1 pnpm tsx -e \
  "import {db} from './src/db'; db.migrate.currentVersion().then(v => {console.log(v); process.exit(0);})"

# Step B：执行回滚（回滚一个 batch）
docker exec -it trpg_new-server-1 pnpm tsx src/db/migrate-rollback.ts

# Step C：验证回滚后版本
docker exec -it trpg_new-server-1 pnpm tsx -e \
  "import {db} from './src/db'; db.migrate.currentVersion().then(v => {console.log(v); process.exit(0);})"
```

### 4.2 镜像回滚

```bash
# 方法一：使用上一个稳定 tag
docker compose up -d --no-deps server --image trpg-server:v1.x

# 方法二：使用 docker rollback（若使用 Swarm）
docker service rollback trpg_server

# 方法三：重新 pull 上一个 latest（若有 CI 保留）
docker pull trpg-server:stable
docker compose up -d --no-deps server
```

---

## 五、回滚后验证

```bash
# 1. 服务健康检查
curl http://localhost/api/health | jq

# 2. 核心路由冒烟
curl http://localhost/api/recruitment?limit=1          # GET 列表
curl -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"test","password":"test"}' | jq .status # 登录路由可达

# 3. 检查日志（最近 50 行错误）
docker logs --tail=50 trpg_new-server-1 2>&1 | grep -i error

# 4. 告知团队（Slack / 飞书）
# 格式："[ROLLBACK] v2.0 已回滚至 v1.x，原因：{简述}，影响时间：{时长}"
```

---

## 六、事故等级与响应时间

| 等级 | 触发条件                          | 响应时间 | 处理人      |
|-----|----------------------------------|---------|------------|
| P0  | 服务完全不可用（503 > 1min）       | < 5 min | 值班 + Lead |
| P1  | 核心路由 5xx > 5%（持续 5min）    | < 15 min| 后端值班    |
| P2  | 非核心功能异常 / 性能下降          | < 1h    | 后端团队    |
| P3  | 数据展示轻微错误 / 日志告警        | < 4h    | 下个工作日  |

---

## 七、联系与升级路径

```
一线值班工程师
    │ 无法处理
    ▼
后端 Tech Lead
    │ 需要基础设施支持
    ▼
运维/DevOps
    │ 数据安全事件
    ▼
安全团队 + 管理层
```

---

_SOP 版本：v1.0 | 维护人：后端团队 | 下次评审：2026-07-01_
</content>
</invoke>