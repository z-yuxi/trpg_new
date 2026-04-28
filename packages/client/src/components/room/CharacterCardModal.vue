<script setup lang="ts">
/**
 * CharacterCardModal.vue
 * 团内角色卡状态编辑弹窗
 * - GM 或角色本人可编辑 HP/MP/SAN 等当前值
 * - 基础属性只读（GM 可勾选"GM 特批模式"后编辑）
 * - 修改后调用 PUT /api/characters/:id/instance/:campaignId
 *   并触发 character_state_sync socket 广播
 */
import { ref, computed, watch } from 'vue';
import TButton from '../base/TButton.vue';
import TInput from '../base/TInput.vue';
import SvgIcon from '../SvgIcon.vue';
import { api } from '../../utils/api';

interface DerivedItem {
  current: number;
  max: number;
  temp?: number;
}

interface CharacterInstance {
  id: string;
  character_id: string;
  campaign_id: string;
  derived_current: Record<string, DerivedItem> | null;
  temporary_effects: Array<{ name: string; value: number; source?: string }> | null;
  equipment: string[] | null;
}

const props = defineProps<{
  visible: boolean;
  characterId: string;
  campaignId: string;
  characterName: string;
  characterAttrs: Record<string, number>;
  isGm: boolean;
  isOwner: boolean;
}>();

const emit = defineEmits<{
  'close': [];
  'updated': [instance: CharacterInstance];
}>();

const instance = ref<CharacterInstance | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const gmOverride = ref(false);

// 本地编辑副本（避免直接改 instance）
const editDerived = ref<Record<string, { current: number; max: number; temp?: number }>>({});
const editEffects = ref<Array<{ name: string; value: number; source?: string }>>([]);
const editEquipment = ref<string[]>([]);

// 派生值标签
const derivedLabels: Record<string, string> = {
  hp: '生命值', mp: '魔法值', san: '理智值', lk: '幸运', mov: '移动'
};

const canEdit = computed(() => props.isGm || props.isOwner);

async function fetchInstance() {
  loading.value = true;
  error.value = '';
  try {
    instance.value = await api.get<CharacterInstance>(
      `/characters/${props.characterId}/instance?campaign_id=${props.campaignId}`,
    );
    editDerived.value = JSON.parse(JSON.stringify(instance.value!.derived_current ?? {}));
    editEffects.value = JSON.parse(JSON.stringify(instance.value!.temporary_effects ?? []));
    editEquipment.value = JSON.parse(JSON.stringify(instance.value!.equipment ?? []));
  } catch (e: unknown) {
    error.value = (e as Error)?.message ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  error.value = '';
  try {
    const updated = await api.put<CharacterInstance>(
      `/characters/${props.characterId}/instance/${props.campaignId}`,
      {
        derived_current: editDerived.value,
        temporary_effects: editEffects.value,
        equipment: editEquipment.value,
      },
    );
    instance.value = updated;
    emit('updated', updated);
    emit('close');
  } catch (e: unknown) {
    error.value = (e as Error)?.message ?? '保存失败';
  } finally {
    saving.value = false;
  }
}

function addEffect() {
  editEffects.value.push({ name: '', value: 0 });
}
function removeEffect(idx: number) {
  editEffects.value.splice(idx, 1);
}

function addEquipment() {
  editEquipment.value.push('');
}
function removeEquipment(idx: number) {
  editEquipment.value.splice(idx, 1);
}

// 打开时加载数据
watch(() => props.visible, (v) => {
  if (v) fetchInstance();
}, { immediate: false });
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title">{{ characterName }} — 角色状态</span>
          <button class="modal-close" @click="$emit('close')"><SvgIcon name="icon-close" :size="14" /></button>
        </div>

        <div v-if="loading" class="modal-loading">加载中...</div>
        <div v-else-if="error" class="modal-error">{{ error }}</div>
        <div v-else-if="instance" class="modal-body">

          <!-- 提示 -->
          <p class="instance-hint">修改仅影响本团内的角色实例，不会更改角色卡模板。</p>

          <!-- 基础属性（只读，GM 可勾选后解锁） -->
          <div class="section">
            <div class="section-header">
              <span>基础属性</span>
              <label v-if="isGm" class="gm-toggle">
                <input v-model="gmOverride" type="checkbox" />
                GM 特批编辑
              </label>
            </div>
            <div class="attrs-grid">
              <div v-for="(val, key) in characterAttrs" :key="key" class="attr-chip">
                <span class="chip-key">{{ key }}</span>
                <span class="chip-val">{{ val }}</span>
              </div>
            </div>
          </div>

          <!-- 派生值（可编辑 current） -->
          <div v-if="Object.keys(editDerived).length > 0" class="section">
            <div class="section-header">当前状态值</div>
            <div class="derived-rows">
              <div v-for="(item, key) in editDerived" :key="key" class="derived-row">
                <span class="derived-label">{{ derivedLabels[String(key).toLowerCase()] ?? key }}</span>
                <div class="derived-inputs">
                  <input
                    v-model.number="(editDerived[key as string] as DerivedItem).current"
                    type="number" class="derived-input"
                    :min="0" :max="item.max"
                    :disabled="!canEdit"
                  />
                  <span class="derived-sep">/</span>
                  <input
                    v-model.number="(editDerived[key as string] as DerivedItem).max"
                    type="number" class="derived-input"
                    :min="1"
                    :disabled="!isGm && !gmOverride"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 临时效果 -->
          <div class="section">
            <div class="section-header">
              <span>临时效果</span>
              <TButton v-if="canEdit" type="secondary" size="sm" @click="addEffect">+ 添加</TButton>
            </div>
            <div v-if="editEffects.length === 0" class="empty-hint">无临时效果</div>
            <div v-for="(eff, idx) in editEffects" :key="idx" class="effect-row">
              <TInput v-model="eff.name" placeholder="效果名称" :disabled="!canEdit" />
              <input v-model.number="eff.value" type="number" class="effect-val" :disabled="!canEdit" />
              <button v-if="canEdit" class="remove-btn" @click="removeEffect(idx)"><SvgIcon name="icon-close" :size="12" /></button>
            </div>
          </div>

          <!-- 装备 -->
          <div class="section">
            <div class="section-header">
              <span>装备</span>
              <TButton v-if="canEdit" type="secondary" size="sm" @click="addEquipment">+ 添加</TButton>
            </div>
            <div v-if="editEquipment.length === 0" class="empty-hint">无装备记录</div>
            <div v-for="(item, idx) in editEquipment" :key="idx" class="equipment-row">
              <TInput v-model="editEquipment[idx]" placeholder="装备名称" :disabled="!canEdit" />
              <button v-if="canEdit" class="remove-btn" @click="removeEquipment(idx)"><SvgIcon name="icon-close" :size="12" /></button>
            </div>
          </div>

          <!-- 底部 -->
          <div v-if="error" class="modal-error">{{ error }}</div>
        </div>

        <div class="modal-footer">
          <TButton type="secondary" @click="$emit('close')">取消</TButton>
          <TButton v-if="canEdit" type="primary" :loading="saving" @click="save">保存</TButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999;
}
.modal-box {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  width: min(560px, 96vw);
  max-height: 80vh;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}
