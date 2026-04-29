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

const DEFAULT_IDP_ENTITY_ID =
  process.env.SPID_IDP_ENTITY_ID || 'https://demo.spid.gov.it/validator';

const SP_KEY  = fs.readFileSync(path.resolve(__dirname, process.env.SP_KEY_PATH),  'utf8');
const SP_CERT = fs.readFileSync(path.resolve(__dirname, process.env.SP_CERT_PATH), 'utf8');

// ── Estrae EntityDescriptor validi (con X509Certificate) ─────
// Scarta gli EntityDescriptor senza certificato per evitare crash
// della lib passport-spid (AssertionError: missing X509Certificate)
const extractEntities = (xml) => {
  if (!xml) return '';
  return [...xml.matchAll(/<(?:md:)?EntityDescriptor[\s\S]*?<\/(?:md:)?EntityDescriptor>/g)]
    .filter(m => m[0].includes('X509Certificate'))
    .map(m => m[0])
    .join('\n');
};

// ── Carica metadata IdP ───────────────────────────────────────
// 1. Demo Validator (per test con demo.spid.gov.it/validator)
const xmlValidator = fs.readFileSync(
  path.resolve(__dirname, './idp-metadata/demo-idp-metadata.xml'), 'utf8'
);

// 2. Registro produzione AgID (tutti gli IdP accreditati)
const xmlRegistry = fs.readFileSync(
  path.resolve(__dirname, './idp-metadata/all-idp-metadata.xml'), 'utf8'
);

// 3. AgID Validator ufficiale (opzionale — solo se presente e con cert valido)
//    NOTA: validator.spid.gov.it/saml/idp non ha X509Certificate nel metadata
//    quindi viene automaticamente scartato dal filtro di extractEntities.
const xmlAgidValidator = fs.existsSync(
  path.resolve(__dirname, './idp-metadata/agid-validator-metadata.xml')
) ? fs.readFileSync(
  path.resolve(__dirname, './idp-metadata/agid-validator-metadata.xml'), 'utf8'
) : '';

// ── Combina in un unico EntitiesDescriptor ───────────────────
const IDP_METADATA = `<?xml version="1.0"?>
<md:EntitiesDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">
${extractEntities(xmlValidator)}
${extractEntities(xmlRegistry)}
${extractEntities(xmlAgidValidator)}
</md:EntitiesDescriptor>`;

const idpCount = (IDP_METADATA.match(/<\/(?:md:)?EntityDescriptor>/g) || []).length;
console.log(`[spid] Caricati ${idpCount} IdP`);
if (idpCount === 0) {
  throw new Error('[spid] Nessun IdP caricato — controlla i file metadata in idp-metadata/');
}

// ── Cache senza TTL automatico ───────────────────────────────
// La libreria usa la cache per validare InResponseTo tra
// AuthnRequest e SAMLResponse. Non usiamo setTimeout per evitare
// che l'entry venga cancellata prima che il Validator risponda.
const _cache = new Map();
const cache = {
  get: (key) => {
    const val = _cache.get(key) ?? null;
    console.log(`[cache:get] ${key} → ${val !== null ? 'HIT' : 'MISS'}`);
    return Promise.resolve(val);
  },
  set: (key, val, _ttl) => {
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
      authnContext: 2, // SpidL2 → ForceAuthn=true automatico

      getIDPEntityIdFromRequest: (req) => {
        if (req.query?.idp) return req.query.idp;
        try {
          return JSON.parse(req.body?.RelayState || '{}').idp || DEFAULT_IDP_ENTITY_ID;
        } catch {
          return DEFAULT_IDP_ENTITY_ID;
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
          IPACode: process.env.SP_IPA_CODE      || 'c_h501',
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
app.get('/spid/metadata', async (req, res) => {
  try {
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
  const idpEntityId = req.query.idp || DEFAULT_IDP_ENTITY_ID;
  console.log(`[login] idp=${idpEntityId}`);
  req.session.idpEntityId = idpEntityId;
  req.session.save(() => {
    passport.authenticate('spid', {
      session: false,
      additionalParams: {
        RelayState: JSON.stringify({ idp: idpEntityId, returnTo: process.env.FRONTEND_URL }),
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
          sub:         user.spidCode     || user.nameID || null,
          fiscalCode:  user.fiscalNumber || null,
          name:        user.name         || null,
          familyName:  user.familyName   || null,
          email:       user.email        || null,
          role:        'user',
          loginMethod: 'spid',
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      let returnTo = process.env.FRONTEND_URL;
      try {
        returnTo = JSON.parse(req.body?.RelayState || '{}').returnTo || returnTo;
      } catch {}

      return res.redirect(`${returnTo}/auth/callback#token=${token}`);
    })(req, res, next);
  }
);

// ── Logout ────────────────────────────────────────────────────
app.get('/spid/logout', (req, res) => {
  req.session.destroy(() => res.redirect(`${process.env.FRONTEND_URL}/login`));
});

// ── Debug cache ───────────────────────────────────────────────
app.get('/spid/debug/cache', (_, res) => {
  res.json({ size: _cache.size, keys: [..._cache.keys()] });
});

// ── Health ────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({
  status:             'ok',
  service:            'spid-service',
  port:               PORT,
  idpCount,
  defaultIdpEntityId: DEFAULT_IDP_ENTITY_ID,
}));

app.listen(PORT, () =>
  console.log(`[spid-service] porta ${PORT} | ${idpCount} IdP | default: ${DEFAULT_IDP_ENTITY_ID}`)
);
