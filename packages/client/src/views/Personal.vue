<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';
import TInput from '../components/base/TInput.vue';
import TTag from '../components/base/TTag.vue';
import SvgIcon from '../components/SvgIcon.vue';
import { useAuthStore } from '../stores/auth-store';
import { api, getToken } from '../utils/api';
import { useTheme } from '../composables/useTheme';

const router = useRouter();
const authStore = useAuthStore();
const { currentTheme, toggleTheme } = useTheme();

const editing = ref(false);
const editNickname = ref('');
const editIntro = ref('');
const editTags = ref<string[]>([]);
const userDetail = ref<any>(null);
const avatarPreview = ref('');
const avatarInput = ref<HTMLInputElement | null>(null);
const stats = ref({ joinedCampaigns: 0, createdCampaigns: 0, totalHours: 0 });
const userLoading = ref(false);
const userLoadError = ref(false);
const activatingCreator = ref(false);

const roleOptions = [
  { key: 'player', label: '玩家' },
  { key: 'gm', label: 'GM' },
  { key: 'creator', label: '创作者' },
];

const displayUser = computed(() => userDetail.value ?? {
  nickname: authStore.nickname || '游客',
  uid: 0,
  avatar_url: authStore.avatarUrl || '',
  intro: '',
  tags: [] as string[],
  subscription_type: 'free',
  creator_level: 1,
  coins: 0,
});

const uidText = computed(() => {
  const rawUid = String(displayUser.value.uid || displayUser.value.id || 1000001);
  return `UID: ${rawUid.padStart(7, '0').slice(-7)}`;
});

const avatarDisplay = computed(() => avatarPreview.value || displayUser.value.avatar_url || '');

const isCreator = computed(() =>
  displayUser.value.subscription_type === 'creator' ||
  (Array.isArray(displayUser.value.user_type) &&
    (displayUser.value.user_type.includes('creator') || displayUser.value.user_type.includes('admin'))),
);

async function loadUserDetail() {
  userLoading.value = true;
  userLoadError.value = false;
  try {
    const payload = await api.get<{ user?: Record<string, unknown> } | Record<string, unknown>>('/users/me');
    userDetail.value = (payload as { user?: Record<string, unknown> }).user ?? payload;
    if (!Array.isArray(userDetail.value.tags)) userDetail.value.tags = [];
    if (typeof userDetail.value.intro !== 'string') userDetail.value.intro = '';
    authStore.setAuth({
      token: authStore.token,
      userId: userDetail.value.id,
      nickname: userDetail.value.nickname,
      avatarUrl: userDetail.value.avatar_url,
      isCreator: isCreator.value,
    });
  } catch {
    userLoadError.value = true;
    ElMessage.error('用户信息加载失败，请点击重试');
  } finally {
    userLoading.value = false;
  }
}

async function activateCreator() {
  activatingCreator.value = true;
  try {
    await api.post('/users/me/activate-creator');
    ElMessage.success('创作者模式已开通！');
    await loadUserDetail();
  } catch {
    ElMessage.error('开通失败，请确认是否在开发环境');
  } finally {
    activatingCreator.value = false;
  }
}

onMounted(async () => {
  if (!authStore.isLoggedIn) return;
  await loadUserDetail();

  try {
    const data = await api.get<Record<string, unknown>>('/users/me/stats');
    stats.value = {
      joinedCampaigns: Number(data.joined_campaigns ?? 0),
      createdCampaigns: Number(data.created_campaigns ?? 0),
      totalHours: Number(data.total_hours ?? 0),
    };
    return;
  } catch { /* ignore */ }

  // 兼容尚未部署统计接口的环境：从现有战役接口做动态兜底，不使用硬编码。
  try {
    const campaigns = await api.get<unknown[]>('/campaigns');
    const count = Array.isArray(campaigns) ? campaigns.length : 0;
    stats.value = { joinedCampaigns: count, createdCampaigns: count, totalHours: 0 };
  } catch { /* ignore */ }
});

function startEdit() {
  editNickname.value = displayUser.value.nickname;
  editIntro.value = displayUser.value.intro || '';
  editTags.value = Array.isArray(displayUser.value.tags) ? [...displayUser.value.tags] : [];
  avatarPreview.value = displayUser.value.avatar_url || '';
  editing.value = true;
}

