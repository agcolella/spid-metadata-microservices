import express from 'express';
import cors    from 'cors';
import { SpidMetadataValidator } from './SpidMetadataValidator.js';

const PORT = process.env.VALIDATION_SERVICE_PORT || 4002;
const PRODUCTION = process.env.PRODUCTION === 'true';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_, res) =>
  res.json({ service: 'validation-service', status: 'ok', port: PORT, production: PRODUCTION })
);

app.post('/validate', (req, res) => {
  try {
    const { content, filename = 'unknown.xml', profile = 'spid_sp_public' } = req.body;
    if (!content) return res.status(400).json({ error: 'content mancante' });

    const validator = new SpidMetadataValidator({ production: PRODUCTION });
    const result    = validator.validate(content, profile);
    res.json({ filename, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/validate-batch', (req, res) => {
  try {
    const { files } = req.body;
    if (!Array.isArray(files)) return res.status(400).json({ error: 'files deve essere un array' });

    const results = files.map(({ filename, content, profile = 'spid_sp_public' }) => {
      try {
        const validator = new SpidMetadataValidator({ production: PRODUCTION });
        const validation = validator.validate(content, profile);
        return { filename, validation, success: true };
      } catch (e) {
        return { filename, error: e.message, success: false };
      }
    });

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/check-duplicates', (req, res) => {
  try {
    const { filesData } = req.body;
    if (!Array.isArray(filesData)) return res.status(400).json({ error: 'filesData deve essere un array' });

    const validator  = new SpidMetadataValidator();
    const duplicates = validator.checkDuplicates(filesData);
    res.json({ duplicates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/profiles', (_, res) => {
  res.json({
    profiles: [
      'saml2core', 'spid_sp', 'spid_sp_public', 'spid_sp_private',
      'ag_public_full', 'ag_public_lite', 'ag_private_full', 'ag_private_lite',
      'op_public_full', 'op_public_lite'
    ]
  });
});

app.use((err, _, res, __) => res.status(500).json({ error: err.message }));

app.listen(PORT, () =>
  console.log(`🔍 validation-service → http://localhost:${PORT}  [production=${PRODUCTION}]`)
);
