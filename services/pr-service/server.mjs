import express from 'express';
import cors    from 'cors';

const PORT = process.env.PR_SERVICE_PORT || 4004;
const app  = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_, res) =>
  res.json({ service: 'pr-service', status: 'ok', port: PORT })
);

// TODO: implementare le route Pull Request

app.listen(PORT, () =>
  console.log(`🔀 pr-service → http://localhost:${PORT}`)
);
