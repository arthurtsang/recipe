#!/usr/bin/env bash
# Install a Linux pg_dump binary for Vercel serverless backups (no apt on Vercel).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$ROOT/bin"
PG_DUMP="$BIN_DIR/pg_dump"

if [ -x "$PG_DUMP" ]; then
  echo "[install-pg-dump] Already present: $PG_DUMP"
  "$PG_DUMP" --version
  exit 0
fi

if [ "${VERCEL:-}" != "1" ]; then
  echo "[install-pg-dump] Skipping (not a Vercel build). Install postgresql-client locally or set PG_DUMP_BIN."
  exit 0
fi

mkdir -p "$BIN_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PG_VERSION="${PG_DUMP_VERSION:-17.4}"
TARBALL="postgresql-${PG_VERSION}-1-linux-x64-binaries.tar.gz"
URL="https://get.enterprisedb.com/postgresql/${TARBALL}"

echo "[install-pg-dump] Downloading PostgreSQL ${PG_VERSION} client from EDB..."
curl -fsSL "$URL" -o "$TMP/$TARBALL"
tar -xzf "$TMP/$TARBALL" -C "$TMP"
cp "$TMP/pgsql/bin/pg_dump" "$PG_DUMP"
chmod +x "$PG_DUMP"
"$PG_DUMP" --version
echo "[install-pg-dump] Installed to $PG_DUMP"
