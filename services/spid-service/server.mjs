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

// ── Cache in-memory per le request SAML ──────────────────────
// Su Render free tier (singola istanza) va bene.
// In produzione multi-istanza usa Redis.
const samlCache = new Map();
const cache = {
  get:    (key)       => Promise.resolve(samlCache.get(key) ?? null),
  set:    (key, val)  => { samlCache.set(key, val); return Promise.resolve(); },
  delete: (key)       => { samlCache.delete(key);   return Promise.resolve(); },
  expire: (key, ms)   => {
    setTimeout(() => samlCache.delete(key), ms);
    return Promise.resolve();
  },
};

// ── SpidStrategy ──────────────────────────────────────────────
const spidStrategy = new SpidStrategy(
  {
    saml: {
      callbackUrl:                    process.env.SP_ACS_URL,
      logoutCallbackUrl:              `${process.env.SP_ENTITY_ID}/logout`,
      attributeConsumingServiceIndex: '0',
      signatureAlgorithm:             'sha256',
      digestAlgorithm:                'sha256',
      privateKey:                     SP_KEY,
      audience:                       process.env.SP_ENTITY_ID,
      authnRequestBinding:            'HTTP-Redirect',
      racComparison:                  'exact',
    },
    spid: {
      // Restituisce l'entityId dell'IdP dalla query string (?idp=...)
      // oppure usa il Demo come default
      getIDPEntityIdFromRequest: (req) =>
        req.query.idp || req.body?.RelayState
          ? (() => {
              try { return JSON.parse(req.body.RelayState).idp; } catch { return 'https://demo.spid.gov.it'; }
            })()
          : 'https://demo.spid.gov.it',
      IDPRegistryMetadata: IDP_METADATA,
      authnContext: 1, // SpidL1 = 1, SpidL2 = 2, SpidL3 = 3
      serviceProvider: {
        type:        'public',
        entityId:    process.env.SP_ENTITY_ID,
        certificate: SP_CERT,
        acs: [
          {
            name:       'acs0',
            attributes: ['spidCode', 'fiscalNumber', 'name', 'familyName', 'email'],
          },
        ],
        organization: {
          it: {
            name:        process.env.SP_ORG_NAME        || 'Nome Ente',
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
  // verify callback (login)
  (profile, done) => done(null, profile),
  // verify callback (logout)
  (profile, done) => done(null, profile),
);

passport.use('spid', spidStrategy);
passport.serializeUser((user, done)   => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ── Genera metadata SP all'avvio ─────────────────────────────
let SP_METADATA = '';
try {
  SP_METADATA = await spidStrategy.generateSpidServiceProviderMetadata();
} catch (e) {
  console.error('Errore generazione metadata SP:', e.message);
  process.exit(1);
}

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
app.get('/spid/metadata', (req, res) => {
  res.contentType('text/xml').send(SP_METADATA);
});

// ── Route: avvia login SPID ───────────────────────────────────
// GET /spid/login?idp=https://demo.spid.gov.it
app.get('/spid/login', (req, res, next) => {
  const idpEntityId = req.query.idp || 'https://demo.spid.gov.it';
  // Salva l'IdP in sessione per recuperarlo nell'ACS
  req.session.idpEntityId = idpEntityId;
  req.session.save(() => next());
}, passport.authenticate('spid', { session: false }));

// ── Route: Assertion Consumer Service ────────────────────────
// POST /spid/acs
app.post('/spid/acs',
  express.urlencoded({ extended: false }),
  passport.authenticate('spid', {
    session:         false,
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=spid`,
  }),
  (req, res) => {
    const profile = req.user;

    // Attributi SPID ricevuti dall'IdP
    const spidUser = {
      spidCode:     profile.spidCode     || profile.nameID || null,
      fiscalNumber: profile.fiscalNumber || null,
      name:         profile.name         || null,
      familyName:   profile.familyName   || null,
      email:        profile.email        || null,
      authLevel:    profile['urn:oasis:names:tc:SAML:2.0:ac:classes:SpidL1']
                    || profile.AuthnContextClassRef
                    || 'SpidL1',
      loginMethod:  'spid',
    };

    // JWT interno compatibile con il resto dell'app
    const token = jwt.sign(
      {
        sub:         spidUser.spidCode,
        fiscalCode:  spidUser.fiscalNumber,
        name:        spidUser.name,
        familyName:  spidUser.familyName,
        email:       spidUser.email,
        role:        'user',
        loginMethod: 'spid',
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Redirect al frontend con il token nell'hash (non finisce nei log)
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

// ── Route: logout SPID ────────────────────────────────────────
app.get('/spid/logout', (req, res) => {
  req.session.destroy();
  res.redirect(`${process.env.FRONTEND_URL}/login`);
});

// ── Healthcheck ───────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'spid-service' }));

app.listen(PORT, () => console.log(`spid-service in ascolto su porta ${PORT}`));
