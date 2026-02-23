"use client";

import { useState, useRef } from "react";
import StemSelector from "./StemSelector";
import QualitySelector from "./QualitySelector";
import { apiUrl } from "../lib/api";

export default function StemsTab({ onDownload, quality, onQualityChange }) {
  const [mode, setMode] = useState("url"); // url | upload
  const [url, setUrl] = useState("");
  const [selectedStems, setSelectedStems] = useState(["vocals", "drums", "bass", "other"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qualityWarning, setQualityWarning] = useState("");
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");

  const detectSource = (u) => {
    const lower = u.toLowerCase();
    if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "YouTube";
    if (lower.includes("soundcloud.com")) return "SoundCloud";
    if (lower.includes("spotify.com")) return "Spotify";
    return null;
  };

  const source = url ? detectSource(url) : null;

  const handleUrlSubmit = async () => {
    if (!url.trim() || selectedStems.length === 0) return;
    setLoading(true);
    setError("");
    setQualityWarning("");

    try {
      const res = await fetch(apiUrl("/api/stems/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          quality,
          stems: selectedStems,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to start separation");
      }
      const job = await res.json();
      onDownload([job]);
      setUrl("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || selectedStems.length === 0) return;
    setLoading(true);
    setError("");
    setQualityWarning("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("stems", selectedStems.join(","));

      const res = await fetch(apiUrl("/api/stems/upload"), {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to upload file");
      }
      const job = await res.json();

      // Show quality warning if present
      if (job.stems?.quality_warning) {
        setQualityWarning(job.stems.quality_warning);
      }

      onDownload([job]);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setFileName(file ? file.name : "");
    setQualityWarning("");
  };

  const canSubmit =
    selectedStems.length > 0 &&
    !loading &&
    (mode === "url" ? url.trim().length > 0 : !!fileRef.current?.files?.[0]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121A3 3 0 109.88 9.88m4.242 4.242L9.88 9.88m4.242 4.242L18 18m-8.121-8.121L6 6" />
            </svg>
            Stem Separation
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Extract vocals, drums, bass, and instruments using AI (Demucs)
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-secondary)] w-fit">
          <button
            onClick={() => setMode("url")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === "url"
                ? "bg-brand-600 text-white"
                : "text-[var(--text-secondary)] hover:text-white"
            }`}
          >
            URL
          </button>
          <button
            onClick={() => setMode("upload")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === "upload"
                ? "bg-brand-600 text-white"
                : "text-[var(--text-secondary)] hover:text-white"
            }`}
          >
            Upload File
          </button>
        </div>

        {/* URL Input */}
        {mode === "url" && (
          <div className="space-y-3">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canSubmit && handleUrlSubmit()}
                placeholder="Paste YouTube, SoundCloud, or Spotify URL..."
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-sm focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 outline-none transition-all"
              />
              {source && (
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                  source === "SoundCloud"
                    ? "bg-orange-500/15 text-orange-400"
                    : source === "Spotify"
                      ? "bg-green-500/15 text-green-400"
                      : "bg-red-500/15 text-red-400"
                }`}>
                  {source}
                </span>
              )}
            </div>
            <QualitySelector quality={quality} onChange={onQualityChange} />
          </div>
        )}

        {/* File Upload */}
        {mode === "upload" && (
          <div className="space-y-3">
            <label
              className="flex flex-col items-center gap-3 px-6 py-8 rounded-xl border-2 border-dashed border-[var(--border)] hover:border-brand-500/50 transition-colors cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && fileRef.current) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  fileRef.current.files = dt.files;
                  setFileName(file.name);
                }
              }}
            >
              <div className="w-12 h-12 rounded-full bg-brand-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              {fileName ? (
                <div className="text-center">
                  <p className="text-sm font-medium">{fileName}</p>
                  <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Click or drag to replace</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-[var(--text-secondary)]">
                    Drop an audio file here or <span className="text-brand-400">browse</span>
                  </p>
                  <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">MP3, WAV, FLAC, M4A</p>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Quality Warning */}
        {qualityWarning && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <svg className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-xs text-yellow-300">{qualityWarning}</p>
          </div>
        )}

        {/* Stem Selector */}
        <StemSelector selected={selectedStems} onChange={setSelectedStems} />

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={mode === "url" ? handleUrlSubmit : handleFileUpload}
          disabled={!canSubmit}
          className="w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-600/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121A3 3 0 109.88 9.88m4.242 4.242L9.88 9.88m4.242 4.242L18 18m-8.121-8.121L6 6" />
              </svg>
              Separate {selectedStems.length} stem{selectedStems.length !== 1 ? "s" : ""}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
