<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import RecipeEditor from '../../components/rule-canvas/RecipeEditor.vue';
import VersionPanel from '../../components/VersionPanel.vue';
import SvgIcon from '../../components/SvgIcon.vue';
import CharacterCardSchemaEditor from '../../components/rule-canvas/CharacterCardSchemaEditor.vue';
import RecruitmentFieldsEditor from '../../components/RecruitmentFieldsEditor.vue';
import CommandOverridesEditor from '../../components/CommandOverridesEditor.vue';
import { exportRulesetYaml, importRulesetYaml, pickYamlFile } from '../../utils/ruleset-yaml';
import { api, getToken } from '../../utils/api';
import { getRuleset, createRuleset as apiCreateRuleset, updateRuleset, submitRulesetReview, deprecateRuleset, executeRecipe } from '../../api/rulesets';
import type { RulesetRecipeSource, ReaderSettings } from '@trpg/shared';
import { READER_SETTINGS_PRESETS } from '@trpg/shared';

interface SchemaField {
  name: string;
  [key: string]: unknown;
}

interface CharacterCardSchema {
  attributes: SchemaField[];
  skills: SchemaField[];
  derived_values: SchemaField[];
  resources: SchemaField[];
  aliases: Array<Record<string, unknown>>;
}

interface RecruitmentField {
  [key: string]: unknown;
}

interface CommandOverride {
  [key: string]: unknown;
}

const route = useRoute();
const router = useRouter();

const rulesetId = route.params.id as string;
const isNew = rulesetId === 'new';

// ── 编辑模式 ─────────────────────────────────────────────────────────────────
type EditorMode = 'l1' | 'recipe' | 'versions';
const editorMode = ref<EditorMode>('recipe');
/** Recipe 格式数据 */
const currentRecipeSource = ref<RulesetRecipeSource | null>(null);

function switchMode(to: EditorMode) {
  editorMode.value = to;
}

// ── Recipe 模式回调 ────────────────────────────────────────────────────
function onRecipeSaved(newSource: RulesetRecipeSource) {
  currentRecipeSource.value = newSource;
}

// ── form data ─────────────────────────────────────────────────────────
const formName = ref(isNew ? (route.query.name as string) ?? '新规则包' : '');

// ── 叙阅器设置 ───────────────────────────────────────────
const readerSettingsPanelOpen = ref(false);
const rsSaving = ref(false);

function defaultReaderSettings(): ReaderSettings {
  return {
    plugin_flags: {
      toc: true,
      reading_progress: true,
      share: true,
      annotation: true,
      import_campaign: false,
      export_structured_data: false,
      quote_house_rules: true,
    },
    protection_flags: {
      anti_bulk_copy: false,
      disable_public_comments: false,
      disable_pdf_export: false,
      trace_watermark: false,
      embed_copyright_notice: false,
      forbid_redistribution: false,
    },
    preview_policy: { preview_ratio: 0 },
    appearance: { line_height: 'comfortable' },
  };
}

const rsDraft = ref<ReaderSettings>(defaultReaderSettings());

function applyPreset(key: keyof typeof READER_SETTINGS_PRESETS) {
  rsDraft.value = JSON.parse(JSON.stringify(READER_SETTINGS_PRESETS[key]));
}

async function saveReaderSettings() {
  if (!rulesetId || isNew) { ElMessage.warning('请先保存规则包'); return; }
  rsSaving.value = true;
  try {
    await updateRuleset(rulesetId, { reader_settings: rsDraft.value as any });
    ElMessage.success('叙阅器设置已保存');
    readerSettingsPanelOpen.value = false;
  } catch (err) {
    ElMessage.error('保存失败');
    console.error(err);
  } finally {
    rsSaving.value = false;
  }
}
const formVersion = ref('0.1.0');
const formStatus = ref<'draft' | 'published' | 'deprecated'>('draft');
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

// ── 角色卡模板 Schema ─────────────────────────────────────────────────
const cardSchema = ref<CharacterCardSchema>({
  attributes: [],
  skills: [],
  derived_values: [],
  resources: [],
  aliases: [],
});

const skills = computed(() => cardSchema.value.skills ?? []);

// ── 招募帖字段配置 ────────────────────────────────────────────────────
const recruitmentFields = ref<RecruitmentField[]>([]);

// ── 指令覆盖配置 ──────────────────────────────────────────────────────
const commandOverrides = ref<CommandOverride[]>([]);

// ── 自定义命令 ────────────────────────────────────────────────────────
type InputMappingSource = 'user_input' | 'character_attribute' | 'character_skill' | 'fixed_value';
type CustomInputMapping = { param_name: string; source: InputMappingSource; fixed_value?: string; field_name?: string };
type CustomCommand = {
  trigger: string;
  description: string;
  aliases: string;        // 逗号分隔
  gm_only: boolean;
  input_mapping: CustomInputMapping[];
};

const customCommands = ref<CustomCommand[]>([]);
const expandedCmdIdx = ref<number | null>(null);

function addCustomCommand() {
  customCommands.value.push({
    trigger: '',
    description: '',
    aliases: '',
    gm_only: false,
    input_mapping: [],
  });
  expandedCmdIdx.value = customCommands.value.length - 1;
}
function removeCustomCommand(i: number) {
  customCommands.value.splice(i, 1);
  if (expandedCmdIdx.value === i) expandedCmdIdx.value = null;
}
function addInputMapping(cmd: CustomCommand) {
  cmd.input_mapping.push({ param_name: '', source: 'user_input' });
}
function removeInputMapping(cmd: CustomCommand, i: number) {
  cmd.input_mapping.splice(i, 1);
}
function toggleCmd(i: number) {
  expandedCmdIdx.value = expandedCmdIdx.value === i ? null : i;
}

