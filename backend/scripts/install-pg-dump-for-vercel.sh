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
  echo "!!! WARNING: Bundled pg_dump binary is not executable in this environment !!!"
  echo ""
  echo "=== BINARY DIAGNOSTICS ==="
  echo "Binary: $PG_DUMP"
  echo "Variant attempted: $VARIANT (PG_VERSION=$PG_VERSION)"
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
  echo "--- readelf -d ---"
  readelf -d "$PG_DUMP" 2>&1 || true
  echo ""
  echo "=== END DIAGNOSTICS ==="
  echo ""
  echo "This is expected on Vercel because the prebuilt pg_dump binaries require"
  echo "libpq.so.5 + related Postgres client libraries that are not present in the"
  echo "Vercel build / serverless runtime image."
  echo ""
  echo "Consequence:"
  echo "  - The main API, image uploads, recipes, etc. will deploy and work normally."
  echo "  - The /api/cron/backup endpoint (and local backup script) will fail at runtime"
  echo "    with a clear error until a working pg_dump solution is provided."
  echo ""
  echo "To make backups work you have a few realistic options:"
  echo "  1. Run the backup job from a different environment that has postgresql-client"
  echo "     (e.g. a small Fly.io / Railway / VPS machine with the timer service)."
  echo "  2. Set PG_DUMP_DOCKER=1 and run backups from a host that has Docker."
  echo "  3. Contribute a fully static pg_dump binary + all required .so files."
  echo ""
  echo "Continuing build without a working pg_dump (this is not fatal)."
  echo ""
  # Do NOT exit 1 — the backup tool is optional for the main application.
  # The cron backup will simply fail at runtime with a good error message.
fi
