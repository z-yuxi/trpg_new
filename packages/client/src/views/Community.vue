<script setup lang="ts">
import { ref } from 'vue';
import { ElTabs, ElTabPane, ElDialog, ElForm, ElFormItem, ElInput, ElSelect, ElOption, ElMessage } from 'element-plus';
import RecruitmentBoard from './community/RecruitmentBoard.vue';
import TButton from '../components/base/TButton.vue';
import { useAuthStore } from '../stores/auth-store';

const authStore = useAuthStore();
const showPostDialog = ref(false);
const postForm = ref({ type: 'gm_recruit', title: '', ruleset_id: '', player_count_max: 4 });
const submitLoading = ref(false);

async function submitPost() {
  if (!postForm.value.title || !postForm.value.ruleset_id) {
    ElMessage.warning('请填写标题和规则集');
    return;
  }
  submitLoading.value = true;
  try {
    const res = await fetch('/api/recruitment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify(postForm.value),
    });
    if (res.ok) {
      ElMessage.success('发布成功');
      showPostDialog.value = false;
      postForm.value = { type: 'gm_recruit', title: '', ruleset_id: '', player_count_max: 4 };
    } else {
      const data = await res.json();
      ElMessage.error(data.error || '发布失败');
    }
  } catch { ElMessage.error('网络错误'); }
  finally { submitLoading.value = false; }
}
</script>

<template>
  <div class="community">
    <div class="page-header">
      <h1 class="page-title">社区</h1>
      <TButton type="primary" @click="showPostDialog = true">发布帖子</TButton>
    </div>
    <ElTabs>
      <ElTabPane label="找团" name="gm_recruit">
        <RecruitmentBoard />
      </ElTabPane>
      <ElTabPane label="找玩家" name="player_seek">
        <RecruitmentBoard />
      </ElTabPane>
    </ElTabs>

    <ElDialog v-model="showPostDialog" title="发布招募帖" width="420px">
      <ElForm :model="postForm" label-position="top">
        <ElFormItem label="类型">
          <ElSelect v-model="postForm.type" style="width:100%">
            <ElOption label="GM 招募玩家" value="gm_recruit" />
            <ElOption label="玩家求组" value="player_seek" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="标题" required>
          <ElInput v-model="postForm.title" maxlength="128" show-word-limit />
        </ElFormItem>
        <ElFormItem label="规则集">
          <ElSelect v-model="postForm.ruleset_id" style="width:100%">
            <ElOption label="克苏鲁神话" value="coc" />
            <ElOption label="D&D 5e" value="dnd5e" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="最大人数">
          <ElInput v-model.number="postForm.player_count_max" type="number" :min="1" :max="20" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <TButton type="secondary" @click="showPostDialog = false">取消</TButton>
        <TButton type="primary" @click="submitPost">发布</TButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.community { max-width: 860px; margin: 0 auto; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
.page-title { font-size: var(--text-2xl); font-weight: 700; color: var(--color-text-primary); }
</style>
