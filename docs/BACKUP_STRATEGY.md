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

- **Timer:** `metro-bistro-backup.timer` — **daily at 02:00** (local system timezone), per `OnCalendar=*-*-* 02:00:00`.
- **Service:** `metro-bistro-backup.service` → runs `npx tsx scripts/backup-db-to-wasabi.ts` as the app user (`tsangc1` in the shipped unit file).

```bash
sudo systemctl status metro-bistro-backup.timer
sudo journalctl -u metro-bistro-backup.service --since "24 hours ago"
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
