/**
 * Save all of Mabel's completed import jobs as recipes using her API token.
 * Uses atomic POST /api/imports/:jobId/save-recipe (creates recipe + updates import in one transaction).
 * Usage: npx ts-node scripts/save-mabels-imports.ts
 * Optional: MABEL_EMAIL=... RECIPE_BACKEND_URL=... (default backend: http://localhost:8081)
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_BACKEND_URL = 'http://localhost:8081';
const BACKEND_URL = (process.env.RECIPE_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, '');

// Systemd backend uses this DATABASE_URL; when targeting it we must use the same DB so apiToken matches
const SYSTEMD_DATABASE_URL = 'postgresql://metro_user:metro_password@localhost:5433/metro_bistro';
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = SYSTEMD_DATABASE_URL;
} else if (BACKEND_URL.includes('localhost:8081')) {
  process.env.DATABASE_URL = SYSTEMD_DATABASE_URL;
}

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  const mabelEmail = process.env.MABEL_EMAIL;
  const user = mabelEmail
    ? await prisma.user.findUnique({ where: { email: mabelEmail.toLowerCase() }, select: { id: true, email: true, apiToken: true } })
    : await prisma.user.findFirst({
        where: { email: { contains: 'mabel', mode: 'insensitive' }, isEnabled: true },
        select: { id: true, email: true, apiToken: true },
      });

  if (!user) {
    console.error('No user found. Set MABEL_EMAIL=... or ensure a user with "mabel" in email exists.');
    process.exit(1);
  }
  if (!user.apiToken) {
    console.error(`User ${user.email} has no apiToken. Generate one via "Manage API Token" in the app.`);
    process.exit(1);
  }

  const jobs = await prisma.importJob.findMany({
    where: {
      userId: user.id,
      status: 'completed',
      savedRecipeId: null,
    },
    orderBy: { createdAt: 'asc' },
  });

  const tokenPreview = user.apiToken.length >= 8
    ? `${user.apiToken.slice(0, 4)}...${user.apiToken.slice(-4)}`
    : '(short)';
  console.log(`User: ${user.email}`);
  console.log(`API token: ${tokenPreview} (from same DB as backend)`);
  console.log(`Unsaved completed imports: ${jobs.length}`);

  // Verify backend accepts this token (same DB) before saving
  try {
    const meRes = await axios.get(`${BACKEND_URL}/api/me`, {
      headers: { Authorization: `Bearer ${user.apiToken}` },
      timeout: 10000,
      validateStatus: () => true,
    });
    if (meRes.status === 401) {
      console.error(
        '\nBackend returned 401 for /api/me with this token. The token the script uses (from DB) is not accepted by the backend.\n' +
          'Ensure the backend uses the same DATABASE_URL (systemd: postgresql://...@localhost:5433/metro_bistro) and was restarted after the API token middleware was added.'
      );
      await prisma.$disconnect();
      process.exit(1);
    }
    if (meRes.status !== 200) {
      console.error(`\nUnexpected /api/me status: ${meRes.status}`);
      await prisma.$disconnect();
      process.exit(1);
    }
    const meData = meRes.data as Record<string, unknown>;
    const meEmail = typeof meData?.email === 'string' ? meData.email : undefined;
    const meId = meData?.id != null ? String(meData.id) : undefined;
    console.log('Token accepted by backend (/api/me OK).');
    console.log('/api/me response:', JSON.stringify({ email: meEmail, id: meId }, null, 2));
    if (meEmail && meEmail.toLowerCase() !== user.email.toLowerCase()) {
      console.error(`\nMismatch: script user ${user.email} vs /api/me ${meEmail}. Using wrong token or DB.`);
      await prisma.$disconnect();
      process.exit(1);
    }
    if (!meEmail && Object.keys(meData || {}).length === 0) {
      console.warn('(Backend returned empty /api/me body; continuing with token from DB.)');
    }
    console.log('');
  } catch (e: any) {
    console.error('Failed to reach backend:', e.message || e);
    await prisma.$disconnect();
    process.exit(1);
  }

  if (jobs.length === 0) {
    console.log('Nothing to save.');
    await prisma.$disconnect();
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user.apiToken}`,
  };

  let saved = 0;
  let failed = 0;

  for (const job of jobs) {
    const result = job.result as any;
    if (!result || !result.title) {
      console.log(`Skip ${job.id}: no result or title`);
      failed++;
      continue;
    }

    try {
      const res = await axios.post(
        `${BACKEND_URL}/api/imports/${job.id}/save-recipe`,
        {},
        { headers, timeout: 60000 }
      );

      if (res.status !== 201 && res.status !== 200) {
        console.log(`Skip ${job.id}: save-recipe returned ${res.status}`, JSON.stringify(res.data).slice(0, 200));
        failed++;
        continue;
      }
      const recipeId = res.data?.id;
      saved++;
      console.log(`Saved: ${job.id} -> recipe ${recipeId} (${result.title?.slice(0, 40)}...)`);
    } catch (e: any) {
      failed++;
      const msg = e.response?.data?.error ?? e.response?.data?.message ?? e.message ?? String(e);
      console.error(`Failed ${job.id}: ${msg}`);
    }
  }

  console.log(`\nDone. Saved: ${saved}, Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
