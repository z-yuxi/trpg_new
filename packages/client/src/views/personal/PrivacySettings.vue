<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../../stores/auth-store';

const router = useRouter();
const authStore = useAuthStore();

const profilePublic = ref(true);
const onlineVisible = ref(true);
const campaignHistoryPublic = ref(false);
const saving = ref(false);

async function save() {
  saving.value = true;
  try {
    const res = await fetch('/api/users/me/privacy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify({
        profile_public: profilePublic.value,
        online_visible: onlineVisible.value,
        campaign_history_public: campaignHistoryPublic.value,
      }),
    });
    if (!res.ok) throw new Error();
    ElMessage.success('隐私设置已保存');
  } catch {
    ElMessage.error('保存失败，请稍后重试');
  } finally {
    saving.value = false;
  }
}

// Auto-save on toggle with debounce
let timer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(save, 600);
}
watch([profilePublic, onlineVisible, campaignHistoryPublic], debouncedSave);
</script>

<template>
  <div class="settings-page">
    <button class="back-btn" @click="router.back()">&#8592; 返回</button>
    <div class="settings-card">
      <h2 class="title">隐私设置</h2>
      <p class="desc">控制其他用户查看你的信息范围。更改后自动保存。</p>

      <div class="toggle-item">
        <div class="toggle-info">
          <div class="toggle-name">公开个人主页</div>
          <div class="toggle-desc">关闭后其他用户无法访问你的 /u/:uid 页面</div>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="profilePublic" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="toggle-item">
        <div class="toggle-info">
          <div class="toggle-name">显示在线状态</div>
          <div class="toggle-desc">其他人可以看到你是否在线</div>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="onlineVisible" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="toggle-item">
        <div class="toggle-info">
          <div class="toggle-name">公开战役记录</div>
          <div class="toggle-desc">开启后个人主页将显示参团及跑团统计数据</div>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="campaignHistoryPublic" />
          <span class="slider"></span>
        </label>
      </div>

      <div v-if="saving" class="saving-hint">正在保存…</div>
    </div>
  </div>
</template>

<style scoped>
.settings-page { max-width: 640px; margin: 0 auto; padding: var(--space-4); }
.back-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: var(--text-sm); padding: 0 0 var(--space-3); transition: color var(--transition-fast); }
.back-btn:hover { color: var(--color-accent); }
.settings-card { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-6); }
.title { margin: 0 0 var(--space-2); font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); }
.desc { margin: 0 0 var(--space-5); font-size: var(--text-sm); color: var(--text-muted); }
.toggle-item { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) 0; border-top: 1px solid var(--border-default); gap: var(--space-4); }
.toggle-info { flex: 1; min-width: 0; }
.toggle-name { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.toggle-desc { font-size: var(--text-xs); color: var(--text-muted); }
/* Switch */
.switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; inset: 0; cursor: pointer; background: var(--border-default); border-radius: 24px; transition: background var(--transition-fast); }
.slider::before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: transform var(--transition-fast); }
input:checked + .slider { background: var(--color-accent); }
input:checked + .slider::before { transform: translateX(20px); }
.saving-hint { font-size: var(--text-xs); color: var(--text-muted); text-align: right; margin-top: var(--space-3); }
</style>
