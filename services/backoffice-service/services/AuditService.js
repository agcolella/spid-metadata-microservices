import db from '../db.js';

export class AuditService {

  log({ userId, username, action, resource, details, ip, userAgent, status = 'success' }) {
    db.prepare(`
      INSERT INTO audit_log (user_id, username, action, resource, details, ip, user_agent, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId   || null,
      username || null,
      action,
      resource || null,
      details  ? JSON.stringify(details) : null,
      ip       || null,
      userAgent|| null,
      status
    );
  }

  list({ page = 1, limit = 50, userId, action, status, from, to } = {}) {
    let query  = `SELECT * FROM audit_log WHERE 1=1`;
    const params = [];

    if (userId) { query += ` AND user_id = ?`;  params.push(userId); }
    if (action) { query += ` AND action  = ?`;  params.push(action); }
    if (status) { query += ` AND status  = ?`;  params.push(status); }
    if (from)   { query += ` AND created_at >= ?`; params.push(from); }
    if (to)     { query += ` AND created_at <= ?`; params.push(to); }

    const total = db.prepare(`SELECT COUNT(*) as n FROM (${query})`).get(...params)?.n ?? 0;
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);

    const logs = db.prepare(query).all(...params).map(row => ({
      ...row,
      details: row.details ? JSON.parse(row.details) : null
    }));

    return { logs, total, page, limit, pages: Math.ceil(total / limit) };
  }

  stats() {
    const byAction = db.prepare(`
      SELECT action, COUNT(*) as count FROM audit_log
      GROUP BY action ORDER BY count DESC
    `).all();

    const byUser = db.prepare(`
      SELECT username, COUNT(*) as count FROM audit_log
      WHERE username IS NOT NULL
      GROUP BY username ORDER BY count DESC LIMIT 10
    `).all();

    const byStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM audit_log GROUP BY status
    `).all();

    const last24h = db.prepare(`
      SELECT COUNT(*) as count FROM audit_log
      WHERE created_at >= datetime('now', '-1 day')
    `).get();

    return { byAction, byUser, byStatus, last24h: last24h.count };
  }
}
