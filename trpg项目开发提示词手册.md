# TRPG 通用平台 —— AI 开发提示词手册

> 版本 1.0 | 生成日期 2026-04-13
> 本手册配合 12 份设计文档使用，为 AI 辅助开发提供逐步提示词。

---

## 第一部分：使用指南

### 1.1 本手册是什么

本手册是 TRPG 通用平台项目的 **AI 辅助开发操作手册**。它将整个项目拆分为 **42 个步骤、9 个阶段（Phase 0–8）**，每个步骤包含一段可直接复制粘贴给 AI 的提示词（Prompt）。按顺序执行这些提示词，即可从零搭建完整项目。

**技术栈概览：**
- 后端：TypeScript 5.x strict · Node.js 20+ · Express 4 · Socket.IO 4 · knex (MySQL 8.0) · ioredis (Redis 7)
- 前端：Vue 3 Composition API `<script setup>` · Vite · Vue Router · Pinia · Element Plus
- 测试：vitest
- 工程：pnpm monorepo（packages/shared + packages/server + packages/client）

### 1.2 使用流程

1. **按顺序执行**：从 Step 01 开始，逐步向 AI 发送提示词
2. **喂入依赖文件**：每个步骤会标注依赖文件，先让 AI 读取这些文件
3. **验证后再继续**：每步完成后按指定验证级别检查通过再进入下一步
4. **Git 提交**：每个阶段（Phase）完成后执行 `git commit`
5. **不要让 AI 修改未读取的文件**：AI 只能修改它在当前会话中已读取的文件

### 1.3 五条铁律

| # | 规则 | 说明 |
|---|------|------|
| 1 | **严格按序执行** | 步骤间存在依赖关系，跳步会导致编译失败 |
| 2 | **喂入依赖文件** | 每步开头列出的依赖文件必须让 AI 先读取，否则它会凭空捏造接口 |
| 3 | **验证后再下一步** | 按 T/C/R/I 级别验证，不通过就修，不要带病前进 |
| 4 | **每阶段 Git 提交** | Phase 结束时 `git add -A && git commit -m "Phase N: 描述"`，方便回滚 |
| 5 | **AI 不得修改未读文件** | 如果 AI 要改某个文件，必须先让它读取该文件全文 |

### 1.4 验证级别

| 级别 | 缩写 | 含义 | 操作 |
|------|------|------|------|
| **T** | Test | 单元测试通过 | `pnpm --filter <pkg> test` |
| **C** | Compile | TypeScript 编译通过 | `pnpm --filter <pkg> build` 或 `tsc --noEmit` |
| **R** | Review | 人工审阅 | 目视检查代码逻辑、UI 效果 |
| **I** | Integration | 集成测试 | 启动服务后端到端验证 |

### 1.5 常见错误处理

| 错误类型 | 处理方式 |
|----------|----------|
| **编译错误** | 将完整错误信息粘贴给 AI，要求它只修复报错文件，不要动其他文件 |
| **测试失败** | 粘贴失败的测试输出，让 AI 修复实现代码（非测试代码），除非测试本身有误 |
| **接口不匹配** | 让 AI 同时读取接口定义文件和使用文件，指明哪个是权威来源 |
| **AI 添加额外功能** | 明确告诉 AI："只做提示词中要求的内容，删除所有未要求的功能" |

---

## 第二部分：步骤总览表

### Phase 0：Monorepo 基础骨架

| 步骤 | 标题 | 依赖步骤 | 产出文件 | 验证 |
|------|------|----------|----------|------|
| 01 | Monorepo 脚手架 | — | `pnpm-workspace.yaml`, `package.json`×4, `tsconfig.json`×4, 目录结构 | C |
| 02 | 共享类型 + 数据库 DDL | 01 | `packages/shared/src/types/*.ts`, `packages/server/src/db/migrations/*.ts` | C |
| 03 | HTTP 路由骨架 + Socket.IO 骨架 | 01, 02 | `packages/server/src/routes/*.ts`, `packages/server/src/socket/*.ts`, `packages/server/src/app.ts` | C |

### Phase 1：规则引擎核心

| 步骤 | 标题 | 依赖步骤 | 产出文件 | 验证 |
|------|------|----------|----------|------|
| 04 | Dice DSL 解析器 + 求值器 | 02 | `packages/server/src/engine/dice-lexer.ts`, `dice-parser.ts`, `dice-evaluator.ts`, `__tests__/dice.test.ts` | T |
| 05 | 公式求值器 | 02 | `packages/server/src/engine/formula-evaluator.ts`, `__tests__/formula.test.ts` | T |
| 06 | P0 原子节点 (上) | 02, 04, 05 | `packages/server/src/engine/atoms/dice-roll.ts`, `threshold-compare.ts`, `multiply.ts`, `if-else.ts`, `result-collector.ts` | T |
| 07 | P0 原子节点 (下) | 02, 06 | `packages/server/src/engine/atoms/character-skill-reader.ts`, `resource-modify.ts`, `formula-eval.ts` | T |
| 08 | 组件注册表 + 执行器 | 06, 07 | `packages/server/src/engine/registry.ts`, `executor.ts`, `__tests__/executor.test.ts` | T |
| 09 | Ruleset 校验器 + 继承合并 | 08 | `packages/server/src/engine/ruleset-validator.ts`, `ruleset-merger.ts`, `__tests__/ruleset.test.ts` | T |
| 10 | 命令系统 | 08, 09 | `packages/server/src/engine/command-parser.ts`, `command-defaults.ts`, `__tests__/command.test.ts` | T |

### Phase 2：服务层

| 步骤 | 标题 | 依赖步骤 | 产出文件 | 验证 |
|------|------|----------|----------|------|
| 11 | Knex 连接池 + 全部迁移文件 | 02 | `packages/server/src/db/knex-config.ts`, `migrations/*.ts` (完整) | C |
| 12 | User + Auth 服务 | 02, 03, 11 | `packages/server/src/services/user-service.ts`, `auth-service.ts`, `middleware/auth.ts` | T |
| 13 | Campaign + Scene + ScheduledMove 服务 | 02, 03, 11, 12 | `packages/server/src/services/campaign-service.ts`, `scene-service.ts`, `scheduled-move-service.ts` | T |
| 14 | CharacterSheet + CharacterInstance 服务 | 02, 03, 11 | `packages/server/src/services/character-sheet-service.ts`, `character-instance-service.ts` | T |
| 15 | RecruitmentPost + Ruleset + Module 服务 | 02, 03, 11 | `packages/server/src/services/recruitment-service.ts`, `ruleset-service.ts`, `module-service.ts` | T |

### Phase 3：实时通信

| 步骤 | 标题 | 依赖步骤 | 产出文件 | 验证 |
|------|------|----------|----------|------|
| 16 | Redis 连接 + Socket.IO 服务端设置 | 03, 11 | `packages/server/src/socket/io-server.ts`, `packages/server/src/db/redis.ts` | C |
| 17 | 聊天消息处理器 + Snowflake + 可见性 | 02, 16 | `packages/server/src/socket/chat-handler.ts`, `packages/shared/src/utils/snowflake.ts`, `packages/server/src/services/visibility.ts` | T |
| 18 | 断线重连 + 环形缓冲区 + missed_messages | 16, 17 | `packages/server/src/socket/reconnection-handler.ts`, `packages/server/src/utils/ring-buffer.ts` | T |
| 19 | 客户端 Socket 封装 + 消息状态机 | 02, 17 | `packages/client/src/socket/socket-client.ts`, `packages/client/src/stores/message-store.ts` | T |

### Phase 4：UI 基础

| 步骤 | 标题 | 依赖步骤 | 产出文件 | 验证 |
|------|------|----------|----------|------|
| 20 | CSS 设计令牌 + 基础 UI 组件 | 01 | `packages/client/src/styles/tokens.css`, `components/base/*.vue` | R |
| 21 | 昼夜主题切换 + Element Plus 主题覆盖 | 20 | `packages/client/src/styles/theme-day.css`, `theme-night.css`, `composables/useTheme.ts` | R |
| 22 | SVG 图标精灵系统 | 01 | `packages/client/src/components/SvgIcon.vue`, `assets/icons.svg` | R |
| 23 | App Shell + Vue Router + 底部导航 + Pinia 骨架 | 20, 21, 22 | `packages/client/src/App.vue`, `router/index.ts`, `stores/*.ts`, `layouts/*.vue` | C |

### Phase 5：页面模块

| 步骤 | 标题 | 依赖步骤 | 产出文件 | 验证 |
|------|------|----------|----------|------|
| 24 | 首页 | 23 | `packages/client/src/views/Home.vue` | R |
| 25 | 素材库页面 | 23 | `packages/client/src/views/AssetLibrary.vue`, `views/asset/*.vue` | R |
| 26 | 我的团页面 | 23 | `packages/client/src/views/MyCampaigns.vue` | R |
| 27 | 社区 - 招募板 | 23 | `packages/client/src/views/Community.vue`, `views/community/*.vue` | R |
| 28 | 个人中心 | 23 | `packages/client/src/views/Personal.vue` | R |
| 29 | 创作者后台 | 23 | `packages/client/src/views/CreatorDashboard.vue` | R |

### Phase 6：团房间

| 步骤 | 标题 | 依赖步骤 | 产出文件 | 验证 |
|------|------|----------|----------|------|
| 30 | 房间布局壳 | 23, 19 | `packages/client/src/views/Room.vue`, `layouts/RoomLayout.vue` | R |
| 31 | 左侧边栏 | 30 | `packages/client/src/components/room/LeftSidebar.vue` | R |
| 32 | 聊天区域 | 30, 19 | `packages/client/src/components/room/ChatArea.vue`, `room/MessageItem.vue`, `room/ChatInput.vue` | R |
| 33 | 助手台 | 30 | `packages/client/src/components/room/AssistantDesk.vue` | R |
| 34 | GM 控制台 | 30, 13 | `packages/client/src/components/room/GMConsole.vue` | R |

### Phase 7：高级功能

| 步骤 | 标题 | 依赖步骤 | 产出文件 | 验证 |
|------|------|----------|----------|------|
| 35 | 线索系统 + CSS 文字艺术主题 | 32 | `packages/client/src/components/ClueCard.vue`, `styles/text-art.css` | R |
| 36 | 角色卡编辑器 + CSON 导入导出 | 14, 23 | `packages/client/src/views/CharacterEditor.vue`, `packages/shared/src/utils/cson.ts` | T |
| 37 | 轨迹矩阵 | 13, 30 | `packages/client/src/components/room/TrajectoryMatrix.vue` | R |
| 38 | 网格地图 V1.0 | 30 | `packages/client/src/components/room/GridMap.vue` | R |
| 39 | 日志导出系统 | 17, 02 | `packages/server/src/services/log-export-service.ts`, `packages/shared/src/utils/ilf.ts` | T |

### Phase 8：打磨与部署

| 步骤 | 标题 | 依赖步骤 | 产出文件 | 验证 |
|------|------|----------|----------|------|
| 40 | PWA + Service Worker + 移动端适配 | 23 | `packages/client/public/manifest.json`, `sw.ts`, `styles/mobile.css` | R |
| 41 | 端到端测试 | 全部 | `packages/server/src/__tests__/e2e/*.test.ts` | I |
| 42 | Docker 部署配置 | 全部 | `Dockerfile`, `docker-compose.yml`, `.env.example`, `nginx.conf` | I |

---

## 第三部分：详细提示词

### Phase 0：Monorepo 基础骨架

---

#### Step 01 — Monorepo 脚手架

- **依赖步骤**：无
- **产出文件**：`pnpm-workspace.yaml`、根 `package.json`、`packages/shared/package.json`、`packages/server/package.json`、`packages/client/package.json`、`tsconfig.json`×4、目录结构
- **验证**：C — `pnpm install && pnpm -r build`

````
你是高级 TypeScript 全栈工程师。请创建一个 pnpm monorepo 项目骨架。

## 目录结构

```
trpg-platform/
├── pnpm-workspace.yaml
├── package.json                   # 根
├── tsconfig.base.json             # 基础 tsconfig
├── .gitignore
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types/
│   │       │   └── index.ts       # 空导出占位
│   │       └── utils/
│   │           └── index.ts       # 空导出占位
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── app.ts             # Express app 占位（export default app）
│   │       ├── server.ts          # listen 入口
│   │       ├── routes/
│   │       ├── services/
│   │       ├── socket/
│   │       ├── engine/
│   │       │   ├── atoms/
│   │       │   └── __tests__/
│   │       ├── db/
│   │       │   └── migrations/
│   │       ├── middleware/
│   │       └── utils/
│   └── client/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.ts
│           ├── App.vue            # 最小占位
│           ├── views/
│           ├── components/
│           │   └── base/
│           ├── stores/
│           ├── router/
│           ├── styles/
│           ├── composables/
│           ├── socket/
│           └── assets/
```

## pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
```

## 根 package.json

```json
{
  "name": "trpg-platform",
  "private": true,
  "scripts": {
    "dev:server": "pnpm --filter @trpg/server dev",
    "dev:client": "pnpm --filter @trpg/client dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

## tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

## packages/shared/package.json

```json
{
  "name": "@trpg/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

## packages/shared/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

## packages/server/package.json

```json
{
  "name": "@trpg/server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/server.ts",
    "test": "vitest run",
    "migrate": "knex migrate:latest --knexfile src/db/knex-config.ts"
  },
  "dependencies": {
    "@trpg/shared": "workspace:*",
    "express": "^4.18.0",
    "socket.io": "^4.7.0",
    "knex": "^3.1.0",
    "mysql2": "^3.9.0",
    "ioredis": "^5.3.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "zod": "^3.22.0",
    "mathjs": "^12.0.0",
    "yaml": "^2.3.0",
    "uuid": "^9.0.0",
    "@randsum/roller": "^2.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/bcryptjs": "^2.4.0",
    "@types/uuid": "^9.0.0",
    "tsx": "^4.7.0",
    "vitest": "^1.4.0"
  }
}
```

## packages/server/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

## packages/client/package.json

```json
{
  "name": "@trpg/client",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@trpg/shared": "workspace:*",
    "vue": "^3.4.0",
    "vue-router": "^4.3.0",
    "pinia": "^2.1.0",
    "element-plus": "^2.6.0",
    "socket.io-client": "^4.7.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.2.0",
    "vue-tsc": "^2.0.0",
    "vitest": "^1.4.0",
    "typescript": "^5.4.0"
  }
}
```

## packages/client/vite.config.ts

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
})
```

## packages/server/src/app.ts

```typescript
import express from 'express'
const app = express()
app.use(express.json())
export default app
```

## packages/server/src/server.ts

```typescript
import app from './app'
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
```

## packages/client/src/main.ts

```typescript
import { createApp } from 'vue'
import App from './App.vue'
const app = createApp(App)
app.mount('#app')
```

## packages/client/src/App.vue

```vue
<script setup lang="ts">
</script>
<template>
  <div id="app">TRPG Platform</div>
</template>
```

## packages/client/index.html

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>TRPG Platform</title></head>
<body><div id="app"></div><script type="module" src="/src/main.ts"></script></body>
</html>
```

## .gitignore

```
node_modules/
dist/
.env
*.local
.DS_Store
```

请创建以上所有文件。每个目录下的占位文件确保目录被 git 追踪。空目录放一个空的 index.ts（export {}）。

严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 02 — 共享类型 + 数据库 DDL

- **依赖步骤**：Step 01
- **产出文件**：`packages/shared/src/types/index.ts`、`packages/shared/src/types/events.ts`、`packages/shared/src/utils/id.ts`、`packages/server/src/db/migrations/001_init.ts`
- **验证**：C — `pnpm --filter @trpg/shared build`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 01 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts

## 任务：创建共享类型定义 + 数据库迁移文件

### 文件 1：packages/shared/src/types/index.ts

导出以下所有类型和接口：

```typescript
// ===== 基础类型 =====
export interface StoryTime {
  day: number;
  hour: number;
  minute: number;
}

export type SnowflakeId = string;

// ===== 用户 =====
export interface User {
  id: string;                    // UUID v4
  uid: number;                   // 7位数字，从1000000起
  phone: string;
  password_hash: string;
  nickname: string;
  avatar_url: string;
  user_type: string[];           // ['player','gm','creator','admin']
  creator_level: number;         // 1-5
  coins: number;
  subscription_type: 'free' | 'pro' | 'creator';
  created_at: Date;
}

// ===== 团 =====
export type CampaignStatus = 'preparing' | 'running' | 'paused' | 'ended';

export interface Campaign {
  id: string;
  room_code: string;             // 6字符 [ABCDEFGHJKLMNPQRSTUVWXY23456789]
  name: string;
  ruleset_id: string;
  module_id: string | null;
  gm_user_id: string;
  assistant_gm_ids: string[];
  global_story_time: StoryTime;
  status: CampaignStatus;
  allow_ob: boolean;
  is_listed_publicly: boolean;
  enable_trajectory_matrix: boolean;
  enable_grid_map: boolean;
  enable_scene_connections: boolean;
  created_at: Date;
}

// ===== 场 =====
export type SceneType = 'spatial' | 'virtual' | 'lobby';
export type HistoryVisibility = 'none' | 'recent' | 'all';

export interface Scene {
  id: string;
  campaign_id: string;
  name: string;
  type: SceneType;
  history_visibility: HistoryVisibility;
  visible_history_count: number;
  created_at: Date;
}

// ===== 角色卡 =====
export interface CharacterSheet {
  id: string;
  character_code: string;        // 8位十六进制
  user_id: string;
  ruleset_id: string;
  name: string;
  occupation_id: string | null;
  avatar_url: string;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  derived_max: Record<string, { current: number; max: number; temp?: number }>;
  equipment: string[];
  background: string;
  avatar_custom_data: object | null;
  initial_snapshot: object | null;
  created_at: Date;
  updated_at: Date;
}

// ===== 角色场景状态 =====
export interface CharacterSceneState {
  id: string;
  character_id: string;
  campaign_id: string;
  current_spatial_scene_id: string | null;
  personal_story_time: StoryTime;
}

// ===== 角色实例（运行时） =====
export interface CharacterInstance {
  id: string;
  character_id: string;
  campaign_id: string;
  user_id: string;
  current_resources: Record<string, { current: number; max: number }>;
  temporary_effects: { effect_id: string; remaining_rounds?: number; source: string }[];
  current_spatial_scene_id?: string;
  personal_story_time: StoryTime;
  scheduled_move_id?: string;
  status: 'active' | 'left' | 'dead';
}

// ===== 角色卡模板 =====
export interface CharacterCard {
  card_id: string;
  template_ref: string;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, { current: number; max: number; temp?: number }>;
  statuses: { status_id: string; remaining_rounds?: number }[];
  avatar_custom_data?: object;
  initial_snapshot?: object;
  equipment: string[];
  background?: string;
}

// ===== 场参与 =====
export interface SceneParticipation {
  id: string;
  scene_id: string;
  character_id: string;
  joined_at: Date;
  left_at: Date | null;
}

// ===== 预约移动 =====
export type MoveStatus = 'pending' | 'approved' | 'executed' | 'cancelled';

export interface ScheduledMove {
  id: string;
  character_id: string;
  campaign_id: string;
  to_scene_id: string;
  execute_at_story: StoryTime;
  status: MoveStatus;
  created_at: Date;
}

// ===== 聊天消息 =====
export type MessageType = 'narrative' | 'dice' | 'ooc' | 'system' | 'announcement' | 'clue_card';

export interface ChatMessage {
  id: SnowflakeId;               // Snowflake BIGINT
  scene_id: string;
  campaign_id: string;
  sender_user_id: string;
  sender_character_id: string | null;
  content: string;
  message_type: MessageType;
  story_time: StoryTime | null;
  visible_to: string[] | null;   // null = 全体可见
  client_timestamp: number;
  created_at: Date;
  metadata: Record<string, unknown> | null;
}

// ===== 场连接 =====
export interface SceneConnection {
  id: string;
  campaign_id: string;
  from_scene_id: string;
  to_scene_id: string;
  walk_duration: number;
  bike_duration: number | null;
  drive_duration: number | null;
  is_bidirectional: boolean;
  created_by: string;
  created_at: Date;
}

// ===== 招募帖 =====
export type RecruitmentType = 'gm_recruit' | 'player_seek';
export type RecruitmentStatus = 'open' | 'closed' | 'full';

export interface RecruitmentPost {
  id: string;
  poster_id: string;
  type: RecruitmentType;
  title: string;
  campaign_id: string | null;
  ruleset_id: string;
  player_count_max: number;
  status: RecruitmentStatus;
  created_at: Date;
}

// ===== 规则集 =====
export type RulesetStatus = 'draft' | 'published';

export interface Ruleset {
  id: string;
  name: string;
  version: string;
  parent_ruleset_id: string | null;
  atoms: object;
  connections: object;
  commands: object;
  character_card_schema: object;
  status: RulesetStatus;
  created_at: Date;
}

