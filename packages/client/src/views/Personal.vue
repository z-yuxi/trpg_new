<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
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
import { useNotificationStore } from '../stores/notification-store';

const router = useRouter();
const authStore = useAuthStore();
const notifStore = useNotificationStore();
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
  await loadMembershipInfo();
  await loadAiQuota();
  restorePendingOrder();

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

// ── 会员升级弹窗 ─────────────────────────────────────────────────────────────
const showUpgradeModal = ref(false);
const selectedSku = ref<string>('pro_yearly');
const selectedChannel = ref<'alipay' | 'wechat'>('alipay');
const orderLoading = ref(false);
const membershipInfo = ref<{ tier: string; expires_at: string | null } | null>(null);
const currentOrderId = ref<string | null>(null);
const orderStatus = ref<'idle' | 'pending' | 'paid' | 'failed'>('idle');
const orderPolling = ref(false);
const queryOrderLoading = ref(false);
let orderPollTimer: ReturnType<typeof setTimeout> | null = null;
const PENDING_ORDER_STORAGE_KEY = 'membership_pending_order';

function savePendingOrder(orderId: string) {
  localStorage.setItem(PENDING_ORDER_STORAGE_KEY, JSON.stringify({ orderId, ts: Date.now() }));
}

function clearPendingOrder() {
  localStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
}

function restorePendingOrder() {
  try {
    const raw = localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { orderId?: string };
    if (!parsed?.orderId) {
      clearPendingOrder();
      return;
    }

    currentOrderId.value = parsed.orderId;
    orderStatus.value = 'pending';
    startOrderPolling(parsed.orderId);
  } catch {
    clearPendingOrder();
  }
}

const SKU_LIST = [
  { sku: 'pro_monthly',     label: 'Pro 会员',  period: '月',  price: '¥29',  originalPrice: '', badge: '' },
  { sku: 'pro_yearly',      label: 'Pro 会员',  period: '年',  price: '¥249', originalPrice: '¥348', badge: '省 ¥99' },
  { sku: 'creator_monthly', label: '创作者版',  period: '月',  price: '¥49',  originalPrice: '', badge: '含全部权益' },
  { sku: 'creator_yearly',  label: '创作者版',  period: '年',  price: '¥399', originalPrice: '¥588', badge: '省 ¥189' },
];

const BENEFIT_ROWS = [
  { key: '创建团数量',   free: '≤3',  pro: '无限',  creator: '无限' },
  { key: '网格地图',     free: '否',  pro: '是',    creator: '是' },
  { key: '轨迹矩阵',     free: '否',  pro: '是',    creator: '是' },
  { key: 'AI 调用配额',  free: '0',   pro: '有限',  creator: '更高' },
  { key: '日志 PDF 导出',free: '否',  pro: '是',    creator: '是' },
  { key: '模组/规则销售',free: '20% 抽成', pro: '20% 抽成', creator: '0% 抽成' },
  { key: '创作者数据分析',free: '否', pro: '否',    creator: '是' },
  { key: '优先客服',     free: '否',  pro: '是',    creator: '是' },
];

async function loadMembershipInfo() {
  try {
    const data = await api.get<{ tier: string; expires_at: string | null }>('/membership/benefits');
    membershipInfo.value = data;
  } catch { /* 忽略，非关键路径 */ }
}

async function createOrder() {
  orderLoading.value = true;
  try {
    const res = await api.post<{ order_id: string; status: 'pending' | 'paid' | 'failed' }>('/membership/orders', {
      sku: selectedSku.value,
      channel: selectedChannel.value,
    });

    currentOrderId.value = res.order_id;
    orderStatus.value = res.status;
    ElMessage.success('订单已创建，系统将自动轮询支付结果');

    if (res.status === 'pending') {
      savePendingOrder(res.order_id);
      startOrderPolling(res.order_id);
    } else {
      clearPendingOrder();
    }
  } catch (e: any) {
    ElMessage.error(e?.message ?? '创建订单失败，请稍后重试');
  } finally {
    orderLoading.value = false;
  }
}

function stopOrderPolling() {
  orderPolling.value = false;
  if (orderPollTimer) {
    clearTimeout(orderPollTimer);
    orderPollTimer = null;
  }
}

