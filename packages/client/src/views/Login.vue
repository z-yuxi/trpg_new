<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';
import TInput from '../components/base/TInput.vue';
import { useAuthStore } from '../stores/auth-store';
import { setRefreshToken } from '../utils/api';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

// ── 模式 ──────────────────────────────────────────────────────────
type LoginMode = 'code' | 'password' | 'username';
const loginMode = ref<LoginMode>('code');

// ── 表单字段 ───────────────────────────────────────────────────────
const phone = ref('');
const areaCode = ref('+86');
const password = ref('');
const username = ref('');
const verificationCode = ref('');
const agreedToTerms = ref(false);
const loading = ref(false);

// ── 字段级错误 ─────────────────────────────────────────────────────
const phoneError = ref('');
const codeError = ref('');
const passwordError = ref('');
const globalError = ref('');

// ── 区号 ───────────────────────────────────────────────────────────
const AREA_CODES = [
  { label: '+86', desc: '中国大陆' },
  { label: '+852', desc: '中国香港' },
  { label: '+853', desc: '中国澳门' },
  { label: '+886', desc: '中国台湾' },
];
const areaCodeOpen = ref(false);
const areaCodeRef = ref<HTMLDivElement | null>(null);

function selectAreaCode(code: string) {
  areaCode.value = code;
  areaCodeOpen.value = false;
}

function onDocClick(e: MouseEvent) {
  if (areaCodeRef.value && !areaCodeRef.value.contains(e.target as Node)) {
    areaCodeOpen.value = false;
  }
}
onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));

// ── 模拟短信验证码（上线前替换为真实短信 API） ─────────────────────
const smsCode = ref('');
const codeSent = ref(false);
const codeCountdown = ref(0);
let codeTimer: ReturnType<typeof setInterval> | null = null;

const submitLabel = computed(() => loginMode.value === 'code' ? '登录 / 注册' : '登录');

function clearErrors() {
  phoneError.value = '';
  codeError.value = '';
  passwordError.value = '';
  globalError.value = '';
}

function switchMode(mode: LoginMode) {
  loginMode.value = mode;
  clearErrors();
  resetSmsState();
  agreedToTerms.value = false;
}

function normalizeAuthError(message: string): string {
  if (message.includes('Validation failed')) return '请完整填写必填信息';
  if (message.includes('请求过于频繁')) return message;
  if (message.includes('手机号或密码错误')) return '手机号或密码不正确';
  if (message.includes('验证码不正确')) return '验证码不正确，请重新输入';
  if (message.includes('json') || message.includes('JSON')) return '网络异常，请稍后重试';
  if (message.includes('Unexpected end')) return '服务器响应异常，请稍后重试';
  if (message.includes('注册失败')) return '注册失败，请稍后重试';
  if (message.includes('登录失败')) return '登录失败，请稍后重试';
  return message;
}

function sendCode() {
  phoneError.value = '';
  if (!phone.value.trim()) {
    phoneError.value = '请先输入手机号';
    return;
  }
  smsCode.value = String(Math.floor(100000 + Math.random() * 900000));
  codeSent.value = true;
  codeCountdown.value = 60;
  if (codeTimer) clearInterval(codeTimer);
  codeTimer = setInterval(() => {
    codeCountdown.value--;
    if (codeCountdown.value <= 0) { clearInterval(codeTimer!); codeTimer = null; }
  }, 1000);
  ElMessage.success('验证码已发送，请查看下方测试验证码');
}

function resetSmsState() {
  smsCode.value = '';
  verificationCode.value = '';
  codeSent.value = false;
  codeCountdown.value = 0;
  if (codeTimer) { clearInterval(codeTimer); codeTimer = null; }
}

onUnmounted(() => { if (codeTimer) clearInterval(codeTimer); });