// ===== 团 NPC =====
export interface CampaignNpc {
  id: string;
  campaign_id: string;
  source_module_npc_id: string | null;
  name: string;
  display_name: string;
  avatar_url: string;
  description: string;
  voice_tips: string;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, { current: number; max: number }>;
  is_temporary: boolean;
  is_playable: boolean;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

// ===== 回合状态 =====
export interface CampaignRoundState {
  campaign_id: string;
  turn_order: string[];          // character_id[]
  current_index: number;
  round_number: number;
  updated_at: Date;
}

// ===== 位置历史 =====
export type MoveType = 'scheduled' | 'force_move' | 'join' | 'leave';

export interface PositionHistory {
  id: string;
  campaign_id: string;
  character_id: string;
  scene_id: string;
  story_time_entered: StoryTime;
  story_time_left: StoryTime | null;
  move_type: MoveType;
  created_at: Date;
}

// ===== 规则引擎 =====
export interface ExecuteRequest {
  ruleset_id: string;
  command: string;
  params: Record<string, any>;
  context: {
    character_id: string;
    campaign_id: string;
    scene_id?: string;
  };
}

export interface NodeExecutionLog {
  node_id: string;
  node_type: string;
  inputs: Record<string, any>;
  output: any;
  duration_ms: number;
}

export interface ExecuteResponse {
  success: boolean;
  output: any;
  logs: NodeExecutionLog[];
}

// ===== 文字艺术主题 =====
export type ThemeType = 'river' | 'blur' | 'fragment' | 'wave' | 'ancient' | 'blood' | 'ash' | 'cyber';
```

### 文件 2：packages/shared/src/types/events.ts

Socket.IO 事件类型定义：

```typescript
import type { ChatMessage, StoryTime, CharacterInstance, SnowflakeId } from './index';

// ===== Server → Client 事件 =====
export interface ServerToClientEvents {
  new_message: (message: ChatMessage) => void;
  time_advanced: (data: {
    old_time: StoryTime;
    new_time: StoryTime;
    triggered_moves: { move_id: string; character_id: string; to_scene_id: string }[];
  }) => void;
  position_changed: (data: {
    character_id: string;
    from_scene_id: string;
    to_scene_id: string;
    move_type: 'scheduled' | 'force_move' | 'join' | 'leave';
  }) => void;
  character_state_sync: (snapshot: CharacterInstance) => void;
  move_approved: (data: { move_id: string; execute_at: StoryTime }) => void;
  move_rejected: (data: { move_id: string; reason?: string }) => void;
  rate_limited: (data: { retry_after: number; message: string }) => void;
  missed_messages: (data: {
    messages: ChatMessage[];
    your_state: CharacterInstance;
    global_time: StoryTime;
  }) => void;
}

// ===== Client → Server 事件 =====
export interface ClientToServerEvents {
  join_room: (data: {
    campaign_id: string;
    character_id: string;
    last_event_id?: SnowflakeId;
  }) => void;
  leave_room: () => void;
  chat_message: (data: {
    content: string;
    temp_id: string;
    message_type?: string;
    visible_to?: string[];
    metadata?: Record<string, unknown>;
  }) => void;
  request_move: (data: {
    target_scene_id: string;
    travel_method?: 'walk' | 'bike' | 'drive';
  }) => void;
  gm_approve_move: (data: {
    move_id: string;
    execute_at?: StoryTime;
  }) => void;
  gm_reject_move: (data: {
    move_id: string;
    reason?: string;
  }) => void;
  gm_advance_time: (data: {
    delta?: { days?: number; hours?: number; minutes?: number };
    custom_time?: StoryTime;
  }) => void;
}
```

在 `packages/shared/src/types/index.ts` 末尾加上：
```typescript
export * from './events';
```

### 文件 3：packages/shared/src/utils/id.ts

```typescript
import { v4 as uuidv4 } from 'uuid';

/** 生成 UUID v4 */
export function generateId(): string {
  return uuidv4();
}

/** 房间代码字符集（排除易混淆字符 0OI1） */
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXY23456789';

/** 生成 6 位房间代码 */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

/** 生成 8 位十六进制角色代码 */
export function generateCharacterCode(): string {
  return Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');
}

/** UID 起始值 */
export const UID_START = 1000000;
```

在 `packages/shared/src/utils/index.ts` 中导出：
```typescript
export * from './id';
```

### 文件 4：packages/server/src/db/migrations/001_init.ts

使用 knex 迁移格式，创建以下全部表：

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // users
  await knex.schema.createTable('users', (t) => {
    t.string('id', 64).primary();
    t.integer('uid').unsigned().unique().notNullable();
    t.string('phone', 20).unique();
    t.string('password_hash', 255).notNullable();
    t.string('nickname', 64).notNullable();
    t.string('avatar_url', 255).defaultTo('');
    t.json('user_type').defaultTo('["player"]');
    t.tinyint('creator_level').defaultTo(1);
    t.bigint('coins').unsigned().defaultTo(0);
    t.enum('subscription_type', ['free', 'pro', 'creator']).defaultTo('free');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // campaigns
  await knex.schema.createTable('campaigns', (t) => {
    t.string('id', 64).primary();
    t.string('room_code', 8).unique().notNullable();
    t.string('name', 128).notNullable();
    t.string('ruleset_id', 64).notNullable();
    t.string('module_id', 64).nullable();
    t.string('gm_user_id', 64).notNullable();
    t.json('assistant_gm_ids').defaultTo('[]');
    t.json('global_story_time').defaultTo('{"day":1,"hour":8,"minute":0}');
    t.enum('status', ['preparing', 'running', 'paused', 'ended']).defaultTo('preparing');
    t.boolean('allow_ob').defaultTo(false);
    t.boolean('is_listed_publicly').defaultTo(false);
    t.boolean('enable_trajectory_matrix').defaultTo(false);
    t.boolean('enable_grid_map').defaultTo(false);
    t.boolean('enable_scene_connections').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // scenes
  await knex.schema.createTable('scenes', (t) => {
    t.string('id', 64).primary();
    t.string('campaign_id', 64).notNullable();
    t.string('name', 128).notNullable();
    t.enum('type', ['spatial', 'virtual', 'lobby']).notNullable();
    t.enum('history_visibility', ['none', 'recent', 'all']).defaultTo('none');
    t.integer('visible_history_count').defaultTo(50);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // character_sheets
  await knex.schema.createTable('character_sheets', (t) => {
    t.string('id', 64).primary();
    t.string('character_code', 8).unique().notNullable();
    t.string('user_id', 64).notNullable();
    t.string('ruleset_id', 64).notNullable();
    t.string('name', 64).notNullable();
    t.string('occupation_id', 64).nullable();
    t.string('avatar_url', 255).defaultTo('');
    t.json('attributes').defaultTo('{}');
    t.json('skills').defaultTo('{}');
    t.json('derived_max').defaultTo('{}');
    t.json('equipment').defaultTo('[]');
    t.text('background');
    t.json('avatar_custom_data').nullable();
    t.json('initial_snapshot').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // character_scene_states
  await knex.schema.createTable('character_scene_states', (t) => {
    t.string('id', 64).primary();
    t.string('character_id', 64).notNullable();
    t.string('campaign_id', 64).notNullable();
    t.string('current_spatial_scene_id', 64).nullable();
    t.json('personal_story_time').defaultTo('{"day":1,"hour":8,"minute":0}');
    t.unique(['character_id', 'campaign_id']);
  });

  // scene_participations
  await knex.schema.createTable('scene_participations', (t) => {
    t.string('id', 64).primary();
    t.string('scene_id', 64).notNullable();
    t.string('character_id', 64).notNullable();
    t.timestamp('joined_at').defaultTo(knex.fn.now());
    t.timestamp('left_at').nullable();
    t.unique(['scene_id', 'character_id', 'left_at']);
  });

  // scheduled_moves
  await knex.schema.createTable('scheduled_moves', (t) => {
    t.string('id', 64).primary();
    t.string('character_id', 64).notNullable();
    t.string('campaign_id', 64).notNullable();
    t.string('to_scene_id', 64).notNullable();
    t.json('execute_at_story').notNullable();
    t.enum('status', ['pending', 'approved', 'executed', 'cancelled']).defaultTo('pending');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // chat_messages
  await knex.schema.createTable('chat_messages', (t) => {
    t.bigInteger('id').unsigned().primary();  // snowflake
    t.string('scene_id', 64).notNullable();
    t.string('campaign_id', 64).notNullable();
    t.string('sender_user_id', 64).notNullable();
    t.string('sender_character_id', 64).nullable();
    t.text('content').notNullable();
    t.enum('message_type', ['narrative', 'dice', 'ooc', 'system', 'announcement', 'clue_card']).notNullable();
    t.json('story_time').nullable();
    t.json('visible_to').nullable();
    t.bigInteger('client_timestamp').unsigned();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.json('metadata').nullable();
    t.index(['scene_id', 'id']);
    t.index(['campaign_id', 'created_at']);
  });

  // scene_connections
  await knex.schema.createTable('scene_connections', (t) => {
    t.string('id', 64).primary();
    t.string('campaign_id', 64).notNullable();
    t.string('from_scene_id', 64).notNullable();
    t.string('to_scene_id', 64).notNullable();
    t.integer('walk_duration').notNullable();
    t.integer('bike_duration').nullable();
    t.integer('drive_duration').nullable();
    t.boolean('is_bidirectional').defaultTo(true);
    t.string('created_by', 64).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // recruitment_posts
  await knex.schema.createTable('recruitment_posts', (t) => {
    t.string('id', 64).primary();
    t.string('poster_id', 64).notNullable();
    t.enum('type', ['gm_recruit', 'player_seek']).notNullable();
    t.string('title', 128).notNullable();
    t.string('campaign_id', 64).nullable();
    t.string('ruleset_id', 64).notNullable();
    t.integer('player_count_max').notNullable();
    t.enum('status', ['open', 'closed', 'full']).defaultTo('open');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // rulesets
  await knex.schema.createTable('rulesets', (t) => {
    t.string('id', 64).primary();
    t.string('name', 128).notNullable();
    t.string('version', 32).notNullable();
    t.string('parent_ruleset_id', 64).nullable();
    t.json('atoms').defaultTo('{}');
    t.json('connections').defaultTo('[]');
    t.json('commands').defaultTo('{}');
    t.json('character_card_schema').defaultTo('{}');
    t.enum('status', ['draft', 'published']).defaultTo('draft');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // campaign_npcs
  await knex.schema.createTable('campaign_npcs', (t) => {
    t.string('id', 64).primary();
    t.string('campaign_id', 64).notNullable();
    t.string('source_module_npc_id', 64).nullable();
    t.string('name', 128).notNullable();
    t.string('display_name', 128).notNullable();
    t.string('avatar_url', 255).defaultTo('');
    t.text('description');
    t.text('voice_tips');
    t.json('attributes').defaultTo('{}');
    t.json('skills').defaultTo('{}');
    t.json('resources').defaultTo('{}');
    t.boolean('is_temporary').defaultTo(false);
    t.boolean('is_playable').defaultTo(true);
    t.boolean('is_active').defaultTo(true);
    t.string('created_by', 64).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // campaign_round_state
  await knex.schema.createTable('campaign_round_state', (t) => {
    t.string('campaign_id', 64).primary();
    t.json('turn_order').defaultTo('[]');
    t.integer('current_index').defaultTo(0);
    t.integer('round_number').defaultTo(1);
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // position_history
  await knex.schema.createTable('position_history', (t) => {
    t.string('id', 64).primary();
    t.string('campaign_id', 64).notNullable();
    t.string('character_id', 64).notNullable();
    t.string('scene_id', 64).notNullable();
    t.json('story_time_entered').notNullable();
    t.json('story_time_left').nullable();
    t.enum('move_type', ['scheduled', 'force_move', 'join', 'leave']).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['campaign_id', 'character_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'position_history', 'campaign_round_state', 'campaign_npcs',
    'rulesets', 'recruitment_posts', 'scene_connections',
    'chat_messages', 'scheduled_moves', 'scene_participations',
    'character_scene_states', 'character_sheets', 'scenes',
    'campaigns', 'users'
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
```

本步骤产出将被步骤 03–42 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 03 — HTTP 路由骨架 + Socket.IO 骨架

- **依赖步骤**：Step 01, Step 02
- **产出文件**：`packages/server/src/routes/index.ts`、各路由文件、`packages/server/src/socket/index.ts`、`packages/server/src/app.ts`（更新）
- **验证**：C — `pnpm --filter @trpg/server build`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 01、02 的产出。

请先读取以下文件：
- packages/server/src/app.ts
- packages/shared/src/types/index.ts
- packages/shared/src/types/events.ts

## 任务：创建全部 HTTP 路由占位 + Socket.IO 事件处理占位

所有路由处理函数返回 `res.status(501).json({ error: 'Not implemented' })`。
所有 Socket 事件处理函数打印日志后不做其他操作。

### 文件 1：packages/server/src/routes/auth.ts

```typescript
import { Router } from 'express';
const router = Router();

// POST /api/auth/register - 注册
router.post('/register', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// POST /api/auth/login - 登录
router.post('/login', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// POST /api/auth/refresh - 刷新 token
router.post('/refresh', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });

export default router;
```

### 文件 2：packages/server/src/routes/users.ts

```typescript
import { Router } from 'express';
const router = Router();

// GET /api/users/me - 获取当前用户
router.get('/me', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// PUT /api/users/me - 更新个人资料
router.put('/me', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });

export default router;
```

### 文件 3：packages/server/src/routes/campaigns.ts

```typescript
import { Router } from 'express';
const router = Router();

// POST /api/campaigns - 创建团
router.post('/', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/campaigns - 我的团列表
router.get('/', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/campaigns/:id - 团详情
router.get('/:id', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// PUT /api/campaigns/:id - 更新团
router.put('/:id', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// POST /api/campaigns/join - 通过房间代码加入
router.post('/join', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// POST /api/campaigns/:id/scenes - 创建场
router.post('/:id/scenes', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/campaigns/:id/scenes - 场列表
router.get('/:id/scenes', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// POST /api/campaigns/:id/scenes/connections - 创建场连接
router.post('/:id/scenes/connections', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/campaigns/:id/scenes/connections - 场连接列表
router.get('/:id/scenes/connections', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// POST /api/campaigns/:id/npcs - 创建 NPC
router.post('/:id/npcs', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/campaigns/:id/npcs - NPC 列表
router.get('/:id/npcs', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// PUT /api/campaigns/:id/npcs/:npcId - 更新 NPC
router.put('/:id/npcs/:npcId', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/campaigns/:id/messages - 消息历史
router.get('/:id/messages', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/campaigns/:id/round-state - 回合状态
router.get('/:id/round-state', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/campaigns/:id/position-history - 位置历史
router.get('/:id/position-history', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });

export default router;
```

### 文件 4：packages/server/src/routes/characters.ts

```typescript
import { Router } from 'express';
const router = Router();

// POST /api/characters - 创建角色卡
router.post('/', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/characters - 我的角色卡列表
router.get('/', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/characters/:id - 角色卡详情
router.get('/:id', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// PUT /api/characters/:id - 更新角色卡
router.put('/:id', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// DELETE /api/characters/:id - 删除角色卡
router.delete('/:id', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// POST /api/characters/:id/export - 导出 CSON
router.post('/:id/export', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// POST /api/characters/import - 导入 CSON
router.post('/import', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });

export default router;
```

### 文件 5：packages/server/src/routes/rulesets.ts

```typescript
import { Router } from 'express';
const router = Router();

// POST /api/rulesets - 创建规则集
router.post('/', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/rulesets - 规则集列表
router.get('/', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/rulesets/:id - 规则集详情
router.get('/:id', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// PUT /api/rulesets/:id - 更新规则集
router.put('/:id', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// POST /api/rulesets/:id/execute - 执行规则命令
router.post('/:id/execute', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });

export default router;
```

### 文件 6：packages/server/src/routes/recruitment.ts

```typescript
import { Router } from 'express';
const router = Router();

// POST /api/recruitment - 发布招募帖
router.post('/', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/recruitment - 招募帖列表
router.get('/', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/recruitment/:id - 招募帖详情
router.get('/:id', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// PUT /api/recruitment/:id - 更新招募帖
router.put('/:id', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });

export default router;
```

### 文件 7：packages/server/src/routes/logs.ts

```typescript
import { Router } from 'express';
const router = Router();

// POST /api/logs/export - 导出日志 (ILF 格式)
router.post('/export', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });

export default router;
```

### 文件 8：packages/server/src/routes/index.ts

```typescript
import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import campaignRoutes from './campaigns';
import characterRoutes from './characters';
import rulesetRoutes from './rulesets';
import recruitmentRoutes from './recruitment';
import logRoutes from './logs';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/characters', characterRoutes);
router.use('/rulesets', rulesetRoutes);
router.use('/recruitment', recruitmentRoutes);
router.use('/logs', logRoutes);

export default router;
```

### 文件 9：packages/server/src/socket/index.ts

```typescript
import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@trpg/shared';

export function setupSocketIO(httpServer: HttpServer): Server<ClientToServerEvents, ServerToClientEvents> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: '*' },
  });

  // /room 命名空间 - 团房间聊天
  const roomNsp = io.of('/room');
  roomNsp.on('connection', (socket) => {
    console.log(`[/room] connected: ${socket.id}`);

    socket.on('join_room', (data) => {
      console.log(`[/room] join_room:`, data);
      socket.join(`campaign:${data.campaign_id}`);
    });

    socket.on('leave_room', () => {
      console.log(`[/room] leave_room: ${socket.id}`);
    });

    socket.on('chat_message', (data) => {
      console.log(`[/room] chat_message:`, data);
    });

    socket.on('request_move', (data) => {
      console.log(`[/room] request_move:`, data);
    });

    socket.on('gm_approve_move', (data) => {
      console.log(`[/room] gm_approve_move:`, data);
    });

    socket.on('gm_reject_move', (data) => {
      console.log(`[/room] gm_reject_move:`, data);
    });

    socket.on('gm_advance_time', (data) => {
      console.log(`[/room] gm_advance_time:`, data);
    });

    socket.on('disconnect', () => {
      console.log(`[/room] disconnected: ${socket.id}`);
    });
  });

  // /user 命名空间 - 私信/通知
  const userNsp = io.of('/user');
  userNsp.on('connection', (socket) => {
    console.log(`[/user] connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`[/user] disconnected: ${socket.id}`);
    });
  });

  return io;
}
```

### 更新 packages/server/src/app.ts

```typescript
import express from 'express';
import { createServer } from 'http';
import routes from './routes/index';
import { setupSocketIO } from './socket/index';

const app = express();
app.use(express.json());
app.use('/api', routes);

export const httpServer = createServer(app);
export const io = setupSocketIO(httpServer);

export default app;
```

### 更新 packages/server/src/server.ts

```typescript
import { httpServer } from './app';
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

本步骤产出将被步骤 04–42 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

### Phase 1：规则引擎核心

---

#### Step 04 — Dice DSL 解析器 + 求值器

- **依赖步骤**：Step 02
- **产出文件**：`packages/server/src/engine/dice-lexer.ts`、`dice-parser.ts`、`dice-evaluator.ts`、`packages/server/src/engine/__tests__/dice.test.ts`
- **验证**：T — `pnpm --filter @trpg/server test -- dice`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 02 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts

## 任务：实现 Dice DSL 解析器和求值器

实现一个完整的骰子 DSL，支持以下语法：
- 基础骰子：`3d6`、`1d20`、`1d100`
- 算术运算：`2d6+3`、`1d20-2`、`3d6*2`
- 括号：`(2d6+3)*2`
- 保留骰子：`4d6kh3`（保留最高3个）、`4d6kl1`（保留最低1个）
- 重投：`1d20r1`（重投1）
- 爆炸骰：`1d6!`（骰出最大值再投）
- 多段表达式：`2d6+1d4+5`

### 文件 1：packages/server/src/engine/dice-lexer.ts

实现词法分析器，Token 类型包括：
- `NUMBER` - 数字字面量
- `D` - 'd' 关键字
- `PLUS`, `MINUS`, `STAR`, `SLASH` - 运算符
- `LPAREN`, `RPAREN` - 括号
- `KH`, `KL` - keep highest / keep lowest
- `R` - reroll
- `BANG` - explode (!)
- `EOF`

```typescript
export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

export type TokenType =
  | 'NUMBER' | 'D' | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH'
  | 'LPAREN' | 'RPAREN' | 'KH' | 'KL' | 'R' | 'BANG' | 'EOF';

export function tokenize(input: string): Token[];
```

### 文件 2：packages/server/src/engine/dice-parser.ts

实现递归下降解析器，生成 AST：

```typescript
export type DiceASTNode =
  | { type: 'number'; value: number }
  | { type: 'dice_roll'; count: number; sides: number; modifiers: DiceModifier[] }
  | { type: 'binary_op'; op: '+' | '-' | '*' | '/'; left: DiceASTNode; right: DiceASTNode }
  | { type: 'unary_minus'; operand: DiceASTNode }
  | { type: 'group'; expression: DiceASTNode };

export interface DiceModifier {
  type: 'keep_highest' | 'keep_lowest' | 'reroll' | 'explode';
  value?: number;
}

export function parse(tokens: Token[]): DiceASTNode;
```

### 文件 3：packages/server/src/engine/dice-evaluator.ts

实现求值器，使用 `@randsum/roller` 或 `Math.random` 进行真实骰子投掷：

```typescript
export interface DiceRollResult {
  total: number;
  details: string;          // "3d6: [4, 2, 6] = 12"
  rolls: SingleRoll[];
}

export interface SingleRoll {
  sides: number;
  results: number[];        // 投出的每个骰子
  kept: number[];           // 保留的（在 kh/kl 之后）
  total: number;
}

/** 解析并求值完整的骰子表达式 */
export function evaluateDice(expression: string): DiceRollResult;

/** 允许注入随机函数以便测试 */
export function evaluateDiceWithRng(expression: string, rng: () => number): DiceRollResult;
```

### 文件 4：packages/server/src/engine/__tests__/dice.test.ts

使用 vitest 编写测试：

