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

  const doneCount = downloads.filter((d) => d.status === "done").length;
  const errorCount = downloads.filter((d) => d.status === "error").length;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Downloads</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {doneCount} completed
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

      <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
        {downloads.map((d) => (
          <div
            key={d.job_id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--bg-secondary)]"
          >
            {statusIcon(d.status)}
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{d.title || "Processing..."}</p>
              {d.error && (
                <p className="text-xs text-red-400 truncate">{d.error}</p>
              )}
            </div>
            {d.status === "done" && (
              <span className="text-xs text-green-400 flex-shrink-0">MP3</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