async function saveEdit() {
  try {
    const payload = await api.put<{ user?: Record<string, unknown> } | Record<string, unknown>>('/users/me', {
      nickname: editNickname.value,
      avatar_url: avatarPreview.value,
      intro: editIntro.value.slice(0, 200),
      tags: editTags.value,
    });
    const updated = (payload as { user?: Record<string, unknown> }).user ?? payload as Record<string, unknown>;
    const merged = {
      ...displayUser.value,
      ...updated,
      nickname: (updated.nickname as string) ?? editNickname.value,
      avatar_url: (updated.avatar_url as string) ?? avatarPreview.value,
      intro: (updated.intro as string) ?? editIntro.value.slice(0, 200),
        tags: Array.isArray(updated.tags) ? updated.tags as string[] : [...editTags.value],
      };
      userDetail.value = merged;
      authStore.setAuth({
        token: authStore.token,
        userId: String((merged.id as string | number) ?? authStore.userId),
        nickname: merged.nickname as string,
        avatarUrl: merged.avatar_url as string,
      });
      ElMessage.success('资料已保存');
  } catch {
    ElMessage.error('保存失败，请稍后重试');
  }
  editing.value = false;
}

function toggleRole(role: string) {
  if (!editing.value) return;
  if (editTags.value.includes(role)) {
    editTags.value = editTags.value.filter((item) => item !== role);
    return;
  }
  editTags.value = [...editTags.value, role];
}

function copyUid() {
  navigator.clipboard.writeText(uidText.value.replace('UID: ', ''));
  ElMessage.success('UID 已复制');
}

function openAvatarPicker() {
  avatarInput.value?.click();
}

async function uploadAvatar(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as Record<string, string>).error ?? '头像上传失败');
  }

  const data = await res.json();
  return data.url;
}

async function persistAvatar(url: string) {
  const payload = await api.put<{ user?: Record<string, unknown> } | Record<string, unknown>>('/users/me', { avatar_url: url });
  const updated = (payload as { user?: Record<string, unknown> }).user ?? payload as Record<string, unknown>;
  userDetail.value = {
    ...displayUser.value,
    ...updated,
    avatar_url: updated.avatar_url ?? url,
  };
  authStore.setAuth({
    token: authStore.token,
    userId: String(userDetail.value.id ?? authStore.userId),
    nickname: userDetail.value.nickname,
    avatarUrl: userDetail.value.avatar_url,
  });
}

async function onAvatarChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('头像大小不能超过 5MB');
    target.value = '';
    return;
  }
  try {
    const url = await uploadAvatar(file);
    avatarPreview.value = url;
    await persistAvatar(url);
    ElMessage.success('头像上传成功');
  } catch (error: any) {
    ElMessage.error(error?.message ?? '头像上传失败');
  } finally {
    target.value = '';
  }
}

function clearCache() {
  const token = localStorage.getItem('token');
  Object.keys(localStorage).forEach((key) => {
    if (key !== 'token') localStorage.removeItem(key);
  });
  if (token) localStorage.setItem('token', token);
  ElMessage.success('缓存已清除');
}

function logout() {
  authStore.logout();
  router.push('/login');
}

const subMap: Record<string, string> = { free: '免费版', pro: 'Pro 版', creator: '创作者' };
</script>

