# Metro Bistro backup strategy

## Database (primary)

The database is **PostgreSQL** (typically **Supabase**). Logical backups are:

- **Format:** `pg_dump` → **gzip** → object in **Wasabi** (same bucket as recipe images).
- **Key prefix:** `db-backups/` by default (`backup-key-prefix` in `.wasabi.yaml` or `WASABI_BACKUP_KEY_PREFIX`).
- **Script:** `backend/scripts/backup-db-to-wasabi.ts`
- **Wrapper:** `./backup-metro-bistro.sh` from the repo root (runs the script with `cwd` = `backend/`).

### Requirements on the backup host

- **`pg_dump`** from a client **≥ server major version** (Supabase often runs PostgreSQL 17). Ubuntu’s default `postgresql-client` may be too old.
- **Automatic fallback:** if local `pg_dump` fails with a server/client version mismatch and **Docker** is available, this script retries using **`postgres:17-alpine`** (override with **`PG_DUMP_DOCKER_IMAGE`**).
- **Docker always:** set **`PG_DUMP_DOCKER=1`** to skip the host `pg_dump`.
- **`PG_DUMP_BIN`** — non-default path to `pg_dump` when not using Docker.
- `DATABASE_URL` in `backend/.env` (same as the app)
- Wasabi credentials (`.wasabi.yaml` or env; for systemd, set `WASABI_CONFIG_PATH` if the file is not next to `backend/`)

### Retention (pruning)

After each **successful** upload, the script lists `*.sql.gz` under the backup prefix, sorts by **object `LastModified`** (newest first), **keeps the newest `BACKUP_KEEP_COUNT` objects** (default **`100`**), and **deletes** the rest. Override with env, e.g. `BACKUP_KEEP_COUNT=100`.

### Scheduled backups

**Production (Vercel):** daily at **02:00 UTC** via `vercel.json` → `GET /api/cron/backup`. Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when `CRON_SECRET` is set on the project. The build installs a Linux `pg_dump` binary (`backend/scripts/install-pg-dump-for-vercel.sh`); backups use **`DIRECT_DATABASE_URL`** (session pooler port 5432 or direct host — not transaction pooler 6543).

Disable the old host timer after Vercel cron is verified:

```bash
sudo systemctl disable --now metro-bistro-backup.timer
```

**Legacy (systemd on a host):** `metro-bistro-backup.timer` — daily at 02:00 local time. Prefer Vercel cron when deployed on Vercel.

```bash
sudo systemctl status metro-bistro-backup.timer
sudo journalctl -u metro-bistro-backup.service --since "24 hours ago"
```

Check Vercel cron logs in the project **Logs** tab (filter `/api/cron/backup`) or trigger manually:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" "https://YOUR_APP.vercel.app/api/cron/backup"
```

### Manual backup

```bash
cd /path/to/recipe/backend
npx tsx scripts/backup-db-to-wasabi.ts
```

### Restore from a Wasabi backup

1. Download the `.sql.gz` object from the Wasabi console or AWS CLI (`s3` endpoint = Wasabi), or use a presigned URL.
2. **Do not** run destructive SQL on production without a fresh backup confirmation.

```bash
gunzip -c metro-bistro-backup_YYYYMMDD_HHMMSS.sql.gz | psql "$DATABASE_URL"
```

Adjust for your host’s `psql` and SSL settings (Supabase pooler vs direct).

## Recipe media

Images are stored under the **recipe** key prefix (e.g. `recipes/`) in the same bucket. They are **not** included in the DB dump; rely on Wasabi bucket policies and optional provider-level replication for object durability.

## Legacy: local Docker PostgreSQL + `/mnt/Backup`

Older installs used `metro-bistro-postgres` and tarball backups under `/mnt/Backup/metro-bistro`. **Local Postgres is no longer shipped in this repo.** Historical `.tar.gz` backups can still be restored manually with `psql` / extracting `database.sql` if you have them.

## Safety

Never run on production without a plan:

- `npx prisma migrate reset --force`
- `npx prisma db push --force-reset`

Safe migration / deploy:

- `npx prisma migrate deploy`
- `npx prisma generate`
