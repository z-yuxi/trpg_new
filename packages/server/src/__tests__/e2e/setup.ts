/**
 * E2E 测试设置工具 - 使用内存 mock 创建隔离的测试环境
 */
import { vi } from 'vitest';
import supertest from 'supertest';

// 设置测试所需环境变量（必须在任何模块导入之前）
process.env.JWT_SECRET = 'test_jwt_secret_for_e2e_testing_only';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'trpg';
process.env.DB_PASSWORD = 'trpg_password';
process.env.DB_NAME = 'trpg_platform';

// Mock express-rate-limit — disable all rate limiting in tests
vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock Redis（必须在 app 导入之前）
vi.mock('../../db/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    setex: vi.fn().mockResolvedValue('OK'),
    lrange: vi.fn().mockResolvedValue([]),
    lpush: vi.fn().mockResolvedValue(1),
    ltrim: vi.fn().mockResolvedValue('OK'),
    expire: vi.fn().mockResolvedValue(1),
    hset: vi.fn().mockResolvedValue(1),
    hget: vi.fn().mockResolvedValue(null),
    hdel: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    on: vi.fn(),
  },
  redisPub: { publish: vi.fn().mockResolvedValue(1) },
  redisSub: { subscribe: vi.fn(), on: vi.fn() },
  RedisKeys: {
    session: (id: string) => 'session:' + id,
    sceneMessages: (id: string) => 'scene:' + id + ':messages',
    userOnline: (id: string) => 'user:' + id + ':online',
    messageBuffer: (id: string) => 'campaign:' + id + ':messages',
  },
}));

/** 内存数据库存储（跨所有 builder 共享）*/
export const rows: Record<string, any[]> = {
  users: [],
  campaigns: [],
  campaign_members: [],
  scenes: [],
  chat_messages: [],
  recruitment_posts: [],
  recruitment_applications: [],
  campaign_reviews: [],
  user_reputation: [],
  reputation_audit_log: [],
  review_appeals: [],
  scheduled_moves: [],
  character_scene_states: [],
  character_sheets: [],
  scene_participations: [],
  position_history: [],
  // 模组 & 创作者经济系统
  modules: [],
  module_status_logs: [],
  module_reports: [],
  module_objections: [],
  module_sales: [],
  creator_earnings: [],
  withdrawal_requests: [],
  user_module_purchases: [],
  // 规则集
  rulesets: [],
  ruleset_versions: [],
  // 支付系统
  payment_orders: [],
  content_access_grants: [],
  payment_audit_log: [],
  coin_transactions: [],
  subscription_events: [],
  // 论坛
  forum_threads: [],
};