```typescript
import { describe, it, expect } from 'vitest';
import { tokenize } from '../dice-lexer';
import { parse } from '../dice-parser';
import { evaluateDice, evaluateDiceWithRng } from '../dice-evaluator';

describe('Dice Lexer', () => {
  it('应能解析基础骰子表达式 "3d6"', () => { /* ... */ });
  it('应能解析带修饰的表达式 "4d6kh3"', () => { /* ... */ });
  it('应能解析复合表达式 "2d6+1d4+5"', () => { /* ... */ });
});

describe('Dice Parser', () => {
  it('应生成正确的 AST', () => { /* ... */ });
  it('应处理运算符优先级', () => { /* ... */ });
});

describe('Dice Evaluator', () => {
  it('固定随机种子下 1d6 应返回可预期结果', () => {
    let i = 0;
    const values = [0.5]; // Math.floor(0.5 * 6) + 1 = 4
    const rng = () => values[i++];
    const result = evaluateDiceWithRng('1d6', rng);
    expect(result.total).toBe(4);
  });

  it('4d6kh3 应保留最高的3个骰子', () => {
    let i = 0;
    const values = [0.1, 0.5, 0.9, 0.3]; // 1, 4, 6, 2 -> keep 4,6,2? no keep 6,4,2=12
    const rng = () => values[i++];
    const result = evaluateDiceWithRng('4d6kh3', rng);
    // rolls: 1,4,6,2 -> keep highest 3 -> 4+6+2=12
    expect(result.total).toBe(12);
  });

  it('应能正确计算 2d6+3', () => {
    let i = 0;
    const values = [0.5, 0.5]; // 4, 4
    const rng = () => values[i++];
    const result = evaluateDiceWithRng('2d6+3', rng);
    expect(result.total).toBe(11); // 4+4+3
  });

  it('应对无效表达式抛出错误', () => {
    expect(() => evaluateDice('abc')).toThrow();
  });
});
```

P0 组件禁止硬编码任何 TRPG 系统特有词汇（d100、SAN、HP、COC、DND 等），所有行为由输入参数驱动。

本步骤产出将被步骤 06、08 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 05 — 公式求值器

- **依赖步骤**：Step 02
- **产出文件**：`packages/server/src/engine/formula-evaluator.ts`、`packages/server/src/engine/__tests__/formula.test.ts`
- **验证**：T — `pnpm --filter @trpg/server test -- formula`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 02 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts

## 任务：实现基于 mathjs 的安全公式求值器

### 文件 1：packages/server/src/engine/formula-evaluator.ts

使用 mathjs 的 `evaluate` 函数，但必须限制可用功能以防止代码注入：

```typescript
import { create, all } from 'mathjs';

/** 安全公式求值器，只允许数学运算，不允许访问文件系统或执行代码 */

// 创建受限的 mathjs 实例
const math = create(all);

// 移除危险函数
const BLOCKED_FUNCTIONS = [
  'import', 'createUnit', 'evaluate', 'parse', 'simplify',
  'derivative', 'resolve', 'compile', 'chain',
];

// 允许的函数白名单
const ALLOWED_FUNCTIONS = [
  'abs', 'ceil', 'floor', 'round', 'max', 'min',
  'sqrt', 'pow', 'log', 'log2', 'log10',
  'add', 'subtract', 'multiply', 'divide', 'mod',
  'sign', 'clamp',
];

export interface FormulaContext {
  [key: string]: number;
}

/**
 * 安全地求值数学公式
 * @param formula - 公式字符串，如 "floor((base_value - 10) / 2)"
 * @param context - 变量上下文，如 { base_value: 15 }
 * @returns 求值结果（数字）
 * @throws Error 如果公式无效或包含危险操作
 */
export function evaluateFormula(formula: string, context: FormulaContext): number;

/**
 * 验证公式是否安全（不执行，只检查语法和引用）
 * @returns { valid: boolean; error?: string }
 */
export function validateFormula(formula: string, availableVars: string[]): { valid: boolean; error?: string };
```

### 文件 2：packages/server/src/engine/__tests__/formula.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateFormula, validateFormula } from '../formula-evaluator';

describe('Formula Evaluator', () => {
  it('应能计算简单算术', () => {
    expect(evaluateFormula('2 + 3', {})).toBe(5);
  });

  it('应能使用上下文变量', () => {
    expect(evaluateFormula('base * 2 + bonus', { base: 10, bonus: 3 })).toBe(23);
  });

  it('应支持 floor/ceil/round', () => {
    expect(evaluateFormula('floor((str - 10) / 2)', { str: 15 })).toBe(2);
  });

  it('应支持 min/max', () => {
    expect(evaluateFormula('max(hp, 0)', { hp: -5 })).toBe(0);
  });

  it('应拒绝危险表达式', () => {
    expect(() => evaluateFormula('import("fs")', {})).toThrow();
  });

  it('应对未定义变量报错', () => {
    expect(() => evaluateFormula('x + 1', {})).toThrow();
  });
});

describe('Formula Validator', () => {
  it('应验证合法公式', () => {
    const result = validateFormula('a + b * 2', ['a', 'b']);
    expect(result.valid).toBe(true);
  });

  it('应拒绝引用未知变量的公式', () => {
    const result = validateFormula('a + c', ['a', 'b']);
    expect(result.valid).toBe(false);
  });
});
```

P0 组件禁止硬编码任何 TRPG 系统特有词汇（d100、SAN、HP、COC、DND 等），所有行为由输入参数驱动。

本步骤产出将被步骤 06、07 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 06 — P0 原子节点（上）

- **依赖步骤**：Step 02, 04, 05
- **产出文件**：`packages/server/src/engine/atoms/dice-roll.ts`、`threshold-compare.ts`、`multiply.ts`、`if-else.ts`、`result-collector.ts`
- **验证**：T — `pnpm --filter @trpg/server test -- atoms`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 02、04、05 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts（获取 NodeExecutionLog 接口）
- packages/server/src/engine/dice-evaluator.ts（获取 evaluateDice、evaluateDiceWithRng 导出）
- packages/server/src/engine/formula-evaluator.ts（获取 evaluateFormula 导出）

## 任务：实现 5 个 P0 原子节点

每个原子节点必须实现以下统一接口：

```typescript
export interface AtomNode {
  type: string;
  execute(inputs: Record<string, any>): AtomOutput;
}

export interface AtomOutput {
  result: any;
  logs: { input_summary: string; output_summary: string };
}
```

**关键约束：P0 组件禁止硬编码任何 TRPG 系统特有词汇（d100、SAN、HP、COC、DND 等），所有行为由输入参数驱动。**

### 文件 1：packages/server/src/engine/atoms/dice-roll.ts

dice_roll 原子：接收骰子表达式字符串，调用 dice-evaluator 执行。

输入参数：
- `expression: string` — 骰子表达式，如 "3d6+2"
- `rng?: () => number` — 可选随机函数（测试用）

输出：
- `result: { total: number; details: string; rolls: SingleRoll[] }`

### 文件 2：packages/server/src/engine/atoms/threshold-compare.ts

threshold_compare 原子：将一个数值与阈值比较，输出 pass/fail。

输入参数：
- `value: number` — 待比较值
- `threshold: number` — 阈值
- `operator: '<' | '<=' | '>' | '>=' | '==' | '!='` — 比较运算符

输出：
- `result: { passed: boolean; value: number; threshold: number; operator: string }`

### 文件 3：packages/server/src/engine/atoms/multiply.ts

multiply 原子：将两个数值相乘。

输入参数：
- `a: number`
- `b: number`

输出：
- `result: { value: number }`

### 文件 4：packages/server/src/engine/atoms/if-else.ts

if_else 原子：根据条件选择不同分支的值。

输入参数：
- `condition: boolean`
- `then_value: any`
- `else_value: any`

输出：
- `result: { value: any; branch: 'then' | 'else' }`

### 文件 5：packages/server/src/engine/atoms/result-collector.ts

result_collector 原子：收集多个输入，合并为最终结果对象。

输入参数：
- `entries: Record<string, any>` — 键值对，所有需要收集的结果

输出：
- `result: Record<string, any>` — 直接返回 entries

### 测试文件：packages/server/src/engine/__tests__/atoms-p0-upper.test.ts

为以上 5 个原子各编写至少 2 个测试用例，覆盖正常和边界情况。

本步骤产出将被步骤 07、08 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 07 — P0 原子节点（下）

- **依赖步骤**：Step 02, 06
- **产出文件**：`packages/server/src/engine/atoms/character-skill-reader.ts`、`resource-modify.ts`、`formula-eval.ts`
- **验证**：T — `pnpm --filter @trpg/server test -- atoms`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 02、06 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts（获取 CharacterInstance、CharacterCard 接口）
- packages/server/src/engine/atoms/dice-roll.ts（获取 AtomNode、AtomOutput 接口定义）
- packages/server/src/engine/formula-evaluator.ts（获取 evaluateFormula）

## 任务：实现 3 个 P0 原子节点

复用步骤 06 定义的 AtomNode 和 AtomOutput 接口。

**关键约束：P0 组件禁止硬编码任何 TRPG 系统特有词汇（d100、SAN、HP、COC、DND 等），所有行为由输入参数驱动。**

### 文件 1：packages/server/src/engine/atoms/character-skill-reader.ts

character_skill_reader 原子：从角色卡数据中读取指定属性/技能值。

输入参数：
- `character_data: { attributes: Record<string, number>; skills: Record<string, number>; resources: Record<string, { current: number; max: number }> }` — 角色数据
- `field_type: 'attribute' | 'skill' | 'resource_current' | 'resource_max'` — 读取类型
- `field_name: string` — 字段名

输出：
- `result: { value: number; field_type: string; field_name: string }`
- 如果字段不存在，抛出带有 `field_name` 的明确错误

### 文件 2：packages/server/src/engine/atoms/resource-modify.ts

resource_modify 原子：修改角色资源值（加减），并返回修改前后的值。

输入参数：
- `current_value: number` — 当前值
- `max_value: number` — 最大值
- `delta: number` — 变化量（正数为增加，负数为减少）
- `min_value?: number` — 最小值下限（默认 0）

输出：
- `result: { old_value: number; new_value: number; delta: number; clamped: boolean }`
- `new_value` 被 clamp 在 `[min_value, max_value]` 区间内

### 文件 3：packages/server/src/engine/atoms/formula-eval.ts

formula_eval 原子：封装公式求值器为原子节点。

输入参数：
- `formula: string` — 公式表达式
- `variables: Record<string, number>` — 变量上下文

输出：
- `result: { value: number; formula: string }`

### 测试文件：packages/server/src/engine/__tests__/atoms-p0-lower.test.ts

为以上 3 个原子各编写至少 2 个测试用例：
- character_skill_reader: 正常读取 + 字段不存在
- resource_modify: 正常增减 + clamp 边界
- formula_eval: 正常公式 + 无效公式

本步骤产出将被步骤 08 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 08 — 组件注册表 + 执行器

- **依赖步骤**：Step 06, 07
- **产出文件**：`packages/server/src/engine/registry.ts`、`executor.ts`、`packages/server/src/engine/__tests__/executor.test.ts`
- **验证**：T — `pnpm --filter @trpg/server test -- executor`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 06、07 的产出。

请先读取以下文件：
- packages/server/src/engine/atoms/dice-roll.ts（获取 AtomNode、AtomOutput 接口）
- packages/server/src/engine/atoms/threshold-compare.ts
- packages/server/src/engine/atoms/multiply.ts
- packages/server/src/engine/atoms/if-else.ts
- packages/server/src/engine/atoms/result-collector.ts
- packages/server/src/engine/atoms/character-skill-reader.ts
- packages/server/src/engine/atoms/resource-modify.ts
- packages/server/src/engine/atoms/formula-eval.ts
- packages/shared/src/types/index.ts（获取 ExecuteRequest、ExecuteResponse、NodeExecutionLog）

## 任务：实现组件注册表和图执行器

### 文件 1：packages/server/src/engine/registry.ts

组件注册表，管理所有原子节点的注册和获取：

```typescript
import type { AtomNode } from './atoms/dice-roll';

export class AtomRegistry {
  private atoms = new Map<string, new () => AtomNode>();

  /** 注册一个原子类型 */
  register(type: string, atomClass: new () => AtomNode): void;

  /** 获取原子实例 */
  create(type: string): AtomNode;

  /** 检查是否已注册 */
  has(type: string): boolean;

  /** 获取所有已注册类型 */
  types(): string[];
}

/** 全局注册表实例，预注册所有 P0 原子 */
export const globalRegistry: AtomRegistry;
```

预注册以下原子类型名称：
`dice_roll`, `threshold_compare`, `multiply`, `if_else`, `result_collector`, `character_skill_reader`, `resource_modify`, `formula_eval`

### 文件 2：packages/server/src/engine/executor.ts

图执行器，接收节点图定义，按拓扑排序执行：

```typescript
import type { NodeExecutionLog } from '@trpg/shared';
import { AtomRegistry } from './registry';

/** 节点图中的一个节点定义 */
export interface GraphNodeDef {
  node_id: string;
  atom_type: string;
  inputs: Record<string, InputSource>;
  position?: { x: number; y: number };  // 编辑器用，执行时忽略
}

/** 输入来源：静态值 或 引用其他节点的输出 */
export type InputSource =
  | { type: 'static'; value: any }
  | { type: 'ref'; node_id: string; output_key: string };

/** 执行图 */
export interface GraphDef {
  nodes: GraphNodeDef[];
  output_node_id: string;  // 最终输出节点
}

export interface GraphExecuteResult {
  success: boolean;
  output: any;
  logs: NodeExecutionLog[];
}

export class GraphExecutor {
  constructor(private registry: AtomRegistry);

  /**
   * 执行节点图
   * 1. 拓扑排序（检测循环依赖）
   * 2. 按顺序执行每个节点
   * 3. 收集执行日志
   */
  execute(graph: GraphDef, runtimeInputs?: Record<string, any>): GraphExecuteResult;

  /** 拓扑排序，返回执行顺序；如存在循环则抛出错误 */
  private topologicalSort(nodes: GraphNodeDef[]): string[];
}
```

### 文件 3：packages/server/src/engine/__tests__/executor.test.ts

测试用例：

1. **简单链式图**：dice_roll → threshold_compare → result_collector
   - 固定随机种子，验证完整执行流程

2. **分支图**：dice_roll → if_else（分支到 multiply 或 直接输出）→ result_collector

3. **循环检测**：节点 A 引用 B，B 引用 A → 应抛出错误

4. **未知原子类型**：graph 中包含未注册的 atom_type → 应抛出错误

本步骤产出将被步骤 09、10 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 09 — Ruleset 校验器 + 继承合并

- **依赖步骤**：Step 08
- **产出文件**：`packages/server/src/engine/ruleset-validator.ts`、`ruleset-merger.ts`、`packages/server/src/engine/__tests__/ruleset.test.ts`
- **验证**：T — `pnpm --filter @trpg/server test -- ruleset`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 08 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts（获取 Ruleset 接口）
- packages/server/src/engine/registry.ts（获取 AtomRegistry、globalRegistry）
- packages/server/src/engine/executor.ts（获取 GraphNodeDef、GraphDef）

## 任务：实现 Ruleset YAML 校验器和继承合并器

### 文件 1：packages/server/src/engine/ruleset-validator.ts

使用 zod 进行 schema 校验，使用 yaml 包解析 YAML：

```typescript
import { z } from 'zod';
import type { AtomRegistry } from './registry';

/** Ruleset 定义的 zod schema */
export const RulesetSchema: z.ZodSchema;

/** 校验 Ruleset 的 atoms 定义是否引用了已注册的原子类型 */
export function validateRuleset(
  rulesetData: unknown,
  registry: AtomRegistry
): { valid: boolean; errors: string[] };

/** 从 YAML 字符串解析 Ruleset */
export function parseRulesetYAML(yamlString: string): unknown;
```

zod schema 应包含以下字段校验：
- `id`: string
- `name`: string, 1-128 字符
- `version`: string, 符合 semver 格式
- `parent_ruleset_id`: string 可选
- `atoms`: Record<string, { type: string; config?: object }> — 每个 atom 的 type 必须在 registry 中存在
- `connections`: array of { from_node: string; from_output: string; to_node: string; to_input: string }
- `commands`: Record<string, { graph: GraphDef; description?: string }>
- `character_card_schema`: object

### 文件 2：packages/server/src/engine/ruleset-merger.ts

实现规则集继承合并逻辑：

```typescript
import type { Ruleset } from '@trpg/shared';

/**
 * 合并子规则集和父规则集
 * 策略：
 * - atoms: 子覆盖父（同名替换），子新增保留
 * - connections: 子覆盖父（完全替换）
 * - commands: 子覆盖父（同名替换），子新增保留
 * - character_card_schema: 深度合并
 */
export function mergeRulesets(child: Partial<Ruleset>, parent: Ruleset): Ruleset;
```

### 文件 3：packages/server/src/engine/__tests__/ruleset.test.ts

测试用例：
1. 合法 YAML 字符串解析 + 校验通过
2. 引用未注册原子类型 → 校验失败
3. 缺少必填字段 → 校验失败
4. 父子合并：子 atoms 覆盖父同名 atom
5. 父子合并：子新增 command 保留

本步骤产出将被步骤 10、15 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 10 — 命令系统

- **依赖步骤**：Step 08, 09
- **产出文件**：`packages/server/src/engine/command-parser.ts`、`command-defaults.ts`、`packages/server/src/engine/__tests__/command.test.ts`
- **验证**：T — `pnpm --filter @trpg/server test -- command`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 08、09 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts（获取 ExecuteRequest、ExecuteResponse）
- packages/server/src/engine/executor.ts（获取 GraphExecutor、GraphDef）
- packages/server/src/engine/registry.ts（获取 globalRegistry）
- packages/server/src/engine/ruleset-validator.ts
- packages/server/src/engine/ruleset-merger.ts

## 任务：实现命令解析和平台默认命令

### 文件 1：packages/server/src/engine/command-parser.ts

命令意图解析器，将用户输入的命令字符串解析为 ExecuteRequest：

```typescript
import type { ExecuteRequest } from '@trpg/shared';

export interface ParsedCommand {
  command: string;        // 命令名称，如 "roll", "check", "attack"
  params: Record<string, any>;  // 解析出的参数
  raw: string;            // 原始输入
}

/**
 * 解析命令字符串
 * 格式：/command_name param1=value1 param2=value2
 * 或：/command_name positional_arg
 * 示例：
 *   "/roll 3d6+2"          → { command: "roll", params: { expression: "3d6+2" } }
 *   "/check skill=侦查"    → { command: "check", params: { skill: "侦查" } }
 *   "/initiative"           → { command: "initiative", params: {} }
 */
export function parseCommand(input: string): ParsedCommand;

/**
 * 将解析后的命令 + 上下文组装为 ExecuteRequest
 */
export function buildExecuteRequest(
  parsed: ParsedCommand,
  rulesetId: string,
  context: { character_id: string; campaign_id: string; scene_id?: string }
): ExecuteRequest;
```

### 文件 2：packages/server/src/engine/command-defaults.ts

平台预置命令的图定义（可被规则集覆盖）：

```typescript
import type { GraphDef } from './executor';

/** 平台默认命令定义 */
export const DEFAULT_COMMANDS: Record<string, { graph: GraphDef; description: string }>;
```

预置以下命令：

1. **roll** — 通用骰子投掷
   - 参数：`expression: string`
   - 图：dice_roll → result_collector
   - 描述："投掷骰子"

2. **check** — 技能检定
   - 参数：`skill: string`, `difficulty?: number`
   - 图：character_skill_reader → dice_roll → threshold_compare → result_collector
   - 描述："技能检定"

3. **initiative** — 先攻掷骰
   - 参数：无
   - 图：dice_roll → result_collector（实际先攻排序在服务层处理）
   - 描述："先攻掷骰"

### 文件 3：packages/server/src/engine/command-resolver.ts

命令解析合并器，将规则集命令和平台默认命令合并：

```typescript
import type { GraphDef } from './executor';
import type { Ruleset } from '@trpg/shared';

/**
 * 解析最终可用命令列表
 * 优先级：规则集命令 > 平台默认命令
 */
export function resolveCommands(
  ruleset: Ruleset
): Record<string, { graph: GraphDef; description: string }>;
```

### 文件 4：packages/server/src/engine/__tests__/command.test.ts

测试用例：
1. 解析 "/roll 3d6+2" → command: "roll", params: { expression: "3d6+2" }
2. 解析 "/check skill=侦查 difficulty=50" → 正确参数
3. 解析无效命令 → 抛出错误
4. 规则集命令覆盖平台默认命令
5. 平台默认命令在无覆盖时可用

本步骤产出将被步骤 13、17、32 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

### Phase 2：服务层

---

#### Step 11 — Knex 连接池 + 全部迁移文件

- **依赖步骤**：Step 02
- **产出文件**：`packages/server/src/db/knex-config.ts`、确认 `migrations/001_init.ts` 完整
- **验证**：C — `pnpm --filter @trpg/server build`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 02 的产出。

请先读取以下文件：
- packages/server/src/db/migrations/001_init.ts
- packages/server/package.json

## 任务：创建 Knex 连接配置

### 文件 1：packages/server/src/db/knex-config.ts

```typescript
import knex, { Knex } from 'knex';
import path from 'path';

const config: Knex.Config = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'trpg_platform',
    charset: 'utf8mb4',
  },
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
  },
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
    extension: 'ts',
  },
};

