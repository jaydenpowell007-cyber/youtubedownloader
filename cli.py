#!/usr/bin/env python3
"""CLI for MP3 Downloader — DJ Edition.

Usage:
    python cli.py download <url>            Download a video/track or playlist/set as MP3
    python cli.py search <query>            Search for music and pick tracks to download
    python cli.py spotify <playlist_url>    Import a Spotify playlist
    python cli.py server                    Start the API server
"""

import argparse
import sys

from backend.config import DOWNLOADS_DIR
from backend.downloader import download, download_single, is_multi_track, extract_info, detect_source
from backend.search import search


def print_header():
    print()
    print("  ╔══════════════════════════════════════╗")
    print("  ║        MP3 Downloader — DJ Edition   ║")
    print("  ║   YouTube + SoundCloud + Spotify     ║")
    print("  ╚══════════════════════════════════════╝")
    print()


def _source_tag(source: str) -> str:
    if source == "soundcloud":
        return "[SC]"
    if source == "youtube":
        return "[YT]"
    return ""


def _print_job_result(job):
    """Print a download result with BPM/key info."""
    tag = _source_tag(job.source)
    if job.status == "done":
        extras = []
        if job.bpm:
            extras.append(f"{job.bpm} BPM")
        if job.camelot:
            extras.append(job.camelot)
        if job.key:
            extras.append(job.key)
        extra_str = f"  ({', '.join(extras)})" if extras else ""
        print(f"  [OK]    {tag} {job.title}{extra_str}")
    else:
        print(f"  [FAIL]  {tag} {job.title or 'Unknown'} — {job.error}")


def cmd_download(args):
    """Download a YouTube or SoundCloud URL as MP3."""
    url = args.url
    output = args.output or DOWNLOADS_DIR
    source = detect_source(url)

    print(f"  Source:    {source or 'auto-detect'}")
    print(f"  Output:   {output}")
    print()

    if is_multi_track(url):
        info = extract_info(url)
        entries = info.get("entries", [])
        print(f"  Playlist: {info.get('title', 'Unknown')}")
        print(f"  Tracks:   {len(entries)}")
        print()

    print("  Downloading (with BPM/key analysis + tagging)...")
    print()

    jobs = download(url, output)

    for job in jobs:
        _print_job_result(job)

    done = sum(1 for j in jobs if j.status == "done")
    print()
    print(f"  Completed: {done}/{len(jobs)} tracks")
    print(f"  Saved to:  {output}")
    print()


