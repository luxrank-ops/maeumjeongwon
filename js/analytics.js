/* 마음정원사 : 절로가 — 동의 기반 웹 분석 (GA4)
 * 원칙:
 * 1) 측정 ID(window.MJ_CONFIG.gaId)가 유효한 G-XXXX 형식이고,
 * 2) 웹 환경(Capacitor 네이티브 앱 아님)이며,
 * 3) 사용자가 명시적으로 'allow' 동의를 한 경우에만 외부 gtag 스크립트를 로드하고 이벤트를 보낸다.
 * 4) 기도 내용·수첩 본문·정밀 좌표 등 민감 데이터는 절대 전송하지 않으며, 허용된 이벤트와 짧은 영숫자 파라미터만 통과시킨다.
 */
(function (root) {
  'use strict';

  const CONSENT_KEY = 'maeumjeongwon.consent.v1';
  const GA_ID_RE = /^G-[A-Z0-9]{4,16}$/i;
  const SAFE_VAL_RE = /^[a-zA-Z0-9_-]{1,40}$/;

  const ALLOWED_EVENTS = {
    page_view: ['page'],
    temple_open: ['tid'],
    story_open: ['sid'],
    checkin: ['tid', 'method', 'first'],
    paywall_view: ['feat']
  };

  function getWin() {
    return root || (typeof window !== 'undefined' ? window : {});
  }

  function isNativeApp(win) {
    const w = win || getWin();
    if (!w) return false;
    if (w.Capacitor && (typeof w.Capacitor.isNativePlatform === 'function' ? w.Capacitor.isNativePlatform() : !!w.Capacitor.isNative)) return true;
    const proto = (w.location && w.location.protocol) || '';
    return proto === 'capacitor:' || proto === 'ionic:';
  }

  function configuredGaId(win) {
    const w = win || getWin();
    const id = w && w.MJ_CONFIG && typeof w.MJ_CONFIG.gaId === 'string' ? w.MJ_CONFIG.gaId.trim() : '';
    return GA_ID_RE.test(id) ? id : '';
  }

  function getConsent(win) {
    const w = win || getWin();
    try {
      const v = w.localStorage && w.localStorage.getItem(CONSENT_KEY);
      if (v === 'allow' || v === 'deny') return v;
    } catch (e) {}
    return null;
  }

  function shouldPrompt(win) {
    const w = win || getWin();
    if (isNativeApp(w)) return false;
    if (!configuredGaId(w)) return false;
    return getConsent(w) === null;
  }

  function isActive(win) {
    const w = win || getWin();
    if (isNativeApp(w)) return false;
    if (!configuredGaId(w)) return false;
    return getConsent(w) === 'allow';
  }

  function ensureGtagLoaded(win) {
    const w = win || getWin();
    if (!isActive(w)) return false;
    const id = configuredGaId(w);
    if (!id) return false;
    w.dataLayer = w.dataLayer || [];
    if (typeof w.gtag !== 'function') {
      w.gtag = function () { w.dataLayer.push(arguments); };
      w.gtag('js', new Date());
      w.gtag('config', id, { send_page_view: false, anonymize_ip: true });
    }
    const doc = w.document;
    if (doc && typeof doc.createElement === 'function' && !doc.getElementById('mj-ga-script')) {
      const s = doc.createElement('script');
      s.id = 'mj-ga-script';
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
      if (doc.head && typeof doc.head.appendChild === 'function') {
        doc.head.appendChild(s);
      }
    }
    return true;
  }

  function setConsent(choice, win) {
    const w = win || getWin();
    if (choice !== 'allow' && choice !== 'deny') return false;
    try {
      if (w.localStorage) w.localStorage.setItem(CONSENT_KEY, choice);
    } catch (e) {}
    if (choice === 'allow') {
      ensureGtagLoaded(w);
    }
    return true;
  }

  function sanitizeParams(eventName, rawParams) {
    const allowedKeys = ALLOWED_EVENTS[eventName];
    if (!allowedKeys) return null;
    const out = {};
    if (!rawParams || typeof rawParams !== 'object') return out;
    for (const k of allowedKeys) {
      if (rawParams[k] === undefined || rawParams[k] === null) continue;
      const v = String(rawParams[k]).trim();
      if (SAFE_VAL_RE.test(v)) {
        out[k] = v;
      }
    }
    return out;
  }

  function track(eventName, rawParams, win) {
    const w = win || getWin();
    if (!ALLOWED_EVENTS[eventName]) return false;
    if (!isActive(w)) return false;
    const clean = sanitizeParams(eventName, rawParams);
    if (!clean) return false;
    ensureGtagLoaded(w);
    if (typeof w.gtag === 'function') {
      w.gtag('event', eventName, clean);
      return true;
    }
    return false;
  }

  const api = {
    CONSENT_KEY,
    GA_ID_RE,
    SAFE_VAL_RE,
    ALLOWED_EVENTS,
    isNativeApp,
    configuredGaId,
    getConsent,
    setConsent,
    shouldPrompt,
    isActive,
    sanitizeParams,
    track,
    init: () => ensureGtagLoaded(getWin())
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  const w = getWin();
  if (w) {
    w.MJ_ANALYTICS = api;
    api.init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
