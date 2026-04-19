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

onMounted(async () => {
  if (!authStore.isLoggedIn) return;
  try {
    const res = await fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (res.ok) {
      const payload = await res.json();
      userDetail.value = payload.user ?? payload;
      if (!Array.isArray(userDetail.value.tags)) userDetail.value.tags = [];
      if (typeof userDetail.value.intro !== 'string') userDetail.value.intro = '';
      authStore.setAuth({
        token: authStore.token,
        userId: userDetail.value.id,
        nickname: userDetail.value.nickname,
        avatarUrl: userDetail.value.avatar_url,
      });
    }
  } catch { /* 静默失败，显示缓存数据 */ }

  try {
    const statRes = await fetch('/api/users/me/stats', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (statRes.ok) {
      const data = await statRes.json();
      stats.value = {
        joinedCampaigns: Number(data.joined_campaigns ?? 0),
        createdCampaigns: Number(data.created_campaigns ?? 0),
        totalHours: Number(data.total_hours ?? 0),
      };
      return;
    }
  } catch { /* ignore */ }

  // 兼容尚未部署统计接口的环境：从现有战役接口做动态兜底，不使用硬编码。
  try {
    const campaignRes = await fetch('/api/campaigns', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (campaignRes.ok) {
      const campaigns = await campaignRes.json();
      const count = Array.isArray(campaigns) ? campaigns.length : 0;
      stats.value = {
        joinedCampaigns: count,
        createdCampaigns: count,
        totalHours: 0,
      };
    }
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
    const res = await fetch('/api/users/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify({
        nickname: editNickname.value,
        avatar_url: avatarPreview.value,
        intro: editIntro.value.slice(0, 200),
        tags: editTags.value,
      }),
    });
    if (res.ok) {
      const payload = await res.json().catch(() => ({}));
      const updated = payload.user ?? payload;
      const merged = {
        ...displayUser.value,
        ...updated,
        nickname: updated.nickname ?? editNickname.value,
        avatar_url: updated.avatar_url ?? avatarPreview.value,
        intro: updated.intro ?? editIntro.value.slice(0, 200),
        tags: Array.isArray(updated.tags) ? updated.tags : [...editTags.value],
      };
      userDetail.value = merged;
      authStore.setAuth({
        token: authStore.token,
        userId: String(merged.id ?? authStore.userId),
        nickname: merged.nickname,
        avatarUrl: merged.avatar_url,
      });
      ElMessage.success('资料已保存');
    } else {
      ElMessage.error('保存失败，请稍后重试');
    }
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

function cropToSquare(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
      avatarPreview.value = canvas.toDataURL('image/jpeg', 0.9);
    };
    img.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}

function onAvatarChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('头像大小不能超过 5MB');
    target.value = '';
    return;
  }
  cropToSquare(file);
  target.value = '';
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
    <!-- 用户信息卡片 -->
    <TCard padding="lg" shadow class="user-card">
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
      <div class="menu-item" @click="router.push('/personal/characters')">
        <SvgIcon name="icon-user" :size="20" />
        <span>我的角色卡</span>
      </div>
      <div class="menu-item" @click="router.push('/campaigns')">
        <SvgIcon name="icon-list" :size="20" />
        <span>我的团</span>
      </div>
    </div>

    <!-- 功能列表 -->
    <div class="menu-list">
      <div class="menu-item" @click="toggleTheme">
        <SvgIcon :name="currentTheme === 'day' ? 'icon-moon' : 'icon-sun'" :size="20" />
        <span>{{ currentTheme === 'day' ? '切换深色模式' : '切换浅色模式' }}</span>
      </div>
      <div class="menu-item" @click="router.push('/creator')" v-if="displayUser.subscription_type === 'creator'">
        <SvgIcon name="icon-workshop" :size="20" />
        <span>创作者后台</span>
      </div>
      <div class="menu-item" @click="router.push('/personal/security')">
        <SvgIcon name="icon-lock" :size="20" />
        <span>账号安全</span>
      </div>
      <div class="menu-item" @click="router.push('/personal/notifications')">
        <SvgIcon name="icon-broadcast" :size="20" />
        <span>消息通知设置</span>
      </div>
      <div class="menu-item" @click="router.push('/personal/privacy')">
        <SvgIcon name="icon-user" :size="20" />
        <span>隐私设置</span>
      </div>
      <div class="menu-item" @click="router.push('/personal/about')">
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

@media (max-width: 640px) {
  .stats-card { grid-template-columns: 1fr; }
}
</style>
