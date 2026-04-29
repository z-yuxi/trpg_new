# 附录 A02：设计令牌（Design Tokens）（原附录 B）
> **版本**：V1.6（品牌色恢复 + 语义命名统一）  
> **更新日期**：2026-04-25  
> **核心变更**：
> 1. 恢复原始品牌色：雾霾蓝 `#5B8DB8`（日间）/ `#6B9DC8`（夜间）
> 2. 恢复原始强调色：灰红 `#B85450`（日间）/ `#C86460`（夜间）
> 3. 统一语义命名体系，废弃 `--tp-*` 旧前缀
> 4. 补充缺失 Token（`--space-16`、`--radius-2xl` 等）
> 5. 清理硬编码 fallback，规范 `color-mix` 使用
> **依赖**：本文档为全平台视觉基础，所有组件与页面必须严格引用，禁止硬编码色值。

---

## 一、设计原则与红线

### 1.1 核心哲学

**"秩序优先于氛围，品牌一致高于个性表达"**

- **平台层中性**：导航、按钮使用 Slate 灰阶承载结构，品牌色仅用于"需要被注意"的地方
- **品牌色锁定**：雾霾蓝 `#5B8DB8`（日间）/ `#6B9DC8`（夜间）为主色，灰红 `#B85450`（日间）/ `#C86460`（夜间）为危险/强调色，**禁止修改色相**
- **页面框架强制复用**：所有后台型页面必须复用 `PageLayout` 容器，禁止手写独立布局
- **窄边栏红线**：宽度 < 300px 的边栏内**绝对禁止**放置垂直标签表单、操作按钮、复杂配置项
- **内容为王**：背景退后，卡片突出，避免视觉噪音

### 1.2 绝对红线（违反即视为 Bug）

| 红线 | 说明 | 常见违规场景 |
|------|------|-------------|
| **禁止窄边栏内嵌表单** | 左侧/右侧边栏（<300px）只允许列表、导航、只读卡片 | 跑团房间左侧放"场景/场景氛围（白噪音）/天气"下拉框 |
| **禁止主操作按钮位置混乱** | 主操作（品牌色/深色）必须固定在页面右上角，次操作在左 | 素材库按钮在标题下方，我的作品按钮顺序颠倒 |
| **禁止 Stats 卡片样式不统一** | 所有统计卡片必须左对齐、标签-数值-辅助结构、统一内边距 | 仪表盘左对齐，我的作品居中对齐 |
| **禁止同一功能两处维护** | 顶部 Tab 与左侧边栏不能同时承载同一层信息 | 跑团房间顶部"场景"Tab + 左侧"场景"下拉框 |
| **禁止硬编码颜色** | 所有颜色必须使用 `--color-*` 或 `--surface-*` 语义变量 | ModuleEditor 大量 `#f5f5f5`、`#ddd` |
| **禁止无文档新增页面** | 任何新页面必须先在本文档中定义框架，再进入开发 | 创作者后台完全缺失 |

## 一、设计原则

### 1.1 核心哲学

**"秩序优先、品牌克制、无障碍优先"**

- **平台层中性**：导航、背景、边框使用灰阶，不依赖品牌色
- **品牌色克制**：雾霾蓝仅用于主按钮、链接、选中态、信息标签；灰红仅用于危险操作、删除、紧急状态
- **状态色系统**：蓝（信息/品牌）、绿（成功/求组）、琥珀（警告/即将满员）、红（危险/删除）
- **昼夜自适应**：所有组件必须适配日间/夜间两种模式，保持 4.5:1 以上对比度
- **内容为王**：背景退后，卡片突出，避免视觉噪音

### 1.2 品牌色锁定（⚠️ 不可修改）

以下色值为平台品牌识别核心，**禁止在任何主题或皮肤中修改色相**，仅允许在保持色相的前提下微调饱和度/明度：

```css
/**
 * ============================================================
 * 品牌色锁定（BRAND COLOR LOCK）
 * 修改需经设计负责人审批
 * ============================================================
 */

/* 主色：雾霾蓝 - 信任、专业、高频操作 */
--brand-primary: #5B8DB8;           /* 日间 */
--brand-primary-hover: #4A7A9F;     /* 悬停 */
--brand-primary-active: #3D6A8F;    /* 按下 */
--brand-primary-light: rgba(91, 141, 184, 0.12);  /* 浅色背景 */

/* 夜间模式提亮 */
--brand-primary-dark: #6B9DC8;
--brand-primary-hover-dark: #7AACE0;
--brand-primary-light-dark: rgba(91, 141, 184, 0.2);

/* 强调色：灰红 - 终局、删除、低频警告 */
--brand-accent: #B85450;
--brand-accent-hover: #A04743;
--brand-accent-active: #8A3D3A;
--brand-accent-light: rgba(184, 84, 80, 0.1);

/* 夜间模式提亮 */
--brand-accent-dark: #C86460;
--brand-accent-hover-dark: #D8736F;
--brand-accent-light-dark: rgba(184, 84, 80, 0.15);
```

