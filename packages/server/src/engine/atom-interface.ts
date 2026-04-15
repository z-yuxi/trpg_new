// 统一的原子节点接口
export interface AtomOutput {
  result: unknown;
  logs: { input_summary: string; output_summary: string };
}

export interface AtomNode {
  type: string;
  execute(inputs: Record<string, unknown>): AtomOutput;
}
