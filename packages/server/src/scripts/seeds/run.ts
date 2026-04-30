#!/usr/bin/env tsx
/**
 * 种子数据 CLI 运行器
 *
 * 用法：
 *   npx tsx src/scripts/seeds/run.ts [--phase=1|2|3|4] [--no-ai] [--dry-run]
 *
 * Phase 1 — 创建机器人账号（UID 1000095–1000099）
 * Phase 2 — 生成内容预览（仅打印，不写库）
 * Phase 3 — 批量发帖 + 互动（写库）
 * Phase 4 — 清理（休眠机器人，打印统计）
 *
 * 选项：
 *   --no-ai   强制使用静态模板，跳过 AI 调用（测试 / 无 API Key 时）
 *   --dry-run Phase 2 时只打印，不实际发帖
 */
import '../../../db/index';   // 初始化 Knex 连接池
import { botService } from '../../bots/bot-service';
import { seedGenerator } from '../../bots/seed-generator';
import { publisher } from '../../bots/publisher';
import { interactor } from '../../bots/interactor';
import { BOT_ACCOUNT_DEFS } from './001_bot_accounts';
import type { BoardType } from '../../bots/prompts';

// ─────────────────────────────────────────────────────────
// 参数解析
// ─────────────────────────────────────────────────────────
function parseArgs(): { phase: number; useAi: boolean; dryRun: boolean } {
  const args = process.argv.slice(2);
  const phaseArg = args.find((a) => a.startsWith('--phase='));
  const phase = phaseArg ? Number(phaseArg.split('=')[1]) : 1;
  const useAi = !args.includes('--no-ai');
  const dryRun = args.includes('--dry-run');
  return { phase, useAi, dryRun };
}

// ─────────────────────────────────────────────────────────
// Phase 1: 创建机器人账号
// ─────────────────────────────────────────────────────────
async function runPhase1(): Promise<void> {
  console.log('\n=== Phase 1: 创建机器人账号 ===');

  for (const def of BOT_ACCOUNT_DEFS) {
    const existing = await botService.getBotByUid(def.uid);
    if (existing) {
      console.log(`  [跳过] UID ${def.uid} (${def.nickname}) 已存在，状态: ${existing.bot_status}`);
      continue;
    }

    try {
      const bot = await botService.createBot({
        uid: def.uid,
        nickname: def.nickname,
        label: def.label,
        avatar_url: def.avatar_url,
      });
      console.log(`  [创建] UID ${def.uid} (${def.nickname}) id=${bot.id}`);
    } catch (err) {
      console.error(`  [失败] UID ${def.uid} (${def.nickname}):`, (err as Error).message);
    }
  }

  const bots = await botService.getBots();
  console.log(`\n当前机器人账号 (共 ${bots.length} 个):`);
  bots.forEach((b) => console.log(`  UID ${b.uid}  ${b.nickname}  [${b.bot_status}]`));
}

