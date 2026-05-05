<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import SvgIcon from '../../components/SvgIcon.vue';
import { updatePrivacy } from '../../api/users';

const router = useRouter();

const profilePublic = ref(true);
const onlineVisible = ref(true);
const campaignHistoryPublic = ref(false);
const allowAiSocial = ref(false);
const allowAiCreative = ref(false);
const saving = ref(false);

async function save() {
  saving.value = true;
  try {
    await updatePrivacy({
      profile_visibility: profilePublic.value ? 'public' : 'private',
      online_visible: onlineVisible.value,
      campaign_history_public: campaignHistoryPublic.value,
      allow_ai_social: allowAiSocial.value,
      allow_ai_creative: allowAiCreative.value,
    });
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
watch([profilePublic, onlineVisible, campaignHistoryPublic, allowAiSocial, allowAiCreative], debouncedSave);
</script>

<template>
  <div class="settings-page">
    <button class="back-btn" @click="router.back()">
      <SvgIcon name="icon-arrow-left" :size="16" />
      <span>返回</span>
    </button>
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

      <div class="section-divider">
        <span class="section-label">AI 社交辅助授权</span>
        <span class="section-hint">以下开关默认关闭，公开内容不等于允许 AI 读取</span>
      </div>

      <div class="toggle-item">
        <div class="toggle-info">
          <div class="toggle-name">允许 AI 读取我的社区社交内容</div>
          <div class="toggle-desc">开启后，AI 可读取你的公开帖子、评论、组队需求，用于智能匹配队友与同好。关闭后 AI 完全不接触你的社区内容。</div>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="allowAiSocial" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="toggle-item">
        <div class="toggle-info">
          <div class="toggle-name">允许 AI 读取我的原创创作内容</div>
          <div class="toggle-desc">开启后，AI 可读取你发布的模组、跑团记录、原创文稿，用于匹配创作同好和灵感辅助。关闭后 AI 完全不接触你的创作内容。</div>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="allowAiCreative" />
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
.section-divider { display: flex; flex-direction: column; gap: 2px; padding: var(--space-4) 0 var(--space-2); border-top: 1px solid var(--border-default); margin-top: var(--space-2); }
.section-label { font-size: var(--text-sm); font-weight: 700; color: var(--text-primary); }
.section-hint { font-size: var(--text-xs); color: var(--text-muted); }
</style>
