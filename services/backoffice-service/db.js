// services/backoffice-service/db.js
import { DatabaseSync } from 'node:sqlite';  // ← built-in Node 22+
import bcrypt   from 'bcryptjs';
import path     from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = process.env.DB_PATH || path.join(__dirname, 'backoffice.db');

const db = new DatabaseSync(DB_PATH);

// Abilita WAL e foreign keys
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'viewer',
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
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

// ── Seed admin ────────────────────────────────────────────
const adminExists = db.prepare(`SELECT id FROM users WHERE username = 'admin'`).get();
if (!adminExists) {
  const { v4: uuidv4 } = await import('uuid');
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@1234!', 12);
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role)
    VALUES (?, 'admin', 'admin@spid-metadata.local', ?, 'admin')
  `).run(uuidv4(), hash);
  console.log('👤 Utente admin creato (cambia la password al primo accesso!)');
}

export default db;
