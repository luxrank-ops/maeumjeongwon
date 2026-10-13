'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  gitEnvironmentWithAuth,
  isSensitiveEnvPath,
  loadEnv,
  pushChanges,
  runGit,
  validateRepository
} = require('../../tools/git-push');

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maeumjeongwon-git-push-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function seedBareRemote(root) {
  const bare = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  fs.mkdirSync(seed);
  git(root, ['init', '--bare', '--initial-branch=main', bare]);
  git(root, ['init', '--initial-branch=main', seed]);
  git(seed, ['config', 'user.name', 'Test User']);
  git(seed, ['config', 'user.email', 'test@example.invalid']);
  fs.writeFileSync(path.join(seed, '.gitignore'), '.env\n.env.*\n!.env.example\n');
  fs.writeFileSync(path.join(seed, 'README.md'), 'remote baseline\n');
  git(seed, ['add', '-A']);
  git(seed, ['commit', '-m', 'seed remote']);
  git(seed, ['remote', 'add', 'origin', bare]);
  git(seed, ['push', 'origin', 'main']);
  return { bare, seed };
}

const silentLogger = { log() {}, error() {} };

test('local env files are loaded with process variables taking precedence', t => {
  const root = makeTempDir(t);
  fs.writeFileSync(path.join(root, '.env'), 'GITHUB_REPO=old-owner/old-repo\nSHARED=base\n');
  fs.writeFileSync(path.join(root, '.env.local'), 'GITHUB_REPO=luxrank-ops/maeumjeongwon\nGITHUB_TOKEN="fake local token"\nSHARED=local\n');

  const env = loadEnv(root, { SHARED: 'process', ONLY_PROCESS: 'yes', GITHUB_TOKEN: '' });
  assert.equal(env.GITHUB_REPO, 'luxrank-ops/maeumjeongwon');
  assert.equal(env.GITHUB_TOKEN, 'fake local token');
  assert.equal(env.SHARED, 'process');
  assert.equal(env.ONLY_PROCESS, 'yes');
});

test('temporary Git auth is passed only through child configuration, not as a URL or raw token', () => {
  const token = 'test-only-token-value';
  const env = gitEnvironmentWithAuth(token, {
    PATH: process.env.PATH,
    GITHUB_TOKEN: token,
    GH_TOKEN: token,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraheader',
    GIT_CONFIG_VALUE_0: 'stale-value'
  });

  assert.equal(env.GIT_CONFIG_COUNT, '3');
  assert.equal(env.GIT_CONFIG_KEY_0, 'http.https://github.com/.extraheader');
  assert.equal(env.GIT_CONFIG_VALUE_0, '');
  assert.equal(env.GIT_CONFIG_KEY_1, 'http.https://github.com/.extraheader');
  assert.equal(env.GIT_CONFIG_VALUE_1, `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`);
  assert.equal(env.GIT_CONFIG_KEY_2, 'credential.helper');
  assert.equal(env.GIT_CONFIG_VALUE_2, '');
  assert.equal(execFileSync('git', ['config', '--get', 'http.https://github.com/.extraheader'], {
    encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe']
  }).trim(), env.GIT_CONFIG_VALUE_1);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.GIT_CONFIG_KEY_3, undefined);
  assert.equal(env.GIT_CONFIG_VALUE_3, undefined);
  assert.equal(Object.values(env).some(value => String(value).includes(token)), false);
});

test('repository and local environment path validation rejects unsafe values', () => {
  assert.equal(validateRepository('luxrank-ops/maeumjeongwon'), 'luxrank-ops/maeumjeongwon');
  assert.throws(() => validateRepository('owner/repo;git push elsewhere'), /owner\/repository/);
  assert.equal(isSensitiveEnvPath('.env'), true);
  assert.equal(isSensitiveEnvPath('.env.local'), true);
  assert.equal(isSensitiveEnvPath('config/.env.production'), true);
  assert.equal(isSensitiveEnvPath('.env.example'), false);
  assert.equal(isSensitiveEnvPath('README.md'), false);

  const projectRoot = path.resolve(__dirname, '../..');
  assert.equal(runGit(projectRoot, ['check-ignore', '--quiet', '--', '.env.local'], { allowFailure: true }).status, 0);
  assert.equal(runGit(projectRoot, ['check-ignore', '--quiet', '--', '.env.example'], { allowFailure: true }).status, 1);
});

test('missing .git metadata is repaired, local env stays untracked, and changes rebase onto remote updates', t => {
  const temp = makeTempDir(t);
  const { bare, seed } = seedBareRemote(temp);
  const workspace = path.join(temp, 'workspace');
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, '.gitignore'), '.env\n.env.*\n!.env.example\n');
  fs.writeFileSync(path.join(workspace, 'README.md'), 'remote baseline\nlocal workspace edit\n');
  const token = 'test-only-token-value';
  fs.writeFileSync(path.join(workspace, '.env.local'), `GITHUB_TOKEN=${token}\n`);

  const first = pushChanges({
    root: workspace,
    repository: 'owner/test-repo',
    token,
    branch: 'main',
    message: 'test: recover local repository metadata',
    remoteUrl: bare,
    logger: silentLogger
  });

  assert.equal(first.committed, true);
  assert.equal(git(workspace, ['remote', 'get-url', 'origin']), bare);
  assert.equal(git(workspace, ['ls-files']).split('\n').includes('.env.local'), false);
  assert.equal(fs.readFileSync(path.join(workspace, '.env.local'), 'utf8'), `GITHUB_TOKEN=${token}\n`);
  const gitConfig = fs.readFileSync(path.join(workspace, '.git', 'config'), 'utf8');
  assert.equal(gitConfig.includes(token), false);
  assert.equal(gitConfig.includes('AUTHORIZATION'), false);
  assert.match(git(bare, ['log', '-1', '--format=%s', 'main']), /recover local repository metadata/);

  // Add a non-conflicting commit remotely, then verify the next local push rebases cleanly.
  git(seed, ['fetch', 'origin']);
  git(seed, ['reset', '--hard', 'origin/main']);
  fs.writeFileSync(path.join(seed, 'remote-update.txt'), 'remote update\n');
  git(seed, ['add', '-A']);
  git(seed, ['commit', '-m', 'remote update']);
  git(seed, ['push', 'origin', 'main']);
  fs.writeFileSync(path.join(workspace, 'local-update.txt'), 'local update\n');

  const second = pushChanges({
    root: workspace,
    repository: 'owner/test-repo',
    token,
    branch: 'main',
    message: 'test: rebase against fresh remote state',
    remoteUrl: bare,
    logger: silentLogger
  });

  assert.equal(second.committed, true);
  assert.equal(git(bare, ['show', 'main:remote-update.txt']), 'remote update');
  assert.equal(git(bare, ['show', 'main:local-update.txt']), 'local update');
  assert.equal(git(bare, ['log', '-1', '--format=%s', 'main']), 'test: rebase against fresh remote state');
  assert.equal(fs.readFileSync(path.join(workspace, '.git', 'config'), 'utf8').includes(token), false);
});

test('commit messages containing the configured token are refused before repository work', t => {
  const root = makeTempDir(t);
  const token = 'do-not-put-this-in-a-message';
  assert.throws(() => pushChanges({
    root,
    repository: 'owner/repo',
    token,
    message: `oops ${token}`,
    logger: silentLogger
  }), /appears to contain a GitHub token/);
  assert.equal(fs.existsSync(path.join(root, '.git')), false);
});
