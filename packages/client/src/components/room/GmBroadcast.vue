<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { socketClient } from '../../socket/socket-client';

const broadcastContent = ref('');

function sendBroadcast() {
  const text = broadcastContent.value.trim();
  if (!text) return;
  socketClient.sendMessage({ content: `[GM公告] ${text}`, message_type: 'announcement' });
  broadcastContent.value = '';
  ElMessage.success('公告已发送');
}
</script>

<template>
  <div class="tab-pane broadcast-pane">
    <div class="section-label">全员广播</div>
    <div class="broadcast-row">
      <textarea
        v-model="broadcastContent"
        class="broadcast-input"
        placeholder="输入公告内容，发送后自动添加 [GM公告] 前缀"
        rows="2"
      />
      <button class="sm-btn accent" :disabled="!broadcastContent.trim()" @click="sendBroadcast">发送</button>
    </div>
  </div>
</template>
