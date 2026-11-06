import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import {
  assertSsoSecret,
  constantTimeEqual,
  readCookie,
  safeReturnPath,
  SSO_CLOCK_SKEW_SECONDS,
  SSO_MIN_SECRET,
  toBase64Url,
  verifySsoToken,
} from './auth/bcb-sso';
import { createSessionStore, SESSION_COOKIE, sessionCookie, CLEAR_SESSION_COOKIE } from './auth/session';

// The subset of the D1 and R2 binding APIs this worker calls. Defined here
// because @cloudflare/workers-types is not a dependency of the worker.
export interface D1Result<T> {
  results: T[];
  success: boolean;
  meta?: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result<Record<string, unknown>>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface R2PutOptions {
  httpMetadata?: { contentType?: string };
}

interface R2Objects {
  objects: { key: string }[];
  truncated: boolean;
  cursor?: string;
}

export interface R2Bucket {
  put(key: string, value: ArrayBuffer, options?: R2PutOptions): Promise<unknown>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<R2Objects>;
  delete(keys: string | string[]): Promise<void>;
}

export type Bindings = {
  // Shared secret with the BCB apex (`SSO_RAHASIA_JATIMETRI` there), >= 32 chars. `wrangler secret put BCB_SSO_RAHASIA`.
  BCB_SSO_RAHASIA?: string;
  // Extra allowed browser origins beyond PRODUCTION_ORIGIN, comma-separated (e.g. a preview deploy URL).
  ALLOWED_ORIGINS?: string;
  DB: D1Database;
  REPORTS_BUCKET: R2Bucket;
};

type AppEnv = { Bindings: Bindings; Variables: { userId: string } };

// Row shape of the `assessments` table (worker/drizzle/0000_round_scorpion.sql).
interface AssessmentRow {
  id: string;
  user_id: string;
  stage: string;
  dominance_pattern: string | null;
  radar_data: string | null;
  tendencies: string | null;
  created_at: number | null;
}

// Shape sent by src/features/dashboard/Dashboard.tsx; not validated at runtime.
interface SaveAttemptBody {
  stage?: string;
  answers?: Record<string, unknown>;
  dominancePattern?: string;
  radarData?: unknown[];
  tendencies?: unknown[];
}

/** Program id registered in the BCB apex (bcb packages/data/src/akun/sso-program.ts). */
export const SSO_AUD = 'jatimetri';
export const APEX_LOGIN_URL = `https://belajarcarabelajar.com/masuk/${SSO_AUD}`;
export const STATE_COOKIE = '__Host-jatimetri_sso_state';
const COOKIE_ATTRS = 'Path=/; HttpOnly; Secure; SameSite=Lax';
const STATE_TTL_SECONDS = 600;
const CLEAR_STATE_COOKIE = `${STATE_COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`;
const RE_STATE = /^[A-Za-z0-9_-]{43}$/;
const RE_ASSESSMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const PRODUCTION_ORIGIN = 'https://jatimetri.belajarcarabelajar.com';
const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173', // vite dev (proxies /api and /masuk-bcb here)
  'http://localhost:4173', // vite preview
];
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '::ffff:127.0.0.1']);

// `wrangler dev` rewrites request.url to the first route's host (the production host), so the URL alone
// cannot tell; it does set CF-Connecting-IP from the local socket. On Cloudflare's edge that header is the
// client's address, never loopback, and a browser page cannot add it without a preflight that carries no value.
function isLocalRequest(c: Context<AppEnv>): boolean {
  return LOOPBACK.has(new URL(c.req.url).hostname) || LOOPBACK.has(c.req.header('cf-connecting-ip') ?? '');
}

function allowedOrigins(c: Context<AppEnv>): string[] {
  const fromEnv = (c.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [PRODUCTION_ORIGIN, ...(isLocalRequest(c) ? LOCAL_DEV_ORIGINS : []), ...fromEnv];
}

function isAllowedOrigin(c: Context<AppEnv>, origin: string): boolean {
  return origin === new URL(c.req.url).origin || allowedOrigins(c).includes(origin);
}

// Deletes every object under `prefix`, page by page (R2 list returns at most 1000 keys).
async function deleteR2Prefix(bucket: R2Bucket, prefix: string): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    const keys = page.objects.map((o) => o.key);
    if (keys.length > 0) {
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

function redirect(location: string, ...cookies: string[]): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 303, headers });
}

