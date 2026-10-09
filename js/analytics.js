/* 마음정원사 : 절로가 — 동의 기반 웹 분석 (GA4, 앱 셸 + 정적 SEO 페이지 공통)
 * 원칙:
 * 1) 측정 ID: 앱 셸은 window.MJ_CONFIG.gaId, 정적 페이지는 <meta name="mj-ga-id">
 * 2) 웹 환경(Capacitor 네이티브 앱 제외)에서 사용자가 명시적으로 동의(true)한 경우에만 GA 스크립트 로드
 * 3) 허용 키(page, item, feature, method)와 영소문자·숫자·_- 값(^[a-z0-9_-]{1,40}$)만 전송
 */
(function (root) {
  'use strict';

  const CONSENT_KEY = 'maeumjeongwon.analytics';
  const GA_ID_RE = /^G-[A-Z0-9]{4,}$/;
  const ALLOWED_KEYS = ['page', 'item', 'feature', 'method'];
  const SAFE_VAL_RE = /^[a-z0-9_-]{1,40}$/;

  function gaId() {
    const fromConfig = root.MJ_CONFIG && root.MJ_CONFIG.gaId;
    if (fromConfig && GA_ID_RE.test(fromConfig)) return fromConfig;
    const meta = root.document && root.document.querySelector && root.document.querySelector('meta[name="mj-ga-id"]');
    const content = (meta && meta.getAttribute && meta.getAttribute('content')) || '';
    return GA_ID_RE.test(content) ? content : '';
  }

  function isNative() {
    if (root.Capacitor && (typeof root.Capacitor.isNativePlatform === 'function' ? root.Capacitor.isNativePlatform() : !!root.Capacitor.isNative)) return true;
    const proto = (root.location && root.location.protocol) || '';
    return proto === 'capacitor:' || proto === 'ionic:';
  }

  function canLoad({ consent, gaId: id, native }) {
    return consent === true && !!id && GA_ID_RE.test(id) && !native;
  }

  function readConsent() {
    try {
      const v = root.localStorage && root.localStorage.getItem(CONSENT_KEY);
      if (v === 'true' || v === 'allow' || v === '1') return true;
      if (v === 'false' || v === 'deny' || v === '0') return false;
    } catch (e) {}
    return null;
  }

  function writeConsent(v) {
    try {
      if (!root.localStorage) return;
      if (v === true || v === 'allow') root.localStorage.setItem(CONSENT_KEY, 'true');
      else if (v === false || v === 'deny') root.localStorage.setItem(CONSENT_KEY, 'false');
    } catch (e) {}
  }

  function sanitize(params) {
    const out = {};
    if (!params || typeof params !== 'object') return out;
    for (const k of ALLOWED_KEYS) {
      if (params[k] === undefined || params[k] === null) continue;
      const v = String(params[k]).trim().toLowerCase();
      if (SAFE_VAL_RE.test(v)) out[k] = v;
    }
    return out;
  }

  function loadGA(id) {
    if (!id || !GA_ID_RE.test(id)) return false;
    root.dataLayer = root.dataLayer || [];
    if (typeof root.gtag !== 'function') {
      root.gtag = function () { root.dataLayer.push(arguments); };
      root.gtag('js', new Date());
      root.gtag('config', id, { anonymize_ip: true, send_page_view: false });
    }
    const doc = root.document;
    if (doc && typeof doc.createElement === 'function' && (!doc.getElementById || !doc.getElementById('mj-ga-script'))) {
      const s = doc.createElement('script');
      s.id = 'mj-ga-script';
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
      if (doc.head && typeof doc.head.appendChild === 'function') doc.head.appendChild(s);
    }
    return true;
  }

  // <body data-mj-page="temple" data-mj-item="bulguksa"> 에서 페이지 정보를 읽는다
  function pageInfo() {
    const b = root.document && root.document.body;
    if (!b || !b.getAttribute) return null;
    const page = b.getAttribute('data-mj-page');
    if (!page) return null;
    return { page, item: b.getAttribute('data-mj-item') || '' };
  }

  let staticTracked = false;
  function trackStaticPage() {
    if (staticTracked) return;
    const info = pageInfo();
    if (!info) return;
    if (!canLoad({ consent: readConsent() === true, gaId: gaId(), native: isNative() })) return;
    staticTracked = true;
    track('page_view', info);
    if (info.page === 'temple' && info.item) track('temple_open', info);
    if (info.page === 'story' && info.item) track('story_open', info);
  }

  function showBanner() {
    const doc = root.document;
    if (!doc || !doc.body || typeof doc.createElement !== 'function') return;
    if (doc.getElementById && doc.getElementById('mj-consent-banner')) return;
    const el = doc.createElement('div');
    el.id = 'mj-consent-banner';
    el.className = 'card';
    el.style = 'position:fixed;left:12px;right:12px;bottom:12px;max-width:640px;margin:0 auto;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.15)';
    el.innerHTML = `<div class="row between"><b>📊 익명 방문 통계 안내</b><span class="tag">선택</span></div>
      <p class="sub" style="margin:6px 0">어떤 사찰·이야기를 많이 보는지 익명으로 집계해요. 허용하지 않아도 모든 내용을 그대로 읽을 수 있어요.</p>
      <div class="grid2"><button type="button" class="btn ghost small" data-mj-consent="deny">허용 안 함</button><button type="button" class="btn small" data-mj-consent="allow">허용</button></div>`;
    if (typeof doc.body.appendChild === 'function') doc.body.appendChild(el);
  }

  function hideBanner() {
    const doc = root.document;
    const el = doc && doc.getElementById && doc.getElementById('mj-consent-banner');
    if (el && typeof el.remove === 'function') el.remove();
    else if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  let uiBound = false;
  function bindStaticUi() {
    if (uiBound) return;
    const doc = root.document;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    uiBound = true;
    doc.addEventListener('click', e => {
      const t = e && e.target && e.target.closest ? e.target.closest('[data-mj-consent],[data-mj-consent-open]') : null;
      if (!t) return;
      if (e.preventDefault) e.preventDefault();
      if (t.hasAttribute && t.hasAttribute('data-mj-consent-open')) {
        showBanner();
        return;
      }
      const act = t.getAttribute ? t.getAttribute('data-mj-consent') : '';
      if (act === 'allow') { setConsent(true); hideBanner(); }
      else if (act === 'deny') { setConsent(false); hideBanner(); }
    });
  }

  function setConsent(v) {
    const boolVal = (v === true || v === 'allow');
    writeConsent(boolVal);
    if (boolVal && canLoad({ consent: true, gaId: gaId(), native: isNative() })) {
      loadGA(gaId());
      trackStaticPage();   // 방금 허용했다면 이 페이지의 page_view를 바로 보낸다
    }
  }

  function shouldPrompt() {
    return readConsent() === null && !!gaId() && !isNative();
  }

  function track(eventName, params) {
    if (!eventName || typeof eventName !== 'string') return false;
    if (!canLoad({ consent: readConsent() === true, gaId: gaId(), native: isNative() })) return false;
    const id = gaId();
    loadGA(id);
    const clean = sanitize(params);
    if (typeof root.gtag === 'function') {
      root.gtag('event', eventName, clean);
      return true;
    }
    return false;
  }

  function init() {
    staticTracked = false;
    const consent = readConsent();
    if (canLoad({ consent: consent === true, gaId: gaId(), native: isNative() })) loadGA(gaId());
    if (!root.document || !root.document.body) return;
    trackStaticPage();
    if (pageInfo()) {
      bindStaticUi();
      if (consent === null && gaId() && !isNative()) showBanner();   // 정적 페이지에서 아직 결정 안 한 경우만
    }
  }

  const api = {
    CONSENT_KEY,
    GA_ID_RE,
    ALLOWED_KEYS,
    SAFE_VAL_RE,
    gaId,
    isNative,
    canLoad,
    readConsent,
    writeConsent,
    setConsent,
    shouldPrompt,
    sanitize,
    loadGA,
    pageInfo,
    showBanner,
    hideBanner,
    track,
    init
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MJAnalytics = api;
  root.MJ_ANALYTICS = api;
  init();
})(typeof window !== 'undefined' ? window : globalThis);
