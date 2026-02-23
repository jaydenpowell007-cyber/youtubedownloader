"""Rekordbox XML export — generates a collection file importable by Pioneer Rekordbox."""

import os
import xml.etree.ElementTree as ET
from xml.dom import minidom

from backend.config import DOWNLOADS_DIR
from backend.history import get_all_for_export


def _get_duration_seconds(filepath: str) -> float:
    """Get duration of an MP3 in seconds using mutagen."""
    try:
        from mutagen.mp3 import MP3

        audio = MP3(filepath)
        return audio.info.length
    except Exception:
        return 0.0


def generate_rekordbox_xml(output_path: str = "") -> str:
    """Generate a Rekordbox-compatible XML collection file.

    Args:
        output_path: Where to save the XML. Defaults to DOWNLOADS_DIR/rekordbox_collection.xml

    Returns:
        Path to the generated XML file
    """
    if not output_path:
        output_path = os.path.join(DOWNLOADS_DIR, "rekordbox_collection.xml")

    entries = get_all_for_export()

    # Build XML structure
    root = ET.Element("DJ_PLAYLISTS", Version="1.0.0")

    ET.SubElement(
        root,
        "PRODUCT",
        Name="DJ-Music-Downloader",
        Version="3.0.0",
        Company="DJ-Music-Downloader",
    )

    # Filter to entries with existing files
    valid_entries = [e for e in entries if e.filename and os.path.exists(e.filename)]

    collection = ET.SubElement(
        root, "COLLECTION", Entries=str(len(valid_entries))
    )

    for i, entry in enumerate(valid_entries, 1):
        duration = _get_duration_seconds(entry.filename)

        # Rekordbox expects file:// URI with localhost prefix
        file_uri = "file://localhost" + entry.filename.replace(" ", "%20")

        attrs = {
            "TrackID": str(i),
            "Name": entry.title or "",
            "Artist": entry.artist or "",
            "Kind": "MP3 File",
            "Size": str(os.path.getsize(entry.filename)),
            "TotalTime": str(int(duration)),
            "BitRate": "320",
            "SampleRate": "44100",
            "Location": file_uri,
        }

        if entry.downloaded_at:
            attrs["DateAdded"] = entry.downloaded_at[:10]

        if entry.bpm:
            attrs["AverageBpm"] = f"{entry.bpm:.2f}"

        if entry.key:
            attrs["Tonality"] = entry.key

        ET.SubElement(collection, "TRACK", **attrs)

    # Add a playlist node containing all tracks
    playlists = ET.SubElement(root, "PLAYLISTS")
    root_node = ET.SubElement(
        playlists, "NODE", Type="0", Name="ROOT", Count="1"
    )
    playlist_node = ET.SubElement(
        root_node,
        "NODE",
        Name="DJ-Music Downloads",
        Type="1",
        KeyType="0",
        Entries=str(len(valid_entries)),
    )
    for i in range(1, len(valid_entries) + 1):
        ET.SubElement(playlist_node, "TRACK", Key=str(i))

    # Pretty-print
    rough = ET.tostring(root, encoding="unicode")
    parsed = minidom.parseString(rough)
    pretty = parsed.toprettyxml(indent="  ", encoding="UTF-8")

    with open(output_path, "wb") as f:
        f.write(pretty)

    return output_path
