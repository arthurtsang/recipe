import type { Request, Response, NextFunction } from 'express';

export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    res.status(503).json({ error: 'Cron not configured' });
    return;
  }
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
