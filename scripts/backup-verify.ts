/**
 * 备份验证任务
 *
 * 职责：每周下载最新备份文件，恢复到临时数据库并校验行数，
 *       通过则报告成功，失败则触发 P0 告警。
 *
 * 使用方式：
 *   - 直接运行：ts-node scripts/backup-verify.ts
 *   - crontab：0 4 * * 1 ts-node /app/scripts/backup-verify.ts >> /var/log/backup-verify.log 2>&1
 *
 * 环境变量：
 *   OSS_BUCKET       - OSS 存储桶路径（如 oss://gongxu-backups/db/）
 *   DB_VERIFY_NAME   - 临时恢复库名（默认 gongxu_verify）
 *   DB_USER          - 数据库用户（默认 postgres）
 *   PGPASSWORD       - 密码
 *   ALERT_WEBHOOK_URL - 告警 webhook（沿用 AlertManager 配置）
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, unlinkSync } from 'fs';

const execAsync = promisify(exec);

const OSS_BUCKET    = process.env['OSS_BUCKET'] ?? '';
const DB_VERIFY     = process.env['DB_VERIFY_NAME'] ?? 'gongxu_verify';
const DB_USER       = process.env['DB_USER'] ?? 'postgres';
const TMP_GZ        = '/tmp/backup_verify.sql.gz';
const TMP_SQL       = '/tmp/backup_verify.sql';
const WEBHOOK_URL   = process.env['ALERT_WEBHOOK_URL'];

function ts(): string {
  return new Date().toISOString();
}

async function sendAlert(message: string): Promise<void> {
  if (!WEBHOOK_URL) {
    console.error(`[${ts()}] [backup-verify] ALERT (no webhook): ${message}`);
    return;
  }
  try {
    // 使用 Node.js 内置 fetch（Node 18+）
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content: `[P0][backup-verify] ${message}` },
      }),
    });
  } catch (e) {
    console.error(`[${ts()}] [backup-verify] webhook error:`, e);
  }
}

async function run(): Promise<void> {
  console.log(`[${ts()}] [backup-verify] START`);

  if (!OSS_BUCKET) {
    console.warn(`[${ts()}] [backup-verify] OSS_BUCKET not set, skipping remote verify`);
    process.exit(0);
  }

  try {
    // 1. 列出 OSS 最新备份文件名
    const { stdout: lsOut } = await execAsync(`ossutil ls ${OSS_BUCKET} --limited-num 1 --reverse`);
    const lines = lsOut.trim().split('\n').filter(l => l.includes('.sql.gz'));
    if (lines.length === 0) {
      throw new Error('No backup files found in OSS');
    }
    // ossutil ls 输出格式：  2024-01-01 03:00:00  1234567  oss://bucket/path/file.sql.gz
    const remoteFile = lines[0].trim().split(/\s+/).pop()!;
    console.log(`[${ts()}] [backup-verify] latest backup: ${remoteFile}`);

    // 2. 下载
    await execAsync(`ossutil cp ${remoteFile} ${TMP_GZ}`);
    console.log(`[${ts()}] [backup-verify] downloaded to ${TMP_GZ}`);

    // 3. 解压
    await execAsync(`gunzip -f ${TMP_GZ}`);

    // 4. 恢复到临时库
    await execAsync(`psql -U ${DB_USER} -c "DROP DATABASE IF EXISTS ${DB_VERIFY}"`);
    await execAsync(`psql -U ${DB_USER} -c "CREATE DATABASE ${DB_VERIFY}"`);
    await execAsync(`psql -U ${DB_USER} -d ${DB_VERIFY} -f ${TMP_SQL}`);
    console.log(`[${ts()}] [backup-verify] restored to ${DB_VERIFY}`);

    // 5. 校验关键表行数
    const checks: Array<{ table: string; minRows: number }> = [
      { table: 'users', minRows: 1 },
      { table: 'campaigns', minRows: 0 },
    ];
    for (const { table, minRows } of checks) {
      const { stdout } = await execAsync(
        `psql -U ${DB_USER} -d ${DB_VERIFY} -t -c "SELECT COUNT(*) FROM ${table}"`
      );
      const count = parseInt(stdout.trim(), 10);
      if (isNaN(count) || count < minRows) {
        throw new Error(`Table "${table}" count=${count} < minRows=${minRows}`);
      }
      console.log(`[${ts()}] [backup-verify] ${table}: ${count} rows OK`);
    }

    // 6. 清理
    await execAsync(`psql -U ${DB_USER} -c "DROP DATABASE IF EXISTS ${DB_VERIFY}"`);
    if (existsSync(TMP_SQL)) unlinkSync(TMP_SQL);
    console.log(`[${ts()}] [backup-verify] PASS`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${ts()}] [backup-verify] FAIL: ${msg}`);
    await sendAlert(`备份验证失败：${msg}`);
    process.exit(1);
  }
}

void run();
