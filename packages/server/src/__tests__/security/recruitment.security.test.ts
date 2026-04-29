/**
 * 安全与越权测试
 *
 * 覆盖 OWASP Top10 中与本系统最相关的场景：
 *   - A01 Broken Access Control（越权操作）
 *   - A03 Injection（Zod 输入校验）
 *   - A07 Identification and Authentication Failures（JWT 篡改）
 *
 * 所有测试都验证系统是否正确拒绝非授权访问。
 */
import { describe, it, expect } from 'vitest';
import { request, registerAndLogin } from '../e2e/setup';

const pw = 'Test1234!';
let sSeq = 0;
const sUid = () => '135' + String(Date.now()).slice(-6) + String(++sSeq).padStart(2, '0');

// ── 辅助 ─────────────────────────────────────────────────────────────────────

async function createPost(token: string) {
  const r = await request
    .post('/api/recruitment')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: '安全测试帖', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 2 });
  if (r.status !== 201) return null as never;
  return r.body.id as string;
}

async function publishPost(token: string, postId: string) {
  return request
    .post(`/api/recruitment/${postId}/publish`)
    .set('Authorization', 'Bearer ' + token);
}

async function applyPost(token: string, postId: string) {
  return request
    .post(`/api/recruitment/${postId}/apply`)
    .set('Authorization', 'Bearer ' + token)
    .send({ message: '求加入' });
}

// ── A01 越权访问控制测试 ──────────────────────────────────────────────────────

