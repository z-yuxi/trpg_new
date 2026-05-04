/**
 * campaigns.ts — 战役路由聚合器（PR-2 重构后）
 *
 * 职责：注册认证中间件，并挂载三个子路由模块。
 *   - campaign-read.routes.ts    所有只读 GET 端点
 *   - campaign-write.routes.ts   创建 / 更新 / 删除端点
 *   - campaign-realtime.routes.ts OB 授权 + Socket.IO 推送端点
 *
 * 原文件（1684 行）已拆分，本文件保留为向后兼容的聚合入口。
 * 导入路径不变，挂载方式不变（app.use('/api/campaigns', campaignRouter)）。
 */

import { Router, type IRouter } from 'express';
import { authMiddleware } from '../middleware/auth';
import { campaignReadRouter } from './campaign-read.routes';
import { campaignWriteRouter } from './campaign-write.routes';
import { campaignRealtimeRouter } from './campaign-realtime.routes';

const router: IRouter = Router();

// 所有战役路由都需要认证
router.use(authMiddleware);

// 写入端点（POST/quick-create, POST/join 需先注册，避免被 /:id 参数捕获）
router.use('/', campaignWriteRouter);
// 读取端点
router.use('/', campaignReadRouter);
// 实时推送端点（OB 授权 grant / revoke）
router.use('/', campaignRealtimeRouter);

export default router;
