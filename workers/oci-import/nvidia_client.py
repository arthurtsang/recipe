from __future__ import annotations

import os
import httpx

NVIDIA_BASE = "https://integrate.api.nvidia.com/v1"


def chat(prompt: str, *, temperature: float = 0.3, max_tokens: int = 2048) -> str:
    key = os.environ["NVIDIA_API_KEY"]
    model = os.environ.get("NVIDIA_MODEL", "meta/llama-3.1-8b-instruct")
    with httpx.Client(timeout=120.0) as client:
        res = client.post(
            f"{NVIDIA_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        res.raise_for_status()
        data = res.json()
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content")
    if not content:
        raise RuntimeError("NVIDIA returned empty content")
    return content.strip()


def extract_recipe_from_page_text(visible_text: str) -> dict:
    from json_util import as_text, extract_json_object

    prompt = (
        "Extract recipe information from this web page text. "
        "Return ONLY a JSON object:\n"
        "{\n"
        '  "title": "Recipe title",\n'
        '  "description": "Brief description",\n'
        '  "ingredients": "markdown or newline-separated list",\n'
        '  "instructions": "numbered steps",\n'
        '  "cookTime": "minutes as string or Pending...",\n'
        '  "difficulty": "Easy|Medium|Advanced|Undetermined",\n'
        '  "imageUrl": "best image url or empty"\n'
        "}\n\n"
        f"Page text:\n{visible_text[:8000]}\n\nJSON:"
    )
    raw = chat(prompt, max_tokens=2048)
    data = extract_json_object(raw) or {}
    return {
        "title": as_text(data.get("title")) or "Untitled",
        "description": as_text(data.get("description")),
        "ingredients": as_text(data.get("ingredients")),
        "instructions": as_text(data.get("instructions")),
        "cookTime": as_text(data.get("cookTime")) or "Pending...",
        "difficulty": as_text(data.get("difficulty")) or "Undetermined",
        "imageUrl": as_text(data.get("imageUrl")),
        "tags": data.get("tags") if isinstance(data.get("tags"), list) else [],
        "timeReasoning": "",
        "difficultyReasoning": "",
    }


def extract_recipe_from_video(
    title: str, description: str, transcript: str, comments: str = ""
) -> dict:
    from json_util import as_text, extract_json_object

    body = (
        f"Title: {title}\n\n"
        f"Description:\n{description or '(none)'}\n\n"
        f"Transcript:\n{transcript or '(none)'}\n\n"
    )
    if comments:
        body += f"Comments:\n{comments}\n\n"
    prompt = (
        "You are a recipe data extractor. From the video content below, return ONLY JSON:\n"
        "{\n"
        '  "title": "Recipe title",\n'
        '  "description": "Short description (max 220 words)",\n'
        '  "ingredients": "markdown or newline-separated list",\n'
        '  "instructions": "Numbered steps, one per line",\n'
        '  "cookTime": "e.g. 30 or Pending...",\n'
        '  "difficulty": "Easy|Medium|Advanced|Undetermined"\n'
        "}\n\n"
        f"{body}JSON:"
    )
    raw = chat(prompt, max_tokens=2048)
    data = extract_json_object(raw) or {}
    return {
        "title": as_text(data.get("title")) or title or "Untitled",
        "description": as_text(data.get("description"))[:1200],
        "ingredients": as_text(data.get("ingredients")),
        "instructions": as_text(data.get("instructions")),
        "cookTime": as_text(data.get("cookTime")) or "Pending...",
        "difficulty": as_text(data.get("difficulty")) or "Undetermined",
        "imageUrl": "",
        "tags": [],
        "timeReasoning": "",
        "difficultyReasoning": "",
    }
