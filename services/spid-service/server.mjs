// ── PATCH node-saml all'avvio ──────────────────────────────────
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const samlPath = _require.resolve('passport-saml/lib/node-saml/saml.js');
let _samlSrc = readFileSync(samlPath, 'utf8');
if (!_samlSrc.includes('@NameQualifier')) {
  _samlSrc = _samlSrc.replace(
    `"saml:Issuer": {\n                    "@xmlns:saml": "urn:oasis:names:tc:SAML:2.0:assertion",\n                    "#text": this.options.issuer,\n                },\n            },\n        };\n        if (isPassive)`,
    `"saml:Issuer": {\n                    "@xmlns:saml": "urn:oasis:names:tc:SAML:2.0:assertion",\n                    "@Format": "urn:oasis:names:tc:SAML:2.0:nameid-format:entity",\n                    "@NameQualifier": this.options.issuer,\n                    "#text": this.options.issuer,\n                },\n            },\n        };\n        if (isPassive)`
  );
  writeFileSync(samlPath, _samlSrc);
  console.log('✅ node-saml patchato all\'avvio');
}
// ── fine patch ──────────────────────────────────────────────────
import express        from 'express';
import cors           from 'cors';
import session        from 'express-session';
import passport       from 'passport';
import { Strategy }   from 'passport-saml';
import jwt            from 'jsonwebtoken';
import fs             from 'fs';
import path           from 'path';
import { fileURLToPath } from 'url';
import dotenv         from 'dotenv';
import { SignedXml } from 'xml-crypto';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();
const PORT      = process.env.PORT || 4008;

// ── Leggi certificati SP ──────────────────────────────────────
// In server.mjs — già presente nella guida, verifica che sia così
const SP_KEY  = fs.readFileSync(
  path.resolve(process.env.SP_KEY_PATH)   // ← path assoluto /etc/secrets/sp-key.pem
);
const SP_CERT = fs.readFileSync(
  path.resolve(__dirname, process.env.SP_CERT_PATH), 'utf8'  // ← relativo al progetto
).replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n/g, '');

// ── Lista IdP SPID (produzione: tutti gli IdP federati) ───────
// In sviluppo usa spid-testenv2 in locale o staging
const IDP_LIST = {
  'https://demo.spid.gov.it': {
    entryPoint: 'https://demo.spid.gov.it/sso',   // SSO endpoint dell'IdP Demo
    cert: fs.readFileSync(
      path.resolve(__dirname, './idp-metadata/demo-idp-cert.pem'),
      'utf8'
    ).replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n/g, ''),
  },
};

// ── Configurazione Strategy SAML ─────────────────────────────
function buildStrategy(idpEntityId) {
  const idp = IDP_LIST[idpEntityId];
  if (!idp) throw new Error(`IdP sconosciuto: ${idpEntityId}`);

  return new Strategy(
    {
      // Service Provider
      issuer:                   process.env.SP_ENTITY_ID,
      issuerFormat:   'urn:oasis:names:tc:SAML:2.0:nameid-format:entity',
      callbackUrl:              process.env.SP_ACS_URL,
      decryptionPvk:            SP_KEY,
      privateKey:               SP_KEY,
      signatureAlgorithm:       'sha256',
      digestAlgorithm:          'sha256',
      identifierFormat:         'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
      authnContext:             ['https://www.spid.gov.it/SpidL1'], // Livello SPID L1
      forceAuthn:               false,
      passive:                  false,

      // Identity Provider
      entryPoint:               idp.entryPoint,
      cert:                     idp.cert,

      // Attributi SPID richiesti (aggiungi quelli necessari)
      attributeConsumingServiceIndex: '0',
    },
    (profile, done) => done(null, profile)
  );
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: process.env.NODE_ENV === 'production', httpOnly: true },
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done)   => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ── Route: avvia login SPID ───────────────────────────────────
// GET /spid/login?idp=https://spid.testenv2/
app.get('/spid/login', (req, res, next) => {
  const idpEntityId = req.query.idp;
  if (!idpEntityId || !IDP_LIST[idpEntityId]) {
    return res.status(400).json({ error: 'IdP non valido o mancante' });
  }
  // Registra la strategy per questo IdP
  passport.use('saml', buildStrategy(idpEntityId));
  req.session.idpEntityId = idpEntityId;

  passport.authenticate('saml', {
    additionalParams: {
      RelayState: JSON.stringify({
        idp: idpEntityId,
        returnTo: process.env.FRONTEND_URL || 'https://spid-metadata-microservices.vercel.app'
      })
    },
  })(req, res, next);
});

