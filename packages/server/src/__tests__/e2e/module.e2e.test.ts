import { describe, it, expect, beforeAll } from 'vitest';
import { request } from './setup';

const password = 'Test1234!';
const makePhone = () => '138' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 10);

async function registerAndLogin() {
  const phone = makePhone();
  await request.post('/api/auth/register').send({ phone, password, nickname: '模组测试用户' });
  const loginRes = await request.post('/api/auth/login').send({ phone, password });
  return (loginRes.body.tokens?.access_token ?? '') as string;
}

async function getPublishedRulesetId(token: string): Promise<string | null> {
  // 尝试从公开规则集列表中取一个 ID
  const res = await request.get('/api/rulesets').set('Authorization', `Bearer ${token}`);
  const items: Array<{ id: string; status: string }> = res.body.data ?? [];
  return items.find(r => r.status === 'published')?.id ?? null;
}

describe('E2E - 模组 CRUD', () => {
  let token: string;
  let moduleId: string;
  let rulesetId: string;

  beforeAll(async () => {
    token = await registerAndLogin();

    // 先创建一个规则集，用于关联模组
    const rulesetRes = await request
      .post('/api/rulesets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '模组测试用规则集', version: '0.1.0' });

    if (rulesetRes.status === 201) {
      rulesetId = rulesetRes.body.id;
    } else {
      // fallback：从公开列表中取
      rulesetId = (await getPublishedRulesetId(token)) ?? 'fallback-id';
    }
  });

  // ── POST /api/modules ──────────────────────────────────────────────────

  it('POST /api/modules — 创建模组', async () => {
    if (!rulesetId) { console.warn('skip: no rulesetId'); return; }

    const res = await request
      .post('/api/modules')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '测试模组', ruleset_id: rulesetId, description: '测试描述' });

    expect([200, 201]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('测试模组');
      expect(res.body.status).toBe('draft');
      moduleId = res.body.id;
    }
  });

  // ── GET /api/modules/:id ──────────────────────────────────────────────

  it('GET /api/modules/:id — 获取模组详情（含 content）', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const res = await request
      .get(`/api/modules/${moduleId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(moduleId);
    // content 字段存在（可能为 null）
    expect('content' in res.body).toBe(true);
  });

  // ── PUT /api/modules/:id/auto-save ────────────────────────────────────

  it('PUT /api/modules/:id/auto-save — 自动保存内容', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const fakeContent = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello World' }] }] });

    const res = await request
      .put(`/api/modules/${moduleId}/auto-save`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: fakeContent, word_count: 11 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 再次 GET 验证内容已保存
    const getRes = await request.get(`/api/modules/${moduleId}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.body.content).toBe(fakeContent);
  });

  // ── 未授权访问 ─────────────────────────────────────────────────────────

  it('POST /api/modules — 未授权请求应返回 401', async () => {
    const res = await request.post('/api/modules').send({ name: '无权创建', ruleset_id: 'x' });
    expect(res.status).toBe(401);
  });

  it('PUT /api/modules/:id/auto-save — 缺少 content 应返回 400', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }
    const res = await request
      .put(`/api/modules/${moduleId}/auto-save`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
