import type { Request } from 'express';

import { env } from './env';

function httpsHost(hostOrUrl: string): string {
  const stripped = hostOrUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${stripped}`;
}

/**
 * Public app URL used for OIDC baseURL / redirects.
 * On Vercel Preview, prefer the deployment/branch host so Google callback
 * does not send users to Production (BASE_URL).
 */
export function getBaseUrl(): string {
  // Preview: never use Production BASE_URL — that causes OAuth state mismatch.
  if (process.env.VERCEL_ENV === 'preview') {
    const branch = env('VERCEL_BRANCH_URL');
    if (branch) return httpsHost(branch);
    const deployment = env('VERCEL_URL');
    if (deployment) return httpsHost(deployment);
  }

  const fromEnv = env('BASE_URL');
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  const vercelProduction = env('VERCEL_PROJECT_PRODUCTION_URL');
  if (vercelProduction) return httpsHost(vercelProduction);

  const vercelUrl = env('VERCEL_URL');
  if (vercelUrl) return httpsHost(vercelUrl);

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
  const base = env('BASE_URL');
  if (base) origins.add(base.replace(/\/+$/, ''));
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:4000');
    origins.add('http://localhost:5173');
  }
  return [...origins];
}

export function isProductionDeploy(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}
