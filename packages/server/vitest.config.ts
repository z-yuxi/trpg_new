import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    env: {
      JWT_SECRET: 'test_jwt_secret_for_unit_testing_only',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_for_unit_testing_only',
      DB_HOST: '127.0.0.1',
      DB_USER: 'trpg',
      DB_PASSWORD: 'trpg_password',
      DB_NAME: 'trpg_platform',
      // 测试用加密密钥（仅用于测试环境，32字节固定值）
      ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000001',
      PHONE_HMAC_KEY:  '0000000000000000000000000000000000000000000000000000000000000002',
    },
  },
});
