<script setup lang="ts">
import { ref } from 'vue';
import SvgIcon from '../SvgIcon.vue';
import ClueCard from '../ClueCard.vue';
import type { StoryTime, ScheduledMove, Scene, CampaignNpc } from '@trpg/shared';
import { socketClient } from '../../socket/socket-client';

const props = defineProps<{
  campaignId: string;
  globalStoryTime: StoryTime;
  pendingMoves: ScheduledMove[];
  scenes: Scene[];
  npcs: CampaignNpc[];
  enableConnections: boolean;
}>();

const activeTab = ref<'time' | 'moves' | 'scenes' | 'npcs' | 'clues'>('time');

// 时间控制
const deltaDay = ref(0);
const deltaHour = ref(0);
const deltaMin = ref(0);

function applyDelta() {
  const base = props.globalStoryTime;
  let totalMinutes = base.minute + deltaMin.value + (base.hour + deltaHour.value) * 60 + (base.day + deltaDay.value - 1) * 1440;
  if (deltaDay.value === 0 && deltaHour.value === 0 && deltaMin.value === 0) return;
  const newDay = Math.floor(totalMinutes / 1440) + 1;
  const rem = totalMinutes % 1440;
  const newHour = Math.floor(rem / 60);
  const newMin = rem % 60;
  socketClient.gmAdvanceTime({ custom_time: { day: newDay, hour: newHour, minute: newMin } });
}

function quickAdvance(days: number, hours: number, minutes: number) {
  const base = props.globalStoryTime;
  let totalMinutes = base.minute + minutes + (base.hour + hours) * 60 + (base.day + days - 1) * 1440;
  const newDay = Math.floor(totalMinutes / 1440) + 1;
  const rem = totalMinutes % 1440;
  const newHour = Math.floor(rem / 60);
  const newMin = rem % 60;
  socketClient.gmAdvanceTime({ custom_time: { day: newDay, hour: newHour, minute: newMin } });
}

const tabs = [
  { key: 'time', icon: 'icon-clock', label: '\u65f6\u95f4' },
  { key: 'moves', icon: 'icon-list', label: '\u79fb\u52a8' },
  { key: 'scenes', icon: 'icon-grid', label: '\u573a' },
  { key: 'npcs', icon: 'icon-npc', label: 'NPC' },
  { key: 'clues', icon: 'icon-scroll', label: '\u7ebf\u7d22' },
];

function getSceneName(id: string) { return props.scenes.find(s => s.id === id)?.name ?? id; }
function padZ(n: number) { return String(n).padStart(2, '0'); }

// 线索管理
const THEMES = ['river', 'blur', 'fragment', 'wave', 'ancient', 'blood', 'ash', 'cyber'] as const;
type ClueTheme = typeof THEMES[number];

const clueForm = ref({
  title: '',
  content: '',
  theme: 'river' as ClueTheme,
});
const localClues = ref<{ id: string; title: string; content: string; theme: ClueTheme }[]>([]);

function sendClue() {
  if (!clueForm.value.title || !clueForm.value.content) return;
  const clue = {
    id: Date.now().toString(),
    title: clueForm.value.title,
    content: clueForm.value.content,
    theme: clueForm.value.theme,
  };
  localClues.value.unshift(clue);
  // 通过 socket 发送 clue_card 消息
  socketClient.sendMessage({
    content: clueForm.value.content,
    message_type: 'clue_card',
    metadata: { theme: clueForm.value.theme, title: clueForm.value.title },
  });
  clueForm.value = { title: '', content: '', theme: 'river' };
}
</script>

