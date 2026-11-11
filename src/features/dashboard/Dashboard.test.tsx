import React from 'react';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
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
    session.status = 'signedIn';
    vi.mocked(useAssessmentStore).mockReturnValue({
      answers: { 'Q-01': 5 },
      stage: 'adult',
      userName: 'Test User',
    });
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
  });

  it('privasi-2: signed in, Unduh PDF only downloads and sends nothing to the server', async () => {
    renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /Unduh PDF/ }));

    await waitFor(() => expect(generatePDF).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /Unduh PDF/ })).toBeEnabled());
    expect(fetch).not.toHaveBeenCalled();
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

describe('audit-1109 one attempt per result and historical PDF', () => {
  const callsTo = (path: string) =>
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith(path));

  beforeEach(() => {
    sessionStorage.clear();
    mockNavigate.mockClear();
    vi.mocked(generatePDF).mockClear();
    session.status = 'signedIn';
    vi.mocked(useAssessmentStore).mockReturnValue({
      answers: { 'Q-01': 5 },
      stage: 'adult',
      userName: 'Test User',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ assessmentId: 'a1' }) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a double click on save sends one request', async () => {
    let finish: (value: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { finish = resolve; })));
    renderLoaded();

    // Both clicks land before React re-renders, so only the in-flight guard can stop the second
    const button = screen.getByRole('button', { name: /Simpan Laporan/ });
    act(() => {
      button.click();
      button.click();
    });

    expect(callsTo('/api/save-attempt')).toHaveLength(1);
    await act(async () => { finish({ ok: true, status: 200 }); });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/profile'));
  });

  it('disables the save button while the request runs', async () => {
    let finish: (value: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { finish = resolve; })));
    renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: /Simpan Laporan/ }));

    expect(screen.getByRole('button', { name: /Simpan Laporan/ })).toBeDisabled();
    await act(async () => { finish({ ok: false, status: 500, text: async () => 'boom' }); });
    await waitFor(() => expect(screen.getByRole('button', { name: /Simpan Laporan/ })).toBeEnabled());
  });

  it('a historical report gets its own date and no local name in the PDF and its file name', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    sessionStorage.setItem('view-historical-report', JSON.stringify({
      dominancePattern: 'Historical Pattern',
      radarData: [{ subject: 'Test', A: 50, fullMark: 100 }],
      tendencies: [],
      stage: 'adult',
      // 2025-01-15T12:00:00Z as Unix seconds, the unit Profile.tsx writes
      createdAt: 1736942400,
    }));
    renderLoaded();

    const pdf = document.getElementById('pdf-container') as HTMLElement;
    expect(pdf.textContent).not.toContain('Test User');
    expect(pdf.textContent).not.toContain('Disiapkan untuk');
    expect(within(pdf).getByText(/^Tanggal:/).textContent).toContain('2025');

    fireEvent.click(screen.getByRole('button', { name: /Unduh PDF/ }));

    await waitFor(() => expect(generatePDF).toHaveBeenCalledTimes(1));
    expect(vi.mocked(generatePDF).mock.calls[0][1]).toBe('Inner_Potential_Assessment_2025-01-15.pdf');
    await waitFor(() => expect(screen.getByRole('button', { name: /Unduh PDF/ })).toBeEnabled());
    expect(fetch).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('a live result keeps the name in the PDF', () => {
    renderLoaded();

    const pdf = document.getElementById('pdf-container') as HTMLElement;
    expect(pdf.textContent).toContain('Disiapkan untuk');
    expect(pdf.textContent).toContain('Test User');
  });
});

describe('audit-1109 review: shared save and attempt limit', () => {
  const LIMIT_MESSAGE = 'Batas laporan tersimpan sudah tercapai. Hapus laporan lama di halaman Profil, lalu coba simpan lagi.';

  const callsTo = (path: string) =>
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith(path));
  const saveButton = () => screen.getByRole('button', { name: /Simpan Laporan/ });
  const downloadButton = () => screen.getByRole('button', { name: /Unduh PDF/ });

  let alertSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  function stubApi(save: Promise<unknown>) {
    vi.stubGlobal('fetch', vi.fn(() => save));
  }

  function deferredSave() {
    let finish: (value: unknown) => void = () => {};
    const promise = new Promise<unknown>((resolve) => { finish = resolve; });
    return { promise, finish: (value: unknown) => finish(value) };
  }

  const savedResponse = { ok: true, status: 200, json: async () => ({ assessmentId: 'a1' }) };
  const limitResponse = {
    ok: false,
    status: 429,
    text: async () => '{"error":"Too many saved attempts"}',
    json: async () => ({ error: 'Too many saved attempts' }),
  };

  beforeEach(() => {
    sessionStorage.clear();
    mockNavigate.mockClear();
    vi.mocked(generatePDF).mockClear();
    session.status = 'signedIn';
    vi.mocked(useAssessmentStore).mockReturnValue({
      answers: { 'Q-01': 5 },
      stage: 'adult',
      userName: 'Test User',
    });
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('disables Unduh PDF while a save runs', async () => {
    const save = deferredSave();
    stubApi(save.promise);
    renderLoaded();

    fireEvent.click(saveButton());

    expect(downloadButton()).toBeDisabled();
    fireEvent.click(downloadButton());
    await act(async () => { save.finish(savedResponse); });
    await waitFor(() => expect(downloadButton()).toBeEnabled());
    expect(generatePDF).not.toHaveBeenCalled();
    expect(callsTo('/api/save-attempt')).toHaveLength(1);
  });

  it('Simpan at the saved-report limit (429) shows the Indonesian limit message', async () => {
    stubApi(Promise.resolve(limitResponse));
    renderLoaded();

    fireEvent.click(saveButton());

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(LIMIT_MESSAGE));
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('privasi-2: the dashboard never uploads a PDF', () => {
  const callsTo = (path: string) =>
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith(path));

  beforeEach(() => {
    sessionStorage.clear();
    mockNavigate.mockClear();
    vi.mocked(generatePDF).mockClear();
    session.status = 'signedIn';
    vi.mocked(useAssessmentStore).mockReturnValue({
      answers: { 'Q-01': 5 },
      stage: 'adult',
      userName: 'Test User',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ assessmentId: 'a1' }) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers no "Simpan ke riwayat" button when signed in', () => {
    renderLoaded();
    expect(screen.getByRole('button', { name: /Simpan Laporan/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Simpan ke riwayat/ })).not.toBeInTheDocument();
  });

  it('Simpan Laporan saves the result only and uploads no PDF', async () => {
    renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /Simpan Laporan/ }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/profile'));
    expect(callsTo('/api/save-attempt')).toHaveLength(1);
    expect(callsTo('/api/upload-pdf')).toHaveLength(0);
    expect(generatePDF).not.toHaveBeenCalled();
  });
});
