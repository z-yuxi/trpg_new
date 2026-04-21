<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import RuleCanvas from '../../components/rule-canvas/RuleCanvas.vue';
import VersionPanel from '../../components/VersionPanel.vue';
import { convertL1ToL3 } from '../../utils/l1-to-l3-converter';
import { detectL3ToL1 } from '../../utils/l3-to-l1-detector';
import { deserializeFromGraph } from '../../utils/canvas-serializer';
import { api, getToken } from '../../utils/api';
import type { CommandGraph } from '@trpg/shared';

const route = useRoute();
const router = useRouter();

const rulesetId = route.params.id as string;
const isNew = rulesetId === 'new';

// ── 编辑模式 L1（表单）/ L3（可视化画布）/ versions（版本管理） ──────────────
type EditorMode = 'l1' | 'l3' | 'versions';
const editorMode = ref<EditorMode>('l1');
/** L3 画布当前的图数据（保存时写入后端） */
const currentGraph = ref<CommandGraph | null>(null);

function switchMode(to: EditorMode) {
  if (to === 'l3' && editorMode.value === 'l1') {
    const ok = confirm('切换到可视化画布编辑？当前表单配置将自动转换为节点图。');
    if (!ok) return;
    // L1 → L3：将当前表单配置转换为节点图
    const result = convertL1ToL3({
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
    });
    // 若只有 currentGraph 为空或节点更少时才覆盖（避免覆盖用户已编辑的画布）
    if (!currentGraph.value || currentGraph.value.nodes.length === 0) {
      currentGraph.value = result.graph;
    }
    if (result.used_defaults.length > 0) {
      ElMessage.warning(`已使用默认骰池参数，请在 L1 表单中补充骰池目标值和成功阈值后重新转换（使用了默认值：${result.used_defaults.join(', ')}）`);
    }
    editorMode.value = to;
    return;
  }
  if (to === 'l1' && editorMode.value === 'l3' && currentGraph.value && currentGraph.value.nodes.length > 0) {
    // L3 → L1：尝试反向检测
    const detected = detectL3ToL1(currentGraph.value);
    if (!detected.matched) {
      if (detected.reason === 'empty-graph') {
        editorMode.value = to;
        return;
      }
      // 自定义图，弹出警告
      const ok = confirm('当前节点图包含自定义逻辑，切回表单模式将不会改变表单字段（自定义部分仍会在保存时写入）。是否继续？');
      if (!ok) return;
    } else {
      // 匹配成功，回填表单
      const ex = detected.extracted;
      if (ex.check_mode) checkMode.value = ex.check_mode;
      if (ex.default_dice) defaultDice.value = ex.default_dice;
      if (typeof ex.crit_success_max === 'number') critSuccessMax.value = ex.crit_success_max;
      if (typeof ex.crit_fail_min === 'number') critFailMin.value = ex.crit_fail_min;
      ElMessage.success('节点图已识别为标准模板，表单已同步更新');
    }
    editorMode.value = to;
    return;
  }
  editorMode.value = to;
}

// ── form data ─────────────────────────────────────────────────────────
const formName = ref(isNew ? (route.query.name as string) ?? '新规则包' : '');
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

// ── 自定义命令 ────────────────────────────────────────────────────────
type InputMappingSource = 'user_input' | 'character_attribute' | 'character_skill' | 'fixed_value';
type CustomInputMapping = { param_name: string; source: InputMappingSource; fixed_value?: string; field_name?: string };
type CustomCommand = {
  trigger: string;
  description: string;
  aliases: string;        // 逗号分隔
  gm_only: boolean;
  input_mapping: CustomInputMapping[];
  graph_json: string;     // JSON 编辑器（L3 画布后续批次实现）
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
    graph_json: JSON.stringify({ nodes: [], output_node_id: '' }, null, 2),
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

// 模拟角色数据
const mockAttrRaw = ref('{"力量": 60, "体质": 55, "意志": 65}');
const mockSkillRaw = ref('{"侦查": 70, "图书馆使用": 40, "聆听": 45}');
const mockResourceRaw = ref('{"理智值": {"current": 65, "max": 99}, "HP": {"current": 11, "max": 11}}');

async function runPreview() {
  if (!rulesetId || isNew) { ElMessage.warning('请先保存规则集后再预览'); return; }
  previewRunning.value = true;
  previewResult.value = null;
  try {
    let attributes: Record<string, number> = {};
    let skills: Record<string, number> = {};
    let resources: Record<string, { current: number; max: number }> = {};
    try { attributes = JSON.parse(mockAttrRaw.value); } catch { /* use empty */ }
    try { skills = JSON.parse(mockSkillRaw.value); } catch { /* use empty */ }
    try { resources = JSON.parse(mockResourceRaw.value); } catch { /* use empty */ }

    const data = await api.post<{ success?: boolean; result?: string; dice_rolls?: unknown[]; logs?: unknown[] }>(
      `/rulesets/${rulesetId}/execute`,
      { command: previewCommand.value, mock_context: { attributes, skills, resources } },
    );
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
    const rs = await api.get<Record<string, unknown>>(`/rulesets/${rulesetId}`);
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
          graph_json: JSON.stringify(c.graph ?? { nodes: [], output_node_id: '' }, null, 2),
        }));
      }
      // 恢复 L3 图数据（从 atoms 字段推断）
      const atoms = (rs as any).atoms;
      if (Array.isArray(atoms) && atoms.length > 0) {
        currentGraph.value = {
          nodes: atoms,
          output_node_id: atoms[atoms.length - 1]?.node_id ?? '',
        } as CommandGraph;
      }
      formData.value = rs;
  } catch { /* ignore */ }
}

