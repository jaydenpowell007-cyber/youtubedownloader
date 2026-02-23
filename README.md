# YouTube MP3 Downloader — DJ Edition

A full-stack application for downloading music from YouTube, SoundCloud, and Spotify playlists as high-quality MP3 files. Built for DJs with automatic BPM detection, musical key analysis, Camelot notation, and Rekordbox integration.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Multi-Platform Downloads** — YouTube, SoundCloud, and Spotify playlist support
- **High-Quality Audio** — 320kbps MP3 or FLAC output
- **BPM Detection** — Automatic tempo analysis using librosa
- **Musical Key Analysis** — Key detection with Camelot wheel notation for DJ mixing
- **Audio Normalization** — Consistent loudness across your library
- **ID3 Tagging** — Embedded metadata including artist, title, BPM, key, and artwork
- **Rekordbox Export** — Generate Rekordbox-compatible XML collection files
- **Spotify Import** — Paste a Spotify playlist URL and auto-match tracks on YouTube/SoundCloud
- **Natural Language Search** — Search for music with descriptive queries (e.g., "Don Toliver songs with a bpm of 140")
- **Download History** — Persistent SQLite database with search, deduplication, and management
- **Real-Time Progress** — WebSocket-based progress updates in the web UI
- **Dual Interface** — Full-featured Web UI and CLI

| Capability | CLI | Web UI |
|---|:---:|:---:|
| Download videos/playlists | Yes | Yes |
| Search music | Yes | Yes |
| Spotify import | Yes | Yes |
| BPM & key detection | Yes | Yes |
| Audio normalization | Yes | Yes |
| Download history | Yes | Yes |
| Rekordbox export | Yes | Yes |
| Real-time progress | — | Yes |
| Download queue | — | Yes |
| Settings panel | — | Yes |

## Tech Stack

**Backend**
- Python 3.11, FastAPI, Uvicorn
- yt-dlp (media extraction), librosa (audio analysis), mutagen (ID3 tagging)
- SQLite (download history), WebSockets (real-time progress)

**Frontend**
- Next.js 14, React 18, Tailwind CSS

## Prerequisites

