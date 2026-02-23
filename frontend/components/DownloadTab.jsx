"use client";

import { useState } from "react";

export default function DownloadTab({ onDownload }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");

  const fetchInfo = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setInfo(null);

    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to fetch info");
      }
      const data = await res.json();
      setInfo(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Download failed");
      }
      const jobs = await res.json();
      onDownload(jobs);
      setUrl("");
      setInfo(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4">
        <h2 className="text-base font-semibold">Paste a YouTube Link</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Works with individual videos and full playlists
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchInfo()}
            placeholder="https://youtube.com/watch?v=... or playlist URL"
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-brand-500 transition-colors"
          />
          <button
            onClick={fetchInfo}
            disabled={loading || !url.trim()}
            className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-all"
          >
            {loading ? "Loading..." : "Preview"}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Preview */}
      {info && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4 animate-slide-up">
          <div className="flex items-start gap-4">
            {info.thumbnail && (
              <img
                src={info.thumbnail}
                alt=""
                className="w-32 h-20 object-cover rounded-lg flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{info.title}</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {info.is_playlist
                  ? `Playlist — ${info.entry_count} tracks`
                  : "Single track"}
              </p>
            </div>
          </div>

          {info.is_playlist && info.entries?.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-1 pr-2">
              {info.entries.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-card-hover)] text-sm"
                >
                  <span className="text-[var(--text-secondary)] w-6 text-right flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="truncate">{entry.title}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleDownload}
            disabled={loading}
            className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-40 text-sm font-semibold transition-all glow-pulse"
          >
            {loading
              ? "Downloading..."
              : info.is_playlist
                ? `Download All ${info.entry_count} Tracks as MP3`
                : "Download as MP3"}
          </button>
        </div>
      )}
    </div>
  );
}
