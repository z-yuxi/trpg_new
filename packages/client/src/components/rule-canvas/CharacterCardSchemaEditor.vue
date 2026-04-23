<script setup lang="ts">
import { ref, watch } from 'vue';

// ── 类型定义 ────────────────────────────────────────────────
interface AttributeDef {
  name: string;
  label: string;
  default_value: number;
  min?: number;
  max?: number;
  roll_formula?: string;
}

interface SkillDef {
  name: string;
  label: string;
  default_value: number;
  linked_attribute?: string;
  occupation_bonus?: boolean;
}

interface DerivedDef {
  name: string;
  label: string;
  formula: string;
}

interface ResourceDef {
  name: string;
  label: string;
  max_formula: string;
  init_formula?: string;
  recovery?: string;
}

interface AliasDef {
  alias: string;
  target: string;
}

export interface CharacterCardSchema {
  attributes: AttributeDef[];
  skills: SkillDef[];
  derived_values: DerivedDef[];
  resources: ResourceDef[];
  aliases: AliasDef[];
}

// ── Props ────────────────────────────────────────────────────
const props = withDefaults(defineProps<{
  modelValue?: CharacterCardSchema;
}>(), {
  modelValue: () => ({
    attributes: [],
    skills: [],
    derived_values: [],
    resources: [],
    aliases: [],
  }),
});

const emit = defineEmits<{ (e: 'update:modelValue', v: CharacterCardSchema): void }>();

// ── 本地副本 ─────────────────────────────────────────────────
const schema = ref<CharacterCardSchema>(JSON.parse(JSON.stringify(props.modelValue)));

watch(() => props.modelValue, (v) => {
  schema.value = JSON.parse(JSON.stringify(v));
}, { deep: true });

function emitUpdate() {
  emit('update:modelValue', JSON.parse(JSON.stringify(schema.value)));
}

// ── 标签页 ───────────────────────────────────────────────────
type Tab = 'attributes' | 'skills' | 'derived' | 'resources' | 'aliases';
const activeTab = ref<Tab>('attributes');
const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'attributes', label: '属性', hint: '力量、体质、意志等基础数值' },
  { key: 'skills', label: '技能', hint: '侦查、格斗、图书馆等可提升数值' },
  { key: 'derived', label: '衍生值', hint: '由其他属性计算得出的字段' },
  { key: 'resources', label: '资源', hint: 'HP、理智值等有当前/最大的字段' },
  { key: 'aliases', label: '别名', hint: '字段的简写 / 英文别名映射' },
];

// ── 属性操作 ─────────────────────────────────────────────────
function addAttribute() {
  schema.value.attributes.push({ name: '', label: '', default_value: 0 });
  emitUpdate();
}
function removeAttribute(i: number) {
  schema.value.attributes.splice(i, 1);
  emitUpdate();
}

// ── 技能操作 ─────────────────────────────────────────────────
function addSkill() {
  schema.value.skills.push({ name: '', label: '', default_value: 0 });
  emitUpdate();
}
function removeSkill(i: number) {
  schema.value.skills.splice(i, 1);
  emitUpdate();
}

// ── 衍生值操作 ───────────────────────────────────────────────
function addDerived() {
  schema.value.derived_values.push({ name: '', label: '', formula: '' });
  emitUpdate();
}
function removeDerived(i: number) {
  schema.value.derived_values.splice(i, 1);
  emitUpdate();
}

// ── 资源操作 ─────────────────────────────────────────────────
function addResource() {
  schema.value.resources.push({ name: '', label: '', max_formula: '' });
  emitUpdate();
}
function removeResource(i: number) {
  schema.value.resources.splice(i, 1);
  emitUpdate();
}

// ── 别名操作 ─────────────────────────────────────────────────
function addAlias() {
  schema.value.aliases.push({ alias: '', target: '' });
  emitUpdate();
}
function removeAlias(i: number) {
  schema.value.aliases.splice(i, 1);
  emitUpdate();
}

// ── 联动属性选项 ─────────────────────────────────────────────
function attrOptions() {
  return schema.value.attributes.map((a) => a.name).filter(Boolean);
}
</script>

