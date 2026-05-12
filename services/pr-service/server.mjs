// services/pr-service/server.mjs
import express from 'express';
import cors    from 'cors';
import axios   from 'axios';
import jwt from 'jsonwebtoken';

const PORT         = process.env.PR_SERVICE_PORT         || 4004;
const FILE_SVC     = process.env.FILE_SERVICE_URL        || 'http://localhost:4001';
const VALID_SVC    = process.env.VALIDATION_SERVICE_URL  || 'http://localhost:4002';
const GITHUB_SVC   = process.env.GITHUB_SERVICE_URL      || 'http://localhost:4003';
const BASE_BRANCH  = process.env.BASE_BRANCH             || 'main';
const STRICT_MODE  = process.env.VALIDATION_STRICT_MODE  === 'true';
const BRANCH_PREFIX= process.env.BRANCH_PREFIX           || 'spid-batch-';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
if (!JWT_ACCESS_SECRET) throw new Error('JWT_ACCESS_SECRET è obbligatorio');


const app = express();
app.use(cors({ origin: ['http://localhost:8080','http://localhost:3000','https://spid-metadata-microservices.vercel.app'], credentials: true }));
app.use(express.json({ limit: '50mb' }));

// ── Helpers ───────────────────────────────────────────────
// Funzione per generare un token di servizio interno
function makeServiceToken() {
  return jwt.sign(
    { sub: 'pr-service', role: 'service', internal: true },
    JWT_ACCESS_SECRET,
    { expiresIn: '5m' }
  );
}

function generateBranchName() {
  const random = Math.random().toString(36).substring(2, 8);
  return `${BRANCH_PREFIX}${Date.now()}-${random}`;
}

function generateTitle(fileCount, organizations) {
  const dateStr = new Date().toISOString().split('T')[0];
  return `SPID: Aggiunta ${fileCount} metadata - ${dateStr}`;
}

function generateBody(filesData, organizations, validationResults) {
  const { errors = [], warnings = [], duplicates = [] } = validationResults || {};
  let body = '## 📋 Riepilogo\n\n';
  body += `Questa PR aggiunge **${filesData.length}** metadata SPID per **${organizations.length}** organizzazioni.\n\n`;
  body += '## ✅ Validazione\n\n';
  if (!errors.length && !warnings.length && !duplicates.length) {
    body += '- ✅ Tutti i file sono validi\n- ✅ Nessun warning\n- ✅ Nessun entityID duplicato\n\n';
  } else {
    if (errors.length)     body += `- ⚠️ **${errors.length}** errori\n`;
    if (warnings.length)   body += `- ⚠️ **${warnings.length}** warning\n`;
    if (duplicates.length) body += `- ⚠️ **${duplicates.length}** entityID duplicati\n`;
    body += '\n';
  }
  body += '## 🏢 Organizzazioni\n\n';
  organizations.forEach(o => { body += `- ${o}\n`; });
  body += '\n## 📁 File Inclusi\n\n<details>\n<summary>Espandi lista</summary>\n\n';
  filesData.forEach(f => {
    body += `- \`${f.filename}\`` + (f.organizationName ? ` — ${f.organizationName}` : '') + '\n';
  });
  body += '\n</details>\n\n---\n*PR creata automaticamente da SPID Metadata App*\n';
  return body;
}

// 
async function getFileContents(filenames, token) {
  // Decodifica il token utente per estrarre l'ID reale
  const decoded = jwt.decode(token);
  const { data } = await axios.post(
    `${FILE_SVC}/get-xml-contents`,
    { filenames, userId: decoded.sub ?? decoded.id },   // ← passa userId
    { headers: { Authorization: `Bearer ${makeServiceToken()}` } }
  );
  return data;
}

