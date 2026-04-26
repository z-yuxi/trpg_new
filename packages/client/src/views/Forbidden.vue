<script setup lang="ts">
import EmptyState from '../components/base/EmptyState.vue';
</script>

<template>
  <EmptyState
    icon-name=""
    illustration-name="illust-forbidden"
    title="无权访问"
    description="你没有权限查看此页面。请确认你已登录，或联系管理员。"
    action-text="返回首页"
    action-route="/"
  />
</template>
