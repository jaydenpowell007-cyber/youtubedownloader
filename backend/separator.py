"""Demucs-powered stem separation engine."""

import logging
import os
import tempfile
import time
import zipfile
from typing import Callable, Optional

import torch
import torchaudio
from demucs.apply import apply_model
from demucs.pretrained import get_model

# torchaudio 2.5+ removed set_audio_backend() and changed default backend
# selection. Instead of relying on the global setting, we pass
# backend="soundfile" directly to load()/save() calls below.
_AUDIO_BACKEND = "soundfile"

from backend.errors import SeparationError

logger = logging.getLogger(__name__)

# Lazy-loaded, cached singleton
_model = None

# Limit PyTorch CPU threads to avoid over-subscribing server vCPUs.
# Railway's 8 vCPU plan gets throttled/killed when Demucs saturates all cores.
# Using 4 threads leaves headroom for the web server, downloads, and OS.
_MAX_TORCH_THREADS = int(os.environ.get("DEMUCS_THREADS", "4"))
torch.set_num_threads(_MAX_TORCH_THREADS)
torch.set_num_interop_threads(2)

# Segment length in seconds for chunked processing.
# Smaller = less peak memory/CPU, but slightly lower quality at boundaries.
_SEGMENT_SECONDS = float(os.environ.get("DEMUCS_SEGMENT", "10"))

# Overlap ratio between segments (0-1). Higher = smoother transitions.
_OVERLAP = float(os.environ.get("DEMUCS_OVERLAP", "0.25"))

# Maximum allowed audio duration in seconds (guard against hour-long files).
_MAX_DURATION_SECONDS = int(os.environ.get("DEMUCS_MAX_DURATION", "600"))

# Timeout for the entire separation inference in seconds.
_TIMEOUT_SECONDS = int(os.environ.get("DEMUCS_TIMEOUT", "300"))


def _get_model():
    """Load htdemucs model (cached after first call)."""
    global _model
    if _model is None:
        try:
            logger.info("Loading HTDemucs model (first time — may download ~80MB)...")
            _model = get_model("htdemucs")
            _model.eval()
            logger.info("HTDemucs model loaded successfully.")
        except Exception as e:
            raise SeparationError(f"Failed to load Demucs model: {e}")
    return _model


class _SeparationProgress:
    """Tracks Demucs inference progress and enforces a timeout.

    Passed as the `callback` arg to demucs apply_model(). Called after
    each audio segment is processed, allowing us to:
    1. Report real-time progress to the frontend via WebSocket
    2. Abort stuck jobs by raising SeparationError on timeout
    """

    def __init__(self, timeout_seconds: float, job_progress_fn: Optional[Callable] = None):
        self.start_time = time.monotonic()
        self.timeout_seconds = timeout_seconds
        self.job_progress_fn = job_progress_fn
        self.calls = 0

    def __call__(self, info: dict):
        self.calls += 1
        elapsed = time.monotonic() - self.start_time

        if self.calls % 2 == 0:
            logger.info("Demucs progress: step %d (%.1fs elapsed)", self.calls, elapsed)

        if self.job_progress_fn:
            self.job_progress_fn(self.calls, elapsed)

        if elapsed > self.timeout_seconds:
            raise SeparationError(
                f"Stem separation timed out after {int(elapsed)}s "
                f"(limit: {self.timeout_seconds}s). Try a shorter track."
            )


def separate_stems(
    audio_path: str,
    output_dir: str,
    job_progress_fn: Optional[Callable] = None,
) -> dict[str, str]:
    """Run Demucs stem separation on an audio file.

    Args:
        audio_path: Path to the input audio file (MP3, WAV, FLAC, etc.)
        output_dir: Directory to write individual stem files
        job_progress_fn: Optional callback(step, elapsed_secs) for progress updates

    Returns:
        Dict mapping stem name -> file path, e.g. {"vocals": "/tmp/.../vocals.wav", ...}
    """
    model = _get_model()

    try:
        wav, sr = torchaudio.load(audio_path, backend=_AUDIO_BACKEND)
    except Exception as e:
        raise SeparationError(f"Failed to load audio file: {e}")

    # Resample to model's expected sample rate if needed
    if sr != model.samplerate:
        logger.info("Resampling from %d to %d Hz", sr, model.samplerate)
        wav = torchaudio.transforms.Resample(sr, model.samplerate)(wav)

    # Ensure stereo (model expects 2 channels)
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    elif wav.shape[0] > 2:
        wav = wav[:2]

    duration_sec = wav.shape[-1] / model.samplerate

    if duration_sec > _MAX_DURATION_SECONDS:
        raise SeparationError(
            f"Audio is {duration_sec:.0f}s long (max {_MAX_DURATION_SECONDS}s). "
            f"Please trim it before separating."
        )

    # Add batch dimension: (1, channels, samples)
    wav = wav.unsqueeze(0)

    logger.info(
        "Starting inference: %.1fs audio, segment=%.1fs, overlap=%.2f, threads=%d, timeout=%ds",
        duration_sec, _SEGMENT_SECONDS, _OVERLAP, _MAX_TORCH_THREADS, _TIMEOUT_SECONDS,
    )

    progress_tracker = _SeparationProgress(
        timeout_seconds=_TIMEOUT_SECONDS,
        job_progress_fn=job_progress_fn,
    )

    try:
        with torch.no_grad():
            sources = apply_model(
                model,
                wav,
                device="cpu",
                segment=_SEGMENT_SECONDS,
                overlap=_OVERLAP,
                shifts=1,
                split=True,
                progress=False,
                num_workers=0,
                callback=progress_tracker,
            )
    except SeparationError:
        raise
    except Exception as e:
        raise SeparationError(f"Demucs separation failed: {e}")

    elapsed = time.monotonic() - progress_tracker.start_time
    logger.info("Inference complete: %.1fs audio processed in %.1fs", duration_sec, elapsed)

    # sources shape: (1, num_sources, 2, samples)
    # model.sources = ['drums', 'bass', 'other', 'vocals']
    os.makedirs(output_dir, exist_ok=True)

    stem_paths = {}
    for i, name in enumerate(model.sources):
        stem = sources[0, i]  # (2, samples)
        path = os.path.join(output_dir, f"{name}.wav")
        torchaudio.save(path, stem, model.samplerate, backend=_AUDIO_BACKEND)
        stem_paths[name] = path

    # Free large tensors promptly
    del sources, wav

    return stem_paths