<template>
  <div class="personal">
    <!-- 用户信息加载骨架 -->
    <TCard v-if="userLoading" padding="lg" shadow class="user-card user-card-skeleton">
      <div class="skeleton-avatar"></div>
      <div class="skeleton-info">
        <div class="skeleton-line w-40"></div>
        <div class="skeleton-line w-24"></div>
        <div class="skeleton-line w-56"></div>
      </div>
    </TCard>

    <!-- 用户信息加载失败 -->
    <TCard v-else-if="userLoadError" padding="lg" shadow class="user-card error-card">
      <div class="error-info">
        <SvgIcon name="icon-settings" :size="32" style="color: var(--color-warning)" />
        <p>用户信息加载失败</p>
        <TButton type="primary" size="sm" @click="loadUserDetail">重试</TButton>
      </div>
    </TCard>

    <!-- 用户信息卡片 -->
    <TCard v-else padding="lg" shadow class="user-card">
      <div class="avatar-wrap" @click="openAvatarPicker" title="点击更换头像">
        <img v-if="avatarDisplay" :src="avatarDisplay" class="avatar" />
        <div v-else class="avatar-placeholder">{{ (displayUser.nickname || '?')[0] }}</div>
        <span class="avatar-tip">更换头像</span>
        <input ref="avatarInput" type="file" class="avatar-input" accept="image/*" @change="onAvatarChange" />
      </div>
      <div class="user-info">
        <div v-if="!editing">
          <div class="nickname">{{ displayUser.nickname }}</div>
          <div class="uid" @click="copyUid">{{ uidText }}</div>
          <div class="sub-type">{{ subMap[displayUser.subscription_type] ?? '免费版' }}</div>
          <p class="intro">{{ displayUser.intro || '这个人很神秘，还没有留下简介。' }}</p>
          <div class="role-tags">
            <TTag v-for="role in roleOptions" :key="role.key" :color="(displayUser.tags || []).includes(role.key) ? 'primary' : 'default'" size="sm">
              {{ role.label }}
            </TTag>
          </div>
        </div>
        <div v-else class="edit-form">
          <TInput v-model="editNickname" placeholder="昵称" />
          <textarea
            v-model="editIntro"
            class="intro-input"
            rows="4"
            maxlength="200"
            placeholder="写点什么介绍自己吧（最多 200 字）"
          />
          <div class="intro-count">{{ editIntro.length }}/200</div>
          <div class="role-tags editable">
            <TTag
              v-for="role in roleOptions"
              :key="role.key"
              :color="editTags.includes(role.key) ? 'primary' : 'default'"
              size="sm"
              class="tag-toggle"
              @click="toggleRole(role.key)"
            >
              {{ role.label }}
            </TTag>
          </div>
        </div>
        <div class="edit-btn">
          <TButton v-if="!editing" type="secondary" size="sm" @click="startEdit">编辑资料</TButton>
          <template v-else>
            <TButton type="primary" size="sm" @click="saveEdit">保存</TButton>
            <TButton type="ghost" size="sm" @click="editing = false">取消</TButton>
          </template>
        </div>
      </div>
      <div class="coins">
        <span class="coins-label">金币</span>
        <span class="coins-value">{{ displayUser.coins ?? 0 }}</span>
      </div>
    </TCard>

    <!-- 首屏创作台入口卡片（仅创作者可见） -->
    <TCard v-if="isCreator && !userLoading" padding="md" class="creator-entry-card" @click="router.push('/creator')">
      <div class="creator-entry-inner">
        <span class="creator-entry-icon"><SvgIcon name="icon-workshop" :size="24" /></span>
        <div class="creator-entry-text">
          <div class="creator-entry-title">创作台</div>
          <div class="creator-entry-desc">管理规则集、模组与素材</div>
        </div>
        <SvgIcon name="icon-menu" :size="16" style="color: var(--color-text-muted); margin-left: auto" />
      </div>
    </TCard>

    <!-- 开通创作者模式（仅测试用，非创作者可见） -->
    <TCard v-if="!isCreator && !userLoading && authStore.isLoggedIn" padding="md" class="activate-creator-card">
      <div class="activate-creator-inner">
        <SvgIcon name="icon-workshop" :size="20" style="color: var(--color-text-muted); flex-shrink:0" />
        <div class="activate-creator-text">
          <div class="activate-creator-title">开通创作者模式 <span class="dev-badge">测试</span></div>
          <div class="activate-creator-desc">跳过审核，立即体验创作台功能</div>
        </div>
        <TButton type="secondary" size="sm" :loading="activatingCreator" @click.stop="activateCreator">开通</TButton>
      </div>
    </TCard>

    <TCard padding="md" class="stats-card">
      <div class="stats-item">
        <span class="stats-label">参与团数</span>
        <strong class="stats-value">{{ stats.joinedCampaigns }}</strong>
      </div>
      <div class="stats-item">
        <span class="stats-label">创建团数</span>
        <strong class="stats-value">{{ stats.createdCampaigns }}</strong>
      </div>
      <div class="stats-item">
        <span class="stats-label">总跑团时长</span>
        <strong class="stats-value">{{ stats.totalHours }}h</strong>
      </div>
    </TCard>

    <div class="menu-list quick-entry">
      <div class="menu-item" @click="router.push('/mine/characters')">
        <SvgIcon name="icon-user" :size="20" />
        <span>我的角色卡</span>
      </div>
      <div class="menu-item" @click="router.push('/rooms')">
        <SvgIcon name="icon-menu" :size="20" />
        <span>我的房间</span>
      </div>
    </div>

    <!-- 功能列表 -->
    <div class="menu-list">
      <div class="menu-item" @click="toggleTheme">
        <SvgIcon :name="currentTheme === 'day' ? 'icon-moon' : 'icon-sun'" :size="20" />
        <span>{{ currentTheme === 'day' ? '切换深色模式' : '切换浅色模式' }}</span>
      </div>
      <div class="menu-item" @click="router.push('/mine/security')">
        <SvgIcon name="icon-lock" :size="20" />
        <span>账号安全</span>
      </div>
      <div class="menu-item" @click="router.push('/mine/notifications')">
        <SvgIcon name="icon-bell" :size="20" />
        <span>消息通知设置</span>
      </div>
      <div class="menu-item" @click="router.push('/mine/privacy')">
        <SvgIcon name="icon-user" :size="20" />
        <span>隐私设置</span>
      </div>
      <div class="menu-item" @click="router.push('/mine/about')">
        <SvgIcon name="icon-workshop" :size="20" />
        <span>关于我们</span>
      </div>
      <div class="menu-item" @click="clearCache">
        <SvgIcon name="icon-settings" :size="20" />
        <span>清除缓存</span>
      </div>
      <div class="menu-item danger" @click="logout">
        <SvgIcon name="icon-lock" :size="20" />
        <span>退出登录</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.personal { max-width: 600px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-4); }
