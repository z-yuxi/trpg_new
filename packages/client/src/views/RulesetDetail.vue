<script setup lang="ts">
/**
 * RulesetDetail — 规则包叙阅器路由页
 * 路由：/ruleset/:id
 * 使用叙阅器内核（ViewerShell），扩展规则包专属插件：
 *   - 房规引用 §14.3（将规则包条款导入团房规）
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ViewerShell from '../components/viewer/ViewerShell.vue';
import SvgIcon from '../components/SvgIcon.vue';

const route = useRoute();
const rulesetId = computed(() => String(route.params['id'] ?? ''));
</script>

<template>
  <ViewerShell asset-type="ruleset" :asset-id="rulesetId">

    <!-- 规则包专属：右侧插件——房规引用 §14.3 -->
    <template #plugin-sidebar="{ asset, perm }">
      <div
        v-if="asset && (perm === 'acquired' || perm === 'author')"
        class="ruleset-sidebar-panel"
      >
        <h3 class="ruleset-sidebar-panel__head">规则包操作</h3>
        <button class="ruleset-sidebar-panel__btn" disabled>
          <!-- TODO: 房规引用功能待团房间设置接口就绪后实现 -->
          <SvgIcon name="icon-clipboard" :size="16" />
          导入团房规
        </button>
        <p class="ruleset-sidebar-panel__hint">将规则条款一键导入指定团的房间规则</p>
      </div>
    </template>

  </ViewerShell>
</template>

<style lang="scss" scoped>
.ruleset-sidebar-panel {
  background: var(--surface-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg, 8px);
  padding: var(--space-4);
  margin-bottom: var(--space-4);

  &__head {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0 0 var(--space-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    border-radius: var(--radius-md, 6px);
    background: var(--btn-secondary-bg);
    color: var(--btn-secondary-text);
    border: 1px solid var(--btn-secondary-border);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    margin-bottom: var(--space-2);

    &:hover:not(:disabled) { background: var(--surface-hover); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  &__hint {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.5;
    text-align: center;
  }
}
</style>
