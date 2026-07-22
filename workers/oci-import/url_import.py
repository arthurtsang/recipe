from __future__ import annotations

import logging
import re
from typing import Callable

import httpx
from bs4 import BeautifulSoup, Comment

import nvidia_client
import page_signals

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _clean_html(soup: BeautifulSoup) -> str:
    soup_clean = BeautifulSoup(str(soup), "html.parser")
    for el in soup_clean(["script", "style", "noscript"]):
        el.decompose()
    for comment in soup_clean.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()
    for selector in (
        "nav",
        "header",
        "footer",
        ".advertisement",
        ".ads",
        "iframe",
        ".related-recipes",
        ".comments",
    ):
        for el in soup_clean.select(selector):
            el.decompose()
    image_texts = []
    for img in soup_clean.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        alt = img.get("alt") or ""
        if src:
            image_texts.append(f"Image: {src}" + (f" (alt: {alt})" if alt else ""))
    text = soup_clean.get_text(separator="\n", strip=True)
    # Drop ultra-short nav crumbs
    lines = []
    for line in text.splitlines():
        s = line.strip()
        if len(s) <= 2:
            continue
        if s.lower() in {"home", "login", "sign in", "menu", "search"}:
            continue
        lines.append(s)
    text = "\n".join(lines)
    if image_texts:
        text = "Images:\n" + "\n".join(image_texts[:30]) + "\n\n" + text
    text = re.sub(r"\n\s*\n\s*\n", "\n\n", text)
    if len(text) < 100:
        # Over-cleaning — fall back to lightly cleaned original body text
        text = soup.get_text(separator="\n", strip=True)
    if len(text) > 8000:
        text = text[:8000] + "\n\n[truncated]"
    return text


def _is_tls_verify_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return any(
        token in msg
        for token in (
            "certificate",
            "ssl",
            "tls",
            "certificate_verify_failed",
            "self-signed",
        )
    )


def _fetch_html(url: str) -> str:
    """Fetch page HTML. Retry without TLS verify if the site has a bad/expired cert."""
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"}
    with httpx.Client(follow_redirects=True, timeout=45.0, headers=headers) as client:
        try:
            resp = client.get(url)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            if not _is_tls_verify_error(e):
                raise
            logger.warning("TLS verify failed for %s (%s); retrying with verify=False", url, e)

    with httpx.Client(
        follow_redirects=True,
        timeout=45.0,
        headers=headers,
        verify=False,
    ) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.text


def import_from_url(url: str, on_step: Callable[[str], None]) -> dict:
    on_step("fetching")
    logger.info("httpx fetch: %s", url)
    html = _fetch_html(url)

    soup = BeautifulSoup(html, "html.parser")
    jsonld = page_signals.extract_json_ld_recipe(soup)
    visible = page_signals.format_jsonld_hint(jsonld) + _clean_html(soup)
    page_cook = page_signals.extract_cook_time_from_text(visible) or jsonld.get("cookTime")
    candidates = page_signals.collect_image_candidates(soup, url)
    if jsonld.get("imageUrl"):
        candidates = [jsonld["imageUrl"]] + candidates
    best_image = page_signals.select_best_image(candidates)

    on_step("extracting")
    result = nvidia_client.extract_recipe_from_page_text(
        visible,
        page_cook_time=str(page_cook) if page_cook else "",
        known_image_urls=candidates,
    )

    # Prefer scraper/JSON-LD images over hallucinated LLM URLs
    llm_image = (result.get("imageUrl") or "").strip()
    if llm_image and candidates and llm_image not in candidates:
        # allow if same host path loosely matches
        if not any(llm_image.split("?")[0] == c.split("?")[0] for c in candidates):
            result["imageUrl"] = best_image
    elif not llm_image:
        result["imageUrl"] = best_image

    # Seed missing structured fields from JSON-LD when LLM left them empty
    for key in ("title", "ingredients", "instructions"):
        if not (result.get(key) or "").strip() and jsonld.get(key):
            result[key] = jsonld[key]
    if (
        not result.get("description")
        or nvidia_client.description_looks_like_dump(
            result.get("description") or "", result.get("title") or ""
        )
    ) and jsonld.get("description"):
        # Only use JSON-LD desc if it isn't itself a dump
        jd = jsonld["description"]
        if not nvidia_client.description_looks_like_dump(jd, result.get("title") or ""):
            result["description"] = jd

    if page_cook and (
        not result.get("cookTime")
        or result.get("cookTime") == "30"
        and "Defaulted" in (result.get("timeReasoning") or "")
    ):
        result["cookTime"] = str(page_cook)
        result["timeReasoning"] = "Extracted from page text / structured data."

    return result
