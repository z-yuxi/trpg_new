<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import TButton from '../components/base/TButton.vue';
import TInput from '../components/base/TInput.vue';
import TTag from '../components/base/TTag.vue';
import AiCharacterImportPanel from '../components/ai/AiCharacterImportPanel.vue';
import type { ImportCharacterResult } from '../api/ai';
import { getToken } from '../utils/api';
import { updateCharacter, createCharacter, getCharacter } from '../api/characters';
import { listRulesets } from '../api/rulesets';
import { calcDerived, COC7_DEFAULT_DERIVED } from '@trpg/shared';

/* ========== 类型 ========== */
interface AttributeDef {
  label?: string;
  roll_formula?: string;
  min?: number;
  max?: number;
}
interface OccupationDef {
  id: string;
  name: string;
  skill_points_formula?: string;
  skills?: string[];
}
interface SkillDef {
  label?: string;
  base?: number;
}
interface CardSchema {
  attributes?: Record<string, AttributeDef>;
  occupations?: OccupationDef[];
  skills?: Record<string, SkillDef>;
  derived_formulas?: Record<string, { formula: string; label?: string; min?: number; max?: number } | string>;
}
interface RulesetOption {
  id: string;
  name: string;
  character_card_schema?: unknown;
}

/* ========== 路由 & Store ========== */
const route = useRoute();
const router = useRouter();
const characterId = route.params.id as string | undefined;
const isEditing = !!characterId;

/* ========== 步骤 ========== */
const TOTAL_STEPS = 6;
const step = ref(1);
const STEP_LABELS = ['选择规则包', '选择职业', '生成属性', '分配技能点', '填写背景', '预览&保存'];

/* ========== 数据 ========== */
const rulesets = ref<RulesetOption[]>([]);
const schema = ref<CardSchema>({});
const skillPoints = ref(0);

const form = ref({
  name: '',
  ruleset_id: '',
  occupation_id: '',
  avatar_url: '',
  attributes: {} as Record<string, number>,
  skills: {} as Record<string, number>,
  appearance: '',
  background: '',
  beliefs: '',
  important_person: '',
});

const saving = ref(false);
const saveError = ref('');
const savedCharacterCode = ref('');
const avatarUploading = ref(false);
const avatarInput = ref<HTMLInputElement | null>(null);

// 角色卡文件上传
const characterFileInput = ref<HTMLInputElement | null>(null);
const fileUploadError = ref('');
const preloadedCharacterText = ref('');

// AI 导入面板
const aiImportVisible = ref(false);
const selectedRulesetName = computed(() =>
  rulesets.value.find(r => r.id === form.value.ruleset_id)?.name ?? undefined,
);

function handleAiImportConfirm(result: ImportCharacterResult) {
  // 将 AI 识别结果填入表单
  if (result.name) form.value.name = result.name;
  if (Object.keys(result.attributes).length) form.value.attributes = { ...result.attributes };
  if (Object.keys(result.skills).length) form.value.skills = { ...result.skills };
  if (result.background) form.value.background = result.background;
  aiImportVisible.value = false;
  // 直接跳到预览步骤
  step.value = 6;
}

/* ========== 计算属性 ========== */
const occupations = computed<OccupationDef[]>(() => (schema.value.occupations ?? []));
const hasSchema = computed(() => Object.keys(schema.value.attributes ?? {}).length > 0);
const selectedOccupation = computed(() =>
  occupations.value.find(o => o.id === form.value.occupation_id) ?? null
);
const allocatedPoints = computed(() =>
  Object.values(form.value.skills).reduce((a, b) => a + b, 0)
);
const remainingPoints = computed(() => skillPoints.value - allocatedPoints.value);

// 派生值实时计算
const derivedValues = computed(() => {
  const attrs = form.value.attributes;
  if (Object.keys(attrs).length === 0) return {};
  const formulas = (schema.value.derived_formulas ?? null) as Record<string, { formula: string; label?: string; min?: number; max?: number } | string> | null;
  if (formulas && Object.keys(formulas).length > 0) {
    return calcDerived(attrs, formulas);
  }
  // 回退：若规则集有 STR/CON/SIZ/POW 则用 COC7 默认公式
  if ('CON' in attrs && 'SIZ' in attrs && 'POW' in attrs) {
    return calcDerived(attrs, COC7_DEFAULT_DERIVED);
  }
  return {};
});

