<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';
import TInput from '../components/base/TInput.vue';
import TTag from '../components/base/TTag.vue';
import TSkeleton from '../components/base/TSkeleton.vue';
import SvgIcon from '../components/SvgIcon.vue';
import { useAuthStore } from '../stores/auth-store';
import { getMe, getMyStats, updateMyProfile } from '../api/users';
import { listMyCampaigns } from '../api/campaigns';
import { getToken } from '../utils/api';

const router = useRouter();
const authStore = useAuthStore();

// ── Tab 定义 ────────────────────────────────────────────────────────────────
type TuantuTab = 'card' | 'character' | 'studio' | 'collection' | 'history' | 'bond';
const activeTab = ref<TuantuTab>('card');
const tabs: { key: TuantuTab; label: string; icon: string }[] = [
  { key: 'card',       label: '个人名片', icon: 'icon-user' },
  { key: 'character',  label: '角色档案', icon: 'icon-ruleset' },
  { key: 'studio',     label: '创作台',   icon: 'icon-studio' },
  { key: 'collection', label: '个人馆藏', icon: 'icon-market' },
  { key: 'history',    label: '成长履迹', icon: 'icon-journey' },
  { key: 'bond',       label: '羁绊名录', icon: 'icon-recruit' },
];

// ── 用户数据 ─────────────────────────────────────────────────────────────────
const userLoading = ref(false);
const userLoadError = ref(false);
const userDetail = ref<any>(null);
const avatarPreview = ref('');
const avatarInput = ref<HTMLInputElement | null>(null);
const stats = ref({ joinedCampaigns: 0, createdCampaigns: 0, totalHours: 0 });

const displayUser = computed(() => userDetail.value ?? {
  nickname: authStore.nickname || '用户',
  uid: 0,
  avatar_url: authStore.avatarUrl || '',
  intro: '',
  tags: [] as string[],
});

const avatarDisplay = computed(() => avatarPreview.value || displayUser.value.avatar_url || '');

const uidText = computed(() => {
  const rawUid = String(displayUser.value.uid || displayUser.value.id || 0);
  return `UID: ${rawUid.padStart(7, '0').slice(-7)}`;
});

async function loadUser() {
  if (!authStore.isLoggedIn) return;
  userLoading.value = true;
  userLoadError.value = false;
  try {
    const raw = await getMe();
    const u = (raw as any).user ?? raw as any;
    if (!Array.isArray(u.tags)) u.tags = [];
    if (typeof u.intro !== 'string') u.intro = '';
    userDetail.value = u;
    authStore.setAuth({
      token: authStore.token,
      userId: u.id,
      nickname: u.nickname,
      avatarUrl: u.avatar_url,
      isCreator: u.user_type?.includes('creator') || u.subscription_type === 'creator',
    });
  } catch {
    // 降级：用 auth-store 缓存数据渲染，不整页报错
    if (authStore.nickname) {
      userDetail.value = {
        nickname: authStore.nickname,
        avatar_url: authStore.avatarUrl || '',
        uid: authStore.userId,
        id: authStore.userId,
        intro: '',
        tags: [],
      };
    } else {
      userLoadError.value = true;
    }
    ElMessage.warning('用户信息加载失败，显示缓存数据');
  } finally {
    userLoading.value = false;
  }
}

onMounted(async () => {
  if (!authStore.isLoggedIn) {
    router.replace('/login');
    return;
  }
  await loadUser();
  try {
    const data = await getMyStats();
    stats.value = {
      joinedCampaigns: Number(data.joined_campaigns ?? 0),
      createdCampaigns: Number(data.created_campaigns ?? 0),
      totalHours: Number(data.total_hours ?? 0),
    };
  } catch {
    try {
      const campaigns = await listMyCampaigns();
      const count = Array.isArray(campaigns) ? campaigns.length : 0;
      stats.value = { joinedCampaigns: count, createdCampaigns: count, totalHours: 0 };
    } catch { /* ignore */ }
  }
});

