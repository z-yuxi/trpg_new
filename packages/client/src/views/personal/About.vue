<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
const version = __APP_VERSION__;

const links = [
  { label: '使用条款', href: '#terms' },
  { label: '隐私政策', href: '#privacy' },
  { label: '开源许可', href: '#license' },
];

function openFeedback() {
  // TODO: open feedback dialog or navigate to feedback form
  window.open('mailto:feedback@trpg.example.com?subject=反馈', '_blank');
}
</script>

<template>
  <div class="settings-page">
    <button class="back-btn" @click="router.back()">&#8592; 返回</button>
    <div class="settings-card">
      <h2 class="title">关于我们</h2>
      <p class="desc">TRPG 是一个面向桌游爱好者的协作跑团平台，提供战役管理、角色卡编辑与实时房间协作体验。</p>

      <div class="meta-row">
        <span class="meta-key">当前版本</span>
        <span class="meta-val mono">v{{ version }}</span>
      </div>

      <div class="link-section">
        <h3 class="section-title">法律与合规</h3>
        <div class="link-list">
          <a v-for="l in links" :key="l.label" :href="l.href" class="link-row">
            <span>{{ l.label }}</span>
            <span class="arrow">›</span>
          </a>
        </div>
      </div>

      <div class="feedback-section">
        <h3 class="section-title">帮助与反馈</h3>
        <button class="feedback-btn" @click="openFeedback">发送反馈</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page { max-width: 640px; margin: 0 auto; padding: var(--space-4); }
.back-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: var(--text-sm); padding: 0 0 var(--space-3); transition: color var(--transition-fast); }
.back-btn:hover { color: var(--color-accent); }
.settings-card { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-6); }
.title { margin: 0 0 var(--space-2); font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); }
.desc { margin: 0 0 var(--space-5); font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.7; }
.meta-row { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) 0; border-top: 1px solid var(--border-default); margin-bottom: var(--space-5); }
.meta-key { font-size: var(--text-sm); color: var(--text-secondary); }
.meta-val { font-size: var(--text-sm); color: var(--text-primary); font-weight: 600; }
.mono { font-family: var(--font-mono); }
.section-title { font-size: var(--text-xs); font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 var(--space-2); }
.link-section, .feedback-section { margin-bottom: var(--space-5); }
.link-list { border-top: 1px solid var(--border-default); }
.link-row { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) 0; border-bottom: 1px solid var(--border-default); color: var(--text-primary); text-decoration: none; font-size: var(--text-sm); transition: color var(--transition-fast); }
.link-row:hover { color: var(--color-accent); }
.arrow { color: var(--text-muted); }
.feedback-btn { padding: var(--space-2) var(--space-5); border: 1px solid var(--color-accent); border-radius: var(--radius-md); background: none; color: var(--color-accent); cursor: pointer; font-size: var(--text-sm); transition: background var(--transition-fast), color var(--transition-fast); }
.feedback-btn:hover { background: var(--color-accent); color: #fff; }
</style>
