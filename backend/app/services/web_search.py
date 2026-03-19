"""Web search and page fetching services."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import quote_plus

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str
    published_date: str | None = None


class _HTMLTextExtractor(HTMLParser):
    """Strip HTML tags and extract text content."""

    def __init__(self) -> None:
        super().__init__()
        self._text: list[str] = []
        self._skip = False
        self._skip_tags = {"script", "style", "noscript", "svg", "nav", "footer", "header"}

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in self._skip_tags:
            self._skip = True

    def handle_endtag(self, tag: str) -> None:
        if tag in self._skip_tags:
            self._skip = False

    def handle_data(self, data: str) -> None:
        if not self._skip:
            stripped = data.strip()
            if stripped:
                self._text.append(stripped)

    def get_text(self) -> str:
        return "\n".join(self._text)


def _extract_text(html: str) -> str:
    parser = _HTMLTextExtractor()
    parser.feed(html)
    return parser.get_text()


async def web_search(query: str, num_results: int = 5) -> list[SearchResult]:
    """Search the web using Brave Search API or DuckDuckGo fallback."""
    if settings.BRAVE_SEARCH_API_KEY:
        return await _brave_search(query, num_results)
    return await _ddg_search(query, num_results)


async def _brave_search(query: str, num_results: int) -> list[SearchResult]:
    """Search using the Brave Search API."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": num_results},
            headers={
                "X-Subscription-Token": settings.BRAVE_SEARCH_API_KEY,
                "Accept": "application/json",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    for item in (data.get("web", {}).get("results", []))[:num_results]:
        results.append(SearchResult(
            title=item.get("title", ""),
            url=item.get("url", ""),
            snippet=item.get("description", ""),
            published_date=item.get("page_age"),
        ))
    return results


async def _ddg_search(query: str, num_results: int) -> list[SearchResult]:
    """Fallback: search using DuckDuckGo HTML endpoint and parse results."""
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers={"User-Agent": "Mozilla/5.0 (compatible; LifeOS/1.0)"},
        )
        resp.raise_for_status()
        html = resp.text

    results = []
    # Parse DuckDuckGo HTML results — simple extraction
    import re

    # Each result is in a div with class "result"
    blocks = re.findall(
        r'<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)</a>.*?'
        r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
        html,
        re.DOTALL,
    )

    for url, title, snippet in blocks[:num_results]:
        # Clean HTML tags from title and snippet
        clean_title = re.sub(r"<[^>]+>", "", title).strip()
        clean_snippet = re.sub(r"<[^>]+>", "", snippet).strip()

        # DuckDuckGo wraps URLs through a redirect — extract the actual URL
        if "uddg=" in url:
            from urllib.parse import parse_qs, urlparse
            parsed = urlparse(url)
            actual = parse_qs(parsed.query).get("uddg", [url])
            url = actual[0] if actual else url

        results.append(SearchResult(
            title=clean_title,
            url=url,
            snippet=clean_snippet,
        ))

    return results


async def fetch_page(url: str, max_chars: int = 8000) -> str:
    """Fetch a URL and return the text content, stripped of HTML."""
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; LifeOS/1.0)"},
            )
            resp.raise_for_status()

        text = _extract_text(resp.text)
        return text[:max_chars]
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return f"Error fetching page: {e}"
