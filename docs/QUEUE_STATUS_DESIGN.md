# Queue Status (Admin) – Design Summary

Admin-only dialog to view and manage background queues: **Import Queue** (URL → recipe) and **Recipe Analysis** (AI difficulty/cook time). Backend sends **one** import or one analysis request to the AI server at a time.

---

## Access

- **Who:** Admin users only (`ADMIN_EMAIL`).
- **Where:** User menu (avatar) → **Queue Status** (with Queue icon).
- **API:** `GET /api/admin/queues` (auth + admin required).

---

## Tabs & Features

### 1. Import Queue

- **Processing:** Count + table of jobs currently being processed (URL, started time). At most **1** job is processed at a time.
- **Pending:** Count + table of queued import jobs (URL, created time). First 50 shown; caption if more.
- **Scheduler (no triggers):**
  - Every **2 minutes** the backend runs a tick: ensure at most one processing, reset stuck jobs, then if **no** job is processing it starts one (POST to AI, save jobId, set status processing). It does **not** wait for user actions or other triggers.
  - Every **30 seconds** the backend calls the AI **status API** (GET import-recipe/status/{jobId}). If the current processing job is completed or failed, it updates the DB and **immediately** starts the next pending job (refill). So when an import is done, the next one is sent right away.

### 2. Recipe Analysis

- **Pending:** Count + table of recipes that need AI analysis (no `estimatedTime`/`difficulty` yet). First 50 shown.
- **Scheduler:** Backend runs the analysis queue every **5 minutes**; it picks **1** recipe, calls the AI analyze endpoint, then on the next run picks the next.

### 3. Recent Failure

- Table of last **20** failed import jobs: URL, error snippet, completed time.
- **Retry** per row and **Retry all failed** button. Retry resets job to pending and triggers processing (still 1 at a time).

### 4. Recent Success

- **Last 20 completed imports:** URL, completed time.
- **Last 20 recipe analyses:** Title, updated time.

---

## Actions

- **Refresh:** Re-fetch queue data from `GET /api/admin/queues`.
- **Close:** Close the dialog.
- **Retry** (failure tab): `POST /api/admin/import-jobs/:id/retry`.
- **Retry all failed:** `POST /api/admin/import-jobs/retry-all`.

---

## Concurrency (1 at a time)

- **Import:** Only **1** import job is sent to the AI server at a time. When it completes (or fails), the scheduler picks the next pending job on the next run (or refill).
- **Recipe analysis:** Only **1** recipe is sent for analysis at a time per 5‑minute run.
- This avoids overloading the AI server while still draining the queues.