<template>
  <div class="gm-console">
    <div class="console-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="console-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = (tab.key as any)"
        :title="tab.label"
      >
        <SvgIcon :name="tab.icon" :size="16" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <div class="console-body">
      <!-- 时间控制 -->
      <div v-if="activeTab === 'time'">
        <div class="story-time-display">
          <SvgIcon name="icon-clock" :size="18" />
          <span>Day {{ globalStoryTime.day }}, {{ padZ(globalStoryTime.hour) }}:{{ padZ(globalStoryTime.minute) }}</span>
        </div>
        <div class="quick-advance">
          <button @click="quickAdvance(0, 0, 10)">+10分</button>
          <button @click="quickAdvance(0, 0, 30)">+30分</button>
          <button @click="quickAdvance(0, 1, 0)">+1小时</button>
          <button @click="quickAdvance(0, 6, 0)">+6小时</button>
          <button @click="quickAdvance(1, 0, 0)">+1天</button>
        </div>
        <div class="custom-advance">
          <p class="label">自定义推进</p>
          <div class="delta-row">
            <div class="delta-item"><input v-model.number="deltaDay" type="number" min="0" /><span>天</span></div>
            <div class="delta-item"><input v-model.number="deltaHour" type="number" min="0" max="23" /><span>时</span></div>
            <div class="delta-item"><input v-model.number="deltaMin" type="number" min="0" max="59" /><span>分</span></div>
          </div>
          <button class="apply-btn" @click="applyDelta">推进时间</button>
        </div>
      </div>

      <!-- 待审批移动 -->
      <div v-else-if="activeTab === 'moves'">
        <div v-for="move in pendingMoves" :key="move.id" class="move-item">
          <div class="move-info">
            <span class="move-char">{{ move.character_id }}</span>
            <span>→</span>
            <span class="move-target">{{ getSceneName(move.to_scene_id) }}</span>
          </div>
          <div class="move-actions">
            <button class="approve-btn" @click="socketClient.gmApproveMove(move.id)">
              <SvgIcon name="icon-plus" :size="14" /> 批准
            </button>
            <button class="reject-btn" @click="socketClient.gmRejectMove(move.id)">
              <SvgIcon name="icon-lock" :size="14" /> 拒绝
            </button>
          </div>
        </div>
        <div v-if="pendingMoves.length === 0" class="empty">暂无待审批移动</div>
      </div>

      <!-- 场管理 -->
      <div v-else-if="activeTab === 'scenes'">
        <div v-for="scene in scenes" :key="scene.id" class="scene-row">
          <span class="scene-name">{{ scene.name }}</span>
          <span class="scene-type">{{ scene.type }}</span>
        </div>
        <div v-if="scenes.length === 0" class="empty">暂无场景</div>
      </div>

      <!-- NPC 控制 -->
      <div v-else-if="activeTab === 'npcs'">
        <div v-for="npc in npcs" :key="npc.id" class="npc-row">
          <div class="npc-info">
            <span class="npc-name">{{ npc.display_name || npc.name }}</span>
            <span class="npc-active" :class="{ active: npc.is_active }">{{ npc.is_active ? '活跃' : '非活跃' }}</span>
          </div>
        </div>
        <div v-if="npcs.length === 0" class="empty">暂无 NPC</div>
      </div>

      <!-- 线索库 -->
      <div v-else-if="activeTab === 'clues'" class="clues-panel">
        <div class="clue-form">
          <p class="label">创建线索</p>
          <input v-model="clueForm.title" class="clue-input" placeholder="线索标题" />
          <textarea v-model="clueForm.content" class="clue-textarea" rows="3" placeholder="线索内容..." />
          <div class="theme-select">
            <span class="label">文字风格：</span>
            <select v-model="clueForm.theme" class="theme-dropdown">
              <option v-for="t in ['river','blur','fragment','wave','ancient','blood','ash','cyber']" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <button class="apply-btn" @click="sendClue">发送线索</button>
        </div>
        <div class="clue-preview" v-if="clueForm.title">
          <p class="label">预览</p>
          <ClueCard :title="clueForm.title" :content="clueForm.content || '...'" :theme="clueForm.theme" />
        </div>
        <div v-if="localClues.length > 0" class="clue-history">
          <p class="label">已发送</p>
          <ClueCard v-for="c in localClues" :key="c.id" :title="c.title" :content="c.content" :theme="c.theme" style="margin-bottom:8px" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gm-console { display: flex; flex-direction: column; background: var(--color-card-bg); border-bottom: 1px solid var(--color-card-border); }
