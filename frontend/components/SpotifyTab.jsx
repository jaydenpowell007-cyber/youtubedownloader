"use client";

import { useState } from "react";
import QualitySelector from "./QualitySelector";
import { apiUrl } from "../lib/api";

export default function SpotifyTab({ onDownload, quality, onQualityChange }) {
  const [url, setUrl] = useState("");
  const [tracks, setTracks] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchResults, setMatchResults] = useState(null); // {trackIndex: {matches: [], selectedMatch: 0}}
  const [error, setError] = useState("");

  const fetchTracks = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setTracks([]);
    setSelected(new Set());
    setMatchResults(null);

    try {
      const res = await fetch(apiUrl("/api/spotify/tracks"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to fetch playlist");
      }
      const data = await res.json();
      setTracks(data);
      setSelected(new Set(data.map((_, i) => i)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (index) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === tracks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tracks.map((_, i) => i)));
    }
  };

  // Find YouTube matches for selected tracks
  const handleFindMatches = async () => {
    if (selected.size === 0) return;
    setMatching(true);
    setError("");

    const selectedTracks = [...selected].map((i) => ({
      index: i,
      ...tracks[i],
    }));

    try {
      const res = await fetch(apiUrl("/api/spotify/match"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracks: selectedTracks.map((t) => ({
            search_query: t.search_query,
            title: t.title,
            artist: t.artist,
          })),
          platform: "youtube",
          max_results: 3,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Matching failed");
      }
      const data = await res.json();

      // Build match results map
      const results = {};
      data.forEach((item, idx) => {
        const trackIndex = selectedTracks[idx].index;
        results[trackIndex] = {
          matches: item.matches || [],
          selectedMatch: 0,
        };
      });
      setMatchResults(results);
    } catch (e) {
      setError(e.message);
    } finally {
      setMatching(false);
    }
  };

  const changeMatch = (trackIndex, matchIndex) => {
    setMatchResults((prev) => ({
      ...prev,
      [trackIndex]: { ...prev[trackIndex], selectedMatch: matchIndex },
    }));
  };

  // Download with Spotify metadata enrichment
  const handleDownload = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    setError("");

    try {
      if (matchResults) {
        // Download matched tracks with Spotify metadata
        const items = [...selected]
          .filter((i) => matchResults[i] && matchResults[i].matches.length > 0)
          .map((i) => {
            const match = matchResults[i].matches[matchResults[i].selectedMatch];
            const track = tracks[i];
            return {
              url: match.url,
              spotify_meta: {
                title: track.title,
                artist: track.artist,
                album: track.album,
                album_art: track.album_art || "",
                year: track.release_year || "",
              },
            };
          });

        if (items.length === 0) {
          setError("No matched tracks to download");
          setDownloading(false);
          return;
        }

        const res = await fetch(apiUrl("/api/spotify/download-matched"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, quality }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || "Download failed");
        }
        const jobs = await res.json();
        onDownload(jobs);
      } else {
        // Direct download without matching (auto-search + download)
        const selectedTracks = [...selected].map((i) => tracks[i]);
        for (const track of selectedTracks) {
          try {
            const searchRes = await fetch(apiUrl("/api/search"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: track.search_query,
                platform: "youtube",
                max_results: 1,
              }),
            });
            if (!searchRes.ok) continue;
            const results = await searchRes.json();
            if (results.length === 0) continue;

            const dlRes = await fetch(apiUrl("/api/spotify/download-matched"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                items: [{
                  url: results[0].url,
                  spotify_meta: {
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    album_art: track.album_art || "",
                    year: track.release_year || "",
                  },
                }],
                quality,
              }),
            });
            if (!dlRes.ok) continue;
            const dlJobs = await dlRes.json();
            onDownload(dlJobs);
          } catch {
            continue;
          }
        }
      }

      setSelected(new Set());
      setMatchResults(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  };

  const formatDuration = (ms) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4 card-hover">
        <h2 className="text-base font-semibold">Import from Spotify</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Paste a Spotify playlist URL — tracks will be matched on YouTube and downloaded with Spotify metadata
        </p>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-green-500">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchTracks()}
              placeholder="https://open.spotify.com/playlist/..."
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-sm placeholder-[var(--text-secondary)] focus:outline-none focus:border-green-500 transition-all"
              aria-label="Spotify playlist URL"
            />
          </div>
          <button
            onClick={fetchTracks}
            disabled={loading || !url.trim()}
            className="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-all"
          >
            {loading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : "Import"}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        )}
      </div>

      {/* Track List */}
      {tracks.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {tracks.length} Tracks
              <span className="ml-2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">
                Spotify
              </span>
            </h3>
            <button
              onClick={selectAll}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              {selected.size === tracks.length ? "Deselect All" : "Select All"}
            </button>
          </div>

          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-2">
            {tracks.map((t, i) => (
              <div key={i} className="space-y-1">
                <button
                  onClick={() => toggleSelect(i)}
                  className={`w-full flex items-center gap-4 p-3 rounded-xl text-left transition-all ${
                    selected.has(i)
                      ? "bg-brand-600/15 border border-brand-500/30"
                      : "bg-[var(--bg-secondary)] border border-transparent hover:border-[var(--border)]"
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      selected.has(i)
                        ? "bg-brand-600 border-brand-600"
                        : "border-[var(--border)]"
                    }`}
                  >
                    {selected.has(i) && (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>

                  {/* Album art */}
                  {t.album_art && (
                    <img
                      src={t.album_art}
                      alt=""
                      className="w-10 h-10 object-cover rounded-md flex-shrink-0"
                    />
                  )}

                  {/* Track number */}
                  <span className="text-[var(--text-secondary)] text-xs w-5 text-right flex-shrink-0">
                    {i + 1}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {t.artist}
                      {t.album && ` — ${t.album}`}
                      {t.duration_ms > 0 && ` · ${formatDuration(t.duration_ms)}`}
                    </p>
                  </div>
                </button>

                {/* Match results for this track */}
                {matchResults && matchResults[i] && matchResults[i].matches.length > 0 && selected.has(i) && (
                  <div className="ml-10 space-y-1">
                    {matchResults[i].matches.map((m, mi) => (
                      <button
                        key={mi}
                        onClick={() => changeMatch(i, mi)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-xs transition-all ${
                          matchResults[i].selectedMatch === mi
                            ? "bg-green-600/15 border border-green-500/30"
                            : "bg-[var(--bg-secondary)] border border-transparent hover:border-[var(--border)]"
                        }`}
                      >
                        <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          matchResults[i].selectedMatch === mi
                            ? "border-green-500 bg-green-500"
                            : "border-[var(--border)]"
                        }`}>
                          {matchResults[i].selectedMatch === mi && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                        {m.thumbnail && (
                          <img src={m.thumbnail} alt="" className="w-12 h-8 object-cover rounded flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{m.title}</p>
                          <p className="text-[var(--text-secondary)] truncate">{m.channel} · {m.duration}</p>
                        </div>
                        <span className={`text-[9px] font-semibold uppercase px-1 py-0.5 rounded flex-shrink-0 ${
                          m.source === "soundcloud"
                            ? "bg-orange-500/15 text-orange-400"
                            : "bg-red-500/15 text-red-400"
                        }`}>
                          {m.source === "soundcloud" ? "SC" : "YT"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {matchResults && matchResults[i] && matchResults[i].matches.length === 0 && selected.has(i) && (
                  <div className="ml-10 px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs">
                    No matches found
                  </div>
                )}
              </div>
            ))}
          </div>

          {selected.size > 0 && (
            <div className="space-y-3">
              <QualitySelector quality={quality} onChange={onQualityChange} />

              <div className="flex gap-3">
                {!matchResults && (
                  <button
                    onClick={handleFindMatches}
                    disabled={matching}
                    className="flex-1 px-6 py-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-brand-500 text-sm font-semibold transition-all"
                  >
                    {matching ? "Finding matches..." : "Preview Matches"}
                  </button>
                )}
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className={`${matchResults ? "w-full" : "flex-1"} px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-40 text-sm font-semibold transition-all glow-pulse`}
                >
                  {downloading
                    ? "Downloading..."
                    : `Download ${selected.size} Track${selected.size > 1 ? "s" : ""} as ${quality === "flac" ? "FLAC" : "MP3"}`}
                </button>
              </div>

              {matchResults && (
                <button
                  onClick={() => setMatchResults(null)}
                  className="w-full text-xs text-[var(--text-secondary)] hover:text-white transition-colors py-1"
                >
                  Clear matches
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
