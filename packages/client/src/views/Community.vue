<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import TButton from '../components/base/TButton.vue';
import SvgIcon from '../components/SvgIcon.vue';

const route = useRoute();
const router = useRouter();

const tabs = [
  { key: 'recruit', label: '招募板', icon: 'icon-recruit', to: '/community/recruit' },
  { key: 'discuss', label: '讨论区', icon: 'icon-message', to: '/community/forum/lounge' },
  { key: 'qa', label: '规则问答', icon: 'icon-help-circle', to: '/community/forum/rules' },
] as const;

const activeTab = computed(() => {
  if (route.path.startsWith('/community/forum/rules')) return 'qa';
  if (route.path.startsWith('/community/forum/')) return 'discuss';
  if (route.path.startsWith('/community/recruit')) return 'recruit';
  return 'recruit';
});

function navigateTab(target: (typeof tabs)[number]) {
  if (route.path === target.to) return;
  router.push(target.to);
}
</script>

<template>
  <div class="community">
    <!-- 社区 Banner（背景层） -->
    <div class="community-banner">
      <div class="banner-content">
        <h1 class="banner-title">社区</h1>
        <p class="banner-desc">找到你的冒险伙伴，分享你的故事</p>
      </div>
      <div class="banner-action">
        <TButton type="primary" @click="router.push('/community/recruit')">
          <SvgIcon name="icon-plus" :size="16" />
          去招募板发布
        </TButton>
      </div>
    </div>

    <!-- 一级导航 Tab（中景层） -->
    <nav class="primary-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="primary-tab"
        :class="{ active: activeTab === tab.key }"
        @click="navigateTab(tab)"
      >
        <SvgIcon :name="tab.icon" :size="16" />
        {{ tab.label }}
      </button>
    </nav>

    <!-- 内容区（前景层） -->
    <div class="tab-content">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.community {
  max-width: 860px;
  margin: 0 auto;
}

/* ===== 社区 Banner（背景层） ===== */
.community-banner {
  background: linear-gradient(135deg, var(--color-primary, #5B8DB8) 0%, var(--color-primary-active, #3D6A8F) 100%);
  border-radius: var(--radius-xl, 12px);
  padding: 24px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
}

/* 装饰纹理 */
.community-banner::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}

.banner-title {
  font-size: var(--text-xl, 20px);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
  margin-bottom: 4px;
}

.banner-desc {
  font-size: var(--text-sm, 14px);
  color: rgba(255, 255, 255, 0.7);
}

.banner-action {
  position: relative;
  z-index: 1;
}

/* Banner 内按钮反色 */
.banner-action :deep(.t-btn--primary) {
  background: rgba(255, 255, 255, 0.95);
  color: var(--color-primary, #5B8DB8);
}
.banner-action :deep(.t-btn--primary:hover) {
  background: #FFFFFF;
}

/* ===== 一级导航 Tab（中景层） ===== */
.primary-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--surface-active, #E8ECF0);
  border-radius: var(--radius-lg, 8px);
  margin-bottom: 16px;
}

.primary-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary, #667085);
  font-size: var(--text-sm, 14px);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.primary-tab:hover:not(.active) {
  color: var(--color-text-body, #344054);
  background: rgba(255, 255, 255, 0.5);
}

.primary-tab.active {
  background: var(--color-primary, #5B8DB8);
  color: #FFFFFF;
  box-shadow: 0 1px 3px rgba(91, 141, 184, 0.3);
}

/* ===== 内容区 ===== */
.tab-content {
  min-height: 300px;
}
</style>