.console-tabs { display: flex; border-bottom: 1px solid var(--color-card-border); padding: 0 var(--space-2); }
.console-tab {
  display: flex; align-items: center; gap: 4px; padding: var(--space-2) var(--space-3);
  border: none; background: none; cursor: pointer; color: var(--color-text-secondary);
  font-size: var(--text-xs); border-bottom: 2px solid transparent; transition: color var(--transition-fast);
}
.console-tab.active { color: var(--color-accent); border-bottom-color: var(--color-accent); }
.console-body { padding: var(--space-4); max-height: 280px; overflow-y: auto; }
.story-time-display { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xl); font-weight: 700; font-family: var(--font-mono); margin-bottom: var(--space-3); color: var(--color-accent); }
.quick-advance { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
.quick-advance button {
  padding: 4px 10px; border: 1px solid var(--color-card-border); border-radius: var(--radius-md);
  background: var(--color-page-bg); cursor: pointer; font-size: var(--text-sm);
}
.quick-advance button:hover { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
.custom-advance { border-top: 1px solid var(--color-card-border); padding-top: var(--space-3); }
.label { font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: var(--space-2); }
.delta-row { display: flex; gap: var(--space-3); margin-bottom: var(--space-3); }
.delta-item { display: flex; align-items: center; gap: var(--space-1); }
.delta-item input { width: 60px; padding: 4px 8px; border: 1px solid var(--color-input-border); border-radius: var(--radius-md); text-align: center; font-size: var(--text-sm); }
.apply-btn { width: 100%; padding: var(--space-2); background: var(--color-accent); color: #fff; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: var(--text-sm); }
.move-item { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-card-border); gap: var(--space-3); }
.move-info { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); flex: 1; }
.move-char { font-weight: 500; }
.move-target { color: var(--color-accent); }
.move-actions { display: flex; gap: var(--space-2); flex-shrink: 0; }
.approve-btn { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: #dcfce7; color: #15803d; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: var(--text-xs); }
.reject-btn { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: #fee2e2; color: #b91c1c; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: var(--text-xs); }
.scene-row { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-card-border); }
.scene-name { font-size: var(--text-sm); }
.scene-type { font-size: var(--text-xs); color: var(--color-text-muted); }
.npc-row { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-card-border); }
.npc-name { font-size: var(--text-sm); font-weight: 500; }
.npc-active { font-size: var(--text-xs); color: var(--color-text-muted); }
.npc-active.active { color: var(--color-success); }
.empty { text-align: center; color: var(--color-text-muted); font-size: var(--text-sm); padding: var(--space-4); }

.clues-panel { display: flex; flex-direction: column; gap: var(--space-3); }
.clue-form { display: flex; flex-direction: column; gap: var(--space-2); }
.clue-input, .clue-textarea, .theme-dropdown {
  width: 100%; padding: var(--space-2); border: 1px solid var(--color-input-border);
  border-radius: var(--radius-md); background: var(--color-input-bg); font-size: var(--text-sm);
  color: var(--color-text-primary);
}
.clue-textarea { resize: vertical; font-family: var(--font-sans); }
.theme-select { display: flex; align-items: center; gap: var(--space-2); }
.clue-preview { border-top: 1px solid var(--color-card-border); padding-top: var(--space-3); }
.clue-history { border-top: 1px solid var(--color-card-border); padding-top: var(--space-3); }

.clues-panel { display: flex; flex-direction: column; gap: var(--space-3); }
.clue-form { display: flex; flex-direction: column; gap: var(--space-2); }
.clue-input, .clue-textarea, .theme-dropdown {
  width: 100%; padding: var(--space-2); border: 1px solid var(--color-input-border);
  border-radius: var(--radius-md); background: var(--color-input-bg); font-size: var(--text-sm);
  color: var(--color-text-primary);
}
.clue-textarea { resize: vertical; font-family: var(--font-sans); }
.theme-select { display: flex; align-items: center; gap: var(--space-2); }
.clue-preview { border-top: 1px solid var(--color-card-border); padding-top: var(--space-3); }
.clue-history { border-top: 1px solid var(--color-card-border); padding-top: var(--space-3); }
</style>
