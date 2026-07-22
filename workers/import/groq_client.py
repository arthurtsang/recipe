from __future__ import annotations

import os
from pathlib import Path

import httpx

GROQ_BASE = "https://api.groq.com/openai/v1"


def transcribe_audio(audio_path: Path, language: str | None = None) -> str:
    """Transcribe with Groq Whisper. Raises if GROQ_API_KEY missing."""
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise RuntimeError("GROQ_API_KEY is not set; cannot transcribe without captions")

    model = os.environ.get("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo")
    data = {"model": model, "response_format": "text"}
    if language:
        data["language"] = language

    with audio_path.open("rb") as f:
        files = {"file": (audio_path.name, f, "application/octet-stream")}
        with httpx.Client(timeout=300.0) as client:
            res = client.post(
                f"{GROQ_BASE}/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                data=data,
                files=files,
            )
            res.raise_for_status()
            # response_format=text returns plain text; json returns {"text": ...}
            ctype = res.headers.get("content-type", "")
            if "application/json" in ctype:
                return (res.json().get("text") or "").strip()
            return res.text.strip()
