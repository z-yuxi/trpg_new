# 模组编辑器新方案开发任务提示词集

> 每个 prompt 是一个独立的 Claude 对话任务。  
> 按顺序执行：P0-A → P0-B → P0-C → P1-A → P1-B。  
> 每个任务完成后需人工 review 并跑通，再开始下一个。

---

## 背景上下文（每次对话开头粘贴此段）

```
项目栈：Vue 3 + TypeScript + TipTap 2（ProseMirror 封装）+ Vite
关键路径：
  packages/client/src/
    components/module-editor/
      ModuleEditorCore.vue          ← 编辑器核心，管理所有扩展注册
      extensions/                   ← 旧块扩展（暂注释，勿修改）
        SceneBlockExtension.ts
        NpcBlockExtension.ts
        ClueBlockExtension.ts
        CheckBlockExtension.ts
        DialogBlockExtension.ts
        EventBlockExtension.ts
      blocks/                       ← 旧 NodeView 组件（暂注释，勿修改）
    views/creator/ModuleEditor.vue  ← 编辑器页，包含大纲面板
    utils/outline-extractor.ts      ← 从 TipTap JSON 提取大纲（纯函数）
    api/modules.ts                  ← 模组 HTTP API 封装

设计文档（只读参考）：
  docs/design/附录 E-1：模组编辑器交互基线.md
  docs/design/附录 E-1-1：大纲面板交互基线.md

旧方案特征（已被新方案取代）：
- SceneBlockExtension：scene_block，内嵌 scene_name/atmosphere/gm_notes 等完整属性
- NpcBlockExtension：npc_block，内嵌 attributes/skills/resources 等完整属性
- ClueBlockExtension：clue_block，内嵌 clue_name/clue_type/unlock_condition 等完整属性
这三类旧块已在 ModuleEditorCore.vue 中被注释，不再注册。

新方案核心原则：
- 正文是流式富文本，结构化内容改为轻量原子块
- NPC/线索/场景的完整属性存放于服务端实体库，块内只存 entityId + label
- KP/玩家双视图通过 ProseMirror Plugin + Decoration 实现，不修改文档内容
```

---

## P0-A：新增三个核心原子块扩展

### 任务描述

在 `packages/client/src/components/module-editor/extensions/` 下新增三个 TipTap Node 扩展，并在 `ModuleEditorCore.vue` 中注册；同时更新工具栏和 Slash 命令菜单，用新节点替换旧块入口。

### 三个新节点规格

#### 1. `investigable_node`（▼ 调查/交互节点）

```typescript
// 文件：extensions/InvestigableNodeExtension.ts
// 对应设计：附录 E-1 §E-1.4，块类型"交互节点"

Node.create({
  name: 'investigable_node',
  group: 'block',
  content: 'block+',   // 可包含子内容（段落/分支等）
  atom: false,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      id:            { default: '' },
      label:         { default: '' },          // 节点标题（如"▼ 衣柜"）
      visibility:    { default: 'all' },       // 'all' | 'kp'
      _version:      { default: 0 },
      _lastModified: { default: null },
    };
  },
})
```

NodeView（`blocks/InvestigableNodeView.vue`）视觉规范：
- 左侧 4px 色条，颜色 `#4A90D9`（品牌蓝）
- 整体背景 `#F5F9FF`
- 顶部标题行显示 `▼ {label}`，可点击编辑标题
- `content: 'block+'` 区域通过 `<node-view-content />` 渲染

Backspace/Delete 行为（通过 `addKeyboardShortcuts`）：
```typescript
addKeyboardShortcuts() {
  return {
    Backspace: ({ editor }) => {
      const { selection, doc } = editor.state;
      const { $from } = selection;
      // 光标在节点第一个字符之前 → 删除整个节点
      if ($from.parentOffset === 0 && $from.parent.type.name === 'investigable_node') {
        return editor.commands.deleteNode('investigable_node');
      }
      return false;
    },
  };
},
```

#### 2. `kp_info`（☆ KP 专属信息块）

```typescript
// 文件：extensions/KpInfoExtension.ts
// 对应设计：附录 E-1 §E-1.4，块类型"KP 信息"；§E-1.5 KP/玩家双视图

Node.create({
  name: 'kp_info',
  group: 'block',
  content: 'block+',
  atom: false,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      id:            { default: '' },
      visibility:    { default: 'kp' },        // 固定为 'kp'，不可更改
      _version:      { default: 0 },
      _lastModified: { default: null },
    };
  },
})
```

