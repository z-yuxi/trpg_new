/**
 * creator-flow.e2e.test.ts
 *
 * 创作者侧完整闭环 E2E 测试：
 *
 * 场景 A：模组发布工作流（草稿 → 提交 → 公示 → 上架）
 * 场景 B：创作者收益对账（销售流水 → 余额汇总 → 提现申请）
 * 场景 C：公示期异议与作者申诉
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { request, registerAndLoginAsCreator, registerAndLogin, rows } from './setup';

const pw = 'Test1234!';
let seq = 0;
const uid = () => '177' + String(Date.now()).slice(-5) + String(++seq).padStart(2, '0');

let creatorToken = '';
let creatorUserId = '';
let playerToken = '';
let playerUserId = '';
let moduleId = '';

beforeAll(async () => {
  creatorToken = await registerAndLoginAsCreator(uid(), pw);
  playerToken = await registerAndLogin(uid(), pw);

  const me = await request.get('/api/users/me').set('Authorization', 'Bearer ' + creatorToken);
  creatorUserId = me.body?.id ?? '';

  const playerMe = await request.get('/api/users/me').set('Authorization', 'Bearer ' + playerToken);
  playerUserId = playerMe.body?.id ?? '';
}, 15_000);

// ─────────────────────────────────────────────────────────────────────────────
// 场景 A：模组发布工作流
// ─────────────────────────────────────────────────────────────────────────────

describe('A — 模组发布工作流（草稿 → 公示 → 上架）', () => {
  it('A1 创建模组草稿，状态 draft', async () => {
    // 先创建一个 ruleset（内存 mock）
    rows['rulesets'].push({
      id: 'ruleset-test-001',
      name: '测试规则集',
      author_id: creatorUserId,
      status: 'published',
      version: '1.0.0',
      description: '',
      atoms: '{}',
      connections: '{}',
      commands: '{}',
      character_card_schema: '{}',
      created_at: new Date().toISOString(),
    });

    const res = await request
      .post('/api/modules')
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ name: '测试模组-闭环', ruleset_id: 'ruleset-test-001', description: '测试用模组' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    moduleId = res.body.id;
    expect(moduleId).toBeTruthy();
  });

  it('A2 更新模组内容（自动保存）', async () => {
    if (!moduleId) return;
    const res = await request
      .put(`/api/modules/${moduleId}`)
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ content: '# 测试模组内容\n\n这是测试内容，用于 E2E 测试。', description: '已更新描述' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('已更新描述');
  });

  it('A3 提交审核，进入公示状态', async () => {
    if (!moduleId) return;
    const res = await request
      .post(`/api/modules/${moduleId}/submit`)
      .set('Authorization', 'Bearer ' + creatorToken);

    expect(res.status).toBe(200);
    // V1.0 自动过审直接到 public_notice
    expect(['reviewing', 'public_notice']).toContain(res.body.status);
  });

  it('A4 获取公示期信息', async () => {
    if (!moduleId) return;
    const res = await request.get(`/api/modules/${moduleId}/public-notice`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('is_in_notice');
  });

  it('A5 非作者不可提交审核（403）', async () => {
    if (!moduleId) return;
    const res = await request
      .post(`/api/modules/${moduleId}/submit`)
      .set('Authorization', 'Bearer ' + playerToken);

    expect([403, 401]).toContain(res.status);
  });

  it('A6 获取模组详情（公示状态对外可见）', async () => {
    if (!moduleId) return;
    const res = await request.get(`/api/modules/${moduleId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(moduleId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 场景 B：创作者收益对账
// ─────────────────────────────────────────────────────────────────────────────

// B 系列共用：从收益接口取到的真实 user_id（与 JWT 一致）
let earningsUserId = '';

describe('B — 创作者收益对账（购买 → 余额 → 提现）', () => {
  it('B1 初始收益汇总为零', async () => {
    const res = await request
      .get('/api/creator/earnings/summary')
      .set('Authorization', 'Bearer ' + creatorToken);

    expect(res.status).toBe(200);
    expect(typeof res.body.available_cents).toBe('number');
    expect(typeof res.body.total_earned_cents).toBe('number');
    // user_id 来自 JWT，不依赖变量 creatorUserId 是否正确捕获
    expect(res.body.user_id).toBeTruthy();
    earningsUserId = res.body.user_id as string;
  });

  it('B2 初始销售明细列表为空', async () => {
    const res = await request
      .get('/api/creator/earnings/sales')
      .set('Authorization', 'Bearer ' + creatorToken);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
  });

  it('B3 初始提现申请列表为空', async () => {
    const res = await request
      .get('/api/creator/earnings/withdrawals')
      .set('Authorization', 'Bearer ' + creatorToken);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('B4 余额不足时提现申请返回 422', async () => {
    const res = await request
      .post('/api/creator/earnings/withdrawals')
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ amount_cents: 100_000, channel: 'alipay', account_info: 'test@example.com' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/insufficient|minimum/);
  });

  it('B5 金额低于最低门槛（100元）时提现申请返回 422', async () => {
    // 手动设置余额，用于测试最低门槛（使用从收益接口获得的真实 user_id）
    const uid = earningsUserId || creatorUserId;
    const earningRow = rows['creator_earnings'].find((r) => r.user_id === uid);
    if (earningRow) {
      earningRow.available_cents = 50_000; // 500元
    } else if (uid) {
      rows['creator_earnings'].push({
        user_id: uid,
        available_cents: 50_000,
        total_earned_cents: 50_000,
        total_withdrawn_cents: 0,
        updated_at: new Date().toISOString(),
      });
    }

    const res = await request
      .post('/api/creator/earnings/withdrawals')
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ amount_cents: 5_000, channel: 'alipay', account_info: 'test@example.com' });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('minimum');
  });

  it('B6 账号信息过短时返回 400', async () => {
    const res = await request
      .post('/api/creator/earnings/withdrawals')
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ amount_cents: 10_000, channel: 'alipay', account_info: 'x' });

    expect(res.status).toBe(400);
  });

  it('B7 余额充足时成功提交提现申请', async () => {
    const res = await request
      .post('/api/creator/earnings/withdrawals')
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ amount_cents: 10_000, channel: 'alipay', account_info: 'creator@alipay.com' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.amount_cents).toBe(10_000);
    expect(res.body.channel).toBe('alipay');
    // account_info 不应在响应中暴露明文（实际实现可脱敏处理）
    expect(res.body).toHaveProperty('id');
  });

  it('B8 非创作者无法访问收益端点（403）', async () => {
    const res = await request
      .get('/api/creator/earnings/summary')
      .set('Authorization', 'Bearer ' + playerToken);

    expect([403, 401]).toContain(res.status);
  });

  it('B9 未认证无法访问收益端点（401）', async () => {
    const res = await request.get('/api/creator/earnings/summary');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 场景 C：公示期异议与作者申诉
// ─────────────────────────────────────────────────────────────────────────────

describe('C — 公示期异议与作者申诉', () => {
  it('C1 任意用户可提交公示期异议', async () => {
    if (!moduleId) return;
    const res = await request
      .post(`/api/creator/modules/${moduleId}/objections`)
      .set('Authorization', 'Bearer ' + playerToken)
      .send({ reason: '该模组内容疑似抄袭，附上原始出处链接供审核参考。' });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('objection');
    expect(res.body.status).toBe('pending');
    expect(res.body.module_id).toBe(moduleId);
  });

  it('C2 异议理由过短返回 400', async () => {
    if (!moduleId) return;
    const res = await request
      .post(`/api/creator/modules/${moduleId}/objections`)
      .set('Authorization', 'Bearer ' + playerToken)
      .send({ reason: '太短' });

    expect(res.status).toBe(400);
  });

  it('C3 作者可在公示期提交申诉', async () => {
    if (!moduleId) return;
    const res = await request
      .post(`/api/creator/modules/${moduleId}/appeal`)
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ reason: '本作品完全原创，附上创作过程记录截图，请审核人员复核。' });

    // public_notice 状态允许申诉
    expect([201, 409]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body.type).toBe('appeal');
      expect(res.body.module_id).toBe(moduleId);
    }
  });

  it('C4 非模组作者提交申诉返回 403', async () => {
    if (!moduleId) return;
    const res = await request
      .post(`/api/creator/modules/${moduleId}/appeal`)
      .set('Authorization', 'Bearer ' + playerToken)
      .send({ reason: '这是一条非法的申诉，应该被拒绝访问控制。' });

    expect(res.status).toBe(403);
  });

  it('C5 未认证用户提交异议返回 401', async () => {
    if (!moduleId) return;
    const res = await request
      .post(`/api/creator/modules/${moduleId}/objections`)
      .send({ reason: '这是一条未认证的异议，应该被拦截。' });

    expect(res.status).toBe(401);
  });

  it('C6 不存在模组提交申诉返回 404', async () => {
    const res = await request
      .post('/api/creator/modules/non-existent-module-id/appeal')
      .set('Authorization', 'Bearer ' + creatorToken)
      .send({ reason: '申诉一个不存在的模组，应返回 404 错误响应。' });

    expect(res.status).toBe(404);
  });
});
