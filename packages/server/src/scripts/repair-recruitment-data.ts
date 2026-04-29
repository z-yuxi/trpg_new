#!/usr/bin/env tsx
/**
 * 招募系统历史数据一致性修复脚本
 *
 * 修复迁移到新状态机（v2.0）后可能存在的历史数据问题：
 *
 * Fix-01: player_count_joined 与实际 confirmed 数量不一致
 * Fix-02: 帖子状态（open/full）与 player_count_joined/player_count_max 不一致
 * Fix-03: 过期的 invited 申请未被清理（invited_expires_at < now）
 * Fix-04: waiting_position 有空洞（候补队列序号不连续）
 * Fix-05: grouped 帖子无 campaign_id（成团但未关联战役）
 * Fix-06: 已成团帖子中仍有 pending/invited/waiting 申请未被关闭
 *
 * 运行方式：
 *   cd packages/server
 *   pnpm tsx src/scripts/repair-recruitment-data.ts [--dry-run] [--fix=all|01,02,03]
 *
 * 参数说明：
 *   --dry-run   只报告问题，不修改数据（默认 false）
 *   --fix=all   执行所有修复（默认）
 *   --fix=01,03 只执行指定编号的修复
 */

import '../utils/load-env';
import { db } from '../db/knex-config';

// ── CLI 参数解析 ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const fixArg = args.find((a) => a.startsWith('--fix='));
const fixSet: Set<string> = fixArg
  ? new Set(fixArg.replace('--fix=', '').split(','))
  : new Set(['all']);
const shouldFix = (id: string) => fixSet.has('all') || fixSet.has(id);

// ── 工具函数 ──────────────────────────────────────────────────────────────────

let issueCount = 0;
let fixedCount = 0;

function log(level: 'INFO' | 'WARN' | 'FIX' | 'SKIP', msg: string) {
  const prefix = { INFO: '  ℹ', WARN: '  ⚠', FIX: '  ✓', SKIP: '  ~' }[level];
  console.log(`${prefix} [${level}] ${msg}`);
}

async function exec(sql: string, msg: string) {
  if (isDryRun) {
    log('SKIP', `[DRY-RUN] ${msg}`);
    return;
  }
  await db.raw(sql);
  log('FIX', msg);
  fixedCount++;
}

// ── Fix-01: player_count_joined 数值修正 ────────────────────────────────────

async function fix01_playerCountJoined() {
  console.log('\n[Fix-01] 检查 player_count_joined 与实际 confirmed 数量一致性...');

  const rows = await db.raw(`
    SELECT 
      rp.id,
      rp.title,
      rp.player_count_joined as stored,
      COALESCE(SUM(CASE WHEN ra.status = 'confirmed' THEN 1 ELSE 0 END), 0) as actual
    FROM recruitment_posts rp
    LEFT JOIN recruitment_applications ra ON ra.post_id = rp.id
    WHERE rp.status NOT IN ('draft', 'archived')
    GROUP BY rp.id, rp.title, rp.player_count_joined
    HAVING stored != actual
  `) as { rows?: Array<Record<string, unknown>> } | Array<unknown>;

  // MySQL 返回 [rows, fields]，SQLite 直接返回数组
  const resultRows = Array.isArray(rows) && Array.isArray(rows[0])
    ? (rows[0] as Array<Record<string, unknown>>)
    : (Array.isArray(rows) ? rows as Array<Record<string, unknown>> : []);

  if (resultRows.length === 0) {
    log('INFO', '无不一致数据');
    return;
  }

  issueCount += resultRows.length;
  for (const row of resultRows) {
    log('WARN', `帖子 ${row['id']} (${row['title']}): stored=${row['stored']}, actual=${row['actual']}`);
    if (shouldFix('01')) {
      await exec(
        `UPDATE recruitment_posts SET player_count_joined = ${row['actual']} WHERE id = '${row['id']}'`,
        `修复帖子 ${row['id']} player_count_joined: ${row['stored']} → ${row['actual']}`,
      );
    }
  }
}

// ── Fix-02: 帖子状态与席位数一致性 ──────────────────────────────────────────

async function fix02_postStatusConsistency() {
  console.log('\n[Fix-02] 检查 open/full 状态与席位数一致性...');

  const rows = await db('recruitment_posts')
    .whereIn('status', ['open', 'full'])
    .select('id', 'title', 'status', 'player_count_joined', 'player_count_max') as Array<Record<string, unknown>>;

  let found = 0;
  for (const row of rows) {
    const joined = Number(row['player_count_joined']);
    const max = Number(row['player_count_max']);
    const expectedStatus = joined >= max ? 'full' : 'open';
    if (expectedStatus !== row['status']) {
      found++;
      issueCount++;
      log('WARN', `帖子 ${row['id']}: status=${row['status']} 但 joined=${joined}/${max}，期望=${expectedStatus}`);
      if (shouldFix('02')) {
        await exec(
          `UPDATE recruitment_posts SET status = '${expectedStatus}' WHERE id = '${row['id']}'`,
          `修复帖子 ${row['id']} 状态: ${row['status']} → ${expectedStatus}`,
        );
      }
    }
  }
  if (found === 0) log('INFO', '无不一致数据');
}

// ── Fix-03: 过期邀请清理 ──────────────────────────────────────────────────────

