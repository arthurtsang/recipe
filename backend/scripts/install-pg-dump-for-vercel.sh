#!/usr/bin/env bash
# Install a Linux pg_dump binary for Vercel serverless backups (no apt on Vercel).
#
# Source: https://github.com/theseus-rs/postgresql-binaries (public GitHub releases)
# We prefer the musl variant by default because it has far fewer dynamic library
# dependencies and is much more likely to run in Vercel's minimal build + runtime env.
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
# Use musl build by default — far more likely to work in minimal serverless
# environments (Vercel, etc.) because it has fewer dynamic dependencies.
# Set PG_DUMP_MUSL=0 (or PG_DUMP_GLIBC=1) to force the glibc variant instead.
USE_MUSL="${PG_DUMP_MUSL:-1}"
if [ "${PG_DUMP_GLIBC:-0}" = "1" ]; then
  USE_MUSL=0
fi

if [ "$USE_MUSL" = "1" ]; then
  VARIANT="musl"
  TARBALL="postgresql-${PG_VERSION}-x86_64-unknown-linux-musl.tar.gz"
  INNER_DIR="postgresql-${PG_VERSION}-x86_64-unknown-linux-musl"
else
  VARIANT="glibc"
  TARBALL="postgresql-${PG_VERSION}-x86_64-unknown-linux-gnu.tar.gz"
  INNER_DIR="postgresql-${PG_VERSION}-x86_64-unknown-linux-gnu"
fi

URL="https://github.com/theseus-rs/postgresql-binaries/releases/download/${PG_VERSION}/${TARBALL}"

echo "[install-pg-dump] Downloading PostgreSQL ${PG_VERSION} (${VARIANT}) from theseus-rs/postgresql-binaries..."
curl -fsSL --retry 3 --retry-delay 2 --retry-max-time 30 "$URL" -o "$TMP/$TARBALL"
tar -xzf "$TMP/$TARBALL" -C "$TMP"

cp "$TMP/$INNER_DIR/bin/pg_dump" "$PG_DUMP"
chmod +x "$PG_DUMP"

echo "[install-pg-dump] Verifying binary..."
if "$PG_DUMP" --version 2>&1; then
  echo "[install-pg-dump] Installed successfully to $PG_DUMP"
else
  echo ""
  echo "=== BINARY DIAGNOSTICS (this is why it failed) ==="
  echo "Binary: $PG_DUMP"
  echo "Variant: $VARIANT (PG_VERSION=$PG_VERSION)"
  echo ""
  echo "--- file output ---"
  file "$PG_DUMP" || true
  echo ""
  echo "--- ldd (dynamic library dependencies) ---"
  ldd "$PG_DUMP" 2>&1 || true
  echo ""
  echo "--- ldd -v (detailed) ---"
  ldd -v "$PG_DUMP" 2>&1 || true
  echo ""
  echo "--- readelf -d (direct shared object dependencies) ---"
  readelf -d "$PG_DUMP" 2>&1 || true
  echo ""
  echo "=== END DIAGNOSTICS ==="
  echo ""
  echo "The binary could not execute in this environment."
  echo "Most common cause: missing libpq.so.5 or other Postgres shared libraries."
  echo "Try setting PG_DUMP_MUSL=0 and PG_DUMP_GLIBC=1 to test the glibc build,"
  echo "or consider using PG_DUMP_DOCKER=1 at runtime instead of a bundled binary."
  exit 1
fi
