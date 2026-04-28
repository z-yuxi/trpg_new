<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import ClueCard from '../ClueCard.vue';
import ClueStyleEditor from './ClueStyleEditor.vue';
import TButton from '../base/TButton.vue';
import TTag from '../base/TTag.vue';
import SvgIcon from '../SvgIcon.vue';
import { api } from '../../utils/api';

type ClueTheme = 'river' | 'blur' | 'fragment' | 'wave' | 'ancient' | 'blood' | 'ash' | 'cyber';

interface CampaignClue {
  id: string;
  title: string;
  content: string;
  theme: ClueTheme;
  is_revealed: boolean;
  revealed_to: string[] | null;
  created_at?: string;
}

const props = defineProps<{
  campaignId: string;
  characters?: Array<{ id: string; name: string }>;
}>();

const clues = ref<CampaignClue[]>([]);
const loading = ref(false);

// 样式编辑器
const styleEditorClue = ref<CampaignClue | null>(null);

// 详情展开
const expandedClueId = ref<string | null>(null);

async function loadClues() {
  loading.value = true;
  try {
    clues.value = await api.get<CampaignClue[]>(`/campaigns/${props.campaignId}/clues`);
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message ?? '加载线索失败');
  } finally {
    loading.value = false;
  }
}

function toggleExpand(id: string) {
  expandedClueId.value = expandedClueId.value === id ? null : id;
}

function openStyleEditor(clue: CampaignClue) {
  styleEditorClue.value = clue;
}

function closeStyleEditor() {
  styleEditorClue.value = null;
}

function handleStyleUpdated(clue: CampaignClue, newTheme: ClueTheme) {
  const idx = clues.value.findIndex(c => c.id === clue.id);
  if (idx !== -1) clues.value[idx] = { ...clues.value[idx], theme: newTheme };
  closeStyleEditor();
}

async function deleteClue(clue: CampaignClue) {
  await ElMessageBox.confirm(`确定删除线索「${clue.title}」？`, '删除确认', {
    type: 'warning',
    confirmButtonText: '确认删除',
    cancelButtonText: '取消',
  });
  try {
    await api.delete(`/campaigns/${props.campaignId}/clues/${clue.id}`);
    clues.value = clues.value.filter(c => c.id !== clue.id);
    ElMessage.success('线索已删除');
  } catch (e: unknown) {
    if ((e as Record<string, string>)?.action === 'cancel') return;
    ElMessage.error((e as Error)?.message ?? '删除失败');
  }
}

function revealedLabel(clue: CampaignClue) {
  if (clue.is_revealed && clue.revealed_to == null) return '全员可见';
  if (clue.is_revealed && clue.revealed_to?.length) return `已向 ${clue.revealed_to.length} 人开放`;
  return '未发放';
}

function revealedColor(clue: CampaignClue): 'default' | 'success' | 'warning' {
  if (clue.is_revealed) return 'success';
  return 'default';
}

onMounted(loadClues);
</script>

