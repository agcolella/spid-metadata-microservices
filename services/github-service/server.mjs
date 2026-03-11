import express from 'express';
import cors    from 'cors';

const PORT = process.env.GITHUB_SERVICE_PORT || 4003;
const app  = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_, res) =>
  res.json({ service: 'github-service', status: 'ok', port: PORT })
);

// TODO: implementare le route GitHub API

app.listen(PORT, () =>
  console.log(`🐙 github-service → http://localhost:${PORT}`)
);
