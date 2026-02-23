"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "../lib/api";

export default function HistoryTab() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchHistory = async (offset = 0, query = search) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/history"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, offset, search: query }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to fetch history");
      }
      const data = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(0);
  }, []);

  const handleSearch = () => {
    setPage(0);
    fetchHistory(0, search);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    fetchHistory(newPage * limit);
  };

  const handleExportRekordbox = async () => {
    setExporting(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/export/rekordbox"));
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rekordbox_collection.xml";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const sourceBadge = (source) => {
    if (source === "soundcloud") {
      return (
        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400">
          SC
        </span>
      );
    }
    if (source === "youtube") {
      return (
        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
          YT
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Download History</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {total} track{total !== 1 ? "s" : ""} in your library
            </p>
          </div>
          <button
            onClick={handleExportRekordbox}
            disabled={exporting || total === 0}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-all flex items-center gap-2"
          >
            {exporting ? (
              "Exporting..."
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export Rekordbox XML
              </>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="flex gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by title or artist..."
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-brand-500 transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-all"
          >
            {loading ? "..." : "Search"}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {entries.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4 animate-slide-up">
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-2">
            {entries.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--bg-secondary)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{e.title}</p>
                    {sourceBadge(e.source)}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] truncate">
                    {e.artist && `${e.artist} · `}
                    {e.downloaded_at?.replace("T", " ").slice(0, 16)}
                  </p>
                </div>

                {e.bpm && (
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 flex-shrink-0">
                    {e.bpm} BPM
                  </span>
                )}
                {e.camelot && (
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 flex-shrink-0">
                    {e.camelot}
                  </span>
                )}
                {e.key && (
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 flex-shrink-0">
                    {e.key}
                  </span>
                )}
                {e.normalized && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 flex-shrink-0">
                    NORM
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-secondary)] border border-[var(--border)] disabled:opacity-30 hover:border-brand-500 transition-colors"
              >
                Prev
              </button>
              <span className="text-xs text-[var(--text-secondary)]">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-secondary)] border border-[var(--border)] disabled:opacity-30 hover:border-brand-500 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            {search ? "No matching tracks found" : "No downloads yet — go grab some tracks!"}
          </p>
        </div>
      )}
    </div>
  );
}
