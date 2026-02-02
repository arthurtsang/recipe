/**
 * Import all recipe URLs from a file using Mabel's API token.
 * Creates import jobs via POST /api/imports/start; AI processes in background.
 * Run save-mabels-imports.ts later to save completed imports as recipes.
 *
 * Usage: npx ts-node scripts/import-links-file.ts [path/to/links.txt]
 * Default file: ../../recipe_links_Youramaryllis.txt
 * Env: MABEL_EMAIL=..., RECIPE_BACKEND_URL=... (default http://localhost:8081)
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_BACKEND_URL = 'http://localhost:8081';
const BACKEND_URL = (process.env.RECIPE_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, '');

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

function loadUrls(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const urls = lines.filter((l) => l.startsWith('http'));
  return [...new Set(urls)];
}

async function main() {
  const linksFile = process.argv[2] || path.join(__dirname, '..', '..', '..', 'recipe_links_Youramaryllis.txt');
  if (!fs.existsSync(linksFile)) {
    console.error('File not found:', linksFile);
    process.exit(1);
  }

  const urls = loadUrls(linksFile);
  console.log(`Loaded ${urls.length} URLs from ${linksFile}`);

  const mabelEmail = process.env.MABEL_EMAIL;
  const user = mabelEmail
    ? await prisma.user.findUnique({
        where: { email: mabelEmail.toLowerCase() },
        select: { id: true, email: true, apiToken: true, isEnabled: true },
      })
    : await prisma.user.findFirst({
        where: { email: { contains: 'mabel', mode: 'insensitive' } },
        select: { id: true, email: true, apiToken: true, isEnabled: true },
      });

  if (!user) {
    console.error('Mabel user not found. Set MABEL_EMAIL=... or ensure a user with "mabel" in email exists.');
    process.exit(1);
  }
  if (!user.apiToken) {
    console.error(`${user.email} has no API token. Create one via "Manage API Token" in the app.`);
    process.exit(1);
  }
  if (!user.isEnabled) {
    console.error(`${user.email} is not enabled. Enable in admin.`);
    process.exit(1);
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user.apiToken}`,
  };

  const res = await axios.post(
    `${BACKEND_URL}/api/imports/start`,
    { urls },
    { headers, timeout: 60000 }
  );

  const data = res.data;
  if (data.jobIds) {
    console.log(`Started ${data.jobIds.length} import jobs.`);
    console.log('Job IDs:', data.jobIds.slice(0, 5).join(', '), data.jobIds.length > 5 ? '...' : '');
  } else if (data.jobId) {
    console.log('Started 1 import job:', data.jobId);
  }
  console.log(data.message || 'Done.');
  console.log('\nWhen jobs complete, run: npx ts-node scripts/save-mabels-imports.ts');
}

main()
  .then(() => process.exit(0))
  .catch((e: any) => {
    console.error(e.response?.data || e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
