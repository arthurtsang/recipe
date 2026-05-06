# Recipe App E2E Tests

BDD (Behavior-Driven Development) tests for the Recipe app using Cucumber and Playwright.

## Prerequisites

- Node.js 18+
- Docker and Docker Compose (for all-in-one Docker run)

## Quick Start - All-in-One Docker (Recommended)

Start all services and run tests in one command:

```bash
# From recipe/ directory
docker compose -f docker-compose.e2e.yml up

# Stops all containers when tests complete:
docker compose -f docker-compose.e2e.yml up --abort-on-container-exit
```

This will:
1. Start postgres, mock-oauth, mock-ai, and the app
2. Wait for the app to be healthy
3. Run the E2E test suite inside the container
4. Exit with the test exit code (0 = pass, non-zero = fail)

## Local Development (Run tests against local app)

```bash
# Start postgres and mock AI
docker compose -f docker-compose.e2e-deps.yml up -d

# Start mock OAuth
cd mock_oauth && npm install && npm start

# Start app with test config (another terminal)
cd backend && npm run dev
# Env: DATABASE_URL=postgresql://metro_user:metro_password@localhost:5434/metro_bistro \
#   AI_SERVICE_URL=http://localhost:8001 ISSUER_BASE_URL=http://localhost:9999 \
#   GOOGLE_CLIENT_ID=mock-client-id GOOGLE_CLIENT_SECRET=mock-oauth-secret-for-e2e \
#   ADMIN_EMAIL=test@example.com SESSION_SECRET=e2e-secret

# Run tests
cd tests && npm install && npx playwright install chromium && BASE_URL=http://localhost:4000 npm test
```

## Test Structure

- `features/` - Gherkin feature files
- `step-definitions/` - TypeScript step implementations
- `support/` - Hooks, world, configuration
- `run-e2e.sh` - Wait-for-app + test runner (Docker)
- `wait-for-app.mjs` - Health check polling script

## Features Tested

- **Authentication**: Login, logout, mock OAuth flow
- **Recipe List**: Browse, search
- **Recipe CRUD**: Create, read, update, delete
- **Import Recipe**: Single and bulk import
- **Recipe Chat**: AI assistant dialog
- **Navigation**: Menu, Import History, API Token
- **Admin**: User Management, Queue Status
- **Language**: English/Chinese toggle

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| BASE_URL | http://localhost:4000 (local) / http://app:4000 (Docker) | App URL for tests |
| HEADED | - | Set to `1` for headed browser (visible) |

## Debugging

```bash
# Run with visible browser (local)
HEADED=1 BASE_URL=http://localhost:4000 npm test

# Run specific feature
npx cucumber-js features/authentication.feature

# Generate HTML report
npm run test:report
```
