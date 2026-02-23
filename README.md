# YouTube MP3 Downloader — DJ Edition

Download YouTube videos and playlists as high-quality MP3 files. Search for music in plain English.

## Features

- **Download Link** — Paste any YouTube video or playlist URL to download as 320kbps MP3
- **Search Music** — Describe what you want in plain English (e.g. "Don Toliver songs with a bpm of 140") and pick tracks to download
- **Web UI** — Clean dark interface you can run locally or deploy to Vercel
- **CLI** — Full-featured terminal interface

## Quick Start

### 1. Install Backend Dependencies

```bash
pip install -r backend/requirements.txt
```

> You also need [FFmpeg](https://ffmpeg.org/) installed on your system for MP3 conversion.

### 2. Install Frontend Dependencies

```bash
cd frontend && npm install
```

### 3. Run

**Web UI (run both):**

```bash
# Terminal 1 — API server
python cli.py server

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Then open http://localhost:3000

**CLI only:**

```bash
# Download a single video
python cli.py download "https://youtube.com/watch?v=VIDEO_ID"

# Download a playlist
python cli.py download "https://youtube.com/playlist?list=PLAYLIST_ID"

# Search for music
python cli.py search Don Toliver songs bpm 140
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `python cli.py download <url>` | Download video/playlist as MP3 |
| `python cli.py search <query>` | Search YouTube and pick tracks |
| `python cli.py server` | Start the API server |

### Options

- `-o, --output` — Custom output directory (default: `~/Downloads/DJ-Music`)
- `-n, --max-results` — Max search results (default: 10)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/download` | Download a URL as MP3 |
| POST | `/api/download-selected` | Download multiple URLs |
| POST | `/api/search` | Search YouTube |
| POST | `/api/info` | Get URL metadata |
| GET | `/api/job/{id}` | Check download status |

## Deploy to Vercel

The frontend can be deployed to Vercel — you'll need to host the Python backend separately (e.g. Railway, Fly.io, or a VPS) and set the `NEXT_PUBLIC_API_URL` env variable.

## Downloads

MP3 files are saved to `~/Downloads/DJ-Music` by default. Set the `DOWNLOADS_DIR` environment variable to change this.
