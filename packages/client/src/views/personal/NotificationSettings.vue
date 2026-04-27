<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import SvgIcon from '../../components/SvgIcon.vue';
import { api } from '../../utils/api';

const router = useRouter();

interface NotifyGroup {
  label: string;
  items: { key: string; label: string; desc: string; value: ReturnType<typeof ref<boolean>> }[];
}

const system = ref(true);
const recruit = ref(true);
const dm = ref(true);
const mention = ref(true);

const groups: NotifyGroup[] = [
  {
    label: '系统通知',
    items: [
      { key: 'system', label: '系统公告', desc: '平台维护、版本更新等系统消息', value: system },
    ],
  },
  {
    label: '招募与组队',
    items: [
      { key: 'recruit', label: '招募通知', desc: '有人响应你的招募或邀请你加入战役', value: recruit },
    ],
  },
  {
    label: '互动消息',
    items: [
      { key: 'dm', label: '私信通知', desc: '收到新私信时通知', value: dm },
      { key: 'mention', label: '@ 提及', desc: '在房间或社区帖子中被 @ 时通知', value: mention },
    ],
  },
];

const saving = ref(false);

async function save() {
  saving.value = true;
  try {
    await api.put('/users/me/notification-settings', { system: system.value, recruit: recruit.value, dm: dm.value, mention: mention.value });
    ElMessage.success('通知设置已保存');
  } catch {
    ElMessage.error('保存失败，请稍后重试');
  } finally {
    saving.value = false;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(save, 600);
}
watch([system, recruit, dm, mention], debouncedSave);
</script>

<template>
  <div class="settings-page">
    <button class="back-btn" @click="router.back()">
      <SvgIcon name="icon-arrow-left" :size="16" />
      <span>返回</span>
    </button>
    <div class="settings-card">
      <h2 class="title">
        <SvgIcon name="icon-bell" :size="18" />
        <span>消息通知设置</span>
      </h2>
      <p class="desc">选择你希望接收哪些通知。更改后自动保存。</p>

      <div v-for="group in groups" :key="group.label" class="group">
        <div class="group-title">{{ group.label }}</div>
        <div v-for="item in group.items" :key="item.key" class="toggle-item">
          <div class="toggle-info">
            <div class="toggle-name">{{ item.label }}</div>
            <div class="toggle-desc">{{ item.desc }}</div>
          </div>
          <label class="switch">
            <input type="checkbox" v-model="item.value.value" />
            <span class="slider"></span>
          </label>
        </div>
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
.title { margin: 0 0 var(--space-2); font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: var(--space-2); }
.desc { margin: 0 0 var(--space-5); font-size: var(--text-sm); color: var(--text-muted); }
.group { margin-bottom: var(--space-5); }
.group-title { font-size: var(--text-xs); font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: var(--space-2); }
.toggle-item { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) 0; border-top: 1px solid var(--border-default); gap: var(--space-4); }
.toggle-info { flex: 1; min-width: 0; }
.toggle-name { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.toggle-desc { font-size: var(--text-xs); color: var(--text-muted); }
.switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; inset: 0; cursor: pointer; background: var(--border-default); border-radius: 24px; transition: background var(--transition-fast); }
.slider::before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: transform var(--transition-fast); }
input:checked + .slider { background: var(--color-accent); }
input:checked + .slider::before { transform: translateX(20px); }
.saving-hint { font-size: var(--text-xs); color: var(--text-muted); text-align: right; margin-top: var(--space-3); }
</style>
