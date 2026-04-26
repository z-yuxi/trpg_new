<script setup lang="ts">
import EmptyState from '../components/base/EmptyState.vue';
</script>

<template>
  <EmptyState
    icon-name=""
    illustration-name="illust-error"
    title="服务器错误"
    description="服务器出现了一些问题，请稍后重试。"
    action-text="返回首页"
    action-route="/"
  />
</template>
