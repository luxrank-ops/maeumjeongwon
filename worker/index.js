'use strict';

// 절로가 — Cloudflare Worker 엔트리.
//
// 구성
//   · /api/*  → worker/api.js (server/app.js 와 같은 경로·응답)
//   · 그 밖    → Static Assets(dist/) — index.html·js·css·vendor·SEO 정적 페이지·검색 등록 파일
//
// Express 판이 하던 두 가지를 그대로 지킨다.
//   1) 확장자 있는 자산이 없으면 index.html 이 아니라 404 (HTML 을 JS/CSS 로 받으면 화면이 깨진다)
//   2) HTML·sw.js·매니페스트는 no-cache — 배포 즉시 반영

import { handleApi } from './api.js';

const IMMUTABLE_MAX_AGE = 31536000;
const ASSET_MAX_AGE = 604800;
const IMMUTABLE_RE = /[?&]v=/;
const ASSET_EXT_RE = /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|txt|xml|webmanifest)$/i;

function cacheControlFor(path, search) {
  const versioned = IMMUTABLE_RE.test(search || '');
  const alwaysRevalidate = path === '/sw.js' || path.endsWith('.webmanifest');
  if (alwaysRevalidate || !ASSET_EXT_RE.test(path)) return 'no-cache';
  // 검색 등록 파일(sitemap·robots)은 하루 — Express 판(sendIfExists)과 같게 둔다
  if (/\.(?:xml|txt)$/i.test(path)) return 'public, max-age=86400';
  return versioned
    ? `public, max-age=${IMMUTABLE_MAX_AGE}, immutable`
    : `public, max-age=${ASSET_MAX_AGE}`;
}

function withHeaders(res, cacheControl) {
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', cacheControl);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function asset(env, url, pathname) {
  const target = new URL(url.toString());
  target.pathname = pathname;
  return env.ASSETS.fetch(new Request(target.toString(), { method: 'GET' }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/api/') || path === '/api') {
      return handleApi(request, env, ctx, url);
    }

    // 1) 그대로 있는 파일
    let res = await env.ASSETS.fetch(request);

    // 2) /temple/haeinsa 처럼 끝 슬래시 없이 들어온 정적 SEO 페이지, 그리고 '/' → /index.html
    if (res.status === 404 && !ASSET_EXT_RE.test(path)) {
      const dirIndexPath = (path.endsWith('/') ? path : path + '/') + 'index.html';
      const dirIndex = await asset(env, url, dirIndexPath);
      if (dirIndex.status === 200) return withHeaders(dirIndex, 'no-cache');
    }

    if (res.status === 404) {
      if (ASSET_EXT_RE.test(path)) {
        return new Response('not_found', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
          }
        });
      }
      // 3) 없는 경로 — 앱 셸(index.html)은 그대로 내려주되 **404** 로 답한다.
      //    해시 라우팅이라 서버 경로는 없어도 되지만, 200 으로 답하면 검색엔진이
      //    같은 내용의 페이지를 무한히 '소프트 404'로 쌓는다(2026-11 /this-path-does-not-exist 가 200 이었다).
      //    화면은 그대로 열리고(앱이 #/home 으로 돌린다), 크롤러에게만 noindex 로 분명히 말한다.
      const shell = await asset(env, url, '/index.html');
      const headers = new Headers(shell.headers);
      headers.set('Cache-Control', 'no-cache');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Robots-Tag', 'noindex');
      return new Response(shell.body, { status: 404, statusText: 'Not Found', headers });
    }

    return withHeaders(res, cacheControlFor(path, url.search));
  }
};
