#!/usr/bin/env python3
"""Cloud Run Job entry: process a single ImportJob by JOB_ID and exit."""
from __future__ import annotations

import base64
import json
import logging
import os
import socket
import sys
import traceback
from pathlib import Path

from dotenv import load_dotenv

import db
import url_import
import video_import

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("import-job")


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def resolve_job_id() -> str:
    job_id = (os.environ.get("JOB_ID") or "").strip()
    if job_id:
        return job_id
    # Pub/Sub push / Eventarc may pass the message body
    raw = (os.environ.get("PUBSUB_MESSAGE") or os.environ.get("CLOUD_EVENT_DATA") or "").strip()
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, dict) and data.get("jobId"):
                return str(data["jobId"])
            if isinstance(data, dict) and data.get("message", {}).get("data"):
                decoded = base64.b64decode(data["message"]["data"]).decode("utf-8")
                inner = json.loads(decoded)
                return str(inner["jobId"])
        except Exception as e:
            logger.warning("Failed to parse PUBSUB/CLOUD_EVENT payload: %s", e)
    raise SystemExit("JOB_ID (or Pub/Sub message with jobId) is required")


def process_job(job: dict) -> None:
    job_id = job["id"]
    url = job["url"]
    kind = (job.get("kind") or job.get("aiImportKind") or "url").lower()
    lease = env_int("LEASE_SECONDS", 900)
    work_dir = Path(os.environ.get("WORK_DIR", "/tmp/oci-import"))

    def on_step(step: str) -> None:
        logger.info("job %s step=%s", job_id, step)
        db.update_step(job_id, step, renew_lease_seconds=lease)

    if kind == "video":
        result = video_import.import_from_video(url, work_dir, on_step)
    else:
        result = url_import.import_from_url(url, on_step)
    if not result.get("title") and not result.get("ingredients"):
        raise RuntimeError("Extraction returned empty recipe")
    db.complete_job(job_id, result)
    logger.info("job %s completed title=%r", job_id, (result.get("title") or "")[:60])


def main() -> int:
    load_dotenv()
    load_dotenv(Path(__file__).resolve().parent / ".env")
    for req in ("DATABASE_URL", "NVIDIA_API_KEY"):
        if not os.environ.get(req):
            logger.error("Missing required env %s", req)
            return 1

    job_id = resolve_job_id()
    worker_id = os.environ.get("WORKER_ID") or socket.gethostname()
    lease = env_int("LEASE_SECONDS", 900)
    logger.info("One-shot job_id=%s worker=%s", job_id, worker_id)

    job = db.claim_job_by_id(job_id, worker_id, lease)
    if not job:
        existing = db.get_job(job_id)
        if existing and existing.get("status") in ("completed", "failed"):
            logger.info("Job %s already %s; exiting 0", job_id, existing["status"])
            return 0
        logger.error("Could not claim job %s (missing or still leased)", job_id)
        return 2

    try:
        process_job(job)
        return 0
    except Exception as e:
        logger.error("job %s failed: %s", job_id, e)
        logger.debug(traceback.format_exc())
        db.fail_job(job_id, str(e))
        return 1


if __name__ == "__main__":
    sys.exit(main())
