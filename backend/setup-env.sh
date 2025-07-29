#!/bin/bash

# Metro Bistro Backend Environment Setup
# This script creates the .env file with the correct database configuration

echo "Setting up Metro Bistro Backend environment..."

# Create .env file with correct database URL
cat > .env << EOF
# Database Configuration
DATABASE_URL="postgresql://metro_user:metro_password@localhost:5433/metro_bistro"

# Server Configuration
PORT=4000
NODE_ENV=production

# Base URL for the application
BASE_URL="http://localhost:4000"

# Google OAuth Configuration (you'll need to set these)
GOOGLE_CLIENT_ID="your_google_client_id_here"
GOOGLE_CLIENT_SECRET="your_google_client_secret_here"

# Session Configuration
SESSION_SECRET="metro-bistro-session-secret-change-this-in-production"

# AI Service URL
AI_SERVICE_URL="http://localhost:8001"

# Allowed emails (comma-separated)
ALLOWED_EMAILS=""
EOF

echo "✅ .env file created with correct database URL"
echo ""
echo "⚠️  IMPORTANT: You need to configure Google OAuth:"
echo "   1. Go to https://console.cloud.google.com/"
echo "   2. Create a new project or select existing one"
echo "   3. Enable Google+ API"
echo "   4. Create OAuth 2.0 credentials"
echo "   5. Set authorized redirect URI to: http://localhost:4000/auth/google/callback"
echo "   6. Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env"
echo ""
echo "After configuring Google OAuth, restart the backend service:"
echo "   sudo systemctl restart metro-bistro-backend" 