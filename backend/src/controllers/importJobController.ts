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
    if (!req.oidc?.user?.email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const dbUser = await prisma.user.findUnique({ 
      where: { email: req.oidc.user.email.toLowerCase() } 
    });
    if (!dbUser) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Create import job
    const job = await createImportJob(dbUser.id, url);

    // Process job asynchronously (don't await)
    processImportJob(job.id).catch(error => {
      console.error('Background import job failed:', error);
    });

    res.json({ 
      jobId: job.id, 
      status: job.status,
      message: 'Import job started successfully' 
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