// ── 预览测试面板 ───────────────────────────────────────────────────────
const previewCommand = ref('/r 1d6');
const previewRunning = ref(false);
type PreviewLog = { node_id: string; atom_type: string; output: unknown };
const previewResult = ref<{ success: boolean; result: string; dice_rolls: { expression: string; value: number; detail: string }[]; logs: PreviewLog[]; error?: string } | null>(null);

// 模拟角色数据 - 结构化输入
interface MockAttr { name: string; value: number }
interface MockResource { name: string; current: number; max: number }
const mockAttrs = ref<MockAttr[]>([
  { name: '力量', value: 60 }, { name: '体质', value: 55 }, { name: '意志', value: 65 },
]);
const mockSkills = ref<MockAttr[]>([
  { name: '侦查', value: 70 }, { name: '图书馆使用', value: 40 }, { name: '聆听', value: 45 },
]);
const mockResources = ref<MockResource[]>([
  { name: '理智值', current: 65, max: 99 }, { name: 'HP', current: 11, max: 11 },
]);
function addMockAttr() { mockAttrs.value.push({ name: '', value: 0 }); }
function removeMockAttr(i: number) { mockAttrs.value.splice(i, 1); }
function addMockSkill() { mockSkills.value.push({ name: '', value: 0 }); }
function removeMockSkill(i: number) { mockSkills.value.splice(i, 1); }
function addMockResource() { mockResources.value.push({ name: '', current: 0, max: 0 }); }
function removeMockResource(i: number) { mockResources.value.splice(i, 1); }

async function runPreview() {
  if (!rulesetId || isNew) { ElMessage.warning('请先保存规则集后再预览'); return; }
  previewRunning.value = true;
  previewResult.value = null;
  try {
    const attributes: Record<string, number> = {};
    const skills: Record<string, number> = {};
    const resources: Record<string, { current: number; max: number }> = {};
    mockAttrs.value.forEach((a) => { if (a.name) attributes[a.name] = a.value; });
    mockSkills.value.forEach((s) => { if (s.name) skills[s.name] = s.value; });
    mockResources.value.forEach((r) => { if (r.name) resources[r.name] = { current: r.current, max: r.max }; });

    const data = await executeRecipe(rulesetId, previewCommand.value, { attributes, skills, resources }) as { success?: boolean; result?: string; dice_rolls?: unknown[]; logs?: unknown[] };
    previewResult.value = {
      success: Boolean(data.success),
      result: data.result ?? '',
      dice_rolls: (data.dice_rolls ?? []) as Array<{ expression: string; value: number; detail: string }>,
      logs: (data.logs ?? []) as PreviewLog[],
    };
  } catch (e) {
    previewResult.value = { success: false, result: String(e), dice_rolls: [], logs: [] };
  } finally {
    previewRunning.value = false;
  }
}

const BUILTIN_COMMANDS = [
  { name: 'roll', label: '投骰' },
  { name: 'check', label: '技能检定' },
  { name: 'initiative', label: '先攻投骰' },
];
const supportedCommands = ref<string[]>(['roll', 'check']);

const saving = ref(false);

// ── load existing ────────────────────────────────────────────────────
const formData = ref<Record<string, unknown>>({});

async function fetchRuleset() {
  if (isNew) return;
  try {
    const rs = await getRuleset(rulesetId) as Record<string, unknown>;
    formName.value = (rs.name as string);
    formVersion.value = (rs.version as string);
    formStatus.value = (rs.status as string) as typeof formStatus.value;
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
      // 恢复自定义命令
      const cmds = (rs.commands as { custom_commands?: Array<{ trigger: string; description?: string; aliases?: string[]; gm_only?: boolean; input_mapping?: CustomInputMapping[]; graph?: object }> })?.custom_commands;
      if (Array.isArray(cmds)) {
        customCommands.value = cmds.map((c) => ({
          trigger: c.trigger ?? '',
          description: c.description ?? '',
          aliases: (c.aliases ?? []).join(', '),
          gm_only: c.gm_only ?? false,
          input_mapping: c.input_mapping ?? [],
        }));
      }
      // 恢复角色卡 Schema
      const schema = (rs.character_card_schema as any)?._card_schema;
      if (schema) {
        cardSchema.value = {
          attributes: schema.attributes ?? [],
          skills: schema.skills ?? [],
          derived_values: schema.derived_values ?? [],
          resources: schema.resources ?? [],
          aliases: schema.aliases ?? [],
        };
      }
      // 恢复招募字段
      const rf = (rs as any).recruitment_fields;
      if (Array.isArray(rf)) recruitmentFields.value = rf;
      // 恢复指令覆盖
      const co = (rs as any).command_overrides;
      if (Array.isArray(co)) commandOverrides.value = co;
      // 恢复 recipe_source；有 recipe_source 则进入 recipe 模式，否则默认 l1
      const recipeSource = (rs as any).recipe_source;
      if (recipeSource) {
        currentRecipeSource.value = recipeSource as RulesetRecipeSource;
        editorMode.value = 'recipe';
      } else {
        editorMode.value = 'l1';
      }
      // 恢复叙阅器设置
      const readerSettings = (rs as any).reader_settings;
      if (readerSettings) {
        rsDraft.value = JSON.parse(JSON.stringify(readerSettings));
      }
      formData.value = rs;
  } catch { /* ignore */ }
}

onMounted(fetchRuleset);

