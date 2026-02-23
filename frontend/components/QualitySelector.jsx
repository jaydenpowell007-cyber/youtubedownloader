"use client";

const QUALITIES = [
  { value: "128", label: "128", desc: "Small" },
  { value: "192", label: "192", desc: "Medium" },
  { value: "256", label: "256", desc: "High" },
  { value: "320", label: "320", desc: "Best" },
  { value: "flac", label: "FLAC", desc: "Lossless" },
];

export default function QualitySelector({ quality, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--text-secondary)]">Quality:</span>
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-secondary)]">
        {QUALITIES.map((q) => (
          <button
            key={q.value}
            onClick={() => onChange(q.value)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              quality === q.value
                ? q.value === "flac"
                  ? "bg-amber-600 text-white"
                  : "bg-brand-600 text-white"
                : "text-[var(--text-secondary)] hover:text-white"
            }`}
            title={`${q.label} kbps — ${q.desc}`}
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
