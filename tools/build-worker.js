'use strict';

// Cloudflare Workers 배포 묶음 만들기.
//
// 두 가지를 만든다.
//  1) worker/generated/content.json — Worker 런타임에는 fs 가 없어서 js/data-*.js 를 읽을 수 없다.
//     콘텐츠 모듈(server/content/*)이 Node 에서 읽은 결과를 그대로 JSON 으로 떠서 Worker 가 쓰게 한다.
//  2) dist/ — Static Assets 로 올릴 정적 파일. 루트 자산 + 빌드된 SEO 페이지(seo-out)를 한 폴더에 합친다.
//     (seo-out/temple/x/index.html → dist/temple/x/index.html 이 되어 /temple/x/ 로 바로 열린다)
//
// 사용: node tools/build-worker.js   (npm run build 가 build-seo 다음에 부른다)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'worker', 'generated', 'content.json');
const DIST = path.join(ROOT, 'dist');
const SEO_OUT = path.join(ROOT, 'seo-out');

// 루트에서 그대로 복사할 파일 (확장자 단위)
const ROOT_FILE_RE = /^(?:index\.html|sw\.js|manifest\.webmanifest|metadata\.json|apple-touch-icon\.png|pwa-[a-z0-9-]+\.png|favicon\.ico|robots\.txt|sitemap\.xml|ads\.txt|[a-z0-9-]+\.png)$/i;
// 그대로 복사할 폴더
const ROOT_DIRS = ['js', 'css', 'vendor'];

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(from)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      copyDir(path.join(from, name), path.join(to, name));
    }
    return;
  }
  if (stat.isFile()) copyFile(from, to);
}

function buildContent() {
  const { listTemples } = require('../server/content/temples');
  const { listStories, listSoon } = require('../server/content/stories');
  const { loadTraditionalTemples } = require('../server/content/traditional');

  const payload = {
    generatedAt: new Date().toISOString(),
    temples: listTemples(),
    stories: listStories(),
    soon: listSoon(),
    traditional: loadTraditionalTemples()
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload));
  const kb = Math.round(fs.statSync(OUT_JSON).size / 1024);
  console.log(`content.json: 사찰 ${payload.temples.length}곳 · 스토리 ${payload.stories.length}편 · 전통사찰 ${payload.traditional.length}곳 (${kb}KB)`);
}

function buildDist() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  let files = 0;
  for (const name of fs.readdirSync(ROOT)) {
    const full = path.join(ROOT, name);
    if (fs.statSync(full).isFile() && ROOT_FILE_RE.test(name)) {
      copyFile(full, path.join(DIST, name));
      files++;
    }
  }
  for (const dir of ROOT_DIRS) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    copyDir(full, path.join(DIST, dir));
  }

  // SEO 정적 페이지·검색 등록 파일은 루트 경로로 올린다.
  if (fs.existsSync(SEO_OUT)) copyDir(SEO_OUT, DIST);

  // sitemap·robots 가 없으면 검색 등록이 깨진다 — 빌드 순서(build-seo → build-worker)를 지키라는 신호.
  for (const must of ['sitemap.xml', 'robots.txt', 'index.html']) {
    if (!fs.existsSync(path.join(DIST, must))) {
      throw new Error(`dist/${must} 가 없어요. npm run build(SEO 빌드)를 먼저 실행해야 합니다.`);
    }
  }

  let total = 0;
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else { files++; total += st.size; }
    }
  })(DIST);

  console.log(`dist/: 파일 ${files}개 · ${(total / 1024 / 1024).toFixed(1)}MB`);
}

if (require.main === module) {
  buildContent();
  buildDist();
}

module.exports = { buildContent, buildDist, OUT_JSON, DIST };