export const db = knex(config);
export default config;
```

### 文件 2：packages/server/src/db/index.ts

```typescript
export { db } from './knex-config';
```

确认 migrations/001_init.ts 包含以下全部表（字段名、类型必须完全匹配）：
- `users`: id VARCHAR(64) PK, uid INT UNSIGNED UNIQUE, phone VARCHAR(20) UNIQUE, password_hash VARCHAR(255), nickname VARCHAR(64), avatar_url VARCHAR(255), user_type JSON, creator_level TINYINT DEFAULT 1, coins BIGINT UNSIGNED DEFAULT 0, subscription_type ENUM('free','pro','creator') DEFAULT 'free', created_at TIMESTAMP
- `campaigns`: id VARCHAR(64) PK, room_code VARCHAR(8) UNIQUE, name VARCHAR(128), ruleset_id VARCHAR(64), module_id VARCHAR(64), gm_user_id VARCHAR(64), assistant_gm_ids JSON, global_story_time JSON, status ENUM('preparing','running','paused','ended'), allow_ob BOOLEAN, is_listed_publicly BOOLEAN, enable_trajectory_matrix BOOLEAN, enable_grid_map BOOLEAN, enable_scene_connections BOOLEAN, created_at TIMESTAMP
- `scenes`: id VARCHAR(64) PK, campaign_id VARCHAR(64), name VARCHAR(128), type ENUM('spatial','virtual','lobby'), history_visibility ENUM('none','recent','all'), visible_history_count INT, created_at TIMESTAMP
- `character_sheets`: id VARCHAR(64) PK, character_code VARCHAR(8) UNIQUE, user_id VARCHAR(64), ruleset_id VARCHAR(64), name VARCHAR(64), occupation_id VARCHAR(64), avatar_url VARCHAR(255), attributes JSON, skills JSON, derived_max JSON, equipment JSON, background TEXT, avatar_custom_data JSON NULL, initial_snapshot JSON NULL, created_at TIMESTAMP, updated_at TIMESTAMP
- `character_scene_states`: id VARCHAR(64) PK, character_id VARCHAR(64), campaign_id VARCHAR(64), current_spatial_scene_id VARCHAR(64), personal_story_time JSON, UNIQUE(character_id, campaign_id)
- `scene_participations`: id VARCHAR(64) PK, scene_id VARCHAR(64), character_id VARCHAR(64), joined_at TIMESTAMP, left_at TIMESTAMP NULL, UNIQUE(scene_id, character_id, left_at)
- `scheduled_moves`: id VARCHAR(64) PK, character_id VARCHAR(64), campaign_id VARCHAR(64), to_scene_id VARCHAR(64), execute_at_story JSON, status ENUM('pending','approved','executed','cancelled'), created_at TIMESTAMP
- `chat_messages`: id BIGINT UNSIGNED PK (snowflake), scene_id VARCHAR(64), campaign_id VARCHAR(64), sender_user_id VARCHAR(64), sender_character_id VARCHAR(64), content TEXT, message_type ENUM, story_time JSON, visible_to JSON, client_timestamp BIGINT, created_at TIMESTAMP, metadata JSON
- `scene_connections`: id VARCHAR(64) PK, campaign_id VARCHAR(64), from_scene_id VARCHAR(64), to_scene_id VARCHAR(64), walk_duration INT, bike_duration INT, drive_duration INT, is_bidirectional BOOLEAN, created_by VARCHAR(64), created_at TIMESTAMP
- `recruitment_posts`: id VARCHAR(64) PK, poster_id VARCHAR(64), type ENUM('gm_recruit','player_seek'), title VARCHAR(128), campaign_id VARCHAR(64), ruleset_id VARCHAR(64), player_count_max INT, status ENUM('open','closed','full'), created_at TIMESTAMP
- `rulesets`: id VARCHAR(64) PK, name VARCHAR(128), version VARCHAR(32), parent_ruleset_id VARCHAR(64), atoms JSON, connections JSON, commands JSON, character_card_schema JSON, status ENUM('draft','published'), created_at TIMESTAMP
- `campaign_npcs`: id VARCHAR(64) PK, campaign_id VARCHAR(64), source_module_npc_id VARCHAR(64), name VARCHAR(128), display_name VARCHAR(128), avatar_url VARCHAR(255), description TEXT, voice_tips TEXT, attributes JSON, skills JSON, resources JSON, is_temporary BOOLEAN, is_playable BOOLEAN, is_active BOOLEAN, created_by VARCHAR(64), created_at TIMESTAMP, updated_at TIMESTAMP
- `campaign_round_state`: campaign_id VARCHAR(64) PK, turn_order JSON, current_index INT, round_number INT, updated_at TIMESTAMP
- `position_history`: id VARCHAR(64) PK, campaign_id VARCHAR(64), character_id VARCHAR(64), scene_id VARCHAR(64), story_time_entered JSON, story_time_left JSON, move_type ENUM('scheduled','force_move','join','leave'), created_at TIMESTAMP

本步骤产出将被步骤 12–19 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 12 — User + Auth 服务

- **依赖步骤**：Step 02, 03, 11
- **产出文件**：`packages/server/src/services/user-service.ts`、`auth-service.ts`、`middleware/auth.ts`、`__tests__/auth.test.ts`
- **验证**：T — `pnpm --filter @trpg/server test -- auth`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 02、03、11 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts（获取 User 接口）
- packages/shared/src/utils/id.ts（获取 generateId, UID_START）
- packages/server/src/db/index.ts（获取 db）
- packages/server/src/routes/auth.ts（将更新路由实现）
- packages/server/src/routes/users.ts（将更新路由实现）

## 任务：实现用户注册、登录、JWT 鉴权

### 文件 1：packages/server/src/services/user-service.ts

```typescript
import type { User } from '@trpg/shared';
import { db } from '../db';
import { generateId } from '@trpg/shared';

export class UserService {
  /** 通过 ID 查询用户 */
  async findById(id: string): Promise<User | null>;

  /** 通过手机号查询用户 */
  async findByPhone(phone: string): Promise<User | null>;

  /** 创建用户（uid 自增分配，从 1000000 起） */
  async create(data: { phone: string; password_hash: string; nickname: string }): Promise<User>;

  /** 更新用户资料 */
  async update(id: string, data: Partial<Pick<User, 'nickname' | 'avatar_url'>>): Promise<void>;

  /** 获取下一个可用 UID */
  private async getNextUid(): Promise<number>;
}

export const userService = new UserService();
```

表操作说明：
- 表名：`users`
- 字段：id (VARCHAR 64, UUID), uid (INT UNSIGNED, 唯一, 7位起), phone (VARCHAR 20, 唯一), password_hash (VARCHAR 255), nickname (VARCHAR 64), avatar_url (VARCHAR 255), user_type (JSON), creator_level (TINYINT), coins (BIGINT UNSIGNED), subscription_type (ENUM), created_at (TIMESTAMP)

### 文件 2：packages/server/src/services/auth-service.ts

```typescript
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userService } from './user-service';

const JWT_SECRET = process.env.JWT_SECRET || 'trpg-dev-secret';
const JWT_EXPIRES_IN = '7d';

export class AuthService {
  /** 注册 */
  async register(phone: string, password: string, nickname: string): Promise<{ user: any; token: string }>;

  /** 登录 */
  async login(phone: string, password: string): Promise<{ user: any; token: string }>;

  /** 生成 JWT */
  generateToken(userId: string): string;

  /** 验证 JWT */
  verifyToken(token: string): { userId: string };
}

export const authService = new AuthService();
```

### 文件 3：packages/server/src/middleware/auth.ts

Express 中间件，从 Authorization header 中提取 Bearer token，验证后将 userId 附加到 req：

```typescript
import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth-service';

// 扩展 Request 类型
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void;
```

### 文件 4：更新 packages/server/src/routes/auth.ts

将占位的 501 响应替换为真实实现，调用 authService。

### 文件 5：更新 packages/server/src/routes/users.ts

将占位的 501 响应替换为真实实现，使用 authMiddleware 保护路由。

### 文件 6：packages/server/src/services/__tests__/auth.test.ts

使用 vitest 测试：
1. register 成功创建用户并返回 token
2. register 重复手机号报错
3. login 成功返回 token
4. login 密码错误报错
5. verifyToken 验证有效 token
6. verifyToken 拒绝无效 token

注意：测试中使用内存数据库或 mock db 层。可以使用 vitest 的 `vi.mock` 来 mock `../db`。

本步骤产出将被步骤 13、14、15、16 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 13 — Campaign + Scene + ScheduledMove 服务

- **依赖步骤**：Step 02, 03, 11, 12
- **产出文件**：`packages/server/src/services/campaign-service.ts`、`scene-service.ts`、`scheduled-move-service.ts`、更新路由
- **验证**：T — `pnpm --filter @trpg/server test -- campaign`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 02、03、11、12 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts（获取 Campaign, Scene, ScheduledMove, SceneConnection, StoryTime, CampaignStatus, MoveStatus, PositionHistory 接口）
- packages/shared/src/utils/id.ts（获取 generateId, generateRoomCode）
- packages/server/src/db/index.ts
- packages/server/src/middleware/auth.ts
- packages/server/src/routes/campaigns.ts

## 任务：实现团、场、预约移动的 CRUD 服务

### 文件 1：packages/server/src/services/campaign-service.ts

```typescript
import type { Campaign, CampaignStatus, StoryTime } from '@trpg/shared';

export class CampaignService {
  /** 创建团 */
  async create(data: { name: string; ruleset_id: string; gm_user_id: string; module_id?: string }): Promise<Campaign>;

  /** 通过 ID 查找 */
  async findById(id: string): Promise<Campaign | null>;

  /** 通过房间代码查找 */
  async findByRoomCode(roomCode: string): Promise<Campaign | null>;

  /** 列出用户参与的团 */
  async listByUser(userId: string): Promise<Campaign[]>;

  /** 更新团状态 */
  async updateStatus(id: string, status: CampaignStatus): Promise<void>;

  /** 推进全局故事时间 */
  async advanceTime(id: string, newTime: StoryTime): Promise<{ oldTime: StoryTime; newTime: StoryTime }>;

  /** 更新团设置 */
  async update(id: string, data: Partial<Pick<Campaign, 'name' | 'allow_ob' | 'is_listed_publicly' | 'enable_trajectory_matrix' | 'enable_grid_map' | 'enable_scene_connections'>>): Promise<void>;
}

export const campaignService = new CampaignService();
```

表操作：`campaigns` 表，字段如步骤 11 所列。room_code 使用 `generateRoomCode()` 生成，需检查唯一性（重试）。

### 文件 2：packages/server/src/services/scene-service.ts

```typescript
import type { Scene, SceneType, SceneConnection } from '@trpg/shared';

export class SceneService {
  /** 创建场 */
  async create(data: { campaign_id: string; name: string; type: SceneType }): Promise<Scene>;

  /** 列出团下的所有场 */
  async listByCampaign(campaignId: string): Promise<Scene[]>;

  /** 通过 ID 查找 */
  async findById(id: string): Promise<Scene | null>;

  /** 创建场连接 */
  async createConnection(data: {
    campaign_id: string;
    from_scene_id: string;
    to_scene_id: string;
    walk_duration: number;
    bike_duration?: number;
    drive_duration?: number;
    is_bidirectional?: boolean;
    created_by: string;
  }): Promise<SceneConnection>;

  /** 列出团下的所有场连接 */
  async listConnections(campaignId: string): Promise<SceneConnection[]>;
}

export const sceneService = new SceneService();
```

表操作：`scenes` 表和 `scene_connections` 表。

### 文件 3：packages/server/src/services/scheduled-move-service.ts

```typescript
import type { ScheduledMove, StoryTime, MoveStatus } from '@trpg/shared';

export class ScheduledMoveService {
  /** 创建预约移动 */
  async create(data: {
    character_id: string;
    campaign_id: string;
    to_scene_id: string;
    execute_at_story: StoryTime;
  }): Promise<ScheduledMove>;

  /** 审批移动 */
  async approve(moveId: string, executeAt?: StoryTime): Promise<void>;

  /** 拒绝移动 */
  async reject(moveId: string): Promise<void>;

  /** 查找待执行的移动（故事时间已到达） */
  async findTriggeredMoves(campaignId: string, currentTime: StoryTime): Promise<ScheduledMove[]>;

  /** 执行移动（更新状态为 executed，并更新角色位置） */
  async executeMoves(moves: ScheduledMove[]): Promise<void>;

  /** 列出团的待审批移动 */
  async listPending(campaignId: string): Promise<ScheduledMove[]>;
}

export const scheduledMoveService = new ScheduledMoveService();
```

表操作：`scheduled_moves` 表，字段：id, character_id, campaign_id, to_scene_id, execute_at_story (JSON), status (ENUM), created_at。

`findTriggeredMoves` 逻辑：status='approved' 且 execute_at_story 的时间 <= currentTime。StoryTime 比较逻辑：先比 day，再比 hour，再比 minute。

### 文件 4：更新 packages/server/src/routes/campaigns.ts

将所有占位路由替换为调用对应 service 的真实实现。所有路由使用 authMiddleware。

### 测试文件：packages/server/src/services/__tests__/campaign.test.ts

测试用例（mock db）：
1. 创建团并验证 room_code 格式
2. 推进故事时间
3. 创建场
4. 创建场连接
5. 创建并审批预约移动
6. 查找触发的移动

本步骤产出将被步骤 14、16、17、30、34、37 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 14 — CharacterSheet + CharacterInstance 服务

- **依赖步骤**：Step 02, 03, 11
- **产出文件**：`packages/server/src/services/character-sheet-service.ts`、`character-instance-service.ts`、更新路由
- **验证**：T — `pnpm --filter @trpg/server test -- character`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 02、03、11 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts（获取 CharacterSheet, CharacterInstance, CharacterSceneState, CharacterCard 接口）
- packages/shared/src/utils/id.ts（获取 generateId, generateCharacterCode）
- packages/server/src/db/index.ts
- packages/server/src/middleware/auth.ts
- packages/server/src/routes/characters.ts

## 任务：实现角色卡和角色实例的 CRUD 服务

### 文件 1：packages/server/src/services/character-sheet-service.ts

```typescript
import type { CharacterSheet } from '@trpg/shared';

export class CharacterSheetService {
  /** 创建角色卡 */
  async create(data: {
    user_id: string;
    ruleset_id: string;
    name: string;
    occupation_id?: string;
    attributes?: Record<string, number>;
    skills?: Record<string, number>;
    derived_max?: Record<string, { current: number; max: number }>;
    equipment?: string[];
    background?: string;
  }): Promise<CharacterSheet>;

  /** 通过 ID 查找 */
  async findById(id: string): Promise<CharacterSheet | null>;

  /** 通过角色代码查找 */
  async findByCode(code: string): Promise<CharacterSheet | null>;

  /** 列出用户的角色卡 */
  async listByUser(userId: string): Promise<CharacterSheet[]>;

  /** 更新角色卡 */
  async update(id: string, data: Partial<CharacterSheet>): Promise<void>;

  /** 删除角色卡 */
  async delete(id: string): Promise<void>;

  /** 创建初始快照 */
  async createSnapshot(id: string): Promise<void>;
}

export const characterSheetService = new CharacterSheetService();
```

表操作：`character_sheets` 表，字段如步骤 11 所列。character_code 使用 `generateCharacterCode()` 生成，需检查唯一性。

### 文件 2：packages/server/src/services/character-instance-service.ts

```typescript
import type { CharacterSceneState, StoryTime } from '@trpg/shared';

export class CharacterInstanceService {
  /** 将角色卡绑定到团（创建 character_scene_state 记录） */
  async bindToCampaign(characterId: string, campaignId: string): Promise<CharacterSceneState>;

  /** 获取角色在团中的状态 */
  async getState(characterId: string, campaignId: string): Promise<CharacterSceneState | null>;

  /** 更新角色当前场 */
  async updateScene(characterId: string, campaignId: string, sceneId: string): Promise<void>;

  /** 更新角色个人故事时间 */
  async updatePersonalTime(characterId: string, campaignId: string, time: StoryTime): Promise<void>;

  /** 列出团中的所有角色状态 */
  async listByCampaign(campaignId: string): Promise<CharacterSceneState[]>;

  /** 加入场 */
  async joinScene(characterId: string, sceneId: string): Promise<void>;

  /** 离开场 */
  async leaveScene(characterId: string, sceneId: string): Promise<void>;
}

export const characterInstanceService = new CharacterInstanceService();
```

表操作：
- `character_scene_states` 表：id, character_id, campaign_id, current_spatial_scene_id, personal_story_time (JSON), UNIQUE(character_id, campaign_id)
- `scene_participations` 表：id, scene_id, character_id, joined_at, left_at, UNIQUE(scene_id, character_id, left_at)

### 文件 3：更新 packages/server/src/routes/characters.ts

将占位路由替换为真实实现。

### 测试文件：packages/server/src/services/__tests__/character.test.ts

测试用例：
1. 创建角色卡，验证 character_code 为 8 位十六进制
2. 绑定角色到团
3. 加入/离开场
4. 更新场景位置
5. 删除角色卡

本步骤产出将被步骤 17、19、36 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 15 — RecruitmentPost + Ruleset + Module 服务

- **依赖步骤**：Step 02, 03, 11
- **产出文件**：`packages/server/src/services/recruitment-service.ts`、`ruleset-service.ts`、`module-service.ts`、更新路由
- **验证**：T — `pnpm --filter @trpg/server test -- recruitment`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 02、03、11 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts（获取 RecruitmentPost, Ruleset, RecruitmentStatus, RulesetStatus 接口）
- packages/shared/src/utils/id.ts（获取 generateId）
- packages/server/src/db/index.ts
- packages/server/src/middleware/auth.ts
- packages/server/src/routes/recruitment.ts
- packages/server/src/routes/rulesets.ts

## 任务：实现招募帖、规则集、模组的 CRUD 服务

### 文件 1：packages/server/src/services/recruitment-service.ts

```typescript
import type { RecruitmentPost, RecruitmentStatus, RecruitmentType } from '@trpg/shared';

export class RecruitmentService {
  /** 发布招募帖 */
  async create(data: {
    poster_id: string;
    type: RecruitmentType;
    title: string;
    campaign_id?: string;
    ruleset_id: string;
    player_count_max: number;
  }): Promise<RecruitmentPost>;

  /** 列表（支持按 type 和 status 筛选） */
  async list(filters?: { type?: RecruitmentType; status?: RecruitmentStatus; page?: number; limit?: number }): Promise<{ items: RecruitmentPost[]; total: number }>;

  /** 通过 ID 查找 */
  async findById(id: string): Promise<RecruitmentPost | null>;

  /** 更新状态 */
  async updateStatus(id: string, status: RecruitmentStatus): Promise<void>;
}

export const recruitmentService = new RecruitmentService();
```

表操作：`recruitment_posts` 表，字段：id (VARCHAR 64), poster_id (VARCHAR 64), type ENUM('gm_recruit','player_seek'), title (VARCHAR 128), campaign_id (VARCHAR 64, nullable), ruleset_id (VARCHAR 64), player_count_max (INT), status ENUM('open','closed','full'), created_at TIMESTAMP。

### 文件 2：packages/server/src/services/ruleset-service.ts

```typescript
import type { Ruleset, RulesetStatus } from '@trpg/shared';

export class RulesetService {
  /** 创建规则集 */
  async create(data: {
    name: string;
    version: string;
    parent_ruleset_id?: string;
    atoms?: object;
    connections?: object;
    commands?: object;
    character_card_schema?: object;
  }): Promise<Ruleset>;

  /** 通过 ID 查找 */
  async findById(id: string): Promise<Ruleset | null>;

  /** 列表 */
  async list(filters?: { status?: RulesetStatus; page?: number; limit?: number }): Promise<{ items: Ruleset[]; total: number }>;

  /** 更新 */
  async update(id: string, data: Partial<Ruleset>): Promise<void>;

  /** 发布（status → published） */
  async publish(id: string): Promise<void>;

  /** 获取完整规则集（含继承合并） */
  async getResolved(id: string): Promise<Ruleset>;
}

export const rulesetService = new RulesetService();
```

表操作：`rulesets` 表。`getResolved` 方法需递归加载 parent_ruleset_id 链并调用 ruleset-merger 进行合并。

### 文件 3：packages/server/src/services/module-service.ts

模组服务（简化版，因为 DDL 中没有单独的 modules 表，模组通过 ruleset 间接关联）：

```typescript
/** 模组服务 - 当前版本为占位实现 */
export class ModuleService {
  /** 模组相关 API 暂返回空实现，后续扩展 */
  async findById(id: string): Promise<null> { return null; }
  async list(): Promise<{ items: []; total: 0 }> { return { items: [], total: 0 }; }
}

export const moduleService = new ModuleService();
```

### 文件 4：更新 packages/server/src/routes/recruitment.ts + rulesets.ts

替换占位路由为真实实现。

### 测试文件：packages/server/src/services/__tests__/recruitment.test.ts

测试用例：
1. 创建招募帖
2. 按类型筛选列表
3. 更新帖子状态
4. 创建规则集
5. 发布规则集

本步骤产出将被步骤 25、27 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

### Phase 3：实时通信

---

#### Step 16 — Redis 连接 + Socket.IO 服务端设置

- **依赖步骤**：Step 03, 11
- **产出文件**：`packages/server/src/db/redis.ts`、`packages/server/src/socket/io-server.ts`（重构）
- **验证**：C — `pnpm --filter @trpg/server build`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 03、11 的产出。

请先读取以下文件：
- packages/server/src/socket/index.ts
- packages/server/src/app.ts
- packages/shared/src/types/events.ts（获取 ServerToClientEvents, ClientToServerEvents）

## 任务：创建 Redis 连接 + 重构 Socket.IO 设置

### 文件 1：packages/server/src/db/redis.ts

```typescript
import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB) || 0,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
};

/** 主 Redis 客户端（用于常规操作） */
export const redis = new Redis(redisConfig);

/** 发布用客户端 */
export const redisPub = new Redis(redisConfig);

/** 订阅用客户端 */
export const redisSub = new Redis(redisConfig);

