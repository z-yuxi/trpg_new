<script setup lang="ts">
/**
 * ViewerShell —— 叙阅器沉浸式阅览壳层
 * 适用范围：模组（module）、规则包（ruleset）等所有可阅览作品类型
 * 布局规范：附录 A05 §三
 * 产品规范：产品设计.md §14
 *
 * 不复用 PageLayout，独立沉浸式壳层。
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import SvgIcon from '../SvgIcon.vue';
import { useAuthStore } from '../../stores/auth-store';
import { api } from '../../utils/api';

// ─── Props & Emits ────────────────────────────────────────────────────────────
const props = defineProps<{
  /** 作品类型 */
  assetType: 'module' | 'ruleset';
  /** 作品 ID */
  assetId: string;
}>();

const emit = defineEmits<{
  /** 作品数据加载完成后触发，传递完整 asset */
  (e: 'loaded', asset: AssetData): void;
}>();

// ─── Store & Router ───────────────────────────────────────────────────────────
const router = useRouter();
const authStore = useAuthStore();

// ─── 数据状态 ─────────────────────────────────────────────────────────────────
const loading = ref(true);
const error = ref<string | null>(null);

interface ReaderSettings {
  plugin_flags: {
    annotation?: boolean;
    toc?: boolean;
    reading_progress?: boolean;
    share?: boolean;
    import_campaign?: boolean;
    export_structured_data?: boolean;
    quote_house_rules?: boolean;
  };
  protection_flags: {
    anti_bulk_copy?: boolean;
    disable_public_comments?: boolean;
    disable_pdf_export?: boolean;
    trace_watermark?: boolean;
    embed_copyright_notice?: boolean;
    forbid_redistribution?: boolean;
  };
  preview_policy: {
    preview_ratio?: number;
    preview_section_ids?: string[];
  };
  appearance?: {
    theme_color?: string;
    font_family?: string;
    line_height?: 'compact' | 'comfortable' | 'relaxed';
  };
}

interface AssetData {
  id: string;
  name: string;
  author_id: string;
  author_name?: string;
  description?: string;
  cover_url?: string;
  content?: string | null;
  outline?: Array<{ id: string; level: number; text: string }> | null;
  metadata?: {
    watermark_enabled?: boolean;
    copy_protection?: boolean;
    preview_ratio?: number;
  } | null;
  /** 叙阅器配置（§14.8，服务端注入） */
  reader_settings?: ReaderSettings | null;
  status?: string;
  price?: number;
  /** 服务端注入：当前用户是否已获取该作品（购买/免费/作者） */
  is_owned?: boolean;
  ruleset_name?: string;
  ruleset_id?: string;
  difficulty?: string | null;
  min_players?: number | null;
  max_players?: number | null;
  style?: string | null;
}

const asset = ref<AssetData | null>(null);

// ─── 权限级别计算 ──────────────────────────────────────────────────────────────
// 产品设计.md §14.4 权限分层
type PermLevel = 'guest' | 'acquired' | 'author' | 'admin';
const permLevel = ref<PermLevel>('guest');

function detectPermLevel(data: AssetData): PermLevel {
  // 作者本人
  if (authStore.userId && data.author_id === authStore.userId) return 'author';
  // 服务端已注入 is_owned（购买/免费/作者均为 true）
  if (data.is_owned) return 'acquired';
  // 未登录且免费内容仍视为 acquired
  if (!authStore.isLoggedIn && (data.price ?? 0) === 0) return 'acquired';
  // TODO: 管理员判断：需后端在 /api/auth/me 返回 user_type 并写入 authStore
  return 'guest';
}

// ─── 阅读进度 ─────────────────────────────────────────────────────────────────
const scrollPercent = ref(0);
const savedScrollPercent = ref<number | null>(null); // 服务端上次保存值
const showResumeBtn = ref(false);
const contentEl = ref<HTMLElement | null>(null);

function updateScrollProgress() {
  const scrollable = document.documentElement;
  const scrollTop = scrollable.scrollTop;
  const docHeight = scrollable.scrollHeight - scrollable.clientHeight;
  scrollPercent.value = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;
}

