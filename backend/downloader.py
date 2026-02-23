"""YouTube & SoundCloud to MP3 downloader using yt-dlp."""

import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Optional

import yt_dlp

from backend.config import DOWNLOADS_DIR, MAX_PLAYLIST_SIZE
from backend.errors import (
    DownloaderError,
    NetworkError,
    ExtractionError,
    NormalizationError,
)


@dataclass
class DownloadProgress:
    job_id: str
    status: str = "queued"  # queued | downloading | converting | normalizing | analyzing | done | error | skipped
    title: str = ""
    progress: float = 0.0
    filename: Optional[str] = None
    error: Optional[str] = None
    source: str = ""  # youtube | soundcloud | unknown
    bpm: Optional[int] = None
    key: Optional[str] = None
    camelot: Optional[str] = None
    normalized: bool = False
    skipped_reason: Optional[str] = None


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


def _retry(fn, retries: int = 3, description: str = "operation"):
    """Retry a function with exponential backoff for network errors."""
    last_error = None
    for attempt in range(retries):
        try:
            return fn()
        except (yt_dlp.utils.DownloadError, OSError, ConnectionError) as e:
            last_error = e
            if attempt < retries - 1:
                time.sleep(2 ** (attempt + 1))
    raise NetworkError(f"{description} failed after {retries} attempts: {last_error}")


def extract_info(url: str) -> dict:
    """Extract metadata from a URL without downloading."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "skip_download": True,
    }
    try:
        def _extract():
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=False)

        return _retry(_extract, description=f"extract info from {url}")
    except NetworkError:
        raise
    except Exception as e:
        raise ExtractionError(f"Failed to extract info from {url}: {e}")


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


def download_single(url: str, output_dir: Optional[str] = None, skip_duplicates: bool = True) -> DownloadProgress:
    """Download a single track as MP3. Returns job info."""
    from backend.history import is_duplicate, record_download
    from backend.normalize import normalize_audio

    source = detect_source(url)
    job = DownloadProgress(job_id=str(uuid.uuid4()), source=source)
    _set_job(job)

    dest = output_dir or DOWNLOADS_DIR
    Path(dest).mkdir(parents=True, exist_ok=True)

    # --- Duplicate check (by URL) ---
    if skip_duplicates:
        existing = is_duplicate(url=url)
        if existing:
            job.status = "skipped"
            job.title = existing.title
            job.skipped_reason = f"Already downloaded: {existing.title}"
            job.filename = existing.filename
            job.bpm = existing.bpm
            job.key = existing.key
            job.camelot = existing.camelot
            job.normalized = existing.normalized
            _set_job(job)
            return job

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
        def _download():
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=True)

        info = _retry(_download, description=f"download {url}")
        job.title = info.get("title", "Unknown")
        job.filename = os.path.join(dest, f"{info.get('title', 'Unknown')}.mp3")

        # --- Duplicate check (by title, post-download) ---
        if skip_duplicates and job.title:
            existing = is_duplicate(title=job.title)
            if existing:
                # Already have this track — remove the new file and skip
                if job.filename and os.path.exists(job.filename) and existing.filename != job.filename:
                    try:
                        os.remove(job.filename)
                    except OSError:
                        pass
                job.status = "skipped"
                job.skipped_reason = f"Already downloaded: {job.title}"
                job.filename = existing.filename
                job.bpm = existing.bpm
                job.key = existing.key
                job.camelot = existing.camelot
                job.normalized = existing.normalized
                _set_job(job)
                return job

        # --- Post-download pipeline: normalize → analyze → tag → record ---
        if job.filename and os.path.exists(job.filename):
            # 1. Normalize audio loudness
            job.status = "normalizing"
            _set_job(job)
            try:
                normalize_audio(job.filename)
                job.normalized = True
            except NormalizationError:
                pass  # Normalization is best-effort

            # 2. BPM & key detection
            job.status = "analyzing"
            _set_job(job)

            from backend.analysis import analyze_file
            from backend.tagger import tag_mp3, extract_artist_title

            analysis = analyze_file(job.filename)
            job.bpm = analysis.get("bpm")
            job.key = analysis.get("key")
            job.camelot = analysis.get("camelot")

            # 3. Extract artist/title and write ID3 tags
            artist, title = extract_artist_title(info.get("title", ""))
            thumbnail = info.get("thumbnail", "")

            tag_mp3(
                filepath=job.filename,
                title=title or info.get("title", ""),
                artist=artist or info.get("channel", info.get("uploader", "")),
                album=info.get("album", ""),
                genre=info.get("genre", ""),
                bpm=job.bpm,
                key=job.key,
                camelot=job.camelot,
                thumbnail_url=thumbnail,
            )

            # 4. Record in download history
            record_download(
                url=url,
                title=job.title,
                artist=artist or info.get("channel", info.get("uploader", "")),
                filename=job.filename,
                source=source,
                bpm=job.bpm,
                key=job.key,
                camelot=job.camelot,
                normalized=job.normalized,
            )

        job.status = "done"
        job.progress = 100.0

    except NetworkError as e:
        job.status = "error"
        job.error = f"Network error: {e}"
    except ExtractionError as e:
        job.status = "error"
        job.error = f"Extraction error: {e}"
    except DownloaderError as e:
        job.status = "error"
        job.error = str(e)
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
