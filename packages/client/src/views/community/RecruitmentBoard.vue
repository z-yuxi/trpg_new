<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElInput, ElSelect, ElOption, ElPagination, ElMessage } from 'element-plus';
import TCard from '../../components/base/TCard.vue';
import TTag from '../../components/base/TTag.vue';
import TSkeleton from '../../components/base/TSkeleton.vue';
import EmptyState from '../../components/base/EmptyState.vue';
import { listRecruitments, confirmApplication } from '../../api/recruitment';
import { showApiError } from '../../utils/feedback';
import { useAuthStore } from '../../stores/auth-store';
import { getApplyButtonState } from '../../composables/useApplyButtonState';

interface RulesetOption {
  id: string;
  name: string;
}

interface RecruitmentPostVM {
  id: string;
  poster_id: string;
  title: string;
  type: 'gm_recruit' | 'player_seek';
  status: 'draft' | 'open' | 'full' | 'grouped' | 'closed' | 'dissolved' | 'archived';
  poster_nickname: string;
  ruleset_id: string;
  ruleset_name: string;
  module_name?: string | null;
  player_count_max: number;
  player_count_joined: number;
  allow_ob?: boolean;
  tags?: string[];
  description?: string | null;
  my_application_status?: 'pending' | 'invited' | 'confirmed' | 'waiting' | 'rejected' | null;
  my_application_id?: string | null;
  my_application_expires_at?: string | null;
  created_at: string;
}

const props = withDefaults(defineProps<{
  fixedType?: 'gm_recruit' | 'player_seek';
  mine?: 'posted' | 'applied';
  rulesets?: RulesetOption[];
}>(), {
  rulesets: () => [],
});

const router = useRouter();
const authStore = useAuthStore();
const loading = ref(false);
const posts = ref<RecruitmentPostVM[]>([]);
const total = ref(0);
const page = ref(1);
const limit = ref(8);

const filterStatus = ref<'all' | 'open' | 'full' | 'grouped' | 'closed'>('all');
const filterRuleset = ref('all');
const filterType = ref<'all' | 'gm_recruit' | 'player_seek'>(props.fixedType ?? 'all');
const filterTag = ref('all');
const filterWeekday = ref<string>('all');
const filterTimeSlot = ref<string>('all');
const filterMinSeats = ref<'all' | '1' | '2'>('all');
const sort = ref<'latest' | 'oldest' | 'hottest'>('latest');
const keywordInput = ref('');
const keyword = ref('');

const weekdayOptions = [
  { value: 'all', label: '星期不限' },
  { value: 'mon', label: '周一' },
  { value: 'tue', label: '周二' },
  { value: 'wed', label: '周三' },
  { value: 'thu', label: '周四' },
  { value: 'fri', label: '周五' },
  { value: 'sat', label: '周六' },
  { value: 'sun', label: '周日' },
];

const timeSlotOptions = [
  { value: 'all', label: '时段不限' },
  { value: 'morning', label: '上午（6-12时）' },
  { value: 'afternoon', label: '下午（12-18时）' },
  { value: 'evening', label: '晚上（18-23时）' },
  { value: 'night', label: '深夜（23时以后）' },
];

const seatsOptions = [
  { value: 'all', label: '席位不限' },
  { value: '1', label: '≥1 席' },
  { value: '2', label: '≥2 席' },
];

const statusMap: Record<string, { label: string; color: 'info' | 'warning' | 'danger' | 'default' }> = {
  draft: { label: '草稿', color: 'default' },
  open: { label: '招募中', color: 'info' },
  full: { label: '已满员', color: 'warning' },
  grouped: { label: '已成团', color: 'danger' },
  closed: { label: '已关闭', color: 'default' },
  dissolved: { label: '已解散', color: 'default' },
  archived: { label: '已归档', color: 'default' },
};

const rulesetOptions = computed(() => [{ id: 'all', name: '全部规则包' }, ...props.rulesets]);
const tagOptions = computed(() => {
  const values = new Set<string>();
  posts.value.forEach((post) => {
    (post.tags ?? []).forEach((tag) => values.add(tag));
  });
  return ['all', ...Array.from(values)];
});
const pageTitle = computed(() => {
  if (props.mine === 'posted') return '我发布的招募';
  if (props.mine === 'applied') return '我的申请';
  return null;
});

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

