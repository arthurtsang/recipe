#!/usr/bin/env bash
# Install a Linux pg_dump binary for Vercel serverless backups (no apt on Vercel).
#
# Source: https://github.com/theseus-rs/postgresql-binaries (public GitHub releases)
# These are full PostgreSQL client binaries for glibc-based Linux (Vercel uses glibc).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$ROOT/dist/bin"
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

PG_VERSION="${PG_DUMP_VERSION:-17.5.0}"
TARBALL="postgresql-${PG_VERSION}-x86_64-unknown-linux-gnu.tar.gz"
URL="https://github.com/theseus-rs/postgresql-binaries/releases/download/${PG_VERSION}/${TARBALL}"

echo "[install-pg-dump] Downloading PostgreSQL ${PG_VERSION} client from theseus-rs/postgresql-binaries..."
curl -fsSL --retry 3 --retry-delay 2 --retry-max-time 30 "$URL" -o "$TMP/$TARBALL"
tar -xzf "$TMP/$TARBALL" -C "$TMP"

INNER_DIR="postgresql-${PG_VERSION}-x86_64-unknown-linux-gnu"
cp "$TMP/$INNER_DIR/bin/pg_dump" "$PG_DUMP"
chmod +x "$PG_DUMP"
"$PG_DUMP" --version
echo "[install-pg-dump] Installed to $PG_DUMP"
