# Recipe App E2E Tests

BDD tests (Cucumber + Playwright) against the **Vercel preview / Dev Supabase** environment.

## Prerequisites

- Node.js 18+
- Access to the preview app (default: `https://recipe-preview.youramaryllis.com`)
- A saved Playwright storage state for authenticated scenarios (see below)

## Quick Start

```bash
cd tests && npm install && npx playwright install chromium

# Required: target the preview app
export BASE_URL=https://recipe-preview.youramaryllis.com

# Optional: reuse a logged-in browser session for auth-gated scenarios
export STORAGE_STATE=./storage-state.json

npm test
```

### Creating `storage-state.json`

One-time login against preview (real Google OAuth):

```bash
cd tests
BASE_URL=https://recipe-preview.youramaryllis.com node -e "
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ baseURL: process.env.BASE_URL });
  const page = await context.newPage();
  await page.goto('/');
  console.log('Log in with Google in the browser window, then return here...');
  await page.waitForSelector('text=Add Recipe', { timeout: 300000 });
  await context.storageState({ path: 'storage-state.json' });
  await browser.close();
  console.log('Wrote storage-state.json');
})();
"
```

Keep `storage-state.json` out of git (local only).

## Test Structure

- `features/` — Gherkin feature files
- `step-definitions/` — TypeScript step implementations
- `support/` — Hooks, world, configuration

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BASE_URL` | Yes | Preview app URL (e.g. `https://recipe-preview.youramaryllis.com`) |
| `STORAGE_STATE` | For logged-in scenarios | Path to Playwright storage state JSON |
| `HEADED` | No | Set to `1` for a visible browser |

## Debugging

```bash
HEADED=1 BASE_URL=https://recipe-preview.youramaryllis.com STORAGE_STATE=./storage-state.json npm test
npx cucumber-js features/authentication.feature
npm run test:report
```
