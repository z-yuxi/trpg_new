<script setup lang="ts">
/**
 * ModuleViewer — 模组叙阅器路由页
 * 路由：/module/:id
 * 使用叙阅器内核（ViewerShell），扩展模组专属插件：
 *   - 导入开团 §14.7
 *   - 结构化数据导出 §14.3
 */
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ViewerShell from '../../components/viewer/ViewerShell.vue';
import SvgIcon from '../../components/SvgIcon.vue';
import { api } from '../../utils/api';
import { useAuthStore } from '../../stores/auth-store';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const moduleId = computed(() => String(route.params['id'] ?? ''));

// ─── 导入开团 §14.7 ────────────────────────────────────────────────────────────
const importPanelOpen = ref(false);
const importing = ref(false);
const importError = ref<string | null>(null);

interface ImportOptions {
  campaignName: string;
}
const importOptions = ref<ImportOptions>({ campaignName: '' });
// ASK: 导入开团的目标接口（如 POST /api/campaigns）是否已定义？当前使用占位实现。

async function handleImportCampaign() {
  if (!authStore.isLoggedIn) {
    router.push('/login');
    return;
  }
  importing.value = true;
  importError.value = null;
  try {
    // TODO: 调用 POST /api/campaigns 创建团并绑定模组，接口待后端实现
    // 当前触发模组导入分析（AI任务）作为占位
    await api.post(`/modules/${moduleId.value}/import/confirm`, {
      campaign_name: importOptions.value.campaignName || undefined,
    });
    // 导入成功后跳转至房间列表（待后端返回 campaign_id 时改为直接跳转）
    router.push('/rooms');
  } catch (e: unknown) {
    const err = e as { message?: string };
    importError.value = err.message ?? '导入失败，请重试';
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <ViewerShell asset-type="module" :asset-id="moduleId">

    <!-- ── 模组专属：顶部操作区（"导入开新团"按钮） §14.7 ── -->
    <template #plugin-top="{ perm }">
      <div v-if="perm === 'acquired' || perm === 'author'" class="module-actions">
        <button
          class="module-actions__btn module-actions__btn--primary"
          @click="importPanelOpen = true"
        >
          <!-- TODO: 需要图标 play-circle -->
          <SvgIcon name="icon-play-circle" :size="18" />
          导入开新团
        </button>
      </div>
    </template>

    <!-- ── 模组专属：右侧边栏插件 ────────────────────────────── -->
    <template #plugin-sidebar="{ asset, perm }">
      <div v-if="asset && (perm === 'acquired' || perm === 'author')" class="module-sidebar-panel">
        <h3 class="module-sidebar-panel__head">模组信息</h3>
        <dl class="module-sidebar-panel__list">
          <div v-if="asset.style" class="module-sidebar-panel__row">
            <dt>风格</dt><dd>{{ asset.style }}</dd>
          </div>
          <div v-if="asset.min_players || asset.max_players" class="module-sidebar-panel__row">
            <dt>人数</dt>
            <dd>{{ asset.min_players ?? '?' }}–{{ asset.max_players ?? '?' }} 人</dd>
          </div>
          <div v-if="asset.difficulty" class="module-sidebar-panel__row">
            <dt>难度</dt><dd>{{ asset.difficulty }}</dd>
          </div>
          <div v-if="asset.ruleset_name" class="module-sidebar-panel__row">
            <dt>规则包</dt><dd>{{ asset.ruleset_name }}</dd>
          </div>
        </dl>
        <button
          class="module-sidebar-panel__btn"
          @click="importPanelOpen = true"
        >
          <SvgIcon name="icon-play-circle" :size="16" />
          导入开团
        </button>
      </div>
    </template>

  </ViewerShell>

  <!-- ── 导入开团侧边浮层 §14.7 ────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="importPanelOpen" class="import-drawer" @click.self="importPanelOpen = false">
      <div class="import-drawer__panel">
        <header class="import-drawer__head">
          <h2>导入开新团</h2>
          <button class="import-drawer__close" aria-label="关闭" @click="importPanelOpen = false">
            <SvgIcon name="icon-close" :size="20" />
          </button>
        </header>

        <div class="import-drawer__body">
          <p class="import-drawer__desc">
            将本模组内容（剧情章节、NPC、场地、线索、道具）实例化到导演台，创建新团后可立即开始游戏。
          </p>

          <div class="import-drawer__field">
            <label for="campaign-name">团名称（可选）</label>
            <input
              id="campaign-name"
              v-model="importOptions.campaignName"
              type="text"
              placeholder="留空将自动使用模组标题"
              maxlength="50"
            />
          </div>

          <p class="import-drawer__note">
            导入后原模组更新不会同步到已创建的团。
          </p>

          <p v-if="importError" class="import-drawer__error">{{ importError }}</p>
        </div>

        <footer class="import-drawer__footer">
          <button
            class="import-drawer__btn import-drawer__btn--secondary"
            @click="importPanelOpen = false"
          >取消</button>
          <button
            class="import-drawer__btn import-drawer__btn--primary"
            :disabled="importing"
            @click="handleImportCampaign"
          >
            {{ importing ? '创建中…' : '确认创建并进入导演台' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
/* ── 模组顶部操作 ─────────────────────────────────────────────── */
.module-actions {
  display: flex;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
  flex-wrap: wrap;

  &__btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-5);
    border-radius: var(--radius-md, 6px);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 0.15s;

    &--primary {
      background: var(--btn-primary-bg);
      color: var(--btn-primary-text);
      &:hover { background: var(--btn-primary-hover); }
    }
  }
}

/* ── 右侧模组信息 ─────────────────────────────────────────────── */
.module-sidebar-panel {
  background: var(--surface-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg, 8px);
  padding: var(--space-4);
  margin-bottom: var(--space-4);

  &__head {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0 0 var(--space-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__list {
    display: grid;
    gap: var(--space-2);
    margin: 0 0 var(--space-4);
  }

  &__row {
    display: flex;
    gap: var(--space-2);
    font-size: 13px;

    dt { color: var(--text-secondary); flex-shrink: 0; }
    dd { color: var(--text-body); margin: 0; }
  }

  &__btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    border-radius: var(--radius-md, 6px);
    background: var(--btn-primary-bg);
    color: var(--btn-primary-text);
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;

    &:hover { background: var(--btn-primary-hover); }
  }
}

/* ── 导入开团侧边浮层 §14.7 ─────────────────────────────────── */
.import-drawer {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;

  &__panel {
    width: min(480px, 100vw);
    height: 100%;
    background: var(--surface-elevated);
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-xl);
  }

  &__head {
    height: 60px;
    padding: 0 var(--space-5);
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;

    h2 {
      font-size: 18px;
      font-weight: 700;
      margin: 0;
      color: var(--text-primary);
    }
  }

  &__close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    border-radius: var(--radius-md, 6px);

    &:hover { background: var(--surface-hover); color: var(--text-primary); }
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  &__desc {
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.7;
    margin: 0;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);

    label {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    input {
      height: 40px;
      padding: 0 var(--space-3);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md, 6px);
      font-size: 14px;
      background: var(--surface-page);
      color: var(--text-primary);
      outline: none;
      transition: border-color 0.15s;

      &:focus { border-color: var(--border-active); }
    }
  }

  &__note {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.5;
  }

  &__error {
    font-size: 13px;
    color: var(--color-danger);
    margin: 0;
  }

  &__footer {
    padding: var(--space-4) var(--space-5);
    border-top: 1px solid var(--border-light);
    display: flex;
    gap: var(--space-3);
    justify-content: flex-end;
    flex-shrink: 0;
  }

  &__btn {
    padding: var(--space-2) var(--space-5);
    border-radius: var(--radius-md, 6px);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 0.15s, opacity 0.15s;

    &:disabled { opacity: 0.6; cursor: not-allowed; }

    &--primary {
      background: var(--btn-primary-bg);
      color: var(--btn-primary-text);
      &:hover:not(:disabled) { background: var(--btn-primary-hover); }
    }

    &--secondary {
      background: var(--btn-secondary-bg);
      color: var(--btn-secondary-text);
      border-color: var(--btn-secondary-border);
      &:hover { background: var(--surface-hover); }
    }
  }
}
</style>
