'use strict';

require('../server/env');
const fs = require('fs');
const path = require('path');
const site = require('../config/site');

const mode = process.argv[2] || process.env.BUILD_MODE || 'dev';
const apiBase = process.env.MJ_API_BASE || '';

if (mode === 'release') {
  if (!apiBase || !/^https:\/\//i.test(apiBase)) {
    console.error('Error: release build requires MJ_API_BASE starting with https://');
    process.exit(1);
  }
}

const config = {
  apiBase,
  demoPaywall: mode !== 'release',
  // 분석 측정 ID — 앱 셸(js/analytics.js)이 이 값을 읽어 동의 후에만 GA4를 연다
  gaId: (process.env.GA_MEASUREMENT_ID || site.GA_MEASUREMENT_ID || '').trim()
};

const target = path.join(__dirname, '..', 'js', 'config.js');
fs.writeFileSync(target, `window.MJ_CONFIG = ${JSON.stringify(config)};\n`, 'utf-8');
console.log(`Wrote ${target} (mode=${mode})`);
