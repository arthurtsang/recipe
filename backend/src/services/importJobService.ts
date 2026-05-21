import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import axios from 'axios';

function isP2025(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025';
}

export type AiImportKind = 'url' | 'video';

export interface ImportJobData {
  id: string;
  userId: string;
  url: string;
  status: string;
  result?: any;
  error?: string;
  aiImportJobId?: string | null;
  aiImportKind?: string | null;
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
): Promise<ImportJobData | null> {
  const data: any = { status, result, error, updatedAt: new Date() };
  if (timestamps?.startedAt != null) data.startedAt = timestamps.startedAt;
  if (timestamps?.completedAt != null) data.completedAt = timestamps.completedAt;
  try {
    return await prisma.importJob.update({
      where: { id },
      data,
    });
  } catch (e) {
    if (isP2025(e)) {
      console.warn(`[IMPORT] updateImportJobStatus: job ${id} not found (P2025), may have been deleted`);
      return null;
    }
    throw e;
  }
}

export async function updateImportJobSavedRecipe(
  id: string,
  savedRecipeId: string
): Promise<ImportJobData | null> {
  try {
    return await prisma.importJob.update({
      where: { id },
      data: {
        savedRecipeId,
        updatedAt: new Date(),
      },
    });
  } catch (e) {
    if (isP2025(e)) {
      console.warn(`[IMPORT] updateImportJobSavedRecipe: job ${id} not found (P2025), may have been deleted`);
      return null;
    }
    throw e;
  }
}

export async function updateImportJobAiJobId(id: string, aiImportJobId: string, aiImportKind?: AiImportKind): Promise<void> {
  try {
    await prisma.importJob.update({
      where: { id },
      data: { aiImportJobId, aiImportKind: aiImportKind ?? undefined, updatedAt: new Date() },
    });
  } catch (e) {
    if (isP2025(e)) {
      console.warn(`[IMPORT] updateImportJobAiJobId: job ${id} not found (P2025), may have been deleted`);
      return;
    }
    throw e;
  }
}

const POLL_INTERVAL_MS = 30000;   // How often we call AI status API (30 s)
const MAX_IMPORT_WAIT_MS = 30 * 60 * 1000;  // 30 min (used only for timeout in blocking path)
const AI_STATUS_REQUEST_TIMEOUT_MS = 120000; // 2 min per status GET; AI can be busy with LLM/Playwright
const AI_POST_TIMEOUT_MS = 60000; // 1 min for POST (return jobId); AI may be slow to accept
const SCHEDULER_INTERVAL_MS = 2 * 60 * 1000; // 2 min: check and start one job if none processing

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

/** True if URL is a video site we import via /recipe/import-video (YouTube, Instagram, TikTok, etc.). */
function isVideoImportUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const videoHosts = [
      'youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com',
      'instagram.com', 'www.instagram.com',
      'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
      'facebook.com', 'www.facebook.com', 'fb.watch', 'fb.com',
      'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
      'vimeo.com', 'www.vimeo.com',
      'dailymotion.com', 'www.dailymotion.com',
    ];
    return videoHosts.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

