/**
 * Snowflake ID 生成器
 * 结构：41位时间戳 + 10位机器ID + 12位序列号 = 63位（JS安全整数内）
 * Epoch: 2024-01-01T00:00:00Z
 */

const EPOCH = 1704067200000n; // 2024-01-01T00:00:00Z
const WORKER_BITS = 10n;
const SEQUENCE_BITS = 12n;
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n;
const MAX_WORKER = (1n << WORKER_BITS) - 1n;

export class SnowflakeGenerator {
  private workerId: bigint;
  private sequence = 0n;
  private lastTimestamp = -1n;

  constructor(workerId: number = 1) {
    this.workerId = BigInt(workerId) & MAX_WORKER;
  }

  /**
   * 生成下一个 Snowflake ID（返回字符串，因为 JS number 无法安全存储 63 位整数）
   */
  nextId(): string {
    let timestamp = BigInt(Date.now()) - EPOCH;

    if (timestamp < this.lastTimestamp) {
      // 时钟回拨，等待至上次时间戳
      timestamp = this.lastTimestamp;
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE;
      if (this.sequence === 0n) {
        // 序列号溢出，抛出错误而非忙等待（避免 CPU 占满 + 单毫秒内最多 4096 个 ID）
        throw new Error('Snowflake sequence overflow: too many IDs generated in 1ms');
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;

    const id =
      (timestamp << (WORKER_BITS + SEQUENCE_BITS)) |
      (this.workerId << SEQUENCE_BITS) |
      this.sequence;

    return id.toString();
  }

  /**
   * 从 Snowflake ID 中提取时间戳
   */
  static extractTimestamp(id: string): Date {
    const bits = BigInt(id);
    const timestampMs = (bits >> (WORKER_BITS + SEQUENCE_BITS)) + EPOCH;
    return new Date(Number(timestampMs));
  }

  /**
   * 比较两个 Snowflake ID 的时间顺序
   * 返回负数表示 a 更早，正数表示 a 更晚，0 表示相同
   */
  static compare(a: string, b: string): number {
    const bigA = BigInt(a);
    const bigB = BigInt(b);
    if (bigA < bigB) return -1;
    if (bigA > bigB) return 1;
    return 0;
  }
}

export const snowflake = new SnowflakeGenerator(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Number((typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.WORKER_ID) || 1)
);