function onMerged(_result: object) {
  // L3 画布已移除，合并结果只需重新加载规则集
  ElMessage.success('已从上游合并，请刷新页面查看最新内容');
  fetchRuleset();
}

// ── YAML 导出/导入 ────────────────────────────────────────────────────
const yamlExporting = ref(false);
const yamlImporting = ref(false);

async function handleExportYaml() {
  if (!rulesetId || isNew) { ElMessage.warning('请先保存规则集后再导出'); return; }
  yamlExporting.value = true;
  try {
    await exportRulesetYaml(rulesetId, `${formName.value || 'ruleset'}.yaml`);
    ElMessage.success('导出成功');
  } catch (e) {
    ElMessage.error(`导出失败：${e}`);
  } finally {
    yamlExporting.value = false;
  }
}

async function handleImportYaml() {
  const file = await pickYamlFile();
  if (!file) return;
  yamlImporting.value = true;
  try {
    const result = await importRulesetYaml(file);
    ElMessage.success(`导入成功：${result.name}`);
    router.push(`/creator/workshop/${result.id}/edit`);
  } catch (e) {
    ElMessage.error(`导入失败：${e}`);
  } finally {
    yamlImporting.value = false;
  }
}

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
  // 序列化自定义命令到 commands 字段
  const serializedCustomCommands = customCommands.value.map((cmd) => ({
    trigger: cmd.trigger,
    description: cmd.description,
    aliases: cmd.aliases.split(',').map((s) => s.trim()).filter(Boolean),
    gm_only: cmd.gm_only,
    input_mapping: cmd.input_mapping,
  }));

  const body = {
    name: formName.value.trim(),
    version: formVersion.value,
    status: formStatus.value,
    character_card_schema: (() => {
      // 顶层规范化字段：供 CharacterEditor.vue（玩家创角）和 character-sheet-service（服务端派生值）消费
      const attributesRecord: Record<string, { label?: string; roll_formula?: string }> = {};
      for (const attr of l1Config.attributes) {
        if (attr.name) {
          attributesRecord[attr.name] = {
            label: attr.name,
            // 移除空格确保 CharacterEditor 内的 rollFormula() regex 能正确匹配
            roll_formula: (attr.roll_formula ?? '').replace(/\s+/g, ''),
          };
        }
      }
      const skillsRecord: Record<string, { label?: string; base?: number }> = {};
      for (const skill of (cardSchema.value.skills as Array<{ name?: string; label?: string; base?: number }>) ) {
        const key = (skill.name ?? skill.label ?? '').trim();
        if (key) skillsRecord[key] = { label: key, base: skill.base ?? 5 };
      }
      const derivedFormulasRecord: Record<string, { formula: string; label?: string }> = {};
      for (const res of l1Config.resources) {
        if (res.name && res.max_formula) {
          derivedFormulasRecord[res.name] = { formula: res.max_formula, label: res.name };
        }
      }
      return {
        // 编辑器内部往返恢复用
        _l1_config: l1Config,
        _card_schema: cardSchema.value,
        // 游戏引擎消费用（CharacterEditor.vue + character-sheet-service）
        attributes: attributesRecord,
        skills: skillsRecord,
        derived_formulas: derivedFormulasRecord,
      };
    })(),
    recruitment_fields: recruitmentFields.value,
    command_overrides: commandOverrides.value,
    commands: {
      custom_commands: serializedCustomCommands,
      supported_commands: supportedCommands.value,
    },
    reader_settings: rsDraft.value,
  };
  try {
    if (isNew) {
      const data = await apiCreateRuleset(body as any) as { id: string };
      ElMessage.success('保存成功');
      router.replace(`/creator/workshop/${data.id}/edit`);
    } else {
      await updateRuleset(rulesetId, body as any);
      ElMessage.success('保存成功');
    }
  } catch {
    ElMessage.error('保存失败，请检查网络连接');
  } finally { saving.value = false; }
}

async function submitForReview() {
  if (!rulesetId || isNew) { ElMessage.warning('请先保存规则集'); return; }
  if (!confirm('提交发布？V1.0 将自动审核通过并公开发布。')) return;
  try {
    await submitRulesetReview(rulesetId);
    formStatus.value = 'published';
    ElMessage.success('规则集已发布');
  } catch (e: unknown) { ElMessage.error((e as Error)?.message ?? '发布失败'); }
}

