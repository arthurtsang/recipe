import express from 'express';
export const sessionMiddleware = require('express-session')({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
});

export function ensureAuthenticated(req: express.Request, res: express.Response, next: express.NextFunction) {
  const reqAny = req as any;
  if (reqAny.isAuthenticated && reqAny.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
} 