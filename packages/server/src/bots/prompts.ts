/**
 * prompts.ts — 机器人内容生成 Prompt 模板
 *
 * 覆盖三个版块、5 个机器人角色：
 *   tips  板块 → 规则/技巧讨论帖
 *   share 板块 → 跑团故事/日志帖
 *   lounge板块 → 轻松闲聊帖
 *
 * 每个模板包含：
 *   systemPrompt  — 机器人角色设定
 *   userPrompt(seed) — 随机性注入，确保多样性
 *   parseResponse(raw) — 从 AI 输出解析 {title, content}
 */

export type BoardType = 'tips' | 'share' | 'lounge';

export interface GeneratedPost {
  title: string;
  content: string;
  board: BoardType;
}

// ─────────────────────────────────────────────────────────
// 角色标签 → 板块偏好映射
// ─────────────────────────────────────────────────────────
export const BOT_BOARD_PREFERENCE: Record<string, BoardType[]> = {
  '规则博士':   ['tips'],
  '探索者-零':  ['tips', 'share'],
  '故事编织者': ['share'],
  '新手引导员': ['tips'],
  '茶馆侠客':   ['lounge'],
};

// ─────────────────────────────────────────────────────────
// tips 板块：规则讨论 / 技巧分享
// ─────────────────────────────────────────────────────────
export const TIPS_SYSTEM_PROMPT = `
你是一个 TRPG（桌面角色扮演游戏）玩家社区的资深玩家。
你的任务是发一篇真实、自然的论坛帖子，内容关于 TRPG 规则讨论、游戏技巧或新手疑问。
要求：
1. 标题简洁，15–30 字，口语化，真实玩家风格
2. 正文 150–400 字，分 2–3 段，可以有具体规则细节
3. 内容可选：克苏鲁神话/CoC/DND/FATE/剑网3/原创规则系统
4. 避免营销感，像真实玩家在交流
5. 只输出 JSON：{"title":"...", "content":"..."}，不要任何其他文字
`.trim();

export function buildTipsUserPrompt(seed: string): string {
  const topics = [
    '新手理解属性检定的常见困惑',
    '如何让对抗检定更公平',
    'GM 如何平衡剧情与规则',
    '跑团前置准备清单',
    '一次失败骰子带来的精彩回忆',
    '规则边界情况处理技巧',
    '道具卡效果判定争议',
    '角色死亡处理方案',
    '如何设计合理的副本难度',
    '跑团沉浸感提升小技巧',
  ];
  const topic = topics[Math.abs(hashStr(seed)) % topics.length];
  return `请以"${topic}"为核心写一篇讨论帖。随机种子：${seed}`;
}

// ─────────────────────────────────────────────────────────
// share 板块：跑团日志 / 故事帖
// ─────────────────────────────────────────────────────────
export const SHARE_SYSTEM_PROMPT = `
你是一名热爱写作的 TRPG 玩家，擅长记录跑团中的精彩瞬间与故事。
你的任务是写一篇跑团日志或故事帖，分享在桌游里发生的真实（或虚构）冒险。
要求：
1. 标题有代入感，20–40 字
2. 正文 200–500 字，有场景描写和角色对话
3. 风格可以是：悬疑恐怖/奇幻冒险/温馨日常/喜剧意外
4. 结尾可以有感想、讨论邀请
5. 只输出 JSON：{"title":"...", "content":"..."}，不要任何其他文字
`.trim();

export function buildShareUserPrompt(seed: string): string {
  const scenarios = [
    '一次出乎意料的大成功骰',
    '玩家角色与 NPC 产生深厚羁绊',
    '全员大失败导致的爆笑结局',
    '调查员第一次接触神话存在',
    '一场惊心动魄的最终决战',
    '角色意外揭露了 GM 精心设计的伏笔',
    '团队分裂又重聚的感人时刻',
    '玩家出乎意料的脑洞解法',
    '主线剧情中藏着的温柔支线',
    '一场让所有人都沉默了的角色死亡',
  ];
  const scenario = scenarios[Math.abs(hashStr(seed)) % scenarios.length];
  return `请以"${scenario}"为主题写一篇跑团故事分享帖。随机种子：${seed}`;
}

