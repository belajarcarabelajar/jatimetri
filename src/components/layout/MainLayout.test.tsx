import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MainLayout } from './MainLayout';

const session = vi.hoisted(() => ({
  status: 'signedOut' as 'loading' | 'signedIn' | 'signedOut',
  email: undefined as string | undefined,
  signIn: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  useSession: () => session,
}));

function renderLayout(path = '/assessment-info') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<p>home page</p>} />
          <Route path="*" element={<p>other page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const desktopNav = () => screen.getByRole('navigation', { name: 'Navigasi utama' });

describe('MainLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.status = 'signedOut';
    session.email = undefined;
  });

  it('signed out: shows "Masuk" and no private links; clicking it starts the login', () => {
    renderLayout();
    const nav = desktopNav();

    expect(within(nav).getByRole('link', { name: 'Assessment' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Profil' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /Keluar/ })).not.toBeInTheDocument();

    fireEvent.click(within(nav).getByRole('button', { name: 'Masuk' }));
    expect(session.signIn).toHaveBeenCalledWith();
  });

  it('loading: shows neither the login button nor private links', () => {
    session.status = 'loading';
    renderLayout();
    const nav = desktopNav();

    expect(within(nav).queryByRole('button', { name: 'Masuk' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('signed in: shows dashboard/profile links, the email and "Keluar"', () => {
    session.status = 'signedIn';
    session.email = 'ani@example.com';
    renderLayout();
    const nav = desktopNav();

    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(within(nav).getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/profile');
    expect(within(nav).getByText('ani@example.com')).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Masuk' })).not.toBeInTheDocument();
    // Language switcher stays available
    expect(within(nav).getByRole('button', { name: 'English' })).toBeInTheDocument();
  });

  it('signed in: "Keluar" signs out and goes home', async () => {
    session.status = 'signedIn';
    session.email = 'ani@example.com';
    renderLayout('/dashboard');

    fireEvent.click(within(desktopNav()).getByRole('button', { name: /Keluar/ }));

    expect(session.signOut).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('home page')).toBeInTheDocument());
  });

  it('mobile drawer mirrors the session state', () => {
    session.status = 'signedIn';
    session.email = 'ani@example.com';
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Buka/tutup menu' }));
    expect(screen.getByText('Masuk sebagai')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Keluar/ })).toHaveLength(2);
  });

  it('mobile drawer offers "Masuk" when signed out', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Buka/tutup menu' }));
    const buttons = screen.getAllByRole('button', { name: 'Masuk' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(session.signIn).toHaveBeenCalled();
    // The drawer closes after starting the login
    expect(screen.getAllByRole('button', { name: 'Masuk' })).toHaveLength(1);
  });
});
