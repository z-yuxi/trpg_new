# 附录 S：SVG 图标系统规范

> 文档版本：v1.0
>
> 生效范围：前端运行时图标资产与 UI 组件图标调用
>
> 运行时唯一来源：packages/client/src/assets/icons.svg
>
> 说明：原 docs/SVG设计图标.html 的规范与图标清单已迁移至本附录与运行时资产。后续不再维护独立 HTML 版本。

---

## 1. 目标

统一图标体系，避免以下问题：

1. 文档定义与运行时资产不一致。
2. 组件引用图标名但运行时缺失。
3. Emoji/字符占位与 SVG 图标并存，导致视觉和维护口径分裂。

---

## 2. 单一来源原则

1. 运行时生效图标：packages/client/src/assets/icons.svg。
2. 组件调用统一使用 SvgIcon：packages/client/src/components/SvgIcon.vue。
3. 本文档负责定义命名、分组、风格与维护流程。
4. 新增图标时，必须同步更新：
   - 本文档清单。
   - packages/client/src/assets/icons.svg。

补充说明：

1. 本文档不内嵌每个 symbol 的完整 SVG 路径数据，避免与运行时资产形成双份真相。
2. 若需查看当前实际生效的图标内容，应直接查看 packages/client/src/assets/icons.svg。
3. 若需快速浏览效果，可查看 docs/svg.html；该页面仅作为预览与历史参考，不作为规范源。

---

## 3. 命名规范

1. 图标 id 统一使用 kebab-case。
2. 普通图标使用前缀 icon-，例如 icon-search。
3. 空状态/异常状态图标使用前缀 state-，例如 state-empty。
4. 禁止同语义多命名长期并存；兼容别名仅用于迁移期。

---

## 4. 视觉规范

1. 线性风格，优先 outline。
2. 默认继承 currentColor。
3. 建议线宽：
   - 导航/状态类：1.5-2。
   - 操作类：2。
4. 尺寸建议：16/20/24/32。
5. 禁止在业务组件中直接使用 Emoji 作为正式图标。

---

## 5. 运行时图标分组（迁移后基线）

### 5.1 Navigation

- icon-home
- icon-workshop
- icon-editor
- icon-room
- icon-market
- icon-recruit
- icon-user

### 5.2 Operations

- icon-search
- icon-plus
- icon-add
- icon-close
- icon-check
- icon-edit
- icon-delete
- icon-trash
- icon-arrow-left
- icon-back
- icon-caret-down
- icon-chevron-right
- icon-chevron-down
- icon-chevron-up
- icon-more
- icon-send
- icon-download
- icon-upload
- icon-copy
- icon-eye
- icon-eye-off
- icon-settings

### 5.3 Status

- state-empty
- state-error
- state-offline
- state-404
- state-forbidden
- state-loading

### 5.4 TRPG Specials

- icon-dice
- icon-npc
- icon-clue
- icon-scene
- icon-timeline
- icon-broadcast
- icon-palette
- icon-scroll
- icon-grid
- icon-clock
- icon-history
- icon-lock
- icon-unlock

### 5.5 工程扩展（业务映射）

- icon-ruleset
- icon-book
- icon-star
- icon-highlight
- icon-music

### 5.6 空状态插画（Dice-bird）

- illust-empty
- illust-error
- illust-offline
- illust-404
- illust-forbidden
- illust-loading

说明：

1. 该组资产用于页面级空状态、异常状态、离线状态与缺省页。
2. 插画是对 state-* 小图标的增强层，不替代普通操作图标。
3. 运行时仍统一存放在 packages/client/src/assets/icons.svg。

---

## 6. 本轮正式采纳项

本轮从历史 SVG 预览稿中，正式吸收以下内容进入单源体系：

1. Dice-bird 六态插画资产：用于 EmptyState 及页面级缺省态。
2. icon-npc：从通用人像轮廓升级为更具角色语义的“头部 + 身体铭牌”方案。
3. icon-palette：采用更简洁的圆形调色板方案，减少旧版轮廓复杂度。

未采纳原则：

1. 不整份恢复 HTML 预览稿作为规范源。
2. 不允许文档预览稿与运行时 icons.svg 长期并行演化。
3. 仅吸收经确认可落入产品的资产，并回填本文档与运行时精灵表。

---

## 7. 调用示例

```vue
<SvgIcon name="icon-search" :size="20" />
<SvgIcon name="state-empty" :size="64" />
```

页面级空状态可通过 EmptyState 直接调用插画资产：

```vue
<EmptyState
   illustration-name="illust-empty"
   title="暂无内容"
   description="当前还没有可展示的数据。"
/>
```

使用要点：

1. 优先通过组件 color 或父级 color 控制图标颜色。
2. 禁止在业务页面直接写 `<svg><path ...>` 作为重复图标。
3. 需要新图标时先补资产再落业务调用，避免引用空图标。
4. 页面级空状态优先使用 illustration-name；列表级、局部级状态仍优先使用 icon-name。

---

## 8. 预览与校验方式

1. 查看当前运行时实际生效的图标定义：packages/client/src/assets/icons.svg。
2. 查看组件封装与调用入口：packages/client/src/components/SvgIcon.vue。
3. 查看图标预览页：docs/svg.html。
4. 预览页的职责仅限展示与人工核对，不承载规范定义；命名、分组与维护规则仍以本文档为准。
5. 当预览页展示与运行时不一致时，以 packages/client/src/assets/icons.svg 为最终准。

---

## 9. 迁移与清理约定

1. 已迁移来源：原 docs/SVG设计图标.html。
2. 迁移完成后，不再将 HTML 作为规范入口。
3. 旧页面中的 Emoji/字符占位按迭代计划逐步替换为 SVG 图标。
4. 预览稿中若出现值得保留的方案，应先评审，再回填本文档与 icons.svg，不得只改预览稿。
