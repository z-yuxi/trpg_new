import { httpServer } from './app';

// 启动前校验必要的环境变量（auth-service 会校验 JWT_SECRET，此处补充数据库和 Redis）
const requiredEnvVars: string[] = ['JWT_SECRET', 'DB_HOST', 'REDIS_HOST'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`[FATAL] Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
