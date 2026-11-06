-- BCB unified login (replaces Clerk, 2026-11-06).
-- Idempotent on purpose: apply with
--   bunx wrangler d1 execute inner_potential_db --remote --file worker/drizzle/0001_bcb_sso.sql
-- From now on users.id and assessments.user_id hold the normalised BCB email instead of a Clerk user id.
-- Rows written under Clerk ids stay in place but are no longer reachable by anyone.

CREATE TABLE IF NOT EXISTS `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `sessions_email_idx` ON `sessions` (`email`);
CREATE INDEX IF NOT EXISTS `sessions_expires_idx` ON `sessions` (`expires_at`);

-- Single-use nonces of hand-off tokens, kept until token exp + clock skew.
CREATE TABLE IF NOT EXISTS `sso_nonce` (
	`nonce` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `assessments_user_idx` ON `assessments` (`user_id`, `created_at`);
