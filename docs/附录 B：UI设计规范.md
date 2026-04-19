
> **支持日间/夜间双模式** | 版本：v2.3.1 | 更新日期：2026-04-10

---

## 一、设计原则

### 1.1 核心哲学

**"秩序优先、中性克制、无障碍优先"**

- **平台层中性**：导航、按钮使用 Slate 灰阶，不依赖品牌色
- **状态色克制**：仅 Blue/Green/Amber/Red 用于功能状态
- **昼夜自适应**：所有组件必须适配日间/夜间两种模式，保持 4.5:1 以上对比度
- **内容为王**：背景退后，卡片突出，避免视觉噪音

### 1.2 色彩策略

| 场景 | 日间模式 | 夜间模式 | 策略 |
|------|----------|----------|------|
| 主按钮背景 | Slate 900（近黑） | Slate 200（浅灰） | **反色适配** |
| 主按钮文字 | 白色 | Slate 900（近黑） | **反色适配** |
| 页面背景 | Gray 50（灰白） | Gray 950（近黑） | 反色 |
| 卡片背景 | 白色 | Gray 900（深灰） | 反色 |
| 正文文字 | Gray 700 | Gray 300（提亮） | 对比度补偿 |

**关键约束：**
- 禁止使用 Emoji 作为界面图标（必须使用 SVG）
- 禁止在平台层使用暖色调（橙/黄）作为主功能色
- 所有文字在背景上对比度必须 ≥ 4.5:1（WCAG AA）

### 1.3 图标与符号规则（最终版）

**核心原则**：
- 平台结构性控件（导航图标、功能按钮、状态占位图）**必须使用 SVG 图标**，以保证视觉统一和跨主题自适应。
- 数据密集型表格单元格内的小型状态指示符（如交通方式、是/否标记）**允许使用 Emoji**，以降低布局复杂度和渲染开销。
- 聊天消息、帖子、用户自我介绍等用户生成内容**不受此限**。

**SVG 图标使用规范**：
- 尺寸：16px（小）、20px（标准）、24px（大）。
- 颜色：使用 `fill="currentColor"` 继承文字颜色。

**允许使用的 Emoji 清单**（仅限表格内状态指示）：
- 交通方式：🚶（步行）、🚲（骑行）、🚗（驾车）
- 状态标记：✅（成功/是）、❌（失败/否）、⚠️（警告/注意）

**禁止行为**：
- 禁止在导航栏、按钮、对话框标题等平台控件中使用 Emoji 替代 SVG 图标。

---

## 二、设计令牌（Design Tokens）

### 2.1 基础颜色（Base Colors）

```css
/* Slate 色系 - 平台主色 */
--slate-50: #f8fafc;
--slate-100: #f1f5f9;
--slate-200: #e2e8f0;   /* 夜间按钮背景 */
--slate-300: #cbd5e1;
--slate-400: #94a3b8;
--slate-500: #64748b;
--slate-600: #475569;
--slate-700: #334155;
--slate-800: #1e293b;
--slate-900: #0f172a;   /* 日间按钮背景，夜间按钮文字 */

/* Gray 色系 - 中性灰阶 */
--gray-50: #f9fafb;     /* 日间页面背景 */
--gray-100: #f3f4f6;
--gray-200: #e5e7eb;    /* 日间边框 */
--gray-300: #d1d5db;
--gray-400: #9ca3af;    /* 日间次要文字 */
--gray-500: #6b7280;
--gray-600: #4b5563;
--gray-700: #374151;    /* 日间正文 */
--gray-800: #1f2937;
--gray-900: #111827;    /* 日间标题 */
--gray-950: #030712;    /* 夜间页面背景 */

/* 功能色 */
--blue-50: #eff6ff;
--blue-100: #dbeafe;
--blue-500: #3b82f6;
--blue-600: #2563eb;    /* 信息/链接 */
--blue-700: #1d4ed8;

--green-50: #f0fdf4;
--green-100: #dcfce7;
--green-500: #22c55e;
--green-600: #16a34a;   /* 成功/求组 */
--green-700: #15803d;

--amber-50: #fffbeb;
--amber-100: #fef3c7;
--amber-500: #f59e0b;   /* 警告/即将满员 */
--amber-600: #d97706;

--red-50: #fef2f2;
--red-100: #fee2e2;
--red-500: #ef4444;
--red-600: #dc2626;     /* 危险/删除 */
--red-700: #b91c1c;
```

