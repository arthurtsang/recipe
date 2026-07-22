"""Extract JSON objects from LLM responses."""
from __future__ import annotations

import json
import re
from typing import Any, Optional


def extract_json_object(text: str) -> Optional[dict[str, Any]]:
    if not text:
        return None
    s = text.strip()
    if s.endswith("---END---"):
        s = s[: -len("---END---")].strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", s, re.I)
    if fence:
        s = fence.group(1).strip()
    start = s.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(s)):
        if s[i] == "{":
            depth += 1
        elif s[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(s[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join(str(x).strip() for x in value if str(x).strip())
    return str(value).strip()