async function deprecate() {
  if (!rulesetId || isNew) return;
  if (!confirm('确认弃用此规则集？弃用后不再对外展示。')) return;
  try {
    await deprecateRuleset(rulesetId);
    formStatus.value = 'deprecated';
    ElMessage.success('已弃用');
  } catch (e: unknown) { ElMessage.error((e as Error)?.message ?? '弃用失败'); }
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
    <!-- 移动端只读提示 -->
    <div class="mobile-readonly-banner">
      <span><SvgIcon name="icon-user" :size="14" /> 规则包编辑器在移动端为只读模式，请在 PC 端进行编辑</span>
    </div>
    <!-- Header -->
    <div class="editor-header">
      <button class="back-btn" @click="router.back()">← 返回工坊</button>
      <!-- 模式切换标签 -->
      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: editorMode === 'l1' }" @click="switchMode('l1')"><SvgIcon name="icon-list" :size="12" /> 表单（角色卡 Schema）</button>
        <button class="mode-tab mode-tab--recommended" :class="{ active: editorMode === 'recipe' }" @click="switchMode('recipe')"><SvgIcon name="icon-grid" :size="12" /> Recipe <span class="mode-tab-badge">推荐</span></button>
        <button class="mode-tab" :class="{ active: editorMode === 'versions' }" @click="editorMode = 'versions'"><SvgIcon name="icon-history" :size="12" /> 版本</button>
      </div>
      <div class="header-right">
        <span class="status-badge" :data-status="formStatus">{{ { draft: '草稿', reviewing: '审核中', published: '已发布', deprecated: '已弃用' }[formStatus] ?? formStatus }}</span>
        <button v-if="formStatus === 'draft'" class="action-btn action-btn--submit" @click="submitForReview">提交发布</button>
        <button v-if="formStatus === 'published'" class="action-btn action-btn--deprecate" @click="deprecate">弃用</button>
        <button class="action-btn action-btn--export" :disabled="yamlExporting || isNew" @click="handleExportYaml" title="导出 YAML">
          <template v-if="yamlExporting">导出…</template>
          <template v-else><SvgIcon name="icon-download" :size="12" /> YAML</template>
        </button>
        <button class="action-btn action-btn--import" :disabled="yamlImporting" @click="handleImportYaml" title="从 YAML 导入（新建规则集）">
          <template v-if="yamlImporting">导入…</template>
          <template v-else><SvgIcon name="icon-upload" :size="12" /> 导入</template>
        </button>
        <button class="action-btn" @click="readerSettingsPanelOpen = true">叙阅器设置</button>
        <button class="save-btn" @click="save" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
      </div>
    </div>

    <!-- 版本管理面板 -->
    <div v-if="editorMode === 'versions'" class="versions-container">
      <VersionPanel
        :ruleset-id="rulesetId"
        :auth-token="getToken() ?? ''"
        :parent-id="(formData as any)?.parent_id ?? null"
        @rolledback="fetchRuleset"
        @merged="onMerged"
      />
    </div>

    <!-- Recipe 编辑面板 -->
    <div v-else-if="editorMode === 'recipe'" class="recipe-container">
      <RecipeEditor
        :ruleset-id="rulesetId"
        :recipe-source="currentRecipeSource"
        @saved="onRecipeSaved"
      />
    </div>

    <div v-else class="editor-body">
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

      <!-- 角色卡模板 Schema -->
      <section class="form-section ccs-section">
        <div class="section-header">
          <h3 class="section-title">角色卡模板</h3>
          <span class="hint-text" style="font-size: 11px; color: var(--text-tertiary);">定义角色卡字段结构，供玩家创建角色卡时使用</span>
        </div>
        <CharacterCardSchemaEditor v-model="cardSchema" />
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

      <!-- 招募帖字段配置 -->
      <section class="form-section">
        <div class="section-header">
          <h3 class="section-title">招募帖字段</h3>
          <span class="hint-text" style="font-size: 11px;">定义玩家报名时填写的字段</span>
        </div>
        <RecruitmentFieldsEditor v-model="recruitmentFields" />
      </section>

      <!-- 指令覆盖配置 -->
      <section class="form-section">
        <div class="section-header">
          <h3 class="section-title">指令覆盖</h3>
          <span class="hint-text" style="font-size: 11px;">覆盖内置指令的骰子表达式或难度系数</span>
        </div>
        <CommandOverridesEditor v-model="commandOverrides" :supported-commands="supportedCommands" />
      </section>

      <!-- 自定义命令 -->
      <section class="form-section">
        <div class="section-header">
          <h3 class="section-title">自定义命令</h3>
          <button class="add-btn" @click="addCustomCommand">+ 添加命令</button>
        </div>
        <p v-if="customCommands.length === 0" class="hint-text">暂无自定义命令。添加后可在游戏中通过 /触发词 调用。</p>
        <div v-for="(cmd, i) in customCommands" :key="i" class="cmd-card">
          <div class="cmd-card-header" @click="toggleCmd(i)">
            <span class="cmd-name-mono">{{ cmd.trigger || '(未命名)' }}</span>
            <span class="cmd-desc-preview">{{ cmd.description }}</span>
            <div class="cmd-card-actions">
              <span class="cmd-gm-badge" v-if="cmd.gm_only">GM专属</span>
              <button class="rm-btn" @click.stop="removeCustomCommand(i)">×</button>
            </div>
          </div>
          <div v-if="expandedCmdIdx === i" class="cmd-card-body">
            <div class="form-row">
              <div class="form-field">
                <label class="form-label">触发词</label>
                <input v-model="cmd.trigger" class="field-input" placeholder="如：atk（不含 /）" />
              </div>
              <div class="form-field flex-2">
                <label class="form-label">描述</label>
                <input v-model="cmd.description" class="field-input" placeholder="命令的功能说明" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-field flex-2">
                <label class="form-label">别名（逗号分隔）</label>
                <input v-model="cmd.aliases" class="field-input" placeholder="如：attack, a" />
              </div>
              <div class="form-field" style="justify-content: flex-end; flex-direction: row; align-items: center; gap: var(--space-2);">
                <label class="checkbox-item">
                  <input type="checkbox" v-model="cmd.gm_only" />
                  <span>仅 GM 可用</span>
                </label>
              </div>
            </div>
            <!-- 参数映射 -->
            <div class="subsection">
              <div class="section-header">
                <span class="form-label">参数映射</span>
                <button class="add-btn" @click="addInputMapping(cmd)">+ 添加参数</button>
              </div>
              <p v-if="cmd.input_mapping.length === 0" class="hint-text" style="margin: 0;">此命令无自定义参数。</p>
              <table v-else class="mapping-table">
                <thead>
                  <tr>
                    <th>参数名</th>
                    <th>来源类型</th>
                    <th>字段 / 固定值</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(mp, mi) in cmd.input_mapping" :key="mi">
                    <td><input v-model="mp.param_name" class="field-input mapping-input" placeholder="如 skill" /></td>
                    <td>
                      <select v-model="mp.source" class="status-select mapping-select">
                        <option value="user_input">用户输入</option>
                        <option value="character_attribute">角色属性</option>
                        <option value="character_skill">角色技能</option>
                        <option value="fixed_value">固定值</option>
                      </select>
                    </td>
                    <td>
                      <input
                        v-if="mp.source === 'fixed_value'"
                        v-model="mp.fixed_value"
                        class="field-input mapping-input"
                        placeholder="固定值内容"
                      />
                      <input
                        v-else-if="mp.source === 'character_attribute' || mp.source === 'character_skill'"
                        v-model="mp.field_name"
                        class="field-input mapping-input"
                        :list="'attr-list-' + i"
                        :placeholder="mp.source === 'character_attribute' ? '属性名' : '技能名'"
                      />
                      <datalist :id="'attr-list-' + i">
                        <option v-for="a in (mp.source === 'character_attribute' ? attributes : skills).map(x => x.name)" :key="a" :value="a" />
                      </datalist>
                      <span v-if="mp.source === 'user_input'" class="hint-text" style="font-size: 11px;">由用户在指令中输入</span>
                    </td>
                    <td><button class="rm-btn" @click="removeInputMapping(cmd, mi)">×</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <!-- 预览测试面板 -->
      <section class="form-section preview-section">
        <h3 class="section-title">预览测试</h3>
        <p class="hint-text">在下方输入命令并执行，验证规则效果。需先保存规则集。</p>

        <!-- 模拟角色数据 -->
        <div class="mock-ctx-grid">
          <!-- 模拟属性 -->
          <div class="form-field">
            <div class="mock-field-header">
              <label class="form-label">模拟属性</label>
              <button class="mock-add-btn" @click="addMockAttr">+ 添加</button>
            </div>
            <div v-for="(attr, i) in mockAttrs" :key="i" class="mock-row">
              <input v-model="attr.name" class="mock-row-name" placeholder="属性名" />
              <input v-model.number="attr.value" type="number" class="mock-row-val" />
              <button class="mock-rm-btn" @click="removeMockAttr(i)">×</button>
            </div>
          </div>
          <!-- 模拟技能 -->
          <div class="form-field">
            <div class="mock-field-header">
              <label class="form-label">模拟技能</label>
              <button class="mock-add-btn" @click="addMockSkill">+ 添加</button>
            </div>
            <div v-for="(sk, i) in mockSkills" :key="i" class="mock-row">
              <input v-model="sk.name" class="mock-row-name" placeholder="技能名" />
              <input v-model.number="sk.value" type="number" class="mock-row-val" />
              <button class="mock-rm-btn" @click="removeMockSkill(i)">×</button>
            </div>
          </div>
          <!-- 模拟资源 -->
          <div class="form-field">
            <div class="mock-field-header">
              <label class="form-label">模拟资源</label>
              <button class="mock-add-btn" @click="addMockResource">+ 添加</button>
            </div>
            <div v-for="(res, i) in mockResources" :key="i" class="mock-row">
              <input v-model="res.name" class="mock-row-name" placeholder="资源名" />
              <input v-model.number="res.current" type="number" class="mock-row-val" placeholder="当前" />
              <span class="mock-row-sep">/</span>
              <input v-model.number="res.max" type="number" class="mock-row-val" placeholder="最大" />
              <button class="mock-rm-btn" @click="removeMockResource(i)">×</button>
            </div>
          </div>
        </div>

        <!-- 命令输入 -->
        <div class="preview-cmd-row">
          <input v-model="previewCommand" class="field-input preview-cmd-input" placeholder="/r 1d6 或 /rc field_name=侦查" @keydown.enter="runPreview" />
          <button class="run-btn" @click="runPreview" :disabled="previewRunning || isNew">
            {{ previewRunning ? '执行中…' : '执行' }}
          </button>
        </div>

        <!-- 执行结果 -->
        <div v-if="previewResult" class="preview-result" :class="previewResult.success ? 'result-ok' : 'result-err'">
          <div class="result-summary">
            <span class="result-badge" :class="previewResult.success ? 'badge-ok' : 'badge-err'">
              {{ previewResult.success ? '成功' : '失败' }}
            </span>
            <span class="result-text">{{ previewResult.result }}</span>
          </div>
          <!-- 骰子结果 -->
          <div v-if="previewResult.dice_rolls.length > 0" class="dice-rolls">
            <span v-for="(dr, i) in previewResult.dice_rolls" :key="i" class="dice-chip">
              {{ dr.expression }} = <strong>{{ dr.value }}</strong>
              <span v-if="dr.detail" class="dice-detail">（{{ dr.detail }}）</span>
            </span>
          </div>
          <!-- 执行日志 -->
          <details class="log-details">
            <summary class="log-summary">执行日志（{{ previewResult.logs.length }} 个节点）</summary>
            <div v-for="(log, i) in previewResult.logs" :key="i" class="log-item">
              <span class="log-node">{{ log.node_id }}</span>
              <span class="log-type">{{ log.atom_type }}</span>
              <span class="log-output">→ {{ JSON.stringify(log.output) }}</span>
            </div>
          </details>
          <div v-if="previewResult.error" class="error-msg">{{ previewResult.error }}</div>
        </div>
      </section>
    </div>
  </div>

  <!-- 叙阅器设置抽屉 -->
  <Teleport to="body">
    <div v-if="readerSettingsPanelOpen" class="rs-drawer" @click.self="readerSettingsPanelOpen = false">
      <div class="rs-drawer__panel">
        <div class="rs-drawer__head">
          <h2>叙阅器设置</h2>
          <button class="rs-drawer__close" @click="readerSettingsPanelOpen = false">×</button>
        </div>
        <div class="rs-drawer__body">
          <!-- 快速预设 -->
          <section>
            <p class="rs-section__label">快速预设</p>
            <div class="rs-presets">
              <button class="rs-preset-btn" @click="applyPreset('paid_strict')">付费作品严保护</button>
              <button class="rs-preset-btn" @click="applyPreset('free_open')">免费作品开放</button>
              <button class="rs-preset-btn" @click="applyPreset('private')">纯私密创作</button>
            </div>
          </section>
          <!-- 功能开关 -->
          <section>
            <p class="rs-section__label">功能开关</p>
            <div class="rs-toggles">
              <label><input type="checkbox" v-model="rsDraft.plugin_flags.annotation" />划线笔记</label>
              <label><input type="checkbox" v-model="rsDraft.plugin_flags.toc" />章节目录</label>
              <label><input type="checkbox" v-model="rsDraft.plugin_flags.reading_progress" />阅读进度记录</label>
              <label><input type="checkbox" v-model="rsDraft.plugin_flags.share" />分享按钮</label>
              <label><input type="checkbox" v-model="rsDraft.plugin_flags.quote_house_rules" />房规引用（规则包专属）</label>
              <label><input type="checkbox" v-model="rsDraft.plugin_flags.export_structured_data" />结构化数据导出</label>
            </div>
          </section>
          <!-- 内容保护 -->
          <section>
            <p class="rs-section__label">内容保护</p>
            <div class="rs-toggles">
              <label><input type="checkbox" v-model="rsDraft.protection_flags.anti_bulk_copy" />防批量复制（≤200字）</label>
              <label><input type="checkbox" v-model="rsDraft.protection_flags.trace_watermark" />溯源水印（含 UID）</label>
              <label><input type="checkbox" v-model="rsDraft.protection_flags.disable_pdf_export" />禁止 PDF 导出</label>
              <label><input type="checkbox" v-model="rsDraft.protection_flags.disable_public_comments" />禁止公开划线评论</label>
              <label><input type="checkbox" v-model="rsDraft.protection_flags.embed_copyright_notice" />版权声明自动嵌入</label>
              <label><input type="checkbox" v-model="rsDraft.protection_flags.forbid_redistribution" />禁止二次分发</label>
            </div>
          </section>
          <!-- 游客试读 -->
          <section>
            <p class="rs-section__label">游客试读比例</p>
            <div class="rs-field">
              <input type="range" min="0" max="100" step="5"
                :value="Math.round((rsDraft.preview_policy.preview_ratio ?? 0) * 100)"
                @input="rsDraft.preview_policy.preview_ratio = +($event.target as HTMLInputElement).value / 100" />
              <span class="rs-field__hint">{{ Math.round((rsDraft.preview_policy.preview_ratio ?? 0) * 100) }}%</span>
            </div>
          </section>
          <!-- 正文行距 -->
          <section>
            <p class="rs-section__label">正文行距</p>
            <div class="rs-radio-group">
              <label v-for="opt in [['compact','紧凑'],['comfortable','适中'],['relaxed','宽松']]" :key="opt[0]">
                <input type="radio" :value="opt[0]" v-model="rsDraft.appearance!.line_height" />
                {{ opt[1] }}
              </label>
            </div>
          </section>
        </div>
        <div class="rs-drawer__footer">
          <button class="action-btn" @click="readerSettingsPanelOpen = false">取消</button>
          <button class="save-btn" :disabled="rsSaving" @click="saveReaderSettings">{{ rsSaving ? '保存中…' : '保存设置' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.editor { display: flex; flex-direction: column; height: 100%; }
.mobile-readonly-banner {
  display: none;
  background: #fef3c7; color: #92400e;
  padding: 8px 16px; font-size: var(--text-sm); text-align: center;
  border-bottom: 1px solid #fcd34d;
}
@media (max-width: 768px) {
  .mobile-readonly-banner { display: block; }
  .editor-header .mode-tabs,
  .save-btn, .action-btn { pointer-events: none; opacity: 0.5; }
}
.versions-container { flex: 1; overflow: auto; min-height: 0; }
.recipe-container { flex: 1; overflow: auto; min-height: 0; padding: 16px; }

/* 状态机按钮 */
.status-badge { font-size: 11px; padding: 3px 8px; border-radius: 10px; font-weight: 600; }
.status-badge[data-status="draft"] { background: color-mix(in srgb, #888 20%, transparent); color: #aaa; }
.status-badge[data-status="published"] { background: color-mix(in srgb, #27ae60 20%, transparent); color: #2ecc71; }
.status-badge[data-status="deprecated"] { background: color-mix(in srgb, #e74c3c 20%, transparent); color: #e74c3c; }
.action-btn--submit { background: #7b68ee; color: #fff; border: none; padding: 5px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; }
.action-btn--submit:hover { opacity: 0.85; }
.action-btn--export { background: none; border: 1px solid var(--border-default); color: var(--text-secondary); padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; }
.action-btn--export:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
.action-btn--export:disabled { opacity: 0.4; cursor: not-allowed; }
.action-btn--import { background: none; border: 1px solid var(--border-default); color: var(--text-secondary); padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; }
.action-btn--import:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
.action-btn--import:disabled { opacity: 0.4; cursor: not-allowed; }
.action-btn--deprecate { background: none; border: 1px solid #e74c3c; color: #e74c3c; padding: 5px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; }
.action-btn--deprecate:hover { background: color-mix(in srgb, #e74c3c 10%, transparent); }
.editor-body-wrap { max-width: 880px; }
.mode-tabs { display: flex; gap: 2px; background: var(--surface-base, #f0f0f0); border-radius: 6px; padding: 2px; }
.mode-tab { padding: 4px 14px; border: none; background: none; border-radius: 4px; cursor: pointer; font-size: 13px; color: var(--text-secondary); transition: background 0.12s, color 0.12s; }
.mode-tab.active { background: var(--surface-card); color: var(--text-primary); font-weight: 600; }
.mode-tab--recommended { font-weight: 500; }
.mode-tab-badge { display: inline-block; margin-left: 3px; padding: 0 4px; font-size: 10px; line-height: 16px; background: var(--accent-primary, #6366f1); color: #fff; border-radius: 3px; vertical-align: middle; }
.mode-tab.active .mode-tab-badge { background: var(--accent-primary-muted, #a5b4fc); color: var(--text-primary); }
.editor-body { max-width: 880px; display: flex; flex-direction: column; gap: var(--space-5); }
.editor-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5); }
.back-btn { background: none; border: none; cursor: pointer; color: var(--text-secondary); font-size: var(--text-sm); padding: 0; }
.back-btn:hover { color: var(--color-accent); }
.header-right { display: flex; align-items: center; gap: var(--space-2); }
.status-select { padding: var(--space-1) var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-card); color: var(--text-primary); font-size: var(--text-sm); }
.save-btn { padding: var(--space-2) var(--space-5); background: var(--color-accent); color: #fff; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: var(--text-sm); transition: opacity var(--transition-fast); }
.save-btn:hover:not(:disabled) { opacity: 0.85; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.editor-body { display: flex; flex-direction: column; gap: var(--space-5); }

.form-section { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-5); }
.ccs-section { padding-bottom: var(--space-3); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
.section-title { font-size: var(--text-base); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-3); }
.section-header .section-title { margin-bottom: 0; }

.form-row { display: flex; gap: var(--space-3); flex-wrap: wrap; }
.form-field { display: flex; flex-direction: column; gap: var(--space-1); flex: 1; min-width: 140px; }
.form-field.flex-2 { flex: 2; }
.form-label { font-size: var(--text-xs); font-weight: 500; color: var(--text-secondary); }
.field-input { padding: var(--space-2) var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-card); color: var(--text-primary); font-size: var(--text-sm); box-sizing: border-box; width: 100%; }
.field-input:focus { outline: none; border-color: var(--color-accent); }
.num-field { max-width: 100px; }

.radio-group { display: flex; gap: var(--space-4); align-items: center; padding: var(--space-2) 0; flex-wrap: wrap; }
.radio-item { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: var(--text-sm); color: var(--text-primary); }

.dyn-row { display: flex; gap: var(--space-2); align-items: center; margin-bottom: var(--space-2); flex-wrap: wrap; }

/* 参数映射表格 */
.mapping-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.mapping-table th { padding: 4px 6px; text-align: left; font-weight: 500; color: var(--text-secondary); border-bottom: 1px solid var(--border-default); white-space: nowrap; }
.mapping-table td { padding: 3px 4px; vertical-align: middle; }
.mapping-table tr:hover td { background: var(--surface-hover, #f9fafb); }
.mapping-input { font-size: 12px; padding: 3px 7px; }
.mapping-select { font-size: 12px; padding: 3px 7px; min-width: 100px; }
.dyn-row .field-input { flex: 1; min-width: 100px; }
.dyn-row .field-input.flex-2 { flex: 2; }

.add-btn { padding: 2px 10px; border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: none; cursor: pointer; font-size: var(--text-xs); color: var(--text-secondary); transition: border-color var(--transition-fast), color var(--transition-fast); }
.add-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
.rm-btn { width: 24px; height: 24px; border: none; background: none; cursor: pointer; color: var(--text-muted); font-size: 16px; flex-shrink: 0; }
.rm-btn:hover { color: var(--text-primary); }

.checkbox-group { display: flex; flex-direction: column; gap: var(--space-2); }
.checkbox-item { display: flex; align-items: center; gap: var(--space-2); cursor: pointer; font-size: var(--text-sm); }
.cmd-name-mono { font-family: var(--font-mono); color: var(--color-accent); }
.cmd-label { color: var(--text-secondary); }

/* 自定义命令卡片 */
.cmd-card { border: 1px solid var(--border-default); border-radius: var(--radius-md); margin-bottom: var(--space-2); overflow: hidden; }
.cmd-card-header { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); cursor: pointer; background: var(--surface-base); }
.cmd-card-header:hover { background: color-mix(in srgb, var(--color-accent) 5%, var(--surface-base)); }
.cmd-desc-preview { flex: 1; font-size: var(--text-xs); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmd-card-actions { display: flex; align-items: center; gap: var(--space-1); flex-shrink: 0; }
.cmd-gm-badge { font-size: 10px; padding: 1px 6px; border-radius: 100px; background: color-mix(in srgb, var(--color-accent) 15%, transparent); color: var(--color-accent); }
.cmd-card-body { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); border-top: 1px solid var(--border-default); }
.subsection { display: flex; flex-direction: column; gap: var(--space-2); }
.hint-text { font-size: var(--text-xs); color: var(--text-muted); margin: var(--space-1) 0; }
.json-editor { width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-base); color: var(--text-primary); font-family: var(--font-mono); font-size: var(--text-xs); resize: vertical; box-sizing: border-box; }
.json-editor:focus { outline: none; border-color: var(--color-accent); }

/* 预览测试面板 */
.preview-section { display: flex; flex-direction: column; gap: var(--space-3); }
.mock-ctx-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); }

/* 结构化模拟数据 */
.mock-field-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.mock-add-btn { font-size: 11px; padding: 1px 6px; background: none; border: 1px solid var(--color-border, #d1d5db); border-radius: 3px; color: var(--color-text-tertiary); cursor: pointer; }
.mock-add-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
.mock-row { display: flex; align-items: center; gap: 3px; margin-bottom: 3px; }
.mock-row-name { flex: 1; min-width: 0; padding: 3px 6px; border: 1px solid var(--color-border, #d1d5db); border-radius: 3px; font-size: 12px; background: var(--color-surface); color: var(--color-text-primary); }
.mock-row-val { width: 52px; flex-shrink: 0; padding: 3px 6px; border: 1px solid var(--color-border, #d1d5db); border-radius: 3px; font-size: 12px; background: var(--color-surface); color: var(--color-text-primary); }
.mock-row-sep { color: var(--color-text-tertiary); font-size: 12px; }
.mock-rm-btn { background: none; border: none; color: var(--color-text-tertiary); cursor: pointer; font-size: 14px; padding: 0 2px; flex-shrink: 0; }
.mock-rm-btn:hover { color: #e74c3c; }
.preview-cmd-row { display: flex; gap: var(--space-2); align-items: center; }
.preview-cmd-input { flex: 1; font-family: var(--font-mono); }
.run-btn { padding: var(--space-2) var(--space-5); background: var(--color-accent); color: #fff; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: var(--text-sm); white-space: nowrap; transition: opacity var(--transition-fast); }
.run-btn:hover:not(:disabled) { opacity: 0.85; }
.run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.preview-result { border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); }
.result-ok { background: color-mix(in srgb, #22c55e 8%, var(--surface-base)); border: 1px solid color-mix(in srgb, #22c55e 30%, transparent); }
.result-err { background: color-mix(in srgb, #ef4444 8%, var(--surface-base)); border: 1px solid color-mix(in srgb, #ef4444 30%, transparent); }
.result-summary { display: flex; align-items: center; gap: var(--space-2); }
.result-badge { font-size: var(--text-xs); padding: 1px 8px; border-radius: 100px; font-weight: 600; }
.badge-ok { background: color-mix(in srgb, #22c55e 20%, transparent); color: #16a34a; }
.badge-err { background: color-mix(in srgb, #ef4444 20%, transparent); color: #dc2626; }
.result-text { font-size: var(--text-sm); font-weight: 500; color: var(--text-primary); }
.dice-rolls { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.dice-chip { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 2px 10px; font-size: var(--text-xs); font-family: var(--font-mono); }
.dice-detail { color: var(--text-muted); }
.log-details { font-size: var(--text-xs); }
.log-summary { cursor: pointer; color: var(--text-secondary); padding: var(--space-1) 0; }
.log-item { display: flex; gap: var(--space-2); align-items: baseline; padding: 2px 0; border-top: 1px solid color-mix(in srgb, var(--border-default) 50%, transparent); }
.log-node { font-family: var(--font-mono); color: var(--color-accent); min-width: 80px; }
.log-type { color: var(--text-muted); min-width: 120px; }
.log-output { color: var(--text-primary); word-break: break-all; }
.error-msg { font-size: var(--text-xs); color: #dc2626; font-family: var(--font-mono); }

/* ── 叙阅器设置抽屉 ─────────────────────────────────────── */
.rs-drawer {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.45);
  z-index: 1000;
  display: flex; justify-content: flex-end;
}
.rs-drawer__panel {
  background: var(--color-surface, #fff);
  width: 420px; max-width: 100%; height: 100%;
  display: flex; flex-direction: column;
  box-shadow: -4px 0 24px rgba(0,0,0,.15);
}
.rs-drawer__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default, #eee);
}
.rs-drawer__head h2 { margin: 0; font-size: 16px; }
.rs-drawer__close {
  background: none; border: none; font-size: 22px;
  cursor: pointer; color: var(--text-secondary, #888); line-height: 1;
}
.rs-drawer__body {
  flex: 1; overflow-y: auto;
  padding: 16px 20px;
  display: flex; flex-direction: column; gap: 20px;
}
.rs-drawer__footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-default, #eee);
  display: flex; justify-content: flex-end; gap: 8px;
}
.rs-section__label {
  font-size: 12px; font-weight: 600;
  color: var(--text-secondary, #888);
  text-transform: uppercase; letter-spacing: .05em;
  margin: 0 0 8px;
}
.rs-presets { display: flex; flex-wrap: wrap; gap: 8px; }
.rs-preset-btn {
  padding: 4px 12px; font-size: 13px;
  border: 1px solid var(--color-primary, #6c63ff);
  border-radius: 999px; background: none;
  color: var(--color-primary, #6c63ff);
  cursor: pointer; transition: background .15s;
}
.rs-preset-btn:hover { background: color-mix(in srgb, var(--color-primary, #6c63ff) 10%, transparent); }
.rs-toggles { display: flex; flex-direction: column; gap: 8px; }
.rs-toggles label { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
.rs-field { display: flex; align-items: center; gap: 10px; }
.rs-field input[type=range] { flex: 1; }
.rs-field__hint { font-size: 13px; color: var(--text-secondary, #888); white-space: nowrap; }
.rs-radio-group { display: flex; gap: 16px; }
.rs-radio-group label { display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; }
</style>
