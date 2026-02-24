# YouTube MP3 Downloader — DJ Edition

A full-stack application for downloading music from YouTube, SoundCloud, and Spotify playlists as high-quality MP3 files. Built for DJs with automatic BPM detection, musical key analysis, Camelot notation, and Rekordbox integration.

## Table of Contents

- [Features](#features)
- [Stem Separation (Demucs)](#stem-separation-demucs)
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
- **AI Stem Separation** — Isolate vocals, drums, bass, and other instruments using Demucs (Meta)
- **BPM Detection** — Automatic tempo analysis using librosa
- **Musical Key Analysis** — Key detection with Camelot wheel notation for DJ mixing
- **Audio Normalization** — Consistent loudness across your library
- **ID3 Tagging** — Embedded metadata including artist, title, BPM, key, and artwork
- **Rekordbox Export** — Generate Rekordbox-compatible XML collection files
- **Spotify Import** — Paste a Spotify playlist URL and auto-match tracks on YouTube/SoundCloud (no API key required)
- **Natural Language Search** — Search for music with descriptive queries (e.g., "Don Toliver songs with a bpm of 140")
- **Download History** — Persistent SQLite database with search, deduplication, and management
- **Real-Time Progress** — WebSocket-based progress updates in the web UI
- **Dual Interface** — Full-featured Web UI and CLI

| Capability | CLI | Web UI |
|---|:---:|:---:|
| Download videos/playlists | Yes | Yes |
| Search music | Yes | Yes |
| Spotify import | Yes | Yes |
| AI stem separation | — | Yes |
| BPM & key detection | Yes | Yes |
| Audio normalization | Yes | Yes |
| Download history | Yes | Yes |
| Rekordbox export | Yes | Yes |
| Real-time progress | — | Yes |
| Download queue | — | Yes |
| Settings panel | — | Yes |

## Stem Separation (Demucs)

This app includes AI-powered stem separation using **Demucs**, an open-source audio source separation model developed by Meta (Facebook AI Research). Stem separation takes a mixed audio track and splits it into its individual components — so you can isolate the vocals from a song, pull out just the drums, or create an instrumental version with the singing removed.

### What is Demucs?

Demucs is a deep learning model trained on thousands of hours of music. It uses a hybrid architecture (transformer + U-Net) to analyze the frequencies and patterns in an audio file and predict which parts belong to which instrument. The model used here is **HTDemucs** (Hybrid Transformer Demucs), which is the latest and most accurate version.

### Available stems

Demucs separates audio into four stems:

| Stem | What it contains |
|---|---|
| **Vocals** | Singing, rapping, spoken word — any human voice |
| **Drums** | Kick, snare, hi-hats, cymbals, percussion |
| **Bass** | Bass guitar, sub-bass, 808s, synth bass |
| **Other** | Everything else — guitars, synths, keys, pads, effects |

You can also select **Instrumental**, which automatically mixes the drums, bass, and other stems together — giving you the full track minus the vocals.

### How it works in this app

1. **Paste a URL or upload a file** in the Stems tab
2. **Pick which stems you want** — vocals, drums, bass, other, instrumental, or any combination
3. The app downloads the track (if URL), runs it through the Demucs model, and packages your selected stems into a ZIP file
4. **Download the ZIP** containing each stem as a separate WAV file

### Quality tips

- Stem separation works best with **high-quality source audio** (192kbps+). The app will warn you if the input audio is low bitrate.
- Output stems are always **lossless WAV** files to preserve quality after separation.
- Processing runs on CPU by default. A typical 3–4 minute track takes around 30–60 seconds to separate depending on your hardware.

### Use cases for DJs

- **Create acapellas** — extract vocals for mashups and remixes
- **Isolate drums** — sample breakbeats or practice over the rhythm section
- **Make instrumentals** — remove vocals for live mixing or karaoke
- **Layer stems** — bring in individual parts during a live set for creative transitions

## Tech Stack

**Backend**
- Python 3.11, FastAPI, Uvicorn
- yt-dlp (media extraction), librosa (audio analysis), mutagen (ID3 tagging)
- Demucs (AI stem separation), SQLite (download history), WebSockets (real-time progress)

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
   pip install -r requirements.txt
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
| GET | `/api/download-file/{job_id}` | Serve completed download file |
| POST | `/api/info` | Get URL metadata |
| POST | `/api/search` | Search YouTube/SoundCloud |
| POST | `/api/spotify/tracks` | Fetch Spotify playlist tracks |
| POST | `/api/spotify/match` | Find YouTube/SoundCloud matches for Spotify tracks |
| POST | `/api/spotify/download-matched` | Download matched YouTube URLs with Spotify metadata |
| POST | `/api/spotify/download` | Full Spotify-to-MP3 workflow |
| POST | `/api/stems/start` | Start stem separation from URL |
| POST | `/api/stems/upload` | Upload audio file for stem separation |
| GET | `/api/stems/download/{job_id}` | Download ZIP of separated stems |
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
│   ├── separator.py        # Demucs AI stem separation
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
│   │   ├── page.jsx        # Main dashboard (tabbed UI)
│   │   ├── layout.jsx      # Root layout
│   │   └── api/[...path]/  # API proxy route
│   ├── components/
│   │   ├── DownloadTab.jsx   # URL input and direct downloads
│   │   ├── SearchTab.jsx     # Music search interface
│   │   ├── SpotifyTab.jsx    # Spotify playlist import
│   │   ├── StemsTab.jsx      # Stem separation (URL or upload)
│   │   ├── HistoryTab.jsx    # Download history view
│   │   ├── SettingsTab.jsx   # User preferences
│   │   ├── DownloadQueue.jsx # Active downloads list
│   │   ├── QualitySelector.jsx # Quality picker
│   │   ├── StemSelector.jsx  # Stem track picker
│   │   └── Toast.jsx         # Toast notifications
│   └── lib/
│       └── api.js          # API client functions
├── cli.py                  # CLI entry point
├── requirements.txt        # Python dependencies
├── Procfile                # Railway/Heroku process definition
├── railway.toml            # Railway deployment config
├── nixpacks.toml           # Nixpacks build config (FFmpeg)
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