const derivedLabels = computed(() => {
  const formulas = schema.value.derived_formulas ?? COC7_DEFAULT_DERIVED;
  const result: Record<string, string> = {};
  for (const [key, def] of Object.entries(formulas)) {
    result[key] = typeof def === 'string' ? key : (def.label ?? key);
  }
  return result;
});

/* ========== 工具函数 ========== */
function rollFormula(formula: string): number {
  const m = formula.trim().match(/^(\d+)d(\d+)(?:\*(\d+))?(?:[+](\d+))?$/i);
  if (!m) return 50;
  let total = 0;
  const count = parseInt(m[1]);
  const sides = parseInt(m[2]);
  for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
  if (m[3]) total *= parseInt(m[3]);
  if (m[4]) total += parseInt(m[4]);
  return Math.min(Math.max(total, 1), 100);
}

function calcSkillPoints(formula: string, attrs: Record<string, number>): number {
  let expr = formula;
  for (const [k, v] of Object.entries(attrs)) expr = expr.replace(new RegExp(k, 'g'), String(v));
  if (/^[\d\s+\-*/.()]+$/.test(expr)) {
    try { return Math.floor(Function('"use strict"; return (' + expr + ')')() as number); } catch { /* ignore */ }
  }
  return 100;
}

function rollAllAttributes() {
  const attrDefs = schema.value.attributes ?? {};
  const result: Record<string, number> = {};
  for (const [key, def] of Object.entries(attrDefs)) {
    result[key] = def.roll_formula ? rollFormula(def.roll_formula) : 50;
  }
  if (Object.keys(result).length === 0) {
    for (const key of ['STR', 'DEX', 'POW', 'CON', 'APP', 'SIZ', 'INT', 'EDU']) {
      result[key] = rollFormula('3d6*5');
    }
  }
  form.value.attributes = result;
}

function initSkills() {
  const occ = selectedOccupation.value;
  const skillDefs = schema.value.skills ?? {};
  const formula = occ?.skill_points_formula ?? 'EDU*4';
  skillPoints.value = calcSkillPoints(formula, form.value.attributes);
  const skills: Record<string, number> = {};
  for (const key of Object.keys(skillDefs)) {
    skills[key] = skillDefs[key].base ?? 5;
  }
  if (occ?.skills) {
    for (const sk of occ.skills) if (!(sk in skills)) skills[sk] = 5;
  }
  if (Object.keys(skills).length === 0) {
    for (const sk of ['聆听', '图书馆', '侦察', '躲藏', '格斗', '急救', '说服', '心理学']) skills[sk] = 5;
  }
  form.value.skills = skills;
}

/* ========== 加载规则集 ========== */
onMounted(async () => {
  try {
    const allRulesets = await listRulesets({ status: 'published' }).catch(() => ({ data: [] }));
    rulesets.value = (allRulesets.data ?? []) as { id: string; name: string }[];
  } catch { /* ignore */ }

  if (isEditing && characterId) {
    try {
      const data = await getCharacter(characterId) as unknown as Record<string, unknown>;
      form.value.name = (data.name as string) ?? '';
      form.value.ruleset_id = (data.ruleset_id as string) ?? '';
      form.value.occupation_id = (data.occupation_id as string) ?? '';
      form.value.avatar_url = (data.avatar_url as string) ?? '';
      form.value.attributes = (data.attributes as Record<string, number>) ?? {};
      form.value.skills = (data.skills as Record<string, number>) ?? {};
      form.value.background = (data.background as string) ?? '';
        // 加载 schema 以支持派生值计算和步骤预览
        const rs = rulesets.value.find(r => r.id === form.value.ruleset_id);
        if (rs?.character_card_schema && typeof rs.character_card_schema === 'object') {
          schema.value = rs.character_card_schema as CardSchema;
        }
        // 计算技能点（用于 Step 4 显示）
        const occ = (schema.value.occupations ?? []).find(o => o.id === form.value.occupation_id);
        const formula = occ?.skill_points_formula ?? 'EDU*4';
        skillPoints.value = calcSkillPoints(formula, form.value.attributes);
    } catch { /* ignore */ }
    step.value = 6;
  }
});

