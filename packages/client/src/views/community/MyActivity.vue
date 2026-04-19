<script setup lang="ts">
import { ref } from 'vue';
import TTag from '../../components/base/TTag.vue';

interface ActivityItem {
  id: string;
  type: 'post' | 'reply' | 'join' | 'publish';
  label: string;
  title: string;
  link?: string;
  createdAt: string;
}

// TODO: 后端 GET /api/users/me/activity 接口实现后替换此本地数据
const activities = ref<ActivityItem[]>([
  {
    id: '1',
    type: 'post',
    label: '发布了帖子',
    title: '有没有人推荐一套适合新手的 COC 规则入门资料？',
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: '2',
    type: 'reply',
    label: '回复了帖子',
    title: '我的第一个自制模组分享——《碎镜》',
    createdAt: new Date(Date.now() - 7_200_000).toISOString(),
  },
  {
    id: '3',
    type: 'join',
    label: '申请加入了招募',
    title: '【COC】月色幽深夜——四人密室恐怖团',
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
  {
    id: '4',
    type: 'publish',
    label: '发布了招募帖',
    title: '招募 3 名 D&D 5e 玩家，长期团，每周六',
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
]);

const TYPE_COLOR: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  post:    'info',
  reply:   'default',
  join:    'success',
  publish: 'warning',
};

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return d.toLocaleDateString();
  } catch {
    return '-';
  }
}
</script>

<template>
  <div class="my-activity">
    <h2 class="page-title">我的动态</h2>

    <div v-if="activities.length === 0" class="empty-state">
      暂无动态记录
    </div>

    <div v-else class="timeline">
      <div v-for="(item, index) in activities" :key="item.id" class="timeline-item">
        <!-- 时间轴线 -->
        <div class="timeline-axis">
          <div class="axis-dot"></div>
          <div v-if="index < activities.length - 1" class="axis-line"></div>
        </div>

        <!-- 内容 -->
        <div class="timeline-content">
          <div class="item-header">
            <TTag :color="TYPE_COLOR[item.type]" size="sm">{{ item.label }}</TTag>
            <span class="item-time">{{ formatTime(item.createdAt) }}</span>
          </div>
          <div class="item-title">{{ item.title }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.my-activity { display: flex; flex-direction: column; gap: var(--space-4); }
.page-title { font-size: var(--text-xl); font-weight: var(--font-bold); color: var(--text-primary); }

.empty-state {
  text-align: center;
  padding: var(--space-8);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* 时间线 */
.timeline { display: flex; flex-direction: column; }

.timeline-item {
  display: flex;
  gap: var(--space-4);
}

.timeline-axis {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 16px;
}

.axis-dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  border: 2px solid var(--surface-page);
  box-shadow: 0 0 0 2px var(--color-primary);
  flex-shrink: 0;
  margin-top: 4px;
}

.axis-line {
  width: 2px;
  flex: 1;
  background: var(--border-default);
  min-height: 24px;
  margin: var(--space-1) 0;
}

.timeline-content {
  flex: 1;
  padding-bottom: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.item-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.item-time { font-size: var(--text-xs); color: var(--text-muted); }

.item-title {
  font-size: var(--text-sm);
  color: var(--text-body);
  line-height: var(--leading-normal);
}
</style>
