#!/usr/bin/env python3
"""CLI for YouTube MP3 Downloader.

Usage:
    python cli.py download <url>            Download a video or playlist as MP3
    python cli.py search <query>            Search for music and pick tracks to download
    python cli.py server                    Start the API server
"""

import argparse
import sys

from backend.config import DOWNLOADS_DIR
from backend.downloader import download, download_single, is_playlist, extract_info
from backend.search import search_youtube


def print_header():
    print()
    print("  ╔══════════════════════════════════════╗")
    print("  ║       YouTube MP3 Downloader         ║")
    print("  ║            DJ Edition                ║")
    print("  ╚══════════════════════════════════════╝")
    print()


def cmd_download(args):
    """Download a YouTube URL as MP3."""
    url = args.url
    output = args.output or DOWNLOADS_DIR

    print(f"  Output directory: {output}")
    print()

    if is_playlist(url):
        info = extract_info(url)
        entries = info.get("entries", [])
        print(f"  Playlist: {info.get('title', 'Unknown')}")
        print(f"  Tracks:   {len(entries)}")
        print()

    print("  Downloading...")
    print()

    jobs = download(url, output)

    for job in jobs:
        if job.status == "done":
            print(f"  [OK]    {job.title}")
        else:
            print(f"  [FAIL]  {job.title or 'Unknown'} — {job.error}")

    done = sum(1 for j in jobs if j.status == "done")
    print()
    print(f"  Completed: {done}/{len(jobs)} tracks")
    print(f"  Saved to:  {output}")
    print()


def cmd_search(args):
    """Search YouTube for music and optionally download selected results."""
    query = args.query
    max_results = args.max_results

    print(f"  Searching: \"{query}\"")
    print()

    results = search_youtube(query, max_results)

    if not results:
        print("  No results found.")
        return

    for i, r in enumerate(results, 1):
        print(f"  [{i:2d}]  {r.title}")
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
        if job.status == "done":
            print(f"  [OK]    {job.title}")
        else:
            print(f"  [FAIL]  {r.title} — {job.error}")

    print()
    print("  Done!")
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

    parser = argparse.ArgumentParser(description="YouTube MP3 Downloader — DJ Edition")
    subparsers = parser.add_subparsers(dest="command")

    # download
    dl = subparsers.add_parser("download", aliases=["dl"], help="Download a YouTube URL as MP3")
    dl.add_argument("url", help="YouTube video or playlist URL")
    dl.add_argument("-o", "--output", help="Output directory (default: ~/Downloads/DJ-Music)")
    dl.set_defaults(func=cmd_download)

    # search
    s = subparsers.add_parser("search", aliases=["s"], help="Search for music and download")
    s.add_argument("query", nargs="+", help="Natural language search query")
    s.add_argument("-n", "--max-results", type=int, default=10, help="Max results (default: 10)")
    s.add_argument("-o", "--output", help="Output directory (default: ~/Downloads/DJ-Music)")
    s.set_defaults(func=lambda a: cmd_search(argparse.Namespace(
        query=" ".join(a.query), max_results=a.max_results, output=a.output
    )))

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
