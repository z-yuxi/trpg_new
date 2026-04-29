# Windows本地开发环境搭建&项目启动完整手册

适用系统：Windows 10/11
适用场景：本地开发、联调、验收（不使用 Docker / Linux）
项目结构：pnpm monorepo（packages/client + packages/server + packages/shared）

---

## 1. 环境准备

### 1.1 Node.js 20 LTS

下载并安装 Node.js 20（LTS）后，打开 PowerShell 验证：

```powershell
node -v
npm -v
```

预期：Node 版本为 v20.x.x。

### 1.2 pnpm

```powershell
npm install -g pnpm
pnpm -v
```

### 1.3 MySQL 8

安装后确认服务已启动（服务名通常是 MySQL80）。

### 1.4 Redis（Windows 兼容版）

安装后验证：

```powershell
redis-cli ping
```

预期：PONG

### 1.5 Git

```powershell
git -v
```

---

## 2. 获取代码

```powershell
cd E:\Desktop
git clone <你的仓库地址> trpg_new
cd trpg_new
```

如果代码已在 E:\Desktop\trpg_new，可直接进入目录。

---

## 3. 初始化数据库

登录 MySQL 后执行：

```sql
CREATE DATABASE trpg_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'trpg'@'localhost' IDENTIFIED BY 'Trpg@2024!';
GRANT ALL PRIVILEGES ON trpg_platform.* TO 'trpg'@'localhost';
FLUSH PRIVILEGES;
```

---

## 4. 配置 .env（项目根目录）

在 E:\Desktop\trpg_new\.env 填写：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=trpg
DB_PASSWORD=Trpg@2024!
DB_NAME=trpg_platform

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

JWT_SECRET=replace-with-your-own-long-secret
PORT=3000
```

说明：服务端已支持自动读取 monorepo 根目录 .env。

---

## 5. 安装依赖并构建共享模块

```powershell
cd E:\Desktop\trpg_new
pnpm install
pnpm --filter @trpg/shared build
```

如果出现 @trpg/shared 找不到：

```powershell
pnpm install --force
pnpm --filter @trpg/shared build
```

---

## 6. 执行数据库迁移（最新修复版）
步骤 1：重启正常的 MySQL 服务
在管理员 PowerShell 里执行：
powershell
net start MySQL80
✅ 成功提示：MySQL80 服务已成功启动。
步骤 2：用 trpg 用户连接 MySQL（代替 root）
打开普通 PowerShell（不用管理员），执行：
powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u trpg -h 127.0.0.1 -P 3306 -pTrpg@2024! trpg_platform
✅ 成功：直接进入 MySQL 命令行（提示符变成 mysql>）；



```powershell
pnpm --filter @trpg/server migrate
```

当前迁移已改为 tsx 程序化执行，避免旧问题：
- Failed to load ts-node/register
- __dirname is not defined in ES module scope

### 6.1 若你之前迁移失败过，先清库再迁移

```sql
DROP DATABASE trpg_platform;
CREATE DATABASE trpg_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

然后重跑：

```powershell
pnpm --filter @trpg/server migrate
```

---

## 7. 启动后端

终端 A：

```powershell
cd /d E:\Desktop\trpg_new
pnpm --filter @trpg/server dev
```

预期日志：Server running on port 3000

---

## 8. 启动前端

终端 B：

```powershell
cd E:\Desktop\trpg_new
pnpm --filter @trpg/client dev
```

访问：http://localhost:5173

---

## 9. 功能验收最小清单

1. 首页可访问（http://localhost:5173）。
2. 注册/登录可用。
3. 我的战役可加载并可创建战役。
4. 社区招募列表可加载。
5. 角色编辑页可保存角色卡。

---

## 10. Git 版本管理规范

### 10.1 基本流程

1. 本地修改
2. 本地启动并测试
3. 提交本地仓库
4. 推送到 GitHub

### 10.2 常用命令

```powershell
git status
git diff
git add -A
git commit -m "feat: 本次改动说明"
git push
```

### 10.3 回退方案

未提交时撤销某文件：

```powershell
git checkout -- <文件路径>
```

撤销最后一次提交但保留改动：

```powershell
git reset --soft HEAD~1
```

强制回退（会丢失改动，谨慎）：

```powershell
git reset --hard <commit_id>
```

---

## 11. 常见问题排查

1. pnpm: command not found
操作：重装 pnpm，并重开终端。

2. Cannot find module '@trpg/shared'
操作：先执行 pnpm --filter @trpg/shared build。

3. ECONNREFUSED 127.0.0.1:3306
操作：启动 MySQL 服务。

4. Redis connection error
操作：启动 Redis 服务。

5. Missing required environment variable: JWT_SECRET/DB_HOST/REDIS_HOST
操作：检查根目录 .env 是否存在并包含对应键。

6. 端口 3000/5173 被占用
操作：结束占用进程后重启服务。

---

## 12. 每次开发的快速启动顺序

```powershell
cd E:\Desktop\trpg_new
pnpm --filter @trpg/shared build
pnpm --filter @trpg/server dev
# 新开一个终端
cd E:\Desktop\trpg_new
pnpm --filter @trpg/client dev
```

完成。
