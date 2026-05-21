import { PrismaClient } from '@prisma/client';

import { getRuntimeDatabaseUrl, warnDatabaseUrlConfig } from './databaseUrl';

const globalForPrisma = globalThis as typeof globalThis & { __prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  warnDatabaseUrlConfig();
  return new PrismaClient({
    datasources: {
      db: { url: getRuntimeDatabaseUrl() },
    },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

/** Single shared client — critical on Vercel where each PrismaClient opens DB connections. */
export const prisma = globalForPrisma.__prisma ?? createPrismaClient();

globalForPrisma.__prisma = prisma;
