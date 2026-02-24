"use client";

import { useState } from "react";
import QualitySelector from "./QualitySelector";
import { apiUrl } from "../lib/api";

export default function DownloadTab({ onDownload, quality, onQualityChange }) {
  const [url, setUrl] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");

  const handleUrlChange = (val) => {
    setUrl(val);
    // Auto-detect batch mode when pasting multiple lines
    if (!batchMode && val.includes("\n") && val.trim().split("\n").filter(Boolean).length > 1) {
      setBatchMode(true);
    }
  };

  const getUrls = () =>
    url.split("\n").map((u) => u.trim()).filter(Boolean);

  const fetchInfo = async () => {
    if (!url.trim() || batchMode) return;
    setLoading(true);
    setError("");
    setInfo(null);

    try {
      const res = await fetch(apiUrl("/api/info"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
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
      const urls = batchMode ? getUrls() : [url.trim()];
      if (urls.length === 0) return;

      const endpoint = urls.length > 1 ? "/api/download-batch/start" : "/api/download/start";
      const body = urls.length > 1
        ? { urls, quality }
        : { url: urls[0], quality };

      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  const urlCount = batchMode ? getUrls().length : 0;

  return (
    <div className="space-y-6">
      <div className="deck-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">
              {batchMode ? "Batch Download" : "Paste a Link"}
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {batchMode
                ? "Paste multiple URLs — one per line"
                : "Works with YouTube and SoundCloud — individual tracks, playlists, and sets"}
            </p>
          </div>
          <button
            onClick={() => {
              setBatchMode(!batchMode);
              setInfo(null);
              setError("");
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[#06d6a0]/50 transition-all"
          >
            {batchMode ? "Single URL" : "Batch Mode"}
          </button>
        </div>

        <QualitySelector quality={quality} onChange={onQualityChange} />

        {batchMode ? (
          <div className="space-y-3">
            <textarea
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder={"Paste URLs here — one per line\nhttps://youtube.com/watch?v=...\nhttps://soundcloud.com/..."}
              rows={5}
              className="w-full px-4 py-3 rounded-xl deck-input text-sm placeholder-[var(--text-secondary)] focus:outline-none transition-all resize-y font-mono"
            />
            {urlCount > 0 && (
              <button
                onClick={handleDownload}
                disabled={loading}
                className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#06d6a0] to-[#04a47a] hover:from-[#05c090] hover:to-[#06d6a0] text-black shadow-[0_0_20px_rgba(6,214,160,0.2)] disabled:opacity-40 text-sm font-semibold transition-all glow-pulse"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Downloading...
                  </span>
                ) : (
                  `Download ${urlCount} URL${urlCount > 1 ? "s" : ""} as ${quality === "flac" ? "FLAC" : "MP3"}`
                )}
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-3">
            <div className="relative flex-1">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchInfo()}
                placeholder="YouTube or SoundCloud URL (videos, playlists, sets)"
                className="w-full pl-10 pr-4 py-3 rounded-xl deck-input text-sm placeholder-[var(--text-secondary)] focus:outline-none transition-all"
                aria-label="Enter a YouTube or SoundCloud URL"
              />
            </div>
            <button
              onClick={fetchInfo}
              disabled={loading || !url.trim()}
              className="px-6 py-3 rounded-xl bg-[#06d6a0] hover:bg-[#05c090] text-black disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-all"
            >
              {loading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : "Preview"}
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        )}
      </div>

      {/* Preview (single URL mode only) */}
      {info && !batchMode && (
        <div className="deck-panel rounded-2xl p-6 space-y-4 animate-slide-up">
          <div className="flex items-start gap-4">
            {info.thumbnail && (
              <div className="relative flex-shrink-0">
                <img
                  src={info.thumbnail}
                  alt=""
                  className="w-32 h-20 object-cover rounded-lg"
                />
                {info.is_playlist && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                    <div className="flex items-center gap-1 text-xs font-semibold">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                      </svg>
                      {info.entry_count}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">{info.title}</h3>
                {info.source && (
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                    info.source === "soundcloud"
                      ? "bg-orange-500/15 text-orange-400"
                      : "bg-red-500/15 text-red-400"
                  }`}>
                    {info.source === "soundcloud" ? "SC" : "YT"}
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {info.is_playlist
                  ? `Playlist with ${info.entry_count} tracks`
                  : "Single track"}
              </p>
            </div>
          </div>

          {info.is_playlist && info.entries?.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-1 pr-2">
              {info.entries.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-card-hover)] text-sm transition-colors"
                >
                  <span className="text-[var(--text-secondary)] w-6 text-right flex-shrink-0 text-xs font-mono">
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
            className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#06d6a0] to-[#04a47a] hover:from-[#05c090] hover:to-[#06d6a0] text-black shadow-[0_0_20px_rgba(6,214,160,0.2)] disabled:opacity-40 text-sm font-semibold transition-all glow-pulse"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Downloading...
              </span>
            ) : info.is_playlist
              ? `Download All ${info.entry_count} Tracks as ${quality === "flac" ? "FLAC" : "MP3"}`
              : `Download as ${quality === "flac" ? "FLAC" : "MP3"}`}
          </button>
        </div>
      )}
    </div>
  );
}
