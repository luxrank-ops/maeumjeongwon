'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');

const DEFAULTS = {
  PORT: '3000',
  NODE_ENV: 'development',
  TZ: 'Asia/Seoul',
  LOCALE: 'ko-KR',
  AI_TIER: 'Google AI Pro',
  GEMINI_MODEL: 'gemini-4-argon',
  GEMINI_FALLBACK_MODEL: 'gemini-3.8-flash',
  GEMINI_IMAGE_MODEL: 'gemini-3.1-flash-image-preview',
  GEMINI_TTS_MODEL: 'gemini-2.5-flash-preview-tts',
  GEMINI_THINKING_LEVEL: 'HIGH',
  SITE_URL: 'https://ais-pre-prr2p6y2mtafv6w3erqgiz-892085568415.asia-east1.run.app',
  APP_URL: 'https://ais-pre-prr2p6y2mtafv6w3erqgiz-892085568415.asia-east1.run.app',
  DEV_APP_URL: 'https://ais-dev-prr2p6y2mtafv6w3erqgiz-892085568415.asia-east1.run.app',
  MJ_API_BASE: 'https://ais-pre-prr2p6y2mtafv6w3erqgiz-892085568415.asia-east1.run.app',
  BUILD_MODE: 'dev',
  ALLOW_DEV_AD_REWARD: '0',
  MJ_DEV_AD_REWARD: '0',
  ALLOW_DEV_ENTITLEMENT: '0',
  MJ_DEV_ENTITLEMENT: '0',
  REVENUECAT_WEBHOOK_AUTH: 'Bearer mj-rc-webhook-secret-2026',
  ADMOB_AD_UNIT_IDS: 'ca-app-pub-3940256099942544/5224354917,reward_story_24h,reward_lamp_3d,reward_fortune_detail',
  GITHUB_REPO: 'luxrank-ops/maeumjeongwon',
  GITHUB_BRANCH: 'main',
  GIT_COMMITTER_NAME: 'Maeumjeongwon Bot',
  GIT_COMMITTER_EMAIL: 'luxrank@gmail.com',
  GA_MEASUREMENT_ID: '',
  ADSENSE_PUB_ID: '',
  ADSENSE_TEMPLE_SLOT: '',
  GITHUB_TOKEN: ''
};

// Keys that are intentionally allowed to remain empty unless explicitly configured
const OPTIONAL_EMPTY_KEYS = new Set([
  'GA_MEASUREMENT_ID',
  'ADSENSE_PUB_ID',
  'ADSENSE_TEMPLE_SLOT',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITHUB_PAT'
]);

// System environment variables that should not be written into project .env files
const SYSTEM_ENV_KEYS = new Set([
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'PWD',
  'HOSTNAME',
  'TERM',
  'LANG',
  'LC_ALL',
  'SHLVL',
  'GIT_TERMINAL_PROMPT',
  'GIT_ASKPASS',
  'GCM_INTERACTIVE'
]);

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

function discoverCodeEnvKeys(root = ROOT) {
  const discovered = new Set(Object.keys(DEFAULTS));
  const exampleVars = parseEnvFile(path.join(root, '.env.example'));
  for (const k of Object.keys(exampleVars)) discovered.add(k);

  const scanTargets = [
    path.join(root, 'server.js'),
    path.join(root, 'server'),
    path.join(root, 'tools')
  ];

  const regex = /\b(?:process\.env|targetEnv|source|env)\.([A-Z][A-Z0-9_]{1,})\b/g;

  function visit(targetPath) {
    if (!fs.existsSync(targetPath)) return;
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(targetPath)) {
        if (entry === 'test' || entry === 'node_modules' || entry.startsWith('.')) continue;
        visit(path.join(targetPath, entry));
      }
      return;
    }
    if (!targetPath.endsWith('.js')) return;
    const content = fs.readFileSync(targetPath, 'utf8');
    let m;
    while ((m = regex.exec(content)) !== null) {
      const key = m[1];
      if (!SYSTEM_ENV_KEYS.has(key)) {
        discovered.add(key);
      }
    }
  }

  for (const target of scanTargets) {
    try {
      visit(target);
    } catch (_) {
      // Ignore read errors during scan
    }
  }

  return Array.from(discovered);
}

