/**
 * SeedGenerator — AI 内容生成器
 *
 * 职责：
 * 1. 调用 DeepSeek API 生成多样性帖子内容
 * 2. 提供静态回退模板（AI 不可用时使用，测试友好）
 * 3. 根据机器人角色标签选择合适的板块和 prompt
 *
 * 使用独立 fetch，不走 ai_usage_log（种子内容不占用用户配额）
 */
import { randomUUID } from 'crypto';
import { logWarn } from '../utils/structured-logger';
import {
  type BoardType,
  type GeneratedPost,
  BOT_BOARD_PREFERENCE,
  getPromptForBoard,
  parsePostResponse,
  REPLY_SYSTEM_PROMPT,
  buildReplyUserPrompt,
} from './prompts';

// ─────────────────────────────────────────────────────────
// DeepSeek 直连（绕过 ai_usage_log，种子专用）
// ─────────────────────────────────────────────────────────
async function callDeepSeekDirect(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未配置');

  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1';
  const model = process.env.DEEPSEEK_FLASH_MODEL ?? 'deepseek-chat';

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.8,  // 提高多样性
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`DeepSeek API 错误 ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? '';
}

// ─────────────────────────────────────────────────────────
// 静态回退模板（测试 / AI 不可用时使用）
// ─────────────────────────────────────────────────────────
const FALLBACK_POSTS: Record<BoardType, GeneratedPost[]> = {
  tips: [
    {
      board: 'tips',
      title: '新手疑问：属性检定和技能检定有什么区别？',
      content: '最近刚入坑 CoC，看规则书看得头晕。属性检定（比如力量检定）和技能检定（攀爬、游泳之类的）到底有什么本质区别？什么情况下用哪个？\n\n我问了一下团里的老玩家，他说通常有对应技能就用技能，没有才用属性，但感觉还是有点模糊。希望有大佬详细解释一下！',
    },
    {
      board: 'tips',
      title: '分享一个让新手快速上手的角色创建流程',
      content: '带过几个新人入坑，总结了一套快速角色创建的流程，分享给大家：\n\n1. 先确定角色背景和性格，这比属性更重要\n2. 根据背景选择职业和核心技能\n3. 分配属性点时优先补强核心技能相关属性\n4. 留一些点数给"意外之喜"的冷门技能\n\n新人往往想把所有属性都堆满，但一个有明确特点的角色比全能角色更好玩。',
    },
    {
      board: 'tips',
      title: 'GM 技巧：如何优雅地处理玩家完全忽视主线的情况',
      content: '上周跑团遇到了经典问题：我精心设计的神秘信封线索，玩家们直接把它当废纸扔了，然后开始调查一个完全随机的路人……\n\n最后我决定顺势而为，把那个路人临时变成了线索中间人。结果玩家们玩得很开心，误打误撞还解开了一个隐藏支线。\n\n所以我的建议是：准备一个"万用中间人"NPC，可以随时插入任何场景，把玩家的脑洞引回主线。',
    },
  ],
  share: [
    {
      board: 'share',
      title: '【跑团日志】那次让全团沉默三秒的角色离世',
      content: '已经过去三个月了，但那个场景还是很清晰。\n\n我们在追查一个邪教组织，我的角色詹姆斯·莫里斯是个老侦探，快退休了，跑这个团也是他最后一个案子。\n\n最后的对决，BOSS 举枪指向了队友，詹姆斯毫不犹豫地扑了过去。骰子滚落——大失败。\n\n GM 没有说话，只是把詹姆斯的立牌轻轻放倒。全桌沉默了大概三秒。\n\n那三秒是我跑团以来最有意义的三秒。',
    },
    {
      board: 'share',
      title: '脑洞玩家实录：用"烤面包机"解决了最终BOSS',
      content: '跑 DND 5e，最终 BOSS 是个恶龙，GM 准备了一个堪称完美的最终战……直到我们的骗徒玩家发言。\n\n"我问向导，附近哪里有卖烤面包机的？"\n\n全场愣住。GM 深吸一口气，说最近的城镇有个铁匠铺……\n\n接下来，骗徒花了二十分钟说服铁匠打造了一个魔法烤面包机，用来"吐出足够干扰恶龙视线的面包屑"。\n\n最终恶龙骰出了感知失败，第一回合没发现我们的输出位。\n\n恶龙死于面包屑。史诗级战役就这样结束了。',
    },
  ],
  lounge: [
    {
      board: 'lounge',
      title: '投票：你跑团时最常扮演什么职业？🎲',
      content: '随便问一下，大家跑团的时候最喜欢玩什么职业或者角色类型？\n\n我自己最爱玩侦探/学者型角色，调查检定拉满那种😂 朋友说我每次都选"最能问问题"的角色，也对哈哈。\n\n欢迎大家来分享！如果有特别的职业组合也可以说说！',
    },
    {
      board: 'lounge',
      title: '线上跑团的你们，用什么工具？',
      content: '最近从线下转线上，感觉工具选择太多了……有用 Roll20 的，有用 Foundry 的，也有直接开腾讯会议骰骰子的🎲\n\n想问问大家现在主要用什么平台？各有什么优缺点？新手友好度怎么样？\n\n感觉我们平台做的挺好的，但也好奇大家的使用体验！',
    },
  ],
};

/** 从某个板块随机取一个静态回退帖 */
function getFallbackPost(board: BoardType): GeneratedPost {
  const posts = FALLBACK_POSTS[board];
  return posts[Math.floor(Math.random() * posts.length)]!;
}

// ─────────────────────────────────────────────────────────
// SeedGenerator
// ─────────────────────────────────────────────────────────
export class SeedGenerator {
  /**
   * 根据机器人角色标签生成一篇帖子。
   * 优先使用 AI 生成；AI 失败时回退到静态模板（记录警告）。
   */
  async generatePost(params: {
    botLabel: string;
    board?: BoardType;
    useAi?: boolean;
  }): Promise<GeneratedPost> {
    const { botLabel, useAi = true } = params;

    // 选择板块
    const preferredBoards = BOT_BOARD_PREFERENCE[botLabel] ?? (['tips', 'share', 'lounge'] as BoardType[]);
    const board: BoardType = params.board ?? (preferredBoards[Math.floor(Math.random() * preferredBoards.length)]!);

    if (!useAi || !process.env.DEEPSEEK_API_KEY) {
      return getFallbackPost(board);
    }

    const seed = randomUUID();
    const { system, buildUser } = getPromptForBoard(board);
    const userPrompt = buildUser(seed);

    try {
      const raw = await callDeepSeekDirect(system, userPrompt);
      const parsed = parsePostResponse(raw);
      if (parsed) {
        return { ...parsed, board };
      }
      logWarn('SEED_GENERATOR_PARSE_FAILED', 'AI 返回解析失败，使用静态回退');
      return getFallbackPost(board);
    } catch (err) {
      logWarn('SEED_GENERATOR_AI_CALL_FAILED', 'AI 调用失败，使用静态回退', { error: (err as Error).message });
      return getFallbackPost(board);
    }
  }

  /**
   * 生成一条回复内容。
   * AI 不可用时返回通用回复文本。
   */
  async generateReply(params: {
    threadTitle: string;
    threadContent: string;
    useAi?: boolean;
  }): Promise<string> {
    const { threadTitle, threadContent, useAi = true } = params;

    if (!useAi || !process.env.DEEPSEEK_API_KEY) {
      return this.getFallbackReply(threadTitle);
    }

    const seed = randomUUID();
    const userPrompt = buildReplyUserPrompt(threadTitle, threadContent, seed);

    try {
      const raw = await callDeepSeekDirect(REPLY_SYSTEM_PROMPT, userPrompt);
      return raw.trim().slice(0, 500) || this.getFallbackReply(threadTitle);
    } catch (err) {
      logWarn('SEED_GENERATOR_REPLY_AI_FAILED', '回复 AI 调用失败，使用静态回退', { error: (err as Error).message });
      return this.getFallbackReply(threadTitle);
    }
  }

  private getFallbackReply(threadTitle: string): string {
    const replies = [
      `感谢分享！"${threadTitle.slice(0, 20)}"这个话题很有意思，我也有类似的经历。`,
      '写得很详细，学到了新东西！收藏备用🎲',
      '完全同意楼主的观点，我们团上周也遇到了类似情况。',
      '哈哈太真实了，感觉每个跑团团都发生过这种事！',
      '谢谢分享，新手玩家表示受益匪浅。',
      '这个技巧之前没想到，下次跑团一定试试！',
      '非常有共鸣！我的团也出现过这种脑洞，超级有意思。',
      '认真记下来了，感谢大佬指路👍',
    ];
    return replies[Math.floor(Math.random() * replies.length)]!;
  }

  /**
   * 批量生成帖子（用于 Phase 3 批量种子任务）
   */
  async generateBatch(params: {
    botLabel: string;
    count: number;
    boards?: BoardType[];
    useAi?: boolean;
  }): Promise<GeneratedPost[]> {
    const results: GeneratedPost[] = [];
    const boards = params.boards ?? (['tips', 'share', 'lounge'] as BoardType[]);

    for (let i = 0; i < params.count; i++) {
      const board = boards[i % boards.length];
      const post = await this.generatePost({
        botLabel: params.botLabel,
        board,
        useAi: params.useAi,
      });
      results.push(post);
    }

    return results;
  }
}

export const seedGenerator = new SeedGenerator();
