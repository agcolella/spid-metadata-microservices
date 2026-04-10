// services/backoffice-service/services/AuditService.js
import db from '../db.js';

export class AuditService {

  async log({ userId, username, action, resource, details, ip, userAgent, status = 'success' }) {
    await db.execute({
      sql: `INSERT INTO audit_log (user_id, username, action, resource, details, ip, user_agent, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        userId    || null,
        username  || null,
        action,
        resource  || null,
        details   ? JSON.stringify(details) : null,
        ip        || null,
        userAgent || null,
        status
      ]
    });
  }

  async list({ page = 1, limit = 50, userId, action, status, from, to } = {}) {
    let where = `WHERE 1=1`;
    const params = [];

    if (userId) { where += ` AND user_id = ?`;      params.push(userId); }
    if (action) { where += ` AND action  = ?`;      params.push(action); }
    if (status) { where += ` AND status  = ?`;      params.push(status); }
    if (from)   { where += ` AND created_at >= ?`;  params.push(from); }
    if (to)     { where += ` AND created_at <= ?`;  params.push(to); }

    const { rows: countRows } = await db.execute({
      sql: `SELECT COUNT(*) as n FROM audit_log ${where}`, args: params
    });
    const total = Number(countRows[0]?.n ?? 0);

    const { rows: logs } = await db.execute({
      sql:  `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [...params, limit, (page - 1) * limit]
    });

    return {
      logs: logs.map(row => ({ ...row, details: row.details ? JSON.parse(row.details) : null })),
      total, page, limit, pages: Math.ceil(total / limit)
    };
  }

  async stats() {
    const [{ rows: byAction }, { rows: byUser }, { rows: byStatus }, { rows: last24hRows }] =
      await Promise.all([
        db.execute(`SELECT action, COUNT(*) as count FROM audit_log GROUP BY action ORDER BY count DESC`),
        db.execute(`SELECT username, COUNT(*) as count FROM audit_log WHERE username IS NOT NULL GROUP BY username ORDER BY count DESC LIMIT 10`),
        db.execute(`SELECT status, COUNT(*) as count FROM audit_log GROUP BY status`),
        db.execute(`SELECT COUNT(*) as count FROM audit_log WHERE created_at >= datetime('now', '-1 day')`)
      ]);

    return { byAction, byUser, byStatus, last24h: Number(last24hRows[0]?.count ?? 0) };
  }
}
