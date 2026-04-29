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

// ── extractEntities ───────────────────────────────────────────
// function declaration: viene hoistata, nessun ReferenceError.
// Estrae solo EntityDescriptor con X509Certificate.
function extractEntities(xml) {
  if (!xml) return '';
  return [...xml.matchAll(/<(?:md:)?EntityDescriptor[\s\S]*?<\/(?:md:)?EntityDescriptor>/g)]
    .filter(m => {
      const block = m[0];
      // Deve avere un KeyDescriptor con X509Certificate non vuoto
      // (NON il cert della firma ds:Signature)
      const keyDescMatch = block.match(
        /<(?:md:)?KeyDescriptor[\s\S]*?<\/(?:md:)?KeyDescriptor>/g
      );
      if (!keyDescMatch) return false;
      return keyDescMatch.some(kd => {
        const certMatch = kd.match(/<[^>]*X509Certificate[^>]*>([^<]+)<\/[^>]*X509Certificate>/);
        return certMatch && certMatch[1].trim().length > 0;
      });
    })
    .map(m => m[0])
    .join('\n');
}

// ── Carica metadata IdP ───────────────────────────────────────

// 1. Demo IdP  (entityID: https://demo.spid.gov.it)
const xmlDemo = fs.readFileSync(
  path.resolve(__dirname, './idp-metadata/demo-idp-metadata.xml'), 'utf8'
);

// 2. Demo Validator  (entityID: https://demo.spid.gov.it/validator)
const validatorPath    = path.resolve(__dirname, './idp-metadata/validator-idp-metadata.xml');
const xmlDemoValidator = fs.existsSync(validatorPath) ? fs.readFileSync(validatorPath, 'utf8') : '';

// 3. Registro produzione AgID
const xmlRegistry = fs.readFileSync(
  path.resolve(__dirname, './idp-metadata/all-idp-metadata.xml'), 'utf8'
);

// 4. AgID Validator ufficiale (opzionale)
const agidPath = path.resolve(__dirname, './idp-metadata/agid-validator-metadata.xml');
const xmlAgidRaw  = fs.existsSync(agidPath) ? fs.readFileSync(agidPath, 'utf8') : '';

// ── Combina tutti gli IdP ─────────────────────────────────────
const IDP_METADATA = `<?xml version="1.0"?>
<md:EntitiesDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">
${extractEntities(xmlDemo)}
${extractEntities(xmlDemoValidator)}
${extractEntities(xmlRegistry)}
${xmlAgidRaw}
</md:EntitiesDescriptor>`;

const idpCount = (IDP_METADATA.match(/<\/(?:md:)?EntityDescriptor>/g) || []).length;
console.log(`[spid] Caricati ${idpCount} IdP`);
if (idpCount === 0) {
  throw new Error('[spid] Nessun IdP caricato — controlla i file in idp-metadata/');
}

// ── Default IdP ───────────────────────────────────────────────
const DEFAULT_IDP = process.env.SPID_IDP_ENTITY_ID || 'https://demo.spid.gov.it/validator';
console.log(`[spid] Default IdP: ${DEFAULT_IDP}`);

// ── Cache in-memory ───────────────────────────────────────────
const _cache = new Map();
const cache = {
  get: (key) => {
    const val = _cache.get(key) ?? null;
    console.log(`[cache:get] ${key} → ${val !== null ? 'HIT' : 'MISS'}`);
    return Promise.resolve(val);
  },
  set: (key, val) => {
    _cache.set(key, val);
    console.log(`[cache:set] ${key}`);
    return Promise.resolve();
  },
  delete: (key) => {
    _cache.delete(key);
    console.log(`[cache:del] ${key}`);
    return Promise.resolve();
  },
};

