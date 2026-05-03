<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElCheckbox, ElCheckboxGroup, ElMessage } from 'element-plus';
import SvgIcon from '../components/SvgIcon.vue';
import { useAuthStore } from '../stores/auth-store';
import { api, getToken } from '../utils/api';

type Perspective = 'my' | 'full' | 'scene';
type SortStrategy = 'strict' | 'scene_first' | 'main_interleave';
type ExportFormat = 'pdf' | 'md' | 'txt' | 'ilf';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const campaignId = route.params.id as string;

const currentStep = ref(1);
const perspective = ref<Perspective>('my');

// ─ 会员门槛 ────────────────────────────────────────────────────────────────
const needsUpgrade = ref(false);
const requiredTier = ref<'pro' | 'creator' | null>(null);
const sortStrategy = ref<SortStrategy>('strict');
const exportFormat = ref<ExportFormat>('md');
const includeOoc = ref(true);
const includeSystem = ref(true);
const includeDiceDetails = ref(true);
const simulateUserId = ref('');
const selectedSceneIds = ref<string[]>([]);
const allScenesSelected = ref(true);
const isGm = ref(false);

const scenes = ref<Array<{ id: string; name: string }>>([]);
const isLoadingScenes = ref(false);
const previewLoading = ref(false);
const previewText = ref('');
const previewFileName = ref('');
const previewTotalMessages = ref(0);
const previewReady = ref(false);
const downloadLoading = ref(false);

const steps = [
  { id: 1, label: '选择视角' },
  { id: 2, label: '配置选项' },
  { id: 3, label: '生成预览' },
  { id: 4, label: '下载导出' },
] as const;

const perspectiveOptions = [
  { value: 'my' as const, title: '我的故事', desc: '仅导出当前账号可见内容', icon: 'icon-npc' },
  { value: 'full' as const, title: '完整剧本', desc: 'GM 视角的全量日志', icon: 'icon-highlight' },
  { value: 'scene' as const, title: '场景剧本', desc: '按场景分章导出', icon: 'icon-grid' },
];

const formatOptions = [
  { value: 'pdf' as const, title: 'PDF', desc: '适合打印与归档', icon: 'icon-scroll' },
  { value: 'md' as const, title: 'Markdown', desc: '适合阅读与二次编辑', icon: 'icon-list' },
  { value: 'txt' as const, title: '纯文本', desc: '适合快速分享', icon: 'icon-settings' },
  { value: 'ilf' as const, title: 'ILF', desc: '结构化中间格式', icon: 'icon-history' },
];

const canUseFullPerspective = computed(() => isGm.value);
const needSceneSelection = computed(() => perspective.value === 'scene');
const hasSelectedScenes = computed(() => allScenesSelected.value || selectedSceneIds.value.length > 0);
const canPreview = computed(() => {
  if (perspective.value === 'full' && !canUseFullPerspective.value) return false;
  if (needSceneSelection.value && !hasSelectedScenes.value) return false;
  return true;
});
const previewLineCount = computed(() => previewText.value.split('\n').length);

watch(
  [perspective, sortStrategy, exportFormat, includeOoc, includeSystem, includeDiceDetails, simulateUserId, selectedSceneIds, allScenesSelected],
  () => {
    previewReady.value = false;
  },
);

watch(perspective, (value) => {
  if (value !== 'scene') allScenesSelected.value = true;
  if (value === 'full' && !canUseFullPerspective.value) perspective.value = 'my';
});

function handleSelectAll(val: string | number | boolean) {
  if (val) {
    selectedSceneIds.value = scenes.value.map((scene) => scene.id);
  } else {
    selectedSceneIds.value = [];
  }
}

function handleSceneChange() {
  allScenesSelected.value = selectedSceneIds.value.length === scenes.value.length;
}

function buildQuery(preview = false): string {
  const params = new URLSearchParams({
    perspective: perspective.value,
    sort: sortStrategy.value,
    format: exportFormat.value,
    include_ooc: String(includeOoc.value),
    include_system: String(includeSystem.value),
    include_dice_details: String(includeDiceDetails.value),
  });

  if (preview) params.set('preview', 'true');
  if (isGm.value && simulateUserId.value.trim()) params.set('simulate_user_id', simulateUserId.value.trim());
  if (!allScenesSelected.value && selectedSceneIds.value.length > 0) params.set('scenes', selectedSceneIds.value.join(','));
  return params.toString();
}

