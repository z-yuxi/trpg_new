<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import TButton from '../../components/base/TButton.vue';
import SvgIcon from '../../components/SvgIcon.vue';
import { api, getToken } from '../../utils/api';

interface Asset {
  id: string;
  filename: string;
  url: string;
  type: string;
  size: number;
  created_at: string;
}

const assets = ref<Asset[]>([]);
const loading = ref(false);
const uploading = ref(false);
const filterType = ref<'all' | 'image' | 'audio'>('all');
const fileInputRef = ref<HTMLInputElement | null>(null);

const filteredAssets = computed(() => {
  if (filterType.value === 'all') return assets.value;
  return assets.value.filter(a => a.type.startsWith(filterType.value as string));
});

async function loadAssets() {
  loading.value = true;
  try {
    assets.value = await api.get<Asset[]>('/creator/assets');
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message ?? '加载素材失败');
  } finally {
    loading.value = false;
  }
}

function triggerUpload() {
  fileInputRef.value?.click();
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  // 类型校验
  if (!file.type.startsWith('image/') && !file.type.startsWith('audio/')) {
    ElMessage.error('仅支持上传图片或音频文件');
    input.value = '';
    return;
  }

  // 大小校验：5MB
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('文件大小不能超过 5MB');
    input.value = '';
    return;
  }

  uploading.value = true;
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'creator_asset');

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });

    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? '上传失败');
    const data = await res.json();

    // 注册到 creator/assets
    const newAsset = await api.post<Asset>('/creator/assets', { filename: file.name, url: data.url, type: file.type, size: file.size });
    assets.value.unshift(newAsset);
    ElMessage.success('上传成功');
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message ?? '上传失败');
  } finally {
    uploading.value = false;
    input.value = '';
  }
}

async function deleteAsset(asset: Asset) {
  await ElMessageBox.confirm(`确定删除「${asset.filename}」？删除后无法恢复。`, '删除确认', {
    type: 'warning',
    confirmButtonText: '确认删除',
    cancelButtonText: '取消',
  });

  try {
    await api.delete(`/creator/assets/${asset.id}`);
    assets.value = assets.value.filter(a => a.id !== asset.id);
    ElMessage.success('已删除');
  } catch (e: unknown) {
    if ((e as Record<string, string>)?.action === 'cancel') return;
    ElMessage.error((e as Error)?.message ?? '删除失败');
  }
}

function copyUrl(url: string) {
  navigator.clipboard.writeText(url).then(() => ElMessage.success('链接已复制'));
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('zh-CN');
}

onMounted(loadAssets);
</script>

