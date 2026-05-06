#!/usr/bin/env bash
# Migrate local Metro Bistro PostgreSQL (Docker) data to Supabase.
#
# Local database safety: only read access (pg_dump --data-only). Does not stop Docker,
# drop schemas, truncate, or otherwise modify the local database or container.
#
# Prerequisites: Docker container "metro-bistro-postgres" running with your data.
# Requires: postgresql-client (psql) on PATH for the restore step.
#
# Target connection (first match wins):
#
#   1) TARGET_DATABASE_URL env — full URI (direct or session pooler).
#   2) recipe/.supabase-target-url — first non-comment line (paste from Dashboard →
#      Connect → **Session pooler** if your network has no IPv6 to the direct host).
#   3) SUPABASE_POOLER_REGION=us-west-2 + recipe/.supabase — builds Session pooler URI:
#      postgres.<ref>@aws-$SUPABASE_POOLER_INDEX-$REGION.pooler.supabase.com:5432
#      (SUPABASE_POOLER_INDEX defaults to 1; use 0 if your dashboard shows aws-0-...).
#   4) recipe/.supabase + SUPABASE_DB_HOST — direct connection (often IPv6-only).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"

SOURCE_CONTAINER="${SOURCE_CONTAINER:-metro-bistro-postgres}"
SOURCE_USER="${SOURCE_USER:-metro_user}"
SOURCE_DB="${SOURCE_DB:-metro_bistro}"

SUPABASE_DB_HOST="${SUPABASE_DB_HOST:-db.xnaggwecqxmbqhcgynge.supabase.co}"
SUPABASE_DB_PORT="${SUPABASE_DB_PORT:-5432}"
SUPABASE_DB_USER="${SUPABASE_DB_USER:-postgres}"
SUPABASE_DB_NAME="${SUPABASE_DB_NAME:-postgres}"
SUPABASE_PASSWORD_FILE="${SUPABASE_PASSWORD_FILE:-$REPO_ROOT/.supabase}"
SUPABASE_TARGET_URL_FILE="${SUPABASE_TARGET_URL_FILE:-$REPO_ROOT/.supabase-target-url}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-xnaggwecqxmbqhcgynge}"
SUPABASE_POOLER_INDEX="${SUPABASE_POOLER_INDEX:-1}"

ensure_sslmode() {
  local u="$1"
  case "$u" in
    *sslmode=*) echo "$u" ;;
    *\?*) echo "${u}&sslmode=require" ;;
    *) echo "${u}?sslmode=require" ;;
  esac
}

build_target_database_url() {
  SUPABASE_PASSWORD_FILE="$SUPABASE_PASSWORD_FILE" \
  SUPABASE_DB_USER="$SUPABASE_DB_USER" \
  SUPABASE_DB_HOST="$SUPABASE_DB_HOST" \
  SUPABASE_DB_PORT="$SUPABASE_DB_PORT" \
  SUPABASE_DB_NAME="$SUPABASE_DB_NAME" \
  python3 -c "
import os, pathlib, urllib.parse
p = pathlib.Path(os.environ['SUPABASE_PASSWORD_FILE']).read_text()
enc = urllib.parse.quote(p.strip(), safe='')
user = os.environ['SUPABASE_DB_USER']
host = os.environ['SUPABASE_DB_HOST']
port = os.environ['SUPABASE_DB_PORT']
db = os.environ['SUPABASE_DB_NAME']
print(f'postgresql://{user}:{enc}@{host}:{port}/{db}?sslmode=require')
"
}

