"""Demucs-powered stem separation engine."""

import concurrent.futures
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
# None = use model default (7.8s for htdemucs). The model's transformer
# architecture requires this exact size, so only override if you know
# what you're doing.
_SEGMENT_OVERRIDE = os.environ.get("DEMUCS_SEGMENT")
_SEGMENT_SECONDS = float(_SEGMENT_OVERRIDE) if _SEGMENT_OVERRIDE else None

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


def _run_apply_model(model, wav, segment, overlap):
    """Run apply_model in the current thread (used as a Future target)."""
    with torch.no_grad():
        return apply_model(
            model,
            wav,
            device="cpu",
            segment=segment,
            overlap=overlap,
            shifts=1,
            split=True,
            progress=True,
            num_workers=0,
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
        job_progress_fn: Optional callback(progress_pct, elapsed_secs) for updates

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

    # Estimate expected processing time for progress (rough: ~0.5x-1x realtime on CPU)
    estimated_time = max(30.0, duration_sec * 0.7)

    seg_label = f"{_SEGMENT_SECONDS:.1f}s" if _SEGMENT_SECONDS else "model-default"
    logger.info(
        "Starting inference: %.1fs audio, segment=%s, overlap=%.2f, threads=%d, timeout=%ds",
        duration_sec, seg_label, _OVERLAP, _MAX_TORCH_THREADS, _TIMEOUT_SECONDS,
    )

    start_time = time.monotonic()

    # Run inference in a thread so we can enforce a timeout and push progress
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="demucs")
    future = pool.submit(_run_apply_model, model, wav, _SEGMENT_SECONDS, _OVERLAP)

    try:
        # Poll for completion, pushing progress updates every 3 seconds
        while True:
            try:
                sources = future.result(timeout=3.0)
                break  # Done
            except concurrent.futures.TimeoutError:
                elapsed = time.monotonic() - start_time

                # Time-based progress estimate (0-95%)
                progress_pct = min(95.0, (elapsed / estimated_time) * 100.0)

                logger.info(
                    "Demucs running: %.0fs elapsed (est. %.0fs total), ~%.0f%%",
                    elapsed, estimated_time, progress_pct,
                )

                if job_progress_fn:
                    job_progress_fn(progress_pct, elapsed)

                if elapsed > _TIMEOUT_SECONDS:
                    future.cancel()
                    raise SeparationError(
                        f"Stem separation timed out after {int(elapsed)}s "
                        f"(limit: {_TIMEOUT_SECONDS}s). Try a shorter track."
                    )
    except SeparationError:
        raise
    except Exception as e:
        raise SeparationError(f"Demucs separation failed: {e}")
    finally:
        pool.shutdown(wait=False)

    elapsed = time.monotonic() - start_time
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
