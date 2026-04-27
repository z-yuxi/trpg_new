import { Router, type IRouter } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { userService } from '../services/user-service';
import { authService } from '../services/auth-service';

const router: IRouter = Router();

// 速率限制：每 IP 每 15 分钟最多 10 次登录尝试
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请 15 分钟后再试' },
});

// 速率限制：每 IP 每小时最多 5 次注册
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '注册请求过于频繁，请 1 小时后再试' },
});

const registerSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(8).regex(/(?=.*[a-zA-Z])(?=.*\d)/, '密码需包含字母和数字'),
  nickname: z.string().min(1),
});

const loginSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const user = await userService.register(parsed.data);
    const tokens = authService.generateTokens(user);
    res.status(201).json({ user: userService.toSafeUser(user), tokens });
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? '';
    const status = msg.includes('已注册') ? 409 : 400;
    res.status(status).json({ error: msg || 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const { user, tokens } = await authService.login(parsed.data.phone, parsed.data.password);
    res.json({ user: userService.toSafeUser(user), tokens });
  } catch {
    res.status(401).json({ error: '手机号或密码错误' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', loginLimiter, async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'refresh_token is required' });
    return;
  }
  try {
    const tokens = await authService.refreshTokens(parsed.data.refresh_token);
    res.json({ tokens });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

export default router;
