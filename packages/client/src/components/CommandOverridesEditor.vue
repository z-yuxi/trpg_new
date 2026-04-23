<script setup lang="ts">
import { ref, watch } from 'vue';

// ── 类型定义 ────────────────────────────────────────────────────────────
export interface CommandOverride {
  command_name: string;
  dice_expression?: string;
  success_direction?: 'roll_under' | 'roll_over';
  difficulty_divisors?: Record<string, number>;
  description?: string;
}

// ── Props / Emits ───────────────────────────────────────────────────────
const props = withDefaults(defineProps<{
  modelValue?: CommandOverride[];
  supportedCommands?: string[];
}>(), {
  modelValue: () => [],
  supportedCommands: () => ['roll', 'check', 'initiative'],
});

const emit = defineEmits<{ (e: 'update:modelValue', v: CommandOverride[]): void }>();

// ── 本地副本 ─────────────────────────────────────────────────────────────
const overrides = ref<CommandOverride[]>(JSON.parse(JSON.stringify(props.modelValue)));

watch(() => props.modelValue, (v) => {
  overrides.value = JSON.parse(JSON.stringify(v));
}, { deep: true });

function emitUpdate() {
  emit('update:modelValue', JSON.parse(JSON.stringify(overrides.value)));
}

// ── 操作 ──────────────────────────────────────────────────────────────
const expandedIdx = ref<number | null>(null);

// 现有覆盖的命令名集合
const existingCommands = () => new Set(overrides.value.map((o) => o.command_name));

function addOverride() {
  // 找到第一个尚未有覆盖的命令
  const unused = props.supportedCommands.find((c) => !existingCommands().has(c));
  overrides.value.push({
    command_name: unused ?? '',
    dice_expression: '',
    success_direction: 'roll_under',
    difficulty_divisors: {},
    description: '',
  });
  expandedIdx.value = overrides.value.length - 1;
  emitUpdate();
}

function removeOverride(i: number) {
  overrides.value.splice(i, 1);
  if (expandedIdx.value === i) expandedIdx.value = null;
  emitUpdate();
}

function toggleOverride(i: number) {
  expandedIdx.value = expandedIdx.value === i ? null : i;
}

// 难度修正
function getDivisorEntries(ov: CommandOverride): { key: string; value: number }[] {
  return Object.entries(ov.difficulty_divisors ?? {}).map(([key, value]) => ({ key, value }));
}

function addDivisor(ov: CommandOverride) {
  if (!ov.difficulty_divisors) ov.difficulty_divisors = {};
  ov.difficulty_divisors[''] = 1;
  emitUpdate();
}

function updateDivisorKey(ov: CommandOverride, oldKey: string, newKey: string) {
  const val = ov.difficulty_divisors![oldKey];
  delete ov.difficulty_divisors![oldKey];
  ov.difficulty_divisors![newKey] = val;
  emitUpdate();
}

function updateDivisorVal(ov: CommandOverride, key: string, val: number) {
  if (!ov.difficulty_divisors) ov.difficulty_divisors = {};
  ov.difficulty_divisors[key] = val;
  emitUpdate();
}

function removeDivisor(ov: CommandOverride, key: string) {
  delete ov.difficulty_divisors![key];
  emitUpdate();
}

const BUILTIN_COMMAND_LABELS: Record<string, string> = {
  roll: '投骰 /roll',
  check: '技能检定 /check',
  initiative: '先攻 /initiative',
};
</script>

