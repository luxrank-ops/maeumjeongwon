'use strict';

require('./server/env');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createApp } = require('./server/app');

let SESSION_SECRET = process.env.SESSION_SECRET || '';
if (!SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('SESSION_SECRET이 없어요. 운영에서는 32자 이상의 비밀값을 설정해야 시작할 수 있어요.');
    process.exit(1);
  }
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
}

const SEO_OUT = path.join(__dirname, 'seo-out');

function sendIfExists(filePath, res, next) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    // sitemap·robots는 하루, 정적 SEO 페이지는 재검증(no-cache) — 배포 즉시 반영
    res.setHeader('Cache-Control', /\.(?:xml|txt)$/.test(filePath) ? 'public, max-age=86400' : 'no-cache');
    return res.sendFile(filePath);
  }
  return next();
}

const PORT = Number(process.env.PORT) || 3000;
const coreApp = createApp({ secret: SESSION_SECRET });

const express = require('express');
const app = express();
app.disable('x-powered-by');   // 바깥 래퍼 앱 — createApp 과 같은 헤더 정책을 유지한다

// 검색·광고 네트워크 검증용 루트 파일. ads.txt는 애드센스 설정 시에만 seo-out에 생성된다.
app.get(['/sitemap.xml', '/robots.txt', '/ads.txt'], (req, res, next) =>
  sendIfExists(path.join(SEO_OUT, path.basename(req.path)), res, next));

// 정적 SEO 페이지(/temple/:id/, /story/:id/)가 빌드되어 있으면 우선 제공
app.get(['/temple/:id', '/temple/:id/', '/story/:id', '/story/:id/'], (req, res, next) => {
  const kind = req.path.startsWith('/temple/') ? 'temple' : 'story';
  const id = path.basename(req.params.id || '');
  return sendIfExists(path.join(SEO_OUT, kind, id, 'index.html'), res, next);
});

app.use(coreApp);

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
