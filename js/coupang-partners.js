/* 절로가 — 쿠팡 파트너스 추천 블록
 *
 * 쿠팡 파트너스(partners.coupang.com) 계정 설정값은 이 파일의 CONFIG 한 곳에 모아 둔다.
 * 배포 환경에서 값을 바꾸려면 index.html 앞에서 window.MJ_CONFIG.coupang = {...} 로 덮어쓰면 된다
 * (예: 다른 파트너 ID·배너 ID로 교체).
 *
 * 파트너스 콘솔에서 만든 값
 *   partnerId    : 파트너스 추적 코드(AF...)  — 내 정보에서 확인
 *   bannerId     : 다이나믹 배너 id — 링크 생성 > 다이나믹 배너 (도서/음반/DVD 카테고리 베스트)
 *   searchWidget : 검색 위젯 iframe 주소 — 링크 생성 > 검색 위젯
 *
 * 쿠팡 파트너스 활동에는 공정위(표시·광고의 공정화에 관한 법률)가 정한 대가성 문구를 반드시 표시해야 한다.
 * 문구는 DISCLOSURE 상수 하나만 쓰고, 화면에서는 숨기지 않는다(숨기면 위반).
 */
(function () {
  'use strict';

  var CONFIG = {
    enabled: true,
    partnerId: 'AF8608843',
    bannerId: '1050152',
    bannerWidth: 680,
    bannerHeight: 140,
    searchWidget: 'https://coupa.ng/cqX8jD'
  };
  var DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

  /* 홈 화면 '사찰 나들이 · 마음챙김 준비물' 테마 4종 — 앱 성격(사찰·마음 쉼)에 맞춰 고른 카테고리.
   * key 는 subId 꼬리표, keywords 는 쿠팡 검색어다. */
  var HOME_THEMES = [
    { key: 'sagyeong', emoji: '📿', label: '사경노트·필기구', keywords: '사경노트 붓글씨 세트' },
    { key: 'tea', emoji: '🍵', label: '전통차·다기', keywords: '전통차 다기 세트' },
    { key: 'incense', emoji: '🕯️', label: '인센스·명상소품', keywords: '인센스 명상 소품' },
    { key: 'hike', emoji: '🥾', label: '산책용 등산화·방석', keywords: '등산화 트레킹화 방석' }
  ];

  var override = (window.MJ_CONFIG && window.MJ_CONFIG.coupang) || null;
  var CFG = {};
  for (var k in CONFIG) CFG[k] = CONFIG[k];
  if (override) for (var k2 in override) if (override[k2] !== undefined && override[k2] !== null) CFG[k2] = override[k2];

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function widgetUrl() {
    return CFG.searchWidget + (CFG.searchWidget.indexOf('?') > -1 ? '&' : '?') + 'subId=maeumjeongwon';
  }

  function bannerUrl() {
    return 'https://ads-partners.coupang.com/widgets.html?id=' + encodeURIComponent(CFG.bannerId)
      + '&template=carousel&trackingCode=' + encodeURIComponent(CFG.partnerId)
      + '&subId=&width=' + encodeURIComponent(CFG.bannerWidth) + '&height=' + encodeURIComponent(CFG.bannerHeight) + '&tsource=';
  }

  /* 테마 버튼용 파트너스 검색 딥링크 — coupa.ng 검색 위젯이 쓰는 주소(link.coupang.com/re/AFFSRP)와
   * 같은 규칙: pageKey=검색어, lptag=파트너스 추적 코드, subid=어느 자리에서 눌렀는지. */
  function searchUrl(keywords, part) {
    return 'https://link.coupang.com/re/AFFSRP?pageKey=' + encodeURIComponent(keywords)
      + '&lptag=' + encodeURIComponent(CFG.partnerId)
      + '&subid=' + encodeURIComponent('maeumjeongwon' + (part ? '-' + part : ''));
  }

  function noteHtml() {
    return '<p class="cq-note"><b>안내</b> · ' + esc(DISCLOSURE) + '</p>';
  }

  var STYLE_ID = 'coupang-partners-style';
  var CSS = [
    '.coupang-card .cq-widget{width:100%;max-width:680px;height:75px;border:0;display:block;margin:2px 0 10px}',
    '.coupang-card .cq-banner-frame{width:100%;max-width:680px;height:140px;border:0;display:block;margin:0 auto}',
    '.coupang-card .cq-note{font-size:.78rem;line-height:1.5;color:var(--muted,#6b6b6b);margin:10px 0 0;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.04)}',
    '.coupang-card .cq-note b{font-weight:600}',
    /* 홈 '사찰 나들이' 테마 4종 — 2×2 로 두고, 넓은 화면에서는 한 줄 */
    '.coupang-home .cq-themes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0 10px}',
    '@media(min-width:440px){.coupang-home .cq-themes{grid-template-columns:repeat(4,minmax(0,1fr))}}',
    /* 검색 위젯은 좌은 폭에서 로그오 검색창이 두 줄로 잡혀 75px 로는 스크롤바가 생긴다 — 홈 블록만 110px */
    '.coupang-home .cq-widget{height:110px;margin:0 0 8px}',
    '.coupang-home .cq-theme{display:flex;align-items:center;justify-content:center;gap:5px;min-height:46px;padding:8px 6px;',
    'border-radius:10px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.6);color:inherit;text-decoration:none;',
    'font-size:.76rem;font-weight:600;line-height:1.3;text-align:center;word-break:keep-all}'
  ].join('');

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // 힐링·수면·명상·독서 — 앱 성격에 맞는 말로 안내한다
  function html() {
    return '<section class="card coupang-card" aria-labelledby="cqTitle">'
      + '<h2 id="cqTitle">📚 힐링·독서 추천 <span class="tag">쿠팡</span></h2>'
      + '<p class="sub">명상·수면·독서에 곁들이기 좋은 물건을 쿠팡에서 바로 찾아볼 수 있어요. '
      + '아래 검색창에 원하는 것을 적으면 쿠팡 상품이 나옵니다.</p>'
      + '<iframe class="cq-widget" title="쿠팡 상품 검색" loading="lazy" referrerpolicy="unsafe-url" '
      + 'src="' + esc(widgetUrl()) + '"></iframe>'
      + '<iframe class="cq-banner-frame" title="쿠팡 도서·음반 베스트" loading="lazy" referrerpolicy="unsafe-url" '
      + 'src="' + esc(bannerUrl()) + '"></iframe>'
      + '<p class="cq-note"><b>안내</b> · ' + esc(DISCLOSURE) + '</p>'
      + '</section>';
  }

  /* 홈 화면(#/) 블록 — 사찰 추천 카드 아래 '사찰 나들이 · 마음챙김 준비물'.
   * 테마 버튼 4종 + 배너 + 공정위 문구. viewHome 이 문자열로 그대로 붙인다. */
  function homeHtml() {
    if (!CFG.enabled) return '';
    ensureStyle();
    var chips = HOME_THEMES.map(function (th) {
      return '<a class="cq-theme" data-cq="theme" data-key="' + esc(th.key) + '"'
        + ' href="' + esc(searchUrl(th.keywords, 'home-' + th.key)) + '"'
        + ' target="_blank" rel="sponsored noopener">'
        + '<span aria-hidden="true">' + th.emoji + '</span>' + esc(th.label) + '</a>';
    }).join('');
    return '<section class="card coupang-card coupang-home" aria-labelledby="cqHomeTitle">'
      + '<div class="section-heading"><div><span class="section-kicker">🍃 사찰 나들이</span>'
      + '<h2 id="cqHomeTitle">마음챙김 준비물</h2></div><span class="tag">쿠팡</span></div>'
      + '<p class="sub">사찰 산책과 마음공부에 곁들이기 좋은 물건을 쿠팡에서 찾아볼 수 있어요.</p>'
      + '<div class="cq-themes">' + chips + '</div>'
      + '<iframe class="cq-widget" title="쿠팡 상품 검색" loading="lazy" referrerpolicy="unsafe-url"'
      + ' src="' + esc(widgetUrl()) + '"></iframe>'
      + noteHtml()
      + '</section>';
  }

  function mountAll(root) {
    if (!CFG.enabled) return;
    var scope = root || document;
    var slots = scope.querySelectorAll('.coupang-slot');
    if (!slots.length) return;
    ensureStyle();
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (slot.getAttribute('data-coupang-mounted') === '1') continue;
      slot.innerHTML = html();
      slot.setAttribute('data-coupang-mounted', '1');
    }
  }

  window.MJCoupang = {
    config: CFG,
    disclosure: DISCLOSURE,
    themes: HOME_THEMES,
    searchUrl: searchUrl,
    homeHtml: homeHtml,
    mountAll: mountAll,
    html: html
  };
})();
