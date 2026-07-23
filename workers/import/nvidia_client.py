from __future__ import annotations

import logging
import os
import re

import httpx

NVIDIA_BASE = "https://integrate.api.nvidia.com/v1"
logger = logging.getLogger(__name__)

DIFFICULTIES = ("Easy", "Medium", "Advanced")


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


def _is_generic_title(title: str) -> bool:
    t = (title or "").strip()
    if not t:
        return True
    if re.match(r"^(Video by|Untitled|Instagram)\b", t, re.I):
        return True
    if re.search(r"\bVideo by\s+\S+", t, re.I):
        return True
    return False


def _fix_generic_title(video_title: str, llm_title: str, llm_description: str) -> tuple[str, str]:
    """Prefer a real recipe title over generic Instagram/YouTube titles like 'Video by X'."""
    title = (llm_title or "").strip()
    desc = (llm_description or "").strip()
    if not _is_generic_title(title):
        return title or video_title or "Untitled", desc

    if desc and len(desc) <= 120 and "\n" not in desc and not description_looks_like_dump(desc, title):
        logger.info("Title from short description: %r -> %r", title, desc[:60])
        return desc, ""

    if desc:
        first_line = desc.split("\n")[0].strip()
        if "." in first_line:
            candidate = first_line.split(".")[0].strip()
        else:
            candidate = (
                first_line[:80].rsplit(" ", 1)[0] if len(first_line) > 80 else first_line
            )
        if candidate and len(candidate) > 2 and not _is_generic_title(candidate):
            logger.info("Title from description first line: %r -> %r", title, candidate[:60])
            return candidate, desc

    fallback = (video_title or "").strip()
    if fallback and not _is_generic_title(fallback):
        return fallback, desc
    return title or fallback or "Untitled", desc


def description_looks_like_dump(description: str, title: str | None = None) -> bool:
    """True if description is ingredients/instructions dump, not a short blurb."""
    if not description or not description.strip():
        return True
    d = description.strip()
    dl = d.lower()
    if title and title.strip():
        t = title.strip()
        tl = t.lower()
        if dl == tl or dl == f"recipe: {tl}":
            return True
        if len(d) <= len(t) + 25 and tl in dl:
            return True

    # Ingredient / portion dumps (egg tart style)
    measure_hits = len(
        re.findall(
            r"\b(\d+\s*/\s*\d+|\d+)\s*(cup|cups|tbsp|tsp|tablespoon|teaspoon|egg|eggs|oz|g|ml|lb)\b",
            dl,
        )
    )
    if measure_hits >= 3 and len(d) > 80:
        return True
    if dl.startswith("ingredients:") or dl.startswith("full portion") or "one-third portion" in dl:
        return True
    if d.count("\n") >= 4 and measure_hits >= 2:
        return True
    if len(d) > 400 and re.search(r"\b1[.)]\s", d) and re.search(r"\b2[.)]\s", d):
        return True
    return False


def _truncate_description(description: str, max_chars: int = 220) -> str:
    if not description or len(description) <= max_chars:
        return description
    for end in (". ", "! ", "? "):
        idx = description.find(end)
        if idx >= 30:
            candidate = description[: idx + 1].strip()
            if len(candidate) <= max_chars:
                return candidate
    return description[: max_chars - 3].rsplit(" ", 1)[0] + "..."


def _normalize_cook_time(raw: str) -> str:
    text = (raw or "").strip()
    if not text or text.lower() in ("pending...", "pending", "unknown", "n/a"):
        return ""
    m = re.search(r"(\d{1,3})", text.replace(",", ""))
    if not m:
        return ""
    minutes = int(m.group(1))
    if minutes < 1 or minutes > 480:
        return ""
    return str(minutes)


def _normalize_difficulty(raw: str) -> str:
    text = (raw or "").strip()
    for level in DIFFICULTIES:
        if text.lower() == level.lower():
            return level
    return ""


def _shared_extract_rules() -> str:
    return (
        "Return ONLY a JSON object with these keys:\n"
        "{\n"
        '  "title": "Specific dish name (never \'Video by …\', \'Untitled\', or account name)",\n'
        '  "description": "1-2 short appetizing sentences about the dish (max ~220 chars). '
        "NOT ingredients, NOT instructions, NOT portion lists\",\n"
        '  "ingredients": "markdown or newline-separated list",\n'
        '  "instructions": "numbered steps",\n'
        '  "cookTime": "total minutes as a number string only, e.g. \\"30\\"",\n'
        '  "difficulty": "Easy|Medium|Advanced",\n'
        '  "timeReasoning": "brief why that cook time",\n'
        '  "difficultyReasoning": "brief why that difficulty",\n'
        '  "imageUrl": "best image url or empty"\n'
        "}\n"
        "Rules:\n"
        "- Infer a real recipe title from the content if the source title is generic "
        "(e.g. Instagram 'Video by username').\n"
        "- Description must sell the dish; never paste the ingredient list into description.\n"
        "- cookTime: total prep+cook+wait in minutes (integer string). Do not use Pending...\n"
        "- difficulty: Easy, Medium, or Advanced only (not Undetermined).\n"
        "- Always fill timeReasoning and difficultyReasoning with short explanations.\n"
    )


def _polish_description(title: str, ingredients: str, instructions: str) -> str:
    from json_util import as_text, extract_json_object

    prompt = (
        "You are an expert food writer. Write ONE short appetizing description "
        "(1-2 sentences, under 220 characters) for this recipe. "
        "Do NOT list ingredients or steps.\n"
        'Return ONLY JSON: {"desc": "..."}\n\n'
        f"Title: {title}\n\nIngredients:\n{ingredients[:1500]}\n\n"
        f"Instructions:\n{instructions[:1500]}\n\nJSON:"
    )
    raw = chat(prompt, temperature=0.5, max_tokens=256)
    data = extract_json_object(raw) or {}
    desc = as_text(data.get("desc")) or as_text(raw)
    desc = re.sub(r"^[*`\"']+|[*`\"']+$", "", desc).strip()
    if not desc or description_looks_like_dump(desc, title):
        return f"A classic {title} recipe." if title else ""
    return _truncate_description(desc)


