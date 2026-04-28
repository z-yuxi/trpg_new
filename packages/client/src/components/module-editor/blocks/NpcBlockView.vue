<template>
  <node-view-wrapper class="block-view block-view--npc">
    <div class="block-header" @click.prevent="toggleCollapse">
      <SvgIcon name="icon-npc" :size="16" class="block-icon" />
      <span class="block-title">{{ attrs.npc_name || '未命名 NPC' }}</span>
      <span class="block-tag">NPC</span>
      <button class="block-del" title="删除块" @click.stop="deleteNode">✕</button>
      <span class="block-chevron">{{ isCollapsed ? '▶' : '▼' }}</span>
    </div>
    <Transition name="blk">
      <div v-if="!isCollapsed" class="block-body">
        <div class="form-row">
          <label class="form-lbl">NPC 名称</label>
          <input class="form-inp" :value="attrs.npc_name" placeholder="输入 NPC 名称"
            @input="ua({ npc_name: iv($event) })" />
        </div>
        <div class="form-row">
          <label class="form-lbl">外貌描述</label>
          <textarea class="form-ta" rows="2" :value="attrs.appearance"
            placeholder="外貌、体态、着装等…"
            @input="ua({ appearance: tv($event) })" />
        </div>
        <div class="form-row">
          <label class="form-lbl">性格特征</label>
          <textarea class="form-ta" rows="2" :value="attrs.personality"
            placeholder="性格、口癖、行为习惯…"
            @input="ua({ personality: tv($event) })" />
        </div>
        <div class="form-row">
          <label class="form-lbl">背景故事</label>
          <textarea class="form-ta" rows="3" :value="attrs.background"
            placeholder="来历、动机、秘密…"
            @input="ua({ background: tv($event) })" />
        </div>
        <div class="form-row">
          <label class="form-lbl">属性/技能（JSON 格式）</label>
          <textarea class="form-ta form-ta--code" rows="3"
            :value="attrsJson" placeholder='{"力量": 60, "侦查": 70}'
            @input="updateJsonAttrs(tv($event))" />
        </div>
        <div class="content-sep">扩展描述</div>
        <node-view-content class="block-content" />
      </div>
    </Transition>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3';
import SvgIcon from '../../SvgIcon.vue';

const props = defineProps<{
  node: any;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  deleteNode: () => void;
}>();

const attrs = computed(() => props.node.attrs as Record<string, any>);
const isCollapsed = computed(() => !!attrs.value['collapsed']);

function toggleCollapse() { props.updateAttributes({ collapsed: !isCollapsed.value }); }
function ua(patch: Record<string, unknown>) { props.updateAttributes(patch); }
function iv(e: Event) { return (e.target as HTMLInputElement).value; }
function tv(e: Event) { return (e.target as HTMLTextAreaElement).value; }

const attrsJson = computed(() => {
  const a = attrs.value['attributes'] ?? {};
  const s = attrs.value['skills'] ?? {};
  return JSON.stringify({ ...a, ...s }, null, 2);
});

function updateJsonAttrs(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    props.updateAttributes({ attributes: parsed });
  } catch { /* ignore invalid JSON while typing */ }
}
</script>

<style scoped>
.block-view--npc { border-left: 4px solid var(--color-warning); }
.block-header { display:flex; align-items:center; gap:6px; padding:6px 10px;
  cursor:pointer; user-select:none; background:var(--surface-hover); }
.block-icon { font-size:14px; }
.block-title { flex:1; font-weight:600; font-size:13px;
  color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.block-tag { font-size:11px; padding:1px 6px; border-radius:10px;
  background:var(--color-warning-bg); color:var(--color-warning-text); }
.block-del { border:none; background:none; cursor:pointer; color:var(--text-muted);
  font-size:12px; padding:2px 4px; border-radius:3px; }
.block-del:hover { background:var(--color-danger-light); color:var(--color-danger); }
.block-chevron { font-size:10px; color:var(--text-muted); }
.block-body { padding:12px; display:flex; flex-direction:column; gap:8px; }
.form-row { display:flex; flex-direction:column; gap:3px; }
.form-lbl { font-size:11px; color:var(--text-body); font-weight:500; }
.form-inp,.form-ta { width:100%; padding:5px 8px; border:1px solid var(--border-default);
  border-radius:4px; font-size:13px; font-family:inherit;
  background:var(--surface-card); color:var(--text-primary); box-sizing:border-box; }
.form-ta { resize:vertical; min-height:50px; }
.form-ta--code { font-family:monospace; font-size:12px; }
.content-sep { font-size:11px; color:var(--text-muted); margin:4px 0 2px; }
.block-content { min-height:40px; }
.blk-enter-active,.blk-leave-active { transition:opacity .15s,transform .15s; }
.blk-enter-from,.blk-leave-to { opacity:0; transform:translateY(-4px); }
</style>
