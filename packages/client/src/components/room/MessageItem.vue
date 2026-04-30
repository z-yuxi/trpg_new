<script setup lang="ts">
import { ref } from 'vue';
import SvgIcon from '../SvgIcon.vue';
import ClueCard from '../ClueCard.vue';
import type { LocalMessage } from '../../stores/message-store';
import { createReport } from '../../api/reports';
import { ElMessage } from 'element-plus';

const props = defineProps<{ message: LocalMessage; isOwn: boolean }>();
const emit = defineEmits<{ retry: [tempId: string] }>();

// 上下文菜单
const menuVisible = ref(false);
const menuPos = ref({ x: 0, y: 0 });
let longPressTimer: ReturnType<typeof setTimeout> | null = null;

function getRealTime(message: LocalMessage): string {
  const dt = message.created_at instanceof Date ? message.created_at : new Date(message.created_at);
  if (isNaN(dt.getTime())) return '未知时间';
  return dt.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function openMenu(x: number, y: number) {
  // 防止超出视口外
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  menuPos.value = { x: Math.min(x, vw - 180), y: Math.min(y, vh - 160) };
  menuVisible.value = true;
}

function closeMenu() {
  menuVisible.value = false;
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  openMenu(e.clientX, e.clientY);
}

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  longPressTimer = setTimeout(() => {
    openMenu(touch.clientX, touch.clientY);
    longPressTimer = null;
  }, 500);
}

function onTouchEnd() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
}

// 范围外点击关闭菜单
function onDocumentClick() {
  if (menuVisible.value) closeMenu();
}

// 菜单项操作
function copyTimestamp() {
  navigator.clipboard?.writeText(getRealTime(props.message)).catch(() => {});
  closeMenu();
}

// 举报
const reportDialogVisible = ref(false);
const reportReason = ref('');
const REPORT_REASONS = ['骤扰广告', '恶意攻击/骚扰', '色情/不良信息', '违翟社区规则', '其他'];

function openReport() {
  reportReason.value = '';
  closeMenu();
  reportDialogVisible.value = true;
}

async function submitReport() {
  if (!reportReason.value) { ElMessage.warning('请选择举报原因'); return; }
  try {
    await createReport({
      content_type: 'message',
      content_id: String(props.message.id),
      reason: reportReason.value,
    });
    ElMessage.success('举报已收到，感谢反馈');
    reportDialogVisible.value = false;
  } catch {
    ElMessage.error('举报失败，请稍后重试');
  }
}

function formatTime(d: Date) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function parseDiceResult(metadata: any) {
  if (!metadata) return null;
  return metadata as { expression?: string; total?: number; details?: string };
}

function parseClue(metadata: any) {
  if (!metadata) return null;
  return metadata as { clue_id?: string; title?: string; content?: string; theme?: string; sender_identity_label?: string };
}

function getSenderIdentity(metadata: any) {
  if (!metadata) return null;
  return metadata as { sender_identity?: string; sender_identity_label?: string };
}

function getSenderLabel(message: LocalMessage) {
  const identity = getSenderIdentity(message.metadata);
  if (!identity?.sender_identity_label) return '';
  return identity.sender_identity_label;
}

function isNpcMessage(message: LocalMessage) {
  return getSenderIdentity(message.metadata)?.sender_identity?.startsWith('npc:') ?? false;
}

function cluePreview(message: LocalMessage) {
  const parsed = parseClue(message.metadata);
  return {
    clueId: parsed?.clue_id ?? String(message.id),
    title: parsed?.title ?? '未命名线索',
    content: parsed?.content ?? message.content,
    theme: parsed?.theme ?? 'river',
    senderName: parsed?.sender_identity_label ?? getSenderLabel(message),
  };
}
</script>

