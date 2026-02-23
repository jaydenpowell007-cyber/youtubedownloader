import os
from pathlib import Path

DOWNLOADS_DIR = os.environ.get(
    "DOWNLOADS_DIR",
    str(Path.home() / "Downloads" / "DJ-Music"),
)

# Ensure the downloads directory exists
Path(DOWNLOADS_DIR).mkdir(parents=True, exist_ok=True)

MAX_PLAYLIST_SIZE = int(os.environ.get("MAX_PLAYLIST_SIZE", "50"))