/** 防抖 4s 后保存进度到服务端 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProgressSave() {
  if (!authStore.isLoggedIn) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.put(`/reading-progress/${props.assetType}/${props.assetId}`, {
      scroll_percent: scrollPercent.value,
    }).catch(() => {/* 静默失败，进度保存非关键路径 */});
  }, 4000);
}

function onScroll() {
  updateScrollProgress();
  scheduleProgressSave();
}

/** 加载后拉取服务端进度，若 >5% 则显示回到上次位置按钮 */
async function loadReadingProgress() {
  if (!authStore.isLoggedIn) return;
  try {
    const data = await api.get<{ scroll_percent: number } | null>(
      `/reading-progress/${props.assetType}/${props.assetId}`
    );
    if (data && data.scroll_percent > 5) {
      savedScrollPercent.value = data.scroll_percent;
      showResumeBtn.value = true;
    }
  } catch {/* 静默失败 */}
}

function resumeReading() {
  if (savedScrollPercent.value === null) return;
  const scrollable = document.documentElement;
  const target = Math.round((savedScrollPercent.value / 100) * (scrollable.scrollHeight - scrollable.clientHeight));
  window.scrollTo({ top: target, behavior: 'smooth' });
  showResumeBtn.value = false;
}

// ─── 复制保护 §14.5 ───────────────────────────────────────────────────────────
const MAX_SELECTION_CHARS = 200;

function handleSelectionChange() {
  if (!protectionFlags.value.anti_bulk_copy) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const text = sel.toString();
  if (text.length > MAX_SELECTION_CHARS) {
    sel.collapseToStart();
  }
}

// ─── 水印 §14.5 ───────────────────────────────────────────────────────────────
const watermarkText = computed(() => {
  if (!protectionFlags.value.trace_watermark) return '';
  return authStore.userId ? `UID:${authStore.userId}` : '版权所有';
});

// ─── 目录展开 ─────────────────────────────────────────────────────────────────
const tocOpen = ref(false);
const moreMenuOpen = ref(false);

function toggleToc() { tocOpen.value = !tocOpen.value; }
function toggleMoreMenu() { moreMenuOpen.value = !moreMenuOpen.value; }
function closeMoreMenu() { moreMenuOpen.value = false; }

function scrollToAnchor(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  tocOpen.value = false;
}

// ─── 分享 ─────────────────────────────────────────────────────────────────────
function handleShare() {
  const url = window.location.href;
  if (navigator.share) {
    navigator.share({ title: asset.value?.name ?? '作品', url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => {
      alert('链接已复制');
    }).catch(() => {});
  }
}

// ─── 加载数据 ─────────────────────────────────────────────────────────────────
async function loadAsset() {
  loading.value = true;
  error.value = null;
  try {
    const endpoint = props.assetType === 'module'
      ? `/modules/${props.assetId}`
      : `/rulesets/${props.assetId}`;
    const data = await api.get<AssetData>(endpoint);
    asset.value = data;
    permLevel.value = detectPermLevel(data);
    emit('loaded', data);
    // 应用创作者外观配置 §14.8
    applyAppearance(data.reader_settings?.appearance);
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    if (err.status === 404) {
      error.value = '作品不存在或暂无访问权限';
    } else {
      error.value = err.message ?? '加载失败，请稍后重试';
    }
  } finally {
    loading.value = false;
  }
}

// ─── 内容是否可见（试读限制） §14.4 ──────────────────────────────────────────
const canViewFull = computed(() => permLevel.value !== 'guest');

// ─── ReaderSettings 衍生计算 §14.8 ───────────────────────────────────────────
/** 规范化后的 plugin_flags，缺省全部开启 */
const pluginFlags = computed(() => {
  const f = asset.value?.reader_settings?.plugin_flags;
  return {
    annotation:            f?.annotation            ?? true,
    toc:                   f?.toc                   ?? true,
    reading_progress:      f?.reading_progress      ?? true,
    share:                 f?.share                 ?? true,
    import_campaign:       f?.import_campaign       ?? true,
    export_structured_data:f?.export_structured_data ?? false,
    quote_house_rules:     f?.quote_house_rules      ?? false,
  };
});

/** 规范化后的 protection_flags */
const protectionFlags = computed(() => {
  const f = asset.value?.reader_settings?.protection_flags;
  return {
    anti_bulk_copy:          f?.anti_bulk_copy          ?? false,
    disable_public_comments: f?.disable_public_comments ?? false,
    disable_pdf_export:      f?.disable_pdf_export      ?? false,
    trace_watermark:         f?.trace_watermark          ?? false,
    embed_copyright_notice:  f?.embed_copyright_notice  ?? true,
    forbid_redistribution:   f?.forbid_redistribution    ?? false,
  };
});

/**
 * 试读截断内容：
 * - 已获取/作者/管理员：返回完整 content
 * - 游客且有 preview_ratio：按字符数截断到 ratio 比例
 * - 游客且无 preview_ratio：返回 null（无试读内容）
 */
const visibleContent = computed<string | null>(() => {
  if (!asset.value?.content) return null;
  if (canViewFull.value) return asset.value.content;
  const ratio = asset.value.reader_settings?.preview_policy?.preview_ratio;
  if (!ratio || ratio <= 0) return null;
  const len = Math.floor(asset.value.content.length * Math.min(1, ratio));
  return asset.value.content.slice(0, len);
});

/** 游客试读了多少比例（用于 Paywall 提示） */
const previewPercent = computed<number>(() => {
  const ratio = asset.value?.reader_settings?.preview_policy?.preview_ratio ?? 0;
  return Math.round(ratio * 100);
});

// ─── 生命周期 ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadAsset();
  await loadReadingProgress();
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('selectionchange', handleSelectionChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  document.removeEventListener('selectionchange', handleSelectionChange);
  if (saveTimer) clearTimeout(saveTimer);
  resetAppearance();
});

