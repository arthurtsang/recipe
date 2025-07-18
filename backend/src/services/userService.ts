import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function getUserByAlias(alias: string) {
  return prisma.user.findUnique({ where: { alias } });
}

export async function setUserAlias(userId: string, alias: string) {
  return prisma.user.update({ where: { id: userId }, data: { alias } });
} 