// Receiver side of the BCB Academy unified-login hand-off ("login terpadu", token v1).
//
// This is a dependency-free copy of the contract in the bcb monorepo
// (belajarcarabelajar/bcb: packages/data/src/akun/sso.ts, otp.ts normalEmail/samaWaktuKonstan,
// sesi.ts base64url/bacaCookie, kembali.ts jalurKembaliAman). Keep it byte-compatible: the shared
// fixture `sso-v1.fixture.json` (copied verbatim from bcb) is asserted in bcb-sso.test.ts.
//
// Token: `<b64u(email)>.<exp>.<nonce>.<b64u(HMAC-SHA256(secret, "bcb-sso|v1|" + aud + "|" + email + "|" + exp + "|" + nonce))>`
// Burning the nonce (single use) is the caller's job.

export const SSO_MIN_SECRET = 32;
export const SSO_TOKEN_TTL_SECONDS = 120;
export const SSO_CLOCK_SKEW_SECONDS = 30;
const MAX_TOKEN = 1024;
const RE_NONCE = /^[A-Za-z0-9_-]{22}$/;
const RE_AUD = /^[a-z0-9-]{1,32}$/;
const RE_B64U = /^[A-Za-z0-9_-]+$/;
const RE_EXP = /^[1-9][0-9]{0,15}$/;

// --- email (bcb otp.ts normalEmail) ---
const RE_LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const RE_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const RE_TLD = /^(?:[A-Za-z]{2,63}|[Xx][Nn]--[A-Za-z0-9-]{1,59})$/;
const RE_PRINTABLE_ASCII = /^[!-~]+$/;
const MAX_EMAIL = 254;

export function normalEmail(email: string): string | null {
  if (typeof email !== "string") return null;
  const e = email.trim();
  if (e.length === 0 || e.length > MAX_EMAIL || !RE_PRINTABLE_ASCII.test(e)) return null;
  const parts = e.split("@");
  if (parts.length !== 2) return null;
  const [local = "", domain = ""] = parts;
  if (local.length === 0 || local.length > 64 || !RE_LOCAL.test(local)) return null;
  const labels = domain.split(".");
  if (labels.length < 2) return null;
  for (const l of labels) if (l.length > 63 || !RE_LABEL.test(l)) return null;
  if (!RE_TLD.test(labels[labels.length - 1] ?? "")) return null;
  return e.toLowerCase();
}

export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  const n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// --- base64url (bcb sesi.ts) ---
export function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Canonical unpadded base64url only; null otherwise. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (typeof text !== "string" || (text.length > 0 && !RE_B64U.test(text)) || text.length % 4 === 1) return null;
  let bin: string;
  try {
    bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return toBase64Url(bytes) === text ? bytes : null;
}

// --- cookies (bcb sesi.ts bacaCookie) ---
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const RE_CONTROL = /[\u0000-\u001f\u007f]/;

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (typeof header !== "string" || header === "" || name === "") return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0 || RE_CONTROL.test(part)) continue;
    if (part.slice(0, i).trim() !== name) continue;
    let value = part.slice(i + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    return value;
  }
  return null;
}

// --- safe return path (bcb kembali.ts jalurKembaliAman) ---
const MAX_PATH = 512;
const MAX_DECODE_LAYERS = 5;
const TEST_ORIGIN = "https://tujuan-uji.invalid";

function layerSafe(s: string): boolean {
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\")) return false;
  if (s.includes("\\") || RE_CONTROL.test(s)) return false;
  try {
    return new URL(s, TEST_ORIGIN).origin === TEST_ORIGIN;
  } catch {
    return false;
  }
}

function safeAllLayers(path: string): boolean {
  if (path.length === 0 || path.length > MAX_PATH) return false;
  if (!RE_PRINTABLE_ASCII.test(path) || !layerSafe(path)) return false;
  let current = path;
  for (let layer = 0; layer < MAX_DECODE_LAYERS; layer++) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return layer !== 0;
    }
    if (next === current) return true;
    if (!layerSafe(next)) return false;
    current = next;
  }
  return false;
}

/** `next` when it is a safe same-site relative path, otherwise `fallback` (prevents open redirects). */
export function safeReturnPath(next: string | null, fallback = "/"): string {
  if (!safeAllLayers(fallback)) throw new RangeError("fallback is not a safe relative path");
  if (typeof next !== "string") return fallback;
  return safeAllLayers(next) ? next : fallback;
}

// --- token v1 (bcb sso.ts periksaTokenSso) ---
export type SsoFailure = "format" | "email" | "signature" | "expired" | "future";
export type SsoResult = { ok: true; email: string; exp: number; nonce: string } | { ok: false; reason: SsoFailure };

export function assertSsoSecret(secret: string | undefined): string {
  if (typeof secret !== "string" || secret.length < SSO_MIN_SECRET) {
    const e = new Error(`BCB SSO secret is missing or shorter than ${SSO_MIN_SECRET} characters`);
    e.name = "SsoSecretInvalid";
    throw e;
  }
  return secret;
}

async function sign(secret: string, aud: string, email: string, exp: number, nonce: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`bcb-sso|v1|${aud}|${email}|${exp}|${nonce}`))));
}

/** Builds a token exactly like the bcb apex issuer. Only used by tests and local tooling. */
export async function createSsoToken(o: { secret: string; aud: string; email: string; nowSeconds: number; nonce: string }): Promise<string> {
  assertSsoSecret(o.secret);
  const email = normalEmail(o.email);
  if (email === null) throw new TypeError("invalid email");
  if (!RE_AUD.test(o.aud) || !RE_NONCE.test(o.nonce)) throw new TypeError("invalid aud or nonce");
  const exp = Math.floor(o.nowSeconds) + SSO_TOKEN_TTL_SECONDS;
  return `${toBase64Url(new TextEncoder().encode(email))}.${exp}.${o.nonce}.${await sign(o.secret, o.aud, email, exp, o.nonce)}`;
}

/**
 * Verifies shape, canonical email, signature (constant time), audience and age (±30 s skew).
 * Never throws for bad tokens; throws only for a misconfigured secret/audience.
 */
export async function verifySsoToken(token: string, o: { secret: string; aud: string; nowSeconds: number }): Promise<SsoResult> {
  assertSsoSecret(o.secret);
  if (!RE_AUD.test(o.aud)) throw new TypeError("invalid aud");
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN) return { ok: false, reason: "format" };
  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, reason: "format" };
  const [segEmail = "", segExp = "", nonce = "", segSig = ""] = parts;
  if (!RE_B64U.test(segEmail) || !RE_EXP.test(segExp) || !RE_NONCE.test(nonce) || !RE_B64U.test(segSig)) return { ok: false, reason: "format" };
  const bytes = fromBase64Url(segEmail);
  if (bytes === null) return { ok: false, reason: "format" };
  let email: string;
  try {
    email = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: "format" };
  }
  if (normalEmail(email) !== email) return { ok: false, reason: "email" };
  const exp = Number(segExp);
  if (!Number.isSafeInteger(exp)) return { ok: false, reason: "format" };
  if (!constantTimeEqual(segSig, await sign(o.secret, o.aud, email, exp, nonce))) return { ok: false, reason: "signature" };
  const t = Math.floor(o.nowSeconds);
  if (t >= exp + SSO_CLOCK_SKEW_SECONDS) return { ok: false, reason: "expired" };
  if (exp > t + SSO_TOKEN_TTL_SECONDS + SSO_CLOCK_SKEW_SECONDS) return { ok: false, reason: "future" };
  return { ok: true, email, exp, nonce };
}
