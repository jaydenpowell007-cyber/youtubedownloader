"""Audio normalization — loudness normalization using ffmpeg's loudnorm filter."""

import os
import shutil
import subprocess
import tempfile

from backend.errors import NormalizationError


def normalize_audio(filepath: str, target_lufs: float = -14.0, quality: str = "320") -> bool:
    """Normalize an audio file's loudness using ffmpeg's loudnorm filter.

    Args:
        filepath: Path to the audio file (MP3 or FLAC)
        target_lufs: Target integrated loudness in LUFS (default: -14.0, good for DJ use)
        quality: Bitrate for MP3 ("128","192","256","320") or "flac" for lossless

    Returns:
        True if normalization succeeded

    Raises:
        NormalizationError: If ffmpeg is not available or normalization fails
    """
    if not os.path.exists(filepath):
        raise NormalizationError(f"File not found: {filepath}")

    if not shutil.which("ffmpeg"):
        raise NormalizationError("ffmpeg not found in PATH")

    is_flac = quality == "flac" or filepath.endswith(".flac")
    suffix = ".flac" if is_flac else ".mp3"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)

    try:
        cmd = [
            "ffmpeg", "-y", "-i", filepath,
            "-af", f"loudnorm=I={target_lufs}:TP=-1.0:LR=11",
            "-ar", "44100",
        ]
        if is_flac:
            cmd += ["-c:a", "flac"]
        else:
            cmd += ["-b:a", f"{quality}k"]
        cmd.append(tmp_path)

        result = subprocess.run(
            cmd,
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
