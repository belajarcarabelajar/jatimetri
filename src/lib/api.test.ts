import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch, apiUrl, signInUrl } from './api';

describe('api helpers (default: same origin)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds relative URLs', () => {
    expect(apiUrl('/api/me')).toBe('/api/me');
    expect(apiUrl('api/me')).toBe('/api/me');
  });

  it('builds the BCB login URL with an encoded next path', () => {
    expect(signInUrl('/dashboard?x=1')).toBe('/masuk-bcb/mulai?next=%2Fdashboard%3Fx%3D1');
  });

  it('always sends credentials and keeps the caller options', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/logout', { method: 'POST' });

    expect(fetchMock).toHaveBeenCalledWith('/api/logout', { method: 'POST', credentials: 'include' });
  });
});

describe('api helpers with VITE_API_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('prefixes the configured base URL (trailing slash trimmed)', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/');
    vi.resetModules();
    const api = await import('./api');
    expect(api.apiUrl('/api/me')).toBe('https://api.example.com/api/me');
    expect(api.signInUrl('/')).toBe('https://api.example.com/masuk-bcb/mulai?next=%2F');
  });
});
