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
  const recipes = await prisma.recipe.findMany({
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
  // Map ratings to averageRating and remove ratings array
  return recipes.map((r: any) => {
    const averageRating = r.ratings.length
      ? r.ratings.reduce((sum: number, rat: { value: number }) => sum + rat.value, 0) / r.ratings.length
      : null;
    const { ratings, ...rest } = r;
    return { ...rest, averageRating };
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
  // Delete in the correct order to handle foreign key constraints
  return prisma.$transaction(async (tx) => {
    // First, delete all ratings for this recipe
    await tx.rating.deleteMany({ where: { recipeId: id } });
    
    // Delete all comments for this recipe
    await tx.comment.deleteMany({ where: { recipeId: id } });
    
    // Delete all recipe versions for this recipe
    await tx.recipeVersion.deleteMany({ where: { recipeId: id } });
    
    // Delete all recipe tags for this recipe
    await tx.recipeTag.deleteMany({ where: { recipeId: id } });
    
    // Finally, delete the recipe itself
    return tx.recipe.delete({ where: { id } });
  });
}

export async function searchRecipesByKeywords(keywords: string[], page: number = 1, limit: number = 12) {
  const where: any = { isPublic: true };
  if (keywords && keywords.length > 0) {
    where.OR = keywords.map((kw) => ([
      { title: { contains: kw, mode: 'insensitive' } },
      { description: { contains: kw, mode: 'insensitive' } },
      { versions: { some: { ingredients: { contains: kw, mode: 'insensitive' } } } },
      { versions: { some: { instructions: { contains: kw, mode: 'insensitive' } } } },
    ])).flat();
  }
  const recipes = await prisma.recipe.findMany({
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
      versions: {
        select: {
          ingredients: true,
          instructions: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });
  // Map ratings to averageRating and remove ratings array
  return recipes.map((r: any) => {
    const averageRating = r.ratings.length
      ? r.ratings.reduce((sum: number, rat: { value: number }) => sum + rat.value, 0) / r.ratings.length
      : null;
    const { ratings, ...rest } = r;
    return { ...rest, averageRating };
  });
}

export async function getRecipesByUserId(userId: string, isOwner: boolean) {
  const where: any = { userId };
  if (!isOwner) where.isPublic = true;
  const recipes = await prisma.recipe.findMany({
    where,
    select: {
      id: true,
      title: true,
      description: true,
      imageUrl: true,
      isPublic: true,
      tags: { include: { tag: true } },
      createdAt: true,
      updatedAt: true,
      ratings: { select: { value: true } },
      versions: {
        select: { ingredients: true, instructions: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return recipes.map((r: any) => {
    const averageRating = r.ratings.length
      ? r.ratings.reduce((sum: number, rat: { value: number }) => sum + rat.value, 0) / r.ratings.length
      : null;
    const { ratings, ...rest } = r;
    return { ...rest, averageRating };
  });
} 