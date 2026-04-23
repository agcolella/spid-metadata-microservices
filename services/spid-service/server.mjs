import express           from 'express';
import cors              from 'cors';
import session           from 'express-session';
import passport          from 'passport';
import { SpidStrategy }  from 'passport-spid';
import jwt               from 'jsonwebtoken';
import fs                from 'fs';
import path              from 'path';
import { fileURLToPath } from 'url';
import dotenv            from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();
const PORT      = process.env.PORT || 4008;

// ── Certificati SP ────────────────────────────────────────────
const SP_KEY  = fs.readFileSync(path.resolve(process.env.SP_KEY_PATH), 'utf8');
const SP_CERT = fs.readFileSync(path.resolve(__dirname, process.env.SP_CERT_PATH), 'utf8');

// ── Metadata IdP Demo ─────────────────────────────────────────
const IDP_METADATA = fs.readFileSync(
  path.resolve(__dirname, './idp-metadata/demo-idp-metadata.xml'),
  'utf8'
);

// ── Cache in-memory ───────────────────────────────────────────
const _cache = new Map();
const cache = {
  get:    (key)           => Promise.resolve(_cache.get(key) ?? null),
  set:    (key, val, ttl) => {
    _cache.set(key, val);
    if (ttl) setTimeout(() => _cache.delete(key), ttl);
    return Promise.resolve();
  },
  delete: (key)           => { _cache.delete(key); return Promise.resolve(); },
};

// ── SpidStrategy ──────────────────────────────────────────────
// Struttura con config.spid.serviceProvider (da strategy.js:28)
const spidStrategy = new SpidStrategy(
  {
    saml: {
      callbackUrl:                    process.env.SP_ACS_URL,
      logoutCallbackUrl:              `${process.env.SP_ENTITY_ID}/logout`,
      signatureAlgorithm:             'sha256',
      digestAlgorithm:                'sha256',
      privateKey:                     SP_KEY,
      attributeConsumingServiceIndex: '0',
      authnRequestBinding:            'HTTP-Redirect',
      forceAuthn:                     true,
      racComparison:                  'exact',
    },
    spid: {
      getIDPEntityIdFromRequest: (req) => {
        // login: dalla query string
        if (req.query?.idp) return req.query.idp;
        // acs: dal RelayState
        try { return JSON.parse(req.body?.RelayState || '{}').idp || 'https://demo.spid.gov.it'; }
        catch { return 'https://demo.spid.gov.it'; }
      },
      IDPRegistryMetadata: IDP_METADATA,
      serviceProvider: {
        type:        'public',
        entityId:    process.env.SP_ENTITY_ID,
        certificate: SP_CERT,
        privateKey:  SP_KEY,
        acs: [
          {
            name:       'acs0',
            attributes: ['spidCode', 'fiscalNumber', 'name', 'familyName', 'email'],
          },
        ],
        organization: {
          it: {
            name:        process.env.SP_ORG_NAME         || 'Nome Ente',
            displayName: process.env.SP_ORG_DISPLAY_NAME || 'Nome Ente Visualizzato',
            url:         process.env.SP_ORG_URL          || process.env.SP_ENTITY_ID,
          },
        },
        contactPerson: {
          IPACode: process.env.SP_IPA_CODE      || 'DEMO',
          email:   process.env.SP_CONTACT_EMAIL || 'admin@example.it',
          ...(process.env.SP_VAT_NUMBER ? { VATNumber: process.env.SP_VAT_NUMBER } : {}),
        },
      },
    },
    cache,
  },
  // verify login
  (profile, done) => done(null, profile),
  // verify logout
  (profile, done) => done(null, profile),
);

passport.use('spid', spidStrategy);
passport.serializeUser((user, done)   => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret:            process.env.SESSION_SECRET || 'spid-secret',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: process.env.NODE_ENV === 'production', httpOnly: true },
}));
app.use(passport.initialize());
app.use(passport.session());

// ── Route: metadata SP ────────────────────────────────────────
app.get('/spid/metadata', async (req, res) => {
  try {
    const xml = await spidStrategy.generateSpidServiceProviderMetadata();
    res.contentType('text/xml').send(xml);
  } catch (err) {
    console.error('Errore metadata:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Route: avvia login SPID ───────────────────────────────────
// 3. Nel passport.authenticate, passa i parametri SPID obbligatori:
app.get('/spid/login', (req, res, next) => {
  const idpEntityId = req.query.idp || 'https://demo.spid.gov.it';
  req.session.idpEntityId = idpEntityId;
  req.session.save(() => {
    passport.authenticate('spid', {
      session: false,
      additionalParams: {
        RelayState: JSON.stringify({ idp: idpEntityId, returnTo: process.env.FRONTEND_URL }),
      },
      // ✅ Questi sovrascrivono il SAML generato:
      forceAuthn:      true,
      authnContext:    'https://www.spid.gov.it/SpidL1',  // stringa, NON array
      racComparison:  'exact',
    })(req, res, next);
  });
});

// ── Route: ACS ────────────────────────────────────────────────
app.post('/spid/acs',
  express.urlencoded({ extended: false }),
  passport.authenticate('spid', {
    session:         false,
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=spid`,
  }),
  (req, res) => {
    const profile = req.user;

    const token = jwt.sign(
      {
        sub:         profile.spidCode     || profile.nameID || null,
        fiscalCode:  profile.fiscalNumber || null,
        name:        profile.name         || null,
        familyName:  profile.familyName   || null,
        email:       profile.email        || null,
        role:        'user',
        loginMethod: 'spid',
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    const returnTo = (() => {
      try {
        return JSON.parse(req.body?.RelayState || '{}').returnTo
          || process.env.FRONTEND_URL;
      } catch {
        return process.env.FRONTEND_URL;
      }
    })();

    res.redirect(`${returnTo}/auth/callback#token=${token}`);
  }
);

// ── Route: logout ─────────────────────────────────────────────
app.get('/spid/logout', (req, res) => {
  req.session.destroy();
  res.redirect(`${process.env.FRONTEND_URL}/login`);
});

// ── Healthcheck ───────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'spid-service' }));

app.listen(PORT, () => console.log(`spid-service in ascolto su porta ${PORT}`));
