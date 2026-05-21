#!/usr/bin/env node
/**
 * Run prisma migrate deploy using DIRECT_DATABASE_URL when set (session/direct connection).
 * Transaction pooler (port 6543) must not be used for migrations.
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
  process.env.DATABASE_URL = u.toString();
} catch {
  console.error('[migrate] DATABASE_URL is not a valid URL');
  process.exit(1);
}

execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
