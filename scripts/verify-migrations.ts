#!/usr/bin/env node
/**
 * 数据库迁移正反向验证脚本
 *
 * 功能：
 *  1. 扫描 migrations 目录，验证每个文件同时导出 up() 和 down()
 *  2. 检查文件命名规范（NNN_snake_case.ts）
 *  3. 检查序号无重复、无间隙
 *
 * 此脚本在 CI 中作为轻量静态检查，不连接真实数据库。
 * 真实的 migrate:up / migrate:down 验证依赖集成测试环境。
 *
 * 退出码：
 *   0 — 全部通过
 *   1 — 发现问题
 */

import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, 'src/db/migrations');
const FILE_PATTERN = /^(\d{3})_[a-z0-9_]+\.ts$/;

interface CheckResult {
  ok: boolean;
  errors: string[];
}

function checkMigrations(): CheckResult {
  const errors: string[] = [];

  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.ts'));
  } catch {
    errors.push(`无法读取迁移目录: ${MIGRATIONS_DIR}`);
    return { ok: false, errors };
  }

  // ── 1. 文件命名规范检查 ──────────────────────────────────────────────────
  const invalidNames = files.filter((f) => !FILE_PATTERN.test(f));
  if (invalidNames.length > 0) {
    errors.push(`命名不规范（应为 NNN_snake_case.ts）: ${invalidNames.join(', ')}`);
  }

  // ── 2. 序号提取与重复检查（已知历史重复列入白名单，不阻断 CI） ────────────
  // NOTE: 012_* 与 040_* 的重复序号为历史遗留，已在 DB 中记录。
  // 禁止新增重复，旧重复不影响 CI 通过。
  const KNOWN_DUPLICATE_FILES = new Set([
    '012_character_instance_fields.ts',
    '012_recruitment_metadata.ts',
    '040_module_snapshots.ts',
    '040_payment_audit_log.ts',
  ]);
  const numbered = files
    .map((f) => ({ file: f, num: parseInt(f.slice(0, 3), 10) }))
    .filter((x) => !isNaN(x.num));

  const numMap = new Map<number, string[]>();
  for (const { file, num } of numbered) {
    if (!numMap.has(num)) numMap.set(num, []);
    numMap.get(num)!.push(file);
  }
  for (const [num, dupes] of numMap) {
    if (dupes.length > 1) {
      // 如果所有重复文件均在白名单内，降级为警告
      const allKnown = dupes.every((f) => KNOWN_DUPLICATE_FILES.has(f));
      if (allKnown) {
        console.warn(`⚠️  序号 ${String(num).padStart(3, '0')} 有历史遗留重复（白名单豁免）: ${dupes.join(', ')}`);
      } else {
        errors.push(`序号 ${String(num).padStart(3, '0')} 重复: ${dupes.join(', ')}`);
      }
    }
  }

  // ── 3. 序号连续性检查（允许第一个不是 001） ─────────────────────────────
  const sortedNums = [...numMap.keys()].sort((a, b) => a - b);
  for (let i = 1; i < sortedNums.length; i++) {
    const expected = sortedNums[i - 1] + 1;
    const actual = sortedNums[i];
    if (actual !== expected) {
      errors.push(`迁移序号不连续：${String(sortedNums[i-1]).padStart(3,'0')} 之后缺少 ${String(expected).padStart(3,'0')}，下一个是 ${String(actual).padStart(3,'0')}`);
    }
  }

  // ── 4. 每个文件必须同时导出 up 和 down ──────────────────────────────────
  for (const file of files) {
    if (!FILE_PATTERN.test(file)) continue;
    const fullPath = join(MIGRATIONS_DIR, file);
    let content: string;
    try {
      content = readFileSync(fullPath, 'utf-8');
    } catch {
      errors.push(`无法读取文件: ${file}`);
      continue;
    }

    // 宽松匹配：export async function up / export function up / export { up, down }
    const hasUp = /export\s+(async\s+)?function\s+up\b/.test(content)
      || /export\s*\{[^}]*\bup\b/.test(content);
    const hasDown = /export\s+(async\s+)?function\s+down\b/.test(content)
      || /export\s*\{[^}]*\bdown\b/.test(content);

    if (!hasUp) errors.push(`${file}: 缺少 export function up()`);
    if (!hasDown) errors.push(`${file}: 缺少 export function down()（回滚必须实现）`);
  }

  return { ok: errors.length === 0, errors };
}

const result = checkMigrations();

if (result.ok) {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => FILE_PATTERN.test(f));
  console.log(`✅ 迁移文件验证通过（${files.length} 个文件，正反向均已实现）`);
  process.exit(0);
} else {
  console.error(`❌ 迁移验证失败：发现 ${result.errors.length} 个问题\n`);
  for (const err of result.errors) {
    console.error(`  · ${err}`);
  }
  process.exit(1);
}
