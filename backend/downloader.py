"""YouTube & SoundCloud to MP3 downloader using yt-dlp."""

import asyncio
import os
import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
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

# Valid quality options
QUALITY_OPTIONS = ("128", "192", "256", "320", "flac")

# Background thread pool for async downloads
_bg_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="dl")


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
    quality: str = "320"
    format_type: str = "mp3"  # mp3 | flac


# In-memory job tracker (keyed by job_id)
_jobs: dict[str, DownloadProgress] = {}
_jobs_lock = Lock()

# WebSocket listeners — set of asyncio.Queue
_ws_listeners: list = []
_ws_lock = Lock()


def _set_job(job: DownloadProgress):
    with _jobs_lock:
        _jobs[job.job_id] = job
    _notify_ws(job)


def _notify_ws(job: DownloadProgress):
    """Push job update to all connected WebSocket listeners."""
    with _ws_lock:
        dead = []
        for q in _ws_listeners:
            try:
                q.put_nowait({
                    "job_id": job.job_id,
                    "status": job.status,
                    "title": job.title,
                    "progress": job.progress,
                    "filename": job.filename,
                    "error": job.error,
                    "source": job.source,
                    "bpm": job.bpm,
                    "key": job.key,
                    "camelot": job.camelot,
                    "normalized": job.normalized,
                    "skipped_reason": job.skipped_reason,
                    "quality": job.quality,
                    "format_type": job.format_type,
                })
            except Exception:
                dead.append(q)
        for q in dead:
            _ws_listeners.remove(q)


def register_ws_listener(queue) -> None:
    with _ws_lock:
        _ws_listeners.append(queue)


def unregister_ws_listener(queue) -> None:
    with _ws_lock:
        if queue in _ws_listeners:
            _ws_listeners.remove(queue)


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
    """Check if a URL points to multiple tracks (playlist, set, artist page)."""
    source = detect_source(url)

    if source == "youtube":
        return "list=" in url

    if source == "soundcloud":
        path = url.rstrip("/").split("soundcloud.com/")[-1]
        parts = path.strip("/").split("/")
        if len(parts) == 1:
            return True
        if len(parts) >= 2 and parts[1] in ("sets", "albums", "likes", "tracks", "reposts"):
            return True
        return False

    try:
        info = extract_info(url)
        return info.get("_type") == "playlist" or "entries" in info
    except Exception:
        return False


def _resolve_quality(quality: str) -> tuple[str, str]:
    """Resolve quality string to (codec, ext) tuple."""
    if quality == "flac":
        return "flac", "flac"
    if quality not in ("128", "192", "256", "320"):
        quality = "320"
    return "mp3", "mp3"


def _sanitize_filename(name: str) -> str:
    """Sanitize a string for use as a filename."""
    # Remove characters that are problematic on most filesystems
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    # Collapse multiple spaces/dots
    name = re.sub(r'\s+', ' ', name).strip()
    name = name.strip('.')
    # Limit length
    if len(name) > 200:
        name = name[:200]
    return name or "Unknown"


def _apply_filename_template(
    template: str,
    title: str = "",
    artist: str = "",
    bpm: Optional[int] = None,
    key: Optional[str] = None,
    camelot: Optional[str] = None,
    source: str = "",
) -> str:
    """Apply a filename template with available metadata.

    Supported placeholders: {title}, {artist}, {bpm}, {key}, {camelot}, {source}
    If a placeholder value is empty, the placeholder and surrounding separators are cleaned up.
    """
    result = template
    replacements = {
        "{title}": title or "Unknown",
        "{artist}": artist or "",
        "{bpm}": str(bpm) if bpm else "",
        "{key}": key or "",
        "{camelot}": camelot or "",
        "{source}": source or "",
    }

    for placeholder, value in replacements.items():
        result = result.replace(placeholder, value)

    # Clean up leftover separators from empty placeholders
    result = re.sub(r'\s*-\s*-\s*', ' - ', result)  # double dashes
    result = re.sub(r'\s*\[\s*\]', '', result)  # empty brackets
    result = re.sub(r'\s*\(\s*\)', '', result)  # empty parens
    result = re.sub(r'^\s*-\s*', '', result)  # leading dash
    result = re.sub(r'\s*-\s*$', '', result)  # trailing dash
    result = result.strip()

    return _sanitize_filename(result) if result else "Unknown"


