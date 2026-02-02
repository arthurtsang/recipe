/**
 * Delete all recipes (and related ratings, comments, tags, versions), all import
 * history, and all uploaded image files. Keeps users.
 *
 * Usage: npx ts-node scripts/wipe-recipes-imports-uploads.ts
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const uploadsDir = path.join(__dirname, '..', 'uploads');

async function main() {
  const userCountBefore = await prisma.user.count();
  console.log(`Users before: ${userCountBefore}`);

  const r1 = await prisma.rating.deleteMany({});
  console.log(`Deleted ${r1.count} ratings`);

  const r2 = await prisma.comment.deleteMany({});
  console.log(`Deleted ${r2.count} comments`);

  const r3 = await prisma.recipeTag.deleteMany({});
  console.log(`Deleted ${r3.count} recipe tags`);

  const r4 = await prisma.recipe.deleteMany({});
  console.log(`Deleted ${r4.count} recipes (versions cascade)`);

  const r5 = await prisma.importJob.deleteMany({});
  console.log(`Deleted ${r5.count} import jobs`);

  const userCountAfter = await prisma.user.count();
  console.log(`Users after: ${userCountAfter}`);

  if (!fs.existsSync(uploadsDir)) {
    console.log('Uploads dir missing, skipping.');
    return;
  }
  const files = fs.readdirSync(uploadsDir);
  let deleted = 0;
  for (const f of files) {
    const full = path.join(uploadsDir, f);
    if (fs.statSync(full).isFile()) {
      fs.unlinkSync(full);
      deleted++;
    }
  }
  console.log(`Deleted ${deleted} files in uploads/`);
}

main()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
