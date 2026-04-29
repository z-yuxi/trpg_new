/**
 * API 合同测试（Contract Tests）
 *
 * 原则：每个关键端点的实际响应形状必须与 docs/api-contracts/*.yaml 中的
 * OpenAPI 3.0 Schema 定义完全兼容，字段漂移即 CI 失败。
 *
 * 覆盖范围：
 *   ┌ 招募模块（recruitment-full-v2.yaml）
 *   │  ├ GET  /api/recruitment         — 列表响应形状
 *   │  ├ POST /api/recruitment         — 创建草稿响应形状
 *   │  ├ POST /api/recruitment/:id/publish — 发布响应形状
 *   │  └ POST /api/recruitment/:id/apply   — 申请响应形状
 *   ├ 互评模块（reviews-reputation.yaml）
 *   │  ├ POST /api/campaigns/:id/reviews       — 提交评价（业务约束 409）
 *   │  ├ GET  /api/campaigns/:id/reviews       — 列表响应形状
 *   │  ├ GET  /api/campaigns/:id/reviews/my-status — 已提交状态
 *   │  ├ GET  /api/users/:id/reputation        — 信誉汇总形状
 *   │  └ GET  /api/users/:id/reviews           — 用户评价列表形状
 *   └ 健康检查（recruitment-full-v2.yaml /health）
 *      └ GET /api/health                       — status/uptime/checks
 *
 * 校验策略：
 *   - 使用内联 Schema validator（不引入 ajv，避免增加依赖）
 *   - 只检查 required 字段存在性 + 枚举合法性
 *   - 不校验 nullable 字段的具体值（接受 null）
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { request, registerAndLogin } from '../e2e/setup';

// ─────────────────────────────────────────────────────────────────────────────
// 轻量 Schema 校验器
// ─────────────────────────────────────────────────────────────────────────────

type FieldSpec = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  enum?: unknown[];
  nullable?: boolean;
};

/**
 * 断言对象包含所有 required 字段，且类型/枚举合法。
 * nullable=true 时允许 null 值。
 */
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
// 合同 Schema 定义（来源：docs/api-contracts/）
// ─────────────────────────────────────────────────────────────────────────────

/** RecruitmentPost（contracts/recruitment-full-v2.yaml #RecruitmentPost） */
const CONTRACT_RECRUITMENT_POST: Record<string, FieldSpec> = {
  id:                  { type: 'string' },
  poster_id:           { type: 'string' },
  title:               { type: 'string' },
  type:                { type: 'string', enum: ['gm_recruit', 'player_seek'] },
  status:              { type: 'string', enum: ['draft','open','full','grouped','closed','dissolved','archived'] },
  ruleset_id:          { type: 'string' },
  player_count_max:    { type: 'integer' },
  player_count_joined: { type: 'integer' },
  schedule_text:       { type: 'string', nullable: true },
  schedule_weekday:    { type: 'array', nullable: true },
  schedule_time_slot:  { type: 'string', enum: ['morning','afternoon','evening','night'], nullable: true },
  allow_ob:            { type: 'boolean', nullable: true },
  campaign_id:         { type: 'string', nullable: true },
  created_at:          { type: 'string' },
};
const REQUIRED_RECRUITMENT_POST = [
  'id', 'poster_id', 'title', 'type', 'status', 'ruleset_id', 'player_count_max', 'created_at',
];

/** RecruitmentListResponse（contracts/recruitment-full-v2.yaml #RecruitmentListResponse） */
const CONTRACT_LIST_RESPONSE: Record<string, FieldSpec> = {
  data:  { type: 'array' },
  total: { type: 'integer' },
  page:  { type: 'integer' },
  limit: { type: 'integer' },
};
const REQUIRED_LIST = ['data', 'total', 'page', 'limit'];

/** Application（contracts/recruitment-full-v2.yaml #Application） */
const CONTRACT_APPLICATION: Record<string, FieldSpec> = {
  id:                 { type: 'string' },
  post_id:            { type: 'string' },
  applicant_user_id:  { type: 'string' },
  status:             { type: 'string', enum: ['pending','invited','confirmed','waiting','rejected'] },
  created_at:         { type: 'string' },
  updated_at:         { type: 'string' },
};
const REQUIRED_APPLICATION = ['id', 'post_id', 'applicant_user_id', 'status', 'created_at', 'updated_at'];

/** Review（contracts/reviews-reputation.yaml #Review） */
const CONTRACT_REVIEW: Record<string, FieldSpec> = {
  id:            { type: 'string' },
  campaign_id:   { type: 'string' },
  reviewer_id:   { type: 'string' },
  reviewee_id:   { type: 'string' },
  reviewer_role: { type: 'string', enum: ['gm', 'player'] },
  rating:        { type: 'integer' },
  comment:       { type: 'string', nullable: true },
  created_at:    { type: 'string' },
};
const REQUIRED_REVIEW = ['id', 'campaign_id', 'reviewer_id', 'reviewee_id', 'reviewer_role', 'rating', 'created_at'];

