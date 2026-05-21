import { PrismaClient } from '@prisma/client';

import { env } from './env';
import { isServerless } from './serverless';

const globalForPrisma = globalThis as typeof globalThis & { __prisma?: PrismaClient };

function warnDatabaseUrlConfig(): void {
  const url = env('DATABASE_URL');
  if (!url) {
    console.error('[db] DATABASE_URL is not set');
    return;
  }
  try {
    const u = new URL(url);
    if (isServerless() && u.hostname.startsWith('db.') && u.hostname.includes('supabase.co')) {
      console.warn(
        '[db] DATABASE_URL uses direct Supabase host (db.*.supabase.co). Use Session pooler (*.pooler.supabase.com) on Vercel.'
      );
    }
    if (!u.searchParams.has('sslmode')) {
      console.warn('[db] DATABASE_URL missing sslmode=require — add ?sslmode=require to the connection string');
    }
    if (isServerless() && !u.searchParams.has('connection_limit')) {
      console.warn('[db] DATABASE_URL missing connection_limit=1 — recommended for serverless');
    }
  } catch {
    console.error('[db] DATABASE_URL is not a valid URL — check for unencoded special characters in the password');
  }
}

function createPrismaClient(): PrismaClient {
  warnDatabaseUrlConfig();
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

/** Single shared client — critical on Vercel where each PrismaClient opens DB connections. */
export const prisma = globalForPrisma.__prisma ?? createPrismaClient();

globalForPrisma.__prisma = prisma;
