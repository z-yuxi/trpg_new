<script setup lang="ts">
import { onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

async function scrollToHash() {
  await nextTick();
  const hash = route.hash?.replace('#', '');
  if (!hash) return;
  const element = document.getElementById(hash);
  element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

onMounted(scrollToHash);
</script>

<template>
  <div class="guide-page">
    <button class="back-btn" @click="router.back()">← 返回</button>

    <section class="hero-card">
      <p class="eyebrow">Getting Started</p>
      <h1>新手指南</h1>
      <p class="hero-text">
        这是一页面向新玩家的入门说明。你可以按下面三步，从第一次浏览到加入一场完整跑团。
      </p>
    </section>

    <section id="join" class="guide-card">
      <div class="step-index">01</div>
      <div class="step-body">
        <h2>创建或加入团</h2>
        <p>先前往“我的团”创建自己的团，或通过社区招募帖加入正在招募的团。成团后，房间会出现在你的“我的团”中。</p>
        <div class="action-row">
          <button class="primary-btn" @click="router.push('/rooms')">前往房间</button>
          <button class="ghost-btn" @click="router.push('/login')">先登录账号</button>
        </div>
      </div>
    </section>

    <section id="assets" class="guide-card">
      <div class="step-index">02</div>
      <div class="step-body">
        <h2>浏览规则集和模组</h2>
        <p>进入广场后，你可以先看公开模组与规则集。对新玩家来说，优先挑“入门”难度的内容更容易上手。</p>
        <div class="action-row">
          <button class="primary-btn" @click="router.push('/explore')">前往探索</button>
          <button class="ghost-btn" @click="router.push('/mine/characters')">准备角色卡</button>
        </div>
      </div>
    </section>

    <section id="recruit" class="guide-card">
      <div class="step-index">03</div>
      <div class="step-body">
        <h2>去社区发起或加入招募</h2>
        <p>如果你还没有固定队伍，就去社区的招募区。看人数、规则体系、开团时间，再决定加入哪一团。</p>
        <div class="action-row">
          <button class="primary-btn" @click="router.push('/recruit')">前往招募</button>
          <button class="ghost-btn" @click="router.push('/mine')">查看我的</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.guide-page {
  max-width: 860px;
  margin: 0 auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.back-btn {
  align-self: flex-start;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
}

.hero-card,
.guide-card {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
}

.hero-card {
  background: var(--surface-card);
}

.eyebrow {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.hero-card h1,
.step-body h2 {
  margin: 0 0 var(--space-2);
  color: var(--text-primary);
}

.hero-text,
.step-body p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.7;
}

.guide-card {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: var(--space-4);
}

.step-index {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 700;
  color: var(--text-muted);
}

.step-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.action-row {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.primary-btn,
.ghost-btn {
  min-height: 42px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-weight: 600;
}

.primary-btn {
  border: none;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
}

.ghost-btn {
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .guide-page {
    padding: var(--space-3);
  }

  .hero-card,
  .guide-card {
    padding: var(--space-4);
  }

  .guide-card {
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }
}
</style>