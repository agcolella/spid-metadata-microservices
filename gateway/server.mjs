import axios from 'axios';
import express      from 'express';
import cors         from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import http from 'http';
import multer from 'multer';

const PORT       = process.env.GATEWAY_PORT           || 8080;
const FILE_SVC   = process.env.FILE_SERVICE_URL       || 'http://localhost:4001';
const VALID_SVC  = process.env.VALIDATION_SERVICE_URL || 'http://localhost:4002';
const GITHUB_SVC = process.env.GITHUB_SERVICE_URL     || 'http://localhost:4003';
const PR_SVC     = process.env.PR_SERVICE_URL         || 'http://localhost:4004';
const BATCH_SVC  = process.env.BATCH_SERVICE_URL      || 'http://localhost:4005';
const BACKOFFICE_SVC = process.env.BACKOFFICE_SERVICE_URL || 'http://localhost:4006';
const CERT_SVC = process.env.CERTIFICATE_SERVICE_URL || 'http://localhost:4007';
const SPID_SVC = process.env.SPID_SERVICE_URL || 'http://localhost:4008';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://spid-metadata-microservices.vercel.app'
];

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloccato per origin: ${origin}`));
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

const app = express();

// ✅ CORS e preflight OPTIONS — PRIMA DI TUTTO
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));  // ← stesso corsOptions, non cors() vuoto

// Upload file — pipe diretto
// gateway/server.mjs — sostituisci il blocco /api/files/upload
const gatewayUpload = multer({ storage: multer.memoryStorage() });

app.post(
  '/api/files/upload',
  authMiddleware,
  gatewayUpload.single('xmlFile'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nessun file ricevuto' });

      const FormData = (await import('form-data')).default;

      const form = new FormData();
      form.append('xmlFile', req.file.buffer, {
        filename:    req.file.originalname,
        contentType: req.file.mimetype || 'application/xml',
      });

      const response = await axios.post(`${FILE_SVC}/upload`, form, {
        headers: {
          ...form.getHeaders(),
          'x-user-id':   req.headers['x-user-id'],
          'x-username':  req.headers['x-username'],
          'x-user-role': req.headers['x-user-role'],
        },
        maxBodyLength: Infinity,
        timeout: 30000,
        validateStatus: () => true,
      });

      res.status(response.status).json(response.data);
    } catch (e) {
      res.status(502).json({ error: 'Upload service non raggiungibile', detail: e.message });
    }
  }
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));app.use(express.json());

// Mappa path → ruolo minimo richiesto
const ROUTE_ROLES = {
  '/api/files':       'viewer',
  '/api/validate':    'viewer',
  '/api/certificates':'viewer',
  '/api/github':      'operator',
  '/api/pr':          'operator',
  '/api/batch':       'operator',
};

// Middleware auth centralizzato
async function authMiddleware(req, res, next) {
  const url = req.originalUrl || req.url;

  if (
    url.startsWith('/api/auth') ||
    url.startsWith('/api/users') ||
    url.startsWith('/api/audit') ||
    url === '/health'
  ) return next();

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'Autenticazione richiesta' });

  const matchedRoute = Object.keys(ROUTE_ROLES).find(r => url.startsWith(r));
  const requiredRole = matchedRoute ? ROUTE_ROLES[matchedRoute] : 'viewer';

  try {
    const { data } = await axios.post(
      `${BACKOFFICE_SVC}/authorize`,
      { token, requiredRole },
      { timeout: 3000 }
    );

    if (!data.authorized) {
      return res.status(403).json({ error: data.error || 'Accesso negato' });
    }

    req.headers['x-user-id']   = data.user.sub;
    req.headers['x-user-role'] = data.user.role;
    req.headers['x-username']  = data.user.username;

    next();
  } catch (e) {
    const status = e.response?.status || 500;
    return res.status(status).json({ error: e.response?.data?.error || 'Errore autorizzazione' });
  }
}
// ── SPID routes — PUBBLICHE, prima di authMiddleware ─────────
// Il flusso SAML richiede redirect e POST non autenticati
app.use('/spid', async (req, res) => {
  const subPath = req.originalUrl || '/';
  const targetUrl = SPID_SVC + subPath;

  try {
    const response = await axios({
      method:          req.method,
      url:             targetUrl,
      data:            req.body,
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
      },
      maxRedirects:    0,           // non seguire redirect — li passiamo al browser
      validateStatus:  () => true,  // accetta tutti gli status
    });

    // Copia gli header (incluso Location per i redirect SAML)
    Object.entries(response.headers).forEach(([k, v]) => {
      if (!['transfer-encoding', 'connection'].includes(k)) res.setHeader(k, v);
    });

    res.status(response.status);

    if (typeof response.data === 'string') {
      res.send(response.data);
    } else {
      res.json(response.data);
    }
  } catch (e) {
    res.status(502).json({ error: 'SPID service non raggiungibile', detail: e.message });
  }
});

app.use(authMiddleware);

async function makeProxy(targetBase, stripPrefix, targetPrefix = '') {
  return async function(req, res) {
    const subPath = req.originalUrl.slice(stripPrefix.length) || '/';
    const targetUrl = targetBase + targetPrefix + subPath;

    try {
      const response = await axios({
        method: req.method,
        url: targetUrl,
        data: req.body,
        headers: {
          'content-type': req.headers['content-type'] || 'application/json',
          ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
          ...(req.headers['x-user-id']   ? { 'x-user-id':   req.headers['x-user-id']   } : {}),
          ...(req.headers['x-user-role'] ? { 'x-user-role': req.headers['x-user-role'] } : {}),
          ...(req.headers['x-username']  ? { 'x-username':  req.headers['x-username']  } : {}),
        },
        timeout: 120000,
        validateStatus: () => true
      });
      res.status(response.status).json(response.data);
    } catch (e) {
      res.status(502).json({ error: 'Servizio non raggiungibile', detail: e.message });
    }
  };
}

const filesProxy    = await makeProxy(FILE_SVC,       '/api/files');
const validateProxy = await makeProxy(VALID_SVC,      '/api/validate');
const githubProxy   = await makeProxy(GITHUB_SVC,     '/api/github');
const prProxy       = await makeProxy(PR_SVC,         '/api/pr');
const batchProxy    = await makeProxy(BATCH_SVC,      '/api/batch');
const authProxy     = await makeProxy(BACKOFFICE_SVC, '/api/auth',  '/auth');
const usersProxy    = await makeProxy(BACKOFFICE_SVC, '/api/users', '/users');
const auditProxy    = await makeProxy(BACKOFFICE_SVC, '/api/audit', '/audit');
const certProxy     = await makeProxy(CERT_SVC,       '/api/certificates');

app.use('/api/files',        filesProxy);
app.use('/api/validate',     validateProxy);
app.use('/api/github',       githubProxy);
app.use('/api/pr',           prProxy);
app.use('/api/batch',        batchProxy);
app.use('/api/auth',         authProxy);
app.use('/api/users',        usersProxy);
app.use('/api/audit',        auditProxy);
app.use('/api/certificates', certProxy);

app.get('/health', async (req, res) => {
  const services = {
    'file-service':        `${FILE_SVC}/health`,
    'validation-service':  `${VALID_SVC}/health`,
    'certificate-service': `${CERT_SVC}/health`,
    'github-service':      `${GITHUB_SVC}/health`,
    'pr-service':          `${PR_SVC}/health`,
    'batch-service':       `${BATCH_SVC}/health`,
    'backoffice-service':  `${BACKOFFICE_SVC}/health`
  };

  const statuses = await Promise.allSettled(
    Object.entries(services).map(async ([name, url]) => {
      const { data } = await axios.get(url, { timeout: 2000 });
      return { name, status: data.status, port: data.port };
    })
  );

  const results = statuses.map((r, i) => ({
    name:   Object.keys(services)[i],
    status: r.status === 'fulfilled' ? r.value.status : 'unreachable',
    port:   r.status === 'fulfilled' ? r.value.port   : null
  }));

  const allOk = results.every(s => s.status === 'ok');
  res.status(allOk ? 200 : 207).json({ gateway: 'ok', services: results });
});

app.use((_, res) => res.status(404).json({ error: 'Endpoint non trovato' }));

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🌐 SPID Metadata App — API Gateway');
  console.log('='.repeat(50));
  console.log(`📡 Gateway → http://localhost:${PORT}`);
  console.log(`   /api/files        → ${FILE_SVC}`);
  console.log(`   /api/validate     → ${VALID_SVC}`);
  console.log(`   /api/github       → ${GITHUB_SVC}`);
  console.log(`   /api/pr           → ${PR_SVC}`);
  console.log(`   /api/batch        → ${BATCH_SVC}`);
  console.log(`   /api/auth         → ${BACKOFFICE_SVC}`);
  console.log(`   /api/certificates → ${CERT_SVC}`);
  console.log('='.repeat(50));
});
