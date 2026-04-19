<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../../stores/auth-store';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const rulesetId = route.params.id as string;
const isNew = rulesetId === 'new';

// ── form data ─────────────────────────────────────────────────────────
const formName = ref(isNew ? (route.query.name as string) ?? '新规则包' : '');
const formVersion = ref('0.1.0');
const formStatus = ref<'draft' | 'published'>('draft');
const checkMode = ref<'roll_under' | 'roll_over' | 'dice_pool'>('roll_under');
const defaultDice = ref('1d100');
const successFormula = ref('roll <= skill');
const critSuccessMax = ref(5);
const critFailMin = ref(96);
const bonusDice = ref('');

type DiffLevel = { name: string; threshold: number };
const difficultyLevels = ref<DiffLevel[]>([
  { name: '普通', threshold: 0 },
  { name: '困难', threshold: -20 },
  { name: '极难', threshold: -40 },
]);

type Resource = { name: string; max_formula: string; recovery: string };
const resources = ref<Resource[]>([
  { name: '生命值', max_formula: 'CON / 10', recovery: '休息恢复' },
  { name: '理智值', max_formula: 'POW', recovery: '特定条件' },
]);

type Attribute = { name: string; roll_formula: string };
const attributes = ref<Attribute[]>([
  { name: '力量', roll_formula: '3d6 * 5' },
  { name: '体质', roll_formula: '3d6 * 5' },
  { name: '体型', roll_formula: '(2d6+6) * 5' },
  { name: '敏捷', roll_formula: '3d6 * 5' },
  { name: '外貌', roll_formula: '3d6 * 5' },
  { name: '智力', roll_formula: '(2d6+6) * 5' },
  { name: '意志', roll_formula: '3d6 * 5' },
  { name: '教育', roll_formula: '(2d6+6) * 5' },
]);

const BUILTIN_COMMANDS = [
  { name: 'roll', label: '投骰' },
  { name: 'check', label: '技能检定' },
  { name: 'initiative', label: '先攻投骰' },
];
const supportedCommands = ref<string[]>(['roll', 'check']);

const saving = ref(false);

// ── load existing ────────────────────────────────────────────────────
onMounted(async () => {
  if (isNew) return;
  try {
    const res = await fetch(`/api/rulesets/${rulesetId}`, { headers: { Authorization: `Bearer ${authStore.token}` } });
    if (res.ok) {
      const rs = await res.json();
      formName.value = rs.name;
      formVersion.value = rs.version;
      formStatus.value = rs.status;
      // Try to restore l1 config from character_card_schema
      const cfg = (rs.character_card_schema as any)?._l1_config;
      if (cfg) {
        if (cfg.check_mode) checkMode.value = cfg.check_mode;
        if (cfg.default_dice) defaultDice.value = cfg.default_dice;
        if (cfg.success_formula) successFormula.value = cfg.success_formula;
        if (typeof cfg.crit_success_max === 'number') critSuccessMax.value = cfg.crit_success_max;
        if (typeof cfg.crit_fail_min === 'number') critFailMin.value = cfg.crit_fail_min;
        if (cfg.bonus_dice) bonusDice.value = cfg.bonus_dice;
        if (cfg.difficulty_levels) difficultyLevels.value = cfg.difficulty_levels;
        if (cfg.resources) resources.value = cfg.resources;
        if (cfg.attributes) attributes.value = cfg.attributes;
        if (cfg.supported_commands) supportedCommands.value = cfg.supported_commands;
      }
    }
  } catch { /* ignore */ }
});

// ── save ─────────────────────────────────────────────────────────────
async function save() {
  if (!formName.value.trim()) { ElMessage.warning('规则包名称不能为空'); return; }
  saving.value = true;
  const l1Config = {
    check_mode: checkMode.value,
    default_dice: defaultDice.value,
    success_formula: successFormula.value,
    crit_success_max: critSuccessMax.value,
    crit_fail_min: critFailMin.value,
    bonus_dice: bonusDice.value,
    difficulty_levels: difficultyLevels.value,
    resources: resources.value,
    attributes: attributes.value,
    supported_commands: supportedCommands.value,
  };
  const body = {
    name: formName.value.trim(),
    version: formVersion.value,
    status: formStatus.value,
    character_card_schema: { _l1_config: l1Config },
  };
  try {
    const url = isNew ? '/api/rulesets' : `/api/rulesets/${rulesetId}`;
    const method = isNew ? 'POST' : 'PUT';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      ElMessage.success('保存成功');
      const data = await res.json();
      if (isNew) router.replace(`/creator/workshop/${data.id}/edit`);
    } else {
      ElMessage.error('保存失败（后端功能尚未开放）');
    }
  } catch {
    ElMessage.error('保存失败，请检查网络连接');
  } finally { saving.value = false; }
}

