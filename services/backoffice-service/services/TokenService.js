// services/backoffice-service/services/TokenService.js
import jwt    from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXP     = process.env.JWT_ACCESS_EXP  || '8h';
const REFRESH_EXP    = process.env.JWT_REFRESH_EXP || '7d';

if (!ACCESS_SECRET) {
  throw new Error('JWT_ACCESS_SECRET è obbligatorio');
}

if (!REFRESH_SECRET) {
  throw new Error('JWT_REFRESH_SECRET è obbligatorio');
}

export class TokenService {

  generateAccessToken(user) {
    return jwt.sign(
      { sub: user.id, username: user.username, email: user.email, role: user.role },
      ACCESS_SECRET,
      { expiresIn: ACCESS_EXP }
    );
  }

  async generateRefreshToken(userId) {
    const raw    = uuidv4();
    const hash   = bcrypt.hashSync(raw, 10);
    const expMs  = REFRESH_EXP.endsWith('d')
      ? parseInt(REFRESH_EXP, 10) * 86400000
      : 604800000;
    const expiresAt = new Date(Date.now() + expMs).toISOString();

    await db.execute({
      sql:  `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
      args: [uuidv4(), userId, hash, expiresAt]
    });

    return raw;
  }

  verifyAccessToken(token) {
    return jwt.verify(token, ACCESS_SECRET);
  }

  async verifyRefreshToken(userId, rawToken) {
    const { rows } = await db.execute({
      sql:  `SELECT * FROM refresh_tokens WHERE user_id = ? AND revoked = 0 AND expires_at > datetime('now')`,
      args: [userId]
    });

    for (const row of rows) {
      if (await bcrypt.compare(rawToken, row.token_hash)) return row;
    }
    return null;
  }

  async revokeRefreshToken(tokenId) {
    await db.execute({
      sql:  `UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`,
      args: [tokenId]
    });
  }

  async revokeAllUserTokens(userId) {
    await db.execute({
      sql:  `UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`,
      args: [userId]
    });
  }

  async cleanExpiredTokens() {
    await db.execute({ sql: `DELETE FROM refresh_tokens WHERE expires_at <= datetime('now')`, args: [] });
  }
}
