<script setup lang="ts">
import { ElTabs, ElTabPane } from 'element-plus';
import DiscoverTab from './asset/DiscoverTab.vue';
import MyAssetsTab from './asset/MyAssetsTab.vue';
</script>

<template>
  <div class="asset-library">
    <h1 class="page-title">素材库</h1>
    <ElTabs>
      <ElTabPane label="发现" name="discover">
        <DiscoverTab />
      </ElTabPane>
      <ElTabPane label="我的素材" name="mine">
        <MyAssetsTab />
      </ElTabPane>
    </ElTabs>
  </div>
</template>

<style scoped>
.asset-library { max-width: 960px; margin: 0 auto; }
.page-title { font-size: var(--text-2xl); font-weight: 700; margin-bottom: var(--space-4); color: var(--color-text-primary); }
</style>
