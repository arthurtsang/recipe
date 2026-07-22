import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

function isP2025(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025';
}

export type ImportKind = 'url' | 'video';

export interface ImportJobData {
  id: string;
  userId: string;
  url: string;
  status: string;
  kind: string;
  step: string;
  result?: any;
  error?: string | null;
  savedRecipeId?: string | null;
  claimedAt?: Date | null;
  claimedBy?: string | null;
  leaseExpiresAt?: Date | null;
  aiImportJobId?: string | null;
  aiImportKind?: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

/** True if URL is a video site (YouTube, Instagram, TikTok, etc.). */
export function isVideoImportUrl(url: string): boolean {
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

export function detectImportKind(url: string): ImportKind {
  return isVideoImportUrl(url) ? 'video' : 'url';
}

export async function createImportJob(userId: string, url: string): Promise<ImportJobData> {
  const kind = detectImportKind(url);
  const job = await prisma.importJob.create({
    data: {
      userId,
      url,
      status: 'pending',
      kind,
      step: 'queued',
    },
  });
  try {
    const { publishImportJob } = await import('./gcpPubSub');
    await publishImportJob(job.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[IMPORT] Pub/Sub publish failed for ${job.id}:`, e);
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        step: 'failed',
        error: `Failed to dispatch import worker: ${message}`,
      },
    });
    throw e;
  }
  return job;
}

export async function getImportJob(id: string): Promise<ImportJobData | null> {
  return prisma.importJob.findUnique({ where: { id } });
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
  timestamps?: { startedAt?: Date; completedAt?: Date },
  extras?: { step?: string }
): Promise<ImportJobData | null> {
  const data: Prisma.ImportJobUpdateInput = {
    status,
    result,
    error,
    updatedAt: new Date(),
  };
  if (timestamps?.startedAt != null) data.startedAt = timestamps.startedAt;
  if (timestamps?.completedAt != null) data.completedAt = timestamps.completedAt;
  if (extras?.step != null) data.step = extras.step;
  if (status === 'completed') data.step = extras?.step ?? 'completed';
  if (status === 'failed') data.step = extras?.step ?? 'failed';
  try {
    return await prisma.importJob.update({ where: { id }, data });
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
      data: { savedRecipeId, updatedAt: new Date() },
    });
  } catch (e) {
    if (isP2025(e)) {
      console.warn(`[IMPORT] updateImportJobSavedRecipe: job ${id} not found (P2025), may have been deleted`);
      return null;
    }
    throw e;
  }
}

/** Re-queue a job for the Cloud Run / local worker (admin retry / client retry). */
export async function requeueImportJob(id: string): Promise<ImportJobData | null> {
  try {
    const job = await prisma.importJob.update({
      where: { id },
      data: {
        status: 'pending',
        step: 'queued',
        error: null,
        result: Prisma.DbNull,
        startedAt: null,
        completedAt: null,
        claimedAt: null,
        claimedBy: null,
        leaseExpiresAt: null,
        aiImportJobId: null,
        aiImportKind: null,
        updatedAt: new Date(),
      },
    });
    try {
      const { publishImportJob } = await import('./gcpPubSub');
      await publishImportJob(job.id);
    } catch (e) {
      console.error(`[IMPORT] Pub/Sub publish failed for requeue ${id}:`, e);
    }
    return job;
  } catch (e) {
    if (isP2025(e)) return null;
    throw e;
  }
}

/**
 * Safety net: reset processing jobs whose lease expired so OCI can reclaim.
 * Primary reclaim also runs in the OCI worker.
 */
export async function reclaimExpiredLeases(): Promise<number> {
  const now = new Date();
  const result = await prisma.importJob.updateMany({
    where: {
      status: 'processing',
      leaseExpiresAt: { lt: now },
    },
    data: {
      status: 'pending',
      step: 'queued',
      claimedAt: null,
      claimedBy: null,
      leaseExpiresAt: null,
      startedAt: null,
      updatedAt: now,
    },
  });
  if (result.count > 0) {
    console.log(`[IMPORT] Reclaimed ${result.count} expired lease job(s) to pending`);
  }
  return result.count;
}

/** @deprecated No-op kept for cron/route compatibility; Cloud Run Job owns processing. */
export async function processImportJob(jobId: string): Promise<void> {
  console.log(`[IMPORT] processImportJob(${jobId}): queue-only mode; Cloud Run Job will claim`);
}

/** @deprecated Prefer requeueImportJob (also publishes to Pub/Sub). */
export async function startImportJobOnly(jobId: string): Promise<void> {
  await requeueImportJob(jobId);
}

/** @deprecated No-op; progress lives on ImportJob rows updated by the worker. */
export async function pollProcessingImportJob(): Promise<void> {
  await reclaimExpiredLeases();
}

export async function processPendingImportJobs(): Promise<void> {
  await reclaimExpiredLeases();
}

export function startImportJobScheduler(): void {
  // Serverless/Vercel: Pub/Sub kicks Cloud Run. Local process only reclaims leases.
  setInterval(() => {
    reclaimExpiredLeases().catch((err) => console.error('[IMPORT] Lease reclaim error:', err));
  }, 2 * 60 * 1000);
  console.log('[IMPORT] Queue-only scheduler started (Pub/Sub → Cloud Run; lease reclaim every 2 min)');
}

export async function cleanupOldImportJobs(): Promise<void> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  await prisma.importJob.deleteMany({
    where: { createdAt: { lt: sevenDaysAgo } },
  });
}
