<script setup lang="ts">
defineProps<{
  name: string;
  size?: number;
  color?: string;
}>();
</script>

<template>
  <svg
    :width="size ?? 24"
    :height="size ?? 24"
    :style="color ? { color } : undefined"
    class="svg-icon"
    aria-hidden="true"
  >
    <use :href="`#${name}`" />
  </svg>
</template>

<style scoped>
.svg-icon {
  display: inline-block;
  vertical-align: middle;
  fill: none;
  stroke: currentColor;
  flex-shrink: 0;
}
</style>
