import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getAllTags() {
  return prisma.tag.findMany();
}

export async function getTagById(id: string) {
  return prisma.tag.findUnique({ where: { id } });
}

export async function createTag(name: string) {
  return prisma.tag.create({ data: { name } });
}

export async function updateTag(id: string, name: string) {
  return prisma.tag.update({ where: { id }, data: { name } });
}

export async function deleteTag(id: string) {
  return prisma.tag.delete({ where: { id } });
} 