NodeView（`blocks/KpInfoView.vue`）视觉规范：
- 左侧 4px 色条，颜色 `#F5A623`（黄）
- 整体背景 `#FFFBF0`
- 顶部标题行显示 `☆ KP 信息`，**使用虚线边框**（`border: 1px dashed #F5A623`）
- 切换到"玩家视角"模式时，该块由 Plugin 折叠为细线，此处 NodeView 本身无需处理视图切换逻辑

#### 3. `npc_mention`（◆ NPC 点名节点）

```typescript
// 文件：extensions/NpcMentionExtension.ts
// 对应设计：附录 E-1 §E-1.4，块类型"NPC 点名"；§E-1.6 Mention 系统

Node.create({
  name: 'npc_mention',
  group: 'inline',     // 内联节点，可嵌入段落
  inline: true,
  atom: true,          // 原子节点，不可进入内部编辑

  addAttributes() {
    return {
      id:            { default: '' },    // 实体库中的 entityId
      label:         { default: '' },    // 显示文本（如"城见美苗"）
      type:          { default: 'npc' }, // 固定为 'npc'
      _version:      { default: 0 },
      _lastModified: { default: null },
    };
  },
})
```

NodeView（`blocks/NpcMentionView.vue`）视觉规范：
- 内联渲染为 `◆ {label}` 的紫色标签
- 颜色 `#9013FE`，背景 `#FAF5FF`，圆角 4px，内边距 `2px 6px`
- hover 时显示轻量 tooltip：实体 ID
- 注意：此节点是 `atom: true`，不存完整属性，只存 `id + label`

### 修改 ModuleEditorCore.vue

在 `<script setup>` 中：

1. **注释旧扩展的导入和注册**（不删除文件）：
```typescript
// 旧块扩展——已注释，新方案不注册
// import { SceneBlockExtension } from './extensions/SceneBlockExtension';
// import { NpcBlockExtension } from './extensions/NpcBlockExtension';
// import { ClueBlockExtension } from './extensions/ClueBlockExtension';
// import { CheckBlockExtension } from './extensions/CheckBlockExtension';
// import { DialogBlockExtension } from './extensions/DialogBlockExtension';
// import { EventBlockExtension } from './extensions/EventBlockExtension';

// 新原子块扩展
import { InvestigableNodeExtension } from './extensions/InvestigableNodeExtension';
import { KpInfoExtension } from './extensions/KpInfoExtension';
import { NpcMentionExtension } from './extensions/NpcMentionExtension';
```

2. **更新 extensions 数组**：
```typescript
extensions: [
  StarterKit,
  Placeholder.configure({ placeholder: '开始写作，输入 / 插入结构化块，输入 @ 插入 NPC 引用…' }),
  CharacterCount,
  InvestigableNodeExtension,
  KpInfoExtension,
  NpcMentionExtension,
],
```

3. **更新 `blockButtons` 数组**（替换旧块按钮）：
```typescript
const blockButtons = [
  { id: 'investigable_node', icon: '▼', label: '插入调查节点' },
  { id: 'kp_info',           icon: '☆', label: '插入KP信息' },
];
```

4. **更新 `allSlashItems` 数组**（替换旧块命令）：
```typescript
const allSlashItems: SlashItem[] = [
  { id: 'paragraph',          icon: '¶',  label: '段落',      action: () => editor.value?.chain().focus().setParagraph().run() },
  { id: 'h2',                 icon: 'H2', label: '标题 2',    action: () => editor.value?.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: 'h3',                 icon: 'H3', label: '标题 3',    action: () => editor.value?.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: 'bullet',             icon: '•',  label: '无序列表',  action: () => editor.value?.chain().focus().toggleBulletList().run() },
  { id: 'divider',            icon: '—',  label: '分割线',    action: () => editor.value?.chain().focus().setHorizontalRule().run() },
  { id: 'investigable_node',  icon: '▼',  label: '调查节点',  action: () => insertBlock('investigable_node') },
  { id: 'kp_info',            icon: '☆',  label: 'KP 信息',   action: () => insertBlock('kp_info') },
];
```

### 验收标准

