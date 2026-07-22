"""Deterministic page signals carried forward from ai_service (pre-LLM helpers)."""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_SKIP_IMAGE = re.compile(
    r"\b(logo|icon|sprite|avatar|headshot|emoji|badge|pixel|1x1|tracking)\b",
    re.I,
)


def extract_json_ld_recipe(soup: BeautifulSoup) -> dict[str, Any]:
    """Pull schema.org Recipe fields from application/ld+json when present."""
    out: dict[str, Any] = {}
    for tag in soup.find_all("script", attrs={"type": re.compile(r"ld\+json", re.I)}):
        raw = tag.string or tag.get_text() or ""
        raw = raw.strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        recipe = _find_recipe_node(data)
        if not recipe:
            continue
        title = _as_str(recipe.get("name"))
        description = _as_str(recipe.get("description"))
        ingredients = recipe.get("recipeIngredient") or recipe.get("ingredients")
        instructions = _instructions_from_jsonld(recipe.get("recipeInstructions"))
        image = _image_from_jsonld(recipe.get("image"))
        total = recipe.get("totalTime") or recipe.get("cookTime") or recipe.get("prepTime")
        cook_minutes = _iso8601_duration_minutes(total) if total else None
        if title:
            out["title"] = title
        if description:
            out["description"] = description
        if ingredients:
            if isinstance(ingredients, list):
                out["ingredients"] = "\n".join(str(x).strip() for x in ingredients if str(x).strip())
            else:
                out["ingredients"] = _as_str(ingredients)
        if instructions:
            out["instructions"] = instructions
        if image:
            out["imageUrl"] = image
        if cook_minutes:
            out["cookTime"] = str(cook_minutes)
        if out:
            logger.info("JSON-LD Recipe found keys=%s", sorted(out.keys()))
            break
    return out


def extract_cook_time_from_text(text: str) -> Optional[str]:
    """Regex cook-time from page text (ai_service extract_cook_time_from_text)."""
    if not text:
        return None
    patterns = [
        r"Total Time:\s*(\d+)\s*(?:hrs?|hours?)\s*(\d+)\s*(?:mins?|minutes?)",
        r"Total Time:\s*(\d+)\s*(?:mins?|minutes?)",
        r"Prep Time:\s*(\d+)\s*(?:mins?|minutes?).{0,40}Cook Time:\s*(\d+)\s*(?:hrs?|hours?)\s*(\d+)\s*(?:mins?|minutes?)",
        r"Prep Time:\s*(\d+)\s*(?:mins?|minutes?).{0,40}Cook Time:\s*(\d+)\s*(?:mins?|minutes?)",
        r"Cook Time:\s*(\d+)\s*(?:hrs?|hours?)\s*(\d+)\s*(?:mins?|minutes?)",
        r"Cook Time:\s*(\d+)\s*(?:mins?|minutes?)",
        r"\b(\d+)\s*(?:hrs?|hours?)\s*(\d+)\s*(?:mins?|minutes?)\s*Total\b",
        r"\b(\d+)\s*(?:mins?|minutes?)\s*Total\b",
        r"Ready in[:\s]+(\d+)\s*(?:mins?|minutes?)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I | re.S)
        if not match:
            continue
        groups = match.groups()
        if len(groups) == 3:
            return str(int(groups[0]) * 60 + int(groups[1]) + int(groups[2]))
        if len(groups) == 2:
            # hours+mins OR prep+cook
            a, b = int(groups[0]), int(groups[1])
            if "prep" in pattern.lower() and "cook" in pattern.lower():
                return str(a + b)
            # hours + minutes
            if a <= 48 and b < 60:
                return str(a * 60 + b)
            return str(a + b)
        if len(groups) == 1:
            return str(int(groups[0]))
    return None


def collect_image_candidates(soup: BeautifulSoup, base_url: str) -> list[str]:
    urls: list[str] = []
    for prop in ("og:image", "twitter:image", "og:image:secure_url"):
        tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
        if tag and tag.get("content"):
            urls.append(urljoin(base_url, tag["content"].strip()))
    for img in soup.find_all("img"):
        src = (
            img.get("src")
            or img.get("data-src")
            or img.get("data-original-src")
            or img.get("data-lazy-src")
            or img.get("data-pin-media")
            or ""
        )
        if not src and img.get("srcset"):
            src = str(img.get("srcset")).split(",")[0].strip().split(" ")[0]
        if not src or src.startswith("data:"):
            continue
        full = urljoin(base_url, src)
        if _SKIP_IMAGE.search(full):
            continue
        urls.append(full)
    # de-dupe preserve order
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        if u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


def select_best_image(image_urls: list[str]) -> str:
    if not image_urls:
        return ""
    for img_url in image_urls:
        if "/thmb/" in img_url and any(
            size in img_url for size in ("750x0", "800x", "1200x", "1500x")
        ):
            if not any(skip in img_url.lower() for skip in ("40x0", "58x0", "76x0", "headshot")):
                return img_url
    for img_url in image_urls:
        low = img_url.lower()
        if any(k in low for k in ("1500x", "1200x", "800x", "750x", "large", "original")):
            return img_url
        if any(k in low for k in ("75x75", "100x100", "150x150", "40x0", "58x0")):
            continue
    return image_urls[0]


def format_jsonld_hint(recipe: dict[str, Any]) -> str:
    if not recipe:
        return ""
    parts = ["Structured Recipe data from the page (prefer when consistent):"]
    for key in ("title", "description", "cookTime", "ingredients", "instructions", "imageUrl"):
        val = recipe.get(key)
        if not val:
            continue
        text = str(val)
        if len(text) > 1200:
            text = text[:1200] + "…"
        parts.append(f"{key}: {text}")
    return "\n".join(parts) + "\n\n"


def _find_recipe_node(data: Any) -> Optional[dict]:
    if isinstance(data, dict):
        types = data.get("@type") or data.get("type")
        type_list = types if isinstance(types, list) else [types]
        if any(str(t).lower() == "recipe" for t in type_list if t):
            return data
        if "@graph" in data:
            found = _find_recipe_node(data["@graph"])
            if found:
                return found
        for v in data.values():
            found = _find_recipe_node(v)
            if found:
                return found
    if isinstance(data, list):
        for item in data:
            found = _find_recipe_node(item)
            if found:
                return found
    return None


def _instructions_from_jsonld(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    lines: list[str] = []
    if isinstance(value, list):
        for i, step in enumerate(value, 1):
            if isinstance(step, str):
                lines.append(f"{i}. {step.strip()}")
            elif isinstance(step, dict):
                text = _as_str(step.get("text") or step.get("name"))
                if text:
                    lines.append(f"{i}. {text}")
    elif isinstance(value, dict):
        text = _as_str(value.get("text") or value.get("name"))
        if text:
            return text
    return "\n".join(lines)


def _image_from_jsonld(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list) and value:
        return _image_from_jsonld(value[0])
    if isinstance(value, dict):
        return _as_str(value.get("url") or value.get("contentUrl"))
    return ""


def _iso8601_duration_minutes(value: Any) -> Optional[int]:
    s = _as_str(value)
    if not s:
        return None
    # PT1H30M / PT45M / P0DT1H
    m = re.match(
        r"^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$",
        s.upper().replace(" ", ""),
    )
    if not m:
        return None
    days = int(m.group(1) or 0)
    hours = int(m.group(2) or 0)
    minutes = int(m.group(3) or 0)
    seconds = int(m.group(4) or 0)
    total = days * 24 * 60 + hours * 60 + minutes + (1 if seconds >= 30 else 0)
    return total if 1 <= total <= 480 else None


def _as_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()
