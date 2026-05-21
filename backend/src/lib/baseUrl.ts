import type { Request } from 'express';

/** Public app URL — set BASE_URL in env (e.g. https://recipe.example.com). */
export function getBaseUrl(): string {
  const fromEnv = process.env.BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}`;
  }
  return 'http://localhost:4000';
}

/** Request origin when behind a reverse proxy (Vercel, nginx). */
export function getRequestOrigin(req: Request): string {
  const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host');
  if (proto && host) return `${proto}://${host}`;
  if (host) {
    const secure = req.secure || proto === 'https';
    return `${secure ? 'https' : 'http'}://${host}`;
  }
  return getBaseUrl();
}

export function corsOrigins(): string[] {
  const origins = new Set<string>([getBaseUrl()]);
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:4000');
    origins.add('http://localhost:5173');
  }
  return [...origins];
}

export function isProductionDeploy(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}
