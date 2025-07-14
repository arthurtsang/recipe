import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response } from 'express';
import * as recipeService from '../services/recipeService';
import * as userService from '../services/userService';
import type { FileFilterCallback } from 'multer';
import type { Request as ExpressRequest } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req: ExpressRequest, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => cb(null, uploadDir),
  filename: (req: ExpressRequest, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

const imageMimeTypes = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/avif',
];

const upload = multer({
  storage,
  fileFilter: (req: ExpressRequest, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (imageMimeTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed!'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export const uploadImage = upload.single('image');

export function uploadImageHandler(req: Request, res: Response) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // Return a URL relative to /uploads
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
}

export async function getAllRecipes(req: Request, res: Response) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 12;
    const recipes = await recipeService.getAllPublicRecipes(q, page, limit);
    res.json(recipes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
}

export async function getRecipeById(req: Request, res: Response) {
  try {
    const recipe = await recipeService.getRecipeById(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    console.log('Recipe loaded', recipe);
    recipe.imageUrl = recipe.imageUrl?.startsWith('/uploads/') ? `${process.env.BASE_URL}${recipe.imageUrl}` : recipe.imageUrl;
    res.json(recipe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch recipe' });
  }
}

export async function createRecipe(req: Request, res: Response) {
  try {
    if (!req.oidc?.user || !req.oidc?.user?.email) {
      console.error('Not authenticated', req.oidc);
      return res.status(401).json({ error: 'Not authenticated !!' });
    }
    // Fetch the user from the DB using the email
    const dbUser = await userService.getUserByEmail(req.oidc.user.email.toLowerCase());
    if (!dbUser) {
      console.error('User not found in DB', req.oidc.user.email);
      return res.status(401).json({ error: 'User not found in DB' });
    }
    const userId = dbUser.id;
    console.log('Creating recipe for user', userId);
    const recipe = await recipeService.createRecipe({ ...req.body, userId });
    console.log('Recipe created', recipe);
    res.status(201).json(recipe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create recipe' });
  }
}

export async function updateRecipe(req: Request, res: Response) {
  try {
    const recipe = await recipeService.updateRecipe(req.params.id, req.body);
    res.json(recipe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update recipe' });
  }
}

export async function deleteRecipe(req: Request, res: Response) {
  try {
    await recipeService.deleteRecipe(req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete recipe' });
  }
}

export async function deleteRecipeVersion(req: Request, res: Response) {
  try {
    const { id, versionId } = req.params;
    await prisma.recipeVersion.delete({ where: { id: versionId } });
    // Return the updated recipe with all versions
    const recipe = await prisma.recipe.findUnique({ where: { id }, include: { versions: true } });
    res.json(recipe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete version' });
  }
}

export async function getRecipeRatings(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const ratings = await prisma.rating.findMany({ where: { recipeId: id } });
    const avg = ratings.length ? ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length : null;
    let userRating = null;
    if (req.oidc?.user?.email) {
      const dbUser = await prisma.user.findUnique({ where: { email: req.oidc.user.email.toLowerCase() } });
      if (dbUser) {
        const r = ratings.find(r => r.userId === dbUser.id);
        if (r) userRating = r.value;
      }
    }
    res.json({ average: avg, user: userRating });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get ratings' });
  }
}

export async function rateRecipe(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { value } = req.body;
    if (typeof value !== 'number' || value < 1 || value > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5' });
    }
    if (!req.oidc?.user?.email) return res.status(401).json({ error: 'Not authenticated' });
    const dbUser = await prisma.user.findUnique({ where: { email: req.oidc.user.email.toLowerCase() } });
    if (!dbUser) return res.status(401).json({ error: 'User not found' });
    await prisma.rating.upsert({
      where: { userId_recipeId: { userId: dbUser.id, recipeId: id } },
      update: { value },
      create: { userId: dbUser.id, recipeId: id, value },
    });
    // Return updated average and user rating
    const ratings = await prisma.rating.findMany({ where: { recipeId: id } });
    const avg = ratings.length ? ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length : null;
    res.json({ average: avg, user: value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to rate recipe' });
  }
} 