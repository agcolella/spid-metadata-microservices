import express from 'express';
import cors    from 'cors';
import multer  from 'multer';

const PORT    = process.env.BATCH_SERVICE_PORT || 4005;
const app     = express();
const upload  = multer({ dest: 'batch-uploads/' });
app.use(cors());
app.use(express.json());

app.get('/health', (_, res) =>
  res.json({ service: 'batch-service', status: 'ok', port: PORT })
);

// TODO: implementare le route Batch processing

app.listen(PORT, () =>
  console.log(`📦 batch-service → http://localhost:${PORT}`)
);
