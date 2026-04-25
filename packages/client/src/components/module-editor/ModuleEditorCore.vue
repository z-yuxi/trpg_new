<template>
  <div class="module-editor-core">
    <!-- 工具栏 -->
    <div class="toolbar">
      <button
        v-for="btn in toolbarButtons"
        :key="btn.label"
        class="toolbar-btn"
        :class="{ active: btn.isActive?.() }"
        :title="btn.label"
        @click="btn.action"
      >
        {{ btn.icon }}
      </button>
      <span class="toolbar-sep" />
      <button class="toolbar-btn" title="撤销" @click="editor?.chain().focus().undo().run()">↩</button>
      <button class="toolbar-btn" title="重做" @click="editor?.chain().focus().redo().run()">↪</button>
      <span class="toolbar-sep" />
      <!-- 块类型快捷按钮 -->
      <button
        v-for="blk in blockButtons"
        :key="blk.id"
        class="toolbar-btn"
        :title="blk.label"
        @click="insertBlock(blk.id)"
      >{{ blk.icon }}</button>
      <span class="toolbar-spacer" />
      <span class="word-count">{{ wordCount }} 字</span>
    </div>

    <!-- 编辑区域 -->
    <div class="editor-scroll">
      <editor-content :editor="editor" class="editor-body" />
    </div>

    <!-- Slash 命令菜单 -->
    <Transition name="fade">
      <div
        v-if="slashMenuVisible"
        class="slash-menu"
        :style="slashMenuStyle"
        @mousedown.prevent
      >
        <div
          v-for="(item, i) in filteredSlashItems"
          :key="item.id"
          class="slash-item"
          :class="{ 'slash-item--active': i === slashActiveIndex }"
          @click="applySlashItem(item)"
        >
          <span class="slash-item-icon">{{ item.icon }}</span>
          <span class="slash-item-label">{{ item.label }}</span>
        </div>
        <div v-if="filteredSlashItems.length === 0" class="slash-empty">无匹配</div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';

import { SceneBlockExtension } from './extensions/SceneBlockExtension';
import { NpcBlockExtension } from './extensions/NpcBlockExtension';
import { EventBlockExtension } from './extensions/EventBlockExtension';
import { ClueBlockExtension } from './extensions/ClueBlockExtension';
import { CheckBlockExtension } from './extensions/CheckBlockExtension';
import { DialogBlockExtension } from './extensions/DialogBlockExtension';

// ── Props / Emits ──────────────────────────────────────────
const props = defineProps<{
  modelValue?: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'wordCount', count: number): void;
}>();

// ── TipTap 编辑器 ──────────────────────────────────────────
const editor = useEditor({
  content: props.modelValue ? tryParse(props.modelValue) : '',
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: '输入 "/" 可插入内容块，或直接编写内容…' }),
    CharacterCount,
    SceneBlockExtension,
    NpcBlockExtension,
    EventBlockExtension,
    ClueBlockExtension,
    CheckBlockExtension,
    DialogBlockExtension,
  ],
  onUpdate({ editor }) {
    emit('update:modelValue', JSON.stringify(editor.getJSON()));
    emit('wordCount', editor.storage['characterCount'].characters());
  },
  editorProps: {
    handleKeyDown(_view: unknown, event: KeyboardEvent): boolean {
      if (slashMenuVisible.value) {
        if (event.key === 'ArrowDown') {
          slashActiveIndex.value = (slashActiveIndex.value + 1) % filteredSlashItems.value.length;
          return true;
        }
        if (event.key === 'ArrowUp') {
          slashActiveIndex.value = (slashActiveIndex.value - 1 + filteredSlashItems.value.length) % filteredSlashItems.value.length;
          return true;
        }
        if (event.key === 'Enter') {
          applySlashItem(filteredSlashItems.value[slashActiveIndex.value]!);
          return true;
        }
        if (event.key === 'Escape') {
          closeSlashMenu();
          return true;
        }
      }
      return false;
    },
  },
});

function tryParse(s: string) {
  try { return JSON.parse(s); } catch { return s; }
}

const wordCount = computed(() => editor.value?.storage['characterCount']?.characters() ?? 0);

// 监听外部 modelValue 变化（加载时）
watch(() => props.modelValue, (val) => {
  if (!editor.value) return;
  const parsed = val ? tryParse(val) : '';
  const current = JSON.stringify(editor.value.getJSON());
  if (JSON.stringify(parsed) !== current) {
    editor.value.commands.setContent(parsed);
  }
});

