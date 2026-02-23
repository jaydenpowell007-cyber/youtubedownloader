"""FastAPI backend for YouTube & SoundCloud MP3 Downloader."""

import asyncio
import json
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.config import DOWNLOADS_DIR
from backend.downloader import (
    download,
    download_single,
    get_job_status,
    extract_info,
    is_multi_track,
    detect_source,
    start_download,
    start_download_single,
    start_download_batch,
    register_ws_listener,
    unregister_ws_listener,
    QUALITY_OPTIONS,
)
from backend.search import search
from backend.spotify import get_playlist_tracks
from backend.history import get_history, get_history_count, delete_entry
from backend.rekordbox import generate_rekordbox_xml
from backend import settings as user_settings

app = FastAPI(title="MP3 Downloader — DJ Edition", version="5.0.0")

# CORS: configurable via env, defaults to localhost dev
_cors_origins = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,"
    "https://youtubedownloader-red.vercel.app,"
    "https://youtubedownloader-git-main-jaydens-projects-b3bceb91.vercel.app,"
    "https://youtubedownloader-d191lwvaa-jaydens-projects-b3bceb91.vercel.app",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

executor = ThreadPoolExecutor(max_workers=4)


# --- Request / Response models ---


class DownloadRequest(BaseModel):
    url: str
    output_dir: Optional[str] = None
    quality: str = "320"


class BatchDownloadRequest(BaseModel):
    urls: list[str]
    output_dir: Optional[str] = None
    quality: str = "320"


class DownloadSelectedRequest(BaseModel):
    urls: list[str]
    output_dir: Optional[str] = None
    quality: str = "320"


class SearchRequest(BaseModel):
    query: str
    platform: str = "all"
    max_results: int = 10


class SpotifyImportRequest(BaseModel):
    url: str
    platform: str = "youtube"
    output_dir: Optional[str] = None


class SpotifyMatchRequest(BaseModel):
    """Request to find YouTube matches for Spotify tracks."""
    tracks: list[dict]
    platform: str = "youtube"
    max_results: int = 3


class SpotifyDownloadMatchedRequest(BaseModel):
    """Download specific YouTube URLs with Spotify metadata enrichment."""
    items: list[dict]  # Each: {url, spotify_meta: {title, artist, album, album_art, year}}
    quality: str = "320"


class HistoryRequest(BaseModel):
    limit: int = 100
    offset: int = 0
    search: str = ""


class SettingsUpdateRequest(BaseModel):
    settings: dict


class JobStatus(BaseModel):
    job_id: str
    status: str
    title: str
    progress: float
    filename: Optional[str] = None
    error: Optional[str] = None
    source: str = ""
    bpm: Optional[int] = None
    key: Optional[str] = None
    camelot: Optional[str] = None
    normalized: bool = False
    skipped_reason: Optional[str] = None
    quality: str = "320"
    format_type: str = "mp3"


class SearchResultResponse(BaseModel):
    title: str
    url: str
    duration: str
    channel: str
    thumbnail: str
    source: str


class SpotifyTrackResponse(BaseModel):
    title: str
    artist: str
    album: str
    duration_ms: int
    search_query: str
    album_art: str = ""
    release_year: str = ""


class HistoryEntryResponse(BaseModel):
    id: int
    url: str
    title: str
    artist: str
    filename: str
    source: str
    bpm: Optional[int] = None
    key: Optional[str] = None
    camelot: Optional[str] = None
    downloaded_at: str
    normalized: bool
    quality: str = "320"
    format_type: str = "mp3"


class HistoryResponse(BaseModel):
    entries: list[HistoryEntryResponse]
    total: int


def _job_to_status(j) -> JobStatus:
    return JobStatus(
        job_id=j.job_id,
        status=j.status,
        title=j.title,
        progress=j.progress,
        filename=j.filename,
        error=j.error,
        source=j.source,
        bpm=j.bpm,
        key=j.key,
        camelot=j.camelot,
        normalized=getattr(j, "normalized", False),
        skipped_reason=getattr(j, "skipped_reason", None),
        quality=getattr(j, "quality", "320"),
        format_type=getattr(j, "format_type", "mp3"),
    )


