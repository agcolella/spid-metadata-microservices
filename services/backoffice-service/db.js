// services/backoffice-service/db.js
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

const isLocal = !process.env.TURSO_DATABASE_URL;

const db = createClient(
  isLocal
    ? { url: `file:${process.env.DB_PATH || './backoffice.db'}` }
    : { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
);

// ── Schema ────────────────────────────────────────────────
await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'viewer',
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    must_change_password INTEGER NOT NULL DEFAULT 0,
    last_login    TEXT
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    revoked    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT,
    username   TEXT,
    action     TEXT NOT NULL,
    resource   TEXT,
    details    TEXT,
    ip         TEXT,
    user_agent TEXT,
    status     TEXT NOT NULL DEFAULT 'success',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log(action);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_tokens_user   ON refresh_tokens(user_id);
`);

// ── Migration: aggiunge must_change_password se il DB esiste già ─────────────
try {
  await db.execute(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`);
  console.log('🔄 Migration: colonna must_change_password aggiunta');
} catch (e) {
  // colonna già presente — ignorato
}

// ── Migration: colonne SPID (aggiungere DOPO la migration must_change_password) ──
for (const sql of [
  `ALTER TABLE users ADD COLUMN fiscal_number    TEXT UNIQUE DEFAULT NULL`,
  `ALTER TABLE users ADD COLUMN spid_name        TEXT DEFAULT NULL`,
  `ALTER TABLE users ADD COLUMN spid_family_name TEXT DEFAULT NULL`,
]) {
  try {
    await db.execute(sql);
    console.log(`🔄 Migration: colonna aggiunta → ${sql.match(/ADD COLUMN (\w+)/)[1]}`);
  } catch {
    // colonna già presente — ignorato
  }
}
try {
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_fiscal ON users(fiscal_number)`);
} catch { /* già esiste */ }

// ── Seed admin ────────────────────────────────────────────
const { rows } = await db.execute(`SELECT id FROM users WHERE username = 'admin'`);
if (!rows.length) {
  const { v4: uuidv4 } = await import('uuid');
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@1234!', 12);
  await db.execute({
    sql: `INSERT INTO users (id, username, email, password_hash, role, must_change_password)
          VALUES (?, 'admin', 'admin@spid-metadata.local', ?, 'admin', 1)`,
    args: [uuidv4(), hash]
  });
  console.log('👤 Utente admin creato (cambia la password al primo accesso!)');
}

if (isLocal) console.log('🗄️  DB locale (libsql file)');
else         console.log('☁️  DB Turso cloud');

export default db;