// ── 编辑资料 ─────────────────────────────────────────────────────────────────
const editing = ref(false);
const editNickname = ref('');
const editIntro = ref('');
const editTags = ref<string[]>([]);

const roleOptions = [
  { key: 'player', label: '玩家' },
  { key: 'gm', label: 'GM' },
  { key: 'creator', label: '创作者' },
];

function startEdit() {
  editNickname.value = displayUser.value.nickname;
  editIntro.value = displayUser.value.intro || '';
  editTags.value = Array.isArray(displayUser.value.tags) ? [...displayUser.value.tags] : [];
  avatarPreview.value = displayUser.value.avatar_url || '';
  editing.value = true;
}

async function saveEdit() {
  try {
    const raw = await updateMyProfile({
      nickname: editNickname.value,
      avatar_url: avatarPreview.value,
      intro: editIntro.value.slice(0, 200),
      tags: editTags.value,
    });
    const updated = (raw as any).user ?? raw as any;
    userDetail.value = { ...displayUser.value, ...updated };
    authStore.setAuth({
      token: authStore.token,
      userId: String(userDetail.value.id ?? authStore.userId),
      nickname: userDetail.value.nickname,
      avatarUrl: userDetail.value.avatar_url,
    });
    ElMessage.success('资料已保存');
  } catch {
    ElMessage.error('保存失败，请稍后重试');
  }
  editing.value = false;
}

function toggleRole(role: string) {
  if (!editing.value) return;
  editTags.value = editTags.value.includes(role)
    ? editTags.value.filter((r) => r !== role)
    : [...editTags.value, role];
}

// ── 头像上传 ─────────────────────────────────────────────────────────────────
function openAvatarPicker() {
  avatarInput.value?.click();
}

async function uploadAvatar(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: fd,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as any).error ?? '头像上传失败');
  }
  return (await res.json()).url;
}

async function onAvatarChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { ElMessage.error('头像大小不能超过 5MB'); return; }
  try {
    const url = await uploadAvatar(file);
    avatarPreview.value = url;
    const raw = await updateMyProfile({ avatar_url: url });
    const u = (raw as any).user ?? raw as any;
    userDetail.value = { ...displayUser.value, ...u, avatar_url: u.avatar_url ?? url };
    authStore.setAuth({ token: authStore.token, userId: String(userDetail.value.id), nickname: userDetail.value.nickname, avatarUrl: url });
    ElMessage.success('头像已更新');
  } catch (e: any) {
    ElMessage.error(e?.message ?? '头像上传失败');
  } finally {
    (event.target as HTMLInputElement).value = '';
  }
}
</script>

