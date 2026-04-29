<script setup lang="ts">
/**
 * 我的招募面板（子组件）
 *
 * 显示当前用户"我发布的招募"和"我的申请"两栏，
 * 从 RecruitSection.vue 中拆出，保持单组件职责单一。
 */
import RecruitmentBoard from './RecruitmentBoard.vue';

interface RulesetOption {
  id: string;
  name: string;
  character_card_schema?: unknown;
  recruitment_fields?: unknown;
}

const props = defineProps<{
  rulesets: RulesetOption[];
  boardVersion?: number;
}>();
</script>

<template>
  <div class="mine-grid">
    <div class="mine-section">
      <div class="mine-head">
        <h3>我发布的招募</h3>
        <span>集中管理自己开的帖</span>
      </div>
      <RecruitmentBoard
        :key="`mine-posted-${props.boardVersion ?? 1}`"
        mine="posted"
        :rulesets="props.rulesets"
      />
    </div>
    <div class="mine-section">
      <div class="mine-head">
        <h3>我的申请</h3>
        <span>跟踪 pending / invited / confirmed / waiting / rejected 状态</span>
      </div>
      <RecruitmentBoard
        :key="`mine-applied-${props.boardVersion ?? 1}`"
        mine="applied"
        :rulesets="props.rulesets"
      />
    </div>
  </div>
</template>

<style scoped>
.mine-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}
.mine-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
}
.mine-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}
.mine-head h3 { margin: 0; font-size: var(--text-lg); }
.mine-head span { color: var(--text-muted); font-size: var(--text-sm); }

@media (max-width: 640px) {
  .mine-grid { grid-template-columns: 1fr; }
  .mine-head { flex-direction: column; align-items: flex-start; }
}
</style>