// ── 工具栏 ────────────────────────────────────────────────
// 块类型工具栏按钮
const blockButtons = [
  { id: 'scene_block',  icon: '📍', label: '插入场景块' },
  { id: 'npc_block',   icon: '🧑', label: '插入NPC块' },
  { id: 'event_block', icon: '⚡', label: '插入事件块' },
  { id: 'clue_block',  icon: '🔍', label: '插入线索块' },
  { id: 'check_block', icon: '🎲', label: '插入检定块' },
  { id: 'dialog_block',icon: '💬', label: '插入对话块' },
];

const toolbarButtons = computed(() => {
  if (!editor.value) return [];
  const e = editor.value;
  return [
    { icon: 'H1', label: '标题1', action: () => e.chain().focus().toggleHeading({ level: 1 }).run(), isActive: () => e.isActive('heading', { level: 1 }) },
    { icon: 'H2', label: '标题2', action: () => e.chain().focus().toggleHeading({ level: 2 }).run(), isActive: () => e.isActive('heading', { level: 2 }) },
    { icon: 'H3', label: '标题3', action: () => e.chain().focus().toggleHeading({ level: 3 }).run(), isActive: () => e.isActive('heading', { level: 3 }) },
    { icon: 'B', label: '粗体', action: () => e.chain().focus().toggleBold().run(), isActive: () => e.isActive('bold') },
    { icon: 'I', label: '斜体', action: () => e.chain().focus().toggleItalic().run(), isActive: () => e.isActive('italic') },
    { icon: '≡', label: '无序列表', action: () => e.chain().focus().toggleBulletList().run(), isActive: () => e.isActive('bulletList') },
    { icon: '№', label: '有序列表', action: () => e.chain().focus().toggleOrderedList().run(), isActive: () => e.isActive('orderedList') },
    { icon: '—', label: '分割线', action: () => e.chain().focus().setHorizontalRule().run(), isActive: () => false },
  ];
});

// ── Slash 命令菜单 ────────────────────────────────────────
interface SlashItem {
  id: string;
  icon: string;
  label: string;
  action: () => void;
}

const slashMenuVisible = ref(false);
const slashQuery = ref('');
const slashActiveIndex = ref(0);
const slashMenuStyle = ref({ top: '0px', left: '0px' });

const allSlashItems: SlashItem[] = [
  { id: 'paragraph', icon: '¶', label: '段落', action: () => editor.value?.chain().focus().setParagraph().run() },
  { id: 'h1', icon: 'H1', label: '标题 1', action: () => editor.value?.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: 'h2', icon: 'H2', label: '标题 2', action: () => editor.value?.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: 'h3', icon: 'H3', label: '标题 3', action: () => editor.value?.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: 'bullet', icon: '•', label: '无序列表', action: () => editor.value?.chain().focus().toggleBulletList().run() },
  { id: 'ordered', icon: '1.', label: '有序列表', action: () => editor.value?.chain().focus().toggleOrderedList().run() },
  { id: 'divider', icon: '—', label: '分割线', action: () => editor.value?.chain().focus().setHorizontalRule().run() },
  { id: 'scene', icon: '📍', label: '场景块', action: () => insertBlock('scene_block') },
  { id: 'npc', icon: '🧑', label: 'NPC 块', action: () => insertBlock('npc_block') },
  { id: 'event', icon: '⚡', label: '事件块', action: () => insertBlock('event_block') },
  { id: 'clue', icon: '🔍', label: '线索块', action: () => insertBlock('clue_block') },
  { id: 'check', icon: '🎲', label: '检定块', action: () => insertBlock('check_block') },
  { id: 'dialog', icon: '💬', label: '对话块', action: () => insertBlock('dialog_block') },
];

const filteredSlashItems = computed(() => {
  const q = slashQuery.value.toLowerCase();
  if (!q) return allSlashItems;
  return allSlashItems.filter(i => i.label.toLowerCase().includes(q) || i.id.includes(q));
});

function insertBlock(type: string) {
  if (!editor.value) return;
  const id = Math.random().toString(36).slice(2, 10);
  editor.value.chain().focus().insertContent({ type, attrs: { id }, content: [] }).run();
}

function applySlashItem(item: SlashItem | undefined) {
  if (!item) return;
  // 删除 "/" + query 文字
  if (editor.value) {
    const { state } = editor.value;
    const { from } = state.selection;
    const queryLen = slashQuery.value.length + 1; // +1 for "/"
    editor.value.chain().focus().deleteRange({ from: from - queryLen, to: from }).run();
  }
  item.action();
  closeSlashMenu();
}