<template>
  <!-- time_tag -->
  <div v-if="message.message_type === 'time_tag'" class="msg-time-tag">{{ message.content }}</div>

  <!-- system -->
  <div v-else-if="message.message_type === 'system'" class="msg-system">{{ message.content }}</div>

  <!-- announcement -->
  <div v-else-if="message.message_type === 'announcement'" class="msg-announcement">
    <span>{{ message.content }}</span>
  </div>

  <!-- dice -->
  <div v-else-if="message.message_type === 'dice'" class="msg-dice">
    <SvgIcon name="icon-dice" :size="16" />
    <span class="dice-expr">{{ parseDiceResult(message.metadata)?.expression }}</span>
    <span class="dice-eq">=</span>
    <span class="dice-total">{{ parseDiceResult(message.metadata)?.total }}</span>
    <span class="dice-detail">{{ parseDiceResult(message.metadata)?.details }}</span>
  </div>

  <!-- clue_card -->
  <div v-else-if="message.message_type === 'clue_card'" class="msg-clue">
    <ClueCard
      :clue-id="cluePreview(message).clueId"
      :title="cluePreview(message).title"
      :content="cluePreview(message).content"
      :theme="cluePreview(message).theme"
      :sender-name="cluePreview(message).senderName"
      :created-at="message.created_at"
    />
  </div>

  <!-- ooc -->
  <div v-else-if="message.message_type === 'ooc'" class="msg-ooc">
    [OOC] {{ message.content }}
  </div>

  <!-- narrative / default — 按附录 B 3.5 实现尖角气泡 -->
  <div
    v-else
    class="msg-bubble-row"
    :class="{ own: isOwn }"
    @contextmenu="onContextMenu"
    @touchstart.passive="onTouchStart"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
  >
    <div class="msg-avatar">{{ (message.sender_character_id ?? message.sender_user_id ?? '?')[0] }}</div>
    <div class="msg-bubble-wrap">
      <div v-if="getSenderLabel(message)" class="msg-sender" :class="{ npc: isNpcMessage(message) }">
        {{ getSenderLabel(message) }}
      </div>
      <div class="msg-bubble" :class="{ 'own-bubble': isOwn, 'failed': message._sendStatus === 'failed', 'private': message.visible_to !== null }">
        <span v-if="message.visible_to !== null" class="private-badge" title="私密消息（仅部分人可见）">
          <SvgIcon name="icon-lock" :size="12" />
        </span>
        {{ message.content }}
        <span v-if="message._sendStatus === 'pending'" class="send-status pending" title="发送中">·</span>
        <span
          v-else-if="message._sendStatus === 'failed'"
          class="send-status failed"
          @click="emit('retry', message._tempId)"
          title="点击重试"
        >!</span>
      </div>
      <!-- 真实发送时间浮层（右键/长按触发） -->
    </div>
  </div>

  <!-- 上下文菜单 -->
  <teleport to="body">
    <div v-if="menuVisible" class="ctx-overlay" @click="closeMenu" />
    <div v-if="menuVisible" class="ctx-menu" :style="{ left: menuPos.x + 'px', top: menuPos.y + 'px' }">
      <div class="ctx-menu__header">发送时间：{{ getRealTime(message) }}</div>
      <button class="ctx-menu__item" @click="copyTimestamp"><SvgIcon name="icon-copy" :size="14" /> 复制时间</button>
      <button v-if="message._sendStatus === 'failed'" class="ctx-menu__item" @click="emit('retry', message._tempId); closeMenu()"><SvgIcon name="icon-history" :size="14" /> 重新发送</button>
      <button v-if="!isOwn" class="ctx-menu__item ctx-menu__item--danger" @click="openReport"><SvgIcon name="state-error" :size="14" /> 举报</button>
    </div>

    <!-- 举报对话框 -->
    <div v-if="reportDialogVisible" class="report-overlay" @click.self="reportDialogVisible = false">
      <div class="report-dialog">
        <h4 class="report-title">举报该消息</h4>
        <div class="report-reasons">
          <label v-for="r in REPORT_REASONS" :key="r" class="report-reason">
            <input type="radio" v-model="reportReason" :value="r" />
            <span>{{ r }}</span>
          </label>
        </div>
        <div class="report-actions">
          <button class="report-cancel-btn" @click="reportDialogVisible = false">取消</button>
          <button class="report-submit-btn" @click="submitReport">提交举报</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