def _mix_stems(stem_paths: dict[str, str], names: list[str], output_path: str, sample_rate: int) -> str:
    """Mix multiple stems together by summing their waveforms."""
    mixed = None
    for name in names:
        if name not in stem_paths:
            continue
        wav, _ = torchaudio.load(stem_paths[name], backend=_AUDIO_BACKEND)
        if mixed is None:
            mixed = wav
        else:
            mixed = mixed + wav

    if mixed is None:
        raise SeparationError("No stems available to mix for instrumental")

    torchaudio.save(output_path, mixed, sample_rate, backend=_AUDIO_BACKEND)
    return output_path


def create_stems_zip(
    stem_paths: dict[str, str],
    selected_stems: list[str],
    track_title: str,
    original_path: Optional[str] = None,
    output_dir: Optional[str] = None,
) -> str:
    """Package selected stems into a ZIP file.

    Args:
        stem_paths: Dict mapping stem name -> file path (from separate_stems)
        selected_stems: List of stem names to include. Special values:
            "instrumental" = drums+bass+other mixed together
            "original" = include the original full track
        track_title: Track title for naming files inside the ZIP
        original_path: Path to original audio (needed if "original" selected)
        output_dir: Directory for the ZIP file (defaults to tempdir)

    Returns:
        Path to the created ZIP file
    """
    dest = output_dir or tempfile.gettempdir()
    os.makedirs(dest, exist_ok=True)

    safe_title = "".join(c for c in track_title if c.isalnum() or c in " -_").strip() or "track"
    zip_path = os.path.join(dest, f"{safe_title}_stems.zip")

    model = _get_model()

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for stem_name in selected_stems:
            if stem_name == "instrumental":
                # Mix drums + bass + other into a single instrumental track
                instrumental_path = os.path.join(
                    os.path.dirname(next(iter(stem_paths.values()))),
                    "instrumental.wav",
                )
                _mix_stems(
                    stem_paths,
                    ["drums", "bass", "other"],
                    instrumental_path,
                    model.samplerate,
                )
                zf.write(instrumental_path, f"{safe_title} (Instrumental).wav")
            elif stem_name == "original":
                if original_path and os.path.exists(original_path):
                    ext = os.path.splitext(original_path)[1]
                    zf.write(original_path, f"{safe_title} (Original){ext}")
            elif stem_name in stem_paths:
                zf.write(stem_paths[stem_name], f"{safe_title} ({stem_name.title()}).wav")

    return zip_path


def check_audio_quality(filepath: str) -> dict:
    """Check audio quality using mutagen.

    Returns:
        Dict with bitrate (kbps), sample_rate (Hz), and optional warning string.
    """
    try:
        from mutagen import File as MutagenFile

        audio = MutagenFile(filepath)
        if audio is None:
            return {"bitrate": 0, "sample_rate": 0, "warning": "Could not read audio metadata"}

        bitrate = getattr(audio.info, "bitrate", 0) // 1000  # Convert to kbps
        sample_rate = getattr(audio.info, "sample_rate", 0)

        warning = None
        if 0 < bitrate < 192:
            warning = (
                f"Low quality audio ({bitrate}kbps). "
                "Stem separation works best with 192kbps+ audio. "
                "Results may contain more artifacts."
            )

        return {"bitrate": bitrate, "sample_rate": sample_rate, "warning": warning}
    except Exception:
        return {"bitrate": 0, "sample_rate": 0, "warning": None}
