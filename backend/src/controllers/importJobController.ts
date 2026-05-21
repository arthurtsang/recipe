import { Request, Response } from 'express';
import { normalizeRecipeImageFieldsForClient } from '../lib/recipeMedia';
import { prisma } from '../lib/prisma';
import { 
  createImportJob, 
  getImportJob, 
  getUserImportJobs, 
  processImportJob,
  updateImportJobSavedRecipe
} from '../services/importJobService';
import { downloadAndSaveImage } from './recipeController';

/** Resolve current user from req.oidc (session) or Authorization Bearer token. Used by startImport. */
async function getAuthenticatedUserForImport(req: Request): Promise<{ id: string; email: string } | null> {
  const email = (req as any).oidc?.user?.email;
  if (email) {
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, email: true } });
    return u;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const u = await prisma.user.findFirst({
        where: { apiToken: token, isEnabled: true },
        select: { id: true, email: true },
      });
      return u ?? null;
    }
  }
  return null;
}

export async function startImport(req: Request, res: Response) {
  try {
    console.log('[IMPORT] startImport function called');
    console.log('[IMPORT] Request method:', req.method);
    console.log('[IMPORT] Request path:', req.path);
    console.log('[IMPORT] Request originalUrl:', req.originalUrl);

    const dbUser = await getAuthenticatedUserForImport(req);
    if (!dbUser) {
      console.log('[IMPORT] Not authenticated');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Log the raw request body for debugging
    console.log('[IMPORT] Raw request body:', JSON.stringify(req.body));
    console.log('[IMPORT] Request body type:', typeof req.body);
    console.log('[IMPORT] Request body keys:', Object.keys(req.body || {}));
    
    // Single endpoint: body is { urls: string[] }. One URL = [url].
    const raw = req.body?.urls ?? req.body?.url;
    const urlList: string[] = Array.isArray(raw)
      ? raw.filter((u: unknown) => typeof u === 'string' && (u as string).trim()).map((u: string) => (u as string).trim())
      : typeof raw === 'string' && raw.trim()
        ? [raw.trim()]
        : [];

    if (urlList.length === 0) {
      return res.status(400).json({ error: 'Request body must include urls (array of URLs). Example: { "urls": ["https://..."] }' });
    }

    const jobs = await Promise.all(
      urlList.map((url) => createImportJob(dbUser.id, url))
    );

    jobs.slice(0, 3).forEach((job) => {
      processImportJob(job.id).catch((err) => console.error(`[IMPORT] Job ${job.id} failed:`, err));
    });
    jobs.slice(3).forEach((job, index) => {
      setTimeout(() => {
        processImportJob(job.id).catch((err) => console.error(`[IMPORT] Job ${job.id} failed:`, err));
      }, (index + 1) * 5000);
    });

    res.json({
      jobIds: jobs.map((j) => j.id),
      jobs: jobs.map((j) => ({ jobId: j.id, url: j.url, status: j.status })),
      message: jobs.length === 1 ? 'Import job started' : `${jobs.length} import jobs started`,
    });

  } catch (error) {
    console.error('Error starting import:', error);
    res.status(500).json({ error: 'Failed to start import job' });
  }
}

export async function getImportStatus(req: Request, res: Response) {
  try {
    if (!req.oidc?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const dbUser = await prisma.user.findUnique({ 
      where: { email: req.oidc.user.email.toLowerCase() } 
    });
    if (!dbUser) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { jobId } = req.params;
    const job = await getImportJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Import job not found' });
    }

    // Check if user owns this job
    if (job.userId !== dbUser.id) {
      return res.status(403).json({ error: 'Not authorized to access this import job' });
    }

    res.json({
      id: job.id,
      url: job.url,
      status: job.status,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });

  } catch (error) {
    console.error('Error getting import status:', error);
    res.status(500).json({ error: 'Failed to get import status' });
  }
}

export async function getUserImports(req: Request, res: Response) {
  try {
    if (!req.oidc?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const dbUser = await prisma.user.findUnique({ 
      where: { email: req.oidc.user.email.toLowerCase() } 
    });
    if (!dbUser) {
      return res.status(401).json({ error: 'User not found' });
    }

    const jobs = await getUserImportJobs(dbUser.id);

    res.json(jobs.map(job => ({
      id: job.id,
      url: job.url,
      status: job.status,
      result: job.result,
      error: job.error,
      savedRecipeId: (job as any).savedRecipeId || null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: (job as any).startedAt ?? null,
      completedAt: (job as any).completedAt ?? null,
    })));

  } catch (error) {
    console.error('Error getting user imports:', error);
    res.status(500).json({ error: 'Failed to get user imports' });
  }
}

/** Resolve current user from req.oidc (session/API token middleware) or from Authorization Bearer token. */
async function getAuthenticatedUser(req: Request): Promise<{ id: string; email: string } | null> {
  const email = (req as any).oidc?.user?.email;
  if (email) {
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, email: true } });
    return u;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const u = await prisma.user.findFirst({
        where: { apiToken: token, isEnabled: true },
        select: { id: true, email: true },
      });
      return u;
    }
  }
  return null;
}