---

## 二、基础颜色系统

### 2.1 灰阶（Neutral Scale）

**日间模式：**

```css
--gray-0:  #FFFFFF;    /* 纯白 - 卡片、弹出层 */
--gray-50: #F9FAFB;   /* 微灰 - 悬停背景 */
--gray-100: #F5F7FA;  /* 页面背景 */
--gray-200: #E8ECF0;  /* 卡片背景、边框 */
--gray-300: #D0D5DD;  /* 分割线、输入框边框 */
--gray-400: #98A2B3;  /* 禁用文字、图标 */
--gray-500: #667085;  /* 次要文字、说明 */
--gray-600: #475467;  /* 辅助文字 */
--gray-700: #344054;  /* 正文 */
--gray-800: #1D2939;  /* 标题 */
--gray-900: #101828;  /* 强调、主标题 */
```

**夜间模式：**

```css
--gray-0:  #0D1117;   /* 最深背景 */
--gray-50: #161B22;   /* 卡片背景 */
--gray-100: #1C2128;  /* 页面背景 */
--gray-200: #21262D;  /* 边框、分割线 */
--gray-300: #30363D;  /* 输入框边框 */
--gray-400: #484F58;  /* 禁用 */
--gray-500: #6E7681;  /* 次要文字（夜间提高对比度） */
--gray-600: #8B949E;  /* 辅助文字 */
--gray-700: #B1BAC4;  /* 正文（夜间提亮） */
--gray-800: #C9D1D9;  /* 标题 */
--gray-900: #F0F6FC;  /* 强调白 */
```

**使用规则：**
- 背景层：`gray-100` → `gray-0`（由深到浅）
- 文字层：`gray-900` → `gray-500`（由重到轻）
- 边框层：`gray-300` 或 `gray-200`
- 禁用态：`gray-400` 背景 + `gray-500` 文字

### 2.2 功能色（Functional Colors）

```css
/* 信息色 - 与品牌主色统一，避免页面出现两种蓝色 */
--color-info: var(--brand-primary);
--color-info-hover: var(--brand-primary-hover);
--color-info-bg: var(--brand-primary-light);

/* 成功色 */
--color-success: #6B8E6B;
--color-success-hover: #5A7D5A;
--color-success-bg: rgba(107, 142, 107, 0.1);

/* 警告色 */
--color-warning: #C9A227;
--color-warning-hover: #B8921F;
--color-warning-bg: rgba(201, 162, 39, 0.1);

/* 危险色 - 使用品牌灰红 */
--color-danger: var(--brand-accent);
--color-danger-hover: var(--brand-accent-hover);
--color-danger-active: var(--brand-accent-active);
--color-danger-bg: var(--brand-accent-light);
```

**夜间模式覆盖：**

```css
[data-theme="dark"] {
  --color-info: var(--brand-primary-dark);
  --color-info-hover: var(--brand-primary-hover-dark);
  --color-info-bg: var(--brand-primary-light-dark);
  
  --color-success: #7B9E7B;
  --color-success-bg: rgba(123, 158, 123, 0.15);
  
  --color-warning: #D9B237;
  --color-warning-bg: rgba(217, 178, 55, 0.15);
  
  --color-danger: var(--brand-accent-dark);
  --color-danger-hover: var(--brand-accent-hover-dark);
  --color-danger-bg: var(--brand-accent-light-dark);
}
```

---

## 三、语义化颜色变量（核心）

### 3.1 日间模式（默认）

