/**
 * Backfill User.alias for existing users where alias is null.
 * Sets alias = sanitized(name || email local part), with uniqueness suffix if needed.
 *
 * Usage: npx ts-node scripts/backfill-user-alias.ts
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function sanitizeAlias(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'user';
}

async function findUniqueAlias(base: string): Promise<string> {
  let alias = base;
  let n = 1;
  while (true) {
    const existing = await prisma.user.findUnique({ where: { alias } });
    if (!existing) return alias;
    alias = `${base}-${++n}`;
  }
}

async function main() {
  const users = await prisma.user.findMany({
    where: { alias: null },
    select: { id: true, name: true, email: true },
  });
  console.log(`Found ${users.length} user(s) with null alias.`);
  for (const u of users) {
    const preferred = u.name || u.email.split('@')[0] || 'user';
    const base = sanitizeAlias(preferred);
    const alias = await findUniqueAlias(base);
    await prisma.user.update({ where: { id: u.id }, data: { alias } });
    console.log(`  ${u.email} → alias: ${alias}`);
  }
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
