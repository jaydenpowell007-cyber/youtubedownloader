"""Natural language music search via YouTube and SoundCloud."""

import re
from dataclasses import dataclass, field
from typing import Optional

import yt_dlp


@dataclass
class SearchResult:
    title: str
    url: str
    duration: str
    channel: str
    thumbnail: str
    source: str  # "youtube" or "soundcloud"


@dataclass
class SearchResponse:
    """Wrapper that carries results plus any metadata parsed from the query."""
    results: list[SearchResult] = field(default_factory=list)
    parsed_bpm: Optional[int] = None
    parsed_key: Optional[str] = None
    cleaned_query: str = ""


# Patterns that match BPM references in a search query (case-insensitive).
_BPM_PATTERNS = [
    # "with a bpm of 140", "with bpm of 140"
    r"\bwith\s+(?:a\s+)?bpm\s+(?:of\s+)?(\d{2,3})\b",
    # "bpm of 140", "bpm: 140", "bpm 140"
    r"\bbpm\s*[:=]?\s*(?:of\s+)?(\d{2,3})\b",
    # "at 140 bpm", "at 140bpm"
    r"\bat\s+(\d{2,3})\s*bpm\b",
    # "140bpm", "140 bpm" (number before bpm)
    r"\b(\d{2,3})\s*bpm\b",
]

# Musical key patterns (case-insensitive).
_KEY_PATTERNS = [
    # "key of Am", "key: Bb minor", "in the key of C# major"
    r"(?:in\s+)?(?:the\s+)?key\s*(?:of|:)\s*([A-Ga-g][#b]?\s*(?:major|minor|maj|min|m)?)\b",
    # "in Am", "in Bb minor" — only when preceded by "in"
    r"\bin\s+([A-Ga-g][#b]?\s*(?:major|minor|maj|min|m))\b",
]


def _parse_query_metadata(query: str) -> tuple[str, Optional[int], Optional[str]]:
    """Extract BPM and key references from a search query.

    Returns (cleaned_query, bpm_or_none, key_or_none).
    The cleaned query has metadata terms stripped so the search engine
    matches on artist/title instead of literal BPM numbers.
    """
    cleaned = query
    bpm: Optional[int] = None
    key: Optional[str] = None

    # Extract BPM — try each pattern, take first match
    for pattern in _BPM_PATTERNS:
        m = re.search(pattern, cleaned, re.IGNORECASE)
        if m:
            bpm = int(m.group(1))
            # Remove the matched span from the query
            cleaned = cleaned[:m.start()] + cleaned[m.end():]
            break

    # Extract key
    for pattern in _KEY_PATTERNS:
        m = re.search(pattern, cleaned, re.IGNORECASE)
        if m:
            key = m.group(1).strip()
            cleaned = cleaned[:m.start()] + cleaned[m.end():]
            break

    # Clean up leftover whitespace / punctuation
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip().strip("-,;:")

    return cleaned, bpm, key


def _format_duration(seconds) -> str:
    if not seconds:
        return "0:00"
    mins, secs = divmod(int(seconds), 60)
    return f"{mins}:{secs:02d}"


def search_youtube(query: str, max_results: int = 10) -> list[SearchResult]:
    """Search YouTube for music matching a natural language query."""
    search_query = f"ytsearch{max_results}:{query}"

    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
    }

    results = []
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(search_query, download=False)
        for entry in info.get("entries", []):
            if not entry:
                continue
            results.append(
                SearchResult(
                    title=entry.get("title", "Unknown"),
                    url=f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                    duration=_format_duration(entry.get("duration", 0)),
                    channel=entry.get("channel", entry.get("uploader", "Unknown")),
                    thumbnail=entry.get("thumbnail", ""),
                    source="youtube",
                )
            )

    return results


def search_soundcloud(query: str, max_results: int = 10) -> list[SearchResult]:
    """Search SoundCloud for music matching a natural language query."""
    search_query = f"scsearch{max_results}:{query}"

    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
    }

    results = []
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(search_query, download=False)
        for entry in info.get("entries", []):
            if not entry:
                continue
            results.append(
                SearchResult(
                    title=entry.get("title", "Unknown"),
                    url=entry.get("webpage_url", entry.get("url", "")),
                    duration=_format_duration(entry.get("duration", 0)),
                    channel=entry.get("uploader", "Unknown"),
                    thumbnail=entry.get("thumbnail", ""),
                    source="soundcloud",
                )
            )

    return results


def search(query: str, platform: str = "all", max_results: int = 10) -> SearchResponse:
    """Search for music across platforms.

    BPM / key references are stripped from the query so the search engine
    matches on artist and song title rather than returning beats tagged
    with literal BPM numbers.

    Args:
        query: Natural language search query
        platform: "youtube", "soundcloud", or "all"
        max_results: Max results per platform
    """
    cleaned, bpm, key = _parse_query_metadata(query)
    # Fall back to original query if stripping left it empty
    effective_query = cleaned or query

    if platform == "youtube":
        results = search_youtube(effective_query, max_results)
    elif platform == "soundcloud":
        results = search_soundcloud(effective_query, max_results)
    else:
        # "all" — search both, interleave results
        yt_results = search_youtube(effective_query, max_results)
        sc_results = search_soundcloud(effective_query, max_results)

        # Interleave: alternate YouTube and SoundCloud results
        results = []
        yt_iter, sc_iter = iter(yt_results), iter(sc_results)
        while True:
            yt_item = next(yt_iter, None)
            sc_item = next(sc_iter, None)
            if yt_item:
                results.append(yt_item)
            if sc_item:
                results.append(sc_item)
            if not yt_item and not sc_item:
                break

    return SearchResponse(
        results=results,
        parsed_bpm=bpm,
        parsed_key=key,
        cleaned_query=effective_query,
    )
