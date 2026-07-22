from __future__ import annotations

import logging
import re
from typing import Callable
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup, Comment

import nvidia_client

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
    for selector in ("nav", "header", "footer", ".advertisement", ".ads", "iframe"):
        for el in soup_clean.select(selector):
            el.decompose()
    image_texts = []
    for img in soup_clean.find_all("img"):
        src = img.get("src") or ""
        alt = img.get("alt") or ""
        if src:
            image_texts.append(f"Image: {src}" + (f" (alt: {alt})" if alt else ""))
    text = soup_clean.get_text(separator="\n", strip=True)
    if image_texts:
        text = "Images:\n" + "\n".join(image_texts[:30]) + "\n\n" + text
    text = re.sub(r"\n\s*\n\s*\n", "\n\n", text)
    if len(text) > 8000:
        text = text[:8000] + "\n\n[truncated]"
    return text


def _pick_image(soup: BeautifulSoup, base_url: str) -> str:
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if not src or src.startswith("data:"):
            continue
        full = urljoin(base_url, src)
        if any(x in full.lower() for x in ("logo", "icon", "sprite", "avatar")):
            continue
        return full
    return ""


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
            # Sites like myrecipe.kitchen use self-signed / expired certs.
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
    visible = _clean_html(soup)
    image = _pick_image(soup, url)

    on_step("extracting")
    result = nvidia_client.extract_recipe_from_page_text(visible)
    if not result.get("imageUrl") and image:
        result["imageUrl"] = image
    return result
