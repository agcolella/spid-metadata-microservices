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
const spKey  = process.env.SPID_SP_KEY
  ? Buffer.from(process.env.SPID_SP_KEY, 'base64').toString('utf8')
  : fs.readFileSync('./certs/sp-key.pem', 'utf8'); // fallback locale

const spCert = process.env.SPID_SP_CERT
  ? Buffer.from(process.env.SPID_SP_CERT, 'base64').toString('utf8')
  : fs.readFileSync('./certs/sp-cert.pem', 'utf8');
  
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

// Sostituisci ogni uso di JSON.parse(req.body?.RelayState)
// con questa funzione helper:
function parseRelayState(raw) {
  if (!raw) return {};
  try {
    // Prova prima Base64
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    try {
      // Fallback: JSON diretto (compatibilità con richieste vecchie)
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}

// ─────────────────────────────────────────────────────────────
// SOSTITUISCI ANCHE questa funzione nel file (era JWT_SECRET):
//
// function _makeLocalJwt(user) {
//   return jwt.sign({ ... }, process.env.JWT_SECRET, ...);  ← SBAGLIATO
// }
//
// Versione corretta:

function _makeLocalJwt(user) {
  return jwt.sign(
    {
      sub:         user.spidCode     || user.nameID || null,
      fiscalCode:  user.fiscalNumber || null,
      name:        user.name         || null,
      familyName:  user.familyName   || null,
      email:       user.email        || null,
      role:        'viewer',
      loginMethod: 'spid',
    },
    process.env.JWT_ACCESS_SECRET,   // FIX: stesso segreto usato dal backoffice per verify
    { expiresIn: process.env.JWT_ACCESS_EXP || '15m' }
  );
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
const xmlAgid  = fs.existsSync(agidPath) ? fs.readFileSync(agidPath, 'utf8') : '';

// ── Combina tutti gli IdP ─────────────────────────────────────
const IDP_METADATA = `<?xml version="1.0"?>
<md:EntitiesDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">
${extractEntities(xmlDemo)}
${extractEntities(xmlDemoValidator)}
${extractEntities(xmlRegistry)}
${extractEntities(xmlAgid)}
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
// DEBUG — rimuovere dopo il fix
const entityIds = [...IDP_METADATA.matchAll(/entityID="([^"]+)"/g)].map(m => m[1]);
console.log('[spid] EntityID nel registro:\n' + entityIds.join('\n'));
console.log('[spid] IDP_METADATA length:', IDP_METADATA.length);
console.log('[spid] agid raw incluso:', IDP_METADATA.includes('validator.spid.gov.it'));
// ── SpidStrategy ──────────────────────────────────────────────
const spidStrategy = new SpidStrategy(
  {
    saml: {
      callbackUrl:                    process.env.SP_ACS_URL,
      logoutCallbackUrl:              `${process.env.SP_ENTITY_ID}/logout`,
      signatureAlgorithm:             'sha256',
      privateKey:                     spKey,
      attributeConsumingServiceIndex: '0',
      authnRequestBinding:            'HTTP-Redirect',
    },
    spid: {
      authnContext: 2,

      getIDPEntityIdFromRequest: (req) => {
        if (req.query?.idp) return req.query.idp;
        return parseRelayState(req.body?.RelayState).idp || DEFAULT_IDP;
      },

      IDPRegistryMetadata: IDP_METADATA,

      serviceProvider: {
        type:        'public',
        entityId:    process.env.SP_ENTITY_ID,
        certificate: spCert,
        privateKey:  spKey,
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
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'https://validator.spid.gov.it',
    'https://demo.spid.gov.it',
  ],
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

// ── Metadata SP ───────────────────────────────────────────────
// La lib richiede un IdP valido nel req anche per generare il metadata SP.
// Iniettiamo il default se non specificato.
app.get('/spid/metadata', async (req, res) => {
  try {
    // Non modificare req.query direttamente — è read-only in questa versione di Express
    // Inietta l'idp direttamente nella query object esistente
    if (!req.query.idp) {
      Object.defineProperty(req, 'query', {
        value: { ...req.query, idp: DEFAULT_IDP },
        writable: true,
        configurable: true,
      });
    }
    console.log('[metadata] Usando idp:', req.query.idp);
    const xml = await spidStrategy.generateSpidServiceProviderMetadata();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  } catch (err) {
    console.error('[metadata] ERRORE:', err.stack || err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Login ─────────────────────────────────────────────────────
app.get('/spid/login', (req, res, next) => {
  const idp = req.query.idp || DEFAULT_IDP;
  console.log(`[login] idp=${idp}`);
  req.session.idpEntityId = idp;

  // RelayState codificato in Base64 — non deve essere in chiaro (check SPID n°26)
  const relayStateRaw = JSON.stringify({ idp, returnTo: process.env.FRONTEND_URL });
  const relayState    = Buffer.from(relayStateRaw).toString('base64');

  req.session.save(() => {
    passport.authenticate('spid', {
      session: false,
      additionalParams: { RelayState: relayState },
    })(req, res, next);
  });
});

// ── ACS ───────────────────────────────────────────────────────
app.post(
  '/spid/acs',
  express.urlencoded({ extended: false }),
  (req, res, next) => {

    // ── 1. Intercetta errori SAML prima di passport ───────────
    let spidError = null;
    try {
      const samlXml       = Buffer.from(req.body?.SAMLResponse || '', 'base64').toString('utf8');
      const statusCode    = samlXml.match(/StatusCode[^>]+Value="([^"]+)"/)?.[1];
      const statusMessage = samlXml.match(/<[^>]*StatusMessage[^>]*>([^<]+)<\/[^>]*StatusMessage>/)?.[1];

      if (statusCode && statusCode !== 'urn:oasis:names:tc:SAML:2.0:status:Success') {
        const SPID_ERRORS = {
          'urn:oasis:names:tc:SAML:2.0:status:AuthnFailed':    'spid_authn_failed',
          'urn:oasis:names:tc:SAML:2.0:status:NoAuthnContext': 'spid_no_authn_context',
        };
        const anomalyMatch = statusMessage?.match(/ErrorCode\s+nr(\d+)/i);
        const anomalyCode  = anomalyMatch ? `spid_error_${anomalyMatch[1]}` : 'spid_error';
        spidError = SPID_ERRORS[statusCode] || anomalyCode;
      }
    } catch {}

    if (spidError) {
      // FIX: il frontend è una SPA su / — LoginView legge ?error= da window.location.search
      const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
      return res.redirect(`${base}/?error=${spidError}`);
    }

    console.log('[acs] POST — RelayState:', req.body?.RelayState);
    console.log('[acs] cache keys:', [..._cache.keys()]);

    // ── 2. Passport verifica l'asserzione SAML ────────────────
    passport.authenticate('spid', { session: false }, async (err, user, info) => {

      const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');

      if (err) {
        console.error('[acs] ERRORE passport:', err.message);
        return res.redirect(
          `${base}/?error=spid&reason=${encodeURIComponent(err.message)}`
        );
      }
      if (!user) {
        console.error('[acs] Nessun utente. Info:', JSON.stringify(info));
        return res.redirect(`${base}/?error=spid&reason=no_user`);
      }

      console.log('[acs] Login OK — spidCode:', user.spidCode || user.nameID);

      // ── 3. Ottieni JWT ────────────────────────────────────────
      let accessToken, refreshToken, mustChangePassword = false;

      const authServiceUrl = process.env.AUTH_SERVICE_URL;

      if (authServiceUrl) {
        try {
          const authRes = await fetch(`${authServiceUrl}/auth/spid-login`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fiscalNumber: user.fiscalNumber || null,
              spidCode:     user.spidCode     || user.nameID || null,
              name:         user.name         || null,
              familyName:   user.familyName   || null,
              email:        user.email        || null,
            }),
          });

          if (!authRes.ok) {
            const body = await authRes.json().catch(() => ({}));
            console.error('[acs] auth-service error:', body);
            return res.redirect(
              `${base}/?error=auth_service&reason=${encodeURIComponent(body.error || authRes.status)}`
            );
          }

          const tokens     = await authRes.json();
          accessToken      = tokens.accessToken;
          refreshToken     = tokens.refreshToken     || null;
          mustChangePassword = tokens.mustChangePassword === true;

        } catch (fetchErr) {
          console.error('[acs] fetch auth-service fallito:', fetchErr.message);
          // Fallback JWT locale se backoffice non raggiungibile
          accessToken = _makeLocalJwt(user);
        }
      } else {
        // AUTH_SERVICE_URL non configurata: JWT locale (sviluppo)
        console.warn('[acs] AUTH_SERVICE_URL non impostata — JWT locale');
        accessToken = _makeLocalJwt(user);
      }

      // ── 4. Redirect al frontend ───────────────────────────────
      // FIX 1: destinazione corretta → /auth/callback  (non la root)
      // FIX 2: parametri nel fragment hash #  (SpidCallbackView usa window.location.hash)
      // FIX 3: nome parametro accessToken   (non "token")
      // I token nel fragment non finiscono nei log del server né nei referrer HTTP.
      const fragment = new URLSearchParams({
        accessToken,
        ...(refreshToken       ? { refreshToken }                          : {}),
        ...(mustChangePassword ? { mustChangePassword: '1' }               : {}),
      }).toString();

      return res.redirect(`${base}/auth/callback#${fragment}`);

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
