<script setup lang="ts">
/**
 * GmClueGrantOverlay — 内联线索发放浮层
 * GM 在叙事模式下快速发放线索，无需进入导演台。
 */
import { ref, onMounted, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../utils/api';
import { socketClient } from '../../socket/socket-client';
import ClueCard from '../ClueCard.vue';
import SvgIcon from '../SvgIcon.vue';

type ClueTheme = 'river' | 'blur' | 'fragment' | 'wave' | 'ancient' | 'blood' | 'ash' | 'cyber';

interface Clue {
  id: string;
  title: string;
  content: string;
  theme: ClueTheme;
  is_revealed: boolean;
  revealed_to: string[] | null;
}

const props = defineProps<{
  campaignId: string;
  characters?: { id: string; name: string }[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// ── State ────────────────────────────────────────────────────────────────────
const clues = ref<Clue[]>([]);
const loading = ref(false);
const tab = ref<'existing' | 'new'>('existing');
const searchQuery = ref('');

// 新建线索表单
const newForm = ref({ title: '', content: '', theme: 'river' as ClueTheme });
const THEMES: ClueTheme[] = ['river', 'blur', 'fragment', 'wave', 'ancient', 'blood', 'ash', 'cyber'];

// 发放目标
const targetAll = ref(true);
const targetCharId = ref('');

// ── Computed ─────────────────────────────────────────────────────────────────
const filteredClues = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return clues.value;
  return clues.value.filter((c) => c.title.toLowerCase().includes(q) || c.content.toLowerCase().includes(q));
});

// ── API ───────────────────────────────────────────────────────────────────────
async function loadClues() {
  loading.value = true;
  try {
    clues.value = await api.get<Clue[]>(`/campaigns/${props.campaignId}/clues`);
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

async function grantExistingClue(clue: Clue) {
  const visibleTo = targetAll.value ? null : (targetCharId.value ? [targetCharId.value] : null);
  try {
    const updated = targetAll.value
      ? await api.put<Clue>(`/campaigns/${props.campaignId}/clues/${clue.id}`, { is_revealed: true, revealed_to: null })
      : await api.post<Clue>(`/campaigns/${props.campaignId}/clues/${clue.id}/reveal`, { character_ids: visibleTo });
    socketClient.sendMessage({
      content: updated.id,
      message_type: 'clue_card',
      visible_to: visibleTo ?? undefined,
      metadata: { clue_id: updated.id, theme: updated.theme, title: updated.title, content: updated.content },
    });
    ElMessage.success(`线索「${clue.title}」已发放`);
    emit('close');
  } catch (e: any) { ElMessage.error(e?.message ?? '发放失败'); }
}

async function createAndGrant() {
  if (!newForm.value.title.trim() || !newForm.value.content.trim()) {
    ElMessage.warning('标题和内容不能为空');
    return;
  }
  const visibleTo = targetAll.value ? null : (targetCharId.value ? [targetCharId.value] : null);
  try {
    const created = await api.post<Clue>(`/campaigns/${props.campaignId}/clues`, {
      title: newForm.value.title,
      content: newForm.value.content,
      theme: newForm.value.theme,
      is_revealed: true,
      revealed_to: visibleTo,
    });
    socketClient.sendMessage({
      content: created.id,
      message_type: 'clue_card',
      visible_to: visibleTo ?? undefined,
      metadata: { clue_id: created.id, theme: created.theme, title: created.title, content: created.content },
    });
    ElMessage.success('线索已创建并发放');
    emit('close');
  } catch (e: any) { ElMessage.error(e?.message ?? '创建失败'); }
}

onMounted(() => {
  loadClues();
});

watch(() => props.campaignId, () => loadClues());
</script>

<template>
  <div class="clue-grant-overlay" @click.self="emit('close')">
    <div class="overlay-panel">
      <!-- 面板头部 -->
      <div class="panel-header">
        <h3 class="panel-title">发放线索</h3>

        <!-- 接收者选择 -->
        <div class="target-row">
          <label class="target-label">发送给：</label>
          <label class="radio-option">
            <input type="radio" :value="true" v-model="targetAll" /> 全员
          </label>
          <label class="radio-option">
            <input type="radio" :value="false" v-model="targetAll" /> 指定角色
          </label>
          <select v-if="!targetAll && characters?.length" v-model="targetCharId" class="char-select">
            <option value="">-- 选择角色 --</option>
            <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <button class="close-btn" @click="emit('close')">
          <SvgIcon name="icon-close" :size="16" />
        </button>
      </div>

      <!-- Tab 切换 -->
      <div class="panel-tabs">
        <button class="tab-btn" :class="{ active: tab === 'existing' }" @click="tab = 'existing'">从线索库选择</button>
        <button class="tab-btn" :class="{ active: tab === 'new' }" @click="tab = 'new'">新建并发放</button>
      </div>

      <div class="panel-body">
        <!-- 从线索库选择 -->
        <template v-if="tab === 'existing'">
          <div class="search-row">
            <input v-model="searchQuery" class="search-input" placeholder="搜索线索..." />
            <button class="refresh-btn" @click="loadClues" :disabled="loading" title="刷新">↺</button>
          </div>
          <div v-if="loading" class="loading-tip">加载中...</div>
          <div v-else-if="!filteredClues.length" class="empty-tip">
            {{ searchQuery ? '没有匹配的线索' : '暂无线索，请先在导演台创建' }}
          </div>
          <ul v-else class="clue-list">
            <li v-for="clue in filteredClues" :key="clue.id" class="clue-row">
              <div class="clue-row-info">
                <span class="clue-row-title">{{ clue.title }}</span>
                <span class="clue-row-theme">{{ clue.theme }}</span>
                <span v-if="clue.is_revealed" class="clue-row-badge revealed">已发放</span>
              </div>
              <button class="grant-btn" @click="grantExistingClue(clue)">发放</button>
            </li>
          </ul>
        </template>

        <!-- 新建并发放 -->
        <template v-else>
          <div class="new-form">
            <input v-model="newForm.title" class="form-input" placeholder="线索标题" />
            <textarea v-model="newForm.content" class="form-textarea" placeholder="线索内容" rows="4" />
            <div class="theme-row">
              <label class="form-label">样式主题：</label>
              <div class="theme-pills">
                <button
                  v-for="t in THEMES" :key="t"
                  class="theme-pill"
                  :class="{ active: newForm.theme === t }"
                  @click="newForm.theme = t"
                >{{ t }}</button>
              </div>
            </div>
            <!-- 预览 -->
            <div class="preview-wrap" v-if="newForm.title || newForm.content">
              <ClueCard
                :title="newForm.title || '（预览）'"
                :content="newForm.content"
                :theme="newForm.theme"
              />
            </div>
            <button class="create-grant-btn" @click="createAndGrant">创建并发放</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clue-grant-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.4);
  z-index: 500;
  display: flex;
  align-items: flex-end;
}

.overlay-panel {
  width: 100%;
  max-height: 70vh;
  background: var(--color-card-bg);
  border-top: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -4px 24px rgba(0,0,0,.2);
}

/* Header */
.panel-header {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border-bottom: 1px solid var(--color-card-border);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.panel-title {
  font-size: var(--text-base);
  font-weight: 700;
  margin: 0;
}
.target-row {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}
.target-label { font-size: var(--text-sm); color: var(--color-text-muted); }
.radio-option { display: flex; align-items: center; gap: 4px; font-size: var(--text-sm); cursor: pointer; }
.char-select {
  padding: 2px 8px;
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-sm);
  background: var(--color-page-bg);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}
.close-btn {
  margin-left: auto;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: var(--radius-sm);
}
.close-btn:hover { background: var(--color-page-bg); color: var(--color-text-primary); }

/* Tabs */
.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-card-border);
  flex-shrink: 0;
}
.tab-btn {
  flex: 1;
  padding: 10px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  border-bottom: 3px solid transparent;
  transition: all var(--transition-fast);
}
.tab-btn.active {
  color: var(--color-accent, #3b82f6);
  border-bottom-color: var(--color-accent, #3b82f6);
  font-weight: 600;
}

/* Body */
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3, 12px) var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

/* Search row */
.search-row {
  display: flex;
  gap: var(--space-2, 8px);
}
.search-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  background: var(--color-page-bg);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}
.refresh-btn {
  border: 1px solid var(--color-card-border);
  background: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 15px;
}
.refresh-btn:hover { color: var(--color-text-primary); }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.loading-tip, .empty-tip {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-4) 0;
}

