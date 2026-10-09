'use strict';

const fs = require('fs');
const path = require('path');
const { listStories } = require('../server/content/stories');
const { listTemples } = require('../server/content/temples');
const { publicStory } = require('../server/content/project');

const DEFAULT_OUT = path.join(__dirname, '..', 'seo-out');

const ADS_PUB_RE = /^pub-\d{16}$/;
const ADS_SLOT_RE = /^\d{6,}$/;
const ADS_CERT_ID = 'f08c47fec0942fa0';   // Google 공식 인증 기관 ID

// GA_MEASUREMENT_ID가 없으면 null → 분석 관련 출력이 전혀 생기지 않는다
const GA_ID_RE = /^G-[A-Z0-9]{4,}$/;
function gaConfig(env = process.env) {
  const id = (env.GA_MEASUREMENT_ID || '').trim();
  if (!id) return null;
  if (!GA_ID_RE.test(id)) throw new Error('GA_MEASUREMENT_ID는 G-영문대문자와숫자 형식이어야 해요. 예: G-ABCDEF1234');
  return id;
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function adsConfig(env = process.env) {
  const pub = (env.ADSENSE_PUB_ID || '').trim();
  if (!pub) return null;
  if (!ADS_PUB_RE.test(pub)) throw new Error('ADSENSE_PUB_ID는 pub- 뒤에 숫자 16자리여야 해요. 예: pub-1234567890123456');
  const slot = (env.ADSENSE_TEMPLE_SLOT || '').trim();
  if (slot && !ADS_SLOT_RE.test(slot)) throw new Error('ADSENSE_TEMPLE_SLOT은 숫자여야 해요.');
  return { pub, client: 'ca-' + pub, slot: slot || null };
}

function adsTxt(ads) {
  return `google.com, ${ads.pub}, DIRECT, ${ADS_CERT_ID}\n`;
}

function adUnit(ads) {
  return `<div class="ad" style="margin:16px 0"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(ads.client)}" data-ad-slot="${esc(ads.slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script></div>`;
}

function page({ base, urlPath, title, desc, body, ld, ads = null, ga = null, track = null }) {
  const url = base + urlPath;
  // 광고 칸이 실제로 들어갈 때만 로더 스크립트를 넣는다
  const adLoader = ads && ads.slot ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(ads.client)}" crossorigin="anonymous"></script>\n` : '';
  const adBlock = ads && ads.slot ? adUnit(ads) : '';
  const jsonLd = ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n` : '';
  // page() 안: 측정 ID가 있을 때만 주입
  const gaMeta = ga ? `<meta name="mj-ga-id" content="${esc(ga)}">\n` : '';
  const bodyAttr = ga && track ? ` data-mj-page="${esc(track.page)}" data-mj-item="${esc(track.item)}"` : '';
  const analyticsJs = ga ? '<script src="/js/analytics.js" defer></script>\n' : '';
  const settingsLink = ga ? ' · <a href="#" data-mj-consent-open>분석 설정</a>' : '';

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — 마음정원사 : 절로가</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${esc(url)}" />
<meta property="og:title" content="${esc(title)} — 마음정원사 : 절로가" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${esc(url)}" />
${gaMeta}${jsonLd}${adLoader}${analyticsJs}<link rel="stylesheet" href="/css/style.css" />
</head>
<body${bodyAttr}>
<main style="max-width:680px;margin:0 auto;padding:16px">
${body}
${adBlock}
<footer style="margin-top:24px;padding-top:12px;border-top:1px solid #e3d8c4;font-size:.85em;color:#7a6f62">
  <a href="/#/home">🪷 마음정원사 : 절로가 앱으로 열기</a>${settingsLink}
</footer>
</main>
</body>
</html>\n`;
}

function storyPage(st, base, ga = null) {
  const pub = publicStory(st);
  const c0 = pub.chapters[0];
  const prev = pub.preview;
  const title = pub.title;
  const desc = pub.hook;
  const body = `<article>
<p class="sub">${esc(pub.series)} ${pub.ep}편 · 약 ${pub.minutes}분</p>
<h1>${esc(pub.title)}</h1>
<p>${esc(pub.hook)}</p>
<section class="card"><h2>${esc(c0.h)}</h2>${c0.body.map(p => `<p>${esc(p)}</p>`).join('')}</section>
${prev ? `<section class="card locked"><h2>${esc(prev.h)}</h2><p>${esc(prev.body[0] || '')}</p><p class="notice">🔒 나머지 장은 앱에서 이어서 읽을 수 있어요. <a href="/#/story/${encodeURIComponent(pub.id)}">앱에서 열기 →</a></p></section>` : ''}
</article>`;
  return page({
    base, urlPath: `/story/${st.id}`, title, desc, body, ga, track: { page: 'story', item: st.id },
    ld: { '@context': 'https://schema.org', '@type': 'Article', headline: pub.title, description: pub.hook },
    ads: null
  });
}