- [ ] 输入 `/` 后菜单显示"调查节点"和"KP 信息"，不再显示场景块/NPC块/线索块
- [ ] 插入 `investigable_node`：左侧渲染品牌蓝色条，背景极浅蓝，标题可编辑
- [ ] 插入 `kp_info`：左侧渲染黄色色条，虚线边框，标题固定显示"☆ KP 信息"
- [ ] 在段落中输入 `◆` 后（P0-B 完成后改为 `@`），可创建 `npc_mention` 内联节点
- [ ] `investigable_node` 中，光标在首字符时按 Backspace 删除整个节点
- [ ] 编辑器正常保存（`onUpdate` emit 正确序列化包含新节点的 JSON）
- [ ] TypeScript 无类型报错

---

## P0-B：MentionExtension 联动实体库 API

### 前置条件

P0-A 完成，`npc_mention` 节点已注册。

### 任务描述

为 `npc_mention` 节点增加 `@` 触发的选择器，选择器通过实体库 API 实时搜索 NPC，选中后插入只含 `entityId + label` 的 `npc_mention` 节点。

### 实体库 API

以下 API 已在服务端就绪，需在 `packages/client/src/api/modules.ts` 中添加客户端封装：

```typescript
// 新增到 packages/client/src/api/modules.ts

export type EntityType = 'npc' | 'scene' | 'clue';

export interface EntityItem {
  id: string;           // entityId，插入 Mention 时使用
  name: string;         // 显示名，作为 label
  type: EntityType;
  description?: string;
}

// GET /api/modules/:moduleId/entities?type=npc&keyword=xxx
export function listModuleEntities(
  moduleId: string,
  params?: { type?: EntityType; keyword?: string }
): Promise<{ data: EntityItem[] }> {
  const qs = params
    ? '?' + new URLSearchParams(
        Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : '';
  return api.get(`/modules/${moduleId}/entities${qs}`);
}
```

### 新增 MentionSuggestion Plugin

新建文件 `packages/client/src/components/module-editor/extensions/MentionSuggestionPlugin.ts`：

```typescript
// 触发字符：@
// 逻辑：
//   1. 监听用户输入 @，弹出选择器浮层（Tippy.js 或 DOM 定位）
//   2. 用户继续输入时，debounce 300ms 请求 GET /api/modules/:moduleId/entities?keyword=xxx
//   3. 用户选中某条实体后，调用 editor.chain().insertContent({
//       type: 'npc_mention',
//       attrs: { id: entity.id, label: entity.name, type: entity.type }
//     }).run()
//   4. Esc 关闭选择器，@ 保留为普通文本
//   5. 触发规则：@ 后跟汉字前不触发（见设计文档 §E-1.6 约束）
```

**浮层组件**：新建 `blocks/MentionDropdown.vue`，参考现有 `ModuleEditorCore.vue` 中 `slash-menu` 的实现风格（绝对定位浮层、键盘导航、`mousedown.prevent` 防止失焦）。

### 修改 ModuleEditorCore.vue

1. `ModuleEditorCore.vue` 的 props 增加 `moduleId`：
```typescript
const props = defineProps<{
  modelValue?: string | null;
  moduleId: string;   // 新增，用于实体库 API
}>();
```

2. 将 `moduleId` 传入 `MentionSuggestionPlugin`。

3. 同步修改 `ModuleEditor.vue` 中对 `ModuleEditorCore` 的调用，传入 `moduleId`。

### 触发规则实现

```typescript
// 在 handleKeyup 或 Plugin 的 update 钩子中：
// @ 后面是汉字 → 不触发
// @ 后面是空格/行首/数字/英文 → 触发
const mentionMatch = textBefore.match(/@([^\s\u4e00-\u9fa5]*)$/);
```

### 验收标准

- [ ] 在段落中输入 `@`，立即弹出实体选择浮层
- [ ] 浮层默认显示最近使用的 NPC（不需真实排序，显示 API 返回的前 5 条即可）
- [ ] 继续输入汉字，debounce 后过滤列表
- [ ] 选中后，编辑器正文中渲染 `◆ 城见美苗` 的内联紫色标签
- [ ] 序列化后 JSON 中 `npc_mention.attrs` 只有 `id/label/type`，无完整属性
- [ ] `Esc` 关闭浮层，`@` 保留为普通文本
- [ ] `@` 后跟汉字时不触发（如输入 `@今天` 不弹窗）

---

## P0-C：KP/玩家双视图切换 Plugin

### 前置条件

P0-A 完成，`kp_info` 节点已注册。

### 任务描述

实现编辑器顶部的视图切换按钮，通过 ProseMirror ViewPlugin + Decoration 实现 `kp_info` 节点在玩家视角下折叠为细线占位符，**不修改文档内容**。

### 实现方案

