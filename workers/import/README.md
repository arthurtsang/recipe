# Import worker (Cloud Run Job)

Processes Supabase `ImportJob` rows: URL/video import with NVIDIA + Groq.

**Deploy:** GCP Cloud Run Jobs via Pub/Sub from Vercel. See [`docs/AI_SERVICE_MIGRATION.md`](../../docs/AI_SERVICE_MIGRATION.md) and [`infra/gcp-import/`](../../infra/gcp-import/).

| Job | DB | `IMPORT_SCHEMA` |
|-----|----|-----------------|
| `metrobistro-import` | Prod secret | `public` |
| `metrobistro-import-dev` | Dev secret | `metrobistro` |

**Build/push image:**

```bash
./infra/gcp-import/scripts/build-push.sh
# then: gcloud run jobs update metrobistro-import-dev --image=... --region=us-central1
```

**One-shot (local debug):** `JOB_ID=<uuid> IMPORT_SCHEMA=metrobistro python job_main.py`

URL import uses **httpx + BeautifulSoup** (no Playwright). Video uses yt-dlp + optional Groq Whisper.
