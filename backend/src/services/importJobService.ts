import { prisma } from '../index';
import axios from 'axios';

export interface ImportJobData {
  id: string;
  userId: string;
  url: string;
  status: string;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function createImportJob(userId: string, url: string): Promise<ImportJobData> {
  return prisma.importJob.create({
    data: {
      userId,
      url,
      status: 'pending',
    },
  });
}

export async function getImportJob(id: string): Promise<ImportJobData | null> {
  return prisma.importJob.findUnique({
    where: { id },
  });
}

export async function getUserImportJobs(userId: string): Promise<ImportJobData[]> {
  return prisma.importJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateImportJobStatus(
  id: string, 
  status: string,
  result?: any,
  error?: string
): Promise<ImportJobData> {
  return prisma.importJob.update({
    where: { id },
    data: {
      status,
      result,
      error,
      updatedAt: new Date(),
    },
  });
}

export async function processImportJob(jobId: string): Promise<void> {
  try {
    // Get the job
    const job = await getImportJob(jobId);
    if (!job) {
      throw new Error('Import job not found');
    }

    // Update status to processing
    await updateImportJobStatus(jobId, 'processing');

    // Call AI service to import recipe
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
    const response = await axios.post(`${aiServiceUrl}/import-recipe`, {
      url: job.url,
    });

    // Update job with result
    await updateImportJobStatus(jobId, 'completed', response.data);

  } catch (error) {
    console.error(`Error processing import job ${jobId}:`, error);
    
    // Update job with error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateImportJobStatus(jobId, 'failed', undefined, errorMessage);
  }
}

export async function cleanupOldImportJobs(): Promise<void> {
  // Delete import jobs older than 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  await prisma.importJob.deleteMany({
    where: {
      createdAt: {
        lt: sevenDaysAgo,
      },
    },
  });
} 