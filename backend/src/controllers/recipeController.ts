import multer from 'multer';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import crypto from 'crypto';
import { Request, Response } from 'express';
import * as recipeService from '../services/recipeService';
import * as userService from '../services/userService';
import type { FileFilterCallback } from 'multer';
import type { Request as ExpressRequest } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

// Extend Express Request to include file property
interface MulterRequest extends Request {
  file?: any;
}

const prisma = new PrismaClient();

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req: ExpressRequest, file: any, cb: (error: Error | null, destination: string) => void) => cb(null, uploadDir),
  filename: (req: ExpressRequest, file: any, cb: (error: Error | null, filename: string) => void) => {
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
  fileFilter: (req: ExpressRequest, file: any, cb: FileFilterCallback) => {
    if (imageMimeTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed!'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export const uploadImage = upload.single('image');

export function uploadImageHandler(req: MulterRequest, res: Response) {
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
    
    // Use the current request's host instead of hardcoded BASE_URL
    if (recipe.imageUrl?.startsWith('/uploads/')) {
      const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
      const host = req.get('host');
      recipe.imageUrl = `${protocol}://${host}${recipe.imageUrl}`;
    }
    
    res.json(recipe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch recipe' });
  }
}

// Function to download external image and save locally
async function downloadAndSaveImage(imageUrl: string): Promise<string> {
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return imageUrl; // Return as-is if not external URL
  }

  try {
    const url = new URL(imageUrl);
    const fileExt = url.pathname.split('.').pop()?.toLowerCase() || 'jpg';
    const validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const ext = validExts.includes(fileExt) ? fileExt : 'jpg';
    
    // Generate unique filename
    const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
    const filename = `recipe-${hash}.${ext}`;
    // Fix: Save to the same directory that the static middleware serves from
    const filepath = path.join(process.cwd(), 'uploads', filename);
    
    console.log(`Downloading image from ${imageUrl} to ${filepath}`);
    
    // Ensure uploads directory exists
    const uploadsDir = path.dirname(filepath);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Check if file already exists
    if (fs.existsSync(filepath)) {
      console.log(`File already exists: ${filepath}`);
      return `/uploads/${filename}`;
    }

    // Download image
    const client = url.protocol === 'https:' ? https : http;
    
    return new Promise((resolve, reject) => {
      // Configure request options with SSL certificate ignore
      const requestOptions = {
        timeout: 10000,
        // Ignore SSL certificate errors for sites with self-signed certificates
        rejectUnauthorized: false
      };
      
      const request = client.get(imageUrl, requestOptions, (response) => {
        if (response.statusCode !== 200) {
          console.warn(`Failed to download image from ${imageUrl}: HTTP ${response.statusCode}. Using original URL.`);
          // For any non-200 status, fall back to original URL instead of failing
          resolve(imageUrl);
          return;
        }

        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`Successfully downloaded image to ${filepath}`);
          resolve(`/uploads/${filename}`);
        });

        fileStream.on('error', (err) => {
          console.error(`Error writing file ${filepath}:`, err);
          fs.unlink(filepath, () => {}); // Delete partial file
          reject(err);
        });
      });

      request.on('error', (err) => {
        console.error(`Error downloading from ${imageUrl}:`, err);
        reject(err);
      });

      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  } catch (error) {
    console.error('Error in downloadAndSaveImage:', error);
    // If download fails, return original URL
    return imageUrl;
  }
}

export async function createRecipe(req: Request, res: Response) {
  try {
    const { title, description, ingredients, instructions, imageUrl, tags, cookTime, difficulty, timeReasoning, difficultyReasoning } = req.body;
    
    // Debug: Log the entire OIDC object
    console.log('OIDC object:', JSON.stringify((req as any).oidc, null, 2));
    
    // Use the same authentication pattern as rateRecipe
    if (!req.oidc?.user?.email) return res.status(401).json({ error: 'Not authenticated' });
    const dbUser = await prisma.user.findUnique({ where: { email: req.oidc.user.email.toLowerCase() } });
    if (!dbUser) return res.status(401).json({ error: 'User not found' });

    console.log('Found user:', dbUser.id);

    // Download external image if provided
    const localImageUrl = imageUrl ? await downloadAndSaveImage(imageUrl) : '';

    // Create the recipe first
    const recipe = await prisma.recipe.create({
      data: {
        title,
        description,
        imageUrl: localImageUrl,
        userId: dbUser.id,
        estimatedTime: cookTime, // Map cookTime to estimatedTime for database compatibility
        difficulty,
        timeReasoning,
        difficultyReasoning,
      },
      include: {
        user: true,
      },
    });

    // Create the initial version with ingredients and instructions
    const version = await prisma.recipeVersion.create({
      data: {
        recipeId: recipe.id,
        title,
        description: description || '',
        ingredients: ingredients || '',
        instructions: instructions || '',
        imageUrl: localImageUrl,
      },
    });

    // Update the recipe to point to this version as current
    const updatedRecipe = await prisma.recipe.update({
      where: { id: recipe.id },
      data: { currentVersionId: version.id },
      include: {
        user: true,
        currentVersion: true,
      },
    });

    res.status(201).json(updatedRecipe);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const dbError = err as { code: string };
      if (dbError.code === 'P2002') {
        return res.status(400).json({ error: 'Recipe with this title already exists' });
      }
    }
    console.error('Error creating recipe:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateRecipe(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { title, description, ingredients, instructions, imageUrl, tags, cookTime, difficulty } = req.body;
    
    // Use the same authentication pattern as rateRecipe and createRecipe
    if (!req.oidc?.user?.email) return res.status(401).json({ error: 'Not authenticated' });
    const dbUser = await prisma.user.findUnique({ where: { email: req.oidc.user.email.toLowerCase() } });
    if (!dbUser) return res.status(401).json({ error: 'User not found' });

    const userId = dbUser.id;

    // Check if user owns the recipe
    const existingRecipe = await prisma.recipe.findUnique({
      where: { id: id },
      include: { currentVersion: true },
    });

    if (!existingRecipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    if (existingRecipe.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this recipe' });
    }

    // Download external image if provided and different from current
    const localImageUrl = imageUrl && imageUrl !== existingRecipe.imageUrl 
      ? await downloadAndSaveImage(imageUrl) 
      : imageUrl;

    // Update the recipe
    const updatedRecipe = await prisma.recipe.update({
      where: { id: id },
      data: {
        title,
        description,
        imageUrl: localImageUrl,
        estimatedTime: cookTime, // Map cookTime to estimatedTime for database compatibility
        difficulty,
      },
    });

    // Update the current version
    if (existingRecipe.currentVersionId) {
      await prisma.recipeVersion.update({
        where: { id: existingRecipe.currentVersionId },
        data: {
          title,
          description: description || '',
          ingredients: ingredients || '',
          instructions: instructions || '',
          imageUrl: localImageUrl,
        },
      });
    }

    // Return the updated recipe with current version
    const recipe = await prisma.recipe.findUnique({
      where: { id: id },
      include: {
        user: true,
        currentVersion: true,
      },
    });

    res.json(recipe);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const dbError = err as { code: string };
      if (dbError.code === 'P2002') {
        return res.status(400).json({ error: 'Recipe with this title already exists' });
      }
    }
    console.error('Error updating recipe:', err);
    res.status(500).json({ error: 'Internal server error' });
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
    const avg = ratings.length ? ratings.reduce((sum: number, r: any) => sum + r.value, 0) / ratings.length : null;
    let userRating = null;
    if (req.oidc?.user?.email) {
      const dbUser = await prisma.user.findUnique({ where: { email: req.oidc.user.email.toLowerCase() } });
      if (dbUser) {
        const r = ratings.find((r: any) => r.userId === dbUser.id);
        if (r) userRating = r.value;
      }
    }
    res.json({ average: avg, user: userRating });
  } catch (err: unknown) {
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
    const avg = ratings.length ? ratings.reduce((sum: number, r: any) => sum + r.value, 0) / ratings.length : null;
    res.json({ average: avg, user: value });
  } catch (err: unknown) {
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
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
    const response = await axios.post(`${aiServiceUrl}/import-recipe`, { url });
    
    const importedData = response.data;
    
    // Don't download the image here - just return the external URL for preview
    // The image will be downloaded when the user actually saves the recipe
    
    res.status(200).json(importedData);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosError = err as { response: { status: number; data: any } };
      return res.status(axiosError.response.status).json(axiosError.response.data);
    }
    console.error('Error importing recipe:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function autoCategory(req: Request, res: Response) {
  try {
    const { title, description, ingredients, instructions } = req.body;
    if (!title && !description && !ingredients && !instructions) {
      return res.status(400).json({ error: 'At least one field is required' });
    }
    // Call AI service for category prediction
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
    const response = await axios.post(`${aiServiceUrl}/auto-category`, { title, description, ingredients, instructions });
    res.status(200).json(response.data);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosError = err as any;
      res.status(axiosError.response?.status || 500).json({ error: axiosError.response?.data?.error || axiosError.message });
    } else if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Failed to auto-categorize recipe' });
    }
  }
}