onMounted(fetchRuleset);

function onMerged(result: object) {
  const merged = result as { merged_graph?: { atoms: unknown[] } };
  if (merged?.merged_graph?.atoms) {
    currentGraph.value = {
      nodes: merged.merged_graph.atoms,
      output_node_id: (merged.merged_graph.atoms[merged.merged_graph.atoms.length - 1] as any)?.node_id ?? '',
    } as CommandGraph;
    ElMessage.success('已应用合并结果，请切换到画布查看并保存');
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
  const serializedCustomCommands = customCommands.value.map((cmd) => {
    let graph = { nodes: [], output_node_id: '' };
    try { graph = JSON.parse(cmd.graph_json); } catch { /* keep empty */ }
    return {
      trigger: cmd.trigger,
      description: cmd.description,
      aliases: cmd.aliases.split(',').map((s) => s.trim()).filter(Boolean),
      gm_only: cmd.gm_only,
      input_mapping: cmd.input_mapping,
      graph,
    };
  });
  // 若 L3 模式有图数据，合并进 atoms/connections
  const graphPayload = currentGraph.value && currentGraph.value.nodes.length > 0
    ? {
        atoms: currentGraph.value.nodes,
        connections: currentGraph.value.nodes
          .flatMap((n) =>
            Object.entries(n.inputs)
              .filter(([, v]) => (v as any).type === 'ref')
              .map(([inputKey, v]) => ({
                from_node: (v as any).node_id,
                from_output: (v as any).output_key,
                to_node: n.node_id,
                to_input: inputKey,
              })),
          ),
      }
    : {};

  const body = {
    name: formName.value.trim(),
    version: formVersion.value,
    status: formStatus.value,
    character_card_schema: { _l1_config: l1Config },
    commands: {
      custom_commands: serializedCustomCommands,
      supported_commands: supportedCommands.value,
    },
    ...graphPayload,
  };
  try {
    if (isNew) {
      const data = await api.post<{ id: string }>('/rulesets', body);
      ElMessage.success('保存成功');
      router.replace(`/creator/workshop/${data.id}/edit`);
    } else {
      await api.put(`/rulesets/${rulesetId}`, body);
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
    await api.post(`/rulesets/${rulesetId}/submit-review`, {});
    formStatus.value = 'published';
    ElMessage.success('规则集已发布');
  } catch (e: unknown) { ElMessage.error((e as Error)?.message ?? '发布失败'); }
}

async function deprecate() {
  if (!rulesetId || isNew) return;
  if (!confirm('确认弃用此规则集？弃用后不再对外展示。')) return;
  try {
    await api.post(`/rulesets/${rulesetId}/deprecate`, {});
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
      <span>📱 规则包编辑器在移动端为只读模式，请在 PC 端进行编辑</span>
    </div>
    <!-- Header -->
    <div class="editor-header">
      <button class="back-btn" @click="router.back()">← 返回工坊</button>
      <!-- L1/L3 模式切换标签 -->
      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: editorMode === 'l1' }" @click="switchMode('l1')">📝 表单 (L1)</button>
        <button class="mode-tab" :class="{ active: editorMode === 'l3' }" @click="switchMode('l3')">🎨 画布 (L3)</button>
        <button class="mode-tab" :class="{ active: editorMode === 'versions' }" @click="editorMode = 'versions'">🕑 版本</button>
      </div>
      <div class="header-right">
        <span class="status-badge" :data-status="formStatus">{{ { draft: '草稿', reviewing: '审核中', published: '已发布', deprecated: '已弃用' }[formStatus] ?? formStatus }}</span>
        <button v-if="formStatus === 'draft'" class="action-btn action-btn--submit" @click="submitForReview">提交发布</button>
        <button v-if="formStatus === 'published'" class="action-btn action-btn--deprecate" @click="deprecate">弃用</button>
        <button class="save-btn" @click="save" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
      </div>
    </div>

    <!-- L3 可视化画布 -->
    <div v-if="editorMode === 'l3'" class="l3-canvas-container">
      <RuleCanvas
        :ruleset-id="rulesetId"
        :auth-token="getToken() ?? undefined"
        :initial-graph="currentGraph ?? undefined"
        @update:graph="(g) => (currentGraph = g)"
        @save="(g) => { currentGraph = g; save(); }"
      />
    </div>

    <!-- 版本管理面板 -->
    <div v-else-if="editorMode === 'versions'" class="versions-container">
      <VersionPanel
        :ruleset-id="rulesetId"
        :auth-token="getToken() ?? ''"
        :parent-id="(formData as any)?.parent_id ?? null"
        @rolledback="fetchRuleset"
        @merged="onMerged"
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
              <div v-for="(mp, mi) in cmd.input_mapping" :key="mi" class="dyn-row">
                <input v-model="mp.param_name" class="field-input" placeholder="参数名" />
                <select v-model="mp.source" class="status-select">
                  <option value="user_input">用户输入</option>
                  <option value="character_attribute">角色属性</option>
                  <option value="character_skill">角色技能</option>
                  <option value="fixed_value">固定值</option>
                </select>
                <input v-if="mp.source === 'fixed_value'" v-model="mp.fixed_value" class="field-input" placeholder="固定值" />
                <input v-if="mp.source === 'character_attribute' || mp.source === 'character_skill'" v-model="mp.field_name" class="field-input" placeholder="属性/技能名" />
                <button class="rm-btn" @click="removeInputMapping(cmd, mi)">×</button>
              </div>
            </div>
            <!-- 执行图 JSON 编辑器（L3 画布后续批次实现） -->
            <div class="subsection">
              <label class="form-label">执行图 JSON（L3 画布将在后续批次提供可视化编辑）</label>
              <textarea v-model="cmd.graph_json" class="json-editor" rows="6" spellcheck="false" />
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
          <div class="form-field">
            <label class="form-label">模拟属性（JSON）</label>
            <textarea v-model="mockAttrRaw" class="json-editor" rows="3" spellcheck="false" />
          </div>
          <div class="form-field">
            <label class="form-label">模拟技能（JSON）</label>
            <textarea v-model="mockSkillRaw" class="json-editor" rows="3" spellcheck="false" />
          </div>
          <div class="form-field">
            <label class="form-label">模拟资源（JSON）</label>
            <textarea v-model="mockResourceRaw" class="json-editor" rows="3" spellcheck="false" />
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
.l3-canvas-container { flex: 1; overflow: hidden; min-height: 0; }
.versions-container { flex: 1; overflow: auto; min-height: 0; }

/* 状态机按钮 */
.status-badge { font-size: 11px; padding: 3px 8px; border-radius: 10px; font-weight: 600; }
.status-badge[data-status="draft"] { background: color-mix(in srgb, #888 20%, transparent); color: #aaa; }
.status-badge[data-status="published"] { background: color-mix(in srgb, #27ae60 20%, transparent); color: #2ecc71; }
.status-badge[data-status="deprecated"] { background: color-mix(in srgb, #e74c3c 20%, transparent); color: #e74c3c; }
.action-btn--submit { background: #7b68ee; color: #fff; border: none; padding: 5px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; }
.action-btn--submit:hover { opacity: 0.85; }
.action-btn--deprecate { background: none; border: 1px solid #e74c3c; color: #e74c3c; padding: 5px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; }
.action-btn--deprecate:hover { background: color-mix(in srgb, #e74c3c 10%, transparent); }
.editor-body-wrap { max-width: 880px; }
.mode-tabs { display: flex; gap: 2px; background: var(--surface-base, #f0f0f0); border-radius: 6px; padding: 2px; }
.mode-tab { padding: 4px 14px; border: none; background: none; border-radius: 4px; cursor: pointer; font-size: 13px; color: var(--text-secondary); transition: background 0.12s, color 0.12s; }
.mode-tab.active { background: var(--surface-card); color: var(--text-primary); font-weight: 600; }
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
</style>
