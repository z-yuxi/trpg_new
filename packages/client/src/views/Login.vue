<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
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
const nickname = ref('');
const isRegister = ref(false);
const error = ref('');
const loading = ref(false);

// 模拟短信验证码（仅本地开发测试用，上线前替换为真实短信 API）
const smsCode = ref('');
const enteredCode = ref('');
const codeSent = ref(false);
const codeCountdown = ref(0);
let codeTimer: ReturnType<typeof setInterval> | null = null;

function sendMockCode() {
  if (!phone.value.trim()) {
    error.value = '请先输入手机号';
    return;
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
        body: JSON.stringify({ phone: phone.value, password: password.value, nickname: nickname.value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '注册失败');
      const accessToken = data?.tokens?.access_token;
      if (!accessToken) throw new Error('注册成功但未获取到令牌');
      if (data?.tokens?.refresh_token) setRefreshToken(data.tokens.refresh_token);
      authStore.setAuth({ token: accessToken, userId: data.user.id, nickname: data.user.nickname, avatarUrl: data.user.avatar_url, expiresIn: data?.tokens?.expires_in });
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
      authStore.setAuth({ token: accessToken, userId: data.user.id, nickname: data.user.nickname, avatarUrl: data.user.avatar_url, expiresIn: data?.tokens?.expires_in });
    }
    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (e: any) {
    error.value = e.message || '操作失败';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <TCard padding="lg" shadow class="login-card">
      <h1 class="title">{{ isRegister ? '注册' : '登录' }}</h1>
      <p class="tagline">让故事因同行而生动</p>
      <div class="form">
        <!-- 手机号（注册时带『获取验证码』按钮） -->
        <div v-if="isRegister" class="phone-row">
          <div class="phone-input-wrap"><TInput v-model="phone" placeholder="手机号" /></div>
          <TButton
            type="secondary"
            size="sm"
            class="code-btn"
            :disabled="codeCountdown > 0"
            @click="sendMockCode"
          >{{ codeCountdown > 0 ? `${codeCountdown}s` : '获取验证码' }}</TButton>
        </div>
        <TInput v-else v-model="phone" placeholder="手机号" />
        <!-- 模拟验证码（仅注册时显示） -->
        <template v-if="isRegister">
          <div v-if="codeSent" class="code-hint">测试验证码：<strong>{{ smsCode }}</strong></div>
          <TInput v-model="enteredCode" placeholder="输入验证码" style="margin-top:8px" />
        </template>
        <TInput v-model="password" type="password" placeholder="密码" style="margin-top:12px" />
        <TInput v-if="isRegister" v-model="nickname" placeholder="昵称" style="margin-top:12px" />
        <div v-if="error" class="error">{{ error }}</div>
        <TButton type="primary" :loading="loading" style="width:100%;margin-top:16px" @click="submit">
          {{ isRegister ? '注册' : '登录' }}
        </TButton>
        <div class="switch-link" @click="isRegister = !isRegister; resetSmsState()">
          {{ isRegister ? '已有账号？去登录' : '没有账号？去注册' }}
        </div>
      </div>
    </TCard>
  </div>
</template>

<style scoped>
.login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--color-page-bg); }
.login-card { width: 360px; }
.title { font-size: var(--text-2xl); font-weight: 700; text-align: center; margin-bottom: var(--space-6); }
.tagline { margin: calc(var(--space-6) * -1 + 8px) 0 var(--space-5); text-align: center; font-size: var(--text-sm); color: var(--text-secondary); }
.form { display: flex; flex-direction: column; }
.error { color: var(--color-danger); font-size: var(--text-sm); margin-top: var(--space-2); text-align: center; }
.switch-link { text-align: center; margin-top: var(--space-4); font-size: var(--text-sm); color: var(--color-accent); cursor: pointer; }
.switch-link:hover { text-decoration: underline; }
.phone-row { display: flex; gap: 8px; align-items: stretch; }
.phone-input-wrap { flex: 1; min-width: 0; }
.code-btn { flex-shrink: 0; white-space: nowrap; }
.code-hint {
  margin-top: 8px; padding: 6px 12px;
  font-size: var(--text-sm); color: var(--color-text-muted);
  background: var(--color-page-bg);
  border: 1px dashed var(--color-card-border);
  border-radius: var(--radius-sm);
}
.code-hint strong { color: var(--color-accent); font-family: monospace; letter-spacing: 0.12em; }
</style>
