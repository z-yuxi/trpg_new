<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import SvgIcon from '../components/SvgIcon.vue';
import { api } from '../utils/api';
import { useTheme } from '../composables/useTheme';
import { useAuthStore } from '../stores/auth-store';

const router = useRouter();
const authStore = useAuthStore();
const { currentTheme, setTheme } = useTheme();

// ── 当前激活区块 ─────────────────────────────────────────────────────────────
type Section = 'security' | 'theme' | 'content' | 'notification' | 'privacy' | 'data';
const activeSection = ref<Section>('security');

const sections: { key: Section; label: string }[] = [
  { key: 'security', label: '账号安全' },
  { key: 'theme', label: '主题偏好' },
  { key: 'content', label: '内容偏好' },
  { key: 'notification', label: '通知偏好' },
  { key: 'privacy', label: '隐私设置' },
  { key: 'data', label: '数据管理' },
];

// ── 账号安全 ─────────────────────────────────────────────────────────────────
const currentPwd = ref('');
const newPwd = ref('');
const confirmPwd = ref('');
const securitySaving = ref(false);

function pwdStrength(v: string): number {
  if (!v) return 0;
  let s = 0;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v)) s++;
  if (/[0-9]/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  return s;
}
const strengthLabels = ['', '弱', '中', '强', '非常强'];
const strengthClasses = ['', 'weak', 'medium', 'strong', 'very-strong'];

async function changePassword() {
  if (!currentPwd.value || !newPwd.value || !confirmPwd.value) {
    ElMessage.warning('请填写所有字段');
    return;
  }
  if (newPwd.value !== confirmPwd.value) {
    ElMessage.error('两次输入的新密码不一致');
    return;
  }
  if (pwdStrength(newPwd.value) < 2) {
    ElMessage.warning('密码强度过低，请包含大写字母或数字');
    return;
  }
  securitySaving.value = true;
  try {
    await api.put('/users/me/password', { current_password: currentPwd.value, new_password: newPwd.value });
    ElMessage.success('密码修改成功');
    currentPwd.value = '';
    newPwd.value = '';
    confirmPwd.value = '';
  } catch (e: unknown) {
    ElMessage.error((e as Error).message || '修改失败');
  } finally {
    securitySaving.value = false;
  }
}

// ── 主题偏好 ─────────────────────────────────────────────────────────────────
const themeValue = ref<'day' | 'night' | 'system'>(
  (localStorage.getItem('theme-preference') as 'day' | 'night' | 'system') ?? 'system'
);
const fontSizeValue = ref<'small' | 'standard' | 'large'>(
  (localStorage.getItem('font-size') as 'small' | 'standard' | 'large') ?? 'standard'
);

watch(themeValue, (v) => {
  localStorage.setItem('theme-preference', v);
  if (v === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(dark ? 'night' : 'day');
  } else {
    setTheme(v);
  }
  ElMessage.success('已保存');
});

watch(fontSizeValue, (v) => {
  localStorage.setItem('font-size', v);
  document.documentElement.setAttribute('data-font-size', v);
  ElMessage.success('已保存');
});

// ── 内容偏好 ─────────────────────────────────────────────────────────────────
const rulePrefs = ref<string[]>([]);
const genrePrefs = ref<string[]>([]);
const ruleOptions = ['COC 7th', 'D&D 5E', 'Pathfinder', '其他'];
const genreOptions = ['恐怖', '奇幻', '科幻', '悬疑', '历史', '轻松'];

// 初始回填期间为 false，onMounted 完成后置 true，避免 watch 误触发保存
const settingsLoaded = ref(false);

let contentTimer: ReturnType<typeof setTimeout> | null = null;
async function saveContentPrefs() {
  if (!settingsLoaded.value) return;
  if (contentTimer) clearTimeout(contentTimer);
  contentTimer = setTimeout(async () => {
    try {
      await api.put('/users/me/content-preferences', {
        rule_prefs: rulePrefs.value,
        genre_prefs: genrePrefs.value,
      });
      ElMessage.success('已保存');
    } catch { /* ignore */ }
  }, 600);
}
watch([rulePrefs, genrePrefs], saveContentPrefs, { deep: true });

// ── 通知偏好 ─────────────────────────────────────────────────────────────────
const notifyInApp = ref(true);
const notifyEmail = ref(false);
const notifyPush = ref(false);

