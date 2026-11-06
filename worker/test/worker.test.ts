import { describe, expect, test } from 'bun:test';
import fixture from '../src/auth/sso-v1.fixture.json';
import { createSsoToken, safeReturnPath, verifySsoToken } from '../src/auth/bcb-sso';
import { SESSION_COOKIE } from '../src/auth/session';
import { APEX_LOGIN_URL, createApp, STATE_COOKIE } from '../src/app';
import { createTestD1, createTestR2 } from './d1-sqlite';

const SECRET = 'uji-rahasia-sso-jatimetri-0123456789abcde';
const ORIGIN = 'https://jatimetri.belajarcarabelajar.com';
const NOW = new Date('2030-01-01T00:00:00Z');
const NOW_S = Math.floor(NOW.getTime() / 1000);
const STATE = `${'a'.repeat(40)}-_9`;
const NONCE = 'BBBBBBBBBBBBBBBBBBBBBB';
const EMAIL = 'pembeli@contoh.id';

function setup(o: { secret?: string | undefined } = {}) {
  const DB = createTestD1();
  const R2 = createTestR2();
  let n = 0;
  const app = createApp({ now: () => NOW, random: (len) => new Uint8Array(len).fill(++n) });
  const env = { DB, REPORTS_BUCKET: R2, BCB_SSO_RAHASIA: 'secret' in o ? o.secret : SECRET };
  const reqAt = (url: string, init: RequestInit = {}) => app.request(url, init, env);
  const req = (path: string, init: RequestInit = {}) => reqAt(`${ORIGIN}${path}`, init);
  return { DB, R2, env, req, reqAt };
}

const cookieValue = (res: Response, name: string) =>
  res.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;

async function token(o: { email?: string; nonce?: string; secret?: string; aud?: string } = {}) {
  return createSsoToken({ secret: o.secret ?? SECRET, aud: o.aud ?? 'jatimetri', email: o.email ?? EMAIL, nowSeconds: NOW_S, nonce: o.nonce ?? NONCE });
}

async function login(s: ReturnType<typeof setup>, o: { nonce?: string; next?: string } = {}) {
  const t = await token({ nonce: o.nonce });
  return s.req(`/masuk-bcb?t=${encodeURIComponent(t)}&next=${encodeURIComponent(o.next ?? '/profile')}&s=${STATE}`, {
    headers: { cookie: `${STATE_COOKIE}=${STATE}` },
  });
}

async function signedIn(s: ReturnType<typeof setup>) {
  const res = await login(s);
  const session = cookieValue(res, SESSION_COOKIE);
  expect(session).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return `${SESSION_COOKIE}=${session}`;
}

describe('bcb-sso contract', () => {
  test('accepts the shared v1 fixture from the bcb monorepo, byte for byte', async () => {
    const r = await verifySsoToken(fixture.token, { secret: fixture.rahasia, aud: fixture.aud, nowSeconds: fixture.sekarangDetik });
    expect(r).toEqual({ ok: true, email: fixture.email, exp: fixture.exp, nonce: fixture.nonce });
    expect(await createSsoToken({ secret: fixture.rahasia, aud: fixture.aud, email: fixture.email, nowSeconds: fixture.sekarangDetik, nonce: fixture.nonce })).toBe(fixture.token);
  });

  test('rejects another audience, a tampered signature, and expired or future tokens', async () => {
    const opts = { secret: fixture.rahasia, nowSeconds: fixture.sekarangDetik };
    expect(await verifySsoToken(fixture.token, { ...opts, aud: 'jatimetri' })).toEqual({ ok: false, reason: 'signature' });
    const tampered = fixture.token.slice(0, -1) + (fixture.token.endsWith('A') ? 'B' : 'A');
    expect((await verifySsoToken(tampered, { ...opts, aud: fixture.aud })).ok).toBe(false);
    expect(await verifySsoToken(fixture.token, { ...opts, aud: fixture.aud, nowSeconds: fixture.exp + 30 })).toEqual({ ok: false, reason: 'expired' });
    expect(await verifySsoToken(fixture.token, { ...opts, aud: fixture.aud, nowSeconds: fixture.exp - 181 })).toEqual({ ok: false, reason: 'future' });
  });

  test('safeReturnPath blocks open redirects', () => {
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', '/%2F%2Fevil.com', '/%252F%252Fevil.com', '']) {
      expect(safeReturnPath(bad, '/')).toBe('/');
    }
    expect(safeReturnPath('/dashboard?x=1', '/')).toBe('/dashboard?x=1');
  });
});