<template>
  <div class="coe">
    <div v-if="overrides.length === 0" class="coe-empty">
      暂无覆盖配置，点击「添加覆盖」为特定指令自定义参数。
    </div>

    <div v-for="(ov, i) in overrides" :key="i" class="coe-card">
      <div class="coe-card-header" @click="toggleOverride(i)">
        <span class="coe-cmd-name">/{{ ov.command_name || '(未设置)' }}</span>
        <span class="coe-cmd-label">{{ BUILTIN_COMMAND_LABELS[ov.command_name] ?? '' }}</span>
        <span v-if="ov.description" class="coe-desc-preview">{{ ov.description }}</span>
        <button class="coe-rm-btn" @click.stop="removeOverride(i)">×</button>
      </div>

      <div v-if="expandedIdx === i" class="coe-card-body">
        <!-- 命令名 -->
        <div class="coe-row">
          <div class="coe-field">
            <label class="coe-lbl">指令名（不含 /）</label>
            <input
              v-model="ov.command_name"
              class="coe-input coe-input--mono"
              list="coe-cmd-list"
              placeholder="如 check"
              @input="emitUpdate"
            />
            <datalist id="coe-cmd-list">
              <option v-for="c in supportedCommands" :key="c" :value="c">{{ BUILTIN_COMMAND_LABELS[c] ?? c }}</option>
            </datalist>
          </div>
          <div class="coe-field coe-field--flex">
            <label class="coe-lbl">说明</label>
            <input v-model="ov.description" class="coe-input" placeholder="此覆盖的用途说明" @input="emitUpdate" />
          </div>
        </div>

        <!-- 骰子表达式 / 成功方向 -->
        <div class="coe-row">
          <div class="coe-field coe-field--flex">
            <label class="coe-lbl">骰子表达式覆盖</label>
            <input v-model="ov.dice_expression" class="coe-input coe-input--mono" placeholder="如 1d20（留空=使用默认）" @input="emitUpdate" />
          </div>
          <div class="coe-field">
            <label class="coe-lbl">成功方向</label>
            <select v-model="ov.success_direction" class="coe-select" @change="emitUpdate">
              <option value="roll_under">越低越好（roll_under）</option>
              <option value="roll_over">越高越好（roll_over）</option>
            </select>
          </div>
        </div>

        <!-- 难度修正系数 -->
        <div class="coe-divisors">
          <div class="coe-divisors-header">
            <span class="coe-lbl">难度修正系数</span>
            <button class="coe-add-divisor-btn" @click="addDivisor(ov)">+ 添加</button>
          </div>
          <div v-if="getDivisorEntries(ov).length === 0" class="coe-hint">暂无难度修正（默认使用规则集的难度等级）</div>
          <table v-else class="coe-divisor-table">
            <thead>
              <tr><th>难度档位</th><th>系数</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="entry in getDivisorEntries(ov)" :key="entry.key">
                <td>
                  <input
                    :value="entry.key"
                    class="coe-input"
                    placeholder="如 hard"
                    @change="(e) => updateDivisorKey(ov, entry.key, (e.target as HTMLInputElement).value)"
                  />
                </td>
                <td>
                  <input
                    :value="entry.value"
                    type="number"
                    step="0.1"
                    class="coe-input coe-input--num"
                    @change="(e) => updateDivisorVal(ov, entry.key, Number((e.target as HTMLInputElement).value))"
                  />
                </td>
                <td><button class="coe-rm-btn" @click="removeDivisor(ov, entry.key)">×</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <button class="coe-add-btn" @click="addOverride">+ 添加覆盖</button>
  </div>
</template>

<style scoped>
.coe { display: flex; flex-direction: column; gap: 6px; }

.coe-empty {
  font-size: 13px;
  color: var(--text-secondary, #9ca3af);
  text-align: center;
  padding: 16px;
}

.coe-card {
  border: 1px solid var(--border-default, #e5e7eb);
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-card, #fff);
}

.coe-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  background: var(--surface-base, #f9fafb);
  transition: background 0.1s;
}
.coe-card-header:hover { background: var(--surface-hover, #f3f4f6); }

.coe-cmd-name { font-size: 12px; font-weight: 700; font-family: monospace; color: var(--color-accent, #7b68ee); min-width: 70px; }
.coe-cmd-label { font-size: 11px; color: var(--text-secondary, #6b7280); }
.coe-desc-preview { font-size: 11px; color: var(--text-secondary, #9ca3af); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.coe-rm-btn { background: none; border: none; color: var(--text-secondary, #9ca3af); cursor: pointer; font-size: 15px; padding: 0 3px; transition: color 0.1s; }
.coe-rm-btn:hover { color: #e74c3c; }

.coe-card-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border-default, #e5e7eb);
}

.coe-row { display: flex; gap: 8px; flex-wrap: wrap; }
.coe-field { display: flex; flex-direction: column; gap: 3px; }
.coe-field--flex { flex: 1; min-width: 120px; }

.coe-lbl { font-size: 11px; color: var(--text-secondary, #6b7280); }

.coe-input {
  padding: 4px 7px;
  border: 1px solid var(--border-default, #d1d5db);
  border-radius: 3px;
  font-size: 12px;
  background: var(--surface-card, #fff);
  color: var(--text-primary, #111);
}
.coe-input:focus { outline: none; border-color: var(--color-accent, #7b68ee); }
.coe-input--mono { font-family: monospace; }
.coe-input--num { width: 72px; }

.coe-select {
  padding: 4px 6px;
  border: 1px solid var(--border-default, #d1d5db);
  border-radius: 3px;
  font-size: 12px;
  background: var(--surface-card, #fff);
  color: var(--text-primary, #111);
}

/* 难度修正 */
.coe-divisors { display: flex; flex-direction: column; gap: 4px; }
.coe-divisors-header { display: flex; align-items: center; justify-content: space-between; }
.coe-add-divisor-btn {
  font-size: 11px; padding: 1px 7px;
  background: none; border: 1px solid var(--border-default, #d1d5db);
  border-radius: 3px; color: var(--text-secondary, #6b7280); cursor: pointer;
}
.coe-add-divisor-btn:hover { border-color: var(--color-accent, #7b68ee); color: var(--color-accent, #7b68ee); }

.coe-divisor-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.coe-divisor-table th { padding: 3px 6px; text-align: left; font-weight: 500; color: var(--text-secondary, #6b7280); border-bottom: 1px solid var(--border-default, #e5e7eb); }
.coe-divisor-table td { padding: 2px 4px; }

.coe-hint { font-size: 11px; color: var(--text-secondary, #9ca3af); }

.coe-add-btn {
  align-self: flex-start;
  padding: 5px 14px;
  background: var(--color-accent, #7b68ee);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: opacity 0.12s;
}
.coe-add-btn:hover { opacity: 0.85; }
</style>
