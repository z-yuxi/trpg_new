<template>
  <div class="module-editor-core" @mousemove="resetToolbarFade" @keydown.capture="resetToolbarFade">
    <!-- 工具栏 -->
    <div class="toolbar" :class="{ 'toolbar--faded': toolbarFaded }" @mouseenter="cancelToolbarFade" @mouseleave="scheduleToolbarFade">
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
      ><SvgIcon v-if="blk.icon.startsWith('icon-')" :name="blk.icon" :size="14" /><template v-else>{{ blk.icon }}</template></button>
      <span class="toolbar-spacer" />
      <div class="view-mode-group">
        <button
          v-for="mode in viewModes"
          :key="mode.id"
          class="toolbar-btn view-mode-btn"
          :class="{ active: currentViewMode === mode.id }"
          :title="mode.label"
          @click="switchViewMode(mode.id)"
        >{{ mode.label }}</button>
      </div>
      <span class="toolbar-sep" />
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
          <span class="slash-item-icon">
            <SvgIcon v-if="item.icon.startsWith('icon-')" :name="item.icon" :size="16" />
            <template v-else>{{ item.icon }}</template>
          </span>
          <span class="slash-item-label">{{ item.label }}</span>
        </div>
        <div v-if="filteredSlashItems.length === 0" class="slash-empty">无匹配</div>
      </div>
    </Transition>

    <!-- Mention @ 菜单 -->
    <Transition name="fade">
      <div
        v-if="mentionMenuVisible"
        class="slash-menu mention-menu"
        :style="mentionMenuStyle"
        @mousedown.prevent
      >
        <div v-if="mentionLoading" class="slash-empty">搜索中…</div>
        <template v-else-if="mentionItems.length > 0">
          <div
            v-for="(item, i) in mentionItems"
            :key="item.id"
            class="slash-item"
            :class="{ 'slash-item--active': i === mentionActiveIndex }"
            @click="applyMentionItem(item)"
          >
            <span class="slash-item-icon mention-type-icon">◆</span>
            <span class="slash-item-label">{{ item.name }}</span>
            <span class="mention-item-type">{{ item.type }}</span>
          </div>
        </template>
        <div v-else class="slash-empty">未找到实体</div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { listModuleEntities, type EntityItem } from '../../api/modules';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import SvgIcon from '../SvgIcon.vue';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';

// 旧块扩展——已注释，新方案不注册（待新方案验证通过后删除）
// import { SceneBlockExtension } from './extensions/SceneBlockExtension';
// import { NpcBlockExtension } from './extensions/NpcBlockExtension';
// import { EventBlockExtension } from './extensions/EventBlockExtension';
// import { ClueBlockExtension } from './extensions/ClueBlockExtension';
// import { CheckBlockExtension } from './extensions/CheckBlockExtension';
// import { DialogBlockExtension } from './extensions/DialogBlockExtension';

// 新原子块扩展
import { InvestigableNodeExtension } from './extensions/InvestigableNodeExtension';
import { KpInfoExtension } from './extensions/KpInfoExtension';
import { NpcMentionExtension } from './extensions/NpcMentionExtension';
import { ConsequenceHintExtension } from './extensions/ConsequenceHintExtension';
import { PlayerHandoutExtension } from './extensions/PlayerHandoutExtension';
import { RuleRefExtension } from './extensions/RuleRefExtension';
import { BranchNodeExtension } from './extensions/BranchNodeExtension';
import { PunctuationPairExtension } from './extensions/PunctuationPairExtension';
import { Extension } from '@tiptap/core';
import { createViewModePlugin, setViewMode, type ViewMode } from './extensions/ViewModePlugin';

