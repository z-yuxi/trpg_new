<script setup lang="ts">
import EmptyState from '../components/base/EmptyState.vue';
</script>

<template>
  <EmptyState
    icon-name=""
    illustration-name="illust-404"
    title="页面不存在"
    description="你访问的页面已被移走，或者从未存在过。"
    action-text="返回首页"
    action-route="/"
  />
</template>
