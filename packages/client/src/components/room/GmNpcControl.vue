<script setup lang="ts">
import { ref } from 'vue';
import { ElDialog, ElMessage } from 'element-plus';
import { api } from '../../utils/api';
import type { CampaignNpc } from '@trpg/shared';

const props = defineProps<{
  campaignId: string;
  npcs: CampaignNpc[];
}>();

const emit = defineEmits<{
  'npc-created': [npc: CampaignNpc];
  'play-as-npc': [npcId: string];
}>();

const showNewNpc = ref(false);
const showNpcAdvanced = ref(false);
const newNpc = ref({
  name: '',
  display_name: '',
  description: '',
  roleplay_hint: '',
  avatar_url: '',
  attributes: [] as { key: string; value: string }[],
  skills: [] as { key: string; value: string }[],
});
const npcLoading = ref(false);

function addAttr() { newNpc.value.attributes.push({ key: '', value: '' }); }
function addSkill() { newNpc.value.skills.push({ key: '', value: '' }); }
function removeAttr(i: number) { newNpc.value.attributes.splice(i, 1); }
function removeSkill(i: number) { newNpc.value.skills.splice(i, 1); }

async function createNpc() {
  if (!newNpc.value.name.trim()) { ElMessage.warning('NPC 名称不能为空'); return; }
  npcLoading.value = true;
  try {
    const body: Record<string, unknown> = {
      name: newNpc.value.name,
      display_name: newNpc.value.display_name || newNpc.value.name,
      description: newNpc.value.description,
      roleplay_hint: newNpc.value.roleplay_hint,
      avatar_url: newNpc.value.avatar_url,
    };
    if (newNpc.value.attributes.length > 0) body.attributes = Object.fromEntries(newNpc.value.attributes.map((a) => [a.key, Number(a.value) || 0]));
    if (newNpc.value.skills.length > 0) body.skills = Object.fromEntries(newNpc.value.skills.map((s) => [s.key, Number(s.value) || 0]));
    const npc = await api.post<CampaignNpc>(`/campaigns/${props.campaignId}/npcs`, body);
    emit('npc-created', npc);
    showNewNpc.value = false;
    newNpc.value = { name: '', display_name: '', description: '', roleplay_hint: '', avatar_url: '', attributes: [], skills: [] };
    showNpcAdvanced.value = false;
    ElMessage.success('NPC 已创建');
  } catch (e: any) {
    ElMessage.error(e.message ?? '创建失败');
  } finally {
    npcLoading.value = false;
  }
}
</script>

<template>
  <div class="tab-pane">
    <div class="pane-header">
      <span class="pane-count">共{{ npcs.length }}个NPC</span>
      <button class="sm-btn accent" @click="showNewNpc = true">+ 新建NPC</button>
    </div>
    <div class="npc-cards">
      <div v-for="npc in npcs" :key="npc.id" class="npc-card">
        <div class="npc-avatar">
          <img v-if="npc.avatar_url" :src="npc.avatar_url" />
          <span v-else>{{ (npc.display_name || npc.name)[0] }}</span>
        </div>
        <div class="npc-info">
          <div class="npc-name">{{ npc.display_name || npc.name }}</div>
          <div class="npc-desc">{{ npc.description || '暂无描述' }}</div>
        </div>
        <button class="sm-btn" @click="emit('play-as-npc', npc.id)">扮演</button>
      </div>
    </div>
    <div v-if="npcs.length === 0" class="empty-hint">暂无NPC</div>
  </div>

  <ElDialog v-model="showNewNpc" title="新建NPC" width="500px">
    <div class="form-body">
      <label class="form-label">名称 *</label>
      <input v-model="newNpc.name" class="field-input" placeholder="NPC内部名称" />
      <button class="advanced-toggle" @click="showNpcAdvanced = !showNpcAdvanced">
        <SvgIcon :name="showNpcAdvanced ? 'icon-chevron-up' : 'icon-chevron-down'" :size="12" />
        {{ showNpcAdvanced ? '收起高级选项' : '展开高级选项' }}
      </button>
      <template v-if="showNpcAdvanced">
        <label class="form-label" style="margin-top:10px">显示名称</label>
        <input v-model="newNpc.display_name" class="field-input" placeholder="玩家看到的名字" />
        <label class="form-label" style="margin-top:10px">描述</label>
        <textarea v-model="newNpc.description" class="field-input" rows="2" style="resize:vertical" />
        <label class="form-label" style="margin-top:10px">扮演提示</label>
        <textarea v-model="newNpc.roleplay_hint" class="field-input" rows="2" style="resize:vertical" />
        <div class="dyn-section">
          <div class="dyn-header"><span>属性</span><button class="sm-btn" @click="addAttr">+ 添加</button></div>
          <div v-for="(a, i) in newNpc.attributes" :key="i" class="dyn-row">
            <input v-model="a.key" class="field-input dyn-key" placeholder="属性名" />
            <input v-model="a.value" class="field-input dyn-val" type="number" placeholder="值" />
            <button class="sm-btn danger" @click="removeAttr(i)">×</button>
          </div>
        </div>
        <div class="dyn-section">
          <div class="dyn-header"><span>技能</span><button class="sm-btn" @click="addSkill">+ 添加</button></div>
          <div v-for="(s, i) in newNpc.skills" :key="i" class="dyn-row">
            <input v-model="s.key" class="field-input dyn-key" placeholder="技能名" />
            <input v-model="s.value" class="field-input dyn-val" type="number" placeholder="值" />
            <button class="sm-btn danger" @click="removeSkill(i)">×</button>
          </div>
        </div>
      </template>
    </div>
    <template #footer>
      <button class="dlg-btn" @click="showNewNpc = false">取消</button>
      <button class="dlg-btn accent" @click="createNpc" :disabled="npcLoading">
        {{ npcLoading ? '创建中...' : '创建NPC' }}
      </button>
    </template>
  </ElDialog>
</template>