/** Redis key 前缀生成 */
export const RedisKeys = {
  /** 团房间在线用户集合 */
  campaignOnline: (campaignId: string) => `campaign:${campaignId}:online`,
  /** 用户 socket 映射 */
  userSocket: (userId: string) => `user:${userId}:socket`,
  /** 消息环形缓冲区 */
  messageBuffer: (campaignId: string) => `campaign:${campaignId}:messages`,
  /** 限流计数 */
  rateLimit: (userId: string) => `ratelimit:${userId}`,
} as const;
```

### 文件 2：packages/server/src/socket/io-server.ts

重构 Socket.IO 设置，加入 Redis adapter 支持和鉴权中间件：

```typescript
import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@trpg/shared';
import { authService } from '../services/auth-service';

export type TypedIO = Server<ClientToServerEvents, ServerToClientEvents>;

export function createSocketServer(httpServer: HttpServer): TypedIO {
  const io: TypedIO = new Server(httpServer, {
    cors: { origin: '*' },
    pingInterval: 25000,
    pingTimeout: 10000,
  });

  // 鉴权中间件：从 auth token 中提取 userId
  io.of('/room').use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string;
      if (!token) throw new Error('Missing auth token');
      const { userId } = authService.verifyToken(token);
      socket.data.userId = userId;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.of('/user').use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string;
      if (!token) throw new Error('Missing auth token');
      const { userId } = authService.verifyToken(token);
      socket.data.userId = userId;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  return io;
}
```

### 文件 3：更新 packages/server/src/socket/index.ts

```typescript
export { createSocketServer } from './io-server';
export type { TypedIO } from './io-server';
```

### 文件 4：更新 packages/server/src/app.ts

使用新的 `createSocketServer` 替换旧的 `setupSocketIO`：

```typescript
import express from 'express';
import { createServer } from 'http';
import routes from './routes/index';
import { createSocketServer } from './socket';

const app = express();
app.use(express.json());
app.use('/api', routes);

export const httpServer = createServer(app);
export const io = createSocketServer(httpServer);

export default app;
```

本步骤产出将被步骤 17、18、19 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 17 — 聊天消息处理器 + Snowflake + 可见性

- **依赖步骤**：Step 02, 16
- **产出文件**：`packages/shared/src/utils/snowflake.ts`、`packages/server/src/socket/chat-handler.ts`、`packages/server/src/services/visibility.ts`
- **验证**：T — `pnpm --filter @trpg/server test -- chat`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 02、16 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts（获取 ChatMessage, MessageType, SnowflakeId）
- packages/shared/src/types/events.ts（获取 ServerToClientEvents, ClientToServerEvents 中的 chat_message 和 new_message 事件）
- packages/server/src/socket/io-server.ts（获取 TypedIO 类型）
- packages/server/src/db/redis.ts（获取 redis, RedisKeys）
- packages/server/src/db/index.ts（获取 db）

## 任务：实现 Snowflake ID 生成器、聊天消息处理、可见性计算

### 文件 1：packages/shared/src/utils/snowflake.ts

实现 Twitter Snowflake 算法变体：

```typescript
/**
 * Snowflake ID 生成器
 * 结构：41位时间戳 + 10位机器ID + 12位序列号 = 63位（JS安全整数内）
 * Epoch: 2024-01-01T00:00:00Z
 */

const EPOCH = 1704067200000n; // 2024-01-01T00:00:00Z
const WORKER_BITS = 10n;
const SEQUENCE_BITS = 12n;
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n;

export class SnowflakeGenerator {
  private workerId: bigint;
  private sequence = 0n;
  private lastTimestamp = -1n;

  constructor(workerId: number = 1) {
    this.workerId = BigInt(workerId) & ((1n << WORKER_BITS) - 1n);
  }

  /** 生成下一个 Snowflake ID（返回字符串，因为 JS number 无法安全存储 64 位整数） */
  nextId(): string;

  /** 从 Snowflake ID 中提取时间戳 */
  static extractTimestamp(id: string): Date;

  /** 比较两个 Snowflake ID 的时间顺序 */
  static compare(a: string, b: string): number;
}

export const snowflake = new SnowflakeGenerator(
  Number(process.env.WORKER_ID) || 1
);
```

在 `packages/shared/src/utils/index.ts` 中添加导出：
```typescript
export * from './snowflake';
```

### 文件 2：packages/server/src/services/visibility.ts

消息可见性计算（写扩散模式）：

```typescript
import type { ChatMessage } from '@trpg/shared';

/**
 * 计算消息对哪些用户可见
 * 规则：
 * 1. visible_to 为 null → 场内所有人可见
 * 2. visible_to 为 string[] → 只有列表中的 user_id 可见
 * 3. GM 始终可见所有消息
 * 4. system 和 announcement 类型消息始终全体可见
 */
export function computeVisibility(
  message: Pick<ChatMessage, 'visible_to' | 'message_type' | 'sender_user_id'>,
  sceneParticipantUserIds: string[],
  gmUserId: string
): string[];
```

### 文件 3：packages/server/src/socket/chat-handler.ts

聊天消息处理器，挂载到 /room 命名空间：

```typescript
import type { Namespace, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, ChatMessage } from '@trpg/shared';
import { snowflake } from '@trpg/shared';
import { redis, RedisKeys } from '../db/redis';
import { db } from '../db';
import { computeVisibility } from '../services/visibility';

type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerChatHandlers(roomNsp: Namespace<ClientToServerEvents, ServerToClientEvents>): void {
  roomNsp.on('connection', (socket: RoomSocket) => {
    const userId = socket.data.userId as string;

    // join_room 事件
    socket.on('join_room', async (data) => {
      const { campaign_id, character_id, last_event_id } = data;
      socket.data.campaignId = campaign_id;
      socket.data.characterId = character_id;
      socket.join(`campaign:${campaign_id}`);

      // 记录在线状态到 Redis
      await redis.sadd(RedisKeys.campaignOnline(campaign_id), userId);
      await redis.set(RedisKeys.userSocket(userId), socket.id);

      // 如果有 last_event_id，可能需要发送 missed_messages（步骤 18 实现）
    });

    // leave_room 事件
    socket.on('leave_room', async () => {
      const campaignId = socket.data.campaignId as string;
      if (campaignId) {
        socket.leave(`campaign:${campaignId}`);
        await redis.srem(RedisKeys.campaignOnline(campaignId), userId);
        await redis.del(RedisKeys.userSocket(userId));
      }
    });

    // chat_message 事件
    socket.on('chat_message', async (data) => {
      const campaignId = socket.data.campaignId as string;
      const characterId = socket.data.characterId as string;

      if (!campaignId) return;

      // 限流检查：每用户每秒最多 5 条
      const rateLimitKey = RedisKeys.rateLimit(userId);
      const count = await redis.incr(rateLimitKey);
      if (count === 1) await redis.expire(rateLimitKey, 1);
      if (count > 5) {
        socket.emit('rate_limited', { retry_after: 1, message: '发送过于频繁，请稍后再试' });
        return;
      }

      // 生成 snowflake ID
      const messageId = snowflake.nextId();

      // 构建消息对象
      const message: ChatMessage = {
        id: messageId,
        scene_id: '', // 从角色状态获取当前场，步骤 18 完善
        campaign_id: campaignId,
        sender_user_id: userId,
        sender_character_id: characterId || null,
        content: data.content,
        message_type: (data.message_type as any) || 'narrative',
        story_time: null, // 从团获取当前故事时间
        visible_to: data.visible_to || null,
        client_timestamp: Date.now(),
        created_at: new Date(),
        metadata: data.metadata || null,
      };

      // 持久化到 MySQL
      await db('chat_messages').insert({
        ...message,
        id: BigInt(message.id),
        visible_to: message.visible_to ? JSON.stringify(message.visible_to) : null,
        story_time: message.story_time ? JSON.stringify(message.story_time) : null,
        metadata: message.metadata ? JSON.stringify(message.metadata) : null,
      });

      // 写入 Redis 环形缓冲区（步骤 18 完善）
      await redis.lpush(RedisKeys.messageBuffer(campaignId), JSON.stringify(message));
      await redis.ltrim(RedisKeys.messageBuffer(campaignId), 0, 199); // 保留最近 200 条

      // 广播消息（写扩散）
      roomNsp.to(`campaign:${campaignId}`).emit('new_message', message);
    });

    // GM 推进时间
    socket.on('gm_advance_time', async (data) => {
      // 占位，在步骤 34 完善 GM 控制台时完整实现
      console.log('[chat-handler] gm_advance_time:', data);
    });

    // 请求移动
    socket.on('request_move', async (data) => {
      console.log('[chat-handler] request_move:', data);
    });

    // GM 审批/拒绝移动
    socket.on('gm_approve_move', async (data) => {
      console.log('[chat-handler] gm_approve_move:', data);
    });
    socket.on('gm_reject_move', async (data) => {
      console.log('[chat-handler] gm_reject_move:', data);
    });

    // 断线
    socket.on('disconnect', async () => {
      const campaignId = socket.data.campaignId as string;
      if (campaignId) {
        await redis.srem(RedisKeys.campaignOnline(campaignId), userId);
        await redis.del(RedisKeys.userSocket(userId));
      }
    });
  });
}
```

### 测试文件：packages/server/src/socket/__tests__/chat.test.ts

测试用例：
1. Snowflake ID 生成唯一性（生成 1000 个 ID，无重复）
2. Snowflake ID 单调递增
3. computeVisibility：null visible_to 返回所有参与者
4. computeVisibility：指定 visible_to 只返回指定用户 + GM
5. computeVisibility：system 消息始终返回所有人

本步骤产出将被步骤 18、19、32、39 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 18 — 断线重连 + 环形缓冲区 + missed_messages

- **依赖步骤**：Step 16, 17
- **产出文件**：`packages/server/src/socket/reconnection-handler.ts`、`packages/server/src/utils/ring-buffer.ts`
- **验证**：T — `pnpm --filter @trpg/server test -- reconnect`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 16、17 的产出。

请先读取以下文件：
- packages/shared/src/types/events.ts（获取 missed_messages 事件的 payload 类型）
- packages/shared/src/utils/snowflake.ts（获取 SnowflakeGenerator.compare）
- packages/server/src/socket/chat-handler.ts
- packages/server/src/db/redis.ts（获取 RedisKeys.messageBuffer）

## 任务：实现断线重连和消息补发机制

### 文件 1：packages/server/src/utils/ring-buffer.ts

基于 Redis List 的环形缓冲区工具：

```typescript
import { redis, RedisKeys } from '../db/redis';

/**
 * 从 Redis 环形缓冲区中获取某 ID 之后的所有消息
 * @param campaignId - 团 ID
 * @param afterId - 上次收到的消息 ID（Snowflake）
 * @returns 该 ID 之后的所有缓冲消息
 */
export async function getMessagesAfter(campaignId: string, afterId: string): Promise<any[]>;

/**
 * 获取缓冲区中的最新 N 条消息
 */
export async function getRecentMessages(campaignId: string, count: number): Promise<any[]>;
```

### 文件 2：packages/server/src/socket/reconnection-handler.ts

断线重连处理：

```typescript
import type { Namespace, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@trpg/shared';
import { SnowflakeGenerator } from '@trpg/shared';
import { getMessagesAfter } from '../utils/ring-buffer';
import { db } from '../db';

type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * 处理客户端重连
 * 逻辑：
 * 1. 客户端携带 last_event_id 重新 join_room
 * 2. 从 Redis 环形缓冲区查找该 ID 之后的消息
 * 3. 如果缓冲区中找到 → 直接返回缓冲中的消息
 * 4. 如果缓冲区中找不到（断线太久）→ 从 MySQL 查询
 * 5. 发送 missed_messages 事件
 */
export async function handleReconnection(
  socket: RoomSocket,
  campaignId: string,
  characterId: string,
  lastEventId: string | undefined
): Promise<void>;
```

### 文件 3：更新 packages/server/src/socket/chat-handler.ts

在 `join_room` 事件处理中：当 `last_event_id` 存在时，调用 `handleReconnection`。

### 测试文件：packages/server/src/socket/__tests__/reconnection.test.ts

测试用例（mock Redis）：
1. 有 last_event_id 且缓冲区内有消息 → 返回正确的 missed 消息
2. 无 last_event_id → 不发送 missed_messages
3. 缓冲区为空 → 回退到 MySQL 查询

本步骤产出将被步骤 19 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 19 — 客户端 Socket 封装 + 消息状态机

- **依赖步骤**：Step 02, 17
- **产出文件**：`packages/client/src/socket/socket-client.ts`、`packages/client/src/stores/message-store.ts`
- **验证**：T — `pnpm --filter @trpg/client test -- socket`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 02、17 的产出。

请先读取以下文件：
- packages/shared/src/types/events.ts（获取 ServerToClientEvents, ClientToServerEvents）
- packages/shared/src/types/index.ts（获取 ChatMessage, CharacterInstance, StoryTime）

## 任务：实现客户端 Socket.IO 封装和消息状态管理

### 文件 1：packages/client/src/socket/socket-client.ts

```typescript
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@trpg/shared';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export class SocketClient {
  private roomSocket: TypedSocket | null = null;
  private userSocket: TypedSocket | null = null;
  private token: string = '';

  /** 设置认证 token */
  setToken(token: string): void;

  /** 连接 /room 命名空间 */
  connectRoom(): TypedSocket;

  /** 连接 /user 命名空间 */
  connectUser(): TypedSocket;

  /** 加入团房间 */
  joinRoom(campaignId: string, characterId: string, lastEventId?: string): void;

  /** 离开房间 */
  leaveRoom(): void;

  /** 发送聊天消息 */
  sendMessage(content: string, options?: {
    tempId: string;
    messageType?: string;
    visibleTo?: string[];
    metadata?: Record<string, unknown>;
  }): void;

  /** 请求移动 */
  requestMove(targetSceneId: string, travelMethod?: 'walk' | 'bike' | 'drive'): void;

  /** GM: 推进时间 */
  gmAdvanceTime(delta?: { days?: number; hours?: number; minutes?: number }, customTime?: any): void;

  /** GM: 审批移动 */
  gmApproveMove(moveId: string, executeAt?: any): void;

  /** GM: 拒绝移动 */
  gmRejectMove(moveId: string, reason?: string): void;

  /** 注册事件监听 */
  onNewMessage(handler: (msg: any) => void): void;
  onTimeAdvanced(handler: (data: any) => void): void;
  onPositionChanged(handler: (data: any) => void): void;
  onCharacterStateSync(handler: (data: any) => void): void;
  onMoveApproved(handler: (data: any) => void): void;
  onMoveRejected(handler: (data: any) => void): void;
  onRateLimited(handler: (data: any) => void): void;
  onMissedMessages(handler: (data: any) => void): void;

  /** 断开所有连接 */
  disconnect(): void;

  /** 获取房间 socket 实例 */
  getRoomSocket(): TypedSocket | null;
}

export const socketClient = new SocketClient();
```

重连策略：socket.io-client 自带重连，配置 `reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000`。

### 文件 2：packages/client/src/stores/message-store.ts

使用 Pinia 管理消息状态：

```typescript
import { defineStore } from 'pinia';
import type { ChatMessage } from '@trpg/shared';

/** 消息发送状态 */
export type MessageSendStatus = 'pending' | 'sent' | 'failed';

export interface LocalMessage extends ChatMessage {
  _sendStatus: MessageSendStatus;
  _tempId: string;
  _retryCount: number;
}

export const useMessageStore = defineStore('messages', () => {
  // 按场 ID 分组的消息列表
  const messagesByScene = ref<Map<string, LocalMessage[]>>(new Map());

  // 当前活跃场的消息
  const currentSceneId = ref<string>('');

  const currentMessages = computed<LocalMessage[]>(() => {
    return messagesByScene.value.get(currentSceneId.value) || [];
  });

  /** 添加服务端推送的消息 */
  function addServerMessage(msg: ChatMessage): void;

  /** 添加本地待发送消息 */
  function addPendingMessage(content: string, tempId: string, messageType?: string): void;

  /** 标记消息发送成功（用服务端消息替换本地 pending 消息） */
  function confirmMessage(tempId: string, serverMsg: ChatMessage): void;

  /** 标记消息发送失败 */
  function failMessage(tempId: string): void;

  /** 重试发送失败的消息 */
  function retryMessage(tempId: string): void;

  /** 批量添加历史消息（重连后补发的） */
  function addMissedMessages(messages: ChatMessage[]): void;

  /** 切换当前场 */
  function setCurrentScene(sceneId: string): void;

  /** 清空指定场的消息 */
  function clearScene(sceneId: string): void;

  return {
    messagesByScene, currentSceneId, currentMessages,
    addServerMessage, addPendingMessage, confirmMessage,
    failMessage, retryMessage, addMissedMessages,
    setCurrentScene, clearScene,
  };
});
```

### 测试文件：packages/client/src/socket/__tests__/socket-client.test.ts

测试用例（mock socket.io-client）：
1. addPendingMessage 创建 pending 状态消息
2. confirmMessage 将 pending 替换为 sent
3. failMessage 标记为 failed
4. addMissedMessages 批量插入并按 ID 排序
5. 消息按 Snowflake ID 排序

本步骤产出将被步骤 30、32 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

### Phase 4：UI 基础

---

#### Step 20 — CSS 设计令牌 + 基础 UI 组件

- **依赖步骤**：Step 01
- **产出文件**：`packages/client/src/styles/tokens.css`、`components/base/TButton.vue`、`TCard.vue`、`TInput.vue`、`TTag.vue`、`TSpinner.vue`、`TSkeleton.vue`
- **验证**：R — 启动 `pnpm --filter @trpg/client dev`，浏览器查看组件效果

````
你是高级前端工程师，精通 Vue 3 和 CSS 设计系统。本步骤基于步骤 01 的产出。

请先读取以下文件：
- packages/client/src/main.ts
- packages/client/src/App.vue

## 任务：创建 CSS 设计令牌和 6 个基础 UI 组件

### 文件 1：packages/client/src/styles/tokens.css

```css
:root {
  /* ===== 颜色 - 日间模式 ===== */
  --color-primary: #0f172a;          /* Slate 900 */
  --color-primary-light: #334155;    /* Slate 700 */
  --color-secondary: #64748b;        /* Slate 500 */
  --color-accent: #3b82f6;           /* Blue 500 */
  --color-accent-hover: #2563eb;     /* Blue 600 */
  --color-success: #22c55e;          /* Green 500 */
  --color-warning: #f59e0b;          /* Amber 500 */
  --color-danger: #ef4444;           /* Red 500 */

  --color-page-bg: #f9fafb;         /* Gray 50 */
  --color-card-bg: #ffffff;
  --color-card-border: #e5e7eb;      /* Gray 200 */
  --color-input-bg: #ffffff;
  --color-input-border: #d1d5db;     /* Gray 300 */
  --color-input-focus: #3b82f6;

  --color-text-primary: #0f172a;     /* Slate 900 */
  --color-text-secondary: #64748b;   /* Slate 500 */
  --color-text-muted: #94a3b8;       /* Slate 400 */
  --color-text-inverse: #ffffff;

  /* ===== 间距 ===== */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* ===== 圆角 ===== */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* ===== 字体 ===== */
  --font-sans: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 20px;
  --text-2xl: 24px;

  /* ===== 导航栏 ===== */
  --navbar-height: 64px;

  /* ===== 阴影 ===== */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

  /* ===== 过渡 ===== */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
}
```

### 文件 2：packages/client/src/components/base/TButton.vue

```vue
<script setup lang="ts">
defineProps<{
  type?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
}>();
</script>
```

实现要求：
- 4 种 type 对应不同颜色
- 3 种 size: sm(28px高), md(36px高), lg(44px高)
- loading 时显示旋转图标 + 禁用点击
- 使用 CSS 变量

### 文件 3：packages/client/src/components/base/TCard.vue

```vue
<script setup lang="ts">
defineProps<{
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: boolean;
  hoverable?: boolean;
}>();
</script>
```

实现要求：
- 白色背景（var(--color-card-bg)），圆角 var(--radius-lg)
- padding 选项：none=0, sm=12px, md=16px, lg=24px
- hoverable 时 hover 加阴影提升

### 文件 4：packages/client/src/components/base/TInput.vue

```vue
<script setup lang="ts">
const modelValue = defineModel<string>();
defineProps<{
  placeholder?: string;
  type?: 'text' | 'password' | 'number';
  disabled?: boolean;
  error?: string;
  prefix?: string;
}>();
</script>
```

实现要求：
- 使用 CSS 变量样式
- error 状态时边框变红 + 显示错误文字
- focus 时边框颜色变为 accent

### 文件 5：packages/client/src/components/base/TTag.vue

```vue
<script setup lang="ts">
defineProps<{
  color?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  closable?: boolean;
}>();
defineEmits<{ close: [] }>();
</script>
```

### 文件 6：packages/client/src/components/base/TSpinner.vue

CSS-only 旋转加载指示器。

### 文件 7：packages/client/src/components/base/TSkeleton.vue

```vue
<script setup lang="ts">
defineProps<{
  width?: string;
  height?: string;
  variant?: 'text' | 'circle' | 'rect';
  animated?: boolean;
}>();
</script>
```

骨架屏组件，使用 CSS 动画实现灰色脉冲效果。

### 在 main.ts 中引入 tokens.css

在 `packages/client/src/main.ts` 顶部添加：
```typescript
import './styles/tokens.css';
```

本步骤产出将被步骤 21–42 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 21 — 昼夜主题切换 + Element Plus 主题覆盖

- **依赖步骤**：Step 20
- **产出文件**：`packages/client/src/styles/theme-day.css`、`theme-night.css`、`composables/useTheme.ts`
- **验证**：R — 切换主题后视觉检查

````
你是高级前端工程师。本步骤基于步骤 20 的产出。

请先读取以下文件：
- packages/client/src/styles/tokens.css
- packages/client/src/main.ts

## 任务：实现昼夜模式切换和 Element Plus 主题覆盖

### 文件 1：packages/client/src/styles/theme-day.css

日间模式变量（在 tokens.css 的 :root 基础上不需要重复定义，这里只覆盖 Element Plus 的 CSS 变量）：

```css
:root[data-theme='day'] {
  /* Element Plus 变量覆盖 */
  --el-color-primary: #3b82f6;
  --el-color-primary-light-3: #93bbfd;
  --el-color-primary-light-5: #9dc0fe;
  --el-color-primary-light-7: #bdd5fe;
  --el-color-primary-light-9: #deeaff;
  --el-color-primary-dark-2: #2563eb;
  --el-bg-color: #ffffff;
  --el-bg-color-page: #f9fafb;
  --el-text-color-primary: #0f172a;
  --el-text-color-regular: #334155;
  --el-border-color: #e5e7eb;
  --el-fill-color-light: #f3f4f6;
}
```

### 文件 2：packages/client/src/styles/theme-night.css

夜间模式变量：

```css
:root[data-theme='night'] {
  /* 覆盖 tokens.css 的变量 */
  --color-primary: #e2e8f0;          /* Slate 200 */
  --color-primary-light: #cbd5e1;    /* Slate 300 */
  --color-page-bg: #030712;          /* Gray 950 */
  --color-card-bg: #111827;          /* Gray 900 */
  --color-card-border: #1f2937;      /* Gray 800 */
  --color-input-bg: #1f2937;
  --color-input-border: #374151;     /* Gray 700 */
  --color-text-primary: #e2e8f0;     /* Slate 200 */
  --color-text-secondary: #94a3b8;   /* Slate 400 */
  --color-text-muted: #64748b;       /* Slate 500 */

  /* Element Plus 夜间模式 */
  --el-color-primary: #60a5fa;
  --el-bg-color: #111827;
  --el-bg-color-page: #030712;
  --el-text-color-primary: #e2e8f0;
  --el-text-color-regular: #cbd5e1;
  --el-border-color: #1f2937;
  --el-fill-color-light: #1f2937;
}
```

### 文件 3：packages/client/src/composables/useTheme.ts

```typescript
import { ref, watchEffect } from 'vue';

