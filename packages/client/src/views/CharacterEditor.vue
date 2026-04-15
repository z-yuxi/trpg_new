<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';
import TInput from '../components/base/TInput.vue';

const route = useRoute();
const characterId = route.params.id as string | undefined;

const form = ref({
  name: '',
  occupation: '',
  age: '25',
  background: '',
  attributes: { STR: 50, DEX: 50, POW: 50, CON: 50, APP: 50, SIZ: 50, INT: 60, EDU: 70 },
});

function save() {
  // TODO: 调用 API
  console.log('save character', form.value);
}
</script>

<template>
  <div class="char-editor">
    <h1 class="page-title">{{ characterId ? '编辑角色' : '创建角色' }}</h1>
    <TCard padding="lg" shadow>
      <div class="section">
        <h2 class="section-title">基本信息</h2>
        <div class="grid-2">
          <div class="field">
            <label>姓名</label>
            <TInput v-model="form.name" placeholder="角色姓名" />
          </div>
          <div class="field">
            <label>职业</label>
            <TInput v-model="form.occupation" placeholder="职业" />
          </div>
          <div class="field">
            <label>年龄</label>
            <TInput v-model="form.age" type="number" placeholder="年龄" />
          </div>
        </div>
        <div class="field" style="margin-top:12px">
          <label>背景故事</label>
          <textarea v-model="form.background" class="textarea" rows="4" placeholder="填写角色背景故事..." />
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">基础属性</h2>
        <div class="attrs-grid">
          <div v-for="(val, key) in form.attributes" :key="key" class="attr-row">
            <label class="attr-label">{{ key }}</label>
            <input v-model.number="(form.attributes as any)[key]" type="number" class="attr-input" min="1" max="100" />
            <div class="attr-bar"><div class="attr-fill" :style="{ width: `${val}%` }" /></div>
          </div>
        </div>
      </div>

      <div class="actions">
        <TButton type="secondary">取消</TButton>
        <TButton type="primary" @click="save">保存角色</TButton>
      </div>
    </TCard>
  </div>
</template>

<style scoped>
.char-editor { max-width: 800px; margin: 0 auto; }
.page-title { font-size: var(--text-2xl); font-weight: 700; margin-bottom: var(--space-4); }
.section { margin-bottom: var(--space-6); }
.section-title { font-size: var(--text-lg); font-weight: 600; margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-card-border); padding-bottom: var(--space-2); }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-4); }
.field label { display: block; font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: var(--space-1); }
.textarea { width: 100%; padding: var(--space-3); border: 1px solid var(--color-input-border); border-radius: var(--radius-md); background: var(--color-input-bg); font-size: var(--text-sm); resize: vertical; font-family: var(--font-sans); }
.attrs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-3); }
.attr-row { display: flex; align-items: center; gap: var(--space-2); }
.attr-label { width: 40px; font-size: var(--text-sm); font-weight: 600; font-family: var(--font-mono); }
.attr-input { width: 56px; padding: 4px 8px; border: 1px solid var(--color-input-border); border-radius: var(--radius-md); text-align: center; font-size: var(--text-sm); }
.attr-bar { flex: 1; height: 6px; background: var(--color-card-border); border-radius: var(--radius-full); overflow: hidden; }
.attr-fill { height: 100%; background: var(--color-accent); border-radius: var(--radius-full); transition: width var(--transition-normal); }
.actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-4); }
</style>