/** 计算每张卡片的操作按钮状态（使用 useApplyButtonState 附录02 §3.1） */
function cardButtonState(p: RecruitmentPostVM) {
  return getApplyButtonState({
    applicationStatus: (p.my_application_status as any) ?? 'none',
    recruitmentStatus: p.status,
    isGM: authStore.isLoggedIn && authStore.userId === p.poster_id,
    isFull: p.player_count_joined >= p.player_count_max,
    allowSpectate: !!p.allow_ob,
    isLoggedIn: authStore.isLoggedIn,
  });
}

async function loadPosts() {
  loading.value = true;
  try {
    const query = new URLSearchParams({
      page: String(page.value),
      limit: String(limit.value),
      sort: sort.value,
    });

    if (props.fixedType) query.set('type', props.fixedType);
    if (!props.fixedType && filterType.value !== 'all') query.set('type', filterType.value);
    if (filterStatus.value !== 'all') query.set('status', filterStatus.value);
    if (filterRuleset.value !== 'all') query.set('ruleset_id', filterRuleset.value);
    if (filterTag.value !== 'all') query.set('tag', filterTag.value);
    if (filterWeekday.value !== 'all') query.set('schedule_weekday', filterWeekday.value);
    if (filterTimeSlot.value !== 'all') query.set('schedule_time_slot', filterTimeSlot.value);
    if (filterMinSeats.value !== 'all') query.set('min_seats', filterMinSeats.value);
    if (keyword.value.trim()) query.set('keyword', keyword.value.trim());
    if (props.mine) query.set('mine', props.mine);

    const result = await listRecruitments(Object.fromEntries(query.entries())) as unknown as { data: RecruitmentPostVM[]; total: number };
    posts.value = result.data ?? [];
    total.value = result.total ?? 0;
  } catch (err: unknown) {
    showApiError(err, '加载招募帖失败');
  } finally {
    loading.value = false;
  }
}

function applyKeywordSearch() {
  keyword.value = keywordInput.value.trim();
  resetPageAndReload();
}

function goDetail(id: string) {
  router.push(`/recruit/${id}`);
}

function resetPageAndReload() {
  page.value = 1;
  loadPosts();
}

/** 按钮点击分发 */
const confirmingId = ref<string | null>(null);
async function handleCardAction(event: Event, post: RecruitmentPostVM) {
  event.stopPropagation();
  const state = cardButtonState(post);
  switch (state.action) {
    case 'showLogin':
      router.push('/login');
      break;
    case 'confirm': {
      if (!post.my_application_id) break;
      confirmingId.value = post.id;
      try {
        await confirmApplication(post.my_application_id!);
        ElMessage.success('已确认入团！');
        await loadPosts();
      } catch (err: unknown) {
        showApiError(err, '确认失败');
      } finally {
        confirmingId.value = null;
      }
      break;
    }
    case 'apply':
    case 'applyWaitlist':
    case 'manage':
    case 'spectate':
    case 'viewReason':
    default:
      // 其余操作跳转详情页完成
      router.push(`/recruit/${post.id}`);
  }
}

watch(() => props.fixedType, () => {
  filterType.value = props.fixedType ?? 'all';
  resetPageAndReload();
});
watch([filterStatus, filterRuleset, filterType, filterTag, filterWeekday, filterTimeSlot, filterMinSeats, sort], resetPageAndReload);
onMounted(loadPosts);
</script>

