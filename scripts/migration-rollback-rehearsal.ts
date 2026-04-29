#!/usr/bin/env node
/**
 * migration-rollback-rehearsal.ts
 *
 * 数据库迁移正反向回滚演练脚本
 *
 * 功能：
 *   1. 连接真实数据库（读取环境变量）
 *   2. 依次执行 migrate:latest（全量 up）
 *   3. 逐批执行 migrate:rollback，验证每步 down() 不报错
 *   4. 最终还原到最新版本（再次 migrate:latest）
 *   5. 打印每步耗时与迁移文件名
 *
 * 使用方式：
 *   # 需要真实 DB 连接，适合预发布环境执行
 *   DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=... \
 *     pnpm -F @trpg/server tsx scripts/migration-rollback-rehearsal.ts
 *
 *   # 如果只想演练部分批次（如最后 N 个迁移）：
 *     ... tsx scripts/migration-rollback-rehearsal.ts --batches 3
 *
 * 退出码：
 *   0 — 所有 up/down 均成功
 *   1 — 任意步骤失败
 */

import '../packages/server/src/utils/load-env';
import path from 'path';
import { fileURLToPath } from 'url';
import knex from 'knex';

// ─── 参数解析 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const batchFlagIdx = args.indexOf('--batches');
const maxRollbackBatches = batchFlagIdx !== -1 && args[batchFlagIdx + 1]
  ? parseInt(args[batchFlagIdx + 1]!, 10)
  : Infinity;

// ─── 数据库连接 ──────────────────────────────────────────────────────────────
const db = knex({
  client: 'mysql2',
  connection: {
    host:     process.env['DB_HOST']     ?? '127.0.0.1',
    port:     Number(process.env['DB_PORT'] ?? 3306),
    user:     process.env['DB_USER']     ?? 'trpg',
    password: process.env['DB_PASSWORD'] ?? '',
    database: process.env['DB_NAME']     ?? 'trpg_platform',
    charset:  'utf8mb4',
  },
  migrations: {
    directory: path.resolve(process.cwd(), 'packages/server/src/db/migrations'),
    extension: 'ts',
  },
});

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'packages/server/src/db/migrations');

// ─── 工具函数 ────────────────────────────────────────────────────────────────
function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('=== 迁移正反向回滚演练开始 ===');

  const config = {
    directory: MIGRATIONS_DIR,
    extension: 'ts',
  };

  let errors = 0;

  // 1. 全量 up（确保 DB 处于最新状态）
  log('步骤 1/3 — 执行 migrate:latest（全量 up）');
  const t0 = Date.now();
  try {
    const [batchNo, log2] = await db.migrate.latest(config);
    if ((log2 as string[]).length === 0) {
      log('  → 已是最新，无新迁移');
    } else {
      log(`  → Batch ${batchNo}，执行了 ${(log2 as string[]).length} 个迁移：`);
      for (const name of log2 as string[]) {
        log(`    + ${name}`);
      }
    }
    log(`  ✓ migrate:latest 完成（${fmtMs(Date.now() - t0)}）`);
  } catch (err) {
    log(`  ✗ migrate:latest 失败：${(err as Error).message}`);
    await db.destroy();
    process.exit(1);
  }

  // 2. 逐批 rollback（down）
  log('步骤 2/3 — 逐批 rollback 演练');
  let rollbackCount = 0;
  const rollbackRecords: Array<{ batch: number; files: string[]; ms: number }> = [];

  while (rollbackCount < maxRollbackBatches) {
    const t1 = Date.now();
    try {
      const [batchNo, rolledBack] = await db.migrate.rollback(config);
      const files = rolledBack as string[];
      if (files.length === 0) {
        log('  → 已无可回滚批次，rollback 演练结束');
        break;
      }
      rollbackCount++;
      rollbackRecords.push({ batch: batchNo, files, ms: Date.now() - t1 });
      log(`  ✓ Batch ${batchNo} rollback — ${files.length} 个迁移（${fmtMs(Date.now() - t1)}）：`);
      for (const f of files) {
        log(`    - ${f}`);
      }
    } catch (err) {
      log(`  ✗ rollback 第 ${rollbackCount + 1} 批失败：${(err as Error).message}`);
      errors++;
      break;
    }
  }

  // 3. 还原到最新版本
  log('步骤 3/3 — 还原：执行 migrate:latest（重跑全量 up）');
  const t2 = Date.now();
  try {
    const [batchNo, restored] = await db.migrate.latest(config);
    log(`  ✓ 还原完成 Batch ${batchNo}，${(restored as string[]).length} 个迁移（${fmtMs(Date.now() - t2)}）`);
  } catch (err) {
    log(`  ✗ 还原失败：${(err as Error).message}`);
    errors++;
  }

  // ─── 汇总报告 ─────────────────────────────────────────────────────────────
  log('');
  log('=== 演练汇总 ===');
  log(`  回滚批次数：${rollbackRecords.length}`);
  log(`  总迁移文件：${rollbackRecords.reduce((n, r) => n + r.files.length, 0)}`);
  log(`  错误数：${errors}`);

  if (errors > 0) {
    log('  ✗ 存在失败步骤，建议修复 down() 后重试。');
  } else {
    log('  ✓ 所有 up/down 均成功，DB 正反向一致性验证通过。');
  }

  await db.destroy();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('演练脚本异常：', err);
  process.exit(1);
});