async function loadScenes() {
  isLoadingScenes.value = true;
  try {
    const campaign = await api.get<{ gm_user_id?: string }>(`/campaigns/${campaignId}`);
    isGm.value = campaign?.gm_user_id === authStore.userId;

    scenes.value = await api.get<{ id: string; name: string }[]>(`/campaigns/${campaignId}/scenes`);
    selectedSceneIds.value = scenes.value.map((scene) => scene.id);
    allScenesSelected.value = true;
  } catch {
    ElMessage.error('场景加载失败');
  } finally {
    isLoadingScenes.value = false;
  }
}

async function generatePreview() {
  if (!canPreview.value) {
    ElMessage.warning('请先完成当前导出配置');
    return;
  }

  previewLoading.value = true;
  needsUpgrade.value = false;
  try {
    const res = await fetch(`/api/logs/${campaignId}/export?${buildQuery(true)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.status === 403) {
      const error = await res.json().catch(() => ({})) as { required_tier?: string };
      requiredTier.value = (error.required_tier as 'pro' | 'creator') ?? 'pro';
      needsUpgrade.value = true;
      return;
    }
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error((error as any).error ?? '预览生成失败');
    }

    const data = await res.json() as {
      preview: string;
      total_messages: number;
      file_name: string;
    };
    previewText.value = data.preview;
    previewTotalMessages.value = data.total_messages;
    previewFileName.value = data.file_name;
    previewReady.value = true;
    currentStep.value = 4;
  } catch (error: any) {
    ElMessage.error(error?.message ?? '预览生成失败');
  } finally {
    previewLoading.value = false;
  }
}

async function downloadExport() {
  if (!previewReady.value) {
    ElMessage.warning('请先生成预览');
    return;
  }

  downloadLoading.value = true;
  needsUpgrade.value = false;
  try {
    const res = await fetch(`/api/logs/${campaignId}/export?${buildQuery(false)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.status === 403) {
      const error = await res.json().catch(() => ({})) as { required_tier?: string };
      requiredTier.value = (error.required_tier as 'pro' | 'creator') ?? 'pro';
      needsUpgrade.value = true;
      return;
    }
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error((error as any).error ?? '导出失败');
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const matched = disposition.match(/filename\*=UTF-8''([^;]+)/);
    const fileName = matched
      ? decodeURIComponent(matched[1])
      : (previewFileName.value || `campaign-${campaignId}.${exportFormat.value}`);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error: any) {
    ElMessage.error(error?.message ?? '导出失败');
  } finally {
    downloadLoading.value = false;
  }
}

function goToStep(step: number) {
  if (step === 4 && !previewReady.value) return;
  currentStep.value = step;
}

onMounted(() => {
  loadScenes();
});
</script>

<template>
  <div class="log-export-page">
    <div class="page-header">
      <button class="back-btn" @click="router.back()" aria-label="返回">
        <span class="back-icon">←</span>
      </button>
      <div>
        <h1 class="page-title">跑团日志导出</h1>
        <p class="page-subtitle">按视角、排序和格式生成导出文件</p>
      </div>
    </div>

    <div class="step-strip">
      <button
        v-for="step in steps"
        :key="step.id"
        class="step-pill"
        :class="{ active: currentStep === step.id, done: currentStep > step.id || (step.id === 4 && previewReady) }"
        @click="goToStep(step.id)"
      >
        <span class="step-index">{{ step.id }}</span>
        <span>{{ step.label }}</span>
      </button>
    </div>

    <div class="export-card">
      <!-- 付费升级提示 -->
      <div v-if="needsUpgrade" class="upgrade-banner">
        <div class="upgrade-icon">🔒</div>
        <div class="upgrade-text">
          <div class="upgrade-title">此功能需要 {{ requiredTier === 'creator' ? 'Creator' : 'Pro' }} 会员</div>
          <div class="upgrade-desc">日志导出是 Pro 及以上权益，升级会员后可导出完整跑团记录。</div>
        </div>
        <button class="upgrade-btn" @click="router.push('/settings/membership')">升级会员</button>
      </div>
      <section class="section" :class="{ muted: currentStep !== 1 }">
        <div class="section-head">
          <span class="section-step">Step 1</span>
          <h2 class="section-title">选择视角</h2>
        </div>
        <div class="option-grid">
          <label
            v-for="option in perspectiveOptions"
            :key="option.value"
            class="option-card"
            :class="{ active: perspective === option.value, disabled: option.value === 'full' && !canUseFullPerspective }"
          >
            <input v-model="perspective" type="radio" :value="option.value" :disabled="option.value === 'full' && !canUseFullPerspective" />
            <span class="option-icon"><SvgIcon :name="option.icon" :size="18" /></span>
            <div>
              <div class="option-title">{{ option.title }}</div>
              <div class="option-desc">{{ option.desc }}</div>
            </div>
          </label>
        </div>
        <button class="next-btn" @click="currentStep = 2">继续配置</button>
      </section>

      <section class="section" :class="{ muted: currentStep !== 2 }">
        <div class="section-head">
          <span class="section-step">Step 2</span>
          <h2 class="section-title">配置选项</h2>
        </div>

        <div class="field-block">
          <label class="field-label">排序策略</label>
          <select v-model="sortStrategy" class="field-input">
            <option value="strict">严格时序</option>
            <option value="scene_first">场景优先</option>
            <option value="main_interleave">主线优先穿插</option>
          </select>
        </div>

        <div class="toggle-grid">
          <label class="toggle-item"><input v-model="includeOoc" type="checkbox" />包含 OOC 消息</label>
          <label class="toggle-item"><input v-model="includeSystem" type="checkbox" />包含 system 消息</label>
          <label class="toggle-item"><input v-model="includeDiceDetails" type="checkbox" />包含骰子详情</label>
        </div>

        <div v-if="isGm && perspective === 'my'" class="field-block">
          <label class="field-label">GM 模拟玩家视角</label>
          <input v-model="simulateUserId" class="field-input" type="text" placeholder="输入玩家 user_id，留空则使用你自己的视角" />
        </div>

        <div v-if="needSceneSelection" class="field-block">
          <div class="field-label">选择场景</div>
          <div v-if="isLoadingScenes" class="helper-text">场景加载中...</div>
          <div v-else class="scene-picker">
            <label class="select-all-row">
              <ElCheckbox v-model="allScenesSelected" @change="handleSelectAll">全部场景</ElCheckbox>
            </label>
            <div v-if="!allScenesSelected" class="scene-list">
              <ElCheckboxGroup v-model="selectedSceneIds" @change="handleSceneChange">
                <label v-for="scene in scenes" :key="scene.id" class="scene-item">
                  <ElCheckbox :value="scene.id">{{ scene.name }}</ElCheckbox>
                </label>
              </ElCheckboxGroup>
            </div>
          </div>
        </div>

        <div class="field-block">
          <label class="field-label">导出格式</label>
          <div class="option-grid compact">
            <label v-for="option in formatOptions" :key="option.value" class="option-card" :class="{ active: exportFormat === option.value }">
              <input v-model="exportFormat" type="radio" :value="option.value" />
              <span class="option-icon"><SvgIcon :name="option.icon" :size="16" /></span>
              <div>
                <div class="option-title">{{ option.title }}</div>
                <div class="option-desc">{{ option.desc }}</div>
              </div>
            </label>
          </div>
        </div>

        <div class="action-row">
          <button class="ghost-btn" @click="currentStep = 1">返回上一步</button>
          <button class="next-btn" :disabled="!canPreview" @click="currentStep = 3">前往预览</button>
        </div>
      </section>

      <section class="section" :class="{ muted: currentStep !== 3 }">
        <div class="section-head">
          <span class="section-step">Step 3</span>
          <h2 class="section-title">生成预览</h2>
        </div>
        <div class="summary-card">
          <div>视角：{{ perspectiveOptions.find((item) => item.value === perspective)?.title }}</div>
          <div>排序：{{ sortStrategy }}</div>
          <div>格式：{{ exportFormat.toUpperCase() }}</div>
          <div v-if="needSceneSelection">场景数：{{ allScenesSelected ? scenes.length : selectedSceneIds.length }}</div>
        </div>
        <div class="action-row">
          <button class="ghost-btn" @click="currentStep = 2">返回配置</button>
          <button class="next-btn" :disabled="previewLoading || !canPreview" @click="generatePreview">
            {{ previewLoading ? '生成中...' : '生成前 50 条预览' }}
          </button>
        </div>
      </section>

      <section class="section" :class="{ muted: currentStep !== 4 }">
        <div class="section-head">
          <span class="section-step">Step 4</span>
          <h2 class="section-title">下载导出</h2>
        </div>
        <div v-if="previewReady" class="preview-card">
          <div class="preview-meta">
            <span>文件名：{{ previewFileName }}</span>
            <span>消息数：{{ previewTotalMessages }}</span>
            <span>前100行预览（共{{ previewLineCount }}行）</span>
          </div>
          <textarea class="preview-box" readonly :value="previewText" />
        </div>
        <div v-else class="helper-text">先完成预览后再下载。</div>
        <div class="action-row">
          <button class="ghost-btn" @click="currentStep = 3">返回预览</button>
          <button class="next-btn" :disabled="!previewReady || downloadLoading" @click="downloadExport">
            {{ downloadLoading ? '下载中...' : '下载导出文件' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.upgrade-banner {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  background: linear-gradient(135deg, #fff8e6 0%, #fff3d6 100%);
  border: 1px solid #f5d378;
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-4);
}
.upgrade-icon { font-size: 28px; flex-shrink: 0; }
.upgrade-text { flex: 1; }
.upgrade-title { font-size: var(--text-base); font-weight: 600; color: #7a4a00; margin-bottom: 2px; }
.upgrade-desc { font-size: var(--text-sm); color: #9a6f00; }
.upgrade-btn { flex-shrink: 0; padding: var(--space-2) var(--space-5); background: #f0a000; color: #fff; border: none; border-radius: var(--radius-md); font-size: var(--text-sm); font-weight: 600; cursor: pointer; transition: background 0.15s; }
.upgrade-btn:hover { background: #d48a00; }

.log-export-page {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.page-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.back-btn {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--surface-card);
  cursor: pointer;
  color: var(--text-secondary);
}

.page-title {
  margin: 0;
  font-size: 28px;
}

.page-subtitle {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.step-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
}

.step-pill {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--surface-card);
  color: var(--text-secondary);
  cursor: pointer;
}

.step-pill.active,
.step-pill.done {
  border-color: var(--color-accent);
  color: var(--text-primary);
}

.step-index {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface-hover);
  font-size: 12px;
}

.export-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section {
  border: 1px solid var(--border-default);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.85), rgba(247,244,238,0.9));
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section.muted {
  opacity: 0.8;
}

.section-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.section-step {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.section-title {
  margin: 0;
  font-size: var(--text-lg);
}

.option-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.option-grid.compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.option-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: rgba(255,255,255,0.82);
  cursor: pointer;
}

.option-card input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.option-card.active {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 18%, transparent);
}

.option-card.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.option-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-hover);
  color: var(--color-accent);
}

.option-title {
  font-size: var(--text-sm);
  font-weight: 600;
}

.option-desc {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-top: 3px;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.field-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-card);
  padding: 10px 12px;
  font-size: var(--text-sm);
}

