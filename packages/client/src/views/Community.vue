<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();

const BOARD_ITEMS = [
  { key: 'rules',      label: '规则问答' },
  { key: 'creation',   label: '模组创作' },
  { key: 'experience', label: '游玩体验' },
  { key: 'newbie',     label: '新人求助' },
  { key: 'lounge',     label: '水区' },
];

function isRecruitActive() {
  return route.path.startsWith('/community/recruit') || route.path === '/community';
}
function isBoardActive(key: string) {
  return route.params.board === key;
}
</script>

<template>
  <div class="community-layout">
    <!-- 左侧导航 -->
    <aside class="community-sidebar">
      <nav>
        <div class="nav-section">
          <div class="section-label">招募板</div>
          <router-link to="/community/recruit" class="nav-link" :class="{ active: isRecruitActive() }">
            招募板
          </router-link>
        </div>

        <div class="nav-section">
          <div class="section-label">讨论区</div>
          <router-link
            v-for="board in BOARD_ITEMS"
            :key="board.key"
            :to="`/community/forum/${board.key}`"
            class="nav-link"
            :class="{ active: isBoardActive(board.key) }"
          >
            {{ board.label }}
          </router-link>
        </div>

        <div class="nav-section">
          <router-link to="/community/activity" class="nav-link" active-class="active">
            我的动态
          </router-link>
        </div>
      </nav>
    </aside>

    <!-- 右侧内容区 -->
    <div class="community-content">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.community-layout {
  display: flex;
  min-height: calc(100vh - var(--navbar-height, 56px) - 56px);
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-4);
  gap: var(--space-5);
}

/* 左侧导航 */
.community-sidebar {
  width: 200px;
  flex-shrink: 0;
}

nav {
  position: sticky;
  top: calc(var(--navbar-height, 56px) + var(--space-4));
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-default);
  margin-bottom: var(--space-3);
}
.nav-section:last-child { border-bottom: none; margin-bottom: 0; }

.section-label {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0 var(--space-2);
  margin-bottom: var(--space-1);
}

.nav-link {
  display: block;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  text-decoration: none;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.nav-link:hover { background: var(--surface-hover); color: var(--text-primary); }
.nav-link.active { background: var(--color-primary-light); color: var(--color-primary); font-weight: var(--font-medium); }

/* 右侧内容 */
.community-content {
  flex: 1;
  min-width: 0;
}

/* 响应式：手机折叠侧边栏 */
@media (max-width: 768px) {
  .community-layout { flex-direction: column; padding: var(--space-3); }
  .community-sidebar { width: 100%; }
  nav { position: static; flex-direction: row; flex-wrap: wrap; gap: var(--space-1); }
  .nav-section { flex-direction: row; border-bottom: none; padding-bottom: 0; margin-bottom: 0; flex-wrap: wrap; align-items: center; }
  .section-label { display: none; }
}
</style>
