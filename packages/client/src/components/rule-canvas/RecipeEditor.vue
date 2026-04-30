<script setup lang="ts">
/**
 * RecipeEditor.vue
 * Recipe 编辑器：管理 recipe_source.recipes 列表 + command_recipe_map。
 * 支持 threshold_check / chain / raw 三种最常用类型的表单编辑。
 */
import { ref, computed, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../utils/api';
import type { Recipe, RulesetRecipeSource } from '@trpg/shared';

// ── Props / Emits ────────────────────────────────────────────────────────────
const props = defineProps<{
  rulesetId: string;
  /** 当前保存到后端的 recipe_source，父组件传入 */
  recipeSource: RulesetRecipeSource | null | undefined;
}>();

const emit = defineEmits<{
  /** 父组件保存成功后，传回更新后的 recipe_source */
  (e: 'saved', newSource: RulesetRecipeSource): void;
}>();

// ── 本地状态 ─────────────────────────────────────────────────────────────────
const localRecipes = ref<Recipe[]>([]);
const localCommandMap = ref<Record<string, string>>({});
const activeRecipeIdx = ref<number | null>(null);
const saving = ref(false);
const testLoading = ref(false);
const testResult = ref<null | { success: boolean; output: unknown; logs: unknown[]; compiled_preview: { atom_count: number; connection_count: number }; error_code?: string; error_message?: string }>(null);

// 初始化本地状态
watch(
  () => props.recipeSource,
  (src) => {
    localRecipes.value = src ? JSON.parse(JSON.stringify(src.recipes ?? [])) : [];
    localCommandMap.value = src ? { ...(src.command_recipe_map ?? {}) } : {};
  },
  { immediate: true },
);

// ── 当前选中 recipe ──────────────────────────────────────────────────────────
const activeRecipe = computed<Recipe | null>(() =>
  activeRecipeIdx.value != null ? (localRecipes.value[activeRecipeIdx.value] ?? null) : null,
);

// ── Recipe 列表操作 ──────────────────────────────────────────────────────────
function addRecipe() {
  const newId = `recipe_${Date.now()}`;
  const newRecipe: Recipe = {
    id: newId,
    type: 'threshold_check',
    name: '新检定',
    params: {
      dice_expression: '1d100',
      target_source: 'skill',
      target_ref: '',
      success_direction: 'lte',
      tiers: [
        { name: 'success', label: '成功', condition: 'lte', is_success: true },
        { name: 'fail', label: '失败', condition: 'gt', is_success: false },
      ],
    } as any,
  };
  localRecipes.value.push(newRecipe);
  activeRecipeIdx.value = localRecipes.value.length - 1;
}

function removeRecipe(idx: number) {
  const removed = localRecipes.value[idx];
  localRecipes.value.splice(idx, 1);
  // 清除 command_map 中对该 recipe 的引用
  for (const [cmd, recipeId] of Object.entries(localCommandMap.value)) {
    if (recipeId === removed?.id) delete localCommandMap.value[cmd];
  }
  if (activeRecipeIdx.value === idx) activeRecipeIdx.value = null;
  else if (activeRecipeIdx.value != null && activeRecipeIdx.value > idx) activeRecipeIdx.value--;
}

// ── command_recipe_map 操作 ──────────────────────────────────────────────────
const newCmdKey = ref('');
const newCmdVal = ref('');

function addCommandMapping() {
  if (!newCmdKey.value.trim() || !newCmdVal.value.trim()) return;
  localCommandMap.value[newCmdKey.value.trim()] = newCmdVal.value.trim();
  newCmdKey.value = '';
  newCmdVal.value = '';
}
function removeCommandMapping(key: string) {
  delete localCommandMap.value[key];
}

// ── 保存 ────────────────────────────────────────────────────────────────────
async function save() {
  saving.value = true;
  try {
    const newSource: RulesetRecipeSource = {
      recipes: localRecipes.value,
      command_recipe_map: localCommandMap.value,
    };
    const res = await api.put<{ recipe_source: RulesetRecipeSource }>(
      `/rulesets/${props.rulesetId}`,
      { recipe_source: newSource },
    );
    emit('saved', res.recipe_source ?? newSource);
    ElMessage.success('Recipe 已保存');
    testResult.value = null;
  } catch (err: any) {
    const detail = err?.response?.data?.validation_errors
      ? JSON.stringify(err.response.data.validation_errors, null, 2)
      : (err?.response?.data?.error ?? err.message ?? '未知错误');
    ElMessage.error(`保存失败：${detail}`);
  } finally {
    saving.value = false;
  }
}

// ── 测试当前 recipe ──────────────────────────────────────────────────────────
async function testCurrentRecipe() {
  if (!activeRecipe.value) return;
  testLoading.value = true;
  testResult.value = null;
  try {
    const res = await api.post<NonNullable<typeof testResult.value>>(
      `/rulesets/${props.rulesetId}/test-recipe`,
      {
        recipe: activeRecipe.value,
        test_inputs: {},
        mock_context: { attributes: {}, skills: { [String((activeRecipe.value.params as any).target_ref ?? '')]: 60 }, resources: {} },
      },
    );
    testResult.value = res;
  } catch (err: any) {
    ElMessage.error(`测试请求失败：${err?.response?.data?.error ?? err.message}`);
  } finally {
    testLoading.value = false;
  }
}

// ── 迁移提示 ─────────────────────────────────────────────────────────────────
async function migrateFromLegacy() {
  try {
    await ElMessageBox.confirm(
      '将旧版 atoms/connections 包装为 Raw Recipe。此操作不可逆，但不会删除旧格式数据，仍可回退。继续？',
      '迁移至 Recipe 格式',
      { confirmButtonText: '确认迁移', cancelButtonText: '取消', type: 'warning' },
    );
    const res = await api.post<{ recipe_source: RulesetRecipeSource }>(
      `/rulesets/${props.rulesetId}/migrate-to-recipe`,
      {},
    );
    emit('saved', res.recipe_source);
    ElMessage.success('迁移成功');
  } catch (err: any) {
    if (err === 'cancel') return;
    ElMessage.error(`迁移失败：${err?.response?.data?.error ?? err.message}`);
  }
}

// ── Tier 操作 ────────────────────────────────────────────────────────────────
function addTier(recipe: Recipe) {
  const p = recipe.params as any;
  if (!Array.isArray(p.tiers)) p.tiers = [];
  p.tiers.push({ name: `tier_${p.tiers.length + 1}`, label: '新等级', condition: 'lte', is_success: false });
}
function removeTier(recipe: Recipe, idx: number) {
  const p = recipe.params as any;
  if (Array.isArray(p.tiers)) p.tiers.splice(idx, 1);
}
</script>

<template>
  <div class="recipe-editor">
    <!-- 顶部工具栏 -->
    <div class="recipe-editor__toolbar">
      <el-button type="primary" size="small" @click="addRecipe">+ 添加 Recipe</el-button>
      <el-button size="small" @click="migrateFromLegacy">从旧格式迁移</el-button>
      <el-button type="success" size="small" :loading="saving" @click="save">保存</el-button>
    </div>

    <div class="recipe-editor__body">
      <!-- 左侧 Recipe 列表 -->
      <div class="recipe-editor__list">
        <div class="recipe-editor__list-title">Recipes</div>
        <div
          v-for="(recipe, idx) in localRecipes"
          :key="recipe.id"
          class="recipe-editor__item"
          :class="{ 'is-active': activeRecipeIdx === idx }"
          @click="activeRecipeIdx = idx"
        >
          <span class="recipe-editor__item-name">{{ recipe.name || recipe.id }}</span>
          <el-tag size="small" type="info" class="recipe-editor__item-type">{{ recipe.type }}</el-tag>
          <el-button
            size="small"
            type="danger"
            text
            style="margin-left: auto"
            @click.stop="removeRecipe(idx)"
          >✕</el-button>
        </div>
        <div v-if="localRecipes.length === 0" class="recipe-editor__empty">暂无 Recipe</div>
      </div>

      <!-- 右侧编辑区 -->
      <div class="recipe-editor__panel">
        <template v-if="activeRecipe">
          <!-- 通用字段 -->
          <el-form label-width="110px" size="small">
            <el-form-item label="ID">
              <el-input v-model="activeRecipe.id" placeholder="recipe_id" />
            </el-form-item>
            <el-form-item label="名称">
              <el-input v-model="activeRecipe.name" placeholder="显示名称" />
            </el-form-item>
            <el-form-item label="类型">
              <el-select v-model="activeRecipe.type" style="width: 180px">
                <el-option label="threshold_check（阈值检定）" value="threshold_check" />
                <el-option label="resource_modify（资源修改）" value="resource_modify" />
                <el-option label="chain（链式）" value="chain" />
                <el-option label="raw（原始图）" value="raw" />
              </el-select>
            </el-form-item>
            <el-form-item label="描述">
              <el-input v-model="activeRecipe.description" placeholder="可选描述" />
            </el-form-item>

            <!-- threshold_check 专用字段 -->
            <template v-if="activeRecipe.type === 'threshold_check'">
              <el-divider>检定参数</el-divider>
              <el-form-item label="骰子表达式">
                <el-input v-model="(activeRecipe.params as any).dice_expression" placeholder="1d100" />
              </el-form-item>
              <el-form-item label="目标来源">
                <el-select v-model="(activeRecipe.params as any).target_source" style="width: 160px">
                  <el-option label="技能值" value="skill" />
                  <el-option label="属性值" value="attribute" />
                  <el-option label="固定值" value="fixed" />
                </el-select>
              </el-form-item>
              <el-form-item
                v-if="['skill','attribute'].includes((activeRecipe.params as any).target_source)"
                label="目标字段名"
              >
                <el-input v-model="(activeRecipe.params as any).target_ref" placeholder="如：侦查" />
              </el-form-item>
              <el-form-item
                v-if="(activeRecipe.params as any).target_source === 'fixed'"
                label="固定目标值"
              >
                <el-input-number v-model="(activeRecipe.params as any).target_fixed" :min="1" />
              </el-form-item>
              <el-form-item label="成功方向">
                <el-select v-model="(activeRecipe.params as any).success_direction" style="width: 140px">
                  <el-option label="≤ 目标（roll under）" value="lte" />
                  <el-option label="≥ 目标（roll over）" value="gte" />
                </el-select>
              </el-form-item>

              <!-- 成功等级 Tiers -->
              <el-divider>成功等级</el-divider>
              <div
                v-for="(tier, ti) in (activeRecipe.params as any).tiers ?? []"
                :key="ti"
                class="tier-row"
              >
                <el-input v-model="tier.name" placeholder="name" style="width:100px" />
                <el-input v-model="tier.label" placeholder="标签" style="width:80px" />
                <el-select v-model="tier.condition" style="width:80px">
                  <el-option label="≤" value="lte" />
                  <el-option label="≥" value="gte" />
                  <el-option label="=" value="eq" />
                </el-select>
                <el-checkbox v-model="tier.is_success" label="成功" />
                <el-button size="small" type="danger" text @click="removeTier(activeRecipe!, ti)">✕</el-button>
              </div>
              <el-button size="small" @click="addTier(activeRecipe!)">+ 添加等级</el-button>
            </template>

            <!-- resource_modify 专用字段 -->
            <template v-else-if="activeRecipe.type === 'resource_modify'">
              <el-divider>资源参数</el-divider>
              <el-form-item label="目标资源">
                <el-input v-model="(activeRecipe.params as any).resource_name" placeholder="如：生命值" />
              </el-form-item>
              <el-form-item label="变化量表达式">
                <el-input v-model="(activeRecipe.params as any).delta_expression" placeholder="如：-1d6" />
              </el-form-item>
            </template>

            <!-- chain 专用字段 -->
            <template v-else-if="activeRecipe.type === 'chain'">
              <el-divider>链式步骤</el-divider>
              <div
                v-for="(step, si) in (activeRecipe.params as any).steps ?? []"
                :key="si"
                class="chain-step"
              >
                <el-select v-model="step.recipe_id" placeholder="选择 Recipe" style="width:180px">
                  <el-option
                    v-for="r in localRecipes.filter(r => r.id !== activeRecipe!.id)"
                    :key="r.id"
                    :label="r.name || r.id"
                    :value="r.id"
                  />
                </el-select>
                <el-button size="small" type="danger" text @click="(activeRecipe!.params as any).steps.splice(si, 1)">✕</el-button>
              </div>
              <el-button size="small" @click="() => { const p = activeRecipe!.params as any; if (!p.steps) p.steps = []; p.steps.push({ recipe_id: '' }); }">
                + 添加步骤
              </el-button>
            </template>

            <!-- raw 类型：只读提示 -->
            <template v-else-if="activeRecipe.type === 'raw'">
              <el-alert type="info" :closable="false" show-icon>
                raw Recipe 由旧格式自动包装生成，请使用 L3 画布编辑器修改底层节点图。
              </el-alert>
            </template>
          </el-form>

          <!-- 测试按钮 -->
          <div v-if="activeRecipe.type !== 'raw'" style="margin-top: 12px">
            <el-button size="small" :loading="testLoading" @click="testCurrentRecipe">运行测试</el-button>
            <div v-if="testResult" class="test-result" :class="testResult.success ? 'is-success' : 'is-fail'">
              <div><b>{{ testResult.success ? '✓ 成功' : '✗ 失败' }}</b></div>
              <div v-if="!testResult.success" style="color:#f56c6c">{{ testResult.error_code }}: {{ testResult.error_message }}</div>
              <div>节点数：{{ testResult.compiled_preview?.atom_count }} | 连接数：{{ testResult.compiled_preview?.connection_count }}</div>
              <pre style="font-size:12px;max-height:120px;overflow:auto">{{ JSON.stringify(testResult.output, null, 2) }}</pre>
            </div>
          </div>
        </template>
        <div v-else class="recipe-editor__placeholder">← 选择左侧 Recipe 开始编辑</div>
      </div>
    </div>

    <!-- command_recipe_map 区域 -->
    <el-divider>命令 → Recipe 映射（command_recipe_map）</el-divider>
    <div class="cmd-map">
      <div
        v-for="(recipeId, cmd) in localCommandMap"
        :key="cmd"
        class="cmd-map__row"
      >
        <el-tag>{{ cmd }}</el-tag>
        <span style="margin: 0 8px">→</span>
        <el-select v-model="localCommandMap[cmd]" size="small" style="width:200px">
          <el-option v-for="r in localRecipes" :key="r.id" :label="r.name || r.id" :value="r.id" />
        </el-select>
        <el-button size="small" type="danger" text @click="removeCommandMapping(String(cmd))">✕</el-button>
      </div>
      <div class="cmd-map__add">
        <el-input v-model="newCmdKey" placeholder="命令名（如：侦查检定）" size="small" style="width:180px" />
        <span style="margin: 0 6px">→</span>
        <el-select v-model="newCmdVal" placeholder="选择 Recipe" size="small" style="width:180px">
          <el-option v-for="r in localRecipes" :key="r.id" :label="r.name || r.id" :value="r.id" />
        </el-select>
        <el-button size="small" type="primary" @click="addCommandMapping">添加</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recipe-editor { display: flex; flex-direction: column; gap: 12px; }
.recipe-editor__toolbar { display: flex; gap: 8px; padding: 8px 0; }
.recipe-editor__body { display: flex; gap: 0; border: 1px solid var(--el-border-color); border-radius: 4px; min-height: 400px; }
.recipe-editor__list { width: 220px; border-right: 1px solid var(--el-border-color); padding: 8px; flex-shrink: 0; }
.recipe-editor__list-title { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 8px; }
.recipe-editor__item { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 4px; cursor: pointer; }
.recipe-editor__item:hover { background: var(--el-fill-color); }
.recipe-editor__item.is-active { background: var(--el-color-primary-light-9); }
.recipe-editor__item-name { font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recipe-editor__item-type { font-size: 11px; }
.recipe-editor__empty { font-size: 12px; color: var(--el-text-color-secondary); text-align: center; margin-top: 20px; }
.recipe-editor__panel { flex: 1; padding: 16px; overflow-y: auto; }
.recipe-editor__placeholder { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--el-text-color-secondary); font-size: 13px; }
.tier-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.chain-step { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.test-result { margin-top: 8px; padding: 8px 12px; border-radius: 4px; font-size: 12px; }
.test-result.is-success { background: #f0f9eb; border: 1px solid #b3e19d; }
.test-result.is-fail { background: #fef0f0; border: 1px solid #fbc4c4; }
.cmd-map { padding: 0 4px; }
.cmd-map__row { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; }
.cmd-map__add { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
</style>
