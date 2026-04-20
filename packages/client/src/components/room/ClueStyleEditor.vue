<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';
import ClueCard from '../ClueCard.vue';
import TButton from '../base/TButton.vue';
import { useAuthStore } from '../../stores/auth-store';

type ClueTheme = 'river' | 'blur' | 'fragment' | 'wave' | 'ancient' | 'blood' | 'ash' | 'cyber';

interface ThemeOption {
  value: ClueTheme;
  label: string;
  desc: string;
}

const props = defineProps<{
  clueId: string;
  campaignId: string;
  currentTheme: ClueTheme;
  clueTitle?: string;
  clueContent?: string;
}>();

const emit = defineEmits<{
  'style-updated': [theme: ClueTheme];
}>();

const authStore = useAuthStore();
const selectedTheme = ref<ClueTheme>(props.currentTheme);
const saving = ref(false);

const themes: ThemeOption[] = [
  { value: 'river', label: '流水', desc: '横向滑入，清新流动' },
  { value: 'blur', label: '模糊', desc: '高斯模糊，点击揭示' },
  { value: 'fragment', label: '碎片', desc: '散落拼合动效' },
  { value: 'wave', label: '波浪', desc: '上下漂浮，轻盈悬浮' },
  { value: 'ancient', label: '古朴', desc: '竖排纸张质感' },
  { value: 'blood', label: '血痕', desc: '暗黑红字，恐怖氛围' },
  { value: 'ash', label: '焦灰', desc: '烧灼感，破损纸边' },
  { value: 'cyber', label: '赛博', desc: '终端绿字，字符乱码' },
];

const previewTitle = computed(() => props.clueTitle ?? '线索标题示例');
const previewContent = computed(() => props.clueContent ?? '这是线索内容的预览效果，将使用所选样式进行展示。');

// 当父组件传入新的 currentTheme 时同步
watch(() => props.currentTheme, (v) => { selectedTheme.value = v; });

async function saveStyle() {
  saving.value = true;
  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/clues/${props.clueId}/style`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({ theme: selectedTheme.value }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? '保存失败');
    emit('style-updated', selectedTheme.value);
    ElMessage.success('样式已更新');
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message ?? '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="clue-style-editor">
    <div class="editor-body">
      <!-- 左侧：主题选择列表 -->
      <div class="theme-list">
        <p class="section-label">选择样式主题</p>
        <button
          v-for="t in themes"
          :key="t.value"
          class="theme-item"
          :class="{ active: selectedTheme === t.value }"
          @click="selectedTheme = t.value"
        >
          <span class="theme-name">{{ t.label }}</span>
          <span class="theme-desc">{{ t.desc }}</span>
          <span v-if="selectedTheme === t.value" class="theme-check">✓</span>
        </button>
      </div>

      <!-- 右侧：实时预览 -->
      <div class="preview-area">
        <p class="section-label">实时预览</p>
        <div class="preview-wrap">
          <ClueCard
            :title="previewTitle"
            :content="previewContent"
            :theme="selectedTheme"
            sender-name="GM"
          />
        </div>
      </div>
    </div>

    <!-- 保存按钮 -->
    <div class="editor-footer">
      <TButton type="primary" :loading="saving" :disabled="selectedTheme === currentTheme" @click="saveStyle">
        保存样式
      </TButton>
      <span v-if="selectedTheme === currentTheme" class="hint-text">与当前样式相同</span>
    </div>
  </div>
</template>

<style scoped>
.clue-style-editor {
  display: flex; flex-direction: column; gap: var(--space-4);
}

.editor-body {
  display: flex; gap: var(--space-4);
}

.section-label {
  font-size: var(--text-xs); font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .05em;
  margin: 0 0 var(--space-2);
}

.theme-list {
  width: 180px; flex-shrink: 0; display: flex; flex-direction: column; gap: 4px;
}

.theme-item {
  display: flex; align-items: center; gap: var(--space-2);
  padding: 8px 10px; border-radius: var(--radius-md);
  border: 1px solid transparent; background: none; cursor: pointer; text-align: left;
  transition: background var(--transition-fast), border-color var(--transition-fast);
  position: relative;
}

.theme-item:hover { background: var(--surface-hover); }

.theme-item.active {
  background: color-mix(in srgb, var(--color-primary, #2563eb) 10%, transparent);
  border-color: var(--color-primary, #2563eb);
}

.theme-name { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); flex-shrink: 0; }
.theme-desc { font-size: var(--text-xs); color: var(--text-muted); flex: 1; }
.theme-check { margin-left: auto; color: var(--color-primary, #2563eb); font-size: var(--text-sm); }

.preview-area { flex: 1; min-width: 0; }

.preview-wrap {
  border: 1px solid var(--border-default); border-radius: var(--radius-xl);
  padding: var(--space-4); background: var(--surface-hover);
  display: flex; justify-content: center;
  min-height: 180px; align-items: flex-start;
}

.editor-footer {
  display: flex; align-items: center; gap: var(--space-3);
  border-top: 1px solid var(--border-default); padding-top: var(--space-3);
}

.hint-text { font-size: var(--text-xs); color: var(--text-muted); }

@media (max-width: 768px) {
  .editor-body { flex-direction: column; }
  .theme-list { width: 100%; flex-direction: row; flex-wrap: wrap; gap: var(--space-2); }
  .theme-item { width: calc(50% - 4px); }
}
</style>
