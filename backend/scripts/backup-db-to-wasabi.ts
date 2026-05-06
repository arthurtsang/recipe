/**
 * Logical DB backup: pg_dump → gzip → upload to Wasabi (same bucket as images, prefix `db-backups/` by default).
 *
 * Requires: `pg_dump` on PATH, DATABASE_URL, Wasabi config (.wasabi.yaml or env).
 *
 *   cd backend && npx tsx scripts/backup-db-to-wasabi.ts
 *
 * Env:
 *   WASABI_BACKUP_KEY_PREFIX — overrides yaml `backup-key-prefix` (default db-backups)
 *   BACKUP_RETENTION_DAYS — remove older objects under that prefix (default 7)
 *   WASABI_CONFIG_PATH — path to .wasabi.yaml if not beside repo root
 *   PG_DUMP_BIN — path to pg_dump (default: search PATH)
 *   PG_DUMP_DOCKER=1 — always use Docker for pg_dump (avoids host client vs server version mismatch)
 *   PG_DUMP_DOCKER_IMAGE — image with pg_dump (default postgres:17-alpine)
 *
 * If local pg_dump fails with "server version mismatch" and Docker is available, the script retries once via Docker.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import {
  getWasabiBackupKeyPrefix,
  getWasabiConfig,
  uploadLocalFileToWasabi,
  guessContentType,
  listWasabiObjectsWithPrefix,
  deleteWasabiKeyUnrestricted,
} from '../src/lib/wasabiStorage';

function backupTimestamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(
    d.getMinutes()
  )}${p(d.getSeconds())}`;
}

function pgDumpBin(): string {
  return (process.env.PG_DUMP_BIN || 'pg_dump').trim() || 'pg_dump';
}

function dockerAvailable(): boolean {
  const r = spawnSync('docker', ['info'], { encoding: 'utf8' });
  return r.status === 0;
}

function runPgDumpLocal(databaseUrl: string, sqlPath: string): { ok: boolean; stderr: string } {
  const bin = pgDumpBin();
  const r = spawnSync(bin, ['--dbname', databaseUrl, '--no-owner', '--no-acl', '-f', sqlPath], {
    encoding: 'utf8',
  });
  return { ok: r.status === 0, stderr: `${r.stderr || ''}` };
}

/** Mount temp dir at /out and write PostgreSQL’s dump file there (pg client version matches image). */
function runPgDumpDocker(databaseUrl: string, sqlPath: string): void {
  const image = (process.env.PG_DUMP_DOCKER_IMAGE || 'postgres:17-alpine').trim();
  const outDir = dirname(sqlPath);
  const outFile = basename(sqlPath);
  const dump = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${outDir}:/out`,
      '-e',
      `DATABASE_URL=${databaseUrl}`,
      image,
      'pg_dump',
      '--dbname',
      databaseUrl,
      '--no-owner',
      '--no-acl',
      '-f',
      `/out/${outFile}`,
    ],
    { stdio: 'inherit' }
  );
  if (dump.status !== 0) {
    throw new Error(`docker pg_dump exited with code ${dump.status}`);
  }
}

function runPgDump(databaseUrl: string, sqlPath: string): void {
  const forceDocker =
    process.env.PG_DUMP_DOCKER === '1' || process.env.PG_DUMP_DOCKER === 'true';
  if (forceDocker) {
    if (!dockerAvailable()) {
      throw new Error('PG_DUMP_DOCKER is set but docker is not available (docker info failed).');
    }
    console.log('Using pg_dump from Docker:', process.env.PG_DUMP_DOCKER_IMAGE || 'postgres:17-alpine');
    runPgDumpDocker(databaseUrl, sqlPath);
    return;
  }

  const bin = pgDumpBin();
  const version = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0) {
    throw new Error(
      `${bin} not found. Install postgresql-client, set PG_DUMP_BIN, or PG_DUMP_DOCKER=1 with Docker.`
    );
  }

  console.log('Running pg_dump...');
  const first = runPgDumpLocal(databaseUrl, sqlPath);
  if (first.ok) return;

  if (existsSync(sqlPath)) {
    try {
      unlinkSync(sqlPath);
    } catch {
      /* ignore */
    }
  }

  const mismatch =
    first.stderr.includes('server version mismatch') || first.stderr.includes('version mismatch');
  if (mismatch && dockerAvailable()) {
    console.warn('Host pg_dump failed (server/client version mismatch). Retrying with Docker...');
    if (existsSync(sqlPath)) unlinkSync(sqlPath);
    runPgDumpDocker(databaseUrl, sqlPath);
    return;
  }

  console.error(first.stderr || `pg_dump failed (exit code)`);
  throw new Error('pg_dump failed');
}

async function main() {
  if (!getWasabiConfig()) {
    console.error('Wasabi is not configured. Add .wasabi.yaml or WASABI_* env vars.');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set (e.g. in backend/.env).');
    process.exit(1);
  }

  const stamp = backupTimestamp();
  const baseName = `metro-bistro-backup-${stamp}.sql.gz`;
  const tmpDir = mkdtempSync(join(tmpdir(), 'mb-db-backup-'));
  const sqlPath = join(tmpDir, 'dump.sql');
  const gzPath = join(tmpDir, baseName);

  try {
    runPgDump(databaseUrl, sqlPath);

    console.log('Compressing...');
    await pipeline(createReadStream(sqlPath), createGzip({ level: 9 }), createWriteStream(gzPath));
    unlinkSync(sqlPath);

    const prefix = getWasabiBackupKeyPrefix();
    const objectKey = `${prefix}/${baseName}`;
    const bucket = getWasabiConfig()!.bucket;
    console.log(`Uploading s3://${bucket}/${objectKey}`);
    const publicUrl = await uploadLocalFileToWasabi(gzPath, objectKey, guessContentType(baseName));
    console.log('Done:', publicUrl);

    const retentionRaw = process.env.BACKUP_RETENTION_DAYS ?? '7';
    const retentionDays = Number(retentionRaw);
    if (!Number.isFinite(retentionDays) || retentionDays < 1) {
      console.warn('BACKUP_RETENTION_DAYS invalid; skipping old backup cleanup.');
      return;
    }

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const listed = await listWasabiObjectsWithPrefix(`${prefix}/`);
    let removed = 0;
    for (const o of listed) {
      if (!o.lastModified || !o.key.endsWith('.sql.gz')) continue;
      if (o.key === objectKey) continue;
      if (o.lastModified.getTime() >= cutoff) continue;
      await deleteWasabiKeyUnrestricted(o.key);
      removed++;
      console.log('Removed old backup:', o.key);
    }
    if (removed === 0) {
      console.log('No prior backups exceeded retention.');
    }
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
      if (existsSync(gzPath)) unlinkSync(gzPath);
      if (existsSync(sqlPath)) unlinkSync(sqlPath);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
