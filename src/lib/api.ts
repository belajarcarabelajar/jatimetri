/**
 * Single place that knows where the API lives.
 *
 * The Worker is routed on the same origin as the SPA (jatimetri.belajarcarabelajar.com/api/*
 * and /masuk-bcb*), so every URL is relative ("/api/..."). The API must stay on that origin:
 * the session cookie `__Host-jatimetri_sesi` is host-only and SameSite=Lax, so a fetch to
 * another site never carries it, `credentials: "include"` or not. VITE_API_URL is only for a
 * same-origin path prefix or for local development.
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