export type ThemeMode = 'day' | 'night';

const currentTheme = ref<ThemeMode>(
  (localStorage.getItem('theme') as ThemeMode) || 'day'
);

export function useTheme() {
  function setTheme(theme: ThemeMode): void {
    currentTheme.value = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }

  function toggleTheme(): void {
    setTheme(currentTheme.value === 'day' ? 'night' : 'day');
  }

  // 初始化
  watchEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme.value);
  });

  return {
    currentTheme,
    setTheme,
    toggleTheme,
  };
}
```

### 更新 packages/client/src/main.ts

添加主题 CSS 导入：
```typescript
import './styles/tokens.css';
import './styles/theme-day.css';
import './styles/theme-night.css';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
```

本步骤产出将被步骤 22、23 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 22 — SVG 图标精灵系统

- **依赖步骤**：Step 01
- **产出文件**：`packages/client/src/components/SvgIcon.vue`、`packages/client/src/assets/icons.svg`
- **验证**：R — 浏览器中渲染图标

````
你是高级前端工程师。本步骤基于步骤 01 的产出。

请先读取以下文件：
- packages/client/src/main.ts
- packages/client/src/App.vue

## 任务：创建 SVG 图标精灵系统

### 文件 1：packages/client/src/assets/icons.svg

内联 SVG symbol sprite，包含以下所有图标（每个图标 24x24 viewBox）：

必须包含的图标 ID 列表：
- `state-offline` — 断线状态（云+斜线）
- `state-404` — 404 状态（问号+文档）
- `state-empty` — 空状态（空盒子）
- `state-error` — 错误状态（三角感叹号）
- `state-forbidden` — 禁止状态（圆圈+斜线）
- `icon-workshop` — 工坊（扳手+齿轮）
- `icon-editor` — 编辑器（铅笔）
- `icon-room` — 房间（门）
- `icon-market` — 市场（购物袋）
- `icon-ruleset` — 规则集（书本）
- `icon-recruit` — 招募（扩音器）
- `icon-highlight` — 高亮（荧光笔）
- `icon-sun` — 太阳
- `icon-moon` — 月亮
- `icon-send` — 发送（纸飞机）
- `icon-plus` — 加号
- `icon-lock` — 锁
- `icon-list` — 列表
- `icon-history` — 历史（时钟箭头）
- `icon-broadcast` — 广播（喇叭）
- `icon-dice` — 骰子
- `icon-grid` — 网格
- `icon-clock` — 时钟
- `icon-npc` — NPC（人形剪影）
- `icon-palette` — 调色板
- `icon-scroll` — 卷轴
- `icon-settings` — 设置（齿轮）

每个 symbol 使用简洁的 path 绘制，保持一致的线条粗细（stroke-width: 2, stroke-linecap: round, stroke-linejoin: round）。

### 文件 2：packages/client/src/components/SvgIcon.vue

```vue
<script setup lang="ts">
defineProps<{
  name: string;        // 图标名称，对应 symbol ID
  size?: number;       // 像素大小，默认 24
  color?: string;      // 颜色，默认 currentColor
}>();
</script>

<template>
  <svg
    :width="size ?? 24"
    :height="size ?? 24"
    :style="{ color: color }"
    class="svg-icon"
    aria-hidden="true"
  >
    <use :href="`#${name}`" />
  </svg>
</template>

<style scoped>
.svg-icon {
  display: inline-block;
  vertical-align: middle;
  fill: none;
  stroke: currentColor;
}
</style>
```

### 文件 3：packages/client/src/components/IconSprite.vue

在 App 根级注入 SVG sprite：

```vue
<script setup lang="ts">
import iconsRaw from '../assets/icons.svg?raw';
</script>

<template>
  <div v-html="iconsRaw" style="display:none" />
</template>
```

### 更新 packages/client/src/App.vue

在模板中添加 `<IconSprite />`：

```vue
<script setup lang="ts">
import IconSprite from './components/IconSprite.vue';
</script>
<template>
  <IconSprite />
  <router-view />
</template>
```

本步骤产出将被步骤 23–42 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 23 — App Shell + Vue Router + 底部导航 + Pinia 骨架

- **依赖步骤**：Step 20, 21, 22
- **产出文件**：`packages/client/src/router/index.ts`、`stores/auth-store.ts`、`stores/campaign-store.ts`、`layouts/MainLayout.vue`、`layouts/BottomNav.vue`、更新 `App.vue`、`main.ts`
- **验证**：C — `pnpm --filter @trpg/client build`

````
你是高级前端工程师。本步骤基于步骤 20、21、22 的产出。

请先读取以下文件：
- packages/client/src/main.ts
- packages/client/src/App.vue
- packages/client/src/composables/useTheme.ts
- packages/client/src/components/SvgIcon.vue

## 任务：搭建路由、Pinia store 骨架、布局组件

### 文件 1：packages/client/src/router/index.ts

```typescript
import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'Home', component: () => import('../views/Home.vue') },
      { path: 'assets', name: 'AssetLibrary', component: () => import('../views/AssetLibrary.vue') },
      { path: 'campaigns', name: 'MyCampaigns', component: () => import('../views/MyCampaigns.vue') },
      { path: 'community', name: 'Community', component: () => import('../views/Community.vue') },
      { path: 'personal', name: 'Personal', component: () => import('../views/Personal.vue') },
    ],
  },
  {
    path: '/room/:id',
    name: 'Room',
    component: () => import('../views/Room.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/character/editor/:id?',
    name: 'CharacterEditor',
    component: () => import('../views/CharacterEditor.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/creator',
    name: 'CreatorDashboard',
    component: () => import('../views/CreatorDashboard.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫：检查 auth
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token');
  if (to.meta.requiresAuth && !token) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
  } else {
    next();
  }
});

export default router;
```

每个 `import('../views/Xxx.vue')` 对应的 Vue 文件如果不存在，先创建最小占位：

```vue
<script setup lang="ts">
</script>
<template>
  <div>页面名称</div>
</template>
```

需要创建的占位页面：`Home.vue`, `AssetLibrary.vue`, `MyCampaigns.vue`, `Community.vue`, `Personal.vue`, `Room.vue`, `CharacterEditor.vue`, `CreatorDashboard.vue`, `Login.vue`

### 文件 2：packages/client/src/stores/auth-store.ts

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem('token') || '');
  const userId = ref<string>('');
  const nickname = ref<string>('');
  const avatarUrl = ref<string>('');

  const isLoggedIn = computed(() => !!token.value);

  function setAuth(data: { token: string; userId: string; nickname: string; avatarUrl?: string }): void {
    token.value = data.token;
    userId.value = data.userId;
    nickname.value = data.nickname;
    avatarUrl.value = data.avatarUrl || '';
    localStorage.setItem('token', data.token);
  }

  function logout(): void {
    token.value = '';
    userId.value = '';
    nickname.value = '';
    avatarUrl.value = '';
    localStorage.removeItem('token');
  }

  return { token, userId, nickname, avatarUrl, isLoggedIn, setAuth, logout };
});
```

### 文件 3：packages/client/src/stores/campaign-store.ts

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Campaign, Scene } from '@trpg/shared';

export const useCampaignStore = defineStore('campaign', () => {
  const currentCampaign = ref<Campaign | null>(null);
  const scenes = ref<Scene[]>([]);
  const myCampaigns = ref<Campaign[]>([]);

  function setCurrentCampaign(campaign: Campaign): void {
    currentCampaign.value = campaign;
  }
  function setScenes(s: Scene[]): void {
    scenes.value = s;
  }
  function setMyCampaigns(campaigns: Campaign[]): void {
    myCampaigns.value = campaigns;
  }
  function clear(): void {
    currentCampaign.value = null;
    scenes.value = [];
  }

  return { currentCampaign, scenes, myCampaigns, setCurrentCampaign, setScenes, setMyCampaigns, clear };
});
```

### 文件 4：packages/client/src/layouts/MainLayout.vue

主布局：顶部标题栏 + 中间内容 + 底部导航。

```vue
<script setup lang="ts">
import BottomNav from './BottomNav.vue';
import { useTheme } from '../composables/useTheme';
import SvgIcon from '../components/SvgIcon.vue';

const { currentTheme, toggleTheme } = useTheme();
</script>