.modal-title { font-size: var(--text-lg); font-weight: var(--font-semibold); color: var(--text-primary); }
.modal-close {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); font-size: var(--text-lg);
  padding: 4px; border-radius: var(--radius-sm);
}
.modal-close:hover { color: var(--text-primary); }
.modal-loading, .modal-error { padding: var(--space-6); text-align: center; color: var(--text-muted); }
.modal-error { color: var(--color-danger, #B85450); }
.modal-body {
  flex: 1; overflow-y: auto;
  padding: var(--space-4);
  display: flex; flex-direction: column; gap: var(--space-4);
}
.modal-footer {
  display: flex; gap: var(--space-3); justify-content: flex-end;
  padding: var(--space-4);
  border-top: 1px solid var(--border-default);
  flex-shrink: 0;
}

.instance-hint { font-size: var(--text-xs); color: var(--text-muted); margin: 0; }
.section { display: flex; flex-direction: column; gap: var(--space-2); }
.section-header {
  display: flex; align-items: center; justify-content: space-between;
  font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--text-secondary);
}
.gm-toggle { display: flex; align-items: center; gap: var(--space-1); font-size: var(--text-xs); cursor: pointer; }

/* 基础属性 */
.attrs-grid { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.attr-chip {
  display: flex; flex-direction: column; align-items: center;
  padding: 4px 10px;
  background: var(--surface-hover);
  border-radius: var(--radius-md);
  min-width: 48px;
}
.chip-key { font-size: var(--text-xs); color: var(--text-muted); font-family: monospace; }
.chip-val { font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--text-primary); }

/* 派生值 */
.derived-rows { display: flex; flex-direction: column; gap: var(--space-2); }
.derived-row { display: flex; align-items: center; gap: var(--space-3); }
.derived-label { width: 56px; font-size: var(--text-sm); color: var(--text-secondary); }
.derived-inputs { display: flex; align-items: center; gap: var(--space-1); }
.derived-input {
  width: 64px; padding: 4px 8px; text-align: center;
  border: 1px solid var(--border-default); border-radius: var(--radius-md);
  background: var(--surface-card); color: var(--text-body);
  font-size: var(--text-sm);
}
.derived-input:disabled { opacity: 0.6; cursor: not-allowed; }
.derived-sep { color: var(--text-muted); font-size: var(--text-sm); }

/* 效果 & 装备 */
.effect-row, .equipment-row {
  display: flex; align-items: center; gap: var(--space-2);
}
.effect-val {
  width: 64px; padding: 4px 8px; text-align: center;
  border: 1px solid var(--border-default); border-radius: var(--radius-md);
  background: var(--surface-card); color: var(--text-body); font-size: var(--text-sm);
}
.remove-btn {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); padding: 4px;
}
.remove-btn:hover { color: var(--color-danger, #B85450); }
.empty-hint { font-size: var(--text-sm); color: var(--text-muted); font-style: italic; }
</style>
