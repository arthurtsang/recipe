-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'url';
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "step" TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "claimedBy" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3);

-- Backfill kind from legacy aiImportKind
UPDATE "ImportJob" SET "kind" = 'video' WHERE "aiImportKind" = 'video';
UPDATE "ImportJob" SET "step" = 'completed' WHERE "status" = 'completed';
UPDATE "ImportJob" SET "step" = 'failed' WHERE "status" = 'failed';
UPDATE "ImportJob" SET "step" = 'queued' WHERE "status" = 'pending';
UPDATE "ImportJob" SET "step" = 'claimed' WHERE "status" = 'processing' AND ("step" IS NULL OR "step" = 'queued');

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ImportJob_status_leaseExpiresAt_idx" ON "ImportJob"("status", "leaseExpiresAt");
CREATE INDEX IF NOT EXISTS "ImportJob_status_createdAt_idx" ON "ImportJob"("status", "createdAt");
