<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElCheckbox } from 'element-plus';
import SvgIcon from '../components/SvgIcon.vue';
import { useAuthStore } from '../stores/auth-store';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const campaignId = route.params.id as string;

// 配置选项
const format = ref<'json' | 'markdown' | 'text'>('markdown');
const mode = ref<'player' | 'full'>('player');
const sortStrategy = ref<'chronological' | 'scene' | 'interleave' | 'custom'>('chronological');
const simulateUserId = ref('');
const selectedSceneIds = ref<string[]>([]);
const allScenesSelected = ref(true);
const isGm = ref(false);

// 场景列表
const scenes = ref<Array<{ id: string; name: string }>>([]);
const isLoadingScenes = ref(false);

// 导出结果
const exportResult = ref('');
const isExporting = ref(false);
const hasResult = ref(false);

// 全选/取消全选
const handleSelectAll = (val: boolean) => {
  if (val) {
    selectedSceneIds.value = scenes.value.map((s) => s.id);
  } else {
    selectedSceneIds.value = [];
  }
};

const handleSceneChange = () => {
  allScenesSelected.value = selectedSceneIds.value.length === scenes.value.length;
};

const resultLines = computed(() => exportResult.value.split('\n').length);

async function loadScenes() {
  isLoadingScenes.value = true;
  try {
    const campaignRes = await fetch(`/api/campaigns/${campaignId}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (campaignRes.ok) {
      const campaign = await campaignRes.json();
      isGm.value = campaign?.gm_user_id === authStore.userId;
    }

    const res = await fetch(`/api/campaigns/${campaignId}/scenes`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (res.ok) {
      const data = await res.json();
      scenes.value = data ?? [];
      selectedSceneIds.value = scenes.value.map((s) => s.id);
    }
  } catch {
    // 忽略，可能没有场景 API
  } finally {
    isLoadingScenes.value = false;
  }
}

async function handleExport() {
  isExporting.value = true;
  hasResult.value = false;
  exportResult.value = '';

  const body: Record<string, unknown> = {
    campaign_id: campaignId,
    format: format.value,
    mode: mode.value,
    sort_strategy: sortStrategy.value,
  };

  if (isGm.value && simulateUserId.value.trim()) {
    body.simulate_user_id = simulateUserId.value.trim();
  }

  if (!allScenesSelected.value && selectedSceneIds.value.length > 0) {
    body.scene_ids = selectedSceneIds.value;
  }

  try {
    const res = await fetch('/api/logs/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      ElMessage.error(err.error ?? '导出失败');
      return;
    }

    exportResult.value = await res.text();
    hasResult.value = true;
  } catch {
    ElMessage.error('网络错误，请稍后重试');
  } finally {
    isExporting.value = false;
  }
}

function handleDownload() {
  const ext = format.value === 'json' ? 'json' : format.value === 'text' ? 'txt' : 'md';
  const mime = format.value === 'json' ? 'application/json' : format.value === 'text' ? 'text/plain' : 'text/markdown';
  const blob = new Blob([exportResult.value], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `campaign-${campaignId}-log.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
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
      <h1 class="page-title">导出日志</h1>
    </div>

    <div class="export-card">
      <div class="section">
        <div class="section-title">导出模式</div>
        <div class="mode-options">
          <label class="format-option" :class="{ active: mode === 'player' }">
            <input v-model="mode" type="radio" value="player" />
            <span class="format-icon"><SvgIcon name="icon-npc" :size="18" /></span>
            <div>
              <div class="format-name">我的故事</div>
              <div class="format-desc">按当前玩家可见内容导出</div>
            </div>
          </label>
          <label class="format-option" :class="{ active: mode === 'full', disabled: !isGm }">
            <input v-model="mode" type="radio" value="full" :disabled="!isGm" />
            <span class="format-icon"><SvgIcon name="icon-highlight" :size="18" /></span>
            <div>
              <div class="format-name">完整剧本</div>
              <div class="format-desc">仅 GM 可导出全量消息</div>
            </div>
          </label>
        </div>
      </div>

      <!-- 格式选择 -->
      <div class="section">
        <div class="section-title">导出格式</div>
        <div class="format-options">
          <label class="format-option" :class="{ active: format === 'markdown' }">
            <input v-model="format" type="radio" value="markdown" />
            <span class="format-icon"><SvgIcon name="icon-scroll" :size="18" /></span>
            <div>
              <div class="format-name">Markdown</div>
              <div class="format-desc">适合阅读与存档</div>
            </div>
          </label>
          <label class="format-option" :class="{ active: format === 'json' }">
            <input v-model="format" type="radio" value="json" />
            <span class="format-icon"><SvgIcon name="icon-settings" :size="18" /></span>
            <div>
              <div class="format-name">JSON</div>
              <div class="format-desc">适合数据处理</div>
            </div>
          </label>
          <label class="format-option" :class="{ active: format === 'text' }">
            <input v-model="format" type="radio" value="text" />
            <span class="format-icon"><SvgIcon name="icon-list" :size="18" /></span>
            <div>
              <div class="format-name">纯文本</div>
              <div class="format-desc">适合快速复制与分享</div>
            </div>
          </label>
        </div>
      </div>

      <div class="section">
        <div class="section-title">排序策略</div>
        <select v-model="sortStrategy" class="strategy-select">
          <option value="chronological">严格时序</option>
          <option value="scene">场景优先</option>
          <option value="interleave">主线穿插（当前按时序导出）</option>
          <option value="custom">自定义排序（当前按时序导出）</option>
        </select>
        <p class="helper-text">当前 MVP 已实现严格时序与场景优先，其余策略先回退到时序导出。</p>
      </div>

      <div v-if="isGm && mode === 'player'" class="section">
        <div class="section-title">GM 模拟玩家视角</div>
        <input
          v-model="simulateUserId"
          class="simulate-input"
          type="text"
          placeholder="输入用户 ID，例如 1000000"
        />
        <p class="helper-text">留空则按你的可见范围导出。</p>
      </div>

      <!-- 场景筛选 -->
      <div v-if="scenes.length > 0" class="section">
        <div class="section-title">场景筛选</div>
        <div class="scene-filter">
          <label class="select-all-row">
            <ElCheckbox v-model="allScenesSelected" @change="handleSelectAll">全部场景</ElCheckbox>
          </label>
          <div v-if="!allScenesSelected" class="scene-list">
            <label v-for="scene in scenes" :key="scene.id" class="scene-item">
              <ElCheckbox v-model="selectedSceneIds" :value="scene.id" @change="handleSceneChange">
                {{ scene.name }}
              </ElCheckbox>
            </label>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="actions">
        <button
          class="btn-export"
          :disabled="isExporting"
          @click="handleExport"
        >
          {{ isExporting ? '导出中...' : '生成日志' }}
        </button>
      </div>
    </div>

    <!-- 预览区域 -->
    <div v-if="hasResult" class="result-card">
      <div class="result-header">
        <span class="result-meta">共 {{ resultLines }} 行</span>
        <button class="btn-download" @click="handleDownload">⬇ 下载文件</button>
      </div>
      <textarea class="result-preview" readonly :value="exportResult" />
    </div>
  </div>
</template>

<style scoped>
.log-export-page {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* 页面顶部 */
.page-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: var(--text-xl);
  -webkit-tap-highlight-color: transparent;
}
.back-btn:hover { color: var(--color-accent); background: var(--surface-hover); }
.page-title {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

/* 卡片 */
.export-card, .result-card {
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* 区块 */
.section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-2);
}

/* 格式选项 */
.format-options {
  display: flex;
  gap: var(--space-3);
}
.mode-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}
.format-option {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}
.format-option input { display: none; }
.format-option.active { border-color: var(--color-accent); background: var(--surface-hover); }
.format-option.disabled {
  opacity: 0.52;
  cursor: not-allowed;
}
.format-icon { font-size: 20px; flex-shrink: 0; }
.format-name { font-weight: 600; font-size: var(--text-sm); color: var(--color-text-primary); }
.format-desc { font-size: 11px; color: var(--color-text-muted); }
.strategy-select,
.simulate-input {
  width: 100%;
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  color: var(--color-text-primary);
}
.helper-text {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

/* 场景列表 */
.select-all-row { display: block; margin-bottom: var(--space-2); }
.scene-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 180px;
  overflow-y: auto;
  padding-left: var(--space-2);
}
.scene-item { display: block; }

/* 操作 */
.actions { display: flex; justify-content: flex-end; }
.btn-export {
  padding: var(--space-2) var(--space-6);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition-fast);
}
.btn-export:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-export:not(:disabled):hover { opacity: 0.85; }

/* 结果区域 */
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.result-meta { font-size: var(--text-sm); color: var(--color-text-muted); }
.btn-download {
  padding: var(--space-1) var(--space-3);
  background: var(--surface-hover);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  cursor: pointer;
  color: var(--color-text-primary);
  transition: border-color var(--transition-fast);
}
.btn-download:hover { border-color: var(--color-accent); color: var(--color-accent); }
.result-preview {
  width: 100%;
  height: 320px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--color-page-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  color: var(--color-text-primary);
  line-height: 1.6;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .log-export-page {
    padding: var(--space-3);
  }

  .format-options,
  .mode-options {
    display: grid;
    grid-template-columns: 1fr;
  }

  .result-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }
}
</style>
