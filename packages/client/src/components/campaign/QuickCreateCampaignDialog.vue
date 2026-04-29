<script setup lang="ts">
/**
 * 一键创建房间向导对话框
 *
 * 步骤 1：基础信息（房间名、规则包/模组、私密/公开）
 * 步骤 2（可选，公开房间）：招募帖配置
 *
 * 调用后端 POST /api/campaigns/quick-create，原子化创建房间 + 可选招募帖。
 * 完成后发出 @created({ campaignId, recruitmentPostId? }) 事件，由父组件决定跳转。
 */
import { computed, ref, watch } from 'vue';
import {
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  ElInputNumber,
  ElCheckbox,
  ElSteps,
  ElStep,
  ElMessage,
} from 'element-plus';
import TButton from '../base/TButton.vue';
import { api } from '../../utils/api';

interface RulesetOption {
  id: string;
  name: string;
}

interface ModuleOption {
  id: string;
  name?: string;
  title?: string;
  ruleset_id?: string;
}

const props = withDefaults(
  defineProps<{
    visible: boolean;
    /** 从我的资产进入时预填 */
    prefillModuleId?: string | null;
    prefillRulesetId?: string | null;
    rulesets?: RulesetOption[];
    modules?: ModuleOption[];
  }>(),
  {
    prefillModuleId: null,
    prefillRulesetId: null,
    rulesets: () => [],
    modules: () => [],
  },
);

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'created', payload: { campaignId: string; recruitmentPostId: string | null }): void;
}>();

// ─── state ────────────────────────────────────────────────────────────────────

const step = ref(0);          // 0 = 基础信息  1 = 招募帖配置（可选）
const loading = ref(false);

const form = ref({
  name: '',
  ruleset_id: props.prefillRulesetId ?? '',
  module_id: props.prefillModuleId ?? (null as string | null),
  allow_ob: false,
  /** 私密=false，公开=true */
  is_listed_publicly: false,
  /** 是否同时发布招募帖 */
  recruit: false,
  recruitment: {
    title: '',
    description: '',
    player_count_max: 4,
    schedule_text: '',
    schedule_weekday: [] as string[],
    schedule_time_slot: '' as string,
    tags: [] as string[],
  },
});

const tagOptions = ['新手友好', '长期团', '单发团', '语音团', '文字团'];

const totalSteps = computed(() => (form.value.is_listed_publicly && form.value.recruit ? 2 : 1));
const isLastStep = computed(() => step.value === totalSteps.value - 1);
const canNext = computed(() => {
  if (step.value === 0) {
    return form.value.name.trim().length > 0 && form.value.ruleset_id.length > 0;
  }
  return form.value.recruitment.title.trim().length > 0;
});

// 公开模式关闭时，重置 recruit 标志
watch(() => form.value.is_listed_publicly, (v) => {
  if (!v) form.value.recruit = false;
});

// 预填帖标题
watch(() => form.value.name, (v) => {
  if (!form.value.recruitment.title) {
    form.value.recruitment.title = v;
  }
});

// 从外部 prefill 同步
watch(() => [props.prefillModuleId, props.prefillRulesetId], ([mid, rid]) => {
  if (mid) form.value.module_id = mid as string;
  if (rid) form.value.ruleset_id = rid as string;
});

// ─── actions ──────────────────────────────────────────────────────────────────

function handleClose() {
  emit('update:visible', false);
  step.value = 0;
  form.value = {
    name: '',
    ruleset_id: props.prefillRulesetId ?? '',
    module_id: props.prefillModuleId ?? null,
    allow_ob: false,
    is_listed_publicly: false,
    recruit: false,
    recruitment: { title: '', description: '', player_count_max: 4, schedule_text: '', schedule_weekday: [], schedule_time_slot: '', tags: [] },
  };
}

function nextStep() {
  if (!isLastStep.value) {
    step.value++;
  }
}

