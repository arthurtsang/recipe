#!/usr/bin/env bash
# Copy DATABASE_URL from recipe/.supabase-target-url into backend/.env (single line URI).
# Create .supabase-target-url in the recipe repo root: paste the URI from Supabase
# Dashboard → Connect → Session pooler (IPv4-safe). Do not commit that file.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
TARGET_FILE="${SUPABASE_TARGET_URL_FILE:-$REPO_ROOT/.supabase-target-url}"
ENV_FILE="$BACKEND_DIR/.env"
if [[ ! -f "$TARGET_FILE" ]]; then
  echo "Missing $TARGET_FILE — paste Session pooler URI from Supabase Connect there." >&2
  exit 1
fi
URL="$(grep -v '^\s*#' "$TARGET_FILE" | grep -v '^\s*$' | head -1 | tr -d '\r')"
case "$URL" in
  *sslmode=*) ;;
  *\?*) URL="${URL}&sslmode=require" ;;
  *) URL="${URL}?sslmode=require" ;;
esac

export SYNC_ENV_FILE="$ENV_FILE"
export SYNC_DATABASE_URL="$URL"
python3 << 'PY'
import os, pathlib, re
path = pathlib.Path(os.environ["SYNC_ENV_FILE"])
url = os.environ["SYNC_DATABASE_URL"]
text = path.read_text()
if not re.search(r"^DATABASE_URL=", text, flags=re.M):
    raise SystemExit("DATABASE_URL missing from .env")
text_new = re.sub(r"^DATABASE_URL=.*$", f'DATABASE_URL="{url}"', text, count=1, flags=re.M)
path.write_text(text_new)
print("Updated DATABASE_URL in", path)
PY
