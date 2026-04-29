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
    on: vi.fn(),
  },
  redisPub: { publish: vi.fn().mockResolvedValue(1) },
  redisSub: { subscribe: vi.fn(), on: vi.fn() },
  RedisKeys: {
    session: (id: string) => 'session:' + id,
    sceneMessages: (id: string) => 'scene:' + id + ':messages',
    userOnline: (id: string) => 'user:' + id + ':online',
  },
}));

/** 内存数据库存储（跨所有 builder 共享）*/
const rows: Record<string, any[]> = {
  users: [],
  campaigns: [],
  campaign_members: [],
  scenes: [],
  chat_messages: [],
  recruitment_posts: [],
  recruitment_applications: [],
  campaign_reviews: [],
  user_reputation: [],
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
  builder.orWhere = () => builder;
  builder.orWhereNull = () => builder;
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
  builder.max = (expr: string) => { builder._maxCol = expr; return builder; };
  builder.count = (_expr?: string) => { builder._countMode = true; return builder; };
  builder.clone = () => { const c = makeBuilder(table); Object.assign(c._where, builder._where); return c; };
  builder.union = (_other: any) => builder;
  builder.andWhereNot = (_key: string, _val: any) => builder;
  builder.forUpdate = () => builder;

  builder.insert = async (data: any) => {
    if (!rows[table]) rows[table] = [];
    const now = new Date().toISOString();
    const record = {
      id: table + '-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      uid: rows[table].length + 1000000,
      created_at: now,
      updated_at: now,
      ...data,
    };
    rows[table].push(record);
    return [record.id];
  };

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
      const colName = (builder._maxCol as string).split(' as ')[1] ?? builder._maxCol;
      const maxVal = (rows[table] ?? []).reduce((m: number, r: any) => Math.max(m, r.uid ?? 0), 0);
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
    try { resolve(execute()); } catch (e) { if (reject) reject(e); else resolve(undefined); }
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