.toggle-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: rgba(255,255,255,0.7);
  font-size: var(--text-sm);
}

.scene-picker {
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: var(--space-3);
  background: rgba(255,255,255,0.72);
}

.scene-list {
  margin-top: var(--space-2);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.scene-item {
  padding: var(--space-2);
  border: 1px solid var(--border-default);
  border-radius: 10px;
}

.summary-card,
.preview-card {
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: rgba(255,255,255,0.82);
  padding: var(--space-3);
}

.summary-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}

.preview-box {
  width: 100%;
  min-height: 360px;
  resize: vertical;
  box-sizing: border-box;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: #111318;
  color: #f3f1ea;
  padding: var(--space-3);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}

.action-row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}

.next-btn,
.ghost-btn {
  padding: 10px 16px;
  border-radius: 999px;
  font-size: var(--text-sm);
  cursor: pointer;
}

.next-btn {
  border: none;
  background: linear-gradient(135deg, #1f6f63, #2a8a7a);
  color: #fff;
}

.ghost-btn {
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-primary);
}

.next-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.helper-text {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .log-export-page {
    padding: var(--space-3);
  }

  .step-strip,
  .option-grid,
  .option-grid.compact,
  .toggle-grid,
  .scene-list,
  .summary-card {
    grid-template-columns: 1fr;
  }

  .action-row {
    flex-direction: column;
  }
}
</style>
