"""Natural language music search via YouTube."""

import re
from dataclasses import dataclass

import yt_dlp


@dataclass
class SearchResult:
    title: str
    url: str
    duration: str
    channel: str
    thumbnail: str


def search_youtube(query: str, max_results: int = 10) -> list[SearchResult]:
    """Search YouTube for music matching a natural language query.

    Examples:
        "Don Toliver songs with a bpm of 140"
        "dark techno tracks 2024"
        "chill lofi beats for mixing"
    """
    search_query = f"ytsearch{max_results}:{query}"

    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
        "default_search": "ytsearch",
    }

    results = []
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(search_query, download=False)
        for entry in info.get("entries", []):
            if not entry:
                continue
            duration_secs = entry.get("duration", 0) or 0
            mins, secs = divmod(int(duration_secs), 60)
            results.append(
                SearchResult(
                    title=entry.get("title", "Unknown"),
                    url=f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                    duration=f"{mins}:{secs:02d}",
                    channel=entry.get("channel", entry.get("uploader", "Unknown")),
                    thumbnail=entry.get("thumbnail", ""),
                )
            )

    return results
