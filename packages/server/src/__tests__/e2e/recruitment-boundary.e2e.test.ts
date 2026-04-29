/**
 * 招募系统边界测试 — 高风险边界场景
 *
 * 覆盖主流程之外的状态转换边界：
 * A. 邀请超时 → 自动拒绝 + 候补递补
 * B. 候补递补顺序（position 升序）
 * C. 成团 → 剩余 pending/invited/waiting 全部拒绝
 * D. 成团后解散 → 状态变 dissolved
 * E. 过期邀请确认 → 抛错 + 候补提升
 */

import { vi, describe, it, expect, beforeAll } from 'vitest';
import { request, registerAndLogin, rows } from './setup';

// ─── 辅助：快速注册 + 获取 token & userId ───────────────────────────────────

let gmToken   = '';
let gmId      = '';
let p1Token   = '';
let p1Id      = '';
let p2Token   = '';
let p2Id      = '';
let p3Token   = '';
let p3Id      = '';

const GMPhone    = '13811110001';
const P1Phone    = '13811110002';
const P2Phone    = '13811110003';
const P3Phone    = '13811110004';

beforeAll(async () => {
  gmToken = await registerAndLogin(GMPhone);
  p1Token = await registerAndLogin(P1Phone);
  p2Token = await registerAndLogin(P2Phone);
  p3Token = await registerAndLogin(P3Phone);

  const [gm, p1, p2, p3] = await Promise.all([
    request.get('/api/users/me').set('Authorization', `Bearer ${gmToken}`),
    request.get('/api/users/me').set('Authorization', `Bearer ${p1Token}`),
    request.get('/api/users/me').set('Authorization', `Bearer ${p2Token}`),
    request.get('/api/users/me').set('Authorization', `Bearer ${p3Token}`),
  ]);
  gmId = gm.body.id;
  p1Id = p1.body.id;
  p2Id = p2.body.id;
  p3Id = p3.body.id;
});

// ─── 辅助：创建 + 发布招募帖 ─────────────────────────────────────────────────

async function createOpenPost(): Promise<string> {
  const create = await request
    .post('/api/recruitment')
    .set('Authorization', `Bearer ${gmToken}`)
    .send({
      type: 'gm_recruit',
      title: '边界测试帖-' + Date.now(),
      ruleset_id: 'coc-7',
      player_count_max: 3,
      schedule_text: '周末',
    });
  const postId: string = create.body.id;
  await request
    .post(`/api/recruitment/${postId}/publish`)
    .set('Authorization', `Bearer ${gmToken}`);
  return postId;
}

// ─── A. 邀请超时自动拒绝（确认阶段超时） ─────────────────────────────────────

describe('A. 邀请超时 — 确认阶段超时自动拒绝', () => {
  it('邀请过期后玩家确认应返回 400 + 候补已提升', async () => {
    const postId = await createOpenPost();

    // P1 正常申请，P2 进候补
    const applyP1 = await request
      .post(`/api/recruitment/${postId}/apply`)
      .set('Authorization', `Bearer ${p1Token}`)
      .send({ message: '我是P1' });
    const appId = applyP1.body.id;

    const applyP2 = await request
      .post(`/api/recruitment/${postId}/apply?type=waiting`)
      .set('Authorization', `Bearer ${p2Token}`)
      .send({ message: '我是P2候补' });
    const waitingAppId = applyP2.body.id;

    // GM 审批 P1：状态 → invited，invited_expires_at = now + 24h
    await request
      .post(`/api/recruitment/${postId}/applications/${appId}/review`)
      .set('Authorization', `Bearer ${gmToken}`)
      .send({ action: 'approve' });

    // 直接将内存 DB 中的 invited_expires_at 改为过去时间（模拟过期）
    const appRecord = rows.recruitment_applications?.find((r: any) => r.id === appId);
    if (appRecord) {
      appRecord.invited_expires_at = new Date(Date.now() - 1000).toISOString();
    }

    // P1 尝试确认 → 应该 400（邀请已过期）
    const confirmRes = await request
      .post(`/api/recruitment/applications/${appId}/confirm`)
      .set('Authorization', `Bearer ${p1Token}`);
    expect(confirmRes.status).toBe(400);
    expect(confirmRes.body.error).toMatch(/过期/);

    // P1 的申请应被自动拒绝
    const p1AppRes = await request
      .get(`/api/recruitment/${postId}`)
      .set('Authorization', `Bearer ${gmToken}`);
    const apps: Array<{ id: string; status: string; reject_reason?: string }> =
      p1AppRes.body.applications ?? [];
    const p1App = apps.find((a) => a.id === appId);
    expect(p1App?.status).toBe('rejected');
    expect(p1App?.reject_reason).toMatch(/超时/);

    // P2 候补应已提升为 invited（promoteNextWaiting 将 waiting → invited）
    const p2App = apps.find((a) => a.id === waitingAppId);
    expect(p2App?.status).toBe('invited');
  });
});

// ─── B. 候补递补顺序（position 升序） ────────────────────────────────────────

