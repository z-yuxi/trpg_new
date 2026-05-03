<script setup lang="ts">
/**
 * AiCharacterImportPanel.vue
 *
 * AI 角色卡一键导入面板
 * - 用户粘贴角色卡文本（骰子机器人 .st 指令、属性列表等）
 * - 调用 POST /api/ai/import-character 识别字段
 * - 分组预览（基础信息 / 属性 / 技能 / 资源 / 装备），逐字段可修正
 * - 用户确认后 emit confirm(result)，由父组件负责创建角色卡
 */
import { ref, computed } from 'vue';
import { importCharacterFromText, type ImportCharacterResult } from '../../api/ai';

interface Props {
  rulesetId?: string;   // 可选，用于规则包字段提示
  rulesetName?: string; // 可选，传给 AI 作提示
}

const props = withDefaults(defineProps<Props>(), {
  rulesetId: undefined,
  rulesetName: undefined,
});

const emit = defineEmits<{
  close: [];
  confirm: [result: ImportCharacterResult];
}>();

// ── 阶段状态 ─────────────────────────────────────────────────────────────────
type Phase = 'input' | 'loading' | 'preview';
const phase = ref<Phase>('input');
const inputText = ref('');
const errorMsg = ref('');
const result = ref<ImportCharacterResult | null>(null);

// ── 可编辑的预览数据（用户可修改） ────────────────────────────────────────────
const editName = ref('');
const editBackground = ref('');
const editAttributes = ref<Record<string, number>>({});
const editSkills = ref<Record<string, number>>({});
const editResources = ref<Record<string, { current: number; max: number }>>({});
const editEquipment = ref<string[]>([]);
const newEquipmentItem = ref('');

function loadIntoEdit(r: ImportCharacterResult) {
  editName.value = r.name;
  editBackground.value = r.background;
  editAttributes.value = { ...r.attributes };
  editSkills.value = { ...r.skills };
  editResources.value = JSON.parse(JSON.stringify(r.resources));
  editEquipment.value = [...r.equipment];
}

// ── AI 识别 ───────────────────────────────────────────────────────────────────
async function handleAnalyze() {
  const text = inputText.value.trim();
  if (!text) {
    errorMsg.value = '请先粘贴角色卡内容';
    return;
  }
  errorMsg.value = '';
  phase.value = 'loading';

  try {
    const res = await importCharacterFromText(text, props.rulesetName);
    result.value = res;
    loadIntoEdit(res);
    phase.value = 'preview';
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'AI 解析失败，请稍后重试';
    phase.value = 'input';
  }
}

// ── 装备增删 ─────────────────────────────────────────────────────────────────
function addEquipment() {
  const item = newEquipmentItem.value.trim();
  if (item && !editEquipment.value.includes(item)) {
    editEquipment.value.push(item);
  }
  newEquipmentItem.value = '';
}
function removeEquipment(idx: number) {
  editEquipment.value.splice(idx, 1);
}

// ── 确认导入 ─────────────────────────────────────────────────────────────────
function handleConfirm() {
  const final: ImportCharacterResult = {
    name: editName.value.trim(),
    attributes: { ...editAttributes.value },
    skills: { ...editSkills.value },
    resources: JSON.parse(JSON.stringify(editResources.value)),
    equipment: [...editEquipment.value],
    background: editBackground.value,
    warnings: result.value?.warnings ?? [],
  };
  emit('confirm', final);
}

// ── 计算属性 ─────────────────────────────────────────────────────────────────
const attributeEntries = computed(() => Object.entries(editAttributes.value));
const skillEntries = computed(() => Object.entries(editSkills.value));
const resourceEntries = computed(() => Object.entries(editResources.value));
const hasWarnings = computed(() => (result.value?.warnings ?? []).length > 0);
const inputCharCount = computed(() => inputText.value.length);
</script>

