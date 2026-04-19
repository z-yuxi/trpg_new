<template>
  <node-view-wrapper class="block-view block-view--dialog">
    <div class="block-header" @click.prevent="toggleCollapse">
      <span class="block-icon">💬</span>
      <span class="block-title">{{ attrs.dialog_title || '未命名对话' }}</span>
      <span class="block-tag">对话·{{ participants.length }}人</span>
      <button class="block-del" title="删除块" @click.stop="deleteNode">✕</button>
      <span class="block-chevron">{{ isCollapsed ? '▶' : '▼' }}</span>
    </div>
    <Transition name="blk">
      <div v-if="!isCollapsed" class="block-body">
        <div class="form-row">
          <label class="form-lbl">对话标题</label>
          <input class="form-inp" :value="attrs.dialog_title" placeholder="对话标题"
            @input="ua({ dialog_title: iv($event) })" />
        </div>
        <!-- Participants -->
        <div class="form-row">
          <label class="form-lbl">参与者</label>
          <div v-for="(p, i) in participants" :key="i" class="participant-row">
            <input class="form-inp" :value="p.name" placeholder="名称"
              @input="updateParticipant(i, 'name', iv($event))" />
            <select class="form-sel-sm" :value="p.type"
              @change="updateParticipant(i, 'type', sv($event))">
              <option value="npc">NPC</option>
              <option value="pc">玩家</option>
              <option value="narrator">旁白</option>
            </select>
            <button class="branch-del" @click.stop="removeParticipant(i)">✕</button>
          </div>
          <button class="add-btn" @click.stop="addParticipant">+ 添加参与者</button>
        </div>
        <!-- Dialog lines -->
        <div class="form-row">
          <label class="form-lbl">对话行</label>
          <div v-for="(line, i) in lines" :key="i" class="line-row">
            <select class="form-sel-sm" :value="line.speaker"
              @change="updateLine(i, 'speaker', sv($event))">
              <option value="">选择说话者</option>
              <option v-for="p in participants" :key="p.name" :value="p.name">
                {{ p.name }}
              </option>
            </select>
            <textarea class="form-ta form-ta--line" rows="2" :value="line.content"
              placeholder="台词内容…"
              @input="updateLine(i, 'content', tv($event))" />
            <input class="form-inp-sm" :value="line.emotion" placeholder="情绪"
              @input="updateLine(i, 'emotion', iv($event))" />
            <button class="branch-del" @click.stop="removeLine(i)">✕</button>
          </div>
          <button class="add-btn" @click.stop="addLine">+ 添加对话行</button>
        </div>
        <div class="form-row">
          <label class="form-lbl">触发条件（可空）</label>
          <input class="form-inp" :value="attrs.trigger_condition ?? ''"
            placeholder="何时触发此对话…"
            @input="ua({ trigger_condition: iv($event) || null })" />
        </div>
        <div class="content-sep">备注</div>
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

const participants = computed(() => (attrs.value['participants'] as any[]) ?? []);
const lines = computed(() => (attrs.value['lines'] as any[]) ?? []);

function addParticipant() {
  props.updateAttributes({ participants: [...participants.value, { name: '', type: 'npc' }] });
}
function removeParticipant(i: number) {
  const arr = [...participants.value]; arr.splice(i, 1);
  props.updateAttributes({ participants: arr });
}
function updateParticipant(i: number, key: string, val: string) {
  const arr = participants.value.map((p: any, idx: number) => idx === i ? { ...p, [key]: val } : p);
  props.updateAttributes({ participants: arr });
}

function addLine() {
  props.updateAttributes({ lines: [...lines.value, { speaker: '', content: '', emotion: null }] });
}
function removeLine(i: number) {
  const arr = [...lines.value]; arr.splice(i, 1);
  props.updateAttributes({ lines: arr });
}
function updateLine(i: number, key: string, val: string | null) {
  const arr = lines.value.map((l: any, idx: number) => idx === i ? { ...l, [key]: val } : l);
  props.updateAttributes({ lines: arr });
}
</script>

<style scoped>
.block-view--dialog { border-left: 4px solid var(--color-info, #2196f3); }
.block-header { display:flex; align-items:center; gap:6px; padding:6px 10px;
  cursor:pointer; user-select:none; background:var(--bg-2,#f5f5f5); }
.block-icon { font-size:14px; }
.block-title { flex:1; font-weight:600; font-size:13px;
  color:var(--fg-1,#222); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.block-tag { font-size:11px; padding:1px 6px; border-radius:10px;
  background:var(--color-info-light,#e3f2fd); color:var(--color-info-dark,#0d47a1); }
.block-del { border:none; background:none; cursor:pointer; color:var(--fg-3,#999);
  font-size:12px; padding:2px 4px; border-radius:3px; }
.block-del:hover { background:var(--color-danger-light,#ffcdd2); color:var(--color-danger,#f44336); }
.block-chevron { font-size:10px; color:var(--fg-3,#999); }
.block-body { padding:12px; display:flex; flex-direction:column; gap:8px; }
.form-row { display:flex; flex-direction:column; gap:3px; }
.form-lbl { font-size:11px; color:var(--fg-2,#666); font-weight:500; }
.form-inp,.form-ta { width:100%; padding:5px 8px; border:1px solid var(--border,#ddd);
  border-radius:4px; font-size:13px; font-family:inherit;
  background:var(--bg-1,#fff); color:var(--fg-1,#222); box-sizing:border-box; }
.form-ta { resize:vertical; min-height:50px; }
.form-ta--line { width:100%; }
.form-sel-sm { padding:4px 6px; border:1px solid var(--border,#ddd); border-radius:4px;
  font-size:12px; background:var(--bg-1,#fff); color:var(--fg-1,#222); flex-shrink:0; }
.form-inp-sm { width:80px; padding:4px 6px; border:1px solid var(--border,#ddd);
  border-radius:4px; font-size:12px; flex-shrink:0; }
.participant-row,.line-row { display:flex; gap:6px; align-items:center; margin-bottom:4px; }
.line-row { align-items:flex-start; }
.branch-del { border:none; background:none; cursor:pointer;
  color:var(--fg-3,#999); font-size:12px; padding:2px 4px; flex-shrink:0; }
.add-btn { font-size:12px; color:var(--color-info,#2196f3); background:none;
  border:1px dashed var(--border,#ddd); border-radius:4px; cursor:pointer;
  padding:3px 10px; align-self:flex-start; }
.add-btn:hover { background:var(--bg-2,#f5f5f5); }
.content-sep { font-size:11px; color:var(--fg-3,#aaa); margin:4px 0 2px; }
.block-content { min-height:40px; }
.blk-enter-active,.blk-leave-active { transition:opacity .15s,transform .15s; }
.blk-enter-from,.blk-leave-to { opacity:0; transform:translateY(-4px); }
</style>
