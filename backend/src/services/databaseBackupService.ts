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
import { getBackupDatabaseUrl } from '../lib/databaseUrl';
import { isServerless } from '../lib/serverless';
import {
  deleteWasabiKeyUnrestricted,
  getWasabiBackupKeyPrefix,
  getWasabiConfig,
  guessContentType,
  listWasabiObjectsWithPrefix,
  uploadLocalFileToWasabi,
} from '../lib/wasabiStorage';

export type BackupResult = {
  objectKey: string;
  publicUrl: string;
  pruned: number;
  totalBackups: number;
};

function backupTimestamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(
    d.getMinutes()
  )}${p(d.getSeconds())}`;
}

function bundledPgDumpPath(): string {
  return join(__dirname, '../../bin/pg_dump');
}

function pgDumpBin(): string {
  const fromEnv = (process.env.PG_DUMP_BIN || '').trim();
  if (fromEnv) return fromEnv;

  const bundled = bundledPgDumpPath();
  if (existsSync(bundled)) return bundled;

  return 'pg_dump';
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

export function runPgDump(databaseUrl: string, sqlPath: string): void {
  const forceDocker =
    process.env.PG_DUMP_DOCKER === '1' || process.env.PG_DUMP_DOCKER === 'true';

  if (forceDocker) {
    if (!dockerAvailable()) {
      throw new Error('PG_DUMP_DOCKER is set but docker is not available (docker info failed).');
    }
    console.log('[backup] Using pg_dump from Docker:', process.env.PG_DUMP_DOCKER_IMAGE || 'postgres:17-alpine');
    runPgDumpDocker(databaseUrl, sqlPath);
    return;
  }

  const bin = pgDumpBin();
  const version = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0) {
    const hint = isServerless()
      ? 'Bundled pg_dump missing — ensure install-pg-dump-for-vercel.sh ran at build time.'
      : 'Install postgresql-client, set PG_DUMP_BIN, or PG_DUMP_DOCKER=1 with Docker.';
    throw new Error(`${bin} not found. ${hint}`);
  }

  console.log('[backup] Running pg_dump with', bin);
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
    console.warn('[backup] Host pg_dump version mismatch; retrying with Docker...');
    if (existsSync(sqlPath)) unlinkSync(sqlPath);
    runPgDumpDocker(databaseUrl, sqlPath);
    return;
  }

  console.error(first.stderr || 'pg_dump failed');
  throw new Error('pg_dump failed');
}

async function pruneOldBackups(prefix: string): Promise<{ pruned: number; totalBackups: number }> {
  const keepRaw = process.env.BACKUP_KEEP_COUNT ?? '100';
  const keepCount = Number(keepRaw);
  if (!Number.isFinite(keepCount) || keepCount < 1) {
    console.warn('[backup] BACKUP_KEEP_COUNT invalid; skipping pruning.');
    return { pruned: 0, totalBackups: 0 };
  }

  const listed = await listWasabiObjectsWithPrefix(`${prefix}/`);
  const backups = listed.filter((o) => o.key.endsWith('.sql.gz'));
  backups.sort((a, b) => {
    const ta = a.lastModified?.getTime() ?? 0;
    const tb = b.lastModified?.getTime() ?? 0;
    if (tb !== ta) return tb - ta;
    return b.key.localeCompare(a.key);
  });

  const toDelete = backups.slice(keepCount);
  let pruned = 0;
  for (const o of toDelete) {
    await deleteWasabiKeyUnrestricted(o.key);
    pruned++;
    console.log('[backup] Removed old backup:', o.key);
  }

  if (pruned === 0) {
    console.log(`[backup] Pruning ok: ${backups.length} backup(s), keeping last ${keepCount}.`);
  } else {
    console.log(`[backup] Pruned ${pruned} backup(s); keeping newest ${keepCount}.`);
  }

  return { pruned, totalBackups: backups.length };
}

export async function backupDatabaseToWasabi(): Promise<BackupResult> {
  if (!getWasabiConfig()) {
    throw new Error(
      'Wasabi is not configured. Set WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY, WASABI_BUCKET, WASABI_REGION.'
    );
  }

  const databaseUrl = getBackupDatabaseUrl();
  const stamp = backupTimestamp();
  const baseName = `metro-bistro-backup-${stamp}.sql.gz`;
  const tmpDir = mkdtempSync(join(tmpdir(), 'mb-db-backup-'));
  const sqlPath = join(tmpDir, 'dump.sql');
  const gzPath = join(tmpDir, baseName);

  try {
    runPgDump(databaseUrl, sqlPath);

    console.log('[backup] Compressing...');
    await pipeline(createReadStream(sqlPath), createGzip({ level: 9 }), createWriteStream(gzPath));
    unlinkSync(sqlPath);

    const prefix = getWasabiBackupKeyPrefix();
    const objectKey = `${prefix}/${baseName}`;
    const bucket = getWasabiConfig()!.bucket;
    console.log(`[backup] Uploading s3://${bucket}/${objectKey}`);
    const publicUrl = await uploadLocalFileToWasabi(gzPath, objectKey, guessContentType(baseName));
    console.log('[backup] Done:', publicUrl);

    const { pruned, totalBackups } = await pruneOldBackups(prefix);
    return { objectKey, publicUrl, pruned, totalBackups };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      if (existsSync(gzPath)) unlinkSync(gzPath);
      if (existsSync(sqlPath)) unlinkSync(sqlPath);
    }
  }
}
