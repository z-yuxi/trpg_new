/**
 * 验收套件 vitest 配置
 *
 * 只跑"发布门禁"必须全绿的核心测试：
 *   ① auth e2e            — 注册/登录链路基线
 *   ② message-visibility  — T.1~T.4 可见性矩阵（纯逻辑）
 *   ③ recruitment e2e     — 招募板列表 + 筛选 2xx 验证
 *
 * 运行命令：
 *   pnpm --filter @trpg/server test:accept
 * 或从 workspace 根：
 *   pnpm test:accept
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'acceptance',
    globals: true,
    include: [
      'src/__tests__/e2e/auth.e2e.test.ts',
      'src/__tests__/e2e/recruitment*.e2e.test.ts',
      'src/__tests__/message-visibility.test.ts',
      'src/__tests__/contract/api-contract.test.ts',
    ],
    env: {
      JWT_SECRET: 'test_jwt_secret_for_acceptance_gate',
      DB_HOST: '127.0.0.1',
      DB_USER: 'trpg',
      DB_PASSWORD: 'trpg_password',
      DB_NAME: 'trpg_platform',
    },
    // 顺序执行 e2e，避免内存 mock 状态互相干扰
    sequence: {
      concurrent: false,
    },
    reporters: ['verbose'],
  },
});