<template>
  <div class="ccs-editor">
    <!-- 标签栏 -->
    <div class="ccs-tabs">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="ccs-tab"
        :class="{ active: activeTab === tab.key }"
        :title="tab.hint"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span class="ccs-tab-count">
          {{ schema[tab.key === 'derived' ? 'derived_values' : tab.key].length }}
        </span>
      </button>
    </div>

    <!-- 属性面板 -->
    <div v-if="activeTab === 'attributes'" class="ccs-panel">
      <div class="ccs-panel-header">
        <p class="ccs-hint">定义角色卡的基础属性字段，如力量、体质、敏捷等。</p>
        <button class="ccs-add-btn" @click="addAttribute">+ 添加属性</button>
      </div>
      <div v-if="schema.attributes.length === 0" class="ccs-empty">暂无属性，点击「添加属性」</div>
      <table v-else class="ccs-table">
        <thead>
          <tr>
            <th>字段名（英文/中文key）</th>
            <th>标签（显示用）</th>
            <th>默认值</th>
            <th>最小值</th>
            <th>最大值</th>
            <th>生成公式</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(attr, i) in schema.attributes" :key="i">
            <td><input v-model="attr.name" class="ccs-input" placeholder="如 STR 或 力量" @input="emitUpdate" /></td>
            <td><input v-model="attr.label" class="ccs-input" placeholder="如 力量" @input="emitUpdate" /></td>
            <td><input v-model.number="attr.default_value" type="number" class="ccs-input ccs-input--num" @input="emitUpdate" /></td>
            <td><input v-model.number="attr.min" type="number" class="ccs-input ccs-input--num" placeholder="—" @input="emitUpdate" /></td>
            <td><input v-model.number="attr.max" type="number" class="ccs-input ccs-input--num" placeholder="—" @input="emitUpdate" /></td>
            <td><input v-model="attr.roll_formula" class="ccs-input ccs-input--formula" placeholder="如 3d6*5" @input="emitUpdate" /></td>
            <td><button class="ccs-rm-btn" @click="removeAttribute(i)">×</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 技能面板 -->
    <div v-else-if="activeTab === 'skills'" class="ccs-panel">
      <div class="ccs-panel-header">
        <p class="ccs-hint">定义技能字段，可关联联动属性（如侦查→感知）。</p>
        <button class="ccs-add-btn" @click="addSkill">+ 添加技能</button>
      </div>
      <div v-if="schema.skills.length === 0" class="ccs-empty">暂无技能，点击「添加技能」</div>
      <table v-else class="ccs-table">
        <thead>
          <tr>
            <th>字段名</th>
            <th>标签</th>
            <th>默认值</th>
            <th>联动属性</th>
            <th>职业加成</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(sk, i) in schema.skills" :key="i">
            <td><input v-model="sk.name" class="ccs-input" placeholder="如 dodge" @input="emitUpdate" /></td>
            <td><input v-model="sk.label" class="ccs-input" placeholder="如 回避" @input="emitUpdate" /></td>
            <td><input v-model.number="sk.default_value" type="number" class="ccs-input ccs-input--num" @input="emitUpdate" /></td>
            <td>
              <select v-model="sk.linked_attribute" class="ccs-select" @change="emitUpdate">
                <option value="">无</option>
                <option v-for="a in attrOptions()" :key="a" :value="a">{{ a }}</option>
              </select>
            </td>
            <td>
              <input type="checkbox" v-model="sk.occupation_bonus" @change="emitUpdate" />
            </td>
            <td><button class="ccs-rm-btn" @click="removeSkill(i)">×</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 衍生值面板 -->
    <div v-else-if="activeTab === 'derived'" class="ccs-panel">
      <div class="ccs-panel-header">
        <p class="ccs-hint">衍生值由公式从其他字段计算，如 理智值上限 = 幸运×1。</p>
        <button class="ccs-add-btn" @click="addDerived">+ 添加衍生值</button>
      </div>
      <div v-if="schema.derived_values.length === 0" class="ccs-empty">暂无衍生值</div>
      <table v-else class="ccs-table">
        <thead>
          <tr>
            <th>字段名</th>
            <th>标签</th>
            <th>公式（支持字段名）</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(dv, i) in schema.derived_values" :key="i">
            <td><input v-model="dv.name" class="ccs-input" placeholder="如 sanity_max" @input="emitUpdate" /></td>
            <td><input v-model="dv.label" class="ccs-input" placeholder="如 理智上限" @input="emitUpdate" /></td>
            <td><input v-model="dv.formula" class="ccs-input ccs-input--formula" placeholder="如 LCK * 1" @input="emitUpdate" /></td>
            <td><button class="ccs-rm-btn" @click="removeDerived(i)">×</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 资源面板 -->
    <div v-else-if="activeTab === 'resources'" class="ccs-panel">
      <div class="ccs-panel-header">
        <p class="ccs-hint">资源字段有当前值和最大值，如 HP、理智值。</p>
        <button class="ccs-add-btn" @click="addResource">+ 添加资源</button>
      </div>
      <div v-if="schema.resources.length === 0" class="ccs-empty">暂无资源字段</div>
      <table v-else class="ccs-table">
        <thead>
          <tr>
            <th>字段名</th>
            <th>标签</th>
            <th>最大值公式</th>
            <th>初始值公式</th>
            <th>恢复条件</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(res, i) in schema.resources" :key="i">
            <td><input v-model="res.name" class="ccs-input" placeholder="如 HP" @input="emitUpdate" /></td>
            <td><input v-model="res.label" class="ccs-input" placeholder="如 生命值" @input="emitUpdate" /></td>
            <td><input v-model="res.max_formula" class="ccs-input ccs-input--formula" placeholder="如 CON/10+4" @input="emitUpdate" /></td>
            <td><input v-model="res.init_formula" class="ccs-input ccs-input--formula" placeholder="同上" @input="emitUpdate" /></td>
            <td><input v-model="res.recovery" class="ccs-input" placeholder="如 长休后满值" @input="emitUpdate" /></td>
            <td><button class="ccs-rm-btn" @click="removeResource(i)">×</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 别名面板 -->
    <div v-else-if="activeTab === 'aliases'" class="ccs-panel">
      <div class="ccs-panel-header">
        <p class="ccs-hint">为字段定义别名，如 str → 力量，用于指令中简写引用。</p>
        <button class="ccs-add-btn" @click="addAlias">+ 添加别名</button>
      </div>
      <div v-if="schema.aliases.length === 0" class="ccs-empty">暂无别名</div>
      <table v-else class="ccs-table">
        <thead>
          <tr>
            <th>别名（简写）</th>
            <th>指向字段名</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(al, i) in schema.aliases" :key="i">
            <td><input v-model="al.alias" class="ccs-input" placeholder="如 str" @input="emitUpdate" /></td>
            <td>
              <input v-model="al.target" class="ccs-input" list="ccs-field-list" placeholder="如 力量" @input="emitUpdate" />
              <datalist id="ccs-field-list">
                <option v-for="a in [...schema.attributes, ...schema.skills, ...schema.derived_values, ...schema.resources].map(f => f.name).filter(Boolean)" :key="a" :value="a" />
              </datalist>
            </td>
            <td><button class="ccs-rm-btn" @click="removeAlias(i)">×</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ccs-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* 标签栏 */