async function pollOrderOnce(orderId: string) {
  try {
    const res = await api.get<{ status: 'pending' | 'paid' | 'failed' }>('/membership/orders/' + orderId);
    const previousStatus = orderStatus.value;
    orderStatus.value = res.status;

    if (res.status === 'paid') {
      stopOrderPolling();
      clearPendingOrder();
      if (previousStatus !== 'paid') {
        ElMessage.success('支付成功，会员权益已生效');
      }
      await loadUserDetail();
      await loadMembershipInfo();
      showUpgradeModal.value = false;
      return;
    }

    if (res.status === 'failed') {
      stopOrderPolling();
      clearPendingOrder();
      if (previousStatus !== 'failed') {
        ElMessage.warning('订单已关闭，请重新发起支付');
      }
      return;
    }
  } catch {
    // 轮询失败不打断，进入下一轮
  }

  if (orderPolling.value) {
    orderPollTimer = setTimeout(() => {
      void pollOrderOnce(orderId);
    }, 3000);
  }
}

function startOrderPolling(orderId: string) {
  stopOrderPolling();
  orderPolling.value = true;
  void pollOrderOnce(orderId);
}

async function cancelCurrentOrder() {
  if (!currentOrderId.value || orderStatus.value !== 'pending') return;
  try {
    await api.post('/membership/orders/' + currentOrderId.value + '/cancel', {});
    stopOrderPolling();
    clearPendingOrder();
    orderStatus.value = 'failed';
    ElMessage.success('订单已取消');
  } catch (e: any) {
    ElMessage.error(e?.message ?? '取消订单失败');
  }
}

async function queryCurrentOrderNow() {
  if (!currentOrderId.value) return;
  queryOrderLoading.value = true;
  try {
    const res = await api.get<{ status: 'pending' | 'paid' | 'failed' }>('/membership/orders/' + currentOrderId.value);
    const previousStatus = orderStatus.value;
    orderStatus.value = res.status;

    if (res.status === 'pending') {
      ElMessage.info('订单仍待支付，请完成支付后重试');
      return;
    }

    if (res.status === 'paid') {
      stopOrderPolling();
      clearPendingOrder();
      if (previousStatus !== 'paid') {
        ElMessage.success('支付成功，会员权益已生效');
      }
      await loadUserDetail();
      await loadMembershipInfo();
      showUpgradeModal.value = false;
      return;
    }

    stopOrderPolling();
    clearPendingOrder();
    if (previousStatus !== 'failed') {
      ElMessage.warning('订单已关闭，请重新发起支付');
    }
  } catch (e: any) {
    ElMessage.error(e?.message ?? '查询支付结果失败，请稍后重试');
  } finally {
    queryOrderLoading.value = false;
  }
}

const orderStatusText = computed(() => {
  return {
    idle: '未创建',
    pending: '待支付',
    paid: '已支付',
    failed: '已关闭',
  }[orderStatus.value];
});

