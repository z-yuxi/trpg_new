# 附录 G：纯文字艺术设计系统

## 文档信息
- 版本：v1.5
- 日期：2026-04-25
- 变更：改为叙事内容专用视觉子系统；明确不替代 SVG 图标、插画与 Logo 资产

> **设计哲学**：文字即艺术，CSS 即画笔。本附录仅用于日志、线索、叙事卡片等内容型模块的文字氛围设计，不替代平台级 SVG 图标、缺省插画与品牌 Logo。

## 0.1 2026-04-25 对齐声明

本附录以以下 5 份根目录文档为绝对准则：

1. `docs/规则配方系统技术方案.md`
2. `docs/附录 B：设计令牌（Design Tokens）.md`
3. `docs/附录 D：设计系统.md`
4. `docs/首页视觉修正_设计交付包_v1.0.md`
5. `docs/SVG设计图标.html`

边界说明：

- 本附录不负责平台导航图标、空状态插画、品牌 Logo、按钮图标和系统图标设计；这些必须使用 SVG 资产体系。
- 本附录只适用于线索卡、日志导出、叙事文本块、世界观页面等“内容表现层”。

---

## 一、核心原则

### 1.1 为什么在叙事块中优先用文字纹理？

| 维度 | 图片方案 | 纯文字方案 |
|------|----------|------------|
| **加载性能** | 需HTTP请求，大文件 | 纯CSS，零请求 |
| **清晰度** | 需多倍图适配高清屏 | 矢量无限缩放 |
| **动态性** | 需重新导出 | CSS变量实时换色 |
| **一致性** | 风格难统一 | 代码级规范 |
| **维护成本** | 需设计师介入 | 前端自主实现 |

### 1.2 设计三要素

1. **字符即图形**：Unicode符号、ASCII艺术、文字几何排列
2. **CSS即动画**：transform、filter、animation 创造生命力
3. **语义即氛围**：文字内容本身成为视觉的一部分

---

## 二、八大主题系统规范

### 主题1：河流流淌（Flowing River）
**场景**：思绪如水流、梦境、时间流逝
**特征**：水平波浪流动

```css
.theme-river {
  background: linear-gradient(90deg, #0d1b2a 0%, #1b263b 50%, #0d1b2a 100%);
  padding: 60px;
  overflow: hidden;
}

.river-content {
  font-size: 20px;
  color: #a8dadc;
}

.river-line {
  display: block;
  white-space: nowrap;
  animation: riverFlow 12s linear infinite;
  text-shadow: 0 0 15px rgba(168, 218, 220, 0.6);
  opacity: 0.8;
}

/* 每行不同起点，形成波浪 */
.river-line:nth-child(1) { animation-delay: 0s; padding-left: 0; }
.river-line:nth-child(2) { animation-delay: -2s; padding-left: 100px; }
.river-line:nth-child(3) { animation-delay: -4s; padding-left: 50px; }
.river-line:nth-child(4) { animation-delay: -6s; padding-left: 150px; }
.river-line:nth-child(5) { animation-delay: -8s; padding-left: 80px; }

@keyframes riverFlow {
  0%, 100% { transform: translateX(-10%); }
  50% { transform: translateX(10%); }
}
```

**关键技法**：
- 水平位移 `translateX` 创造流动感
- 负动画延迟让各行错开相位
- `overflow: hidden` 营造"河堤"边界

---

### 主题2：水纹模糊（Water Blur）
**场景**：被浸泡的日记、记忆模糊、水中文字
**特征**：默认模糊，交互后清晰

```css
.theme-blur {
  background: linear-gradient(180deg, #1c1c1c 0%, #2d3436 100%);
  padding: 60px;
}

.blur-content {
  font-size: 18px;
  line-height: 2;
  color: #b2bec3;
  filter: blur(4px);
  transition: all 0.8s ease;
  cursor: pointer;
  text-align: center;
}

.blur-content:hover {
  filter: blur(0px);
  color: #dfe6e9;
  text-shadow: 0 0 20px rgba(223, 230, 233, 0.8);
}

.blur-hint {
  text-align: center;
  color: #636e72;
  font-size: 0.9rem;
  margin-top: 20px;
  font-style: italic;
}
```

**关键技法**：
- `filter: blur()` 创建水浸效果
- `transition` 实现平滑清晰过渡
- 鼠标悬停模拟"努力回忆"

---

### 主题3：碎片化（Fragmented）
**场景**：烧毁的信件、撕碎的遗嘱、破损文件
**特征**：文字块不规则偏移、烧焦边缘

