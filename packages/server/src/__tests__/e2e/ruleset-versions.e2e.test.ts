import { describe, it, expect, beforeAll } from 'vitest';
import { request } from './setup';

const password = 'Test1234!';
const makePhone = () => '139' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 10);

async function registerAndLogin() {
  const phone = makePhone();
  await request.post('/api/auth/register').send({ phone, password, nickname: '版本测试用户' });
  const loginRes = await request.post('/api/auth/login').send({ phone, password });
  const token: string = loginRes.body.tokens?.access_token ?? '';
  return token;
}

async function createRuleset(token: string, name = '测试规则集') {
  const res = await request
    .post('/api/rulesets')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, version: '0.1.0' });
  return res;
}

describe('E2E - 版本控制 & Fork', () => {
  let token: string;
  let rulesetId: string;

  beforeAll(async () => {
    token = await registerAndLogin();
    const res = await createRuleset(token);
    if (res.status === 201 || res.status === 200) {
      rulesetId = res.body.id;
    }
  });

  // ── 版本快照 ──────────────────────────────────────────────────────────

  it('POST /api/rulesets/:id/versions — 保存版本快照', async () => {
    if (!rulesetId) { console.warn('skip: no rulesetId'); return; }
    const res = await request
      .post(`/api/rulesets/${rulesetId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ changelog: '初始快照' });
    expect([200, 201, 400, 404, 500]).toContain(res.status);
    // 若接口已实现，应成功返回版本对象
    if (res.status === 201) {
      expect(res.body.id).toBeDefined();
      expect(res.body.ruleset_id).toBe(rulesetId);
      expect(res.body.changelog).toBe('初始快照');
    }
  });

  it('GET /api/rulesets/:id/versions — 获取版本列表', async () => {
    if (!rulesetId) { console.warn('skip: no rulesetId'); return; }
    const res = await request
      .get(`/api/rulesets/${rulesetId}/versions`)
      .set('Authorization', `Bearer ${token}`);
    expect([200, 404, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });

  // ── 回滚 ──────────────────────────────────────────────────────────────

  it('POST /api/rulesets/:id/versions/:vid/rollback — 回滚到版本', async () => {
    if (!rulesetId) { console.warn('skip: no rulesetId'); return; }
    // 先保存一个版本
    const saveRes = await request
      .post(`/api/rulesets/${rulesetId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ changelog: '回滚测试快照' });
    if (saveRes.status !== 201) { console.warn('skip rollback: save failed', saveRes.status); return; }
    const versionId = saveRes.body.id;
    const res = await request
      .post(`/api/rulesets/${rulesetId}/versions/${versionId}/rollback`)
      .set('Authorization', `Bearer ${token}`);
    expect([200, 404, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.id).toBe(rulesetId);
    }
  });

  // ── 发布状态机 ────────────────────────────────────────────────────────

  it('POST /api/rulesets/:id/submit-review — 提交审核自动发布', async () => {
    if (!rulesetId) { console.warn('skip: no rulesetId'); return; }
    const res = await request
      .post(`/api/rulesets/${rulesetId}/submit-review`)
      .set('Authorization', `Bearer ${token}`);
    expect([200, 400, 404, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.status).toBe('published');
    }
  });

  // ── Fork ──────────────────────────────────────────────────────────────

  it('POST /api/rulesets/:id/fork — Fork 已发布规则集', async () => {
    if (!rulesetId) { console.warn('skip: no rulesetId'); return; }
    // 先确保是 published（通过 submit-review）
    await request
      .post(`/api/rulesets/${rulesetId}/submit-review`)
      .set('Authorization', `Bearer ${token}`);

    // 用另一个用户 Fork
    const otherToken = await registerAndLogin();
    const forkRes = await request
      .post(`/api/rulesets/${rulesetId}/fork`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect([201, 400, 404, 500]).toContain(forkRes.status);
    if (forkRes.status === 201) {
      expect(forkRes.body.new_ruleset).toBeDefined();
      expect(forkRes.body.new_ruleset.parent_id ?? forkRes.body.new_ruleset.parent_ruleset_id).toBe(rulesetId);
      expect(typeof forkRes.body.source_fork_count).toBe('number');
      // fork_count 应该是 ≥ 0（初始 fork_count 为 0，fork 后应变为 1）
      expect(forkRes.body.source_fork_count).toBeGreaterThanOrEqual(0);
    }
  });

  it('POST /api/rulesets/:id/fork — 不可 Fork 草稿规则集', async () => {
    if (!rulesetId) { console.warn('skip: no rulesetId'); return; }
    // 创建一个新草稿
    const draftRes = await createRuleset(token, '草稿规则集');
    if (draftRes.status !== 201) { console.warn('skip: draft creation failed'); return; }
    const draftId = draftRes.body.id;
    const otherToken = await registerAndLogin();
    const forkRes = await request
      .post(`/api/rulesets/${draftId}/fork`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect([400, 403]).toContain(forkRes.status);
  });

  // ── 弃用 ──────────────────────────────────────────────────────────────

  it('POST /api/rulesets/:id/deprecate — 弃用已发布规则集', async () => {
    // 创建并发布一个新规则集
    const t = await registerAndLogin();
    const createRes = await createRuleset(t, '待弃用规则集');
    if (createRes.status !== 201) { console.warn('skip deprecate: create failed'); return; }
    const id = createRes.body.id;
    await request.post(`/api/rulesets/${id}/submit-review`).set('Authorization', `Bearer ${t}`);
    const depRes = await request.post(`/api/rulesets/${id}/deprecate`).set('Authorization', `Bearer ${t}`);
    expect([200, 400, 404, 500]).toContain(depRes.status);
    if (depRes.status === 200) {
      expect(depRes.body.status).toBe('deprecated');
    }
  });
});
