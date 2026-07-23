#!/bin/bash
# Creates all MetroBistro Linear issues via GraphQL API.
# Usage: LINEAR_API_KEY=lin_api_xxx TEAM_ID=xxx bash create-linear-issues.sh
#
# To get TEAM_ID:
#   curl -s -H "Authorization: $LINEAR_API_KEY" -H "Content-Type: application/json" \
#     -d '{"query":"{ teams { nodes { id name } } }"}' https://api.linear.app/graphql

set -euo pipefail

API_KEY="${LINEAR_API_KEY:?Set LINEAR_API_KEY}"
TEAM_ID="${TEAM_ID:?Set TEAM_ID}"

gql() {
  local title="$1" desc="$2" label="${3:-}"
  local query
  query=$(cat <<QUERY
{
  "query": "mutation CreateIssue(\$input: IssueCreateInput!) { issueCreate(input: \$input) { success issue { id identifier title } } }",
  "variables": {
    "input": {
      "teamId": "$TEAM_ID",
      "title": "$title",
      "description": "$desc"
    }
  }
}
QUERY
)
  local result
  result=$(curl -s -X POST https://api.linear.app/graphql \
    -H "Authorization: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$query")
  local id identifier
  identifier=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['issueCreate']['issue']['identifier'])" 2>/dev/null || echo "ERROR")
  echo "Created: $identifier — $title"
}

echo "=== SETUP: Toolchain ==="
gql "Install & configure Supabase CLI + MCP" "Supabase CLI v2.107.0 already installed via brew. Run \`supabase login\` (browser OIDC), get token from ~/.supabase/access-token, paste into ~/.claude/settings.json mcpServers.supabase. Link prod and dev projects."
gql "Install & configure Vercel CLI + MCP" "Run \`source ~/.nvm/nvm.sh && nvm use 18 && npm install -g vercel\`. Then \`vercel login\` (browser OAuth). Extract token, paste into ~/.claude/settings.json mcpServers.vercel. Run \`vercel link\` in /recipe."
gql "Install & configure Linear MCP" "Go to https://linear.app/settings/api, create PAT named 'Claude Code'. Paste into ~/.claude/settings.json mcpServers.linear.LINEAR_API_KEY. Restart Claude Code."
gql "Fix Android SDK PATH in ~/.zshrc" "Add: export ANDROID_HOME=\$HOME/Library/Android/sdk and PATH entries for platform-tools, build-tools/34.0.0, emulator. Source ~/.zshrc. Verify: adb --version."

echo ""
echo "=== DB: Backup & Schema Migration ==="
gql "Backup prod Supabase DB to local" "Run: supabase db dump --project-ref <PROD_REF> -f ./backups/prod-\$(date +%Y%m%d).sql. Store in /recipe/backups/. Do this before any schema changes."
gql "Backup dev Supabase DB to local" "Run: supabase db dump --project-ref <DEV_REF> -f ./backups/dev-\$(date +%Y%m%d).sql. Store in /recipe/backups/."
gql "Create metrobistro schema migration script" "Write migration SQL: CREATE SCHEMA metrobistro; then ALTER TABLE public.X SET SCHEMA metrobistro for all 8 tables (User, Recipe, RecipeVersion, Rating, Comment, Tag, RecipeTag, ImportJob). Add to backend/prisma/migrations/."
gql "Update Prisma schema for metrobistro" "Add schemas=[\"metrobistro\"] to datasource. Add @@schema(\"metrobistro\") to all models. Update DATABASE_URL to include ?schema=metrobistro. Run npx prisma generate."
gql "Apply schema migration to dev Supabase + validate" "supabase db push --project-ref <DEV_REF>. Run backend against dev, smoke test all endpoints. Check RLS policies still apply."
gql "Apply schema migration to prod Supabase" "Only after dev is fully validated. Take fresh backup first. supabase db push --project-ref <PROD_REF>. Deploy updated backend to Vercel prod."

