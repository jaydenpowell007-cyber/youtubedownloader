"""FastAPI backend for YouTube & SoundCloud MP3 Downloader."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import DOWNLOADS_DIR
from backend.downloader import (
    download,
    download_single,
    get_job_status,
    extract_info,
    is_multi_track,
    detect_source,
)
from backend.search import search
from backend.spotify import get_playlist_tracks

app = FastAPI(title="MP3 Downloader — DJ Edition", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

executor = ThreadPoolExecutor(max_workers=4)


# --- Request / Response models ---


class DownloadRequest(BaseModel):
    url: str
    output_dir: Optional[str] = None


class DownloadSelectedRequest(BaseModel):
    urls: list[str]
    output_dir: Optional[str] = None


class SearchRequest(BaseModel):
    query: str
    platform: str = "all"
    max_results: int = 10


class SpotifyImportRequest(BaseModel):
    url: str
    platform: str = "youtube"  # which platform to search for tracks on
    output_dir: Optional[str] = None


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
    )


# --- Endpoints ---


@app.get("/health")
def health():
    return {"status": "ok", "downloads_dir": DOWNLOADS_DIR}


@app.post("/api/download", response_model=list[JobStatus])
async def api_download(req: DownloadRequest):
    """Download a YouTube or SoundCloud URL (single track or playlist/set) as MP3."""
    loop = asyncio.get_event_loop()
    try:
        jobs = await loop.run_in_executor(
            executor, lambda: download(req.url, req.output_dir)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return [_job_to_status(j) for j in jobs]


@app.post("/api/download-selected", response_model=list[JobStatus])
async def api_download_selected(req: DownloadSelectedRequest):
    """Download multiple selected URLs as MP3."""
    loop = asyncio.get_event_loop()
    all_jobs = []
    for url in req.urls:
        try:
            job = await loop.run_in_executor(
                executor, lambda u=url: download_single(u, req.output_dir)
            )
            all_jobs.append(job)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed on {url}: {e}")
    return [_job_to_status(j) for j in all_jobs]


@app.get("/api/job/{job_id}", response_model=JobStatus)
def api_job_status(job_id: str):
    """Check the status of a download job."""
    job = get_job_status(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_status(job)


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
        )
        for t in tracks
    ]


@app.post("/api/spotify/download", response_model=list[JobStatus])
async def api_spotify_download(req: SpotifyImportRequest):
    """Import a Spotify playlist: fetch tracks, search on YouTube/SC, download as MP3."""
    loop = asyncio.get_event_loop()

    # 1. Get Spotify track list
    try:
        name, tracks = await loop.run_in_executor(
            executor, lambda: get_playlist_tracks(req.url)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Spotify error: {e}")

    # 2. For each track, search and download the top result
    all_jobs = []
    for track in tracks:
        try:
            results = await loop.run_in_executor(
                executor,
                lambda q=track.search_query: search(q, req.platform, 1),
            )
            if results:
                job = await loop.run_in_executor(
                    executor,
                    lambda u=results[0].url: download_single(u, req.output_dir),
                )
                all_jobs.append(job)
        except Exception:
            continue  # Skip tracks that fail

    return [_job_to_status(j) for j in all_jobs]


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