```css
.theme-fragment {
  background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
  padding: 60px;
  position: relative;
  overflow: hidden;
}

.fragment-content {
  font-size: 18px;
  line-height: 2.5;
  color: #ecf0f1;
}

.fragment-piece {
  display: inline-block;
  background: rgba(231, 76, 60, 0.1);
  padding: 8px 16px;
  margin: 5px;
  border-radius: 3px;
  position: relative;
  transition: all 0.3s ease;
}

/* 奇数块向左倾斜 */
.fragment-piece:nth-child(odd) {
  transform: rotate(-2deg) translateX(-5px);
  clip-path: polygon(0 0, 95% 0, 100% 100%, 5% 100%);
}

/* 偶数块向右倾斜 */
.fragment-piece:nth-child(even) {
  transform: rotate(2deg) translateX(5px);
  clip-path: polygon(5% 0, 100% 0, 95% 100%, 0 100%);
}

.fragment-piece:hover {
  transform: rotate(0deg) translateX(0);
  background: rgba(231, 76, 60, 0.3);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
}
```

**关键技法**：
- `clip-path` 裁剪出不规则边缘
- 奇偶选择器创造随机感
- 悬停时恢复平整，模拟"拼接"

---

### 主题4：波浪排列（Wave Arrangement）
**场景**：古神低语、咒语、外星语言
**特征**：逐字符波浪起伏

```css
.theme-wave {
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  padding: 80px 40px;
  overflow: hidden;
}

.wave-content {
  font-size: 24px;
  color: white;
  text-align: center;
  font-family: 'Courier New', monospace;
}

.wave-char {
  display: inline-block;
  animation: wave 2s ease-in-out infinite;
  text-shadow: 0 4px 10px rgba(0,0,0,0.3);
  min-width: 20px;
}

/* 逐字符延迟，形成波浪 */
.wave-char:nth-child(1) { animation-delay: 0s; }
.wave-char:nth-child(2) { animation-delay: 0.1s; }
.wave-char:nth-child(3) { animation-delay: 0.2s; }
.wave-char:nth-child(4) { animation-delay: 0.3s; }
.wave-char:nth-child(5) { animation-delay: 0.4s; }
.wave-char:nth-child(6) { animation-delay: 0.5s; }
.wave-char:nth-child(7) { animation-delay: 0.6s; }
.wave-char:nth-child(8) { animation-delay: 0.7s; }
.wave-char:nth-child(9) { animation-delay: 0.8s; }
.wave-char:nth-child(10) { animation-delay: 0.9s; }

@keyframes wave {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-20px); }
}
```

**关键技法**：
- 逐字符包裹 `<span>` 实现独立动画
- 等差数列延迟创造波浪相位
- 等宽字体保持排列整齐

---

### 主题5：古籍密卷（Ancient Scroll）
**场景**：东方神秘手稿、历史档案、道教符咒
**特征**：竖排、宣纸质感、印章

```css
.theme-ancient {
  background: 
    linear-gradient(90deg, rgba(139,69,19,0.1) 0%, transparent 5%, transparent 95%, rgba(139,69,19,0.1) 100%),
    linear-gradient(to bottom, #e8d5b5 0%, #d4c5a3 100%);
  color: #2c1810;
  padding: 60px;
  position: relative;
  overflow: hidden;
}

.ancient-content {
  writing-mode: vertical-rl;
  text-orientation: upright;
  height: 400px;
  font-size: 20px;
  line-height: 3;
  letter-spacing: 0.5em;
  text-shadow: 0 0 1px rgba(44, 24, 16, 0.3);
  margin: 0 auto;
}

/* 虫蛀效果 */
.theme-ancient::before {
  content: "· · · · ·";
  position: absolute;
  top: 20px;
  right: 30px;
  color: rgba(44, 24, 16, 0.3);
  font-size: 20px;
  letter-spacing: 15px;
  transform: rotate(90deg);
}

/* 印章 */
.ancient-seal {
  position: absolute;
  bottom: 40px;
  left: 40px;
  width: 80px;
  height: 80px;
  border: 3px solid #c41e3a;
  color: #c41e3a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 32px;
  transform: rotate(-5deg);
  opacity: 0.8;
  box-shadow: 0 0 0 2px rgba(196, 30, 58, 0.3);
}
```

**关键技法**：
- `writing-mode: vertical-rl` 实现竖排
- 渐变背景模拟宣纸纹理
- 旋转变换营造手工盖章的不完美感

---

### 主题6：血字告白（Blood Writing）
**场景**：恐怖模组、临终遗言、诅咒信息
**特征**：发光红字、血滴下落、呼吸闪烁

