<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth-store';
import { api } from '../utils/api';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const uid = route.params.uid as string;

type TabKey = 'player' | 'gm' | 'creator';
const activeTab = ref<TabKey>('player');

interface UserProfile {
  id: string;
  uid?: number;
  nickname: string;
  avatar_url?: string;
  intro?: string;
  tags?: string[];
  subscription_type?: string;
  creator_level?: number;
  follower_count?: number;
  following_count?: number;
}

const profile = ref<UserProfile | null>(null);
const loading = ref(true);
const following = ref(false);
const followLoading = ref(false);
const playerCampaigns = ref<any[]>([]);
const hostedCampaigns = ref<any[]>([]);

const tabLabels: { key: TabKey; label: string }[] = [
  { key: 'player', label: '玩家' },
  { key: 'gm', label: 'GM' },
  { key: 'creator', label: '创作者' },
];

// Badge computation
function getBadges(p: UserProfile) {
  const badges: string[] = [];
  if (p.tags?.includes('player') || true) badges.push('玩家');
  if (p.tags?.includes('gm')) badges.push('GM');
  if (p.tags?.includes('creator')) badges.push('创作者');
  return badges;
}

const badgeColor: Record<string, string> = {
  '玩家': 'default',
  'GM': 'primary',
  '创作者': 'accent',
};

const uidText = (p: UserProfile) => {
  const rawUid = String(p.uid || p.id || uid || 0);
  return `UID: ${rawUid.padStart(7, '0').slice(-7)}`;
};

const isOwnProfile = () => String(authStore.userId) === String(uid);

// Placeholder stats for player/gm/creator tabs
const playerStats = ref({ joinedCampaigns: 0, totalSessions: 0, avgRating: '-' });
const gmStats = ref({ hostedCampaigns: 0, totalPlayers: 0, completionRate: '-' });
const creatorWorks = ref<{ id: string; name: string; type: string; status: string }[]>([]);

async function loadProfile() {
  loading.value = true;
  try {
    profile.value = await api.get(`/users/${uid}/profile`);
    playerCampaigns.value = await api.get(`/users/${uid}/campaigns`);
    hostedCampaigns.value = await api.get(`/users/${uid}/hosted-campaigns`);
    creatorWorks.value = await api.get(`/users/${uid}/created-modules`);
    playerStats.value.joinedCampaigns = playerCampaigns.value.length;
    playerStats.value.totalSessions = playerCampaigns.value.length;
    gmStats.value.hostedCampaigns = hostedCampaigns.value.length;
    gmStats.value.totalPlayers = hostedCampaigns.value.length * 4;
    // 获取当前登录用户对该 UID 的关注状态
    if (authStore.isLoggedIn && !isOwnProfile()) {
      const status = await api.get<{ following: boolean }>(`/users/${uid}/follow-status`).catch(() => ({ following: false }));
      following.value = status.following;
    }
  } catch {
    profile.value = { id: uid, nickname: `用户 ${uid}`, tags: [] };
  } finally { loading.value = false; }
}

async function toggleFollow() {
  if (!authStore.isLoggedIn) { ElMessage.warning('请先登录'); return; }
  followLoading.value = true;
  try {
    if (following.value) {
      await api.delete(`/users/${uid}/follow`);
      following.value = false;
      if (profile.value) profile.value.follower_count = Math.max(0, (profile.value.follower_count ?? 1) - 1);
      ElMessage.success('已取消关注');
    } else {
      const res = await api.post<{ follower_count: number }>(`/users/${uid}/follow`, {});
      following.value = true;
      if (profile.value) profile.value.follower_count = res.follower_count;
      ElMessage.success('已关注');
    }
  } catch {
    ElMessage.error('操作失败');
  } finally { followLoading.value = false; }
}

function sendDirectMessage() {
  if (!authStore.isLoggedIn) { ElMessage.warning('请先登录'); return; }
  if (!profile.value) return;
  router.push({ path: '/messages', query: { with: profile.value.id } });
}

onMounted(loadProfile);
</script>

