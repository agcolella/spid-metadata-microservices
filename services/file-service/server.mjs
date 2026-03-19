import express from 'express';
import cors    from 'cors';
import multer  from 'multer';
import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PORT       = process.env.FILE_SERVICE_PORT || 4001;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const XML_DIR    = path.join(__dirname, 'saved-xml');

[UPLOAD_DIR, XML_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename:    (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.xml')
      return cb(new Error('Solo file .xml'));
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

function moveToXmlDir(tempPath, originalName) {
  let destPath = path.join(XML_DIR, originalName);
  if (fs.existsSync(destPath)) {
    const ext  = path.extname(originalName);
    const base = path.basename(originalName, ext);
    destPath   = path.join(XML_DIR, `${base}-${Date.now()}${ext}`);
  }
  fs.renameSync(tempPath, destPath);
  return path.basename(destPath);
}

function readXml(filename) {
  const p = path.join(XML_DIR, filename);
  if (!fs.existsSync(p)) throw new Error(`File non trovato: ${filename}`);
  return fs.readFileSync(p, 'utf-8');
}

// Estrae entityID e organizationName dall'XML senza parser esterno
function parseXmlMeta(content) {
  const entityIDMatch     = content.match(/entityID="([^"]+)"/);
  const orgNameMatch      = content.match(/<(?:[^:]+:)?OrganizationName[^>]*>([^<]+)<\/(?:[^:]+:)?OrganizationName>/);
  const orgDisplayMatch   = content.match(/<(?:[^:]+:)?OrganizationDisplayName[^>]*>([^<]+)<\/(?:[^:]+:)?OrganizationDisplayName>/);
  return {
    entityID:         entityIDMatch   ? entityIDMatch[1]   : null,
    organizationName: (orgNameMatch   ? orgNameMatch[1]    :
                       orgDisplayMatch ? orgDisplayMatch[1] : null),
  };
}



app.get('/health', (_, res) =>
  res.json({ service: 'file-service', status: 'ok', port: PORT })
);

app.get('/files', (req, res) => {
  try {
    const { search } = req.query;
    let files = fs.readdirSync(XML_DIR).filter(f => f.endsWith('.xml'));

    if (search) {
      const q = search.toLowerCase();
      files = files.filter(f => f.toLowerCase().includes(q));
    }

const result = files.map(filename => {
  const stats = fs.statSync(path.join(XML_DIR, filename));
  let meta = { entityID: null, organizationName: null };
  try {
    const content = fs.readFileSync(path.join(XML_DIR, filename), 'utf-8');
    meta = parseXmlMeta(content);
  } catch {}
  return {
    filename,
    size:             stats.size,
    creationDate:     stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime,
    modificationDate: stats.mtime,
    ...meta
  };
});


    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/upload', upload.single('xmlFile'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });

    const content      = fs.readFileSync(req.file.path, 'utf-8');
    const savedName    = moveToXmlDir(req.file.path, req.file.originalname);
    const stats        = fs.statSync(path.join(XML_DIR, savedName));

    res.json({
      success:          true,
      filename:         savedName,
      content,
      creationDate:     stats.birthtime,
      modificationDate: stats.mtime
    });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: e.message });
  }
});

app.post('/get-xml-contents', (req, res) => {
  const { filenames } = req.body;
  if (!Array.isArray(filenames)) return res.status(400).json({ error: 'filenames deve essere un array' });

  const results = filenames.map(filename => {
    try   { return { filename, content: readXml(filename), success: true }; }
    catch (e) { return { filename, error: e.message, success: false }; }
  });

  res.json(results);
});

app.post('/delete-xml-files', (req, res) => {
  const { filenames } = req.body;
  if (!Array.isArray(filenames)) return res.status(400).json({ error: 'filenames deve essere un array' });

  const results = filenames.map(filename => {
    const p = path.join(XML_DIR, filename);
    try {
      if (!fs.existsSync(p)) return { filename, success: false, error: 'File non trovato' };
      fs.unlinkSync(p);
      return { filename, success: true };
    } catch (e) {
      return { filename, success: false, error: e.message };
    }
  });

  res.json({ success: true, deleted: results.filter(r => r.success).length, results });
});

app.use((err, _, res, __) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File troppo grande (max 5MB)' });
  res.status(500).json({ error: err.message });
});

// Contenuto singolo file per XML viewer
app.get('/files/:filename/content', (req, res) => {
  try {
    const filePath = path.join(XML_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File non trovato' });
    res.json({ content: fs.readFileSync(filePath, 'utf-8') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Validazione singolo file (chiama validation-service)

app.get('/files/:filename/validate', (req, res) => {
  try {
    const filePath = path.join(XML_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File non trovato' });
    const content = fs.readFileSync(filePath, 'utf-8');
    const VALIDATION_SVC = process.env.VALIDATION_SERVICE_URL || 'http://localhost:4002';
    const body = JSON.stringify({ content, filename: req.params.filename });
    const url  = new URL(VALIDATION_SVC);
    const options = {
      hostname: url.hostname,
      port:     url.port || 80,
      path:     '/validate',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try { res.status(proxyRes.statusCode).json(JSON.parse(data)); }
        catch { res.status(500).json({ error: 'Risposta non valida dal validation-service' }); }
      });
    });
    proxyReq.on('error', e => res.status(502).json({ error: e.message }));
    proxyReq.write(body);
    proxyReq.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});



app.listen(PORT, () => console.log(`📁 file-service → http://localhost:${PORT}`));
