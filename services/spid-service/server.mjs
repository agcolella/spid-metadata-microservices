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
const SP_KEY  = fs.readFileSync(path.resolve(__dirname, process.env.SP_KEY_PATH),  'utf8');
const SP_CERT = fs.readFileSync(path.resolve(__dirname, process.env.SP_CERT_PATH), 'utf8');

// ── Metadata IdP ──────────────────────────────────────────────
const xmlValidator = fs.readFileSync(
  path.resolve(__dirname, './idp-metadata/demo-idp-metadata.xml'), 'utf8'
);

// ← AGGIUNGI QUESTO
const xmlDemoValidator = fs.readFileSync(
  path.resolve(__dirname, './idp-metadata/validator-idp-metadata.xml'), 'utf8'
);

const xmlRegistry = fs.readFileSync(
  path.resolve(__dirname, './idp-metadata/all-idp-metadata.xml'), 'utf8'
);

// Nel IDP_METADATA combinato:
const IDP_METADATA = `<?xml version="1.0"?>
<md:EntitiesDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">
${extractEntities(xmlValidator)}
${extractEntities(xmlDemoValidator)}   ← AGGIUNGI
${extractEntities(xmlRegistry)}
${extractEntities(xmlAgidValidator)}
</md:EntitiesDescriptor>`;



//const IDP_METADATA = fs.readFileSync(
//  path.resolve(__dirname, './idp-metadata/demo-idp-metadata.xml'),
//  'utf8'
//);

// ── Cache in-memory ───────────────────────────────────────────
const _cache = new Map();
const cache = {
  get:    (key)      => Promise.resolve(_cache.get(key) ?? null),
  set:    (key, val, ttl) => {
    _cache.set(key, val);
    if (ttl) setTimeout(() => _cache.delete(key), ttl);
    return Promise.resolve();
  },
  delete: (key)      => { _cache.delete(key); return Promise.resolve(); },
};

// ── SpidStrategy ──────────────────────────────────────────────
//
// CHIAVI CRITICHE (da const.js della libreria):
//   config.spid.authnContext  → numero intero: 1 | 2 | 3
//   ForceAuthn è automatico   → true SOLO per livelli 2 e 3
//   config.spid.serviceProvider.type → 'public' | 'private'
//     'public'  → genera <spid:Public/>  nel metadata
//     'private' → genera <spid:Private/> nel metadata
//
// FORZATO DALLA LIBRERIA (SPID_FORCED_SAML_CONFIG, non sovrascrivere):
//   digestAlgorithm   = sha512
//   allowCreate       = false  (NameIDPolicy senza AllowCreate)
//   wantAssertionsSigned = true
//
const spidStrategy = new SpidStrategy(
  {
    saml: {
      callbackUrl:                    process.env.SP_ACS_URL,
      // logoutCallbackUrl usa entityId come base
      logoutCallbackUrl:              `${process.env.SP_ENTITY_ID}/spid/logout`,
      // sha256 per la firma della request; digest è forzato a sha512 dalla lib
      signatureAlgorithm:             'sha256',
      privateKey:                     SP_KEY,
      attributeConsumingServiceIndex: '0',
      // HTTP-Redirect è richiesto da SPID per la AuthnRequest
      authnRequestBinding:            'HTTP-Redirect',
    },
    spid: {
      // ⚠️  NUMERO INTERO — non stringa URI
      // 1 → SpidL1 (senza ForceAuthn)
      // 2 → SpidL2 (con ForceAuthn=true) ← raccomandato per il Demo IdP
      authnContext: 2,

      getIDPEntityIdFromRequest: (req) => {
        // GET /spid/login?idp=...
        if (req.query?.idp) return req.query.idp;
        // POST /spid/acs  → RelayState JSON
        try {
          return JSON.parse(req.body?.RelayState || '{}').idp
            || 'https://demo.spid.gov.it';
        } catch {
          return 'https://demo.spid.gov.it';
        }
      },

      IDPRegistryMetadata: IDP_METADATA,

      serviceProvider: {
        // ⚠️  'public' → <spid:Public/> nel metadata (obbligatorio per PA)
        // check 82 del validatore richiede Public; check 83 vieta Private
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
          // IPACode obbligatorio per enti pubblici
          IPACode:   process.env.SP_IPA_CODE      || 'DEMO',
          email:     process.env.SP_CONTACT_EMAIL || 'admin@example.it',
          // VATNumber: lascialo VUOTO oppure rimuovilo se non hai P.IVA
          // (check 72-73: se presente deve avere valore e ISO3166 prefix)
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
  const idpEntityId = req.query.idp || 'https://demo.spid.gov.it';

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
  res.json({ status: 'ok', service: 'spid-service', port: PORT })
);

app.listen(PORT, () =>
  console.log(`[spid-service] in ascolto sulla porta ${PORT}`)
);
