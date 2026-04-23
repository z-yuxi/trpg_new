<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TButton from '../components/base/TButton.vue';
import TTag from '../components/base/TTag.vue';
import { api } from '../utils/api';
import { useAuthStore } from '../stores/auth-store';

interface RulesetInfo {
  id: string;
  name: string;
  version: string;
  status: string;
  description?: string;
  author_id?: string;
  parent_ruleset_id?: string | null;
  fork_count?: number;
  commands?: {
    builtin_commands?: string[];
    custom_commands?: Array<{ trigger: string; description?: string; gm_only?: boolean }>;
  };
  character_card_schema?: Record<string, unknown>;
  created_at?: string;
}

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const ruleset = ref<RulesetInfo | null>(null);
const error = ref('');

const rulesetId = route.params.id as string;

const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'default' | 'danger' }> = {
  published: { label: '已发布', color: 'success' },
  draft:     { label: '草稿',   color: 'default' },
  reviewing: { label: '审核中', color: 'warning' },
  deprecated:{ label: '已弃用', color: 'danger' },
};

onMounted(async () => {
  try {
    ruleset.value = await api.get<RulesetInfo>(`/rulesets/${rulesetId}`);
  } catch {
    error.value = '规则集不存在或已被删除';
  } finally {
    loading.value = false;
  }
});

function handleEdit() {
  router.push(`/creator/workshop/${rulesetId}/edit`);
}
</script>

<template>
  <div class="ruleset-detail">
    <div class="detail-header">
      <TButton type="ghost" size="sm" @click="router.back()">← 返回</TButton>
    </div>

    <div v-if="loading" class="state-box">加载中…</div>
    <div v-else-if="error" class="state-box error">{{ error }}</div>

    <template v-else-if="ruleset">
      <div class="detail-card">
        <div class="card-top">
          <div>
            <h1 class="rs-name">{{ ruleset.name }}</h1>
            <div class="rs-meta">
              <span>v{{ ruleset.version }}</span>
              <span v-if="ruleset.created_at">{{ new Date(ruleset.created_at).toLocaleDateString() }}</span>
              <span v-if="ruleset.fork_count">Fork {{ ruleset.fork_count }} 次</span>
            </div>
          </div>
          <TTag :color="statusMap[ruleset.status]?.color ?? 'default'" size="sm">
            {{ statusMap[ruleset.status]?.label ?? ruleset.status }}
          </TTag>
        </div>

        <p class="rs-desc">{{ ruleset.description || '暂无描述' }}</p>

        <!-- 命令列表 -->
        <section v-if="ruleset.commands" class="section">
          <h2 class="section-title">支持命令</h2>
          <div class="cmd-list">
            <div
              v-for="cmd in (ruleset.commands.builtin_commands ?? [])"
              :key="cmd"
              class="cmd-item builtin"
            >
              <span class="cmd-trigger">/{{ cmd }}</span>
              <span class="cmd-label">内置</span>
            </div>
            <div
              v-for="cmd in (ruleset.commands.custom_commands ?? [])"
              :key="cmd.trigger"
              class="cmd-item"
            >
              <span class="cmd-trigger">/{{ cmd.trigger }}</span>
              <span v-if="cmd.description" class="cmd-desc">{{ cmd.description }}</span>
              <span v-if="cmd.gm_only" class="cmd-label gm">仅GM</span>
            </div>
            <div
              v-if="!(ruleset.commands.builtin_commands?.length) && !(ruleset.commands.custom_commands?.length)"
              class="empty-cmds"
            >暂未配置命令</div>
          </div>
        </section>

        <!-- 操作区 -->
        <div class="actions">
          <TButton
            v-if="authStore.isLoggedIn && authStore.userId === ruleset.author_id"
            type="primary"
            @click="handleEdit"
          >编辑规则集</TButton>
          <TButton type="secondary" @click="router.push('/assets')">返回广场</TButton>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ruleset-detail {
  max-width: 800px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.detail-header { display: flex; align-items: center; }
.state-box {
  padding: var(--space-10);
  text-align: center;
  color: var(--color-text-muted);
  border: 1px dashed var(--color-card-border);
  border-radius: var(--radius-xl);
}
.state-box.error { color: var(--color-danger); border-color: var(--color-danger); }
.detail-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-6);
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-xl);
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
}
.rs-name { margin: 0; font-size: var(--text-2xl); font-weight: var(--font-bold); color: var(--color-text-primary); }
.rs-meta { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-2); font-size: var(--text-sm); color: var(--color-text-muted); }
.rs-desc { margin: 0; color: var(--color-text-secondary); line-height: 1.6; }
.section-title { font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 var(--space-3); }
.cmd-list { display: flex; flex-direction: column; gap: var(--space-2); }
.cmd-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  border: 1px solid var(--color-card-border);
}
.cmd-item.builtin { opacity: 0.75; }
.cmd-trigger { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--color-accent); font-weight: var(--font-medium); }
.cmd-desc { flex: 1; font-size: var(--text-sm); color: var(--color-text-secondary); }
.cmd-label {
  font-size: var(--text-xs);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-alt, #f3f4f6);
  color: var(--color-text-muted);
}
.cmd-label.gm { background: color-mix(in srgb, var(--color-warning) 15%, transparent); color: var(--color-warning); }
.empty-cmds { font-size: var(--text-sm); color: var(--color-text-muted); padding: var(--space-3); text-align: center; }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-3); padding-top: var(--space-2); border-top: 1px solid var(--color-card-border); }
</style>
