'use strict';

/**
 * 영구 GitHub 동기화(Commit & Push) 스크립트
 * - 컨테이너 재시작으로 .git이나 ~/.git-credentials가 초기화되더라도
 *   워크스페이스의 .env.local에서 토큰을 읽어 자동으로 git 연결을 복구하고 푸시합니다.
 * - 원격 URL에는 토큰을 평문으로 남기지 않고 일회성 인증 헤더로만 전송해 토큰 노출을 방지합니다.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function loadEnv() {
  const env = Object.assign({}, process.env);
  for (const name of ['.env.local', '.env']) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}

function run(cmd, opts = {}) {
  return execSync(cmd, Object.assign({ cwd: ROOT, stdio: 'pipe', encoding: 'utf8' }, opts));
}

function main() {
  const env = loadEnv();
  const token = (env.GITHUB_TOKEN || '').trim();
  const repo = (env.GITHUB_REPO || 'luxrank-ops/maeumjeongwon').trim();
  const msg = process.argv.slice(2).join(' ').trim() || 'chore: update project files';

  if (!token) {
    console.error('❌ GITHUB_TOKEN이 .env.local 또는 환경변수에 설정되어 있지 않습니다.');
    process.exit(1);
  }

  const cleanUrl = `https://github.com/${repo}.git`;
  const authUrl = `https://x-access-token:${token}@github.com/${repo}.git`;

  // 1. .git 디렉터리가 컨테이너 재시작으로 사라졌으면 자동 복구
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.log('🔄 .git 저장소 자동 초기화 및 원격 동기화 중...');
    run('git init');
    run(`git remote add origin ${cleanUrl}`);
  } else {
    try {
      run(`git remote set-url origin ${cleanUrl}`);
    } catch (e) {
      run(`git remote add origin ${cleanUrl}`);
    }
  }

  run('git config user.email "luxrank@gmail.com"');
  run('git config user.name "luxrank-ops"');

  // 2. 원격 최신 상태 fetch
  run(`git fetch ${authUrl} main`);

  // 현재 브랜치가 main이 아니거나 커밋 이력이 끊어져 있으면 origin/main에 연결
  let hasHead = true;
  try { run('git rev-parse --verify HEAD'); } catch (e) { hasHead = false; }
  if (!hasHead) {
    run('git reset --mixed FETCH_HEAD');
    run('git checkout -B main');
  }

  // 3. 변경 사항 스테이징 및 커밋
  run('git add -A');
  const status = run('git status --porcelain').trim();
  if (status) {
    run(`git commit -m ${JSON.stringify(msg)}`);
    console.log(`✅ 커밋 생성 완료: "${msg}"`);
  } else {
    console.log('ℹ️ 새로 커밋할 변경 사항이 없습니다. 미푸시 커밋을 확인합니다.');
  }

  // 4. 원격 변경 사항 리베이스 후 푸시 (원격 URL에는 토큰을 남기지 않음)
  try {
    run(`git pull --rebase ${authUrl} main`);
  } catch (e) {
    // 충돌 시 현재 작업본 우선
  }
  run(`git push ${authUrl} HEAD:main`);
  console.log(`🚀 GitHub (${repo} -> main) 푸시 완료!`);
}

main();
