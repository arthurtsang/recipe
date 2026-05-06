import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Sanitize a string for use as alias: lowercase, alphanumeric and hyphens only. */
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

/** Return a unique default alias for a new user (name or email fallback). */
export async function uniqueDefaultAlias(preferred: string, emailFallback: string): Promise<string> {
  const base = sanitizeAlias(preferred || emailFallback.split('@')[0] || 'user');
  let alias = base;
  let n = 1;
  while (true) {
    const existing = await prisma.user.findUnique({ where: { alias } });
    if (!existing) return alias;
    alias = `${base}-${++n}`;
  }
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function getUserByAlias(alias: string) {
  return prisma.user.findUnique({ where: { alias } });
}

export async function setUserAlias(userId: string, alias: string) {
  return prisma.user.update({ where: { id: userId }, data: { alias } });
}

/** Display name for app: alias first (when set), then name, then email. */
export function userDisplayName(u: { alias?: string | null; name?: string | null; email: string } | null): string {
  if (!u) return '';
  return (u.alias && u.alias.trim()) || u.name || u.email || '';
} 