// ── Route: Assertion Consumer Service (callback IdP) ─────────
// POST /spid/acs
app.post('/spid/acs',
  (req, res, next) => {
    let idpEntityId = req.session.idpEntityId;
    try {
      const relay = JSON.parse(req.body.RelayState || '{}');
      idpEntityId = relay.idp || req.body.RelayState || req.session.idpEntityId;
    } catch {
      idpEntityId = req.body.RelayState || req.session.idpEntityId;
    }
    passport.use('saml', buildStrategy(idpEntityId));
    next();
  },
  passport.authenticate('saml', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=spid` }),
  (req, res) => {
    const profile = req.user;

    // Attributi SPID standard ricevuti dall'IdP
    const spidUser = {
      spidCode:     profile['spidCode']     || profile.nameID,
      fiscalNumber: profile['fiscalNumber'] || null,
      name:         profile['name']         || null,
      familyName:   profile['familyName']   || null,
      email:        profile['email']        || null,
      //mobilePhone:  profile['mobilePhone']  || null,
      //dateOfBirth:  profile['dateOfBirth']  || null,
      authLevel:    profile['AuthnContextClassRef'] || 'SpidL2',
      loginMethod:  'spid',
    };

    // Genera JWT interno compatibile con il resto dell'app
    const token = jwt.sign(
      {
        sub:         spidUser.spidCode,
        fiscalCode:  spidUser.fiscalNumber,
        name:        spidUser.name,
        familyName:  spidUser.familyName,
        email:       spidUser.email,
        role:        'user',          // ruolo default — logica custom qui
        loginMethod: 'spid',
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Redirect al frontend con il token (via query param o hash)
    // Usa hash (#) per evitare che il token finisca nei log del server
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback#token=${token}`);
  }
);

// ── Route: metadata SP (necessario per federazione AgID) ──────
// GET /spid/metadata
app.get('/spid/metadata', (req, res) => {
  const unsignedMetadata = `<?xml version="1.0"?>
<md:EntityDescriptor
  xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  entityID="${process.env.SP_ENTITY_ID}"
  ID="_spid_sp_metadata">

  <md:SPSSODescriptor
    AuthnRequestsSigned="true"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">

    <md:KeyDescriptor use="signing">
      <ds:KeyInfo><ds:X509Data>
        <ds:X509Certificate>${SP_CERT}</ds:X509Certificate>
      </ds:X509Data></ds:KeyInfo>
    </md:KeyDescriptor>

    <md:KeyDescriptor use="encryption">
      <ds:KeyInfo><ds:X509Data>
        <ds:X509Certificate>${SP_CERT}</ds:X509Certificate>
      </ds:X509Data></ds:KeyInfo>
    </md:KeyDescriptor>

    <md:SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="${process.env.SP_ENTITY_ID}/logout"/>

    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${process.env.SP_ACS_URL}"
      index="0"
      isDefault="true"/>

    <md:AttributeConsumingService index="0">
      <md:ServiceName xml:lang="it">${process.env.SP_ORG_DISPLAY_NAME || 'Servizio SPID'}</md:ServiceName>
      <md:RequestedAttribute Name="spidCode"     NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic" isRequired="true"/>
      <md:RequestedAttribute Name="fiscalNumber" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic" isRequired="true"/>
      <md:RequestedAttribute Name="name"         NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic" isRequired="true"/>
      <md:RequestedAttribute Name="familyName"   NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic" isRequired="true"/>
      <md:RequestedAttribute Name="email"        NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic" isRequired="false"/>
    </md:AttributeConsumingService>

  </md:SPSSODescriptor>

  <md:Organization>
    <md:OrganizationName xml:lang="it">${process.env.SP_ORG_NAME || 'Nome Ente'}</md:OrganizationName>
    <md:OrganizationDisplayName xml:lang="it">${process.env.SP_ORG_DISPLAY_NAME || 'Nome Ente Visualizzato'}</md:OrganizationDisplayName>
    <md:OrganizationURL xml:lang="it">${process.env.SP_ORG_URL || 'https://www.example.it'}</md:OrganizationURL>
  </md:Organization>

  <md:ContactPerson contactType="other">
    <md:Extensions xmlns:spid="https://spid.gov.it/saml-extensions">
      <spid:IPACode>${process.env.SP_IPA_CODE || 'DEMO'}</spid:IPACode>
      ${process.env.SP_VAT_NUMBER ? `<spid:VATNumber>${process.env.SP_VAT_NUMBER}</spid:VATNumber>` : ''}
      <spid:Public/>
    </md:Extensions>
    <md:EmailAddress>${process.env.SP_CONTACT_EMAIL || 'admin@example.it'}</md:EmailAddress>
  </md:ContactPerson>

</md:EntityDescriptor>`;

try {
  const sig = new SignedXml({ privateKey: SP_KEY });

  sig.addReference({
    xpath: "//*[local-name(.)='EntityDescriptor']",
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
  });

  sig.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#';
  sig.signatureAlgorithm        = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';

  sig.computeSignature(unsignedMetadata, {
    location: {
      reference: "//*[local-name(.)='SPSSODescriptor']",
      action:    'before',
    },
  });

  // Inserisci manualmente KeyInfo dentro la Signature generata
  const keyInfoXml = `<KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<X509Data><X509Certificate>${SP_CERT}</X509Certificate></X509Data>` +
    `</KeyInfo>`;

  const signedXml = sig.getSignedXml()
    .replace('</SignatureValue>', `</SignatureValue>${keyInfoXml}`);

  res.header('Content-Type', 'application/xml');
  res.send(signedXml);

} catch (err) {
  console.error('Errore firma metadata:', err.message);
  res.status(500).json({ error: 'Errore nella generazione del metadata firmato' });
}
});

// ── Route: logout SPID (Single Logout) ───────────────────────
app.get('/spid/logout', (req, res) => {
  req.session.destroy();
  res.redirect(`${process.env.FRONTEND_URL}/login`);
});

// ── Healthcheck ───────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'spid-service' }));

app.listen(PORT, () => console.log(`spid-service in ascolto su porta ${PORT}`));
