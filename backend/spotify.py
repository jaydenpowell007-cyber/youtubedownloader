"""Spotify playlist import — extracts track listings without an API key."""

import re
from dataclasses import dataclass

import httpx


@dataclass
class SpotifyTrack:
    title: str
    artist: str
    album: str
    duration_ms: int
    search_query: str  # pre-built query for YouTube/SoundCloud search


def parse_playlist_id(url: str) -> str:
    """Extract playlist ID from a Spotify URL."""
    # Handles:
    #   https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
    #   https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=...
    #   spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
    match = re.search(r'playlist[/:]([a-zA-Z0-9]+)', url)
    if not match:
        raise ValueError(f"Could not parse Spotify playlist ID from: {url}")
    return match.group(1)


def _get_anonymous_token() -> str:
    """Get an anonymous Spotify access token (no API key needed)."""
    resp = httpx.get(
        "https://open.spotify.com/get_access_token",
        params={"reason": "transport", "productType": "web_player"},
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/120.0.0.0 Safari/537.36",
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    token = data.get("accessToken")
    if not token:
        raise RuntimeError("Failed to get Spotify anonymous token")
    return token


def get_playlist_tracks(url: str) -> tuple[str, list[SpotifyTrack]]:
    """Fetch all tracks from a Spotify playlist.

    Args:
        url: Spotify playlist URL

    Returns:
        Tuple of (playlist_name, list of SpotifyTrack)
    """
    playlist_id = parse_playlist_id(url)
    token = _get_anonymous_token()

    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
    }

    tracks = []
    playlist_name = ""
    offset = 0
    limit = 100

    while True:
        resp = httpx.get(
            f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks",
            params={
                "fields": "items(track(name,artists(name),album(name),duration_ms)),next,total",
                "offset": offset,
                "limit": limit,
            },
            headers=headers,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        for item in data.get("items", []):
            track = item.get("track")
            if not track or not track.get("name"):
                continue

            artists = ", ".join(a["name"] for a in track.get("artists", []) if a.get("name"))
            title = track["name"]
            album = track.get("album", {}).get("name", "")
            duration_ms = track.get("duration_ms", 0)

            # Build a search query that works well on YouTube/SoundCloud
            search_query = f"{artists} - {title}" if artists else title

            tracks.append(SpotifyTrack(
                title=title,
                artist=artists,
                album=album,
                duration_ms=duration_ms,
                search_query=search_query,
            ))

        if not data.get("next"):
            break
        offset += limit

    # Fetch playlist name separately
    try:
        resp = httpx.get(
            f"https://api.spotify.com/v1/playlists/{playlist_id}",
            params={"fields": "name"},
            headers=headers,
            timeout=15,
        )
        resp.raise_for_status()
        playlist_name = resp.json().get("name", "Spotify Playlist")
    except Exception:
        playlist_name = "Spotify Playlist"

    return playlist_name, tracks