def download_single(
    url: str,
    output_dir: Optional[str] = None,
    skip_duplicates: bool = True,
    quality: str = "320",
    filename_template: Optional[str] = None,
    normalize: bool = True,
    spotify_meta: Optional[dict] = None,
) -> DownloadProgress:
    """Download a single track. Returns job info (blocks until complete)."""
    fmt_type = "flac" if quality == "flac" else "mp3"
    job = DownloadProgress(
        job_id=str(uuid.uuid4()),
        source=detect_source(url),
        quality=quality,
        format_type=fmt_type,
    )
    _set_job(job)
    _run_download(job, url, output_dir, quality, skip_duplicates, filename_template, normalize, spotify_meta)
    return job


def _run_download(
    job: DownloadProgress,
    url: str,
    output_dir: Optional[str],
    quality: str,
    skip_duplicates: bool,
    filename_template: Optional[str] = None,
    normalize: bool = True,
    spotify_meta: Optional[dict] = None,
):
    """Core download worker — updates job in-place. Used by both sync and async paths."""
    from backend.history import is_duplicate, record_download
    from backend.normalize import normalize_audio

    codec, ext = _resolve_quality(quality)
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
            return

    bitrate = quality if quality != "flac" else "0"
    opts = {
        "format": "bestaudio/best",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": codec,
                "preferredquality": bitrate,
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
        job.filename = os.path.join(dest, f"{info.get('title', 'Unknown')}.{ext}")

        # --- Duplicate check (by title, post-download) ---
        if skip_duplicates and job.title:
            existing = is_duplicate(title=job.title)
            if existing:
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
                return

        # --- Post-download pipeline: normalize → analyze → tag → rename → record ---
        if job.filename and os.path.exists(job.filename):
            # 1. Normalize audio loudness
            if normalize:
                job.status = "normalizing"
                _set_job(job)
                try:
                    normalize_audio(job.filename, quality=quality)
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

            # Enrich with Spotify metadata if available
            if spotify_meta:
                if spotify_meta.get("artist"):
                    artist = spotify_meta["artist"]
                if spotify_meta.get("title"):
                    title = spotify_meta["title"]

            if ext == "mp3":
                tag_kwargs = dict(
                    filepath=job.filename,
                    title=title or info.get("title", ""),
                    artist=artist or info.get("channel", info.get("uploader", "")),
                    album=info.get("album", ""),
                    genre=info.get("genre", ""),
                    bpm=job.bpm,
                    key=job.key,
                    camelot=job.camelot,
                    thumbnail_url=info.get("thumbnail", ""),
                )
                # Enrich with Spotify metadata
                if spotify_meta:
                    if spotify_meta.get("album"):
                        tag_kwargs["album"] = spotify_meta["album"]
                    if spotify_meta.get("album_art"):
                        tag_kwargs["thumbnail_url"] = spotify_meta["album_art"]
                    if spotify_meta.get("genre"):
                        tag_kwargs["genre"] = spotify_meta["genre"]
                    if spotify_meta.get("year"):
                        tag_kwargs["comment"] = f"Released: {spotify_meta['year']}"

                tag_mp3(**tag_kwargs)

            # 4. Rename file using filename template if provided
            final_artist = artist or info.get("channel", info.get("uploader", ""))
            if filename_template and filename_template != "{title}":
                new_name = _apply_filename_template(
                    filename_template,
                    title=title or info.get("title", "Unknown"),
                    artist=final_artist,
                    bpm=job.bpm,
                    key=job.key,
                    camelot=job.camelot,
                    source=job.source,
                )
                new_path = os.path.join(dest, f"{new_name}.{ext}")
                if new_path != job.filename and not os.path.exists(new_path):
                    try:
                        os.rename(job.filename, new_path)
                        job.filename = new_path
                    except OSError:
                        pass  # Keep original name on failure

            # 5. Record in download history
            record_download(
                url=url,
                title=job.title,
                artist=final_artist,
                filename=job.filename,
                source=job.source,
                bpm=job.bpm,
                key=job.key,
                camelot=job.camelot,
                normalized=job.normalized,
                quality=quality,
                format_type=ext,
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


# --- Async (non-blocking) download functions ---


def start_download_single(
    url: str,
    output_dir: Optional[str] = None,
    quality: str = "320",
    filename_template: Optional[str] = None,
    normalize: bool = True,
    spotify_meta: Optional[dict] = None,
) -> DownloadProgress:
    """Start a single download in the background. Returns job immediately."""
    fmt_type = "flac" if quality == "flac" else "mp3"
    job = DownloadProgress(
        job_id=str(uuid.uuid4()),
        source=detect_source(url),
        quality=quality,
        format_type=fmt_type,
    )
    _set_job(job)
    _bg_executor.submit(
        _run_download, job, url, output_dir, quality, True,
        filename_template, normalize, spotify_meta,
    )
    return job


def start_download(
    url: str,
    output_dir: Optional[str] = None,
    quality: str = "320",
    filename_template: Optional[str] = None,
    normalize: bool = True,
) -> list[DownloadProgress]:
    """Start download(s) in background. Returns job list immediately.

    For playlists, extracts the track list first (brief blocking), then submits
    each track to the background pool.
    """
    if is_multi_track(url):
        info = extract_info(url)
        entries = info.get("entries", [])[:MAX_PLAYLIST_SIZE]
        jobs = []
        for entry in entries:
            video_url = entry.get("url") or entry.get("webpage_url")
            if not video_url and entry.get("id"):
                source = detect_source(url)
                if source == "youtube":
                    video_url = f"https://www.youtube.com/watch?v={entry['id']}"
                else:
                    continue
            if video_url:
                jobs.append(start_download_single(
                    video_url, output_dir, quality, filename_template, normalize,
                ))
        return jobs
    return [start_download_single(url, output_dir, quality, filename_template, normalize)]


def start_download_batch(
    urls: list[str],
    output_dir: Optional[str] = None,
    quality: str = "320",
    filename_template: Optional[str] = None,
    normalize: bool = True,
) -> list[DownloadProgress]:
    """Start batch downloads in background. Returns all jobs immediately."""
    all_jobs = []
    for url in urls:
        url = url.strip()
        if not url:
            continue
        try:
            all_jobs.extend(start_download(url, output_dir, quality, filename_template, normalize))
        except Exception:
            continue
    return all_jobs


# --- Synchronous download functions (CLI) ---


def download_multi(
    url: str,
    output_dir: Optional[str] = None,
    quality: str = "320",
    filename_template: Optional[str] = None,
    normalize: bool = True,
) -> list[DownloadProgress]:
    """Download all tracks from a playlist/set/artist page."""
    info = extract_info(url)
    entries = info.get("entries", [])[:MAX_PLAYLIST_SIZE]

    jobs = []
    for entry in entries:
        video_url = entry.get("url") or entry.get("webpage_url")
        if not video_url and entry.get("id"):
            source = detect_source(url)
            if source == "youtube":
                video_url = f"https://www.youtube.com/watch?v={entry['id']}"
            else:
                continue

        if video_url:
            job = download_single(
                video_url, output_dir, quality=quality,
                filename_template=filename_template, normalize=normalize,
            )
            jobs.append(job)

    return jobs


def download(
    url: str,
    output_dir: Optional[str] = None,
    quality: str = "320",
    filename_template: Optional[str] = None,
    normalize: bool = True,
) -> list[DownloadProgress]:
    """Smart download — detects single vs multi-track and downloads accordingly."""
    if is_multi_track(url):
        return download_multi(url, output_dir, quality, filename_template, normalize)
    return [download_single(url, output_dir, quality=quality, filename_template=filename_template, normalize=normalize)]
