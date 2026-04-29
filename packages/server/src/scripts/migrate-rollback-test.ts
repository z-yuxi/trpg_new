#!/usr/bin/env tsx
/**
 * 迁移回滚演练脚本
 *
 * 用途：上线前验证所有迁移的 up/down 可正确执行，不会留下孤立数据。
 * 执行步骤：
 *   1. 运行 migrate.latest（跑到最新）
 *   2. 逐步 rollback 每个 batch（记录每步结果）
 *   3. 重新 migrate.latest 确认可以正向恢复
 *
 * 注意：
 *   - 请只在**开发/测试数据库**运行，不能在生产环境执行！
 *   - 需要 .env 文件（或环境变量）指定数据库连接。
 *
 * 执行方式：
 *   cd packages/server
 *   pnpm tsx src/scripts/migrate-rollback-test.ts
 */

import '../utils/load-env';
import path from 'path';
import { db } from '../db/knex-config';

const migrationsDir = path.resolve(process.cwd(), 'src/db/migrations');
const migrationConfig = { directory: migrationsDir, extension: 'ts' };

type MigrationInfo = { name: string; batch: number; migration_time: Date };

async function currentVersion(): Promise<{ batch: number; count: number }> {
  const completed = await db.migrate.list(migrationConfig);
  const ran: MigrationInfo[] = (completed as [unknown[], MigrationInfo[]])[1];
  const maxBatch = ran.reduce((m, r) => Math.max(m, r.batch), 0);
  return { batch: maxBatch, count: ran.length };
}

async function run() {
  console.log('=== 迁移回滚演练开始 ===');
  console.log('注意：只能在开发/测试数据库上执行！');
  console.log();

  // Step 1: migrate to latest
  console.log('[ Step 1 ] migrate.latest ...');
  const [batchNo, latestLog] = await db.migrate.latest(migrationConfig);
  if (latestLog.length === 0) {
    console.log('  ✓ 已是最新（无新迁移）');
  } else {
    console.log(`  ✓ Batch ${batchNo} 执行了 ${latestLog.length} 条迁移`);
    latestLog.forEach((name: string) => console.log(`    + ${name}`));
  }

  const { batch: startBatch } = await currentVersion();
  console.log(`  当前最高 batch: ${startBatch}`);
  console.log();

  // Step 2: rollback each batch
  let remainingBatches = startBatch;
  while (remainingBatches > 0) {
    console.log(`[ Step 2 ] rollback batch ${remainingBatches} ...`);
    try {
      const [rolledBatch, rollLog] = await db.migrate.rollback(migrationConfig);
      if (!rollLog || rollLog.length === 0) {
        console.log('  ✓ 无可回滚的迁移，停止');
        break;
      }
      console.log(`  ✓ Batch ${rolledBatch} 回滚了 ${rollLog.length} 条迁移`);
      rollLog.forEach((name: string) => console.log(`    - ${name}`));
    } catch (err) {
      console.error(`  ✗ 回滚 batch ${remainingBatches} 失败:`, (err as Error).message);
      process.exitCode = 1;
      break;
    }
    remainingBatches--;
  }
  console.log();

  // Step 3: re-apply migrate.latest
  console.log('[ Step 3 ] 重新 migrate.latest（正向恢复）...');
  try {
    const [reBatch, reLog] = await db.migrate.latest(migrationConfig);
    if (reLog.length === 0) {
      console.log('  ✓ 已是最新（无新迁移可执行）');
    } else {
      console.log(`  ✓ Batch ${reBatch} 执行了 ${reLog.length} 条迁移`);
      reLog.forEach((name: string) => console.log(`    + ${name}`));
    }
    const { batch: finalBatch, count: finalCount } = await currentVersion();
    console.log(`  ✓ 恢复后最高 batch: ${finalBatch}，共 ${finalCount} 条已执行迁移`);
    if (finalBatch !== startBatch) {
      console.warn(`  ⚠ 警告：原始 batch(${startBatch}) ≠ 恢复后 batch(${finalBatch})，可能有批次合并`);
    }
  } catch (err) {
    console.error('  ✗ 重新迁移失败:', (err as Error).message);
    process.exitCode = 1;
  }

  console.log();
  if (process.exitCode === 1) {
    console.error('=== 演练失败，请检查上方错误 ===');
  } else {
    console.log('=== 演练完成 ✓ 所有迁移回滚/正向均可执行 ===');
  }
}

run()
  .catch((err) => {
    console.error('[Fatal]', err);
    process.exit(1);
  })
  .finally(() => db.destroy());
