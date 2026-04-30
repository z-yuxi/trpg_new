/**
 * 机器人账号预设定义
 *
 * 5 个预留机器人账号，UID 1000095–1000099：
 *
 * | UID     | 昵称       | 标签       | 板块偏好          | 人设简述                         |
 * |---------|-----------|-----------|-----------------|--------------------------------|
 * | 1000095 | 探索者-零   | 探索者-零   | tips / share    | 热爱探索新规则系统的老玩家             |
 * | 1000096 | 规则博士    | 规则博士    | tips            | 精通各系统规则，喜欢解答新手疑问          |
 * | 1000097 | 故事编织者   | 故事编织者   | share           | 擅长记录和分享跑团故事的文字爱好者        |
 * | 1000098 | 新手引导员   | 新手引导员   | tips            | 专门帮助新手入坑的热心玩家             |
 * | 1000099 | 茶馆侠客    | 茶馆侠客    | lounge          | 活跃在休闲板块的老顾客，话题广泛          |
 */

export interface BotAccountDef {
  uid: number;
  nickname: string;
  label: string;
  avatar_url: string;
}

export const BOT_ACCOUNT_DEFS: BotAccountDef[] = [
  {
    uid: 1000095,
    nickname: '探索者-零',
    label: '探索者-零',
    avatar_url: '',
  },
  {
    uid: 1000096,
    nickname: '规则博士',
    label: '规则博士',
    avatar_url: '',
  },
  {
    uid: 1000097,
    nickname: '故事编织者',
    label: '故事编织者',
    avatar_url: '',
  },
  {
    uid: 1000098,
    nickname: '新手引导员',
    label: '新手引导员',
    avatar_url: '',
  },
  {
    uid: 1000099,
    nickname: '茶馆侠客',
    label: '茶馆侠客',
    avatar_url: '',
  },
];
