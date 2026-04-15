import type { AtomNode, AtomOutput } from '../atom-interface';

export class ResultCollectorAtom implements AtomNode {
  type = 'result_collector';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const entries = inputs['entries'] as Record<string, unknown>;

    if (!entries || typeof entries !== 'object') {
      throw new Error("result_collector: 'entries' must be an object");
    }

    return {
      result: { ...entries },
      logs: {
        input_summary: `keys=[${Object.keys(entries).join(', ')}]`,
        output_summary: `collected ${Object.keys(entries).length} entries`,
      },
    };
  }
}
