// services/github-service/server.mjs
import express from 'express';
import cors    from 'cors';
import { GitHubService } from './GitHubService.js';

const PORT = process.env.GITHUB_SERVICE_PORT || 4003;
const app  = express();
app.use(cors());
app.use(express.json());

function getService(res) {
  try   { return new GitHubService(); }
  catch (e) { res.status(500).json({ error: e.message }); return null; }
}

// ── Health ────────────────────────────────────────────────
app.get('/health', (_, res) =>
  res.json({ service: 'github-service', status: 'ok', port: PORT })
);

// ── GET /validate — valida accesso al repo
app.get('/validate', async (req, res) => {
  const svc = getService(res);
  if (!svc) return;
  try   { res.json(await svc.validateAccess()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /branch-info?branch=main
app.get('/branch-info', async (req, res) => {
  const svc = getService(res);
  if (!svc) return;
  try {
    const branch = req.query.branch || process.env.BASE_BRANCH || 'main';
    res.json(await svc.getBranchInfo(branch));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /branch — crea branch
// Body: { branchName?, baseSha? }
app.post('/branch', async (req, res) => {
  const svc = getService(res);
  if (!svc) return;
  try {
    const baseBranch = process.env.BASE_BRANCH || 'main';
    const baseSha    = req.body.baseSha || await svc.getBaseBranchSha(baseBranch);
    const branchName = req.body.branchName  || svc.generateBranchName();
    res.json(await svc.createBranchWithRetry(branchName, baseSha));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /upload — carica file su branch
// Body: { branch, files: [{filename, path, content, message?}] }
app.post('/upload', async (req, res) => {
  const svc = getService(res);
  if (!svc) return;
  try {
    const { branch, files, concurrency } = req.body;
    if (!branch) return res.status(400).json({ error: 'branch obbligatorio' });
    if (!Array.isArray(files) || !files.length)
      return res.status(400).json({ error: 'files deve essere un array non vuoto' });

    const result = await svc.uploadFilesInBatches({ branch, files, concurrency });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /pr — crea Pull Request
// Body: { branch, base?, title, body, draft?, labels?, reviewers? }
app.post('/pr', async (req, res) => {
  const svc = getService(res);
  if (!svc) return;
  try   { res.json(await svc.createPullRequest(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /pr/:number — stato PR
app.get('/pr/:number', async (req, res) => {
  const svc = getService(res);
  if (!svc) return;
  try   { res.json(await svc.getPRStatus(parseInt(req.params.number))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /collaborators (debug)
app.get('/collaborators', async (req, res) => {
  const svc = getService(res);
  if (!svc) return;
  try {
    const collaborators = await svc.listCollaborators();
    res.json({ repo: process.env.GITHUB_REPO, collaborators });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use((err, _, res, __) => res.status(500).json({ error: err.message }));

app.listen(PORT, () =>
  console.log(`🐙 github-service → http://localhost:${PORT}`)
);
