"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import DownloadTab from "../components/DownloadTab";
import SearchTab from "../components/SearchTab";
import SpotifyTab from "../components/SpotifyTab";
import StemsTab from "../components/StemsTab";
import HistoryTab from "../components/HistoryTab";
import SettingsTab from "../components/SettingsTab";
import DownloadQueue from "../components/DownloadQueue";
import ToastContainer, { useToast } from "../components/Toast";
import { apiUrl, wsUrl } from "../lib/api";

const TAB_ICONS = {
  download: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  search: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  spotify: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  ),
  history: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  stems: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121A3 3 0 109.88 9.88m4.242 4.242L9.88 9.88m4.242 4.242L18 18m-8.121-8.121L6 6" />
    </svg>
  ),
  settings: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

const TABS = [
  { id: "download", label: "Download" },
  { id: "search", label: "Search" },
  { id: "spotify", label: "Spotify" },
  { id: "stems", label: "Stems" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
];

const TERMINAL_STATUSES = new Set(["done", "error", "skipped"]);
const QUEUE_STORAGE_KEY = "dj-downloader-queue";
const SETTINGS_STORAGE_KEY = "dj-downloader-settings";

export default function Home() {
  const [activeTab, setActiveTab] = useState("download");
  const [downloads, setDownloads] = useState([]);
  const [quality, setQuality] = useState("320");
  const [settings, setSettings] = useState({
    quality: "320",
    normalize: true,
    filename_template: "{artist} - {title}",
    concurrent_downloads: 3,
  });
  const { toasts, addToast, removeToast } = useToast();
  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const reconnectRef = useRef(null);
  const downloadedJobIds = useRef(new Set());

  // Load queue from localStorage on mount — pre-seed downloadedJobIds
  // so completed jobs don't retrigger browser downloads on revisit
  useEffect(() => {
    try {
      const saved = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((d) => {
            if (d.status === "done") downloadedJobIds.current.add(d.job_id);
            if (d.status === "error") downloadedJobIds.current.add(d.job_id + "_err");
          });
          setDownloads(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist queue to localStorage on change
  useEffect(() => {
    try {
      if (downloads.length > 0) {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(downloads));
      } else {
        localStorage.removeItem(QUEUE_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [downloads]);

  // Auto-trigger browser download when a job completes
  useEffect(() => {
    downloads.forEach((d) => {
      if (d.status === "done" && d.filename && !downloadedJobIds.current.has(d.job_id)) {
        downloadedJobIds.current.add(d.job_id);
        const isStemsJob = d.stems && d.format_type === "zip";
        addToast(
          isStemsJob ? `Stems ready: ${d.title || "Track"}` : `Downloaded: ${d.title || "Track"}`,
          "success"
        );
        // Trigger browser download via hidden anchor
        const a = document.createElement("a");
        a.href = apiUrl(isStemsJob ? `/api/stems/download/${d.job_id}` : `/api/download-file/${d.job_id}`);
        a.download = "";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      if (d.status === "error" && d.error && !downloadedJobIds.current.has(d.job_id + "_err")) {
        downloadedJobIds.current.add(d.job_id + "_err");
        addToast(`Failed: ${d.title || "Track"}`, "error");
      }
    });
  }, [downloads, addToast]);

  // Load settings from server on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch(apiUrl("/api/settings"));
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
          setQuality(data.quality || "320");
        }
      } catch {
        // Use defaults
      }
    };
    loadSettings();
  }, []);

  // Sync quality with settings
  const handleQualityChange = (q) => {
    setQuality(q);
  };

  const handleSettingsChange = (newSettings) => {
    setSettings(newSettings);
    if (newSettings.quality) {
      setQuality(newSettings.quality);
    }
  };

  const addDownloads = (newJobs) => {
    setDownloads((prev) => [...newJobs, ...prev]);
  };

  // --- WebSocket connection for real-time progress ---
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(wsUrl("/ws/progress"));

    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        setDownloads((prev) => {
          const idx = prev.findIndex((d) => d.job_id === update.job_id);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], ...update };
          return next;
        });
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      // Reconnect after 3 seconds
      reconnectRef.current = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  // Connect WebSocket when there are active downloads
  useEffect(() => {
    const hasActive = downloads.some((d) => !TERMINAL_STATUSES.has(d.status));

    if (hasActive) {
      connectWebSocket();
    }

    return () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
      }
    };
  }, [downloads, connectWebSocket]);

  // Fallback polling in case WebSocket fails
  const pollJobs = useCallback(async () => {
    const activeIds = downloads
      .filter((d) => !TERMINAL_STATUSES.has(d.status))
      .map((d) => d.job_id);

    if (activeIds.length === 0) return;

    // Skip polling if WebSocket is connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    try {
      const res = await fetch(apiUrl("/api/jobs/poll"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: activeIds }),
      });
      if (!res.ok) return;
      const updated = await res.json();

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
      pollRef.current = setInterval(pollJobs, 2000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [downloads, pollJobs]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const activeDownloadCount = downloads.filter((d) => !TERMINAL_STATUSES.has(d.status)).length;

  return (
    <div className="min-h-screen flex flex-col bg-grid-pattern">
      {/* Header */}
      <header className="header-glass border-b border-[var(--border)] px-6 py-4 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#06d6a0] to-[#8338ec] flex items-center justify-center font-bold text-lg shadow-[0_0_20px_rgba(6,214,160,0.3)]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                MP3 Downloader
              </h1>
              <p className="text-xs font-medium bg-gradient-to-r from-[#06d6a0] to-[#ff006e] bg-clip-text text-transparent">
                DJ Edition
              </p>
            </div>
          </div>
          {activeDownloadCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#06d6a0]/10 border border-[#06d6a0]/20">
              <div className="w-2 h-2 rounded-full bg-[#06d6a0] animate-pulse" />
              <span className="text-xs font-medium text-brand-300">
                {activeDownloadCount} active
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
          {/* Tabs */}
          <nav className="flex gap-0 w-full sm:w-fit overflow-x-auto scrollbar-hide border-b border-[var(--border)]" role="tablist" aria-label="Main navigation">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap flex-1 sm:flex-none justify-center sm:justify-start ${
                  activeTab === tab.id
                    ? "text-white"
                    : "text-[var(--text-secondary)] hover:text-white/80"
                }`}
                style={activeTab === tab.id ? { textShadow: "0 0 12px rgba(6, 214, 160, 0.5)" } : undefined}
              >
                {TAB_ICONS[tab.id]}
                <span className="hidden sm:inline">{tab.label}</span>
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#06d6a0] rounded-full shadow-[0_0_8px_rgba(6,214,160,0.6)]" />
                )}
              </button>
            ))}
          </nav>

          {/* Active Tab Content */}
          <div className="animate-slide-up" key={activeTab} role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={activeTab}>
            {activeTab === "download" && (
              <DownloadTab
                onDownload={addDownloads}
                quality={quality}
                onQualityChange={handleQualityChange}
              />
            )}
            {activeTab === "search" && (
              <SearchTab
                onDownload={addDownloads}
                quality={quality}
                onQualityChange={handleQualityChange}
              />
            )}
            {activeTab === "spotify" && (
              <SpotifyTab
                onDownload={addDownloads}
                quality={quality}
                onQualityChange={handleQualityChange}
              />
            )}
            {activeTab === "stems" && (
              <StemsTab
                onDownload={addDownloads}
                quality={quality}
                onQualityChange={handleQualityChange}
              />
            )}
            {activeTab === "history" && <HistoryTab />}
            {activeTab === "settings" && (
              <SettingsTab
                settings={settings}
                onSettingsChange={handleSettingsChange}
              />
            )}
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
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>Downloads are saved to your browser&apos;s Downloads folder</span>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline">YouTube, SoundCloud &amp; Stem Separation</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#06d6a0]" />
              Connected
            </span>
          </div>
        </div>
      </footer>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