async function fix03_expiredInvites() {
  console.log('\n[Fix-03] 检查过期 invited 申请...');

  const expired = await db('recruitment_applications')
    .where('status', 'invited')
    .where('invited_expires_at', '<', new Date())
    .select('id', 'post_id') as Array<{ id: string; post_id: string }>;

  if (expired.length === 0) {
    log('INFO', '无过期邀请');
    return;
  }

  issueCount += expired.length;
  log('WARN', `发现 ${expired.length} 条过期邀请`);

  if (shouldFix('03')) {
    if (!isDryRun) {
      await db('recruitment_applications')
        .whereIn('id', expired.map((r) => r.id))
        .update({
          status: 'rejected',
          reject_reason: '邀请确认超时（数据修复）',
          updated_at: db.fn.now(),
        });
      fixedCount += expired.length;
      log('FIX', `已将 ${expired.length} 条过期邀请置为 rejected`);
    } else {
      log('SKIP', `[DRY-RUN] 将置 ${expired.length} 条为 rejected`);
    }
  }
}

// ── Fix-04: waiting_position 空洞修复 ───────────────────────────────────────

async function fix04_waitingPositionGaps() {
  console.log('\n[Fix-04] 检查候补队列 waiting_position 连续性...');

  const postIds = await db('recruitment_applications')
    .where('status', 'waiting')
    .distinct('post_id')
    .pluck('post_id') as string[];

  let found = 0;
  for (const postId of postIds) {
    const waitings = await db('recruitment_applications')
      .where({ post_id: postId, status: 'waiting' })
      .orderBy('waiting_position', 'asc')
      .select('id', 'waiting_position') as Array<{ id: string; waiting_position: number }>;

    for (let i = 0; i < waitings.length; i++) {
      const expected = i + 1;
      if (waitings[i].waiting_position !== expected) {
        found++;
        issueCount++;
        log('WARN', `帖子 ${postId} 候补 ${waitings[i].id}: position=${waitings[i].waiting_position}，期望=${expected}`);
        if (shouldFix('04') && !isDryRun) {
          await db('recruitment_applications')
            .where({ id: waitings[i].id })
            .update({ waiting_position: expected });
          fixedCount++;
        }
      }
    }
  }

  if (found === 0) log('INFO', '无空洞');
  else if (shouldFix('04') && !isDryRun) log('FIX', `已修复 ${found} 处候补序号空洞`);
}

// ── Fix-05: grouped 帖子无 campaign_id ──────────────────────────────────────

async function fix05_groupedNoCampaign() {
  console.log('\n[Fix-05] 检查 grouped 帖子无 campaign_id...');

  const rows = await db('recruitment_posts')
    .where('status', 'grouped')
    .whereNull('campaign_id')
    .select('id', 'title') as Array<Record<string, unknown>>;

  if (rows.length === 0) {
    log('INFO', '无异常数据');
    return;
  }

  issueCount += rows.length;
  for (const row of rows) {
    log('WARN', `帖子 ${row['id']} (${row['title']}) 状态为 grouped 但无 campaign_id`);
  }
  log('INFO', '建议：手动排查上述帖子，确认成团时 campaign 是否正常创建');
}

// ── Fix-06: 已成团帖子中未关闭的残留申请 ────────────────────────────────────

async function fix06_groupedUnclosedApplications() {
  console.log('\n[Fix-06] 检查已成团帖子中残留的 pending/invited/waiting 申请...');

  const rows = await db('recruitment_applications as ra')
    .join('recruitment_posts as rp', 'rp.id', 'ra.post_id')
    .where('rp.status', 'grouped')
    .whereIn('ra.status', ['pending', 'invited', 'waiting'])
    .select('ra.id', 'ra.post_id', 'ra.status') as Array<Record<string, unknown>>;

  if (rows.length === 0) {
    log('INFO', '无残留申请');
    return;
  }

  issueCount += rows.length;
  log('WARN', `发现 ${rows.length} 条残留申请`);

  if (shouldFix('06') && !isDryRun) {
    await db('recruitment_applications')
      .whereIn('id', rows.map((r) => r['id'] as string))
      .update({
        status: 'rejected',
        reject_reason: '招募帖已成团（数据修复）',
        updated_at: db.fn.now(),
      });
    fixedCount += rows.length;
    log('FIX', `已关闭 ${rows.length} 条残留申请`);
  } else if (shouldFix('06')) {
    log('SKIP', `[DRY-RUN] 将关闭 ${rows.length} 条残留申请`);
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('=== 招募数据一致性修复脚本 ===');
  console.log(`模式：${isDryRun ? 'DRY-RUN（只检查，不修改）' : '执行修复'}`);
  console.log(`修复范围：${fixSet.has('all') ? '全部' : [...fixSet].join(', ')}`);

  await fix01_playerCountJoined();
  await fix02_postStatusConsistency();
  await fix03_expiredInvites();
  await fix04_waitingPositionGaps();
  await fix05_groupedNoCampaign();
  await fix06_groupedUnclosedApplications();

  console.log('\n=== 修复汇总 ===');
  console.log(`  发现问题：${issueCount}`);
  console.log(`  已修复：  ${isDryRun ? '0（dry-run 模式）' : fixedCount}`);
  console.log(`  未修复：  ${issueCount - (isDryRun ? 0 : fixedCount)}`);

  if (issueCount === 0) {
    console.log('\n✓ 数据一致性检查通过，无需修复');
  } else if (!isDryRun) {
    console.log(`\n✓ 修复完成，建议重新运行 --dry-run 验证`);
  } else {
    console.log('\n⚠ 以上为 dry-run 结果，去掉 --dry-run 参数执行实际修复');
  }
}

run()
  .catch((err) => {
    console.error('[Fatal]', err);
    process.exit(1);
  })
  .finally(() => db.destroy());