/* Clue list */
.clue-list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: var(--space-2, 8px);
}
.clue-row {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  background: var(--color-page-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
}
.clue-row-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}
.clue-row-title { font-weight: 600; font-size: var(--text-sm); }
.clue-row-theme {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: 4px;
  color: var(--color-text-muted);
}
.clue-row-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}
.clue-row-badge.revealed {
  background: color-mix(in srgb, var(--color-success, #22c55e) 15%, transparent);
  color: var(--color-success, #22c55e);
}
.grant-btn {
  padding: 4px 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-accent, #3b82f6);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.grant-btn:hover { filter: brightness(1.1); }

/* New form */
.new-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
.form-input, .form-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  background: var(--color-page-bg);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  font-family: inherit;
  box-sizing: border-box;
  resize: vertical;
}
.form-input:focus, .form-textarea:focus {
  outline: none;
  border-color: var(--color-accent, #3b82f6);
}
.theme-row {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}
.form-label { font-size: var(--text-sm); color: var(--color-text-muted); flex-shrink: 0; }
.theme-pills { display: flex; flex-wrap: wrap; gap: 4px; }
.theme-pill {
  padding: 2px 8px;
  border: 1px solid var(--color-card-border);
  border-radius: 12px;
  background: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}
.theme-pill.active {
  background: var(--color-accent, #3b82f6);
  color: #fff;
  border-color: var(--color-accent, #3b82f6);
}
.preview-wrap { max-height: 200px; overflow-y: auto; }
.create-grant-btn {
  padding: 8px 20px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-accent, #3b82f6);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  align-self: flex-end;
}
.create-grant-btn:hover { filter: brightness(1.1); }
</style>