def cmd_search(args):
    """Search for music and optionally download selected results."""
    query = args.query
    platform = args.platform
    max_results = args.max_results

    print(f"  Searching: \"{query}\"")
    print(f"  Platform:  {platform}")
    print()

    results = search(query, platform, max_results)

    if not results:
        print("  No results found.")
        return

    for i, r in enumerate(results, 1):
        tag = _source_tag(r.source)
        print(f"  [{i:2d}]  {tag} {r.title}")
        print(f"        {r.channel}  •  {r.duration}")
        print()

    print("  Enter track numbers to download (comma-separated), or 'q' to quit:")
    print("  Example: 1,3,5  or  all")
    print()

    try:
        choice = input("  > ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print("\n  Cancelled.")
        return

    if choice == "q":
        return

    if choice == "all":
        selected = results
    else:
        try:
            indices = [int(x.strip()) - 1 for x in choice.split(",")]
            selected = [results[i] for i in indices if 0 <= i < len(results)]
        except (ValueError, IndexError):
            print("  Invalid selection.")
            return

    if not selected:
        print("  No tracks selected.")
        return

    output = args.output or DOWNLOADS_DIR
    print()
    print(f"  Downloading {len(selected)} track(s) to {output}...")
    print()

    for r in selected:
        job = download_single(r.url, output)
        _print_job_result(job)

    print()
    print("  Done!")
    print()


def cmd_spotify(args):
    """Import a Spotify playlist — find tracks on YouTube and download."""
    from backend.spotify import get_playlist_tracks

    url = args.url
    output = args.output or DOWNLOADS_DIR
    platform = args.platform

    print(f"  Fetching Spotify playlist...")
    print()

    try:
        playlist_name, tracks = get_playlist_tracks(url)
    except Exception as e:
        print(f"  Error: {e}")
        return

    print(f"  Playlist: {playlist_name}")
    print(f"  Tracks:   {len(tracks)}")
    print()

    for i, t in enumerate(tracks, 1):
        mins, secs = divmod(t.duration_ms // 1000, 60)
        print(f"  [{i:2d}]  {t.artist} — {t.title}")
        print(f"        {t.album}  •  {mins}:{secs:02d}")
        print()

    print("  Enter track numbers to download (comma-separated), or 'q' to quit:")
    print("  Example: 1,3,5  or  all")
    print()

    try:
        choice = input("  > ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print("\n  Cancelled.")
        return

    if choice == "q":
        return

    if choice == "all":
        selected = tracks
    else:
        try:
            indices = [int(x.strip()) - 1 for x in choice.split(",")]
            selected = [tracks[i] for i in indices if 0 <= i < len(tracks)]
        except (ValueError, IndexError):
            print("  Invalid selection.")
            return

    if not selected:
        print("  No tracks selected.")
        return

    print()
    print(f"  Searching {platform} & downloading {len(selected)} track(s)...")
    print()

    for t in selected:
        print(f"  Searching: {t.search_query}")
        results = search(t.search_query, platform, 1)
        if not results:
            print(f"  [SKIP]  Not found: {t.artist} — {t.title}")
            continue

        job = download_single(results[0].url, output)
        _print_job_result(job)

    print()
    print(f"  Done! Saved to: {output}")
    print()


def cmd_server(args):
    """Start the FastAPI server."""
    import uvicorn

    host = args.host or "0.0.0.0"
    port = args.port or 8000
    print(f"  Starting server on {host}:{port}")
    print(f"  API docs:  http://localhost:{port}/docs")
    print()
    uvicorn.run("backend.app:app", host=host, port=port, reload=True)


def main():
    print_header()

    parser = argparse.ArgumentParser(description="MP3 Downloader — DJ Edition (YouTube + SoundCloud + Spotify)")
    subparsers = parser.add_subparsers(dest="command")

    # download
    dl = subparsers.add_parser("download", aliases=["dl"], help="Download a URL as MP3")
    dl.add_argument("url", help="YouTube or SoundCloud URL (video, track, playlist, set)")
    dl.add_argument("-o", "--output", help="Output directory (default: ~/Downloads/DJ-Music)")
    dl.set_defaults(func=cmd_download)

    # search
    s = subparsers.add_parser("search", aliases=["s"], help="Search for music and download")
    s.add_argument("query", nargs="+", help="Natural language search query")
    s.add_argument("-n", "--max-results", type=int, default=10, help="Max results per platform (default: 10)")
    s.add_argument(
        "-p", "--platform",
        choices=["all", "youtube", "soundcloud"],
        default="all",
        help="Platform to search (default: all)",
    )
    s.add_argument("-o", "--output", help="Output directory (default: ~/Downloads/DJ-Music)")
    s.set_defaults(func=lambda a: cmd_search(argparse.Namespace(
        query=" ".join(a.query), max_results=a.max_results, platform=a.platform, output=a.output
    )))

    # spotify
    sp = subparsers.add_parser("spotify", aliases=["sp"], help="Import a Spotify playlist")
    sp.add_argument("url", help="Spotify playlist URL")
    sp.add_argument(
        "-p", "--platform",
        choices=["youtube", "soundcloud"],
        default="youtube",
        help="Platform to search tracks on (default: youtube)",
    )
    sp.add_argument("-o", "--output", help="Output directory (default: ~/Downloads/DJ-Music)")
    sp.set_defaults(func=cmd_spotify)

    # server
    srv = subparsers.add_parser("server", help="Start the API server")
    srv.add_argument("--host", default="0.0.0.0", help="Host (default: 0.0.0.0)")
    srv.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")
    srv.set_defaults(func=cmd_server)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    args.func(args)


if __name__ == "__main__":
    main()
