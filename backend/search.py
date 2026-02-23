"""Natural language music search via YouTube and SoundCloud."""

from dataclasses import dataclass

import yt_dlp


@dataclass
class SearchResult:
    title: str
    url: str
    duration: str
    channel: str
    thumbnail: str
    source: str  # "youtube" or "soundcloud"


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


def search(query: str, platform: str = "all", max_results: int = 10) -> list[SearchResult]:
    """Search for music across platforms.

    Args:
        query: Natural language search query
        platform: "youtube", "soundcloud", or "all"
        max_results: Max results per platform
    """
    if platform == "youtube":
        return search_youtube(query, max_results)
    if platform == "soundcloud":
        return search_soundcloud(query, max_results)

    # "all" — search both, interleave results
    yt_results = search_youtube(query, max_results)
    sc_results = search_soundcloud(query, max_results)

    # Interleave: alternate YouTube and SoundCloud results
    combined = []
    yt_iter, sc_iter = iter(yt_results), iter(sc_results)
    while True:
        yt_item = next(yt_iter, None)
        sc_item = next(sc_iter, None)
        if yt_item:
            combined.append(yt_item)
        if sc_item:
            combined.append(sc_item)
        if not yt_item and not sc_item:
            break

    return combined