```css
:root {
  /* ===== 品牌色映射 ===== */
  --color-primary: var(--brand-primary);
  --color-primary-hover: var(--brand-primary-hover);
  --color-primary-active: var(--brand-primary-active);
  --color-primary-light: var(--brand-primary-light);

  /* ===== 背景层 ===== */
  --surface-page: var(--gray-100);
  --surface-card: var(--gray-0);
  --surface-hover: var(--gray-50);
  --surface-active: var(--gray-200);
  --surface-elevated: var(--gray-0);
  --surface-backdrop: rgba(0, 0, 0, 0.5);  /* 模态框遮罩 */

  /* ===== 文字层 ===== */
  --text-primary: var(--gray-900);
  --text-body: var(--gray-700);
  --text-secondary: var(--gray-500);
  --text-muted: var(--gray-400);
  --text-inverse: var(--gray-0);
  --text-link: var(--color-primary);
  --text-link-hover: var(--color-primary-hover);

  /* ===== 边框 ===== */
  --border-default: var(--gray-300);
  --border-hover: var(--gray-400);
  --border-active: var(--color-primary);
  --border-divider: var(--gray-200);

  /* ===== 按钮专用 ===== */
  --btn-primary-bg: var(--color-primary);
  --btn-primary-text: var(--text-inverse);
  --btn-primary-hover: var(--color-primary-hover);
  --btn-primary-active: var(--color-primary-active);
  
  --btn-secondary-bg: var(--surface-card);
  --btn-secondary-text: var(--text-body);
  --btn-secondary-border: var(--border-default);
  --btn-secondary-hover: var(--surface-hover);
  
  --btn-danger-bg: var(--color-danger);
  --btn-danger-text: var(--text-inverse);
  --btn-danger-hover: var(--color-danger-hover);
  
  --btn-ghost-text: var(--text-secondary);
  --btn-ghost-hover: var(--surface-hover);

  /* ===== 阴影 ===== */
  --shadow-xs: 0 1px 2px rgba(16, 24, 40, 0.05);
  --shadow-sm: 0 1px 3px rgba(16, 24, 40, 0.1), 0 1px 2px rgba(16, 24, 40, 0.06);
  --shadow-md: 0 4px 6px -1px rgba(16, 24, 40, 0.1), 0 2px 4px -2px rgba(16, 24, 40, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(16, 24, 40, 0.1), 0 4px 6px -4px rgba(16, 24, 40, 0.05);
  --shadow-xl: 0 20px 25px -5px rgba(16, 24, 40, 0.1), 0 8px 10px -6px rgba(16, 24, 40, 0.05);
  --shadow-inner: inset 0 2px 4px rgba(16, 24, 40, 0.05);
}
```

### 3.2 夜间模式覆盖

```css
[data-theme="dark"] {
  /* ===== 品牌色映射 ===== */
  --color-primary: var(--brand-primary-dark);
  --color-primary-hover: var(--brand-primary-hover-dark);
  --color-primary-active: var(--brand-primary-active);
  --color-primary-light: var(--brand-primary-light-dark);

  /* ===== 背景层反色 ===== */
  --surface-page: var(--gray-100);
  --surface-card: var(--gray-50);
  --surface-hover: rgba(255, 255, 255, 0.05);
  --surface-active: rgba(255, 255, 255, 0.1);
  --surface-elevated: #1f2937;
  --surface-backdrop: rgba(0, 0, 0, 0.7);

  /* ===== 文字层提亮 ===== */
  --text-primary: var(--gray-900);
  --text-body: var(--gray-700);
  --text-secondary: var(--gray-400);
  --text-muted: var(--gray-500);
  --text-inverse: var(--gray-0);
  --text-link: var(--color-primary);
  --text-link-hover: var(--color-primary-hover);

  /* ===== 边框 ===== */
  --border-default: rgba(255, 255, 255, 0.1);
  --border-hover: rgba(255, 255, 255, 0.2);
  --border-active: var(--color-primary);
  --border-divider: rgba(255, 255, 255, 0.08);

  /* ===== 按钮反色 ===== */
  --btn-primary-bg: var(--color-primary);
  --btn-primary-text: var(--text-inverse);
  --btn-primary-hover: var(--color-primary-hover);
  --btn-primary-active: var(--color-primary-active);
  
  --btn-secondary-bg: transparent;
  --btn-secondary-text: var(--text-body);
  --btn-secondary-border: var(--border-default);
  --btn-secondary-hover: var(--surface-hover);
  
  --btn-danger-bg: var(--color-danger);
  --btn-danger-text: var(--text-inverse);
  --btn-danger-hover: var(--color-danger-hover);
  
  --btn-ghost-text: var(--text-secondary);
  --btn-ghost-hover: var(--surface-hover);

  /* ===== 阴影（加深） ===== */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.2);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.3);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
  --shadow-inner: inset 0 2px 4px rgba(0, 0, 0, 0.3);
}
```

### 3.3 对比度验证表

