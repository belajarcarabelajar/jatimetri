import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Profile from './Profile';

// Mock navigation
const navigateMock = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
}));

const signOutMock = vi.fn().mockResolvedValue(undefined);
// Stable references: a new getToken per render would re-trigger the fetch effect
const authState = { isSignedIn: true, getToken: vi.fn().mockResolvedValue('fake-token') };
const clerkState = { signOut: signOutMock };

// Mock Clerk
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => authState,
  useClerk: () => clerkState,
  useUser: () => ({ user: { fullName: 'Test User', primaryEmailAddress: { emailAddress: 'test@example.com' } } }),
}));

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
    
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('deletes the account only after typing the confirmation word', async () => {
    render(<Profile />);
    await waitFor(() => expect(screen.getByText(/Pola Dominan: Pattern 1/i)).toBeInTheDocument());

    fireEvent.click(within(screen.getByText('Hapus Akun & Data').closest('div.space-y-4') as HTMLElement).getByRole('button', { name: /^Hapus$/ }));
    const confirmButton = screen.getByRole('button', { name: /Hapus Akun Permanen/ });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/untuk konfirmasi/), { target: { value: 'hapus' } });
    expect(confirmButton).toBeEnabled();

    const listFetch = vi.mocked(globalThis.fetch).getMockImplementation();
    vi.mocked(globalThis.fetch).mockImplementation((url, init) =>
      init?.method === 'DELETE' ? Promise.resolve({ ok: true } as Response) : listFetch!(url, init));
    fireEvent.click(confirmButton);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/api\/account$/),
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(signOutMock).toHaveBeenCalled();
  });

  it('keeps the user signed in when account deletion fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<Profile />);
    await waitFor(() => expect(screen.getByText(/Pola Dominan: Pattern 1/i)).toBeInTheDocument());

    fireEvent.click(within(screen.getByText('Hapus Akun & Data').closest('div.space-y-4') as HTMLElement).getByRole('button', { name: /^Hapus$/ }));
    fireEvent.change(screen.getByLabelText(/untuk konfirmasi/), { target: { value: 'HAPUS' } });
    const listFetch = vi.mocked(globalThis.fetch).getMockImplementation();
    vi.mocked(globalThis.fetch).mockImplementation((url, init) =>
      init?.method === 'DELETE' ? Promise.resolve({ ok: false, status: 500 } as Response) : listFetch!(url, init));
    fireEvent.click(screen.getByRole('button', { name: /Hapus Akun Permanen/ }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(signOutMock).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