function makeBuilder(tableName: string): any {
  // 去除表别名（如 'modules as m' → 'modules'）
  const table = tableName.split(/\s+as\s+/i)[0].trim();
  const builder: any = {
    _where: {} as Record<string, any>,
    _whereIn: null as { col: string; vals: any[] } | null,
    _first: false,
    _maxCol: null as string | null,
    _countMode: false,
    _pendingInsertRecord: null as any,
    _insertResult: undefined as any,
  };

  // 去除列前缀（'m.id' → 'id'，'u.name' → 'name'）
  const col = (k: string) => k.includes('.') ? k.split('.').pop()! : k;

  builder.where = (cond: any, val?: any) => {
    if (typeof cond === 'string') builder._where[col(cond)] = val;
    else if (typeof cond === 'function') { /* subquery builder — no-op in mock */ }
    else Object.entries(cond).forEach(([k, v]) => { builder._where[col(k)] = v; });
    return builder;
  };
  builder.whereIn = (col: string, vals: any[]) => { builder._whereIn = { col, vals }; return builder; };
  // ─── Stubs: operadores não suportados retornam builder sem modificar _where ───
  builder.whereRaw = () => builder;
  builder.whereNull = () => builder;
  builder.whereNotNull = () => builder;
  builder.whereNot = () => builder;
  builder.andWhere = () => builder;
  builder.orWhere = () => builder;
  builder.orWhereNull = () => builder;
  builder.whereILike = () => builder;
  builder.orWhereILike = () => builder;
  builder.whereLike = () => builder;
  builder.orWhereLike = () => builder;
  builder.having = () => builder;
  builder.distinct = () => builder;
  builder.groupBy = () => builder;
  builder.modify = (fn: (b: any) => void) => { fn(builder); return builder; };
  builder.onConflict = () => ({ merge: () => builder, ignore: () => builder });
  builder.andOn = () => builder;
  builder.on = () => builder;
  builder.select = () => builder;
  builder.first = () => { builder._first = true; return builder; };
  builder.limit = () => builder;
  builder.offset = () => builder;
  builder.orderBy = () => builder;
  builder.join = () => builder;
  builder.leftJoin = () => builder;
  builder.max = (expr: string | Record<string, string>) => {
    if (typeof expr === 'object') {
      // e.g. { max_pos: 'waiting_position' } → store as 'waiting_position as max_pos'
      const [alias, col] = Object.entries(expr)[0];
      builder._maxCol = `${col} as ${alias}`;
    } else {
      builder._maxCol = expr;
    }
    return builder;
  };
  builder.count = (_expr?: string) => { builder._countMode = true; return builder; };
  builder.clone = () => { const c = makeBuilder(table); Object.assign(c._where, builder._where); return c; };
  builder.union = (_other: any) => builder;
  builder.andWhereNot = (_key: string, _val: any) => builder;
  builder.forUpdate = () => builder;
  builder.decrement = (_col: string, _n: number) => ({
    where: () => builder,
    then: (resolve: (v: any) => any) => { resolve(0); },
    catch: () => builder,
  });

  builder.insert = (data: any) => {
    if (!rows[table]) rows[table] = [];
    const now = new Date().toISOString();
    const record = {
      id: table + '-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      uid: rows[table].length + 1000000,
      created_at: now,
      updated_at: now,
      ...data,
    };
    // 将待插入数据存到 builder 状态，实际写入时机由 execute()、ignore()、or then 决定
    builder._pendingInsertRecord = record;
    builder._pendingInsertConflictSkip = false;
    return builder;
  };
  builder.onConflict = (cols?: string | string[]) => ({
    ignore: () => {
      // 如果有待插入数据，按冲突列去重（模拟真实 DB 的唯一约束）
      if (builder._pendingInsertRecord) {
        const rec = builder._pendingInsertRecord;
        if (!rows[table]) rows[table] = [];
        const conflictCols = cols
          ? (Array.isArray(cols) ? cols : [cols])
          : null;
        const exists = conflictCols && conflictCols.length > 0
          ? rows[table].some((r) => conflictCols.every((col) => r[col] === rec[col]))
          : rows[table].some((r) => r.id === rec.id);
        if (!exists) rows[table].push(rec);
        builder._insertResult = [rec.id];
        builder._pendingInsertRecord = null;
      }
      return builder;
    },
    merge: () => {
      if (builder._pendingInsertRecord) {
        if (!rows[table]) rows[table] = [];
        rows[table].push(builder._pendingInsertRecord);
        builder._insertResult = [builder._pendingInsertRecord.id];
        builder._pendingInsertRecord = null;
      }
      return builder;
    },
  });

  builder.update = async (data: any) => {
    if (!rows[table]) return 0;
    let count = 0;
    rows[table] = rows[table].map((r) => {
      if (Object.entries(builder._where).every(([k, v]) => r[k] === v)) {
        count++;
        return { ...r, ...data };
      }
      return r;
    });
    return count;
  };

  builder.delete = async () => {
    if (!rows[table]) return 0;
    const before = rows[table].length;
    rows[table] = rows[table].filter((r) =>
      !Object.entries(builder._where).every(([k, v]) => r[k] === v)
    );
    return before - rows[table].length;
  };

  const execute = () => {
    if (builder._countMode) {
      const filtered = (rows[table] ?? []).filter((r) =>
        Object.entries(builder._where).every(([k, v]) => r[k] === v)
      );
      const result = { count: String(filtered.length) };
      return builder._first ? result : [result];
    }
    if (builder._maxCol) {
      // _maxCol may be set via .max('col as alias') or .max({ alias: 'col' })
      // We stored the raw expression in _maxCol; extract real column name
      const rawExpr = builder._maxCol as string;
      const colName = rawExpr.includes(' as ') ? rawExpr.split(' as ')[1].trim() : rawExpr;
      const realCol = rawExpr.includes(' as ') ? rawExpr.split(' as ')[0].trim() : rawExpr;
      const filtered = (rows[table] ?? []).filter((r) =>
        Object.entries(builder._where).every(([k, v]) => r[k] === v)
      );
      const maxVal = filtered.length > 0
        ? filtered.reduce((m: number, r: any) => {
            const v = Number(r[realCol] ?? 0);
            return v > m ? v : m;
          }, 0)
        : null;
      const result = { [colName]: maxVal };
      return builder._first ? result : [result];
    }
    const result = (rows[table] ?? []).filter((r) => {
      const whereMatch = Object.entries(builder._where).every(([k, v]) => r[k] === v);
      const whereInMatch = !builder._whereIn
        ? true
        : builder._whereIn.vals.includes(r[builder._whereIn.col]);
      return whereMatch && whereInMatch;
    });
    return builder._first ? result[0] : result;
  };

  builder.then = (resolve: (v: any) => any, reject?: (e: any) => any) => {
    try {
      // 处理未经 onConflict 链的直接 insert（await builder.insert(data)）
      if (builder._pendingInsertRecord) {
        const rec = builder._pendingInsertRecord;
        if (!rows[table]) rows[table] = [];
        rows[table].push(rec);
        builder._insertResult = [rec.id];
        builder._pendingInsertRecord = null;
      }
      // 如果有 insertResult（经过 onConflict 处理），直接返回
      if (builder._insertResult !== undefined) {
        resolve(builder._insertResult);
        return;
      }
      resolve(execute());
    } catch (e) { if (reject) reject(e); else resolve(undefined); }
  };
  builder.catch = () => builder;
  return builder;
}

