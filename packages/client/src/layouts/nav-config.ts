import { computed } from 'vue';
import { useAuthStore } from '../stores/auth-store';

export interface NavTab {
  name: string;
  label: string;
  icon: string;
  path: string;
}

/** 固定的 4 个 tab（不含动态中间 tab） */
const TAB_EXPLORE: NavTab = { name: 'Explore', label: '探索', icon: 'icon-ruleset', path: '/explore' };
const TAB_RECRUIT: NavTab = { name: 'Recruit', label: '招募', icon: 'icon-recruit', path: '/recruit' };
const TAB_DISCUSS: NavTab = { name: 'Discuss', label: '讨论', icon: 'icon-message', path: '/discuss' };
const TAB_TUANTU: NavTab  = { name: 'Tuantu',  label: '叙途', icon: 'icon-journey', path: '/tuantu' };

/** 第 3 个（中间）tab — 玩家/主持人 */
const TAB_ROOMS: NavTab = { name: 'Rooms',         label: '房间',  icon: 'icon-list',    path: '/rooms' };
/** 第 3 个（中间）tab — 创作者 */
const TAB_STUDIO: NavTab = { name: 'CreatorStudio', label: '创作台', icon: 'icon-studio', path: '/creator' };

/**
 * 返回当前应显示的 5 个底部导航 tab（顺序固定，中间 tab 随身份动态切换）
 */
export function useNavTabs() {
  const auth = useAuthStore();

  const middleTab = computed<NavTab>(() =>
    auth.activeIdentity === 'creator' && auth.isCreator ? TAB_STUDIO : TAB_ROOMS,
  );

  const tabs = computed<NavTab[]>(() => [
    TAB_EXPLORE,
    TAB_RECRUIT,
    middleTab.value,
    TAB_DISCUSS,
    TAB_TUANTU,
  ]);

  return { tabs };
}
