import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionContext, type Session } from './session-context';
import { RequireSession } from './RequireSession';

function renderWith(session: Partial<Session>) {
  const value: Session = {
    status: 'loading',
    signIn: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
    ...session,
  };
  render(
    <SessionContext.Provider value={value}>
      <RequireSession next="/profile"><p>secret profile</p></RequireSession>
    </SessionContext.Provider>,
  );
  return value;
}

describe('RequireSession (ProtectedProfile)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a spinner and does not redirect while the session is loading', () => {
    const session = renderWith({ status: 'loading' });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('secret profile')).not.toBeInTheDocument();
    expect(session.signIn).not.toHaveBeenCalled();
  });

  it('redirects a signed-out user to the login with next=/profile', () => {
    const session = renderWith({ status: 'signedOut' });
    expect(session.signIn).toHaveBeenCalledWith('/profile');
    expect(screen.queryByText('secret profile')).not.toBeInTheDocument();
  });

  it('renders the protected page for a signed-in user', () => {
    const session = renderWith({ status: 'signedIn', email: 'a@b.c' });
    expect(screen.getByText('secret profile')).toBeInTheDocument();
    expect(session.signIn).not.toHaveBeenCalled();
  });
});
