import { describe, it, expect } from 'vitest';
import { request, registerAndLogin } from './setup';

const makePhone = () => '137' + Date.now().toString().slice(-8);
const password = 'Test1234!';

describe('E2E - 日志导出 API', () => {
  it('未认证请求应返回 401', async () => {
    const res = await request.post('/api/logs/export').send({ campaign_id: 'c1', format: 'json' });
    expect(res.status).toBe(401);
  });

  it('缺少 campaign_id 应返回 400', async () => {
    const phone = makePhone();
    const token = await registerAndLogin(phone, password);
    if (!token) return;
    const res = await request
      .post('/api/logs/export')
      .set('Authorization', 'Bearer ' + token)
      .send({ format: 'json' });
    expect(res.status).toBe(400);
  });

  it('不存在的 campaign 应返回 403 或 404', async () => {
    const phone = makePhone();
    const token = await registerAndLogin(phone, password);
    if (!token) return;
    const res = await request
      .post('/api/logs/export')
      .set('Authorization', 'Bearer ' + token)
      .send({ campaign_id: 'non-existent', format: 'json' });
    expect([403, 404]).toContain(res.status);
  });
});

describe('E2E - 公开路由可达性', () => {
  it('GET /api/health 应返回 200', async () => {
    const res = await request.get('/api/health');
    expect(res.status).toBe(200);
  });

  it('GET /api/rulesets 应返回 200', async () => {
    const res = await request.get('/api/rulesets');
    expect(res.status).toBe(200);
  });

  it('不存在的路由应返回 404', async () => {
    const res = await request.get('/api/non_existent_route_xyz');
    expect(res.status).toBe(404);
  });
});