// ─── 外观自定义 §14.8 ────────────────────────────────────────────────────────
function applyAppearance(a?: ReaderSettings['appearance']) {
  if (!a) return;
  const root = document.documentElement;
  if (a.theme_color) root.style.setProperty('--color-primary', a.theme_color);
  if (a.font_family) root.style.setProperty('--font-content', a.font_family);
  if (a.line_height) {
    const map = { compact: '1.5', comfortable: '1.8', relaxed: '2.1' };
    root.style.setProperty('--viewer-line-height', map[a.line_height]);
  }
}

function resetAppearance() {
  const root = document.documentElement;
  root.style.removeProperty('--color-primary');
  root.style.removeProperty('--font-content');
  root.style.removeProperty('--viewer-line-height');
}

// ─── 后退 ─────────────────────────────────────────────────────────────────────
function goBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/explore');
  }
}
</script>

<template>
  <div class="viewer-shell" :class="{ 'viewer-shell--loading': loading }">

    <!-- ── 顶部悬浮栏 §3.2 高度 56px ───────────────────────────── -->
    <header class="viewer-topbar">
      <div class="viewer-topbar__inner">
        <button class="viewer-topbar__btn" aria-label="返回" @click="goBack">
          <!-- TODO: 需要图标 back-arrow -->
          <SvgIcon name="icon-arrow-left" :size="20" />
        </button>

        <h1 class="viewer-topbar__title">
          {{ loading ? '加载中…' : (asset?.name ?? '—') }}
        </h1>

        <div class="viewer-topbar__actions">
          <!-- 回到上次阅读位置 §G01.15 -->
          <button
            v-if="showResumeBtn"
            class="viewer-topbar__resume"
            @click="resumeReading"
          >回到上次阅读位置</button>
          <!-- 目录 -->
          <button
            v-if="pluginFlags.toc"
            class="viewer-topbar__btn"
            :class="{ 'viewer-topbar__btn--active': tocOpen }"
            aria-label="目录"
            @click="toggleToc"
          >
            <!-- TODO: 需要图标 table-of-contents -->
            <SvgIcon name="icon-list" :size="20" />
          </button>

          <!-- 分享 -->
          <button v-if="pluginFlags.share" class="viewer-topbar__btn" aria-label="分享" @click="handleShare">
            <!-- TODO: 需要图标 share -->
            <SvgIcon name="icon-share" :size="20" />
          </button>

          <!-- 更多操作 -->
          <div class="viewer-topbar__more-wrap">
            <button class="viewer-topbar__btn" aria-label="更多操作" @click="toggleMoreMenu">
              <!-- TODO: 需要图标 more-vertical -->
              <SvgIcon name="icon-more-vertical" :size="20" />
            </button>
            <div v-if="moreMenuOpen" class="viewer-more-menu" @click.stop>
              <!-- 作者：编辑入口 §14.4 -->
              <button
                v-if="permLevel === 'author'"
                class="viewer-more-menu__item"
                @click="() => { router.push(`/creator/${assetType === 'module' ? 'modules' : 'workshop'}/${assetId}/edit`); closeMoreMenu(); }"
              >
                <SvgIcon name="icon-edit" :size="16" />编辑作品
              </button>
              <!-- 管理员：审核入口 §14.4 -->
              <template v-if="permLevel === 'admin'">
                <button class="viewer-more-menu__item" @click="closeMoreMenu">
                  <SvgIcon name="icon-shield" :size="16" />
                  <!-- TODO: 审核/违规处理功能待实现 -->
                  审核 / 违规处理
                </button>
              </template>
              <slot name="more-actions" :close-menu="closeMoreMenu" />
            </div>
          </div>
        </div>
      </div>
      <!-- 进度条（移动端置于顶栏下方） -->
      <div class="viewer-topbar__progress">
        <div class="viewer-topbar__progress-bar" :style="{ width: scrollPercent + '%' }" />
      </div>
    </header>

    <!-- ── 页面主体 ───────────────────────────────────────────────── -->
    <div class="viewer-body">

      <!-- ── 目录抽屉（移动端 / 平板） ──────────────── -->
      <aside v-if="tocOpen" class="viewer-toc-drawer" @click.self="tocOpen = false">
        <div class="viewer-toc-drawer__panel">
          <div class="viewer-toc-drawer__head">
            <span>目录</span>
            <button class="viewer-topbar__btn" @click="tocOpen = false">
              <SvgIcon name="icon-close" :size="18" />
            </button>
          </div>
          <nav class="viewer-toc-list">
            <template v-if="asset?.outline && asset.outline.length">
              <button
                v-for="item in asset.outline"
                :key="item.id"
                class="viewer-toc-item"
                :class="`viewer-toc-item--h${item.level}`"
                @click="scrollToAnchor(item.id)"
              >{{ item.text }}</button>
            </template>
            <p v-else class="viewer-toc-empty">暂无目录</p>
          </nav>
        </div>
      </aside>

      <!-- ── 主内容区 ────────────────────────────────── -->
      <main class="viewer-main" ref="contentEl">

        <!-- 加载骨架 -->
        <template v-if="loading">
          <div class="viewer-skeleton">
            <div class="viewer-skeleton__cover" />
            <div class="viewer-skeleton__title" />
            <div class="viewer-skeleton__text" />
            <div class="viewer-skeleton__text" />
            <div class="viewer-skeleton__text viewer-skeleton__text--short" />
          </div>
        </template>

        <!-- 错误态 -->
        <template v-else-if="error">
          <div class="viewer-error">
            <!-- TODO: 需要图标 empty-error -->
            <SvgIcon name="icon-alert-circle" :size="48" />
            <p>{{ error }}</p>
            <button class="viewer-btn viewer-btn--primary" @click="loadAsset">重试</button>
          </div>
        </template>

        <!-- 正文内容 -->
        <template v-else-if="asset">
          <!-- 封面 -->
          <div v-if="asset.cover_url" class="viewer-cover">
            <img :src="asset.cover_url" :alt="asset.name" />
          </div>

          <!-- 作品头信息 -->
          <div class="viewer-meta">
            <h2 class="viewer-meta__title">{{ asset.name }}</h2>
            <div class="viewer-meta__attrs">
              <span v-if="asset.author_name" class="viewer-meta__attr">
                <SvgIcon name="icon-user" :size="14" />{{ asset.author_name }}
              </span>
              <span v-if="asset.ruleset_name" class="viewer-meta__attr">
                <SvgIcon name="icon-book" :size="14" />{{ asset.ruleset_name }}
              </span>
              <span v-if="asset.difficulty" class="viewer-meta__attr">{{ asset.difficulty }}</span>
              <span v-if="asset.min_players || asset.max_players" class="viewer-meta__attr">
                {{ asset.min_players ?? '?' }}–{{ asset.max_players ?? '?' }} 人
              </span>
            </div>
            <p v-if="asset.description" class="viewer-meta__desc">{{ asset.description }}</p>
          </div>

          <!-- 品类专属插件区（顶部，如"导入开团"按钮） -->
          <slot name="plugin-top" :asset="asset" :perm="permLevel" />

          <!-- 正文渲染 §3.1 -->
          <div
            v-if="visibleContent"
            class="viewer-content"
            :class="{ 'viewer-content--watermark': !!watermarkText }"
            :style="watermarkText ? { '--watermark-text': JSON.stringify(watermarkText) } : undefined"
            v-html="visibleContent"
          />

          <!-- 试读边界提示 §14.3 §14.4 — 文案见 G01.16 -->
          <div v-if="!canViewFull" class="viewer-paywall">
            <div class="viewer-paywall__gate">
              <SvgIcon name="icon-lock" :size="32" />
              <p class="viewer-paywall__title">
                {{ previewPercent > 0 ? '当前仅开放试读' : '暂未开放试读' }}
              </p>
              <p class="viewer-paywall__sub">
                {{ previewPercent > 0 ? `已展示前 ${previewPercent}% 内容，` : '' }}获取后可阅读完整内容
              </p>
              <button class="viewer-btn viewer-btn--primary">获取完整内容</button>
              <!-- TODO: 接入购买/领取流程 -->
            </div>
          </div>

          <!-- 品类专属插件区（底部，如"评价"、"相关推荐"） -->
          <slot name="plugin-bottom" :asset="asset" :perm="permLevel" />

          <!-- 版权声明 §14.5 商业层保护 -->
          <footer class="viewer-copyright">
            <SvgIcon name="icon-copyright" :size="14" />
            &copy; {{ asset.author_name ?? '作者' }} 保留所有权利。未经授权，禁止转载或商业使用。
          </footer>
        </template>

      </main>

      <!-- ── 右侧辅助区（桌面端，§3.2 宽 280px） ──── -->
      <aside class="viewer-sidebar">
        <!-- 目录 -->
        <div v-if="asset?.outline && asset.outline.length" class="viewer-sidebar__section">
          <h3 class="viewer-sidebar__head">目录</h3>
          <nav class="viewer-toc-list">
            <button
              v-for="item in asset.outline"
              :key="item.id"
              class="viewer-toc-item"
              :class="`viewer-toc-item--h${item.level}`"
              @click="scrollToAnchor(item.id)"
            >{{ item.text }}</button>
          </nav>
        </div>

        <!-- 品类专属右侧插件 -->
        <slot name="plugin-sidebar" :asset="asset" :perm="permLevel" />
      </aside>

    </div>

    <!-- ── 底部进度条（桌面端） §3.1 ────────────────── -->
    <div class="viewer-progress-bar" aria-hidden="true">
      <div class="viewer-progress-bar__fill" :style="{ width: scrollPercent + '%' }" />
    </div>

    <!-- 遮罩（更多菜单打开时关闭用） -->
    <div v-if="moreMenuOpen" class="viewer-overlay" @click="closeMoreMenu" />
  </div>
