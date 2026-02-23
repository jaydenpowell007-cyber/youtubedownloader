"use client";

import { useState } from "react";
import DownloadTab from "../components/DownloadTab";
import SearchTab from "../components/SearchTab";
import DownloadQueue from "../components/DownloadQueue";

export default function Home() {
  const [activeTab, setActiveTab] = useState("download");
  const [downloads, setDownloads] = useState([]);

  const addDownloads = (newJobs) => {
    setDownloads((prev) => [...newJobs, ...prev]);
  };

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
            <button
              onClick={() => setActiveTab("download")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "download"
                  ? "bg-brand-600 text-white shadow-lg"
                  : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              Download Link
            </button>
            <button
              onClick={() => setActiveTab("search")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "search"
                  ? "bg-brand-600 text-white shadow-lg"
                  : "text-[var(--text-secondary)] hover:text-white"
              }`}
            >
              Search Music
            </button>
          </div>

          {/* Active Tab Content */}
          <div className="animate-slide-up">
            {activeTab === "download" ? (
              <DownloadTab onDownload={addDownloads} />
            ) : (
              <SearchTab onDownload={addDownloads} />
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
          Downloads saved to ~/Downloads/DJ-Music
        </div>
      </footer>
    </div>
  );
}
