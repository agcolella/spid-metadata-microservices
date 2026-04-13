import express          from 'express';
import cors             from 'cors';
import multer           from 'multer';
import http             from 'http';
import { createClient } from '@libsql/client';

const PORT = process.env.FILE_SERVICE_PORT || 4001;

// ─── DB Init ──────────────────────────────────────────────────────────────────
let db;

async function initDB() {
    if (!process.env.TURSO_URL || !process.env.TURSO_AUTH_TOKEN)
    throw new Error('TURSO_URL e TURSO_AUTH_TOKEN sono obbligatori');

  db = createClient({
    url:       process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  await db.execute(`
    CREATE TABLE IF NOT EXISTS xml_files (
      id                   INTEGER  PRIMARY KEY AUTOINCREMENT,
      filename             TEXT     NOT NULL,
      content              TEXT     NOT NULL,
      size                 INTEGER,
      entity_id            TEXT,
      organization_name    TEXT,
      uploaded_by          INTEGER  NOT NULL,
      uploaded_by_username TEXT     NOT NULL,
      created_at           DATETIME DEFAULT (datetime('now')),
      updated_at           DATETIME DEFAULT (datetime('now')),
      UNIQUE(filename, uploaded_by)
    )
  `);
  console.log('[file-service] DB pronto');
}

// ─── App ──────────────────────────────────────────────────────────────────────
const app    = express();
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.xml'))
      return cb(new Error('Solo file .xml'));
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json());

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseXmlMeta(content) {
  const entityIDMatch   = content.match(/entityID="([^"]+)"/);
  const orgNameMatch    = content.match(/<(?:[^:]+:)?OrganizationName[^>]*>([^<]+)<\/(?:[^:]+:)?OrganizationName>/);
  const orgDisplayMatch = content.match(/<(?:[^:]+:)?OrganizationDisplayName[^>]*>([^<]+)<\/(?:[^:]+:)?OrganizationDisplayName>/);
  return {
    entityID:         entityIDMatch    ? entityIDMatch[1]    : null,
    organizationName: orgNameMatch     ? orgNameMatch[1]
                    : orgDisplayMatch  ? orgDisplayMatch[1]  : null,
  };
}

// ─── Middleware Auth ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  // Caso 1: header iniettati dal Gateway (tutte le route tranne upload)
  const userId   = req.headers['x-user-id'];
  const username = req.headers['x-username'];
  const role     = req.headers['x-user-role'];

  if (userId) {
    req.user = { id: userId, username, role };
    return next();
  }

  // Caso 2: upload diretto con JWT (bypassa authMiddleware del Gateway)
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Non autorizzato' });

  try {
    const payload = JSON.parse(
      Buffer.from(auth.split('.')[1], 'base64').toString()
    );
    if (payload.exp && Date.now() / 1000 > payload.exp)
      return res.status(401).json({ error: 'Token scaduto' });

    req.user = {
      id:       payload.sub ?? payload.id,   // sub è lo standard JWT
      username: payload.username,
      role:     payload.role,
    };

    if (!req.user.id)
      return res.status(401).json({ error: 'Token non contiene user id' });

    next();
  } catch {
    res.status(401).json({ error: 'Token non valido' });
  }
}
// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_, res) =>
  res.json({ service: 'file-service', status: 'ok', port: PORT })
);

