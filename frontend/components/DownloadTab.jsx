"use client";

import { useState } from "react";
import QualitySelector from "./QualitySelector";

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
      const res = await fetch("/api/info", {
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

      const res = await fetch(endpoint, {
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
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4">
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
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white transition-colors"
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
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-brand-500 transition-colors resize-y font-mono"
            />
            {urlCount > 0 && (
              <button
                onClick={handleDownload}
                disabled={loading}
                className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-40 text-sm font-semibold transition-all glow-pulse"
              >
                {loading
                  ? "Downloading..."
                  : `Download ${urlCount} URL${urlCount > 1 ? "s" : ""} as ${quality === "flac" ? "FLAC" : "MP3"}`}
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-3">
            <input
              type="text"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchInfo()}
              placeholder="YouTube or SoundCloud URL (videos, playlists, sets)"
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
        )}

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Preview (single URL mode only) */}
      {info && !batchMode && (
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
                  ? `${info.entry_count} tracks`
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
                ? `Download All ${info.entry_count} Tracks as ${quality === "flac" ? "FLAC" : "MP3"}`
                : `Download as ${quality === "flac" ? "FLAC" : "MP3"}`}
          </button>
        </div>
      )}
    </div>
  );
}
