#!/usr/bin/env node
/**
 * 术语守卫脚本（附录 02 §二）
 *
 * 扫描 packages/**\/*.{ts,tsx,vue} 中的禁止词汇，发现即报错退出（CI 失败）。
 *
 * 禁止规则分两类：
 *  1. UI文案违规：仅检查 <template>、字符串字面量、JSX 文本（中文词汇）
 *  2. 代码命名违规：检查变量名、函数名中的错误术语（英文词汇）
 *
 * 使用方式：
 *   node scripts/lint-terminology.js
 *   tsx scripts/lint-terminology.ts     # 配合 tsx 工具
 *
 * 退出码：
 *   0 — 无违规
 *   1 — 发现违规
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * ROOT 取命令运行目录（pnpm scripts 从 workspace 根执行）。
 * 避免使用 import.meta.url / __dirname，确保 tsx / ts-node / node 均可执行。
 */
const ROOT = process.cwd();

// ─────────────────────────────────────────────────────────────────────────────
// 禁止词汇列表（来源：附录 02 §二 术语词典）
// ─────────────────────────────────────────────────────────────────────────────

interface ForbiddenRule {
  /** 正则匹配模式 */
  pattern: RegExp;
  /** 禁止原因 */
  reason: string;
  /** 允许在哪些文件扩展名中出现（白名单，空 = 全部禁止） */
  allowedExtensions?: string[];
  /** 跳过包含该注释标记的行 */
  skipIfLineContains?: string[];
}

const FORBIDDEN_RULES: ForbiddenRule[] = [
  // ── UI 文案：中文禁止词（仅检查字符串/模板区域） ──────────────────────────
  {
    pattern: /['"` >]人物卡['"`<]/u,
    reason: '禁止词"人物卡"，应使用"角色卡"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  {
    pattern: /['"` >]KP['"`<\s]/u,
    reason: '禁止词"KP"，应使用"GM"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  {
    pattern: /['"` >]DM['"`<\s]/u,
    reason: '禁止词"DM"，UI文案中禁止使用"DM"，应使用"GM"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  {
    pattern: /['"` >]主持人['"`<]/u,
    reason: '禁止词"主持人"，应使用"GM"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  {
    pattern: /['"` >]组队['"`<]/u,
    reason: '禁止词"组队"，应使用"招募"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  {
    pattern: /['"` >]开黑['"`<]/u,
    reason: '禁止词"开黑"，应使用"招募"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  {
    pattern: /['"` >]发车['"`<]/u,
    reason: '禁止词"发车"，应使用"招募"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  {
    pattern: /['"` >]约局['"`<]/u,
    reason: '禁止词"约局"，应使用"招募"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  {
    pattern: /['"` >]开团['"`<]/u,
    reason: '禁止词"开团"，应使用"创建房间"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  {
    pattern: /['"` >]建团['"`<]/u,
    reason: '禁止词"建团"，应使用"创建房间"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  {
    pattern: /['"` >]参团['"`<]/u,
    reason: '禁止词"参团"，应使用"加入房间"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  {
    pattern: /['"` >]进团['"`<]/u,
    reason: '禁止词"进团"，应使用"加入房间"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  {
    pattern: /['"` >]开房['"`<]/u,
    reason: '禁止词"开房"，应使用"创建房间"',
    skipIfLineContains: ['// terminology-ok', '# terminology-ok'],
  },
  // ── 代码命名：英文禁止词（变量/函数/接口名中） ─────────────────────────────
  {
    // 匹配 characterCard 作为完整词（严禁出现在后端 API 字段）
    pattern: /\bcharacterCard\b/,
    reason: '后端/API字段禁止使用"characterCard"，应使用"character_sheet"',
    // 仅检查服务端文件
    allowedExtensions: ['.vue', '.tsx'],
    skipIfLineContains: ['// terminology-ok'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 扫描目标目录
// ─────────────────────────────────────────────────────────────────────────────

const SCAN_DIRS = [
  join(ROOT, 'packages/client/src'),
  join(ROOT, 'packages/server/src'),
  join(ROOT, 'packages/shared/src'),
];

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.vue']);

// ─────────────────────────────────────────────────────────────────────────────
// 文件遍历
// ─────────────────────────────────────────────────────────────────────────────

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        // 跳过 node_modules 和 __tests__ 中的测试文件（测试中可能需要引用禁止词做断言）
        if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
        results.push(...walkFiles(fullPath));
      } else if (SCAN_EXTENSIONS.has('.' + entry.split('.').pop()!)) {
        results.push(fullPath);
      }
    }
  } catch {
    // 目录不存在时跳过
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 主扫描逻辑
// ─────────────────────────────────────────────────────────────────────────────

interface Violation {
  file: string;
  line: number;
  content: string;
  reason: string;
}

function scan(): Violation[] {
  const violations: Violation[] = [];

  for (const dir of SCAN_DIRS) {
    const files = walkFiles(dir);
    for (const file of files) {
      const ext = '.' + file.split('.').pop()!;
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (const rule of FORBIDDEN_RULES) {
        // 若规则限定了允许的扩展名，且当前文件扩展名不在禁止列表中，跳过
        if (rule.allowedExtensions && rule.allowedExtensions.includes(ext)) continue;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // 跳过允许标记的行
          if (rule.skipIfLineContains?.some((marker) => line.includes(marker))) continue;
          // 跳过纯注释行（// 和 * 开头）
          const trimmed = line.trimStart();
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) continue;

          if (rule.pattern.test(line)) {
            violations.push({
              file: relative(ROOT, file),
              line: i + 1,
              content: line.trim().slice(0, 120),
              reason: rule.reason,
            });
          }
        }
      }
    }
  }

  return violations;
}

// ─────────────────────────────────────────────────────────────────────────────
// 入口
// ─────────────────────────────────────────────────────────────────────────────

const violations = scan();

if (violations.length === 0) {
  console.log('✅ 术语守卫：未发现违规词汇');
  process.exit(0);
} else {
  console.error(`❌ 术语守卫：发现 ${violations.length} 处违规\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    原因：${v.reason}`);
    console.error(`    内容：${v.content}`);
    console.error('');
  }
  console.error('请修正以上违规后重新提交。如需豁免某行，可在行尾添加注释：// terminology-ok');
  process.exit(1);
}
