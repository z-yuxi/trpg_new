<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';
import TInput from '../components/base/TInput.vue';
import SvgIcon from '../components/SvgIcon.vue';
import { useAuthStore } from '../stores/auth-store';
import { useTheme } from '../composables/useTheme';

const router = useRouter();
const authStore = useAuthStore();
const { currentTheme, toggleTheme } = useTheme();

const editing = ref(false);
const editNickname = ref('');
const editAvatar = ref('');

// Mock 用户数据
const mockUser = ref({
  nickname: authStore.nickname || '游客',
  uid: 1000001,
  avatarUrl: authStore.avatarUrl || '',
  subscription_type: 'free' as 'free' | 'pro' | 'creator',
  creator_level: 1,
  coins: 1024,
});

function startEdit() {
  editNickname.value = mockUser.value.nickname;
  editAvatar.value = mockUser.value.avatarUrl;
  editing.value = true;
}

function saveEdit() {
  mockUser.value.nickname = editNickname.value;
  mockUser.value.avatarUrl = editAvatar.value;
  editing.value = false;
}

function logout() {
  authStore.logout();
  router.push('/login');
}

const subMap = { free: '免费版', pro: 'Pro 版', creator: '创作者' };
</script>

<template>
  <div class="personal">
    <!-- 用户信息卡片 -->
    <TCard padding="lg" shadow class="user-card">
      <div class="avatar-wrap">
        <img v-if="mockUser.avatarUrl" :src="mockUser.avatarUrl" class="avatar" />
        <div v-else class="avatar-placeholder">{{ mockUser.nickname[0] }}</div>
      </div>
      <div class="user-info">
        <div v-if="!editing">
          <div class="nickname">{{ mockUser.nickname }}</div>
          <div class="uid">UID: {{ mockUser.uid }}</div>
          <div class="sub-type">{{ subMap[mockUser.subscription_type] }}</div>
        </div>
        <div v-else class="edit-form">
          <TInput v-model="editNickname" placeholder="昵称" />
          <TInput v-model="editAvatar" placeholder="头像 URL" style="margin-top:8px" />
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
        <span class="coins-value">{{ mockUser.coins }}</span>
      </div>
    </TCard>

    <!-- 功能列表 -->
    <div class="menu-list">
      <div class="menu-item" @click="toggleTheme">
        <SvgIcon :name="currentTheme === 'day' ? 'icon-moon' : 'icon-sun'" :size="20" />
        <span>{{ currentTheme === 'day' ? '切换深色模式' : '切换浅色模式' }}</span>
      </div>
      <div class="menu-item" @click="router.push('/creator')" v-if="mockUser.subscription_type === 'creator'">
        <SvgIcon name="icon-workshop" :size="20" />
        <span>创作者后台</span>
      </div>
      <div class="menu-item">
        <SvgIcon name="icon-broadcast" :size="20" />
        <span>通知中心</span>
      </div>
      <div class="menu-item">
        <SvgIcon name="icon-send" :size="20" />
        <span>私信</span>
      </div>
      <div class="menu-item">
        <SvgIcon name="icon-settings" :size="20" />
        <span>设置</span>
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
.avatar-wrap { flex-shrink: 0; }
.avatar, .avatar-placeholder {
  width: 72px; height: 72px; border-radius: 50%;
}
.avatar-placeholder {
  background: var(--color-accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: var(--text-2xl); font-weight: 700;
}
.user-info { flex: 1; }
.nickname { font-size: var(--text-xl); font-weight: 700; }
.uid { font-size: var(--text-sm); color: var(--color-text-muted); font-family: var(--font-mono); margin: 2px 0; }
.sub-type { font-size: var(--text-sm); color: var(--color-accent); }
.edit-btn { margin-top: var(--space-2); display: flex; gap: var(--space-2); }
.coins { margin-left: auto; text-align: right; }
.coins-label { font-size: var(--text-xs); color: var(--color-text-muted); display: block; }
.coins-value { font-size: var(--text-xl); font-weight: 700; color: var(--color-warning); }
.menu-list { display: flex; flex-direction: column; gap: 1px; background: var(--color-card-border); border-radius: var(--radius-lg); overflow: hidden; }
.menu-item {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-4); background: var(--color-card-bg);
  cursor: pointer; color: var(--color-text-primary); font-size: var(--text-sm);
  transition: background var(--transition-fast);
}
.menu-item:hover { background: var(--color-page-bg); }
.menu-item.danger { color: var(--color-danger); }
</style>