function inferDefaultForUnknownKey(key, targetEnv) {
  if (OPTIONAL_EMPTY_KEYS.has(key)) return '';
  if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return DEFAULTS[key];
  if (key === 'API_KEY' || key === 'GEMINI_API_KEY') {
    return targetEnv.API_KEY || targetEnv.GEMINI_API_KEY || '';
  }
  if (key === 'SESSION_SECRET') {
    return crypto.randomBytes(32).toString('hex');
  }
  if (/SECRET|PRIVATE_KEY|PASSWORD/i.test(key)) {
    return crypto.createHash('sha256').update(`mj-auto-secret:${key}`).digest('hex');
  }
  if (/WEBHOOK_AUTH/i.test(key)) {
    return 'Bearer mj-rc-webhook-secret-2026';
  }
  if (/PORT/i.test(key)) return '3000';
  if (/URL|ORIGIN|API_BASE|ENDPOINT/i.test(key)) {
    return targetEnv.SITE_URL || DEFAULTS.SITE_URL;
  }
  if (/MODEL/i.test(key)) return DEFAULTS.GEMINI_MODEL;
  if (/BRANCH/i.test(key)) return 'main';
  if (/REPO/i.test(key)) return DEFAULTS.GITHUB_REPO;
  if (/TIMEOUT|TTL/i.test(key)) return '10000';
  if (/LIMIT|MAX/i.test(key)) return '100';
  return '';
}

function syncEnvFiles(root, resolvedMap) {
  try {
    for (const fileName of ['.env', '.env.local']) {
      const filePath = path.join(root, fileName);
      const existing = parseEnvFile(filePath);
      let needsWrite = !fs.existsSync(filePath);
      const merged = Object.assign({}, existing);

      for (const [k, v] of Object.entries(resolvedMap)) {
        if (SYSTEM_ENV_KEYS.has(k)) continue;
        if (!(k in merged) || (merged[k] === '' && v !== '')) {
          merged[k] = v;
          needsWrite = true;
        }
      }

      if (needsWrite) {
        const lines = [
          '# 절로가 — 자동 관리 환경변수 (server/env.js에 의해 자동 동기화됨)'
        ];
        for (const [k, v] of Object.entries(merged)) {
          lines.push(`${k}=${v == null ? '' : String(v)}`);
        }
        fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
      }
    }
  } catch (_) {
    // Ignore filesystem write errors in read-only environments
  }
}

function initEnv(root = ROOT, targetEnv = process.env, options = {}) {
  const envFileValues = parseEnvFile(path.join(root, '.env'));
  const localFileValues = parseEnvFile(path.join(root, '.env.local'));
  const allKeys = discoverCodeEnvKeys(root);

  const fromFiles = Object.assign({}, DEFAULTS, envFileValues, localFileValues);
  for (const key of allKeys) {
    if (!(key in fromFiles)) {
      fromFiles[key] = inferDefaultForUnknownKey(key, targetEnv);
    }
  }

  for (const [key, value] of Object.entries(fromFiles)) {
    const current = targetEnv[key];
    if (current == null || String(current).trim() === '') {
      const resolved = value != null && String(value) !== ''
        ? String(value)
        : inferDefaultForUnknownKey(key, targetEnv);
      targetEnv[key] = resolved;
    }
  }

  // Bi-directionally sync API_KEY and GEMINI_API_KEY
  const activeKey = targetEnv.API_KEY || targetEnv.GEMINI_API_KEY || localFileValues.API_KEY || localFileValues.GEMINI_API_KEY || envFileValues.API_KEY || envFileValues.GEMINI_API_KEY || '';
  if (activeKey) {
    targetEnv.API_KEY = activeKey;
    targetEnv.GEMINI_API_KEY = activeKey;
  }

  if (!targetEnv.SESSION_SECRET) {
    targetEnv.SESSION_SECRET = localFileValues.SESSION_SECRET || envFileValues.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  }

  if (options.syncFiles !== false && root === ROOT && targetEnv === process.env) {
    const snapshot = {};
    for (const key of allKeys) {
      snapshot[key] = targetEnv[key] != null ? String(targetEnv[key]) : '';
    }
    snapshot.API_KEY = targetEnv.API_KEY || '';
    snapshot.GEMINI_API_KEY = targetEnv.GEMINI_API_KEY || '';
    snapshot.SESSION_SECRET = targetEnv.SESSION_SECRET || '';
    syncEnvFiles(root, snapshot);
  }

  return targetEnv;
}

initEnv();

module.exports = {
  DEFAULTS,
  OPTIONAL_EMPTY_KEYS,
  parseEnvFile,
  discoverCodeEnvKeys,
  inferDefaultForUnknownKey,
  initEnv
};
