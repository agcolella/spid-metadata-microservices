import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

export const ROLES = {
  admin:    { label: 'Amministratore', level: 100 },
  operator: { label: 'Operatore',      level: 50  },
  reviewer: { label: 'Revisore',       level: 30  },
  viewer:   { label: 'Visualizzatore', level: 10  }
};

export const ROLE_NAMES = Object.keys(ROLES);

function safeUser(row) {
  if (!row) return null;
  const { password_hash, ...safe } = row;
  return safe;
}

export class UserService {

  findById(id) {
    return safeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(id));
  }

  findByUsername(username) {
    return db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  }

  findByEmail(email) {
    return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  }

  list({ page = 1, limit = 20, role, active, search } = {}) {
    let query  = `SELECT id, username, email, role, active, created_at, updated_at, last_login FROM users WHERE 1=1`;
    const params = [];

    if (role)   { query += ` AND role = ?`; params.push(role); }
    if (active !== undefined) { query += ` AND active = ?`; params.push(active ? 1 : 0); }
    if (search) { query += ` AND (username LIKE ? OR email LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }

    const total = db.prepare(`SELECT COUNT(*) as n FROM (${query})`).get(...params)?.n ?? 0;
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);

    const users = db.prepare(query).all(...params);
    return { users, total, page, limit, pages: Math.ceil(total / limit) };
  }

  create({ username, email, password, role = 'viewer' }) {
    if (!ROLE_NAMES.includes(role)) throw new Error(`Ruolo non valido: ${role}`);
    if (!username || !email || !password) throw new Error('username, email e password sono obbligatori');
    if (password.length < 8) throw new Error('La password deve essere di almeno 8 caratteri');

    const existing = db.prepare(`SELECT id FROM users WHERE username = ? OR email = ?`).get(username, email);
    if (existing) throw new Error('Username o email già in uso');

    const id   = uuidv4();
    const hash = bcrypt.hashSync(password, 12);

    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, username, email, hash, role);

    return this.findById(id);
  }

  update(id, { email, role, active }) {
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!user) throw new Error('Utente non trovato');
    if (role && !ROLE_NAMES.includes(role)) throw new Error(`Ruolo non valido: ${role}`);

    db.prepare(`
      UPDATE users SET
        email      = COALESCE(?, email),
        role       = COALESCE(?, role),
        active     = COALESCE(?, active),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(email ?? null, role ?? null, active !== undefined ? (active ? 1 : 0) : null, id);

    return this.findById(id);
  }

  changePassword(id, { oldPassword, newPassword }) {
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!user) throw new Error('Utente non trovato');
    if (!bcrypt.compareSync(oldPassword, user.password_hash))
      throw new Error('Password attuale non corretta');
    if (newPassword.length < 8)
      throw new Error('La nuova password deve essere di almeno 8 caratteri');

    const hash = bcrypt.hashSync(newPassword, 12);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(hash, id);

    return { success: true };
  }

  resetPassword(id, newPassword) {
    if (newPassword.length < 8) throw new Error('Password troppo corta (min 8 caratteri)');
    const hash = bcrypt.hashSync(newPassword, 12);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(hash, id);
    return { success: true };
  }

  delete(id) {
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!user) throw new Error('Utente non trovato');
    db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    return { deleted: true };
  }

  updateLastLogin(id) {
    db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(id);
  }

  verifyCredentials(username, password) {
    const user = this.findByUsername(username);
    if (!user || !user.active) return null;
    if (!bcrypt.compareSync(password, user.password_hash)) return null;
    return safeUser(user);
  }
}