// ── Props / Emits ──────────────────────────
const props = defineProps<{
  modelValue?: string | null;
  moduleId?: string;
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
    Placeholder.configure({ placeholder: '输入 "/" 插入结构化块，输入 "@" 插入 NPC 引用…' }),
    CharacterCount,
    InvestigableNodeExtension,
    KpInfoExtension,
    NpcMentionExtension,
    ConsequenceHintExtension,
    PlayerHandoutExtension,
    RuleRefExtension,
    BranchNodeExtension,
    PunctuationPairExtension,
    Extension.create({
      name: 'viewMode',
      addProseMirrorPlugins() {
        return [createViewModePlugin('edit')];
      },
    }),
  ],
  onUpdate({ editor }) {
    emit('update:modelValue', JSON.stringify(editor.getJSON()));
    emit('wordCount', editor.storage['characterCount'].characters());
  },
  editorProps: {
    handleKeyDown(_view: unknown, event: KeyboardEvent): boolean {
      if (mentionMenuVisible.value) {
        if (event.key === 'ArrowDown') {
          mentionActiveIndex.value = (mentionActiveIndex.value + 1) % Math.max(1, mentionItems.value.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          mentionActiveIndex.value = (mentionActiveIndex.value - 1 + Math.max(1, mentionItems.value.length)) % Math.max(1, mentionItems.value.length);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const item = mentionItems.value[mentionActiveIndex.value];
          if (item) applyMentionItem(item);
          return true;
        }
        if (event.key === 'Escape') {
          closeMentionMenu();
          return true;
        }
      }
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

// 工具栏淡出（E-1.1：停止输入 3s 后透明度降至 0.3）
const toolbarFaded = ref(false);
let toolbarFadeTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleToolbarFade() {
  if (toolbarFadeTimer) clearTimeout(toolbarFadeTimer);
  toolbarFadeTimer = setTimeout(() => { toolbarFaded.value = true; }, 3000);
}

function cancelToolbarFade() {
  if (toolbarFadeTimer) clearTimeout(toolbarFadeTimer);
  toolbarFaded.value = false;
}

function resetToolbarFade() {
  cancelToolbarFade();
  scheduleToolbarFade();
}

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
  { id: 'investigable_node', icon: '▼', label: '插入调查节点 (▼)' },
  { id: 'kp_info',           icon: '☆', label: '插入KP信息 (☆)' },
  { id: 'branch_node',       icon: '▸', label: '插入条件分支 (▸)' },
  { id: 'consequence_hint',  icon: '▶', label: '插入后果提示 (▶)' },
  { id: 'player_handout',    icon: '【】', label: '插入玩家资料 (【】)' },
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
  { id: 'investigable_node', icon: '▼',  label: '调查节点',  action: () => insertBlock('investigable_node') },
  { id: 'kp_info',           icon: '☆',  label: 'KP 信息',   action: () => insertBlock('kp_info') },
  { id: 'branch_node',       icon: '▸',  label: '条件分支',  action: () => insertBlock('branch_node') },
  { id: 'consequence_hint',  icon: '▶',  label: '后果提示',  action: () => insertBlock('consequence_hint') },
  { id: 'player_handout',    icon: '【】', label: '玩家资料',  action: () => insertBlock('player_handout') },
  { id: 'rule_ref',          icon: '[]', label: '规则引用',  action: () => insertRuleRef() },
];

const filteredSlashItems = computed(() => {
  const q = slashQuery.value.toLowerCase();
  if (!q) return allSlashItems;
  return allSlashItems.filter(i => i.label.toLowerCase().includes(q) || i.id.includes(q));
});

function insertBlock(type: string) {
  if (!editor.value) return;
  const id = crypto.randomUUID();
  editor.value.chain().focus().insertContent({ type, attrs: { id }, content: [{ type: 'paragraph' }] }).run();
}

function insertRuleRef() {
  if (!editor.value) return;
  const id = crypto.randomUUID();
  editor.value.chain().focus().insertContent({ type: 'rule_ref', attrs: { id, label: '检定', refType: 'check', value: '' } }).run();
}

// ── 视图模式切换 ──────────────────────────────────────────
const currentViewMode = ref<ViewMode>('edit');
const viewModes = [
  { id: 'edit'   as const, label: '编辑' },
  { id: 'kp'     as const, label: 'KP视角' },
  { id: 'player' as const, label: '玩家视角' },
] as const;

function switchViewMode(mode: ViewMode) {
  if (!editor.value) return;
  currentViewMode.value = mode;
  setViewMode(editor.value.view, mode);
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

// ── Mention 菜单（@ 触发）─────────────────────
const mentionMenuVisible = ref(false);
const mentionQuery = ref('');
const mentionItems = ref<EntityItem[]>([]);
const mentionActiveIndex = ref(0);
const mentionMenuStyle = ref({ top: '0px', left: '0px' });
const mentionLoading = ref(false);
let mentionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function closeMentionMenu() {
  mentionMenuVisible.value = false;
  mentionQuery.value = '';
  mentionItems.value = [];
  mentionActiveIndex.value = 0;
  if (mentionDebounceTimer) clearTimeout(mentionDebounceTimer);
}

async function fetchMentionItems(keyword: string) {
  if (!props.moduleId) return;
  mentionLoading.value = true;
  try {
    const res = await listModuleEntities(props.moduleId, { keyword: keyword || undefined });
    mentionItems.value = (res.data ?? []).slice(0, 10);
  } catch {
    mentionItems.value = [];
  } finally {
    mentionLoading.value = false;
  }
}

function applyMentionItem(item: EntityItem) {
  if (!editor.value) return;
  const { state } = editor.value;
  const { from } = state.selection;
  const queryLen = mentionQuery.value.length + 1; // +1 for "@"
  editor.value
    .chain()
    .focus()
    .deleteRange({ from: from - queryLen, to: from })
    .insertContent({
      type: 'npc_mention',
      attrs: { id: item.id, label: item.name, type: item.type },
    })
    .run();
  closeMentionMenu();
}

// 监听键盘输入以触发 "/" 菜单
function handleKeyup(e: KeyboardEvent) {
  if (!editor.value) return;
  const { state } = editor.value;
  const { from } = state.selection;
  const textBefore = state.doc.textBetween(Math.max(0, from - 20), from, '\n');
  // 处理 Mention @ 菜单
  if (mentionMenuVisible.value) {
    if (e.key === 'ArrowDown') {
      mentionActiveIndex.value = (mentionActiveIndex.value + 1) % Math.max(1, mentionItems.value.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      mentionActiveIndex.value = (mentionActiveIndex.value - 1 + Math.max(1, mentionItems.value.length)) % Math.max(1, mentionItems.value.length);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const item = mentionItems.value[mentionActiveIndex.value];
      if (item) applyMentionItem(item);
      return;
    }
    if (e.key === 'Escape') {
      closeMentionMenu();
      return;
    }
  }

  // 检测 @ 触发（@ 后跟汉字不触发）
  const mentionMatch = textBefore.match(/@([^\s\u4e00-\u9fa5]*)$/);
  if (mentionMatch) {
    const q = mentionMatch[1] ?? '';
    mentionQuery.value = q;
    mentionActiveIndex.value = 0;
    mentionMenuVisible.value = true;
    const coords = editor.value.view.coordsAtPos(from - q.length - 1);
    const editorRect = (editor.value.view.dom as HTMLElement).closest('.module-editor-core')?.getBoundingClientRect();
    if (editorRect) {
      const menuH = 240;
      const spaceBelow = editorRect.bottom - coords.bottom;
      const top = spaceBelow > menuH
        ? coords.bottom - editorRect.top + 4
        : coords.top - editorRect.top - menuH - 4;
      mentionMenuStyle.value = {
        top: `${top}px`,
        left: `${Math.max(0, coords.left - editorRect.left)}px`,
      };
    }
    if (mentionDebounceTimer) clearTimeout(mentionDebounceTimer);
    mentionDebounceTimer = setTimeout(() => fetchMentionItems(q), 300);
  } else if (mentionMenuVisible.value) {
    closeMentionMenu();
  }

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
  document.addEventListener('keydown', handleGlobalKeydown);
  scheduleToolbarFade();
});

onBeforeUnmount(() => {
  document.removeEventListener('keyup', handleKeyup);
  document.removeEventListener('keydown', handleGlobalKeydown);
  if (toolbarFadeTimer) clearTimeout(toolbarFadeTimer);
  editor.value?.destroy();
});

// ── 快捷键体系（E-1.8.2）────────────────────────────────
function handleGlobalKeydown(e: KeyboardEvent) {
  if (!editor.value) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl) return;

  // Ctrl+Shift+M → 触发 Mention 选择器（在光标处插入 @）
  if (e.shiftKey && e.key === 'M') {
    e.preventDefault();
    editor.value.chain().focus().insertContent('@').run();
    return;
  }

  // Ctrl+. → 在光标位置插入 kp_info 块
  if (!e.shiftKey && e.key === '.') {
    e.preventDefault();
    insertBlock('kp_info');
    return;
  }

  // Ctrl+Shift+N → 插入 NPC 资料块（investigable_node 替代）
  if (e.shiftKey && e.key === 'N') {
    e.preventDefault();
    insertBlock('investigable_node');
    return;
  }

  // Ctrl+Shift+L → 插入线索/资料块（player_handout）
  if (e.shiftKey && e.key === 'L') {
    e.preventDefault();
    insertBlock('player_handout');
    return;
  }
}
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
  transition: opacity 0.4s ease;
}

.toolbar--faded {
  opacity: 0.3;
  pointer-events: none;
}

.toolbar--faded:hover {
  opacity: 1;
  pointer-events: auto;
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

.view-mode-group {
  display: flex;
  gap: 2px;
}

.view-mode-btn {
  font-size: 12px;
  padding: 3px 8px;
}

/* 玩家视角下 kp_info 折叠为虚线细线 */
:deep(.kp-info--player-collapsed) {
  height: 8px !important;
  overflow: hidden;
  background: repeating-linear-gradient(
    90deg,
    #F5A623 0px, #F5A623 6px,
    transparent 6px, transparent 12px
  );
  border-radius: 2px;
  margin: 4px 0;
  opacity: 0.5;
  cursor: default;
  pointer-events: none;
}

:deep(.kp-info--player-collapsed > *) {
  display: none !important;
}

.slash-item-icon { width: 20px; text-align: center; font-size: 16px; }

.slash-empty { padding: 12px; color: var(--color-text-secondary, #888); font-size: 13px; text-align: center; }

.mention-menu { min-width: 220px; }
.mention-type-icon { color: #9013FE; }
.mention-item-type {
  font-size: 11px;
  color: var(--color-text-secondary, #888);
  background: var(--surface-hover);
  padding: 1px 5px;
  border-radius: 3px;
  margin-left: auto;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