### 2.2 语义化颜色变量（核心）

```css
/* 日间模式（默认） */
:root {
  /* 主色（Slate 900）- 用于按钮、标题、强调 */
  --color-primary: var(--slate-900);
  --color-primary-hover: var(--slate-800);
  --color-primary-active: #020617;  /* Slate 950 */
  --color-primary-light: rgba(15, 23, 42, 0.08);
  
  /* 功能色 */
  --color-info: var(--blue-600);
  --color-info-bg: var(--blue-50);
  --color-success: var(--green-600);
  --color-success-bg: var(--green-50);
  --color-warning: var(--amber-500);
  --color-warning-bg: var(--amber-50);
  --color-danger: var(--red-600);
  --color-danger-bg: var(--red-50);

  /* 背景层 */
  --surface-page: var(--gray-50);
  --surface-card: #ffffff;
  --surface-hover: var(--gray-100);
  --surface-active: var(--gray-200);
  --surface-elevated: #ffffff;  /* 悬浮元素 */

  /* 文字层 */
  --text-primary: var(--gray-900);
  --text-body: var(--gray-700);
  --text-secondary: var(--gray-500);
  --text-muted: var(--gray-400);
  --text-inverse: #ffffff;

  /* 边框 */
  --border-default: var(--gray-200);
  --border-hover: var(--gray-300);
  --border-active: var(--slate-900);

  /* 按钮专用（支持反色） */
  --btn-primary-bg: var(--color-primary);
  --btn-primary-text: var(--text-inverse);
  --btn-primary-hover: var(--color-primary-hover);
  
  --btn-secondary-bg: var(--surface-card);
  --btn-secondary-text: var(--text-body);
  --btn-secondary-border: var(--border-default);
  
  /* 阴影 */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
}
```

### 2.3 夜间模式覆盖（关键修正）

```css
[data-theme="dark"] {
  /* 主色反色 - Slate 200 背景 + Slate 900 文字 */
  --color-primary: var(--slate-200);        /* 变为浅灰 */
  --color-primary-hover: var(--slate-100);  /* 更浅 */
  --color-primary-active: var(--slate-300); /* 稍深 */
  --color-primary-light: rgba(226, 232, 240, 0.15); /* Slate 200 透明版 */
  
  /* 功能色保持，但背景变浅 */
  --color-info: var(--blue-500);      /* 提亮 */
  --color-info-bg: rgba(59, 130, 246, 0.15);
  --color-success: var(--green-500);
  --color-success-bg: rgba(34, 197, 94, 0.15);
  --color-warning: var(--amber-500);
  --color-warning-bg: rgba(245, 158, 11, 0.15);
  --color-danger: var(--red-500);
  --color-danger-bg: rgba(239, 68, 68, 0.15);

  /* 背景层反色 */
  --surface-page: var(--gray-950);
  --surface-card: var(--gray-900);
  --surface-hover: rgba(255, 255, 255, 0.05);
  --surface-active: rgba(255, 255, 255, 0.1);
  --surface-elevated: #1f2937;  /* 比卡片稍亮 */

  /* 文字层提亮 */
  --text-primary: var(--gray-50);   /* 近白 */
  --text-body: var(--gray-300);     /* 浅灰 */
  --text-secondary: var(--gray-400); /* 中灰 */
  --text-muted: var(--gray-500);    /* 深灰（慎用）*/
  --text-inverse: var(--slate-900); /* 反色文字（用于浅色按钮）*/

  /* 边框 */
  --border-default: rgba(255, 255, 255, 0.1);
  --border-hover: rgba(255, 255, 255, 0.2);
  --border-active: var(--slate-200);

  /* 按钮反色（核心修正） */
  --btn-primary-bg: var(--slate-200);      /* 浅灰背景 */
  --btn-primary-text: var(--slate-900);    /* 深色文字 */
  --btn-primary-hover: var(--slate-100);   /* 悬停更浅 */
  
  --btn-secondary-bg: transparent;
  --btn-secondary-text: var(--text-body);
  --btn-secondary-border: var(--border-default);
  
  /* 阴影（加深） */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.2);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.3);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
}
```

