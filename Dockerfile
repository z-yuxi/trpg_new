# ============================================================
# 多阶段构建 Dockerfile
# 阶段 1: builder  — 安装依赖 + 构建所有包
# 阶段 2: server   — 精简的 Node.js 运行时（仅 server）
# 阶段 3: client   — Nginx 静态文件服务（仅 client dist）
# ============================================================

# ── 阶段 1: 全量构建镜像 ─────────────────────────────────────
FROM node:22-alpine AS builder

# 安装 pnpm
RUN npm install -g pnpm@10

WORKDIR /app

# 复制 monorepo 配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json   ./packages/shared/
COPY packages/server/package.json   ./packages/server/
COPY packages/client/package.json   ./packages/client/

# 安装所有依赖（利用层级缓存）
RUN pnpm install --frozen-lockfile

# 复制源码
COPY packages/ ./packages/

# 构建 shared（其他包依赖它）
RUN pnpm --filter @trpg/shared build

# 构建 server（TypeScript 编译）
RUN pnpm --filter @trpg/server build

# 构建 client（Vite 静态资源）
RUN pnpm --filter @trpg/client build

# ── 阶段 2: Server 运行时镜像 ────────────────────────────────
FROM node:22-alpine AS server

RUN npm install -g pnpm@10

WORKDIR /app

# 复制 monorepo 元信息（pnpm 需要）
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json   ./packages/shared/
COPY packages/server/package.json   ./packages/server/

# 仅生产依赖
RUN pnpm install --frozen-lockfile --prod

# 复制构建产物
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/assets ./packages/server/assets

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "packages/server/dist/server.js"]

# ── 阶段 3: Client Nginx 静态服务镜像 ────────────────────────
FROM nginx:1.27-alpine AS client

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 复制 Vite 构建产物
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
