<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  ElTabs,
  ElTabPane,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  ElInputNumber,
  ElMessage,
  ElCheckboxGroup,
  ElCheckbox,
} from 'element-plus';
import RecruitmentBoard from './RecruitmentBoard.vue';
import TButton from '../../components/base/TButton.vue';
import { useAuthStore } from '../../stores/auth-store';
import { api } from '../../utils/api';

interface RulesetOption {
  id: string;
  name: string;
}

const authStore = useAuthStore();
const activeTab = ref<'gm_recruit' | 'player_seek'>('gm_recruit');
const boardVersion = ref(1);

const showPostDialog = ref(false);
const submitLoading = ref(false);
const rulesets = ref<RulesetOption[]>([]);

const tagOptions = ['新手友好', '长期团', '单发团', '语音团', '文字团'];

const postForm = ref({
  type: 'gm_recruit' as 'gm_recruit' | 'player_seek',
  title: '',
  ruleset_id: '',
  module_name: '',
  player_count_max: 4,
  schedule_text: '',
  description: '',
  tags: [] as string[],
});

const titleLeft = computed(() => 50 - postForm.value.title.length);
const descLeft = computed(() => 2000 - postForm.value.description.length);

async function loadRulesets() {
  try {
    const result = await api.get<Array<{ id: string; name: string }>>('/rulesets');
    if (Array.isArray(result) && result.length > 0) {
      rulesets.value = result.map((item) => ({ id: item.id, name: item.name }));
    }
  } catch {
    // ignore
  }
  if (rulesets.value.length === 0) {
    rulesets.value = [
      { id: 'coc', name: '克苏鲁神话' },
      { id: 'dnd5e', name: 'D&D 5e' },
    ];
  }
}

function resetPostForm() {
  postForm.value = {
    type: activeTab.value,
    title: '',
    ruleset_id: '',
    module_name: '',
    player_count_max: 4,
    schedule_text: '',
    description: '',
    tags: [],
  };
}

function openPostDialog() {
  resetPostForm();
  showPostDialog.value = true;
}

async function submitPost() {
  if (!authStore.token) {
    ElMessage.warning('请先登录后再发布');
    return;
  }

  const title = postForm.value.title.trim();
  if (!title || title.length > 50) {
    ElMessage.warning('标题必填且不超过 50 字');
    return;
  }

  if (!postForm.value.ruleset_id) {
    ElMessage.warning('请选择规则包');
    return;
  }

  submitLoading.value = true;
  try {
    await api.post('/recruitment', {
      title,
      type: postForm.value.type,
      ruleset_id: postForm.value.ruleset_id,
      module_name: postForm.value.module_name.trim() || null,
      player_count_max: postForm.value.player_count_max,
      schedule_text: postForm.value.schedule_text.trim() || null,
      description: postForm.value.description.trim() || null,
      tags: postForm.value.tags,
    });
    ElMessage.success('发布成功');
    showPostDialog.value = false;
    boardVersion.value += 1;
  } catch (err: any) {
    ElMessage.error(err?.message ?? '发布失败');
  } finally {
    submitLoading.value = false;
  }
}

onMounted(loadRulesets);
</script>

<template>
  <div class="recruit-section">
    <div class="section-header">
      <h2 class="section-title">组团招募</h2>
      <TButton type="primary" @click="openPostDialog">+ 发布招募帖</TButton>
    </div>

    <ElTabs v-model="activeTab">
      <ElTabPane label="GM 招玩家" name="gm_recruit">
        <RecruitmentBoard :key="`gm-${boardVersion}`" type="gm_recruit" :rulesets="rulesets" />
      </ElTabPane>
      <ElTabPane label="玩家求组" name="player_seek">
        <RecruitmentBoard :key="`player-${boardVersion}`" type="player_seek" :rulesets="rulesets" />
      </ElTabPane>
    </ElTabs>

    <ElDialog v-model="showPostDialog" title="发布招募帖" width="680px" destroy-on-close>
      <ElForm :model="postForm" label-position="top">
        <ElFormItem label="标题（必填，最多 50 字）" required>
          <ElInput v-model="postForm.title" maxlength="50" show-word-limit />
          <div class="hint">剩余 {{ titleLeft }} 字</div>
        </ElFormItem>

        <ElFormItem label="招募类型" required>
          <ElSelect v-model="postForm.type" style="width:100%">
            <ElOption label="GM 招玩家" value="gm_recruit" />
            <ElOption label="玩家求组" value="player_seek" />
          </ElSelect>
        </ElFormItem>

        <div class="grid-row">
          <ElFormItem label="规则包" required>
            <ElSelect v-model="postForm.ruleset_id" filterable style="width:100%">
              <ElOption v-for="item in rulesets" :key="item.id" :label="item.name" :value="item.id" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="模组（可选）">
            <ElInput v-model="postForm.module_name" maxlength="100" placeholder="例如：待定" />
          </ElFormItem>
        </div>

        <div class="grid-row">
          <ElFormItem label="需求人数" required>
            <ElInputNumber v-model="postForm.player_count_max" :min="1" :max="20" controls-position="right" />
          </ElFormItem>
          <ElFormItem label="时间安排">
            <ElInput v-model="postForm.schedule_text" maxlength="255" placeholder="例如：每周六晚 8-11 点" />
          </ElFormItem>
        </div>

        <ElFormItem label="描述（最多 2000 字）">
          <ElInput v-model="postForm.description" type="textarea" :rows="5" maxlength="2000" show-word-limit />
          <div class="hint">剩余 {{ descLeft }} 字</div>
        </ElFormItem>

        <ElFormItem label="标签">
          <ElCheckboxGroup v-model="postForm.tags">
            <ElCheckbox v-for="tag in tagOptions" :key="tag" :label="tag">{{ tag }}</ElCheckbox>
          </ElCheckboxGroup>
        </ElFormItem>
      </ElForm>

      <template #footer>
        <TButton type="secondary" @click="showPostDialog = false">取消</TButton>
        <TButton type="primary" :loading="submitLoading" @click="submitPost">发布</TButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.recruit-section { display: flex; flex-direction: column; gap: var(--space-4); }
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title { font-size: var(--text-xl); font-weight: var(--font-bold); color: var(--text-primary); }
.grid-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}
.hint { margin-top: 4px; font-size: var(--text-xs); color: var(--text-muted); }
@media (max-width: 640px) { .grid-row { grid-template-columns: 1fr; } }
</style>