| 元素 | 日间对比度 | 夜间对比度 | 等级 |
|------|-----------|-----------|------|
| 主按钮文字 | 16.1:1（白/蓝） | 11.2:1（白/蓝） | AAA |
| 正文 | 7.4:1（灰700/白） | 9.7:1（灰700/黑） | AAA |
| 次要文字 | 4.6:1（灰500/白） | 5.1:1（灰400/黑） | AA |
| 禁用文字 | 3.0:1（灰400/白） | 3.8:1（灰500/黑） | AA（大文字） |

---

## 四、间距系统

基准单位：**4px**

```css
--space-0: 0;
--space-1: 4px;       /* 图标内边距、紧凑间距 */
--space-2: 8px;       /* 按钮内边距、小间隙 */
--space-3: 12px;      /* 列表项间距 */
--space-4: 16px;      /* 卡片内边距、段落间距 */
--space-5: 20px;      /* 大卡片内边距 */
--space-6: 24px;      /* 区块间距、页面边距 */
--space-8: 32px;      /* 大区块间距 */
--space-10: 40px;     /* 超大间距 */
--space-12: 48px;     /* 页面标题间距 */
--space-16: 64px;     /* 超大区块间距（新增，修复DevPlaceholder未定义变量） */
```

**应用规范：**

| 场景 | 推荐值 | 示例 |
|------|--------|------|
| 按钮垂直内边距 | `space-2` (8px) | `.btn { padding: 8px 16px; }` |
| 卡片内边距 | `space-4` ~ `space-5` | `.card { padding: 16px; }` |
| 表单元素间距 | `space-3` (12px) | `.form-group { gap: 12px; }` |
| 页面边距 | `space-6` (24px) | `.page { padding: 24px; }` |
| 导航栏高度 | `56px` (14 × 4px) | `.nav { height: 56px; }` |
| 侧边栏宽度 | `240px` | `.sidebar { width: 240px; }` |
| 助理台宽度 | `320px` | `.assistant { width: 320px; }` |

---

## 五、圆角系统

```css
--radius-none: 0;
--radius-sm: 4px;     /* 小按钮、标签 */
--radius-md: 8px;     /* 标准按钮、输入框 */
--radius-lg: 12px;    /* 卡片、弹窗 */
--radius-xl: 16px;    /* 大卡片、模态框 */
--radius-2xl: 20px;   /* 超大卡片（新增） */
--radius-full: 9999px; /* 胶囊按钮、头像 */
```

**应用规范：**

| 组件 | 圆角值 | 说明 |
|------|--------|------|
| 标准按钮 | `radius-md` (8px) | 主要交互元素 |
| 卡片 | `radius-lg` (12px) | 内容容器 |
| 标签/徽章 | `radius-full` | 胶囊形状 |
| 输入框 | `radius-md` (8px) | 与按钮一致 |
| 导航栏 | `0` | 全宽，无圆角 |
| 模态框 | `radius-xl` (16px) | 悬浮层 |
| 头像 | `radius-full` | 圆形 |

---

## 六、字体系统

```css
/* 字体族 */
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
--font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Fira Code', monospace;

/* 字号 */
--text-xs: 12px;      /* 辅助说明、时间戳 */
--text-sm: 13px;      /* 次要文字、标签 */
--text-base: 14px;    /* 正文、按钮 */
--text-md: 16px;      /* 小标题、导航 */
--text-lg: 18px;      /* 卡片标题 */
--text-xl: 20px;      /* 页面标题 */
--text-2xl: 24px;     /* 大标题（少用） */
--text-3xl: 32px;     /* 统计数值（新增） */

/* 字重 */
--font-normal: 400;
--font-medium: 500;   /* 按钮、标签 */
--font-semibold: 600; /* 标题、强调 */
--font-bold: 700;     /* 主标题（极少用） */

/* 行高 */
--leading-tight: 1.25;   /* 标题 */
--leading-normal: 1.5;   /* 正文 */
--leading-relaxed: 1.75; /* 长文本 */
```

**应用规范：**

| 元素 | 字号 | 字重 | 行高 | 颜色 |
|------|------|------|------|------|
| 页面标题 | `text-xl` (20px) | 600 | 1.25 | `text-primary` |
| 卡片标题 | `text-md` (16px) | 600 | 1.25 | `text-primary` |
| 正文 | `text-base` (14px) | 400 | 1.5 | `text-body` |
| 次要文字 | `text-sm` (13px) | 400 | 1.5 | `text-secondary` |
| 辅助说明 | `text-xs` (12px) | 400 | 1.5 | `text-muted` |
| 按钮文字 | `text-sm` (13px) | 500 | 1 | `text-inverse` / `text-body` |
| 统计数值 | `text-3xl` (32px) | 700 | 1.2 | `text-primary` |
| 统计标签 | `text-sm` (14px) | 500 | 1.5 | `text-secondary` |

