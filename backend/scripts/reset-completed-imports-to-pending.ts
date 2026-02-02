/**
 * Reset all import jobs with status 'completed' to 'pending' (clear result, timestamps, etc).
 * Use when "succeeded" imports were actually failures and should be retried.
 *
 * Usage: npx ts-node scripts/reset-completed-imports-to-pending.ts
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.importJob.updateMany({
    where: { status: 'completed' },
    data: {
      status: 'pending',
      result: null,
      error: null,
      savedRecipeId: null,
      startedAt: null,
      completedAt: null,
      aiImportJobId: null,
      updatedAt: new Date(),
    },
  });
  console.log(`Reset ${result.count} completed import job(s) to pending.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
