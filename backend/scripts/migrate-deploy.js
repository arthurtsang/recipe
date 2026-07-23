#!/usr/bin/env node
/**
 * Run prisma migrate deploy using DIRECT_DATABASE_URL when set (session/direct connection).
 * Transaction pooler (port 6543) must not be used for migrations.
 *
 * Prisma migration history lives in public._prisma_migrations. App data may use
 * ?schema=metrobistro — strip/override that for migrate so persistence initializes.
 */
const { execSync } = require('child_process');

const direct = process.env.DIRECT_DATABASE_URL?.trim();
const database = process.env.DATABASE_URL?.trim();
const url = direct || database;

if (!url) {
  console.error('[migrate] DATABASE_URL is not set');
  process.exit(1);
}

try {
  const u = new URL(url);
  if (u.port === '6543') {
    console.warn(
      '[migrate] Using transaction pooler (6543) for migrations may fail. ' +
        'Set DIRECT_DATABASE_URL to Session pooler (5432) or direct db.*.supabase.co.'
    );
  }
  if (!u.searchParams.has('sslmode')) {
    u.searchParams.set('sslmode', 'require');
  }
  // Keep migration table on public regardless of app schema.
  u.searchParams.set('schema', 'public');
  process.env.DATABASE_URL = u.toString();
  // Avoid Prisma preferring DIRECT_DATABASE_URL with schema=metrobistro over our rewrite.
  delete process.env.DIRECT_DATABASE_URL;
  console.log('[migrate] Using schema=public for prisma migrate deploy');
} catch {
  console.error('[migrate] DATABASE_URL is not a valid URL');
  process.exit(1);
}

execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
