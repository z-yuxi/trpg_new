<template>
  <div class="module-search">
    <!-- 搜索输入 -->
    <div class="module-search__bar">
      <input
        ref="inputRef"
        v-model="query"
        class="module-search__input"
        placeholder="在模组内搜索…"
        maxlength="200"
        @input="debouncedSearch"
        @keydown.escape="$emit('close')"
      />
      <button class="module-search__close" @click="$emit('close')" title="关闭搜索">×</button>
    </div>

    <!-- 加载 -->
    <div v-if="loading" class="module-search__status">搜索中…</div>

    <!-- 空结果 -->
    <div v-else-if="searched && results.length === 0" class="module-search__status">
      未找到「{{ query }}」
    </div>

    <!-- 结果列表 -->
    <div v-else-if="results.length > 0" class="module-search__results">
      <div class="module-search__count">找到 {{ results.length }} 处</div>
      <div
        v-for="(item, i) in results"
        :key="i"
        class="module-search__item"
        @click="$emit('locate', item.context, item.text)"
      >
        <span class="module-search__node-badge">{{ nodeLabel(item.nodeType) }}</span>
        <span class="module-search__context" v-html="highlight(item.context, item.text)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { searchModuleContent, type ModuleSearchResult } from '../../api/modules';

const props = defineProps<{
  moduleId: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  /** 点击搜索结果，传出上下文文本和精确匹配片段，供编辑器定位 */
  (e: 'locate', context: string, match: string): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const query = ref('');
const results = ref<ModuleSearchResult[]>([]);
const loading = ref(false);
const searched = ref(false);

let timer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  inputRef.value?.focus();
});

function debouncedSearch() {
  if (timer) clearTimeout(timer);
  if (!query.value.trim()) {
    results.value = [];
    searched.value = false;
    return;
  }
  timer = setTimeout(runSearch, 300);
}

async function runSearch() {
  const q = query.value.trim();
  if (!q) return;
  loading.value = true;
  searched.value = false;
  try {
    const res = await searchModuleContent(props.moduleId, q);
    results.value = res.results;
    searched.value = true;
  } catch {
    results.value = [];
    searched.value = true;
  } finally {
    loading.value = false;
  }
}

function highlight(context: string, match: string): string {
  if (!match) return context;
  // 简单文本高亮，安全转义后标记匹配位置
  const escaped = context.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)
  );
  const escapedMatch = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(
    new RegExp(escapedMatch, 'gi'),
    (m) => `<mark class="search-highlight">${m}</mark>`,
  );
}

function nodeLabel(type: string): string {
  const map: Record<string, string> = {
    paragraph: '段落',
    heading: '标题',
    listItem: '列表',
    kp_info: 'KP信息',
    investigable_node: '调查节点',
    player_handout: '玩家讲义',
    npc_mention: 'NPC',
    branch_node: '条件分支',
    consequence_hint: '后果提示',
    rule_ref: '规则引用',
    text: '文本',
  };
  return map[type] ?? type;
}
</script>

<style scoped>
.module-search {
  display: flex;
  flex-direction: column;
  background: var(--surface-card);
  border-left: 1px solid var(--border-default);
  font-size: 13px;
  min-width: 280px;
  max-width: 360px;
}

.module-search__bar {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default);
  gap: 8px;
}

.module-search__input {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--surface-page);
  color: var(--color-text, #333);
  outline: none;
  transition: border-color 0.15s;
}

.module-search__input:focus {
  border-color: var(--color-primary, #4a6fa5);
}

.module-search__close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: var(--color-text-secondary, #888);
  padding: 0 4px;
}

.module-search__status {
  padding: 16px 12px;
  color: var(--color-text-secondary, #888);
  text-align: center;
  font-size: 12px;
}

.module-search__results {
  overflow-y: auto;
  flex: 1;
}

.module-search__count {
  padding: 6px 12px;
  font-size: 11px;
  color: var(--color-text-secondary, #888);
  border-bottom: 1px solid var(--border-default);
}

.module-search__item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-default);
  transition: background 0.12s;
}

.module-search__item:hover {
  background: var(--surface-hover);
}

.module-search__node-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--surface-hover);
  color: var(--color-text-secondary, #888);
  align-self: flex-start;
}

.module-search__context {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text, #444);
  word-break: break-all;
}

:deep(.search-highlight) {
  background: rgba(255, 204, 0, 0.4);
  border-radius: 2px;
  font-weight: 600;
}
</style>