.ccs-tabs {
  display: flex;
  gap: 2px;
  background: var(--surface-base, #f3f4f6);
  border-radius: 6px 6px 0 0;
  padding: 3px;
  border-bottom: 1px solid var(--color-border, #d1d5db);
}

.ccs-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  transition: background 0.12s, color 0.12s;
}

.ccs-tab.active {
  background: var(--surface-card, #ffffff);
  color: var(--text-primary, #111827);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.ccs-tab-count {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 10px;
  background: var(--color-accent, #7b68ee);
  color: #fff;
  min-width: 18px;
  text-align: center;
  font-weight: 600;
}

.ccs-tab.active .ccs-tab-count {
  background: var(--color-accent, #7b68ee);
}

/* 面板 */
.ccs-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 0 0;
}

.ccs-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 8px;
}

.ccs-hint {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  margin: 0;
  flex: 1;
}

.ccs-add-btn {
  flex-shrink: 0;
  padding: 4px 12px;
  background: var(--color-accent, #7b68ee);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  transition: opacity 0.12s;
}
.ccs-add-btn:hover { opacity: 0.85; }

.ccs-empty {
  text-align: center;
  padding: 32px;
  color: var(--text-secondary, #9ca3af);
  font-size: 13px;
}

/* 表格 */
.ccs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.ccs-table th {
  text-align: left;
  padding: 4px 6px;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  white-space: nowrap;
}

.ccs-table td {
  padding: 3px 4px;
  vertical-align: middle;
}

.ccs-table tr:hover td {
  background: var(--surface-hover, #f9fafb);
}

/* 输入 */
.ccs-input {
  width: 100%;
  padding: 4px 7px;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 3px;
  font-size: 12px;
  background: var(--surface-card, #ffffff);
  color: var(--text-primary, #111827);
  box-sizing: border-box;
  transition: border-color 0.12s;
}

.ccs-input:focus { outline: none; border-color: var(--color-accent, #7b68ee); }

.ccs-input--num { width: 64px; }
.ccs-input--formula { font-family: var(--font-mono, monospace); }

.ccs-select {
  padding: 4px 6px;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 3px;
  font-size: 12px;
  background: var(--surface-card, #ffffff);
  color: var(--text-primary, #111827);
}

.ccs-rm-btn {
  background: none;
  border: none;
  color: var(--text-secondary, #9ca3af);
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  line-height: 1;
  transition: color 0.12s;
}
.ccs-rm-btn:hover { color: #e74c3c; }
</style>