// Lista file dell'utente autenticato
app.get('/files', requireAuth, async (req, res) => {
  try {
    const { search } = req.query;
    let sql  = `SELECT id, filename, size,
                       entity_id        AS entityID,
                       organization_name AS organizationName,
                       created_at       AS creationDate,
                       updated_at       AS modificationDate
                FROM xml_files
                WHERE uploaded_by = ?`;
    const args = [req.user.id];

    if (search) {
      sql += ` AND (filename LIKE ? OR entity_id LIKE ? OR organization_name LIKE ?)`;
      const q = `%${search}%`;
      args.push(q, q, q);
    }
    sql += ' ORDER BY created_at DESC';

    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload singolo file XML
app.post('/upload', requireAuth, upload.single('xmlFile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });

    const content  = req.file.buffer.toString('utf-8');
    const filename = req.file.originalname;
    const meta     = parseXmlMeta(content);

    await db.execute({
      sql: `INSERT INTO xml_files
              (filename, content, size, entity_id, organization_name, uploaded_by, uploaded_by_username)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(filename, uploaded_by) DO UPDATE SET
              content           = excluded.content,
              size              = excluded.size,
              entity_id         = excluded.entity_id,
              organization_name = excluded.organization_name,
              updated_at        = datetime('now')`,
      args: [
        filename, content, req.file.size,
        meta.entityID, meta.organizationName,
        req.user.id, req.user.username,
      ],
    });

    // Recupera i timestamp reali dal DB
    const row = await db.execute({
      sql:  'SELECT created_at AS creationDate, updated_at AS modificationDate FROM xml_files WHERE filename = ? AND uploaded_by = ?',
      args: [filename, req.user.id],
    });

    res.json({
      success:  true,
      filename,
      content,
      size: req.file.size,
      ...meta,
      ...row.rows[0],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Contenuto XML per il viewer (risposta identica alla versione filesystem)
app.get('/files/:filename/content', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql:  'SELECT content FROM xml_files WHERE filename = ? AND uploaded_by = ?',
      args: [req.params.filename, req.user.id],
    });
    if (!result.rows.length)
      return res.status(404).json({ error: 'File non trovato' });
    res.json({ content: result.rows[0].content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Validazione — proxy verso validation-service (invariato)
app.get('/files/:filename/validate', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql:  'SELECT content FROM xml_files WHERE filename = ? AND uploaded_by = ?',
      args: [req.params.filename, req.user.id],
    });
    if (!result.rows.length)
      return res.status(404).json({ error: 'File non trovato' });

    const content = result.rows[0].content;
    const VALIDATION_SVC = process.env.VALIDATION_SERVICE_URL || 'http://localhost:4002';
    const body    = JSON.stringify({ content, filename: req.params.filename });
    const url     = new URL(VALIDATION_SVC);
    const options = {
      hostname: url.hostname,
      port:     url.port || 80,
      path:     '/validate',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try   { res.status(proxyRes.statusCode).json(JSON.parse(data)); }
        catch { res.status(500).json({ error: 'Risposta non valida dal validation-service' }); }
      });
    });
    proxyReq.on('error', e => res.status(502).json({ error: e.message }));
    proxyReq.write(body);
    proxyReq.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Batch contenuti XML
app.post('/get-xml-contents', requireAuth, async (req, res) => {
  const { filenames } = req.body;
  if (!Array.isArray(filenames))
    return res.status(400).json({ error: 'filenames deve essere un array' });

  try {
    const placeholders = filenames.map(() => '?').join(',');
    const result = await db.execute({
      sql:  `SELECT filename, content FROM xml_files
             WHERE filename IN (${placeholders}) AND uploaded_by = ?`,
      args: [...filenames, req.user.id],
    });
    // Mantieni l'ordine richiesto e segnala i file non trovati
    const map = Object.fromEntries(result.rows.map(r => [r.filename, r.content]));
    const results = filenames.map(filename => ({
      filename,
      content: map[filename] ?? null,
      success: !!map[filename],
      ...(map[filename] ? {} : { error: 'File non trovato' }),
    }));
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Eliminazione batch
app.post('/delete-xml-files', requireAuth, async (req, res) => {
  const { filenames } = req.body;
  if (!Array.isArray(filenames))
    return res.status(400).json({ error: 'filenames deve essere un array' });

  try {
    const placeholders = filenames.map(() => '?').join(',');
    const del = await db.execute({
      sql:  `DELETE FROM xml_files
             WHERE filename IN (${placeholders}) AND uploaded_by = ?`,
      args: [...filenames, req.user.id],
    });
    res.json({
      success: true,
      deleted: del.rowsAffected ?? filenames.length,
      results: filenames.map(f => ({ filename: f, success: true })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, _, res, __) => {
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ error: 'File troppo grande (max 5MB)' });
  res.status(500).json({ error: err.message });
});

// ─── Avvio ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () =>
    console.log(`📁 file-service → http://localhost:${PORT}`)
  );
}).catch(err => {
  console.error('[file-service] Errore avvio DB:', err);
  process.exit(1);
});
