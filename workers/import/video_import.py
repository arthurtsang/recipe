from __future__ import annotations

import json
import logging
import os
import re
import subprocess
from pathlib import Path
from typing import Callable, Optional, Tuple

import groq_client
import nvidia_client

logger = logging.getLogger(__name__)


def _srt_to_text(srt_path: Path) -> str:
    lines = []
    for line in srt_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.isdigit() or line == "WEBVTT":
            continue
        if re.match(r"^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*", line):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _comments_from_same_user(comments: list, max_count: int = 2) -> str:
    """Prefer uploader comments (ai_service _comments_from_same_user)."""
    if not comments or max_count <= 0:
        return ""
    uploader = [c for c in comments if c.get("author_is_uploader")][:max_count]
    chosen = uploader
    if len(chosen) < max_count and comments:
        author_id = (chosen[0].get("author_id") if chosen else comments[0].get("author_id"))
        same = [c for c in comments if c.get("author_id") == author_id][:max_count]
        chosen = same or comments[:max_count]
    lines = []
    for c in chosen:
        text = (c.get("text") or c.get("content") or "").strip()
        author = (c.get("author") or "").strip()
        if text:
            lines.append(f"{author}: {text}" if author else text)
    return "\n".join(lines)


def _download(url: str, work_dir: Path) -> Tuple[str, str, str, Optional[Path], str, str]:
    """
    Returns title, description, transcript, audio_path, thumbnail_url, comments_text.
    Prefers subtitles; downloads audio when no subtitle.
    """
    work_dir.mkdir(parents=True, exist_ok=True)
    cookies = os.environ.get("YTDLP_COOKIES", "").strip()
    cmd = [
        "yt-dlp",
        "--write-info-json",
        "--write-auto-sub",
        "--write-sub",
        "--write-comments",
        "--extractor-args",
        "youtube:max-comments=50",
        "--sub-langs",
        "en.*,zh.*,es.*,en,zh,es",
        "--skip-download",
        "--convert-subs",
        "srt",
        "-o",
        str(work_dir / "%(id)s.%(ext)s"),
        url,
    ]
    if cookies and Path(cookies).is_file():
        cmd[1:1] = ["--cookies", cookies]

    logger.info("yt-dlp metadata/subs: %s", url)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        logger.warning("yt-dlp skip-download stderr: %s", (result.stderr or "")[:800])

    info_files = list(work_dir.glob("*.info.json"))
    title = ""
    description = ""
    thumb = ""
    comments_text = ""
    if info_files:
        info = json.loads(info_files[0].read_text(encoding="utf-8"))
        title = info.get("title") or ""
        description = info.get("description") or ""
        thumb = info.get("thumbnail") or ""
        comments_text = _comments_from_same_user(info.get("comments") or [])

    transcript = ""
    for srt in work_dir.glob("*.srt"):
        transcript = _srt_to_text(srt)
        if transcript:
            break

    audio_path: Optional[Path] = None
    if not transcript:
        # Need audio for Groq Whisper — some platforms require cookies from cloud IPs
        audio_cmd = [
            "yt-dlp",
            "-x",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "5",
            "-o",
            str(work_dir / "audio.%(ext)s"),
            url,
        ]
        if cookies and Path(cookies).is_file():
            audio_cmd[1:1] = ["--cookies", cookies]
        logger.info("yt-dlp audio download: %s", url)
        ar = subprocess.run(audio_cmd, capture_output=True, text=True, timeout=600)
        if ar.returncode != 0:
            err = (ar.stderr or ar.stdout or "yt-dlp audio failed")[:1500]
            raise RuntimeError(
                "Failed to get captions or audio. For YouTube from cloud IPs, "
                f"export cookies to YTDLP_COOKIES. Detail: {err}"
            )
        candidates = list(work_dir.glob("audio.*"))
        if not candidates:
            raise RuntimeError("yt-dlp did not produce an audio file")
        audio_path = candidates[0]
        # Normalize to wav 16k mono for Groq
        wav = work_dir / "for-groq.wav"
        ff = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(audio_path),
                "-ac",
                "1",
                "-ar",
                "16000",
                str(wav),
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if ff.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {(ff.stderr or '')[:500]}")
        audio_path = wav

    return title, description, transcript, audio_path, thumb, comments_text


def import_from_video(url: str, work_dir: Path, on_step: Callable[[str], None]) -> dict:
    on_step("fetching")
    job_dir = work_dir / re.sub(r"[^a-zA-Z0-9_-]+", "_", url)[:80]
    if job_dir.exists():
        for p in job_dir.glob("*"):
            try:
                p.unlink()
            except OSError:
                pass
    job_dir.mkdir(parents=True, exist_ok=True)

    title, description, transcript, audio_path, thumb, comments = _download(url, job_dir)

    if not transcript and audio_path:
        on_step("transcribing")
        transcript = groq_client.transcribe_audio(audio_path)
        if not transcript:
            raise RuntimeError("Groq Whisper returned empty transcript")

    if not transcript and not description and not comments:
        raise RuntimeError(
            "No captions, transcript, description, or comments available. "
            "Set YTDLP_COOKIES for YouTube bot checks, or use a video with captions."
        )

    on_step("extracting")
    result = nvidia_client.extract_recipe_from_video(
        title, description, transcript, comments=comments
    )
    if thumb and not result.get("imageUrl"):
        result["imageUrl"] = thumb
    return result
