<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import EmptyState from '../components/base/EmptyState.vue';
import SvgIcon from '../components/SvgIcon.vue';
import { listConversations, getMessages, markConversationRead, sendMessage as sendDirectMessage, createConversation } from '../api/messages';
import { showApiError } from '../utils/feedback';
import { useAuthStore } from '../stores/auth-store';
import { useRouter, useRoute } from 'vue-router';

interface Conversation {
  id: string;
  other_user: { id: string; nickname: string; avatar_url?: string };
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  type: 'text' | 'image';
  image_url?: string;
}

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const conversations = ref<Conversation[]>([]);
const activeConv = ref<Conversation | null>(null);
const messages = ref<Message[]>([]);
const inputText = ref('');
const loadingConvs = ref(false);
const loadingMsgs = ref(false);
const sending = ref(false);
const searchInput = ref('');
const searchKeyword = ref('');
const mobileView = ref<'list' | 'chat'>('list');

const filteredConversations = computed(() =>
  conversations.value.filter(c =>
    !searchKeyword.value || c.other_user.nickname.includes(searchKeyword.value)
  )
);

function applySearch() {
  searchKeyword.value = searchInput.value.trim();
}

async function loadConversations() {
  loadingConvs.value = true;
  try {
    const data = await listConversations();
    conversations.value = data;
  } catch (error) {
    conversations.value = [];
    showApiError(error);
  } finally {
    loadingConvs.value = false;
  }
}

async function openConversation(conv: Conversation) {
  activeConv.value = conv;
  mobileView.value = 'chat';
  loadingMsgs.value = true;
  try {
    const data = await getMessages(conv.id);
    messages.value = data;
    // 标为已读
    if (conv.unread_count > 0) {
      await markConversationRead(conv.id).catch(() => {});
      conv.unread_count = 0;
    }
  } catch (error) {
    messages.value = [];
    showApiError(error);
  } finally {
    loadingMsgs.value = false;
  }
}

async function sendMessage() {
  if (!inputText.value.trim() || !activeConv.value) return;
  const content = inputText.value.trim();
  inputText.value = '';
  // 乐观更新
  const tempMsg: Message = {
    id: `temp_${Date.now()}`,
    sender_id: authStore.userId ?? '',
    content,
    created_at: new Date().toISOString(),
    type: 'text',
  };
  messages.value.push(tempMsg);
  sending.value = true;
  try {
    const sent = await sendDirectMessage(activeConv.value.id, { content });
    // 替换临时消息
    const idx = messages.value.findIndex(m => m.id === tempMsg.id);
    if (idx !== -1) messages.value[idx] = sent;
    // 更新会话列表预览
    const conv = conversations.value.find(c => c.id === activeConv.value!.id);
    if (conv) {
      conv.last_message = content;
      conv.last_message_at = sent.created_at;
    }
  } catch (error) {
    // 标记发送失败
    const idx = messages.value.findIndex(m => m.id === tempMsg.id);
    if (idx !== -1) (messages.value[idx] as any)._failed = true;
    showApiError(error, '发送失败，请重试');
  } finally {
    sending.value = false;
  }
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 172800000) return '昨天';
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

onMounted(async () => {
  await loadConversations();
  // 深链：/messages?with=<userId> — 直接打开 / 创建与该用户的会话
  const withUserId = route.query['with'] as string | undefined;
  if (withUserId) {
    try {
      const conv = await createConversation(withUserId);
      // 确保会话在列表中
      if (!conversations.value.find(c => c.id === conv.id)) {
        conversations.value.unshift(conv);
      }
      await openConversation(conv);
    } catch (error) {
      showApiError(error, '无法打开该会话');
    }
    // 清除 query 参数
    router.replace({ path: '/messages' });
  }
});
</script>

