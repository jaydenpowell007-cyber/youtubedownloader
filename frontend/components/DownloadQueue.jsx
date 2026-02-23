"use client";

export default function DownloadQueue({ downloads, onClear }) {
  const statusIcon = (status) => {
    switch (status) {
      case "done":
        return (
          <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
          <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0 animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-brand-400" />
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
    if (d.format_type === "flac" || d.quality === "flac") return "FLAC";
    return `MP3`;
  };

  const qualityLabel = (d) => {
    if (d.quality === "flac") return "";
    if (d.quality && d.quality !== "320") return `${d.quality}k`;
    return "";
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Downloads</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {doneCount} completed
            {activeCount > 0 && ` — ${activeCount} in progress`}
            {skippedCount > 0 && ` — ${skippedCount} skipped (duplicates)`}
            {errorCount > 0 && ` — ${errorCount} failed`}
          </p>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-[var(--text-secondary)] hover:text-white transition-colors"
        >
          Clear All
        </button>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
        {downloads.map((d) => (
          <div
            key={d.job_id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--bg-secondary)]"
          >
            {statusIcon(d.status)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm truncate">{d.title || "Processing..."}</p>
                {d.source && (
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                    d.source === "soundcloud"
                      ? "bg-orange-500/15 text-orange-400"
                      : "bg-red-500/15 text-red-400"
                  }`}>
                    {d.source === "soundcloud" ? "SC" : "YT"}
                  </span>
                )}
              </div>
              {/* Progress bar for active downloads */}
              {isActive(d.status) && (
                <div className="mt-1.5 space-y-1">
                  <div className="w-full h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, (d.progress || 0) * 100))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)]">
                    {d.status === "downloading" && `Downloading... ${Math.round((d.progress || 0) * 100)}%`}
                    {d.status === "normalizing" && "Normalizing audio levels..."}
                    {d.status === "analyzing" && "Analyzing BPM & key..."}
                    {d.status === "pending" && "Queued..."}
                    {!["downloading", "normalizing", "analyzing", "pending"].includes(d.status) && isActive(d.status) && "Processing..."}
                  </p>
                </div>
              )}
              {d.error && (
                <p className="text-xs text-red-400 truncate">{d.error}</p>
              )}
              {d.skipped_reason && (
                <p className="text-xs text-yellow-400 truncate">{d.skipped_reason}</p>
              )}
            </div>
            {/* BPM / Key / Camelot / Normalized / Quality badges */}
            {(d.status === "done" || d.status === "skipped") && d.bpm && (
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 flex-shrink-0">
                {d.bpm} BPM
              </span>
            )}
            {(d.status === "done" || d.status === "skipped") && d.camelot && (
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 flex-shrink-0">
                {d.camelot}
              </span>
            )}
            {d.status === "done" && d.normalized && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 flex-shrink-0">
                NORM
              </span>
            )}
            {d.status === "done" && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                d.quality === "flac"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-green-500/15 text-green-400"
              }`}>
                {formatLabel(d)}{qualityLabel(d) ? ` ${qualityLabel(d)}` : ""}
              </span>
            )}
            {d.status === "skipped" && (
              <span className="text-xs text-yellow-400 flex-shrink-0">DUP</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