// ── SpidStrategy ──────────────────────────────────────────────
const spidStrategy = new SpidStrategy(
  {
    saml: {
      callbackUrl:                    process.env.SP_ACS_URL,
      logoutCallbackUrl:              `${process.env.SP_ENTITY_ID}/spid/logout`,
      signatureAlgorithm:             'sha256',
      privateKey:                     SP_KEY,
      attributeConsumingServiceIndex: '0',
      authnRequestBinding:            'HTTP-Redirect',
    },
    spid: {
      authnContext: 2,

      getIDPEntityIdFromRequest: (req) => {
        if (req.query?.idp) return req.query.idp;
        try {
          return JSON.parse(req.body?.RelayState || '{}').idp || DEFAULT_IDP;
        } catch {
          return DEFAULT_IDP;
        }
      },

      IDPRegistryMetadata: IDP_METADATA,

      serviceProvider: {
        type:        'public',
        entityId:    process.env.SP_ENTITY_ID,
        certificate: SP_CERT,
        privateKey:  SP_KEY,
        acs: [
          {
            name:       'Servizio Demo SPID',
            attributes: ['spidCode', 'fiscalNumber', 'name', 'familyName', 'email'],
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
          IPACode: process.env.SP_IPA_CODE      || 'DEMO',
          email:   process.env.SP_CONTACT_EMAIL || 'admin@example.it',
        },
      },
    },
    cache,
  },
  (profile, done) => done(null, profile),
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
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
}));
app.use(passport.initialize());
app.use(passport.session());

// ── Metadata SP ───────────────────────────────────────────────
// La lib richiede un IdP valido nel req anche per generare il metadata SP.
// Iniettiamo il default se non specificato.
app.get('/spid/metadata', async (req, res) => {
  try {
    if (!req.query.idp) req.query = { ...req.query, idp: DEFAULT_IDP };
    const xml = await spidStrategy.generateSpidServiceProviderMetadata();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  } catch (err) {
    console.error('[metadata]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Login ─────────────────────────────────────────────────────
app.get('/spid/login', (req, res, next) => {
  const idp = req.query.idp || DEFAULT_IDP;
  console.log(`[login] idp=${idp}`);
  req.session.idpEntityId = idp;
  req.session.save(() => {
    passport.authenticate('spid', {
      session: false,
      additionalParams: {
        RelayState: JSON.stringify({ idp, returnTo: process.env.FRONTEND_URL }),
      },
    })(req, res, next);
  });
});

// ── ACS ───────────────────────────────────────────────────────
app.post(
  '/spid/acs',
  express.urlencoded({ extended: false }),
  (req, res, next) => {
    console.log('[acs] POST — RelayState:', req.body?.RelayState);
    console.log('[acs] cache keys:', [..._cache.keys()]);

    passport.authenticate('spid', { session: false }, (err, user, info) => {
      if (err) {
        console.error('[acs] ERRORE:', err.message);
        return res.redirect(
          `${process.env.FRONTEND_URL}/login?error=spid&reason=${encodeURIComponent(err.message)}`
        );
      }
      if (!user) {
        console.error('[acs] Nessun utente. Info:', JSON.stringify(info));
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=spid&reason=no_user`);
      }
      console.log('[acs] Login OK — spidCode:', user.spidCode || user.nameID);

      const token = jwt.sign(
        {
          sub:        user.spidCode     || user.nameID || null,
          fiscalCode: user.fiscalNumber || null,
          name:       user.name         || null,
          familyName: user.familyName   || null,
          email:      user.email        || null,
          role:       'user',
          loginMethod: 'spid',
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      let returnTo = process.env.FRONTEND_URL;
      try { returnTo = JSON.parse(req.body?.RelayState || '{}').returnTo || returnTo; } catch {}

      return res.redirect(`${returnTo}/auth/callback#token=${token}`);
    })(req, res, next);
  }
);

// ── Logout ────────────────────────────────────────────────────
app.get('/spid/logout', (req, res) => {
  req.session.destroy(() => res.redirect(`${process.env.FRONTEND_URL}/login`));
});

// ── Debug cache ───────────────────────────────────────────────
app.get('/spid/debug/cache', (_, res) =>
  res.json({ size: _cache.size, keys: [..._cache.keys()] })
);

// ── Health ────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({
  status:     'ok',
  service:    'spid-service',
  port:       PORT,
  idpCount,
  defaultIdp: DEFAULT_IDP,
}));

app.listen(PORT, () =>
  console.log(`[spid-service] porta ${PORT} | ${idpCount} IdP | default: ${DEFAULT_IDP}`)
);
