"""ID3 tag enrichment for MP3 files — embeds metadata for DJ software."""

import io
from typing import Optional

import httpx
from mutagen.id3 import (
    ID3,
    TIT2,   # Title
    TPE1,   # Artist
    TALB,   # Album
    TCON,   # Genre
    TBPM,   # BPM
    TKEY,   # Initial key
    APIC,   # Album art
    COMM,   # Comment
    ID3NoHeaderError,
)
from mutagen.mp3 import MP3


def tag_mp3(
    filepath: str,
    title: Optional[str] = None,
    artist: Optional[str] = None,
    album: Optional[str] = None,
    genre: Optional[str] = None,
    bpm: Optional[int] = None,
    key: Optional[str] = None,
    camelot: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
    comment: Optional[str] = None,
) -> dict:
    """Write ID3 tags to an MP3 file.

    Args:
        filepath: Path to the MP3 file
        title: Track title
        artist: Artist name
        album: Album name
        genre: Genre tag
        bpm: Beats per minute
        key: Musical key (e.g. "Am", "Eb")
        camelot: Camelot notation (e.g. "8A", "5B")
        thumbnail_url: URL for album artwork
        comment: Additional comment

    Returns:
        dict with tagged fields and any errors
    """
    try:
        audio = MP3(filepath)
    except Exception as e:
        return {"error": f"Failed to open MP3: {e}"}

    # Ensure ID3 tags exist
    try:
        audio.add_tags()
    except Exception:
        pass  # Tags already exist

    tags = audio.tags
    tagged = []

    if title:
        tags.add(TIT2(encoding=3, text=[title]))
        tagged.append("title")

    if artist:
        tags.add(TPE1(encoding=3, text=[artist]))
        tagged.append("artist")

    if album:
        tags.add(TALB(encoding=3, text=[album]))
        tagged.append("album")

    if genre:
        tags.add(TCON(encoding=3, text=[genre]))
        tagged.append("genre")

    if bpm is not None:
        tags.add(TBPM(encoding=3, text=[str(bpm)]))
        tagged.append("bpm")

    if key:
        # TKEY stores the musical key — DJ software reads this
        # Store as Open Key notation for broadest compatibility
        tags.add(TKEY(encoding=3, text=[key]))
        tagged.append("key")

    # Store Camelot in a comment for DJ software that reads it
    comment_parts = []
    if camelot:
        comment_parts.append(f"Camelot: {camelot}")
    if comment:
        comment_parts.append(comment)
    if comment_parts:
        tags.add(COMM(encoding=3, lang="eng", desc="", text=[" | ".join(comment_parts)]))
        tagged.append("comment")

    # Embed artwork
    if thumbnail_url:
        try:
            resp = httpx.get(thumbnail_url, timeout=15, follow_redirects=True)
            if resp.status_code == 200:
                content_type = resp.headers.get("content-type", "image/jpeg")
                tags.add(APIC(
                    encoding=3,
                    mime=content_type,
                    type=3,  # Cover (front)
                    desc="Cover",
                    data=resp.content,
                ))
                tagged.append("artwork")
        except Exception:
            pass  # Artwork is best-effort

    try:
        audio.save()
    except Exception as e:
        return {"error": f"Failed to save tags: {e}"}

    return {"tagged": tagged}


def extract_artist_title(yt_title: str) -> tuple[str, str]:
    """Best-effort extraction of artist and title from a YouTube/SoundCloud title.

    Common formats:
        "Artist - Title"
        "Artist - Title (Official Video)"
        "Artist - Title [Official Audio]"
        "Title (feat. Artist)"
    """
    import re

    # Strip common suffixes
    cleaned = re.sub(
        r'\s*[\(\[](?:official\s*(?:video|audio|music\s*video|lyric\s*video|visualizer)|'
        r'lyrics?|audio|hd|hq|4k|mv|prod\.?\s*by\s*[\w\s]+)[\)\]]\s*',
        '',
        yt_title,
        flags=re.IGNORECASE,
    ).strip()

    # Try "Artist - Title" split
    if " - " in cleaned:
        parts = cleaned.split(" - ", 1)
        return parts[0].strip(), parts[1].strip()

    # Try "Artist — Title" (em dash)
    if " — " in cleaned:
        parts = cleaned.split(" — ", 1)
        return parts[0].strip(), parts[1].strip()

    # Fallback: whole thing is the title, artist unknown
    return "", cleaned