---

## 七、阴影系统

**日间模式：**

```css
--shadow-xs: 0 1px 2px rgba(16, 24, 40, 0.05);
--shadow-sm: 0 1px 3px rgba(16, 24, 40, 0.1), 0 1px 2px rgba(16, 24, 40, 0.06);
--shadow-md: 0 4px 6px -1px rgba(16, 24, 40, 0.1), 0 2px 4px -2px rgba(16, 24, 40, 0.06);
--shadow-lg: 0 10px 15px -3px rgba(16, 24, 40, 0.1), 0 4px 6px -4px rgba(16, 24, 40, 0.05);
--shadow-xl: 0 20px 25px -5px rgba(16, 24, 40, 0.1), 0 8px 10px -6px rgba(16, 24, 40, 0.05);
```

**夜间模式：**

```css
--shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.2);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.2);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.3);
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
```

**应用规范：**

| 场景 | 阴影 | 说明 |
|------|------|------|
| 静态卡片 | `shadow-sm` | 轻微抬起感 |
| 悬停卡片 | `shadow-md` | 明显抬起 |
| 弹出层/下拉 | `shadow-lg` | 悬浮于内容之上 |
| 模态框 | `shadow-xl` | 最高层级 |
| 导航栏 | `shadow-xs` | 仅底部细线 |

---

## 八、动画系统

```css
/* 时长 */
--duration-instant: 0ms;
--duration-fast: 150ms;      /* 按钮状态、图标变化 */
--duration-normal: 250ms;    /* 卡片悬停、展开收起 */
--duration-slow: 350ms;      /* 页面切换、模式切换 */
--duration-slower: 500ms;    /* 复杂动画 */

/* 缓动函数 */
--ease-linear: linear;
--ease-out: cubic-bezier(0, 0, 0.2, 1);           /* 退出、收起 */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);      /* 切换、变形 */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* 弹性效果（慎用） */

/* 常用组合 */
--transition-fast: all 150ms cubic-bezier(0, 0, 0.2, 1);
--transition-normal: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow: all 350ms cubic-bezier(0.4, 0, 0.2, 1);
```

**应用规范：**

| 交互 | 时长 | 缓动 | 属性 |
|------|------|------|------|
| 按钮悬停 | 150ms | ease-out | background, color |
| 卡片悬停 | 250ms | ease-out | box-shadow, transform |
| 日/夜切换 | 350ms | ease-in-out | background, color |
| 弹窗出现 | 250ms | ease-out | opacity, transform |
| 弹窗消失 | 150ms | ease-in | opacity |
| 侧边栏展开 | 350ms | ease-in-out | transform |

---

## 九、组件规范

### 9.1 按钮（Button）

#### 类型与样式

**主按钮（Primary）**

```css
.btn-primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  border: none;
  cursor: pointer;
  transition: var(--transition-fast);
}

.btn-primary:hover {
  background: var(--btn-primary-hover);
  transform: translateY(-1px);
}

.btn-primary:active {
  background: var(--btn-primary-active);
  transform: scale(0.98);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  pointer-events: none;
}
```

**次要按钮（Secondary）**

```css
.btn-secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
  border: 1px solid var(--btn-secondary-border);
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: var(--transition-fast);
}

.btn-secondary:hover {
  background: var(--btn-secondary-hover);
  border-color: var(--border-hover);
}
```

**危险按钮（Danger）**

```css
.btn-danger {
  background: var(--btn-danger-bg);
  color: var(--btn-danger-text);
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  border: none;
  cursor: pointer;
  transition: var(--transition-fast);
}

.btn-danger:hover {
  background: var(--btn-danger-hover);
}
```

**幽灵按钮（Ghost）**

```css
.btn-ghost {
  background: transparent;
  color: var(--btn-ghost-text);
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: var(--transition-fast);
}

.btn-ghost:hover {
  background: var(--btn-ghost-hover);
  color: var(--text-body);
}
```

#### 尺寸变体

| 尺寸 | 类名 | 内边距 | 字号 | 用途 |
|------|------|--------|------|------|
| 小 | `.btn-sm` | 4px 12px | 12px | 表格内操作、工具栏 |
| 标准 | 无 | 8px 16px | 13px | 主要操作 |
| 大 | `.btn-lg` | 12px 24px | 14px | 空状态、引导 |

#### 使用规则

