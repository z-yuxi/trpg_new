<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';
import TInput from '../components/base/TInput.vue';
import { useAuthStore } from '../stores/auth-store';
import { setRefreshToken } from '../utils/api';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

// ── 表单字段 ───────────────────────────────────────────────────────
const phone = ref((route.query.phone as string) || '');
const password = ref('');
const showPassword = ref(false);
const loading = ref(false);

// ── 字段级错误 ─────────────────────────────────────────────────────
const phoneError = ref('');
const passwordError = ref('');
const globalError = ref('');

function normalizeError(msg: string): string {
  if (msg.includes('手机号或密码') || msg.includes('credentials')) return '手机号或密码不正确';
  if (msg.includes('未注册') || msg.includes('not found')) return '该手机号未注册，请先注册';
  if (msg.includes('json') || msg.includes('JSON') || msg.includes('Unexpected')) return '网络异常，请稍后重试';
  return msg;
}

async function submit() {
  phoneError.value = '';
  passwordError.value = '';
  globalError.value = '';
  if (!phone.value.trim()) { phoneError.value = '请输入手机号'; return; }
  if (!password.value) { passwordError.value = '请输入密码'; return; }

  loading.value = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone.value, password: password.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '登录失败');
    const accessToken = data?.tokens?.access_token;
    if (!accessToken) throw new Error('登录成功但未获取到令牌');
    if (data?.tokens?.refresh_token) setRefreshToken(data.tokens.refresh_token);
    authStore.setAuth({
      token: accessToken,
      userId: data.user.id,
      nickname: data.user.nickname,
      avatarUrl: data.user.avatar_url,
      userType: data.user.user_type,
      expiresIn: data?.tokens?.expires_in,
    });
    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (e) {
    const msg = normalizeError(e instanceof Error ? e.message : '登录失败');
    // 把密码相关的错误映射到密码字段
    if (msg.includes('不正确')) {
      passwordError.value = msg;
    } else {
      globalError.value = msg;
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <TCard padding="lg" shadow class="auth-card">
      <!-- 品牌区 -->
      <div class="brand">
        <h1 class="title">密码登录</h1>
        <p class="tagline">让故事因同行而生动</p>
      </div>

      <div class="form">
        <!-- 全局错误 -->
        <p v-if="globalError" class="global-error">{{ globalError }}</p>

        <!-- 手机号 -->
        <div class="field-block">
          <TInput
            v-model="phone"
            type="tel"
            placeholder="请输入手机号"
            inputmode="numeric"
            autocomplete="tel"
          />
          <p v-if="phoneError" class="field-error">{{ phoneError }}</p>
        </div>

        <!-- 密码 + 显示/隐藏 -->
        <div class="field-block">
          <div class="pwd-row">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              class="pwd-input"
              autocomplete="current-password"
              @keydown.enter="submit"
            />
            <button
              type="button"
              class="eye-btn"
              :title="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <span class="eye-icon">{{ showPassword ? '🙈' : '👁' }}</span>
            </button>
          </div>
          <p v-if="passwordError" class="field-error">{{ passwordError }}</p>
        </div>

        <!-- 忘记密码（右对齐） -->
        <div class="forgot-row">
          <a class="link small" @click="router.push('/forgot-password')">忘记密码？</a>
        </div>

        <!-- 登录按钮 -->
        <TButton
          type="primary"
          :loading="loading"
          class="submit-btn"
          @click="submit"
        >登 录</TButton>

        <!-- 弱化分隔 -->
        <div class="divider"><span>或</span></div>

        <!-- 回验证码登录 -->
        <p class="weak-link">
          <a
            class="link muted"
            @click="router.push({ name: 'LoginCode', query: phone ? { phone } : {} })"
          >← 使用验证码登录</a>
        </p>
      </div>
    </TCard>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  min-height: 100svh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at top, rgba(91, 141, 184, 0.22), transparent 34%),
    linear-gradient(180deg, #f5f8fc 0%, #eef3f8 48%, #f8fbfd 100%);
}
.auth-card {
  width: min(100%, 380px);
  border: 1px solid rgba(91, 141, 184, 0.14);
  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,251,254,0.98));
  box-shadow: 0 8px 24px rgba(41, 73, 102, 0.08);
}
.brand { text-align: center; margin-bottom: 20px; }
.title { font-size: var(--text-2xl, 22px); font-weight: 700; margin: 0 0 6px; }
.tagline { margin: 0; font-size: var(--text-sm, 13px); color: var(--text-secondary, #5c6b7a); }
.form { display: flex; flex-direction: column; gap: 10px; }
.field-block { display: flex; flex-direction: column; gap: 4px; }
.field-error { margin: 0; font-size: 12px; color: #c44d56; line-height: 1.4; }
.global-error {
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(255, 244, 244, 0.8);
  border: 1px solid rgba(196, 77, 86, 0.18);
  font-size: 13px;
  color: #c44d56;
  margin: 0;
}

/* ── 密码输入行 ── */
.pwd-row {
  display: flex;
  align-items: stretch;
  height: 44px;
  border: 1px solid rgba(41, 73, 102, 0.18);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  transition: border-color 0.15s;
}
.pwd-row:focus-within { border-color: var(--color-accent, #5b8db8); }
.pwd-input {
  flex: 1;
  min-width: 0;
  padding: 0 12px;
  border: none;
  outline: none;
  font-size: 14px;
  color: var(--text-primary, #1a2b3c);
  background: transparent;
}
.pwd-input::placeholder { color: var(--text-muted, #8fa3b1); }
.eye-btn {
  flex-shrink: 0;
  padding: 0 12px;
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: background 0.15s;
}
.eye-btn:hover { background: rgba(91, 141, 184, 0.07); }
.eye-icon { font-size: 15px; line-height: 1; }

/* ── 忘记密码 ── */
.forgot-row { display: flex; justify-content: flex-end; margin-top: -4px; }

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

/* ── 链接 ── */
.link {
  color: var(--color-accent, #5b8db8);
  cursor: pointer;
  text-decoration: none;
  font-weight: 500;
}
.link:hover { text-decoration: underline; }
.link.small { font-size: 12px; }
.link.muted { font-size: 12px; font-weight: 400; color: var(--text-muted, #8fa3b1); }
.link.muted:hover { color: var(--color-accent, #5b8db8); text-decoration: underline; }

/* ── 分隔线 ── */
.divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0;
}
.divider::before, .divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(41, 73, 102, 0.1);
}
.divider span { font-size: 12px; color: var(--text-muted, #8fa3b1); white-space: nowrap; }
.weak-link { margin: 0; text-align: center; }

:deep(input:-webkit-autofill),
:deep(input:-webkit-autofill:hover),
:deep(input:-webkit-autofill:focus) {
  -webkit-box-shadow: 0 0 0px 1000px #ffffff inset !important;
  -webkit-text-fill-color: #1a2b3c !important;
  transition: background-color 5000s ease-in-out 0s;
}

@media (max-width: 480px) {
  .auth-page {
    align-items: center;
    justify-content: center;
    padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
  }
  .auth-card { width: 100%; }
}
</style>