<template>
  <div class="messages-root">
    <!-- 会话列表面板 -->
    <aside class="conv-panel" :class="{ 'mobile-hidden': mobileView === 'chat' }">
      <div class="conv-header">
        <span class="conv-title">私信</span>
      </div>
      <div class="conv-search">
        <div class="search-row">
          <input
            v-model="searchInput"
            class="search-input"
            placeholder="搜索会话"
            @keydown.enter.prevent="applySearch"
          />
          <button class="search-btn" @click="applySearch">搜索</button>
        </div>
      </div>

      <div v-if="loadingConvs" class="conv-loading">加载中…</div>

      <EmptyState
        v-else-if="filteredConversations.length === 0 && !searchKeyword"
        title="暂无私信"
        :show-action="true"
        action-text="去社区发现有趣玩家"
        @action="router.push('/discuss')"
      />
      <div v-else-if="filteredConversations.length === 0 && searchKeyword" class="conv-empty-search">
        未找到相关会话
      </div>

      <ul v-else class="conv-list">
        <li
          v-for="conv in filteredConversations"
          :key="conv.id"
          class="conv-item"
          :class="{ active: activeConv?.id === conv.id }"
          @click="openConversation(conv)"
        >
          <div class="conv-avatar">
            <img v-if="conv.other_user.avatar_url" :src="conv.other_user.avatar_url" :alt="conv.other_user.nickname" />
            <span v-else class="avatar-fallback">{{ conv.other_user.nickname[0] }}</span>
          </div>
          <div class="conv-info">
            <div class="conv-name-row">
              <span class="conv-name">{{ conv.other_user.nickname }}</span>
              <span class="conv-time">{{ formatTime(conv.last_message_at) }}</span>
            </div>
            <div class="conv-preview-row">
              <span class="conv-preview">{{ conv.last_message }}</span>
              <span v-if="conv.unread_count > 0" class="conv-badge">
                {{ conv.unread_count > 99 ? '99+' : conv.unread_count }}
              </span>
            </div>
          </div>
        </li>
      </ul>
    </aside>

    <!-- 聊天区 -->
    <main class="chat-panel" :class="{ 'mobile-hidden': mobileView === 'list' }">
      <!-- 未选择会话时的占位 -->
      <div v-if="!activeConv" class="chat-placeholder">
        <SvgIcon name="icon-chat" :size="48" />
        <p>选择一个会话开始聊天</p>
      </div>

      <!-- 聊天内容 -->
      <template v-else>
        <div class="chat-header">
          <button class="back-btn" @click="mobileView = 'list'">
            <SvgIcon name="icon-back" :size="16" />
          </button>
          <span class="chat-title">{{ activeConv.other_user.nickname }}</span>
        </div>

        <div class="chat-messages" ref="messagesEl">
          <div v-if="loadingMsgs" class="msgs-loading">加载中…</div>
          <template v-else>
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="msg-row"
              :class="{ self: msg.sender_id === authStore.userId, failed: (msg as any)._failed }"
            >
              <div class="msg-bubble">
                <img v-if="msg.type === 'image' && msg.image_url" :src="msg.image_url" class="msg-img" />
                <span v-else>{{ msg.content }}</span>
                <span v-if="(msg as any)._failed" class="msg-fail-icon" title="发送失败，点击重试">!</span>
              </div>
            </div>
          </template>
        </div>

        <div class="chat-input-bar">
          <input
            v-model="inputText"
            class="chat-input"
            placeholder="输入消息…"
            @keydown.enter.prevent="sendMessage"
          />
          <button class="send-btn" @click="sendMessage" :disabled="!inputText.trim() || sending">
            {{ sending ? '…' : '发送' }}
          </button>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.messages-root {
  display: flex;
  height: calc(100vh - var(--navbar-height, 56px));
  background: var(--color-page-bg);
  overflow: hidden;
}

