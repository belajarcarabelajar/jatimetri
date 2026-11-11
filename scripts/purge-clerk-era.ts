#!/usr/bin/env bun
// Purges the Clerk-era rows (ids without '@', see worker/drizzle/0001_bcb_sso.sql) from the production
// D1 database inner_potential_db and their PDFs from the R2 bucket jatimetri-reports.
//
//   bun scripts/purge-clerk-era.ts --backup-file <path>                 dry run: counts and statements, no command run
//   bun scripts/purge-clerk-era.ts --apply-backup --backup-file <path>  export the remote D1 to <path> (new file only)
//   bun scripts/purge-clerk-era.ts --apply --backup-file <path>         delete R2 objects, then D1 rows (remote)
//
// Counts and R2 keys are read from the backup file, so the dry run never touches the network.
// R2 keys are derived from the assessment rows (wrangler has no R2 list command): a PDF whose
// assessment row is already gone is not found by this script.
import { Database } from 'bun:sqlite';
import { existsSync, readFileSync, statSync } from 'node:fs';

export const D1_NAME = 'inner_potential_db';
export const R2_BUCKET = 'jatimetri-reports';

const USERS_WHERE = "id NOT LIKE '%@%'";
const ASSESSMENTS_WHERE = "user_id NOT LIKE '%@%'";

export const CLERK_ERA = {
  users: USERS_WHERE,
  assessments: ASSESSMENTS_WHERE,
  // Same key layout the worker writes in /api/upload-pdf, before and after the Clerk removal.
  r2Keys: `SELECT user_id || '/' || id || '.pdf' AS key FROM assessments WHERE ${ASSESSMENTS_WHERE}`,
  // assessments first: assessments.user_id references users.id
  deletes: [`DELETE FROM assessments WHERE ${ASSESSMENTS_WHERE};`, `DELETE FROM users WHERE ${USERS_WHERE};`],
};

export interface PurgeDeps {
  exec(cmd: string[]): Promise<number>;
  log(line: string): void;
}

const wrangler = (...args: string[]) => ['bunx', 'wrangler', ...args];

function readBackup(file: string) {
  const db = new Database(':memory:');
  db.exec(readFileSync(file, 'utf8'));
  const count = (table: string, where: string) =>
    (db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number }).n;
  const result = {
    users: count('users', USERS_WHERE),
    assessments: count('assessments', ASSESSMENTS_WHERE),
    keys: (db.query(CLERK_ERA.r2Keys).all() as { key: string }[]).map((r) => r.key),
  };
  db.close();
  return result;
}

const isUsableFile = (file: string | undefined): file is string =>
  !!file && existsSync(file) && statSync(file).isFile() && statSync(file).size > 0;

export async function purgeClerkEra(argv: string[], deps: PurgeDeps): Promise<number> {
  const apply = argv.includes('--apply');
  const applyBackup = argv.includes('--apply-backup');
  const i = argv.indexOf('--backup-file');
  const backupFile = i >= 0 ? argv[i + 1] : undefined;

  if (applyBackup) {
    if (!backupFile) {
      deps.log('--apply-backup needs --backup-file <path>.');
      return 2;
    }
    if (existsSync(backupFile)) {
      deps.log(`Refusing to overwrite the existing backup ${backupFile}.`);
      return 2;
    }
    const code = await deps.exec(wrangler('d1', 'export', D1_NAME, '--remote', '--output', backupFile));
    if (code !== 0 || !isUsableFile(backupFile)) {
      deps.log(`Backup failed (exit ${code}); nothing deleted.`);
      return 1;
    }
    deps.log(`Backup written to ${backupFile}. Check it, then run again with --apply --backup-file ${backupFile}.`);
    return 0;
  }

  if (apply && !isUsableFile(backupFile)) {
    deps.log('--apply needs --backup-file pointing to an existing, non-empty backup (make one with --apply-backup).');
    return 2;
  }

  deps.log(apply ? 'APPLY: deleting from production.' : 'DRY RUN: no command is run.');
  let keys: string[] = [];
  if (isUsableFile(backupFile)) {
    const found = readBackup(backupFile);
    keys = found.keys;
    deps.log(`Clerk-era rows in ${backupFile}: users: ${found.users}, assessments: ${found.assessments}, r2 objects: ${keys.length}`);
  } else {
    deps.log('No backup file given or found: counts unknown (make one with --apply-backup --backup-file <path>).');
  }
  for (const key of keys) deps.log(`R2 delete: ${R2_BUCKET}/${key}`);
  for (const statement of CLERK_ERA.deletes) deps.log(`D1: ${statement}`);
  if (!apply) return 0;

  // R2 first: the D1 rows are the only record of which keys to delete.
  for (const key of keys) {
    const code = await deps.exec(wrangler('r2', 'object', 'delete', `${R2_BUCKET}/${key}`, '--remote'));
    if (code !== 0) {
      deps.log(`R2 delete of ${key} failed (exit ${code}); D1 rows left in place, rerun after fixing.`);
      return 1;
    }
  }
  const code = await deps.exec(
    wrangler('d1', 'execute', D1_NAME, '--remote', '--yes', '--command', CLERK_ERA.deletes.join(' ')),
  );
  if (code !== 0) {
    deps.log(`D1 delete failed (exit ${code}).`);
    return 1;
  }
  deps.log('Done.');
  return 0;
}

if (import.meta.main) {
  const deps: PurgeDeps = {
    exec: async (cmd) => Bun.spawn(cmd, { stdio: ['inherit', 'inherit', 'inherit'] }).exited,
    log: (line) => console.log(line),
  };
  process.exit(await purgeClerkEra(process.argv.slice(2), deps));
}