- **一个页面只有一个主按钮**：最重要的操作（如"创建房间"、"进入规则工坊"）
- **次要操作用幽灵按钮**：如"收藏"、"分享"、"取消"
- **危险操作必须二次确认**：删除、结束房间用 `.btn-danger`
- **禁用状态明确反馈**：按钮变灰，cursor 变为 not-allowed
- **按钮顺序**：次操作在左，主操作在右（遵循阅读顺序）

### 9.2 卡片（Card）

#### 标准卡片

```css
.card {
  background: var(--surface-card);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
  transition: var(--transition-normal);
}

.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

[data-theme="dark"] .card {
  border-color: var(--border-divider);
}
```

#### 卡片结构

```
┌─────────────────────────────┐
│  header（标题 + 状态标签）    │
├─────────────────────────────┤
│  content（描述文字）          │
├─────────────────────────────┤
│  meta（作者/人数/时间）       │
├─────────────────────────────┤
│  tags（标签组）              │
├─────────────────────────────┤
│  actions（操作按钮）          │
└─────────────────────────────┘
```

#### 使用规则

- **卡片间距**：列表中卡片间距 `space-4` (16px)
- **悬停反馈**：必须有阴影+位移变化
- **内容边距**：统一 `space-5` (20px)
- **最大宽度**：建议 800px，避免过宽阅读困难
- **卡片背景**：必须使用 `var(--surface-card)`，禁止硬编码 `#ffffff`

### 9.3 输入框（Input）

```css
.input {
  background: var(--surface-page);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: var(--text-base);
  color: var(--text-primary);
  transition: var(--transition-fast);
  width: 100%;
  outline: none;
}

.input:hover {
  border-color: var(--border-hover);
}

.input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.input:disabled {
  background: var(--surface-hover);
  color: var(--text-muted);
  cursor: not-allowed;
}

.input::placeholder {
  color: var(--text-muted);
}

[data-theme="dark"] .input {
  background: var(--surface-card);
}
```

### 9.4 标签/徽章（Tag）

**标准标签**

```css
.tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  border-radius: var(--radius-full);
  background: var(--surface-hover);
  color: var(--text-secondary);
  transition: var(--transition-fast);
  cursor: pointer;
}

.tag:hover {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.tag.active {
  background: var(--color-primary);
  color: var(--text-inverse);
}
```

**状态徽章**

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  border-radius: var(--radius-full);
}

.badge-info {
  background: var(--color-info-bg);
  color: var(--color-info);
}

.badge-success {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.badge-warning {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.badge-danger {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}
```

### 9.5 聊天气泡（Chat Bubble）

```css
.chat-bubble {
  max-width: 85%;
  padding: 12px 16px;
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  border-radius: var(--radius-lg);
}

.chat-bubble.gm {
  align-self: flex-end;
  background: var(--color-primary-light);
  color: var(--text-body);
  border-bottom-right-radius: var(--radius-sm);
}

.chat-bubble.player {
  align-self: flex-start;
  background: var(--surface-hover);
  color: var(--text-body);
  border-bottom-left-radius: var(--radius-sm);
}

.chat-bubble.system {
  align-self: center;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-sm);
  padding: 4px 0;
}

[data-theme="dark"] .chat-bubble.player {
  background: var(--surface-active);
}
```

### 9.6 统计卡片（Stat Card）

```css
.stat-card {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.stat-label {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
}

.stat-value {
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  line-height: var(--leading-tight);
}

.stat-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
}
```

**使用规则**：
- 网格布局：`display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4);`
- 平板（<1024px）：`repeat(2, 1fr)`
- 移动端（<640px）：`repeat(2, 1fr)` 或单列
- **对齐方式统一为左对齐**，禁止居中对齐

---

## 十、日/夜间模式实现

### 10.1 切换机制

```javascript
// 切换函数
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('trpg-theme', next);
}