</template>

<style lang="scss" scoped>
/* ============================================================
   ViewerShell — 沉浸式阅览壳层样式
   布局规范：附录 A05 §三
   ============================================================ */

/* ── 壳层根容器 ─────────────────────────────────────────────── */
.viewer-shell {
  min-height: 100vh;
  background: var(--surface-page);
  color: var(--text-primary);
  position: relative;
}

/* ── 顶部悬浮栏 高度 56px，固定顶部 ─────────────────────────── */
.viewer-topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--surface-elevated);
  border-bottom: 1px solid var(--border-light);
  box-shadow: var(--shadow-xs);
}

.viewer-topbar__inner {
  height: 56px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.viewer-topbar__title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  margin: 0;
  line-height: 1.3;
}

.viewer-topbar__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

/* 顶栏移动端进度条 */
.viewer-topbar__progress {
  height: 2px;
  background: var(--border-light);
}
.viewer-topbar__progress-bar {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.2s ease;
}

/* ── 通用按钮 ────────────────────────────────────────────────── */
.viewer-topbar__btn {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md, 6px);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--surface-hover);
    color: var(--text-primary);
  }

  &--active {
    color: var(--color-primary);
    background: var(--color-primary-light);
  }
}

/* ── 回到上次阅读位置 §G01.15 ───────────────────────────────── */
.viewer-topbar__resume {
  padding: var(--space-1) var(--space-3);
  font-size: 12px;
  font-weight: 500;
  color: var(--color-primary);
  background: var(--color-primary-light);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-full, 999px);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;

  &:hover { background: var(--color-primary); color: #fff; }
}

