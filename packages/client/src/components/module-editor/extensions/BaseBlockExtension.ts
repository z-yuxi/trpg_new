/**
 * BaseBlockExtension 约定：
 * 所有业务块扩展继承此基础配置，
 * 使用 VueNodeViewRenderer 挂载 Vue 组件作为 NodeView。
 *
 * 每种块定义：
 *  - name: 扩展名（如 'scene_block'）
 *  - attrs: 块的结构化数据
 *  - Vue NodeView 组件（各块自行引用）
 *
 * 公共约定：
 *  - group: 'block'
 *  - atom: false（可包含子内容）
 *  - draggable: true
 */
export const BASE_BLOCK_ATTRS = {
  collapsed: { default: false },
} as const;
