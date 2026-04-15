<script setup lang="ts">
defineProps<{ size?: number }>();
</script>

<template>
  <span class="t-spinner" :style="{ width: `${size ?? 20}px`, height: `${size ?? 20}px` }" />
</template>

<style scoped>
.t-spinner {
  display: inline-block;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
