import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getAllPublicRecipes(q?: string, page: number = 1, limit: number = 12) {
  const where: any = { isPublic: true };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { versions: { some: { ingredients: { contains: q, mode: 'insensitive' } } } },
    ];
  }
  return prisma.recipe.findMany({
    where,
    select: {
      id: true,
      title: true,
      description: true,
      imageUrl: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      createdAt: true,
      updatedAt: true,
      ratings: {
        select: { value: true }
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });
}

export async function getRecipeById(id: string) {
  return prisma.recipe.findUnique({
    where: { id, isPublic: true },
    include: {
      user: { select: { id: true, name: true, email: true } },
      versions: true,
      ratings: true,
      comments: true,
      tags: { include: { tag: true } },
    },
  });
}

export async function createRecipe(data: {
  title: string;
  description?: string;
  ingredients: string;
  instructions: string;
  imageUrl?: string;
  userId: string;
}) {
  return prisma.recipe.create({
    data: {
      title: data.title,
      description: data.description,
      imageUrl: data.imageUrl,
      userId: data.userId,
      isPublic: true,
      versions: {
        create: [{
          title: data.title,
          ingredients: data.ingredients,
          instructions: data.instructions,
          description: data.description,
          imageUrl: data.imageUrl,
        }],
      },
    },
    include: { versions: true },
  });
}

export async function updateRecipe(id: string, data: {
  title?: string;
  description?: string;
  ingredients?: string;
  instructions?: string;
  imageUrl?: string;
  createNewVersion?: boolean;
  versionName?: string;
  versionId?: string;
}) {
  const createNew = data.createNewVersion !== false;
  if (createNew) {
    // Create a new version
    const recipe = await prisma.recipe.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl,
        updatedAt: new Date(),
        versions: {
          create: [{
            title: data.title ?? '',
            ingredients: data.ingredients ?? '',
            instructions: data.instructions ?? '',
            description: data.description,
            imageUrl: data.imageUrl,
            name: data.versionName ?? new Date().toLocaleString(),
          }],
        },
      },
      include: { versions: true },
    });
    return recipe;
  } else if (data.versionId) {
    // Update the specified version
    const recipe = await prisma.recipe.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl,
        updatedAt: new Date(),
        versions: {
          update: {
            where: { id: data.versionId },
            data: {
              title: data.title,
              ingredients: data.ingredients,
              instructions: data.instructions,
              description: data.description,
              imageUrl: data.imageUrl,
              name: data.versionName,
            },
          },
        },
      },
      include: { versions: true },
    });
    return recipe;
  } else {
    throw new Error('versionId is required to update an existing version');
  }
}

export async function deleteRecipe(id: string) {
  return prisma.recipe.delete({ where: { id } });
} 