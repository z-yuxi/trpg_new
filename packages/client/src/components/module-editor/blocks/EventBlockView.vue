<template>
  <node-view-wrapper class="block-view block-view--event">
    <div class="block-header" @click.prevent="toggleCollapse">
      <span class="block-icon">⚡</span>
      <span class="block-title">{{ attrs.event_name || '未命名事件' }}</span>
      <span class="block-tag" :class="`difficulty--${attrs.difficulty}`">{{ diffLabel }}</span>
      <button class="block-del" title="删除块" @click.stop="deleteNode">✕</button>
      <span class="block-chevron">{{ isCollapsed ? '▶' : '▼' }}</span>
    </div>
    <Transition name="blk">
      <div v-if="!isCollapsed" class="block-body">
        <div class="form-row">
          <label class="form-lbl">事件名称</label>
          <input class="form-inp" :value="attrs.event_name" placeholder="事件名称"
            @input="ua({ event_name: iv($event) })" />
        </div>
        <div class="form-row">
          <label class="form-lbl">难度</label>
          <select class="form-sel" :value="attrs.difficulty"
            @change="ua({ difficulty: sv($event) })">
            <option value="easy">简单</option>
            <option value="normal">普通</option>
            <option value="hard">困难</option>
            <option value="deadly">致命</option>
          </select>
        </div>
        <div class="form-row">
          <label class="form-lbl">触发条件</label>
          <textarea class="form-ta" rows="2" :value="attrs.trigger"
            placeholder="什么情况下触发此事件…"
            @input="ua({ trigger: tv($event) })" />
        </div>
        <!-- Branches -->
        <div class="form-row">
          <label class="form-lbl">分支结果</label>
          <div v-for="(branch, i) in branches" :key="i" class="branch-row">
            <input class="form-inp branch-cond" :value="branch.condition"
              placeholder="条件（如：检定成功）"
              @input="updateBranch(i, 'condition', iv($event))" />
            <input class="form-inp" :value="branch.outcome"
              placeholder="结果描述"
              @input="updateBranch(i, 'outcome', iv($event))" />
            <button class="branch-del" @click.stop="removeBranch(i)">✕</button>
          </div>
          <button class="add-btn" @click.stop="addBranch">+ 添加分支</button>
        </div>
        <div class="content-sep">事件详情</div>
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

const diffLabel = computed(() => {
  const m: Record<string, string> = { easy: '简单', normal: '普通', hard: '困难', deadly: '致命' };
  return m[attrs.value['difficulty'] as string] ?? '普通';
});

const branches = computed(() => (attrs.value['branches'] as any[]) ?? []);

function addBranch() {
  props.updateAttributes({ branches: [...branches.value, { condition: '', outcome: '' }] });
}
function removeBranch(i: number) {
  const arr = [...branches.value];
  arr.splice(i, 1);
  props.updateAttributes({ branches: arr });
}
function updateBranch(i: number, key: string, val: string) {
  const arr = branches.value.map((b: any, idx: number) => idx === i ? { ...b, [key]: val } : b);
  props.updateAttributes({ branches: arr });
}
</script>

<style scoped>
.block-view--event { border-left: 4px solid var(--color-primary, #1976d2); }
.block-header { display:flex; align-items:center; gap:6px; padding:6px 10px;
  cursor:pointer; user-select:none; background:var(--bg-2,#f5f5f5); }
.block-icon { font-size:14px; }
.block-title { flex:1; font-weight:600; font-size:13px;
  color:var(--fg-1,#222); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.block-tag { font-size:11px; padding:1px 6px; border-radius:10px;
  background:var(--color-primary-light,#bbdefb); color:var(--color-primary-dark,#0d47a1); }
.difficulty--easy { background:#c8e6c9; color:#2e7d32; }
.difficulty--hard { background:#ffccbc; color:#bf360c; }
.difficulty--deadly { background:#ffcdd2; color:#b71c1c; }
.block-del { border:none; background:none; cursor:pointer; color:var(--fg-3,#999);
  font-size:12px; padding:2px 4px; border-radius:3px; }
.block-del:hover { background:var(--color-danger-light,#ffcdd2); color:var(--color-danger,#f44336); }
.block-chevron { font-size:10px; color:var(--fg-3,#999); }
.block-body { padding:12px; display:flex; flex-direction:column; gap:8px; }
.form-row { display:flex; flex-direction:column; gap:3px; }
.form-lbl { font-size:11px; color:var(--fg-2,#666); font-weight:500; }
.form-inp,.form-sel,.form-ta { width:100%; padding:5px 8px; border:1px solid var(--border,#ddd);
  border-radius:4px; font-size:13px; font-family:inherit;
  background:var(--bg-1,#fff); color:var(--fg-1,#222); box-sizing:border-box; }
.form-ta { resize:vertical; min-height:50px; }
.branch-row { display:flex; gap:6px; align-items:center; margin-bottom:4px; }
.branch-cond { width:40%; }
.branch-del { border:none; background:none; cursor:pointer;
  color:var(--fg-3,#999); font-size:12px; padding:2px 4px; flex-shrink:0; }
.add-btn { font-size:12px; color:var(--color-primary,#1976d2); background:none;
  border:1px dashed var(--border,#ddd); border-radius:4px; cursor:pointer;
  padding:3px 10px; align-self:flex-start; }
.add-btn:hover { background:var(--bg-2,#f5f5f5); }
.content-sep { font-size:11px; color:var(--fg-3,#aaa); margin:4px 0 2px; }
.block-content { min-height:40px; }
.blk-enter-active,.blk-leave-active { transition:opacity .15s,transform .15s; }
.blk-enter-from,.blk-leave-to { opacity:0; transform:translateY(-4px); }
</style>