<template>
  <div class="user-profile">
    <div v-if="loading" class="loading-hint">加载中…</div>

    <template v-else-if="profile">
      <!-- ── 头部 ── -->
      <div class="profile-header">
        <div class="avatar-wrap">
          <div class="avatar-circle" :style="profile.avatar_url ? `background-image:url(${profile.avatar_url})` : ''">
            <span v-if="!profile.avatar_url">{{ profile.nickname?.charAt(0).toUpperCase() }}</span>
          </div>
        </div>
        <div class="user-meta">
          <div class="user-name-row">
            <h1 class="user-name">{{ profile.nickname }}</h1>
            <span v-for="badge in getBadges(profile)" :key="badge" class="badge" :class="badgeColor[badge]">{{ badge }}</span>
          </div>
          <div class="uid-text">{{ uidText(profile) }}</div>
          <p v-if="profile.intro" class="user-intro">{{ profile.intro }}</p>
          <div class="stat-row">
            <span class="stat-item"><strong>{{ profile.follower_count ?? 0 }}</strong> 粉丝</span>
            <span class="stat-item"><strong>{{ profile.following_count ?? 0 }}</strong> 关注</span>
          </div>
        </div>
        <div class="action-wrap" v-if="!isOwnProfile()">
          <button class="follow-btn" :class="{ following }" @click="toggleFollow" :disabled="followLoading">
            {{ following ? '已关注' : '关注' }}
          </button>
          <button class="msg-btn" @click="sendDirectMessage">私信</button>
        </div>
      </div>

      <!-- ── Tab 导航 ── -->
      <div class="profile-tabs">
        <button
          v-for="t in tabLabels"
          :key="t.key"
          class="tab-btn"
          :class="{ active: activeTab === t.key }"
          @click="activeTab = t.key"
        >{{ t.label }}</button>
      </div>

      <!-- ── Tab 内容 ── -->
      <div class="tab-content">

        <!-- 玩家 -->
        <template v-if="activeTab === 'player'">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">{{ playerStats.joinedCampaigns }}</div>
              <div class="stat-label">参团次数</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ playerStats.totalSessions }}</div>
              <div class="stat-label">游玩场次</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ playerStats.avgRating }}</div>
              <div class="stat-label">平均评分</div>
            </div>
          </div>
          <div class="badge-section">
            <h3 class="section-title">信誉徽章</h3>
            <div class="badge-row">
              <span class="rep-badge honor">🏅 守时玩家</span>
              <span class="rep-badge coop">🤝 配合出色</span>
            </div>
          </div>
          <div class="review-section">
            <h3 class="section-title">参团记录</h3>
            <div v-if="playerCampaigns.length === 0" class="empty-hint">暂无公开参团记录</div>
            <div v-else class="campaign-list">
              <div v-for="campaign in playerCampaigns" :key="campaign.id" class="campaign-item">
                <strong>{{ campaign.name }}</strong>
                <span>{{ campaign.status }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- GM -->
        <template v-else-if="activeTab === 'gm'">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">{{ gmStats.hostedCampaigns }}</div>
              <div class="stat-label">开团场次</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ gmStats.totalPlayers }}</div>
              <div class="stat-label">接触玩家数</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ gmStats.completionRate }}</div>
              <div class="stat-label">完团率</div>
            </div>
          </div>
          <div class="badge-section">
            <h3 class="section-title">风格徽章</h3>
            <div class="badge-row">
              <span class="rep-badge style">🎭 叙事大师</span>
              <span class="rep-badge style">⚔️ 战斗专家</span>
            </div>
          </div>
          <div class="review-section">
            <h3 class="section-title">主持记录</h3>
            <div v-if="hostedCampaigns.length === 0" class="empty-hint">暂无公开主持记录</div>
            <div v-else class="campaign-list">
              <div v-for="campaign in hostedCampaigns" :key="campaign.id" class="campaign-item">
                <strong>{{ campaign.name }}</strong>
                <span>{{ campaign.status }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- 创作者 -->
        <template v-else-if="activeTab === 'creator'">
          <div v-if="creatorWorks.length === 0" class="empty-hint">暂无公开作品</div>
          <div v-else class="works-grid">
            <div v-for="work in creatorWorks" :key="work.id" class="work-card">
              <div class="work-type">{{ work.type === 'ruleset' ? '规则包' : '模组' }}</div>
              <div class="work-name">{{ work.name }}</div>
              <span class="work-status">{{ work.status === 'published' ? '已发布' : '草稿' }}</span>
            </div>
          </div>
        </template>
      </div>
    </template>

    <div v-else class="empty-hint">用户不存在</div>
  </div>
</template>

<style scoped>
.user-profile { max-width: 800px; margin: 0 auto; padding: var(--space-6) var(--space-4); }
.loading-hint, .empty-hint { text-align: center; color: var(--text-muted); padding: var(--space-8); font-size: var(--text-sm); }

/* ── Header ── */
.profile-header { display: flex; gap: var(--space-5); align-items: flex-start; margin-bottom: var(--space-6); }
.avatar-wrap { flex-shrink: 0; }
.avatar-circle {
  width: 80px; height: 80px; border-radius: 50%; background: var(--color-accent);
  background-size: cover; background-position: center;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: var(--text-2xl); font-weight: 700;
}
.user-meta { flex: 1; min-width: 0; }
.user-name-row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-bottom: 4px; }
.user-name { font-size: var(--text-2xl); font-weight: 700; color: var(--text-primary); }
.badge {
  font-size: var(--text-xs); padding: 2px 8px; border-radius: 100px;
  background: color-mix(in srgb, var(--text-muted) 15%, transparent); color: var(--text-muted);
}
.badge.primary { background: color-mix(in srgb, var(--color-accent) 15%, transparent); color: var(--color-accent); }
.badge.accent { background: color-mix(in srgb, #e8a87c 20%, transparent); color: #b5651d; }
.uid-text { font-size: var(--text-xs); color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 6px; }
.user-intro { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-2); }
.stat-row { display: flex; gap: var(--space-4); }
.stat-item { font-size: var(--text-sm); color: var(--text-secondary); }
.stat-item strong { color: var(--text-primary); font-weight: 700; }
.action-wrap { display: flex; flex-direction: column; gap: var(--space-2); flex-shrink: 0; }
.follow-btn {
  padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--color-accent);
  background: var(--color-accent); color: #fff; cursor: pointer; font-size: var(--text-sm); min-width: 80px;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.follow-btn.following { background: none; color: var(--text-secondary); border-color: var(--border-default); }
.follow-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.msg-btn { padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--border-default); background: none; color: var(--text-primary); cursor: pointer; font-size: var(--text-sm); }