async function submit() {
  clearErrors();
  loading.value = true;
  try {
    if (loginMode.value === 'code') {
      if (!codeSent.value) { codeError.value = '请先获取验证码'; return; }
      if (verificationCode.value !== smsCode.value) { codeError.value = '验证码不正确，请重新输入'; return; }
      // TODO: 上线后替换为 POST /api/auth/verify-code，后端统一判断新老用户
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.value, password: `Trpg@${Date.now()}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      const accessToken = data?.tokens?.access_token;
      if (!accessToken) throw new Error('操作成功但未获取到令牌');
      if (data?.tokens?.refresh_token) setRefreshToken(data.tokens.refresh_token);
      authStore.setAuth({ token: accessToken, userId: data.user.id, nickname: data.user.nickname, avatarUrl: data.user.avatar_url, userType: data.user.user_type, expiresIn: data?.tokens?.expires_in });
    } else {
      const body = loginMode.value === 'password'
        ? { phone: phone.value, password: password.value }
        : { username: username.value, password: password.value };
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登录失败');
      const accessToken = data?.tokens?.access_token;
      if (!accessToken) throw new Error('登录成功但未获取到令牌');
      if (data?.tokens?.refresh_token) setRefreshToken(data.tokens.refresh_token);
      authStore.setAuth({ token: accessToken, userId: data.user.id, nickname: data.user.nickname, avatarUrl: data.user.avatar_url, userType: data.user.user_type, expiresIn: data?.tokens?.expires_in });
    }
    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (e) {
    globalError.value = normalizeAuthError(e instanceof Error ? e.message : '操作失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <TCard padding="lg" shadow class="login-card">
      <!-- 品牌区 -->
      <template v-if="loginMode === 'code'">
        <h1 class="title">登录 / 注册</h1>
        <p class="tagline">让故事因同行而生动</p>
      </template>
      <h1 v-else class="title title-compact">登录</h1>

      <div class="form">
        <!-- 全局错误（字段级兜底） -->
        <p v-if="globalError" class="field-error global-error">{{ globalError }}</p>

        <!-- ── 验证码模式 ── -->
        <template v-if="loginMode === 'code'">
          <!-- 手机号 + 区号 -->
          <div class="field-block">
            <div ref="areaCodeRef" class="phone-wrap">
              <div class="phone-row">
                <button
                  type="button"
                  class="area-code-btn"
                  @click="areaCodeOpen = !areaCodeOpen"
                >{{ areaCode }} <span class="chevron">▾</span></button>
                <input
                  v-model="phone"
                  type="tel"
                  placeholder="请输入手机号"
                  class="phone-input"
                  inputmode="numeric"
                  autocomplete="tel"
                />
              </div>
              <ul v-if="areaCodeOpen" class="area-menu" role="listbox">
                <li
                  v-for="item in AREA_CODES"
                  :key="item.label"
                  :class="{ active: areaCode === item.label }"
                  @click="selectAreaCode(item.label)"
                >
                  <span class="ac-code">{{ item.label }}</span>
                  <span class="ac-desc">{{ item.desc }}</span>
                </li>
              </ul>
            </div>
            <p v-if="phoneError" class="field-error">{{ phoneError }}</p>
          </div>

          <!-- 验证码（内联操作区） -->
          <div class="field-block">
            <div class="inline-row">
              <input
                v-model="verificationCode"
                type="text"
                placeholder="请输入验证码"
                class="inline-input"
                inputmode="numeric"
                maxlength="6"
                autocomplete="one-time-code"
              />
              <span class="inline-sep" />
              <button
                type="button"
                class="inline-btn"
                :disabled="codeCountdown > 0"
                @click="sendCode"
              >{{ codeCountdown > 0 ? `${codeCountdown}s` : (codeSent ? '重新获取' : '获取验证码') }}</button>
            </div>
            <p v-if="codeSent && !codeError" class="code-hint">测试验证码：<strong>{{ smsCode }}</strong></p>
            <p v-if="codeError" class="field-error">{{ codeError }}</p>
          </div>
        </template>

        <!-- ── 手机号密码模式 ── -->
        <template v-else-if="loginMode === 'password'">
          <div class="field-block">
            <TInput v-model="phone" placeholder="请输入手机号" />
            <p v-if="phoneError" class="field-error">{{ phoneError }}</p>
          </div>
          <div class="field-block">
            <TInput v-model="password" type="password" placeholder="请输入密码" />
            <p v-if="passwordError" class="field-error">{{ passwordError }}</p>
          </div>
          <div class="forgot-row">
            <span class="text-link" @click="router.push('/forgot-password')">忘记密码？</span>
          </div>
        </template>

        <!-- ── 用户名密码模式 ── -->
        <template v-else>
          <div class="field-block">
            <TInput v-model="username" placeholder="请输入用户名" />
          </div>
          <div class="field-block">
            <TInput v-model="password" type="password" placeholder="请输入密码" />
            <p v-if="passwordError" class="field-error">{{ passwordError }}</p>
          </div>
        </template>

        <!-- 提交按钮 -->
        <TButton
          type="primary"
          :loading="loading"
          :disabled="!agreedToTerms"
          class="submit-btn"
          @click="submit"
        >{{ submitLabel }}</TButton>

        <!-- 协议勾选 -->
        <label class="agreement-label">
          <input type="checkbox" v-model="agreedToTerms" class="agreement-checkbox" />
          <span>我已阅读并同意<a href="/terms" target="_blank" rel="noopener" class="agreement-link">《共叙平台服务协议》</a>和<a href="/privacy" target="_blank" rel="noopener" class="agreement-link">《共叙隐私政策》</a></span>
        </label>

        <!-- 模式切换 -->
        <div class="mode-links">
          <template v-if="loginMode === 'code'">
            <span class="text-link" @click="switchMode('password')">使用密码登录</span>
          </template>
          <template v-else-if="loginMode === 'password'">
            <span class="text-link" @click="switchMode('code')">使用验证码登录</span>
            <span class="link-sep">·</span>
            <span class="text-link" @click="switchMode('username')">使用用户名登录</span>
          </template>
          <template v-else>
            <span class="text-link" @click="switchMode('code')">使用验证码登录</span>
            <span class="link-sep">·</span>
            <span class="text-link" @click="switchMode('password')">使用手机号登录</span>
          </template>
        </div>
      </div>
    </TCard>
  </div>
</template>

<style scoped>
/* ── 页面布局 ── */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at top, rgba(91, 141, 184, 0.22), transparent 34%),
    linear-gradient(180deg, #f5f8fc 0%, #eef3f8 48%, #f8fbfd 100%);
}
.login-card {
  position: relative;
  width: min(100%, 380px);
  border: 1px solid rgba(91, 141, 184, 0.14);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 251, 254, 0.98));
  box-shadow: 0 8px 24px rgba(41, 73, 102, 0.08);
}
.title { font-size: var(--text-2xl); font-weight: 700; text-align: center; margin-bottom: 8px; }
.title-compact { margin-bottom: 18px; }
.tagline { margin: 0 0 18px; text-align: center; font-size: var(--text-sm); color: var(--text-secondary); }
.form { display: flex; flex-direction: column; gap: 10px; }

/* ── 字段块 ── */
.field-block { display: flex; flex-direction: column; gap: 4px; }
.field-error { margin: 0; font-size: 12px; color: #c44d56; line-height: 1.4; }
.global-error {
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(255, 244, 244, 0.7);
  border: 1px solid rgba(196, 77, 86, 0.15);
}

/* ── 手机号行（含区号） ── */
.phone-wrap { position: relative; }
.phone-row {
  display: flex;
  align-items: stretch;
  height: 44px;
  border: 1px solid rgba(41, 73, 102, 0.18);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  transition: border-color 0.15s;
}
.phone-row:focus-within { border-color: var(--color-accent, #5b8db8); }

.area-code-btn {
  flex-shrink: 0;
  height: 100%;
  padding: 0 10px;
  border: none;
  border-right: 1px solid rgba(41, 73, 102, 0.1);
  background: rgba(91, 141, 184, 0.04);
  color: var(--text-primary, #1a2b3c);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  transition: background 0.15s;
}
.area-code-btn:hover { background: rgba(91, 141, 184, 0.09); }
.chevron { font-size: 10px; color: var(--text-muted, #8fa3b1); }

.phone-input {
  flex: 1;
  min-width: 0;
  padding: 0 12px;
  border: none;
  outline: none;
  font-size: 14px;
  color: var(--text-primary, #1a2b3c);
  background: transparent;
}
.phone-input::placeholder { color: var(--text-muted, #8fa3b1); }

/* ── 区号下拉菜单 ── */
.area-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 50;
  min-width: 160px;
  background: #fff;
  border: 1px solid rgba(41, 73, 102, 0.12);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(41, 73, 102, 0.1);
  list-style: none;
  margin: 0;
  padding: 4px 0;
}
.area-menu li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.1s;
}
.area-menu li:hover { background: rgba(91, 141, 184, 0.07); }
.area-menu li.active { color: var(--color-accent, #5b8db8); }
.ac-code { font-weight: 500; color: var(--text-primary, #1a2b3c); min-width: 42px; }
.ac-desc { font-size: 12px; color: var(--text-muted, #8fa3b1); }

/* ── 内联操作区（验证码） ── */
.inline-row {
  display: flex;
  align-items: stretch;
  height: 44px;
  border: 1px solid rgba(41, 73, 102, 0.18);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  transition: border-color 0.15s;
}
.inline-row:focus-within { border-color: var(--color-accent, #5b8db8); }
.inline-input {
  flex: 1;
  min-width: 0;
  padding: 0 12px;
  border: none;
  outline: none;
  font-size: 14px;
  color: var(--text-primary, #1a2b3c);
  background: transparent;
}
.inline-input::placeholder { color: var(--text-muted, #8fa3b1); }
.inline-sep {
  width: 1px;
  background: rgba(41, 73, 102, 0.1);
  flex-shrink: 0;
  margin: 10px 0;
}
.inline-btn {
  padding: 0 14px;
  border: none;
  background: none;
  color: var(--color-accent, #5b8db8);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
}
.inline-btn:hover:not(:disabled) { background: rgba(91, 141, 184, 0.07); }
.inline-btn:disabled { color: var(--text-muted, #8fa3b1); cursor: default; }

/* ── 验证码提示 ── */
.code-hint { margin: 0; font-size: 12px; color: var(--text-muted, #8fa3b1); }
.code-hint strong { color: var(--color-accent, #5b8db8); font-family: monospace; letter-spacing: 0.1em; }

/* ── 忘记密码 ── */
.forgot-row { text-align: right; margin-top: -4px; }
.text-link { font-size: 12px; color: var(--color-accent, #5b8db8); cursor: pointer; }
.text-link:hover { text-decoration: underline; }

/* ── 提交按钮 ── */
.submit-btn {
  width: 100%;
  min-height: 40px;
  margin-top: 2px;
  background: linear-gradient(135deg, #5b8db8 0%, #44739a 100%);
  box-shadow: 0 4px 12px rgba(91, 141, 184, 0.2);
}
.submit-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #5687b0 0%, #3d6a8f 100%);
}

/* ── 协议勾选 ── */
.agreement-label {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: var(--text-xs, 12px);
  color: var(--text-secondary, #5c6b7a);
  cursor: pointer;
  line-height: 1.5;
}
.agreement-checkbox {
  flex-shrink: 0;
  margin-top: 2px;
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--color-accent, #5b8db8);
}
.agreement-link {
  color: var(--color-accent, #5b8db8);
  text-decoration: none;
  white-space: nowrap;
}
.agreement-link:hover { text-decoration: underline; }

/* ── 模式切换 ── */
.mode-links {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm, 13px);
  margin-top: 2px;
}
.link-sep { color: var(--text-muted, #8fa3b1); }

/* ── autofill 修复 ── */
:deep(input:-webkit-autofill),
:deep(input:-webkit-autofill:hover),
:deep(input:-webkit-autofill:focus) {
  -webkit-box-shadow: 0 0 0px 1000px #ffffff inset !important;
  -webkit-text-fill-color: #1a2b3c !important;
  transition: background-color 5000s ease-in-out 0s;
}

/* ── 响应式 ── */
@media (max-width: 480px) {
  .login-page { padding: 16px; align-items: stretch; }
  .login-card { width: 100%; margin: auto 0; }
}
</style>