// ─────────────────────────────────────────────────────────
// lounge 板块：闲聊 / 轻松话题
// ─────────────────────────────────────────────────────────
export const LOUNGE_SYSTEM_PROMPT = `
你是一个活跃的 TRPG 玩家社区成员，喜欢在休闲版块发轻松话题。
你的任务是发一篇闲聊帖或小调查，话题和 TRPG 有关但轻松随意。
要求：
1. 标题轻松有趣，可以有疑问句或投票感，15–25 字
2. 正文 100–250 字，口语化，可以有 emoji 🎲
3. 内容可以是：最喜欢的规则系统、跑团小习惯、角色名字背后的故事、跑团食物话题等
4. 鼓励其他玩家评论分享
5. 只输出 JSON：{"title":"...", "content":"..."}，不要任何其他文字
`.trim();

export function buildLoungeUserPrompt(seed: string): string {
  const topics = [
    '你最喜欢的骰子是什么颜色',
    '跑团时的必备零食是什么',
    '你给角色起名字有什么习惯',
    '最想体验的 TRPG 规则系统',
    '跑团到最晚到什么时间',
    '玩过最难忘的 NPC 是谁',
    '让你印象最深的 GM 技巧',
    '如何说服朋友入坑 TRPG',
    '你的第一个 TRPG 角色是什么职业',
    '线上跑团和线下跑团你更喜欢哪个',
  ];
  const topic = topics[Math.abs(hashStr(seed)) % topics.length];
  return `请以"${topic}"为话题发一篇闲聊帖。随机种子：${seed}`;
}

// ─────────────────────────────────────────────────────────
// 回复 Prompt（通用）
// ─────────────────────────────────────────────────────────
export const REPLY_SYSTEM_PROMPT = `
你是一个真实的 TRPG 玩家，正在阅读社区论坛帖子并回复。
你的回复要自然、真诚，有实质内容，不超过 150 字。
只输出回复正文，不要 JSON，不要任何额外格式。
`.trim();

export function buildReplyUserPrompt(threadTitle: string, threadContent: string, seed: string): string {
  const preview = threadContent.slice(0, 200);
  return `帖子标题：${threadTitle}\n帖子内容（节选）：${preview}\n\n请写一条真实的玩家回复。随机种子：${seed}`;
}

// ─────────────────────────────────────────────────────────
// 通用：解析 AI 返回的 JSON
// ─────────────────────────────────────────────────────────
export function parsePostResponse(raw: string): { title: string; content: string } | null {
  try {
    // 去除 Markdown 代码块包裹
    const cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (
      typeof parsed === 'object' && parsed !== null &&
      'title' in parsed && typeof (parsed as Record<string, unknown>)['title'] === 'string' &&
      'content' in parsed && typeof (parsed as Record<string, unknown>)['content'] === 'string'
    ) {
      const p = parsed as { title: string; content: string };
      return {
        title: p.title.slice(0, 200).trim(),
        content: p.content.slice(0, 5000).trim(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** 根据板块返回对应的 system prompt 和 user prompt builder */
export function getPromptForBoard(board: BoardType): {
  system: string;
  buildUser: (seed: string) => string;
} {
  switch (board) {
    case 'tips':   return { system: TIPS_SYSTEM_PROMPT,   buildUser: buildTipsUserPrompt };
    case 'share':  return { system: SHARE_SYSTEM_PROMPT,  buildUser: buildShareUserPrompt };
    case 'lounge': return { system: LOUNGE_SYSTEM_PROMPT, buildUser: buildLoungeUserPrompt };
  }
}