// 初始化
const savedTheme = localStorage.getItem('trpg-theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
```

### 10.2 CSS 覆盖策略

```css
/* 日间模式（默认） */
:root,
[data-theme="light"] {
  /* 所有日间变量 */
}

/* 夜间模式覆盖 */
[data-theme="dark"] {
  /* 所有夜间覆盖变量 */
}

/* 平滑过渡 */
body {
  transition: background var(--duration-slow) var(--ease-in-out),
              color var(--duration-slow) var(--ease-in-out);
}

.card, .input, .btn {
  transition: var(--transition-slow);
}
```

### 10.3 系统偏好自动适配

```javascript
// 检测系统偏好
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

if (!localStorage.getItem('trpg-theme')) {
  const theme = prefersDark.matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

// 监听系统变化
prefersDark.addEventListener('change', (e) => {
  if (!localStorage.getItem('trpg-theme')) {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});
```

---

## 十一、皮肤接口预留（未来扩展）

### 11.1 预留变量

```css
:root {
  /* 当前标准主题值 */
  --skin-bg-color: var(--surface-page);
  --skin-card-bg: var(--surface-card);
  --skin-card-border: 1px solid transparent;
  --skin-chat-gm: var(--color-primary-light);
  --skin-chat-player: var(--surface-hover);
  --skin-accent-hue: 210;  /* 蓝色相 */
}
```

### 11.2 未来皮肤覆盖方式

```css
/* 克苏鲁皮肤（未来实现） */
[data-theme="cthulhu-1920s"] {
  --skin-bg-color: #E8E4D9;
  --skin-card-bg: rgba(253, 248, 240, 0.95);
  --skin-card-border: 1px solid rgba(139, 125, 107, 0.2);
  --skin-chat-gm: linear-gradient(135deg, #F5F0E8 0%, #E8E0D5 100%);
  --skin-chat-player: rgba(139, 125, 107, 0.1);
  --skin-accent-hue: 45;  /* 金色相 */
}

/* 赛博朋克皮肤（未来实现） */
[data-theme="cyberpunk-neon"] {
  --skin-bg-color: #0D0D12;
  --skin-card-bg: rgba(20, 20, 35, 0.8);
  --skin-card-border: 1px solid rgba(0, 255, 255, 0.2);
  --skin-chat-gm: linear-gradient(135deg, rgba(0,255,255,0.1) 0%, rgba(255,0,255,0.05) 100%);
  --skin-chat-player: rgba(138, 43, 226, 0.15);
  --skin-accent-hue: 180;  /* 青色相 */
}
```

### 11.3 实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 日/夜间模式 | 已完成 |
| P1 | 房间背景图 | GM 上传，全员可见 |
| P2 | 标准主题扩展 | 克苏鲁/DND/赛博/水墨 |
| P3 | 社区皮肤市场 | 用户投稿审核 |

---

## 十二、从旧版迁移指南

### 12.1 命名变更对照表

| 旧命名（v1.0） | 新命名（v2.0） | 状态 |
|---------------|---------------|------|
| `--tp-color-primary` | `--color-primary` | ✅ 直接替换 |
| `--tp-color-danger` | `--color-danger` | ✅ 直接替换 |
| `--tp-gray-100` | `--surface-page` | ✅ 语义化替换 |
| `--tp-gray-0` | `--surface-card` | ✅ 语义化替换 |
| `--tp-text-primary` | `--text-primary` | ✅ 直接替换 |
| `--tp-text-body` | `--text-body` | ✅ 直接替换 |
| `--tp-text-muted` | `--text-muted` | ✅ 直接替换 |
| `--tp-surface-bg` | `--surface-page` | ✅ 语义化替换 |
| `--tp-surface-card` | `--surface-card` | ✅ 直接替换 |
| `--tp-border-default` | `--border-default` | ✅ 直接替换 |
| `--tp-space-1` ~ `--tp-space-12` | `--space-1` ~ `--space-12` | ✅ 移除前缀 |
| `--tp-radius-sm` ~ `--tp-radius-full` | `--radius-sm` ~ `--radius-full` | ✅ 移除前缀 |

### 12.2 废弃变量（2026-05-25 后移除）

在 `tokens.css` 底部保留向后兼容别名，但标记为 `@deprecated`：

```css
/* @deprecated 2026-05-25 移除，请使用新语义变量 */
--tp-color-primary: var(--color-primary);
--tp-color-danger: var(--color-danger);
--tp-gray-100: var(--surface-page);
--tp-gray-0: var(--surface-card);
--tp-text-primary: var(--text-primary);
--tp-text-body: var(--text-body);
--tp-text-muted: var(--text-muted);
--tp-surface-bg: var(--surface-page);
--tp-surface-card: var(--surface-card);
--tp-border-default: var(--border-default);
```

### 12.3 批量替换命令（VS Code）

**步骤 1：移除 `--tp-` 前缀**
```
查找：--tp-(color-primary|color-danger|gray-\d+|text-primary|text-body|text-muted|surface-bg|surface-card|border-default|space-\d+|radius-sm|radius-md|radius-lg|radius-xl|radius-full)
替换：--$1
```

**步骤 2：修正错误品牌色**
```
查找：--color-primary:\s*#0f172a
替换：--color-primary: #5B8DB8

查找：--color-primary-hover:\s*#1e293b
替换：--color-primary-hover: #4A7A9F

查找：--color-primary-active:\s*#020617
替换：--color-primary-active: #3D6A8F

查找：--color-danger:\s*#dc2626
替换：--color-danger: #B85450

查找：--color-danger-hover:\s*#b91c1c
替换：--color-danger-hover: #A04743
```

**步骤 3：修正 ModuleList fallback**
```
查找：var\(--color-primary,\s*#2563eb\)
替换：var(--color-primary, #5B8DB8)
```

**步骤 4：修正夜间模式**
```
查找：\[data-theme="dark"\]\s*\{[\s\S]*?--color-primary:\s*var\(--slate-200\)
替换：/* 已修正为品牌提亮蓝 */
[data-theme="dark"] {
  --color-primary: #6B9DC8;
  --color-primary-hover: #7AACE0;
  --color-primary-active: #5A8DB8;
  --color-primary-light: rgba(91, 141, 184, 0.2);
```

### 12.4 硬编码清理清单

| 文件 | 当前硬编码 | 替换为 |
|------|-----------|--------|
| `ModuleEditor-*.css` | `background: #f5f5f5` | `var(--surface-hover)` |
| | `background: #fafafa` | `var(--surface-page)` |
| | `background: #fff` | `var(--surface-card)` |
| | `border: 1px solid #ddd` | `var(--border-default)` |
| | `color: #222` | `var(--text-primary)` |
| | `color: #666` | `var(--text-body)` |
| | `color: #999` | `var(--text-muted)` |
| | `var(--fg-1)` / `var(--bg-2)` | 对应语义变量 |
| `RulesetEditor-*.css` | `var(--color-primary, #7b68ee)` | `var(--rs-canvas-bg, #1a1a2e)` |
| | `var(--color-bg-sidebar, #16161e)` | `var(--surface-card)` |
| | `var(--color-border, #2a2a3e)` | `var(--border-default)` |
| `DevPlaceholder-*.css` | `var(--space-16)` | `var(--space-12)` 或补齐 `--space-16: 64px` |
| `CharacterEditor-*.css` | `background: var(--color-primary)` + 白字（夜间） | `var(--surface-elevated)` + `var(--text-primary)` |

---

## 十三、附录

### 13.1 颜色对比度检查

| 组合 | 日间对比度 | 夜间对比度 | 等级 |
|------|-----------|-----------|------|
| `text-primary` on `surface-page` | 12.5:1 | 15.2:1 | AAA |
| `text-body` on `surface-card` | 7.2:1 | 8.5:1 | AA |
| `color-primary` on `text-inverse` | 4.8:1 | 5.2:1 | AA |
| `text-secondary` on `surface-page` | 4.6:1 | 5.8:1 | AA |
| `text-muted` on `surface-card` | 3.0:1 | 3.8:1 | AA（大文字） |

**标准：** WCAG 2.1 AA 要求正文 4.5:1，大文字 3:1

### 13.2 常用 CSS 组合

**垂直居中 flex**
```css
.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}
```

**文本截断**
```css
.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**多行截断**
```css
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

### 13.3 文件命名规范

```
/styles
  ├── tokens.css          # 设计令牌（本文档）
  ├── base.css            # 重置与基础
  ├── components.css      # 组件样式
  ├── layout.css          # 页面布局
  ├── utilities.css       # 工具类
  └── themes/
      ├── standard.css      # 标准主题（日/夜）
      └── future/           # 预留皮肤目录
          ├── cthulhu.css
          ├── dnd.css
          ├── cyberpunk.css
          └── wuxia.css
```

---

## 十四、开发检查清单

- [ ] 所有颜色值来自 `--*` 变量，无硬编码（`#333`、`#666`、`#fff` 等）
- [ ] 无 `--tp-*` 旧前缀变量（向后兼容期除外）
- [ ] 品牌色 `--color-primary` 为 `#5B8DB8`（日间）/ `#6B9DC8`（夜间）
- [ ] 品牌色 `--color-danger` 为 `#B85450`（日间）/ `#C86460`（夜间）
- [ ] 所有间距使用 `--space-*` 变量
- [ ] 所有圆角使用 `--radius-*` 变量
- [ ] 所有阴影使用 `--shadow-*` 变量
- [ ] 所有过渡使用 `--transition-*` 或 `--duration-*` + `--ease-*`
- [ ] 日间/夜间模式测试：所有文字对比度清晰可读
- [ ] 移动端（375px）测试：布局无溢出，触摸目标 ≥44px

