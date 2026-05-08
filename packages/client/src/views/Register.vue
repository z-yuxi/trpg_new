<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';

const router = useRouter();
const route = useRoute();

// ── 表单字段 ───────────────────────────────────────────────────────
const phone = ref((route.query.phone as string) || '');
const areaCode = ref('+86');
const verificationCode = ref('');
const password = ref('');
const showPassword = ref(false);
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

// ── 短信验证码（测试用，上线替换） ─────────────────────────────────
const smsCode = ref('');
const codeSent = ref(false);
const codeCountdown = ref(0);
let codeTimer: ReturnType<typeof setInterval> | null = null;

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
}

onUnmounted(() => { if (codeTimer) clearInterval(codeTimer); });

// ── 密码强度辅助文案 ─────────────────────────────────────────────
const passwordHint = ref('');
function checkPasswordStrength(val: string) {
  if (!val) { passwordHint.value = ''; return; }
  if (val.length < 8) { passwordHint.value = '密码至少 8 位'; return; }
  if (!/[a-zA-Z]/.test(val) || !/[0-9]/.test(val)) { passwordHint.value = '需包含字母和数字'; return; }
  passwordHint.value = '';
}

function normalizeError(msg: string): string {
  if (msg.includes('已注册') || msg.includes('already')) return '该手机号已注册，请直接登录';
  if (msg.includes('验证码')) return '验证码错误或已过期，请重新获取';
  if (msg.includes('json') || msg.includes('Unexpected')) return '网络异常，请稍后重试';
  return msg;
}

async function submit() {
  phoneError.value = '';
  codeError.value = '';
  passwordError.value = '';
  globalError.value = '';

  if (!phone.value.trim()) { phoneError.value = '请输入手机号'; return; }
  if (!codeSent.value) { codeError.value = '请先获取验证码'; return; }
  if (!verificationCode.value.trim()) { codeError.value = '请输入验证码'; return; }
  if (verificationCode.value !== smsCode.value) { codeError.value = '验证码错误或已过期，请重新获取'; return; }

  // 密码选填时的格式校验
  if (password.value) {
    if (password.value.length < 8) { passwordError.value = '密码至少 8 位'; return; }
    if (!/[a-zA-Z]/.test(password.value) || !/[0-9]/.test(password.value)) {
      passwordError.value = '密码需包含字母和数字';
      return;
    }
  }

  if (!agreedToTerms.value) { globalError.value = '请先阅读并同意服务协议和隐私政策'; return; }

  loading.value = true;
  try {
    const body: Record<string, string> = { phone: phone.value };
    if (password.value) body.password = password.value;

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '注册失败');

    // 注册成功 → 跳转验证码登录页，手机号预填
    router.push({ name: 'LoginCode', query: { phone: phone.value } });
  } catch (e) {
    globalError.value = normalizeError(e instanceof Error ? e.message : '注册失败');
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
        <h1 class="title">创建你的共叙账号</h1>
        <p class="tagline">让故事因同行而生动</p>
      </div>

      <div class="form">
        <!-- 全局错误 -->
        <p v-if="globalError" class="global-error">{{ globalError }}</p>

        <!-- 手机号 + 区号 -->
        <div class="field-block">
          <div ref="areaCodeRef" class="phone-wrap">
            <div class="phone-row">
              <button type="button" class="area-code-btn" @click="areaCodeOpen = !areaCodeOpen">
                {{ areaCode }} <span class="chevron">▾</span>
              </button>
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

        <!-- 验证码内联行 -->
        <div class="field-block">
          <div class="inline-row" :class="{ 'has-error': codeError }">
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

        <!-- 密码（选填） -->
        <div class="field-block">
          <div class="pwd-row">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="设置密码（可选）"
              class="pwd-input"
              autocomplete="new-password"
              @input="checkPasswordStrength(password)"
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
          <p v-else-if="passwordHint" class="field-hint">{{ passwordHint }}</p>
          <p v-else-if="!password" class="field-hint muted">不设置则只能使用验证码登录</p>
        </div>

        <!-- 注册按钮 -->
        <TButton
          type="primary"
          :loading="loading"
          :disabled="!agreedToTerms"
          class="submit-btn"
          @click="submit"
        >注 册</TButton>

        <!-- 协议勾选（注册必须） -->
        <label class="agreement-label">
          <input type="checkbox" v-model="agreedToTerms" class="agreement-checkbox" />
          <span>
            我已阅读并同意
            <a href="/terms" target="_blank" rel="noopener" class="agreement-link">《服务协议》</a>
            和
            <a href="/privacy" target="_blank" rel="noopener" class="agreement-link">《隐私政策》</a>
          </span>
        </label>

        <!-- 去登录 -->
        <p class="bottom-link">
          已有账号？<a class="link" @click="router.push({ name: 'LoginCode' })">去登录 →</a>
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
.title { font-size: var(--text-xl, 19px); font-weight: 700; margin: 0 0 6px; }
.tagline { margin: 0; font-size: var(--text-sm, 13px); color: var(--text-secondary, #5c6b7a); }
.form { display: flex; flex-direction: column; gap: 10px; }
.field-block { display: flex; flex-direction: column; gap: 4px; }
.field-error { margin: 0; font-size: 12px; color: #c44d56; line-height: 1.4; }
.field-hint { margin: 0; font-size: 12px; color: var(--text-secondary, #5c6b7a); line-height: 1.4; }
.field-hint.muted { color: var(--text-muted, #8fa3b1); }
.global-error {
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(255, 244, 244, 0.8);
  border: 1px solid rgba(196, 77, 86, 0.18);
  font-size: 13px;
  color: #c44d56;
  margin: 0;
}

/* ── 手机号 ── */
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
.ac-code { font-weight: 500; min-width: 42px; }
.ac-desc { font-size: 12px; color: var(--text-muted, #8fa3b1); }

/* ── 验证码内联行 ── */
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
.inline-row.has-error { border-color: #c44d56; }
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
.inline-sep { width: 1px; background: rgba(41, 73, 102, 0.1); flex-shrink: 0; margin: 10px 0; }
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
.code-hint { margin: 0; font-size: 12px; color: var(--text-muted, #8fa3b1); }
.code-hint strong { color: var(--color-accent, #5b8db8); font-family: monospace; letter-spacing: 0.1em; }

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
.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── 协议勾选 ── */
.agreement-label {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
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

/* ── 底部链接 ── */
.bottom-link {
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary, #5c6b7a);
}
.link {
  color: var(--color-accent, #5b8db8);
  cursor: pointer;
  text-decoration: none;
  font-weight: 500;
}
.link:hover { text-decoration: underline; }

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
