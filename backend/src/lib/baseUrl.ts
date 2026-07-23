import type { Request } from 'express';

import { env } from './env';

/** Stable Preview host (Google OAuth redirect URI). Avoids per-branch *.vercel.app URLs. */
const PREVIEW_STABLE_BASE_URL = 'https://recipe-preview.youramaryllis.com';

function httpsHost(hostOrUrl: string): string {
  const stripped = hostOrUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${stripped}`;
}

/**
 * Public app URL used for OIDC baseURL / redirects.
 *
 * Preview: always use the stable custom domain (env override allowed) so Google
 * redirect_uri matches a single registered URI. Never use Production BASE_URL
 * or per-branch VERCEL_BRANCH_URL on Preview.
 */
export function getBaseUrl(): string {
  if (process.env.VERCEL_ENV === 'preview') {
    const stable =
      env('PREVIEW_BASE_URL') || env('BASE_URL') || PREVIEW_STABLE_BASE_URL;
    return stable.replace(/\/+$/, '');
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
  const preview = env('PREVIEW_BASE_URL');
  if (preview) origins.add(preview.replace(/\/+$/, ''));
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:4000');
    origins.add('http://localhost:5173');
  }
  return [...origins];
}

export function isProductionDeploy(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}
