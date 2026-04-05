import express from 'express';
import cors from 'cors';
import axios from 'axios';
import forge from 'node-forge';  // ← SOSTITUISCE x509

const PORT = process.env.CERTIFICATE_SERVICE_PORT || 4007;
const REGISTRY_BASE = process.env.SPID_REGISTRY_BASE || 'https://registry.spid.gov.it/entities-sp';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

function normalizePem(cert) {
  if (!cert) return null;
  const s = String(cert).trim();
  if (s.includes('BEGIN CERTIFICATE')) return s;
  const compact = s.replace(/\s+/g, '');
  const lines = compact.match(/.{1,64}/g) || [compact];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

function extractSigningCertificate(payload) {
  if (!payload) return null;
  const v = payload.signing_certificate_x509 ?? payload.data?.signing_certificate_x509;
  if (Array.isArray(v)) return v[0] || null;
  if (typeof v === 'string') return v;
  return null;
}

function parseCertificate(certPem) {
  const pem = normalizePem(certPem);
  if (!pem) throw new Error('Certificato mancante');
  
  try {
    const cert = forge.pki.certificateFromPem(pem);
    const now = new Date();
    const notBefore = cert.validity.notBefore;
    const notAfter = cert.validity.notAfter;
    const validDate = new Date(notBefore) <= now && now <= new Date(notAfter);

    // ← CORREZIONE FINGERPRINT (1 riga):
    const asn1 = forge.pki.certificateToAsn1(cert);
    const der = forge.asn1.toDer(asn1).getBytes();
    const md = forge.md.sha1.create();
    md.update(der);
    const fingerprint = md.digest().toHex();

    return {
      pem,
      subject: cert.subject.attributes.map(attr => `${attr.shortName || attr.name}=${attr.value}`).join(', ') || null,
      issuer: cert.issuer.attributes.map(attr => `${attr.shortName || attr.name}=${attr.value}`).join(', ') || null,
      serialNumber: cert.serialNumber || null,
      fingerprint,
      notBefore: notBefore.toISOString(),
      notAfter: notAfter.toISOString(),
      validDate
    };
  } catch (err) {
    throw new Error(`Errore parsing certificato: ${err.message}`);
  }
}

app.post('/verify', async (req, res) => {
  try {
    const { entityId } = req.body || {};
    if (!entityId) {
      return res.status(400).json({ valid: false, error: 'entityId mancante' });
    }

    const url = `${REGISTRY_BASE}/${encodeURIComponent(entityId)}?output=json`;
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: { Accept: 'application/json' }
    });

    const cert = extractSigningCertificate(data);
    if (!cert) {
      return res.status(404).json({
        valid: false,
        entityId,
        errors: ['signing_certificate_x509 non trovato nel registry'],
        warnings: [],
        certificate: null
      });
    }

    const parsed = parseCertificate(cert);
    const errors = [];
    const warnings = [];

    if (!parsed.validDate) errors.push('Certificato scaduto o non ancora valido');
    if (!parsed.subject) warnings.push('Subject non disponibile');

    return res.json({
      valid: errors.length === 0,
      entityId,
      certificate: parsed,
      errors,
      warnings
    });
  } catch (err) {
    return res.status(500).json({
      valid: false,
      error: err.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

app.listen(PORT, () => {
  console.log(`certificate-service on http://localhost:${PORT}`);
});