"use client";

import { useState, useEffect } from "react";

const FILENAME_PRESETS = [
  { value: "{artist} - {title}", label: "Artist - Title", example: "Drake - God's Plan" },
  { value: "{title}", label: "Title only", example: "God's Plan" },
  { value: "{artist} - {title} [{bpm}BPM {camelot}]", label: "DJ format", example: "Drake - God's Plan [176BPM 5A]" },
  { value: "{artist} - {title} [{key}]", label: "With key", example: "Drake - God's Plan [Fm]" },
];

export default function SettingsTab({ settings, onSettingsChange }) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [customTemplate, setCustomTemplate] = useState("");

  useEffect(() => {
    setLocalSettings(settings);
    // Check if current template is a preset
    const isPreset = FILENAME_PRESETS.some((p) => p.value === settings.filename_template);
    if (!isPreset) {
      setCustomTemplate(settings.filename_template || "");
    }
  }, [settings]);

  const update = (key, value) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: localSettings }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      onSettingsChange(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const isPreset = FILENAME_PRESETS.some((p) => p.value === localSettings.filename_template);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold">Settings</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Configure download behavior and file naming
          </p>
        </div>

        {/* Quality Default */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Default Quality</label>
          <p className="text-xs text-[var(--text-secondary)]">
            Default audio quality for new downloads
          </p>
          <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-secondary)] w-fit">
            {["128", "192", "256", "320", "flac"].map((q) => (
              <button
                key={q}
                onClick={() => update("quality", q)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  localSettings.quality === q
                    ? q === "flac"
                      ? "bg-amber-600 text-white"
                      : "bg-brand-600 text-white"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                {q === "flac" ? "FLAC" : `${q}`}
              </button>
            ))}
          </div>
        </div>

        {/* Normalization Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">Audio Normalization</label>
            <p className="text-xs text-[var(--text-secondary)]">
              Normalize loudness to -14 LUFS (recommended for DJ sets)
            </p>
          </div>
          <button
            onClick={() => update("normalize", !localSettings.normalize)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              localSettings.normalize ? "bg-brand-600" : "bg-[var(--border)]"
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                localSettings.normalize ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Concurrent Downloads */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Concurrent Downloads</label>
          <p className="text-xs text-[var(--text-secondary)]">
            Number of tracks to download simultaneously
          </p>
          <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-secondary)] w-fit">
            {[1, 2, 3, 4, 6].map((n) => (
              <button
                key={n}
                onClick={() => update("concurrent_downloads", n)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  localSettings.concurrent_downloads === n
                    ? "bg-brand-600 text-white"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Filename Template */}
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Filename Template</label>
            <p className="text-xs text-[var(--text-secondary)]">
              How downloaded files are named. Available: {"{title}"}, {"{artist}"}, {"{bpm}"}, {"{key}"}, {"{camelot}"}, {"{source}"}
            </p>
          </div>

          <div className="space-y-2">
            {FILENAME_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => update("filename_template", preset.value)}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                  localSettings.filename_template === preset.value
                    ? "bg-brand-600/15 border border-brand-500/30"
                    : "bg-[var(--bg-secondary)] border border-transparent hover:border-[var(--border)]"
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{preset.label}</p>
                  <p className="text-xs text-[var(--text-secondary)] font-mono">{preset.example}</p>
                </div>
                {localSettings.filename_template === preset.value && (
                  <svg className="w-4 h-4 text-brand-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}

            {/* Custom template */}
            <div
              className={`p-3 rounded-xl transition-all ${
                !isPreset
                  ? "bg-brand-600/15 border border-brand-500/30"
                  : "bg-[var(--bg-secondary)] border border-transparent"
              }`}
            >
              <p className="text-sm font-medium mb-2">Custom template</p>
              <input
                type="text"
                value={!isPreset ? localSettings.filename_template : customTemplate}
                onChange={(e) => {
                  setCustomTemplate(e.target.value);
                  update("filename_template", e.target.value);
                }}
                onFocus={() => {
                  if (isPreset) {
                    setCustomTemplate(localSettings.filename_template);
                    update("filename_template", localSettings.filename_template);
                  }
                }}
                placeholder="{artist} - {title} [{bpm}BPM]"
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-sm font-mono placeholder-[var(--text-secondary)] focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-sm font-semibold transition-all"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