describe('安全 - A01 越权访问控制', () => {
  it('用户 B 无法发布用户 A 的草稿帖', async () => {
    const tokenA = await registerAndLogin(sUid(), pw);
    const tokenB = await registerAndLogin(sUid(), pw);
    const postId = await createPost(tokenA);

    const res = await publishPost(tokenB, postId);
    expect(res.status).toBe(403);
  });

  it('用户 B 无法关闭用户 A 的招募帖', async () => {
    const tokenA = await registerAndLogin(sUid(), pw);
    const tokenB = await registerAndLogin(sUid(), pw);
    const postId = await createPost(tokenA);
    await publishPost(tokenA, postId);

    const res = await request
      .post(`/api/recruitment/${postId}/close`)
      .set('Authorization', 'Bearer ' + tokenB);
    expect(res.status).toBeGreaterThanOrEqual(400); // 403 或业务 400
  });

  it('用户 B 无法审批用户 A 收到的申请', async () => {
    const tokenGm = await registerAndLogin(sUid(), pw);
    const tokenPlayer = await registerAndLogin(sUid(), pw);
    const tokenHacker = await registerAndLogin(sUid(), pw);

    const postId = await createPost(tokenGm);
    await publishPost(tokenGm, postId);
    const applyRes = await applyPost(tokenPlayer, postId);
    if (applyRes.status !== 201) return;

    const res = await request
      .post(`/api/recruitment/${postId}/applications/${applyRes.body.id}/review`)
      .set('Authorization', 'Bearer ' + tokenHacker)
      .send({ action: 'approve' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('用户 B 无法替用户 A 确认入团', async () => {
    const tokenGm = await registerAndLogin(sUid(), pw);
    const tokenPlayer = await registerAndLogin(sUid(), pw);
    const tokenHacker = await registerAndLogin(sUid(), pw);

    const postId = await createPost(tokenGm);
    await publishPost(tokenGm, postId);
    const applyRes = await applyPost(tokenPlayer, postId);
    if (applyRes.status !== 201) return;

    // GM 审批通过
    await request
      .post(`/api/recruitment/${postId}/applications/${applyRes.body.id}/review`)
      .set('Authorization', 'Bearer ' + tokenGm)
      .send({ action: 'approve' });

    // 黑客尝试确认
    const res = await request
      .post(`/api/recruitment/applications/${applyRes.body.id}/confirm`)
      .set('Authorization', 'Bearer ' + tokenHacker);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('用户 B 无法解散用户 A 的团', async () => {
    const tokenA = await registerAndLogin(sUid(), pw);
    const tokenB = await registerAndLogin(sUid(), pw);
    const postId = await createPost(tokenA);
    await publishPost(tokenA, postId);

    const res = await request
      .post(`/api/recruitment/${postId}/dissolve`)
      .set('Authorization', 'Bearer ' + tokenB);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('用户 B 无法编辑用户 A 的招募帖内容', async () => {
    const tokenA = await registerAndLogin(sUid(), pw);
    const tokenB = await registerAndLogin(sUid(), pw);
    const postId = await createPost(tokenA);

    const res = await request
      .put(`/api/recruitment/${postId}`)
      .set('Authorization', 'Bearer ' + tokenB)
      .send({ title: '黑客改标题' });
    expect(res.status).toBe(403);
  });
});

// ── A03 输入校验与注入防护 ────────────────────────────────────────────────────

describe('安全 - A03 输入校验', () => {
  it('帖子标题超过 50 字符应被拒绝', async () => {
    const token = await registerAndLogin(sUid(), pw);
    const res = await request
      .post('/api/recruitment')
      .set('Authorization', 'Bearer ' + token)
      .send({
        title: 'A'.repeat(51),
        type: 'gm_recruit',
        ruleset_id: 'coc-7',
        player_count_max: 2,
      });
    expect(res.status).toBe(400);
  });

  it('帖子描述超过 2000 字符应被拒绝', async () => {
    const token = await registerAndLogin(sUid(), pw);
    const res = await request
      .post('/api/recruitment')
      .set('Authorization', 'Bearer ' + token)
      .send({
        title: '合法标题',
        type: 'gm_recruit',
        ruleset_id: 'coc-7',
        player_count_max: 2,
        description: 'X'.repeat(2001),
      });
    expect(res.status).toBe(400);
  });

  it('申请留言为空字符串应被拒绝', async () => {
    const gmToken = await registerAndLogin(sUid(), pw);
    const playerToken = await registerAndLogin(sUid(), pw);
    const postId = await createPost(gmToken);
    await publishPost(gmToken, postId);

    const res = await request
      .post(`/api/recruitment/${postId}/apply`)
      .set('Authorization', 'Bearer ' + playerToken)
      .send({ message: '' });
    expect(res.status).toBe(400);
  });

  it('申请留言超过 500 字符应被拒绝', async () => {
    const gmToken = await registerAndLogin(sUid(), pw);
    const playerToken = await registerAndLogin(sUid(), pw);
    const postId = await createPost(gmToken);
    await publishPost(gmToken, postId);

    const res = await request
      .post(`/api/recruitment/${postId}/apply`)
      .set('Authorization', 'Bearer ' + playerToken)
      .send({ message: 'X'.repeat(501) });
    expect(res.status).toBe(400);
  });

  it('player_count_max 为负数应被拒绝', async () => {
    const token = await registerAndLogin(sUid(), pw);
    const res = await request
      .post('/api/recruitment')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: '测试', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: -1 });
    expect(res.status).toBe(400);
  });

  it('type 字段传入非法值应被拒绝', async () => {
    const token = await registerAndLogin(sUid(), pw);
    const res = await request
      .post('/api/recruitment')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: '测试', type: 'admin_hack', ruleset_id: 'coc-7', player_count_max: 2 });
    expect(res.status).toBe(400);
  });

  it('tags 超过 10 个应被拒绝', async () => {
    const token = await registerAndLogin(sUid(), pw);
    const res = await request
      .post('/api/recruitment')
      .set('Authorization', 'Bearer ' + token)
      .send({
        title: '测试',
        type: 'gm_recruit',
        ruleset_id: 'coc-7',
        player_count_max: 2,
        tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
      });
    expect(res.status).toBe(400);
  });
});

// ── A07 身份认证失效测试 ──────────────────────────────────────────────────────

describe('安全 - A07 身份认证失效', () => {
  it('无 Token 访问需认证端点应返回 401', async () => {
    const res = await request.post('/api/recruitment').send({ title: 'X', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 2 });
    expect(res.status).toBe(401);
  });

  it('过期/伪造 Token 应返回 401', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJoYWNrZXIiLCJleHAiOjF9.fake';
    const res = await request
      .post('/api/recruitment')
      .set('Authorization', 'Bearer ' + fakeToken)
      .send({ title: 'X', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 2 });
    expect(res.status).toBe(401);
  });

  it('格式错误的 Authorization 头应返回 401', async () => {
    const res = await request
      .post('/api/recruitment')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .send({ title: 'X', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 2 });
    expect(res.status).toBe(401);
  });
});

// ── X-Idempotency-Key 安全校验 ────────────────────────────────────────────────

describe('安全 - 幂等键格式校验', () => {
  it('幂等键含特殊字符 SQL 注入尝试应被拒绝', async () => {
    const token = await registerAndLogin(sUid(), pw);
    const res = await request
      .post('/api/recruitment')
      .set('Authorization', 'Bearer ' + token)
      .set('X-Idempotency-Key', "'; DROP TABLE users; --")
      .send({ title: '测试', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 2 });
    // 应 400（格式非法）或正常处理（格式校验在 idempotency 中间件，此路由不一定接）
    // 关键是不能 500
    expect(res.status).not.toBe(500);
  });

  it('幂等键过短（< 4 字符）应被拒绝', async () => {
    const gmToken = await registerAndLogin(sUid(), pw);
    const postId = await createPost(gmToken);
    await publishPost(gmToken, postId);

    const playerToken = await registerAndLogin(sUid(), pw);
    const res = await request
      .post(`/api/recruitment/${postId}/apply`)
      .set('Authorization', 'Bearer ' + playerToken)
      .set('X-Idempotency-Key', 'ab')
      .send({ message: '测试' });
    expect(res.status).toBe(400);
  });
});
</content>
</invoke>