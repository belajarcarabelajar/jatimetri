import { describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestD1 } from './d1-sqlite';
import { CLERK_ERA, purgeClerkEra, type PurgeDeps } from '../../scripts/purge-clerk-era';

// One Clerk-era user (id without '@', even though its email column has one) and one BCB user (id is the email).
function seed() {
  const db = createTestD1();
  db.raw.exec(`
    INSERT INTO users (id, email) VALUES ('user_2abcClerk', 'old@example.com'), ('budi@example.com', 'budi@example.com');
    INSERT INTO assessments (id, user_id, stage) VALUES
      ('c1', 'user_2abcClerk', 'adult'), ('c2', 'user_2abcClerk', 'teenager'),
      ('b1', 'budi@example.com', 'adult');
  `);
  return db;
}

function backupOf(db: ReturnType<typeof seed>): string {
  const dir = mkdtempSync(join(tmpdir(), 'purge-clerk-'));
  const file = join(dir, 'backup.sql');
  writeFileSync(file, dumpSql(db));
  return file;
}

// A minimal stand-in for `wrangler d1 export` output: schema plus INSERTs.
function dumpSql(db: ReturnType<typeof seed>): string {
  const lines: string[] = [];
  const tables = db.raw.query("SELECT name, sql FROM sqlite_master WHERE type = 'table'").all() as { name: string; sql: string }[];
  for (const t of tables) lines.push(`${t.sql};`);
  for (const t of tables) {
    for (const row of db.raw.query(`SELECT * FROM ${t.name}`).all() as Record<string, unknown>[]) {
      const values = Object.values(row).map((v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`));
      lines.push(`INSERT INTO ${t.name} VALUES(${values.join(',')});`);
    }
  }
  return lines.join('\n');
}

function fakeDeps(onExport?: (file: string) => void) {
  const commands: string[][] = [];
  const out: string[] = [];
  const deps: PurgeDeps = {
    exec: async (cmd) => {
      commands.push(cmd);
      const i = cmd.indexOf('--output');
      if (cmd.includes('export') && i >= 0) onExport?.(cmd[i + 1]);
      return 0;
    },
    log: (line) => out.push(line),
  };
  return { deps, commands, out };
}

describe('purge-clerk-era SQL selection', () => {
  it('selects only rows whose id has no @ and leaves @ ids untouched', () => {
    const db = seed();
    const users = db.raw.query(`SELECT id FROM users WHERE ${CLERK_ERA.users}`).all() as { id: string }[];
    const assessments = db.raw.query(`SELECT id FROM assessments WHERE ${CLERK_ERA.assessments}`).all() as { id: string }[];
    expect(users.map((r) => r.id)).toEqual(['user_2abcClerk']);
    expect(assessments.map((r) => r.id).sort()).toEqual(['c1', 'c2']);

    for (const statement of CLERK_ERA.deletes) db.raw.exec(statement);
    expect(db.raw.query('SELECT id FROM users').all()).toEqual([{ id: 'budi@example.com' }]);
    expect(db.raw.query('SELECT id FROM assessments').all()).toEqual([{ id: 'b1' }]);
  });

  it('derives the R2 keys of Clerk-era PDFs as <user_id>/<assessment id>.pdf', () => {
    const db = seed();
    const keys = (db.raw.query(CLERK_ERA.r2Keys).all() as { key: string }[]).map((r) => r.key).sort();
    expect(keys).toEqual(['user_2abcClerk/c1.pdf', 'user_2abcClerk/c2.pdf']);
  });
});

describe('purge-clerk-era gates', () => {
  it('without flags is a dry run: prints counts and statements, runs no command', async () => {
    const file = backupOf(seed());
    const { deps, commands, out } = fakeDeps();
    const code = await purgeClerkEra(['--backup-file', file], deps);
    expect(code).toBe(0);
    expect(commands).toEqual([]);
    const text = out.join('\n');
    expect(text).toContain('users: 1');
    expect(text).toContain('assessments: 2');
    expect(text).toContain('r2 objects: 2');
    expect(text).toContain(CLERK_ERA.deletes[0]);
    expect(text).toContain('DRY RUN');
  });

  it('--apply without an existing backup file refuses and runs nothing', async () => {
    const { deps, commands } = fakeDeps();
    expect(await purgeClerkEra(['--apply'], deps)).not.toBe(0);
    expect(await purgeClerkEra(['--apply', '--backup-file', '/nonexistent/backup.sql'], deps)).not.toBe(0);
    const empty = join(mkdtempSync(join(tmpdir(), 'purge-clerk-')), 'empty.sql');
    writeFileSync(empty, '');
    expect(await purgeClerkEra(['--apply', '--backup-file', empty], deps)).not.toBe(0);
    expect(commands).toEqual([]);
  });

  it('--apply-backup only exports the remote database to the backup file', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'purge-clerk-')), 'backup.sql');
    const dump = dumpSql(seed());
    const { deps, commands } = fakeDeps((f) => writeFileSync(f, dump));
    expect(await purgeClerkEra(['--apply-backup', '--backup-file', file], deps)).toBe(0);
    expect(commands).toEqual([
      ['bunx', 'wrangler', 'd1', 'export', 'jatimetri-db', '--remote', '--output', file],
    ]);
    expect(existsSync(file)).toBe(true);
  });

  it('--apply-backup refuses to overwrite an existing backup file', async () => {
    const file = backupOf(seed());
    const { deps, commands } = fakeDeps();
    expect(await purgeClerkEra(['--apply-backup', '--backup-file', file], deps)).not.toBe(0);
    expect(commands).toEqual([]);
  });

  it('--apply deletes the R2 objects first, then the D1 rows, all with --remote', async () => {
    const file = backupOf(seed());
    const { deps, commands } = fakeDeps();
    expect(await purgeClerkEra(['--apply', '--backup-file', file], deps)).toBe(0);
    const r2 = commands.filter((c) => c.includes('r2'));
    expect(r2.map((c) => c[5]).sort()).toEqual(['jatimetri-reports/user_2abcClerk/c1.pdf', 'jatimetri-reports/user_2abcClerk/c2.pdf']);
    const last = commands.at(-1)!;
    expect(last.slice(0, 6)).toEqual(['bunx', 'wrangler', 'd1', 'execute', 'jatimetri-db', '--remote']);
    expect(last).toContain(CLERK_ERA.deletes.join(' '));
    for (const c of commands) expect(c).toContain('--remote');
    expect(commands.indexOf(last)).toBe(commands.length - 1);
    expect(commands.length).toBe(3);
  });

  it('--apply stops before the D1 delete when an R2 delete fails', async () => {
    const file = backupOf(seed());
    const commands: string[][] = [];
    const deps: PurgeDeps = { exec: async (cmd) => (commands.push(cmd), cmd.includes('r2') ? 1 : 0), log: () => {} };
    expect(await purgeClerkEra(['--apply', '--backup-file', file], deps)).not.toBe(0);
    expect(commands.some((c) => c.includes('d1'))).toBe(false);
  });

  it('--apply stops the R2 loop after the first failing key', async () => {
    const file = backupOf(seed());
    const commands: string[][] = [];
    const deps: PurgeDeps = { exec: async (cmd) => (commands.push(cmd), cmd.includes('r2') ? 1 : 0), log: () => {} };
    expect(await purgeClerkEra(['--apply', '--backup-file', file], deps)).not.toBe(0);
    expect(commands.filter((c) => c.includes('r2'))).toHaveLength(1);
  });

  it('rejects a --backup-file value that starts with "--" and runs nothing', async () => {
    const { deps, commands } = fakeDeps();
    expect(await purgeClerkEra(['--backup-file', '--apply'], deps)).not.toBe(0);
    expect(await purgeClerkEra(['--apply-backup', '--backup-file', '--apply'], deps)).not.toBe(0);
    expect(await purgeClerkEra(['--backup-file'], deps)).not.toBe(0);
    expect(commands).toEqual([]);
    expect(existsSync('--apply')).toBe(false);
  });
});
