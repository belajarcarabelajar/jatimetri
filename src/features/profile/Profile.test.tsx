import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Profile from './Profile';

// Mock navigation
const navigateMock = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
}));

const resetAssessmentMock = vi.hoisted(() => vi.fn());
vi.mock('@/store/useAssessmentStore', () => ({
  useAssessmentStore: (select: (s: { resetAssessment: () => void }) => unknown) => select({ resetAssessment: resetAssessmentMock }),
}));

// Stable references: a new refresh per render would re-trigger the fetch effect
const session = vi.hoisted(() => ({
  status: 'signedIn' as const,
  email: 'test@example.com',
  signIn: vi.fn(),
  signOut: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/auth', () => ({
  useSession: () => session,
}));

const openDeleteData = () =>
  fireEvent.click(within(screen.getByText('Hapus Data Jatimetri').closest('div.space-y-4') as HTMLElement).getByRole('button', { name: /^Hapus$/ }));

describe('Profile', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        reports: [
          {
            id: '1',
            stage: 'adult',
            created_at: Math.floor(Date.now() / 1000),
            dominance_pattern: 'Pattern 1',
            radar_data: '[]',
            tendencies: '[]'
          }
        ]
      })
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<Profile />);
    // Initial fetch triggers loading, wait for it to pass or check if loading shows
    expect(screen.getByText('Profil & Riwayat Laporan')).toBeInTheDocument();
  });

  it('fetches and displays reports', async () => {
    render(<Profile />);
    
    // Wait for the report to be rendered
    await waitFor(() => {
      expect(screen.getByText(/Kategori: adult/i)).toBeInTheDocument();
      expect(screen.getByText(/Pola Dominan: Pattern 1/i)).toBeInTheDocument();
    });
    
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/reports', expect.objectContaining({ credentials: 'include' }));
  });

  it('shows the session email with an initial-letter avatar', () => {
    render(<Profile />);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('explains that the BCB account is managed at belajarcarabelajar.com/account', () => {
    render(<Profile />);
    expect(screen.getByRole('link', { name: /belajarcarabelajar\.com\/account/ }))
      .toHaveAttribute('href', 'https://belajarcarabelajar.com/account');
  });

  it('re-checks the session when the reports request is unauthorized', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false, status: 401 } as Response);
    render(<Profile />);
    await waitFor(() => expect(session.refresh).toHaveBeenCalled());
    expect(screen.queryByText(/Gagal menghubungi server/)).not.toBeInTheDocument();
  });

  it('shows an error when the reports request fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' } as Response);
    render(<Profile />);
    await waitFor(() => expect(screen.getByText(/Gagal menghubungi server: Server Error: 500 - boom/)).toBeInTheDocument());
    warnSpy.mockRestore();
  });

  it('deletes a single assessment after confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Profile />);
    await waitFor(() => expect(screen.getByText(/Pola Dominan: Pattern 1/i)).toBeInTheDocument());

    const listFetch = vi.mocked(globalThis.fetch).getMockImplementation();
    vi.mocked(globalThis.fetch).mockImplementation((url, init) =>
      init?.method === 'DELETE' ? Promise.resolve({ ok: true } as Response) : listFetch!(url, init));
    const row = screen.getByText(/Pola Dominan: Pattern 1/i).closest('div.p-4') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Hapus/ }));

    await waitFor(() => expect(screen.queryByText(/Pola Dominan: Pattern 1/i)).not.toBeInTheDocument());
    expect(globalThis.fetch).toHaveBeenLastCalledWith('/api/assessments/1', expect.objectContaining({ method: 'DELETE', credentials: 'include' }));
    confirmSpy.mockRestore();
  });

  it('deletes the Jatimetri data only after typing the confirmation word', async () => {
    render(<Profile />);
    await waitFor(() => expect(screen.getByText(/Pola Dominan: Pattern 1/i)).toBeInTheDocument());

    openDeleteData();
    const confirmButton = screen.getByRole('button', { name: /Hapus Data Permanen/ });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/untuk konfirmasi/), { target: { value: 'hapus' } });
    expect(confirmButton).toBeEnabled();

    const listFetch = vi.mocked(globalThis.fetch).getMockImplementation();
    vi.mocked(globalThis.fetch).mockImplementation((url, init) =>
      init?.method === 'DELETE' ? Promise.resolve({ ok: true } as Response) : listFetch!(url, init));
    fireEvent.click(confirmButton);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      '/api/account',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' })
    );
    expect(resetAssessmentMock).toHaveBeenCalled();
    // The Worker cleared the cookie; the session is re-read (→ signed out), not logged out separately
    expect(session.refresh).toHaveBeenCalled();
    expect(session.signOut).not.toHaveBeenCalled();
  });

  it('keeps the user signed in when deleting the data fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<Profile />);
    await waitFor(() => expect(screen.getByText(/Pola Dominan: Pattern 1/i)).toBeInTheDocument());

    openDeleteData();
    fireEvent.change(screen.getByLabelText(/untuk konfirmasi/), { target: { value: 'HAPUS' } });
    const listFetch = vi.mocked(globalThis.fetch).getMockImplementation();
    vi.mocked(globalThis.fetch).mockImplementation((url, init) =>
      init?.method === 'DELETE' ? Promise.resolve({ ok: false, status: 500 } as Response) : listFetch!(url, init));
    fireEvent.click(screen.getByRole('button', { name: /Hapus Data Permanen/ }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(session.refresh).not.toHaveBeenCalled();
    expect(resetAssessmentMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
