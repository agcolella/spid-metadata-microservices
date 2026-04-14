import express from 'express';
import cors    from 'cors';
import axios   from 'axios';
import forge   from 'node-forge';

const PORT          = process.env.CERTIFICATE_SERVICE_PORT || 4007;
const REGISTRY_BASE = process.env.SPID_REGISTRY_BASE || 'https://registry.spid.gov.it/entities-sp';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePem(cert) {
  if (!cert) return null;
  const s = String(cert).trim();
  if (s.includes('BEGIN CERTIFICATE')) return s;
  const compact = s.replace(/\s+/g, '');
  const lines   = compact.match(/.{1,64}/g) || [compact];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

function extractSigningCertificate(payload) {
  if (!payload) return null;
  const v = payload.signing_certificate_x509 ?? payload.data?.signing_certificate_x509;
  if (Array.isArray(v)) return v[0] || null;
  if (typeof v === 'string') return v;
  return null;
}

/**
 * Estrae il primo X509Certificate dall'XML grezzo.
 * Cerca sia dentro <KeyDescriptor use="signing"> sia qualsiasi <X509Certificate>.
 */
function extractCertFromXml(xmlContent) {
  if (!xmlContent) return null;

  // Prima scelta: certificato dentro KeyDescriptor use="signing"
  const signingBlock = xmlContent.match(
    /<[^>]+KeyDescriptor[^>]+use=["']signing["'][^>]*>[\s\S]*?<\/[^>]+KeyDescriptor>/i
  );
  if (signingBlock) {
    const m = signingBlock[0].match(/<[^>]*X509Certificate[^>]*>([\s\S]+?)<\/[^>]*X509Certificate>/i);
    if (m) return m[1].replace(/\s+/g, '');
  }

  // Seconda scelta: primo X509Certificate trovato nel documento
  const m = xmlContent.match(/<[^>]*X509Certificate[^>]*>([\s\S]+?)<\/[^>]*X509Certificate>/i);
  if (m) return m[1].replace(/\s+/g, '');

  return null;
}

function parseCertificate(certPem) {
  const pem = normalizePem(certPem);
  if (!pem) throw new Error('Certificato mancante');

  const cert      = forge.pki.certificateFromPem(pem);
  const now       = new Date();
  const notBefore = cert.validity.notBefore;
  const notAfter  = cert.validity.notAfter;
  const validDate = new Date(notBefore) <= now && now <= new Date(notAfter);

  const asn1        = forge.pki.certificateToAsn1(cert);
  const der         = forge.asn1.toDer(asn1).getBytes();
  const md          = forge.md.sha1.create();
  md.update(der);
  const fingerprint = md.digest().toHex();

  return {
    pem,
    subject:      cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ') || null,
    issuer:       cert.issuer.attributes.map(a  => `${a.shortName || a.name}=${a.value}`).join(', ') || null,
    serialNumber: cert.serialNumber || null,
    fingerprint,
    notBefore:    notBefore.toISOString(),
    notAfter:     notAfter.toISOString(),
    validDate,
  };
}

function buildResponse(source, entityId, certRaw) {
  if (!certRaw) {
    return {
      valid:       false,
      entityId,
      source,
      errors:      [`X509Certificate non trovato (source: ${source})`],
      warnings:    [],
      certificate: null,
    };
  }

  try {
    const parsed   = parseCertificate(certRaw);
    const errors   = [];
    const warnings = [];

    if (!parsed.validDate) errors.push('Certificato scaduto o non ancora valido');
    if (!parsed.subject)   warnings.push('Subject non disponibile');

    return {
      valid: errors.length === 0,
      entityId,
      source,
      certificate: parsed,
      errors,
      warnings,
    };
  } catch (err) {
    return {
      valid:       false,
      entityId,
      source,
      errors:      [`Errore parsing certificato: ${err.message}`],
      warnings:    [],
      certificate: null,
    };
  }
}

// ─── POST /verify ─────────────────────────────────────────────────────────────
//
// Modalità 1 — da XML locale:
//   { entityId, xmlContent: "<EntityDescriptor ...>...</EntityDescriptor>" }
//   Estrae X509Certificate dall'XML fornito.
//
// Modalità 2 — da registro SPID (comportamento originale):
//   { entityId }
//   Interroga registry.spid.gov.it e legge signing_certificate_x509.
//
// La risposta include il campo "source": "xml" | "registry"
// per indicare da dove è stato estratto il certificato.

app.post('/verify', async (req, res) => {
  try {
    const { entityId, xmlContent } = req.body || {};

    if (!entityId)
      return res.status(400).json({ valid: false, error: 'entityId mancante' });

    // ── Modalità 1: XML fornito direttamente ──────────────────────────────────
    if (xmlContent) {
      const certRaw = extractCertFromXml(xmlContent);
      return res.json(buildResponse('xml', entityId, certRaw));
    }

    // ── Modalità 2: registro SPID (fallback originale) ────────────────────────
    const url      = `${REGISTRY_BASE}/${encodeURIComponent(entityId)}?output=json`;
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: { Accept: 'application/json' },
    });

    const certRaw = extractSigningCertificate(data);
    return res.json(buildResponse('registry', entityId, certRaw));

  } catch (err) {
    // Gestione errore 404 dal registro (entityId non trovato)
    if (err.response?.status === 404) {
      return res.status(404).json({
        valid:       false,
        entityId:    req.body?.entityId,
        source:      'registry',
        errors:      ['EntityID non trovato nel registro SPID'],
        warnings:    [],
        certificate: null,
      });
    }
    return res.status(500).json({ valid: false, error: err.message });
  }
});

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', port: PORT })
);

app.listen(PORT, () =>
  console.log(`certificate-service on http://localhost:${PORT}`)
);
