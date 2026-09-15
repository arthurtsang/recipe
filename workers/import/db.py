from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import psycopg
from psycopg.rows import dict_row


def _import_job_table() -> str:
    schema = (os.environ.get("IMPORT_SCHEMA") or "public").strip() or "public"
    # Always schema-qualify so Cloud Run Dev (legacy schema name metrobistro) and Prod (public) both work.
    return f'"{schema}"."ImportJob"'


def connect() -> psycopg.Connection:
    url = os.environ["DATABASE_URL"]
    # Prisma URLs may include ?schema=public which libpq/psycopg reject
