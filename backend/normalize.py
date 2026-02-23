"""Audio normalization — loudness normalization using ffmpeg's loudnorm filter."""

import os
import shutil
import subprocess
import tempfile

from backend.errors import NormalizationError


def normalize_audio(filepath: str, target_lufs: float = -14.0) -> bool:
    """Normalize an MP3 file's loudness using ffmpeg's loudnorm filter.

    Args:
        filepath: Path to the MP3 file
        target_lufs: Target integrated loudness in LUFS (default: -14.0, good for DJ use)

    Returns:
        True if normalization succeeded

    Raises:
        NormalizationError: If ffmpeg is not available or normalization fails
    """
    if not os.path.exists(filepath):
        raise NormalizationError(f"File not found: {filepath}")

    if not shutil.which("ffmpeg"):
        raise NormalizationError("ffmpeg not found in PATH")

    fd, tmp_path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)

    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", filepath,
                "-af", f"loudnorm=I={target_lufs}:TP=-1.0:LR=11",
                "-ar", "44100",
                "-b:a", "320k",
                tmp_path,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            raise NormalizationError(
                f"ffmpeg failed: {result.stderr[-500:] if result.stderr else 'unknown error'}"
            )

        # Replace original with normalized version
        os.replace(tmp_path, filepath)
        return True

    except subprocess.TimeoutExpired:
        raise NormalizationError("Normalization timed out (>120s)")
    except NormalizationError:
        raise
    except Exception as e:
        raise NormalizationError(f"Normalization failed: {e}")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