<template>
  <div class="main-layout">
    <header class="top-bar">
      <span class="logo">TRPG</span>
      <button class="theme-toggle" @click="toggleTheme">
        <SvgIcon :name="currentTheme === 'day' ? 'icon-moon' : 'icon-sun'" :size="20" />
      </button>
    </header>
    <main class="content">
      <router-view />
    </main>
    <BottomNav />
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--color-page-bg);
}
.top-bar {
  height: var(--navbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
  background: var(--color-card-bg);
  border-bottom: 1px solid var(--color-card-border);
}
.content {
  flex: 1;
  padding: var(--space-4);
  overflow-y: auto;
}
</style>
```

### 文件 5：packages/client/src/layouts/BottomNav.vue

底部导航栏，5 个 tab 对应 D5 设计：首页、素材库、我的团、社区、个人中心。

```vue
<script setup lang="ts">
import { useRoute } from 'vue-router';
import SvgIcon from '../components/SvgIcon.vue';

const route = useRoute();

const tabs = [
  { name: 'Home', label: '首页', icon: 'icon-room', path: '/' },
  { name: 'AssetLibrary', label: '素材库', icon: 'icon-ruleset', path: '/assets' },
  { name: 'MyCampaigns', label: '我的团', icon: 'icon-list', path: '/campaigns' },
  { name: 'Community', label: '社区', icon: 'icon-recruit', path: '/community' },
  { name: 'Personal', label: '我', icon: 'icon-settings', path: '/personal' },
];
</script>

<template>
  <nav class="bottom-nav">
    <router-link
      v-for="tab in tabs"
      :key="tab.name"
      :to="tab.path"
      class="nav-item"
      :class="{ active: route.name === tab.name }"
    >
      <SvgIcon :name="tab.icon" :size="22" />
      <span class="nav-label">{{ tab.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.bottom-nav {
  display: flex;
  height: 56px;
  background: var(--color-card-bg);
  border-top: 1px solid var(--color-card-border);
}
.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-decoration: none;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  transition: color var(--transition-fast);
}
.nav-item.active {
  color: var(--color-accent);
}
</style>
```

### 更新 packages/client/src/main.ts

```typescript
import './styles/tokens.css';
import './styles/theme-day.css';
import './styles/theme-night.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ElementPlus);
app.mount('#app');
```

### 更新 packages/client/src/App.vue

```vue
<script setup lang="ts">
import IconSprite from './components/IconSprite.vue';
</script>
<template>
  <IconSprite />
  <router-view />
</template>
```

本步骤产出将被步骤 24–42 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

### Phase 5：页面模块

---

#### Step 24 — 首页

- **依赖步骤**：Step 23
- **产出文件**：`packages/client/src/views/Home.vue`
- **验证**：R — 浏览器查看首页布局

````
你是高级前端工程师。本步骤基于步骤 23 的产出。

请先读取以下文件：
- packages/client/src/views/Home.vue（当前占位）
- packages/client/src/components/base/TCard.vue
- packages/client/src/components/base/TButton.vue
- packages/client/src/components/SvgIcon.vue
- packages/client/src/stores/auth-store.ts
- packages/client/src/stores/campaign-store.ts

## 任务：实现首页

首页包含以下区域：

1. **快速入团卡片区** — 横向滚动，显示用户最近参与的团（最多 5 个）。每张卡片显示：团名、状态标签（preparing/running/paused/ended）、房间代码、GM 名称。点击进入团房间。

2. **推荐内容** — 2-3 张卡片，分别推荐：热门规则集、热门模组、近期招募帖。使用 TCard 组件。

3. **动态流** — 简易的活动时间线，显示最近活动（占位数据）。每条动态：头像 + 昵称 + 动作描述 + 时间。

实现要求：
- 使用 `<script setup lang="ts">` + Composition API
- 数据暂用 mock/ref 占位，后续步骤对接真实 API
- 响应式：桌面端（≥1024px）网格布局，移动端（<768px）单列堆叠
- 未登录时显示登录引导

严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 25 — 素材库页面

- **依赖步骤**：Step 23
- **产出文件**：`packages/client/src/views/AssetLibrary.vue`、`views/asset/DiscoverTab.vue`、`views/asset/MyAssetsTab.vue`
- **验证**：R — 浏览器查看

````
你是高级前端工程师。本步骤基于步骤 23 的产出。

请先读取以下文件：
- packages/client/src/views/AssetLibrary.vue（当前占位）
- packages/client/src/components/base/TCard.vue
- packages/client/src/components/base/TTag.vue
- packages/client/src/components/base/TInput.vue
- packages/shared/src/types/index.ts（获取 Ruleset 接口）

## 任务：实现素材库页面

素材库页面包含两个 tab：

### Tab 1：发现（DiscoverTab.vue）
- 搜索框（TInput）
- 分类筛选标签：规则集、模组、全部
- 卡片网格列表，每张卡片：名称、版本、状态标签（draft/published）、简介
- 分页

### Tab 2：我的素材（MyAssetsTab.vue）
- 我创建的规则集列表
- 我创建的模组列表
- 每项显示：名称、版本、状态、最后更新时间
- 操作按钮：编辑、发布

### AssetLibrary.vue
使用 Element Plus 的 `el-tabs` 实现 tab 切换。

数据暂用 mock 占位。

严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 26 — 我的团页面

- **依赖步骤**：Step 23
- **产出文件**：`packages/client/src/views/MyCampaigns.vue`
- **验证**：R — 浏览器查看

````
你是高级前端工程师。本步骤基于步骤 23 的产出。

请先读取以下文件：
- packages/client/src/views/MyCampaigns.vue（当前占位）
- packages/client/src/components/base/TCard.vue
- packages/client/src/components/base/TButton.vue
- packages/client/src/components/base/TInput.vue
- packages/client/src/components/base/TTag.vue
- packages/client/src/stores/campaign-store.ts
- packages/shared/src/types/index.ts（获取 Campaign, CampaignStatus）

## 任务：实现我的团页面

### 功能：

1. **团列表** — 卡片列表展示用户参与的所有团。每张卡片：
   - 团名
   - 状态标签（preparing=准备中/running=进行中/paused=暂停/ended=已结束），不同颜色
   - 房间代码（可点击复制）
   - 身份标识（GM/Player）
   - 点击进入房间

2. **创建团表单** — 弹窗/抽屉，字段：
   - 团名（必填，最长 128 字符）
   - 选择规则集（下拉，从 API 获取）
   - 选择模组（可选）
   - 创建按钮

3. **加入团** — 输入 6 位房间代码（字符集 `ABCDEFGHJKLMNPQRSTUVWXY23456789`），验证格式后请求加入。

数据暂用 mock 占位。

严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 27 — 社区 - 招募板

- **依赖步骤**：Step 23
- **产出文件**：`packages/client/src/views/Community.vue`、`views/community/RecruitmentBoard.vue`
- **验证**：R — 浏览器查看

````
你是高级前端工程师。本步骤基于步骤 23 的产出。

请先读取以下文件：
- packages/client/src/views/Community.vue（当前占位）
- packages/client/src/components/base/TCard.vue
- packages/client/src/components/base/TButton.vue
- packages/client/src/components/base/TTag.vue
- packages/shared/src/types/index.ts（获取 RecruitmentPost, RecruitmentType, RecruitmentStatus）

## 任务：实现社区招募板页面

### 功能：

1. **Tab 切换**：
   - "找团"（type = gm_recruit）— 查看 GM 发布的招募帖
   - "找玩家"（type = player_seek）— 查看玩家发布的求组帖

2. **帖子列表** — 每个帖子卡片显示：
   - 标题
   - 发布者昵称
   - 规则集名称
   - 需求人数（player_count_max）
   - 状态标签（open=招募中/closed=已关闭/full=已满员）
   - 发布时间

3. **筛选** — 按状态筛选（全部/招募中/已满员）

4. **发布帖子表单** — 弹窗，字段：
   - 类型（gm_recruit/player_seek）
   - 标题（必填）
   - 规则集（下拉选择）
   - 关联团（可选，gm_recruit 时可选）
   - 最大人数
   - 发布按钮

数据暂用 mock 占位。

严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 28 — 个人中心

- **依赖步骤**：Step 23
- **产出文件**：`packages/client/src/views/Personal.vue`
- **验证**：R — 浏览器查看

````
你是高级前端工程师。本步骤基于步骤 23 的产出。

请先读取以下文件：
- packages/client/src/views/Personal.vue（当前占位）
- packages/client/src/stores/auth-store.ts
- packages/client/src/composables/useTheme.ts
- packages/client/src/components/SvgIcon.vue
- packages/shared/src/types/index.ts（获取 User 接口）

## 任务：实现个人中心页面

### 功能：

1. **用户信息卡片** — 头像、昵称、UID、订阅类型（free/pro/creator）、创作者等级

2. **资料编辑** — 点击编辑按钮进入编辑模式：
   - 修改昵称
   - 修改头像（URL 输入）
   - 保存按钮

3. **功能入口列表**：
   - 通知中心（icon-broadcast）
   - 私信（icon-send）
   - 主题切换（icon-sun/icon-moon，调用 useTheme）
   - 创作者后台（icon-workshop，仅 creator 类型显示）
   - 设置（icon-settings）
   - 退出登录

4. **货币显示** — 显示当前 coins 余额

数据暂用 mock 占位。

严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 29 — 创作者后台

- **依赖步骤**：Step 23
- **产出文件**：`packages/client/src/views/CreatorDashboard.vue`
- **验证**：R — 浏览器查看

````
你是高级前端工程师。本步骤基于步骤 23 的产出。

请先读取以下文件：
- packages/client/src/views/CreatorDashboard.vue（当前占位）
- packages/client/src/components/base/TCard.vue
- packages/client/src/components/base/TButton.vue
- packages/client/src/stores/auth-store.ts

## 任务：实现创作者后台页面

### 功能：

1. **数据看板卡片** — 4 张统计卡片：
   - 作品数量（规则集 + 模组）
   - 总下载量
   - 本月收入
   - 订阅者数

2. **订单列表** — 表格，列：
   - 订单号
   - 商品名称
   - 买家
   - 金额
   - 时间
   - 状态

3. **提现区** — 显示可提现余额 + 提现按钮

数据全部使用 mock 占位。此页面仅 creator 用户可见（路由守卫在 Step 23 已处理）。

严格按照要求实现，不要添加任何文档未提及的功能。
````

### Phase 6：团房间

---

#### Step 30 — 房间布局壳

- **依赖步骤**：Step 23, 19
- **产出文件**：`packages/client/src/views/Room.vue`、`layouts/RoomLayout.vue`
- **验证**：R — 浏览器查看三栏布局

````
你是高级前端工程师。本步骤基于步骤 23、19 的产出。

请先读取以下文件：
- packages/client/src/views/Room.vue（当前占位）
- packages/client/src/stores/campaign-store.ts
- packages/client/src/stores/auth-store.ts
- packages/client/src/socket/socket-client.ts
- packages/client/src/composables/useTheme.ts
- packages/client/src/components/SvgIcon.vue
- packages/shared/src/types/index.ts（获取 Campaign, Scene）

## 任务：实现团房间布局

参考 D5 设计：左导航(240px) + 中央聊天区 + 右助手台(320px，可折叠)。

### 文件 1：packages/client/src/layouts/RoomLayout.vue

```vue
<script setup lang="ts">
import { ref } from 'vue';

const leftSidebarVisible = ref(true);
const rightDeskVisible = ref(true);

function toggleLeftSidebar() { leftSidebarVisible.value = !leftSidebarVisible.value; }
function toggleRightDesk() { rightDeskVisible.value = !rightDeskVisible.value; }
</script>
```

布局结构：
- 顶部栏(64px)：团名、房间代码（可复制）、在线人数、GM 控制台入口按钮（仅 GM 可见）、侧边栏切换按钮
- 左侧边栏(240px)：slot `left-sidebar`
- 中央区域(flex: 1)：slot `chat-area`
- 右侧助手台(320px)：slot `right-desk`
- 左侧和右侧可折叠（CSS transition，宽度变为 0）

CSS 要求：
- 使用 CSS Grid 或 Flexbox
- 桌面端（≥1024px）：三栏布局
- 平板端（768-1023px）：隐藏右侧助手台，点击按钮展开为浮层
- 移动端（<768px）：只显示中央区域，左右为浮层。底部显示快捷栏 [骰子][角色卡][命令][更多]

### 文件 2：packages/client/src/views/Room.vue

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import RoomLayout from '../layouts/RoomLayout.vue';
import { useCampaignStore } from '../stores/campaign-store';
import { useAuthStore } from '../stores/auth-store';
import { socketClient } from '../socket/socket-client';

const route = useRoute();
const campaignStore = useCampaignStore();
const authStore = useAuthStore();

const campaignId = route.params.id as string;

onMounted(async () => {
  // 1. 获取团信息（TODO: 调用 API）
  // 2. 连接 Socket
  socketClient.setToken(authStore.token);
  socketClient.connectRoom();
  socketClient.joinRoom(campaignId, ''); // characterId 后续完善
});

onUnmounted(() => {
  socketClient.leaveRoom();
  socketClient.disconnect();
});
</script>

<template>
  <RoomLayout>
    <template #left-sidebar>
      <!-- Step 31 实现 -->
      <div>左侧边栏占位</div>
    </template>
    <template #chat-area>
      <!-- Step 32 实现 -->
      <div>聊天区域占位</div>
    </template>
    <template #right-desk>
      <!-- Step 33 实现 -->
      <div>助手台占位</div>
    </template>
  </RoomLayout>
</template>
```

### 移动端底部快捷栏

在 RoomLayout 中，当 `window.innerWidth < 768` 时显示底部快捷栏：

```html
<div class="mobile-quick-bar">
  <button><SvgIcon name="icon-dice" /><span>骰子</span></button>
  <button><SvgIcon name="icon-scroll" /><span>角色卡</span></button>
  <button><SvgIcon name="icon-list" /><span>命令</span></button>
  <button><SvgIcon name="icon-settings" /><span>更多</span></button>
</div>
```

本步骤产出将被步骤 31–34 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 31 — 左侧边栏

- **依赖步骤**：Step 30
- **产出文件**：`packages/client/src/components/room/LeftSidebar.vue`
- **验证**：R — 浏览器查看

````
你是高级前端工程师。本步骤基于步骤 30 的产出。

请先读取以下文件：
- packages/client/src/views/Room.vue
- packages/client/src/layouts/RoomLayout.vue
- packages/client/src/stores/campaign-store.ts
- packages/client/src/components/SvgIcon.vue
- packages/shared/src/types/index.ts（获取 Scene, SceneType, CharacterSceneState）

## 任务：实现左侧边栏

### 文件：packages/client/src/components/room/LeftSidebar.vue

包含 3 个可折叠区域：

1. **场景导航**
   - 列出当前团的所有场（Scene）
   - 按类型分组：空间场(spatial) / 虚拟场(virtual) / 大厅(lobby)
   - 当前所在场高亮
   - 每个场显示：名称、类型图标、在线人数
   - 点击切换场

2. **路线图**（仅当 campaign.enable_scene_connections 为 true 时显示）
   - 简单的文本列表，显示场之间的连接关系
   - 格式：「场A → 场B (步行 30分钟)」

3. **角色列表**
   - 显示当前场中的所有角色
   - 每个角色：头像、名称、所在场名称
   - 在线状态指示（绿色/灰色小圆点）

Props：
```typescript
defineProps<{
  scenes: Scene[];
  currentSceneId: string;
  characters: { id: string; name: string; avatarUrl: string; sceneId: string; online: boolean }[];
  connections: { from: string; to: string; walkDuration: number }[];
  enableConnections: boolean;
}>();

defineEmits<{
  'scene-select': [sceneId: string];
}>();
```

数据暂用 mock 占位。

### 更新 Room.vue

将左侧边栏占位替换为 `<LeftSidebar />`，传入 mock 数据。

本步骤产出将被步骤 32 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 32 — 聊天区域

- **依赖步骤**：Step 30, 19
- **产出文件**：`packages/client/src/components/room/ChatArea.vue`、`room/MessageItem.vue`、`room/ChatInput.vue`
- **验证**：R — 浏览器查看聊天界面

````
你是高级前端工程师。本步骤基于步骤 30、19 的产出。

请先读取以下文件：
- packages/client/src/views/Room.vue
- packages/client/src/stores/message-store.ts（获取 useMessageStore, LocalMessage, MessageSendStatus）
- packages/client/src/socket/socket-client.ts（获取 socketClient）
- packages/shared/src/types/index.ts（获取 ChatMessage, MessageType）

## 任务：实现聊天区域

### 文件 1：packages/client/src/components/room/MessageItem.vue

消息气泡组件，根据 message_type 渲染不同样式：

```typescript
defineProps<{
  message: LocalMessage;
  isOwn: boolean;    // 是否自己发的
}>();
```

渲染规则：
- `narrative`：正常聊天气泡，左侧头像+昵称+内容。自己的消息靠右
- `dice`：特殊骰子结果卡片，显示表达式和结果。使用 SvgIcon `icon-dice`
- `ooc`：灰色斜体文字，前缀 [OOC]
- `system`：居中小字灰色文字
- `announcement`：全宽黄色背景横幅
- `clue_card`：线索卡片样式（Step 35 完善，此处先用占位卡片）

发送状态显示：
- `pending`：消息右下角显示时钟图标
- `sent`：无特殊标记
- `failed`：消息右下角显示红色感叹号，点击可重试

### 文件 2：packages/client/src/components/room/ChatInput.vue

聊天输入区域：

```typescript
const emit = defineEmits<{
  'send': [content: string, messageType: string];
  'command': [commandStr: string];
}>();
```

功能：
- 文本输入框（支持多行，Shift+Enter 换行，Enter 发送）
- 消息类型选择器：叙述(narrative)、OOC(ooc)
- 发送按钮（SvgIcon `icon-send`）
- 骰子快捷面板按钮（SvgIcon `icon-dice`），点击展开常用骰子快捷键：
  - 1d20、1d100、2d6、3d6、自定义输入
  - 点击后直接发送 `/roll Xd6` 格式命令
- 命令识别：输入 `/` 开头时自动提示可用命令

### 文件 3：packages/client/src/components/room/ChatArea.vue

组合消息列表 + 输入框：

```vue
<script setup lang="ts">
import { ref, nextTick, watch, onMounted } from 'vue';
import MessageItem from './MessageItem.vue';
import ChatInput from './ChatInput.vue';
import { useMessageStore } from '../../stores/message-store';
import { useAuthStore } from '../../stores/auth-store';
import { socketClient } from '../../socket/socket-client';
import { v4 as uuidv4 } from 'uuid';

const messageStore = useMessageStore();
const authStore = useAuthStore();
const listRef = ref<HTMLElement>();

// 自动滚动到底部
watch(() => messageStore.currentMessages.length, async () => {
  await nextTick();
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight;
  }
});

function handleSend(content: string, messageType: string) {
  const tempId = uuidv4();
  messageStore.addPendingMessage(content, tempId, messageType);
  socketClient.sendMessage(content, { tempId, messageType });
}

function handleCommand(commandStr: string) {
  // 命令也作为消息发送，服务端处理
  const tempId = uuidv4();
  messageStore.addPendingMessage(commandStr, tempId, 'narrative');
  socketClient.sendMessage(commandStr, { tempId });
}

// 监听服务端消息
onMounted(() => {
  socketClient.onNewMessage((msg) => {
    messageStore.addServerMessage(msg);
  });
  socketClient.onMissedMessages((data) => {
    messageStore.addMissedMessages(data.messages);
  });
});
</script>

<template>
  <div class="chat-area">
    <div ref="listRef" class="message-list">
      <MessageItem
        v-for="msg in messageStore.currentMessages"
        :key="msg.id || msg._tempId"
        :message="msg"
        :is-own="msg.sender_user_id === authStore.userId"
      />
    </div>
    <ChatInput @send="handleSend" @command="handleCommand" />
  </div>
</template>

<style scoped>
.chat-area {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}
</style>
```

### 更新 Room.vue

将聊天区域占位替换为 `<ChatArea />`。

本步骤产出将被步骤 33、35 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 33 — 助手台

- **依赖步骤**：Step 30
- **产出文件**：`packages/client/src/components/room/AssistantDesk.vue`
- **验证**：R — 浏览器查看

````
你是高级前端工程师。本步骤基于步骤 30 的产出。

请先读取以下文件：
- packages/client/src/views/Room.vue
- packages/client/src/layouts/RoomLayout.vue
- packages/client/src/components/SvgIcon.vue
- packages/shared/src/types/index.ts（获取 CharacterCard, CharacterInstance）

## 任务：实现右侧助手台

### 文件：packages/client/src/components/room/AssistantDesk.vue

右侧助手台（320px 宽），包含多个可切换的面板（使用 tab 或手风琴）：

1. **角色卡摘要** — 显示当前所选角色的关键信息：
   - 名称、头像
   - 核心属性（key-value 列表）
   - 核心技能（前 5 个，按值排序）
   - 资源条（如生命值、魔法值等，用进度条显示 current/max）
   - 临时效果列表

2. **命令参考** — 可用命令列表：
   - 命令名称 + 简要说明
   - 点击自动填入输入框

3. **骰子历史** — 最近 20 次骰子结果：
   - 表达式 + 结果 + 时间
   - 使用 SvgIcon `icon-dice` 和 `icon-history`

4. **GM 广播** (仅 GM 可见) — 快捷发送 announcement 类型消息

Props：
```typescript
defineProps<{
  character?: CharacterCard;
  commands: { name: string; description: string }[];
  diceHistory: { expression: string; result: number; time: string }[];
  isGm: boolean;
}>();

defineEmits<{
  'fill-command': [command: string];
  'broadcast': [content: string];
}>();
```

数据暂用 mock 占位。

### 更新 Room.vue

将助手台占位替换为 `<AssistantDesk />`。

本步骤产出将被步骤 34 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 34 — GM 控制台

- **依赖步骤**：Step 30, 13
- **产出文件**：`packages/client/src/components/room/GMConsole.vue`
- **验证**：R — 浏览器查看

````
你是高级前端工程师。本步骤基于步骤 30、13 的产出。

请先读取以下文件：
- packages/client/src/views/Room.vue
- packages/client/src/layouts/RoomLayout.vue
- packages/client/src/socket/socket-client.ts（获取 gmAdvanceTime, gmApproveMove, gmRejectMove）
- packages/shared/src/types/index.ts（获取 StoryTime, ScheduledMove, CampaignNpc, Scene）
- packages/shared/src/types/events.ts（获取 gm_advance_time, gm_approve_move, gm_reject_move 事件格式）

## 任务：实现 GM 控制台

GM 控制台为顶部下拉面板，仅当用户是 GM 时可见。使用 tab 切换以下功能区：

### Tab 1：时间控制（icon-clock）
- 显示当前全局故事时间（Day X, HH:MM）
- 快捷按钮：+10分钟、+30分钟、+1小时、+6小时、+1天
- 自定义时间输入（day, hour, minute 三个数字输入框）
- "推进时间" 按钮，调用 `socketClient.gmAdvanceTime()`
- 时间推进后触发的预约移动列表预览

### Tab 2：待审批移动（icon-list）
- 列出所有 status='pending' 的 ScheduledMove
- 每项显示：角色名、目标场名、计划到达时间
- 操作按钮：批准（icon-plus 绿色）、拒绝（icon-lock 红色）
- 批准时可修改执行时间
- 调用 `socketClient.gmApproveMove()` / `socketClient.gmRejectMove()`

### Tab 3：场管理（icon-grid）
- 场列表（可编辑名称）
- 新建场按钮
- 删除场（需确认）
- 场连接管理（当 enable_scene_connections 为 true）

### Tab 4：NPC 控制（icon-npc）
- NPC 列表，每项：名称、显示名、头像、活跃状态
- 新建 NPC 表单（名称、显示名、描述、voice_tips、属性、技能）
- 编辑/删除 NPC
- 切换 NPC 活跃状态（is_active）
- 设置 NPC 为可扮演（is_playable）

### Tab 5：线索库（icon-scroll）
- 线索卡片列表（线索内容 + 主题 + 是否已发放）
- 发放线索按钮（选择目标角色，发送 clue_card 消息）
- 此处为管理界面，实际渲染在 Step 35

### Props

```typescript
defineProps<{
  campaignId: string;
  globalStoryTime: StoryTime;
  pendingMoves: ScheduledMove[];
  scenes: Scene[];
  npcs: CampaignNpc[];
  enableConnections: boolean;
}>();
```

数据暂用 mock 占位，但 Socket 调用使用真实的 socketClient 方法。

### 更新 Room.vue / RoomLayout.vue

在顶部栏添加 "GM 控制台" 按钮（仅 GM 可见），点击展开/收起 GMConsole 面板。

本步骤产出将被步骤 35 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

### Phase 7：高级功能

---

#### Step 35 — 线索系统 + CSS 文字艺术主题

- **依赖步骤**：Step 32
- **产出文件**：`packages/client/src/components/ClueCard.vue`、`packages/client/src/styles/text-art.css`
- **验证**：R — 浏览器查看 8 种主题效果

````
你是高级前端工程师，精通 CSS 动画和视觉效果。本步骤基于步骤 32 的产出。

请先读取以下文件：
- packages/client/src/components/room/MessageItem.vue（需要在 clue_card 类型渲染时使用 ClueCard）
- packages/client/src/styles/tokens.css
- packages/shared/src/types/index.ts（获取 ThemeType）

## 任务：实现线索卡片和 8 种 CSS 文字艺术主题

### 文件 1：packages/client/src/styles/text-art.css

实现 8 种文字艺术主题，每种主题通过 CSS class 应用到文字上。D8 定义的 8 种主题：

```css
/* ===== 1. river - 流水主题 ===== */
/* 文字颜色渐变流动效果，蓝绿色系 */
.text-art-river {
  background: linear-gradient(90deg, #0ea5e9, #06b6d4, #14b8a6, #0ea5e9);
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: river-flow 3s linear infinite;
}
@keyframes river-flow {
  0% { background-position: 0% center; }
  100% { background-position: 200% center; }
}

/* ===== 2. blur - 模糊主题 ===== */
/* 文字从模糊到清晰，适用于谜题线索 */
.text-art-blur {
  animation: blur-reveal 2s ease forwards;
  color: var(--color-text-primary);
}
@keyframes blur-reveal {
  0% { filter: blur(8px); opacity: 0.3; }
  100% { filter: blur(0); opacity: 1; }
}

/* ===== 3. fragment - 碎片主题 ===== */
/* 文字逐字出现，打字机效果 */
.text-art-fragment {
  overflow: hidden;
  border-right: 2px solid var(--color-accent);
  white-space: nowrap;
  animation: fragment-type 2s steps(40) forwards, fragment-blink 0.5s step-end infinite alternate;
}
@keyframes fragment-type {
  0% { width: 0; }
  100% { width: 100%; }
}
@keyframes fragment-blink {
  50% { border-color: transparent; }
}

/* ===== 4. wave - 波浪主题 ===== */
/* 文字上下波动 */
.text-art-wave span {
  display: inline-block;
  animation: wave-float 1.5s ease-in-out infinite;
}
.text-art-wave span:nth-child(2n) {
  animation-delay: 0.1s;
}

@keyframes wave-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

/* ===== 5. ancient - 古卷主题 ===== */
/* 羊皮纸风格，褐色文字，做旧效果 */
.text-art-ancient {
  color: #78350f;
  font-family: 'Georgia', 'SimSun', serif;
  text-shadow: 1px 1px 2px rgba(120, 53, 15, 0.3);
  background: linear-gradient(to bottom, #fef3c7, #fde68a);
  padding: 12px 16px;
  border: 1px solid #d97706;
  border-radius: var(--radius-md);
  position: relative;
}
.text-art-ancient::before {
  content: '';
  position: absolute;
  inset: 0;
  background: url("data:image/svg+xml,...") repeat; /* 做旧纹理 */
  opacity: 0.1;
  pointer-events: none;
}

/* ===== 6. blood - 血迹主题 ===== */
/* 红色滴落效果，适用于恐怖场景 */
.text-art-blood {
  color: #dc2626;
  text-shadow: 0 0 4px rgba(220, 38, 38, 0.5), 0 2px 8px rgba(220, 38, 38, 0.3);
  font-weight: bold;
  animation: blood-drip 0.5s ease-out;
}
@keyframes blood-drip {
  0% { transform: translateY(-10px); opacity: 0; }
  60% { transform: translateY(2px); }
  100% { transform: translateY(0); opacity: 1; }
}

/* ===== 7. ash - 灰烬主题 ===== */
/* 文字灰色，粒子飘散效果 */
.text-art-ash {
  color: #6b7280;
  text-shadow: 0 0 3px rgba(107, 114, 128, 0.5);
  animation: ash-fade 3s ease forwards;
}
@keyframes ash-fade {
  0% { opacity: 0; filter: blur(2px); }
  30% { opacity: 1; filter: blur(0); }
  100% { opacity: 0.8; }
}

/* ===== 8. cyber - 赛博主题 ===== */
/* 霓虹闪烁效果，绿色/紫色 */
.text-art-cyber {
  color: #22d3ee;
  text-shadow: 0 0 5px #22d3ee, 0 0 10px #a855f7, 0 0 20px #22d3ee;
  font-family: var(--font-mono);
  animation: cyber-flicker 2s infinite;
}
@keyframes cyber-flicker {
  0%, 100% { opacity: 1; }
  92% { opacity: 1; }
  93% { opacity: 0.3; }
  94% { opacity: 1; }
  96% { opacity: 0.5; }
  97% { opacity: 1; }
}
```

### 文件 2：packages/client/src/components/ClueCard.vue

线索卡片组件：

```vue
<script setup lang="ts">
import type { ThemeType } from '@trpg/shared';

defineProps<{
  title: string;
  content: string;
  theme: ThemeType;   // 'river'|'blur'|'fragment'|'wave'|'ancient'|'blood'|'ash'|'cyber'
  senderName?: string;
}>();
</script>

<template>
  <div class="clue-card" :class="`clue-theme-${theme}`">
    <div class="clue-header">
      <SvgIcon name="icon-scroll" :size="16" />
      <span class="clue-label">线索</span>
      <span v-if="senderName" class="clue-sender">来自 {{ senderName }}</span>
    </div>
    <div class="clue-title">{{ title }}</div>
    <div class="clue-content" :class="`text-art-${theme}`">
      {{ content }}
    </div>
  </div>
</template>
```

样式：卡片有边框，背景半透明，hover 时轻微浮起。不同 theme 影响内容区文字样式。

### 更新 packages/client/src/components/room/MessageItem.vue

在 `message_type === 'clue_card'` 分支中，从 `message.metadata` 中解析 `{ title, content, theme }` 并渲染 `<ClueCard />`。

### 在 main.ts 中引入 text-art.css

```typescript
import './styles/text-art.css';
```

本步骤产出将被步骤 39 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 36 — 角色卡编辑器 + CSON 导入导出

- **依赖步骤**：Step 14, 23
- **产出文件**：`packages/client/src/views/CharacterEditor.vue`、`packages/shared/src/utils/cson.ts`
- **验证**：T — `pnpm --filter @trpg/shared test -- cson`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 14、23 的产出。

请先读取以下文件：
- packages/client/src/views/CharacterEditor.vue（当前占位）
- packages/shared/src/types/index.ts（获取 CharacterSheet, CharacterCard）
- packages/client/src/stores/auth-store.ts

## 任务：实现角色卡编辑器和 CSON 格式

### 文件 1：packages/shared/src/utils/cson.ts

CSON (Character Sheet Object Notation) 格式，参考 D12 设计：

```typescript
/** CSON 文档结构 */
export interface CSONDocument {
  schema_version: '1.0';
  meta: CSONMetadata;
  character: CSONCharacter;
  source?: CSONSource;
}

export interface CSONMetadata {
  created_at: string;       // ISO 8601
  exported_by: string;      // 用户昵称
  platform_version: string;
}

export interface CSONCharacter {
  name: string;
  ruleset_ref: string;      // 规则集 ID
  occupation_id?: string;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, { current: number; max: number }>;
  equipment: string[];
  background?: string;
  avatar_custom_data?: object;
}

export interface CSONSource {
  campaign_id?: string;
  character_code?: string;
}

/**
 * 将 CharacterSheet 导出为 CSON JSON 字符串
 */
export function exportCSON(sheet: {
  name: string;
  ruleset_id: string;
  occupation_id?: string | null;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  derived_max: Record<string, { current: number; max: number }>;
  equipment: string[];
  background?: string;
  avatar_custom_data?: object | null;
  character_code?: string;
}, exporterName: string): string;

/**
 * 从 CSON JSON 字符串导入，返回用于创建 CharacterSheet 的数据
 */
export function importCSON(jsonString: string): {
  name: string;
  ruleset_id: string;
  occupation_id?: string;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  derived_max: Record<string, { current: number; max: number }>;
  equipment: string[];
  background?: string;
  avatar_custom_data?: object;
};

/**
 * 校验 CSON 格式是否合法
 */
export function validateCSON(jsonString: string): { valid: boolean; errors: string[] };
```

在 `packages/shared/src/utils/index.ts` 中添加导出：
```typescript
export * from './cson';
```

### 文件 2：packages/client/src/views/CharacterEditor.vue

角色卡编辑器页面：

功能：
1. **基本信息** — 名称输入、头像 URL、职业选择（ruleset 定义的职业列表）

2. **属性编辑** — 动态表单，根据 ruleset 的 character_card_schema 生成属性输入字段。每个属性一行：标签 + 数字输入

3. **技能编辑** — 技能列表，每项：技能名 + 数字输入。支持添加/删除技能

4. **装备编辑** — 字符串列表，可添加/删除

5. **背景编辑** — 多行文本框

6. **导入/导出**：
   - 导出按钮：调用 `exportCSON()` 生成 JSON，触发浏览器下载 `.cson.json` 文件
   - 导入按钮：文件选择器，读取 `.cson.json` 文件，调用 `importCSON()` 填充表单

7. **保存** — 调用 API 创建/更新角色卡

编辑器路由为 `/character/editor/:id?`，有 id 时为编辑模式，无 id 时为创建模式。

### 测试文件：packages/shared/src/utils/__tests__/cson.test.ts

```typescript
import { describe, it, expect } from 'vitest';
import { exportCSON, importCSON, validateCSON } from '../cson';

describe('CSON', () => {
  it('应能正确导出为 CSON 格式', () => {
    const result = exportCSON({
      name: '测试角色',
      ruleset_id: 'rs-001',
      attributes: { str: 10, dex: 12 },
      skills: { 侦查: 50 },
      derived_max: { hp: { current: 10, max: 10 } },
      equipment: ['手枪'],
      background: '一个普通人',
    }, '测试用户');
    const parsed = JSON.parse(result);
    expect(parsed.schema_version).toBe('1.0');
    expect(parsed.character.name).toBe('测试角色');
  });

  it('应能从 CSON 导入角色数据', () => {
    const cson = JSON.stringify({
      schema_version: '1.0',
      meta: { created_at: new Date().toISOString(), exported_by: 'test', platform_version: '0.1.0' },
      character: {
        name: '导入角色',
        ruleset_ref: 'rs-001',
        attributes: { str: 15 },
        skills: {},
        resources: {},
        equipment: [],
      },
    });
    const result = importCSON(cson);
    expect(result.name).toBe('导入角色');
    expect(result.attributes.str).toBe(15);
  });

  it('应拒绝无效 CSON', () => {
    const result = validateCSON('{"invalid": true}');
    expect(result.valid).toBe(false);
  });
});
```

本步骤产出将被步骤 39 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 37 — 轨迹矩阵

- **依赖步骤**：Step 13, 30
- **产出文件**：`packages/client/src/components/room/TrajectoryMatrix.vue`
- **验证**：R — 浏览器查看桌面表格 + 移动端时间线

````
你是高级前端工程师。本步骤基于步骤 13、30 的产出。

请先读取以下文件：
- packages/client/src/views/Room.vue
- packages/client/src/stores/campaign-store.ts
- packages/shared/src/types/index.ts（获取 PositionHistory, StoryTime, Scene）

## 任务：实现轨迹矩阵视图

轨迹矩阵展示所有角色在不同时间点的位置变化。

### 文件：packages/client/src/components/room/TrajectoryMatrix.vue

```typescript
defineProps<{
  positionHistory: PositionHistory[];
  scenes: Scene[];
  characters: { id: string; name: string }[];
  currentTime: StoryTime;
}>();
```

### 桌面端（≥1024px）—— 表格视图

表格结构：
- 列头：时间线（Day 1 08:00, 08:30, 09:00, ...）
- 行头：角色名称
- 单元格：角色当时所在的场名称
- 位置变化时用箭头连接
- 当前时间列高亮

### 移动端（<768px）—— 时间线视图

改为纵向时间线：
- 纵向排列时间节点
- 每个时间节点下列出当时位置有变化的角色
- 格式：「Day 1 08:30 — 角色A: 酒馆 → 广场」

### 公共功能
- 时间范围选择器（显示最近 N 小时）
- 按角色筛选
- 显示/隐藏未变化的时间段

数据暂用 mock 占位。

严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 38 — 网格地图 V1.0

- **依赖步骤**：Step 30
- **产出文件**：`packages/client/src/components/room/GridMap.vue`
- **验证**：R — 浏览器查看 Canvas 网格

````
你是高级前端工程师，精通 Canvas 2D。本步骤基于步骤 30 的产出。

请先读取以下文件：
- packages/client/src/views/Room.vue
- packages/client/src/layouts/RoomLayout.vue
- packages/client/src/stores/campaign-store.ts

## 任务：实现网格地图 V1.0

### 文件：packages/client/src/components/room/GridMap.vue

使用 HTML5 Canvas 实现简单的网格地图。

```typescript
defineProps<{
  width: number;          // 网格列数
  height: number;         // 网格行数
  cellSize?: number;      // 单元格像素大小，默认 40
  tokens: GridToken[];    // 地图上的 token
  isGm: boolean;          // 是否为 GM（GM 可拖拽 token）
}>();

interface GridToken {
  id: string;
  label: string;
  x: number;              // 网格 x 坐标
  y: number;              // 网格 y 坐标
  color: string;          // token 颜色
  isNpc: boolean;
}

defineEmits<{
  'token-move': [tokenId: string, x: number, y: number];
}>();
```

功能：
1. **网格渲染** — Canvas 绘制等距方格，每格 cellSize px
2. **Token 渲染** — 在对应格子中绘制圆形 token + 标签文字
3. **Token 拖拽** — 仅 GM 可拖拽（mousedown → mousemove → mouseup），拖拽结束时 snap 到最近的格子，触发 `token-move` 事件
4. **缩放** — 鼠标滚轮缩放
5. **平移** — 右键拖拽平移画布

### 移动端（<768px）

Canvas 不可交互，改为静态预览（固定缩放到容器宽度）+ 下方坐标列表：

```html
<div class="grid-map-mobile">
  <canvas class="preview" />
  <ul class="token-list">
    <li v-for="token in tokens" :key="token.id">
      {{ token.label }}: ({{ token.x }}, {{ token.y }})
    </li>
  </ul>
</div>
```

数据暂用 mock 占位。

严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 39 — 日志导出系统

- **依赖步骤**：Step 17, 02
- **产出文件**：`packages/server/src/services/log-export-service.ts`、`packages/shared/src/utils/ilf.ts`
- **验证**：T — `pnpm --filter @trpg/server test -- log-export`

````
你是高级 TypeScript 全栈工程师。本步骤基于步骤 17、02 的产出。

请先读取以下文件：
- packages/shared/src/types/index.ts（获取 ChatMessage, Campaign, Scene, StoryTime, MessageType）
- packages/server/src/db/index.ts
- packages/server/src/routes/logs.ts

## 任务：实现 ILF 格式日志导出

### 文件 1：packages/shared/src/utils/ilf.ts

ILF (Interactive Log Format) 文档结构，参考 D9 设计：

```typescript
/** ILF 文档 */
export interface ILFDocument {
  version: '1.0.0';
  metadata: ILFMetadata;
  campaigns: ILFCampaign[];
}

export interface ILFMetadata {
  exported_at: string;       // ISO 8601
  exporter: string;          // 导出者昵称
  platform_version: string;
  total_messages: number;
}

export interface ILFCampaign {
  id: string;
  name: string;
  room_code: string;
  scenes: ILFScene[];
}

export interface ILFScene {
  id: string;
  name: string;
  type: string;
  fragments: ILFFragment[];
}

/** 叙事片段（一段连续对话） */
export interface ILFFragment {
  start_time: string;        // StoryTime 的字符串表示
  end_time: string;
  messages: ILFMessage[];
}

export interface ILFMessage {
  id: string;
  sender_name: string;
  character_name?: string;
  content: string;
  message_type: string;
  story_time?: string;
  timestamp: string;
}

/**
 * 将原始消息列表转换为 ILF 格式
 * 分段规则：连续消息间隔超过 30 分钟（故事时间）则开始新片段
 */
export function buildILFDocument(
  campaign: { id: string; name: string; room_code: string },
  scenes: { id: string; name: string; type: string }[],
  messages: {
    id: string;
    scene_id: string;
    sender_name: string;
    character_name?: string;
    content: string;
    message_type: string;
    story_time?: { day: number; hour: number; minute: number } | null;
    created_at: string;
  }[],
  exporterName: string
): ILFDocument;

/**
 * 将 ILF 文档序列化为 JSON 字符串
 */
export function serializeILF(doc: ILFDocument): string;

/**
 * 将 ILF 文档转换为纯文本格式（便于阅读）
 */
export function ilfToPlainText(doc: ILFDocument): string;

/**
 * 格式化 StoryTime 为可读字符串
 */
export function formatStoryTime(time: { day: number; hour: number; minute: number }): string;
```

在 `packages/shared/src/utils/index.ts` 中添加导出：
```typescript
export * from './ilf';
```

### 文件 2：packages/server/src/services/log-export-service.ts

```typescript
import { db } from '../db';
import { buildILFDocument, serializeILF, ilfToPlainText } from '@trpg/shared';

export class LogExportService {
  /**
   * 导出团日志为 ILF JSON
   * @param campaignId - 团 ID
   * @param format - 'json' | 'text'
   * @param filters - 可选过滤条件
   */
  async exportLogs(
    campaignId: string,
    exporterName: string,
    format: 'json' | 'text' = 'json',
    filters?: {
      scene_ids?: string[];
      start_date?: Date;
      end_date?: Date;
      message_types?: string[];
    }
  ): Promise<string>;
}

export const logExportService = new LogExportService();
```

实现逻辑：
1. 从 `campaigns` 表获取团信息
2. 从 `scenes` 表获取场列表
3. 从 `chat_messages` 表查询消息（按 filters 过滤），JOIN `users` 表获取发送者名称
4. 调用 `buildILFDocument` 构建 ILF 文档
5. 根据 format 返回 JSON 或纯文本

### 文件 3：更新 packages/server/src/routes/logs.ts

将占位路由替换为真实实现：

```typescript
router.post('/export', authMiddleware, async (req, res) => {
  const { campaign_id, format, filters } = req.body;
  // 验证用户有权访问该团
  // 调用 logExportService.exportLogs
  // 返回导出内容
});
```

### 测试文件：packages/shared/src/utils/__tests__/ilf.test.ts

测试用例：
1. buildILFDocument 基本构建
2. 消息自动分段（间隔 > 30 分钟故事时间）
3. ilfToPlainText 格式化输出
4. formatStoryTime 格式化

本步骤产出将被步骤 41 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

### Phase 8：打磨与部署

---

#### Step 40 — PWA + Service Worker + 移动端适配

- **依赖步骤**：Step 23
- **产出文件**：`packages/client/public/manifest.json`、`packages/client/src/sw.ts`、`packages/client/src/styles/mobile.css`
- **验证**：R — 移动端浏览器检查 PWA 安装提示 + 响应式布局

````
你是高级前端工程师，精通 PWA 和响应式设计。本步骤基于步骤 23 的产出。

请先读取以下文件：
- packages/client/index.html
- packages/client/vite.config.ts
- packages/client/src/main.ts
- packages/client/src/styles/tokens.css
- packages/client/src/layouts/MainLayout.vue
- packages/client/src/layouts/RoomLayout.vue

## 任务：PWA 配置、Service Worker、移动端适配

### 文件 1：packages/client/public/manifest.json

```json
{
  "name": "TRPG 通用平台",
  "short_name": "TRPG",
  "description": "跨规则 TRPG 在线跑团平台",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#f9fafb",
  "theme_color": "#0f172a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 文件 2：packages/client/src/sw.ts

基础 Service Worker（使用 vite-plugin-pwa 或手写）：

```typescript
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'trpg-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install: 缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: 清除旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: Network-first 策略（API 请求不缓存，静态资源走缓存）
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) {
    return; // 不缓存 API 和 WebSocket
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
```

### 文件 3：packages/client/src/styles/mobile.css

移动端适配样式，参考 D11 设计：

```css
/* ===== 断点定义 ===== */
/* Desktop: ≥1024px */
/* Tablet: 768-1023px */
/* Mobile: <768px */

/* ===== 全局移动端适配 ===== */
@media (max-width: 767px) {
  /* 底部导航文字缩小 */
  .bottom-nav .nav-label {
    font-size: 10px;
  }

  /* 卡片全宽 */
  .t-card {
    border-radius: 0;
    margin-left: calc(-1 * var(--space-4));
    margin-right: calc(-1 * var(--space-4));
  }

  /* 隐藏桌面端元素 */
  .desktop-only {
    display: none !important;
  }
}

@media (min-width: 768px) {
  .mobile-only {
    display: none !important;
  }
}

/* ===== 房间布局移动端 ===== */
@media (max-width: 767px) {
  .room-layout {
    grid-template-columns: 1fr !important;
  }

  .room-left-sidebar,
  .room-right-desk {
    position: fixed;
    top: var(--navbar-height);
    bottom: 0;
    z-index: 100;
    background: var(--color-card-bg);
    transition: transform var(--transition-normal);
  }

  .room-left-sidebar {
    left: 0;
    width: 280px;
    transform: translateX(-100%);
  }
  .room-left-sidebar.open {
    transform: translateX(0);
    box-shadow: var(--shadow-lg);
  }

  .room-right-desk {
    right: 0;
    width: 300px;
    transform: translateX(100%);
  }
  .room-right-desk.open {
    transform: translateX(0);
    box-shadow: var(--shadow-lg);
  }

  /* 移动端快捷栏 */
  .mobile-quick-bar {
    display: flex;
    height: 48px;
    background: var(--color-card-bg);
    border-top: 1px solid var(--color-card-border);
  }
  .mobile-quick-bar button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: none;
    background: none;
    color: var(--color-text-secondary);
    font-size: 10px;
    cursor: pointer;
  }
}

/* ===== 平板适配 ===== */
@media (min-width: 768px) and (max-width: 1023px) {
  .room-right-desk {
    position: fixed;
    right: 0;
    top: var(--navbar-height);
    bottom: 0;
    width: 320px;
    transform: translateX(100%);
    transition: transform var(--transition-normal);
    z-index: 100;
    background: var(--color-card-bg);
    box-shadow: var(--shadow-lg);
  }
  .room-right-desk.open {
    transform: translateX(0);
  }
}

/* ===== 触摸优化 ===== */
@media (pointer: coarse) {
  button, .clickable {
    min-height: 44px;
    min-width: 44px;
  }
}

/* ===== 安全区域 ===== */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .bottom-nav,
  .mobile-quick-bar {
    padding-bottom: env(safe-area-inset-bottom);
  }
}
```

### 更新 packages/client/index.html

在 `<head>` 中添加：
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0f172a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

### 更新 packages/client/src/main.ts

在末尾注册 Service Worker：
```typescript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  });
}
```

### 在 main.ts 中引入 mobile.css

```typescript
import './styles/mobile.css';
```

本步骤产出将被步骤 41 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 41 — 端到端测试

- **依赖步骤**：全部前序步骤
- **产出文件**：`packages/server/src/__tests__/e2e/auth.e2e.test.ts`、`campaign.e2e.test.ts`、`chat.e2e.test.ts`
- **验证**：I — `pnpm --filter @trpg/server test -- e2e`

````
你是高级 TypeScript 全栈工程师。本步骤基于全部前序步骤的产出。

请先读取以下文件：
- packages/server/src/app.ts
- packages/server/src/routes/index.ts
- packages/shared/src/types/index.ts
- packages/shared/src/types/events.ts
- packages/server/src/socket/chat-handler.ts
- packages/server/src/services/auth-service.ts
- packages/server/src/services/campaign-service.ts

## 任务：编写端到端集成测试

使用 vitest 编写端到端测试。测试需要启动 Express 服务器和 Socket.IO，使用真实（或内存）数据库。

### 文件 1：packages/server/src/__tests__/e2e/setup.ts

测试环境设置：

```typescript
import { httpServer } from '../../app';
import { db } from '../../db';

