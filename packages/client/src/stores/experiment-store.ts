/**
 * Experiment Store — 存储 A/B 实验分配结果
 *
 * 在应用初始化时（App.vue onMounted 或 router.beforeEach）调用 initialize()，
 * 一次性从 /api/experiments/assignments 拉取全部 running 实验分配并缓存。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../utils/api';

export const useExperimentStore = defineStore('experiment', () => {
  /** Map: experimentName → variantId */
  const assignments = ref<Record<string, string>>({});
  const initialized = ref(false);

  async function initialize(): Promise<void> {
    if (initialized.value) return;
    try {
      const data = await api.get<Record<string, string>>('/experiments/assignments');
      assignments.value = data ?? {};
    } catch {
      // 实验系统不影响主功能，静默处理
      assignments.value = {};
    } finally {
      initialized.value = true;
    }
  }

  /** 刷新（用户登录/登出时调用） */
  function reset(): void {
    assignments.value = {};
    initialized.value = false;
  }

  return { assignments, initialized, initialize, reset };
});
