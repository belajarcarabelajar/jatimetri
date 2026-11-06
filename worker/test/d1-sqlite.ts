// Minimal D1 adapter over bun:sqlite for tests: same prepare/bind/run/all/first surface the worker uses.
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Database, D1PreparedStatement } from '../src/app';

export function createTestD1(): D1Database & { raw: Database } {
  const raw = new Database(':memory:');
  for (const f of ['0000_round_scorpion.sql', '0001_bcb_sso.sql']) {
    const sql = readFileSync(join(import.meta.dir, '..', 'drizzle', f), 'utf8').replaceAll('--> statement-breakpoint', '');
    raw.exec(sql);
  }
  const prepare = (query: string, params: unknown[] = []): D1PreparedStatement => ({
    bind: (...values: unknown[]) => prepare(query, values),
    async run() {
      const r = raw.prepare(query).run(...(params as never[]));
      return { results: [], success: true, meta: { changes: r.changes } };
    },
    async all<T>() {
      return { results: raw.prepare(query).all(...(params as never[])) as T[], success: true };
    },
    async first<T>() {
      return (raw.prepare(query).get(...(params as never[])) as T | undefined) ?? null;
    },
  });
  return { prepare: (q: string) => prepare(q), raw };
}

export function createTestR2() {
  const objects = new Map<string, ArrayBuffer>();
  return {
    objects,
    async put(key: string, value: ArrayBuffer) { objects.set(key, value); },
    async list(o: { prefix?: string } = {}) {
      return { objects: [...objects.keys()].filter((k) => k.startsWith(o.prefix ?? '')).map((key) => ({ key })), truncated: false };
    },
    async delete(keys: string | string[]) { for (const k of [keys].flat()) objects.delete(k); },
  };
}