/* ── 更多菜单 ────────────────────────────────────────────────── */
.viewer-topbar__more-wrap {
  position: relative;
}

.viewer-more-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 160px;
  background: var(--surface-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg, 8px);
  box-shadow: var(--shadow-md);
  padding: var(--space-1) 0;
  z-index: 200;
}

.viewer-more-menu__item {
  width: 100%;
  padding: var(--space-2) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 14px;
  color: var(--text-body);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--surface-hover);
  }
}

/* ── 主体布局 ─────────────────────────────────────────────────── */
.viewer-body {
  display: flex;
  max-width: 1200px;
  margin: 0 auto;
  padding-top: 58px; /* topbar 高度 56px + 2px 进度条 */
  min-height: calc(100vh - 58px);
  gap: var(--space-6);
  padding-bottom: var(--space-12);
}

/* ── 主内容区 max-width 840px，居中 §3.2 ──────────────────────── */
.viewer-main {
  flex: 1;
  min-width: 0;
  max-width: 840px;
  padding: var(--space-6) var(--space-5);
}

/* ── 右侧辅助区 280px，仅桌面端显示 §3.2 ─────────────────────── */
.viewer-sidebar {
  width: 280px;
  flex-shrink: 0;
  padding-top: var(--space-6);

  &__section {
    background: var(--surface-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-lg, 8px);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
  }

  &__head {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0 0 var(--space-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
}

/* 平板及以下：隐藏右侧栏 §3.2 */
@media (max-width: 1023px) {
  .viewer-sidebar { display: none; }
  .viewer-main { max-width: none; }
  .viewer-body { gap: 0; }
}

/* 移动端内边距 */
@media (max-width: 767px) {
  .viewer-main { padding: var(--space-4) var(--space-4); }
}

/* ── 目录抽屉（移动端/平板） ─────────────────────────────────── */
.viewer-toc-drawer {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.4);

  &__panel {
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    width: min(320px, 85vw);
    background: var(--surface-elevated);
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-xl);
  }

  &__head {
    height: 56px;
    padding: 0 var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 16px;
    font-weight: 600;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }
}