/** ReputationScore（contracts/reviews-reputation.yaml #ReputationScore） */
const CONTRACT_REPUTATION: Record<string, FieldSpec> = {
  user_id:        { type: 'string' },
  avg_rating:     { type: 'number' },
  total_reviews:  { type: 'integer' },
  gm_reviews:     { type: 'integer' },
  player_reviews: { type: 'integer' },
  updated_at:     { type: 'string' },
};
const REQUIRED_REPUTATION = ['user_id', 'avg_rating', 'total_reviews', 'gm_reviews', 'player_reviews', 'updated_at'];

/** HealthResponse（contracts/recruitment-full-v2.yaml #HealthResponse） */
const CONTRACT_HEALTH: Record<string, FieldSpec> = {
  status:  { type: 'string', enum: ['ok', 'degraded'] },
  uptime:  { type: 'integer' },
  checks:  { type: 'object' },
};
const REQUIRED_HEALTH = ['status', 'uptime', 'checks'];

// ─────────────────────────────────────────────────────────────────────────────
// 测试夹具
// ─────────────────────────────────────────────────────────────────────────────

const pw = 'Test1234!';
let seq = 0;
const uid = () => '188' + String(Date.now()).slice(-5) + String(++seq).padStart(2, '0');

let gmToken = '';
let playerToken = '';
let gmUserId = '';
let playerUserId = '';
let postId = '';

beforeAll(async () => {
  gmToken = await registerAndLogin(uid(), pw);
  playerToken = await registerAndLogin(uid(), pw);

  // 获取用户 ID
  const gmMe = await request.get('/api/users/me').set('Authorization', 'Bearer ' + gmToken);
  gmUserId = gmMe.body?.id ?? 'gm-placeholder';
  const playerMe = await request.get('/api/users/me').set('Authorization', 'Bearer ' + playerToken);
  playerUserId = playerMe.body?.id ?? 'player-placeholder';

  // 创建并发布招募帖
  const draft = await request
    .post('/api/recruitment')
    .set('Authorization', 'Bearer ' + gmToken)
    .send({
      title: '合同测试帖',
      type: 'gm_recruit',
      ruleset_id: 'coc-7',
      player_count_max: 4,
      schedule_weekday: ['sat'],
      schedule_time_slot: 'evening',
    });
  if (draft.status === 201) {
    postId = draft.body.id;
    await request
      .post(`/api/recruitment/${postId}/publish`)
      .set('Authorization', 'Bearer ' + gmToken);
  }
}, 20_000);

// ─────────────────────────────────────────────────────────────────────────────
// 测试组 1：健康检查
// ─────────────────────────────────────────────────────────────────────────────

