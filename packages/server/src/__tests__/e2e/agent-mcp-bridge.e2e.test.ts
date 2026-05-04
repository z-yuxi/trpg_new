import { beforeEach, describe, expect, it } from 'vitest';
import { request, registerAndLogin, rows } from './setup';

const pw = 'Test1234!';
let seq = 0;
const phone = () => '139' + String(Date.now()).slice(-6) + String(++seq).padStart(2, '0');

async function registerAndLoginAsAdmin() {
  const p = phone();
  const token = await registerAndLogin(p, pw);
  const user = rows.users.find((u) => u.phone === p);
  if (user) {
    user.user_type = JSON.stringify(['player', 'admin']);
  }
  return token;
}

describe('E2E - Agent MCP Bridge (10 endpoints)', () => {
  beforeEach(() => {
    rows.forum_threads = [];
    (rows as Record<string, any[]>)['forum_posts'] = [];
    (rows as Record<string, any[]>)['content_reports'] = [];
  });

  it('POST /api/posts 返回 PublishPostResponse 字段', async () => {
    const token = await registerAndLogin(phone(), pw);
    const res = await request
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ board: 'tips', title: '测试帖子', content: '正文内容' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('thread_id');
    expect(res.body).toHaveProperty('created_at');
  });

  it('POST /api/comments 返回 ReplyCommentResponse 字段', async () => {
    const token = await registerAndLogin(phone(), pw);
    const postRes = await request
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ board: 'share', title: '评论测试主贴', content: '主贴正文' });

    const res = await request
      .post('/api/comments')
      .set('Authorization', `Bearer ${token}`)
      .send({ thread_id: postRes.body.thread_id, content: '一条回复' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('post_id');
    expect(res.body).toHaveProperty('floor_number');
    expect(res.body).toHaveProperty('created_at');
  });

  it('POST /api/help/chat 返回 HelpChatResponse 字段', async () => {
    const token = await registerAndLogin(phone(), pw);
    const res = await request
      .post('/api/help/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '怎么举报违规内容？' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('answer');
    expect(res.body).toHaveProperty('faq_references');
    expect(res.body).toHaveProperty('needs_human_review');
  });

  it('GET /api/help/faq 返回 FaqLookupResponse 字段', async () => {
    const token = await registerAndLogin(phone(), pw);
    const res = await request
      .get('/api/help/faq')
      .set('Authorization', `Bearer ${token}`)
      .query({ query: '举报' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.items)).toBe(true);
    if (res.body.items.length > 0) {
      expect(res.body.items[0]).toHaveProperty('id');
      expect(res.body.items[0]).toHaveProperty('category');
    }
  });

  it('GET /api/admin/reports/:id 返回 ReportDetailResponse 字段', async () => {
    const adminToken = await registerAndLoginAsAdmin();
    const reportId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    (rows as Record<string, any[]>)['content_reports'].push({
      id: reportId,
      status: 'pending',
      content_type: 'post',
      content_id: 'post-1',
      reporter_user_id: 'user-1',
      reason: '测试举报',
      created_at: new Date().toISOString(),
      resolved_at: null,
      resolution_note: null,
    });

    const res = await request
      .get(`/api/admin/reports/${reportId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', reportId);
    expect(res.body).toHaveProperty('content_type');
    expect(res.body).toHaveProperty('content_snapshot');
  });

  it('POST /api/agent/review-suggestion 返回 ActionAcceptedResponse 字段', async () => {
    const adminToken = await registerAndLoginAsAdmin();
    const reportId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    (rows as Record<string, any[]>)['content_reports'].push({
      id: reportId,
      status: 'pending',
      content_type: 'post',
      content_id: 'post-2',
      reporter_user_id: 'user-2',
      reason: '测试举报2',
      created_at: new Date().toISOString(),
    });

    const res = await request
      .post('/api/agent/review-suggestion')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ report_id: reportId, action: 'retain', confidence: 80 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('task_id');
  });

  it('GET /api/admin/stats/trends 返回 TrendSnapshotResponse 字段', async () => {
    const adminToken = await registerAndLoginAsAdmin();
    const res = await request
      .get('/api/admin/stats/trends')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ days: 7 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('period');
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('alerts');
  });

  it('POST /api/agent/daily-report 返回 DailyReportResponse 字段', async () => {
    const adminToken = await registerAndLoginAsAdmin();
    const res = await request
      .post('/api/agent/daily-report')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: '2026-05-04' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('task_id');
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('report_date', '2026-05-04');
  });

  it('POST /api/agent/legal-search 返回 LegalSearchResponse 字段', async () => {
    const adminToken = await registerAndLoginAsAdmin();
    const res = await request
      .post('/api/agent/legal-search')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ query: '侵权', jurisdiction: 'CN' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('query_matched', '侵权');
    expect(res.body).toHaveProperty('results');
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('POST /api/agent/evidence-analysis 返回 EvidenceAnalysisResponse 字段', async () => {
    const adminToken = await registerAndLoginAsAdmin();
    const res = await request
      .post('/api/agent/evidence-analysis')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        scenario: 'copyright_infringement',
        evidence: { type: 'text', content: '疑似侵权转载内容' },
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('assessment');
    expect(res.body.assessment).toHaveProperty('risk_level');
    expect(res.body.assessment).toHaveProperty('confidence');
  });

  it('L3 接口非管理员返回 FORBIDDEN 错误码格式', async () => {
    const userToken = await registerAndLogin(phone(), pw);
    const res = await request
      .post('/api/agent/legal-search')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ query: '侵权' });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'FORBIDDEN');
    expect(res.body).toHaveProperty('message');
  });

  it('参数非法返回 INVALID_PARAM 错误码格式', async () => {
    const token = await registerAndLogin(phone(), pw);
    const res = await request
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ board: 'invalid-board', title: '', content: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'INVALID_PARAM');
    expect(res.body).toHaveProperty('message');
  });
});
