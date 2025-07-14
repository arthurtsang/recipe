import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
} 