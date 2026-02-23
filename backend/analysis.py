"""Audio analysis — BPM and musical key detection for DJ workflows."""

import numpy as np

# Camelot wheel mapping: (pitch_class, mode) -> camelot notation
# mode: 0 = minor, 1 = major
# Reference: circle of fifths → C=8, G=9, D=10, A=11, E=12, B=1, F#=2, Db=3, Ab=4, Eb=5, Bb=6, F=7
CAMELOT_WHEEL = {
    # Major keys (B)
    (0, 1): "8B",    # C
    (1, 1): "3B",    # Db
    (2, 1): "10B",   # D
    (3, 1): "5B",    # Eb
    (4, 1): "12B",   # E
    (5, 1): "7B",    # F
    (6, 1): "2B",    # F#/Gb
    (7, 1): "9B",    # G
    (8, 1): "4B",    # Ab
    (9, 1): "11B",   # A
    (10, 1): "6B",   # Bb
    (11, 1): "1B",   # B
    # Minor keys (A) — relative minor shares Camelot number with its major
    (0, 0): "5A",    # Cm
    (1, 0): "12A",   # C#m
    (2, 0): "7A",    # Dm
    (3, 0): "2A",    # Ebm
    (4, 0): "9A",    # Em
    (5, 0): "4A",    # Fm
    (6, 0): "11A",   # F#m
    (7, 0): "6A",    # Gm
    (8, 0): "1A",    # Abm
    (9, 0): "8A",    # Am
    (10, 0): "3A",   # Bbm
    (11, 0): "10A",  # Bm
}

_KEY_NAMES = {
    (0, 1): "C", (1, 1): "Db", (2, 1): "D", (3, 1): "Eb",
    (4, 1): "E", (5, 1): "F", (6, 1): "F#", (7, 1): "G",
    (8, 1): "Ab", (9, 1): "A", (10, 1): "Bb", (11, 1): "B",
    (0, 0): "Cm", (1, 0): "C#m", (2, 0): "Dm", (3, 0): "Ebm",
    (4, 0): "Em", (5, 0): "Fm", (6, 0): "F#m", (7, 0): "Gm",
    (8, 0): "Abm", (9, 0): "Am", (10, 0): "Bbm", (11, 0): "Bm",
}

# Krumhansl-Kessler key profiles
_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def analyze_file(filepath: str) -> dict:
    """Analyze an MP3 file for BPM and musical key.

    Returns:
        dict with keys: bpm, key, camelot, key_name
    """
    try:
        import librosa

        y, sr = librosa.load(filepath, sr=22050, mono=True, duration=120)

        # BPM detection
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = round(float(np.asarray(tempo).flat[0]))

        # Key detection using chroma features + Krumhansl-Kessler
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)

        best_corr = -2
        best_key = (0, 1)

        for pitch_class in range(12):
            rotated = np.roll(chroma_mean, -pitch_class)

            major_corr = np.corrcoef(rotated, _MAJOR_PROFILE)[0, 1]
            if major_corr > best_corr:
                best_corr = major_corr
                best_key = (pitch_class, 1)

            minor_corr = np.corrcoef(rotated, _MINOR_PROFILE)[0, 1]
            if minor_corr > best_corr:
                best_corr = minor_corr
                best_key = (pitch_class, 0)

        camelot = CAMELOT_WHEEL.get(best_key, "")
        key_name = _KEY_NAMES.get(best_key, "")

        return {
            "bpm": bpm,
            "key": key_name,
            "camelot": camelot,
        }

    except Exception as e:
        return {
            "bpm": None,
            "key": None,
            "camelot": None,
            "error": str(e),
        }
