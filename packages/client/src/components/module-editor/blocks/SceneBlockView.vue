<template>
  <node-view-wrapper class="block-view block-view--scene">
    <div class="block-header" @click.prevent="toggleCollapse">
      <SvgIcon name="icon-scene" :size="16" class="block-icon" />
      <span class="block-title">{{ attrs.scene_name || '未命名场景' }}</span>
      <span class="block-tag">{{ sceneTypeLabel }}</span>
      <button class="block-del" title="删除块" @click.stop="deleteNode">✕</button>
      <span class="block-chevron">{{ isCollapsed ? '▶' : '▼' }}</span>
    </div>
    <Transition name="blk">
      <div v-if="!isCollapsed" class="block-body">
        <div class="form-row">
          <label class="form-lbl">场景名称</label>
          <input class="form-inp" :value="attrs.scene_name" placeholder="输入场景名称"
            @input="ua({ scene_name: iv($event) })" />
        </div>
        <div class="form-row">
          <label class="form-lbl">场景类型</label>
          <select class="form-sel" :value="attrs.scene_type"
            @change="ua({ scene_type: sv($event) })">
            <option value="spatial">实体场所</option>
            <option value="virtual">虚拟场景</option>
            <option value="lobby">枢纽/大厅</option>
          </select>
        </div>
        <div class="form-row">
          <label class="form-lbl">氛围描述</label>
          <textarea class="form-ta" rows="2" :value="attrs.atmosphere"
            placeholder="简要描述场景氛围…"
            @input="ua({ atmosphere: tv($event) })" />
        </div>        <div class="form-row">
          <label class="form-lbl">氏围关键词
            <span class="form-hint">最多 5 个，逗号分隔</span>
          </label>
          <input
            class="form-inp"
            :value="Array.isArray(attrs.atmosphere_keywords) ? attrs.atmosphere_keywords.join(',') : ''"
            placeholder="雨夜,洞穴,紧张…"
            @change="ua({ atmosphere_keywords: ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5) })"
          />
        </div>        <div class="form-row form-row--gm">
          <label class="form-lbl">GM 备注 <span class="gm-badge">GM</span></label>
          <textarea class="form-ta form-ta--gm" rows="2" :value="attrs.gm_notes"
            placeholder="玩家不可见的备注…"
            @input="ua({ gm_notes: tv($event) })" />
        </div>
        <div class="form-row">
          <label class="form-lbl">地图说明</label>
          <textarea class="form-ta" rows="2" :value="attrs.map_description"
            placeholder="地图或位置描述…"
            @input="ua({ map_description: tv($event) })" />
        </div>
        <div class="content-sep">场景描述</div>
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
function sv(e: Event) { return (e.target as HTMLSelectElement).value; }
function tv(e: Event) { return (e.target as HTMLTextAreaElement).value; }

const sceneTypeLabel = computed(() => {
  const m: Record<string, string> = { spatial: '实体', virtual: '虚拟', lobby: '枢纽' };
  return m[attrs.value['scene_type'] as string] ?? '场景';
});
</script>

<style scoped>
.block-view--scene { border-left: 4px solid var(--color-success); }
.block-header { display:flex; align-items:center; gap:6px; padding:6px 10px;
  cursor:pointer; user-select:none; background:var(--surface-hover); }
.block-icon { font-size:14px; }
.block-title { flex:1; font-weight:600; font-size:13px;
  color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.block-tag { font-size:11px; padding:1px 6px; border-radius:10px;
  background:var(--color-success-bg); color:var(--color-success); }
.block-del { border:none; background:none; cursor:pointer; color:var(--text-muted);
  font-size:12px; padding:2px 4px; border-radius:3px; }
.block-del:hover { background:var(--color-danger-light); color:var(--color-danger); }
.block-chevron { font-size:10px; color:var(--text-muted); }
.block-body { padding:12px; display:flex; flex-direction:column; gap:8px; }
.form-row { display:flex; flex-direction:column; gap:3px; }
.form-row--gm { background:var(--surface-page); border-radius:4px; padding:6px; }
.form-lbl { font-size:11px; color:var(--text-body); font-weight:500;
  display:flex; align-items:center; gap:4px; }
.form-hint { font-size:10px; color:var(--text-muted); font-weight:400; }
.gm-badge { font-size:10px; padding:0 4px; border-radius:8px;
  background:var(--color-warning-bg); color:var(--color-warning-text); }
.form-inp,.form-sel,.form-ta { width:100%; padding:5px 8px; border:1px solid var(--border-default);
  border-radius:4px; font-size:13px; font-family:inherit;
  background:var(--surface-card); color:var(--text-primary); box-sizing:border-box; }
.form-ta { resize:vertical; min-height:50px; }
.form-ta--gm { background:var(--surface-page); }
.content-sep { font-size:11px; color:var(--text-muted); margin:4px 0 2px; }
.block-content { min-height:40px; }
.blk-enter-active,.blk-leave-active { transition:opacity .15s,transform .15s; }
.blk-enter-from,.blk-leave-to { opacity:0; transform:translateY(-4px); }
</style>
