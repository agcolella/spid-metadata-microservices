import express    from 'express';
import cors       from 'cors';
import authRoutes  from './routes/authRoutes.js';
import userRoutes  from './routes/userRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import { TokenService } from './services/TokenService.js';
import { AuditService } from './services/AuditService.js';
import { ROLES } from './services/UserService.js';

const PORT         = process.env.BACKOFFICE_SERVICE_PORT || 4006;
const tokenService = new TokenService();
const auditService = new AuditService();

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://spid-metadata-app.vercel.app'
];

const app = express();
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(\`CORS bloccato per origin: \${origin}\`));
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

app.get('/health', (_, res) =>
  res.json({ service: 'backoffice-service', status: 'ok', port: PORT })
);

app.get('/roles', (_, res) => {
  res.json(
    Object.entries(ROLES).map(([key, val]) => ({ key, ...val }))
  );
});

app.post('/authorize', (req, res) => {
  const { token, requiredRole } = req.body;
  if (!token) return res.status(400).json({ authorized: false, error: 'Token mancante' });

  try {
    const payload   = tokenService.verifyAccessToken(token);
    const userLevel = ROLES[payload.role]?.level    ?? 0;
    const minLevel  = ROLES[requiredRole]?.level ?? 0;

    if (requiredRole && userLevel < minLevel) {
      return res.status(403).json({
        authorized: false,
        error: \`Ruolo insufficiente. Richiesto: \${requiredRole}, hai: \${payload.role}\`
      });
    }

    res.json({ authorized: true, user: payload });
  } catch (e) {
    const msg = e.name === 'TokenExpiredError' ? 'Token scaduto' : 'Token non valido';
    res.status(401).json({ authorized: false, error: msg });
  }
});

app.use('/auth',  authRoutes);
app.use('/users', userRoutes);
app.use('/audit', auditRoutes);

app.use((err, _, res, __) => {
  console.error('Errore backoffice:', err.message);
  res.status(500).json({ error: 'Errore interno del server', message: err.message });
});

setInterval(() => {
  tokenService.cleanExpiredTokens();
  console.log('🧹 Token scaduti rimossi');
}, 6 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('🔐 backoffice-service → http://localhost:' + PORT);
  console.log('   Ruoli: admin | operator | reviewer | viewer');
  console.log('='.repeat(50));
});
