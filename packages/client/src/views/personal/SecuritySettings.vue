<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../../stores/auth-store';

const router = useRouter();
const authStore = useAuthStore();

const currentPwd = ref('');
const newPwd = ref('');
const confirmPwd = ref('');
const saving = ref(false);

// Password strength: 0-4
const strength = computed(() => {
  const v = newPwd.value;
  if (!v) return 0;
  let s = 0;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v)) s++;
  if (/[0-9]/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  return s;
});

const strengthLabel = computed(() => ['', '弱', '中', '强', '非常强'][strength.value]);
const strengthClass = computed(() => ['', 'weak', 'medium', 'strong', 'very-strong'][strength.value]);

async function changePassword() {
  if (!currentPwd.value || !newPwd.value || !confirmPwd.value) {
    ElMessage.warning('请填写所有字段');
    return;
  }
  if (newPwd.value !== confirmPwd.value) {
    ElMessage.error('两次输入的新密码不一致');
    return;
  }
  if (strength.value < 2) {
    ElMessage.warning('密码强度过低，请包含大写字母或数字');
    return;
  }
  saving.value = true;
  try {
    const res = await fetch('/api/users/me/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify({ current_password: currentPwd.value, new_password: newPwd.value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || '修改失败');
    }
    ElMessage.success('密码修改成功');
    currentPwd.value = '';
    newPwd.value = '';
    confirmPwd.value = '';
  } catch (e: unknown) {
    ElMessage.error((e as Error).message || '修改失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="settings-page">
    <button class="back-btn" @click="router.back()">&#8592; 返回</button>
    <div class="settings-card">
      <h2 class="title">账号安全</h2>

      <section class="section">
        <h3 class="section-title">修改密码</h3>
        <div class="form-group">
          <label class="form-label">当前密码</label>
          <input v-model="currentPwd" type="password" class="form-input" placeholder="请输入当前密码" autocomplete="current-password" />
        </div>
        <div class="form-group">
          <label class="form-label">新密码</label>
          <input v-model="newPwd" type="password" class="form-input" placeholder="请输入新密码（8位以上）" autocomplete="new-password" />
          <div v-if="newPwd" class="strength-bar">
            <div class="strength-fill" :class="strengthClass" :style="{ width: (strength * 25) + '%' }"></div>
          </div>
          <div v-if="newPwd" class="strength-label" :class="strengthClass">密码强度：{{ strengthLabel }}</div>
        </div>
        <div class="form-group">
          <label class="form-label">确认新密码</label>
          <input v-model="confirmPwd" type="password" class="form-input" placeholder="再次输入新密码" autocomplete="new-password" />
        </div>
        <button class="save-btn" @click="changePassword" :disabled="saving">
          {{ saving ? '保存中…' : '确认修改' }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-page { max-width: 640px; margin: 0 auto; padding: var(--space-4); }
.back-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: var(--text-sm); padding: 0 0 var(--space-3); transition: color var(--transition-fast); }
.back-btn:hover { color: var(--color-accent); }
.settings-card { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-6); }
.title { margin: 0 0 var(--space-5); font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); }
.section { margin-bottom: var(--space-6); }
.section-title { font-size: var(--text-base); font-weight: 600; color: var(--text-primary); margin: 0 0 var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--border-default); }
.form-group { margin-bottom: var(--space-4); }
.form-label { display: block; font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: 6px; }
.form-input {
  width: 100%; padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-default); border-radius: var(--radius-md);
  background: var(--surface-hover); color: var(--text-primary);
  font-size: var(--text-sm); box-sizing: border-box; outline: none;
  transition: border-color var(--transition-fast);
}
.form-input:focus { border-color: var(--color-accent); }
.strength-bar { height: 4px; background: var(--surface-hover); border-radius: 2px; margin-top: 6px; overflow: hidden; }
.strength-fill { height: 100%; border-radius: 2px; transition: width 0.3s, background 0.3s; }
.strength-fill.weak { background: #ef4444; }
.strength-fill.medium { background: #f59e0b; }
.strength-fill.strong { background: #22c55e; }
.strength-fill.very-strong { background: #16a34a; }
.strength-label { font-size: var(--text-xs); margin-top: 4px; }
.strength-label.weak { color: #ef4444; }
.strength-label.medium { color: #f59e0b; }
.strength-label.strong { color: #22c55e; }
.strength-label.very-strong { color: #16a34a; }
.save-btn {
  padding: var(--space-2) var(--space-5); border: none; border-radius: var(--radius-md);
  background: var(--color-accent); color: #fff; cursor: pointer;
  font-size: var(--text-sm); font-weight: 600; transition: opacity var(--transition-fast);
}
.save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
