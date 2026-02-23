/**
 * Catch-all API proxy route.
 *
 * Every request to /api/* is forwarded server-side to the backend
 * (Railway, local, etc.) so the browser only ever sees same-origin
 * requests — no CORS issues.
 *
 * The backend URL is read from NEXT_PUBLIC_API_URL at runtime.
 */

const BACKEND =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Headers we should NOT forward from the incoming request. */
const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
]);

/** Headers we should NOT copy back from the backend response. */
const SKIP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "transfer-encoding",
  "connection",
]);

async function proxyRequest(request, { params }) {
  const { path } = await params;
  const backendPath = `/api/${path.join("/")}`;

  // Preserve query string
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const url = `${BACKEND}${backendPath}${qs ? `?${qs}` : ""}`;

  // Forward headers, stripping hop-by-hop ones
  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }

  const fetchInit = {
    method: request.method,
    headers,
  };

  // Forward body for methods that have one
  if (!["GET", "HEAD"].includes(request.method)) {
    fetchInit.body = await request.arrayBuffer();
    // Ensure content-type is forwarded (arrayBuffer strips it)
    const ct = request.headers.get("content-type");
    if (ct) headers["content-type"] = ct;
  }

  let upstream;
  try {
    upstream = await fetch(url, fetchInit);
  } catch (err) {
    return Response.json(
      {
        error: "Backend unreachable",
        detail: `Could not connect to ${BACKEND} — ${err.message}`,
      },
      { status: 502 },
    );
  }

  // Build response headers, skipping problematic ones
  const responseHeaders = new Headers();
  for (const [key, value] of upstream.headers.entries()) {
    if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
