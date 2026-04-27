/**
 * 关键断链修复冲刺 — E2E 验证测试
 * 覆盖：reports 路由、gm-notes 路由、用户设置端点、规则集数据契约
 */
import { describe, it, expect } from 'vitest';
import { request, registerAndLogin } from './setup';

const makePhone = () => '139' + Date.now().toString().slice(-8);

// ─────────────────────────────────────────────
// Fix-2: reports 路由
// ─────────────────────────────────────────────
describe('Fix-2 | POST /api/reports', () => {
  it('应成功提交举报并返回 201', async () => {
    const token = await registerAndLogin(makePhone());
    const res = await request
      .post('/api/reports')
      .set('Authorization', 'Bearer ' + token)
      .send({ content_type: 'post', content_id: 'post_abc', reason: '违规内容' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it('未登录举报应返回 401', async () => {
    const res = await request
      .post('/api/reports')
      .send({ content_type: 'post', content_id: 'post_abc', reason: '违规内容' });
    expect(res.status).toBe(401);
  });

  it('缺少必要字段应返回 400', async () => {
    const token = await registerAndLogin(makePhone());
    const res = await request
      .post('/api/reports')
      .set('Authorization', 'Bearer ' + token)
      .send({ content_type: 'post' }); // 缺 content_id 和 reason
    expect(res.status).toBe(400);
  });

  it('不支持的 content_type 应返回 400', async () => {
    const token = await registerAndLogin(makePhone());
    const res = await request
      .post('/api/reports')
      .set('Authorization', 'Bearer ' + token)
      .send({ content_type: 'illegal_type', content_id: 'x', reason: '测试' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────
// Fix-3: 用户设置缺失端点
// ─────────────────────────────────────────────
describe('Fix-3 | PUT /api/users/me/privacy', () => {
  it('应成功更新隐私设置', async () => {
    const token = await registerAndLogin(makePhone());
    const res = await request
      .put('/api/users/me/privacy')
      .set('Authorization', 'Bearer ' + token)
      .send({ profile_public: false, online_visible: true, campaign_history_public: false });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('未登录应返回 401', async () => {
    const res = await request.put('/api/users/me/privacy').send({ profile_public: false });
    expect(res.status).toBe(401);
  });

  it('非布尔值字段应返回 400', async () => {
    const token = await registerAndLogin(makePhone());
    const res = await request
      .put('/api/users/me/privacy')
      .set('Authorization', 'Bearer ' + token)
      .send({ profile_public: 'yes' }); // 非布尔值
    expect(res.status).toBe(400);
  });
});

describe('Fix-3 | PUT /api/users/me/notification-settings', () => {
  it('应成功更新通知设置', async () => {
    const token = await registerAndLogin(makePhone());
    const res = await request
      .put('/api/users/me/notification-settings')
      .set('Authorization', 'Bearer ' + token)
      .send({ system: true, recruit: false, dm: true, mention: false });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('未登录应返回 401', async () => {
    const res = await request
      .put('/api/users/me/notification-settings')
      .send({ system: true });
    expect(res.status).toBe(401);
  });
});

describe('Fix-3 | PUT /api/users/me/password', () => {
  it('正确当前密码应成功修改', async () => {
    const phone = makePhone();
    const token = await registerAndLogin(phone, 'OldPass123!');
    const res = await request
      .put('/api/users/me/password')
      .set('Authorization', 'Bearer ' + token)
      .send({ current_password: 'OldPass123!', new_password: 'NewPass456!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('错误当前密码应返回 400', async () => {
    const token = await registerAndLogin(makePhone(), 'OldPass123!');
    const res = await request
      .put('/api/users/me/password')
      .set('Authorization', 'Bearer ' + token)
      .send({ current_password: 'WrongPass!', new_password: 'NewPass456!' });
    expect(res.status).toBe(400);
  });

  it('新密码过短应返回 400', async () => {
    const token = await registerAndLogin(makePhone(), 'OldPass123!');
    const res = await request
      .put('/api/users/me/password')
      .set('Authorization', 'Bearer ' + token)
      .send({ current_password: 'OldPass123!', new_password: '123' });
    expect(res.status).toBe(400);
  });

  it('未登录应返回 401', async () => {
    const res = await request
      .put('/api/users/me/password')
      .send({ current_password: 'OldPass123!', new_password: 'NewPass456!' });
    expect(res.status).toBe(401);
  });
});