/* ===== 时间标签 ===== */
.msg-time-tag {
  text-align: center;
  margin: var(--space-3) 0;
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* ===== 系统消息 ===== */
.msg-system {
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding: var(--space-1) var(--space-4);
}

/* ===== 公告 ===== */
.msg-announcement {
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  font-weight: var(--font-medium);
  font-size: var(--text-sm);
  color: var(--text-body);
  margin: var(--space-2) 0;
}

/* ===== 骰子 ===== */
.msg-dice {
  border: 1px solid var(--color-info);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  margin: var(--space-2) 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
.dice-expr  { color: var(--text-secondary); }
.dice-total { font-size: var(--text-lg); font-weight: var(--font-bold); color: var(--color-info); }
.dice-detail { font-size: var(--text-xs); color: var(--text-muted); }

/* ===== 线索卡 ===== */
.msg-clue {
  margin: var(--space-2) 0;
  max-width: 420px;
}

/* ===== OOC ===== */
.msg-ooc {
  font-style: italic;
  color: var(--text-muted);
  font-size: var(--text-sm);
  padding: 2px var(--space-2);
}

/* ===== 气泡行 ===== */
.msg-bubble-row {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  align-items: flex-end;
}
.msg-bubble-row.own { flex-direction: row-reverse; }

/* ===== 头像 ===== */
.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  background: var(--color-primary);
  color: var(--btn-primary-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}

/* ===== 气泡容器 ===== */
.msg-bubble-wrap { max-width: 85%; position: relative; }
.msg-sender {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-bottom: 4px;
}
.msg-sender.npc {
  color: var(--color-primary);
  font-weight: var(--font-semibold);
}

/* ===== 气泡 — 按附录 B 3.5 ===== */
.msg-bubble {
  position: relative;
  padding: var(--space-2) var(--space-3);
  background: var(--surface-hover);    /* gray-100 */
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  /* 左下角圆角保持 4px（其余继承 radius-lg） */
  border-bottom-left-radius: var(--radius-sm);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
  word-break: break-word;
  color: var(--text-body);
}

/* 左下尖角（玩家气泡） */
.msg-bubble:not(.own-bubble)::before {
  content: '';
  position: absolute;
  left: -6px;
  bottom: 8px;
  width: 0; height: 0;
  border: 6px solid transparent;
  border-right-color: var(--border-default);
  border-left: 0;
}
.msg-bubble:not(.own-bubble)::after {
  content: '';
  position: absolute;
  left: -5px;
  bottom: 9px;
  width: 0; height: 0;
  border: 5px solid transparent;
  border-right-color: var(--surface-hover);
  border-left: 0;
}

/* ===== 自己的气泡（GM/自己）— 右下尖角，primary-light 背景 ===== */
.own-bubble {
  background: var(--color-primary-light);
  border-color: var(--border-active);
  border-bottom-right-radius: var(--radius-sm);
  border-bottom-left-radius: var(--radius-lg);
  color: var(--text-primary);
}

/* 右下尖角（GM/自己气泡） */
.own-bubble::before {
  content: '';
  position: absolute;
  right: -6px;
  bottom: 8px;
  width: 0; height: 0;
  border: 6px solid transparent;
  border-left-color: var(--border-active);
  border-right: 0;
}
.own-bubble::after {
  content: '';
  position: absolute;
  right: -5px;
  bottom: 9px;
  width: 0; height: 0;
  border: 5px solid transparent;
  border-left-color: var(--color-primary-light);
  border-right: 0;
}

/* 发送失败 */
.msg-bubble.failed { border-color: var(--color-danger); }

/* 私密消息 */
.msg-bubble.private {
  border-style: dashed;
  border-color: var(--color-warning);
  opacity: 0.9;
}
.private-badge {
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
  color: var(--color-warning);
  vertical-align: middle;
}

/* 时间戳 */
.msg-time {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: 4px;
}
.msg-bubble-row.own .msg-time { text-align: right; }

/* 发送状态标识 */
.send-status { margin-left: 4px; font-size: 11px; }
.send-status.pending { color: var(--text-muted); }
.send-status.failed  { color: var(--color-danger); cursor: pointer; font-weight: var(--font-bold); }

/* ===== 上下文菜单 ===== */
.ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 998;
}
.ctx-menu {
  position: fixed;
  z-index: 999;
  background: var(--color-card-bg);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0,0,0,.18);
  min-width: 160px;
  overflow: hidden;
}
.ctx-menu__header {
  padding: 6px 14px;
  font-size: var(--text-xs);
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}
.ctx-menu__item {
  display: block;
  width: 100%;
  padding: 9px 14px;
  text-align: left;
  background: none;
  border: none;
  color: var(--text-body);
  font-size: var(--text-sm);
  cursor: pointer;
}
.ctx-menu__item:hover { background: var(--color-hover-bg, rgba(255,255,255,.06)); }
.ctx-menu__item--danger { color: var(--color-danger); }

/* ===== 举报对话框 ===== */
.report-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0,0,0,.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.report-dialog {
  background: var(--color-card-bg);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  width: 300px;
  max-width: 92vw;
}
.report-title {
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  margin-bottom: 14px;
  color: var(--text-body);
}
.report-reasons { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.report-reason {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-sm);
  color: var(--text-body);
  cursor: pointer;
}
.report-actions { display: flex; justify-content: flex-end; gap: 10px; }
.report-cancel-btn {
  padding: 7px 16px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--text-sm);
}
.report-submit-btn {
  padding: 7px 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-danger);
  color: #fff;
  cursor: pointer;
  font-size: var(--text-sm);
}
</style>