<template>
  <div class="ai-char-import">
    <!-- 标题栏 -->
    <div class="panel-header">
      <span class="panel-title">✨ AI 角色卡导入</span>
      <button class="close-btn" @click="emit('close')">✕</button>
    </div>

    <!-- 阶段 1：输入 -->
    <div v-if="phase === 'input'" class="panel-body">
      <p class="hint-text">
        粘贴骰子机器人指令（如 <code>.st 力量60 敏捷55...</code>）、
        角色属性列表或任意文本，AI 将自动识别字段。
      </p>
      <textarea
        v-model="inputText"
        class="input-textarea"
        placeholder="粘贴角色卡文本..."
        maxlength="3000"
        rows="10"
      />
      <div class="input-footer">
        <span class="char-count" :class="{ warn: inputCharCount > 2500 }">
          {{ inputCharCount }}/3000
        </span>
        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
      </div>
      <div class="btn-row">
        <button class="btn-secondary" @click="emit('close')">取消</button>
        <button class="btn-primary" :disabled="!inputText.trim()" @click="handleAnalyze">
          AI 识别
        </button>
      </div>
    </div>

    <!-- 阶段 2：加载中 -->
    <div v-else-if="phase === 'loading'" class="panel-body loading-state">
      <div class="spinner" />
      <p>AI 正在识别角色卡字段，请稍候…</p>
    </div>

    <!-- 阶段 3：预览确认 -->
    <div v-else-if="phase === 'preview'" class="panel-body preview-state">

      <!-- 警告信息 -->
      <div v-if="hasWarnings" class="warnings-box">
        <p class="warnings-title">⚠️ 以下字段未能识别，请手动补充：</p>
        <ul>
          <li v-for="(w, i) in result!.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>

      <!-- 基础信息 -->
      <section class="preview-section">
        <h4 class="section-title">基础信息</h4>
        <div class="field-row">
          <label class="field-label">角色名</label>
          <input v-model="editName" class="field-input" type="text" maxlength="64" placeholder="角色名称" />
        </div>
        <div class="field-row field-row--tall">
          <label class="field-label">背景故事</label>
          <textarea v-model="editBackground" class="field-input" rows="3" maxlength="2000" placeholder="背景故事（可选）" />
        </div>
      </section>

      <!-- 属性 -->
      <section v-if="attributeEntries.length" class="preview-section">
        <h4 class="section-title">属性</h4>
        <div class="field-grid">
          <div v-for="[key, val] in attributeEntries" :key="key" class="grid-item">
            <span class="grid-label">{{ key }}</span>
            <input
              v-model.number="editAttributes[key]"
              class="grid-input"
              type="number"
              min="0"
              max="999"
            />
          </div>
        </div>
      </section>

      <!-- 技能 -->
      <section v-if="skillEntries.length" class="preview-section">
        <h4 class="section-title">技能</h4>
        <div class="field-grid">
          <div v-for="[key, val] in skillEntries" :key="key" class="grid-item">
            <span class="grid-label">{{ key }}</span>
            <input
              v-model.number="editSkills[key]"
              class="grid-input"
              type="number"
              min="0"
              max="999"
            />
          </div>
        </div>
      </section>

      <!-- 资源 -->
      <section v-if="resourceEntries.length" class="preview-section">
        <h4 class="section-title">资源池</h4>
        <div class="resources-grid">
          <div v-for="[key] in resourceEntries" :key="key" class="resource-item">
            <span class="grid-label">{{ key }}</span>
            <div class="resource-inputs">
              <input
                v-model.number="editResources[key].current"
                class="grid-input"
                type="number"
                min="0"
                max="999"
                placeholder="当前"
              />
              <span class="resource-sep">/</span>
              <input
                v-model.number="editResources[key].max"
                class="grid-input"
                type="number"
                min="0"
                max="999"
                placeholder="上限"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- 装备 -->
      <section class="preview-section">
        <h4 class="section-title">装备</h4>
        <div class="equipment-list">
          <div v-for="(item, idx) in editEquipment" :key="idx" class="equipment-item">
            <span>{{ item }}</span>
            <button class="remove-btn" @click="removeEquipment(idx)">✕</button>
          </div>
          <div class="equipment-add">
            <input
              v-model="newEquipmentItem"
              class="field-input"
              type="text"
              maxlength="100"
              placeholder="添加装备…"
              @keydown.enter.prevent="addEquipment"
            />
            <button class="btn-add" @click="addEquipment">+</button>
          </div>
        </div>
      </section>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button class="btn-secondary" @click="phase = 'input'">重新识别</button>
        <button class="btn-primary" @click="handleConfirm">确认导入</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-char-import {
  display: flex;
  flex-direction: column;
  background: var(--bg-surface, #1e1e2e);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  max-height: 90vh;
  width: 520px;
  max-width: 100%;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.08));
  flex-shrink: 0;
}
.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
}
.close-btn {
  background: none;
  border: none;
  color: var(--text-secondary, #999);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
}
.close-btn:hover { background: var(--bg-overlay, rgba(255,255,255,.06)); }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint-text {
  font-size: 12px;
  color: var(--text-secondary, #999);
  line-height: 1.6;
  margin: 0;
}
.hint-text code {
  background: var(--bg-overlay, rgba(255,255,255,.1));
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}

.input-textarea {
  width: 100%;
  background: var(--bg-input, rgba(255,255,255,.06));
  border: 1px solid var(--border-subtle, rgba(255,255,255,.1));
  border-radius: 6px;
  color: var(--text-primary, #e0e0e0);
  font-size: 13px;
  line-height: 1.5;
  padding: 10px 12px;
  resize: vertical;
  font-family: monospace;
  box-sizing: border-box;
}
.input-textarea:focus {
  outline: none;
  border-color: var(--accent, #7c6af7);
}

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: -6px;
}
.char-count { font-size: 11px; color: var(--text-tertiary, #666); }
.char-count.warn { color: #f59e0b; }

.error-msg { font-size: 12px; color: #f87171; margin: 0; }

.btn-row {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}
.btn-primary {
  background: var(--accent, #7c6af7);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 7px 18px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}
.btn-primary:hover:not(:disabled) { background: var(--accent-hover, #6b5ce0); }
.btn-primary:disabled { opacity: .45; cursor: not-allowed; }
.btn-secondary {
  background: var(--bg-overlay, rgba(255,255,255,.06));
  color: var(--text-secondary, #aaa);
  border: 1px solid var(--border-subtle, rgba(255,255,255,.1));
  border-radius: 6px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
}
.btn-secondary:hover { background: var(--bg-overlay-hover, rgba(255,255,255,.1)); }

/* Loading */
.loading-state {
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 16px;
}
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-subtle, rgba(255,255,255,.1));
  border-top-color: var(--accent, #7c6af7);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Preview */
.warnings-box {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: #f59e0b;
}
.warnings-title { margin: 0 0 6px; font-weight: 600; }
.warnings-box ul { margin: 0; padding-left: 16px; }
.warnings-box li { margin: 2px 0; }

.preview-section { display: flex; flex-direction: column; gap: 8px; }
.section-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #999);
  text-transform: uppercase;
  letter-spacing: .05em;
  margin: 0;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.08));
}

.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.field-row--tall { align-items: flex-start; }
.field-label {
  font-size: 12px;
  color: var(--text-secondary, #999);
  width: 60px;
  flex-shrink: 0;
}
.field-input {
  flex: 1;
  background: var(--bg-input, rgba(255,255,255,.06));
  border: 1px solid var(--border-subtle, rgba(255,255,255,.1));
  border-radius: 5px;
  color: var(--text-primary, #e0e0e0);
  font-size: 13px;
  padding: 5px 8px;
  box-sizing: border-box;
}
.field-input:focus { outline: none; border-color: var(--accent, #7c6af7); }

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 6px;
}
.grid-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-overlay, rgba(255,255,255,.04));
  border-radius: 5px;
  padding: 5px 8px;
}
.grid-label {
  font-size: 11px;
  color: var(--text-secondary, #999);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.grid-input {
  width: 52px;
  background: var(--bg-input, rgba(255,255,255,.06));
  border: 1px solid var(--border-subtle, rgba(255,255,255,.1));
  border-radius: 4px;
  color: var(--text-primary, #e0e0e0);
  font-size: 12px;
  padding: 3px 5px;
  text-align: right;
  -moz-appearance: textfield;
}
.grid-input::-webkit-inner-spin-button,
.grid-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.grid-input:focus { outline: none; border-color: var(--accent, #7c6af7); }

/* Resources */
.resources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 6px;
}
.resource-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-overlay, rgba(255,255,255,.04));
  border-radius: 5px;
  padding: 5px 8px;
}
.resource-inputs { display: flex; align-items: center; gap: 4px; }
.resource-sep { color: var(--text-tertiary, #666); font-size: 12px; }

/* Equipment */
.equipment-list { display: flex; flex-wrap: wrap; gap: 6px; }
.equipment-item {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-overlay, rgba(255,255,255,.07));
  border-radius: 20px;
  padding: 3px 10px 3px 12px;
  font-size: 12px;
  color: var(--text-primary, #e0e0e0);
}
.remove-btn {
  background: none;
  border: none;
  color: var(--text-tertiary, #666);
  cursor: pointer;
  font-size: 10px;
  padding: 0;
  line-height: 1;
}
.remove-btn:hover { color: #f87171; }
.equipment-add {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
}
.equipment-add .field-input { width: auto; flex: 1; }
.btn-add {
  background: var(--bg-overlay, rgba(255,255,255,.07));
  border: 1px solid var(--border-subtle, rgba(255,255,255,.1));
  border-radius: 5px;
  color: var(--text-primary, #e0e0e0);
  font-size: 16px;
  line-height: 1;
  padding: 4px 10px;
  cursor: pointer;
}
.btn-add:hover { background: var(--accent, #7c6af7); color: #fff; }
</style>
