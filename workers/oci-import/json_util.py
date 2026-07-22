"""Extract JSON objects from LLM responses."""
from __future__ import annotations

import json
import re
from typing import Any, Optional


def _loads_lenient(blob: str) -> Optional[dict[str, Any]]:
    try:
        data = json.loads(blob)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        pass
    # Common model mistakes: trailing commas
    fixed = re.sub(r",\s*([}\]])", r"\1", blob)
    try:
        data = json.loads(fixed)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def extract_json_object(text: str) -> Optional[dict[str, Any]]:
    if not text:
        return None
    s = text.strip()
    if s.endswith("---END---"):
        s = s[: -len("---END---")].strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", s, re.I)
    if fence:
        s = fence.group(1).strip()
    direct = _loads_lenient(s)
    if direct is not None:
        return direct
    start = s.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(s)):
        ch = s[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return _loads_lenient(s[start : i + 1])
    return None


def as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join(str(x).strip() for x in value if str(x).strip())
    return str(value).strip()
