/**
 * Logical DB backup: pg_dump → gzip → upload to Wasabi (same bucket as images, prefix `db-backups/` by default).
 *
 * Requires: `pg_dump` on PATH (or bundled on Vercel), DATABASE_URL / DIRECT_DATABASE_URL, Wasabi env vars.
 *
 *   cd backend && npx tsx scripts/backup-db-to-wasabi.ts
 *
 * On Vercel, backups run via GET /api/cron/backup (see vercel.json crons).
 */
import 'dotenv/config';
import { backupDatabaseToWasabi } from '../src/services/databaseBackupService';

backupDatabaseToWasabi()
  .then((result) => {
    console.log('Backup complete:', result.objectKey);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