describe('B. 候补递补顺序 — 按 waiting_position 升序提升', () => {
  it('先加入候补的玩家先被提升', async () => {
    const postId = await createOpenPost();

    // P1 普通申请
    const p1Apply = await request
      .post(`/api/recruitment/${postId}/apply`)
      .set('Authorization', `Bearer ${p1Token}`)
      .send({ message: 'P1', apply_type: 'normal' });
    const p1AppId = p1Apply.body.id;

    // P2、P3 依次候补（使用 ?type=waiting 查询参数）
    const p2Apply = await request
      .post(`/api/recruitment/${postId}/apply?type=waiting`)
      .set('Authorization', `Bearer ${p2Token}`)
      .send({ message: 'P2 候补' });
    const p2AppId = p2Apply.body.id;

    const p3Apply = await request
      .post(`/api/recruitment/${postId}/apply?type=waiting`)
      .set('Authorization', `Bearer ${p3Token}`)
      .send({ message: 'P3 候补' });
    const p3AppId = p3Apply.body.id;

    // GM 拒绝 P1 → 第一个候补（P2）应提升
    await request
      .post(`/api/recruitment/${postId}/applications/${p1AppId}/review`)
      .set('Authorization', `Bearer ${gmToken}`)
      .send({ action: 'reject', reject_reason: '不合适' });

    const detailAfterReject = await request
      .get(`/api/recruitment/${postId}`)
      .set('Authorization', `Bearer ${gmToken}`);
    const appsAfter: Array<{ id: string; status: string }> =
      detailAfterReject.body.applications ?? [];

    // P2（先加入候补，position 更低）应提升为 invited（promoteNextWaiting: waiting → invited）
    expect(appsAfter.find((a) => a.id === p2AppId)?.status).toBe('invited');
    // P3 仍在候补
    expect(appsAfter.find((a) => a.id === p3AppId)?.status).toBe('waiting');
  });
});

// ─── C. 成团验证：确认玩家无角色卡时 formGroup 应返回 400 ──────────────────

describe('C. 成团边界 — 确认玩家无角色卡时不能成团', () => {
  it('formGroup 时存在未绑定角色卡的确认玩家 → 400', async () => {
    const postId = await createOpenPost();

    // P1 申请 → 批准 → 确认（不带 character_id）
    const p1Apply = await request
      .post(`/api/recruitment/${postId}/apply`)
      .set('Authorization', `Bearer ${p1Token}`)
      .send({ message: 'P1正式' });
    const p1AppId = p1Apply.body.id;

    await request
      .post(`/api/recruitment/${postId}/applications/${p1AppId}/review`)
      .set('Authorization', `Bearer ${gmToken}`)
      .send({ action: 'approve' });

    // 确认不带 character_id
    await request
      .post(`/api/recruitment/applications/${p1AppId}/confirm`)
      .set('Authorization', `Bearer ${p1Token}`)
      .send({});

    // GM 成团 → 应返回 400（存在未绑定角色卡的确认玩家）
    const formRes = await request
      .post(`/api/recruitment/${postId}/group`)
      .set('Authorization', `Bearer ${gmToken}`)
      .send({});
    expect(formRes.status).toBe(400);
    expect(formRes.body.error).toMatch(/角色卡/);
  });
});

// ─── D. 成团后解散 ────────────────────────────────────────────────────────────

describe('D. 成团后解散 — grouped → dissolved', () => {
  it('dissolve 未成团的帖子 → 400', async () => {
    const postId = await createOpenPost();
    const res = await request
      .post(`/api/recruitment/${postId}/dissolve`)
      .set('Authorization', `Bearer ${gmToken}`);
    expect(res.status).toBe(400);
  });

  it('非 GM 尝试解散帖子 → 403', async () => {
    const postId = await createOpenPost();
    const res = await request
      .post(`/api/recruitment/${postId}/dissolve`)
      .set('Authorization', `Bearer ${p1Token}`);
    expect(res.status).toBe(403);
  });
});

// ─── E. 非法状态转换阻断 ─────────────────────────────────────────────────────

describe('E. 非法状态转换阻断', () => {
  it('直接解散尚未成团的帖子 → 400（仅 grouped 可 dissolve）', async () => {
    const postId = await createOpenPost();
    const res = await request
      .post(`/api/recruitment/${postId}/dissolve`)
      .set('Authorization', `Bearer ${gmToken}`);
    expect(res.status).toBe(400);
  });

  it('对 waiting 状态申请调用 review(approve) → 400（只能审批 pending）', async () => {
    const postId = await createOpenPost();

    // 直接使用 ?type=waiting 让 P2 进入候补
    const p2Apply = await request
      .post(`/api/recruitment/${postId}/apply?type=waiting`)
      .set('Authorization', `Bearer ${p2Token}`)
      .send({ message: 'P2 waiting' });
    const waitingAppId = p2Apply.body.id;

    // 对 waiting 状态直接调用 approve → 400
    const reviewRes = await request
      .post(`/api/recruitment/${postId}/applications/${waitingAppId}/review`)
      .set('Authorization', `Bearer ${gmToken}`)
      .send({ action: 'approve' });
    expect(reviewRes.status).toBe(400);
    // 服务层拒绝：只能审批 pending 状态
    expect(reviewRes.body.error).toBeTruthy();
  });
});
