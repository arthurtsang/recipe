# AI service cutover (Vercel + NVIDIA + GCP Cloud Run Jobs)

## What changed

| Before | After |
|--------|--------|
| Local FastAPI `ai_service` (Zephyr GPU) | Removed from runtime path |
| `AI_SERVICE_URL` for analyze/chat/category/import | NVIDIA Build from Vercel; import via **GCP Cloud Run Job** |
| In-memory AI job IDs | Supabase `ImportJob` + Pub/Sub kickoff + claim/lease `step` |
| Always-on worker | Event-driven: publish `{ jobId, target }` → one-shot Cloud Run Job |

OCI and Playwright are **not** part of this path.

## Architecture

```
Vercel API ──INSERT──► Supabase ImportJob (queued)
     │
     └──publish {jobId, target}──► Pub/Sub metrobistro-import-jobs
                              │
                              ▼
              Cloud Run Job (prod → public | preview → metrobistro)
                              │
                              ▼
                     Supabase step / result updated
```

Auth for publish: **Vercel OIDC → GCP Workload Identity Federation** (no SA JSON keys). See [Vercel GCP OIDC](https://vercel.com/docs/oidc/gcp). Leave JWK empty; GCP fetches Vercel JWKS from the issuer.

Infra source of truth: [`infra/gcp-import/`](../infra/gcp-import/) (Terraform).

## Databases

| Environment | Supabase | Postgres schema | Cloud Run Job |
|-------------|----------|-----------------|---------------|
| Production | Prod project | `public` (existing tables; do not drop) | `metrobistro-import` |
| Preview / non-prod | Dev project | `metrobistro` | `metrobistro-import-dev` |

Vercel: set `DATABASE_URL` / `DIRECT_DATABASE_URL` per environment. Preview must **not** point at prod. Never run `migrate:deploy` against prod from Preview.

## Vercel environment

Shared (Production + Preview):

```bash
NVIDIA_API_KEY=...
# GCP WIF (no secrets file)
GCP_PROJECT_ID=...
GCP_PROJECT_NUMBER=...
GCP_SERVICE_ACCOUNT_EMAIL=...
GCP_WORKLOAD_IDENTITY_POOL_ID=vercel
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=vercel
GCP_PUBSUB_TOPIC=metrobistro-import-jobs
# optional: GCP_AUDIENCE=//iam.googleapis.com/projects/.../providers/vercel
```

Per environment:

- **Production:** `DATABASE_URL` → prod pooler (`?schema=public` or omit); `BASE_URL` → prod domain
- **Preview:** `DATABASE_URL` → Dev pooler with `?schema=metrobistro`. Set a **stable** Preview host via `BASE_URL` or `PREVIEW_BASE_URL` (e.g. `https://recipe-preview.youramaryllis.com`) and add **one** Google redirect URI:
  `https://recipe-preview.youramaryllis.com/auth/google/callback`
  Do not point Preview `BASE_URL` at production. Avoid relying on per-branch `*.vercel.app` URLs for OAuth (Google needs an exact URI per host).

## GCP

```bash
cd infra/gcp-import
cp terraform.tfvars.example terraform.tfvars
terraform apply
# Secret values (never commit):
# metrobistro-database-url      → prod
# metrobistro-database-url-dev  → Dev (no schema query param; Job sets IMPORT_SCHEMA=metrobistro)
# metrobistro-nvidia-api-key / metrobistro-groq-api-key
./scripts/build-push.sh
```

Budget: **$10/month** on this project + kill-switch unlinking **this project only** at 100%.

## Worker package

[`workers/oci-import/`](../workers/oci-import/) (folder name historical only):

- `job_main.py` — Cloud Run Job entry (one `JOB_ID`)
- `worker.py` — local poll loop only
- URL path: **httpx + BeautifulSoup** (no Playwright)
- Quality helpers: `nvidia_client.py` (title/desc/cook-time in one NVIDIA call), `page_signals.py` (JSON-LD, cook-time regex, image ranking)

## Carry-forward from old `ai_service` (Zephyr 4-bit)

The old service spent most of its complexity fighting a tiny quantized model (prompt echo, dump descriptions, broken JSON). With NVIDIA Build we keep **one extract call** plus **deterministic safety nets** — not the full 3-call LLM ladder.

| Old lesson | Status |
|------------|--------|
| Generic title fix (`Video by …`) | **Ported** (`nvidia_client`) |
| Description dump detector + rewrite | **Ported** |
| Cook time + difficulty + reasonings | **Ported into extract** (async analysis = fallback only) |
| JSON-LD / structured Recipe | **Ported** (`page_signals`) |
| Cook-time regex from page text | **Ported** |
| Image: og/twitter + size heuristics; don’t trust hallucinated URLs | **Ported** |
| Uploader comments as recipe source | **Ported** (`video_import`) |
| Numbered instruction post-process | **Ported** |
| Trailing-comma / fence JSON parse | **Ported** (lightweight) |
| Split into 3 LLM calls | **Dropped** (stronger model; keep dump polish as optional 2nd call) |
| Playwright JS render | **Dropped** (cost/complexity; revisit only for specific sites) |
| LLM JSON-repair second generate | **Deferred** (add if parse failures show up) |
| EN/ZH/ES output language control | **Not in old service either** — still open |
| Playlist / Watch Later bulk | **Not yet** (see `VIDEO_IMPORT_PLAN.md`) |

## Local / e2e

`mock_ai_service` remains for Cucumber e2e. Production path no longer calls it.
