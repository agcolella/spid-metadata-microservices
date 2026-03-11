import jwt    from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'change-me-access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret';
const ACCESS_EXP     = process.env.JWT_ACCESS_EXP     || '15m';
const REFRESH_EXP    = process.env.JWT_REFRESH_EXP    || '7d';

export class TokenService {

  generateAccessToken(user) {
    return jwt.sign(
      { sub: user.id, username: user.username, email: user.email, role: user.role },
      ACCESS_SECRET,
      { expiresIn: ACCESS_EXP }
    );
  }

  generateRefreshToken(userId) {
    const raw   = uuidv4();
    const hash  = bcrypt.hashSync(raw, 10);
    const expMs = REFRESH_EXP.endsWith('d')
      ? parseInt(REFRESH_EXP) * 86400000
      : 604800000;
    const expiresAt = new Date(Date.now() + expMs).toISOString();

    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), userId, hash, expiresAt);

    return raw;
  }

  verifyAccessToken(token) {
    return jwt.verify(token, ACCESS_SECRET);
  }

  verifyRefreshToken(userId, rawToken) {
    const rows = db.prepare(`
      SELECT * FROM refresh_tokens
      WHERE user_id = ? AND revoked = 0 AND expires_at > datetime('now')
    `).all(userId);

    for (const row of rows) {
      if (bcrypt.compareSync(rawToken, row.token_hash)) {
        return row;
      }
    }
    return null;
  }

  revokeRefreshToken(tokenId) {
    db.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`).run(tokenId);
  }

  revokeAllUserTokens(userId) {
    db.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`).run(userId);
  }

  cleanExpiredTokens() {
    db.prepare(`DELETE FROM refresh_tokens WHERE expires_at <= datetime('now')`).run();
  }
}
