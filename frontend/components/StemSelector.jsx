"use client";

const STEM_OPTIONS = [
  {
    id: "vocals",
    label: "Vocals",
    desc: "Acapella",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    ),
    color: "pink",
  },
  {
    id: "drums",
    label: "Drums",
    desc: "Percussion",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    ),
    color: "orange",
  },
  {
    id: "bass",
    label: "Bass",
    desc: "Low-end",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
      </svg>
    ),
    color: "cyan",
  },
  {
    id: "other",
    label: "Other",
    desc: "Instruments",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
    color: "green",
  },
  {
    id: "instrumental",
    label: "Instrumental",
    desc: "No vocals",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      </svg>
    ),
    color: "purple",
  },
  {
    id: "original",
    label: "Original",
    desc: "Full track",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
    color: "brand",
  },
];

const COLOR_CLASSES = {
  pink: {
    active: "bg-pink-500/20 border-pink-500/50 text-pink-300",
    icon: "text-pink-400",
  },
  orange: {
    active: "bg-orange-500/20 border-orange-500/50 text-orange-300",
    icon: "text-orange-400",
  },
  cyan: {
    active: "bg-cyan-500/20 border-cyan-500/50 text-cyan-300",
    icon: "text-cyan-400",
  },
  green: {
    active: "bg-green-500/20 border-green-500/50 text-green-300",
    icon: "text-green-400",
  },
  purple: {
    active: "bg-purple-500/20 border-purple-500/50 text-purple-300",
    icon: "text-purple-400",
  },
  brand: {
    active: "bg-brand-500/20 border-brand-500/50 text-brand-300",
    icon: "text-brand-400",
  },
};

export default function StemSelector({ selected, onChange }) {
  const toggle = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const selectAll = () => onChange(STEM_OPTIONS.map((s) => s.id));
  const deselectAll = () => onChange([]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-secondary)]">Include in ZIP:</span>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-[10px] text-brand-400 hover:text-brand-300 transition-colors"
          >
            Select All
          </button>
          <span className="text-[10px] text-[var(--text-secondary)]">/</span>
          <button
            onClick={deselectAll}
            className="text-[10px] text-[var(--text-secondary)] hover:text-white transition-colors"
          >
            Deselect All
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {STEM_OPTIONS.map((stem) => {
          const isActive = selected.includes(stem.id);
          const colors = COLOR_CLASSES[stem.color];
          return (
            <button
              key={stem.id}
              onClick={() => toggle(stem.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-left ${
                isActive
                  ? colors.active
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-white/20 hover:text-white"
              }`}
            >
              <span className={isActive ? colors.icon : "text-[var(--text-secondary)]"}>
                {stem.icon}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium">{stem.label}</p>
                <p className="text-[10px] opacity-60">{stem.desc}</p>
              </div>
              {isActive && (
                <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