// ── list helpers ──────────────────────────────────────────────────────
function addDiffLevel() { difficultyLevels.value.push({ name: '', threshold: 0 }); }
function removeDiffLevel(i: number) { difficultyLevels.value.splice(i, 1); }
function addResource() { resources.value.push({ name: '', max_formula: '', recovery: '' }); }
function removeResource(i: number) { resources.value.splice(i, 1); }
function addAttribute() { attributes.value.push({ name: '', roll_formula: '' }); }
function removeAttribute(i: number) { attributes.value.splice(i, 1); }
</script>

<template>
  <div class="editor">
    <!-- Header -->
    <div class="editor-header">
      <button class="back-btn" @click="router.back()">← 返回工坊</button>
      <div class="header-right">
        <select v-model="formStatus" class="status-select">
          <option value="draft">草稿</option>
          <option value="published">发布</option>
        </select>
        <button class="save-btn" @click="save" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
      </div>
    </div>

    <div class="editor-body">
      <!-- 基本信息 -->
      <section class="form-section">
        <h3 class="section-title">基本信息</h3>
        <div class="form-row">
          <div class="form-field flex-2">
            <label class="form-label">规则包名称</label>
            <input v-model="formName" class="field-input" placeholder="如：克苏鲁的呼唤" />
          </div>
          <div class="form-field">
            <label class="form-label">版本号</label>
            <input v-model="formVersion" class="field-input" placeholder="0.1.0" />
          </div>
        </div>
      </section>

      <!-- 检定规则 -->
      <section class="form-section">
        <h3 class="section-title">检定规则</h3>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">检定模式</label>
            <div class="radio-group">
              <label v-for="m in [['roll_under','越低越好'],['roll_over','越高越好'],['dice_pool','骰池']]" :key="m[0]" class="radio-item">
                <input type="radio" v-model="checkMode" :value="m[0]" />
                <span>{{ m[1] }}</span>
              </label>
            </div>
          </div>
          <div class="form-field">
            <label class="form-label">默认骰子</label>
            <input v-model="defaultDice" class="field-input" placeholder="1d100" />
          </div>
          <div class="form-field flex-2">
            <label class="form-label">成功公式</label>
            <input v-model="successFormula" class="field-input" placeholder="roll <= skill" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">大成功（≤此值）</label>
            <input v-model.number="critSuccessMax" type="number" class="field-input" min="1" max="20" />
          </div>
          <div class="form-field">
            <label class="form-label">大失败（≥此值）</label>
            <input v-model.number="critFailMin" type="number" class="field-input" min="80" max="100" />
          </div>
          <div class="form-field">
            <label class="form-label">奖励骰</label>
            <input v-model="bonusDice" class="field-input" placeholder="1d10（选填）" />
          </div>
        </div>
      </section>

      <!-- 难度等级 -->
      <section class="form-section">
        <div class="section-header">
          <h3 class="section-title">难度等级</h3>
          <button class="add-btn" @click="addDiffLevel">+ 添加</button>
        </div>
        <div v-for="(dl, i) in difficultyLevels" :key="i" class="dyn-row">
          <input v-model="dl.name" class="field-input" placeholder="等级名称" />
          <input v-model.number="dl.threshold" type="number" class="field-input num-field" placeholder="修正值(如-20)" />
          <button class="rm-btn" @click="removeDiffLevel(i)">×</button>
        </div>
      </section>

      <!-- 属性定义 -->
      <section class="form-section">
        <div class="section-header">
          <h3 class="section-title">属性定义</h3>
          <button class="add-btn" @click="addAttribute">+ 添加</button>
        </div>
        <div v-for="(attr, i) in attributes" :key="i" class="dyn-row">
          <input v-model="attr.name" class="field-input" placeholder="属性名（如 STR）" />
          <input v-model="attr.roll_formula" class="field-input flex-2" placeholder="生成公式（如 3d6*5）" />
          <button class="rm-btn" @click="removeAttribute(i)">×</button>
        </div>
      </section>

      <!-- 资源定义 -->
      <section class="form-section">
        <div class="section-header">
          <h3 class="section-title">资源定义</h3>
          <button class="add-btn" @click="addResource">+ 添加</button>
        </div>
        <div v-for="(res, i) in resources" :key="i" class="dyn-row">
          <input v-model="res.name" class="field-input" placeholder="资源名（如 HP）" />
          <input v-model="res.max_formula" class="field-input" placeholder="最大值公式" />
          <input v-model="res.recovery" class="field-input" placeholder="恢复条件" />
          <button class="rm-btn" @click="removeResource(i)">×</button>
        </div>
      </section>

      <!-- 支持的指令 -->
      <section class="form-section">
        <h3 class="section-title">支持的指令</h3>
        <div class="checkbox-group">
          <label v-for="cmd in BUILTIN_COMMANDS" :key="cmd.name" class="checkbox-item">
            <input type="checkbox" :value="cmd.name" v-model="supportedCommands" />
            <span class="cmd-name-mono">/{{ cmd.name }}</span>
            <span class="cmd-label">{{ cmd.label }}</span>
          </label>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.editor { display: flex; flex-direction: column; height: 100%; max-width: 880px; }