echo ""
echo "=== ANDROID: App Setup ==="
gql "Bootstrap Android project (Kotlin + Compose + Hilt)" "Create mobile/android/ with Kotlin + Jetpack Compose + Hilt + Retrofit + Coil + MediaPipe dependencies. Configure build.gradle.kts, proguard rules."
gql "Implement Google Sign-In for Android" "Use play-services-auth. Mirror existing Google OIDC client_id. Handle token exchange with backend /auth endpoint."
gql "Recipe list screen" "Jetpack Compose screen: fetch GET /api/recipes, lazy column with RecipeCard composable, search bar, tag filter chips."
gql "Recipe detail screen" "Show full recipe (title, image, time, difficulty, ingredients, instructions). Rate button. Start cooking button → CookingMode. Share link."
gql "Recipe create/edit screen with voice input" "Form with all recipe fields. Voice input via Android SpeechRecognizer for ingredients/instructions. On save: trigger on-device AI analysis."
gql "Import recipe screen (URL + video, delegates to server)" "URL/video input field. POST to /api/import-jobs. Poll job status. Show progress. On complete: open prefilled RecipeForm."
gql "Cooking mode screen (TTS + per-step timers)" "Full-screen step view. TextToSpeech narration per step. Per-step countdown timer. Screen keep-awake. Next/back navigation."
gql "Settings / profile screen" "Show alias, email, avatar. Set alias. Manage API token. AI model download status/trigger."
gql "Image upload (camera + gallery picker)" "Use ActivityResultContracts for gallery and camera. Upload to /api/recipes/upload (multipart). Coil for preview."
gql "Android E2E tests (Espresso)" "Espresso tests for RecipeList, RecipeDetail, RecipeForm flows. Mock API responses with OkHttp MockWebServer."
gql "Sign APK + publish to Play Store internal track" "Generate signing keystore. Configure release build in build.gradle. Upload to Play Console internal track for testing."

echo ""
echo "=== AI: On-Device Integration ==="
gql "Evaluate & download Gemma 2B model for MediaPipe" "Download gemma-2b-it-gpu-int4.bin (~1.4 GB). Test LlmInference initialization on emulator and real device. Document minimum device requirements."
gql "On-device recipe time/difficulty analyzer" "Implement RecipeAnalyzer.kt using MediaPipe LlmInference. Prompt: given title+ingredients+instructions, return JSON {estimatedTime, difficulty, reasoning}. Called on recipe save."
gql "On-device auto-category / tag suggestion" "Implement TagSuggester.kt. Prompt: given recipe content, suggest 2-5 relevant tags. Used in RecipeForm tag chip selector."
gql "On-device recipe chat (per-recipe Q&A)" "Implement RecipeChat.kt. Maintains conversation history. Context = current recipe content injected into system prompt. Used in RecipeDetail bottom sheet."
gql "Ingredient extraction from pasted text" "Implement IngredientExtractor.kt. User pastes messy text; LLM parses into structured list. Used in RecipeForm ingredients field."
gql "AI-guided cooking mode (LLM step planner + TTS)" "Before cooking mode: LLM breaks instructions into discrete timed steps with duration hints. CookingModeViewModel drives TTS + timers per step."
gql "Model download UX (first-launch WiFi prompt + progress)" "On first AI feature use: show dialog explaining 1.4 GB download, WiFi check, DownloadManager with notification. Progress shown in Settings. Features degrade gracefully if model absent."
gql "Deploy import worker to Cloud Run (dev)" "Build/push workers/import image; update metrobistro-import-dev Cloud Run Job; wire Pub/Sub + WIF from Vercel preview."

echo ""
echo "=== DEPLOY: Dev → Prod ==="
gql "Configure dev environment variables" "Set DATABASE_URL (dev Supabase, metrobistro schema), NVIDIA/GCP Pub/Sub WIF vars, and stable Preview BASE_URL / Google OAuth redirect for recipe-preview.youramaryllis.com."
gql "Deploy backend to Vercel preview (dev)" "vercel --target=preview. Verify /api/recipes, /api/import-jobs, /api/users endpoints work against dev Supabase."
gql "Test all API endpoints against dev Supabase" "Run existing E2E tests (Cucumber) against Vercel preview URL. Manual smoke test of import job flow."
gql "Android integration test vs dev backend" "Point Android app at Vercel preview URL. Test auth, recipe CRUD, import, on-device AI features. Test on emulator + real device."
gql "Promote DB migration to prod Supabase" "After dev validation: backup prod, run migration, verify data integrity, update search_path."
gql "Promote backend to Vercel prod" "vercel --prod after dev validation complete. Monitor Vercel logs and Supabase query performance."

echo ""
echo "All issues created."
