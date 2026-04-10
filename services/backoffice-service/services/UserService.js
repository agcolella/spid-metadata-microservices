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
  // must_change_password passa automaticamente nel safe spread
  return safe;
}

export class UserService {

  async findById(id) {
    const { rows } = await db.execute({ sql: `SELECT * FROM users WHERE id = ?`, args: [id] });
    return safeUser(rows[0] ?? null);
  }

  async findByUsername(username) {
    const { rows } = await db.execute({ sql: `SELECT * FROM users WHERE username = ?`, args: [username] });
    return rows[0] ?? null;
  }

  async findByEmail(email) {
    const { rows } = await db.execute({ sql: `SELECT * FROM users WHERE email = ?`, args: [email] });
    return rows[0] ?? null;
  }

  async list({ page = 1, limit = 20, role, active, search } = {}) {
    let where = `WHERE 1=1`;
    const params = [];

    if (role)                { where += ` AND role = ?`;                            params.push(role); }
    if (active !== undefined){ where += ` AND active = ?`;                          params.push(active ? 1 : 0); }
    if (search)              { where += ` AND (username LIKE ? OR email LIKE ?)`;   params.push(`%${search}%`, `%${search}%`); }

    const { rows: countRows } = await db.execute({ sql: `SELECT COUNT(*) as n FROM users ${where}`, args: params });
    const total = Number(countRows[0]?.n ?? 0);

    const { rows: users } = await db.execute({
      sql:  `SELECT id, username, email, role, active, must_change_password,
                    created_at, updated_at, last_login
             FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [...params, limit, (page - 1) * limit]
    });

    return { users, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async create({ username, email, password, role = 'viewer' }) {
    if (!ROLE_NAMES.includes(role))       throw new Error(`Ruolo non valido: ${role}`);
    if (!username || !email || !password) throw new Error('username, email e password sono obbligatori');
    if (password.length < 8)             throw new Error('La password deve essere di almeno 8 caratteri');

    const { rows } = await db.execute({
      sql:  `SELECT id FROM users WHERE username = ? OR email = ?`,
      args: [username, email]
    });
    if (rows.length) throw new Error('Username o email già in uso');

    const id   = uuidv4();
    const hash = bcrypt.hashSync(password, 12);

    // must_change_password = 1: il nuovo utente deve cambiare password al primo accesso
    await db.execute({
      sql:  `INSERT INTO users (id, username, email, password_hash, role, must_change_password)
             VALUES (?, ?, ?, ?, ?, 1)`,
      args: [id, username, email, hash, role]
    });

    return this.findById(id);
  }

  async update(id, { email, role, active }) {
    const { rows } = await db.execute({ sql: `SELECT * FROM users WHERE id = ?`, args: [id] });
    if (!rows.length) throw new Error('Utente non trovato');
    if (role && !ROLE_NAMES.includes(role)) throw new Error(`Ruolo non valido: ${role}`);

    await db.execute({
      sql: `UPDATE users SET
              email      = COALESCE(?, email),
              role       = COALESCE(?, role),
              active     = COALESCE(?, active),
              updated_at = datetime('now')
            WHERE id = ?`,
      args: [email ?? null, role ?? null, active !== undefined ? (active ? 1 : 0) : null, id]
    });

    return this.findById(id);
  }

  async changePassword(id, { oldPassword, newPassword }) {
    const { rows } = await db.execute({ sql: `SELECT * FROM users WHERE id = ?`, args: [id] });
    const user = rows[0];
    if (!user) throw new Error('Utente non trovato');
    if (!bcrypt.compareSync(oldPassword, user.password_hash))
      throw new Error('Password attuale non corretta');
    if (newPassword.length < 8)
      throw new Error('La nuova password deve essere di almeno 8 caratteri');

    const hash = bcrypt.hashSync(newPassword, 12);
    await db.execute({
      sql:  `UPDATE users SET password_hash = ?, updated_at = datetime('now'),
             must_change_password = 0 WHERE id = ?`,
      args: [hash, id]
    });
    return { success: true };
  }

  async resetPassword(id, newPassword) {
    if (newPassword.length < 8) throw new Error('Password troppo corta (min 8 caratteri)');
    const hash = bcrypt.hashSync(newPassword, 12);
    await db.execute({
      sql:  `UPDATE users SET password_hash = ?, updated_at = datetime('now'),
             must_change_password = 1 WHERE id = ?`,
      args: [hash, id]
    });
    return { success: true };
  }

  async delete(id) {
    const { rows } = await db.execute({ sql: `SELECT id FROM users WHERE id = ?`, args: [id] });
    if (!rows.length) throw new Error('Utente non trovato');
    await db.execute({ sql: `DELETE FROM users WHERE id = ?`, args: [id] });
    return { deleted: true };
  }

  async updateLastLogin(id) {
    await db.execute({
      sql:  `UPDATE users SET last_login = datetime('now') WHERE id = ?`,
      args: [id]
    });
  }

  async verifyCredentials(username, password) {
    const user = await this.findByUsername(username);
    if (!user || !user.active) return null;
    if (!bcrypt.compareSync(password, user.password_hash)) return null;
    return safeUser(user);
  }
}