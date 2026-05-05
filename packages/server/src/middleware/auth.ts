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

/**
 * Creator guard — must be used AFTER authMiddleware.
 * Allows access only when user.subscription_type === 'creator'
 * or user.user_type includes 'creator' or 'admin'.
 */
export function requireCreator(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const isCreator =
    user.subscription_type === 'creator' ||
    (Array.isArray(user.user_type) && (user.user_type.includes('creator') || user.user_type.includes('admin')));
  if (!isCreator) {
    res.status(403).json({ error: 'Creator permission required' });
    return;
  }
  next();
}

/**
 * Admin guard — must be used AFTER authMiddleware.
 * Allows access only when user.user_type includes 'admin'.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const isAdmin = Array.isArray(user.user_type) && user.user_type.includes('admin');
  if (!isAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Admin permission required' });
    return;
  }
  next();
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