/* ========== 选择规则集 ========== */
async function onRulesetChange() {
  schema.value = {};
  const rs = rulesets.value.find(r => r.id === form.value.ruleset_id);
  if (!rs) return;
  if (rs.character_card_schema && typeof rs.character_card_schema === 'object') {
    schema.value = rs.character_card_schema as CardSchema;
  }
}

async function uploadAvatar(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error ?? '头像上传失败');
  }

  const data = await res.json();
  return data.url;
}

function openAvatarPicker() {
  avatarInput.value?.click();
}

async function onAvatarChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    saveError.value = '头像大小不能超过 5MB';
    target.value = '';
    return;
  }

  avatarUploading.value = true;
  saveError.value = '';
  try {
    form.value.avatar_url = await uploadAvatar(file);
  } catch (error: any) {
    saveError.value = error?.message || '头像上传失败';
  } finally {
    avatarUploading.value = false;
    target.value = '';
  }
}

/* ========== 角色卡文件上传 ========== */
function openCharacterFilePicker() {
  characterFileInput.value?.click();
}

async function onCharacterFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  fileUploadError.value = '';

  // 限制文件大小（1MB）
  if (file.size > 1 * 1024 * 1024) {
    fileUploadError.value = '角色卡文件大小不能超过 1MB';
    target.value = '';
    return;
  }

  // 允许的文件类型：.txt, .json, .cson
  const allowedTypes = ['text/plain', 'application/json'];
  const allowedExtensions = ['.txt', '.json', '.cson'];
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  
  if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(ext)) {
    fileUploadError.value = '仅支持 .txt, .json, .cson 文件';
    target.value = '';
    return;
  }

  try {
    const text = await file.text();
    // 限制字符数（与 AiCharacterImportPanel 一致）
    if (text.length > 3000) {
      fileUploadError.value = '角色卡内容不能超过 3000 字符';
      target.value = '';
      return;
    }
    preloadedCharacterText.value = text;
    aiImportVisible.value = true;
  } catch (error: any) {
    fileUploadError.value = error?.message || '文件读取失败';
  } finally {
    target.value = '';
  }
}
/* ========== 步骤导航 ========== */
function nextStep() {
  if (step.value === 1) {
    if (!form.value.ruleset_id) return;
    step.value = occupations.value.length > 0 ? 2 : 3;
    if (step.value === 3) rollAllAttributes();
    return;
  }
  if (step.value === 2) {
    step.value = 3;
    rollAllAttributes();
    return;
  }
  if (step.value === 3) {
    initSkills();
    step.value = 4;
    return;
  }
  if (step.value < TOTAL_STEPS) step.value++;
}

function prevStep() {
  if (step.value === 3 && occupations.value.length === 0) {
    step.value = 1;
    return;
  }
  if (step.value > 1) step.value--;
}

/* ========== 保存 ========== */
async function save() {
  saveError.value = '';
  saving.value = true;
  try {
    const payload = {
      name: form.value.name || '未命名角色',
      ruleset_id: form.value.ruleset_id,
      occupation_id: form.value.occupation_id || null,
      avatar_url: form.value.avatar_url || '',
      background: [
        form.value.appearance ? `外貌：${form.value.appearance}` : '',
        form.value.background ? `背景：${form.value.background}` : '',
        form.value.beliefs ? `信仰：${form.value.beliefs}` : '',
        form.value.important_person ? `重要之人：${form.value.important_person}` : '',
      ].filter(Boolean).join('\n\n'),
      attributes: form.value.attributes,
      skills: form.value.skills,
    };
    if (isEditing) {
      await updateCharacter(characterId, payload as any);
      router.push('/tuantu/characters');
    } else {
      const saved = await createCharacter({ ruleset_id: payload.ruleset_id, name: payload.name }) as any;
      savedCharacterCode.value = saved.character_code ?? '';
      step.value = 6;
    }
  } catch (e: any) {
    saveError.value = e.message || '网络错误';
  } finally {
    saving.value = false;
  }
}

onBeforeRouteLeave(() => {
  if (step.value > 1 && step.value < TOTAL_STEPS) {
    return window.confirm('创建流程未完成，确定离开？') || false;
  }
  return true;
});
</script>