let notifyTimer: ReturnType<typeof setTimeout> | null = null;
async function saveNotifyPrefs() {
  if (!settingsLoaded.value) return;
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(async () => {
    try {
      await api.put('/users/me/notification-settings', {
        in_app: notifyInApp.value,
        email: notifyEmail.value,
        push: notifyPush.value,
      });
      ElMessage.success('已保存');
    } catch { /* ignore */ }
  }, 600);
}
watch([notifyInApp, notifyEmail, notifyPush], saveNotifyPrefs);

// ── 隐私设置 ─────────────────────────────────────────────────────────────────
const profileVisibility = ref<'public' | 'friends' | 'private'>('public');
const dmVisibility = ref<'all' | 'following' | 'none'>('all');
const allowStats = ref(true);
const allowAiTrain = ref(false);

let privacyTimer: ReturnType<typeof setTimeout> | null = null;
async function savePrivacy() {
  if (!settingsLoaded.value) return;
  if (privacyTimer) clearTimeout(privacyTimer);
  privacyTimer = setTimeout(async () => {
    try {
      await api.put('/users/me/privacy', {
        profile_visibility: profileVisibility.value,
        dm_visibility: dmVisibility.value,
        allow_stats: allowStats.value,
        allow_ai_train: allowAiTrain.value,
      });
      ElMessage.success('已保存');
    } catch { /* ignore */ }
  }, 600);
}
watch([profileVisibility, dmVisibility, allowStats, allowAiTrain], savePrivacy);

// ── 数据管理 ─────────────────────────────────────────────────────────────────
const exportLoading = ref(false);
const deleteConfirm = ref('');
const showDeleteDialog = ref(false);
const deleteLoading = ref(false);

async function exportData() {
  exportLoading.value = true;
  try {
    await api.post('/users/me/export-data', {});
    ElMessage.success('数据导出请求已提交，生成后将通过站内通知发送下载链接');
  } catch (e: unknown) {
    ElMessage.error((e as Error).message || '导出失败');
  } finally {
    exportLoading.value = false;
  }
}

async function deleteAccount() {
  if (!deleteConfirm.value) return;
  deleteLoading.value = true;
  try {
    await api.post('/users/me/delete-account', { confirm: deleteConfirm.value });
    ElMessage.success('账号删除请求已提交，15 天冷静期后数据将永久删除');
    showDeleteDialog.value = false;
    router.push('/login');
  } catch (e: unknown) {
    ElMessage.error((e as Error).message || '删除失败');
  } finally {
    deleteLoading.value = false;
  }
}

// ── 初始化：回填已保存的设置 ──────────────────────────────────────────────
onMounted(async () => {
  if (!authStore.isLoggedIn) return;
  try {
    const saved = await api.get<{
      notification: { in_app: boolean; email: boolean; push: boolean };
      content: { rule_prefs: string[]; genre_prefs: string[] };
      privacy: { profile_visibility: string; dm_visibility: string; allow_stats: boolean; allow_ai_train: boolean };
    }>('/users/me/settings');

    // 通知偏好（不触发 watch 保存，故临时暂停 watch）
    notifyInApp.value = saved.notification.in_app;
    notifyEmail.value = saved.notification.email;
    notifyPush.value = saved.notification.push;

    // 内容偏好
    rulePrefs.value = saved.content.rule_prefs ?? [];
    genrePrefs.value = saved.content.genre_prefs ?? [];

    // 隐私设置
    profileVisibility.value = (saved.privacy.profile_visibility as typeof profileVisibility.value) ?? 'public';
    dmVisibility.value = (saved.privacy.dm_visibility as typeof dmVisibility.value) ?? 'all';
    allowStats.value = saved.privacy.allow_stats ?? true;
    allowAiTrain.value = saved.privacy.allow_ai_train ?? false;
  } catch {
    // 静默失败，保持默认值
  }
  settingsLoaded.value = true;
});
</script>

