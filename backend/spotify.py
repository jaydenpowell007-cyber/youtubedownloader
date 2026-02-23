"""Spotify playlist import — extracts track listings without an API key."""

import json
import re
from dataclasses import dataclass

import httpx


_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/131.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
}


@dataclass
class SpotifyTrack:
    title: str
    artist: str
    album: str
    duration_ms: int
    search_query: str  # pre-built query for YouTube/SoundCloud search
    album_art: str = ""  # URL to album artwork
    release_year: str = ""
    isrc: str = ""  # International Standard Recording Code


def parse_playlist_id(url: str) -> str:
    """Extract playlist ID from a Spotify URL."""
    match = re.search(r'playlist[/:]([a-zA-Z0-9]+)', url)
    if not match:
        raise ValueError(f"Could not parse Spotify playlist ID from: {url}")
    return match.group(1)


def _get_anonymous_token() -> str:
    """Get an anonymous Spotify access token using a session with cookies.

    Spotify blocks bare requests to /get_access_token.  By first visiting
    open.spotify.com we pick up the session cookies the endpoint expects.
    """
    with httpx.Client(follow_redirects=True, timeout=20) as client:
        # Step 1 — land on the Spotify home page to get cookies (sp_t, etc.)
        client.get(
            "https://open.spotify.com/",
            headers={
                **_BROWSER_HEADERS,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
            },
        )

        # Step 2 — request the access token with session cookies
        resp = client.get(
            "https://open.spotify.com/get_access_token",
            params={"reason": "transport", "productType": "web_player"},
            headers={
                **_BROWSER_HEADERS,
                "Accept": "application/json",
                "Referer": "https://open.spotify.com/",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
            },
        )
        resp.raise_for_status()
        token = resp.json().get("accessToken")
        if not token:
            raise RuntimeError("No accessToken in Spotify response")
        return token


def _get_tracks_via_api(playlist_id: str, token: str) -> tuple[str, list[SpotifyTrack]]:
    """Fetch full track metadata from Spotify's Web API."""
    headers = {"Authorization": f"Bearer {token}", **_BROWSER_HEADERS}

    tracks: list[SpotifyTrack] = []
    offset = 0
    limit = 100

    while True:
        resp = httpx.get(
            f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks",
            params={
                "fields": "items(track(name,artists(name),album(name,images,release_date),"
                          "duration_ms,external_ids)),next,total",
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

            artists = ", ".join(
                a["name"] for a in track.get("artists", []) if a.get("name")
            )
            title = track["name"]
            album_data = track.get("album", {})
            album = album_data.get("name", "")
            duration_ms = track.get("duration_ms", 0)

            images = album_data.get("images", [])
            album_art = images[0]["url"] if images else ""

            release_date = album_data.get("release_date", "")
            release_year = release_date[:4] if release_date else ""

            isrc = track.get("external_ids", {}).get("isrc", "")

            search_query = f"{artists} - {title}" if artists else title

            tracks.append(SpotifyTrack(
                title=title, artist=artists, album=album,
                duration_ms=duration_ms, search_query=search_query,
                album_art=album_art, release_year=release_year, isrc=isrc,
            ))

        if not data.get("next"):
            break
        offset += limit

    # Playlist name
    playlist_name = "Spotify Playlist"
    try:
        resp = httpx.get(
            f"https://api.spotify.com/v1/playlists/{playlist_id}",
            params={"fields": "name"},
            headers=headers,
            timeout=15,
        )
        resp.raise_for_status()
        playlist_name = resp.json().get("name", playlist_name)
    except Exception:
        pass

    return playlist_name, tracks


def _get_tracks_from_embed(playlist_id: str) -> tuple[str, list[SpotifyTrack]]:
    """Fallback: scrape track data from the Spotify embed page (no token needed).

    The embed page is designed for third-party iframes, so it's far less
    aggressive about blocking non-browser requests.  Metadata is embedded
    in a __NEXT_DATA__ JSON blob inside the HTML.
    """
    resp = httpx.get(
        f"https://open.spotify.com/embed/playlist/{playlist_id}",
        headers={**_BROWSER_HEADERS, "Accept": "text/html"},
        timeout=20,
        follow_redirects=True,
    )
    resp.raise_for_status()

    match = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        resp.text,
    )
    if not match:
        raise RuntimeError("Could not parse Spotify embed page")

    page_data = json.loads(match.group(1))
    entity = page_data["props"]["pageProps"]["state"]["data"]["entity"]
    playlist_name = entity.get("name", "Spotify Playlist")

    tracks: list[SpotifyTrack] = []
    for item in entity.get("trackList", []):
        title = item.get("title", "")
        artist = item.get("subtitle", "")
        duration_ms = item.get("duration", 0)

        album_art = ""
        sources = item.get("albumCoverArt", {}).get("sources", [])
        if sources:
            # Pick largest available image
            album_art = sources[0].get("url", "")

        search_query = f"{artist} - {title}" if artist else title

        tracks.append(SpotifyTrack(
            title=title, artist=artist, album="",
            duration_ms=duration_ms, search_query=search_query,
            album_art=album_art,
        ))

    return playlist_name, tracks


def get_playlist_tracks(url: str) -> tuple[str, list[SpotifyTrack]]:
    """Fetch all tracks from a Spotify playlist.

    Tries the Web API with an anonymous token first (full metadata including
    album name, release year, and ISRC).  Falls back to embed-page scraping
    if the token endpoint is blocked.
    """
    playlist_id = parse_playlist_id(url)

    # Primary: API with anonymous token (richest metadata)
    try:
        token = _get_anonymous_token()
        return _get_tracks_via_api(playlist_id, token)
    except Exception:
        pass

    # Fallback: embed page (always works, less metadata)
    return _get_tracks_from_embed(playlist_id)
