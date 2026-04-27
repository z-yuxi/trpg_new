<template>
  <section class="page-layout">
    <slot />
  </section>
</template>

<style scoped>
.page-layout {
  width: 100%;
  max-width: 1280px;
  min-height: calc(100vh - var(--navbar-height));
  margin: 0 auto;
  padding: var(--space-6);
}

@media (max-width: 1024px) {
  .page-layout {
    padding: var(--space-4);
  }
}

@media (max-width: 768px) {
  .page-layout {
    min-height: auto;
    padding: var(--space-3);
  }
}
</style>