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

// ── EntityID di default: Validator (non Demo generico)
// Per passare a un altro IdP in futuro basta cambiare la variabile d'ambiente
const DEFAULT_IDP_ENTITY_ID =
  process.env.SPID_IDP_ENTITY_ID || 'https://demo.spid.gov.it/validator';

// ── Certificati SP ────────────────────────────────────────────
const SP_KEY  = fs.readFileSync(path.resolve(__dirname, process.env.SP_KEY_PATH),  'utf8');
const SP_CERT = fs.readFileSync(path.resolve(__dirname, process.env.SP_CERT_PATH), 'utf8');

// ── Metadata IdP (validator) ──────────────────────────────────
// File aggiornato con: curl -sL https://demo.spid.gov.it/validator/metadata.xml
//   -o idp-metadata/demo-idp-metadata.xml
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
//
// Struttura richiesta dalla libreria (da strategy.js + const.js):
//
//   config.spid.authnContext  → numero intero: 1 | 2 | 3
//     1 → SpidL1 (senza ForceAuthn)
//     2 → SpidL2 (con ForceAuthn=true)  ← usa livello 2 con il Validator
//     3 → SpidL3 (con ForceAuthn=true)
//
//   config.spid.serviceProvider.type → 'public' | 'private'
//     'public'  → genera <spid:Public/>  nel metadata  (PA: obbligatorio)
//     'private' → genera <spid:Private/> nel metadata
//
//   FORZATO dalla lib (non sovrascrivere):
//     digestAlgorithm   = sha512
//     allowCreate       = false
//     wantAssertionsSigned = true
//
const spidStrategy = new SpidStrategy(
  {
    saml: {
      callbackUrl:                    process.env.SP_ACS_URL,
      logoutCallbackUrl:              `${process.env.SP_ENTITY_ID}/spid/logout`,
      signatureAlgorithm:             'sha256',
      privateKey:                     SP_KEY,
      attributeConsumingServiceIndex: '0',
      authnRequestBinding:            'HTTP-Redirect',
      validateInResponseTo:           'never',   // ← aggiunta
    },
    spid: {
      // ⚠️  NUMERO INTERO — obbligatorio per il Validator strict
      // livello 2 → ForceAuthn=true aggiunto automaticamente dalla lib
      authnContext: 2,

      getIDPEntityIdFromRequest: (req) => {
        // GET /spid/login?idp=...
        if (req.query?.idp) return req.query.idp;
        // POST /spid/acs → RelayState JSON
        try {
          return JSON.parse(req.body?.RelayState || '{}').idp
            || DEFAULT_IDP_ENTITY_ID;
        } catch {
          return DEFAULT_IDP_ENTITY_ID;
        }
      },

      IDPRegistryMetadata: IDP_METADATA,

      serviceProvider: {
        // 'public' → <spid:Public/> nel metadata (check 82 del validatore)
        type:        'public',
        entityId:    process.env.SP_ENTITY_ID,
        certificate: SP_CERT,
        privateKey:  SP_KEY,

        acs: [
          {
            name:       'Servizio Demo SPID',
            attributes: [
              'spidCode',
              'fiscalNumber',
              'name',
              'familyName',
              'email',
            ],
          },
        ],

        organization: {
          it: {
            name:        process.env.SP_ORG_NAME         || 'Demo SP',
            displayName: process.env.SP_ORG_DISPLAY_NAME || 'Servizio Demo SPID',
            url:         process.env.SP_ORG_URL          || process.env.SP_ENTITY_ID,
          },
        },

        contactPerson: {
          IPACode: process.env.SP_IPA_CODE      || 'c_h501',
          email:   process.env.SP_CONTACT_EMAIL || 'admin@example.it',
          // ⚠️  VATNumber: commentato — se vuoto causa fallimento check 72-73
          // Decommentare solo se si ha una P.IVA valida con prefisso ISO3166
          // VATNumber: process.env.SP_VAT_NUMBER,
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
app.use(cors({
  origin:      process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret:            process.env.SESSION_SECRET || 'spid-secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
}));
app.use(passport.initialize());
app.use(passport.session());

// ── Route: metadata SP ────────────────────────────────────────
app.get('/spid/metadata', async (req, res) => {
  try {
    const xml = await spidStrategy.generateSpidServiceProviderMetadata();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  } catch (err) {
    console.error('[metadata] Errore:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Route: avvia login SPID ───────────────────────────────────
app.get('/spid/login', (req, res, next) => {
  const idpEntityId = req.query.idp || DEFAULT_IDP_ENTITY_ID;

  req.session.idpEntityId = idpEntityId;
  req.session.save(() => {
    passport.authenticate('spid', {
      session: false,
      additionalParams: {
        RelayState: JSON.stringify({
          idp:      idpEntityId,
          returnTo: process.env.FRONTEND_URL,
        }),
      },
    })(req, res, next);
  });
});

// ── Route: ACS ────────────────────────────────────────────────
app.post(
  '/spid/acs',
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

    let returnTo = process.env.FRONTEND_URL;
    try {
      returnTo = JSON.parse(req.body?.RelayState || '{}').returnTo
        || process.env.FRONTEND_URL;
    } catch { /* usa default */ }

    res.redirect(`${returnTo}/auth/callback#token=${token}`);
  }
);

// ── Route: logout ─────────────────────────────────────────────
app.get('/spid/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect(`${process.env.FRONTEND_URL}/login`);
  });
});

// ── Healthcheck ───────────────────────────────────────────────
app.get('/health', (_, res) =>
  res.json({
    status:             'ok',
    service:            'spid-service',
    port:               PORT,
    defaultIdpEntityId: DEFAULT_IDP_ENTITY_ID,
  })
);

app.listen(PORT, () =>
  console.log(`[spid-service] in ascolto sulla porta ${PORT} | IdP: ${DEFAULT_IDP_ENTITY_ID}`)
);
