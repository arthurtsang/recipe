/**
 * Copy Metro Bistro data from public.* → metrobistro.* without deleting public tables.
 *
 * Prerequisites:
 *   - Migration 20260723010000_create_metrobistro_schema applied
 *   - DATABASE_URL (or DIRECT_DATABASE_URL) points at the target DB (prefer session/direct, not 6543)
 *
 * Usage:
 *   cd backend
 *   DIRECT_DATABASE_URL='postgresql://...' npx ts-node scripts/copy-public-to-metrobistro.ts
 *   DIRECT_DATABASE_URL='...' npx ts-node scripts/copy-public-to-metrobistro.ts --dry-run
 *
 * Safe to re-run: uses INSERT ... ON CONFLICT DO NOTHING (IDs preserved).
 */
import { Client } from 'pg';

const TABLES = [
  'User',
  'Tag',
  'Recipe',
  'RecipeVersion',
  'RecipeTag',
  'Rating',
  'Comment',
  '_VersionTags',
  'ImportJob',
] as const;

type TableName = (typeof TABLES)[number];

function resolveDatabaseUrl(): string {
  const raw = (process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '').trim();
  if (!raw) {
    throw new Error('Set DIRECT_DATABASE_URL or DATABASE_URL');
  }
  const u = new URL(raw);
  if (u.port === '6543') {
    console.warn(
      'Warning: transaction pooler (6543) may fail for bulk copy. Prefer DIRECT_DATABASE_URL on 5432.'
    );
  }
  if (!u.searchParams.has('sslmode')) {
    u.searchParams.set('sslmode', 'require');
  }
  // Copy script talks to both schemas; strip Prisma schema search_path hint
  u.searchParams.delete('schema');
  return u.toString();
}

async function tableExists(client: Client, schema: string, table: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  );
  return r.rowCount === 1;
}

async function columns(client: Client, schema: string, table: string): Promise<string[]> {
  const r = await client.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table]
  );
  return r.rows.map((row) => row.column_name);
}

async function countRows(client: Client, schema: string, table: string): Promise<number> {
  const r = await client.query(`SELECT COUNT(*)::int AS c FROM ${quoteIdent(schema)}.${quoteIdent(table)}`);
  return r.rows[0].c as number;
}

function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

async function copyTable(
  client: Client,
  table: TableName,
  dryRun: boolean
): Promise<{ inserted: number; source: number; destBefore: number; destAfter: number }> {
  const srcCols = await columns(client, 'public', table);
  const dstCols = await columns(client, 'metrobistro', table);
  const shared = srcCols.filter((c) => dstCols.includes(c));
  if (shared.length === 0) {
    throw new Error(`No shared columns for ${table}`);
  }

  const source = await countRows(client, 'public', table);
  const destBefore = await countRows(client, 'metrobistro', table);

  const colList = shared.map(quoteIdent).join(', ');
  const sql = `
    INSERT INTO metrobistro.${quoteIdent(table)} (${colList})
    SELECT ${colList} FROM public.${quoteIdent(table)}
    ON CONFLICT DO NOTHING
  `;

  let inserted = 0;
  if (dryRun) {
    console.log(`[dry-run] ${table}: would copy ${source} rows (${shared.length} columns) → dest has ${destBefore}`);
  } else {
    // Recipe.currentVersionId FK → RecipeVersion: clear on insert, restore after versions land
    if (table === 'Recipe') {
      const withoutCv = shared.filter((c) => c !== 'currentVersionId');
      const colListNoCv = withoutCv.map(quoteIdent).join(', ');
      const insertSql = `
        INSERT INTO metrobistro."Recipe" (${colListNoCv})
        SELECT ${colListNoCv} FROM public."Recipe"
        ON CONFLICT DO NOTHING
      `;
      const r = await client.query(insertSql);
      inserted = r.rowCount ?? 0;
    } else {
      const r = await client.query(sql);
      inserted = r.rowCount ?? 0;
    }
  }

  const destAfter = dryRun ? destBefore : await countRows(client, 'metrobistro', table);
  return { inserted, source, destBefore, destAfter };
}

async function restoreRecipeCurrentVersions(client: Client, dryRun: boolean): Promise<number> {
  const sql = `
    UPDATE metrobistro."Recipe" AS d
    SET "currentVersionId" = s."currentVersionId"
    FROM public."Recipe" AS s
    WHERE d.id = s.id
      AND s."currentVersionId" IS NOT NULL
      AND d."currentVersionId" IS DISTINCT FROM s."currentVersionId"
  `;
  if (dryRun) {
    const preview = await client.query(`
      SELECT COUNT(*)::int AS c
      FROM metrobistro."Recipe" d
      JOIN public."Recipe" s ON d.id = s.id
      WHERE s."currentVersionId" IS NOT NULL
        AND d."currentVersionId" IS DISTINCT FROM s."currentVersionId"
    `);
    console.log(`[dry-run] Recipe.currentVersionId: would update ${preview.rows[0].c} rows`);
    return 0;
  }
  const r = await client.query(sql);
  return r.rowCount ?? 0;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const url = resolveDatabaseUrl();
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    for (const table of TABLES) {
      if (!(await tableExists(client, 'public', table))) {
        throw new Error(`Missing source table public.${table}`);
      }
      if (!(await tableExists(client, 'metrobistro', table))) {
        throw new Error(
          `Missing target table metrobistro.${table}. Run: npm run migrate:deploy`
        );
      }
    }

    console.log(dryRun ? '=== DRY RUN ===' : '=== COPY public → metrobistro ===');
    await client.query('BEGIN');

    const summary: Record<string, Awaited<ReturnType<typeof copyTable>>> = {};
    for (const table of TABLES) {
      summary[table] = await copyTable(client, table, dryRun);
      if (!dryRun) {
        console.log(
          `${table}: source=${summary[table].source} inserted=${summary[table].inserted} ` +
            `dest ${summary[table].destBefore} → ${summary[table].destAfter}`
        );
      }
    }

    const restored = await restoreRecipeCurrentVersions(client, dryRun);
    if (!dryRun) {
      console.log(`Recipe.currentVersionId restored: ${restored}`);
    }

    // Verify counts (dest >= source after idempotent copy; equal if dest was empty)
    let ok = true;
    for (const table of TABLES) {
      const src = summary[table].source;
      const dest = dryRun
        ? summary[table].destBefore
        : await countRows(client, 'metrobistro', table);
      if (!dryRun && dest < src) {
        console.error(`COUNT MISMATCH ${table}: source=${src} dest=${dest}`);
        ok = false;
      } else {
        console.log(`verify ${table}: public=${src} metrobistro=${dest}`);
      }
    }

    if (dryRun || !ok) {
      await client.query('ROLLBACK');
      if (!ok) {
        process.exitCode = 1;
        console.error('Rolled back due to count mismatch.');
      } else {
        console.log('Dry run complete (rolled back).');
      }
      return;
    }

    await client.query('COMMIT');
    console.log('Copy committed. public.* tables left intact.');
    console.log('Next: point DATABASE_URL at ?schema=metrobistro and deploy the app.');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