.user-card { display: flex; align-items: flex-start; gap: var(--space-4); flex-wrap: wrap; }
.avatar-wrap { flex-shrink: 0; position: relative; cursor: pointer; }
.avatar, .avatar-placeholder {
  width: 72px; height: 72px; border-radius: 50%;
}
.avatar-tip {
  position: absolute;
  left: 50%;
  bottom: -18px;
  transform: translateX(-50%);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.avatar-input { display: none; }
.avatar-placeholder {
  background: var(--color-accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: var(--text-2xl); font-weight: 700;
}
.user-info { flex: 1; }
.nickname { font-size: var(--text-xl); font-weight: 700; }
.uid { font-size: var(--text-sm); color: var(--color-text-muted); font-family: var(--font-mono); margin: 2px 0; cursor: pointer; }
.sub-type { font-size: var(--text-sm); color: var(--color-accent); }
.intro { margin: var(--space-2) 0; font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.6; }
.intro-input {
  width: 100%;
  margin-top: 8px;
  border: 1px solid var(--color-input-border);
  border-radius: var(--radius-md);
  background: var(--color-input-bg);
  padding: 10px;
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  resize: vertical;
}
.intro-count { text-align: right; color: var(--color-text-muted); font-size: var(--text-xs); margin-top: 4px; }
.role-tags { margin-top: var(--space-2); display: flex; flex-wrap: wrap; gap: var(--space-2); }
.role-tags.editable .tag-toggle { cursor: pointer; }
.edit-btn { margin-top: var(--space-2); display: flex; gap: var(--space-2); }
.coins { margin-left: auto; text-align: right; }
.coins-label { font-size: var(--text-xs); color: var(--color-text-muted); display: block; }
.coins-value { font-size: var(--text-xl); font-weight: 700; color: var(--color-warning); }
.stats-card { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.stats-item { background: var(--color-page-bg); border-radius: var(--radius-md); padding: var(--space-3); text-align: center; }
.stats-label { display: block; color: var(--color-text-muted); font-size: var(--text-xs); margin-bottom: 6px; }
.stats-value { font-size: var(--text-lg); color: var(--color-text-primary); }
.menu-list { display: flex; flex-direction: column; gap: 1px; background: var(--color-card-border); border-radius: var(--radius-lg); overflow: hidden; }
.quick-entry .menu-item { font-weight: 600; }
.menu-item {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-4); background: var(--color-card-bg);
  cursor: pointer; color: var(--color-text-primary); font-size: var(--text-sm);
  transition: background var(--transition-fast);
}
.menu-item:hover { background: var(--color-page-bg); }
.menu-item.danger { color: var(--color-danger); }

/* 骨架屏 */
.user-card-skeleton { min-height: 96px; }
.skeleton-avatar {
  width: 72px; height: 72px; border-radius: 50%;
  background: var(--color-card-border);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
  flex-shrink: 0;
}
.skeleton-info { flex: 1; display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-1); }
.skeleton-line {
  height: 14px; border-radius: var(--radius-sm);
  background: var(--color-card-border);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}
.w-40 { width: 40%; }
.w-24 { width: 24%; }
.w-56 { width: 56%; }
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* 错误卡片 */
.error-card { min-height: 96px; }
.error-info { width: 100%; display: flex; flex-direction: column; align-items: center; gap: var(--space-3); padding: var(--space-4) 0; }
.error-info p { color: var(--color-text-muted); font-size: var(--text-sm); margin: 0; }

/* 创作台入口卡片 */
.creator-entry-card {
  cursor: pointer;
  border: 1px solid var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 6%, var(--color-card-bg));
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
}
.creator-entry-card:hover {
  background: color-mix(in srgb, var(--color-accent) 12%, var(--color-card-bg));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 30%, transparent);
}
.creator-entry-inner { display: flex; align-items: center; gap: var(--space-3); }
.creator-entry-icon { color: var(--color-accent); flex-shrink: 0; }
.creator-entry-title { font-size: var(--text-base); font-weight: 700; color: var(--color-accent); }
.creator-entry-desc { font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 2px; }

/* 开通创作者（测试用） */
.activate-creator-card { border: 1px dashed var(--color-card-border); }
.activate-creator-inner { display: flex; align-items: center; gap: var(--space-3); }
.activate-creator-text { flex: 1; min-width: 0; }
.activate-creator-title { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); display: flex; align-items: center; gap: var(--space-2); }
.activate-creator-desc { font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 2px; }
.dev-badge {
  font-size: 10px; font-weight: 500; padding: 1px 5px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
  color: var(--color-warning);
  border: 1px solid color-mix(in srgb, var(--color-warning) 35%, transparent);
}

@media (max-width: 640px) {
  .stats-card { grid-template-columns: 1fr; }
}
</style>
