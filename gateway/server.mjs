import express      from 'express';
import cors         from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';

const PORT       = process.env.GATEWAY_PORT           || 8080;
const FILE_SVC   = process.env.FILE_SERVICE_URL       || 'http://localhost:4001';
const VALID_SVC  = process.env.VALIDATION_SERVICE_URL || 'http://localhost:4002';
const GITHUB_SVC = process.env.GITHUB_SERVICE_URL     || 'http://localhost:4003';
const PR_SVC     = process.env.PR_SERVICE_URL         || 'http://localhost:4004';
const BATCH_SVC  = process.env.BATCH_SERVICE_URL      || 'http://localhost:4005';
const BACKOFFICE_SVC = process.env.BACKOFFICE_SERVICE_URL || 'http://localhost:4006';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://spid-metadata-app.vercel.app'
];

const app = express();
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloccato per origin: ${origin}`));
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const proxy = (target, pathRewrite) =>
  createProxyMiddleware({ target, changeOrigin: true, pathRewrite });

// Mappa path → ruolo minimo richiesto
const ROUTE_ROLES = {
  '/api/files':    'viewer',
  '/api/validate': 'viewer',
  '/api/github':   'admin',
  '/api/pr':       'operator',
  '/api/batch':    'operator',
};

// Middleware auth centralizzato
async function authMiddleware(req, res, next) {
  if (
    req.path.startsWith('/api/auth') ||
    req.path.startsWith('/api/users') ||
    req.path.startsWith('/api/audit') ||
    req.path === '/health'
  ) return next();

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'Autenticazione richiesta' });

  const matchedRoute = Object.keys(ROUTE_ROLES).find(r => req.path.startsWith(r));
  const requiredRole = matchedRoute ? ROUTE_ROLES[matchedRoute] : 'viewer';

  try {
    const axios = (await import('axios')).default;
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

app.use(authMiddleware);

// Proxy verso microservizi
app.use('/api/files',    proxy(FILE_SVC,   { '^/api/files':   '' }));
app.use('/api/validate', proxy(VALID_SVC,  { '^/api/validate': '' }));
app.use('/api/github',   proxy(GITHUB_SVC, { '^/api/github':  '' }));
app.use('/api/pr',       proxy(PR_SVC,     { '^/api/pr':      '' }));
app.use('/api/batch',    proxy(BATCH_SVC,  { '^/api/batch':   '' }));

// Proxy verso backoffice
app.use('/api/auth',  proxy(BACKOFFICE_SVC, { '^/api/auth':  '' }));
app.use('/api/users', proxy(BACKOFFICE_SVC, { '^/api/users': '' }));
app.use('/api/audit', proxy(BACKOFFICE_SVC, { '^/api/audit': '' }));

// Health aggregato
app.get('/health', async (req, res) => {
  const services = {
    'file-service':       `${FILE_SVC}/health`,
    'validation-service': `${VALID_SVC}/health`,
    'github-service':     `${GITHUB_SVC}/health`,
    'pr-service':         `${PR_SVC}/health`,
    'batch-service':      `${BATCH_SVC}/health`,
    'backoffice-service': `${BACKOFFICE_SVC}/health`
  };

  const axios = (await import('axios')).default;
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
  console.log('');
  console.log('='.repeat(50));
  console.log('🌐 SPID Metadata App — API Gateway');
  console.log('='.repeat(50));
  console.log(`📡 Gateway → http://localhost:${PORT}`);
  console.log(`   /api/files   → ${FILE_SVC}`);
  console.log(`   /api/validate→ ${VALID_SVC}`);
  console.log(`   /api/github  → ${GITHUB_SVC}`);
  console.log(`   /api/pr      → ${PR_SVC}`);
  console.log(`   /api/batch   → ${BATCH_SVC}`);
  console.log(`   /api/auth    → ${BACKOFFICE_SVC}`);
  console.log('='.repeat(50));
});