export async function setupTestServer(): Promise<{ port: number; baseUrl: string }> {
  // 运行 migration（使用 SQLite 内存数据库或测试 MySQL）
  await db.migrate.latest();

  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      const port = typeof addr === 'object' ? addr!.port : 0;
      resolve({ port, baseUrl: `http://localhost:${port}` });
    });
  });
}

export async function teardownTestServer(): Promise<void> {
  await db.migrate.rollback();
  await db.destroy();
  httpServer.close();
}
```

### 文件 2：packages/server/src/__tests__/e2e/auth.e2e.test.ts

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestServer, teardownTestServer } from './setup';

describe('Auth E2E', () => {
  let baseUrl: string;

  beforeAll(async () => {
    const server = await setupTestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  it('完整注册 → 登录流程', async () => {
    // 1. 注册
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13800000001', password: 'Test123456', nickname: '测试用户' }),
    });
    expect(registerRes.status).toBe(200);
    const registerData = await registerRes.json();
    expect(registerData.token).toBeTruthy();
    expect(registerData.user.uid).toBeGreaterThanOrEqual(1000000);

    // 2. 登录
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13800000001', password: 'Test123456' }),
    });
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    expect(loginData.token).toBeTruthy();
  });

  it('重复注册应报错', async () => {
    // 先注册
    await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13800000002', password: 'Test123456', nickname: '用户2' }),
    });
    // 再注册同号
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13800000002', password: 'Test123456', nickname: '用户2b' }),
    });
    expect(res.status).toBe(409);
  });

  it('错误密码登录应失败', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13800000001', password: 'WrongPassword' }),
    });
    expect(res.status).toBe(401);
  });
});
```

### 文件 3：packages/server/src/__tests__/e2e/campaign.e2e.test.ts

```typescript
describe('Campaign E2E', () => {
  // 先注册用户获取 token
  // 1. 创建团 → 验证返回 room_code 格式（6位，字符集 ABCDEFGHJKLMNPQRSTUVWXY23456789）
  // 2. 获取团列表 → 包含新创建的团
  // 3. 创建场 → 验证场类型
  // 4. 创建角色卡 → 验证 character_code（8位十六进制）
  // 5. 通过房间代码加入团
});
```

### 文件 4：packages/server/src/__tests__/e2e/chat.e2e.test.ts

```typescript
import { io as ioClient } from 'socket.io-client';

describe('Chat E2E', () => {
  // 1. 两个用户连接 /room 命名空间
  // 2. 用户A join_room
  // 3. 用户A 发送 chat_message
  // 4. 用户B 收到 new_message 事件
  // 5. 验证消息 ID 为 Snowflake 格式（纯数字字符串）
  // 6. 验证消息持久化到数据库
  // 7. 限流测试：快速发送 6 条消息，第 6 条应触发 rate_limited
});
```

每个测试文件需要完整实现测试逻辑（不是注释占位）。

本步骤产出将被步骤 42 引用，确保导出接口稳定。
严格按照要求实现，不要添加任何文档未提及的功能。
````

---

#### Step 42 — Docker 部署配置

- **依赖步骤**：全部前序步骤
- **产出文件**：`Dockerfile`、`docker-compose.yml`、`.env.example`、`nginx.conf`
- **验证**：I — `docker-compose up -d` 后访问应用

````
你是高级 DevOps 工程师。本步骤基于全部前序步骤的产出。

请先读取以下文件：
- package.json（根）
- packages/server/package.json
- packages/client/package.json
- packages/client/vite.config.ts

## 任务：创建 Docker 部署配置

### 文件 1：Dockerfile

多阶段构建：

```dockerfile
# ===== Stage 1: Build =====
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

RUN pnpm install --frozen-lockfile

COPY . .

# Build shared
RUN pnpm --filter @trpg/shared build

# Build client (produces dist/)
RUN pnpm --filter @trpg/client build

# Build server
RUN pnpm --filter @trpg/server build

# ===== Stage 2: Production Server =====
FROM node:20-alpine AS server

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/server/dist packages/server/dist/

RUN pnpm install --frozen-lockfile --prod

EXPOSE 3000
CMD ["node", "packages/server/dist/server.js"]

# ===== Stage 3: Nginx for Client =====
FROM nginx:alpine AS client

COPY --from=builder /app/packages/client/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

### 文件 2：docker-compose.yml

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: ${DB_NAME}
    ports:
      - '3306:3306'
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  server:
    build:
      context: .
      target: server
    ports:
      - '3000:3000'
    environment:
      - DB_HOST=mysql
      - DB_PORT=3306
      - DB_USER=root
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - JWT_SECRET=${JWT_SECRET}
      - WORKER_ID=1
      - PORT=3000
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped

  client:
    build:
      context: .
      target: client
    ports:
      - '80:80'
    depends_on:
      - server
    restart: unless-stopped

volumes:
  mysql_data:
  redis_data:
```

### 文件 3：.env.example

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=trpg_platform

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Auth
JWT_SECRET=change-this-to-a-random-secret

# Server
PORT=3000
WORKER_ID=1

# Node
NODE_ENV=production
```

### 文件 4：nginx.conf

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api {
        proxy_pass http://server:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket proxy
    location /socket.io {
        proxy_pass http://server:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Static cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 1024;
}
```

### 部署流程说明

在仓库根目录执行：
```bash
cp .env.example .env
# 编辑 .env，填入实际密码和密钥
docker-compose up -d
# 运行数据库迁移
docker-compose exec server node -e "require('./dist/db/knex-config').db.migrate.latest()"
```

严格按照要求实现，不要添加任何文档未提及的功能。
````

---

> **手册结束。** 按照 Phase 0 → Phase 8 的顺序，逐步向 AI 发送提示词，每步验证通过后再继续下一步。祝开发顺利。
