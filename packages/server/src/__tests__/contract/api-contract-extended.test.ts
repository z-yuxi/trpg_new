/**
 * api-contract-extended.test.ts
 *
 * 扩展合同测试 — 补全主链路端点覆盖
 *
 * 覆盖范围：
 *   ┌ 战役模块
 *   │  ├ POST /api/campaigns            — 创建战役响应形状
 *   │  ├ GET  /api/campaigns            — 列表响应形状
 *   │  └ GET  /api/campaigns/:id        — 详情响应形状
 *   ├ 场景模块
 *   │  ├ POST /api/campaigns/:id/scenes — 创建场景响应形状
 *   │  └ GET  /api/campaigns/:id/scenes — 场景列表
 *   ├ 角色卡模块
 *   │  ├ POST /api/characters           — 创建角色卡响应形状
 *   │  └ GET  /api/characters           — 角色卡列表
 *   ├ 规则集模块
 *   │  ├ GET  /api/rulesets             — 公开列表
 *   │  ├ POST /api/rulesets             — 创建（创作者）
 *   │  └ GET  /api/rulesets/mine        — 我的规则集
 *   ├ 模组模块
 *   │  ├ GET  /api/modules              — 公开列表
 *   │  ├ POST /api/modules              — 创建（创作者）
 *   │  ├ GET  /api/modules/:id          — 详情
 *   │  ├ GET  /api/modules/mine         — 我的模组
 *   │  ├ POST /api/modules/:id/submit   — 提交审核
 *   │  └ GET  /api/modules/:id/public-notice — 公示期信息
 *   └ 创作者收益模块
 *      ├ GET  /api/creator/earnings/summary    — 收益汇总
 *      ├ GET  /api/creator/earnings/sales      — 销售明细
 *      ├ GET  /api/creator/earnings/withdrawals — 提现列表
 *      └ POST /api/creator/earnings/withdrawals — 提现申请（校验）
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { request, registerAndLogin, registerAndLoginAsCreator, rows } from '../e2e/setup';

// ─────────────────────────────────────────────────────────────────────────────
// 轻量 Schema 校验器（与 api-contract.test.ts 保持同款）
// ─────────────────────────────────────────────────────────────────────────────

type FieldSpec = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  enum?: unknown[];
  nullable?: boolean;
};

function assertShape(
  obj: Record<string, unknown>,
  schema: Record<string, FieldSpec>,
  required: string[],
  context = 'body',
): void {
  for (const field of required) {
    expect(obj, `${context}: missing required field "${field}"`).toHaveProperty(field);
    const val = obj[field];
    const spec = schema[field];
    if (!spec) continue;
    if (val === null) {
      expect(spec.nullable, `${context}.${field}: got null but not nullable`).toBe(true);
      continue;
    }
    if (spec.type === 'integer' || spec.type === 'number') {
      expect(typeof val, `${context}.${field}: expected number`).toBe('number');
    } else if (spec.type === 'array') {
      expect(Array.isArray(val), `${context}.${field}: expected array`).toBe(true);
    } else {
      expect(typeof val, `${context}.${field}: expected ${spec.type}`).toBe(spec.type);
    }
    if (spec.enum && val !== null) {
      expect(spec.enum, `${context}.${field}: enum mismatch, got "${val}"`).toContain(val);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 合同 Schema 定义
// ─────────────────────────────────────────────────────────────────────────────

/** Campaign */
const CONTRACT_CAMPAIGN: Record<string, FieldSpec> = {
  id:               { type: 'string' },
  name:             { type: 'string' },
  gm_user_id:       { type: 'string' },
  ruleset_id:       { type: 'string' },
  module_id:        { type: 'string', nullable: true },
  status:           { type: 'string' },
  room_code:        { type: 'string', nullable: true },
  created_at:       { type: 'string' },
};
const REQUIRED_CAMPAIGN = ['id', 'name', 'gm_user_id', 'ruleset_id', 'status', 'created_at'];

/** Scene */
const CONTRACT_SCENE: Record<string, FieldSpec> = {
  id:           { type: 'string' },
  campaign_id:  { type: 'string' },
  name:         { type: 'string' },
  type:         { type: 'string', nullable: true },
  created_at:   { type: 'string' },
};
const REQUIRED_SCENE = ['id', 'campaign_id', 'name', 'created_at'];

/** CharacterSheet */
const CONTRACT_CHARACTER: Record<string, FieldSpec> = {
  id:          { type: 'string' },
  user_id:     { type: 'string' },
  ruleset_id:  { type: 'string' },
  name:        { type: 'string' },
  created_at:  { type: 'string' },
};
const REQUIRED_CHARACTER = ['id', 'user_id', 'ruleset_id', 'name', 'created_at'];

