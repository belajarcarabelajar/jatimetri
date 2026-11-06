import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Dashboard from './Dashboard';
import { useAssessmentStore } from '@/store/useAssessmentStore';
import { generatePDF } from '../pdf/generatePDF';

// Mock navigation
const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock the session (signed in by default; tests flip `status`)
const session = vi.hoisted(() => ({
  status: 'signedIn' as 'loading' | 'signedIn' | 'signedOut',
  email: 'test@example.com',
  signIn: vi.fn(),
  signOut: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  useSession: () => session,
}));

// Mock Store
vi.mock('@/store/useAssessmentStore', () => ({
  useAssessmentStore: vi.fn(),
}));

// Mock PDF Generator
vi.mock('../pdf/generatePDF', () => ({
  generatePDF: vi.fn().mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' })),
}));

// Mock Scoring Matrix
vi.mock('@/data/scoring/scoring-matrix', () => ({
  evaluateAnswers: vi.fn(() => ({
    dominancePattern: 'Test Pattern',
    radarData: [{ subject: 'Test', A: 100, fullMark: 100 }],
    tendencies: [{ id: '1', label: 'Tendency A', description: 'Desc A', quality: 'strong' }],
  })),
}));

// Mock Recharts to avoid jsdom rendering issues with SVGs
vi.mock('recharts', async () => {
  const OriginalModule = await vi.importActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    RadarChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="radar-chart">{children}</div>,
  };
});

describe('Dashboard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(useAssessmentStore).mockReturnValue({
      answers: { 'Q-ID-01': 'Test User', 'Q-01': 5 },
      stage: 'adult',
      userName: 'Test User',
    });
  });

  it('renders loading state initially', () => {
    // We expect loading state to be true initially
    render(<Dashboard />);
    expect(screen.getByText('Menganalisis Pola dan Potensi...')).toBeInTheDocument();
  });

  it('renders dashboard content after loading', async () => {
    render(<Dashboard />);
    
    // Check main elements - waiting for loading to finish
    await waitFor(() => {
      expect(screen.getByText('Laporan Jatimetri')).toBeInTheDocument();
    }, { timeout: 3000 });
    
    expect(screen.getAllByText('Test Pattern')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Tendency A')[0]).toBeInTheDocument();
    expect(screen.getAllByTestId('radar-chart')[0]).toBeInTheDocument();
  });
});

/** Render the Dashboard and skip past its 2 s "analyzing" splash. */
function renderLoaded() {
  vi.useFakeTimers();
  try {
    render(<Dashboard />);
    act(() => { vi.advanceTimersByTime(2000); });
  } finally {
    vi.useRealTimers();
  }
}

describe('Dashboard – empty state', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockNavigate.mockClear();
  });

  function mockAnswers(answers: Record<string, unknown>) {
    vi.mocked(useAssessmentStore).mockReturnValue({ answers, stage: null, userName: '' });
  }

  it('shows an empty state instead of a default result when there are no answers', () => {
    mockAnswers({});
    render(<Dashboard />);

    expect(screen.getByText('Belum ada hasil')).toBeInTheDocument();
    expect(screen.queryByText('Test Pattern')).not.toBeInTheDocument();
    expect(screen.queryByText('Laporan Jatimetri')).not.toBeInTheDocument();
    // Neither the loading splash nor any save/download action is offered
    expect(screen.queryByText('Menganalisis Pola dan Potensi...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unduh PDF/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Simpan|Masuk/ })).not.toBeInTheDocument();
    expect(document.getElementById('pdf-container')).toBeNull();
  });

  it('offers to start the assessment and navigates to /assessment', () => {
    mockAnswers({});
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: /Mulai Assessment/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/assessment');
  });

  it('offers to continue when only identity (Q-ID-*) answers exist', () => {
    mockAnswers({ 'Q-ID-01': 'Budi', 'Q-ID-02': 'Dewasa' });
    render(<Dashboard />);

    expect(screen.getByText('Belum ada hasil')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lanjutkan Assessment/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/assessment');
  });

  it('still shows a historical report even when the store has no answers', () => {
    sessionStorage.setItem('view-historical-report', JSON.stringify({
      dominancePattern: 'Historical Pattern',
      radarData: [{ subject: 'Test', A: 50, fullMark: 100 }],
      tendencies: [],
      stage: 'adult',
    }));
    mockAnswers({});
    renderLoaded();

    expect(screen.queryByText('Belum ada hasil')).not.toBeInTheDocument();
    expect(screen.getAllByText('Historical Pattern')[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unduh PDF/ })).toBeInTheDocument();
  });
});

describe('Dashboard – PDF download', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(generatePDF).mockClear();
    vi.mocked(useAssessmentStore).mockReturnValue({
      answers: { 'Q-01': 5 },
      stage: 'adult',
      userName: 'Test User',
    });
    // Signed-in users also save + upload after download; keep that off the network
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ assessmentId: 'a1' }) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads generatePDF on demand and generates from the hidden report container', async () => {
    renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /Unduh PDF/ }));

    await waitFor(() => expect(generatePDF).toHaveBeenCalledTimes(1));
    expect(vi.mocked(generatePDF).mock.calls[0][0]).toBe('pdf-container');
    expect(vi.mocked(generatePDF).mock.calls[0][1]).toMatch(/^Inner_Potential_Assessment_Test User_\d{4}-\d{2}-\d{2}\.pdf$/);
    // Fresh result → save attempt, then upload the generated PDF
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/api\/save-attempt$/);
    expect(vi.mocked(fetch).mock.calls[1][0]).toMatch(/\/api\/upload-pdf$/);
  });

  it('alerts the user when PDF generation fails', async () => {
    vi.mocked(generatePDF).mockRejectedValueOnce(new Error('boom'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /Unduh PDF/ }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Gagal membuat PDF.'));
    alertSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('Dashboard – save & login', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockNavigate.mockClear();
    session.signIn.mockClear();
    vi.mocked(useAssessmentStore).mockReturnValue({
      answers: { 'Q-01': 5 },
      stage: 'adult',
      userName: 'Test User',
    });
  });

  afterEach(() => {
    session.status = 'signedIn';
    vi.unstubAllGlobals();
  });

  it('signed out: "Login & Simpan" sends the user to the BCB login and back to /dashboard', () => {
    session.status = 'signedOut';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderLoaded();

    expect(screen.queryByRole('button', { name: /Simpan Laporan/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Login & Simpan/ }));

    expect(session.signIn).toHaveBeenCalledWith('/dashboard');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('while the session is loading, offers neither save nor login', () => {
    session.status = 'loading';
    renderLoaded();

    expect(screen.queryByRole('button', { name: /Login & Simpan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Simpan Laporan/ })).not.toBeInTheDocument();
  });

  it('signed out: downloading a PDF does not call the API', async () => {
    session.status = 'signedOut';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: /Unduh PDF/ }));
    await waitFor(() => expect(generatePDF).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signed in: saves with the session cookie (no Authorization header) and opens /profile', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: /Simpan Laporan/ }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/profile'));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/save-attempt');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(init.body)).toMatchObject({ stage: 'adult', answers: { 'Q-01': 5 }, dominancePattern: 'Test Pattern' });
  });

  it('signed in: an expired session (401) sends the user back through the login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '' }));
    renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: /Simpan Laporan/ }));

    await waitFor(() => expect(session.signIn).toHaveBeenCalledWith('/dashboard'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('signed in: alerts on other save errors', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }));
    renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: /Simpan Laporan/ }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('500 - boom')));
    alertSpy.mockRestore();
  });
});