// Mock Knex
vi.mock('../../db/knex-config', () => {
  const knex = (table: string) => makeBuilder(table);
  (knex as any).fn = { now: () => new Date().toISOString() };
  return { default: knex };
});

// Mock db (user-service 使用 db 而非 knex 直接调用)
vi.mock('../../db', () => {
  const db = (table: string) => makeBuilder(table);
  (db as any).fn = { now: () => new Date().toISOString() };
  (db as any).raw = (sql: string) => sql;
  // Mock transaction：直接将 trx 作为普通 db builder 传入回调（不真正开启事务）
  (db as any).transaction = async (callback: (trx: any) => Promise<any>) => {
    const trx = (table: string) => makeBuilder(table);
    (trx as any).fn = { now: () => new Date().toISOString() };
    (trx as any).raw = (sql: string) => sql;
    return callback(trx);
  };
  return { db };
});

import app from '../../app';
export const request = supertest(app);

/** 注册并返回 access_token */
export async function registerAndLogin(phone: string, password = 'Test1234!') {
  const nickname = 'u' + phone.slice(-4);
  await request.post('/api/auth/register').send({ phone, password, nickname });
  const res = await request.post('/api/auth/login').send({ phone, password });
  return (res.body.tokens?.access_token ?? '') as string;
}

/**
 * 注册一个创作者身份的用户并返回 access_token。
 * 注册后直接修改内存 DB 将用户升级为 creator，再登录取 token。
 */
export async function registerAndLoginAsCreator(phone: string, password = 'Test1234!'): Promise<string> {
  const nickname = 'c' + phone.slice(-4);
  await request.post('/api/auth/register').send({ phone, password, nickname });
  // 注册成功后，直接通过手机号找到用户并升级为创作者
  const userRow = (rows['users'] ?? []).find((u) => u.phone === phone);
  if (userRow) {
    userRow.subscription_type = 'creator';
    userRow.user_type = JSON.stringify(['player', 'creator']);
  }
  const res = await request.post('/api/auth/login').send({ phone, password });
  return (res.body.tokens?.access_token ?? '') as string;
}

/**
 * 将指定 token 对应的用户升级为创作者（测试用）。
 * 直接操作内存数据库的 users 表，将 subscription_type 改为 'creator'。
 */
export function upgradeToCreator(token: string): void {
  if (!token || !token.includes('.')) return;
  try {
    // 从 JWT 解析 userId（不验证签名，仅读取 payload）
    const segment = token.split('.')[1];
    if (!segment) return;
    const payload = JSON.parse(Buffer.from(segment, 'base64').toString());
    const userId: string = payload.userId ?? payload.sub ?? '';
    if (!userId) return;
    const userRow = (rows['users'] ?? []).find((u) => u.id === userId);
    if (userRow) {
      userRow.subscription_type = 'creator';
      userRow.user_type = JSON.stringify(['player', 'creator']);
    }
  } catch {
    // 解析失败时静默忽略（测试环境可能返回 mock token 格式）
  }
}
