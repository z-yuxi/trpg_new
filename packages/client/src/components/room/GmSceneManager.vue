<script setup lang="ts">
import { ref } from 'vue';
import { ElDialog, ElMessage } from 'element-plus';
import SceneRoadmap from './SceneRoadmap.vue';
import { api } from '../../utils/api';
import type { Scene } from '@trpg/shared';

const props = defineProps<{
  campaignId: string;
  scenes: Scene[];
  characters: { id: string; name: string }[];
}>();

const emit = defineEmits<{
  'scene-created': [scene: Scene];
}>();

const typeLabel: Record<string, string> = { spatial: '剧情场', virtual: '私密场', lobby: '公共场' };

// ── 新建场景 ──
const showNewScene = ref(false);
const newScene = ref({ name: '', type: 'spatial' as 'spatial' | 'virtual' | 'lobby', description: '' });
const sceneLoading = ref(false);

async function createScene() {
  if (!newScene.value.name.trim()) { ElMessage.warning('场景名称不能为空'); return; }
  sceneLoading.value = true;
  try {
    const scene = await api.post<Scene>(`/campaigns/${props.campaignId}/scenes`, newScene.value);
    emit('scene-created', scene);
    showNewScene.value = false;
    newScene.value = { name: '', type: 'spatial', description: '' };
    ElMessage.success('场景已创建');
  } catch (e: any) { ElMessage.error(e.message ?? '创建失败'); }
  finally { sceneLoading.value = false; }
}

// ── 编辑场景 ──
const showEditScene = ref(false);
const editingSceneId = ref('');
const editSceneForm = ref({
  name: '',
  type: 'spatial' as 'spatial' | 'virtual' | 'lobby',
  description: '',
  history_visibility: 'all' as 'none' | 'recent' | 'all',
});
const sceneEditLoading = ref(false);

function openEditScene(scene: any) {
  editingSceneId.value = scene.id;
  editSceneForm.value = {
    name: scene.name,
    type: scene.type,
    description: scene.description ?? '',
    history_visibility: scene.history_visibility ?? 'all',
  };
  showEditScene.value = true;
}

async function saveSceneEdit() {
  if (!editSceneForm.value.name.trim()) { ElMessage.warning('场景名不能为空'); return; }
  sceneEditLoading.value = true;
  try {
    await api.put(`/campaigns/${props.campaignId}/scenes/${editingSceneId.value}`, editSceneForm.value);
    showEditScene.value = false;
    ElMessage.success('场景已更新，刷新页面生效');
  } catch (e: any) { ElMessage.error(e.message ?? '更新失败'); }
  finally { sceneEditLoading.value = false; }
}

// ── 删除场景 ──
const showDeleteSceneConfirm = ref(false);
const deletingSceneId = ref('');
const deletingSceneName = ref('');

function openDeleteScene(scene: any) {
  deletingSceneId.value = scene.id;
  deletingSceneName.value = scene.name;
  showDeleteSceneConfirm.value = true;
}

async function confirmDeleteScene() {
  try {
    await api.delete(`/campaigns/${props.campaignId}/scenes/${deletingSceneId.value}`);
    showDeleteSceneConfirm.value = false;
    ElMessage.success('场景已删除，刷新页面生效');
  } catch (e: any) { ElMessage.error(e.message ?? '删除失败'); }
}
</script>

<template>
  <div class="tab-pane">
    <div class="pane-header">
      <span class="pane-count">共{{ scenes.length }}个场景</span>
      <div class="pane-actions">
        <button class="sm-btn accent" @click="showNewScene = true">+ 新建场景</button>
      </div>
    </div>
    <table class="data-table">
      <thead><tr><th>名称</th><th>类型</th><th>历史</th><th>操作</th></tr></thead>
      <tbody>
        <tr v-for="s in scenes" :key="s.id">
          <td class="td-name">{{ s.name }}</td>
          <td><span class="type-tag" :class="s.type">{{ typeLabel[s.type] ?? s.type }}</span></td>
          <td class="td-vis">{{ (s as any).history_visibility ?? 'all' }}</td>
          <td class="td-actions">
            <button class="sm-btn" @click="openEditScene(s)">编辑</button>
            <button class="sm-btn danger" @click="openDeleteScene(s)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="scenes.length === 0" class="empty-hint">暂无场景</div>
    <SceneRoadmap
      :campaign-id="campaignId"
      :scenes="scenes"
      :characters="characters"
      :is-gm="true"
      style="margin-top:var(--space-3)"
    />
  </div>

  <!-- 新建场景 -->
  <ElDialog v-model="showNewScene" title="新建场景" width="420px">
    <div class="form-body">
      <label class="form-label">场景名称 *</label>
      <input v-model="newScene.name" class="field-input" placeholder="如：酒馆大厅" />
      <label class="form-label" style="margin-top:12px">场景类型</label>
      <div class="type-btns">
        <button v-for="t in (['spatial','virtual','lobby'] as const)" :key="t" class="type-btn" :class="{ active: newScene.type === t }" @click="newScene.type = t">{{ typeLabel[t] }}</button>
      </div>
      <label class="form-label" style="margin-top:12px">描述</label>
      <textarea v-model="newScene.description" class="field-input" rows="2" style="resize:vertical" placeholder="选填" />
    </div>
    <template #footer>
      <button class="dlg-btn" @click="showNewScene = false">取消</button>
      <button class="dlg-btn accent" @click="createScene" :disabled="sceneLoading">{{ sceneLoading ? '创建中...' : '创建场景' }}</button>
    </template>
  </ElDialog>

  <!-- 编辑场景 -->
  <ElDialog v-model="showEditScene" title="编辑场景" width="420px">
    <div class="form-body">
      <label class="form-label">场景名称 *</label>
      <input v-model="editSceneForm.name" class="field-input" />
      <label class="form-label" style="margin-top:12px">场景类型</label>
      <div class="type-btns">
        <button v-for="t in (['spatial','virtual','lobby'] as const)" :key="t" class="type-btn" :class="{ active: editSceneForm.type === t }" @click="editSceneForm.type = t">{{ typeLabel[t] }}</button>
      </div>
      <label class="form-label" style="margin-top:12px">历史可见性</label>
      <select v-model="editSceneForm.history_visibility" class="field-input">
        <option value="all">all — 可查看全部历史</option>
        <option value="recent">recent — 仅最近历史</option>
        <option value="none">none — 不可查看历史</option>
      </select>
      <label class="form-label" style="margin-top:12px">描述</label>
      <textarea v-model="editSceneForm.description" class="field-input" rows="2" style="resize:vertical" />
    </div>
    <template #footer>
      <button class="dlg-btn" @click="showEditScene = false">取消</button>
      <button class="dlg-btn accent" @click="saveSceneEdit" :disabled="sceneEditLoading">保存</button>
    </template>
  </ElDialog>

  <!-- 删除场景确认 -->
  <ElDialog v-model="showDeleteSceneConfirm" title="确认删除场景" width="360px">
    <p>确定删除场景 <strong>{{ deletingSceneName }}</strong>？此操作不可撤销。场景中不能有角色。</p>
    <template #footer>
      <button class="dlg-btn" @click="showDeleteSceneConfirm = false">取消</button>
      <button class="dlg-btn danger" @click="confirmDeleteScene">确认删除</button>
    </template>
  </ElDialog>
</template>
