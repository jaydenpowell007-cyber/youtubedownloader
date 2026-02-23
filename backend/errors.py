"""Custom exception types for better error handling."""


class DownloaderError(Exception):
    """Base exception for the downloader."""
    pass


class NetworkError(DownloaderError):
    """Network-related error (potentially retriable)."""
    pass


class ExtractionError(DownloaderError):
    """Failed to extract info from URL."""
    pass


class DuplicateTrackError(DownloaderError):
    """Track already exists in the library."""

    def __init__(self, title: str, filepath: str = ""):
        self.title = title
        self.filepath = filepath
        super().__init__(f"Already downloaded: {title}")


class NormalizationError(DownloaderError):
    """Audio normalization failed."""
    pass


class AnalysisError(DownloaderError):
    """BPM/key analysis failed."""
    pass


class TaggingError(DownloaderError):
    """ID3 tagging failed."""
    pass