```css
.theme-blood {
  background: 
    radial-gradient(ellipse at 30% 20%, rgba(139, 0, 0, 0.4) 0%, transparent 50%),
    radial-gradient(ellipse at 70% 80%, rgba(139, 0, 0, 0.3) 0%, transparent 40%),
    linear-gradient(180deg, #1a0a0a 0%, #0d0d0d 100%);
  padding: 60px;
  position: relative;
  overflow: hidden;
}

.blood-content {
  font-size: 24px;
  color: #ff6b6b;
  position: relative;
}

.blood-line {
  display: block;
  margin: 20px 0;
  position: relative;
  text-shadow: 
    0 0 10px rgba(255, 107, 107, 0.8),
    0 0 20px rgba(255, 107, 107, 0.4);
  animation: bloodPulse 4s ease-in-out infinite;
}

/* 血滴：伪元素实现 */
.blood-line::after {
  content: "▓";
  position: absolute;
  color: #8b0000;
  opacity: 0;
  animation: bloodDrop 3s ease-in infinite;
}

.blood-line:nth-child(1)::after { left: 10%; top: 100%; animation-delay: 0s; }
.blood-line:nth-child(2)::after { left: 30%; top: 100%; animation-delay: 0.8s; }
.blood-line:nth-child(3)::after { left: 60%; top: 100%; animation-delay: 1.6s; }
.blood-line:nth-child(4)::after { left: 80%; top: 100%; animation-delay: 2.4s; }

@keyframes bloodDrop {
  0% { opacity: 0.8; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(60px) scale(0.5); }
}

@keyframes bloodPulse {
  0%, 100% { opacity: 0.9; }
  50% { opacity: 0.6; }
}
```

**关键技法**：
- 伪元素 `::after` 生成血滴，不污染DOM
- 透明度+缩放模拟液体下落变形
- 呼吸动画增加紧张感

---

### 主题7：灰烬回忆（Ashen Memory）
**场景**：火灾、遗忘、逝去的记忆、烧毁的文件
**特征**：灰色文字、飘散上升的灰烬粒子

```css
.theme-ash {
  background: linear-gradient(180deg, #2d2d2d 0%, #1a1a1a 100%);
  padding: 60px;
  position: relative;
}

.ash-content {
  font-size: 18px;
  color: #9ca3af;
}

.ash-line {
  display: block;
  margin: 15px 0;
  position: relative;
  animation: ashSettle 8s ease-in-out infinite;
}

/* 飘散的灰烬粒子 */
.ash-line::before,
.ash-line::after {
  content: "░";
  position: absolute;
  color: #6b7280;
  opacity: 0;
  animation: ashFloat 5s linear infinite;
}

.ash-line::before { left: -20px; animation-delay: 0s; }
.ash-line::after { right: -20px; animation-delay: 2.5s; }

@keyframes ashSettle {
  0%, 100% { opacity: 0.9; transform: translateY(0); }
  50% { opacity: 0.4; transform: translateY(5px); }
}

@keyframes ashFloat {
  0% { opacity: 0.8; transform: translateY(0) rotate(0deg); }
  100% { opacity: 0; transform: translateY(-100px) rotate(360deg); }
}
```

**关键技法**：
- 字符 `░`（U+2591）作为灰烬粒子
- 负Y轴位移模拟"上升"（与血滴相反）
- 旋转动画增加随机飘动感

---

### 主题8：赛博终端（Cyber Terminal）
**场景**：科幻模组、黑客场景、AI对话、系统入侵
**特征**：绿色终端、故障艺术、RGB分离

```css
.theme-cyber {
  background: #050505;
  padding: 60px;
  font-family: 'Courier New', monospace;
  border: 1px solid #333;
}

.cyber-content {
  font-size: 16px;
  color: #00ff9d;
  text-shadow: 0 0 10px rgba(0, 255, 157, 0.8);
}

.cyber-line {
  display: block;
  margin: 10px 0;
  position: relative;
  animation: glitch 3s infinite;
}

/* RGB分离效果 */
.cyber-line::before,
.cyber-line::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
}

.cyber-line::before {
  color: #ff00ff;
  animation: glitch-1 2s infinite linear alternate-reverse;
  clip-path: polygon(0 0, 100% 0, 100% 45%, 0 45%);
}

.cyber-line::after {
  color: #00ffff;
  animation: glitch-2 3s infinite linear alternate-reverse;
  clip-path: polygon(0 55%, 100% 55%, 100% 100%, 0 100%);
}

@keyframes glitch {
  0%, 90%, 100% { transform: translate(0); }
  92% { transform: translate(-2px, 2px); }
  94% { transform: translate(2px, -2px); }
  96% { transform: translate(-2px, 0); }
  98% { transform: translate(2px, 0); }
}

@keyframes glitch-1 {
  0%, 100% { opacity: 0; transform: translate(0); }
  20% { opacity: 0.8; transform: translate(-3px, 0); }
  40% { opacity: 0; }
}

@keyframes glitch-2 {
  0%, 100% { opacity: 0; transform: translate(0); }
  60% { opacity: 0.8; transform: translate(3px, 0); }
  80% { opacity: 0; }
}
```