<template>
  <div class="char-editor">
    <!-- 顶部进度条 -->
    <div class="progress-bar">
      <div
        v-for="(label, i) in STEP_LABELS"
        :key="i"
        class="progress-step"
        :class="{
          active: step === i + 1,
          done: step > i + 1,
          skipped: i === 1 && occupations.length === 0 && step > 1,
        }"
      >
        <div class="step-dot">
          <span v-if="step > i + 1">✓</span>
          <span v-else>{{ i + 1 }}</span>
        </div>
        <span class="step-label">{{ label }}</span>
        <div v-if="i < STEP_LABELS.length - 1" class="step-connector" :class="{ filled: step > i + 1 }" />
      </div>
    </div>

    <!-- ========== STEP 1：选择规则包 ========== -->
    <div v-if="step === 1" class="step-panel">
      <div class="step1-header">
        <h2 class="step-title">选择规则包</h2>
        <div class="step1-actions">
          <button class="ai-import-trigger" title="用 AI 自动识别角色卡文本" @click="aiImportVisible = true">
            ✨ AI 导入
          </button>
          <button class="file-upload-trigger" title="上传角色卡文件" @click="openCharacterFilePicker">
            📤 导入文件
          </button>
        </div>
      </div>
      <p v-if="fileUploadError" class="error-hint">{{ fileUploadError }}</p>
      <input
        ref="characterFileInput"
        type="file"
        accept=".txt,.json,.cson"
        style="display: none"
        @change="onCharacterFileChange"
      />
      <div class="ruleset-grid">
        <div
          v-for="rs in rulesets"
          :key="rs.id"
          class="ruleset-card"
          :class="{ selected: form.ruleset_id === rs.id }"
          @click="form.ruleset_id = rs.id; onRulesetChange()"
        >
          <div class="ruleset-name">{{ rs.name }}</div>
          <TTag v-if="form.ruleset_id === rs.id" color="success" size="sm">已选择</TTag>
        </div>
      </div>
      <p v-if="!hasSchema && form.ruleset_id" class="hint-text">
        此规则包暂无角色卡 Schema，将使用通用创建模板
      </p>
    </div>

    <!-- ========== STEP 2：选择职业 ========== -->
    <div v-if="step === 2" class="step-panel">
      <h2 class="step-title">选择职业</h2>
      <div v-if="occupations.length === 0" class="empty-hint">此规则包无预设职业，请点击下一步继续</div>
      <div v-else class="occupation-grid">
        <div
          v-for="occ in occupations"
          :key="occ.id"
          class="occ-card"
          :class="{ selected: form.occupation_id === occ.id }"
          @click="form.occupation_id = occ.id"
        >
          <div class="occ-name">{{ occ.name }}</div>
          <div v-if="occ.skill_points_formula" class="occ-sp">技能点：{{ occ.skill_points_formula }}</div>
          <div v-if="occ.skills?.length" class="occ-skills">
            职业技能：{{ occ.skills.slice(0, 5).join('、') }}{{ (occ.skills.length > 5) ? '...' : '' }}
          </div>
        </div>
      </div>
    </div>

    <!-- ========== STEP 3：生成属性 ========== -->
    <div v-if="step === 3" class="step-panel">
      <h2 class="step-title">生成属性</h2>
      <div class="attr-hint">
        <span>点击"重新投骰"可重新生成所有属性</span>
        <TButton type="secondary" size="sm" @click="rollAllAttributes">重新投骰</TButton>
      </div>
      <div class="attrs-grid">
        <div v-for="(val, key) in form.attributes" :key="key" class="attr-row">
          <span class="attr-key">{{ key }}</span>
          <input
            v-model.number="(form.attributes as Record<string, number>)[key as string]"
            type="number" class="attr-input" :min="1" :max="100"
          />
          <div class="attr-bar">
            <div class="attr-fill" :style="{ width: `${Math.min(val, 100)}%` }" />
          </div>
          <span class="attr-val">{{ val }}</span>
        </div>
      </div>

      <!-- 派生属性展示 -->
      <div v-if="Object.keys(derivedValues).length > 0" class="derived-panel">
        <div class="derived-title">派生属性</div>
        <div class="derived-grid">
          <div v-for="(val, key) in derivedValues" :key="key" class="derived-item">
            <span class="derived-label">{{ derivedLabels[key] ?? key }}</span>
            <span class="derived-val">{{ val }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== STEP 4：分配技能点 ========== -->
    <div v-if="step === 4" class="step-panel">
      <h2 class="step-title">分配技能点</h2>
      <div class="sp-bar">
        <span>可用技能点：</span>
        <strong :class="{ danger: remainingPoints < 0 }">{{ remainingPoints }}</strong>
        <span>/ {{ skillPoints }}</span>
        <span v-if="selectedOccupation" class="occ-label">（{{ selectedOccupation.name }}）</span>
      </div>
      <div class="skills-grid">
        <div v-for="(val, key) in form.skills" :key="key" class="skill-row">
          <span class="skill-key">{{ key }}</span>
          <input
            v-model.number="(form.skills as Record<string, number>)[key as string]"
            type="number" class="skill-input" :min="0" :max="99"
          />
        </div>
      </div>
    </div>

    <!-- ========== STEP 5：填写背景 ========== -->
    <div v-if="step === 5" class="step-panel">
      <h2 class="step-title">角色背景</h2>

      <div class="field-group">
        <label class="field-label">角色姓名 <span class="required">*</span></label>
        <TInput v-model="form.name" placeholder="请输入角色姓名" />
      </div>

      <div class="field-group">
        <label class="field-label">外貌描述</label>
        <textarea v-model="form.appearance" class="field-textarea" rows="3" placeholder="描述角色的外貌特征..." />
      </div>

      <div class="field-group">
        <label class="field-label">背景故事</label>
        <textarea v-model="form.background" class="field-textarea" rows="4" placeholder="角色的成长经历、重要事件..." />
      </div>

      <div class="two-col">
        <div class="field-group">
          <label class="field-label">信仰/意识形态</label>
          <textarea v-model="form.beliefs" class="field-textarea" rows="3" placeholder="角色所信奉的价值观或宗教..." />
        </div>
        <div class="field-group">
          <label class="field-label">重要之人</label>
          <textarea v-model="form.important_person" class="field-textarea" rows="3" placeholder="对角色最重要的人或羁绊..." />
        </div>
      </div>
    </div>

    <!-- ========== STEP 6：预览&保存 ========== -->
    <div v-if="step === 6" class="step-panel">
      <h2 class="step-title">角色预览</h2>
      <div class="preview-card">
        <div class="preview-header">
          <div class="preview-avatar uploadable" @click="openAvatarPicker">
            <img v-if="form.avatar_url" :src="form.avatar_url" class="preview-avatar-image" />
            <span v-else>{{ (form.name || '?')[0] }}</span>
          </div>
          <div>
            <div class="preview-name">{{ form.name || '未命名' }}</div>
            <div class="preview-meta">
              <TTag size="sm" color="default">{{ rulesets.find(r => r.id === form.ruleset_id)?.name ?? form.ruleset_id }}</TTag>
              <TTag v-if="selectedOccupation" size="sm" color="primary">{{ selectedOccupation.name }}</TTag>
            </div>
            <button class="avatar-upload-btn" type="button" @click="openAvatarPicker">
              {{ avatarUploading ? '上传中...' : '上传头像' }}
            </button>
            <input ref="avatarInput" type="file" class="hidden-avatar-input" accept="image/jpeg,image/png,image/webp,image/gif" @change="onAvatarChange" />
          </div>
        </div>

        <!-- 属性 -->
        <div class="preview-section">
          <div class="preview-section-title">基础属性</div>
          <div class="preview-attrs">
            <div v-for="(val, key) in form.attributes" :key="key" class="preview-attr">
              <span class="attr-key">{{ key }}</span>
              <span class="attr-num">{{ val }}</span>
            </div>
          </div>
        </div>

        <!-- 背景 -->
        <div v-if="form.appearance || form.background" class="preview-section">
          <div class="preview-section-title">背景</div>
          <p v-if="form.appearance" class="preview-text">
            <strong>外貌：</strong>{{ form.appearance }}
          </p>
          <p v-if="form.background" class="preview-text">
            <strong>故事：</strong>{{ form.background }}
          </p>
        </div>
      </div>

      <div v-if="saveError" class="save-error">{{ saveError }}</div>

      <!-- 保存成功后显示 character_code -->
      <div v-if="savedCharacterCode" class="saved-success">
        <div class="saved-code-label">角色卡已创建成功</div>
        <div class="saved-code-row">
          <span class="code-tag">#{{ savedCharacterCode }}</span>
          <span class="code-hint">这是不可更改的公开分享码，其他玩家可用此码导入你的角色卡</span>
        </div>
        <TButton type="primary" size="sm" @click="router.push('/tuantu/characters')">  前往角色列表</TButton>
      </div>
    </div>

    <!-- 底部导航 -->
    <div class="step-nav">
      <TButton v-if="step > 1 && !savedCharacterCode" type="secondary" @click="prevStep">上一步</TButton>
      <div style="flex:1" />
      <TButton v-if="step < TOTAL_STEPS" type="primary" :disabled="step === 1 && !form.ruleset_id" @click="nextStep">
        下一步
      </TButton>
      <TButton v-else-if="!savedCharacterCode" type="primary" :loading="saving" @click="save">
        确认保存
      </TButton>
    </div>

    <!-- AI 角色卡导入浮层 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="aiImportVisible" class="ai-import-overlay" @click.self="aiImportVisible = false">
          <AiCharacterImportPanel
            :ruleset-id="form.ruleset_id || undefined"
            :ruleset-name="selectedRulesetName"
            :initial-text="preloadedCharacterText"
            @close="aiImportVisible = false; preloadedCharacterText = ''"
            @confirm="handleAiImportConfirm"
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.char-editor {
  max-width: 860px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* ===== 进度条 ===== */
.progress-bar {
  display: flex;
  align-items: center;
  gap: 0;
  overflow-x: auto;
  padding-bottom: var(--space-2);
}

.progress-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  position: relative;
  flex: 1;
  min-width: 64px;
}

.step-dot {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  border: 2px solid var(--border-default);
  background: var(--surface-card);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-muted);
  transition: all var(--transition-fast);
  position: relative;
  z-index: 1;
}

