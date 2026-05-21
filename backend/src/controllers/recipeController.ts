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
import { prisma } from '../lib/prisma';
import axios from 'axios';
import {
  isWasabiEnabled,
  promoteLocalFileToWasabi,
  uploadBufferToWasabi,
  objectKeyForFilename,
  deleteWasabiObjectByPublicUrl,
  isWasabiPublicUrl,
  parseWasabiKeyFromPublicUrl,
  wasabiPresignedGetUrl,
  getWasabiConfig,
  guessContentType,
} from '../lib/wasabiStorage';
import { getRequestOrigin } from '../lib/baseUrl';
import { isServerless } from '../lib/serverless';
import {
  resolveClientSideRecipeImageUrl,
  decodeObjectKeyFromMediaParam,
  normalizeListRecipesForClient,
  normalizeRecipeImageFieldsForClient,
  resolveImageUrlForStorage,
  wasabiPresignExpiresSec,
} from '../lib/recipeMedia';

// Extend Express Request to include file property
interface MulterRequest extends Request {
  file?: any;
}

async function resolveStoredImageUrl(
  file: { path?: string; buffer?: Buffer; filename: string; mimetype?: string }
): Promise<string> {
  if (isWasabiEnabled()) {
    if (file.buffer) {
      const key = objectKeyForFilename(file.filename);
      return uploadBufferToWasabi(
        file.buffer,
        key,
        file.mimetype || guessContentType(file.filename)
      );
    }
    if (file.path) {
      return promoteLocalFileToWasabi(file.path, file.filename, true);
    }
    throw new Error('No file data for Wasabi upload');
  }
  if (isServerless()) {
    throw new Error('Wasabi must be configured for image storage on serverless');
  }
  return `/uploads/${file.filename}`;
}

const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!isServerless() && !fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const useMemoryStorage = isServerless() || isWasabiEnabled();

const storage = useMemoryStorage
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
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

