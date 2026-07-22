from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import psycopg
from psycopg.rows import dict_row


def _import_job_table() -> str:
    schema = (os.environ.get("IMPORT_SCHEMA") or "public").strip() or "public"
    # Always schema-qualify so Cloud Run Dev (metrobistro) and Prod (public) both work.
    return f'"{schema}"."ImportJob"'


def connect() -> psycopg.Connection:
    url = os.environ["DATABASE_URL"]
    # Prisma URLs may include ?schema=public which libpq/psycopg reject
    if "?" in url:
        base, query = url.split("?", 1)
        keep = []
        for part in query.split("&"):
            key = part.split("=", 1)[0].lower()
            if key in ("schema", "pgbouncer", "connection_limit", "pool_timeout"):
                continue
            if part:
                keep.append(part)
        url = base + (("?" + "&".join(keep)) if keep else "")
    return psycopg.connect(url, row_factory=dict_row)


def claim_next_job(worker_id: str, lease_seconds: int) -> Optional[dict[str, Any]]:
    """Atomically claim oldest pending job, or an expired processing lease."""
    table = _import_job_table()
    now = datetime.now(timezone.utc)
    lease = now + timedelta(seconds=lease_seconds)
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                WITH candidate AS (
                  SELECT id FROM {table}
                  WHERE status = 'pending'
                     OR (status = 'processing' AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" < %s)
                  ORDER BY "createdAt" ASC
                  LIMIT 1
                  FOR UPDATE SKIP LOCKED
                )
                UPDATE {table} j
                SET status = 'processing',
                    step = 'claimed',
                    "claimedAt" = %s,
                    "claimedBy" = %s,
                    "leaseExpiresAt" = %s,
                    "startedAt" = COALESCE(j."startedAt", %s),
                    "updatedAt" = %s,
                    error = NULL
                FROM candidate
                WHERE j.id = candidate.id
                RETURNING j.*
                """,
                (now, now, worker_id, lease, now, now),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None


def claim_job_by_id(job_id: str, worker_id: str, lease_seconds: int) -> Optional[dict[str, Any]]:
    """Claim a specific job (Cloud Run one-shot). Allows pending or expired lease."""
    table = _import_job_table()
    now = datetime.now(timezone.utc)
    lease = now + timedelta(seconds=lease_seconds)
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE {table}
                SET status = 'processing',
                    step = 'claimed',
                    "claimedAt" = %s,
                    "claimedBy" = %s,
                    "leaseExpiresAt" = %s,
                    "startedAt" = COALESCE("startedAt", %s),
                    "updatedAt" = %s,
                    error = NULL
                WHERE id = %s
                  AND (
                    status = 'pending'
                    OR (status = 'processing' AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" < %s)
                  )
                RETURNING *
                """,
                (now, worker_id, lease, now, now, job_id, now),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None


def get_job(job_id: str) -> Optional[dict[str, Any]]:
    table = _import_job_table()
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT * FROM {table} WHERE id = %s", (job_id,))
            row = cur.fetchone()
            return dict(row) if row else None


def update_step(job_id: str, step: str, renew_lease_seconds: Optional[int] = None) -> None:
    table = _import_job_table()
    now = datetime.now(timezone.utc)
    with connect() as conn:
        with conn.cursor() as cur:
            if renew_lease_seconds:
                lease = now + timedelta(seconds=renew_lease_seconds)
                cur.execute(
                    f"""
                    UPDATE {table}
                    SET step = %s, "leaseExpiresAt" = %s, "updatedAt" = %s
                    WHERE id = %s
                    """,
                    (step, lease, now, job_id),
                )
            else:
                cur.execute(
                    f"""
                    UPDATE {table}
                    SET step = %s, "updatedAt" = %s
                    WHERE id = %s
                    """,
                    (step, now, job_id),
                )
            conn.commit()


def complete_job(job_id: str, result: dict[str, Any]) -> None:
    table = _import_job_table()
    now = datetime.now(timezone.utc)
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE {table}
                SET status = 'completed',
                    step = 'completed',
                    result = %s::jsonb,
                    error = NULL,
                    "completedAt" = %s,
                    "leaseExpiresAt" = NULL,
                    "updatedAt" = %s
                WHERE id = %s
                """,
                (json.dumps(result), now, now, job_id),
            )
            conn.commit()


def fail_job(job_id: str, error: str) -> None:
    table = _import_job_table()
    now = datetime.now(timezone.utc)
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE {table}
                SET status = 'failed',
                    step = 'failed',
                    error = %s,
                    "completedAt" = %s,
                    "leaseExpiresAt" = NULL,
                    "updatedAt" = %s
                WHERE id = %s
                """,
                (error[:4000], now, now, job_id),
            )
            conn.commit()