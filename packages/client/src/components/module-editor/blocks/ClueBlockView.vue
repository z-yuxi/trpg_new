<template>
  <node-view-wrapper class="block-view block-view--clue">
    <div class="block-header" @click.prevent="toggleCollapse">
      <span class="block-icon">🔍</span>
      <span class="block-title">{{ attrs.clue_name || '未命名线索' }}</span>
      <span class="block-tag">{{ clueTypeLabel }}</span>
      <button class="block-del" title="删除块" @click.stop="deleteNode">✕</button>
      <span class="block-chevron">{{ isCollapsed ? '▶' : '▼' }}</span>
    </div>
    <Transition name="blk">
      <div v-if="!isCollapsed" class="block-body">
        <div class="form-row">
          <label class="form-lbl">线索名称</label>
          <input class="form-inp" :value="attrs.clue_name" placeholder="线索名称"
            @input="ua({ clue_name: iv($event) })" />
        </div>
        <div class="form-cols">
          <div class="form-row">
            <label class="form-lbl">线索类型</label>
            <select class="form-sel" :value="attrs.clue_type"
              @change="ua({ clue_type: sv($event) })">
              <option value="physical">实物</option>
              <option value="testimonial">证词</option>
              <option value="documentary">文件</option>
              <option value="digital">数字</option>
            </select>
          </div>
          <div class="form-row">
            <label class="form-lbl">揭示方式</label>
            <select class="form-sel" :value="attrs.reveal_method"
              @change="ua({ reveal_method: sv($event) })">
              <option value="auto">自动</option>
              <option value="gm_manual">GM 手动</option>
              <option value="check_success">检定成功</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <label class="form-lbl">线索内容</label>
          <textarea class="form-ta" rows="3" :value="attrs.content"
            placeholder="线索的具体内容…"
            @input="ua({ content: tv($event) })" />
        </div>
        <div class="form-row">
          <label class="form-lbl">解锁条件</label>
          <input class="form-inp" :value="attrs.unlock_condition"
            placeholder="解锁线索所需的条件…"
            @input="ua({ unlock_condition: iv($event) })" />
        </div>
        <div class="form-row">
          <label class="form-lbl">主题样式</label>
          <select class="form-sel" :value="attrs.theme"
            @change="ua({ theme: sv($event) })">
            <option value="river">江河</option>
            <option value="blur">模糊</option>
            <option value="fragment">碎片</option>
            <option value="wave">波浪</option>
            <option value="ancient">古文</option>
            <option value="blood">血迹</option>
            <option value="ash">灰烬</option>
            <option value="cyber">赛博朋克</option>
          </select>
        </div>
        <div class="content-sep">附加说明</div>
        <node-view-content class="block-content" />
      </div>
    </Transition>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3';

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
function sv(e: Event) { return (e.target as HTMLSelectElement).value; }
function tv(e: Event) { return (e.target as HTMLTextAreaElement).value; }

const clueTypeLabel = computed(() => {
  const m: Record<string, string> = {
    physical: '实物', testimonial: '证词', documentary: '文件', digital: '数字'
  };
  return m[attrs.value['clue_type'] as string] ?? '线索';
});
</script>

<style scoped>
.block-view--clue { border-left: 4px solid var(--color-accent, #9c27b0); }
.block-header { display:flex; align-items:center; gap:6px; padding:6px 10px;
  cursor:pointer; user-select:none; background:var(--surface-hover); }
.block-icon { font-size:14px; }
.block-title { flex:1; font-weight:600; font-size:13px;
  color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.block-tag { font-size:11px; padding:1px 6px; border-radius:10px;
  background:var(--color-accent-light,#f3e5f5); color:var(--color-accent-dark,#6a1b9a); }
.block-del { border:none; background:none; cursor:pointer; color:var(--text-muted);
  font-size:12px; padding:2px 4px; border-radius:3px; }
.block-del:hover { background:var(--color-danger-light); color:var(--color-danger); }
.block-chevron { font-size:10px; color:var(--text-muted); }
.block-body { padding:12px; display:flex; flex-direction:column; gap:8px; }
.form-cols { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.form-row { display:flex; flex-direction:column; gap:3px; }
.form-lbl { font-size:11px; color:var(--text-body); font-weight:500; }
.form-inp,.form-sel,.form-ta { width:100%; padding:5px 8px; border:1px solid var(--border-default);
  border-radius:4px; font-size:13px; font-family:inherit;
  background:var(--surface-card); color:var(--text-primary); box-sizing:border-box; }
.form-ta { resize:vertical; min-height:50px; }
.content-sep { font-size:11px; color:var(--text-muted); margin:4px 0 2px; }
.block-content { min-height:40px; }
.blk-enter-active,.blk-leave-active { transition:opacity .15s,transform .15s; }
.blk-enter-from,.blk-leave-to { opacity:0; transform:translateY(-4px); }
</style>
