<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string;
  iconName?: string;
  title: string;
  description?: string;
  actionText?: string;
  actionRoute?: string;
}>(), {
  icon: '📭',
});

const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">
      <svg v-if="iconName" class="state-svg" aria-hidden="true"><use :href="`#${iconName}`" /></svg>
      <template v-else>{{ icon }}</template>
    </div>
    <div class="empty-title">{{ title }}</div>
    <div v-if="description" class="empty-desc">{{ description }}</div>
    <router-link
      v-if="actionText && actionRoute"
      :to="actionRoute"
      class="empty-action"
    >{{ actionText }}</router-link>
    <button
      v-else-if="actionText"
      class="empty-action"
      @click="emit('action')"
    >{{ actionText }}</button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-4);
  text-align: center;
  gap: var(--space-3);
}
.empty-icon { font-size: 48px; line-height: 1; display: flex; align-items: center; justify-content: center; }
.state-svg { width: 64px; height: 64px; color: var(--text-muted); }
.empty-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
}
.empty-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  max-width: 280px;
  line-height: 1.6;
}
.empty-action {
  display: inline-flex;
  align-items: center;
  padding: var(--space-2) var(--space-5);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: opacity var(--transition-fast);
}
.empty-action:hover { opacity: 0.85; }
</style>
