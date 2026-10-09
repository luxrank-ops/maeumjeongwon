'use strict';

const fs = require('fs');
const path = require('path');

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
  demoPaywall: mode !== 'release'
};

const target = path.join(__dirname, '..', 'js', 'config.js');
fs.writeFileSync(target, `window.MJ_CONFIG = ${JSON.stringify(config)};\n`, 'utf-8');
console.log(`Wrote ${target} (mode=${mode})`);
