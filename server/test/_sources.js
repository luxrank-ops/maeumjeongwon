'use strict';

// 앱 셸 소스 묶음 — js/app.js + js/app/*.js (모듈 분리 이후에도 "앱이 이걸 읽는가" 가드를 그대로 쓴다).
// 파일이 늘어나도 가드 테스트가 썩지 않게, 목록은 디렉터리를 읽어 만든다.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function appSourceFiles() {
  const files = [path.join(ROOT, 'js', 'app.js')];
  const dir = path.join(ROOT, 'js', 'app');
  if (fs.existsSync(dir)) {
    for (const n of fs.readdirSync(dir).sort()) {
      if (n.endsWith('.js')) files.push(path.join(dir, n));
    }
  }
  return files;
}

function readAppSources() {
  return appSourceFiles().map(f => fs.readFileSync(f, 'utf8')).join('\n');
}

module.exports = { ROOT, appSourceFiles, readAppSources };