function closeSlashMenu() {
  slashMenuVisible.value = false;
  slashQuery.value = '';
  slashActiveIndex.value = 0;
}

// 监听键盘输入以触发 "/" 菜单
function handleKeyup(e: KeyboardEvent) {
  if (!editor.value) return;
  const { state } = editor.value;
  const { from } = state.selection;
  const textBefore = state.doc.textBetween(Math.max(0, from - 20), from, '\n');
  const slashMatch = textBefore.match(/\/(\w*)$/);
  if (slashMatch) {
    slashQuery.value = slashMatch[1] ?? '';
    slashActiveIndex.value = 0;
    slashMenuVisible.value = true;
    // 计算菜单位置
    const coords = editor.value.view.coordsAtPos(from - slashQuery.value.length - 1);
    const editorRect = (editor.value.view.dom as HTMLElement).closest('.module-editor-core')?.getBoundingClientRect();
    if (editorRect) {
      const menuH = 300; // max-height of slash menu
      const spaceBelow = editorRect.bottom - coords.bottom;
      const top = spaceBelow > menuH
        ? coords.bottom - editorRect.top + 4
        : coords.top - editorRect.top - menuH - 4;
      slashMenuStyle.value = {
        top: `${top}px`,
        left: `${Math.max(0, coords.left - editorRect.left)}px`,
      };
    }
  } else {
    if (slashMenuVisible.value) closeSlashMenu();
  }
}

onMounted(() => {
  document.addEventListener('keyup', handleKeyup);
});

onBeforeUnmount(() => {
  document.removeEventListener('keyup', handleKeyup);
  editor.value?.destroy();
});
</script>

<style scoped>
.module-editor-core {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-card);
  flex-shrink: 0;
}

.toolbar-btn {
  padding: 4px 8px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text, #333);
  transition: background 0.15s;
}

.toolbar-btn:hover { background: var(--surface-hover); }
.toolbar-btn.active { background: var(--color-primary-light); color: var(--color-primary); }

.toolbar-sep {
  width: 1px;
  height: 20px;
  background: var(--border-default);
  margin: 0 4px;
}

.toolbar-spacer { flex: 1; }

.word-count {
  font-size: 12px;
  color: var(--color-text-secondary, #888);
}

.editor-scroll {
  flex: 1;
  overflow-y: auto;
}

.editor-body {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px 24px;
}

/* TipTap 编辑器占位符 */
:deep(.tiptap p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--color-text-placeholder, #bbb);
  pointer-events: none;
  float: left;
  height: 0;
}

:deep(.tiptap) {
  outline: none;
  min-height: 400px;
  font-size: 15px;
  line-height: 1.7;
  color: var(--color-text, #333);
}

:deep(.tiptap h1) { font-size: 1.8em; margin: 1em 0 0.4em; }
:deep(.tiptap h2) { font-size: 1.4em; margin: 0.9em 0 0.35em; }
:deep(.tiptap h3) { font-size: 1.15em; margin: 0.8em 0 0.3em; }
:deep(.tiptap ul, .tiptap ol) { padding-left: 1.5em; }
:deep(.tiptap hr) { border: none; border-top: 1px solid var(--border-default); margin: 1.5em 0; }

/* 业务块通用样式 */
:deep(.block-view) {
  border-radius: 6px;
  margin: 8px 0;
  border: 1px solid var(--border-default);
  overflow: hidden;
}

:deep(.block-header) {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--surface-page);
  cursor: pointer;
  user-select: none;
}

:deep(.block-title) { flex: 1; font-weight: 600; font-size: 14px; }
:deep(.block-tag) { font-size: 11px; padding: 2px 6px; border-radius: 3px; background: var(--surface-hover); color: var(--text-body); }
:deep(.collapse-btn) { font-size: 11px; color: var(--color-text-secondary, #888); }

:deep(.block-body) { padding: 8px 12px; }
:deep(.block-content) { outline: none; }

/* Slash 命令菜单 */
.slash-menu {
  position: absolute;
  z-index: 100;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  min-width: 200px;
  max-height: 300px;
  overflow-y: auto;
  padding: 4px;
}

.slash-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.12s;
}

.slash-item:hover,
.slash-item--active { background: var(--surface-hover); }

.slash-item-icon { width: 20px; text-align: center; font-size: 16px; }

.slash-empty { padding: 12px; color: var(--color-text-secondary, #888); font-size: 13px; text-align: center; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
