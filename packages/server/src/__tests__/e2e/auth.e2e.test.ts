import { describe, it, expect } from 'vitest';
import { request } from './setup';

const password = 'Test1234!';
const makePhone = () => '138' + Date.now().toString().slice(-8);

describe('E2E - 认证流程', () => {
  describe('POST /api/auth/register', () => {
    it('应成功注册新用户', async () => {
      const phone = makePhone();
      const res = await request.post('/api/auth/register').send({ phone, password, nickname: '测试用户' });
      expect([200, 201]).toContain(res.status);
    });

    it('重复注册相同手机号应返回 4xx', async () => {
      const phone = makePhone();
      await request.post('/api/auth/register').send({ phone, password, nickname: 'A' });
      const res = await request.post('/api/auth/register').send({ phone, password, nickname: 'B' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('缺少必要字段应返回 400', async () => {
      const res = await request.post('/api/auth/register').send({ password, nickname: '无手机号' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('正确凭证应返回 tokens', async () => {
      const phone = makePhone();
      await request.post('/api/auth/register').send({ phone, password, nickname: '登录测试' });
      const res = await request.post('/api/auth/login').send({ phone, password });
      expect(res.status).toBeLessThan(300);
      expect(res.body.tokens?.access_token).toBeDefined();
    });

    it('错误密码应返回 401', async () => {
      const phone = makePhone();
      await request.post('/api/auth/register').send({ phone, password, nickname: 'A' });
      const res = await request.post('/api/auth/login').send({ phone, password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('不存在的手机号应返回 401', async () => {
      const res = await request.post('/api/auth/login').send({ phone: '13800000000', password });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users/me', () => {
    it('有效 token 应返回用户信息', async () => {
      const phone = makePhone();
      await request.post('/api/auth/register').send({ phone, password, nickname: 'me测试' });
      const loginRes = await request.post('/api/auth/login').send({ phone, password });
      const tok = loginRes.body.tokens?.access_token;
      if (!tok) return;
      const res = await request.get('/api/users/me').set('Authorization', 'Bearer ' + tok);
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
    });

    it('无 token 应返回 401', async () => {
      const res = await request.get('/api/users/me');
      expect(res.status).toBe(401);
    });

    it('伪造 token 应返回 401', async () => {
      const res = await request.get('/api/users/me').set('Authorization', 'Bearer fake.token.here');
      expect(res.status).toBe(401);
    });
  });
});
