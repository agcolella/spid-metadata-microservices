import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadConfig() {
  const configPath = path.join(__dirname, '..', 'repo-config.json');
  let fileConfig = {};

  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      console.warn('⚠️  Errore lettura repo-config.json:', e.message);
    }
  }

  const config = {
    repo:              process.env.GITHUB_REPO        || fileConfig.repo,
    githubToken:       process.env.GITHUB_TOKEN       || fileConfig.githubToken,
    baseBranch:        process.env.BASE_BRANCH        || fileConfig.baseBranch    || 'main',
    branchPrefix:      process.env.BRANCH_PREFIX      || fileConfig.branchPrefix  || 'spid-batch-',
    prTemplate: {
      title: fileConfig.prTemplate?.title || 'SPID: Aggiunta {count} metadata - {date}',
      body:  fileConfig.prTemplate?.body  || null
    },
    validation: {
      enabled:    process.env.VALIDATION_ENABLED      !== 'false',
      strictMode: process.env.VALIDATION_STRICT_MODE  === 'true' || fileConfig.validation?.strictMode === true
    },
    labels:            fileConfig.labels              || [],
    reviewers:         fileConfig.reviewers           || [],
    maxFilesPerPR:     parseInt(process.env.MAX_FILES_PER_PR    || fileConfig.maxFilesPerPR    || 50),
    uploadConcurrency: parseInt(process.env.UPLOAD_CONCURRENCY  || fileConfig.uploadConcurrency || 5),
  };

  if (!config.repo)        throw new Error('GITHUB_REPO mancante');
  if (!config.githubToken) throw new Error('GITHUB_TOKEN mancante');
  if (!config.repo.includes('/')) throw new Error('Formato repo non valido (owner/repo)');

  return config;
}

export default loadConfig();
