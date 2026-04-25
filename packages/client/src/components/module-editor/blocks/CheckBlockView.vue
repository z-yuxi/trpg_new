<template>
  <node-view-wrapper class="block-view block-view--check">
    <div class="block-header" @click.prevent="toggleCollapse">
      <span class="block-icon">🎲</span>
      <span class="block-title">{{ checkTitle }}</span>
      <span class="block-tag">检定</span>
      <button class="block-del" title="删除块" @click.stop="deleteNode">✕</button>
      <span class="block-chevron">{{ isCollapsed ? '▶' : '▼' }}</span>
    </div>
    <Transition name="blk">
      <div v-if="!isCollapsed" class="block-body">
        <div class="form-row">
          <label class="form-lbl">检定名称</label>
          <input class="form-inp" :value="attrs.check_name" placeholder="检定名称"
            @input="ua({ check_name: iv($event) })" />
        </div>
        <div class="form-cols">
          <div class="form-row">
            <label class="form-lbl">检定类型</label>
            <input class="form-inp" :value="attrs.check_type" placeholder="如 rc / ra / sc"
              @input="ua({ check_type: iv($event) })" />
          </div>
          <div class="form-row">
            <label class="form-lbl">技能/属性</label>
            <input class="form-inp" :value="attrs.skill_or_attribute" placeholder="如 侦查 / 力量"
              @input="ua({ skill_or_attribute: iv($event) })" />
          </div>
        </div>
        <div class="form-row">
          <label class="form-lbl">难度覆盖（空=使用规则集默认）</label>
          <input class="form-inp" type="number" :value="attrs.difficulty_override ?? ''"
            placeholder="空表示使用规则集默认"
            @input="ua({ difficulty_override: nv($event) })" />
        </div>
        <div class="form-row">
          <label class="form-lbl">规则集命令</label>
          <input class="form-inp" :value="attrs.ruleset_command" placeholder="如 /rc 侦查"
            @input="ua({ ruleset_command: iv($event) })" />
        </div>
        <div class="effects">
          <div class="form-row">
            <label class="form-lbl effect-success">▲ 成功效果</label>
            <textarea class="form-ta" rows="2" :value="attrs.success_effect"
              @input="ua({ success_effect: tv($event) })" />
          </div>
          <div class="form-row">
            <label class="form-lbl effect-fail">▼ 失败效果</label>
            <textarea class="form-ta" rows="2" :value="attrs.failure_effect"
              @input="ua({ failure_effect: tv($event) })" />
          </div>
          <div class="form-row">
            <label class="form-lbl effect-crit">★ 大成功</label>
            <textarea class="form-ta" rows="2" :value="attrs.critical_effect"
              @input="ua({ critical_effect: tv($event) })" />
          </div>
          <div class="form-row">
            <label class="form-lbl effect-fumble">☆ 大失败</label>
            <textarea class="form-ta" rows="2" :value="attrs.fumble_effect"
              @input="ua({ fumble_effect: tv($event) })" />
          </div>
        </div>
        <div class="content-sep">GM 备注</div>
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
function tv(e: Event) { return (e.target as HTMLTextAreaElement).value; }
function nv(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  return v === '' ? null : Number(v);
}

const checkTitle = computed(() => {
  const n = attrs.value['check_name'] as string;
  const s = attrs.value['skill_or_attribute'] as string;
  if (n && s) return `${n} (${s})`;
  return n || s || '未命名检定';
});
</script>

<style scoped>
.block-view--check { border-left: 4px solid var(--color-danger, #f44336); }
.block-header { display:flex; align-items:center; gap:6px; padding:6px 10px;
  cursor:pointer; user-select:none; background:var(--surface-hover); }
.block-icon { font-size:14px; }
.block-title { flex:1; font-weight:600; font-size:13px;
  color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.block-tag { font-size:11px; padding:1px 6px; border-radius:10px;
  background:var(--color-danger-light); color:var(--color-danger); }
.block-del { border:none; background:none; cursor:pointer; color:var(--text-muted);
  font-size:12px; padding:2px 4px; border-radius:3px; }
.block-del:hover { background:var(--color-danger-light); color:var(--color-danger); }
.block-chevron { font-size:10px; color:var(--text-muted); }
.block-body { padding:12px; display:flex; flex-direction:column; gap:8px; }
.form-cols { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.form-row { display:flex; flex-direction:column; gap:3px; }
.form-lbl { font-size:11px; color:var(--text-body); font-weight:500; }
.effect-success { color:var(--color-success,#388e3c); }
.effect-fail { color:var(--color-danger); }
.effect-crit { color:var(--color-warning,#f57c00); }
.effect-fumble { color:var(--text-muted); }
.effects { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.form-inp,.form-ta { width:100%; padding:5px 8px; border:1px solid var(--border-default);
  border-radius:4px; font-size:13px; font-family:inherit;
  background:var(--surface-card); color:var(--text-primary); box-sizing:border-box; }
.form-ta { resize:vertical; min-height:50px; }
.content-sep { font-size:11px; color:var(--text-muted); margin:4px 0 2px; }
.block-content { min-height:40px; }
.blk-enter-active,.blk-leave-active { transition:opacity .15s,transform .15s; }
.blk-enter-from,.blk-leave-to { opacity:0; transform:translateY(-4px); }
</style>