<template>
  <div class="tuantu-page">
    <!-- 加载骨架 -->
    <div v-if="userLoading" class="tuantu-loading">
      <div class="skeleton-name-card">
        <div class="sk-avatar" />
        <div class="sk-lines">
          <div class="sk-line w-32" />
          <div class="sk-line w-20" />
        </div>
      </div>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="userLoadError" class="error-block">
      <p style="color:var(--color-text-muted)">用户信息加载失败</p>
      <TButton type="primary" size="sm" @click="loadUser">重试</TButton>
    </div>

    <!-- 主体 -->
    <template v-else>
      <!-- 个人名片顶部区域 -->
      <div class="name-card">
        <div class="avatar-wrap" @click="openAvatarPicker" title="点击更换头像">
          <img v-if="avatarDisplay" :src="avatarDisplay" class="avatar" alt="头像" />
          <div v-else class="avatar-placeholder">{{ (displayUser.nickname || '?')[0] }}</div>
          <span class="avatar-tip">更换</span>
          <input ref="avatarInput" type="file" class="sr-only" accept="image/*" @change="onAvatarChange" />
        </div>

        <div class="name-info">
          <div class="nickname">{{ displayUser.nickname }}</div>
          <div class="uid-row">
            <span class="uid">{{ uidText }}</span>
            <div class="identity-tags">
              <TTag v-for="tag in (displayUser.tags || [])" :key="tag" color="primary" size="sm">{{ tag }}</TTag>
            </div>
          </div>
          <p class="intro">{{ displayUser.intro || '准备开启第一场叙事' }}</p>
        </div>

        <!-- 数据统计 -->
        <div class="stats-row">
          <div class="stat-item">
            <span class="stat-num">{{ stats.joinedCampaigns }}</span>
            <span class="stat-label">跑团次数</span>
          </div>
          <div class="stat-item">
            <span class="stat-num">{{ stats.createdCampaigns }}</span>
            <span class="stat-label">带团次数</span>
          </div>
        </div>

        <!-- 操作 -->
        <div class="name-card-actions">
          <TButton v-if="!editing" type="secondary" size="sm" @click="startEdit">编辑资料</TButton>
          <template v-else>
            <TButton type="primary" size="sm" @click="saveEdit">保存</TButton>
            <TButton type="ghost" size="sm" @click="editing = false">取消</TButton>
          </template>
          <TButton type="ghost" size="sm" @click="router.push(`/u/${displayUser.uid || displayUser.id}`)">查看主页</TButton>
        </div>

        <!-- 编辑表单（内联，仅编辑态显示） -->
        <div v-if="editing" class="edit-form">
          <TInput v-model="editNickname" placeholder="昵称" />
          <textarea
            v-model="editIntro"
            class="intro-input"
            rows="3"
            maxlength="200"
            placeholder="写点什么介绍自己吧（最多 200 字）"
          />
          <div class="intro-count">{{ editIntro.length }}/200</div>
          <div class="role-tags">
            <TTag
              v-for="role in roleOptions"
              :key="role.key"
              :color="editTags.includes(role.key) ? 'primary' : 'default'"
              size="sm"
              style="cursor:pointer"
              @click="toggleRole(role.key)"
            >{{ role.label }}</TTag>
          </div>
        </div>
      </div>

      <!-- 模块 Tab 导航 -->
      <div class="module-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="module-tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <SvgIcon :name="tab.icon" :size="16" />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tab 内容区 -->
      <div class="module-content">
        <!-- 个人名片：名片对外展示设置 -->
        <div v-if="activeTab === 'card'" class="module-panel">
          <div class="module-tip">
            <SvgIcon name="icon-user" :size="20" />
            <span>控制哪些模块内容对他人可见。点击「查看主页」预览他人视角。</span>
          </div>
          <div class="empty-tip">内容展示设置即将上线</div>
        </div>

        <!-- 角色档案 -->
        <div v-else-if="activeTab === 'character'" class="module-panel">
          <div class="module-tip">
            <SvgIcon name="icon-ruleset" :size="20" />
            <span>所有创建的角色卡，按在用 / 归档 / 收藏分类陈列。</span>
          </div>
          <div class="module-actions">
            <TButton type="secondary" size="sm" @click="router.push('/character/editor')">新建角色卡</TButton>
            <TButton type="ghost" size="sm" @click="router.push('/tuantu/characters')">查看全部</TButton>
          </div>
          <div class="empty-tip">暂无角色档案，快去创建你的第一张角色卡吧</div>
        </div>

        <!-- 创作台（叙途内快速入口，创作者可见） -->
        <div v-else-if="activeTab === 'studio'" class="module-panel">
          <div class="module-tip">
            <SvgIcon name="icon-studio" :size="20" />
            <span>模组创作全流程管理，规则包与讨论区内容。</span>
          </div>
          <template v-if="authStore.isCreator">
            <div class="module-actions">
              <TButton type="primary" size="sm" @click="router.push('/creator')">进入创作台</TButton>
            </div>
          </template>
          <div v-else class="empty-tip">
            <p>创作台仅创作者可用</p>
            <TButton type="secondary" size="sm" @click="router.push('/settings')">了解如何成为创作者</TButton>
          </div>
        </div>

        <!-- 个人馆藏 -->
        <div v-else-if="activeTab === 'collection'" class="module-panel">
          <div class="module-tip">
            <SvgIcon name="icon-market" :size="20" />
            <span>已获取模组（按已玩 / 待玩分类）、规则包收藏。</span>
          </div>
          <div class="module-actions">
            <TButton type="ghost" size="sm" @click="router.push('/tuantu/assets')">查看全部馆藏</TButton>
          </div>
          <div class="empty-tip">暂无馆藏，去探索发现好内容吧</div>
        </div>

        <!-- 成长履迹 -->
        <div v-else-if="activeTab === 'history'" class="module-panel">
          <div class="module-tip">
            <SvgIcon name="icon-journey" :size="20" />
            <span>全维度成就体系、专属勋章与成长里程碑。</span>
          </div>
          <div class="empty-tip">成长履迹即将上线</div>
        </div>

        <!-- 羁绊名录 -->
        <div v-else-if="activeTab === 'bond'" class="module-panel">
          <div class="module-tip">
            <SvgIcon name="icon-recruit" :size="20" />
            <span>跑团搭子自动归档、团本羁绊小组、关注 / 粉丝管理。</span>
          </div>
          <div class="empty-tip">羁绊名录即将上线</div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tuantu-page {
  max-width: 720px;
  margin: 0 auto;
  padding-bottom: var(--space-8);
}

