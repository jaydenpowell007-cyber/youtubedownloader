"use client";

import { apiUrl } from "../lib/api";

export default function DownloadQueue({ downloads, onClear }) {
  const statusIcon = (status) => {
    switch (status) {
      case "done":
        return (
          <div className="w-6 h-6 rounded-full bg-[#06d6a0]/20 flex items-center justify-center flex-shrink-0 shadow-[0_0_8px_rgba(6,214,160,0.3)]">
            <svg className="w-3.5 h-3.5 text-[#06d6a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case "skipped":
        return (
          <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
            </svg>
          </div>
        );
      case "error":
        return (
          <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-6 h-6 rounded-full bg-[#06d6a0]/20 flex items-center justify-center flex-shrink-0 animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-[#06d6a0]" />
          </div>
        );
    }
  };

  const isActive = (status) =>
    status !== "done" && status !== "error" && status !== "skipped";

  const doneCount = downloads.filter((d) => d.status === "done").length;
  const skippedCount = downloads.filter((d) => d.status === "skipped").length;
  const errorCount = downloads.filter((d) => d.status === "error").length;
  const activeCount = downloads.filter((d) => isActive(d.status)).length;

  const formatLabel = (d) => {
    if (d.format_type === "zip") return "ZIP";
    if (d.format_type === "flac" || d.quality === "flac") return "FLAC";
    return `MP3`;
  };

  const qualityLabel = (d) => {
    if (d.quality === "flac") return "";
    if (d.quality && d.quality !== "320") return `${d.quality}k`;
    return "";
  };

  return (
    <div className="deck-panel-flush rounded-2xl p-6 space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Downloads</h3>
          <div className="flex items-center gap-2 text-[10px] font-medium">
            {doneCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#06d6a0]/10 text-[#06d6a0]">
                {doneCount} done
              </span>
            )}
            {activeCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#06d6a0]/10 text-brand-300">
                <span className="w-1.5 h-1.5 rounded-full bg-[#06d6a0] animate-pulse" />
                {activeCount} active
              </span>
            )}
            {errorCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">
                {errorCount} failed
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-[var(--text-secondary)] hover:text-red-400 transition-colors"
        >
          Clear All
        </button>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
        {downloads.map((d) => (
          <div
            key={d.job_id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
              d.status === "error"
                ? "bg-red-500/5 border border-red-500/10"
                : "deck-item"
            }`}
          >
            {statusIcon(d.status)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm truncate">{d.title || "Processing..."}</p>
                {d.source && (
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                    d.source === "soundcloud"
                      ? "bg-orange-500/15 text-orange-400"
                      : d.source === "upload"
                        ? "bg-violet-500/15 text-violet-400"
                        : "bg-red-500/15 text-red-400"
                  }`}>
                    {d.source === "soundcloud" ? "SC" : d.source === "upload" ? "UP" : "YT"}
                  </span>
                )}
              </div>
              {/* Progress bar for active downloads */}
              {isActive(d.status) && (
                <div className="mt-1.5 space-y-1">
                  <div className="w-full h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        d.status === "downloading" ? "progress-shimmer" : "bg-[#06d6a0]"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, d.progress || 0))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)]">
                    {d.status === "downloading" && `Downloading... ${Math.round(d.progress || 0)}%`}
                    {d.status === "converting" && "Converting audio..."}
                    {d.status === "normalizing" && "Normalizing audio levels..."}
                    {d.status === "analyzing" && "Analyzing BPM & key..."}
                    {d.status === "separating" && "Separating stems (this may take a minute)..."}
                    {d.status === "zipping" && "Packaging stems into ZIP..."}
                    {d.status === "queued" && "Queued..."}
                    {d.status === "pending" && "Queued..."}
                    {!["downloading", "converting", "normalizing", "analyzing", "separating", "zipping", "queued", "pending"].includes(d.status) && isActive(d.status) && "Processing..."}
                  </p>
                </div>
              )}
              {d.error && (
                <p className="text-xs text-red-400 truncate mt-0.5">{d.error}</p>
              )}
              {d.skipped_reason && (
                <p className="text-xs text-yellow-400 truncate mt-0.5">{d.skipped_reason}</p>
              )}
            </div>
            {/* BPM / Key / Camelot / Normalized / Quality badges */}
            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
              {(d.status === "done" || d.status === "skipped") && d.bpm && (
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">
                  {d.bpm} BPM
                </span>
              )}
              {(d.status === "done" || d.status === "skipped") && d.camelot && (
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                  {d.camelot}
                </span>
              )}
              {d.status === "done" && d.normalized && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#8338ec]/15 text-[#8338ec]">
                  NORM
                </span>
              )}
              {d.status === "done" && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  d.format_type === "zip"
                    ? "bg-violet-500/15 text-violet-400"
                    : d.quality === "flac"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-[#06d6a0]/15 text-[#06d6a0]"
                }`}>
                  {formatLabel(d)}{qualityLabel(d) ? ` ${qualityLabel(d)}` : ""}
                </span>
              )}
              {d.status === "done" && d.stems && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#ff006e]/15 text-[#ff006e]">
                  STEMS
                </span>
              )}
              {d.status === "done" && d.filename && (
                <a
                  href={apiUrl(d.stems ? `/api/stems/download/${d.job_id}` : `/api/download-file/${d.job_id}`)}
                  download
                  className="w-7 h-7 rounded-full bg-[#06d6a0]/20 flex items-center justify-center hover:bg-[#06d6a0]/40 transition-colors"
                  title={d.stems ? "Download Stems ZIP" : "Save to Downloads"}
                  aria-label={`Download ${d.title}`}
                >
                  <svg className="w-3.5 h-3.5 text-[#06d6a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
                  </svg>
                </a>
              )}
              {d.status === "skipped" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">DUP</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
