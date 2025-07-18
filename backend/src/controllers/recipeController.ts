import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response } from 'express';
import * as recipeService from '../services/recipeService';
import * as userService from '../services/userService';
import type { FileFilterCallback } from 'multer';
import type { Request as ExpressRequest } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

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
    // Fetch the recipe and its versions to get image URLs
    const recipe = await prisma.recipe.findUnique({
      where: { id: req.params.id },
      include: { versions: true },
    });
    if (recipe) {
      // Delete main recipe image if local
      if (recipe.imageUrl && recipe.imageUrl.startsWith('/uploads/')) {
        const imgPath = path.join(uploadDir, path.basename(recipe.imageUrl));
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      }
      // Delete all version images if local
      for (const v of recipe.versions) {
        if (v.imageUrl && v.imageUrl.startsWith('/uploads/')) {
          const imgPath = path.join(uploadDir, path.basename(v.imageUrl));
          if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }
      }
    }
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
    // Fetch the version to get image URL
    const version = await prisma.recipeVersion.findUnique({ where: { id: versionId } });
    if (version && version.imageUrl && version.imageUrl.startsWith('/uploads/')) {
      const imgPath = path.join(uploadDir, path.basename(version.imageUrl));
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
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

export async function searchRecipes(req: Request, res: Response) {
  try {
    const keywords = Array.isArray(req.body.keywords) ? req.body.keywords : [];
    const page = req.body.page ? parseInt(req.body.page, 10) : 1;
    const limit = req.body.limit ? parseInt(req.body.limit, 10) : 12;
    const recipes = await recipeService.searchRecipesByKeywords(keywords, page, limit);
    res.json(recipes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to search recipes' });
  }
}

export async function setAlias(req: Request, res: Response) {
  try {
    if (!req.oidc?.user?.email) return res.status(401).json({ error: 'Not authenticated' });
    const dbUser = await userService.getUserByEmail(req.oidc.user.email.toLowerCase());
    if (!dbUser) return res.status(404).json({ error: 'User not found' });
    const { alias } = req.body;
    if (!alias || typeof alias !== 'string') return res.status(400).json({ error: 'Alias required' });
    // Check for uniqueness
    const existing = await userService.getUserByAlias(alias);
    if (existing && existing.id !== dbUser.id) return res.status(409).json({ error: 'Alias already taken' });
    await userService.setUserAlias(dbUser.id, alias);
    res.json({ success: true, alias });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set alias' });
  }
}

export async function getRecipesByAlias(req: Request, res: Response) {
  try {
    const { alias } = req.params;
    const user = await userService.getUserByAlias(alias);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isOwner = req.oidc?.user?.email?.toLowerCase() === user.email;
    const recipes = await recipeService.getRecipesByUserId(user.id, isOwner);
    res.json({ user, recipes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user recipes' });
  }
}

export async function importRecipe(req: Request, res: Response) {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    // Call AI service to import recipe from external site
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000/import-recipe';
    const response = await axios.post(aiServiceUrl, { url });
    res.status(200).json(response.data);
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      res.status(err.response?.status || 500).json({ error: err.response?.data?.error || err.message });
    } else if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Failed to import recipe' });
    }
  }
}

export async function autoCategory(req: Request, res: Response) {
  try {
    const { title, description, ingredients, instructions } = req.body;
    if (!title && !description && !ingredients && !instructions) {
      return res.status(400).json({ error: 'At least one field is required' });
    }
    // Call AI service for category prediction
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000/auto-category';
    const response = await axios.post(aiServiceUrl, { title, description, ingredients, instructions });
    res.status(200).json(response.data);
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      res.status(err.response?.status || 500).json({ error: err.response?.data?.error || err.message });
    } else if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Failed to auto-categorize recipe' });
    }
  }
} 