/* ── 名片顶部 ── */
.name-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-4);
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-4);
}

.avatar-wrap {
  position: relative;
  width: 72px;
  height: 72px;
  cursor: pointer;
  flex-shrink: 0;
}
.avatar, .avatar-placeholder {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-2xl);
  font-weight: 700;
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.avatar-tip {
  position: absolute;
  bottom: 0;
  right: 0;
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: 999px;
  font-size: 10px;
  padding: 1px 5px;
  color: var(--color-text-muted);
  pointer-events: none;
}
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }

.name-info { flex: 1; }
.nickname { font-size: var(--text-xl); font-weight: 700; color: var(--color-text-primary); }
.uid-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-1); }
.uid { font-size: var(--text-xs); color: var(--color-text-muted); }
.identity-tags { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.intro {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.stats-row {
  display: flex;
  gap: var(--space-6);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--color-card-border);
  border-bottom: 1px solid var(--color-card-border);
}
.stat-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.stat-num { font-size: var(--text-lg); font-weight: 700; color: var(--color-text-primary); }
.stat-label { font-size: var(--text-xs); color: var(--color-text-muted); }

.name-card-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }

/* 编辑表单 */
.edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-top: 1px solid var(--color-card-border);
  padding-top: var(--space-3);
}
.intro-input {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  background: var(--color-page-bg);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  font-family: inherit;
}
.intro-input:focus { outline: none; border-color: var(--color-primary); }
.intro-count { font-size: var(--text-xs); color: var(--color-text-muted); text-align: right; }
.role-tags { display: flex; gap: var(--space-2); flex-wrap: wrap; }

/* ── 模块 Tab 导航 ── */
.module-tabs {
  display: flex;
  gap: 0;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--color-card-border);
  margin-bottom: var(--space-4);
}
.module-tabs::-webkit-scrollbar { display: none; }
.module-tab {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}
.module-tab.active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}
.module-tab:hover:not(.active) { color: var(--color-text-primary); }

/* ── 模块内容面板 ── */
.module-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.module-tip {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-primary-light);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}
.module-actions { display: flex; gap: var(--space-2); }
.empty-tip {
  padding: var(--space-8) 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

/* ── 骨架屏 ── */
.tuantu-loading { padding: var(--space-4); }
.skeleton-name-card { display: flex; gap: var(--space-3); align-items: center; }
.sk-avatar { width: 72px; height: 72px; border-radius: 50%; background: var(--color-card-border); animation: pulse 1.2s infinite; }
.sk-lines { flex: 1; display: flex; flex-direction: column; gap: var(--space-2); }
.sk-line { height: 14px; border-radius: var(--radius-sm); background: var(--color-card-border); animation: pulse 1.2s infinite; }
.sk-line.w-32 { width: 128px; }
.sk-line.w-20 { width: 80px; }
@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .4 } }

/* ── 错误块 ── */
.error-block {
  padding: var(--space-8);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}
</style>
