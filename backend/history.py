"""SQLite-backed download history for persistent tracking."""

import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from backend.config import DOWNLOADS_DIR

DB_PATH = os.path.join(DOWNLOADS_DIR, ".history.db")


@dataclass
class HistoryEntry:
    id: int
    url: str
    title: str
    artist: str
    filename: str
    source: str
    bpm: Optional[int]
    key: Optional[str]
    camelot: Optional[str]
    downloaded_at: str
    normalized: bool
    quality: str = "320"
    format_type: str = "mp3"


def _get_conn() -> sqlite3.Connection:
    """Get a SQLite connection, creating the DB and table if needed."""
    Path(DOWNLOADS_DIR).mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            artist TEXT NOT NULL DEFAULT '',
            filename TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT '',
            bpm INTEGER,
            key_name TEXT,
            camelot TEXT,
            downloaded_at TEXT NOT NULL DEFAULT (datetime('now')),
            normalized INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_downloads_title ON downloads(title)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_downloads_url ON downloads(url)")
    # Migrate: add columns if they don't exist yet
    for col, default in [("quality", "'320'"), ("format_type", "'mp3'")]:
        try:
            conn.execute(f"ALTER TABLE downloads ADD COLUMN {col} TEXT NOT NULL DEFAULT {default}")
        except sqlite3.OperationalError:
            pass  # Column already exists
    conn.commit()
    return conn


def record_download(
    url: str,
    title: str,
    artist: str = "",
    filename: str = "",
    source: str = "",
    bpm: Optional[int] = None,
    key: Optional[str] = None,
    camelot: Optional[str] = None,
    normalized: bool = False,
    quality: str = "320",
    format_type: str = "mp3",
) -> int:
    """Record a completed download. Returns the row ID."""
    conn = _get_conn()
    try:
        cur = conn.execute(
            """INSERT INTO downloads (url, title, artist, filename, source, bpm, key_name, camelot, normalized, quality, format_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (url, title, artist, filename, source, bpm, key, camelot, int(normalized), quality, format_type),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def is_duplicate(title: str = "", url: str = "") -> Optional[HistoryEntry]:
    """Check if a track has already been downloaded (by URL or title).

    Returns the existing entry if found, None otherwise.
    """
    conn = _get_conn()
    try:
        # Check by URL first (exact match)
        if url:
            row = conn.execute(
                "SELECT * FROM downloads WHERE url = ? LIMIT 1", (url,)
            ).fetchone()
            if row:
                return _row_to_entry(row)

        # Check by title (case-insensitive)
        if title:
            row = conn.execute(
                "SELECT * FROM downloads WHERE LOWER(title) = LOWER(?) LIMIT 1",
                (title,),
            ).fetchone()
            if row:
                return _row_to_entry(row)

        return None
    finally:
        conn.close()


def check_file_exists(title: str) -> Optional[str]:
    """Check if an MP3 file with this title already exists on disk."""
    filepath = os.path.join(DOWNLOADS_DIR, f"{title}.mp3")
    if os.path.exists(filepath):
        return filepath
    return None


def get_history(
    limit: int = 100, offset: int = 0, search_query: str = ""
) -> list[HistoryEntry]:
    """Get download history, newest first."""
    conn = _get_conn()
    try:
        if search_query:
            rows = conn.execute(
                """SELECT * FROM downloads
                   WHERE title LIKE ? OR artist LIKE ?
                   ORDER BY downloaded_at DESC LIMIT ? OFFSET ?""",
                (f"%{search_query}%", f"%{search_query}%", limit, offset),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM downloads ORDER BY downloaded_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return [_row_to_entry(r) for r in rows]
    finally:
        conn.close()


def get_all_for_export() -> list[HistoryEntry]:
    """Get all download entries for Rekordbox export."""
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM downloads ORDER BY downloaded_at DESC"
        ).fetchall()
        return [_row_to_entry(r) for r in rows]
    finally:
        conn.close()


def get_history_count(search_query: str = "") -> int:
    """Get total count of history entries."""
    conn = _get_conn()
    try:
        if search_query:
            row = conn.execute(
                """SELECT COUNT(*) FROM downloads
                   WHERE title LIKE ? OR artist LIKE ?""",
                (f"%{search_query}%", f"%{search_query}%"),
            ).fetchone()
        else:
            row = conn.execute("SELECT COUNT(*) FROM downloads").fetchone()
        return row[0] if row else 0
    finally:
        conn.close()


def delete_entry(entry_id: int) -> bool:
    """Delete a history entry by ID."""
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM downloads WHERE id = ?", (entry_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def _row_to_entry(row) -> HistoryEntry:
    return HistoryEntry(
        id=row[0],
        url=row[1],
        title=row[2],
        artist=row[3],
        filename=row[4],
        source=row[5],
        bpm=row[6],
        key=row[7],
        camelot=row[8],
        downloaded_at=row[9],
        normalized=bool(row[10]),
        quality=row[11] if len(row) > 11 else "320",
        format_type=row[12] if len(row) > 12 else "mp3",
    )
