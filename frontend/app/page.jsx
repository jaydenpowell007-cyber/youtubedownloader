"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import DownloadTab from "../components/DownloadTab";
import SearchTab from "../components/SearchTab";
import SpotifyTab from "../components/SpotifyTab";
import HistoryTab from "../components/HistoryTab";
import DownloadQueue from "../components/DownloadQueue";

const TABS = [
  { id: "download", label: "Download Link" },
  { id: "search", label: "Search Music" },
  { id: "spotify", label: "Spotify Import" },
  { id: "history", label: "History" },
];

const TERMINAL_STATUSES = new Set(["done", "error", "skipped"]);

export default function Home() {
  const [activeTab, setActiveTab] = useState("download");
  const [downloads, setDownloads] = useState([]);
  const [quality, setQuality] = useState("320");
  const pollRef = useRef(null);

  const addDownloads = (newJobs) => {
    setDownloads((prev) => [...newJobs, ...prev]);
  };

  // Poll active jobs for live progress
  const pollJobs = useCallback(async () => {
    const activeIds = downloads
      .filter((d) => !TERMINAL_STATUSES.has(d.status))
      .map((d) => d.job_id);

    if (activeIds.length === 0) return;

    try {
      const res = await fetch("/api/jobs/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: activeIds }),
      });
      if (!res.ok) return;
      const updated = await res.json();

      // Merge updates into current downloads
      setDownloads((prev) => {
        const updateMap = new Map(updated.map((u) => [u.job_id, u]));
        return prev.map((d) => updateMap.get(d.job_id) || d);
      });
    } catch {
      // Silently ignore polling errors
    }
  }, [downloads]);

  useEffect(() => {
    const hasActive = downloads.some((d) => !TERMINAL_STATUSES.has(d.status));

    if (hasActive) {
      pollRef.current = setInterval(pollJobs, 1500);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [downloads, pollJobs]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center font-bold text-lg">
              DJ
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                MP3 Downloader
              </h1>
              <p className="text-xs text-[var(--text-secondary)]">
                DJ Edition
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-secondary)] w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-brand-600 text-white shadow-lg"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Active Tab Content */}
          <div className="animate-slide-up" key={activeTab}>
            {activeTab === "download" && (
              <DownloadTab
                onDownload={addDownloads}
                quality={quality}
                onQualityChange={setQuality}
              />
            )}
            {activeTab === "search" && (
              <SearchTab
                onDownload={addDownloads}
                quality={quality}
                onQualityChange={setQuality}
              />
            )}
            {activeTab === "spotify" && (
              <SpotifyTab
                onDownload={addDownloads}
                quality={quality}
                onQualityChange={setQuality}
              />
            )}
            {activeTab === "history" && <HistoryTab />}
          </div>

          {/* Download Queue */}
          {downloads.length > 0 && (
            <DownloadQueue
              downloads={downloads}
              onClear={() => setDownloads([])}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] px-6 py-4">
        <div className="max-w-5xl mx-auto text-center text-xs text-[var(--text-secondary)]">
          Downloads saved to ~/Downloads/DJ-Music
        </div>
      </footer>
    </div>
  );
}