**关键技法**：
- `attr(data-text)` 复制文本内容生成两层
- `clip-path` 裁剪出上下两部分，分别着色
- 快速位移动画模拟数字信号故障

---

## 三、主题对比表

| 主题 | 动态方向 | 核心CSS特性 | 氛围关键词 |
|------|----------|-------------|------------|
| 河流流淌 | 水平摇摆 | `translateX` | 流动、时间、梦境 |
| 水纹模糊 | 静态→清晰 | `filter: blur()` | 记忆、浸泡、隐藏 |
| 碎片化 | 静态偏移 | `clip-path` | 破损、烧毁、拼接 |
| 波浪排列 | 垂直起伏 | 逐字符`translateY` | 咒语、神秘、古老 |
| 古籍密卷 | 静态竖排 | `writing-mode` | 东方、历史、神秘 |
| 血字告白 | 垂直滴落 | 伪元素下落 | 恐怖、紧迫、危险 |
| 灰烬回忆 | 垂直上升 | 伪元素上浮 | 遗忘、逝去、火灾 |
| 赛博终端 | 闪烁故障 | `clip-path`+位移 | 科技、黑客、AI |

---

## 四、通用组件规范

### 4.1 文字装饰字符系统

```css
/* 核心符号库 */
.icon-dice::before { content: "🎲"; }
.icon-map::before { content: "🗺"; }
.icon-scroll::before { content: "📜"; }
.icon-mystery::before { content: "◈"; }
.icon-danger::before { content: "▓"; }
.icon-ghost::before { content: "░"; }

/* 装饰符号 */
.divider::before { content: "◆ ◈ ◆ ◈ ◆"; letter-spacing: 10px; }
.border-heavy::before { content: "╔══════════════════════════════════════╗"; }
.border-light::before { content: "┌──────────────────────────────────────┐"; }
```

### 4.2 Unicode字符推荐

| 类别 | 字符 | 用途 |
|------|------|------|
| 几何 | `◆ ◈ ◇ ■ ▓ ░ █ ▲ ▼` | 装饰、纹理 |
| 框线 | `╔ ═ ╗ ║ ╚ ╝ │ ┃ ┌ ┐` | 边框、分隔 |
| 箭头 | `→ ← ↑ ↗ ↘ ⇄ ⇅ ▶ ◀` | 指示、导航 |
| 数学 | `∞ ∑ ∫ √ ≠ ± × ÷` | 科幻、神秘 |
| 货币 | `¤ ฿ ¢ ¥ € £ ¥` | 装饰、复古 |

---

## 五、数据结构

```typescript
// 主题类型枚举（严格对应八大主题）
type ThemeType = 
  | "river"      // 河流流淌
  | "blur"       // 水纹模糊
  | "fragment"   // 碎片化
  | "wave"       // 波浪排列
  | "ancient"    // 古籍密卷
  | "blood"      // 血字告白
  | "ash"        // 灰烬回忆
  | "cyber";     // 赛博终端

interface ClueBlock {
  type: "clue";
  data: {
    name: string;
    content: string;
    theme: ThemeType;
    params?: {
      speed?: number;       // 动画速度倍率（默认1.0）
      intensity?: number;   // 效果强度 0-1
      interactive?: boolean; // 是否需要交互触发
    }
  }
}
```

---

## 六、性能优化

```css
/* GPU加速 */
.theme-river, .theme-blood, .theme-ash {
  transform: translateZ(0);
  will-change: transform;
}

/* 减少重绘 */
.wave-char, .fragment-piece {
  will-change: transform;
  contain: layout style;
}

/* 移动端降级 */
@media (max-width: 768px) {
  .river-line { animation-duration: 20s; }
  .blood-line::after, .ash-line::before { display: none; }
  .wave-char { animation: none; }
}

/* 减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

---

## 七、完整示例

```html
<!-- 河流主题线索 -->
<div class="clue-card theme-river">
  <div class="river-content">
    <span class="river-line">时间像一条永不停歇的河流</span>
    <span class="river-line">我们都是溺水者</span>
    <span class="river-line">在记忆的漩涡中不断下沉</span>
  </div>
</div>

<!-- 血字主题线索 -->
<div class="clue-card theme-blood">
  <div class="blood-content">
    <span class="blood-line">我快没有时间了</span>
    <span class="blood-line">它们已经发现了我</span>
    <span class="blood-line">不要打开那扇门</span>
  </div>
</div>
```

---

> **文字即艺术，CSS即画笔。八重主题，八种情绪，零张图片，无限可能。**