build_session_pooler_database_url() {
  SUPABASE_PASSWORD_FILE="$SUPABASE_PASSWORD_FILE" \
  SUPABASE_PROJECT_REF="$SUPABASE_PROJECT_REF" \
  SUPABASE_POOLER_REGION="$SUPABASE_POOLER_REGION" \
  SUPABASE_POOLER_INDEX="$SUPABASE_POOLER_INDEX" \
  SUPABASE_DB_NAME="$SUPABASE_DB_NAME" \
  python3 -c "
import os, pathlib, urllib.parse
p = pathlib.Path(os.environ['SUPABASE_PASSWORD_FILE']).read_text()
enc = urllib.parse.quote(p.strip(), safe='')
ref = os.environ['SUPABASE_PROJECT_REF']
region = os.environ['SUPABASE_POOLER_REGION']
idx = os.environ['SUPABASE_POOLER_INDEX']
db = os.environ['SUPABASE_DB_NAME']
user = f'postgres.{ref}'
host = f'aws-{idx}-{region}.pooler.supabase.com'
print(f'postgresql://{user}:{enc}@{host}:5432/{db}?sslmode=require')
"
}

if [[ -n "${TARGET_DATABASE_URL:-}" ]]; then
  TARGET_URL="$(ensure_sslmode "$TARGET_DATABASE_URL")"
elif [[ -f "$SUPABASE_TARGET_URL_FILE" ]]; then
  TARGET_URL="$(grep -v '^\s*#' "$SUPABASE_TARGET_URL_FILE" | grep -v '^\s*$' | head -1 | tr -d '\r')"
  if [[ -z "$TARGET_URL" ]]; then
    echo "No connection line found in $SUPABASE_TARGET_URL_FILE (paste Supabase Session pooler URI)." >&2
    exit 1
  fi
  TARGET_URL="$(ensure_sslmode "$TARGET_URL")"
elif [[ -n "${SUPABASE_POOLER_REGION:-}" ]]; then
  if [[ ! -f "$SUPABASE_PASSWORD_FILE" ]]; then
    echo "Set SUPABASE_POOLER_REGION but missing password file: $SUPABASE_PASSWORD_FILE" >&2
    exit 1
  fi
  TARGET_URL="$(build_session_pooler_database_url)"
else
  if [[ ! -f "$SUPABASE_PASSWORD_FILE" ]]; then
    echo "Create $SUPABASE_TARGET_URL_FILE, or set TARGET_DATABASE_URL, or set SUPABASE_PASSWORD_FILE for direct host." >&2
    exit 1
  fi
  TARGET_URL="$(build_target_database_url)"
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$SOURCE_CONTAINER"; then
  echo "Docker container $SOURCE_CONTAINER is not running." >&2
  exit 1
fi

echo "==> Applying Prisma migrations on Supabase..."
(
  cd "$BACKEND_DIR"
  DATABASE_URL="$TARGET_URL" npx prisma migrate deploy
)

echo "==> Dumping data from local PostgreSQL (excluding _prisma_migrations)..."
DUMP="$(mktemp)"
trap 'rm -f "$DUMP"' EXIT

docker exec -e PGPASSWORD=metro_password "$SOURCE_CONTAINER" \
  pg_dump -U "$SOURCE_USER" -d "$SOURCE_DB" \
  --data-only \
  --no-owner \
  --no-privileges \
  --exclude-table=_prisma_migrations \
  -f - >"$DUMP"

echo "==> Restoring data to Supabase..."
export PGSSLMODE=require
# Recipe <-> RecipeVersion circular FK: defer triggers/constraints for COPY order (pg_dump --data-only).
{
  echo "SET session_replication_role = 'replica';"
  cat "$DUMP"
  echo "SET session_replication_role = DEFAULT;"
} | psql "$TARGET_URL" -v ON_ERROR_STOP=1

echo "==> Done."
if [[ "${POST_MIGRATE_SYNC_ENV:-}" == "1" ]] && [[ -f "$SUPABASE_TARGET_URL_FILE" ]]; then
  "$SCRIPT_DIR/sync-env-from-supabase-target.sh"
elif [[ "${POST_MIGRATE_SYNC_ENV:-}" == "1" ]]; then
  echo "POST_MIGRATE_SYNC_ENV=1 set but $SUPABASE_TARGET_URL_FILE missing — update backend/.env DATABASE_URL yourself."
fi
