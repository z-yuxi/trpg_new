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
        这里不是入口跳板，而是一页真正的入门说明。你可以按下面三步，从第一次浏览到加入一场完整跑团。
      </p>
    </section>

    <section id="join" class="guide-card">
      <div class="step-index">01</div>
      <div class="step-body">
        <h2>创建或加入战役</h2>
        <p>先进入战役大厅查看现有房间。你可以自己创建战役，也可以通过房间码或招募帖加入现有团。</p>
        <div class="action-row">
          <button class="primary-btn" @click="router.push('/campaigns')">前往我的战役</button>
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
          <button class="primary-btn" @click="router.push('/assets')">前往广场</button>
          <button class="ghost-btn" @click="router.push('/personal/characters')">准备角色卡</button>
        </div>
      </div>
    </section>

    <section id="recruit" class="guide-card">
      <div class="step-index">03</div>
      <div class="step-body">
        <h2>去社区发起或加入招募</h2>
        <p>如果你还没有固定队伍，就去社区的招募区。看人数、规则体系、开团时间，再决定加入哪一团。</p>
        <div class="action-row">
          <button class="primary-btn" @click="router.push('/community/recruit')">前往组团招募</button>
          <button class="ghost-btn" @click="router.push('/community/activity')">查看我的动态</button>
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
  background: linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 12%, #ffffff) 0%, var(--surface-card) 72%);
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
  color: var(--color-accent);
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
  background: var(--color-accent);
  color: #fff;
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