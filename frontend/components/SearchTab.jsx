"use client";

import { useState } from "react";
import QualitySelector from "./QualitySelector";
import { apiUrl } from "../lib/api";

const PLATFORMS = [
  { value: "all", label: "All" },
  { value: "youtube", label: "YouTube" },
  { value: "soundcloud", label: "SoundCloud" },
];

export default function SearchTab({ onDownload, quality, onQualityChange }) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [parsedMeta, setParsedMeta] = useState(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResults([]);
    setSelected(new Set());
    setParsedMeta(null);

    try {
      const res = await fetch(apiUrl("/api/search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, platform, max_results: 10 }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Search failed");
      }
      const data = await res.json();
      setResults(data.results || []);
      if (data.parsed_bpm || data.parsed_key) {
        setParsedMeta({
          bpm: data.parsed_bpm,
          key: data.parsed_key,
          cleaned: data.cleaned_query,
        });
      }
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
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map((_, i) => i)));
    }
  };

  const handleDownloadSelected = async () => {
    const urls = [...selected].map((i) => results[i].url);
    if (urls.length === 0) return;

    setDownloading(true);
    setError("");

    try {
      const res = await fetch(apiUrl("/api/download-selected/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, quality }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Download failed");
      }
      const jobs = await res.json();
      onDownload(jobs);
      setSelected(new Set());
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4 card-hover">
        <h2 className="text-base font-semibold">Search for Music</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Describe what you&apos;re looking for — searches YouTube and SoundCloud
        </p>

        {/* Platform Toggle */}
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-secondary)] w-fit">
          {PLATFORMS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPlatform(p.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                platform === p.value
                  ? "bg-brand-600 text-white"
                  : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder='e.g. "Don Toliver songs with a bpm of 140"'
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-brand-500 transition-all"
              aria-label="Search for music"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-all"
          >
            {loading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : "Search"}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        )}

        {parsedMeta && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-brand-600/10 border border-brand-500/20 text-sm">
            <svg className="w-4 h-4 flex-shrink-0 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[var(--text-secondary)]">
              Searching for <span className="text-white font-medium">&ldquo;{parsedMeta.cleaned}&rdquo;</span>
              {parsedMeta.bpm && (
                <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-md bg-brand-600/20 text-brand-300 text-xs font-medium">
                  {parsedMeta.bpm} BPM
                </span>
              )}
              {parsedMeta.key && (
                <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-md bg-brand-600/20 text-brand-300 text-xs font-medium">
                  {parsedMeta.key}
                </span>
              )}
              <span className="ml-1 text-[var(--text-secondary)]"> &mdash; BPM/key detected after download</span>
            </span>
          </div>
        )}
      </div>

      {/* Search Results */}
      {results.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {results.length} Results
            </h3>
            <button
              onClick={selectAll}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              {selected.size === results.length ? "Deselect All" : "Select All"}
            </button>
          </div>

          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-2">
            {results.map((r, i) => (
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

                {/* Thumbnail */}
                {r.thumbnail && (
                  <img
                    src={r.thumbnail}
                    alt=""
                    className="w-16 h-10 object-cover rounded-md flex-shrink-0"
                  />
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                      r.source === "soundcloud"
                        ? "bg-orange-500/15 text-orange-400"
                        : "bg-red-500/15 text-red-400"
                    }`}>
                      {r.source === "soundcloud" ? "SC" : "YT"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {r.channel} &middot; {r.duration}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {selected.size > 0 && (
            <div className="space-y-3">
              <QualitySelector quality={quality} onChange={onQualityChange} />
              <button
                onClick={handleDownloadSelected}
                disabled={downloading}
                className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-40 text-sm font-semibold transition-all glow-pulse"
              >
                {downloading
                  ? "Downloading..."
                  : `Download ${selected.size} Track${selected.size > 1 ? "s" : ""} as ${quality === "flac" ? "FLAC" : "MP3"}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