/** Atomic: create recipe from import job result and set savedRecipeId in one transaction. Idempotent: if already saved, returns existing recipe. */
export async function saveImportedRecipe(req: Request, res: Response) {
  try {
    const dbUser = await getAuthenticatedUser(req);
    if (!dbUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { jobId } = req.params;
    const job = await getImportJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Import job not found' });
    }
    if (job.userId !== dbUser.id) {
      return res.status(403).json({ error: 'Not authorized to save this import job' });
    }

    const savedId = (job as any).savedRecipeId;
    if (savedId) {
      const existing = await prisma.recipe.findUnique({
        where: { id: savedId },
        include: { user: true, currentVersion: true },
      });
      if (existing) {
        return res.status(200).json(await normalizeRecipeImageFieldsForClient(existing));
      }
    }

    if (job.status !== 'completed' || !job.result) {
      return res.status(400).json({ error: 'Import job must be completed with a result' });
    }
    const result = job.result as any;
    if (!result.title) {
      return res.status(400).json({ error: 'Import result has no title' });
    }

    const title = result.title;
    const description = result.description ?? '';
    const ingredients = result.ingredients ?? '';
    const instructions = result.instructions ?? '';
    const cookTime = result.cookTime ?? result.estimatedTime ?? null;
    const difficulty = result.difficulty ?? null;
    const timeReasoning = result.timeReasoning ?? null;
    const difficultyReasoning = result.difficultyReasoning ?? null;
    const localImageUrl = result.imageUrl ? await downloadAndSaveImage(result.imageUrl) : '';

    const sourceUrlNormalized = (job.url || '').trim().replace(/\/$/, '') || null;

    const created = await prisma.$transaction(async (tx) => {
      let importedTag = await tx.tag.findUnique({ where: { name: 'imported' } });
      if (!importedTag) {
        importedTag = await tx.tag.create({ data: { name: 'imported' } });
      }

      const existingRecipe =
        sourceUrlNormalized || job.url
          ? await tx.recipe.findFirst({
              where: {
                userId: dbUser.id,
                sourceUrl: { in: [sourceUrlNormalized, job.url].filter(Boolean) as string[] },
              },
              select: { id: true },
            })
          : null;

      const ensureImportedTag = async (recipeId: string) => {
        const existing = await tx.recipeTag.findFirst({
          where: { recipeId, tagId: importedTag!.id },
        });
        if (!existing) {
          await tx.recipeTag.create({
            data: { recipeId, tagId: importedTag!.id },
          });
        }
      };

      if (existingRecipe) {
        const version = await tx.recipeVersion.create({
          data: {
            recipeId: existingRecipe.id,
            title,
            description,
            ingredients,
            instructions,
            imageUrl: localImageUrl,
            name: `Imported ${new Date().toISOString().slice(0, 10)}`,
          },
        });
        await tx.recipe.update({
          where: { id: existingRecipe.id },
          data: {
            currentVersionId: version.id,
            title,
            description,
            imageUrl: localImageUrl,
            estimatedTime: cookTime,
            difficulty,
            timeReasoning,
            difficultyReasoning,
          },
        });
        await ensureImportedTag(existingRecipe.id);
        await tx.importJob.update({
          where: { id: jobId },
          data: { savedRecipeId: existingRecipe.id, updatedAt: new Date() },
        });
        return existingRecipe.id;
      }

      const recipe = await tx.recipe.create({
        data: {
          title,
          description,
          imageUrl: localImageUrl,
          sourceUrl: sourceUrlNormalized ?? job.url,
          userId: dbUser.id,
          estimatedTime: cookTime,
          difficulty,
          timeReasoning,
          difficultyReasoning,
        },
        include: { user: true },
      });
      const version = await tx.recipeVersion.create({
        data: {
          recipeId: recipe.id,
          title,
          description,
          ingredients,
          instructions,
          imageUrl: localImageUrl,
        },
      });
      await tx.recipe.update({
        where: { id: recipe.id },
        data: { currentVersionId: version.id },
      });
      await ensureImportedTag(recipe.id);
      await tx.importJob.update({
        where: { id: jobId },
        data: { savedRecipeId: recipe.id, updatedAt: new Date() },
      });
      return recipe.id;
    });

    const updatedRecipe = await prisma.recipe.findUnique({
      where: { id: created },
      include: { user: true, currentVersion: true },
    });
    if (!updatedRecipe) {
      return res.status(500).json({ error: 'Recipe not found after save' });
    }
    res.status(201).json(await normalizeRecipeImageFieldsForClient(updatedRecipe));
  } catch (error) {
    console.error('Error saving imported recipe:', error);
    res.status(500).json({ error: 'Failed to save imported recipe' });
  }
}