function assertNoLockedText(html, st) {
  const lockedChapters = (st.chapters || []).slice(1);
  for (let i = 0; i < lockedChapters.length; i++) {
    const ch = lockedChapters[i];
    const startIdx = i === 0 ? 1 : 0; // 2장의 첫 문단은 미리보기 허용, 그 이후 문단은 절대 포함 금지
    for (let j = startIdx; j < ch.body.length; j++) {
      const snippet = ch.body[j].slice(0, 25);
      if (snippet && html.includes(snippet)) {
        throw new Error(`잠긴 본문이 SEO 페이지에 노출되었어요: ${st.id} (${ch.h})`);
      }
    }
  }
}

function templePage(t, base, storyIds, ads, ga = null) {
  const stId = storyIds[t.id];
  const title = `${t.name} (${t.sido} ${t.sgg})`;
  const desc = `${t.name} 기원·역사·전해지는 이야기와 방문 정보`;
  const body = `<article>
<h1>${esc(t.name)} <span class="sub">${esc(t.hanja || '')}</span></h1>
<p class="sub">${esc(t.sido)} ${esc(t.sgg)} · ${esc(t.mountain || '')} · ${esc(t.order || '')}</p>
<section class="card"><h2>한눈에 보기</h2><p>소재지: ${esc(t.addr)}</p><p>창건: ${esc(t.founded)}</p></section>
${t.legend ? `<section class="card legend"><span class="lbl">전해지는 이야기</span><h2>${esc(t.legend.title)}</h2><p>${esc(t.legend.text)}</p></section>` : ''}
${stId ? `<p><a class="btn small" href="/story/${encodeURIComponent(stId)}/">📖 심화 스토리 읽기 →</a></p>` : ''}
<p><a class="btn" href="/#/temple/${encodeURIComponent(t.id)}">앱에서 ${esc(t.name)} 상세·지도·순례 인증 보기 →</a></p>
</article>`;
  return page({
    base, urlPath: `/temple/${t.id}`, title, desc, body, ads, ga, track: { page: 'temple', item: t.id },
    ld: { '@context': 'https://schema.org', '@type': 'BuddhistTemple', name: t.name, address: t.addr }
  });
}

function buildSeo(outDir = DEFAULT_OUT, opts = {}) {
  const env = opts.env || process.env;
  const base = String(opts.siteUrl || env.SITE_URL || 'https://maeumjeongwon.example').replace(/\/+$/, '');
  const ads = adsConfig(env);   // 잘못된 값이면 여기서 멈춘다
  const ga = gaConfig(env);     // 잘못된 측정 ID면 빌드 중단

  fs.mkdirSync(outDir, { recursive: true });
  const write = (rel, content) => {
    const full = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  };

  const stories = listStories();
  const temples = listTemples();
  const storyIds = {};
  for (const st of stories) {
    if (!storyIds[st.tid]) storyIds[st.tid] = st.id;
  }

  const urls = [`${base}/`];

  for (const st of stories) {
    const html = storyPage(st, base, ga);             // 스토리 페이지: 광고 없음
    assertNoLockedText(html, st);
    if (/adsbygoogle|googlesyndication/.test(html)) throw new Error('스토리 페이지에 광고 코드가 들어가면 안 돼요: ' + st.id);
    write(`story/${st.id}/index.html`, html);
    urls.push(`${base}/story/${st.id}/`);
  }

  for (const t of temples) {
    write(`temple/${t.id}/index.html`, templePage(t, base, storyIds, ads, ga));  // 사찰 페이지만 광고 가능
    urls.push(`${base}/temple/${t.id}/`);
  }

  if (ads) write('ads.txt', adsTxt(ads));             // 도메인 루트에서 제공

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
  write('sitemap.xml', sitemap);
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);

  const publicStories = stories.map(publicStory);
  write('stories-public.json', JSON.stringify(publicStories, null, 2));

  return { outDir, stories: stories.length, temples: temples.length, ads: !!ads, ga: !!ga };
}

if (require.main === module) {
  const res = buildSeo();
  console.log(`Built SEO pages in ${res.outDir} (${res.temples} temples, ${res.stories} stories, ads=${res.ads}, ga=${res.ga})`);
}

module.exports = {
  ADS_PUB_RE,
  ADS_SLOT_RE,
  ADS_CERT_ID,
  GA_ID_RE,
  adsConfig,
  gaConfig,
  adsTxt,
  adUnit,
  page,
  buildSeo
};