def _finalize_recipe(
    data: dict,
    *,
    source_title: str = "",
    allow_image: bool = True,
    page_cook_time: str = "",
) -> dict:
    from json_util import as_text

    title = as_text(data.get("title"))
    description = as_text(data.get("description"))
    ingredients = as_text(data.get("ingredients"))
    instructions = as_text(data.get("instructions"))

    title, description = _fix_generic_title(source_title, title, description)

    if description_looks_like_dump(description, title):
        logger.info("Description looks like a dump; regenerating for title=%r", title[:60])
        description = _polish_description(title, ingredients, instructions)
    else:
        description = _truncate_description(description)

    if _is_generic_title(title) and ingredients:
        # Last resort: ask model for a dish name only
        from json_util import extract_json_object

        raw = chat(
            "Infer the specific dish name for this recipe. "
            'Return ONLY JSON: {"title": "..."}\n\n'
            f"Current title: {title}\nDescription: {description}\n"
            f"Ingredients:\n{ingredients[:1200]}\nJSON:",
            temperature=0.2,
            max_tokens=128,
        )
        inferred = as_text((extract_json_object(raw) or {}).get("title"))
        if inferred and not _is_generic_title(inferred):
            title = inferred

    cook_time = _normalize_cook_time(as_text(data.get("cookTime")))
    time_reasoning = as_text(data.get("timeReasoning"))
    page_time = _normalize_cook_time(page_cook_time)
    if page_time and (not cook_time or cook_time == "30"):
        cook_time = page_time
        time_reasoning = "Extracted from page text / structured data."
    difficulty = _normalize_difficulty(as_text(data.get("difficulty")))
    difficulty_reasoning = as_text(data.get("difficultyReasoning"))

    # If model omitted metadata, fill sensible defaults with reasoning
    if not cook_time:
        cook_time = "30"
        time_reasoning = time_reasoning or "Defaulted to 30 minutes when source did not state total time."
    if not difficulty:
        difficulty = "Medium"
        difficulty_reasoning = (
            difficulty_reasoning
            or "Defaulted to Medium when source did not state difficulty."
        )

    out = {
        "title": title or source_title or "Untitled",
        "description": description,
        "ingredients": ingredients,
        "instructions": instructions,
        "cookTime": cook_time,
        "difficulty": difficulty,
        "imageUrl": as_text(data.get("imageUrl")) if allow_image else "",
        "tags": data.get("tags") if isinstance(data.get("tags"), list) else [],
        "timeReasoning": time_reasoning,
        "difficultyReasoning": difficulty_reasoning,
    }
    return out


def _number_instructions(instructions: str) -> str:
    text = (instructions or "").strip()
    if not text:
        return text
    if re.search(r"^\s*\d+[.)]\s", text, re.M):
        return text
    # One blob → sentence steps (ai_service _instructions_to_numbered_steps)
    parts = re.split(r"(?<=[.!?])\s+", text)
    parts = [p.strip() for p in parts if p.strip()]
    if len(parts) < 2:
        return text
    return "\n".join(f"{i}. {p}" for i, p in enumerate(parts, 1))


def extract_recipe_from_page_text(
    visible_text: str,
    *,
    page_cook_time: str = "",
    known_image_urls: list[str] | None = None,
) -> dict:
    from json_util import extract_json_object

    hint = ""
    if page_cook_time:
        hint += f"Page states total time around {page_cook_time} minutes — use that for cookTime unless clearly wrong.\n"
    prompt = (
        "Extract recipe information from this web page text.\n"
        f"{_shared_extract_rules()}\n"
        f"{hint}"
        f"Page text:\n{visible_text[:8000]}\n\nJSON:"
    )
    raw = chat(prompt, max_tokens=2500)
    data = extract_json_object(raw) or {}
    result = _finalize_recipe(data, allow_image=True, page_cook_time=page_cook_time)
    result["instructions"] = _number_instructions(result.get("instructions") or "")
    # Drop hallucinated image URLs not found on the page
    urls = known_image_urls or []
    img = (result.get("imageUrl") or "").strip()
    if img and urls and img not in urls and not any(img.split("?")[0] == u.split("?")[0] for u in urls):
        result["imageUrl"] = ""
    return result


def extract_recipe_from_video(
    title: str, description: str, transcript: str, comments: str = ""
) -> dict:
    from json_util import extract_json_object

    body = (
        f"Source title: {title}\n\n"
        f"Source description:\n{description or '(none)'}\n\n"
        f"Transcript:\n{transcript or '(none)'}\n\n"
    )
    if comments:
        body += (
            "Uploader/same-user comments (often contain the real recipe — prefer these):\n"
            f"{comments}\n\n"
        )
    prompt = (
        "You are a recipe data extractor for cooking videos (YouTube/Instagram/etc).\n"
        f"{_shared_extract_rules()}\n"
        "If the source title is 'Video by …' or similarly generic, invent a specific dish title "
        "from the transcript/description/comments.\n"
        "When comments include ingredients/steps, treat them as primary recipe source.\n\n"
        f"{body}JSON:"
    )
    raw = chat(prompt, max_tokens=2500)
    data = extract_json_object(raw) or {}
    result = _finalize_recipe(data, source_title=title, allow_image=False)
    result["instructions"] = _number_instructions(result.get("instructions") or "")
    return result
