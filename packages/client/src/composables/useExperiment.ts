/**
 * useExperiment — A/B 实验前端 Composable（附录 O）
 *
 * 用法：
 *   const { variant, track } = useExperiment('recruit_btn_text')
 *
 *   // 在模板中
 *   <TButton>{{ variant.value === 'trt' ? '快速加入' : '申请加入' }}</TButton>
 *   <TButton @click="track('convert')">...</TButton>
 *
 * - 分配结果从全局 experiment store 中读取（首次从服务端拉取）
 * - track() 自动带 experiment_name + variant，发送到 /api/experiments/track
 */
import { computed, onMounted, type ComputedRef } from 'vue';
import { useExperimentStore } from '../stores/experiment-store';
import { api } from '../utils/api';

export interface UseExperimentReturn {
  /** 当前分配的变体 ID，未分配或实验未运行时返回 null */
  variant: ComputedRef<string | null>;
  /**
   * 追踪实验事件
   * @param eventType 'expose' | 'convert' | 'custom'
   * @param eventName 自定义事件名（eventType=custom 时使用）
   */
  track(
    eventType: 'expose' | 'convert' | 'custom',
    eventName?: string,
    properties?: Record<string, unknown>,
  ): void;
}

export function useExperiment(experimentName: string): UseExperimentReturn {
  const store = useExperimentStore();

  // 首次使用时触发初始化
  onMounted(() => {
    store.initialize();
  });

  const variant = computed<string | null>(() => store.assignments[experimentName] ?? null);

  function track(
    eventType: 'expose' | 'convert' | 'custom',
    eventName?: string,
    properties?: Record<string, unknown>,
  ): void {
    if (!variant.value) return; // 未分配不追踪
    api
      .post('/experiments/track', {
        experiment_name: experimentName,
        event_type: eventType,
        event_name: eventName,
        properties,
      })
      .catch(() => null); // 静默失败
  }

  return { variant, track };
}
