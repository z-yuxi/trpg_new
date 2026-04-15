import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth-service';
import { userService } from '../services/user-service';
import type { User } from '@trpg/shared';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = authService.verifyAccessToken(token);
    const user = await userService.findById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    req.user = user;
    req.userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Optional auth - sets req.user if token is present, but continues even without */
export async function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = authService.verifyAccessToken(token);
      const user = await userService.findById(payload.userId);
      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    } catch {
      // Ignore auth errors for optional auth
    }
  }
  next();
}
