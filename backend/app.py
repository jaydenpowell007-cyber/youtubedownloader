"""FastAPI backend for YouTube MP3 Downloader."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import DOWNLOADS_DIR
from backend.downloader import download, download_single, get_job_status, extract_info, is_playlist
from backend.search import search_youtube

app = FastAPI(title="YouTube MP3 Downloader", version="1.0.0")

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
    max_results: int = 10


class JobStatus(BaseModel):
    job_id: str
    status: str
    title: str
    progress: float
    filename: Optional[str] = None
    error: Optional[str] = None


class SearchResultResponse(BaseModel):
    title: str
    url: str
    duration: str
    channel: str
    thumbnail: str


# --- Endpoints ---


@app.get("/health")
def health():
    return {"status": "ok", "downloads_dir": DOWNLOADS_DIR}


@app.post("/api/download", response_model=list[JobStatus])
async def api_download(req: DownloadRequest):
    """Download a YouTube URL (single video or playlist) as MP3."""
    loop = asyncio.get_event_loop()
    try:
        jobs = await loop.run_in_executor(
            executor, lambda: download(req.url, req.output_dir)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return [
        JobStatus(
            job_id=j.job_id,
            status=j.status,
            title=j.title,
            progress=j.progress,
            filename=j.filename,
            error=j.error,
        )
        for j in jobs
    ]


@app.post("/api/download-selected", response_model=list[JobStatus])
async def api_download_selected(req: DownloadSelectedRequest):
    """Download multiple selected YouTube URLs as MP3."""
    loop = asyncio.get_event_loop()
    all_jobs = []
    for url in req.urls:
        try:
            jobs = await loop.run_in_executor(
                executor, lambda u=url: download_single(u, req.output_dir)
            )
            all_jobs.append(jobs)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed on {url}: {e}")

    return [
        JobStatus(
            job_id=j.job_id,
            status=j.status,
            title=j.title,
            progress=j.progress,
            filename=j.filename,
            error=j.error,
        )
        for j in all_jobs
    ]


@app.get("/api/job/{job_id}", response_model=JobStatus)
def api_job_status(job_id: str):
    """Check the status of a download job."""
    job = get_job_status(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatus(
        job_id=job.job_id,
        status=job.status,
        title=job.title,
        progress=job.progress,
        filename=job.filename,
        error=job.error,
    )


@app.post("/api/info")
async def api_info(req: DownloadRequest):
    """Get metadata about a YouTube URL (title, playlist entries, etc.)."""
    loop = asyncio.get_event_loop()
    try:
        info = await loop.run_in_executor(executor, lambda: extract_info(req.url))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    playlist = is_playlist(req.url)
    entries = []
    if playlist:
        for entry in info.get("entries", []):
            entries.append({
                "title": entry.get("title", "Unknown"),
                "url": entry.get("url") or f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                "duration": entry.get("duration"),
            })

    return {
        "title": info.get("title", "Unknown"),
        "is_playlist": playlist,
        "entry_count": len(entries) if playlist else 1,
        "entries": entries,
        "thumbnail": info.get("thumbnail", ""),
    }


@app.post("/api/search", response_model=list[SearchResultResponse])
async def api_search(req: SearchRequest):
    """Search YouTube for music using natural language."""
    loop = asyncio.get_event_loop()
    try:
        results = await loop.run_in_executor(
            executor, lambda: search_youtube(req.query, req.max_results)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return [
        SearchResultResponse(
            title=r.title,
            url=r.url,
            duration=r.duration,
            channel=r.channel,
            thumbnail=r.thumbnail,
        )
        for r in results
    ]


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
