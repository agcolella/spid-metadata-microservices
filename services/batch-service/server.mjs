// services/batch-service/server.mjs
import express from 'express';
import cors    from 'cors';
import multer  from 'multer';
import axios   from 'axios';
import path    from 'path';
import fs      from 'fs';
import { fileURLToPath } from 'url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PORT         = process.env.BATCH_SERVICE_PORT       || 4005;
const FILE_SVC     = process.env.FILE_SERVICE_URL         || 'http://localhost:4001';
const VALID_SVC    = process.env.VALIDATION_SERVICE_URL   || 'http://localhost:4002';
const PR_SVC       = process.env.PR_SERVICE_URL           || 'http://localhost:4004';
const UPLOAD_DIR   = path.join(__dirname, 'batch-uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app    = express();
const upload = multer({
  dest: UPLOAD_DIR,
  fileFilter: (_, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.xml')
      return cb(new Error('Solo file .xml'));
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 200 }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── Health ────────────────────────────────────────────────
app.get('/health', (_, res) =>
  res.json({ service: 'batch-service', status: 'ok', port: PORT })
);

// ── POST /upload-and-validate ─────────────────────────────
// Riceve file multipli, li carica su file-service e li valida
// Form-data: xmlFiles[] (più file)
app.post('/upload-and-validate', upload.array('xmlFiles'), async (req, res) => {
  const tempFiles = req.files || [];
  try {
    if (!tempFiles.length)
      return res.status(400).json({ error: 'Nessun file caricato' });

    const results = [];

    for (const file of tempFiles) {
      const content = fs.readFileSync(file.path, 'utf-8');

      // Carica su file-service tramite axios multipart
      const FormData = (await import('form-data')).default;
      const form     = new FormData();
      form.append('xmlFile', fs.createReadStream(file.path), file.originalname);

      let uploadResult;
      try {
        const { data } = await axios.post(`${FILE_SVC}/upload`, form, {
          headers: form.getHeaders()
        });
        uploadResult = data;
      } catch (e) {
        uploadResult = { success: false, error: e.response?.data?.error || e.message };
      }

      // Valida
      let validationResult;
      try {
        const { data } = await axios.post(`${VALID_SVC}/validate`, {
          content,
          filename: file.originalname
        });
        validationResult = data;
      } catch (e) {
        validationResult = { valid: false, errors: [{ message: e.message }] };
      }

      results.push({
        filename:         file.originalname,
        savedAs:          uploadResult.filename || null,
        uploadSuccess:    uploadResult.success  || false,
        uploadError:      uploadResult.error    || null,
        valid:            validationResult.valid,
        entityID:         validationResult.entityID         || null,
        organizationName: validationResult.organizationName || null,
        errors:           validationResult.errors           || [],
        warnings:         validationResult.warnings         || []
      });

      // Rimuovi file temporaneo
      fs.unlinkSync(file.path);
    }

    const uploaded = results.filter(r => r.uploadSuccess);
    const invalid  = results.filter(r => !r.valid);

    res.json({
      total:     results.length,
      uploaded:  uploaded.length,
      invalid:   invalid.length,
      results
    });

  } catch (e) {
    // Pulizia file temporanei in caso di errore
    tempFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    res.status(500).json({ error: e.message });
  }
});

// ── POST /validate-saved ──────────────────────────────────
// Valida file già presenti in file-service
// Body: { filenames: string[] }
app.post('/validate-saved', async (req, res) => {
  try {
    const { filenames } = req.body;
    if (!Array.isArray(filenames) || !filenames.length)
      return res.status(400).json({ error: 'filenames obbligatorio' });

    // Leggi contenuti da file-service
    const { data: contents } = await axios.post(`${FILE_SVC}/get-xml-contents`, { filenames });

    // Valida batch
    const validFiles = contents.filter(f => f.success);
    const { data: validations } = await axios.post(`${VALID_SVC}/validate-batch`, {
      files: validFiles.map(f => ({ filename: f.filename, content: f.content }))
    });

    // Controlla duplicati
    const forDupCheck = validations
      .filter(v => v.validation?.entityID)
      .map(v => ({ filename: v.filename, entityID: v.validation.entityID }));

    const { data: dupData } = await axios.post(`${VALID_SVC}/check-duplicates`, {
      filesData: forDupCheck
    });

    res.json({
      total:      filenames.length,
      validated:  validations.length,
      duplicates: dupData.duplicates || [],
      results:    validations.map(v => ({
        filename:         v.filename,
        valid:            v.validation?.valid            ?? false,
        entityID:         v.validation?.entityID         || null,
        organizationName: v.validation?.organizationName || null,
        errors:           v.validation?.errors           || [],
        warnings:         v.validation?.warnings         || []
      }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /create-pr ───────────────────────────────────────
// Upload + valida + crea PR in un unico endpoint
// Form-data: xmlFiles[] + draft? (string 'true'/'false')
app.post('/create-pr', upload.array('xmlFiles'), async (req, res) => {
  const tempFiles = req.files || [];
  try {
    if (!tempFiles.length)
      return res.status(400).json({ error: 'Nessun file caricato' });

    const draft = req.body.draft === 'true';

    // 1. Carica tutti i file su file-service
    const uploadedFilenames = [];
    const uploadErrors      = [];

    for (const file of tempFiles) {
      try {
        const FormData = (await import('form-data')).default;
        const form     = new FormData();
        form.append('xmlFile', fs.createReadStream(file.path), file.originalname);

        const { data } = await axios.post(`${FILE_SVC}/upload`, form, {
          headers: form.getHeaders()
        });

        if (data.success) uploadedFilenames.push(data.filename);
        else uploadErrors.push({ filename: file.originalname, error: data.error });
      } catch (e) {
        uploadErrors.push({ filename: file.originalname, error: e.message });
      } finally {
        try { fs.unlinkSync(file.path); } catch {}
      }
    }

    if (!uploadedFilenames.length)
      return res.status(400).json({ error: 'Nessun file caricato con successo', uploadErrors });

    console.log(`✅ ${uploadedFilenames.length} file caricati, avvio creazione PR...`);

    // 2. Delega a pr-service
    const { data: prResult } = await axios.post(`${PR_SVC}/create`, {
      files: uploadedFilenames,
      draft
    });

    res.json({ ...prResult, uploadErrors });

  } catch (e) {
    tempFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    console.error('❌ Errore batch/create-pr:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /preview-pr ──────────────────────────────────────
// Anteprima PR senza crearla
// Body: { filenames: string[] }
app.post('/preview-pr', async (req, res) => {
  try {
    const { filenames } = req.body;
    if (!Array.isArray(filenames) || !filenames.length)
      return res.status(400).json({ error: 'filenames obbligatorio' });

    const { data } = await axios.post(`${PR_SVC}/preview`, { files: filenames });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use((err, _, res, __) => {
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ error: 'File troppo grande (max 5MB)' });
  if (err.code === 'LIMIT_FILE_COUNT')
    return res.status(400).json({ error: 'Troppi file (max 200)' });
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () =>
  console.log(`📦 batch-service → http://localhost:${PORT}`)
);