新建文件 `packages/client/src/components/module-editor/extensions/ViewModePlugin.ts`：

```typescript
import { Plugin, PluginKey, Decoration, DecorationSet } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export type ViewMode = 'edit' | 'kp' | 'player';

const viewModeKey = new PluginKey<ViewMode>('viewMode');

export function createViewModePlugin(initialMode: ViewMode = 'edit') {
  return new Plugin({
    key: viewModeKey,

    state: {
      init: () => initialMode,
      apply: (tr, mode) => tr.getMeta(viewModeKey) ?? mode,
    },

    props: {
      decorations(state) {
        const mode = viewModeKey.getState(state);
        if (mode !== 'player') return DecorationSet.empty;

        const decorations: Decoration[] = [];

        state.doc.descendants((node, pos) => {
          if (node.type.name === 'kp_info') {
            // 用 widget decoration 替换整个节点的渲染区域
            // widget 插入在节点起始 pos+1，渲染折叠细线
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: 'kp-info--collapsed',
                // CSS：height: 4px; background: repeating-linear-gradient(...)
              })
            );
            return false; // 不递归进 kp_info 内部
          }
        });

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

// 切换视图模式的工具函数（在 ModuleEditorCore 中调用）
export function setViewMode(view: EditorView, mode: ViewMode) {
  view.dispatch(view.state.tr.setMeta(viewModeKey, mode));
}
```

CSS（在 `ModuleEditorCore.vue` 的 `<style>` 中添加）：
```css
/* 玩家视角下 kp_info 折叠为细线 */
.kp-info--collapsed {
  height: 4px !important;
  overflow: hidden;
  background: repeating-linear-gradient(
    90deg,
    #F5A623 0px, #F5A623 6px,
    transparent 6px, transparent 12px
  );
  border-radius: 2px;
  cursor: pointer;
  margin: 4px 0;
  opacity: 0.6;
}
.kp-info--collapsed * {
  display: none !important;
}
```

### 修改 ModuleEditorCore.vue

1. **注册 Plugin**：
```typescript
// 在 useEditor 的 extensions 数组中通过 RawCommand 注入，
// 或使用 TipTap 的 Extension.create 包装 ViewModePlugin
import { Extension } from '@tiptap/core';
import { createViewModePlugin, setViewMode, type ViewMode } from './extensions/ViewModePlugin';

const ViewModeExtension = Extension.create({
  name: 'viewMode',
  addProseMirrorPlugins() {
    return [createViewModePlugin('edit')];
  },
});
```

2. **顶部增加视图切换按钮**（在工具栏区域）：
```typescript
const currentViewMode = ref<ViewMode>('edit');

function switchViewMode(mode: ViewMode) {
  if (!editor.value) return;
  currentViewMode.value = mode;
  setViewMode(editor.value.view, mode);
}
```

模板中工具栏增加（位于工具栏最右侧，在字数统计之前）：
```html
<span class="toolbar-sep" />
<div class="view-mode-group">
  <button
    v-for="mode in ([['edit','编辑'],['kp','KP视角'],['player','玩家视角']] as const)"
    :key="mode[0]"
    class="toolbar-btn"
    :class="{ active: currentViewMode === mode[0] }"
    @click="switchViewMode(mode[0])"
  >{{ mode[1] }}</button>
</div>
```

### 验收标准

- [ ] 工具栏右侧显示"编辑 / KP视角 / 玩家视角"三个切换按钮
- [ ] 切换到"玩家视角"：所有 `kp_info` 节点折叠为黄色虚线细线
- [ ] 切换回"编辑"或"KP视角"：`kp_info` 节点恢复正常渲染
- [ ] 切换视图不触发 `onUpdate`（不产生保存脏状态）
- [ ] 切换视图时光标不跳变，选区保持稳定
- [ ] 折叠的细线点击后切换回编辑模式（可选增强，P1 实现）

---

## P1-A：大纲面板升级（时间轴 + 空间树双视图）

### 前置条件

P0-A 完成，新节点类型已注册。

### 任务描述

升级 `ModuleEditor.vue` 的大纲面板，支持"时间轴"和"空间树"两种组织视图切换，并更新 `outline-extractor.ts` 识别新节点类型。

### 第一步：更新 outline-extractor.ts

修改 `packages/client/src/utils/outline-extractor.ts`：

