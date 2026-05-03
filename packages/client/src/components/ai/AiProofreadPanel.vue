<script setup lang="ts">
/**
 * AiProofreadPanel — AI 校对面板
 *
 * 功能：
 *   - 展示校对问题列表（typo/punctuation/term/style）
 *   - 单条采纳/忽略操作
 *   - 全部采纳按钮
 *   - 高亮定位链接（点击导向编辑器中的问题位置）
 */
import { ref, computed } from 'vue';
import SvgIcon from '../SvgIcon.vue';

export interface CheckTextIssue {
  type: 'typo' | 'punctuation' | 'term' | 'style';
  original: string;
  suggestion: string;
  reason: string;
}

const props = defineProps<{
  issues: CheckTextIssue[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  accept: [issue: CheckTextIssue, index: number]; // 采纳单条
  reject: [issue: CheckTextIssue, index: number]; // 忽略单条
  acceptAll: []; // 全部采纳
  locate: [issue: CheckTextIssue]; // 高亮定位
  close: [];
}>();

// ── 状态管理 ─────────────────────────────────────────────
const dismissedIndices = ref<Set<number>>(new Set());

const visibleIssues = computed(() => {
  return props.issues.filter((_, idx) => !dismissedIndices.value.has(idx));
});

const acceptedCount = computed(() => {
  return props.issues.length - visibleIssues.value.length;
});

// ── 交互处理 ─────────────────────────────────────────────
function handleAccept(issue: CheckTextIssue, index: number) {
  dismissedIndices.value.add(index);
  emit('accept', issue, index);
}

function handleReject(issue: CheckTextIssue, index: number) {
  dismissedIndices.value.add(index);
  emit('reject', issue, index);
}

function handleAcceptAll() {
  emit('acceptAll');
  dismissedIndices.value.clear();
  // 清除所有已处理标记
  props.issues.forEach((_, idx) => {
    dismissedIndices.value.add(idx);
  });
}

function handleLocate(issue: CheckTextIssue) {
  emit('locate', issue);
}

// ── 问题类型标签 ─────────────────────────────────────────
const issueTypeLabel = {
  typo: '拼写错误',
  punctuation: '标点符号',
  term: '术语',
  style: '风格不一致',
} as const;

const issueTypeColor = {
  typo: '#EF6B6B',
  punctuation: '#F5A623',
  term: '#4A90D9',
  style: '#7ED321',
} as const;
</script>

<template>
  <div class="ai-proofread-panel">
    <!-- 顶部工具栏 -->
    <div class="panel-header">
      <div class="header-title">
        <SvgIcon name="icon-star" :size="16" />
        <span>AI 校对</span>
        <span class="badge">{{ visibleIssues.length }}</span>
      </div>
      <button class="btn-close" @click="$emit('close')" title="关闭">
        <SvgIcon name="icon-close" :size="16" />
      </button>
    </div>

    <!-- 统计行 -->
    <div class="panel-stats">
      <span v-if="acceptedCount > 0" class="stat-item">
        <span class="stat-label">已采纳：</span>
        <span class="stat-value">{{ acceptedCount }}</span>
      </span>
      <span v-if="props.issues.length > 0" class="stat-item">
        <span class="stat-label">总计：</span>
        <span class="stat-value">{{ props.issues.length }}</span>
      </span>
    </div>

    <!-- 问题列表 -->
    <div v-if="visibleIssues.length > 0" class="issues-list">
      <div v-for="(issue, idx) in visibleIssues" :key="idx" class="issue-item">
        <!-- 问题类型标签 -->
        <div class="issue-type-badge" :style="{ backgroundColor: issueTypeColor[issue.type] }">
          {{ issueTypeLabel[issue.type] }}
        </div>

        <!-- 问题详情 -->
        <div class="issue-content">
          <div class="issue-detail">
            <span class="label">原文：</span>
            <span class="text original">{{ issue.original }}</span>
          </div>
          <div class="issue-detail">
            <span class="label">修改：</span>
            <span class="text suggestion">{{ issue.suggestion }}</span>
          </div>
          <div class="issue-reason">{{ issue.reason }}</div>
        </div>

        <!-- 操作按钮 -->
        <div class="issue-actions">
          <button
            class="btn btn-primary"
            title="采纳此修改"
            @click="handleAccept(issue, props.issues.indexOf(issue))"
          >
            采纳
          </button>
          <button
            class="btn btn-secondary"
            title="忽略此修改"
            @click="handleReject(issue, props.issues.indexOf(issue))"
          >
            忽略
          </button>
          <button
            class="btn btn-tertiary"
            title="在编辑器中定位此问题"
            @click="handleLocate(issue)"
          >
            定位
          </button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <SvgIcon name="icon-check-circle" :size="32" />
      <p>无校对问题</p>
      <span class="hint">文本已符合规范</span>
    </div>

    <!-- 底部操作栏 -->
    <div v-if="props.issues.length > visibleIssues.length" class="panel-footer">
      <button class="btn btn-primary btn-full" @click="handleAcceptAll">
        全部采纳 ({{ visibleIssues.length }})
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ai-proofread-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border-left: 1px solid #e0e0e0;
  font-size: 12px;
  overflow: hidden;

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e8e8e8;
    background: #fafafa;

    .header-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      color: #333;

      .badge {
        background: #4A90D9;
        color: #fff;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
      }
    }

    .btn-close {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      color: #999;
      transition: color 0.2s;

      &:hover {
        color: #333;
      }
    }
  }

  .panel-stats {
    padding: 8px 16px;
    background: #f5f5f5;
    border-bottom: 1px solid #e8e8e8;
    display: flex;
    gap: 16px;
    font-size: 11px;

    .stat-item {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #666;

      .stat-label {
        font-weight: 500;
      }

      .stat-value {
        color: #4A90D9;
        font-weight: 600;
      }
    }
  }

  .issues-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;

    .issue-item {
      background: #f9f9f9;
      border: 1px solid #e8e8e8;
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 8px;
      display: flex;
      gap: 12px;
      align-items: flex-start;

      &:hover {
        background: #fafafa;
        border-color: #d0d0d0;
      }

      .issue-type-badge {
        padding: 4px 8px;
        border-radius: 3px;
        color: #fff;
        font-size: 10px;
        font-weight: 600;
        white-space: nowrap;
        flex-shrink: 0;
        margin-top: 2px;
      }

      .issue-content {
        flex: 1;
        min-width: 0;

        .issue-detail {
          display: flex;
          gap: 6px;
          margin-bottom: 6px;
          align-items: baseline;
          font-size: 11px;

          .label {
            color: #999;
            font-weight: 500;
            min-width: 40px;
          }

          .text {
            flex: 1;
            word-break: break-word;
            line-height: 1.4;

            &.original {
              color: #d0021b;
              text-decoration: line-through;
              opacity: 0.7;
            }

            &.suggestion {
              color: #50c878;
              font-weight: 500;
            }
          }
        }

        .issue-reason {
          font-size: 10px;
          color: #999;
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid #e8e8e8;
          line-height: 1.3;
        }
      }

      .issue-actions {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex-shrink: 0;

        .btn {
          padding: 4px 8px;
          border-radius: 3px;
          border: none;
          cursor: pointer;
          font-size: 10px;
          font-weight: 500;
          transition: all 0.2s;
          white-space: nowrap;

          &.btn-primary {
            background: #4A90D9;
            color: #fff;

            &:hover {
              background: #3a7cc9;
            }
          }

          &.btn-secondary {
            background: #f0f0f0;
            color: #666;

            &:hover {
              background: #e0e0e0;
            }
          }

          &.btn-tertiary {
            background: none;
            border: 1px solid #ddd;
            color: #666;

            &:hover {
              border-color: #999;
              color: #333;
            }
          }
        }
      }
    }
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #999;
    padding: 24px;

    p {
      margin: 0;
      font-weight: 500;
      color: #666;
    }

    .hint {
      font-size: 11px;
      color: #bbb;
    }
  }

  .panel-footer {
    padding: 12px;
    border-top: 1px solid #e8e8e8;
    background: #fafafa;

    .btn-full {
      width: 100%;
      padding: 8px 12px;
      background: #4A90D9;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;

      &:hover {
        background: #3a7cc9;
      }
    }
  }
}
</style>
