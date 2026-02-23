/**
 * API URL utility for constructing correct backend URLs in both
 * development (relative URLs via Next.js rewrites) and production
 * (direct calls to the backend).
 *
 * Set NEXT_PUBLIC_API_URL on Vercel to your Railway backend URL,
 * e.g. "https://your-app.up.railway.app"
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Construct a full API URL.
 * - Dev: returns relative path like "/api/info" (proxied by Next.js rewrites)
 * - Prod: returns full URL like "https://backend.railway.app/api/info"
 */
export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

/**
 * Construct a WebSocket URL for the backend.
 * - Dev: uses current host with ws:// protocol
 * - Prod: derives ws(s):// URL from NEXT_PUBLIC_API_URL
 */
export function wsUrl(path) {
  if (API_BASE) {
    // Production: derive WebSocket URL from the API base
    const url = new URL(API_BASE);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}${path}`;
  }
  // Development: use current page host (proxied by Next.js rewrites)
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${path}`;
  }
  return path;
}