<template>
  <div class="settings-root">
    <!-- 桌面端左侧导航 / 移动端顶部横滑 Tab -->
    <nav class="settings-nav">
      <button
        v-for="s in sections"
        :key="s.key"
        class="nav-item"
        :class="{ active: activeSection === s.key }"
        @click="activeSection = s.key"
      >
        {{ s.label }}
      </button>
    </nav>

    <!-- 右侧内容区 -->
    <main class="settings-content">

      <!-- ── 账号安全 ── -->
      <section v-if="activeSection === 'security'" class="section-block">
        <h2 class="section-title">账号安全</h2>

        <div class="form-group">
          <label class="form-label">修改密码</label>
          <input v-model="currentPwd" type="password" class="form-input" placeholder="当前密码" autocomplete="current-password" />
        </div>
        <div class="form-group">
          <input v-model="newPwd" type="password" class="form-input" placeholder="新密码（8位以上）" autocomplete="new-password" />
          <div v-if="newPwd" class="strength-bar">
            <div class="strength-fill" :class="strengthClasses[pwdStrength(newPwd)]" :style="{ width: (pwdStrength(newPwd) * 25) + '%' }"></div>
          </div>
          <div v-if="newPwd" class="strength-label" :class="strengthClasses[pwdStrength(newPwd)]">
            密码强度：{{ strengthLabels[pwdStrength(newPwd)] }}
          </div>
        </div>
        <div class="form-group">
          <input v-model="confirmPwd" type="password" class="form-input" placeholder="再次输入新密码" autocomplete="new-password" />
        </div>
        <button class="btn-primary" @click="changePassword" :disabled="securitySaving">
          {{ securitySaving ? '保存中…' : '确认修改' }}
        </button>
      </section>

      <!-- ── 主题偏好 ── -->
      <section v-else-if="activeSection === 'theme'" class="section-block">
        <h2 class="section-title">主题偏好</h2>
        <div class="pref-row">
          <span class="pref-label">界面主题</span>
          <div class="radio-group">
            <label v-for="opt in [{ v: 'day', l: '浅色' }, { v: 'night', l: '深色' }, { v: 'system', l: '跟随系统' }]" :key="opt.v" class="radio-option">
              <input type="radio" :value="opt.v" v-model="themeValue" />
              {{ opt.l }}
            </label>
          </div>
        </div>
        <div class="pref-row">
          <span class="pref-label">字体大小</span>
          <div class="radio-group">
            <label v-for="opt in [{ v: 'small', l: '小' }, { v: 'standard', l: '标准' }, { v: 'large', l: '大' }]" :key="opt.v" class="radio-option">
              <input type="radio" :value="opt.v" v-model="fontSizeValue" />
              {{ opt.l }}
            </label>
          </div>
        </div>
      </section>

      <!-- ── 内容偏好 ── -->
      <section v-else-if="activeSection === 'content'" class="section-block">
        <h2 class="section-title">内容偏好</h2>
        <p class="section-desc">用于优化「探索」页的推荐内容排序。</p>
        <div class="pref-row">
          <span class="pref-label">规则偏好</span>
          <div class="check-group">
            <label v-for="opt in ruleOptions" :key="opt" class="check-option">
              <input type="checkbox" :value="opt" v-model="rulePrefs" />
              {{ opt }}
            </label>
          </div>
        </div>
        <div class="pref-row">
          <span class="pref-label">题材偏好</span>
          <div class="check-group">
            <label v-for="opt in genreOptions" :key="opt" class="check-option">
              <input type="checkbox" :value="opt" v-model="genrePrefs" />
              {{ opt }}
            </label>
          </div>
        </div>
      </section>

      <!-- ── 通知偏好 ── -->
      <section v-else-if="activeSection === 'notification'" class="section-block">
        <h2 class="section-title">通知偏好</h2>
        <p class="section-desc">各开关独立控制，互不影响。</p>
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-name">站内通知</div>
            <div class="toggle-desc">关闭后不再收到站内通知中心的消息</div>
          </div>
          <label class="switch"><input type="checkbox" v-model="notifyInApp" /><span class="slider"></span></label>
        </div>
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-name">邮件通知</div>
            <div class="toggle-desc">开启后重要通知同步发送邮件</div>
          </div>
          <label class="switch"><input type="checkbox" v-model="notifyEmail" /><span class="slider"></span></label>
        </div>
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-name">Push 通知</div>
            <div class="toggle-desc">开启后通过浏览器推送通知</div>
          </div>
          <label class="switch"><input type="checkbox" v-model="notifyPush" /><span class="slider"></span></label>
        </div>
      </section>

      <!-- ── 隐私设置 ── -->
      <section v-else-if="activeSection === 'privacy'" class="section-block">
        <h2 class="section-title">隐私设置</h2>
        <div class="pref-row">
          <span class="pref-label">个人主页可见范围</span>
          <div class="radio-group">
            <label v-for="opt in [{ v: 'public', l: '公开' }, { v: 'friends', l: '仅同好可见' }, { v: 'private', l: '仅自己可见' }]" :key="opt.v" class="radio-option">
              <input type="radio" :value="opt.v" v-model="profileVisibility" />
              {{ opt.l }}
            </label>
          </div>
        </div>
        <div class="pref-row">
          <span class="pref-label">私信可达范围</span>
          <div class="radio-group">
            <label v-for="opt in [{ v: 'all', l: '所有人' }, { v: 'following', l: '我关注的人' }, { v: 'none', l: '无人' }]" :key="opt.v" class="radio-option">
              <input type="radio" :value="opt.v" v-model="dmVisibility" />
              {{ opt.l }}
            </label>
          </div>
        </div>
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-name">参与社区数据统计</div>
            <div class="toggle-desc">关闭后不再被纳入平台公开统计</div>
          </div>
          <label class="switch"><input type="checkbox" v-model="allowStats" /><span class="slider"></span></label>
        </div>
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-name">允许用于 AI 训练</div>
            <div class="toggle-desc">开启后，平台可将你的公开内容用于 AI 模型训练。该开关不影响 AI 功能的正常使用。</div>
          </div>
          <label class="switch"><input type="checkbox" v-model="allowAiTrain" /><span class="slider"></span></label>
        </div>
      </section>

      <!-- ── 数据管理 ── -->
      <section v-else-if="activeSection === 'data'" class="section-block">
        <h2 class="section-title">数据管理</h2>

        <div class="data-row">
          <div>
            <div class="data-row-name">导出我的数据</div>
            <div class="data-row-desc">系统异步生成数据包，生成完成后站内通知发送下载链接。</div>
          </div>
          <button class="btn-outline" @click="exportData" :disabled="exportLoading">
            {{ exportLoading ? '提交中…' : '导出数据' }}
          </button>
        </div>

        <div class="data-row danger-row">
          <div>
            <div class="data-row-name danger">删除账号</div>
            <div class="data-row-desc">确认后进入 15 天冷静期，期间可撤销。冷静期结束后数据永久删除。</div>
          </div>
          <button class="btn-danger" @click="showDeleteDialog = true">删除账号</button>
        </div>
      </section>

      <!-- ── 页脚合规 ── -->
      <footer class="settings-footer">
        <a href="/terms" target="_blank">用户协议</a>
        <a href="/privacy" target="_blank">隐私政策</a>
        <span>备案号：沪ICP备XXXXXXXX号</span>
      </footer>
    </main>

    <!-- 删除账号确认弹窗 -->
    <div v-if="showDeleteDialog" class="dialog-mask" @click.self="showDeleteDialog = false">
      <div class="dialog">
        <h3 class="dialog-title">确认删除账号</h3>
        <p class="dialog-desc">此操作不可逆。请输入你的密码或验证码确认。</p>
        <input v-model="deleteConfirm" type="password" class="form-input" placeholder="密码或验证码" />
        <div class="dialog-actions">
          <button class="btn-outline" @click="showDeleteDialog = false">取消</button>
          <button class="btn-danger" @click="deleteAccount" :disabled="!deleteConfirm || deleteLoading">
            {{ deleteLoading ? '提交中…' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-root {
  display: flex;
  min-height: calc(100vh - var(--navbar-height, 56px));
  background: var(--color-page-bg);
}

/* ── 左侧导航（桌面端） ── */
.settings-nav {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-card-border);
  background: var(--color-card-bg);
  padding: var(--space-4) 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: block;
  width: 100%;
  padding: 11px var(--space-4);
  border: none;
  border-left: 3px solid transparent;
  background: none;
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  text-align: left;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.nav-item:hover { background: var(--color-page-bg); color: var(--color-text-primary); }
.nav-item.active {
  color: var(--color-accent, #2563eb);
  background: color-mix(in srgb, var(--color-accent, #2563eb) 10%, var(--color-page-bg));
  border-left-color: var(--color-accent, #2563eb);
  font-weight: 600;
}

/* ── 右侧内容区 ── */
.settings-content {
  flex: 1;
  max-width: 720px;
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.section-block { display: flex; flex-direction: column; gap: var(--space-4); }
.section-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-2);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-card-border);
}
.section-desc { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0; }

/* 表单 */
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-label { font-size: var(--text-sm); color: var(--color-text-secondary); }
.form-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  background: var(--color-page-bg);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  box-sizing: border-box;
  outline: none;
  transition: border-color var(--transition-fast);
}
.form-input:focus { border-color: var(--color-accent, #2563eb); }

.strength-bar { height: 4px; background: var(--color-card-border); border-radius: 2px; margin-top: 6px; overflow: hidden; }
.strength-fill { height: 100%; border-radius: 2px; transition: width 0.3s, background 0.3s; }
.strength-fill.weak { background: #ef4444; }
.strength-fill.medium { background: #f59e0b; }
.strength-fill.strong, .strength-fill.very-strong { background: #22c55e; }
.strength-label { font-size: var(--text-xs); margin-top: 4px; }
.strength-label.weak { color: #ef4444; }
.strength-label.medium { color: #f59e0b; }
.strength-label.strong, .strength-label.very-strong { color: #22c55e; }

/* 偏好行 */
.pref-row { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) 0; border-top: 1px solid var(--color-card-border); }
.pref-label { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); }
.radio-group, .check-group { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.radio-option, .check-option { display: flex; align-items: center; gap: 6px; font-size: var(--text-sm); color: var(--color-text-secondary); cursor: pointer; }

/* 开关行 */
.toggle-row { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) 0; border-top: 1px solid var(--color-card-border); gap: var(--space-4); }
.toggle-info { flex: 1; min-width: 0; }
.toggle-name { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); margin-bottom: 2px; }
.toggle-desc { font-size: var(--text-xs); color: var(--color-text-muted); }
.switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; inset: 0; cursor: pointer; background: var(--color-card-border); border-radius: 24px; transition: background var(--transition-fast); }
.slider::before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: transform var(--transition-fast); }
input:checked + .slider { background: var(--color-accent, #2563eb); }
input:checked + .slider::before { transform: translateX(20px); }

/* 数据管理行 */
.data-row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); padding: var(--space-4) 0; border-top: 1px solid var(--color-card-border); }
.data-row-name { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); margin-bottom: 4px; }
.data-row-name.danger { color: #ef4444; }
.data-row-desc { font-size: var(--text-xs); color: var(--color-text-muted); max-width: 420px; line-height: 1.5; }

/* 按钮 */
.btn-primary {
  padding: var(--space-2) var(--space-5);
  border: none; border-radius: var(--radius-md);
  background: var(--color-accent, #2563eb); color: #fff;
  cursor: pointer; font-size: var(--text-sm); font-weight: 600;
  transition: opacity var(--transition-fast);
}
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-outline {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-card-border); border-radius: var(--radius-md);
  background: none; color: var(--color-text-secondary);
  cursor: pointer; font-size: var(--text-sm);
  white-space: nowrap;
  transition: background var(--transition-fast);
}
.btn-outline:hover { background: var(--color-page-bg); }
.btn-outline:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-danger {
  padding: var(--space-2) var(--space-4);
  border: none; border-radius: var(--radius-md);
  background: #ef4444; color: #fff;
  cursor: pointer; font-size: var(--text-sm); font-weight: 600;
  white-space: nowrap;
  transition: opacity var(--transition-fast);
}
.btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

/* 页脚 */
.settings-footer {
  margin-top: auto;
  padding-top: var(--space-6);
  display: flex;
  gap: var(--space-4);
  justify-content: center;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.settings-footer a { color: var(--color-text-muted); text-decoration: none; }
.settings-footer a:hover { color: var(--color-accent, #2563eb); }

/* 弹窗 */
.dialog-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.dialog {
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  width: min(400px, 90vw);
  display: flex; flex-direction: column; gap: var(--space-3);
}
.dialog-title { font-size: var(--text-lg); font-weight: 700; margin: 0; color: var(--color-text-primary); }
.dialog-desc { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0; }
.dialog-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }

/* ── 移动端：顶部横滑 Tab ── */
@media (max-width: 768px) {
  .settings-root { flex-direction: column; }
  .settings-nav {
    width: 100%;
    flex-direction: row;
    border-right: none;
    border-bottom: 1px solid var(--color-card-border);
    padding: 0 var(--space-2);
    overflow-x: auto;
    height: 44px;
    align-items: stretch;
    flex-wrap: nowrap;
  }
  .nav-item {
    flex-shrink: 0;
    padding: 0 var(--space-3);
    border-left: none;
    border-bottom: 3px solid transparent;
    white-space: nowrap;
    display: flex; align-items: center; justify-content: center;
  }
  .nav-item.active {
    border-left-color: transparent;
    border-bottom-color: var(--color-accent, #2563eb);
  }
  .settings-content { padding: var(--space-4); max-width: 100%; }
}
</style>
