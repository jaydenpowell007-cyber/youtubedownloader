"use client";

import { useState } from "react";

export default function SearchTab({ onDownload }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResults([]);
    setSelected(new Set());

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, max_results: 10 }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Search failed");
      }
      const data = await res.json();
      setResults(data);
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
      const res = await fetch("/api/download-selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
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
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4">
        <h2 className="text-base font-semibold">Search for Music</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Describe what you're looking for in plain English
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder='e.g. "Don Toliver songs with a bpm of 140"'
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-brand-500 transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-all"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
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
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {r.channel} &middot; {r.duration}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {selected.size > 0 && (
            <button
              onClick={handleDownloadSelected}
              disabled={downloading}
              className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-40 text-sm font-semibold transition-all glow-pulse"
            >
              {downloading
                ? "Downloading..."
                : `Download ${selected.size} Track${selected.size > 1 ? "s" : ""} as MP3`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