export async function updateImportJobRecipe(req: Request, res: Response) {
  try {
    if (!req.oidc?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const dbUser = await prisma.user.findUnique({ 
      where: { email: req.oidc.user.email.toLowerCase() } 
    });
    if (!dbUser) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { jobId } = req.params;
    const { savedRecipeId } = req.body;

    if (!savedRecipeId) {
      return res.status(400).json({ error: 'savedRecipeId is required' });
    }

    const job = await getImportJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Import job not found' });
    }

    // Check if user owns this job
    if (job.userId !== dbUser.id) {
      return res.status(403).json({ error: 'Not authorized to update this import job' });
    }

    const updatedJob = await updateImportJobSavedRecipe(jobId, savedRecipeId);
    if (!updatedJob) {
      return res.status(404).json({ error: 'Import job not found' });
    }

    res.json({
      id: updatedJob.id,
      url: updatedJob.url,
      status: updatedJob.status,
      savedRecipeId: (updatedJob as any).savedRecipeId,
      message: 'Import job updated successfully'
    });

  } catch (error) {
    console.error('Error updating import job:', error);
    res.status(500).json({ error: 'Failed to update import job' });
  }
}

export async function deleteImportJob(req: Request, res: Response) {
  try {
    if (!req.oidc?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const dbUser = await prisma.user.findUnique({ 
      where: { email: req.oidc.user.email.toLowerCase() } 
    });
    if (!dbUser) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { jobId } = req.params;
    const job = await getImportJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Import job not found' });
    }

    // Check if user owns this job
    if (job.userId !== dbUser.id) {
      return res.status(403).json({ error: 'Not authorized to delete this import job' });
    }

    await prisma.importJob.delete({
      where: { id: jobId },
    });

    res.json({ message: 'Import job deleted successfully' });

  } catch (error) {
    console.error('Error deleting import job:', error);
    res.status(500).json({ error: 'Failed to delete import job' });
  }
} 