.editor-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5); }
.back-btn { background: none; border: none; cursor: pointer; color: var(--text-secondary); font-size: var(--text-sm); padding: 0; }
.back-btn:hover { color: var(--accent-primary); }
.header-right { display: flex; align-items: center; gap: var(--space-2); }
.status-select { padding: var(--space-1) var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-card); color: var(--text-primary); font-size: var(--text-sm); }
.save-btn { padding: var(--space-2) var(--space-5); background: var(--accent-primary); color: #fff; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: var(--text-sm); transition: opacity var(--transition-fast); }
.save-btn:hover:not(:disabled) { opacity: 0.85; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.editor-body { display: flex; flex-direction: column; gap: var(--space-5); }

.form-section { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-5); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
.section-title { font-size: var(--text-base); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-3); }
.section-header .section-title { margin-bottom: 0; }

.form-row { display: flex; gap: var(--space-3); flex-wrap: wrap; }
.form-field { display: flex; flex-direction: column; gap: var(--space-1); flex: 1; min-width: 140px; }
.form-field.flex-2 { flex: 2; }
.form-label { font-size: var(--text-xs); font-weight: 500; color: var(--text-secondary); }
.field-input { padding: var(--space-2) var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-card); color: var(--text-primary); font-size: var(--text-sm); box-sizing: border-box; width: 100%; }
.field-input:focus { outline: none; border-color: var(--accent-primary); }
.num-field { max-width: 100px; }

.radio-group { display: flex; gap: var(--space-4); align-items: center; padding: var(--space-2) 0; flex-wrap: wrap; }
.radio-item { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: var(--text-sm); color: var(--text-primary); }

.dyn-row { display: flex; gap: var(--space-2); align-items: center; margin-bottom: var(--space-2); flex-wrap: wrap; }
.dyn-row .field-input { flex: 1; min-width: 100px; }
.dyn-row .field-input.flex-2 { flex: 2; }

.add-btn { padding: 2px 10px; border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: none; cursor: pointer; font-size: var(--text-xs); color: var(--text-secondary); transition: border-color var(--transition-fast), color var(--transition-fast); }
.add-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
.rm-btn { width: 24px; height: 24px; border: none; background: none; cursor: pointer; color: var(--text-muted); font-size: 16px; flex-shrink: 0; }
.rm-btn:hover { color: var(--text-primary); }

.checkbox-group { display: flex; flex-direction: column; gap: var(--space-2); }
.checkbox-item { display: flex; align-items: center; gap: var(--space-2); cursor: pointer; font-size: var(--text-sm); }
.cmd-name-mono { font-family: var(--font-mono); color: var(--accent-primary); }
.cmd-label { color: var(--text-secondary); }
</style>
