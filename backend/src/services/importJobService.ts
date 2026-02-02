import { prisma } from '../index';
import axios from 'axios';

export interface ImportJobData {
  id: string;
  userId: string;
  url: string;
  status: string;
  result?: any;
  error?: string;
  aiImportJobId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
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

const STATUS_ORDER = { processing: 0, pending: 1, completed: 2, failed: 3 };

export async function getUserImportJobs(userId: string): Promise<ImportJobData[]> {
  const jobs = await prisma.importJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return jobs.sort(
    (a, b) =>
      (STATUS_ORDER[a.status as keyof typeof STATUS_ORDER] ?? 4) -
      (STATUS_ORDER[b.status as keyof typeof STATUS_ORDER] ?? 4)
  );
}

export async function updateImportJobStatus(
  id: string,
  status: string,
  result?: any,
  error?: string,
  timestamps?: { startedAt?: Date; completedAt?: Date }
): Promise<ImportJobData> {
  const data: any = { status, result, error, updatedAt: new Date() };
  if (timestamps?.startedAt != null) data.startedAt = timestamps.startedAt;
  if (timestamps?.completedAt != null) data.completedAt = timestamps.completedAt;
  return prisma.importJob.update({
    where: { id },
    data,
  });
}

export async function updateImportJobSavedRecipe(
  id: string,
  savedRecipeId: string
): Promise<ImportJobData> {
  return prisma.importJob.update({
    where: { id },
    data: {
      savedRecipeId,
      updatedAt: new Date(),
    },
  });
}

export async function updateImportJobAiJobId(id: string, aiImportJobId: string): Promise<void> {
  await prisma.importJob.update({
    where: { id },
    data: { aiImportJobId, updatedAt: new Date() },
  });
}

const POLL_INTERVAL_MS = 15000;
const MAX_IMPORT_WAIT_MS = 30 * 60 * 1000;  // 30 min
const AI_STATUS_REQUEST_TIMEOUT_MS = 120000; // 2 min per status GET; AI can be busy with LLM/Playwright
const AI_POST_TIMEOUT_MS = 60000; // 1 min for POST (return jobId); AI may be slow to accept

/** Check if POST response is a sync recipe result (old AI service) vs async { jobId }. */
function isSyncRecipeResult(data: any): boolean {
  return data != null && typeof data === 'object' && !('jobId' in data) && ('title' in data || 'ingredients' in data);
}

/** Reject results from the mock AI service so we never save mock data. */
function assertNotMockResult(result: any): void {
  if (result != null && typeof result === 'object' && result.title === 'Mock Imported Recipe') {
    throw new Error(
      'AI service returned mock data (title "Mock Imported Recipe"). ' +
        'Ensure the real AI service is running on AI_SERVICE_URL, not mock_ai_service.'
    );
  }
}

/** Poll AI service for import job status until completed/failed or timeout. Returns result or throws. */
async function pollAiImportResult(aiJobId: string): Promise<any> {
  const aiServiceUrl = (process.env.AI_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, '');
  const started = Date.now();
  let result: any = null;
  let failedError: string | null = null;

  while (Date.now() - started < MAX_IMPORT_WAIT_MS) {
    const statusRes = await axios.get<{ status: string; result?: any; error?: string }>(
      `${aiServiceUrl}/import-recipe/status/${aiJobId}`,
      { timeout: AI_STATUS_REQUEST_TIMEOUT_MS }
    );
    const { status } = statusRes.data;
    if (status === 'completed') {
      result = statusRes.data.result;
      assertNotMockResult(result);
      break;
    }
    if (status === 'failed') {
      failedError = statusRes.data.error ?? 'Import failed';
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (failedError) throw new Error(failedError);
  if (result == null) throw new Error('Import timed out (30 min)');
  return result;
}

/** Start AI import: POST and return aiJobId (async) or result (sync). Throws on error. */
async function startAiImport(url: string): Promise<{ aiJobId?: string; result?: any }> {
  const aiServiceUrl = (process.env.AI_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, '');
  let postRes: { data: any };
  try {
    postRes = await axios.post<{ jobId?: string; status?: string; title?: string; ingredients?: string }>(
      `${aiServiceUrl}/import-recipe`,
      { url },
      { timeout: AI_POST_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    if (axios.isAxiosError(e) && e.response?.data != null) {
      const d = e.response.data;
      const msg = d.detail ?? d.error ?? d.message ?? e.message ?? 'AI service error';
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    throw e;
  }
  const data = postRes.data ?? {};
  if (data.jobId) {
    return { aiJobId: data.jobId };
  }
  if (isSyncRecipeResult(data)) {
    assertNotMockResult(data);
    return { result: data };
  }
  const msg = (data as any).detail ?? (data as any).error ?? 'AI service did not return jobId';
  throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
}

/** Call AI service async import: POST returns jobId, poll until completed/failed or timeout. Accepts sync recipe response. Returns result or throws. */
export async function callAiImportAndWait(url: string, existingAiJobId?: string | null): Promise<any> {
  if (existingAiJobId) {
    return pollAiImportResult(existingAiJobId);
  }
  const start = await startAiImport(url);
  if (start.result != null) return start.result;
  if (start.aiJobId) return pollAiImportResult(start.aiJobId);
  throw new Error('AI service did not return jobId');
}

export async function processImportJob(jobId: string): Promise<void> {
  try {
    const job = await getImportJob(jobId);
    if (!job) {
      throw new Error('Import job not found');
    }
    if (job.status === 'completed' || job.status === 'failed') {
      console.log(`Job ${jobId} already ${job.status}, skipping`);
      return;
    }

    const startedAt = new Date();
    await updateImportJobStatus(jobId, 'processing', undefined, undefined, { startedAt });
    console.log(`[IMPORT] Processing job ${jobId} for URL: ${job.url}`);

    let result: any;
    const existingAiJobId = job.aiImportJobId ?? null;
    if (existingAiJobId) {
      console.log(`[IMPORT] Resuming job ${jobId} with AI job ${existingAiJobId}`);
      result = await callAiImportAndWait(job.url, existingAiJobId);
    } else {
      const start = await startAiImport(job.url);
      if (start.result != null) {
        result = start.result;
      } else if (start.aiJobId) {
        await updateImportJobAiJobId(jobId, start.aiJobId);
        result = await pollAiImportResult(start.aiJobId);
      } else {
        throw new Error('AI service did not return jobId');
      }
    }

    const completedAt = new Date();
    await updateImportJobStatus(jobId, 'completed', result, undefined, { completedAt });
    console.log(`[IMPORT] Job ${jobId} completed successfully`);

  } catch (error: any) {
    console.error(`[IMPORT] Error processing import job ${jobId}:`, error);

    // Capture full error detail (e.g. 422 response body from AI service)
    let errorMessage: string;
    if (axios.isAxiosError(error) && error.response?.data != null) {
      const d = error.response.data;
      errorMessage =
        typeof d === 'string'
          ? d
          : `${error.response.status}: ${JSON.stringify(d)}`;
    } else {
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
    }

    const completedAt = new Date();
    await updateImportJobStatus(jobId, 'failed', undefined, errorMessage, { completedAt });
  }
}

/** Find pending import jobs (oldest first), limit to maxCount. Used by scheduler. */
export async function findPendingImportJobs(maxCount: number): Promise<ImportJobData[]> {
  return prisma.importJob.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: maxCount,
  });
}

const STUCK_PROCESSING_MINUTES = 30;

/** Reset jobs stuck in "processing" for too long back to "pending" so they get retried. */
export async function resetStuckProcessingJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_PROCESSING_MINUTES * 60 * 1000);
  const result = await prisma.importJob.updateMany({
    where: { status: 'processing', updatedAt: { lt: cutoff } },
    data: { status: 'pending', aiImportJobId: null, updatedAt: new Date() },
  });
  if (result.count > 0) {
    console.log(`[IMPORT] Scheduler: reset ${result.count} stuck "processing" job(s) back to pending`);
  }
  return result.count;
}

/** On server startup: for each "processing" job with aiImportJobId, check AI status and sync or resume; else reset to pending. */
export async function resetProcessingJobsOnStartup(): Promise<void> {
  const processing = await prisma.importJob.findMany({
    where: { status: 'processing' },
    select: { id: true, aiImportJobId: true, url: true },
  });
  if (processing.length === 0) return;

  const aiServiceUrl = (process.env.AI_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, '');
  let resetCount = 0;

  for (const job of processing) {
    if (!job.aiImportJobId) {
      await prisma.importJob.update({
        where: { id: job.id },
        data: { status: 'pending', error: null, startedAt: null, completedAt: null, aiImportJobId: null, updatedAt: new Date() },
      });
      resetCount++;
      continue;
    }
    try {
      const statusRes = await axios.get<{ status: string; result?: any; error?: string }>(
        `${aiServiceUrl}/import-recipe/status/${job.aiImportJobId}`,
        { timeout: AI_STATUS_REQUEST_TIMEOUT_MS }
      );
      const { status, result, error } = statusRes.data;
      if (status === 'completed' && result != null) {
        await updateImportJobStatus(job.id, 'completed', result, undefined, { completedAt: new Date() });
        console.log(`[IMPORT] Startup: synced job ${job.id} to completed from AI`);
      } else if (status === 'failed') {
        await updateImportJobStatus(job.id, 'failed', undefined, error ?? 'Import failed', { completedAt: new Date() });
        console.log(`[IMPORT] Startup: synced job ${job.id} to failed from AI`);
      } else {
        processImportJob(job.id).catch((err) => console.error(`[IMPORT] Startup resume job ${job.id}:`, err));
      }
    } catch (e: any) {
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        await prisma.importJob.update({
          where: { id: job.id },
          data: { status: 'pending', error: null, startedAt: null, completedAt: null, aiImportJobId: null, updatedAt: new Date() },
        });
        resetCount++;
      } else {
        processImportJob(job.id).catch((err) => console.error(`[IMPORT] Startup resume job ${job.id}:`, err));
      }
    }
  }
  if (resetCount > 0) {
    console.log(`[IMPORT] Startup: reset ${resetCount} processing job(s) without valid AI job to pending`);
  }
}

/** Start exactly one pending job if any (used to refill a slot when one completes). */
async function startOnePendingJob(): Promise<void> {
  await resetStuckProcessingJobs();
  const jobs = await findPendingImportJobs(1);
  if (jobs.length === 0) return;
  const job = jobs[0];
  console.log(`[IMPORT] Scheduler: refill slot, processing job ${job.id}`);
  processImportJob(job.id)
    .catch((err) => console.error(`[IMPORT] Scheduler: failed to process job ${job.id}:`, err))
    .finally(() => {
      startOnePendingJob().catch((err) => console.error('[IMPORT] Scheduler refill error:', err));
    });
}

/** Process pending jobs from the DB. Processes up to 2 at a time in parallel.
 *  When each job completes, refills that slot immediately so we keep 2 in flight until the queue is empty. */
async function runImportWorker(): Promise<void> {
  await resetStuckProcessingJobs();
  const jobs = await findPendingImportJobs(2);
  if (jobs.length === 0) return;
  console.log(`[IMPORT] Scheduler: processing ${jobs.length} job(s) in parallel`);
  await Promise.all(
    jobs.map((job) =>
      processImportJob(job.id)
        .catch((err) => console.error(`[IMPORT] Scheduler: failed to process job ${job.id}:`, err))
        .finally(() => {
          startOnePendingJob().catch((err) =>
            console.error('[IMPORT] Scheduler refill error:', err)
          );
        })
    )
  );
}

/** Entry point: pick up to 2 pending jobs and process; refill when each completes. */
export async function processPendingImportJobs(): Promise<void> {
  await runImportWorker();
}

export function startImportJobScheduler(): void {
  const intervalMs = 2 * 60 * 1000; // every 2 minutes (catches any missed refills, e.g. after restart)
  // On startup, any job left in "processing" is orphaned (previous process died); reset to pending so they retry
  resetProcessingJobsOnStartup()
    .then(() => processPendingImportJobs())
    .catch((err) => console.error('[IMPORT] Scheduler error:', err));
  setInterval(() => {
    processPendingImportJobs().catch((err) =>
      console.error('[IMPORT] Scheduler error:', err)
    );
  }, intervalMs);
  console.log('[IMPORT] Import job scheduler started (refill on completion, interval every 2 min)');
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