/** Poll AI service for import job status until completed/failed or timeout. Returns result or throws. */
async function pollAiImportResult(aiJobId: string, kind: AiImportKind): Promise<any> {
  const aiServiceUrl = (process.env.AI_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, '');
  const statusPath = kind === 'video' ? 'recipe/import-video/status' : 'recipe/import/status';
  const started = Date.now();
  let result: any = null;
  let failedError: string | null = null;

  while (Date.now() - started < MAX_IMPORT_WAIT_MS) {
    const statusRes = await axios.get<{ status: string; result?: any; error?: string }>(
      `${aiServiceUrl}/${statusPath}/${aiJobId}`,
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

/** Start AI import: POST and return aiJobId (async) or result (sync). Uses /recipe/import-video for video URLs. Throws on error. */
async function startAiImport(url: string): Promise<{ aiJobId?: string; result?: any; isVideo?: boolean }> {
  const aiServiceUrl = (process.env.AI_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, '');
  const isVideo = isVideoImportUrl(url);
  const postPath = isVideo ? 'recipe/import-video' : 'recipe/import';
  let postRes: { data: any };
  try {
    postRes = await axios.post<{ jobId?: string; status?: string; title?: string; ingredients?: string }>(
      `${aiServiceUrl}/${postPath}`,
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
    return { aiJobId: data.jobId, isVideo };
  }
  if (isSyncRecipeResult(data)) {
    assertNotMockResult(data);
    return { result: data };
  }
  const msg = (data as any).detail ?? (data as any).error ?? 'AI service did not return jobId';
  throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
}

/** Call AI service async import: POST returns jobId, poll until completed/failed or timeout. Accepts sync recipe response. Returns result or throws. */
export async function callAiImportAndWait(
  url: string,
  existingAiJobId?: string | null,
  existingKind?: AiImportKind
): Promise<any> {
  const kind = existingKind ?? 'url';
  if (existingAiJobId) {
    return pollAiImportResult(existingAiJobId, kind);
  }
  const start = await startAiImport(url);
  if (start.result != null) return start.result;
  if (start.aiJobId) return pollAiImportResult(start.aiJobId, start.isVideo ? 'video' : 'url');
  throw new Error('AI service did not return jobId');
}

/** Start one import job: POST to AI, save jobId and set status processing. If AI returns sync result, update job completed. Does not block on polling. Used by scheduler and admin retry. Only starts if no other job is processing (1 at a time). */
export async function startImportJobOnly(jobId: string): Promise<void> {
  const job = await getImportJob(jobId);
  if (!job || job.status === 'completed' || job.status === 'failed') return;

  const processingCount = await prisma.importJob.count({ where: { status: 'processing' } });
  if (processingCount > 0) return; // one already in flight

  const startedAt = new Date();
  await updateImportJobStatus(jobId, 'processing', undefined, undefined, { startedAt });
  console.log(`[IMPORT] Started job ${jobId} for URL: ${job.url}`);

  try {
    const start = await startAiImport(job.url);
    if (start.result != null) {
      const completedAt = new Date();
      await updateImportJobStatus(jobId, 'completed', start.result, undefined, { completedAt });
      console.log(`[IMPORT] Job ${jobId} completed (sync result from AI)`);
      startOnePendingJob().catch((err) => console.error('[IMPORT] Refill after sync completed:', err));
      return;
    }
    if (start.aiJobId) {
      const kind: AiImportKind = start.isVideo ? 'video' : 'url';
      await updateImportJobAiJobId(jobId, start.aiJobId, kind);
      console.log(`[IMPORT] Job ${jobId} AI jobId: ${start.aiJobId} (${kind}), will poll status periodically`);
      return;
    }
    throw new Error('AI service did not return jobId');
  } catch (error: any) {
    const errorMessage = axios.isAxiosError(error) && error.response?.data != null
      ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
      : (error instanceof Error ? error.message : 'Unknown error');
    const completedAt = new Date();
    await updateImportJobStatus(jobId, 'failed', undefined, errorMessage, { completedAt });
    console.error(`[IMPORT] Job ${jobId} failed to start:`, errorMessage);
  }
}

/** Poll the one processing import job: ensure at most one processing; if no AI job id, call import API and store it; if has AI job id, call status API; on status exception treat as no job id (reset to pending). */
export async function pollProcessingImportJob(): Promise<void> {
  await ensureAtMostOneProcessing();

  const processing = await prisma.importJob.findFirst({
    where: { status: 'processing' },
    select: { id: true, aiImportJobId: true, aiImportKind: true, url: true },
  });
  if (!processing) return;

  const aiServiceUrl = (process.env.AI_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, '');
  const kind: AiImportKind = (processing.aiImportKind as AiImportKind) ?? 'url';

  // Processing job has no AI server job id: call import API and store job id (or sync result)
  if (!processing.aiImportJobId) {
    try {
      const start = await startAiImport(processing.url);
      if (start.result != null) {
        const completedAt = new Date();
        await updateImportJobStatus(processing.id, 'completed', start.result, undefined, { completedAt });
        console.log(`[IMPORT] Job ${processing.id} completed (sync result from status poll)`);
        startOnePendingJob().catch((err) => console.error('[IMPORT] Refill after sync completed:', err));
        return;
      }
      if (start.aiJobId) {
        const startKind: AiImportKind = start.isVideo ? 'video' : 'url';
        await updateImportJobAiJobId(processing.id, start.aiJobId, startKind);
        console.log(`[IMPORT] Job ${processing.id} AI jobId stored: ${start.aiJobId} (${startKind}), will poll status`);
        return;
      }
      throw new Error('AI service did not return jobId');
    } catch (e: any) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`[IMPORT] Job ${processing.id} failed to start (no AI job id):`, errMsg);
      const completedAt = new Date();
      await updateImportJobStatus(processing.id, 'failed', undefined, errMsg, { completedAt });
      startOnePendingJob().catch((err) => console.error('[IMPORT] Refill after start failed:', err));
    }
    return;
  }

  // Has AI job id: call AI server to check status (url vs video endpoint)
  const statusPath = kind === 'video' ? 'recipe/import-video/status' : 'recipe/import/status';
  try {
    const statusRes = await axios.get<{ status: string; result?: any; error?: string }>(
      `${aiServiceUrl}/${statusPath}/${processing.aiImportJobId}`,
      { timeout: AI_STATUS_REQUEST_TIMEOUT_MS }
    );
    const { status, result, error } = statusRes.data ?? {};
    if (status === 'completed' && result != null) {
      const completedAt = new Date();
      await updateImportJobStatus(processing.id, 'completed', result, undefined, { completedAt });
      console.log(`[IMPORT] Job ${processing.id} completed (from status poll)`);
      startOnePendingJob().catch((err) => console.error('[IMPORT] Refill after completed:', err));
      return;
    }
    if (status === 'failed') {
      const completedAt = new Date();
      await updateImportJobStatus(processing.id, 'failed', undefined, error ?? 'Import failed', { completedAt });
      console.log(`[IMPORT] Job ${processing.id} failed (from status poll): ${error ?? 'Import failed'}`);
      startOnePendingJob().catch((err) => console.error('[IMPORT] Refill after failed:', err));
      return;
    }
    // still pending or processing; next poll will check again
  } catch (e: any) {
    // Status API exception (e.g. job doesn't exist, 404, network error): treat as no AI job id, reset to pending
    console.error(`[IMPORT] Status poll exception for job ${processing.id} (AI job ${processing.aiImportJobId}):`, e?.message ?? e);
    await prisma.importJob.update({
      where: { id: processing.id },
      data: {
        status: 'pending',
        error: null,
        startedAt: null,
        completedAt: null,
        aiImportJobId: null,
        aiImportKind: null,
        updatedAt: new Date(),
      },
    });
    console.log(`[IMPORT] Job ${processing.id} reset to pending (status API exception); will retry`);
    startOnePendingJob().catch((err) => console.error('[IMPORT] Refill after status exception:', err));
  }
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
    const existingKind: AiImportKind = (job.aiImportKind as AiImportKind) ?? 'url';
    if (existingAiJobId) {
      console.log(`[IMPORT] Resuming job ${jobId} with AI job ${existingAiJobId} (${existingKind})`);
      result = await callAiImportAndWait(job.url, existingAiJobId, existingKind);
    } else {
      const start = await startAiImport(job.url);
      if (start.result != null) {
        result = start.result;
      } else if (start.aiJobId) {
        const startKind: AiImportKind = start.isVideo ? 'video' : 'url';
        await updateImportJobAiJobId(jobId, start.aiJobId, startKind);
        result = await pollAiImportResult(start.aiJobId, startKind);
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

/** We only ever process 1 import at a time. If more than one job is "processing", reset the excess to pending. */
export async function ensureAtMostOneProcessing(): Promise<number> {
  const processing = await prisma.importJob.findMany({
    where: { status: 'processing' },
    select: { id: true, startedAt: true },
    orderBy: { startedAt: 'desc' },
  });
  if (processing.length <= 1) return 0;
  const toReset = processing.slice(1);
  const ids = toReset.map((j) => j.id);
  await prisma.importJob.updateMany({
    where: { id: { in: ids } },
    data: {
      status: 'pending',
      error: null,
      startedAt: null,
      completedAt: null,
      aiImportJobId: null,
      updatedAt: new Date(),
    },
  });
  console.log(`[IMPORT] ensureAtMostOneProcessing: reset ${ids.length} excess "processing" job(s) to pending`);
  return ids.length;
}

/** Reset jobs stuck in "processing" for too long back to "pending" so they get retried. */
export async function resetStuckProcessingJobs(): Promise<number> {
  await ensureAtMostOneProcessing();
  const cutoff = new Date(Date.now() - STUCK_PROCESSING_MINUTES * 60 * 1000);
  const result = await prisma.importJob.updateMany({
    where: { status: 'processing', updatedAt: { lt: cutoff } },
    data: { status: 'pending', aiImportJobId: null, aiImportKind: null, updatedAt: new Date() },
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
    select: { id: true, aiImportJobId: true, aiImportKind: true, url: true },
  });
  if (processing.length === 0) return;

  const aiServiceUrl = (process.env.AI_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, '');
  let resetCount = 0;

  for (const job of processing) {
    if (!job.aiImportJobId) {
      try {
        await prisma.importJob.update({
          where: { id: job.id },
          data: { status: 'pending', error: null, startedAt: null, completedAt: null, aiImportJobId: null, aiImportKind: null, updatedAt: new Date() },
        });
        resetCount++;
      } catch (e) {
        if (isP2025(e)) continue;
        throw e;
      }
      continue;
    }
    const kind: AiImportKind = (job.aiImportKind as AiImportKind) ?? 'url';
    const statusPath = kind === 'video' ? 'recipe/import-video/status' : 'recipe/import/status';
    try {
      const statusRes = await axios.get<{ status: string; result?: any; error?: string }>(
        `${aiServiceUrl}/${statusPath}/${job.aiImportJobId}`,
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
        // Still in progress; leave in processing, status poll will pick it up
      }
    } catch (e: any) {
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        try {
          await prisma.importJob.update({
            where: { id: job.id },
            data: { status: 'pending', error: null, startedAt: null, completedAt: null, aiImportJobId: null, aiImportKind: null, updatedAt: new Date() },
          });
          resetCount++;
        } catch (updateErr) {
          if (isP2025(updateErr)) continue;
          throw updateErr;
        }
      } else {
        // Leave in processing; status poll will retry or we can reset to pending after stuck timeout
      }
    }
  }
  if (resetCount > 0) {
    console.log(`[IMPORT] Startup: reset ${resetCount} processing job(s) without valid AI job to pending`);
  }
}

/** Start exactly one pending job if none is processing: POST to AI, save jobId, set processing. Status poll will complete it and refill. */
async function startOnePendingJob(): Promise<void> {
  await ensureAtMostOneProcessing();
  await resetStuckProcessingJobs();
  const processingCount = await prisma.importJob.count({ where: { status: 'processing' } });
  if (processingCount > 0) return; // one already in flight; status poll will refill when done
  const jobs = await findPendingImportJobs(1);
  if (jobs.length === 0) return;
  const job = jobs[0];
  console.log(`[IMPORT] Scheduler: starting job ${job.id}`);
  startImportJobOnly(job.id).catch((err) => console.error(`[IMPORT] Scheduler: failed to start job ${job.id}:`, err));
}

/** 2-min tick: ensure at most one processing, reset stuck, then start one if none processing. */
async function runImportSchedulerTick(): Promise<void> {
  await ensureAtMostOneProcessing();
  await resetStuckProcessingJobs();
  const processingCount = await prisma.importJob.count({ where: { status: 'processing' } });
  if (processingCount > 0) return;
  const jobs = await findPendingImportJobs(1);
  if (jobs.length === 0) return;
  const job = jobs[0];
  console.log(`[IMPORT] Scheduler (2 min): starting job ${job.id}`);
  startImportJobOnly(job.id).catch((err) => console.error(`[IMPORT] Scheduler: failed to start job ${job.id}:`, err));
}

/** Entry point for 2-min interval: check and start one job if none processing. */
export async function processPendingImportJobs(): Promise<void> {
  await runImportSchedulerTick();
}

export function startImportJobScheduler(): void {
  // On startup: sync any orphaned "processing" jobs; start one if none processing; then run status poll once so we query AI right away
  resetProcessingJobsOnStartup()
    .then(() => startOnePendingJob())
    .then(() => pollProcessingImportJob())
    .catch((err) => console.error('[IMPORT] Scheduler startup error:', err));

  // Every 2 min: ensure at most one processing, then start one job if none processing (no triggers needed)
  setInterval(() => {
    runImportSchedulerTick().catch((err) => console.error('[IMPORT] Scheduler 2-min tick error:', err));
  }, SCHEDULER_INTERVAL_MS);

  // Periodically call AI status API (or start import if processing has no AI job id); when completed/failed, update DB and send next job right away
  setInterval(() => {
    pollProcessingImportJob().catch((err) => console.error('[IMPORT] Status poll error:', err));
  }, POLL_INTERVAL_MS);

  console.log(`[IMPORT] Import job scheduler started: check every ${SCHEDULER_INTERVAL_MS / 60000} min, status poll every ${POLL_INTERVAL_MS / 1000} s`);
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