/* ── 目录列表 ─────────────────────────────────────────────────── */
.viewer-toc-list {
  padding: var(--space-2) 0;
  overflow-y: auto;
  max-height: 100%;
}

.viewer-toc-item {
  display: block;
  width: 100%;
  padding: var(--space-1) var(--space-4);
  text-align: left;
  background: transparent;
  border: none;
  font-size: 13px;
  color: var(--text-body);
  cursor: pointer;
  line-height: 1.6;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--surface-hover);
    color: var(--text-primary);
  }

  &--h1 { font-weight: 600; }
  &--h2 { padding-left: var(--space-6); color: var(--text-secondary); }
  &--h3 { padding-left: calc(var(--space-6) + var(--space-3)); font-size: 12px; color: var(--text-muted); }
}

.viewer-toc-empty {
  padding: var(--space-4);
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

/* ── 加载骨架 ─────────────────────────────────────────────────── */
@keyframes shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position: 600px 0; }
}

%shimmer-base {
  background: linear-gradient(90deg, var(--surface-hover) 25%, var(--border-light) 50%, var(--surface-hover) 75%);
  background-size: 1200px 100%;
  animation: shimmer 1.4s infinite linear;
  border-radius: var(--radius-md, 6px);
}

.viewer-skeleton {
  padding: var(--space-4) 0;

  &__cover {
    @extend %shimmer-base;
    height: 220px;
    margin-bottom: var(--space-5);
    border-radius: var(--radius-lg, 8px);
  }
  &__title {
    @extend %shimmer-base;
    height: 28px;
    width: 60%;
    margin-bottom: var(--space-4);
  }
  &__text {
    @extend %shimmer-base;
    height: 16px;
    margin-bottom: var(--space-3);
    &--short { width: 40%; }
  }
}