async function validateFiles(filesData, token) {
  const { data } = await axios.post(
    `${VALID_SVC}/validate-batch`,
    { files: filesData.map(f => ({ filename: f.filename, content: f.content })) },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

// Dopo validateFiles, aggiungi questo helper
function extractOrgNameFromXML(xmlContent) {
  if (!xmlContent) return null;
  // Cerca OrganizationDisplayName o OrganizationName nell'XML
  const match = xmlContent.match(
    /<(?:[^:]+:)?OrganizationDisplayName[^>]*>([^<]+)<\/(?:[^:]+:)?OrganizationDisplayName>/
  ) || xmlContent.match(
    /<(?:[^:]+:)?OrganizationName[^>]*>([^<]+)<\/(?:[^:]+:)?OrganizationName>/
  );
  return match ? match[1].trim() : null;
}

async function checkDuplicates(filesData, token) {
  const { data } = await axios.post(
    `${VALID_SVC}/check-duplicates`,
    { filesData: filesData.map(f => ({ filename: f.filename, entityID: f.entityID })) },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data.duplicates || [];
}

// ── Health ────────────────────────────────────────────────
app.get('/health', (_, res) =>
  res.json({ service: 'pr-service', status: 'ok', port: PORT })
);

// ── POST /preview ─────────────────────────────────────────
// Body: { files: string[] }  — nomi dei file in file-service
app.post('/preview', async (req, res) => {
  try {
    const { files } = req.body;
    if (!Array.isArray(files) || !files.length)
      return res.status(400).json({ error: 'files obbligatorio e non vuoto' });
    const token = req.headers.authorization?.split(' ')[1]; // ← aggiunta
    // 1. Leggi contenuti da file-service
    const contents = await getFileContents(files, token);
    const validFiles = contents.filter(f => f.success);

    // 2. Valida batch
    const validations = await validateFiles(validFiles, token);
    console.log('VALIDATIONS RESULT:', JSON.stringify(validations, null, 2));

    // 3. Aggrega dati
    const filesData   = [];
    const allErrors   = [];
    const allWarnings = [];
    const organizations = new Set();

    validations.forEach(v => {
      const { filename, validation } = v;
      const content = validFiles.find(f => f.filename === filename)?.content;
        // Prova prima dal risultato della validazione, poi fallback all'XML
      const orgName = validation?.organizationName 
        || extractOrgNameFromXML(content);
      filesData.push({
        filename,
        content,
        entityID:         validation?.entityID         || null,
        organizationName: orgName                      || null
      });
      if (orgName) organizations.add(orgName);
      if (validation?.organizationName) organizations.add(validation.organizationName);
      (validation?.errors   || []).forEach(e => allErrors.push(`${filename}: ${e.message || e}`));
      (validation?.warnings || []).forEach(w => allWarnings.push(`${filename}: ${w.message || w}`));
    });

    // 4. Controlla duplicati
    const duplicates = await checkDuplicates(filesData, token);
    const orgList    = Array.from(organizations);

    res.json({
      title:        generateTitle(files.length, orgList),
      body:         generateBody(filesData, orgList, { errors: allErrors, warnings: allWarnings, duplicates }),
      fileCount:    files.length,
      organizations: orgList,
      validation:   { errors: allErrors, warnings: allWarnings, duplicates }
    });
    } catch (e) {
      console.error('Errore preview PR:', e.message, e.stack, JSON.stringify(e));
      res.status(500).json({ error: e.message || JSON.stringify(e) });
    }
});

// ── POST /create ──────────────────────────────────────────
// Body: { files: string[], draft?: boolean }
app.post('/create', async (req, res) => {
  try {
    const { files, draft = false } = req.body;
    if (!Array.isArray(files) || !files.length)
      return res.status(400).json({ error: 'files obbligatorio e non vuoto' });
    const token = req.headers.authorization?.split(' ')[1]; // ← aggiunta

    console.log(`🚀 Avvio creazione PR — ${files.length} file`);

    // 1. Valida accesso GitHub
    const accessRes = await axios.get(`${GITHUB_SVC}/validate`);
    if (!accessRes.data.valid)
      return res.status(400).json({ error: `Accesso GitHub non valido: ${accessRes.data.error}` });

    // 2. Leggi contenuti
    const contents   = await getFileContents(files, token);
    const validFiles = contents.filter(f => f.success);
    if (!validFiles.length)
      return res.status(400).json({ error: 'Nessun file leggibile' });

    // 3. Valida
    const validations = await validateFiles(validFiles, token);
    const filesData   = [];
    const allErrors   = [];
    const allWarnings = [];
    const organizations = new Set();

    validations.forEach(v => {
      const { filename, validation } = v;
      const content = validFiles.find(f => f.filename === filename)?.content;
      filesData.push({
        filename,
        content,
        entityID:         validation?.entityID         || null,
        organizationName: validation?.organizationName || null
      });
      if (validation?.organizationName) organizations.add(validation.organizationName);
      (validation?.errors   || []).forEach(e => allErrors.push(`${filename}: ${e.message || e}`));
      (validation?.warnings || []).forEach(w => allWarnings.push(`${filename}: ${w.message || w}`));
    });

    if (STRICT_MODE && allErrors.length > 0)
      return res.status(400).json({ error: 'Validazione fallita (strict mode)', errors: allErrors });

    // 4. Duplicati
    const duplicates = await checkDuplicates(filesData, token);
    const orgList    = Array.from(organizations);

    // 5. Crea branch
    const branchInfoRes = await axios.get(`${GITHUB_SVC}/branch-info?branch=${BASE_BRANCH}`);
    const { sha: baseSha } = branchInfoRes.data;
    if (!baseSha) return res.status(400).json({ error: `Branch base '${BASE_BRANCH}' non trovato` });

    const branchName  = generateBranchName();
    const branchRes   = await axios.post(`${GITHUB_SVC}/branch`, { branchName, baseSha });
    if (!branchRes.data.success)
      return res.status(500).json({ error: 'Impossibile creare branch' });

    console.log(`🌿 Branch creato: ${branchName}`);
    await new Promise(r => setTimeout(r, 2500));
    // 6. Upload file
// DOPO (corretto — passa la stringa grezza, ci pensa GitHubService)
    
    // 6. Upload file
    console.log(`📦 Preparazione ${filesData.length} file da uploadare...`);
    const filesToUpload = filesData.map(f => ({
      filename: f.filename,
      path:     `metadata/${f.filename}`,
      content:  Buffer.isBuffer(f.content)
              ? f.content.toString('utf8')
              : f.content,
      message:  `Add ${f.organizationName || f.filename}`
    }));

      console.log(`🔼 Chiamo github-service /upload con ${filesToUpload.length} file...`);
      let uploadRes;
      try {
        uploadRes = await axios.post(`${GITHUB_SVC}/upload`, {
          branch: branchName,
          files:  filesToUpload
        }, { timeout: 120000 });
      } catch (uploadErr) {
        console.error('❌ Errore upload dettaglio:', uploadErr.response?.data || uploadErr.message);
        throw uploadErr;
      }
      const { results: uploaded, errors: uploadErrors } = uploadRes.data;
    // 7. Crea PR
    const prTitle = generateTitle(files.length, orgList);
    const prBody  = generateBody(filesData, orgList, { errors: allErrors, warnings: allWarnings, duplicates });

    console.log('[DEBUG /create] Chiamo github-service /pr con branch:', branchName, 'base:', BASE_BRANCH);

    // PR — aggiungi timeout nel try
    let prRes;
    try {
      prRes = await axios.post(`${GITHUB_SVC}/pr`, {
        branch: branchName,
        base:   BASE_BRANCH,
        title:  prTitle,
        body:   prBody,
        draft
      }, { timeout: 30000 });  // ← aggiungi
    } catch (prErr) {
      console.error('[DEBUG /pr] Errore:', prErr.response?.data || prErr.message);
      throw prErr;
    }

    console.log(`✅ PR creata: ${prRes.data.url}`);

    res.json({
      success:       true,
      url:           prRes.data.url,
      number:        prRes.data.number,
      branch:        branchName,
      filesUploaded: uploaded.length,
      uploadErrors
    });

//  } catch (e) {
//    console.error('❌ Errore creazione PR:', e.message);
//    res.status(500).json({ success: false, error: e.message });
//  }
    } catch (e) {
      console.error('❌ Errore creazione PR:', e.message, e.stack, JSON.stringify(e));
      res.status(500).json({ error: e.message || JSON.stringify(e) });
    }

});
// ── GET /status/:number ───────────────────────────────────
app.get('/status/:number', async (req, res) => {
  try {
    const { data } = await axios.get(`${GITHUB_SVC}/pr/${req.params.number}`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use((err, _, res, __) => res.status(500).json({ error: err.message }));

app.listen(PORT, () =>
  console.log(`🔀 pr-service → http://localhost:${PORT}`)
);
