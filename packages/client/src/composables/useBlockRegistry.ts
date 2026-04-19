/**
 * useBlockRegistry
 * 维护当前 TipTap 文档中所有业务块的注册表，供块间引用下拉使用
 */
import { ref, computed, watch, onUnmounted, getCurrentInstance, type Ref } from 'vue';
import type { Editor } from '@tiptap/core';

export interface BlockRegistryEntry {
  id: string;
  type: string;
  /** 块的显示名称（scene_name / npc_name / dialog_title 等） */
  name: string;
}

const BLOCK_TYPES = new Set([
  'scene_block', 'npc_block', 'event_block', 'clue_block', 'check_block', 'dialog_block',
]);

function getBlockName(node: Record<string, any>): string {
  const a = node.attrs ?? {};
  return (
    a.scene_name || a.npc_name || a.event_name ||
    a.clue_name || a.check_name || a.dialog_title || '未命名'
  );
}

function extractBlocks(doc: Record<string, any>): BlockRegistryEntry[] {
  const result: BlockRegistryEntry[] = [];

  function traverse(node: Record<string, any>) {
    if (!node) return;
    if (BLOCK_TYPES.has(node.type) && node.attrs?.id) {
      result.push({ id: node.attrs.id, type: node.type, name: getBlockName(node) });
    }
    (node.content ?? []).forEach(traverse);
  }

  (doc.content ?? []).forEach(traverse);
  return result;
}

export function useBlockRegistry(editor: Ref<Editor | undefined>) {
  const registry = ref<BlockRegistryEntry[]>([]);

  function refresh() {
    if (!editor.value) return;
    registry.value = extractBlocks(editor.value.getJSON());
  }

  let cleanup: (() => void) | null = null;

  watch(
    editor,
    (e) => {
      if (cleanup) cleanup();
      if (!e) return;
      const handler = () => refresh();
      e.on('update', handler);
      refresh();
      cleanup = () => e.off('update', handler);
    },
    { immediate: true },
  );

  // 仅在组件上下文中注册卸载钩子，避免在测试或非组件环境中调用
  if (getCurrentInstance()) {
    onUnmounted(() => cleanup?.());
  }

  /** 按类型分组的注册表 */
  const byType = computed(() => {
    const map: Record<string, BlockRegistryEntry[]> = {};
    for (const entry of registry.value) {
      (map[entry.type] ??= []).push(entry);
    }
    return map;
  });

  return { registry, byType, refresh };
}