<template>
  <div class="gm-clue-library" v-loading="loading">
    <!-- 样式编辑器抽屉 -->
    <div v-if="styleEditorClue" class="style-editor-overlay">
      <div class="style-editor-panel">
        <div class="style-editor-header">
          <span class="style-editor-title">编辑样式：{{ styleEditorClue.title }}</span>
          <button class="close-btn" @click="closeStyleEditor">
            <SvgIcon name="icon-close" :size="16" />
          </button>
        </div>
        <ClueStyleEditor
          :clue-id="styleEditorClue.id"
          :campaign-id="campaignId"
          :current-theme="styleEditorClue.theme"
          :clue-title="styleEditorClue.title"
          :clue-content="styleEditorClue.content"
          @style-updated="(t) => handleStyleUpdated(styleEditorClue!, t)"
        />
      </div>
    </div>

    <!-- 线索列表 -->
    <div v-if="clues.length" class="clue-list">
      <article
        v-for="clue in clues"
        :key="clue.id"
        class="clue-row"
      >
        <div class="clue-row-header" @click="toggleExpand(clue.id)">
          <div class="clue-row-info">
            <span class="clue-row-title">{{ clue.title }}</span>
            <TTag :color="revealedColor(clue)" class="reveal-tag">{{ revealedLabel(clue) }}</TTag>
            <span class="clue-theme-badge">{{ clue.theme }}</span>
          </div>
          <div class="clue-row-actions" @click.stop>
            <TButton size="sm" type="secondary" @click="openStyleEditor(clue)" title="编辑样式">
              <SvgIcon name="icon-palette" :size="13" />
              样式
            </TButton>
            <button class="danger-btn" @click="deleteClue(clue)" title="删除">
              <SvgIcon name="icon-trash" :size="13" />
            </button>
            <SvgIcon :name="expandedClueId === clue.id ? 'icon-chevron-up' : 'icon-chevron-down'" :size="14" class="expand-icon" />
          </div>
        </div>

        <!-- 展开预览 -->
        <div v-if="expandedClueId === clue.id" class="clue-preview-wrap">
          <ClueCard
            :title="clue.title"
            :content="clue.content"
            :theme="clue.theme"
          />
        </div>
      </article>
    </div>

    <div v-else-if="!loading" class="empty-state">
      <p class="empty-icon"><SvgIcon name="state-empty" :size="36" /></p>
      <p class="empty-title">暂无线索</p>
      <p class="empty-desc">在上方创建并发放线索给玩家</p>
    </div>
  </div>
</template>

<style scoped>
.gm-clue-library { position: relative; }

/* 样式编辑器覆盖层 */
.style-editor-overlay {
  position: absolute; inset: 0; z-index: 100;
  background: var(--color-card-bg);
  overflow-y: auto;
  padding: var(--space-3);
}
.style-editor-panel { }
.style-editor-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-default);
  padding-bottom: var(--space-2);
}
.style-editor-title { font-size: var(--text-sm); font-weight: 600; }
.close-btn {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); padding: 4px;
  display: flex; align-items: center;
  border-radius: var(--radius-sm);
}
.close-btn:hover { background: var(--surface-hover); color: var(--text-primary); }

/* 线索列表 */
.clue-list { display: flex; flex-direction: column; gap: var(--space-2); }

.clue-row {
  border: 1px solid var(--border-default); border-radius: var(--radius-lg);
  background: var(--surface-card); overflow: hidden;
}

.clue-row-header {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-3);
  cursor: pointer;
}
.clue-row-header:hover { background: var(--surface-hover); }

.clue-row-info { flex: 1; display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.clue-row-title { font-size: var(--text-sm); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reveal-tag { flex-shrink: 0; }
.clue-theme-badge {
  font-size: var(--text-xs); color: var(--text-muted);
  font-family: var(--font-mono); flex-shrink: 0;
}

.clue-row-actions { display: flex; align-items: center; gap: var(--space-1); flex-shrink: 0; }
.danger-btn {
  background: none; border: none; cursor: pointer; color: var(--text-muted);
  padding: 5px; border-radius: var(--radius-sm); display: flex; align-items: center;
}
.danger-btn:hover { background: rgba(184, 84, 80, 0.08); color: #B85450; }
.expand-icon { color: var(--text-muted); }

.clue-preview-wrap {
  padding: var(--space-3);
  border-top: 1px solid var(--border-default);
  background: var(--surface-hover);
  display: flex; justify-content: center;
}

/* 空状态 */
.empty-state { text-align: center; padding: var(--space-10) var(--space-4); }
.empty-icon { margin: 0 0 var(--space-2); color: var(--text-muted); display: flex; justify-content: center; }
.empty-title { font-size: var(--text-base); font-weight: 600; color: var(--text-primary); margin: 0 0 var(--space-1); }
.empty-desc { font-size: var(--text-xs); color: var(--text-muted); margin: 0; }
</style>
