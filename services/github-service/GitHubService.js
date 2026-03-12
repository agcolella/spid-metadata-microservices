// services/github-service/GitHubService.js
import { Octokit } from '@octokit/rest';

export class GitHubService {
  constructor() {
    const token = process.env.GITHUB_TOKEN;
    const repo  = process.env.GITHUB_REPO;

    if (!token) throw new Error('GITHUB_TOKEN mancante');
    if (!repo || !repo.includes('/')) throw new Error('GITHUB_REPO non valido (formato: owner/repo)');

    this.octokit    = new Octokit({ auth: token });
    this.repo       = repo;
    this.baseBranch = process.env.BASE_BRANCH    || 'main';
    this.branchPrefix = process.env.BRANCH_PREFIX || 'spid-batch-';
    this.concurrency  = parseInt(process.env.UPLOAD_CONCURRENCY || '5');
    this.labels     = (process.env.PR_LABELS    || '').split(',').filter(Boolean);
    this.reviewers  = (process.env.PR_REVIEWERS || '').split(',').filter(Boolean);
  }

  _ownerRepo() {
    const [owner, repo] = this.repo.split('/');
    return { owner, repo };
  }

  // ── Accesso ──────────────────────────────────────────────
  async validateAccess() {
    try {
      await this.octokit.rest.repos.get(this._ownerRepo());
      return { valid: true, repo: this.repo };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        type:  error.status === 401 ? 'authentication'
             : error.status === 404 ? 'repository'
             : 'unknown'
      };
    }
  }

  // ── Branch ───────────────────────────────────────────────
  async branchExists(branchName) {
    try {
      await this.octokit.rest.git.getRef({
        ...this._ownerRepo(),
        ref: `heads/${branchName}`
      });
      return true;
    } catch (error) {
      if (error.status === 404) return false;
      throw error;
    }
  }

  async getBaseBranchSha(branchName) {
    try {
      const { data } = await this.octokit.rest.git.getRef({
        ...this._ownerRepo(),
        ref: `heads/${branchName}`
      });
      return data.object.sha;
    } catch (error) {
      if (error.status === 404)
        throw new Error(`Branch base '${branchName}' non trovato`);
      throw error;
    }
  }

  async createBranchWithRetry(branchName, baseSha, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const exists = await this.branchExists(branchName);
        if (exists) {
          const e = new Error(`Branch ${branchName} già esistente`);
          e.code = 'BRANCH_EXISTS';
          throw e;
        }

        if (!baseSha || baseSha.length !== 40)
          throw new Error(`SHA non valido: ${baseSha}`);

        const result = await this.octokit.rest.git.createRef({
          ...this._ownerRepo(),
          ref: `refs/heads/${branchName}`,
          sha: baseSha
        });

        return { success: true, branch: branchName, ref: result.data.ref };

      } catch (error) {
        if (error.code === 'BRANCH_EXISTS' || error.message.includes('SHA')) throw error;
        if (attempt === maxRetries)
          throw new Error(`Impossibile creare branch dopo ${maxRetries} tentativi: ${error.message}`);

        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  generateBranchName() {
    const random = Math.random().toString(36).substring(2, 8);
    return `${this.branchPrefix}${Date.now()}-${random}`;
  }

  async getBranchInfo(branchName) {
    const exists = await this.branchExists(branchName);
    const sha    = exists ? await this.getBaseBranchSha(branchName) : null;
    return { branch: branchName, exists, sha, repo: this.repo };
  }

  // ── File upload ──────────────────────────────────────────
  async uploadFileToBranch({ branch, filePath, content, message }) {
    try {
      let sha;
      try {
        const { data } = await this.octokit.rest.repos.getContent({
          ...this._ownerRepo(),
          path: filePath,
          ref: branch
        });
        sha = data.sha;
      } catch (e) {
        if (e.status !== 404) throw e;
      }

      const result = await this.octokit.rest.repos.createOrUpdateFileContents({
        ...this._ownerRepo(),
        path:    filePath,
        message,
        content: Buffer.from(content).toString('base64'),
        branch,
        sha
      });

      return { success: true, path: filePath, sha: result.data.content.sha };
    } catch (error) {
      throw new Error(`Errore upload ${filePath}: ${error.message}`);
    }
  }

  async uploadFilesInBatches({ branch, files, concurrency, onProgress }) {
    const c       = concurrency || this.concurrency;
    const results = [];
    const errors  = [];

    for (let i = 0; i < files.length; i += c) {
      const batch = files.slice(i, i + c);

      await Promise.all(batch.map(async file => {
        try {
          const result = await this.uploadFileToBranch({
            branch,
            filePath: file.path,
            content:  file.content,
            message:  file.message || `Add ${file.filename}`
          });
          results.push(result);
          if (onProgress) onProgress(results.length, files.length);
        } catch (error) {
          errors.push({ filename: file.filename, error: error.message });
        }
      }));

      if (i + c < files.length)
        await new Promise(r => setTimeout(r, 1000));
    }

    return { results, errors };
  }

  // ── Pull Request ─────────────────────────────────────────
  async createPullRequest({ branch, base, title, body, draft = false, labels, reviewers }) {
    const _labels    = labels    ?? this.labels;
    const _reviewers = reviewers ?? this.reviewers;

    const prData = await this.octokit.rest.pulls.create({
      ...this._ownerRepo(),
      title,
      head:  branch,
      base:  base || this.baseBranch,
      body,
      draft
    });

    const prNumber = prData.data.number;
    const prUrl    = prData.data.html_url;

    if (_labels.length > 0) {
      try {
        await this.octokit.rest.issues.addLabels({
          ...this._ownerRepo(),
          issue_number: prNumber,
          labels: _labels
        });
      } catch (e) {
        console.warn(`⚠️  Label non aggiunte: ${e.message}`);
      }
    }

    if (_reviewers.length > 0) {
      try {
        await this.octokit.rest.pulls.requestReviewers({
          ...this._ownerRepo(),
          pull_number: prNumber,
          reviewers: _reviewers
        });
      } catch (e) {
        console.warn(`⚠️  Reviewer non aggiunti: ${e.message}`);
      }
    }

    return { success: true, url: prUrl, number: prNumber, branch };
  }

  async getPRStatus(prNumber) {
    const { data } = await this.octokit.rest.pulls.get({
      ...this._ownerRepo(),
      pull_number: prNumber
    });
    return {
      number: data.number,
      state:  data.state,
      merged: data.merged,
      draft:  data.draft,
      url:    data.html_url,
      title:  data.title
    };
  }

  async listCollaborators() {
    const { data } = await this.octokit.rest.repos.listCollaborators(this._ownerRepo());
    return data.map(c => ({ username: c.login, permissions: c.permissions }));
  }
}
