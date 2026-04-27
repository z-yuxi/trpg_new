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

const phone = ref('');
const password = ref('');
const nickname = ref('');
const isRegister = ref(false);
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    if (isRegister.value) {
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
      authStore.setAuth({ token: accessToken, userId: data.user.id, nickname: data.user.nickname, avatarUrl: data.user.avatar_url });
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
      authStore.setAuth({ token: accessToken, userId: data.user.id, nickname: data.user.nickname, avatarUrl: data.user.avatar_url });
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
        <TInput v-model="phone" placeholder="手机号" />
        <TInput v-model="password" type="password" placeholder="密码" style="margin-top:12px" />
        <TInput v-if="isRegister" v-model="nickname" placeholder="昵称" style="margin-top:12px" />
        <div v-if="error" class="error">{{ error }}</div>
        <TButton type="primary" :loading="loading" style="width:100%;margin-top:16px" @click="submit">
          {{ isRegister ? '注册' : '登录' }}
        </TButton>
        <div class="switch-link" @click="isRegister = !isRegister">
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
</style>
