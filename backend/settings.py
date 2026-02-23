"""Persistent user settings stored in SQLite alongside download history."""

import json
import os
import sqlite3
from pathlib import Path

from backend.config import DOWNLOADS_DIR

SETTINGS_DB_PATH = os.path.join(DOWNLOADS_DIR, ".settings.db")

# Default settings
DEFAULTS = {
    "quality": "320",
    "normalize": True,
    "filename_template": "{artist} - {title}",
    "concurrent_downloads": 3,
    "output_dir": DOWNLOADS_DIR,
}


def _get_conn() -> sqlite3.Connection:
    Path(DOWNLOADS_DIR).mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(SETTINGS_DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn


def get_all() -> dict:
    """Get all settings, merged with defaults."""
    conn = _get_conn()
    try:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        stored = {}
        for key, value in rows:
            try:
                stored[key] = json.loads(value)
            except json.JSONDecodeError:
                stored[key] = value
        return {**DEFAULTS, **stored}
    finally:
        conn.close()


def get(key: str, default=None):
    """Get a single setting value."""
    all_settings = get_all()
    return all_settings.get(key, default if default is not None else DEFAULTS.get(key))


def set_value(key: str, value) -> None:
    """Set a single setting value."""
    conn = _get_conn()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, json.dumps(value)),
        )
        conn.commit()
    finally:
        conn.close()


def update_many(updates: dict) -> dict:
    """Update multiple settings at once. Returns new full settings."""
    conn = _get_conn()
    try:
        for key, value in updates.items():
            if key in DEFAULTS:  # Only allow known keys
                conn.execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                    (key, json.dumps(value)),
                )
        conn.commit()
    finally:
        conn.close()
    return get_all()
