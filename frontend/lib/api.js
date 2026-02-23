/**
 * API URL utility.
 *
 * HTTP requests use relative URLs (e.g. "/api/info") which are proxied
 * to the backend by Next.js rewrites (configured in next.config.js).
 * This avoids CORS issues entirely — the browser sees same-origin requests.
 *
 * WebSocket connections need a direct URL to the backend since Vercel
 * edge rewrites don't reliably proxy WebSocket upgrades.
 *
 * Set NEXT_PUBLIC_API_URL on Vercel to your Railway backend URL,
 * e.g. "https://your-app.up.railway.app"
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Returns the path as-is for HTTP requests.
 * All HTTP calls go through Next.js rewrites (server-side proxy),
 * so no CORS headers are needed.
 */
export function apiUrl(path) {
  return path;
}

/**
 * Construct a WebSocket URL for the backend.
 * - Dev: uses current host with ws:// protocol (proxied by Next.js rewrites)
 * - Prod: derives ws(s):// URL from NEXT_PUBLIC_API_URL (direct connection)
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
