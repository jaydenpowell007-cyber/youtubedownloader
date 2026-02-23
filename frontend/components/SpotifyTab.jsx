"use client";

import { useState } from "react";
import QualitySelector from "./QualitySelector";

export default function SpotifyTab({ onDownload, quality, onQualityChange }) {
  const [url, setUrl] = useState("");
  const [tracks, setTracks] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const fetchTracks = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setTracks([]);
    setSelected(new Set());

    try {
      const res = await fetch("/api/spotify/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to fetch playlist");
      }
      const data = await res.json();
      setTracks(data);
      // Auto-select all
      setSelected(new Set(data.map((_, i) => i)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (index) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === tracks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tracks.map((_, i) => i)));
    }
  };

  const handleDownload = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    setError("");

    const selectedTracks = [...selected].map((i) => tracks[i]);

    try {
      for (const track of selectedTracks) {
        try {
          // Search for the track on YouTube
          const searchRes = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: track.search_query,
              platform: "youtube",
              max_results: 1,
            }),
          });
          if (!searchRes.ok) continue;
          const results = await searchRes.json();
          if (results.length === 0) continue;

          // Start async download for the top result
          const dlRes = await fetch("/api/download/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: results[0].url, quality }),
          });
          if (!dlRes.ok) continue;
          const dlJobs = await dlRes.json();
          onDownload(dlJobs);
        } catch {
          continue;
        }
      }

      setSelected(new Set());
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  };

  const formatDuration = (ms) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4">
        <h2 className="text-base font-semibold">Import from Spotify</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Paste a Spotify playlist URL — tracks will be found on YouTube and downloaded as MP3
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchTracks()}
            placeholder="https://open.spotify.com/playlist/..."
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-brand-500 transition-colors"
          />
          <button
            onClick={fetchTracks}
            disabled={loading || !url.trim()}
            className="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-all"
          >
            {loading ? "Loading..." : "Import"}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Track List */}
      {tracks.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {tracks.length} Tracks
              <span className="ml-2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">
                Spotify
              </span>
            </h3>
            <button
              onClick={selectAll}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              {selected.size === tracks.length ? "Deselect All" : "Select All"}
            </button>
          </div>

          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-2">
            {tracks.map((t, i) => (
              <button
                key={i}
                onClick={() => toggleSelect(i)}
                className={`w-full flex items-center gap-4 p-3 rounded-xl text-left transition-all ${
                  selected.has(i)
                    ? "bg-brand-600/15 border border-brand-500/30"
                    : "bg-[var(--bg-secondary)] border border-transparent hover:border-[var(--border)]"
                }`}
              >
                {/* Checkbox */}
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    selected.has(i)
                      ? "bg-brand-600 border-brand-600"
                      : "border-[var(--border)]"
                  }`}
                >
                  {selected.has(i) && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* Track number */}
                <span className="text-[var(--text-secondary)] text-xs w-5 text-right flex-shrink-0">
                  {i + 1}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-xs text-[var(--text-secondary)] truncate">
                    {t.artist}
                    {t.album && ` — ${t.album}`}
                    {t.duration_ms > 0 && ` · ${formatDuration(t.duration_ms)}`}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {selected.size > 0 && (
            <div className="space-y-3">
              <QualitySelector quality={quality} onChange={onQualityChange} />
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-40 text-sm font-semibold transition-all glow-pulse"
              >
                {downloading
                  ? `Downloading... (tracks are added to queue as they complete)`
                  : `Download ${selected.size} Track${selected.size > 1 ? "s" : ""} as ${quality === "flac" ? "FLAC" : "MP3"}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