1. 在 `BUSINESS_BLOCK_TYPES` 中增加新节点类型，移除旧块类型：
```typescript
// 新增节点类型映射
const NEW_NODE_LABEL_ATTR: Record<string, string> = {
  investigable_node: 'label',   // attrs.label 存标题
  kp_info:           '',        // 无 label attr，固定显示"☆ KP 信息"
};

// 更新 ModuleOutlineItem 的 type 枚举（如果在 @trpg/shared 中定义，需同步更新）
// 临时方案：type 用 string 兼容新旧
```

2. 更新 `walkNodes` 函数，增加对新节点的识别：
```typescript
} else if (node.type === 'investigable_node') {
  items.push({
    id: node.attrs?.id || `inv-${items.length}`,
    type: 'investigable' as any,
    label: node.attrs?.label || '未命名调查节点',
    level: depth,    // 支持嵌套深度（新增 depth 参数）
  });
  // 继续递归子内容
  if (Array.isArray(node.content)) walkNodes(node.content, items, depth + 1);
  continue;
} else if (node.type === 'kp_info') {
  items.push({
    id: node.attrs?.id || `kp-${items.length}`,
    type: 'kp_info' as any,
    label: '☆ KP 信息',
    level: depth,
  });
}
```

### 第二步：升级 ModuleEditor.vue 大纲面板

在 `<aside class="outline-panel">` 区域：

1. **顶部增加视图切换 Tab**：
```html
<div class="outline-header">
  <span class="outline-title">大纲</span>
  <div class="outline-view-tabs">
    <button
      v-for="tab in outlineViewTabs"
      :key="tab.id"
      class="outline-tab"
      :class="{ 'outline-tab--active': outlineView === tab.id }"
      @click="outlineView = tab.id"
    >{{ tab.label }}</button>
  </div>
</div>
```

```typescript
type OutlineView = 'timeline' | 'spatial';

const outlineView = ref<OutlineView>('timeline');
const outlineViewTabs = [
  { id: 'timeline' as const, label: '时间轴' },
  { id: 'spatial'  as const, label: '空间树' },
];
```

2. **时间轴视图**：在 `outlineView === 'timeline'` 时，按 H2 分组，每个 H2 标题下列出其子场景/调查节点（当前 `extractOutline` 返回的平铺列表，通过 level 字段重新嵌套）。

3. **空间树视图**：在 `outlineView === 'spatial'` 时，将 `investigable_node` 节点按嵌套层级缩进渲染，展示层级关系（最多 5 层）。

4. **完成度指示条**：在每个场景节点（H2/H3）右侧渲染状态条：
```html
<span class="outline-progress" :class="item.hasContent ? 'outline-progress--done' : 'outline-progress--empty'" />
```
`hasContent` 的判断逻辑：该 H2 下方是否有至少一个 `investigable_node` 子节点。

5. **更新 `outlineItemIcon`**：
```typescript
function outlineItemIcon(type: string) {
  return {
    heading:       'icon-list',
    investigable:  'icon-scene',  // 蓝色圆点（暂用现有 icon）
    kp_info:       'icon-dice',   // 黄色锁（暂用现有 icon）
    // 旧块类型保留映射（兼容旧文档格式）
    scene:   'icon-scene',
    npc:     'icon-npc',
    clue:    'icon-clue',
  }[type] ?? 'icon-list';
}
```

### 验收标准

- [ ] 大纲面板顶部显示"时间轴 / 空间树"两个 Tab 按钮
- [ ] 时间轴视图：按 H2 标题分组展示子节点
- [ ] 空间树视图：按 `investigable_node` 的嵌套深度缩进显示
- [ ] 新增的 `investigable_node` 和 `kp_info` 节点出现在大纲中
- [ ] 点击大纲条目：编辑器平滑滚动到对应位置
- [ ] 完成度指示条：有内容的场景显示绿色，空场景显示灰色

---

## P1-B：浮动面板系统（右侧面板可拖出）

### 前置条件

P0-A、P0-C 完成。该任务为纯 UI 任务，不依赖 ProseMirror 状态。

### 任务描述

将 `ModuleEditor.vue` 右侧现有的 AI 校对面板改造为通用浮动面板系统。面板可以从右侧边栏拖出成为独立的悬浮窗口，支持拖拽移动、吸附屏幕边缘、最小化。

### 新建文件

`packages/client/src/components/module-editor/FloatingPanel.vue`

这是一个通用面板包装器，接受 slot 内容：