export async function uploadImageHandler(req: MulterRequest, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = path.extname(req.file.originalname);
    const filename =
      req.file.filename || `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const url = await resolveStoredImageUrl({
      path: req.file.path,
      buffer: req.file.buffer,
      filename,
      mimetype: req.file.mimetype,
    });
    return res.json({ url: (await resolveClientSideRecipeImageUrl(url)) ?? url });
  } catch (e) {
    console.error('uploadImageHandler', e);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
    }
    res.status(500).json({ error: 'Upload failed' });
  }
}

export async function getAllRecipes(req: Request, res: Response) {
  const start = Date.now();
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 12;
    const recipes = await recipeService.getAllPublicRecipes(q, page, limit);
    const ms = Date.now() - start;
    console.log(`[GET] /api/recipes page=${page} limit=${limit} → ${recipes.length} recipes in ${ms}ms`);
    res.json(await normalizeListRecipesForClient(recipes));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
}

export async function getRecipeById(req: Request, res: Response) {
  try {
    const recipe = await recipeService.getRecipeById(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

    // Rewrite /uploads/ to absolute app URL; Wasabi URLs become presigned GETs (direct to bucket)
    if (recipe.imageUrl?.startsWith('/uploads/')) {
      recipe.imageUrl = recipe.imageUrl.replace(/^\/uploads\/?/, '/api/uploads/');
      recipe.imageUrl = `${getRequestOrigin(req)}${recipe.imageUrl}`;
    } else if (recipe.imageUrl) {
      recipe.imageUrl = (await resolveClientSideRecipeImageUrl(recipe.imageUrl)) ?? recipe.imageUrl;
    }
    if (recipe.versions?.length) {
      const origin = getRequestOrigin(req);
      for (const v of recipe.versions) {
        if (v.imageUrl?.startsWith('/uploads/')) {
          const u = v.imageUrl.replace(/^\/uploads\/?/, '/api/uploads/');
          v.imageUrl = `${origin}${u}`;
        } else if (v.imageUrl) {
          v.imageUrl = (await resolveClientSideRecipeImageUrl(v.imageUrl)) ?? v.imageUrl;
        }
      }
    }

    res.json(recipe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch recipe' });
  }
}

async function resolveStoredImageFromPath(localPath: string, filename: string): Promise<string> {
  if (isWasabiEnabled() || isServerless()) {
    const buffer = fs.readFileSync(localPath);
    return resolveStoredImageUrl({
      buffer,
      filename,
      mimetype: guessContentType(filename),
    });
  }
  return resolveStoredImageUrl({ path: localPath, filename });
}

// Function to download external image or copy local file and save to storage
export async function downloadAndSaveImage(imageUrl: string): Promise<string> {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return imageUrl ?? '';
  }

  if (imageUrl.startsWith('https://') && imageUrl.includes('wasabisys.com')) {
    return imageUrl;
  }

  // Local file path from AI service (e.g. /tmp/ai-service-thumbnails/<job_id>.jpg)
  let localPath: string | null = null;
  if (imageUrl.startsWith('file://')) {
    try {
      const u = new URL(imageUrl);
      localPath = u.pathname;
    } catch {
      localPath = null;
    }
  } else if (imageUrl.startsWith('/') && path.isAbsolute(imageUrl)) {
    localPath = imageUrl;
  }
  if (localPath) {
    try {
      if (!fs.existsSync(localPath)) {
        console.warn(`Local image path does not exist: ${localPath}`);
        return '';
      }
      const ext = path.extname(localPath).toLowerCase() || '.jpg';
      const validExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const extSafe = validExts.includes(ext) ? ext : '.jpg';
      const hash = crypto.createHash('md5').update(localPath + String(Date.now())).digest('hex');
      const filename = `recipe-${hash}${extSafe}`;
      const filepath = path.join(uploadDir, filename);
      fs.copyFileSync(localPath, filepath);
      console.log(`Copied local image to ${filepath}`);
      return await resolveStoredImageFromPath(filepath, filename);
    } catch (err) {
      console.error(`Error copying local image from ${localPath}:`, err);
      return '';
    }
  }

  if (!imageUrl.startsWith('http')) {
    return imageUrl; // Return as-is if not external URL and not local path
  }

  try {
    const url = new URL(imageUrl);
    // If URL points to our own uploads (localhost /api/uploads/ or /uploads/), skip download
    // and return the local path — avoids HTTPS-to-HTTP mismatch (wrong version number) on dev
    const pathMatch = url.pathname.match(/^\/(?:api\/)?uploads\/(.+)$/);
    if (pathMatch && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
      const relativePath = pathMatch[1];
      const localUpload = path.join(uploadDir, path.basename(relativePath));
      if (isWasabiEnabled() && fs.existsSync(localUpload)) {
        return await resolveStoredImageFromPath(localUpload, path.basename(relativePath));
      }
      // Never download from localhost — backend serves HTTP, so https would cause SSL error.
      // Return the local path as-is (same image URL); if file is missing, recipe keeps the path.
      return `/uploads/${relativePath}`;
    }

    const fileExt = url.pathname.split('.').pop()?.toLowerCase() || 'jpg';
    const validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const ext = validExts.includes(fileExt) ? fileExt : 'jpg';
    
    // Generate unique filename
    const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
    const filename = `recipe-${hash}.${ext}`;
    const contentType = guessContentType(filename);

    if (isWasabiEnabled() || isServerless()) {
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const client = url.protocol === 'https:' ? https : http;
        const request = client.get(
          imageUrl,
          { timeout: 10000, rejectUnauthorized: false },
          (response) => {
            if (response.statusCode !== 200) {
              console.warn(
                `Failed to download image from ${imageUrl}: HTTP ${response.statusCode}. Using original URL.`
              );
              resolve(Buffer.alloc(0));
              return;
            }
            const chunks: Buffer[] = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
          }
        );
        request.on('error', reject);
        request.setTimeout(10000, () => {
          request.destroy();
          reject(new Error('Download timeout'));
        });
      });
      if (buffer.length === 0) return imageUrl;
      return await resolveStoredImageUrl({
        buffer,
        filename,
        mimetype: contentType,
      });
    }

    const filepath = path.join(process.cwd(), 'uploads', filename);

    console.log(`Downloading image from ${imageUrl} to ${filepath}`);

    const uploadsDir = path.dirname(filepath);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    if (fs.existsSync(filepath)) {
      console.log(`File already exists: ${filepath}`);
      return await resolveStoredImageFromPath(filepath, filename);
    }

    const client = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const requestOptions = {
        timeout: 10000,
        rejectUnauthorized: false,
      };

      const request = client.get(imageUrl, requestOptions, (response) => {
        if (response.statusCode !== 200) {
          console.warn(`Failed to download image from ${imageUrl}: HTTP ${response.statusCode}. Using original URL.`);
          resolve(imageUrl);
          return;
        }

        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`Successfully downloaded image to ${filepath}`);
          void (async () => {
            try {
              resolve(await resolveStoredImageFromPath(filepath, filename));
            } catch (err) {
              reject(err);
            }
          })();
        });

        fileStream.on('error', (err) => {
          console.error(`Error writing file ${filepath}:`, err);
          fs.unlink(filepath, () => {});
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
    const localImageUrl = imageUrl
      ? await downloadAndSaveImage(resolveImageUrlForStorage(imageUrl) ?? imageUrl)
      : '';

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

    res.status(201).json(await normalizeRecipeImageFieldsForClient(updatedRecipe));
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
    const { title, description, ingredients, instructions, imageUrl, tags, cookTime, difficulty, createNewVersion, versionName } = req.body;

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

    // Treat empty string as no image
    const rawImageUrl = (typeof imageUrl === 'string' && !imageUrl.trim()) ? null : (imageUrl ?? null);
    const normalizedIncoming =
      rawImageUrl == null ? null : (resolveImageUrlForStorage(rawImageUrl) ?? rawImageUrl);
    const localImageUrl =
      normalizedIncoming && normalizedIncoming !== existingRecipe.imageUrl
        ? await downloadAndSaveImage(normalizedIncoming)
        : normalizedIncoming;

    // When updating in place, delete old stored image if we're replacing or removing the image
    if (createNewVersion === false) {
      const oldImageUrl = existingRecipe.imageUrl ?? existingRecipe.currentVersion?.imageUrl ?? null;
      if (oldImageUrl && localImageUrl !== oldImageUrl) {
        deleteStoredImageIfExists(oldImageUrl);
      }
    }

    if (createNewVersion === true) {
      // Create a new RecipeVersion and set it as current (so "Save as new version" shows up in version list)
      await prisma.$transaction(async (tx) => {
        const newVersion = await tx.recipeVersion.create({
          data: {
            recipeId: id,
            title: title ?? existingRecipe.title,
            description: description ?? existingRecipe.description ?? '',
            ingredients: ingredients ?? existingRecipe.currentVersion?.ingredients ?? '',
            instructions: instructions ?? existingRecipe.currentVersion?.instructions ?? '',
            imageUrl: localImageUrl ?? existingRecipe.currentVersion?.imageUrl ?? null,
            name: typeof versionName === 'string' ? versionName : null,
          },
        });
        await tx.recipe.update({
          where: { id },
          data: {
            title: title ?? existingRecipe.title,
            description: description ?? existingRecipe.description ?? null,
            imageUrl: localImageUrl ?? existingRecipe.imageUrl ?? null,
            estimatedTime: cookTime ?? existingRecipe.estimatedTime ?? null,
            difficulty: difficulty ?? existingRecipe.difficulty ?? null,
            currentVersionId: newVersion.id,
          },
        });
      });
    } else {
      // Update recipe and current version in place
      await prisma.recipe.update({
        where: { id },
        data: {
          title,
          description,
          imageUrl: localImageUrl ?? null,
          estimatedTime: cookTime,
          difficulty,
        },
      });
      if (existingRecipe.currentVersionId) {
        await prisma.recipeVersion.update({
          where: { id: existingRecipe.currentVersionId },
          data: {
            title,
            description: description || '',
            ingredients: ingredients || '',
            instructions: instructions || '',
            imageUrl: localImageUrl ?? null,
          },
        });
      }
    }

    // Return the updated recipe with versions (same shape as GET so frontend does not crash)
    const recipe = await prisma.recipe.findUnique({
      where: { id },
      include: {
        user: true,
        versions: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!recipe) {
      return res.status(500).json({ error: 'Recipe not found after update' });
    }
    // Ensure versions is always an array so frontend never crashes
    const payload = { ...recipe, versions: recipe.versions ?? [] };
    res.json(await normalizeRecipeImageFieldsForClient(payload));
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

function deleteStoredImageIfExists(imageUrl: string | null | undefined): void {
  if (!imageUrl) return;
  const resolved = resolveImageUrlForStorage(imageUrl) ?? imageUrl;
  if (resolved.startsWith('/uploads/')) {
    const imgPath = path.join(uploadDir, path.basename(resolved));
    try {
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    } catch (e) {
      console.warn('Could not delete image file:', imgPath, e);
    }
    return;
  }
  if (isWasabiEnabled() && isWasabiPublicUrl(resolved)) {
    void deleteWasabiObjectByPublicUrl(resolved);
  }
}

export async function deleteRecipe(req: Request, res: Response) {
  try {
    if (!req.oidc?.user?.email) return res.status(401).json({ error: 'Not authenticated' });
    const dbUser = await prisma.user.findUnique({ where: { email: req.oidc.user.email.toLowerCase() } });
    if (!dbUser) return res.status(401).json({ error: 'User not found' });

    const recipe = await prisma.recipe.findUnique({
      where: { id: req.params.id },
      include: { versions: true },
    });
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    if (recipe.userId !== dbUser.id) return res.status(403).json({ error: 'Not authorized to delete this recipe' });

    // Delete main recipe image if local
    deleteStoredImageIfExists(recipe.imageUrl);
    // Delete all version images (dedupe by URL in case recipe.imageUrl === version.imageUrl)
    const deletedUrls = new Set<string>();
    for (const v of recipe.versions) {
      if (v.imageUrl && !deletedUrls.has(v.imageUrl)) {
        deletedUrls.add(v.imageUrl);
        deleteStoredImageIfExists(v.imageUrl);
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
    if (!req.oidc?.user?.email) return res.status(401).json({ error: 'Not authenticated' });
    const dbUser = await prisma.user.findUnique({ where: { email: req.oidc.user.email.toLowerCase() } });
    if (!dbUser) return res.status(401).json({ error: 'User not found' });

    const recipe = await prisma.recipe.findUnique({ where: { id }, include: { versions: true } });
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    if (recipe.userId !== dbUser.id) return res.status(403).json({ error: 'Not authorized to delete this version' });

    const version = await prisma.recipeVersion.findUnique({ where: { id: versionId } });
    if (!version) return res.status(404).json({ error: 'Version not found' });
    if (version.recipeId !== id) return res.status(400).json({ error: 'Version does not belong to this recipe' });

    // Delete the version's local image file
    deleteStoredImageIfExists(version.imageUrl);

    await prisma.recipeVersion.delete({ where: { id: versionId } });

    // If we deleted the current version, point recipe to another version or clear
    if (recipe.currentVersionId === versionId) {
      const remaining = recipe.versions
        .filter((v) => v.id !== versionId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const nextVersion = remaining.length > 0 ? remaining[remaining.length - 1] : null;
      await prisma.recipe.update({
        where: { id },
        data: {
          currentVersionId: nextVersion?.id ?? null,
          title: nextVersion?.title ?? recipe.title,
          description: nextVersion?.description ?? recipe.description,
          imageUrl: nextVersion?.imageUrl ?? null,
        },
      });
    }

    const updated = await prisma.recipe.findUnique({
      where: { id },
      include: { versions: { orderBy: { createdAt: 'asc' } }, user: true },
    });
    const payload = updated ? { ...updated, versions: updated.versions ?? [] } : null;
    res.json(payload);
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
    res.json(await normalizeListRecipesForClient(recipes));
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
    const raw = req.body?.alias;
    if (!raw || typeof raw !== 'string') return res.status(400).json({ error: 'Alias required' });
    const alias = raw.trim().toLowerCase();
    if (!alias) return res.status(400).json({ error: 'Alias required' });
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
    const userWithDisplayName = { ...user, displayName: userService.userDisplayName(user) };
    res.json({ user: userWithDisplayName, recipes: await normalizeListRecipesForClient(recipes) });
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
    const response = await axios.post(`${aiServiceUrl}/recipe/import`, { url });
    
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
    const response = await axios.post(`${aiServiceUrl}/recipe/auto-category`, { title, description, ingredients, instructions });
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
    
    // Call AI service for chat (AI returns { response }; frontend expects { answer, recipes })
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
    const response = await axios.post(`${aiServiceUrl}/recipe/chat`, { question });
    const data = response.data as { response?: string; answer?: string; recipes?: unknown[] };
    res.status(200).json({
      answer: data.answer ?? data.response ?? '',
      recipes: data.recipes ?? [],
    });
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

/** Legacy/opaque links: redirect to a presigned Wasabi GET (browser loads object from bucket). */
export async function serveRecipeMedia(req: Request, res: Response) {
  try {
    if (!isWasabiEnabled()) {
      console.warn(
        '[serveRecipeMedia] Wasabi not configured — set WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY, WASABI_BUCKET, and WASABI_REGION'
      );
      return res.status(503).json({
        error: 'Object storage is not configured',
        hint: 'Set WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY, WASABI_BUCKET, WASABI_REGION (and optional WASABI_KEY_PREFIX, WASABI_ENDPOINT, WASABI_PUBLIC_URL_BASE).',
      });
    }
    const k = typeof req.query.k === 'string' ? req.query.k : '';
    let decodedForLog: string | null = null;
    if (k) {
      try {
        decodedForLog = Buffer.from(k.trim(), 'base64url').toString('utf8');
      } catch {
        decodedForLog = null;
      }
    }
    const key = decodeObjectKeyFromMediaParam(k);
    if (!key) {
      const cfg = getWasabiConfig();
      console.warn('[serveRecipeMedia] invalid image reference (400)', {
        decodedUtf8: decodedForLog,
        bucket: cfg?.bucket,
        keyPrefix: cfg?.keyPrefix,
        wasabiEnabled: isWasabiEnabled(),
      });
      return res.status(400).json({ error: 'Invalid image reference' });
    }
    const signed = await wasabiPresignedGetUrl(key, wasabiPresignExpiresSec());
    return res.redirect(302, signed);
  } catch (e: unknown) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
    if (name === 'NoSuchKey' || name === 'NotFound') {
      if (!res.headersSent) return res.status(404).end();
      return;
    }
    console.error('[serveRecipeMedia]', e);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to load image' });
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

    // Wasabi: redirect to presigned GET (browser fetches from bucket)
    if (isWasabiEnabled() && url.includes('wasabisys.com')) {
      const key = parseWasabiKeyFromPublicUrl(url);
      if (key) {
        try {
          const signed = await wasabiPresignedGetUrl(key, wasabiPresignExpiresSec());
          return res.redirect(302, signed);
        } catch (e) {
          console.error('[proxy-image] Wasabi presign failed', e);
          if (!res.headersSent) {
            return res.status(502).json({ error: 'Failed to fetch stored image' });
          }
          return;
        }
      }
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