async function submit() {
  if (!canNext.value) return;

  loading.value = true;
  try {
    const payload: Record<string, unknown> = {
      name: form.value.name.trim(),
      ruleset_id: form.value.ruleset_id,
      module_id: form.value.module_id ?? null,
      allow_ob: form.value.allow_ob,
      is_listed_publicly: form.value.is_listed_publicly,
      recruit: form.value.recruit,
    };
    if (form.value.recruit) {
      payload.recruitment = {
        title: form.value.recruitment.title.trim() || form.value.name.trim(),
        description: form.value.recruitment.description.trim() || null,
        player_count_max: form.value.recruitment.player_count_max,
        schedule_text: form.value.recruitment.schedule_text.trim() || null,
        schedule_weekday: form.value.recruitment.schedule_weekday.length
          ? form.value.recruitment.schedule_weekday
          : null,
        schedule_time_slot: form.value.recruitment.schedule_time_slot || null,
        tags: form.value.recruitment.tags,
      };
    }

    const result = await api.post<{
      campaign: { id: string };
      recruitment_post: { id: string } | null;
    }>('/campaigns/quick-create', payload);

    ElMessage.success(form.value.recruit ? '房间已创建，招募帖已发布！' : '房间已创建！');
    emit('created', {
      campaignId: result.campaign.id,
      recruitmentPostId: result.recruitment_post?.id ?? null,
    });
    handleClose();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '创建失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <ElDialog
    :model-value="props.visible"
    title="一键创建房间"
    width="520px"
    destroy-on-close
    @update:model-value="handleClose"
  >
    <!-- 步骤条（仅公开+招募模式才显示两步） -->
    <ElSteps v-if="totalSteps > 1" :active="step" finish-status="success" style="margin-bottom:24px">
      <ElStep title="基础信息" />
      <ElStep title="招募配置" />
    </ElSteps>

    <!-- 步骤 0：基础信息 -->
    <ElForm v-show="step === 0" :model="form" label-position="top">
      <ElFormItem label="团名（必填，最多 128 字）" required>
        <ElInput v-model="form.name" maxlength="128" show-word-limit placeholder="例如：克苏鲁的呼唤·常规跑" />
      </ElFormItem>

      <ElFormItem label="规则包" required>
        <ElSelect v-model="form.ruleset_id" filterable placeholder="选择规则包" style="width:100%">
          <ElOption v-for="r in props.rulesets" :key="r.id" :label="r.name" :value="r.id" />
        </ElSelect>
      </ElFormItem>

      <ElFormItem label="模组（可选）">
        <ElSelect v-model="form.module_id" filterable clearable placeholder="不使用模组" style="width:100%">
          <ElOption v-for="m in props.modules" :key="m.id" :label="m.title ?? m.name ?? m.id" :value="m.id" />
        </ElSelect>
      </ElFormItem>

      <div class="switch-row">
        <label class="switch-label">
          <ElCheckbox v-model="form.allow_ob" />
          允许观战
        </label>
        <label class="switch-label">
          <ElCheckbox v-model="form.is_listed_publicly" />
          公开房间（对外可见）
        </label>
      </div>

      <div v-if="form.is_listed_publicly" class="recruit-toggle">
        <label class="switch-label">
          <ElCheckbox v-model="form.recruit" />
          同时发布招募帖（让玩家能搜索并申请）
        </label>
      </div>
    </ElForm>

    <!-- 步骤 1：招募帖配置 -->
    <ElForm v-show="step === 1" :model="form.recruitment" label-position="top">
      <ElFormItem label="招募标题（最多 50 字）" required>
        <ElInput v-model="form.recruitment.title" maxlength="50" show-word-limit />
      </ElFormItem>

      <div class="grid-2">
        <ElFormItem label="需求人数">
          <ElInputNumber v-model="form.recruitment.player_count_max" :min="1" :max="20" controls-position="right" />
        </ElFormItem>
        <ElFormItem label="时间安排（文字描述）">
          <ElInput v-model="form.recruitment.schedule_text" maxlength="255" placeholder="每周六晚 8 点" />
        </ElFormItem>
      </div>

      <!-- 结构化时间（用于筛选） -->
      <div class="grid-2">
        <ElFormItem label="适合游戏的星期">
          <ElSelect
            v-model="form.recruitment.schedule_weekday"
            multiple
            collapse-tags
            placeholder="可选，用于筛选"
            style="width:100%"
          >
            <ElOption label="周一" value="mon" />
            <ElOption label="周二" value="tue" />
            <ElOption label="周三" value="wed" />
            <ElOption label="周四" value="thu" />
            <ElOption label="周五" value="fri" />
            <ElOption label="周六" value="sat" />
            <ElOption label="周日" value="sun" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="时间段">
          <ElSelect
            v-model="form.recruitment.schedule_time_slot"
            clearable
            placeholder="可选，用于筛选"
            style="width:100%"
          >
            <ElOption label="上午（6-12时）" value="morning" />
            <ElOption label="下午（12-18时）" value="afternoon" />
            <ElOption label="晚上（18-23时）" value="evening" />
            <ElOption label="深夜（23时以后）" value="night" />
          </ElSelect>
        </ElFormItem>
      </div>

      <ElFormItem label="简介">
        <ElInput v-model="form.recruitment.description" type="textarea" :rows="4" maxlength="2000" show-word-limit />
      </ElFormItem>

      <ElFormItem label="标签">
        <div class="tag-row">
          <label v-for="tag in tagOptions" :key="tag" class="switch-label">
            <ElCheckbox
              :model-value="form.recruitment.tags.includes(tag)"
              @update:model-value="(v) => {
                if (v) form.recruitment.tags.push(tag);
                else form.recruitment.tags = form.recruitment.tags.filter((t) => t !== tag);
              }"
            />
            {{ tag }}
          </label>
        </div>
      </ElFormItem>
    </ElForm>

    <template #footer>
      <TButton type="secondary" @click="step > 0 ? step-- : handleClose()">
        {{ step > 0 ? '上一步' : '取消' }}
      </TButton>
      <TButton
        v-if="!isLastStep"
        type="primary"
        :disabled="!canNext"
        @click="nextStep"
      >
        下一步
      </TButton>
      <TButton
        v-else
        type="primary"
        :loading="loading"
        :disabled="!canNext"
        @click="submit"
      >
        {{ form.recruit ? '创建房间 + 发布招募' : '创建房间' }}
      </TButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.switch-row {
  display: flex;
  gap: var(--space-6);
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
}
.recruit-toggle {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 8%, var(--color-bg-secondary));
  margin-bottom: var(--space-2);
}
.switch-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  font-size: var(--text-sm);
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
