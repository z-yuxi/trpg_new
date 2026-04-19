/**
 * command-defaults.test.ts
 * 验证所有平台预置命令（ra/rc/sc/en/ti/li/init/ds）的节点结构非空
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_COMMANDS, PRESET_COMMAND_KEYS, GENERAL_COMMAND_KEYS } from '../command-defaults';

const REQUIRED_PRESET_COMMANDS = ['ra', 'rc', 'sc', 'en', 'ti', 'li', 'init', 'ds'] as const;
const REQUIRED_GENERAL_COMMANDS = ['r', 'rh', 'nn'] as const;

describe('DEFAULT_COMMANDS — 结构完整性', () => {
  it.each(REQUIRED_PRESET_COMMANDS)(
    '预置命令 %s 应存在且 graph.nodes 非空',
    (key) => {
      const cmd = DEFAULT_COMMANDS[key];
      expect(cmd, `命令 ${key} 不存在`).toBeDefined();
      expect(cmd.graph, `命令 ${key} 缺少 graph`).toBeDefined();
      expect(Array.isArray(cmd.graph.nodes), `命令 ${key} 的 graph.nodes 不是数组`).toBe(true);
      expect(cmd.graph.nodes.length, `命令 ${key} 的 graph.nodes 为空`).toBeGreaterThan(0);
      expect(typeof cmd.graph.output_node_id, `命令 ${key} 缺少 output_node_id`).toBe('string');
      expect(cmd.graph.output_node_id.length, `命令 ${key} 的 output_node_id 为空字符串`).toBeGreaterThan(0);
    }
  );

  it.each(REQUIRED_GENERAL_COMMANDS)(
    '通用命令 %s 应存在且 graph.nodes 非空',
    (key) => {
      const cmd = DEFAULT_COMMANDS[key];
      expect(cmd).toBeDefined();
      expect(Array.isArray(cmd.graph.nodes)).toBe(true);
      expect(cmd.graph.nodes.length).toBeGreaterThan(0);
    }
  );

  it('所有预置命令键均已在 PRESET_COMMAND_KEYS 中声明', () => {
    for (const key of REQUIRED_PRESET_COMMANDS) {
      expect((PRESET_COMMAND_KEYS as readonly string[]).includes(key)).toBe(true);
    }
  });

  it('所有通用命令键均已在 GENERAL_COMMAND_KEYS 中声明', () => {
    for (const key of REQUIRED_GENERAL_COMMANDS) {
      expect((GENERAL_COMMAND_KEYS as readonly string[]).includes(key)).toBe(true);
    }
  });

  it('每个命令的 output_node_id 应对应 nodes 中的某个 node_id', () => {
    for (const [key, cmd] of Object.entries(DEFAULT_COMMANDS)) {
      const nodeIds = cmd.graph.nodes.map((n) => n.node_id);
      expect(nodeIds, `命令 ${key} 的 output_node_id '${cmd.graph.output_node_id}' 不在 nodes 中`).toContain(
        cmd.graph.output_node_id
      );
    }
  });

  it('使用 character_skill_reader 的命令（ra/rc/sc/en）应有 param_map 或 static field_name', () => {
    const charDataCmds = ['ra', 'rc', 'en'];
    for (const key of charDataCmds) {
      const cmd = DEFAULT_COMMANDS[key];
      expect(cmd).toBeDefined();
      const readerNode = cmd.graph.nodes.find((n) => n.atom_type === 'character_skill_reader');
      expect(readerNode, `命令 ${key} 缺少 character_skill_reader 节点`).toBeDefined();
      // 有 param_map，或者 field_name 是非空字符串
      const hasParamMap = Array.isArray(cmd.param_map) && cmd.param_map.length > 0;
      const fieldNameInput = readerNode!.inputs['field_name'];
      const hasStaticFieldName = fieldNameInput?.type === 'static' && typeof fieldNameInput.value === 'string';
      expect(hasParamMap || hasStaticFieldName).toBe(true);
    }
  });
});
