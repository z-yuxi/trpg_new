<script setup lang="ts">
/**
 * AiTaskCenterPanel — AI 任务中心
 *
 * 功能：
 *   - 展示当前用户最近 30 条 AI 任务（check_text / import_module / ...）
 *   - 实时接收 ai_task_update socket 事件，动态更新任务状态
 *   - 失败任务显示失败原因
 *   - 成功的 import_module 任务可点击「查看结果」重新打开实体审阅对话框
 */
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { getAiTasks, retryAiTask, type AiTask } from '../../api/ai';
import { socketClient } from '../../socket/socket-client';

const emit = defineEmits<{
  close: [];
  openEntityReview: [taskId: string];
}>();

// ── 任务列表状态 ─────────────────────────────────────────
const tasks = ref<(AiTask & { errorMsg?: string })[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const res = await getAiTasks(30);
    tasks.value = res.tasks;
  } catch {
    // 静默处理
  } finally {
    loading.value = false;
  }
}

// ── 实时 socket 更新 ─────────────────────────────────────
function handleAiTaskUpdate(data: { task_id: string; status: 'queued' | 'success' | 'failed'; result?: unknown; error?: string }) {
  const idx = tasks.value.findIndex((t) => t.id === data.task_id);
  if (idx >= 0) {
    tasks.value[idx] = {
      ...tasks.value[idx],
      status: data.status,
      errorMsg: data.status === 'failed' ? (data.error ?? '未知错误') : undefined,
    };
  } else if (data.status !== 'failed') {
    // 新任务推入列表顶部（可能是从其他页面发起的）
    tasks.value.unshift({
      id: data.task_id,
      task_type: 'import_module',
      status: data.status,
      input_tokens: 0,
      output_tokens: 0,
      duration_ms: 0,
      created_at: new Date().toISOString(),
    });
  }
}

onMounted(() => {
  load();
  socketClient.connectUser();
  socketClient.onAiTaskUpdate(handleAiTaskUpdate);
});

onUnmounted(() => {
  // 不 off，避免影响其他监听者；panel 关闭后不再需要更新视图即可
});

// ── 标签配置 ─────────────────────────────────────────────
const TASK_TYPE_LABELS: Record<string, string> = {
  check_text: 'AI 校对',
  import_module: '结构分析',
  log_summary: '日志摘要',
  generate_recipe: '规则生成',
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  queued:  { label: '排队中', cls: 'status--queued' },
  success: { label: '已完成', cls: 'status--success' },
  failed:  { label: '失败',   cls: 'status--failed' },
};

function typeLabel(type: string): string {
  return TASK_TYPE_LABELS[type] ?? type;
}

function statusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, cls: '' };
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 60_000)  return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${Math.floor(diff / 86400_000)} 天前`;
}

// 统计：排队中 + 失败数（用于外部角标）
const pendingCount = computed(() => tasks.value.filter((t) => t.status === 'queued').length);
const failedCount  = computed(() => tasks.value.filter((t) => t.status === 'failed').length);

// ── 重试失败任务 ─────────────────────────────────────────
const retryingIds = ref<Set<string>>(new Set());

async function retryTask(taskId: string) {
  if (retryingIds.value.has(taskId)) return;
  retryingIds.value = new Set([...retryingIds.value, taskId]);
  try {
    await retryAiTask(taskId);
    // 乐观更新状态
    const idx = tasks.value.findIndex((t) => t.id === taskId);
    if (idx >= 0) {
      tasks.value[idx] = { ...tasks.value[idx], status: 'queued', errorMsg: undefined };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '重试失败';
    const idx = tasks.value.findIndex((t) => t.id === taskId);
    if (idx >= 0) {
      tasks.value[idx] = { ...tasks.value[idx], errorMsg: msg };
    }
  } finally {
    retryingIds.value = new Set([...retryingIds.value].filter((id) => id !== taskId));
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="atc-overlay" @click.self="$emit('close')">
      <div class="atc-panel">
        <!-- 头部 -->
        <header class="atc-header">
          <span class="atc-title">AI 任务中心</span>
          <div class="atc-header-right">
            <button class="atc-refresh-btn" :disabled="loading" @click="load" title="刷新">
              <span :class="{ 'spin': loading }">↻</span>
            </button>
            <button class="atc-close-btn" @click="$emit('close')">×</button>
          </div>
        </header>

        <!-- 摘要条 -->
        <div v-if="pendingCount || failedCount" class="atc-summary">
          <span v-if="pendingCount" class="atc-summary-item atc-summary--queued">
            {{ pendingCount }} 个任务排队中
          </span>
          <span v-if="failedCount" class="atc-summary-item atc-summary--failed">
            {{ failedCount }} 个任务失败
          </span>
        </div>

        <!-- 任务列表 -->
        <div class="atc-body">
          <div v-if="loading && tasks.length === 0" class="atc-empty">加载中...</div>
          <div v-else-if="tasks.length === 0" class="atc-empty">暂无 AI 任务记录</div>
          <ul v-else class="atc-list">
            <li
              v-for="task in tasks"
              :key="task.id"
              class="atc-item"
              :class="{ 'atc-item--failed': task.status === 'failed' }"
            >
              <div class="atc-item-main">
                <span class="atc-type-label">{{ typeLabel(task.task_type) }}</span>
                <span class="atc-status-badge" :class="statusConfig(task.status).cls">
                  {{ statusConfig(task.status).label }}
                </span>
                <span class="atc-time">{{ timeAgo(task.created_at) }}</span>
              </div>

              <!-- 失败原因 + 重试 -->
              <div v-if="task.status === 'failed'" class="atc-error-row">
                <span v-if="task.errorMsg" class="atc-error-msg">{{ task.errorMsg }}</span>
                <button
                  class="atc-retry-btn"
                  :disabled="retryingIds.has(task.id)"
                  @click="retryTask(task.id)"
                >
                  {{ retryingIds.has(task.id) ? '重试中...' : '↺ 重试' }}
                </button>
              </div>

              <!-- Token 用量（成功时显示） -->
              <div v-if="task.status === 'success' && task.input_tokens > 0" class="atc-tokens">
                {{ task.input_tokens }} in / {{ task.output_tokens }} out tokens
                <span v-if="task.duration_ms > 0" class="atc-duration">· {{ (task.duration_ms / 1000).toFixed(1) }}s</span>
              </div>

              <!-- 结构分析任务：已完成时可重新打开结果 -->
              <div v-if="task.task_type === 'import_module' && task.status === 'success'" class="atc-actions">
                <button class="atc-action-btn" @click="$emit('openEntityReview', task.id)">
                  查看分析结果
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.atc-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 1800;
  display: flex; justify-content: flex-end; align-items: stretch;
}
.atc-panel {
  width: min(380px, 95vw);
  background: var(--color-surface, #fff);
  display: flex; flex-direction: column;
  box-shadow: -4px 0 24px rgba(0,0,0,.15);
  overflow: hidden;
}
.atc-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--color-border, #eee);
  flex-shrink: 0;
}
.atc-title { font-size: 15px; font-weight: 700; }
.atc-header-right { display: flex; align-items: center; gap: 8px; }
.atc-refresh-btn {
  background: none; border: none; font-size: 18px; cursor: pointer;
  color: var(--color-text-muted, #aaa); line-height: 1; padding: 0 4px;
  &:hover { color: var(--color-text, #333); }
  &:disabled { opacity: .5; cursor: default; }
}
.spin { display: inline-block; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.atc-close-btn {
  background: none; border: none; font-size: 20px; cursor: pointer;
  color: var(--color-text-muted, #aaa); line-height: 1;
  &:hover { color: var(--color-text, #333); }
}
.atc-summary {
  display: flex; gap: 8px; flex-wrap: wrap;
  padding: 8px 16px;
  background: var(--color-surface-alt, #fafafa);
  border-bottom: 1px solid var(--color-border, #eee);
  flex-shrink: 0;
}
.atc-summary-item { font-size: 12px; font-weight: 600; }
.atc-summary--queued { color: #d97706; }
.atc-summary--failed { color: #ef4444; }
.atc-body {
  flex: 1; overflow-y: auto; padding: 8px 0;
}
.atc-empty {
  text-align: center; padding: 40px 0;
  font-size: 13px; color: var(--color-text-muted, #aaa);
}
.atc-list { list-style: none; margin: 0; padding: 0; }
.atc-item {
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border-light, #f0f0f0);
  &:last-child { border-bottom: none; }
  &.atc-item--failed { background: #fff5f5; }
}
.atc-item-main {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
}
.atc-type-label { font-size: 13px; font-weight: 600; flex: 1; min-width: 0; }
.atc-status-badge {
  font-size: 11px; padding: 2px 7px; border-radius: 10px; font-weight: 600;
  white-space: nowrap;
}
.status--queued  { background: #fef3c7; color: #92400e; }
.status--success { background: #d1fae5; color: #065f46; }
.status--failed  { background: #fee2e2; color: #991b1b; }
.atc-time {
  font-size: 11px; color: var(--color-text-muted, #aaa); white-space: nowrap;
}
.atc-error-row {
  display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px;
}
.atc-error-msg {
  font-size: 12px; color: #dc2626;
  background: #fee2e2; border-radius: 4px;
  padding: 4px 8px; flex: 1;
  word-break: break-word;
}
.atc-retry-btn {
  flex-shrink: 0;
  font-size: 12px; padding: 3px 10px;
  border: 1px solid #dc2626; border-radius: 4px;
  background: none; color: #dc2626; cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) { background: #fee2e2; }
  &:disabled { opacity: .5; cursor: default; }
}
.atc-tokens {
  font-size: 11px; color: var(--color-text-muted, #aaa);
}
.atc-duration { color: var(--color-text-muted, #bbb); }
.atc-actions { margin-top: 6px; }
.atc-action-btn {
  font-size: 12px; padding: 3px 10px;
  border: 1px solid var(--color-primary, #6c63ff);
  border-radius: 4px; background: none;
  color: var(--color-primary, #6c63ff); cursor: pointer;
  &:hover { background: var(--color-primary-light, #ede9fe); }
}
</style>
