"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import DownloadTab from "../components/DownloadTab";
import SearchTab from "../components/SearchTab";
import SpotifyTab from "../components/SpotifyTab";
import HistoryTab from "../components/HistoryTab";
import SettingsTab from "../components/SettingsTab";
import DownloadQueue from "../components/DownloadQueue";
import { apiUrl, wsUrl } from "../lib/api";

const TABS = [
  { id: "download", label: "Download Link" },
  { id: "search", label: "Search Music" },
  { id: "spotify", label: "Spotify Import" },
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
  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const reconnectRef = useRef(null);
  const downloadedJobIds = useRef(new Set());

  // Load queue from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
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
        // Trigger browser download via hidden anchor
        const a = document.createElement("a");
        a.href = apiUrl(`/api/download-file/${d.job_id}`);
        a.download = "";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });
  }, [downloads]);

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
          <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-secondary)] w-fit flex-wrap">
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
        <div className="max-w-5xl mx-auto text-center text-xs text-[var(--text-secondary)]">
          Downloads are saved directly to your browser&apos;s Downloads folder
        </div>
      </footer>
    </div>
  );
}
