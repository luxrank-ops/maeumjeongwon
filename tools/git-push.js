'use strict';

/**
 * Commit local changes and push them to a configured GitHub branch.
 *
 * The PAT is loaded from the process environment or an ignored .env.local/.env file.
 * It is never added to the remote URL or written to Git config. Git receives a
 * temporary Authorization header through its child-process environment only.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPO = 'luxrank-ops/maeumjeongwon';
const DEFAULT_BRANCH = 'main';
const DEFAULT_MESSAGE = 'chore: update project files';
const MAX_GIT_OUTPUT = 64 * 1024 * 1024;
const GITHUB_PAT_RE = /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/;

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const values = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    let value = match[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values[match[1]] = value;
  }
  return values;
}

function loadEnv(root = ROOT, processEnv = process.env) {
  // .env.local intentionally wins over .env; non-empty process variables win over both.
  const env = Object.assign(
    {},
    parseEnvFile(path.join(root, '.env')),
    parseEnvFile(path.join(root, '.env.local'))
  );
  for (const [key, value] of Object.entries(processEnv)) {
    if (value != null && String(value) !== '') env[key] = value;
  }
  return env;
}

function validateRepository(repository) {
  const value = String(repository || '').trim();
  const parts = value.split('/');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) || parts.some(part => part === '.' || part === '..')) {
    throw new Error('GITHUB_REPO must be in owner/repository form, for example luxrank-ops/maeumjeongwon.');
  }
  return value;
}

function sanitizeGitEnvironment(source = process.env) {
  const env = Object.assign({}, source);
  for (const key of Object.keys(env)) {
    if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(key) || key === 'GIT_CONFIG_PARAMETERS') {
      delete env[key];
    }
  }
  // These can redirect Git away from the repository passed with -C.
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_COMMON_DIR;
  // Git itself does not need the raw token. The encoded header below is scoped to github.com.
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  delete env.GITHUB_ENTERPRISE_TOKEN;
  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}

function gitEnvironmentWithAuth(token, source = process.env) {
  const secret = String(token || '').trim();
  if (!secret || /[\0\r\n]/.test(secret)) {
    throw new Error('GITHUB_TOKEN must be set and must not contain line breaks.');
  }

  const env = sanitizeGitEnvironment(source);
  const basic = Buffer.from(`x-access-token:${secret}`, 'utf8').toString('base64');
  env.GIT_CONFIG_COUNT = '3';
  // Reset any stale extra headers from system/global/repository config before adding this token.
  env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
  env.GIT_CONFIG_VALUE_0 = '';
  env.GIT_CONFIG_KEY_1 = 'http.https://github.com/.extraheader';
  env.GIT_CONFIG_VALUE_1 = `AUTHORIZATION: basic ${basic}`;
  // Do not allow a globally configured credential helper to persist credentials.
  env.GIT_CONFIG_KEY_2 = 'credential.helper';
  env.GIT_CONFIG_VALUE_2 = '';
  return env;
}

function redactSecrets(text, token) {
  let result = String(text || '');
  const secret = String(token || '').trim();
  const candidates = [secret];
  if (secret) candidates.push(Buffer.from(`x-access-token:${secret}`, 'utf8').toString('base64'));
  for (const candidate of candidates) {
    if (candidate) result = result.split(candidate).join('[REDACTED]');
  }
  return result;
}

function runGit(root, args, options = {}) {
  const { token = '', allowFailure = false, committer = false, env = process.env } = options;
  const childEnv = token ? gitEnvironmentWithAuth(token, env) : sanitizeGitEnvironment(env);
  if (committer) {
    // Rebasing creates new commits too; provide an identity only to this Git process.
    childEnv.GIT_COMMITTER_NAME = 'luxrank-ops';
    childEnv.GIT_COMMITTER_EMAIL = '248242560+luxrank-ops@users.noreply.github.com';
  }
  const result = spawnSync('git', ['-C', root, ...args], {
    cwd: root,
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: MAX_GIT_OUTPUT,
    windowsHide: true
  });

  if (result.error) {
    const error = new Error(`Unable to run Git: ${redactSecrets(result.error.message, token)}`);
    error.cause = result.error;
    throw error;
  }

  const response = {
    status: result.status == null ? 1 : result.status,
    stdout: redactSecrets(result.stdout, token),
    stderr: redactSecrets(result.stderr, token)
  };
  if (response.status !== 0 && !allowFailure) {
    const detail = [response.stderr, response.stdout].filter(Boolean).join('\n').trim();
    const error = new Error(`Git command failed (${args[0] || 'git'}):${detail ? `\n${detail}` : ''}`);
    error.exitCode = response.status;
    throw error;
  }
  return response;
}

function validateBranch(root, branch) {
  const value = String(branch || '').trim();
  if (!value || value.length > 240 || value.startsWith('-')) {
    throw new Error('GITHUB_BRANCH must be a valid Git branch name.');
  }
  const result = runGit(root, ['check-ref-format', '--branch', value], { allowFailure: true });
  if (result.status !== 0) throw new Error('GITHUB_BRANCH must be a valid Git branch name.');
  return value;
}

function isSensitiveEnvPath(relativePath) {
  const basename = path.posix.basename(String(relativePath).replace(/\\/g, '/'));
  return basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example');
}

function assertNoTrackedEnvFiles(root) {
  const tracked = runGit(root, ['ls-files', '-z']).stdout.split('\0').filter(Boolean);
  const sensitive = tracked.filter(isSensitiveEnvPath);
  if (sensitive.length) {
    throw new Error(
      `Local environment file(s) are tracked by Git (${sensitive.join(', ')}). Remove them from the index before pushing; rotate any credential that was already committed.`
    );
  }
}

function assertLocalEnvFilesIgnored(root) {
  for (const relativePath of ['.env', '.env.local']) {
    if (!fs.existsSync(path.join(root, relativePath))) continue;
    const result = runGit(root, ['check-ignore', '--quiet', '--', relativePath], { allowFailure: true });
    if (result.status !== 0) {
      throw new Error(`${relativePath} exists but is not ignored by Git. Add it to .gitignore before pushing credentials.`);
    }
  }
}

function assertNoStagedPat(root, token) {
  const staged = runGit(root, ['diff', '--cached', '--no-ext-diff', '--unified=0']).stdout;
  if (GITHUB_PAT_RE.test(staged) || (token && staged.includes(String(token).trim()))) {
    throw new Error('A GitHub token-like value was detected in staged changes. Nothing was pushed; remove it and revoke it if it was exposed.');
  }
}

function ensureRepository(root, branch, logger) {
  if (!fs.existsSync(path.join(root, '.git'))) {
    logger.log('🔄 .git metadata is missing; initializing a local repository.');
    runGit(root, ['init']);
    runGit(root, ['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
    return;
  }

  const probe = runGit(root, ['rev-parse', '--show-toplevel'], { allowFailure: true });
  if (probe.status !== 0) {
    throw new Error('A .git entry exists but is not a valid Git repository; refusing to overwrite it.');
  }
  const actualRoot = fs.realpathSync(probe.stdout.trim());
  const expectedRoot = fs.realpathSync(root);
  if (actualRoot !== expectedRoot) {
    throw new Error('The project directory is inside a different Git worktree; refusing to push the parent repository.');
  }
}

function pushChanges({
  root = ROOT,
  repository = DEFAULT_REPO,
  token,
  branch = DEFAULT_BRANCH,
  message = DEFAULT_MESSAGE,
  remoteUrl,
  logger = console,
  env = process.env
} = {}) {
  const absoluteRoot = path.resolve(root);
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
    throw new Error(`Project directory does not exist: ${absoluteRoot}`);
  }

  const repo = validateRepository(repository);
  const targetBranch = validateBranch(absoluteRoot, branch);
  const secret = String(token || '').trim();
  if (!secret || /[\0\r\n]/.test(secret)) {
    throw new Error('GITHUB_TOKEN is missing. Put it in the ignored .env.local file or set it as an environment variable.');
  }

  const commitMessage = String(message || DEFAULT_MESSAGE).trim() || DEFAULT_MESSAGE;
  if (GITHUB_PAT_RE.test(commitMessage) || commitMessage.includes(secret)) {
    throw new Error('The commit message appears to contain a GitHub token; refusing to create the commit.');
  }

  const cleanUrl = remoteUrl || `https://github.com/${repo}.git`;
  if (typeof cleanUrl !== 'string' || /[\0\r\n]/.test(cleanUrl)) {
    throw new Error('The Git remote URL is invalid.');
  }

  ensureRepository(absoluteRoot, targetBranch, logger);

  const existingRemote = runGit(absoluteRoot, ['remote', 'get-url', 'origin'], { allowFailure: true });
  if (existingRemote.status === 0) {
    // Strip any previously saved credentials or stale URL before network access.
    runGit(absoluteRoot, ['remote', 'set-url', 'origin', cleanUrl]);
  } else {
    runGit(absoluteRoot, ['remote', 'add', 'origin', cleanUrl]);
  }

  assertNoTrackedEnvFiles(absoluteRoot);
  assertLocalEnvFilesIgnored(absoluteRoot);

  const remoteRef = `refs/heads/${targetBranch}`;
  const trackingRef = `refs/remotes/origin/${targetBranch}`;
  logger.log(`⬇️ Fetching ${repo} (${targetBranch}) with temporary GitHub authorization...`);
  const remoteHeads = runGit(absoluteRoot, ['ls-remote', '--heads', 'origin', remoteRef], { token: secret, env });
  const hasRemoteBranch = remoteHeads.stdout.trim().length > 0;

  if (hasRemoteBranch) {
    runGit(absoluteRoot, ['fetch', '--no-tags', 'origin', `+${remoteRef}:${trackingRef}`], { token: secret, env });
  }

  const head = runGit(absoluteRoot, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true });
  const hasHead = head.status === 0;
  if (!hasHead) {
    runGit(absoluteRoot, ['symbolic-ref', 'HEAD', `refs/heads/${targetBranch}`]);
    if (hasRemoteBranch) {
      // Populate the index from the fetched tree without overwriting files in the worktree.
      runGit(absoluteRoot, ['reset', '--mixed', trackingRef]);
    }
  }

  runGit(absoluteRoot, ['add', '-A']);
  const stagedPaths = runGit(absoluteRoot, ['diff', '--cached', '--name-only', '-z']).stdout.split('\0').filter(Boolean);
  const stagedEnv = stagedPaths.filter(isSensitiveEnvPath);
  if (stagedEnv.length) {
    throw new Error(`Sensitive environment file(s) would be committed (${stagedEnv.join(', ')}); update .gitignore and retry.`);
  }
  assertNoStagedPat(absoluteRoot, secret);

  const status = runGit(absoluteRoot, ['status', '--porcelain=v1', '--untracked-files=all']).stdout.trim();
  let committed = false;
  if (status) {
    runGit(absoluteRoot, [
      '-c', 'user.name=luxrank-ops',
      '-c', 'user.email=248242560+luxrank-ops@users.noreply.github.com',
      'commit', '-m', commitMessage
    ], { committer: true });
    committed = true;
    logger.log('✅ Local changes committed.');
  } else {
    logger.log('ℹ️ No new changes to commit; checking the branch state before pushing.');
  }

  if (hasRemoteBranch) {
    logger.log(`🔀 Rebasing local commits onto origin/${targetBranch}...`);
    try {
      runGit(absoluteRoot, ['rebase', trackingRef], { committer: true });
    } catch (error) {
      // Avoid leaving the user's worktree in an in-progress rebase after a failed attempt.
      runGit(absoluteRoot, ['rebase', '--abort'], { allowFailure: true });
      throw new Error(`Rebase failed; no push was attempted. Resolve the conflict and retry. ${error.message}`);
    }
  }

  logger.log(`⬆️ Pushing to ${repo} (${targetBranch})...`);
  const pushed = runGit(absoluteRoot, ['push', 'origin', `HEAD:${remoteRef}`], { token: secret, env });
  if (pushed.stdout.trim()) logger.log(pushed.stdout.trim());
  if (pushed.stderr.trim()) logger.log(pushed.stderr.trim());
  logger.log(`🚀 GitHub push complete: ${repo} -> ${targetBranch}`);
  return { repository: repo, branch: targetBranch, committed };
}

function main() {
  const env = loadEnv();
  const token = String(env.GITHUB_TOKEN || '').trim();
  if (!token) {
    console.error('❌ GITHUB_TOKEN is not configured. Add it to the ignored .env.local file or set it as an environment variable.');
    process.exitCode = 1;
    return;
  }

  try {
    pushChanges({
      repository: env.GITHUB_REPO || DEFAULT_REPO,
      branch: env.GITHUB_BRANCH || DEFAULT_BRANCH,
      token,
      message: process.argv.slice(2).join(' ') || DEFAULT_MESSAGE
    });
  } catch (error) {
    console.error(`❌ ${redactSecrets(error && error.message, token)}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  DEFAULT_BRANCH,
  DEFAULT_REPO,
  assertNoTrackedEnvFiles,
  gitEnvironmentWithAuth,
  isSensitiveEnvPath,
  loadEnv,
  parseEnvFile,
  pushChanges,
  redactSecrets,
  runGit,
  sanitizeGitEnvironment,
  validateRepository
};