const membershipExpireText = computed(() => {
  if (!membershipInfo.value?.expires_at) return null;
  const d = new Date(membershipInfo.value.expires_at);
  return `有效期至 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

// ── AI 配额 ──────────────────────────────────────────────
const AI_TASK_LABELS: Record<string, string> = {
  import_module: '模组导入',
  check_text:    '智能校对',
  log_summary:   '日志摘要',
  generate_recipe: '规则生成',
};

const AI_MONTHLY_QUOTA: Record<string, Record<string, number>> = {
  free:    { import_module: 0,  check_text: 0,   log_summary: 0,  generate_recipe: 0  },
  pro:     { import_module: 3,  check_text: 20,  log_summary: 5,  generate_recipe: 3  },
  creator: { import_module: 10, check_text: 100, log_summary: 15, generate_recipe: 10 },
};

const aiQuota = ref<{ month: string; used: Record<string, number> } | null>(null);

async function loadAiQuota() {
  if (!authStore.isLoggedIn) return;
  try {
    const data = await api.get<{ month: string; used: Record<string, number> }>('/ai/quota');
    aiQuota.value = data;
  } catch { /* 非关键路径，静默处理 */ }
}

const aiQuotaRows = computed(() => {
  const tier = (displayUser.value.subscription_type as string) ?? 'free';
  const effectiveTier = tier === 'creator' ? 'creator' : tier === 'pro' ? 'pro' : 'free';
  const quotaMap = AI_MONTHLY_QUOTA[effectiveTier] ?? AI_MONTHLY_QUOTA.free;
  return Object.entries(AI_TASK_LABELS).map(([key, label]) => ({
    key,
    label,
    used: aiQuota.value?.used[key] ?? 0,
    quota: quotaMap[key] ?? 0,
  }));
});

onBeforeUnmount(() => {
  stopOrderPolling();
});
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

    <!-- 会员卡 -->
    <TCard v-if="authStore.isLoggedIn && !userLoading" padding="md" class="membership-card"
      :class="{
        'membership-card--pro': displayUser.subscription_type === 'pro',
        'membership-card--creator': displayUser.subscription_type === 'creator',
      }">
      <div class="membership-inner">
        <div class="membership-left">
          <div class="membership-tier">
            <SvgIcon name="icon-crown" :size="18" class="membership-icon" />
            <span class="membership-tier-name">{{ subMap[displayUser.subscription_type] ?? '免费版' }}</span>
          </div>
          <div v-if="membershipExpireText" class="membership-expire">{{ membershipExpireText }}</div>
          <div v-else-if="displayUser.subscription_type === 'free'" class="membership-hint">
            升级解锁网格地图、轨迹矩阵与 AI 功能
          </div>
        </div>
        <TButton
          v-if="displayUser.subscription_type === 'free'"
          type="primary"
          size="sm"
          @click="showUpgradeModal = true"
        >升级会员</TButton>
        <TButton
          v-else
          type="ghost"
          size="sm"
          @click="showUpgradeModal = true"
        >续费/升级</TButton>
      </div>
    </TCard>

    <!-- 升级弹窗 -->
    <Teleport to="body">
      <div v-if="showUpgradeModal" class="modal-overlay" @click.self="showUpgradeModal = false">
        <div class="modal-box">
          <div class="modal-header">
            <span class="modal-title">升级会员</span>
            <button class="modal-close" @click="showUpgradeModal = false">
              <SvgIcon name="icon-close" :size="20" />
            </button>
          </div>

          <!-- SKU 选择 -->
          <div class="sku-grid">
            <div
              v-for="sku in SKU_LIST"
              :key="sku.sku"
              class="sku-card"
              :class="{ 'sku-card--selected': selectedSku === sku.sku }"
              @click="selectedSku = sku.sku"
            >
              <div class="sku-badge" v-if="sku.badge">{{ sku.badge }}</div>
              <div class="sku-label">{{ sku.label }}</div>
              <div class="sku-period">按{{ sku.period }}</div>
              <div class="sku-price">{{ sku.price }}</div>
              <div v-if="sku.originalPrice" class="sku-original">{{ sku.originalPrice }}</div>
            </div>
          </div>

          <!-- 权益对比表 -->
          <div class="benefit-table-wrap">
            <table class="benefit-table">
              <thead>
                <tr>
                  <th>权益</th>
                  <th>免费版</th>
                  <th class="col-pro">Pro</th>
                  <th class="col-creator">创作者</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in BENEFIT_ROWS" :key="row.key">
                  <td>{{ row.key }}</td>
                  <td class="center muted">{{ row.free }}</td>
                  <td class="center col-pro">{{ row.pro }}</td>
                  <td class="center col-creator">{{ row.creator }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 支付渠道 -->
          <div class="channel-row">
            <span class="channel-label">支付方式</span>
            <button
              class="channel-btn"
              :class="{ 'channel-btn--selected': selectedChannel === 'alipay' }"
              @click="selectedChannel = 'alipay'"
            >支付宝</button>
            <button
              class="channel-btn"
              :class="{ 'channel-btn--selected': selectedChannel === 'wechat' }"
              @click="selectedChannel = 'wechat'"
            >微信支付</button>
          </div>

          <div v-if="currentOrderId" class="order-panel" :class="`order-panel--${orderStatus}`">
            <div class="order-panel-row">
              <span class="order-label">订单号</span>
              <span class="order-value">{{ currentOrderId }}</span>
            </div>
            <div class="order-panel-row">
              <span class="order-label">支付状态</span>
              <span class="order-status">{{ orderStatusText }}</span>
            </div>
            <div class="order-actions" v-if="orderStatus === 'pending'">
              <TButton type="ghost" size="sm" :loading="queryOrderLoading" @click="queryCurrentOrderNow">查询支付结果</TButton>
              <TButton type="ghost" size="sm" @click="cancelCurrentOrder">取消订单</TButton>
            </div>
          </div>

          <TButton type="primary" size="lg" :loading="orderLoading" class="confirm-btn" @click="createOrder">
            {{ currentOrderId && orderStatus === 'pending' ? '重新下单' : '立即支付' }}
          </TButton>
          <p class="modal-tip">下单后系统每 3 秒轮询支付状态，支付成功将自动刷新会员等级。</p>
        </div>
      </div>
    </Teleport>
    <!-- AI 配额卡（Pro+ 可见，free 显示升级入口） -->
    <TCard
      v-if="authStore.isLoggedIn && !userLoading"
      padding="md"
      class="ai-quota-card"
    >
      <div class="ai-quota-header">
        <SvgIcon name="icon-settings" :size="16" style="color: var(--color-accent)" />
        <span class="ai-quota-title">AI 功能配额——{{ aiQuota?.month ?? '' }}</span>
        <span
          v-if="displayUser.subscription_type === 'free'"
          class="ai-quota-upgrade-link"
          @click="showUpgradeModal = true"
        >升级解锁</span>
      </div>
      <div v-if="displayUser.subscription_type === 'free'" class="ai-quota-locked">
        AI 功能需要专业版或创作者版会员
      </div>
      <div v-else class="ai-quota-rows">
        <div v-for="row in aiQuotaRows" :key="row.key" class="ai-quota-row">
          <span class="ai-quota-label">{{ row.label }}</span>
          <div class="ai-quota-bar-wrap">
            <div
              class="ai-quota-bar"
              :style="{ width: row.quota > 0 ? `${Math.min(100, Math.round(row.used / row.quota * 100))}%` : '0%' }"
              :class="{ 'ai-quota-bar--full': row.used >= row.quota }"
            ></div>
          </div>
          <span class="ai-quota-count">{{ row.used }}/{{ row.quota }}</span>
        </div>
      </div>
    </TCard>

    <!-- 快捷入口 -->
    <div class="menu-list quick-entry">
      <div class="menu-item" @click="router.push('/tuantu/characters')">
        <SvgIcon name="icon-user" :size="20" />
        <span>角色卡</span>
      </div>
      <div class="menu-item" @click="router.push('/tuantu/assets')">
        <SvgIcon name="icon-market" :size="20" />
        <span>资产</span>
      </div>
      <div class="menu-item" @click="router.push('/notifications')">
        <SvgIcon name="icon-bell" :size="20" />
        <span>通知</span>
        <span v-if="notifStore.unreadCount > 0" class="menu-badge">{{ notifStore.unreadCount > 99 ? '99+' : notifStore.unreadCount }}</span>
      </div>
      <div class="menu-item" @click="router.push('/messages')">
        <SvgIcon name="icon-chat" :size="20" />
        <span>私信</span>
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
      <div class="menu-item" @click="router.push('/settings')">
        <SvgIcon name="icon-settings" :size="20" />
        <span>设置</span>
      </div>
      <div class="menu-item" @click="clearCache">
        <SvgIcon name="icon-refresh" :size="20" />
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
.menu-badge {
  margin-left: auto;
  background: var(--color-error, #ef4444);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 9999px;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}

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

/* ── 会员卡 ── */
.membership-card {
  border: 1px solid var(--color-card-border);
  background: var(--color-card-bg);
  transition: border-color var(--transition-fast);
}
.membership-card--pro {
  border-color: color-mix(in srgb, #6366f1 50%, transparent);
  background: color-mix(in srgb, #6366f1 5%, var(--color-card-bg));
}
.membership-card--creator {
  border-color: color-mix(in srgb, #f59e0b 50%, transparent);
  background: color-mix(in srgb, #f59e0b 5%, var(--color-card-bg));
}
.membership-inner { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.membership-tier { display: flex; align-items: center; gap: var(--space-2); }
.membership-icon { color: var(--color-warning); }
.membership-tier-name { font-size: var(--text-base); font-weight: 700; }
.membership-expire { font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 4px; }
.membership-hint { font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 4px; max-width: 220px; }

/* ── 升级弹窗 ── */
.modal-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,.55);
  display: flex; align-items: flex-end;
}
@media (min-width: 640px) {
  .modal-overlay { align-items: center; }
}
.modal-box {
  width: 100%; max-width: 520px; margin: 0 auto;
  background: var(--color-card-bg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: var(--space-5);
  max-height: 90vh;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--space-4);
}
@media (min-width: 640px) {
  .modal-box { border-radius: var(--radius-lg); }
}
.modal-header { display: flex; align-items: center; justify-content: space-between; }
.modal-title { font-size: var(--text-lg); font-weight: 700; }
.modal-close { background: none; border: none; cursor: pointer; color: var(--color-text-muted); padding: 4px; }

/* SKU 卡片 */
.sku-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3); }
.sku-card {
  position: relative;
  border: 2px solid var(--color-card-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  cursor: pointer;
  text-align: center;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.sku-card--selected {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 8%, var(--color-card-bg));
}
.sku-badge {
  position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
  font-size: 10px; font-weight: 700; padding: 2px 8px;
  border-radius: 9999px;
  background: var(--color-accent); color: #fff;
  white-space: nowrap;
}
.sku-label { font-size: var(--text-sm); font-weight: 700; }
.sku-period { font-size: var(--text-xs); color: var(--color-text-muted); }
.sku-price { font-size: var(--text-xl); font-weight: 800; color: var(--color-accent); margin-top: 4px; }
.sku-original { font-size: var(--text-xs); color: var(--color-text-muted); text-decoration: line-through; }

/* 权益表 */
.benefit-table-wrap { overflow-x: auto; }
.benefit-table { width: 100%; border-collapse: collapse; font-size: var(--text-xs); }
.benefit-table th, .benefit-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-card-border);
  text-align: left;
  white-space: nowrap;
}
.benefit-table .center { text-align: center; }
.benefit-table .muted { color: var(--color-text-muted); }
.benefit-table .col-pro { color: #6366f1; font-weight: 600; }
.benefit-table .col-creator { color: #f59e0b; font-weight: 600; }

/* 支付渠道 */
.channel-row { display: flex; align-items: center; gap: var(--space-3); }
.channel-label { font-size: var(--text-sm); color: var(--color-text-muted); flex-shrink: 0; }
.channel-btn {
  padding: 6px 16px; border-radius: var(--radius-md);
  border: 1px solid var(--color-card-border);
  background: var(--color-card-bg); cursor: pointer; font-size: var(--text-sm);
  color: var(--color-text-primary);
  transition: border-color var(--transition-fast);
}
.channel-btn--selected { border-color: var(--color-accent); color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 8%, var(--color-card-bg)); }

.confirm-btn { width: 100%; }
.modal-tip { text-align: center; font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; }

.order-panel {
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-page-bg);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.order-panel--pending { border-color: color-mix(in srgb, #f59e0b 45%, transparent); }
.order-panel--paid { border-color: color-mix(in srgb, #22c55e 45%, transparent); }
.order-panel--failed { border-color: color-mix(in srgb, #ef4444 45%, transparent); }
.order-panel-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.order-label { color: var(--color-text-muted); font-size: var(--text-xs); }
.order-value { font-family: var(--font-mono); font-size: 11px; word-break: break-all; text-align: right; }
.order-status { font-weight: 600; }
.order-actions { display: flex; justify-content: flex-end; margin-top: 2px; }

/* ── AI 配额卡片 ── */
.ai-quota-card { display: flex; flex-direction: column; gap: var(--space-2); }
.ai-quota-header { display: flex; align-items: center; gap: var(--space-2); }
.ai-quota-title { font-size: var(--text-sm); font-weight: 600; flex: 1; }
.ai-quota-upgrade-link { font-size: var(--text-xs); color: var(--color-accent); cursor: pointer; }
.ai-quota-locked { font-size: var(--text-xs); color: var(--color-text-muted); padding: var(--space-1) 0; }
.ai-quota-rows { display: flex; flex-direction: column; gap: 6px; }
.ai-quota-row { display: flex; align-items: center; gap: var(--space-2); }
.ai-quota-label { font-size: var(--text-xs); color: var(--color-text-secondary); width: 60px; flex-shrink: 0; }
.ai-quota-bar-wrap { flex: 1; height: 6px; background: var(--color-card-border); border-radius: 99px; overflow: hidden; }
.ai-quota-bar { height: 100%; background: var(--color-accent); border-radius: 99px; transition: width .3s; }
.ai-quota-bar--full { background: var(--color-warning); }
.ai-quota-count { font-size: var(--text-xs); color: var(--color-text-muted); width: 40px; text-align: right; flex-shrink: 0; }
</style>
