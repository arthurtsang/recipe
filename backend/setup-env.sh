#!/bin/bash

# Metro Bistro Backend — template .env (database is usually Supabase or other hosted Postgres).

echo "Setting up Metro Bistro Backend environment template..."

cat > .env << 'EOF'
# Database — Supabase on Vercel needs the pooler, not the direct db.*.supabase.co host.
#
# Runtime (Vercel / Prisma queries) — Transaction pooler, port 6543:
# DATABASE_URL="postgresql://postgres.xnaggwecqxmbqhcgynge:URL_ENCODED_PASSWORD@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"
#
# Migrations (build / prisma migrate) — Session pooler, port 5432, or direct host:
# DIRECT_DATABASE_URL="postgresql://postgres.xnaggwecqxmbqhcgynge:URL_ENCODED_PASSWORD@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require"
#
# Local dev — one URL is fine:
DATABASE_URL="postgresql://USER:URL_ENCODED_PASSWORD@HOST:5432/postgres?sslmode=require"

# Server Configuration
PORT=4000
NODE_ENV=production

# Public URL for the application (OAuth callbacks, CORS, image URLs)
BASE_URL="http://localhost:4000"

# Google OAuth Configuration (you'll need to set these)
GOOGLE_CLIENT_ID="your_google_client_id_here"
GOOGLE_CLIENT_SECRET="your_google_client_secret_here"

# Session Configuration
SESSION_SECRET="metro-bistro-session-secret-change-this-in-production"

# Admin email (auto-enabled on first login)
ADMIN_EMAIL=""

# Allowed emails (comma-separated)
ALLOWED_EMAILS=""

# Wasabi object storage (required on Vercel; optional locally)
WASABI_ACCESS_KEY_ID=""
WASABI_SECRET_ACCESS_KEY=""
WASABI_BUCKET=""
WASABI_REGION="us-east-1"
WASABI_KEY_PREFIX="recipes"
# WASABI_ENDPOINT="https://s3.us-east-1.wasabisys.com"
# WASABI_PUBLIC_URL_BASE="https://your-bucket.s3.us-east-1.wasabisys.com"
# WASABI_BACKUP_KEY_PREFIX="db-backups"
# WASABI_PRESIGN_EXPIRES_SEC="3600"

# Direct/session Postgres URL for pg_dump backups (Vercel cron). Not the transaction pooler (6543).
# DIRECT_DATABASE_URL="postgresql://...@....pooler.supabase.com:5432/postgres?sslmode=require"

# Vercel Cron auth (set in Vercel project env; crons send Authorization: Bearer <CRON_SECRET>)
CRON_SECRET=""
EOF

echo "✅ .env template created — replace DATABASE_URL, BASE_URL, OAuth, and Wasabi values."
echo ""
echo "⚠️  IMPORTANT: Configure Google OAuth:"
echo "   1. Go to https://console.cloud.google.com/"
echo "   2. Create a new project or select existing one"
echo "   3. Enable Google+ API"
echo "   4. Create OAuth 2.0 credentials"
echo "   5. Set authorized redirect URI to: \${BASE_URL}/auth/google/callback"
echo "   6. Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env"
echo ""
echo "After configuring locally: npm run dev (or redeploy on Vercel)."
