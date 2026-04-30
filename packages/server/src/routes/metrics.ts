/**
 * 运营指标 API 路由
 *
 * 所有端点均需 JWT 认证（生产环境建议加 IP 白名单或管理员角色校验）。
 *
 * GET  /api/metrics/business                      进程级业务指标快照（5m 窗口 + 累计）
 * GET  /api/metrics/recruitment/funnel?days=7     漏斗快照
 * GET  /api/metrics/recruitment/daily?days=30     每日日报
 * GET  /api/metrics/recruitment/alerts?days=7     异常告警
 * POST /api/metrics/recruitment/cache/invalidate  手动失效缓存
 */
import { Router, type IRouter } from 'express';
import { authMiddleware } from '../middleware/auth';
import { recruitmentMetricsService } from '../services/recruitment-metrics-service';
import { metrics } from '../utils/business-metrics';
import { alertManager } from '../utils/alert-manager';

const router: IRouter = Router();

// 所有指标路由需要管理员权限
function adminMiddleware(req: any, res: any, next: any) {
  const user = req.user;
  const isAdmin = Array.isArray(user?.user_type) && user.user_type.includes('admin');
  if (!isAdmin) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  next();
}

// ── 漏斗快照 ───────────────────────────────────────────────────────────────────
router.get('/recruitment/funnel', authMiddleware, adminMiddleware, async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days ?? 7)));
  try {
    const snapshot = await recruitmentMetricsService.getFunnelSnapshot(days);
    res.json(snapshot);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// ── 每日日报 ───────────────────────────────────────────────────────────────────
router.get('/recruitment/daily', authMiddleware, adminMiddleware, async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days ?? 30)));
  try {
    const reports = await recruitmentMetricsService.getDailyReports(days);
    res.json({ reports, total: reports.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// ── 异常告警 ───────────────────────────────────────────────────────────────────
router.get('/recruitment/alerts', authMiddleware, adminMiddleware, async (req, res) => {
  const days = Math.min(30, Math.max(1, Number(req.query.days ?? 7)));
  try {
    const alerts = await recruitmentMetricsService.detectAlerts(days);
    res.json({ alerts, count: alerts.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// ── 手动失效缓存 ───────────────────────────────────────────────────────────────
router.post('/recruitment/cache/invalidate', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    await recruitmentMetricsService.invalidateCache();
    res.json({ ok: true, message: '缓存已失效' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Invalidate failed' });
  }
});

// ── 进程级业务指标快照 ─────────────────────────────────────────────────────────
router.get('/business', authMiddleware, adminMiddleware, (_req, res) => {
  res.json(metrics.snapshot());
});

// ── 实时告警状态（P0/P1 规则评估结果） ────────────────────────────────────────
// 返回每条规则的当前状态：ok | firing | cooldown
// 用于 Grafana / 企业微信机器人 / 发布门禁轮询
router.get('/alerts', authMiddleware, adminMiddleware, (_req, res) => {
  const snapshot = metrics.snapshot();
  const rules = alertManager.evaluateSync(snapshot);
  const firing = rules.filter((r) => r.status === 'firing');
  res.json({
    timestamp: new Date().toISOString(),
    has_p0: firing.some((r) => r.level === 'P0'),
    has_p1: firing.some((r) => r.level === 'P1'),
    firing_count: firing.length,
    rules,
  });
});

export default router;
