import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

const session = vi.hoisted(() => ({
  status: 'loading' as 'loading' | 'signedIn' | 'signedOut',
  email: undefined as string | undefined,
  signIn: vi.fn(),
  signOut: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/lib/auth/session-context', () => ({
  useSession: () => session,
}));
vi.mock('./features/profile/Profile', () => ({
  default: () => <p>profile page</p>,
}));

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('App routes – /profile (ProtectedProfile)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.status = 'loading';
  });

  it('shows a spinner while the session is loading', () => {
    renderAt('/profile');
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(session.signIn).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to the BCB login with next=/profile', () => {
    session.status = 'signedOut';
    renderAt('/profile');
    expect(session.signIn).toHaveBeenCalledWith('/profile');
    expect(screen.queryByText('profile page')).not.toBeInTheDocument();
  });

  it('renders the profile for a signed-in user', async () => {
    session.status = 'signedIn';
    session.email = 'ani@example.com';
    renderAt('/profile');
    await waitFor(() => expect(screen.getByText('profile page')).toBeInTheDocument());
  });

  it('renders the home page without any session', () => {
    session.status = 'signedOut';
    renderAt('/');
    expect(screen.getByRole('link', { name: /Mulai Assessment/ })).toBeInTheDocument();
    expect(session.signIn).not.toHaveBeenCalled();
  });
});
