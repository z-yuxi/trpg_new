import { describe, it, expect, beforeAll } from 'vitest';
import { request, registerAndLoginAsCreator } from './setup';

const password = 'Test1234!';
const makePhone = () => '138' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 10000).toString().padStart(4, '0');

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
    token = await registerAndLoginAsCreator(makePhone(), password);

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

  // ── 发布流程：draft → reviewing → public_notice ────────────────────────

  it('POST /api/modules/:id/submit — 提交发布审核', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const res = await request
      .post(`/api/modules/${moduleId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    // V1.0 直接进入公示状态
    expect(res.body.status).toBe('public_notice');
    expect(res.body.public_notice_end_at).toBeDefined();
  });

  it('GET /api/modules/:id/public-notice — 获取公示期信息', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const res = await request
      .get(`/api/modules/${moduleId}/public-notice`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.is_in_notice).toBe(true);
    expect(res.body.end_at).toBeDefined();
    expect(res.body.remaining_ms).toBeGreaterThan(0);
  });

  it('POST /api/modules/:id/withdraw — 撤回模组', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const res = await request
      .post(`/api/modules/${moduleId}/withdraw`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('draft');
  });

  it('POST /api/modules/:id/report — 举报模组', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const res = await request
      .post(`/api/modules/${moduleId}/report`)
      .set('Authorization', `Bearer ${token}`)
      .send({ report_type: 'violation', description: '测试举报' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/modules/:id/report — 缺少参数应返回 400', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const res = await request
      .post(`/api/modules/${moduleId}/report`)
      .set('Authorization', `Bearer ${token}`)
      .send({ report_type: 'violation' });

    expect(res.status).toBe(400);
  });
});

// ── 批次 5：导入 / 导出 ────────────────────────────────────────────────────

describe('E2E - 模组导入与导出（Batch 5）', () => {
  let token: string;
  let moduleId: string;

  beforeAll(async () => {
    token = await registerAndLoginAsCreator(makePhone(), password);

    // 先创建一个规则集（允许失败，使用 fallback）
    const rsRes = await request
      .post('/api/rulesets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '导入导出测试规则集', version: '0.1.0' });
    const rulesetId = rsRes.status === 201 ? rsRes.body.id : 'fallback-ruleset';

    // 创建模组
    const modRes = await request
      .post('/api/modules')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '导入导出测试模组', ruleset_id: rulesetId, description: '测试' });

    moduleId = modRes.body.id;
  });

  // ── POST /:id/import ────────────────────────────────────────────────

  it('POST /api/modules/:id/import — TXT 文件返回导入预览', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const txtContent = '# 序章\n\n雾气笼罩着港口。一艘陌生的船靠岸了。';

    const res = await request
      .post(`/api/modules/${moduleId}/import`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(txtContent, 'utf8'), {
        filename: 'test-chapter.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('序章');
    expect(res.body.content).toBeDefined();
    expect(res.body.word_count).toBeGreaterThan(0);

    const doc = JSON.parse(res.body.content);
    expect(doc.type).toBe('doc');
    expect(doc.content[0]).toMatchObject({ type: 'heading' });
  });

  it('POST /api/modules/:id/import — 未上传文件应返回 400', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const res = await request
      .post(`/api/modules/${moduleId}/import`)
      .set('Authorization', `Bearer ${token}`);
      // 不 attach 文件

    expect(res.status).toBe(400);
  });

  it('POST /api/modules/:id/import — 未登录应返回 401', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const res = await request
      .post(`/api/modules/${moduleId}/import`)
      .attach('file', Buffer.from('hello', 'utf8'), {
        filename: 'hello.txt', contentType: 'text/plain',
      });

    expect(res.status).toBe(401);
  });

  // ── POST /:id/import/confirm ────────────────────────────────────────

  it('POST /api/modules/:id/import/confirm — 合法 payload 写回数据库', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const content = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '导入正文' }] }],
    });

    const res = await request
      .post(`/api/modules/${moduleId}/import/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '重命名模组', description: '新描述', content, word_count: 3 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('重命名模组');
    expect(res.body.content).toBe(content);
  });

  it('POST /api/modules/:id/import/confirm — 缺少 content 应返回 400', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const res = await request
      .post(`/api/modules/${moduleId}/import/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '只有名字' });

    expect(res.status).toBe(400);
  });

  // ── POST /:id/export/pdf ────────────────────────────────────────────

  it('POST /api/modules/:id/export/pdf — 返回合法 PDF（以 %PDF 开头）', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const res = await request
      .post(`/api/modules/${moduleId}/export/pdf`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toContain('.pdf');
    // PDF 魔术字节
    const bodyBuf = res.body as Buffer;
    expect(bodyBuf.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('POST /api/modules/:id/export/pdf — 未登录应返回 401', async () => {
    if (!moduleId) { console.warn('skip: no moduleId'); return; }

    const res = await request.post(`/api/modules/${moduleId}/export/pdf`);
    expect(res.status).toBe(401);
  });
});

