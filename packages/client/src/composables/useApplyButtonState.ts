/**
 * 申请加入招募帖的按钮状态机（附录02 §3.1）
 *
 * 使用方：所有招募帖卡片与详情页操作按钮，必须通过此函数生成状态，
 * 严禁在组件中硬编码 if-else 逻辑。
 */

export interface ApplyButtonState {
  text: string;
  disabled: boolean;
  /**
   * null      — 无可执行操作
   * apply     — 申请加入（弹申请表单或跳详情页）
   * applyWaitlist — 加入候补
   * manage    — 管理招募（GM 专用）
   * spectate  — 观看直播（成团后开放 OB）
   * showLogin — 未登录拦截
   * confirm   — 玩家确认入团（inline 操作）
   * viewReason— 查看拒绝原因
   */
  action:
    | 'apply'
    | 'applyWaitlist'
    | 'manage'
    | 'spectate'
    | 'showLogin'
    | 'confirm'
    | 'viewReason'
    | null;
  extra?: {
    /** invited 状态剩余确认秒数（由调用方计算传入） */
    countdown?: number;
    /** waiting 状态候补序号 */
    position?: number;
  };
}

export function getApplyButtonState({
  applicationStatus,
  recruitmentStatus,
  isGM,
  isFull,
  allowSpectate,
  isLoggedIn,
}: {
  applicationStatus: 'none' | 'pending' | 'invited' | 'confirmed' | 'waiting' | 'rejected';
  recruitmentStatus: 'draft' | 'open' | 'full' | 'grouped' | 'dissolved' | 'closed' | 'archived';
  isGM: boolean;
  isFull: boolean;
  allowSpectate: boolean;
  isLoggedIn: boolean;
}): ApplyButtonState {
  // 1. 未登录 → 引导登录（不区分帖子状态）
  if (!isLoggedIn) {
    return { text: '申请加入', disabled: false, action: 'showLogin' };
  }

  // 2. 已成团 → 按 OB 权限分流
  if (recruitmentStatus === 'grouped') {
    if (allowSpectate && !isGM) {
      return { text: '观看直播', disabled: false, action: 'spectate' };
    }
    return { text: '已成团', disabled: true, action: null };
  }

  // 3. 终止态（已关闭 / 已解散 / 已归档）
  if (['closed', 'dissolved', 'archived'].includes(recruitmentStatus)) {
    return { text: '已结束', disabled: true, action: null };
  }

  // 4. 草稿（正常不应出现在列表，防御性处理）
  if (recruitmentStatus === 'draft') {
    return { text: '未发布', disabled: true, action: null };
  }

  // 5. 当前用户是发帖 GM → 管理入口
  if (isGM) {
    return { text: '管理招募', disabled: false, action: 'manage' };
  }

  // 6. 按申请状态分流
  switch (applicationStatus) {
    case 'confirmed':
      return { text: '已加入', disabled: true, action: null };

    case 'invited':
      return { text: '确认入团', disabled: false, action: 'confirm' };

    case 'pending':
      return { text: '已申请', disabled: true, action: null };

    case 'waiting':
      return { text: '候补中', disabled: true, action: null };

    case 'rejected':
      return { text: '申请被拒', disabled: true, action: 'viewReason' };

    case 'none':
    default: {
      // 有剩余席位
      if (recruitmentStatus === 'open' && !isFull) {
        return { text: '申请加入', disabled: false, action: 'apply' };
      }
      // 满员（open + full 均可候补）
      if (isFull || recruitmentStatus === 'full') {
        return { text: '加入候补', disabled: false, action: 'applyWaitlist' };
      }
      return { text: '不可用', disabled: true, action: null };
    }
  }
}
