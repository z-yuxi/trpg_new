<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue';
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

const phone = ref('');
const password = ref('');
const isRegister = ref(false);
const error = ref('');
const loading = ref(false);

// 模拟短信验证码（仅本地开发测试用，上线前替换为真实短信 API）
const smsCode = ref('');
const enteredCode = ref('');
const codeSent = ref(false);
const codeCountdown = ref(0);
let codeTimer: ReturnType<typeof setInterval> | null = null;

const submitLabel = computed(() => (isRegister.value ? '注册' : '登录'));

function normalizeAuthError(message: string, mode: 'register' | 'login' | 'code') {
  if (mode === 'code') {
    if (message.includes('手机号')) return '请先输入手机号';
    return '验证码发送失败，请稍后重试';
  }

  if (message.includes('Validation failed')) {
    return mode === 'register' ? '请完整填写注册信息后再试' : '请输入手机号和密码';
  }

  if (message.includes('请求过于频繁')) return message;
  if (message.includes('手机号或密码错误')) return '手机号或密码不正确';
  if (message.includes('验证码不正确')) return '验证码不正确，请重新输入';
  if (message.includes('请先获取验证码')) return '请先获取验证码';
  if (message.includes('注册失败')) return '注册失败，请稍后重试';
  if (message.includes('登录失败')) return '登录失败，请稍后重试';
  return message;
}

function sendMockCode() {
  try {
    if (!phone.value.trim()) {
      throw new Error('请先输入手机号');
    }
    smsCode.value = String(Math.floor(100000 + Math.random() * 900000));
    codeSent.value = true;
    error.value = '';
    codeCountdown.value = 60;
    if (codeTimer) clearInterval(codeTimer);
    codeTimer = setInterval(() => {
      codeCountdown.value--;
      if (codeCountdown.value <= 0) { clearInterval(codeTimer!); codeTimer = null; }
    }, 1000);
    ElMessage.success('验证码已发送，请查看下方测试验证码');
  } catch (err) {
    error.value = normalizeAuthError(err instanceof Error ? err.message : '', 'code');
  }
}

function resetSmsState() {
  smsCode.value = '';
  enteredCode.value = '';
  codeSent.value = false;
  codeCountdown.value = 0;
  if (codeTimer) { clearInterval(codeTimer); codeTimer = null; }
}

onUnmounted(() => { if (codeTimer) clearInterval(codeTimer); });

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    if (isRegister.value) {
      // 验证短信验证码
      if (!codeSent.value) { error.value = '请先获取验证码'; return; }
      if (enteredCode.value !== smsCode.value) { error.value = '验证码不正确'; return; }
      // 注册
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.value, password: password.value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '注册失败');
      const accessToken = data?.tokens?.access_token;
      if (!accessToken) throw new Error('注册成功但未获取到令牌');
      if (data?.tokens?.refresh_token) setRefreshToken(data.tokens.refresh_token);
      authStore.setAuth({ token: accessToken, userId: data.user.id, nickname: data.user.nickname, avatarUrl: data.user.avatar_url, userType: data.user.user_type, expiresIn: data?.tokens?.expires_in });
    } else {
      // 登录
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
      authStore.setAuth({ token: accessToken, userId: data.user.id, nickname: data.user.nickname, avatarUrl: data.user.avatar_url, userType: data.user.user_type, expiresIn: data?.tokens?.expires_in });
    }
    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (e: any) {
    error.value = normalizeAuthError(e?.message || '操作失败', isRegister.value ? 'register' : 'login');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <TCard padding="lg" shadow class="login-card">
      <div class="hero-mark" aria-hidden="true"></div>
      <h1 class="title">{{ submitLabel }}</h1>
      <p class="tagline">让故事因同行而生动</p>
      <div class="form">
        <div v-if="error" class="form-alert">{{ error }}</div>
        <div v-if="isRegister" class="phone-row">
          <div class="phone-input-wrap"><TInput v-model="phone" placeholder="手机号" /></div>
          <TButton
            type="secondary"
            size="md"
            class="code-btn"
            :disabled="codeCountdown > 0"
            @click="sendMockCode"
          >{{ codeCountdown > 0 ? `${codeCountdown}s` : '获取验证码' }}</TButton>
        </div>
        <TInput v-else v-model="phone" placeholder="手机号" />
        <template v-if="isRegister">
          <div v-if="codeSent" class="code-hint">测试验证码：<strong>{{ smsCode }}</strong></div>
          <TInput v-model="enteredCode" placeholder="输入验证码" />
        </template>
        <TInput v-model="password" type="password" placeholder="密码" />
        <TButton type="primary" :loading="loading" class="submit-btn" @click="submit">
          {{ submitLabel }}
        </TButton>
        <div class="switch-link" @click="isRegister = !isRegister; resetSmsState()">
          {{ isRegister ? '已有账号？去登录' : '没有账号？去注册' }}
        </div>
      </div>
    </TCard>
  </div>
</template>

<style scoped>
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
  overflow: hidden;
  border: 1px solid rgba(91, 141, 184, 0.14);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 251, 254, 0.98));
  box-shadow: 0 18px 52px rgba(41, 73, 102, 0.12);
}
.hero-mark {
  width: 56px;
  height: 6px;
  margin: 0 auto 18px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(91, 141, 184, 0.18), rgba(91, 141, 184, 0.78), rgba(91, 141, 184, 0.18));
}
.title { font-size: var(--text-2xl); font-weight: 700; text-align: center; margin-bottom: 8px; }
.tagline { margin: 0 0 18px; text-align: center; font-size: var(--text-sm); color: var(--text-secondary); }
.form { display: flex; flex-direction: column; gap: 12px; }
.form-alert {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(196, 77, 86, 0.18);
  background: linear-gradient(180deg, rgba(255, 244, 244, 0.96), rgba(255, 249, 249, 0.98));
  color: #9c3c45;
  font-size: var(--text-sm);
  line-height: 1.4;
}
.switch-link { text-align: center; margin-top: 2px; font-size: var(--text-sm); color: var(--color-accent); cursor: pointer; }
.switch-link:hover { text-decoration: underline; }
.phone-row { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 12px; align-items: stretch; }
.phone-input-wrap { flex: 1; min-width: 0; }
.code-btn {
  flex-shrink: 0;
  min-height: 36px;
  white-space: nowrap;
  border-radius: 12px;
}
.code-hint {
  padding: 8px 12px;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  background: rgba(255, 255, 255, 0.72);
  border: 1px dashed rgba(91, 141, 184, 0.24);
  border-radius: 12px;
}
.code-hint strong { color: var(--color-accent); font-family: monospace; letter-spacing: 0.12em; }
.submit-btn {
  width: 100%;
  min-height: 40px;
  margin-top: 4px;
  background: linear-gradient(135deg, #5b8db8 0%, #44739a 100%);
  box-shadow: 0 12px 28px rgba(91, 141, 184, 0.28);
}
.submit-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #5687b0 0%, #3d6a8f 100%);
}
@media (max-width: 480px) {
  .login-page {
    padding: 16px;
    align-items: stretch;
  }
  .login-card {
    width: 100%;
    margin: auto 0;
  }
  .phone-row {
    grid-template-columns: 1fr;
  }
  .code-btn {
    width: 100%;
  }
}
</style>