.progress-step.active .step-dot {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--btn-primary-text, #fff);
}

.progress-step.done .step-dot {
  border-color: var(--color-success, #6B8E6B);
  background: var(--color-success, #6B8E6B);
  color: #fff;
}

.progress-step.skipped .step-dot { opacity: 0.3; }

.step-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-align: center;
  white-space: nowrap;
}
.progress-step.active .step-label { color: var(--text-primary); font-weight: var(--font-medium); }

.step-connector {
  position: absolute;
  top: 14px;
  left: calc(50% + 14px);
  right: calc(-50% + 14px);
  height: 2px;
  background: var(--border-default);
  z-index: 0;
}
.step-connector.filled { background: var(--color-success, #6B8E6B); }

/* ===== 步骤面板 ===== */
.step-panel {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.step-title {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
}

/* ===== Step 1: 规则集网格 ===== */
.step1-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.step1-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.ai-import-trigger,
.file-upload-trigger {
  background: linear-gradient(135deg, #7c6af7, #a78bfa);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  padding: 6px 14px;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  white-space: nowrap;
  transition: opacity var(--transition-fast);
}
.ai-import-trigger:hover,
.file-upload-trigger:hover { opacity: 0.88; }

.ruleset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-3);
}

.ruleset-card {
  border: 2px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.ruleset-card:hover { border-color: var(--border-hover); }
.ruleset-card.selected { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); }
.ruleset-name { font-weight: var(--font-semibold); color: var(--text-primary); }

.hint-text { font-size: var(--text-sm); color: var(--text-muted); font-style: italic; }
.error-hint { font-size: var(--text-sm); color: #dc2626; margin: var(--space-2) 0; }

/* ===== Step 2: 职业 ===== */
.occupation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
}
.occ-card {
  border: 2px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  transition: border-color var(--transition-fast);
}
.occ-card:hover { border-color: var(--border-hover); }
.occ-card.selected { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); }
.occ-name { font-weight: var(--font-semibold); color: var(--text-primary); }
.occ-sp { font-size: var(--text-xs); color: var(--text-secondary); }
.occ-skills { font-size: var(--text-xs); color: var(--text-muted); }
.empty-hint { color: var(--text-muted); font-size: var(--text-sm); }

/* ===== Step 3: 属性 ===== */
.attr-hint { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.attrs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-2); }
.attr-row { display: flex; align-items: center; gap: var(--space-2); }
.attr-key { width: 44px; font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--text-primary); font-family: monospace; }
.attr-input { width: 56px; padding: 4px 6px; border: 1px solid var(--border-default); border-radius: var(--radius-md); text-align: center; font-size: var(--text-sm); background: var(--surface-card); color: var(--text-body); }
.attr-bar { flex: 1; height: 6px; background: var(--border-default); border-radius: var(--radius-full); overflow: hidden; }
.attr-fill { height: 100%; background: var(--color-primary); border-radius: var(--radius-full); transition: width var(--transition-normal); }
.attr-val { width: 28px; text-align: right; font-size: var(--text-xs); color: var(--text-muted); }

