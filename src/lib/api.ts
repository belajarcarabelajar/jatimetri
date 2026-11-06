/**
 * Single place that knows where the API lives.
 *
 * By default the Worker is served on the same origin as the SPA, so every URL is
 * relative ("/api/..."). VITE_API_URL can point at another origin; requests always
 * send credentials so the HttpOnly session cookie travels either way.
 * Auth is cookie-only: never attach an Authorization header or keep tokens in JS.
 */
const API_BASE: string = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), { ...init, credentials: "include" });
}

/** URL of the BCB unified-login start route; `next` is where the user lands afterwards. */
export function signInUrl(nextPath: string): string {
  return `${apiUrl("/masuk-bcb/mulai")}?next=${encodeURIComponent(nextPath)}`;
}