/* ── Tabs ── */
.profile-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border-default); margin-bottom: var(--space-5); }
.tab-btn {
  padding: var(--space-2) var(--space-5); border: none; background: none; cursor: pointer;
  font-size: var(--text-sm); color: var(--text-secondary); border-bottom: 2px solid transparent;
  margin-bottom: -1px; transition: color var(--transition-fast), border-color var(--transition-fast);
}
.tab-btn:hover { color: var(--text-primary); }
.tab-btn.active { color: var(--color-accent); border-bottom-color: var(--color-accent); font-weight: 600; }

/* ── Stats ── */
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4); margin-bottom: var(--space-5); }
.stat-card { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-5); text-align: center; }
.stat-value { font-size: var(--text-2xl); font-weight: 700; color: var(--text-primary); }
.stat-label { font-size: var(--text-xs); color: var(--text-muted); margin-top: 4px; }

/* ── Badges / Reviews ── */
.badge-section, .review-section { margin-bottom: var(--space-5); }
.section-title { font-size: var(--text-base); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-3); }
.badge-row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.rep-badge { padding: var(--space-1) var(--space-3); border-radius: 100px; font-size: var(--text-sm); background: var(--surface-hover); color: var(--text-primary); }
.campaign-list { display: flex; flex-direction: column; gap: var(--space-2); }
.campaign-item { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--surface-card); }
.campaign-item strong { color: var(--text-primary); }
.campaign-item span { color: var(--text-secondary); font-size: var(--text-xs); }

/* ── Works ── */
.works-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-3); }
.work-card { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-4); }
.work-type { font-size: var(--text-xs); color: var(--text-muted); margin-bottom: 4px; }
.work-name { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-2); }
.work-status { font-size: var(--text-xs); padding: 1px 8px; border-radius: 100px; background: color-mix(in srgb, #6B8E6B 15%, transparent); color: #6B8E6B; }

@media (max-width: 600px) {
  .profile-header { flex-direction: column; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