/** Ruleset */
const CONTRACT_RULESET: Record<string, FieldSpec> = {
  id:          { type: 'string' },
  name:        { type: 'string' },
  version:     { type: 'string' },
  status:      { type: 'string', enum: ['draft', 'published', 'archived'] },
  author_id:   { type: 'string', nullable: true },
  created_at:  { type: 'string' },
};
const REQUIRED_RULESET = ['id', 'name', 'version', 'status', 'created_at'];

/** Module */
const CONTRACT_MODULE: Record<string, FieldSpec> = {
  id:             { type: 'string' },
  name:           { type: 'string' },
  author_id:      { type: 'string' },
  ruleset_id:     { type: 'string' },
  status:         { type: 'string', enum: ['draft', 'reviewing', 'public_notice', 'public', 'suspended', 'archived'] },
  price:          { type: 'number' },
  rating:         { type: 'number' },
  download_count: { type: 'integer' },
  created_at:     { type: 'string' },
};
const REQUIRED_MODULE = ['id', 'name', 'author_id', 'ruleset_id', 'status', 'price', 'rating', 'download_count', 'created_at'];

/** EarningsSummary */
const CONTRACT_EARNINGS_SUMMARY: Record<string, FieldSpec> = {
  user_id:               { type: 'string' },
  available_cents:       { type: 'integer' },
  total_earned_cents:    { type: 'integer' },
  total_withdrawn_cents: { type: 'integer' },
};
const REQUIRED_EARNINGS_SUMMARY = ['user_id', 'available_cents', 'total_earned_cents', 'total_withdrawn_cents'];

/** WithdrawalRequest */
const CONTRACT_WITHDRAWAL: Record<string, FieldSpec> = {
  id:            { type: 'string' },
  user_id:       { type: 'string' },
  amount_cents:  { type: 'integer' },
  channel:       { type: 'string', enum: ['alipay', 'wechat', 'bank'] },
  status:        { type: 'string', enum: ['pending', 'processing', 'paid', 'rejected'] },
  created_at:    { type: 'string' },
};
const REQUIRED_WITHDRAWAL = ['id', 'user_id', 'amount_cents', 'channel', 'status', 'created_at'];

/** 分页响应 */
const CONTRACT_PAGED: Record<string, FieldSpec> = {
  data:  { type: 'array' },
  total: { type: 'integer' },
};
const REQUIRED_PAGED = ['data', 'total'];

// ─────────────────────────────────────────────────────────────────────────────
// 测试夹具
// ─────────────────────────────────────────────────────────────────────────────

const pw = 'Test1234!';
let seq = 0;
const uid = () => '166' + String(Date.now()).slice(-5) + String(++seq).padStart(2, '0');

let gmToken = '';
let creatorToken = '';
let gmUserId = '';
let creatorUserId = '';

let campaignId = '';
let characterId = '';
let rulesetId = '';
let moduleId = '';

