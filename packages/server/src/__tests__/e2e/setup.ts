/**
 * E2E 测试设置工具 - 使用内存 mock 创建隔离的测试环境
 */
import { vi } from 'vitest';
import supertest from 'supertest';

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
};

function makeBuilder(table: string): any {
  const builder: any = {
    _where: {} as Record<string, any>,
    _whereIn: null as { col: string; vals: any[] } | null,
    _first: false,
    _maxCol: null as string | null,
  };

  builder.where = (cond: any, val?: any) => {
    if (typeof cond === 'string') builder._where[cond] = val;
    else Object.assign(builder._where, cond);
    return builder;
  };
  builder.whereIn = (col: string, vals: any[]) => { builder._whereIn = { col, vals }; return builder; };
  builder.select = () => builder;
  builder.first = () => { builder._first = true; return builder; };
  builder.limit = () => builder;
  builder.orderBy = () => builder;
  builder.join = () => builder;
  builder.leftJoin = () => builder;
  builder.max = (expr: string) => { builder._maxCol = expr; return builder; };

  builder.insert = async (data: any) => {
    if (!rows[table]) rows[table] = [];
    const record = {
      id: table + '-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      uid: rows[table].length + 1000000,
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
