// Jatimetri's own login session, minted after a successful BCB hand-off (same design as the BCB
// receivers, e.g. bcb apps/blender/src/akun/repo-sesi.ts): a random 32-byte token lives only in the
// `__Host-` cookie; D1 stores its SHA-256. Tokens and emails never go into errors or logs.
import type { D1Database } from '../app';
import { toBase64Url } from './bcb-sso';

/** `__Host-`: Secure, Path=/, no Domain, so only this host can read it. */
export const SESSION_COOKIE = '__Host-jatimetri_sesi';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const ATTRS = 'Path=/; HttpOnly; Secure; SameSite=Lax';
export const sessionCookie = (token: string): string => `${SESSION_COOKIE}=${token}; ${ATTRS}; Max-Age=${SESSION_TTL_SECONDS}`;
export const CLEAR_SESSION_COOKIE = `${SESSION_COOKIE}=; ${ATTRS}; Max-Age=0`;

const RE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export interface SessionStore {
  /** New 30-day session for a normalised email; returns the raw token for the cookie. */
  create(email: string): Promise<string>;
  /** Email of a live session, or null. */
  find(token: string | null): Promise<string | null>;
  remove(token: string | null): Promise<void>;
  removeAllFor(email: string): Promise<void>;
}

export function createSessionStore(db: D1Database, o: { now: () => Date; random: (n: number) => Uint8Array }): SessionStore {
  const nowSeconds = () => Math.floor(o.now().getTime() / 1000);
  return {
    async create(email) {
      const bytes = o.random(32);
      if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw new Error('random must return exactly 32 bytes');
      const token = toBase64Url(bytes);
      const t = nowSeconds();
      // Opportunistic cleanup keeps the table small without a cron.
      await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(t).run();
      await db
        .prepare('INSERT INTO sessions (id_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(await hashToken(token), email, t, t + SESSION_TTL_SECONDS)
        .run();
      return token;
    },

    async find(token) {
      if (token === null || !RE_TOKEN.test(token)) return null;
      const row = await db
        .prepare('SELECT email FROM sessions WHERE id_hash = ? AND expires_at > ?')
        .bind(await hashToken(token), nowSeconds())
        .first<{ email: string }>();
      return row?.email ?? null;
    },

    async remove(token) {
      if (token === null || !RE_TOKEN.test(token)) return;
      await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await hashToken(token)).run();
    },

    async removeAllFor(email) {
      await db.prepare('DELETE FROM sessions WHERE email = ?').bind(email).run();
    },
  };
}