beforeAll(async () => {
  gmToken = await registerAndLogin(uid(), pw);
  creatorToken = await registerAndLoginAsCreator(uid(), pw);

  const me = await request.get('/api/users/me').set('Authorization', 'Bearer ' + gmToken);
  gmUserId = me.body?.id ?? '';

  const cme = await request.get('/api/users/me').set('Authorization', 'Bearer ' + creatorToken);
  creatorUserId = cme.body?.id ?? '';

  // 准备 ruleset seed（直接插入内存）
  rows['rulesets'].push({
    id: 'seed-ruleset-ext-001',
    name: '合同测试规则集',
    author_id: creatorUserId,
    status: 'published',
    version: '1.0.0',
    description: '合同测试专用',
    atoms: '{}',
    connections: '{}',
    commands: '{}',
    character_card_schema: '{}',
    legacy: 0,
    recipe_source: null,
    compiled_graph: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}, 20_000);

// ─────────────────────────────────────────────────────────────────────────────
// 测试组 1：战役合同
// ─────────────────────────────────────────────────────────────────────────────

describe('合同 — 战役模块（campaigns）', () => {
  it('POST /api/campaigns — 创建战役响应形状', async () => {
    const res = await request
      .post('/api/campaigns')
      .set('Authorization', 'Bearer ' + gmToken)
      .send({ name: '合同测试战役', ruleset_id: 'seed-ruleset-ext-001' });

    expect([201, 200]).toContain(res.status);
    if (res.status === 201 || res.status === 200) {
      assertShape(res.body, CONTRACT_CAMPAIGN, REQUIRED_CAMPAIGN, 'campaign.create');
      campaignId = res.body.id ?? '';
    }
  });

  it('GET /api/campaigns — 列表不报 5xx', async () => {
    const res = await request.get('/api/campaigns').set('Authorization', 'Bearer ' + gmToken);
    expect(res.status).not.toBe(500);
    expect(res.status).not.toBe(503);
  });

  it('GET /api/campaigns/:id — 详情响应形状', async () => {
    if (!campaignId) return;
    const res = await request
      .get(`/api/campaigns/${campaignId}`)
      .set('Authorization', 'Bearer ' + gmToken);

    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_CAMPAIGN, REQUIRED_CAMPAIGN, 'campaign.detail');
  });

  it('GET /api/campaigns/:id — 非成员返回 403/404', async () => {
    if (!campaignId) return;
    const otherToken = await registerAndLogin(uid(), pw);
    const res = await request
      .get(`/api/campaigns/${campaignId}`)
      .set('Authorization', 'Bearer ' + otherToken);

    expect([403, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 测试组 2：场景合同
// ─────────────────────────────────────────────────────────────────────────────

describe('合同 — 场景模块（scenes）', () => {
  it('POST /api/campaigns/:id/scenes — 创建场景响应形状', async () => {
    if (!campaignId) return;
    const res = await request
      .post(`/api/campaigns/${campaignId}/scenes`)
      .set('Authorization', 'Bearer ' + gmToken)
      .send({ name: '合同测试场景', type: 'room' });

    expect([201, 200]).toContain(res.status);
    if (res.status === 201 || res.status === 200) {
      assertShape(res.body, CONTRACT_SCENE, REQUIRED_SCENE, 'scene.create');
      expect(res.body.campaign_id).toBe(campaignId);
    }
  });

  it('GET /api/campaigns/:id/scenes — 列表响应含数组', async () => {
    if (!campaignId) return;
    const res = await request
      .get(`/api/campaigns/${campaignId}/scenes`)
      .set('Authorization', 'Bearer ' + gmToken);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 测试组 3：角色卡合同
// ─────────────────────────────────────────────────────────────────────────────

describe('合同 — 角色卡模块（characters）', () => {
  it('POST /api/characters — 创建角色卡响应形状', async () => {
    const res = await request
      .post('/api/characters')
      .set('Authorization', 'Bearer ' + gmToken)
      .send({ ruleset_id: 'seed-ruleset-ext-001', name: '合同测试角色', attributes: {}, skills: {} });

    expect([201, 200]).toContain(res.status);
    if (res.status === 201 || res.status === 200) {
      assertShape(res.body, CONTRACT_CHARACTER, REQUIRED_CHARACTER, 'character.create');
      characterId = res.body.id ?? '';
    }
  });

  it('GET /api/characters — 列表为数组', async () => {
    const res = await request.get('/api/characters').set('Authorization', 'Bearer ' + gmToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/characters/:id — 详情响应形状', async () => {
    if (!characterId) return;
    const res = await request
      .get(`/api/characters/${characterId}`)
      .set('Authorization', 'Bearer ' + gmToken);

    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_CHARACTER, REQUIRED_CHARACTER, 'character.detail');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 测试组 4：规则集合同
// ─────────────────────────────────────────────────────────────────────────────

describe('合同 — 规则集模块（rulesets）', () => {
  it('GET /api/rulesets — 公开列表包含 data/total', async () => {
    const res = await request.get('/api/rulesets');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/rulesets — 创作者创建规则集响应形状', async () => {
    const res = await request
      .post('/api/rulesets')
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ name: '合同测试规则集-新建', version: '1.0.0', description: '合同测试' });

    expect([201, 200]).toContain(res.status);
    if (res.status === 201 || res.status === 200) {
      assertShape(res.body, CONTRACT_RULESET, REQUIRED_RULESET, 'ruleset.create');
      expect(res.body.status).toBe('draft');
      rulesetId = res.body.id ?? '';
    }
  });

  it('GET /api/rulesets/mine — 创作者规则集列表', async () => {
    const res = await request
      .get('/api/rulesets/mine')
      .set('Authorization', 'Bearer ' + creatorToken);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/rulesets — 非创作者返回 403', async () => {
    const res = await request
      .post('/api/rulesets')
      .set('Authorization', 'Bearer ' + gmToken)
      .send({ name: '越权测试', version: '1.0.0' });

    expect([403, 401]).toContain(res.status);
  });

  it('POST /api/rulesets — name 缺失返回 400', async () => {
    const res = await request
      .post('/api/rulesets')
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ version: '1.0.0' });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 测试组 5：模组合同
// ─────────────────────────────────────────────────────────────────────────────

describe('合同 — 模组模块（modules）', () => {
  it('GET /api/modules — 公开列表包含 data/total', async () => {
    const res = await request.get('/api/modules');
    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_PAGED, REQUIRED_PAGED, 'modules.list');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/modules — keyword 筛选不报 5xx', async () => {
    const res = await request.get('/api/modules?keyword=测试');
    expect(res.status).not.toBe(500);
  });

  it('POST /api/modules — 创作者创建模组响应形状', async () => {
    const res = await request
      .post('/api/modules')
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ name: '合同测试模组', ruleset_id: 'seed-ruleset-ext-001', description: '合同测试' });

    expect([201, 200]).toContain(res.status);
    if (res.status === 201 || res.status === 200) {
      assertShape(res.body, CONTRACT_MODULE, REQUIRED_MODULE, 'module.create');
      expect(res.body.status).toBe('draft');
      moduleId = res.body.id ?? '';
    }
  });

  it('GET /api/modules/mine — 我的模组列表', async () => {
    const res = await request
      .get('/api/modules/mine')
      .set('Authorization', 'Bearer ' + creatorToken);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/modules/:id — 详情响应形状', async () => {
    if (!moduleId) return;
    const res = await request
      .get(`/api/modules/${moduleId}`)
      .set('Authorization', 'Bearer ' + creatorToken);

    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_MODULE, REQUIRED_MODULE, 'module.detail');
  });

  it('POST /api/modules/:id/submit — 提交审核后状态变更', async () => {
    if (!moduleId) return;
    const res = await request
      .post(`/api/modules/${moduleId}/submit`)
      .set('Authorization', 'Bearer ' + creatorToken);

    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_MODULE, REQUIRED_MODULE, 'module.submit');
    expect(['reviewing', 'public_notice']).toContain(res.body.status);
  });

  it('GET /api/modules/:id/public-notice — 公示期信息响应形状', async () => {
    if (!moduleId) return;
    const res = await request.get(`/api/modules/${moduleId}/public-notice`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('is_in_notice');
    expect(typeof res.body.is_in_notice).toBe('boolean');
  });

  it('POST /api/modules — 非创作者返回 403', async () => {
    const res = await request
      .post('/api/modules')
      .set('Authorization', 'Bearer ' + gmToken)
      .send({ name: '越权测试', ruleset_id: 'seed-ruleset-ext-001' });

    expect([403, 401]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 测试组 6：创作者收益合同
// ─────────────────────────────────────────────────────────────────────────────

describe('合同 — 创作者收益（creator/earnings）', () => {
  it('GET /creator/earnings/summary — 响应形状', async () => {
    const res = await request
      .get('/api/creator/earnings/summary')
      .set('Authorization', 'Bearer ' + creatorToken);

    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_EARNINGS_SUMMARY, REQUIRED_EARNINGS_SUMMARY, 'earnings.summary');
    // 所有余额字段必须为非负整数
    expect(res.body.available_cents).toBeGreaterThanOrEqual(0);
    expect(res.body.total_earned_cents).toBeGreaterThanOrEqual(0);
    expect(res.body.total_withdrawn_cents).toBeGreaterThanOrEqual(0);
  });

  it('GET /creator/earnings/sales — 分页响应形状', async () => {
    const res = await request
      .get('/api/creator/earnings/sales')
      .set('Authorization', 'Bearer ' + creatorToken);

    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_PAGED, REQUIRED_PAGED, 'earnings.sales');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
    expect(res.body.limit).toBeLessThanOrEqual(50);
  });

  it('GET /creator/earnings/withdrawals — 分页响应形状', async () => {
    const res = await request
      .get('/api/creator/earnings/withdrawals')
      .set('Authorization', 'Bearer ' + creatorToken);

    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_PAGED, REQUIRED_PAGED, 'earnings.withdrawals');
  });

  it('POST /creator/earnings/withdrawals — 校验失败返回 400', async () => {
    const res = await request
      .post('/api/creator/earnings/withdrawals')
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ amount_cents: -100, channel: 'invalid_channel', account_info: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /creator/earnings/withdrawals — 余额不足返回 422', async () => {
    const res = await request
      .post('/api/creator/earnings/withdrawals')
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ amount_cents: 999_999_999, channel: 'alipay', account_info: 'big@example.com' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/insufficient|minimum/);
  });

  it('GET /creator/earnings/summary — 未认证返回 401', async () => {
    const res = await request.get('/api/creator/earnings/summary');
    expect(res.status).toBe(401);
  });

  it('GET /creator/earnings/summary — 非创作者返回 403', async () => {
    const res = await request
      .get('/api/creator/earnings/summary')
      .set('Authorization', 'Bearer ' + gmToken);

    expect([403, 401]).toContain(res.status);
  });
});
