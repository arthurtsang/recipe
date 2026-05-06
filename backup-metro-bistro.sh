#!/bin/bash
# Database backup to Wasabi (pg_dump → gzip → S3). Recipe images remain under their own prefix in the same bucket.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend"
exec npx tsx scripts/backup-db-to-wasabi.ts