export async function chat(req: Request, res: Response) {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Call AI service for chat
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
    const response = await axios.post(`${aiServiceUrl}/chat`, { question });
    res.status(200).json(response.data);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosError = err as any;
      res.status(axiosError.response?.status || 500).json({ error: axiosError.response?.data?.error || axiosError.message });
    } else if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Failed to get chat response' });
    }
  }
}

// Image proxy to handle CORS-blocked external images
export async function proxyImage(req: Request, res: Response) {
  try {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Validate that it's a proper image URL
    if (!url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i)) {
      return res.status(400).json({ error: 'Invalid image URL' });
    }

    // Set appropriate headers to mimic a browser request
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    };

    // For AllRecipes, add their domain as referrer
    if (url.includes('allrecipes.com')) {
      headers['Referer'] = 'https://www.allrecipes.com/';
    }

    const response = await axios.get(url, {
      headers,
      responseType: 'stream',
      timeout: 10000,
      // Ignore SSL certificate errors for sites with self-signed certificates
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      }),
      // Also ignore HTTP agent for completeness
      httpAgent: new (require('http').Agent)({
        keepAlive: true
      })
    });

    // Set appropriate response headers
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Pipe the image data to the response
    response.data.pipe(res);

  } catch (error) {
    console.error('Error proxying image:', error);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
} 