<template>
  <div class="board">
    <div v-if="pageTitle" class="board-title-row">
      <h4>{{ pageTitle }}</h4>
      <span>{{ props.mine === 'posted' ? '可按标签、规则包、状态筛选' : '集中查看自己所有申请状态' }}</span>
    </div>
    <div class="toolbar">
      <div class="search-group">
        <ElInput
          v-model="keywordInput"
          placeholder="按标题或描述搜索"
          clearable
          @keyup.enter="applyKeywordSearch"
          @clear="applyKeywordSearch"
        />
        <button class="search-btn" @click="applyKeywordSearch">搜索</button>
      </div>
      <ElSelect v-if="!props.fixedType" v-model="filterType" @change="resetPageAndReload">
        <ElOption label="全部类型" value="all" />
        <ElOption label="GM 招玩家" value="gm_recruit" />
        <ElOption label="玩家求组" value="player_seek" />
      </ElSelect>
      <ElSelect v-model="filterRuleset" @change="resetPageAndReload">
        <ElOption v-for="item in rulesetOptions" :key="item.id" :label="item.name" :value="item.id" />
      </ElSelect>
      <ElSelect v-model="filterTag" @change="resetPageAndReload">
        <ElOption label="全部标签" value="all" />
        <ElOption v-for="tag in tagOptions.filter((item) => item !== 'all')" :key="tag" :label="tag" :value="tag" />
      </ElSelect>
      <ElSelect v-model="filterStatus" @change="resetPageAndReload">
        <ElOption label="全部状态" value="all" />
        <ElOption label="招募中" value="open" />
        <ElOption label="已满员" value="full" />
        <ElOption label="已成团" value="grouped" />
        <ElOption label="已关闭" value="closed" />
      </ElSelect>
      <!-- 时间筛选（附录 B 2.2：星期 + 时间段） -->
      <ElSelect v-model="filterWeekday" @change="resetPageAndReload">
        <ElOption v-for="opt in weekdayOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
      </ElSelect>
      <ElSelect v-model="filterTimeSlot" @change="resetPageAndReload">
        <ElOption v-for="opt in timeSlotOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
      </ElSelect>
      <!-- 剩余席位筛选（附录 B 2.2：≥1 / ≥2 / 不限） -->
      <ElSelect v-model="filterMinSeats" @change="resetPageAndReload">
        <ElOption v-for="opt in seatsOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
      </ElSelect>
      <ElSelect v-model="sort" @change="resetPageAndReload">
        <ElOption label="最新发布" value="latest" />
        <ElOption label="最早发布" value="oldest" />
        <ElOption label="热度优先" value="hottest" />
      </ElSelect>
    </div>

    <div v-if="loading" class="sk-list">
      <TSkeleton type="list" :rows="1" v-for="i in 5" :key="i" />
    </div>
    <EmptyState
      v-else-if="posts.length === 0"
      icon-name=""
      illustration-name="illust-empty"
      title="暂无招募帖"
      description="暂无符合条件的招募帖，换个筛选条件试试。"
    />
    <div v-else class="recruitment-grid">
      <div
        v-for="p in posts"
        :key="p.id"
        class="recruit-card"
        :class="{ 'status-full-card': p.status === 'full' || p.status === 'closed' || p.status === 'grouped' || p.status === 'dissolved' || p.status === 'archived' }"
        @click="goDetail(p.id)"
      >
        <!-- 状态徽章 -->
        <div class="recruit-header">
          <span
            class="status-badge"
            :class="{
              'status-open': p.status === 'open',
              'status-full': p.status === 'full' || p.status === 'grouped',
              'status-closed': p.status === 'closed' || p.status === 'dissolved' || p.status === 'archived',
            }"
          >{{ statusMap[p.status]?.label }}</span>
          <span class="ruleset-tag">{{ p.ruleset_name || p.ruleset_id }}</span>
        </div>

        <!-- 标题 -->
        <h3 class="recruit-title">{{ p.title }}</h3>

        <!-- 信息行 -->
        <div class="recruit-info">
          <div class="info-row">
            <span class="info-label">GM</span>
            <span class="info-value">{{ p.poster_nickname }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">玩家</span>
            <span class="info-value">{{ p.player_count_joined }}/{{ p.player_count_max }}</span>
            <div class="player-bar">
              <div
                class="player-bar-fill"
                :style="{ width: p.player_count_max ? (p.player_count_joined / p.player_count_max * 100) + '%' : '0%' }"
              ></div>
            </div>
          </div>
          <div v-if="p.module_name" class="info-row">
            <span class="info-label">模组</span>
            <span class="info-value">{{ p.module_name }}</span>
          </div>
          <div v-if="p.tags?.length" class="info-row tags-row">
            <span class="info-label">标签</span>
            <span class="info-value tags-value">
              <span v-for="tag in p.tags.slice(0, 3)" :key="tag" class="inline-tag">{{ tag }}</span>
            </span>
          </div>
        </div>

        <!-- 操作按钮区（由 useApplyButtonState 驱动，附录02 §3.1） -->
        <div class="action-row">
          <button
            class="action-btn"
            :class="{
              'action-btn--primary': !cardButtonState(p).disabled,
              'action-btn--disabled': cardButtonState(p).disabled,
              'action-btn--loading': confirmingId === p.id,
            }"
            :disabled="cardButtonState(p).disabled || confirmingId === p.id"
            @click="handleCardAction($event, p)"
          >
            {{ confirmingId === p.id ? '确认中…' : cardButtonState(p).text }}
          </button>
        </div>

        <div class="recruit-footer">
          <span class="post-time">{{ formatDate(p.created_at) }}</span>
        </div>
      </div>
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
.board-title-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.board-title-row h4 { margin: 0; font-size: var(--text-lg); color: var(--color-text-primary); }
.board-title-row span { color: var(--color-text-muted); font-size: var(--text-sm); }
.toolbar {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) repeat(3, minmax(110px, 160px));
  gap: var(--space-2);
  flex-wrap: wrap;
}
.search-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.search-group :deep(.el-input) {
  flex: 1;
  min-width: 0;
}
.search-btn {
  height: 32px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  color: var(--text-body);
  font-size: var(--text-sm);
  cursor: pointer;
}
.search-btn:hover {
  border-color: var(--color-primary, #5B8DB8);
  color: var(--text-primary);
}
/* 时间/席位筛选折行 */
.toolbar > *:nth-child(n+5) {
  grid-column: auto;
}
@media (max-width: 900px) {
  .toolbar {
    grid-template-columns: 1fr 1fr;
  }
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
.post-desc {
  margin-top: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tag-row { margin-top: var(--space-2); display: flex; gap: var(--space-2); flex-wrap: wrap; }
.apply-status { align-items: center; }
.apply-row { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); }
.confirm-btn {
  padding: 2px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-primary, #5B8DB8);
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 10%, transparent);
  color: var(--color-primary, #5B8DB8);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.confirm-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 22%, transparent);
}
.confirm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-row {
  margin-top: var(--space-3);
}
.action-btn {
  width: 100%;
  padding: 6px 12px;
  border-radius: var(--radius-md, 6px);
  border: 1px solid var(--border-default, #E8ECF0);
  font-size: var(--text-sm, 14px);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  background: transparent;
  color: var(--color-text-secondary, #667085);
}
.action-btn--primary {
  border-color: var(--color-primary, #5B8DB8);
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 10%, transparent);
  color: var(--color-primary, #5B8DB8);
}
.action-btn--primary:hover {
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 20%, transparent);
}
.action-btn--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.action-btn--loading {
  opacity: 0.7;
  cursor: wait;
}
.pager { display: flex; justify-content: center; margin-top: var(--space-2); }
.empty { text-align: center; color: var(--color-text-muted); font-size: var(--text-sm); padding: var(--space-6); }
.sk-list { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-2) 0; }

/* ===== 双列紧凑卡片网格 ===== */
.recruitment-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.recruit-card {
  background: var(--surface-card, #fff);
  border: 1px solid var(--border-default, #E8ECF0);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  display: flex;
  flex-direction: column;
}

.recruit-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.1);
}

.status-full-card { opacity: 0.72; }

.recruit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.status-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 500;
  flex-shrink: 0;
}

.status-open   { background: rgba(107, 142, 107, 0.12); color: #6B8E6B; }
.status-full   { background: rgba(184, 84, 80, 0.1);    color: #B85450; }
.status-closed { background: rgba(152, 162, 179, 0.15); color: #98A2B3; }

.ruleset-tag {
  font-size: 11px;
  color: var(--text-secondary, #667085);
  background: var(--surface-hover, #F5F7FA);
  padding: 2px 6px;
  border-radius: 4px;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recruit-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--text-primary, #101828);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recruit-info { display: flex; flex-direction: column; flex: 1; }

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 13px;
}

.info-label {
  color: var(--text-muted, #98A2B3);
  width: 36px;
  flex-shrink: 0;
}

.info-value {
  color: var(--text-body, #344054);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-bar {
  flex: 1;
  height: 4px;
  background: var(--surface-hover, #F5F7FA);
  border-radius: 2px;
  min-width: 40px;
  flex-shrink: 0;
}

.player-bar-fill {
  height: 100%;
  background: #6B8E6B;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.tags-row { align-items: flex-start; }
.tags-value { display: flex; gap: 4px; flex-wrap: wrap; }
.inline-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-hover, #F5F7FA);
  color: var(--text-secondary, #667085);
}

.apply-row { margin-top: 8px; }

.recruit-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-default, #E8ECF0);
}

.post-time { font-size: 11px; color: var(--text-muted, #98A2B3); }

@media (max-width: 768px) {
  .toolbar { grid-template-columns: 1fr; }
  .board-title-row { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 480px) {
  .recruitment-grid { grid-template-columns: 1fr; }
}
</style>
