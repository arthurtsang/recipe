#!/usr/bin/env python3
"""OCI import poller: claim ImportJob rows from Supabase and process url/video imports."""
from __future__ import annotations

import logging
import os
import socket
import sys
import time
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
logger = logging.getLogger("oci-import")


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def process_job(job: dict) -> None:
    job_id = job["id"]
    url = job["url"]
    kind = (job.get("kind") or job.get("aiImportKind") or "url").lower()
    lease = env_int("LEASE_SECONDS", 900)
    work_dir = Path(os.environ.get("WORK_DIR", "/tmp/oci-import"))

    def on_step(step: str) -> None:
        logger.info("job %s step=%s", job_id, step)
        db.update_step(job_id, step, renew_lease_seconds=lease)

    try:
        if kind == "video":
            result = video_import.import_from_video(url, work_dir, on_step)
        else:
            result = url_import.import_from_url(url, on_step)
        if not result.get("title") and not result.get("ingredients"):
            raise RuntimeError("Extraction returned empty recipe")
        db.complete_job(job_id, result)
        logger.info("job %s completed title=%r", job_id, (result.get("title") or "")[:60])
    except Exception as e:
        logger.error("job %s failed: %s", job_id, e)
        logger.debug(traceback.format_exc())
        db.fail_job(job_id, str(e))


def main() -> int:
    load_dotenv()
    load_dotenv(Path(__file__).resolve().parent / ".env")
    for req in ("DATABASE_URL", "NVIDIA_API_KEY"):
        if not os.environ.get(req):
            logger.error("Missing required env %s", req)
            return 1

    worker_id = os.environ.get("WORKER_ID") or socket.gethostname()
    lease = env_int("LEASE_SECONDS", 900)
    idle = env_int("POLL_IDLE_SECONDS", 12)
    logger.info("Starting OCI import worker id=%s lease=%ss idle=%ss", worker_id, lease, idle)

    while True:
        try:
            job = db.claim_next_job(worker_id, lease)
            if not job:
                time.sleep(idle)
                continue
            logger.info(
                "Claimed job %s kind=%s url=%s",
                job["id"],
                job.get("kind"),
                (job.get("url") or "")[:80],
            )
            process_job(job)
            # brief pause so RAM can settle between Playwright/yt-dlp jobs
            time.sleep(2)
        except KeyboardInterrupt:
            logger.info("Shutting down")
            return 0
        except Exception:
            logger.exception("Loop error")
            time.sleep(idle)

    return 0


if __name__ == "__main__":
    sys.exit(main())
