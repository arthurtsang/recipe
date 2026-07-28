# Recipe App E2E / BDD Tests

Cucumber tests against **Vercel Preview** ([recipe-preview.youramaryllis.com](https://recipe-preview.youramaryllis.com)) and **Dev Supabase**.

## Default: API tests (`@api`)

No browser, no Google OAuth. Uses the admin user's **API token** (Bearer auth).

```bash
cd tests && npm install

cp env.example .env
# Edit .env: BASE_URL + API_TOKEN

npm test                          # all @api features
npm run test:health               # one feature at a time
npm run test:import-url
```

### Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `BASE_URL` | Yes | Preview URL (`https://recipe-preview.youramaryllis.com`) |
| `API_TOKEN` | Yes for `@api` | 64-char hex from **Manage API Token** (admin user) |
| `BDD_CLEANUP` | No | Set `0` to keep test recipes/jobs after run |
| `CUCUMBER_TAGS` | No | Override tag filter (default `@api`) |

Preview Wasabi uploads use prefix **`dev/recipes`** (`WASABI_KEY_PREFIX` on Vercel Preview only). Production stays `recipes`.

`tests/.env` always wins for `BASE_URL` and `API_TOKEN` (so a shell `BASE_URL` pointing at production does not affect API tests).

## API feature coverage

| Feature file | What it tests |
|--------------|---------------|
| `api_health.feature` | `GET /api/health` |
| `api_recipe_list.feature` | List + search |
| `api_recipe_crud.feature` | Create, update, new version, delete |
| `api_import_url.feature` | Import myrecipe.kitchen URL + save |
| `api_import_video.feature` | Instagram reel (video kind) |
| `api_reimport.feature` | Same URL → new version |
| `api_ratings.feature` | Rate recipe |
| `api_upload.feature` | Image upload to Wasabi |

## Legacy browser tests (`@browser @legacy`)

Require `STORAGE_STATE` from a manual Google login. Not run by default.

```bash
CUCUMBER_TAGS='@browser' STORAGE_STATE=./storage-state.json npm test
```

## Branch / deploy workflow

Work on a feature branch → push → Vercel **Preview** deploys automatically. Production is unchanged.

```bash
git checkout -b feature/my-change
git push -u origin feature/my-change
```