### 2.4 对比度验证表

| 元素 | 日间对比度 | 夜间对比度 | 等级 |
|------|-----------|-----------|------|
| 主按钮文字 | 16.1:1（白/黑） | 11.2:1（黑/深灰） | AAA |
| 正文 | 7.4:1（灰700/白） | 9.7:1（灰300/黑） | AAA |
| 次要文字 | 4.6:1（灰500/白） | 5.1:1（灰400/黑） | AA |
| 禁用文字 | 3.0:1（灰400/白） | 3.8:1（灰500/黑） | AA（大文字）|

---

## 三、组件规范（支持双模式）

### 3.1 按钮（Button）

**主按钮（自适应昼夜）**
```css
.btn-primary {
  background-color: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms ease-out;
}

.btn-primary:hover {
  background-color: var(--btn-primary-hover);
  transform: translateY(-1px);
}

.btn-primary:active {
  background-color: var(--color-primary-active);
  transform: scale(0.98);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  pointer-events: none;
}
```

**视觉表现：**
- **日间**：近黑背景（Slate 900）+ 白字
- **夜间**：浅灰背景（Slate 200）+ 近黑字（Slate 900）
- **一致性**：都使用 Slate 色系，保持品牌连续性

### 3.2 卡片（Card）

```css
.card {
  background-color: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
  transition: all 200ms ease-out;
}

.card:hover {
  border-color: var(--border-hover);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
```

### 3.3 输入框（Input）

```css
.input {
  background-color: var(--surface-page);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--text-primary);
  width: 100%;
  outline: none;
  transition: all 150ms ease-out;
}

.input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

[data-theme="dark"] .input {
  background-color: var(--surface-card);  /* 夜间用卡片背景，区别于页面 */
}
```

### 3.4 标签（Tag）

```css
.tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  line-height: 1;
}

/* 招募标签 */
.tag-recruit {
  background-color: var(--color-info-bg);
  color: var(--color-info);
}

/* 求组标签 */
.tag-seek {
  background-color: var(--color-success-bg);
  color: var(--color-success);
}

/* 已拥有标签 */
.tag-owned {
  background-color: var(--color-success-bg);
  color: var(--color-success);
}
```

---

## 四、加载与状态组件

### 4.1 Spinner（加载中）

```css
.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-default);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### 4.2 骨架屏（Skeleton）

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-hover) 25%,
    var(--surface-active) 50%,
    var(--surface-hover) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

## 五、布局与响应式

### 5.1 间距系统

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
```

### 5.2 圆角系统

```css
--radius-sm: 4px;    /* 标签 */
--radius-md: 6px;    /* 按钮、输入框 */
--radius-lg: 8px;    /* 卡片 */
--radius-xl: 12px;   /* 模态框、快速操作卡片 */
--radius-full: 9999px; /* 徽章、头像 */
```

### 5.3 导航栏高度

统一为 **64px**（与页面原型保持一致）

```css
.navbar {
  height: 64px;
  padding: 0 24px;
}
```

---

## 六、开发检查清单

- [ ] **双模式测试**：在日间和夜间模式下分别检查所有页面，确保对比度足够
- [ ] **主按钮反色**：确认夜间模式下主按钮是浅灰背景 + 深色文字，而非"隐形按钮"
- [ ] **无 Emoji**：所有图标使用 SVG，界面无 Emoji
- [ ] **颜色变量**：所有颜色使用 `--tp-*` 变量，无硬编码
- [ ] **动画流畅**：过渡动画使用 `transition` 变量，时长 150-300ms

---

**文档版本：** V2.3.1（修订版）  
**更新内容：** 新增夜间模式反色策略，修复主按钮对比度问题，补充图标规范与加载组件  
**下次评审：** 2026-05-10