describe('合同 — GET /api/health', () => {
  it('响应包含 status / uptime / checks（contracts/recruitment-full-v2.yaml #HealthResponse）', async () => {
    const res = await request.get('/api/health');
    expect([200, 503]).toContain(res.status);
    assertShape(res.body, CONTRACT_HEALTH, REQUIRED_HEALTH, 'health');
    expect(['ok', 'degraded']).toContain(res.body.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 测试组 2：招募模块合同
// ─────────────────────────────────────────────────────────────────────────────

describe('合同 — 招募模块（recruitment-full-v2.yaml）', () => {
  it('GET /api/recruitment — 列表响应形状', async () => {
    const res = await request.get('/api/recruitment');
    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_LIST_RESPONSE, REQUIRED_LIST, 'list');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/recruitment — schedule_weekday 筛选参数 2xx', async () => {
    const res = await request.get('/api/recruitment?schedule_weekday=sat');
    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_LIST_RESPONSE, REQUIRED_LIST, 'list[schedule_weekday]');
  });

  it('GET /api/recruitment — schedule_time_slot 筛选参数 2xx', async () => {
    const res = await request.get('/api/recruitment?schedule_time_slot=evening');
    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_LIST_RESPONSE, REQUIRED_LIST, 'list[time_slot]');
  });

  it('GET /api/recruitment — min_seats 筛选参数 2xx', async () => {
    const res = await request.get('/api/recruitment?min_seats=1');
    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_LIST_RESPONSE, REQUIRED_LIST, 'list[min_seats]');
  });

  it('GET /api/recruitment — 组合筛选 2xx', async () => {
    const res = await request.get('/api/recruitment?schedule_weekday=sat&schedule_time_slot=evening&min_seats=1');
    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_LIST_RESPONSE, REQUIRED_LIST, 'list[combined]');
  });

  it('POST /api/recruitment — 创建草稿响应形状', async () => {
    const res = await request
      .post('/api/recruitment')
      .set('Authorization', 'Bearer ' + gmToken)
      .send({ title: '合同草稿', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 3 });
    expect(res.status).toBe(201);
    assertShape(res.body, CONTRACT_RECRUITMENT_POST, REQUIRED_RECRUITMENT_POST, 'create');
    expect(res.body.status).toBe('draft');
  });

  it('POST /api/recruitment/:id/publish — 发布响应形状', async () => {
    if (!postId) return;
    // 创建一个新帖子专用于发布测试（postId 已发布，创建新的）
    const draft = await request
      .post('/api/recruitment')
      .set('Authorization', 'Bearer ' + gmToken)
      .send({ title: '发布测试', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 2 });
    if (draft.status !== 201) return;

    const res = await request
      .post(`/api/recruitment/${draft.body.id}/publish`)
      .set('Authorization', 'Bearer ' + gmToken);
    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_RECRUITMENT_POST, REQUIRED_RECRUITMENT_POST, 'publish');
    expect(res.body.status).toBe('open');
  });

  it('GET /api/recruitment/:id — 帖子详情响应形状', async () => {
    if (!postId) return;
    const res = await request.get(`/api/recruitment/${postId}`);
    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_RECRUITMENT_POST, REQUIRED_RECRUITMENT_POST, 'detail');
  });

  it('GET /api/recruitment/:id — 包含 schedule_weekday / schedule_time_slot 字段', async () => {
    if (!postId) return;
    const res = await request.get(`/api/recruitment/${postId}`);
    expect(res.status).toBe(200);
    // 这两个字段由 v2 合同新增，必须存在（可为 null）
    expect(res.body).toHaveProperty('schedule_weekday');
    expect(res.body).toHaveProperty('schedule_time_slot');
  });

  it('POST /api/recruitment/:id/apply — 申请响应形状', async () => {
    if (!postId) return;
    const res = await request
      .post(`/api/recruitment/${postId}/apply`)
      .set('Authorization', 'Bearer ' + playerToken)
      .send({ message: '合同测试申请' });
    // 成功 201 或业务冲突 409 均属合同范围
    expect([201, 409]).toContain(res.status);
    if (res.status === 201) {
      assertShape(res.body, CONTRACT_APPLICATION, REQUIRED_APPLICATION, 'apply');
      expect(['pending', 'waiting']).toContain(res.body.status);
    } else {
      expect(res.body).toHaveProperty('error');
    }
  });

  it('非法状态枚举 status 应被拒绝（400 或忽略）', async () => {
    const res = await request.get('/api/recruitment?status=invalid_status_xyz');
    // 接口应返回 200（忽略非法值）或 400（严格校验），不应 500
    expect(res.status).not.toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 测试组 3：互评信誉分合同
// ─────────────────────────────────────────────────────────────────────────────

describe('合同 — 互评信誉分（reviews-reputation.yaml）', () => {
  const fakeCampaignId = 'contract-test-campaign-000';

  it('POST /api/campaigns/:id/reviews — 房间不存在应返回 404', async () => {
    const res = await request
      .post(`/api/campaigns/${fakeCampaignId}/reviews`)
      .set('Authorization', 'Bearer ' + gmToken)
      .send({ reviewee_id: playerUserId, reviewer_role: 'gm', rating: 5 });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/campaigns/:id/reviews — rating 超出范围应返回 400', async () => {
    const res = await request
      .post(`/api/campaigns/${fakeCampaignId}/reviews`)
      .set('Authorization', 'Bearer ' + gmToken)
      .send({ reviewee_id: playerUserId, reviewer_role: 'gm', rating: 6 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/campaigns/:id/reviews — 未登录应返回 401', async () => {
    const res = await request
      .post(`/api/campaigns/${fakeCampaignId}/reviews`)
      .send({ reviewee_id: playerUserId, reviewer_role: 'gm', rating: 5 });
    expect(res.status).toBe(401);
  });

  it('GET /api/campaigns/:id/reviews — 列表响应形状', async () => {
    const res = await request.get(`/api/campaigns/${fakeCampaignId}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/campaigns/:id/reviews/my-status — 响应形状', async () => {
    const res = await request
      .get(`/api/campaigns/${fakeCampaignId}/reviews/my-status`)
      .set('Authorization', 'Bearer ' + gmToken);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('submitted_for');
    expect(Array.isArray(res.body.submitted_for)).toBe(true);
  });

  it('GET /api/users/:id/reputation — 信誉汇总响应形状（含默认零值）', async () => {
    const res = await request.get(`/api/users/${gmUserId || 'placeholder-user-id'}/reputation`);
    expect(res.status).toBe(200);
    assertShape(res.body, CONTRACT_REPUTATION, REQUIRED_REPUTATION, 'reputation');
    // 新用户无评价时应为零值
    expect(typeof res.body.avg_rating).toBe('number');
    expect(typeof res.body.total_reviews).toBe('number');
  });

  it('GET /api/users/:id/reviews — 用户评价列表响应形状', async () => {
    const res = await request.get(`/api/users/${gmUserId || 'placeholder-user-id'}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('offset');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/users/:id/reviews — limit 上限 50 合规', async () => {
    const res = await request.get(`/api/users/${gmUserId || 'placeholder-user-id'}/reviews?limit=100`);
    expect(res.status).toBe(200);
    // 服务端应截断到最多 50
    expect(res.body.limit).toBeLessThanOrEqual(50);
  });
});
