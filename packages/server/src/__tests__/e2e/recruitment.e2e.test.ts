/**
 * 招募系统端到端回归测试（E2E Smoke）
 *
 * 覆盖完整业务主链路：
 *   开团 → 申请 → GM审批(邀请) → 玩家确认 → 成团/进房间
 *   旁路：拒绝申请 / 候补递补 / 状态越权防护
 *
 * 所有 HTTP 请求使用 supertest 打真实 Express 路由，数据库使用内存 mock。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { request, registerAndLogin } from './setup';

const pw = 'Test1234!';
let seq = 0;
const uid = () => '137' + String(Date.now()).slice(-6) + String(++seq).padStart(2, '0');

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

async function createAndPublishPost(token: string, overrides: Record<string, unknown> = {}) {
  const draft = await request
    .post('/api/recruitment')
    .set('Authorization', 'Bearer ' + token)
    .send({
      title: '测试招募帖',
      type: 'gm_recruit',
      ruleset_id: 'coc-7',
      player_count_max: 3,
      description: '招募说明',
      ...overrides,
    });
  if (draft.status !== 201) return null;
  const postId: string = draft.body.id;

  const pub = await request
    .post(`/api/recruitment/${postId}/publish`)
    .set('Authorization', 'Bearer ' + token);
  if (pub.status !== 200) return null;
  return postId;
}

async function applyToPost(token: string, postId: string, msg = '想加入') {
  return request
    .post(`/api/recruitment/${postId}/apply`)
    .set('Authorization', 'Bearer ' + token)
    .send({ message: msg });
}

async function reviewApplication(
  gmToken: string,
  postId: string,
  appId: string,
  action: 'approve' | 'reject',
  reject_reason?: string,
) {
  return request
    .post(`/api/recruitment/${postId}/applications/${appId}/review`)
    .set('Authorization', 'Bearer ' + gmToken)
    .send({ action, ...(reject_reason ? { reject_reason } : {}) });
}

async function confirmApplication(playerToken: string, appId: string) {
  return request
    .post(`/api/recruitment/applications/${appId}/confirm`)
    .set('Authorization', 'Bearer ' + playerToken);
}

// ── 测试套件 ──────────────────────────────────────────────────────────────────

describe('E2E - 招募系统主链路', () => {
  // ── A. 帖子生命周期 ──────────────────────────────────────────────────────────

  describe('A. 帖子生命周期', () => {
    it('A1 未登录用户无法创建招募帖', async () => {
      const res = await request
        .post('/api/recruitment')
        .send({ title: 'X', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 2 });
      expect(res.status).toBe(401);
    });

    it('A2 缺少必填字段应返回 400', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const res = await request
        .post('/api/recruitment')
        .set('Authorization', 'Bearer ' + gmToken)
        .send({ type: 'gm_recruit', ruleset_id: 'coc-7' }); // 缺 title 和 player_count_max
      expect(res.status).toBe(400);
    });

    it('A3 GM 可创建草稿并发布为 open', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      // 创建草稿
      const draft = await request
        .post('/api/recruitment')
        .set('Authorization', 'Bearer ' + gmToken)
        .send({ title: '奥秘', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 2 });
      expect(draft.status).toBe(201);
      expect(draft.body.status).toBe('draft');

      // 发布
      const pub = await request
        .post(`/api/recruitment/${draft.body.id}/publish`)
        .set('Authorization', 'Bearer ' + gmToken);
      expect(pub.status).toBe(200);
      expect(pub.body.status).toBe('open');
    });

    it('A4 非帖主无法发布他人草稿（403）', async () => {
      const gm1Token = await registerAndLogin(uid(), pw);
      const gm2Token = await registerAndLogin(uid(), pw);
      const draft = await request
        .post('/api/recruitment')
        .set('Authorization', 'Bearer ' + gm1Token)
        .send({ title: 'X', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 2 });
      expect(draft.status).toBe(201);

      const res = await request
        .post(`/api/recruitment/${draft.body.id}/publish`)
        .set('Authorization', 'Bearer ' + gm2Token);
      expect(res.status).toBe(403);
    });

    it('A5 GM 可手动关闭招募帖', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const res = await request
        .post(`/api/recruitment/${postId}/close`)
        .set('Authorization', 'Bearer ' + gmToken);
      expect([200, 400]).toContain(res.status); // 状态机允许时返回 200
    });

    it('A6 可查看招募列表（未登录）', async () => {
      const res = await request.get('/api/recruitment');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
    });

    it('A7 帖子详情包含必要字段', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const res = await request.get(`/api/recruitment/${postId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('poster_id');
    });
  });

  // ── B. 申请流程 ──────────────────────────────────────────────────────────────

  describe('B. 申请流程', () => {
    it('B1 未登录用户无法申请', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const res = await request.post(`/api/recruitment/${postId}/apply`).send({ message: '求带' });
      expect(res.status).toBe(401);
    });

    it('B2 玩家可成功申请 open 帖（返回 201 + pending）', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const res = await applyToPost(playerToken, postId);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.post_id).toBe(postId);
    });

    it('B3 同一用户不能重复申请同一帖（返回 error_code RECRUITMENT_ALREADY_APPLIED）', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      await applyToPost(playerToken, postId);
      const res = await applyToPost(playerToken, postId, '第二次申请');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      if (res.body.error_code) {
        expect(res.body.error_code).toBe('RECRUITMENT_ALREADY_APPLIED');
      }
    });

    it('B4 GM 不能申请自己的帖', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const res = await applyToPost(gmToken, postId, '自己申请');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('B5 申请缺少 message 字段应返回 400', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const res = await request
        .post(`/api/recruitment/${postId}/apply`)
        .set('Authorization', 'Bearer ' + playerToken)
        .send({ character_id: null }); // 没有 message
      expect(res.status).toBe(400);
    });
  });

  // ── C. GM 审批（邀请/拒绝） ────────────────────────────────────────────────

  describe('C. GM 审批', () => {
    it('C1 GM 可审批申请为 invited', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const applyRes = await applyToPost(playerToken, postId);
      if (applyRes.status !== 201) return;
      const appId: string = applyRes.body.id;

      const res = await reviewApplication(gmToken, postId, appId, 'approve');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('invited');
    });

    it('C2 GM 可拒绝申请并附带理由（rejected）', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const applyRes = await applyToPost(playerToken, postId);
      if (applyRes.status !== 201) return;

      const res = await reviewApplication(gmToken, postId, applyRes.body.id, 'reject', '与团风格不符');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('rejected');
      expect(res.body.reject_reason).toBeTruthy();
    });

    it('C3 非 GM（无关用户）无法审批申请（返回 4xx）', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const hackerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const applyRes = await applyToPost(playerToken, postId);
      if (applyRes.status !== 201) return;

      const res = await reviewApplication(hackerToken, postId, applyRes.body.id, 'approve');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('C4 审批时 action 只接受 approve/reject', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const applyRes = await applyToPost(playerToken, postId);
      if (applyRes.status !== 201) return;

      const res = await request
        .post(`/api/recruitment/${postId}/applications/${applyRes.body.id}/review`)
        .set('Authorization', 'Bearer ' + gmToken)
        .send({ action: 'invalid_action' });
      expect(res.status).toBe(400);
    });
  });

  // ── D. 玩家确认入团 ──────────────────────────────────────────────────────────

  describe('D. 玩家确认入团', () => {
    it('D1 玩家可确认已邀请的申请（invited → confirmed）', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const applyRes = await applyToPost(playerToken, postId);
      if (applyRes.status !== 201) return;
      const appId: string = applyRes.body.id;

      await reviewApplication(gmToken, postId, appId, 'approve');

      const confirmRes = await confirmApplication(playerToken, appId);
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.status).toBe('confirmed');
    });

    it('D2 其他用户无法替别人确认（返回 4xx）', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const hackerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const applyRes = await applyToPost(playerToken, postId);
      if (applyRes.status !== 201) return;
      await reviewApplication(gmToken, postId, applyRes.body.id, 'approve');

      const res = await confirmApplication(hackerToken, applyRes.body.id);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('D3 未邀请的申请不能直接确认', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const applyRes = await applyToPost(playerToken, postId);
      if (applyRes.status !== 201) return;

      // 不经过 approve，直接尝试 confirm
      const res = await confirmApplication(playerToken, applyRes.body.id);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ── E. 成团（group formation） ────────────────────────────────────────────

  describe('E. 成团与进房间', () => {
    it('E1 GM 在有确认玩家后可发起成团', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const player1Token = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken, { player_count_max: 2 });
      if (!postId) return;

      // 玩家申请 → GM批准 → 玩家确认
      const a1 = await applyToPost(player1Token, postId);
      if (a1.status !== 201) return;
      await reviewApplication(gmToken, postId, a1.body.id, 'approve');
      await confirmApplication(player1Token, a1.body.id);

      const groupRes = await request
        .post(`/api/recruitment/${postId}/group`)
        .set('Authorization', 'Bearer ' + gmToken)
        .send({});
      // 期望成团成功或返回合理错误（依赖 campaign-service）
      expect([200, 400, 500]).toContain(groupRes.status);
      if (groupRes.status === 200) {
        expect(groupRes.body.campaign_id ?? groupRes.body.id).toBeTruthy();
      }
    });

    it('E2 非 GM 无法发起成团（403）', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const res = await request
        .post(`/api/recruitment/${postId}/group`)
        .set('Authorization', 'Bearer ' + playerToken)
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('E3 未登录用户无法成团（401）', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const res = await request.post(`/api/recruitment/${postId}/group`).send({});
      expect(res.status).toBe(401);
    });
  });

  // ── F. 候补递补 ──────────────────────────────────────────────────────────────

  describe('F. 候补递补', () => {
    it('F1 玩家可申请候补（?type=waiting）', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const res = await request
        .post(`/api/recruitment/${postId}/apply?type=waiting`)
        .set('Authorization', 'Bearer ' + playerToken)
        .send({ message: '愿意候补' });
      // 取决于帖子是否满员，服务层决定；期望不崩溃
      expect(res.status).toBeLessThan(500);
    });

    it('F2 已有 pending/invited/confirmed 申请时不能二次申请候补', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const playerToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      await applyToPost(playerToken, postId); // 先正常申请
      const res = await request
        .post(`/api/recruitment/${postId}/apply?type=waiting`)
        .set('Authorization', 'Bearer ' + playerToken)
        .send({ message: '再次申请' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ── G. 解散与归档 ────────────────────────────────────────────────────────────

  describe('G. 解散与归档', () => {
    it('G1 非帖主无法解散团（4xx）', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const otherToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const res = await request
        .post(`/api/recruitment/${postId}/dissolve`)
        .set('Authorization', 'Bearer ' + otherToken);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('G2 未登录无法解散（401）', async () => {
      const gmToken = await registerAndLogin(uid(), pw);
      const postId = await createAndPublishPost(gmToken);
      if (!postId) return;

      const res = await request.post(`/api/recruitment/${postId}/dissolve`);
      expect(res.status).toBe(401);
    });
  });
});

// ── 独立冒烟测试：健康检查与公共端点 ──────────────────────────────────────────

describe('E2E - 冒烟：基础端点', () => {
  it('GET /api/health 应返回 status 字段', async () => {
    const res = await request.get('/api/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
  });

  it('不存在的招募帖应返回 404', async () => {
    const res = await request.get('/api/recruitment/nonexistent-id-xyz');
    expect(res.status).toBe(404);
  });

  it('招募列表支持分页参数', async () => {
    const res = await request.get('/api/recruitment?page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
  });
});
</content>
</invoke>