/* ── 会话列表 ── */
.conv-panel {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-card-border);
  background: var(--color-card-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.conv-header {
  padding: var(--space-4) var(--space-4) var(--space-2);
  border-bottom: 1px solid var(--color-card-border);
}
.conv-title { font-size: var(--text-base); font-weight: 700; color: var(--color-text-primary); }
.conv-search { padding: var(--space-2) var(--space-3); }
.search-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.search-input {
  flex: 1;
  min-width: 0;
  padding: 6px var(--space-2);
  border: 1px solid var(--color-card-border); border-radius: var(--radius-md);
  background: var(--color-page-bg); color: var(--color-text-primary);
  font-size: var(--text-sm); box-sizing: border-box; outline: none;
}
.search-btn {
  height: 32px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  background: var(--color-card-bg);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
}
.search-btn:hover {
  color: var(--color-text-primary);
  border-color: var(--color-accent, #2563eb);
}
.conv-loading, .conv-empty-search {
  padding: var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
}
.conv-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
.conv-item {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  transition: background var(--transition-fast);
  border-bottom: 1px solid var(--color-card-border);
}
.conv-item:hover, .conv-item.active { background: var(--color-page-bg); }
.conv-avatar { width: 36px; height: 36px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: var(--color-card-border); display: flex; align-items: center; justify-content: center; }
.conv-avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar-fallback { font-size: var(--text-sm); font-weight: 700; color: var(--color-text-secondary); }
.conv-info { flex: 1; min-width: 0; }
.conv-name-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
.conv-name { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); }
.conv-time { font-size: var(--text-xs); color: var(--color-text-muted); }
.conv-preview-row { display: flex; justify-content: space-between; align-items: center; }
.conv-preview { font-size: var(--text-xs); color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.conv-badge {
  margin-left: var(--space-2); flex-shrink: 0;
  background: var(--color-accent, #2563eb); color: #fff;
  font-size: 11px; font-weight: 700; border-radius: 10px; padding: 1px 6px;
}

/* ── 聊天区 ── */
.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
.chat-placeholder {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--space-3); color: var(--color-text-muted);
}
.chat-header {
  display: flex; align-items: center; gap: var(--space-3);
  padding: 0 var(--space-4);
  height: 52px; border-bottom: 1px solid var(--color-card-border);
  background: var(--color-card-bg); flex-shrink: 0;
}
.back-btn { display: none; background: none; border: none; cursor: pointer; color: var(--color-text-secondary); padding: 4px; }
.chat-title { font-size: var(--text-base); font-weight: 600; color: var(--color-text-primary); }
.chat-messages { flex: 1; overflow-y: auto; padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); }
.msgs-loading { color: var(--color-text-muted); font-size: var(--text-sm); text-align: center; }
.msg-row { display: flex; }
.msg-row.self { justify-content: flex-end; }
.msg-bubble {
  max-width: 60%; padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-lg);
  font-size: var(--text-sm); line-height: 1.5;
  background: var(--color-card-border); color: var(--color-text-primary);
}
.msg-row.self .msg-bubble {
  background: color-mix(in srgb, var(--color-accent, #2563eb) 15%, var(--color-card-bg));
}
.msg-row.failed .msg-bubble { border: 1px solid #ef4444; }
.msg-img { max-width: 200px; border-radius: var(--radius-md); display: block; }
.msg-fail-icon { color: #ef4444; margin-left: 4px; font-weight: 700; cursor: pointer; }
.chat-input-bar {
  display: flex; gap: var(--space-2); padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-card-border); background: var(--color-card-bg);
}
.chat-input {
  flex: 1; padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-card-border); border-radius: var(--radius-md);
  background: var(--color-page-bg); color: var(--color-text-primary);
  font-size: var(--text-sm); outline: none;
}
.chat-input:focus { border-color: var(--color-accent, #2563eb); }
.send-btn {
  padding: var(--space-2) var(--space-4);
  border: none; border-radius: var(--radius-md);
  background: var(--color-accent, #2563eb); color: #fff;
  cursor: pointer; font-size: var(--text-sm); font-weight: 600;
  transition: opacity var(--transition-fast);
}
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── 移动端 ── */
@media (max-width: 768px) {
  .conv-panel { width: 100%; border-right: none; }
  .mobile-hidden { display: none; }
  .back-btn { display: flex; align-items: center; }
}
</style>
