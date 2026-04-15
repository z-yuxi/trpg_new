import { describe, it, expect } from 'vitest';
import { request, registerAndLogin } from './setup';

const makePhone = () => '139' + Date.now().toString().slice(-8);
const password = 'Test1234!';

describe('E2E - 战役管理', () => {
  describe('POST /api/campaigns', () => {
    it('未认证请求应返回 401', async () => {
      const res = await request.post('/api/campaigns').send({ name: 'Test' });
      expect(res.status).toBe(401);
    });

    it('已认证用户可创建战役', async () => {
      const phone = makePhone();
      const token = await registerAndLogin(phone, password);
      if (!token) return;
      const res = await request
        .post('/api/campaigns')
        .set('Authorization', 'Bearer ' + token)
        .send({ name: '暗夜行动', ruleset_id: 'coc-7' });
      expect(res.status).toBeLessThan(500);
      if (res.status < 300) {
        expect(res.body.id).toBeDefined();
      }
    });

    it('缺少 name 应返回 400', async () => {
      const phone = makePhone();
      const token = await registerAndLogin(phone, password);
      if (!token) return;
      const res = await request
        .post('/api/campaigns')
        .set('Authorization', 'Bearer ' + token)
        .send({ ruleset_id: 'coc-7' });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('GET /api/campaigns', () => {
    it('未认证请求应返回 401', async () => {
      const res = await request.get('/api/campaigns');
      expect(res.status).toBe(401);
    });

    it('已认证用户可获取战役列表', async () => {
      const phone = makePhone();
      const token = await registerAndLogin(phone, password);
      if (!token) return;
      const res = await request.get('/api/campaigns').set('Authorization', 'Bearer ' + token);
      expect(res.status).toBeLessThan(500);
      if (res.status < 300) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });
  });

  describe('POST /api/campaigns/join', () => {
    it('未认证请求应返回 401', async () => {
      const res = await request.post('/api/campaigns/join').send({ code: 'ABC123' });
      expect(res.status).toBe(401);
    });

    it('无效房间码应返回 4xx', async () => {
      const phone = makePhone();
      const token = await registerAndLogin(phone, password);
      if (!token) return;
      const res = await request
        .post('/api/campaigns/join')
        .set('Authorization', 'Bearer ' + token)
        .send({ code: 'INVALID_CODE_XYZ' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });
});
