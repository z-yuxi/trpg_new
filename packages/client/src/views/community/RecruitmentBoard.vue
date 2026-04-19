<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElInput, ElSelect, ElOption, ElPagination, ElMessage } from 'element-plus';
import TCard from '../../components/base/TCard.vue';
import TTag from '../../components/base/TTag.vue';
import TSkeleton from '../../components/base/TSkeleton.vue';
import EmptyState from '../../components/base/EmptyState.vue';
import { api } from '../../utils/api';

interface RulesetOption {
  id: string;
  name: string;
}

interface RecruitmentPostVM {
  id: string;
  title: string;
  type: 'gm_recruit' | 'player_seek';
  status: 'open' | 'full' | 'closed';
  status_view: 'open' | 'full' | 'grouped' | 'closed';
  poster_nickname: string;
  ruleset_id: string;
  ruleset_name: string;
  module_name?: string | null;
  player_count_max: number;
  player_count_joined: number;
  created_at: string;
}

const props = defineProps<{
  type: 'gm_recruit' | 'player_seek';
  rulesets: RulesetOption[];
}>();

const router = useRouter();
const loading = ref(false);
const posts = ref<RecruitmentPostVM[]>([]);
const total = ref(0);
const page = ref(1);
const limit = ref(8);

const filterStatus = ref<'all' | 'open' | 'full' | 'grouped' | 'closed'>('all');
const filterRuleset = ref('all');
const sort = ref<'latest' | 'oldest'>('latest');
const keyword = ref('');

const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'danger' | 'default' }> = {
  open: { label: '招募中', color: 'success' },
  full: { label: '已满员', color: 'warning' },
  grouped: { label: '已成团', color: 'danger' },
  closed: { label: '已关闭', color: 'default' },
};

const rulesetOptions = computed(() => [{ id: 'all', name: '全部规则包' }, ...props.rulesets]);

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

async function loadPosts() {
  loading.value = true;
  try {
    const query = new URLSearchParams({
      page: String(page.value),
      limit: String(limit.value),
      type: props.type,
      sort: sort.value,
    });

    if (filterStatus.value !== 'all') query.set('status', filterStatus.value);
    if (filterRuleset.value !== 'all') query.set('ruleset_id', filterRuleset.value);
    if (keyword.value.trim()) query.set('keyword', keyword.value.trim());

    const result = await api.get<{ data: RecruitmentPostVM[]; total: number }>(`/recruitment?${query.toString()}`);
    posts.value = result.data ?? [];
    total.value = result.total ?? 0;
  } catch (err: any) {
    ElMessage.error(err?.message ?? '加载招募帖失败');
  } finally {
    loading.value = false;
  }
}

function goDetail(id: string) {
  router.push(`/community/${id}`);
}

function resetPageAndReload() {
  page.value = 1;
  loadPosts();
}

watch(() => props.type, resetPageAndReload);
watch([filterStatus, filterRuleset, sort], resetPageAndReload);
watch(keyword, () => {
  page.value = 1;
});

onMounted(loadPosts);
</script>

<template>
  <div class="board">
    <div class="toolbar">
      <ElInput v-model="keyword" placeholder="按标题关键词搜索" clearable @keyup.enter="resetPageAndReload" @clear="resetPageAndReload" />
      <ElSelect v-model="filterRuleset" @change="resetPageAndReload">
        <ElOption v-for="item in rulesetOptions" :key="item.id" :label="item.name" :value="item.id" />
      </ElSelect>
      <ElSelect v-model="filterStatus" @change="resetPageAndReload">
        <ElOption label="全部状态" value="all" />
        <ElOption label="招募中" value="open" />
        <ElOption label="已满员" value="full" />
        <ElOption label="已成团" value="grouped" />
        <ElOption label="已关闭" value="closed" />
      </ElSelect>
      <ElSelect v-model="sort" @change="resetPageAndReload">
        <ElOption label="最新发布" value="latest" />
        <ElOption label="最早发布" value="oldest" />
      </ElSelect>
    </div>

    <div v-if="loading" class="sk-list">
      <TSkeleton type="list" :rows="1" v-for="i in 5" :key="i" />
    </div>
    <EmptyState
      v-else-if="posts.length === 0"
      icon-name="state-empty"
      title="暂无招募帖"
      description="暂无符合条件的招募帖，换个筛选条件试试。"
    />
    <div v-else class="post-list">
      <TCard v-for="p in posts" :key="p.id" padding="md" hoverable class="post-card" @click="goDetail(p.id)">
        <div class="post-top">
          <h3 class="post-title">{{ p.title }}</h3>
          <TTag :color="statusMap[p.status_view]?.color" size="sm">{{ statusMap[p.status_view]?.label }}</TTag>
        </div>

        <div class="post-line">
          <span>GM：{{ p.poster_nickname }}</span>
          <span>规则包：{{ p.ruleset_name || p.ruleset_id }}</span>
        </div>
        <div class="post-line">
          <span>模组：{{ p.module_name || '待定' }}</span>
          <span>人数：{{ p.player_count_joined }}/{{ p.player_count_max }}</span>
        </div>
        <div class="post-time">发布时间：{{ formatDate(p.created_at) }}</div>
      </TCard>
    </div>

    <div class="pager">
      <ElPagination
        v-model:current-page="page"
        v-model:page-size="limit"
        layout="prev, pager, next, jumper, total"
        :total="total"
        :page-sizes="[8, 12, 20]"
        @current-change="loadPosts"
        @size-change="resetPageAndReload"
      />
    </div>
  </div>
</template>

<style scoped>
.board { display: flex; flex-direction: column; gap: var(--space-4); }
.toolbar {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) repeat(3, minmax(130px, 180px));
  gap: var(--space-2);
}
.post-list { display: flex; flex-direction: column; gap: var(--space-3); }
.post-card { cursor: pointer; }
.post-top { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
.post-title { margin: 0; font-size: var(--text-lg); font-weight: 700; color: var(--color-text-primary); }
.post-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-top: var(--space-2);
}
.post-time { margin-top: var(--space-2); font-size: var(--text-xs); color: var(--color-text-muted); }
.pager { display: flex; justify-content: center; margin-top: var(--space-2); }
.empty { text-align: center; color: var(--color-text-muted); font-size: var(--text-sm); padding: var(--space-6); }
.sk-list { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-2) 0; }
@media (max-width: 768px) {
  .toolbar { grid-template-columns: 1fr; }
}
</style>
