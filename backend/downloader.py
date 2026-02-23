"""YouTube & SoundCloud to MP3 downloader using yt-dlp."""

import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Optional

import yt_dlp

from backend.config import DOWNLOADS_DIR, MAX_PLAYLIST_SIZE


@dataclass
class DownloadProgress:
    job_id: str
    status: str = "queued"  # queued | downloading | converting | done | error
    title: str = ""
    progress: float = 0.0
    filename: Optional[str] = None
    error: Optional[str] = None
    source: str = ""  # youtube | soundcloud | unknown


# In-memory job tracker (keyed by job_id)
_jobs: dict[str, DownloadProgress] = {}
_jobs_lock = Lock()


def _set_job(job: DownloadProgress):
    with _jobs_lock:
        _jobs[job.job_id] = job


def get_job_status(job_id: str) -> Optional[DownloadProgress]:
    with _jobs_lock:
        return _jobs.get(job_id)


def detect_source(url: str) -> str:
    """Detect the platform from a URL."""
    url_lower = url.lower()
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return "youtube"
    if "soundcloud.com" in url_lower:
        return "soundcloud"
    return "unknown"


def _progress_hook(job: DownloadProgress):
    """Return a yt-dlp progress hook bound to a job."""

    def hook(d: dict):
        if d["status"] == "downloading":
            job.status = "downloading"
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            if total > 0:
                job.progress = round(downloaded / total * 100, 1)
            _set_job(job)
        elif d["status"] == "finished":
            job.status = "converting"
            job.progress = 100.0
            _set_job(job)

    return hook


def extract_info(url: str) -> dict:
    """Extract metadata from a URL without downloading."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "skip_download": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)


def is_multi_track(url: str) -> bool:
    """Check if a URL points to multiple tracks (playlist, set, artist page).

    Works for both YouTube playlists and SoundCloud sets/artist pages.
    """
    source = detect_source(url)

    if source == "youtube":
        return "list=" in url

    if source == "soundcloud":
        # SoundCloud sets, albums, playlists, and artist track pages
        path = url.rstrip("/").split("soundcloud.com/")[-1]
        parts = path.strip("/").split("/")
        # Artist page (just username, no specific track) = multi-track
        if len(parts) == 1:
            return True
        # Explicit set/album paths
        if len(parts) >= 2 and parts[1] in ("sets", "albums", "likes", "tracks", "reposts"):
            return True
        return False

    # For unknown sources, check via yt-dlp metadata
    try:
        info = extract_info(url)
        return info.get("_type") == "playlist" or "entries" in info
    except Exception:
        return False


def download_single(url: str, output_dir: Optional[str] = None) -> DownloadProgress:
    """Download a single track as MP3. Returns job info."""
    source = detect_source(url)
    job = DownloadProgress(job_id=str(uuid.uuid4()), source=source)
    _set_job(job)

    dest = output_dir or DOWNLOADS_DIR
    Path(dest).mkdir(parents=True, exist_ok=True)

    opts = {
        "format": "bestaudio/best",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "320",
            }
        ],
        "outtmpl": os.path.join(dest, "%(title)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [_progress_hook(job)],
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            job.title = info.get("title", "Unknown")
            job.filename = os.path.join(dest, f"{info.get('title', 'Unknown')}.mp3")
            job.status = "done"
            job.progress = 100.0
    except Exception as e:
        job.status = "error"
        job.error = str(e)

    _set_job(job)
    return job


def download_multi(url: str, output_dir: Optional[str] = None) -> list[DownloadProgress]:
    """Download all tracks from a playlist/set/artist page as MP3s."""
    info = extract_info(url)
    entries = info.get("entries", [])[:MAX_PLAYLIST_SIZE]

    jobs = []
    for entry in entries:
        # Build the track URL — works for any platform
        video_url = entry.get("url") or entry.get("webpage_url")
        if not video_url and entry.get("id"):
            source = detect_source(url)
            if source == "youtube":
                video_url = f"https://www.youtube.com/watch?v={entry['id']}"
            else:
                # For SoundCloud and others, yt-dlp usually provides the url
                continue

        if video_url:
            job = download_single(video_url, output_dir)
            jobs.append(job)

    return jobs


def download(url: str, output_dir: Optional[str] = None) -> list[DownloadProgress]:
    """Smart download — detects single vs multi-track and downloads accordingly."""
    if is_multi_track(url):
        return download_multi(url, output_dir)
    return [download_single(url, output_dir)]
