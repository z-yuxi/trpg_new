# Windows本地开发5分钟启动卡片

适用：Windows 10/11，本地开发（不使用 Docker）

---

## A. 首次装机（只做一次）

### 1) 安装环境

1. Node.js 20 LTS
2. pnpm（建议 >= 9）
3. MySQL 8
4. Redis
5. Git

验证命令：

```powershell
node -v
pnpm -v
git -v
redis-cli ping
```

### 2) 初始化项目

```powershell
cd E:\Desktop
git clone <你的仓库地址> trpg_new
cd E:\Desktop\trpg_new
pnpm install
pnpm --filter @trpg/shared build
```

### 3) 初始化数据库

在 MySQL 执行：

```sql
CREATE DATABASE trpg_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'trpg'@'localhost' IDENTIFIED BY 'Trpg@2024!';
GRANT ALL PRIVILEGES ON trpg_platform.* TO 'trpg'@'localhost';
FLUSH PRIVILEGES;
```

### 4) 配置根目录 .env

在 E:\Desktop\trpg_new\.env 写入：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=trpg
DB_PASSWORD=Trpg@2024!
DB_NAME=trpg_platform
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
JWT_SECRET=replace-with-your-own-long-secret
JWT_REFRESH_SECRET=replace-with-your-own-long-refresh-secret
PORT=3000
```

### 5) 执行迁移

```powershell
cd E:\Desktop\trpg_new
pnpm --filter @trpg/server migrate
pnpm verify:migrations
```

---

## B. 每天启动（常用）

### 终端 A（后端）

```powershell
cd E:\Desktop\trpg_new
pnpm --filter @trpg/shared build
pnpm dev:server
```

### 终端 B（前端）

```powershell
cd E:\Desktop\trpg_new
pnpm dev:client
```

访问：

1. 前端：http://localhost:5173
2. 后端：http://localhost:3000

---

## C. 30秒自检

1. 后端日志出现 Server running on port 3000
2. 首页可打开（http://localhost:5173）
3. 能完成登录并进入探索页

---

## D. 常见故障快修

1. Cannot find module '@trpg/shared'  
先执行：

```powershell
pnpm --filter @trpg/shared build
```

2. Missing required environment variable  
检查根目录 .env 是否包含 JWT_SECRET/DB_HOST/REDIS_HOST。

3. 3306 连接失败  
确认 MySQL 服务已启动。

4. Redis connection error  
确认 Redis 服务已启动。

5. Windows 执行 start.sh 失败  
不要用 start.sh，按本卡片“每天启动”两终端方式执行。

---

## E. 注意事项

1. 本项目是 pnpm workspace，主项目依赖只用 pnpm。
2. 不在文档、截图、群聊中暴露密码、JWT、API Key。
3. 敏感信息只放本机 .env 或本机私有文件（如 .local-secrets.md）。
