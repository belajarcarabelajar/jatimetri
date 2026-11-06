import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionProvider } from './SessionProvider';
import { useSession } from './session-context';

const wrapper = ({ children }: { children: ReactNode }) => <SessionProvider>{children}</SessionProvider>;

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('SessionProvider / useSession', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts loading, then is signedIn with the email from GET /api/me (200)', async () => {
    fetchMock.mockResolvedValue(json(200, { email: 'ani@example.com' }));
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.email).toBe('ani@example.com');
    expect(fetchMock).toHaveBeenCalledWith('/api/me', expect.objectContaining({ credentials: 'include' }));
    // Cookie auth only: no Authorization header is ever sent
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('is signedOut on 401', async () => {
    fetchMock.mockResolvedValue(json(401, { error: 'unauthorized' }));
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(result.current.email).toBeUndefined();
  });

  it('is signedOut on a network error instead of crashing', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('signedOut'));
  });

  it('is signedOut when a static host answers /api/me with HTML (200, not JSON)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } });
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('signedOut'));
  });

  it('is signedOut when the body has no email string', async () => {
    fetchMock.mockResolvedValue(json(200, { user: 'x' }));
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('signedOut'));
  });

  it('signOut posts /api/logout and then is signedOut', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { email: 'ani@example.com' }));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 } as Response);
    await act(() => result.current.signOut());

    expect(fetchMock).toHaveBeenLastCalledWith('/api/logout', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(result.current.status).toBe('signedOut');
    expect(result.current.email).toBeUndefined();
  });

  it('signOut falls back to re-reading /api/me when logout fails', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { email: 'ani@example.com' }));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    fetchMock.mockResolvedValueOnce(json(200, { email: 'ani@example.com' }));
    await act(() => result.current.signOut());

    expect(fetchMock).toHaveBeenLastCalledWith('/api/me', expect.anything());
    expect(result.current.status).toBe('signedIn');
  });

  it('refresh re-reads the session (e.g. signed out after the data was deleted)', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { email: 'ani@example.com' }));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    fetchMock.mockResolvedValueOnce(json(401, {}));
    await act(() => result.current.refresh());

    expect(result.current.status).toBe('signedOut');
  });

  it('signIn navigates the whole page to the BCB login with the encoded next path', async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, pathname: '/dashboard', search: '?a=1&b=2', assign });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    result.current.signIn('/profile');
    expect(assign).toHaveBeenLastCalledWith('/masuk-bcb/mulai?next=%2Fprofile');

    result.current.signIn();
    expect(assign).toHaveBeenLastCalledWith('/masuk-bcb/mulai?next=%2Fdashboard%3Fa%3D1%26b%3D2');
  });

  it('useSession throws outside the provider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Probe() {
      useSession();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(/SessionProvider/);
    errorSpy.mockRestore();
  });

  it('renders its children', async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    render(<SessionProvider><p>child</p></SessionProvider>);
    expect(screen.getByText('child')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
