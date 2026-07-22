# Import worker (Cloud Run Job + local poller)

Processes Supabase `ImportJob` rows: URL/video import with NVIDIA + Groq.

**Deploy:** GCP Cloud Run Jobs via Pub/Sub from Vercel. See [`docs/AI_SERVICE_MIGRATION.md`](../../docs/AI_SERVICE_MIGRATION.md) and [`infra/gcp-import/`](../../infra/gcp-import/).

| Job | DB | `IMPORT_SCHEMA` |
|-----|----|-----------------|
| `metrobistro-import` | Prod secret | `public` |
| `metrobistro-import-dev` | Dev secret | `metrobistro` |

**Local poller:** `python worker.py` (`.env` with `DATABASE_URL`, `NVIDIA_API_KEY`, optional `GROQ_API_KEY`).

**One-shot:** `JOB_ID=<uuid> IMPORT_SCHEMA=metrobistro python job_main.py`

URL import uses **httpx + BeautifulSoup** (no Playwright). Video uses yt-dlp + optional Groq Whisper.

Folder name `oci-import` is historical; OCI is not used.