const LOGIN_FAILED_HTML =
  '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<meta name="robots" content="noindex"><title>Gagal masuk - Jatimetri</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">' +
  '<h1>Gagal masuk</h1><p>Masuk dengan akun BCB tidak berhasil. Silakan coba lagi.</p><p><a href="/">Kembali ke beranda</a></p></body></html>';

// One body for every failure, so it does not reveal whether state, signature, age or nonce failed.
const loginFailed = (): Response =>
  new Response(LOGIN_FAILED_HTML, {
    status: 400,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'set-cookie': CLEAR_STATE_COOKIE },
  });

const unavailable = (): Response =>
  new Response('Login sedang tidak tersedia. Silakan coba lagi nanti.', {
    status: 503,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'set-cookie': CLEAR_STATE_COOKIE },
  });

export function createApp(deps: { now?: () => Date; random?: (n: number) => Uint8Array } = {}) {
  const clock = deps.now ?? (() => new Date());
  const random = deps.random ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)));
  const seconds = () => Math.floor(clock().getTime() / 1000);
  const sessions = (db: D1Database) => createSessionStore(db, { now: clock, random });

  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    // Only the error name: messages from D1 can contain user data.
    console.error(`Error processing ${c.req.method} ${new URL(c.req.url).pathname}:`, err.name);
    return c.json({ error: 'Internal Server Error' }, 500);
  });

  // CORS only affects requests from another origin (ALLOWED_ORIGINS, e.g. local development). Those never
  // carry the SameSite=Lax session cookie, so the SPA must call the API on its own origin; same-origin requests ignore CORS.
  app.use('/api/*', cors({
    origin: (origin, c) => (allowedOrigins(c).includes(origin) ? origin : null),
    allowHeaders: ['Content-Type'],
    allowMethods: ['POST', 'GET', 'OPTIONS', 'DELETE'],
    credentials: true,
  }));

  app.get('/', (c) => c.text('Jatimetri Assessment API is running'));

  // --- BCB unified login (receiver) -------------------------------------------------------------

  // GET /masuk-bcb/mulai?next=<path>: an existing session goes straight to `next`; otherwise a fresh
  // 32-byte state cookie (10 min) and a 303 to the apex, which logs the user in and hands back a token.
  app.get('/masuk-bcb/mulai', async (c) => {
    const next = safeReturnPath(c.req.query('next') ?? null, '/');
    const email = await sessions(c.env.DB).find(readCookie(c.req.header('cookie'), SESSION_COOKIE));
    if (email !== null) return redirect(next);
    const state = toBase64Url(random(32));
    return redirect(
      `${APEX_LOGIN_URL}?next=${encodeURIComponent(next)}&s=${state}`,
      `${STATE_COOKIE}=${state}; ${COOKIE_ATTRS}; Max-Age=${STATE_TTL_SECONDS}`,
    );
  });

  // GET /masuk-bcb?t&next&s: state (constant time), token v1, single-use nonce, then our own session.
  // Every answer clears the state cookie. Missing secret => 503 without redirecting (fail closed).
  app.get('/masuk-bcb', async (c) => {
    const secret = c.env.BCB_SSO_RAHASIA;
    if (typeof secret !== 'string' || secret.length < SSO_MIN_SECRET) return unavailable();
    assertSsoSecret(secret);

    const state = readCookie(c.req.header('cookie'), STATE_COOKIE) ?? '';
    const s = c.req.query('s') ?? '';
    if (!RE_STATE.test(state) || !RE_STATE.test(s) || !constantTimeEqual(s, state)) return loginFailed();

    const t = seconds();
    const result = await verifySsoToken(c.req.query('t') ?? '', { secret, aud: SSO_AUD, nowSeconds: t });
    if (!result.ok) return loginFailed();

    const db = c.env.DB;
    await db.prepare('DELETE FROM sso_nonce WHERE expires_at < ?').bind(t).run();
    const burn = await db
      .prepare('INSERT OR IGNORE INTO sso_nonce (nonce, expires_at) VALUES (?, ?)')
      .bind(result.nonce, result.exp + SSO_CLOCK_SKEW_SECONDS)
      .run();
    if ((burn.meta?.changes ?? 0) === 0) return loginFailed();

    await db.prepare('INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)').bind(result.email, result.email).run();
    const token = await sessions(db).create(result.email);
    return redirect(safeReturnPath(c.req.query('next') ?? null, '/'), sessionCookie(token), CLEAR_STATE_COOKIE);
  });

  // --- API --------------------------------------------------------------------------------------

  // State-changing requests from a browser must come from an allowed origin. SameSite=Lax already keeps
  // the session cookie off cross-site POST/DELETE; this is the second layer.
  app.use('/api/*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS') {
      const origin = c.req.header('origin');
      if (origin !== undefined && !isAllowedOrigin(c, origin)) return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  });

  // POST /api/logout: must carry an allowed Origin (a cross-site form could otherwise log people out).
  app.post('/api/logout', async (c) => {
    const origin = c.req.header('origin');
    if (origin === undefined || !isAllowedOrigin(c, origin)) return c.json({ error: 'Forbidden' }, 403);
    await sessions(c.env.DB).remove(readCookie(c.req.header('cookie'), SESSION_COOKIE));
    return new Response(null, { status: 204, headers: { 'set-cookie': CLEAR_SESSION_COOKIE, 'cache-control': 'no-store' } });
  });

  // Session middleware for the remaining /api/* routes.
  app.use('/api/*', async (c, next) => {
    const email = await sessions(c.env.DB).find(readCookie(c.req.header('cookie'), SESSION_COOKIE));
    if (email === null) return c.json({ error: 'Unauthorized' }, 401);
    c.set('userId', email);
    c.header('cache-control', 'no-store');
    await next();
  });

  app.get('/api/me', (c) => c.json({ email: c.get('userId') }));

  app.post('/api/save-attempt', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json<SaveAttemptBody>();
    const DB = c.env.DB;

    await DB.prepare('INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)').bind(userId, userId).run();

    const assessmentId = crypto.randomUUID();
    await DB.prepare(
      "INSERT INTO assessments (id, user_id, stage, dominance_pattern, radar_data, tendencies, created_at) VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))"
    ).bind(
      assessmentId,
      userId,
      body.stage || 'unknown',
      body.dominancePattern || '',
      JSON.stringify(body.radarData || []),
      JSON.stringify(body.tendencies || []),
    ).run();

    return c.json({ success: true, assessmentId });
  });

  app.get('/api/reports', async (c) => {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM assessments WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(c.get('userId')).all<AssessmentRow>();
    return c.json({ success: true, reports: results || [] });
  });

  app.delete('/api/assessments/:id', async (c) => {
    const userId = c.get('userId');
    const assessmentId = c.req.param('id');
    const DB = c.env.DB;

    const owned = await DB.prepare('SELECT id FROM assessments WHERE id = ? AND user_id = ?').bind(assessmentId, userId).first();
    if (owned === null) return c.json({ error: 'Not found' }, 404);

    await DB.prepare('DELETE FROM assessments WHERE id = ? AND user_id = ?').bind(assessmentId, userId).run();
    await c.env.REPORTS_BUCKET.delete(`${userId}/${assessmentId}.pdf`);
    return c.json({ success: true });
  });

  // DELETE /api/account: removes everything Jatimetri stores for the user (PDFs, history, user row,
  // sessions) and signs them out. The BCB account itself lives at belajarcarabelajar.com/account.
  app.delete('/api/account', async (c) => {
    const userId = c.get('userId');
    const DB = c.env.DB;

    const pdfsDeleted = await deleteR2Prefix(c.env.REPORTS_BUCKET, `${userId}/`);
    await DB.prepare('DELETE FROM assessments WHERE user_id = ?').bind(userId).run();
    await DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    await sessions(DB).removeAllFor(userId);

    c.header('set-cookie', CLEAR_SESSION_COOKIE);
    return c.json({ success: true, pdfsDeleted });
  });

  app.post('/api/upload-pdf', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.formData();
    const file = body.get('file');
    const assessmentId = body.get('assessmentId');

    if (!(file instanceof File) || typeof assessmentId !== 'string' || !RE_ASSESSMENT_ID.test(assessmentId)) {
      return c.json({ error: 'Missing file or assessmentId' }, 400);
    }
    const owned = await c.env.DB.prepare('SELECT id FROM assessments WHERE id = ? AND user_id = ?').bind(assessmentId, userId).first();
    if (owned === null) return c.json({ error: 'Not found' }, 404);

    await c.env.REPORTS_BUCKET.put(`${userId}/${assessmentId}.pdf`, await file.arrayBuffer(), {
      httpMetadata: { contentType: 'application/pdf' },
    });
    return c.json({ success: true });
  });

  return app;
}