<template>
  <div class="assets-page" v-loading="loading">
    <!-- 页头 -->
    <div class="page-header">
      <div>
        <h1 class="page-title">素材库</h1>
        <p class="page-desc">上传图片、音频素材，可在模组编辑器中引用</p>
      </div>
      <TButton type="primary" :loading="uploading" @click="triggerUpload">
        <SvgIcon name="icon-add" :size="16" />
        上传素材
      </TButton>
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*,audio/*"
        style="display: none"
        @change="handleFileChange"
      />
    </div>

    <!-- 过滤器 -->
    <div class="filter-bar mobile-scroll-tabs">
      <button class="filter-pill" :class="{ active: filterType === 'all' }" @click="filterType = 'all'">全部</button>
      <button class="filter-pill" :class="{ active: filterType === 'image' }" @click="filterType = 'image'">图片</button>
      <button class="filter-pill" :class="{ active: filterType === 'audio' }" @click="filterType = 'audio'">音频</button>
    </div>

    <!-- 素材网格 -->
    <div v-if="filteredAssets.length" class="assets-grid">
      <article v-for="asset in filteredAssets" :key="asset.id" class="asset-card">
        <!-- 预览区域 -->
        <div class="asset-preview">
          <img v-if="asset.type.startsWith('image/')" :src="asset.url" :alt="asset.filename" class="preview-img" />
          <div v-else class="preview-audio">
            <SvgIcon name="icon-music" :size="32" />
            <span class="preview-label">音频</span>
          </div>
        </div>

        <!-- 信息区域 -->
        <div class="asset-info">
          <p class="asset-name" :title="asset.filename">{{ asset.filename }}</p>
          <p class="asset-meta">{{ formatSize(asset.size) }} · {{ formatDate(asset.created_at) }}</p>
        </div>

        <!-- 操作 -->
        <div class="asset-actions">
          <TButton size="sm" type="secondary" @click="copyUrl(asset.url)">复制链接</TButton>
          <button class="danger-btn" @click="deleteAsset(asset)" title="删除">
            <SvgIcon name="icon-trash" :size="14" />
          </button>
        </div>
      </article>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!loading" class="empty-state">
      <p class="empty-icon">🖼️</p>
      <p class="empty-title">暂无素材</p>
      <p class="empty-desc">点击「上传素材」添加图片或音频文件（≤5MB）</p>
    </div>
  </div>
</template>

<style scoped>
.assets-page { padding: var(--space-4); max-width: 960px; }

.page-header {
  display: flex; align-items: flex-start; gap: var(--space-4);
  margin-bottom: var(--space-5);
}
.page-title { font-size: var(--text-lg); font-weight: 700; margin: 0 0 var(--space-1); color: var(--text-primary); }
.page-desc { font-size: var(--text-sm); color: var(--text-muted); margin: 0; }
.page-header > div:first-child { flex: 1; }

.filter-bar {
  display: flex; gap: var(--space-2); margin-bottom: var(--space-4);
}
.mobile-scroll-tabs { overflow-x: auto; flex-wrap: nowrap; }
.filter-pill {
  padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border-default);
  background: none; cursor: pointer; font-size: var(--text-sm); white-space: nowrap;
  color: var(--text-secondary); transition: all var(--transition-fast);
}
.filter-pill.active {
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 10%, transparent);
  border-color: var(--color-primary, #5B8DB8);
  color: var(--color-primary, #5B8DB8);
  font-weight: 600;
}

.assets-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.asset-card {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  background: var(--surface-card);
  overflow: hidden;
  display: flex; flex-direction: column;
}

.asset-preview {
  width: 100%; aspect-ratio: 4/3;
  background: var(--surface-hover);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.preview-img { width: 100%; height: 100%; object-fit: cover; }
.preview-audio {
  display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
  color: var(--text-muted);
}
.preview-label { font-size: var(--text-xs); }

.asset-info { padding: var(--space-3) var(--space-3) var(--space-2); }
.asset-name {
  font-size: var(--text-sm); font-weight: 600; margin: 0 0 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--text-primary);
}
.asset-meta { font-size: var(--text-xs); color: var(--text-muted); margin: 0; }

.asset-actions {
  padding: 0 var(--space-3) var(--space-3);
  display: flex; align-items: center; gap: var(--space-2);
}
.danger-btn {
  margin-left: auto; background: none; border: none; cursor: pointer;
  color: var(--text-muted); padding: 6px; border-radius: var(--radius-md);
  display: flex; align-items: center;
}
.danger-btn:hover { background: #fee2e2; color: #dc2626; }

.empty-state {
  text-align: center; padding: var(--space-16) var(--space-10);
  border: 2px dashed var(--border-default); border-radius: var(--radius-xl);
}
.empty-icon { font-size: 48px; margin: 0 0 var(--space-3); }
.empty-title { font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); margin: 0 0 var(--space-2); }
.empty-desc { font-size: var(--text-sm); color: var(--text-muted); margin: 0; }

@media (max-width: 768px) {
  .assets-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .page-header { flex-wrap: wrap; }
}
@media (max-width: 480px) {
  .assets-grid { grid-template-columns: 1fr; }
}
</style>
