import { computed } from 'vue';
import { useAuthStore } from '../stores/auth-store';

export type Identity = 'player' | 'creator';

/**
 * 身份切换 composable
 * - 读取 activeIdentity
 * - 提供 switchIdentity() — 非创作者调用不生效
 * - isCreatorMode：当前激活身份是否为创作者
 */
export function useIdentity() {
  const auth = useAuthStore();

  const activeIdentity = computed(() => auth.activeIdentity);
  const isCreatorMode = computed(() => auth.activeIdentity === 'creator' && auth.isCreator);

  function switchIdentity(id: Identity): void {
    auth.setActiveIdentity(id);
  }

  function toggleIdentity(): void {
    const next: Identity = auth.activeIdentity === 'creator' ? 'player' : 'creator';
    auth.setActiveIdentity(next);
  }

  return { activeIdentity, isCreatorMode, switchIdentity, toggleIdentity };
}
