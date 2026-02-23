#!/usr/bin/env python3
"""CLI for MP3 Downloader — DJ Edition.

Usage:
    python cli.py download <url>            Download a video/track or playlist/set as MP3
    python cli.py search <query>            Search for music and pick tracks to download
    python cli.py spotify <playlist_url>    Import a Spotify playlist
    python cli.py history                   View download history
    python cli.py export                    Export library as Rekordbox XML
    python cli.py server                    Start the API server
"""

import argparse
import sys

from backend.config import DOWNLOADS_DIR
from backend.downloader import download, download_single, is_multi_track, extract_info, detect_source, QUALITY_OPTIONS
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
        if job.normalized:
            extras.append("normalized")
        extra_str = f"  ({', '.join(extras)})" if extras else ""
        print(f"  [OK]    {tag} {job.title}{extra_str}")
    elif job.status == "skipped":
        print(f"  [SKIP]  {tag} {job.title} — {job.skipped_reason or 'duplicate'}")
    else:
        print(f"  [FAIL]  {tag} {job.title or 'Unknown'} — {job.error}")


def cmd_download(args):
    """Download a YouTube or SoundCloud URL as MP3."""
    url = args.url
    output = args.output or DOWNLOADS_DIR
    quality = args.quality
    source = detect_source(url)
    fmt = "FLAC" if quality == "flac" else f"MP3 {quality}kbps"

    print(f"  Source:    {source or 'auto-detect'}")
    print(f"  Quality:   {fmt}")
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

    jobs = download(url, output, quality)

    for job in jobs:
        _print_job_result(job)

    done = sum(1 for j in jobs if j.status == "done")
    skipped = sum(1 for j in jobs if j.status == "skipped")
    print()
    print(f"  Completed: {done}/{len(jobs)} tracks")
    if skipped:
        print(f"  Skipped:   {skipped} (duplicates)")
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

    response = search(query, platform, max_results)
    results = response.results

    if response.parsed_bpm or response.parsed_key:
        extras = []
        if response.parsed_bpm:
            extras.append(f"{response.parsed_bpm} BPM")
        if response.parsed_key:
            extras.append(f"Key: {response.parsed_key}")
        print(f"  Detected: {', '.join(extras)}  (searching: \"{response.cleaned_query}\")")
        print()

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

    quality = args.quality
    for r in selected:
        job = download_single(r.url, output, quality=quality)
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

    quality = args.quality
    for t in selected:
        print(f"  Searching: {t.search_query}")
        response = search(t.search_query, platform, 1)
        if not response.results:
            print(f"  [SKIP]  Not found: {t.artist} — {t.title}")
            continue

        job = download_single(response.results[0].url, output, quality=quality)
        _print_job_result(job)

    print()
    print(f"  Done! Saved to: {output}")
    print()


def cmd_history(args):
    """View download history."""
    from backend.history import get_history, get_history_count

    query = args.search or ""
    total = get_history_count(query)
    entries = get_history(limit=args.limit, search_query=query)

    if query:
        print(f"  Search: \"{query}\"")
    print(f"  Total: {total} track(s)")
    print()

    if not entries:
        print("  No downloads yet.")
        return

    for e in entries:
        extras = []
        if e.bpm:
            extras.append(f"{e.bpm} BPM")
        if e.camelot:
            extras.append(e.camelot)
        if e.key:
            extras.append(e.key)
        if e.normalized:
            extras.append("normalized")
        extra_str = f"  ({', '.join(extras)})" if extras else ""

        source_tag = _source_tag(e.source)
        print(f"  {source_tag} {e.title}{extra_str}")
        print(f"        {e.artist or 'Unknown artist'}  •  {e.downloaded_at}")
        print()


def cmd_export(args):
    """Export library as Rekordbox XML."""
    from backend.rekordbox import generate_rekordbox_xml

    output = args.output or ""
    print("  Generating Rekordbox XML...")
    filepath = generate_rekordbox_xml(output)
    print(f"  Exported to: {filepath}")
    print()
    print("  To import: Rekordbox > File > Import Collection > select the XML file")
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
    dl.add_argument("-q", "--quality", choices=list(QUALITY_OPTIONS), default="320", help="Audio quality (default: 320)")
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
    s.add_argument("-q", "--quality", choices=list(QUALITY_OPTIONS), default="320", help="Audio quality (default: 320)")
    s.set_defaults(func=lambda a: cmd_search(argparse.Namespace(
        query=" ".join(a.query), max_results=a.max_results, platform=a.platform, output=a.output, quality=a.quality
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
    sp.add_argument("-q", "--quality", choices=list(QUALITY_OPTIONS), default="320", help="Audio quality (default: 320)")
    sp.set_defaults(func=cmd_spotify)

    # history
    h = subparsers.add_parser("history", aliases=["h"], help="View download history")
    h.add_argument("-s", "--search", default="", help="Search by title or artist")
    h.add_argument("-n", "--limit", type=int, default=50, help="Max entries to show (default: 50)")
    h.set_defaults(func=cmd_history)

    # export
    ex = subparsers.add_parser("export", aliases=["ex"], help="Export library as Rekordbox XML")
    ex.add_argument("-o", "--output", default="", help="Output path (default: ~/Downloads/DJ-Music/rekordbox_collection.xml)")
    ex.set_defaults(func=cmd_export)

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