```typescript
// Props
interface Props {
  title: string;
  docked: boolean;          // true = 停靠在右侧边栏；false = 浮动窗
  initialX?: number;        // 浮动时初始位置
  initialY?: number;
  width?: number;           // 默认 280px
}

// Emits
interface Emits {
  (e: 'undock'): void;      // 从边栏拖出
  (e: 'dock'): void;        // 收回边栏
  (e: 'close'): void;       // 关闭面板
}
```

视觉和交互规范（参考附录 E-1 §E-1.3.3）：

1. **拖拽手柄**：标题栏左侧的 `⠿` 图标，hover 时变为 `grab` 光标。
2. **拖出动画**：`mousedown` 时卡片缩小至 80%，透明度 60%；超出右侧面板边界 20px 时触发 undock，留下虚影。
3. **吸附行为**：靠近屏幕边缘 40px 内自动吸附。
4. **弹性动画**：释放时 `transform: scale(0.95 → 1.0)`，200ms ease-out。
5. **最小化**：标题栏 `[_]` 按钮，面板缩至屏幕边缘 40px 宽的垂直标签条。

### 修改 ModuleEditor.vue

将右侧 `.props-panel`（AI 校对面板）包裹在 `<FloatingPanel>` 中：
```html
<FloatingPanel
  title="AI 校对"
  :docked="aiPanelDocked"
  @undock="aiPanelDocked = false"
  @dock="aiPanelDocked = true"
  @close="aiPanelVisible = false"
>
  <!-- 现有 AI 校对面板内容 -->
</FloatingPanel>
```

### 验收标准

- [ ] 右侧 AI 校对面板标题栏显示拖拽手柄 `⠿`
- [ ] 按住手柄拖拽超出右侧边界，面板变为独立浮动窗
- [ ] 浮动窗可在屏幕任意位置拖拽移动
- [ ] 靠近屏幕边缘 40px 自动吸附
- [ ] 点击 `[_]` 按钮：面板收缩为屏幕边缘的垂直标签条（宽 40px）
- [ ] 点击标签条还原为浮动窗
- [ ] 浮动窗与右侧边栏同时存在时，互不遮挡编辑区

---

## 附：旧文件清理（在新方案验证通过后执行）

### 需要删除的文件

当 P0-A、P0-B、P0-C 均通过验收，且没有发现新旧块的遗漏依赖后，物理删除：

```
packages/client/src/components/module-editor/extensions/
  SceneBlockExtension.ts      ← 删除
  NpcBlockExtension.ts        ← 删除
  ClueBlockExtension.ts       ← 删除
  CheckBlockExtension.ts      ← 删除（check_block → rule_ref 节点，P2 再补）
  EventBlockExtension.ts      ← 删除（event_block → 普通 H3 标题替代）
  DialogBlockExtension.ts     ← 删除（dialog_block → 普通段落替代）

packages/client/src/components/module-editor/blocks/
  SceneBlockView.vue          ← 删除
  NpcBlockView.vue            ← 删除
  ClueBlockView.vue           ← 删除
  CheckBlockView.vue          ← 删除
  EventBlockView.vue          ← 删除
  DialogBlockView.vue         ← 删除
```

### 同步更新 outline-extractor.ts

删除 `BLOCK_NAME_KEY` 中旧块条目，保留新节点条目。

### 同步更新 ModuleOutlineItem 类型

如果 `@trpg/shared` 中的 `ModuleOutlineItem['type']` 枚举包含旧块类型，更新为新类型。

---

## 快速索引

| 阶段 | 主要文件 | 关键技术点 |
|------|---------|-----------|
| P0-A | `extensions/InvestigableNodeExtension.ts`<br>`extensions/KpInfoExtension.ts`<br>`extensions/NpcMentionExtension.ts`<br>`ModuleEditorCore.vue` | TipTap Node.create, VueNodeViewRenderer, addKeyboardShortcuts |
| P0-B | `extensions/MentionSuggestionPlugin.ts`<br>`blocks/MentionDropdown.vue`<br>`api/modules.ts` | ProseMirror Plugin, debounce, HTTP GET /entities |
| P0-C | `extensions/ViewModePlugin.ts`<br>`ModuleEditorCore.vue` | ProseMirror ViewPlugin, Decoration.node, PluginKey |
| P1-A | `utils/outline-extractor.ts`<br>`views/creator/ModuleEditor.vue` | 纯函数重构, Vue 条件渲染 |
| P1-B | `components/module-editor/FloatingPanel.vue`<br>`views/creator/ModuleEditor.vue` | CSS transform, mousedown drag, 边缘吸附计算 |
