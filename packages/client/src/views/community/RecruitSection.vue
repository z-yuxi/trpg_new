<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
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
  ElSwitch,
} from 'element-plus';
import RecruitmentBoard from './RecruitmentBoard.vue';
import MyRecruitments from './MyRecruitments.vue';
import TButton from '../../components/base/TButton.vue';
import { showApiError } from '../../utils/feedback';
import { useAuthStore } from '../../stores/auth-store';
import { useRoute, useRouter } from 'vue-router';
import { createRecruitment, publishRecruitment } from '../../api/recruitment';
import { listRulesets } from '../../api/rulesets';
import {
  createRecruitmentMetadata,
  hasRecruitmentValue,
  resolveRecruitmentFields,
  type RecruitmentField,
} from '../../utils/recruitment-fields';

interface RulesetOption {
  id: string;
  name: string;
  character_card_schema?: unknown;
  recruitment_fields?: unknown;
}

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
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
  metadata: {} as Record<string, unknown>,
});

const titleLeft = computed(() => 50 - postForm.value.title.length);
const descLeft = computed(() => 2000 - postForm.value.description.length);
const currentRuleset = computed(() => rulesets.value.find((item) => item.id === postForm.value.ruleset_id) ?? null);
const currentRecruitmentFields = computed<RecruitmentField[]>(() => resolveRecruitmentFields(currentRuleset.value));

async function loadRulesets() {
  try {
    const result = await listRulesets();
    const items = result.data ?? [];
    if (Array.isArray(items) && items.length > 0) {
      rulesets.value = items.map((item) => ({
        id: item.id,
        name: item.name,
        character_card_schema: item.character_card_schema,
        recruitment_fields: item.recruitment_fields,
      }));
    }
  } catch {
    // ignore
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
    metadata: {},
  };
}

function syncRecruitmentMetadata(forceReset = false) {
  const fields = currentRecruitmentFields.value;
  if (fields.length === 0) {
    postForm.value.metadata = {};
    return;
  }
  const defaults = createRecruitmentMetadata(fields);
  postForm.value.metadata = fields.reduce<Record<string, unknown>>((result, field) => {
    const currentValue = postForm.value.metadata[field.name];
    result[field.name] = !forceReset && currentValue !== undefined ? currentValue : defaults[field.name];
    return result;
  }, {});
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
    const created = await createRecruitment({
      title,
      type: postForm.value.type,
      ruleset_id: postForm.value.ruleset_id,
      module_name: postForm.value.module_name.trim() || null,
      player_count_max: postForm.value.player_count_max,
      schedule_text: postForm.value.schedule_text.trim() || null,
      description: postForm.value.description.trim() || null,
      tags: postForm.value.tags,
      metadata: Object.fromEntries(
        Object.entries(postForm.value.metadata).filter(([, value]) => hasRecruitmentValue(value))
      ),
    });
    // 创建后立即发布（draft → open）
    try {
      await publishRecruitment(created.id);
      ElMessage.success('招募帖已发布');
    } catch {
      ElMessage.success('招募帖已创建（草稿），请在详情页发布');
    }
    showPostDialog.value = false;
    // 跳转到详情页让 GM 管理申请
    router.push(`/recruit/${created.id}`);
  } catch (err: unknown) {
    showApiError(err, '发布失败');
  } finally {
    submitLoading.value = false;
  }
}

watch(() => postForm.value.ruleset_id, () => {
  syncRecruitmentMetadata(true);
});
watch(currentRecruitmentFields, () => {
  syncRecruitmentMetadata(false);
});

onMounted(async () => {
  await loadRulesets();
  // 支持 ?action=post 从首页快捷入口直接打开发帖弹窗
  if (route.query.action === 'post' && authStore.token) {
    openPostDialog();
  }
});
</script>

<template>
  <div class="recruit-section">
    <div class="section-header">
      <h2 class="section-title">招募</h2>
      <TButton type="primary" @click="openPostDialog">发布招募帖</TButton>
    </div>

    <ElTabs v-model="activeTab">
      <ElTabPane label="找房间" name="gm_recruit">
        <RecruitmentBoard :key="`gm-${boardVersion}`" fixed-type="gm_recruit" :rulesets="rulesets" />
      </ElTabPane>
      <ElTabPane label="开团招人" name="player_seek">
        <RecruitmentBoard :key="`player-${boardVersion}`" fixed-type="player_seek" :rulesets="rulesets" />
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
            <ElOption label="找房间（GM 招募帖）" value="gm_recruit" />
            <ElOption label="开团招人（玩家求组帖）" value="player_seek" />
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

        <div v-if="currentRecruitmentFields.length" class="field-panel">
          <div class="field-panel__title">规则集附加要求</div>
          <div class="field-panel__desc">这些字段会写入招募帖 metadata，并在详情页中展示。</div>
          <div class="field-grid">
            <ElFormItem v-for="field in currentRecruitmentFields" :key="field.name" :label="field.label">
              <ElInput
                v-if="field.type === 'text'"
                :model-value="(postForm.metadata[field.name] as string | number | null | undefined) ?? ''"
                @update:model-value="(value) => (postForm.metadata[field.name] = value)"
                :placeholder="field.placeholder || `请输入${field.label}`"
              />
              <ElInputNumber
                v-else-if="field.type === 'number'"
                :model-value="(postForm.metadata[field.name] as number | null | undefined) ?? null"
                @update:model-value="(value) => (postForm.metadata[field.name] = value)"
                :min="0"
                controls-position="right"
                style="width:100%"
              />
              <ElSwitch
                v-else-if="field.type === 'boolean'"
                :model-value="!!(postForm.metadata[field.name])"
                @update:model-value="(value) => (postForm.metadata[field.name] = value)"
              />
              <template v-else-if="field.type === 'number_range'">
                <div class="range-row">
                  <ElInputNumber
                    :model-value="(postForm.metadata[`${field.name}_min`] as number | null | undefined) ?? null"
                    @update:model-value="(value) => (postForm.metadata[`${field.name}_min`] = value)"
                    :min="0"
                    controls-position="right"
                    style="width:100%"
                  />
                  <span class="range-split">-</span>
                  <ElInputNumber
                    :model-value="(postForm.metadata[`${field.name}_max`] as number | null | undefined) ?? null"
                    @update:model-value="(value) => (postForm.metadata[`${field.name}_max`] = value)"
                    :min="0"
                    controls-position="right"
                    style="width:100%"
                  />
                </div>
              </template>
            </ElFormItem>
          </div>
        </div>
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
.section-header { display: flex; align-items: center; justify-content: space-between; }
.section-title { margin: 0; font-size: var(--text-xl); font-weight: 700; color: var(--color-text-primary); }
.hint { margin-top: 4px; font-size: var(--text-xs); color: var(--text-muted); }
.field-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 6%, var(--color-bg-secondary));
}
.field-panel__title { font-size: var(--text-base); font-weight: 700; color: var(--text-primary); }
.field-panel__desc { color: var(--text-muted); font-size: var(--text-sm); }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
.range-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: var(--space-2); align-items: center; }
.range-split { color: var(--text-muted); }
.grid-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
@media (max-width: 640px) {
  .grid-row,
  .field-grid { grid-template-columns: 1fr; }
}
</style>
