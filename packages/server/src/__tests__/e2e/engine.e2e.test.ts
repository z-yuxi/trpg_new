import { beforeEach, describe, expect, it } from 'vitest';
import { request, registerAndLogin, rows } from './setup';

const pw = 'Test1234!';
let seq = 0;
const phone = () => '138' + String(Date.now()).slice(-6) + String(++seq).padStart(2, '0');

/** 最小 COC7 规则集 fixture（纯 legacy 格式，无 Recipe） */
const COC7_RULESET_ID = 'rs_engine_test_001';
const COC7_RULESET = {
  id: COC7_RULESET_ID,
  name: 'COC7测试规则集',
  author_id: 'user_engine_test',
  status: 'published',
  legacy: true,
  recipe_source: null,
  compiled_graph: null,
  // 无自定义命令：依赖通用命令 /r
  commands: {},
};

describe('E2E - Engine /api/v1/engine/execute', () => {
  beforeEach(() => {
    // 确保规则集存在于内存 rows
    rows['rulesets'] = [{ ...COC7_RULESET }];
  });

  it('缺少 ruleset_id → 400', async () => {
    const token = await registerAndLogin(phone(), pw);
    const res = await request
      .post('/api/v1/engine/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ command: '.r' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error_code', 'RECIPE_NOT_FOUND');
  });

  it('缺少 command → 400', async () => {
    const token = await registerAndLogin(phone(), pw);
    const res = await request
      .post('/api/v1/engine/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ ruleset_id: COC7_RULESET_ID });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error_code', 'DSL_EVAL_ERROR');
  });

  it('未认证 → 401', async () => {
    const res = await request
      .post('/api/v1/engine/execute')
      .send({ ruleset_id: COC7_RULESET_ID, command: '.r' });

    expect(res.status).toBe(401);
  });

  it('规则集不存在 → 400 RECIPE_NOT_FOUND', async () => {
    const token = await registerAndLogin(phone(), pw);
    rows['rulesets'] = [];  // 清空
    const res = await request
      .post('/api/v1/engine/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ ruleset_id: 'not_exist', command: '/r' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error_code', 'RECIPE_NOT_FOUND');
  });

  it('执行成功：返回 success=true + dice_rolls', async () => {
    const token = await registerAndLogin(phone(), pw);
    const res = await request
      .post('/api/v1/engine/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ ruleset_id: COC7_RULESET_ID, command: '/r' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('result');
    expect(Array.isArray(res.body.dice_rolls)).toBe(true);
    expect(res.body.dice_rolls.length).toBeGreaterThanOrEqual(1);
    const roll = res.body.dice_rolls[0];
    expect(roll).toHaveProperty('expression');
    expect(roll).toHaveProperty('value');
    expect(typeof roll.value).toBe('number');
    expect(roll.value).toBeGreaterThanOrEqual(1);
    expect(roll.value).toBeLessThanOrEqual(100);
  });
});
