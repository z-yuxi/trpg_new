<script setup lang="ts">
import EmptyState from '../components/base/EmptyState.vue';

function reloadPage() {
  location.reload();
}
</script>

<template>
  <EmptyState
    icon-name="state-offline"
    title="网络连接失败"
    description="请检查你的网络连接后重试。"
    action-text="重新加载"
    @action="reloadPage"
  />
</template>