/* ── 错误态 ───────────────────────────────────────────────────── */
.viewer-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-16) var(--space-4);
  color: var(--text-secondary);
  text-align: center;
}

/* ── 封面 ─────────────────────────────────────────────────────── */
.viewer-cover {
  margin-bottom: var(--space-5);
  border-radius: var(--radius-lg, 8px);
  overflow: hidden;
  max-height: 320px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

/* ── 作品头信息 ───────────────────────────────────────────────── */
.viewer-meta {
  margin-bottom: var(--space-6);

  &__title {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 var(--space-3);
    line-height: 1.3;
  }

  &__attrs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  &__attr {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 13px;
    color: var(--text-secondary);
    background: var(--surface-hover);
    border-radius: var(--radius-full, 999px);
    padding: 2px var(--space-2);
  }

  &__desc {
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.7;
    margin: 0;
  }
}

/* ── 正文渲染区 ───────────────────────────────────────────────── */
.viewer-content {
  font-size: 16px;
  line-height: var(--viewer-line-height, 1.8);
  color: var(--text-body);

  /* 水印 §14.5 */
  &--watermark::after {
    content: var(--watermark-text, '');
    position: fixed;
    inset: 0;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: rgba(0, 0, 0, 0.06);
    transform: rotate(-30deg);
    font-weight: 600;
    letter-spacing: 0.05em;
    white-space: nowrap;
    z-index: 50;
  }

  /* 富文本标题锚点 */
  :deep(h1), :deep(h2), :deep(h3), :deep(h4) {
    color: var(--text-primary);
    font-weight: 700;
    line-height: 1.4;
    margin: 1.8em 0 0.6em;
    scroll-margin-top: 72px; /* topbar 56px + buffer */
  }

  :deep(h1) { font-size: 1.5em; }
  :deep(h2) { font-size: 1.25em; }
  :deep(h3) { font-size: 1.1em; }

  :deep(p) {
    margin: 0 0 1em;
  }

  :deep(ul), :deep(ol) {
    padding-left: 1.5em;
    margin: 0 0 1em;
  }

  :deep(blockquote) {
    border-left: 3px solid var(--color-primary);
    padding-left: var(--space-4);
    color: var(--text-secondary);
    margin: 1em 0;
  }

  :deep(img) {
    max-width: 100%;
    border-radius: var(--radius-md, 6px);
  }

  :deep(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin: 1em 0;
  }

  :deep(th), :deep(td) {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-default);
    text-align: left;
  }

  :deep(th) {
    background: var(--surface-hover);
    font-weight: 600;
  }

  :deep(code) {
    font-family: monospace;
    font-size: 0.9em;
    background: var(--surface-hover);
    padding: 0.1em 0.3em;
    border-radius: 3px;
  }
}

/* ── 试读边界 §14.3 ───────────────────────────────────────────── */
.viewer-paywall {
  margin-top: var(--space-6);

  &__gate {
    background: var(--surface-card);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg, 8px);
    padding: var(--space-10) var(--space-6);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    color: var(--text-secondary);
  }

  &__title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__sub {
    margin: 0;
    font-size: 14px;
    color: var(--text-secondary);
  }
}

/* ── 版权声明 §14.5 ───────────────────────────────────────────── */
.viewer-copyright {
  margin-top: var(--space-10);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-light);
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

/* ── 底部进度条（桌面端） §3.1 ─────────────────────────────────── */
.viewer-progress-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--border-light);
  z-index: 100;

  &__fill {
    height: 100%;
    background: var(--color-primary);
    transition: width 0.15s ease;
  }
}

/* ── 遮罩 ─────────────────────────────────────────────────────── */
.viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
}

/* ── 通用按钮 ────────────────────────────────────────────────── */
.viewer-btn {
  padding: var(--space-2) var(--space-5);
  border-radius: var(--radius-md, 6px);
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s, opacity 0.15s;

  &--primary {
    background: var(--btn-primary-bg);
    color: var(--btn-primary-text);
    border-color: var(--btn-primary-bg);

    &:hover { background: var(--btn-primary-hover); }
  }
}
</style>