- **Python** 3.11+
- **Node.js** 18+
- **FFmpeg** — required for audio conversion ([install guide](https://ffmpeg.org/download.html))

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/jaydenpowell007-cyber/youtubedownloader.git
   cd youtubedownloader
   ```

2. **Install backend dependencies**

   ```bash
   pip install -r backend/requirements.txt
   ```

3. **Install frontend dependencies**

   ```bash
   cd frontend && npm install
   ```

## Usage

### Web UI

Run both the API server and frontend dev server:

```bash
# Terminal 1 — API server on http://localhost:8000
python cli.py server

# Terminal 2 — Frontend on http://localhost:3000
cd frontend && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### CLI

```bash
# Download a single video
python cli.py download "https://youtube.com/watch?v=VIDEO_ID"

# Download an entire playlist
python cli.py download "https://youtube.com/playlist?list=PLAYLIST_ID"

# Search for music
python cli.py search "Don Toliver songs bpm 140"

# Import a Spotify playlist
python cli.py spotify "https://open.spotify.com/playlist/..."

# View download history
python cli.py history

# Export collection as Rekordbox XML
python cli.py export

# Start the API server
python cli.py server
```

### CLI Options

| Option | Description | Default |
|---|---|---|
| `-o, --output` | Output directory | `~/Downloads/DJ-Music` |
| `-q, --quality` | Audio quality: `128`, `192`, `256`, `320`, `flac` | `320` |
| `-n, --max-results` | Max search results | `10` |
| `-p, --platform` | Platform filter: `youtube`, `soundcloud`, `all` | `all` |

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/download` | Download a URL (blocking) |
| POST | `/api/download/start` | Start an async download |
| POST | `/api/download-selected` | Download multiple URLs |
| POST | `/api/download-selected/start` | Async batch download |
| POST | `/api/download-batch` | Batch download with auto-detect |
| POST | `/api/download-batch/start` | Async batch with auto-detect |
| GET | `/api/job/{id}` | Get download job status |
| POST | `/api/jobs/poll` | Poll multiple job statuses |
| POST | `/api/info` | Get URL metadata |
| POST | `/api/search` | Search YouTube/SoundCloud |
| POST | `/api/spotify/tracks` | Fetch Spotify playlist tracks |
| POST | `/api/spotify/match` | Find YouTube/SoundCloud matches for Spotify tracks |
| POST | `/api/spotify/download` | Full Spotify-to-MP3 workflow |
| POST | `/api/history` | Query download history |
| DELETE | `/api/history/{id}` | Delete a history entry |
| GET | `/api/export/rekordbox` | Export as Rekordbox XML |
| GET/POST | `/api/settings` | Read/update user settings |
| WS | `/ws/progress` | WebSocket for real-time download progress |

## Project Structure

```
youtubedownloader/
├── backend/
│   ├── app.py              # FastAPI routes and WebSocket handler
│   ├── downloader.py       # Core download logic (yt-dlp)
│   ├── search.py           # YouTube/SoundCloud search
│   ├── spotify.py          # Spotify playlist parsing
│   ├── analysis.py         # BPM and key detection
│   ├── tagger.py           # ID3 metadata tagging
│   ├── history.py          # SQLite download history
│   ├── rekordbox.py        # Rekordbox XML export
│   ├── normalize.py        # Audio loudness normalization
│   ├── config.py           # Configuration defaults
│   ├── settings.py         # User settings persistence
│   └── errors.py           # Custom exceptions
├── frontend/
│   ├── app/
│   │   ├── page.jsx        # Main dashboard
│   │   ├── layout.jsx      # Root layout
│   │   └── api/[...path]/  # API proxy route
│   ├── components/
│   │   ├── DownloadTab.jsx # URL input and direct downloads
│   │   ├── SearchTab.jsx   # Music search interface
│   │   ├── SpotifyTab.jsx  # Spotify playlist import
│   │   ├── HistoryTab.jsx  # Download history view
│   │   ├── SettingsTab.jsx # User preferences
│   │   ├── DownloadQueue.jsx # Active downloads list
│   │   ├── QualitySelector.jsx # Quality picker
│   │   └── Toast.jsx       # Toast notifications
│   └── lib/
│       └── api.js          # API client functions
├── cli.py                  # CLI entry point
├── requirements.txt        # Python dependencies
├── Procfile                # Heroku deployment
├── railway.toml            # Railway deployment
├── nixpacks.toml           # Nixpacks build config
└── README.md
```

## Deployment

### Railway

The project includes Railway configuration out of the box. The backend starts with:

```
uvicorn backend.app:app --host 0.0.0.0 --port $PORT
```

FFmpeg is included via `nixpacks.toml`.

### Vercel (Frontend Only)

The Next.js frontend can be deployed to Vercel. You'll need to host the Python backend separately (Railway, Fly.io, or a VPS) and set the `NEXT_PUBLIC_API_URL` environment variable to point to your backend.

## Configuration

| Environment Variable | Description | Default |
|---|---|---|
| `DOWNLOADS_DIR` | Directory where MP3 files are saved | `~/Downloads/DJ-Music` |
| `MAX_PLAYLIST_SIZE` | Maximum tracks per playlist download | `50` |
| `CORS_ORIGINS` | Allowed CORS origins for the API | — |
| `CORS_ORIGIN_REGEX` | Regex pattern for dynamic CORS matching | — |
| `NEXT_PUBLIC_API_URL` | Backend API URL (frontend only) | `http://localhost:8000` |

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create a branch** for your feature or fix (`git checkout -b feature/my-feature`)
3. **Commit** your changes with clear messages
4. **Push** to your fork and open a **Pull Request**

Please make sure your code follows the existing style and that the application runs without errors before submitting.

## License

This project is open source. See the [LICENSE](LICENSE) file for details.
