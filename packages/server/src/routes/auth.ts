import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { userService } from '../services/user-service';
import { authService } from '../services/auth-service';

const router: IRouter = Router();

const registerSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(6),
  nickname: z.string().min(1),
});

const loginSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const user = await userService.register(parsed.data);
    const tokens = authService.generateTokens(user);
    res.status(201).json({ user, tokens });
  } catch (err: any) {
    const status = err?.message?.includes('已注册') ? 409 : 400;
    res.status(status).json({ error: err?.message ?? 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const { user, tokens } = await authService.login(parsed.data.phone, parsed.data.password);
    res.json({ user, tokens });
  } catch {
    res.status(401).json({ error: '手机号或密码错误' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    res.status(400).json({ error: 'refresh_token is required' });
    return;
  }
  try {
    const tokens = await authService.refreshTokens(refresh_token);
    res.json({ tokens });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

export default router;
