import { env } from './env';
import { isServerless } from './serverless';

function parseDatabaseUrl(raw: string): URL {
  return new URL(raw);
}

/** Runtime URL for Prisma — enforces serverless-safe pool settings in code. */
export function getRuntimeDatabaseUrl(): string {
  const raw = env('DATABASE_URL');
  if (!raw) {
    throw new Error('[db] DATABASE_URL is not set');
  }

  const u = parseDatabaseUrl(raw);

  if (!u.searchParams.has('sslmode')) {
    u.searchParams.set('sslmode', 'require');
  }

  if (isServerless()) {
    // Prisma defaults to ~num_cpus*2+1 connections per instance; on Vercel that exhausts
    // Supabase Session pooler (5432), which allows only ~15 total server connections.
    u.searchParams.set('connection_limit', '1');
    u.searchParams.set('pool_timeout', '10');

    const isSessionPooler =
      u.hostname.includes('pooler.supabase.com') && (u.port === '5432' || u.port === '');
    const isTransactionPooler = u.port === '6543';

    if (isTransactionPooler) {
      u.searchParams.set('pgbouncer', 'true');
    } else if (isSessionPooler) {
      console.warn(
        '[db] DATABASE_URL uses Supabase Session pooler (port 5432). ' +
          'Switch to Transaction pooler (port 6543) with ?pgbouncer=true on Vercel ' +
          'to avoid "max clients reached" under load. Keep DIRECT_DATABASE_URL on 5432 for migrations.'
      );
    }
  }

  return u.toString();
}

/** Migrations need a session/direct connection — not transaction pooler (6543). */
export function getMigrateDatabaseUrl(): string {
  const raw = env('DIRECT_DATABASE_URL') || env('DATABASE_URL');
  if (!raw) {
    throw new Error('[db] DATABASE_URL is not set');
  }

  const u = parseDatabaseUrl(raw);

  if (u.port === '6543') {
    console.warn(
      '[db] DIRECT_DATABASE_URL / DATABASE_URL uses port 6543 (transaction pooler). ' +
        'Set DIRECT_DATABASE_URL to Session pooler (5432) or direct db.*.supabase.co for migrations.'
    );
  }

  if (!u.searchParams.has('sslmode')) {
    u.searchParams.set('sslmode', 'require');
  }

  return u.toString();
}

export function warnDatabaseUrlConfig(): void {
  const raw = env('DATABASE_URL');
  if (!raw) {
    console.error('[db] DATABASE_URL is not set');
    return;
  }

  try {
    const u = parseDatabaseUrl(raw);
    if (isServerless() && u.hostname.startsWith('db.') && u.hostname.includes('supabase.co')) {
      console.warn(
        '[db] DATABASE_URL uses direct Supabase host (db.*.supabase.co). Use pooler (*.pooler.supabase.com) on Vercel.'
      );
    }
  } catch {
    console.error('[db] DATABASE_URL is not a valid URL — check for unencoded special characters in the password');
  }
}