describe('/masuk-bcb/mulai', () => {
  test('sets a state cookie and redirects to the apex with next and s', async () => {
    const s = setup();
    const res = await s.req('/masuk-bcb/mulai?next=%2Fdashboard');
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(`${loc.origin}${loc.pathname}`).toBe(APEX_LOGIN_URL);
    expect(loc.searchParams.get('next')).toBe('/dashboard');
    const state = cookieValue(res, STATE_COOKIE);
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(loc.searchParams.get('s')).toBe(state);
    expect(res.headers.getSetCookie()[0]).toContain('HttpOnly; Secure; SameSite=Lax');
  });

  test('replaces an unsafe next with / and skips the apex when already signed in', async () => {
    const s = setup();
    expect(new URL((await s.req('/masuk-bcb/mulai?next=%2F%2Fevil.com')).headers.get('location')!).searchParams.get('next')).toBe('/');
    const cookie = await signedIn(s);
    const res = await s.req('/masuk-bcb/mulai?next=%2Fprofile', { headers: { cookie } });
    expect(res.headers.get('location')).toBe('/profile');
  });
});

describe('/masuk-bcb', () => {
  test('valid hand-off creates a session, clears state and redirects to next', async () => {
    const s = setup();
    const res = await login(s);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/profile');
    expect(cookieValue(res, STATE_COOKIE)).toBe('');
    expect(s.DB.raw.prepare('SELECT id, email FROM users').all()).toEqual([{ id: EMAIL, email: EMAIL }]);
    // Only the hash is stored.
    const row = s.DB.raw.prepare('SELECT id_hash, email FROM sessions').get() as { id_hash: string; email: string };
    expect(row.email).toBe(EMAIL);
    expect(row.id_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.id_hash).not.toBe(cookieValue(res, SESSION_COOKIE));
  });

  test('a token is single use (nonce burned)', async () => {
    const s = setup();
    expect((await login(s)).status).toBe(303);
    const replay = await login(s);
    expect(replay.status).toBe(400);
    expect(cookieValue(replay, SESSION_COOKIE)).toBeNull();
  });

  test('missing or mismatched state, bad signature, or other audience fail with the same 400', async () => {
    const s = setup();
    const t = await token({ nonce: 'CCCCCCCCCCCCCCCCCCCCCC' });
    const cases: [string, Record<string, string>][] = [
      [`/masuk-bcb?t=${t}&s=${STATE}`, {}],
      [`/masuk-bcb?t=${t}&s=${STATE}`, { cookie: `${STATE_COOKIE}=${'b'.repeat(43)}` }],
      [`/masuk-bcb?t=${await token({ secret: 'x'.repeat(40) })}&s=${STATE}`, { cookie: `${STATE_COOKIE}=${STATE}` }],
      [`/masuk-bcb?t=${await token({ aud: 'blender' })}&s=${STATE}`, { cookie: `${STATE_COOKIE}=${STATE}` }],
    ];
    const bodies = new Set<string>();
    for (const [path, headers] of cases) {
      const res = await s.req(path, { headers });
      expect(res.status).toBe(400);
      bodies.add(await res.text());
    }
    expect(bodies.size).toBe(1);
    expect(s.DB.raw.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
  });

  test('without a secret it answers 503 and never redirects', async () => {
    const s = setup({ secret: undefined });
    const res = await login(s);
    expect(res.status).toBe(503);
    expect(res.headers.get('location')).toBeNull();
  });

  test('unsafe next falls back to /', async () => {
    const s = setup();
    expect((await login(s, { next: 'https://evil.com' })).headers.get('location')).toBe('/');
  });
});

describe('API with session', () => {
  test('/api/me is 401 without a session and returns the email with one', async () => {
    const s = setup();
    expect((await s.req('/api/me')).status).toBe(401);
    expect((await s.req('/api/me', { headers: { cookie: `${SESSION_COOKIE}=${'z'.repeat(43)}` } })).status).toBe(401);
    const cookie = await signedIn(s);
    const res = await s.req('/api/me', { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: EMAIL });
  });

  test('logout requires an allowed Origin, deletes the session and clears the cookie', async () => {
    const s = setup();
    const cookie = await signedIn(s);
    expect((await s.req('/api/logout', { method: 'POST', headers: { cookie } })).status).toBe(403);
    expect((await s.req('/api/logout', { method: 'POST', headers: { cookie, origin: 'https://evil.com' } })).status).toBe(403);
    const res = await s.req('/api/logout', { method: 'POST', headers: { cookie, origin: ORIGIN } });
    expect(res.status).toBe(204);
    expect(cookieValue(res, SESSION_COOKIE)).toBe('');
    expect((await s.req('/api/me', { headers: { cookie } })).status).toBe(401);
  });

  test('state-changing calls from a foreign Origin are refused', async () => {
    const s = setup();
    const cookie = await signedIn(s);
    const res = await s.req('/api/save-attempt', { method: 'POST', headers: { cookie, origin: 'https://evil.com', 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(403);
  });

  test('save, list, upload PDF, delete one, then delete all Jatimetri data', async () => {
    const s = setup();
    const cookie = await signedIn(s);
    const h = { cookie, origin: ORIGIN };
    const save = async () => (await (await s.req('/api/save-attempt', {
      method: 'POST', headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify({ stage: 'adult', dominancePattern: 'Creative Maker', radarData: [], tendencies: [] }),
    })).json()) as { assessmentId: string };
    const a = await save();
    const b = await save();

    const list = (await (await s.req('/api/reports', { headers: h })).json()) as { reports: { id: string; user_id: string }[] };
    expect(list.reports.map((r) => r.user_id)).toEqual([EMAIL, EMAIL]);

    const upload = (id: string) => {
      const fd = new FormData();
      fd.append('file', new File([new Uint8Array([37, 80, 68, 70])], 'report.pdf'));
      fd.append('assessmentId', id);
      return s.req('/api/upload-pdf', { method: 'POST', headers: h, body: fd });
    };
    expect((await upload(a.assessmentId)).status).toBe(200);
    expect((await upload(b.assessmentId)).status).toBe(200);
    expect((await upload('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await upload('../x')).status).toBe(400);
    expect([...s.R2.objects.keys()].sort()).toEqual([`${EMAIL}/${a.assessmentId}.pdf`, `${EMAIL}/${b.assessmentId}.pdf`].sort());

    expect((await s.req(`/api/assessments/${a.assessmentId}`, { method: 'DELETE', headers: h })).status).toBe(200);
    expect(s.R2.objects.has(`${EMAIL}/${a.assessmentId}.pdf`)).toBe(false);

    const del = await s.req('/api/account', { method: 'DELETE', headers: h });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ success: true, pdfsDeleted: 1 });
    expect(cookieValue(del, SESSION_COOKIE)).toBe('');
    expect(s.R2.objects.size).toBe(0);
    expect(s.DB.raw.prepare('SELECT COUNT(*) AS n FROM assessments').get()).toEqual({ n: 0 });
    expect(s.DB.raw.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
    expect((await s.req('/api/me', { headers: { cookie } })).status).toBe(401);
  });

  // A real Cloudflare edge request always carries the client's public IP.
  const edge = { 'cf-connecting-ip': '203.0.113.7' };

  test('in production, localhost Origins get no CORS header', async () => {
    const s = setup();
    const cookie = await signedIn(s);
    for (const origin of ['http://localhost:5173', 'http://localhost:4173']) {
      const me = await s.req('/api/me', { headers: { ...edge, cookie, origin } });
      expect(me.headers.get('access-control-allow-origin')).toBeNull();
      const preflight = await s.req('/api/logout', { method: 'OPTIONS', headers: { ...edge, origin, 'access-control-request-method': 'POST' } });
      expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    }
  });

  test('in production, localhost Origins cannot mutate or log out', async () => {
    const s = setup();
    const cookie = await signedIn(s);
    for (const origin of ['http://localhost:5173', 'http://localhost:4173']) {
      const save = await s.req('/api/save-attempt', { method: 'POST', headers: { ...edge, cookie, origin, 'content-type': 'application/json' }, body: '{}' });
      expect(save.status).toBe(403);
      expect((await s.req('/api/logout', { method: 'POST', headers: { ...edge, cookie, origin } })).status).toBe(403);
    }
    expect((await s.req('/api/me', { headers: { cookie } })).status).toBe(200);
  });

  test('in production, the production Origin keeps its CORS header', async () => {
    const s = setup();
    const res = await s.req('/api/me', { headers: { 'cf-connecting-ip': '203.0.113.7', origin: ORIGIN } });
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  test('a Worker on localhost accepts the Vite dev origin for CORS and logout', async () => {
    const s = setup();
    const cookie = await signedIn(s);
    const origin = 'http://localhost:5173';
    const me = await s.reqAt('http://localhost:8787/api/me', { headers: { cookie, origin } });
    expect(me.headers.get('access-control-allow-origin')).toBe(origin);
    expect((await s.reqAt('http://localhost:8787/api/logout', { method: 'POST', headers: { cookie, origin } })).status).toBe(204);
  });

  // wrangler dev rewrites request.url to the first route's host and sets CF-Connecting-IP from the socket.
  test('under wrangler dev (route host, loopback client IP) the Vite origins are accepted', async () => {
    for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      const s = setup();
      const cookie = await signedIn(s);
      const origin = 'http://localhost:5173';
      const local = { 'cf-connecting-ip': ip, cookie, origin };
      expect((await s.req('/api/me', { headers: local })).headers.get('access-control-allow-origin')).toBe(origin);
      expect((await s.req('/api/logout', { method: 'POST', headers: local })).status).toBe(204);
    }
  });

  test("a user cannot delete someone else's assessment", async () => {
    const s = setup();
    s.DB.raw.prepare("INSERT INTO users (id) VALUES ('lain@contoh.id')").run();
    s.DB.raw.prepare("INSERT INTO assessments (id, user_id, stage) VALUES ('11111111-1111-4111-8111-111111111111', 'lain@contoh.id', 'adult')").run();
    const cookie = await signedIn(s);
    const res = await s.req('/api/assessments/11111111-1111-4111-8111-111111111111', { method: 'DELETE', headers: { cookie, origin: ORIGIN } });
    expect(res.status).toBe(404);
    expect(s.DB.raw.prepare('SELECT COUNT(*) AS n FROM assessments').get()).toEqual({ n: 1 });
  });
});
