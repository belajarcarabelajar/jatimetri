import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // normalised BCB account email (was the Clerk user id before 2026-11-06)
  email: text("email"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const assessments = sqliteTable("assessments", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  stage: text("stage").notNull(), // child, teenager, adult
  dominancePattern: text("dominance_pattern"),
  radarData: text("radar_data", { mode: "json" }),
  tendencies: text("tendencies", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

// BCB unified login (worker/drizzle/0001_bcb_sso.sql).
export const sessions = sqliteTable("sessions", {
  idHash: text("id_hash").primaryKey(), // SHA-256 hex of the cookie token
  email: text("email").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const ssoNonce = sqliteTable("sso_nonce", {
  nonce: text("nonce").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
});