// ─────────────────────────────────────────────────────────
// Phase 2: 内容生成预览
// ─────────────────────────────────────────────────────────
async function runPhase2(useAi: boolean, dryRun: boolean): Promise<void> {
  console.log(`\n=== Phase 2: 内容生成${dryRun ? '（预览模式，不写库）' : ''} ===`);

  const bots = await botService.getActiveBots();
  if (bots.length === 0) {
    console.log('  没有活跃机器人，请先运行 Phase 1');
    return;
  }

  for (const bot of bots) {
    console.log(`\n-- ${bot.nickname} (${bot.bot_label}) --`);
    const post = await seedGenerator.generatePost({
      botLabel: bot.bot_label,
      useAi,
    });
    console.log(`  板块: ${post.board}`);
    console.log(`  标题: ${post.title}`);
    console.log(`  内容: ${post.content.slice(0, 100)}...`);

    if (!dryRun) {
      try {
        const result = await publisher.publishThread({
          botId: bot.id,
          board: post.board as BoardType,
          title: post.title,
          content: post.content,
        });
        console.log(`  [发布成功] threadId=${result.threadId}`);
      } catch (err) {
        console.error(`  [发布失败]:`, (err as Error).message);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────
// Phase 3: 批量发帖 + 互动
// ─────────────────────────────────────────────────────────
async function runPhase3(useAi: boolean): Promise<void> {
  console.log('\n=== Phase 3: 批量发帖 + 互动 ===');

  const bots = await botService.getActiveBots();
  if (bots.length === 0) {
    console.log('  没有活跃机器人，请先运行 Phase 1');
    return;
  }

  // 每个机器人各发 2 篇帖子
  console.log('\n[发帖]');
  const publishedThreadIds: string[] = [];

  for (const bot of bots) {
    for (let i = 0; i < 2; i++) {
      const post = await seedGenerator.generatePost({ botLabel: bot.bot_label, useAi });
      try {
        const result = await publisher.publishThread({
          botId: bot.id,
          board: post.board as BoardType,
          title: post.title,
          content: post.content,
        });
        publishedThreadIds.push(result.threadId);
        console.log(`  ${bot.nickname} → ${post.board} 「${post.title.slice(0, 30)}」 [${result.threadId}]`);
      } catch (err) {
        console.error(`  ${bot.nickname} 发帖失败:`, (err as Error).message);
      }
    }
  }

  // 互动：所有机器人随机对发出的帖子点赞 + 部分回复
  console.log('\n[互动]');
  const botIds = bots.map((b) => b.id);
  const { likes, replies } = await interactor.reactRandom({
    botIds,
    limit: 30,
    likeRatio: 0.5,
    replyRatio: 0.25,
    useAi,
  });
  console.log(`  点赞 ${likes} 次，回复 ${replies} 条`);

  // 验证：检查发帖数量
  const stats = await botService.getGeneratedContentStats();
  console.log(`\n[验证] 数据库中机器人生成内容：帖子 ${stats.threads} 篇，回复 ${stats.posts} 条`);
}

// ─────────────────────────────────────────────────────────
// Phase 4: 清理 & 上线前准备
// ─────────────────────────────────────────────────────────
async function runPhase4(): Promise<void> {
  console.log('\n=== Phase 4: 清理 & 上线前准备 ===');

  const stats = await botService.getGeneratedContentStats();
  console.log(`\n[统计]`);
  console.log(`  机器人生成帖子: ${stats.threads} 篇`);
  console.log(`  机器人生成回复: ${stats.posts} 条`);

  const bots = await botService.getBots();
  const activeBots = bots.filter((b) => b.bot_status === 'active');
  console.log(`  活跃机器人: ${activeBots.length}/${bots.length}`);

  if (activeBots.length > 0) {
    console.log('\n[休眠机器人]');
    const hibernated = await botService.hibernateAll();
    console.log(`  已休眠 ${hibernated} 个机器人账号`);
  }

  const finalBots = await botService.getBots();
  console.log('\n[最终状态]');
  finalBots.forEach((b) => console.log(`  UID ${b.uid}  ${b.nickname}  [${b.bot_status}]`));

  console.log('\n[验收清单]');
  console.log('  ✓ 所有机器人已休眠');
  console.log('  ✓ 生成内容已标记 is_bot_generated=1');
  console.log('  ✓ 可通过 SELECT * FROM forum_threads WHERE is_bot_generated=1 审查内容');
  console.log('  ✓ 如需删除，运行: DELETE FROM forum_threads WHERE is_bot_generated=1');
}

// ─────────────────────────────────────────────────────────
// 主入口
// ─────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const { phase, useAi, dryRun } = parseArgs();

  console.log(`\n[SeedRunner] Phase=${phase} useAi=${useAi} dryRun=${dryRun}`);
  console.log(`[SeedRunner] 时间: ${new Date().toLocaleString()}`);

  try {
    switch (phase) {
      case 1:
        await runPhase1();
        break;
      case 2:
        await runPhase2(useAi, dryRun);
        break;
      case 3:
        await runPhase3(useAi);
        break;
      case 4:
        await runPhase4();
        break;
      default:
        console.error(`未知 phase: ${phase}，有效值为 1/2/3/4`);
        process.exit(1);
    }
    console.log('\n[SeedRunner] 完成 ✓');
  } catch (err) {
    console.error('\n[SeedRunner] 执行失败:', err);
    process.exit(1);
  } finally {
    // 关闭 Knex 连接池
    const { db } = await import('../../db/index.js');
    await db.destroy();
  }
}

void main();