/* ===== Step 4: 技能点 ===== */
.sp-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--surface-hover);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.sp-bar strong { font-size: var(--text-lg); color: var(--text-primary); }
.sp-bar strong.danger { color: var(--color-danger, #B85450); }
.occ-label { color: var(--text-muted); }
.skills-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-2); }
.skill-row { display: flex; align-items: center; gap: var(--space-2); }
.skill-key { flex: 1; font-size: var(--text-sm); color: var(--text-body); }
.skill-input { width: 64px; padding: 4px 8px; border: 1px solid var(--border-default); border-radius: var(--radius-md); text-align: center; font-size: var(--text-sm); background: var(--surface-card); color: var(--text-body); }

/* ===== Step 5: 背景 ===== */
.field-group { display: flex; flex-direction: column; gap: var(--space-1); }
.field-label { font-size: var(--text-sm); font-weight: var(--font-medium); color: var(--text-secondary); }
.required { color: var(--color-danger, #B85450); }
.field-textarea {
  width: 100%;
  padding: var(--space-3);
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-body);
  font-size: var(--text-sm);
  resize: vertical;
  outline: none;
  font-family: inherit;
  line-height: var(--leading-relaxed);
  transition: border-color var(--transition-fast);
  box-sizing: border-box;
}
.field-textarea:focus { border-color: var(--color-primary); }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
@media (max-width: 640px) { .two-col { grid-template-columns: 1fr; } }

/* ===== Step 6: 预览 ===== */
.preview-card {
  background: var(--surface-hover);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.preview-header { display: flex; align-items: center; gap: var(--space-4); }
.preview-avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--btn-primary-text, #fff);
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.preview-avatar.uploadable { cursor: pointer; }
.preview-avatar-image { width: 100%; height: 100%; object-fit: cover; }
.preview-name { font-size: var(--text-xl); font-weight: var(--font-bold); color: var(--text-primary); }
.preview-meta { display: flex; gap: var(--space-2); margin-top: var(--space-1); }
.avatar-upload-btn {
  margin-top: var(--space-2);
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  border-radius: var(--radius-md);
  padding: 6px 12px;
  cursor: pointer;
}
.hidden-avatar-input { display: none; }
.preview-section { display: flex; flex-direction: column; gap: var(--space-2); }
.preview-section-title { font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--text-secondary); border-bottom: 1px solid var(--border-default); padding-bottom: var(--space-1); }
.preview-attrs { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: var(--space-2); }
.preview-attr { display: flex; justify-content: space-between; padding: var(--space-1) var(--space-2); background: var(--surface-card); border-radius: var(--radius-md); }
.attr-key { font-size: var(--text-xs); color: var(--text-secondary); }
.attr-num { font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--text-primary); }
.preview-text { font-size: var(--text-sm); color: var(--text-body); line-height: var(--leading-relaxed); }

.save-error { color: var(--color-danger, #B85450); font-size: var(--text-sm); }

/* ===== 派生属性 ===== */
.derived-panel {
  background: var(--surface-hover);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.derived-title { font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--text-secondary); }
.derived-grid { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.derived-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 56px;
  padding: var(--space-2) var(--space-3);
  background: var(--surface-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
}
.derived-label { font-size: var(--text-xs); color: var(--text-muted); }
.derived-val { font-size: var(--text-lg); font-weight: var(--font-bold); color: var(--color-primary); }

/* ===== 保存成功 character_code ===== */
.saved-success {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  background: color-mix(in srgb, var(--color-success, #6B8E6B) 8%, transparent);
  border: 1px solid var(--color-success, #6B8E6B);
  border-radius: var(--radius-lg);
}
.saved-code-label { font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--color-success, #6B8E6B); }
.saved-code-row { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
.code-tag {
  font-family: monospace;
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  letter-spacing: 0.1em;
  color: var(--text-primary);
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  padding: 2px 10px;
  border-radius: var(--radius-md);
}
.code-hint { font-size: var(--text-xs); color: var(--text-muted); }

/* ===== 底部导航 ===== */
.step-nav {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
</style>
