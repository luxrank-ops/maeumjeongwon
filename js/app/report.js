/* 사경 리포트 — '마음의 결' 화면 조각 (지연 모듈)
 *
 * 왜 따로 두었나: 이 화면은 #/report 로 들어갈 때만 필요하다. 첫 화면 예산(140KB)을 지키려고
 * 겹자·꺾은선·낱말 구름을 여기로 옮겼다. js/lib/loader.js 의 ASSETS.sagye 가 함께 받는다.
 *
 * 이 파일이 아는 것은 '기록'(window.MJ_COUNSEL.list())뿐이다. 서버·네트워크를 부르지 않는다.
 */
(function (root) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = iso => {
    const d = new Date(iso);
    return isNaN(d) ? String(iso || '') : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  };
  // SVG 안에서는 CSS 변수를 못 읽는다 — 그릴 때 계산된 값을 읽어 온다
  const themeColor = (name, fallback) => {
    try {
      const v = window.getComputedStyle(document.documentElement).getPropertyValue(name);
      const t = (v || '').trim();
      return t || fallback;
    } catch (e) { return fallback; }
  };
  const counselLog = () => (root.MJ_COUNSEL && root.MJ_COUNSEL.list ? root.MJ_COUNSEL.list() : []);

  // 꺾은선 좌표 — 순수 계산이라 화면 없이도 검산할 수 있다.
  function trendPoints(scores, w, h, pad) {
    const n = scores.length;
    const stepX = n > 1 ? (w - pad * 2) / (n - 1) : 0;
    return scores.map((s, i) => {
      const x = pad + stepX * i;
      const y = pad + ((5 - s) / 4) * (h - pad * 2);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
  }
  function counsel() {
    const log = counselLog();
    const goWrite = `<div class="report-cta"><button class="btn" data-act="ai-counsel">마음 사경 펼치기</button>
      <p class="report-foot-note">질문과 답은 이 기기에만 남아요 · 서버로 보내지 않아요</p></div>`;

    if (!log.length) {
      return `<section class="card report-encourage">
        <div class="seal-mark">問</div>
        <h2>아직 사경을 펼치지 않았어요</h2>
        <p>마음을 한 줄 적으면 그 문장이 첫 장이 됩니다. 세 장이 모이면 결이 꺾은선으로 보여요.</p>
        ${goWrite}
      </section>`;
    }

    if (log.length < 3) {
      // 상태 1 — 1~2장: 숫자 대신 격려 한 장.
      const last = log[log.length - 1];
      return `<section class="card report-encourage">
        <div class="seal-mark">印</div>
        <h2>${log.length === 1 ? '첫 장을 남겼어요' : '두 장째, 결이 보이기 시작해요'}</h2>
        <p>${log.length === 1 ? '마음을 글로 옮기는 일은 생각보다 많은 힘이 듭니다. 오늘 그걸 해냈어요.' : '같은 마음이 다시 올 때, 앞장에 적어 둔 문장이 작은 등불이 됩니다.'}
        <br><span class="sub">${esc(last.kw.length ? '이번 장의 낱말: #' + last.kw.join(' #') : '이번 장의 낱말: 아직 정리되지 않은 마음')}</span></p>
        ${goWrite}
      </section>`;
    }

    // 상태 2 — 3장~: 꺾은선 + 낱말 + 내보내기
    const recent = log.slice(-8);
    const scores = recent.map(x => x.score || 3);
    const W = 320, H = 132, PAD = 22;
    const pts = trendPoints(scores, W, H, PAD);
    const poly = pts.map(p => p.join(',')).join(' ');
    const dot = pts.map((p, i) => `<circle class="dot${i === pts.length - 1 ? ' dot-last' : ''}" cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 5 : 3.4}"/>`).join('');
    const xLabels = `<text x="${PAD}" y="${H - 4}">${fmtDate(recent[0].at.slice(0, 10))}</text>
      <text x="${W - PAD}" y="${H - 4}" text-anchor="end">${fmtDate(recent[recent.length - 1].at.slice(0, 10))}</text>
      <text x="${PAD}" y="${PAD - 8}">마음 온도 5</text>`;
    const counts = {};
    log.forEach(x => (x.kw || []).forEach(k => { counts[k] = (counts[k] || 0) + 1; }));
    const tags = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
    const hottest = tags.length ? tags[0][1] : 0;
    const cloud = tags.length
      ? `<div class="tag-cloud">${tags.map(([k, n]) => `<div class="kw${n === hottest && n > 1 ? ' hot' : ''}"><b>#${esc(k)}</b><span class="n">${n}회</span></div>`).join('')}</div>`
      : `<p class="sub" style="margin:0">아직 되풀이되는 낱말이 없어요. 세 장만 더 쓰면 결이 드러나요.</p>`;
    const verseCount = {};
    log.forEach(x => { if (x.verse) verseCount[x.verse] = (verseCount[x.verse] || 0) + 1; });
    const topVerse = Object.entries(verseCount).sort((a, b) => b[1] - a[1])[0];

    return `<section class="card">
        <div class="row between"><h2 style="margin:0">마음의 결</h2><span class="tag">${log.length}장</span></div>
        <p class="sub" style="margin:4px 0 0">최근 ${recent.length}장의 마음 온도 — 위로 갈수록 평온했어요.</p>
        <svg class="counsel-trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 ${recent.length}장의 마음 온도 꺾은선">
          <defs>
            <linearGradient id="sagyeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="${themeColor('--pine-3', '#c33a3a')}"/>
              <stop offset="1" stop-color="${themeColor('--pine', '#b71c1c')}"/>
            </linearGradient>
          </defs>
          <line class="grid" x1="${PAD}" y1="${PAD}" x2="${W - PAD}" y2="${PAD}"/>
          <line class="grid" x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}"/>
          <line class="axis" x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}"/>
          <polyline class="line" points="${poly}"/>
          ${dot}
          ${xLabels}
        </svg>
      </section>
      <section class="card">
        <h2 style="margin-top:0">되풀이되는 마음</h2>
        <p class="sub" style="margin:0 0 6px">질문에 자주 나온 낱말 — 많을수록 마음이 오래 머무는 자리예요.</p>
        ${cloud}
        ${topVerse ? `<p class="sub" style="margin:10px 0 0">가장 자주 마주한 구절은 <b>${esc(topVerse[0])}</b> — ${topVerse[1]}번이에요.</p>` : ''}
      </section>
      <section class="card">
        <h2 style="margin-top:0">이 리포트를 남기기</h2>
        <p class="sub" style="margin:0">상담 기록은 이 기기 브라우저에만 있어요. 기기를 바꾸면 따라가지 않아요.</p>
        <div class="report-cta">
          <button class="btn" data-act="print">PDF로 저장 · 인쇄</button>
          <button class="btn ghost" data-act="ai-counsel">마음 사경 이어 쓰기</button>
          <p class="report-foot-note">인쇄 대화상자에서 'PDF로 저장'을 고르세요 · 인쇄물에는 광고·탭이 빠집니다</p>
        </div>
      </section>`;
  }

  root.MJ_REPORT = { counsel: counsel, trendPoints: trendPoints };
})(window);