def _get_settings_for_download() -> dict:
    """Load user settings relevant to downloads."""
    s = user_settings.get_all()
    return {
        "filename_template": s.get("filename_template", "{artist} - {title}"),
        "normalize": s.get("normalize", True),
    }


# --- Endpoints ---


@app.get("/health")
def health():
    return {"status": "ok", "downloads_dir": DOWNLOADS_DIR}


# --- WebSocket for real-time progress ---


@app.websocket("/ws/progress")
async def ws_progress(websocket: WebSocket):
    """WebSocket endpoint for real-time job progress updates."""
    await websocket.accept()
    queue = asyncio.Queue()
    register_ws_listener(queue)
    try:
        while True:
            data = await queue.get()
            await websocket.send_json(data)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        unregister_ws_listener(queue)


# --- Settings ---


@app.get("/api/settings")
def api_get_settings():
    """Get all user settings."""
    return user_settings.get_all()


@app.post("/api/settings")
def api_update_settings(req: SettingsUpdateRequest):
    """Update user settings."""
    return user_settings.update_many(req.settings)


# --- Download Endpoints ---


@app.post("/api/download", response_model=list[JobStatus])
async def api_download(req: DownloadRequest):
    """Download a YouTube or SoundCloud URL (single track or playlist/set). Blocks until complete."""
    loop = asyncio.get_event_loop()
    ds = _get_settings_for_download()
    try:
        jobs = await loop.run_in_executor(
            executor, lambda: download(req.url, req.output_dir, req.quality,
                                       ds["filename_template"], ds["normalize"])
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return [_job_to_status(j) for j in jobs]


@app.post("/api/download/start", response_model=list[JobStatus])
async def api_download_start(req: DownloadRequest):
    """Start download in background. Returns job IDs immediately."""
    loop = asyncio.get_event_loop()
    ds = _get_settings_for_download()
    try:
        jobs = await loop.run_in_executor(
            executor, lambda: start_download(req.url, req.output_dir, req.quality,
                                             ds["filename_template"], ds["normalize"])
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return [_job_to_status(j) for j in jobs]


@app.post("/api/download-selected", response_model=list[JobStatus])
async def api_download_selected(req: DownloadSelectedRequest):
    """Download multiple selected URLs. Blocks until complete."""
    loop = asyncio.get_event_loop()
    ds = _get_settings_for_download()
    all_jobs = []
    for url in req.urls:
        try:
            job = await loop.run_in_executor(
                executor, lambda u=url: download_single(u, req.output_dir, quality=req.quality,
                                                        filename_template=ds["filename_template"],
                                                        normalize=ds["normalize"])
            )
            all_jobs.append(job)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed on {url}: {e}")
    return [_job_to_status(j) for j in all_jobs]


@app.post("/api/download-selected/start", response_model=list[JobStatus])
async def api_download_selected_start(req: DownloadSelectedRequest):
    """Start multiple downloads in background. Returns immediately."""
    ds = _get_settings_for_download()
    jobs = []
    for url in req.urls:
        url = url.strip()
        if url:
            jobs.append(start_download_single(url, req.output_dir, req.quality,
                                              ds["filename_template"], ds["normalize"]))
    return [_job_to_status(j) for j in jobs]


@app.get("/api/job/{job_id}", response_model=JobStatus)
def api_job_status(job_id: str):
    """Check the status of a download job."""
    job = get_job_status(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_status(job)


class PollJobsRequest(BaseModel):
    job_ids: list[str]


@app.post("/api/jobs/poll", response_model=list[JobStatus])
def api_poll_jobs(req: PollJobsRequest):
    """Poll multiple jobs at once. Returns current status for each."""
    results = []
    for job_id in req.job_ids:
        job = get_job_status(job_id)
        if job:
            results.append(_job_to_status(job))
    return results


@app.post("/api/info")
async def api_info(req: DownloadRequest):
    """Get metadata about a YouTube or SoundCloud URL."""
    loop = asyncio.get_event_loop()
    try:
        info = await loop.run_in_executor(executor, lambda: extract_info(req.url))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    source = detect_source(req.url)
    multi = is_multi_track(req.url)
    entries = []
    if multi:
        for entry in info.get("entries", []):
            entry_url = entry.get("url") or entry.get("webpage_url") or ""
            if not entry_url and entry.get("id") and source == "youtube":
                entry_url = f"https://www.youtube.com/watch?v={entry['id']}"
            entries.append({
                "title": entry.get("title", "Unknown"),
                "url": entry_url,
                "duration": entry.get("duration"),
            })

    return {
        "title": info.get("title", "Unknown"),
        "is_playlist": multi,
        "entry_count": len(entries) if multi else 1,
        "entries": entries,
        "thumbnail": info.get("thumbnail", ""),
        "source": source,
    }


@app.post("/api/search", response_model=list[SearchResultResponse])
async def api_search(req: SearchRequest):
    """Search YouTube and/or SoundCloud for music using natural language."""
    loop = asyncio.get_event_loop()
    try:
        results = await loop.run_in_executor(
            executor, lambda: search(req.query, req.platform, req.max_results)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return [
        SearchResultResponse(
            title=r.title, url=r.url, duration=r.duration,
            channel=r.channel, thumbnail=r.thumbnail, source=r.source,
        )
        for r in results
    ]


# --- Spotify Import ---


@app.post("/api/spotify/tracks", response_model=list[SpotifyTrackResponse])
async def api_spotify_tracks(req: SpotifyImportRequest):
    """Fetch track listing from a Spotify playlist (no download yet)."""
    loop = asyncio.get_event_loop()
    try:
        name, tracks = await loop.run_in_executor(
            executor, lambda: get_playlist_tracks(req.url)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return [
        SpotifyTrackResponse(
            title=t.title, artist=t.artist, album=t.album,
            duration_ms=t.duration_ms, search_query=t.search_query,
            album_art=t.album_art, release_year=t.release_year,
        )
        for t in tracks
    ]


@app.post("/api/spotify/match")
async def api_spotify_match(req: SpotifyMatchRequest):
    """Find YouTube/SoundCloud matches for Spotify tracks.

    Returns a list of {spotify_track, matches: [{title, url, duration, channel, thumbnail, source}]}
    """
    loop = asyncio.get_event_loop()
    results = []

    for track_data in req.tracks:
        query = track_data.get("search_query", "")
        if not query:
            continue

        try:
            matches = await loop.run_in_executor(
                executor, lambda q=query: search(q, req.platform, req.max_results)
            )
            results.append({
                "spotify_track": track_data,
                "matches": [
                    {
                        "title": m.title,
                        "url": m.url,
                        "duration": m.duration,
                        "channel": m.channel,
                        "thumbnail": m.thumbnail,
                        "source": m.source,
                    }
                    for m in matches
                ],
            })
        except Exception:
            results.append({
                "spotify_track": track_data,
                "matches": [],
            })

    return results


@app.post("/api/spotify/download-matched", response_model=list[JobStatus])
async def api_spotify_download_matched(req: SpotifyDownloadMatchedRequest):
    """Download YouTube URLs with Spotify metadata enrichment."""
    ds = _get_settings_for_download()
    jobs = []
    for item in req.items:
        url = item.get("url", "").strip()
        if not url:
            continue
        spotify_meta = item.get("spotify_meta", {})
        job = start_download_single(
            url, None, req.quality,
            ds["filename_template"], ds["normalize"],
            spotify_meta=spotify_meta,
        )
        jobs.append(job)
    return [_job_to_status(j) for j in jobs]


@app.post("/api/spotify/download", response_model=list[JobStatus])
async def api_spotify_download(req: SpotifyImportRequest):
    """Import a Spotify playlist: fetch tracks, search on YouTube/SC, download as MP3."""
    loop = asyncio.get_event_loop()
    ds = _get_settings_for_download()

    try:
        name, tracks = await loop.run_in_executor(
            executor, lambda: get_playlist_tracks(req.url)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Spotify error: {e}")

    all_jobs = []
    for track in tracks:
        try:
            results = await loop.run_in_executor(
                executor,
                lambda q=track.search_query: search(q, req.platform, 1),
            )
            if results:
                spotify_meta = {
                    "title": track.title,
                    "artist": track.artist,
                    "album": track.album,
                    "album_art": track.album_art,
                    "year": track.release_year,
                }
                job = await loop.run_in_executor(
                    executor,
                    lambda u=results[0].url, sm=spotify_meta: download_single(
                        u, req.output_dir,
                        filename_template=ds["filename_template"],
                        normalize=ds["normalize"],
                        spotify_meta=sm,
                    ),
                )
                all_jobs.append(job)
        except Exception:
            continue

    return [_job_to_status(j) for j in all_jobs]


# --- Batch Download ---


@app.post("/api/download-batch", response_model=list[JobStatus])
async def api_download_batch(req: BatchDownloadRequest):
    """Download multiple URLs — each auto-detects single vs playlist. Blocks until complete."""
    loop = asyncio.get_event_loop()
    ds = _get_settings_for_download()
    all_jobs = []
    for url in req.urls:
        url = url.strip()
        if not url:
            continue
        try:
            jobs = await loop.run_in_executor(
                executor, lambda u=url: download(u, req.output_dir, req.quality,
                                                 ds["filename_template"], ds["normalize"])
            )
            all_jobs.extend(jobs)
        except Exception:
            continue
    return [_job_to_status(j) for j in all_jobs]


@app.post("/api/download-batch/start", response_model=list[JobStatus])
async def api_download_batch_start(req: BatchDownloadRequest):
    """Start batch downloads in background. Returns immediately."""
    loop = asyncio.get_event_loop()
    ds = _get_settings_for_download()
    try:
        jobs = await loop.run_in_executor(
            executor, lambda: start_download_batch(req.urls, req.output_dir, req.quality,
                                                   ds["filename_template"], ds["normalize"])
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return [_job_to_status(j) for j in jobs]


# --- Download History ---


@app.post("/api/history", response_model=HistoryResponse)
async def api_history(req: HistoryRequest):
    """Get download history with optional search."""
    loop = asyncio.get_event_loop()
    entries = await loop.run_in_executor(
        executor,
        lambda: get_history(req.limit, req.offset, req.search),
    )
    total = await loop.run_in_executor(
        executor,
        lambda: get_history_count(req.search),
    )
    return HistoryResponse(
        entries=[
            HistoryEntryResponse(
                id=e.id,
                url=e.url,
                title=e.title,
                artist=e.artist,
                filename=e.filename,
                source=e.source,
                bpm=e.bpm,
                key=e.key,
                camelot=e.camelot,
                downloaded_at=e.downloaded_at,
                normalized=e.normalized,
                quality=getattr(e, "quality", "320"),
                format_type=getattr(e, "format_type", "mp3"),
            )
            for e in entries
        ],
        total=total,
    )


@app.delete("/api/history/{entry_id}")
async def api_history_delete(entry_id: int):
    """Delete a history entry."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(executor, lambda: delete_entry(entry_id))
    return {"status": "ok"}


# --- Rekordbox Export ---


@app.get("/api/export/rekordbox")
async def api_export_rekordbox():
    """Generate and download a Rekordbox-compatible XML collection file."""
    loop = asyncio.get_event_loop()
    try:
        filepath = await loop.run_in_executor(executor, generate_rekordbox_xml)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")

    if not os.path.exists(filepath):
        raise HTTPException(status_code=500, detail="Export file not created")

    return FileResponse(
        filepath,
        media_type="application/xml",
        filename="rekordbox_collection.xml",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
