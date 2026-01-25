import { Request, Response } from 'express';
import { prisma } from '../index';
import { 
  createImportJob, 
  getImportJob, 
  getUserImportJobs, 
  processImportJob 
} from '../services/importJobService';

export async function startImport(req: Request, res: Response) {
  try {
    console.log('[IMPORT] startImport function called');
    console.log('[IMPORT] Request method:', req.method);
    console.log('[IMPORT] Request path:', req.path);
    console.log('[IMPORT] Request originalUrl:', req.originalUrl);
    
    if (!req.oidc?.user?.email) {
      console.log('[IMPORT] Not authenticated');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const dbUser = await prisma.user.findUnique({ 
      where: { email: req.oidc.user.email.toLowerCase() } 
    });
    if (!dbUser) {
      console.log('[IMPORT] User not found');
      return res.status(401).json({ error: 'User not found' });
    }

    // Log the raw request body for debugging
    console.log('[IMPORT] Raw request body:', JSON.stringify(req.body));
    console.log('[IMPORT] Request body type:', typeof req.body);
    console.log('[IMPORT] Request body keys:', Object.keys(req.body || {}));
    
    const { url, urls } = req.body || {};
    
    console.log('[IMPORT] Extracted url:', url);
    console.log('[IMPORT] Extracted urls:', urls);
    console.log('[IMPORT] urls is array?', Array.isArray(urls));
    
    // Support both single URL and array of URLs
    let urlList: string[] = [];
    if (urls && Array.isArray(urls) && urls.length > 0) {
      urlList = urls.filter((u: any) => u && typeof u === 'string' && u.trim()).map((u: string) => u.trim());
      console.log('[IMPORT] Using urls array, filtered to:', urlList);
    } else if (url && typeof url === 'string' && url.trim()) {
      urlList = [url.trim()];
      console.log('[IMPORT] Using single url:', urlList);
    } else {
      console.log('[IMPORT] ERROR: No valid url or urls found in request body');
      console.log('[IMPORT] req.body:', req.body);
      return res.status(400).json({ error: 'URL or URLs array is required' });
    }

    if (urlList.length === 0) {
      return res.status(400).json({ error: 'At least one valid URL is required' });
    }

    // Create import jobs for all URLs
    const jobs = await Promise.all(
      urlList.map((url) => createImportJob(dbUser.id, url.trim()))
    );

    // Process all jobs asynchronously (don't await)
    jobs.forEach((job) => {
      processImportJob(job.id).catch(error => {
        console.error(`Background import job ${job.id} failed:`, error);
      });
    });

    // Return array of job IDs if multiple, single job if one
    if (jobs.length === 1) {
      res.json({ 
        jobId: jobs[0].id, 
        status: jobs[0].status,
        message: 'Import job started successfully' 
      });
    } else {
      res.json({ 
        jobIds: jobs.map(j => j.id),
        jobs: jobs.map(j => ({
          jobId: j.id,
          url: j.url,
          status: j.status
        })),
        message: `${jobs.length} import jobs started successfully` 
      });
    }

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
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    })));

  } catch (error) {
    console.error('Error getting user imports:', error);
    res.status(500).json({ error: 'Failed to get user imports' });
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