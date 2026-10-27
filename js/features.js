/* 절로가 — 9대 핵심 기능 모듈 (PWA, 날씨/계절, 내비게이션, 완주증, 플래너, 템플스테이, 명상, i18n, 오디오 도슨트) */
(function (root) {
  'use strict';

  // ==========================================
  // 1. PWA & 오프라인 관리
  // ==========================================
  let deferredInstallPrompt = root.MJ_INSTALL_PROMPT || null;
  const PWA = {
    init: function () {
      if ('serviceWorker' in navigator) {
        // 버전을 붙여 등록한다 — CDN/브라우저가 예전 /sw.js 응답(HTML 등)을 물고 있어도
        // 새 배포에서는 반드시 새 스크립트를 받아 오게 한다. updateViaCache:'none' 도 같은 이유.
        const swVersion = (root.MJ_LOADER && root.MJ_LOADER.VERSION) || '';
        const swUrl = '/sw.js' + (swVersion ? '?v=' + encodeURIComponent(swVersion) : '');
        const registerServiceWorker = () => navigator.serviceWorker
          .register(swUrl, { updateViaCache: 'none' })
          .catch(err => {
            console.warn('[PWA] SW register skipped:', err);
          });
        if (document.readyState === 'complete') registerServiceWorker();
        else window.addEventListener('load', registerServiceWorker, { once: true });
      }

      const installBtn = document.getElementById('installBtn');
      const offlineBanner = document.getElementById('offlineBanner');

      // 오프라인 상태 감지
      function updateOnlineStatus() {
        if (offlineBanner) {
          offlineBanner.classList.toggle('hidden', navigator.onLine);
        }
      }
      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);
      updateOnlineStatus();

      // PWA 설치 이벤트
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      if (isStandalone) {
        if (installBtn) installBtn.classList.add('hidden');
        return;
      }

      if (deferredInstallPrompt && installBtn) installBtn.classList.remove('hidden');
      window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredInstallPrompt = e;
        root.MJ_INSTALL_PROMPT = e;
        if (installBtn) installBtn.classList.remove('hidden');
      });

      window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        root.MJ_INSTALL_PROMPT = null;
        if (installBtn) installBtn.classList.add('hidden');
        if (root.MJ_TOAST) root.MJ_TOAST(I18N.t('pwa_installed'));
      });

      // iOS 기기 감지
      const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
      if (isIOS && !isStandalone && installBtn) {
        installBtn.classList.remove('hidden');
      }

      if (installBtn) {
        installBtn.addEventListener('click', () => {
          if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            deferredInstallPrompt.userChoice.then(choice => {
              if (choice.outcome === 'accepted') {
                deferredInstallPrompt = null;
                root.MJ_INSTALL_PROMPT = null;
                installBtn.classList.add('hidden');
              }
            });
          } else if (isIOS) {
            PWA.showIOSGuide();
          } else {
            if (root.MJ_TOAST) root.MJ_TOAST(I18N.t('pwa_browser_guide'));
          }
        });
      }
    },
    showIOSGuide: function () {
      const modal = document.getElementById('modal');
      if (!modal) return;
      modal.innerHTML = `
        <div class="sheet" style="text-align:center">
          <h2>📲 ${I18N.t('pwa_ios_title')}</h2>
          <p class="sub">${I18N.t('pwa_ios_desc')}</p>
          <div style="text-align:left;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;margin:12px 0;line-height:1.7">
            1. Safari 하단 툴바의 <b>공유 버튼 (네모 위 화살표)</b>을 누릅니다.<br>
            2. 화면을 아래로 스크롤하여 <b>'홈 화면에 추가'</b>를 선택합니다.<br>
            3. 우측 상단의 <b>'추가'</b>를 누르면 설치가 완료됩니다.
          </div>
          <button class="btn block" data-act="close">${I18N.t('close')}</button>
        </div>`;
      modal.classList.remove('hidden');
    }
  };

  // ==========================================
  // 2. 실시간 날씨 & 계절별 사찰 추천
  // ==========================================
  const WEATHER_CACHE = {};
  const SEASON_INFO = {
    spring: {
      name: '봄 (신록·벚꽃)',
      en: 'Spring (Cherry Blossoms & Fresh Greenery)',
      icon: '🌸',
      code: 'spring',
      months: [3, 4, 5],
      advice: '화사한 꽃길과 싱그러운 숲길을 걸으며 봄의 생명력을 느껴보세요.',
      templeIds: ['haeinsa', 'ssanggyesa', 'songgwangsa', 'seonamsa', 'magoksa', 'hwaeomsa']
    },
    summer: {
      name: '여름 (계곡·녹음 힐링)',
      en: 'Summer (Cool Valleys & Lush Forests)',
      icon: '🌿',
      code: 'summer',
      months: [6, 7, 8],
      advice: '시원한 계곡 물소리와 울창한 전나무숲에서 더위를 식히고 마음을 맑혀보세요.',
      templeIds: ['woljeongsa', 'sudeoksa', 'tongdosa', 'beopjusa', 'baegyangsa']
    },
    autumn: {
      name: '가을 (단풍·단아한 산사)',
      en: 'Autumn (Crimson Foliage & Serene Temples)',
      icon: '🍁',
      code: 'autumn',
      months: [9, 10, 11],
      advice: '붉게 물든 단풍과 노란 은행잎이 수놓는 고즈넉한 산사 경내를 천천히 포행하세요.',
      templeIds: ['bulguksa', 'baegyangsa', 'naesosa', 'buseoksa', 'magoksa', 'donghwasa']
    },
    winter: {
      name: '겨울 (설경·적멸보궁)',
      en: 'Winter (Snowscapes & Sacred Sanctuaries)',
      icon: '❄️',
      code: 'winter',
      months: [12, 1, 2],
      advice: '하얀 눈으로 덮인 적멸보궁과 고요한 산사에서 깊은 침묵과 사유를 누리세요.',
      templeIds: ['sangwonsa', 'jeongamsa', 'tongdosa', 'bongjeongsa', 'daeheungsa']
    }
  };

  const Weather = {
    getCurrentSeason: function () {
      const month = new Date().getMonth() + 1;
      for (const key of Object.keys(SEASON_INFO)) {
        if (SEASON_INFO[key].months.includes(month)) return SEASON_INFO[key];
      }
      return SEASON_INFO.autumn;
    },
    getWmoDescription: function (code) {
      if (code === 0) return { icon: '☀️', desc: '맑음', en: 'Clear' };
      if ([1, 2].includes(code)) return { icon: '🌤️', desc: '대체로 맑음', en: 'Partly Cloudy' };
      if (code === 3) return { icon: '☁️', desc: '흐림', en: 'Overcast' };
      if ([45, 48].includes(code)) return { icon: '🌫️', desc: '안개', en: 'Fog' };
      if ([51, 53, 55, 61, 63, 65].includes(code)) return { icon: '🌧️', desc: '비', en: 'Rain' };
      if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: '❄️', desc: '눈', en: 'Snow' };
      if ([80, 81, 82].includes(code)) return { icon: '🌦️', desc: '소나기', en: 'Showers' };
      if ([95, 96, 99].includes(code)) return { icon: '⛈️', desc: '뇌우', en: 'Thunderstorm' };
      return { icon: '⛅', desc: '구름조금', en: 'Scattered Clouds' };
    },
    fetchWeather: async function (lat, lng) {
      const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
      const now = Date.now();
      if (WEATHER_CACHE[key] && (now - WEATHER_CACHE[key].ts < 30 * 60 * 1000)) {
        return WEATHER_CACHE[key].data;
      }

      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FSeoul`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('weather fetch failed');
        const json = await res.json();
        const cur = json.current;
        const wmo = Weather.getWmoDescription(cur.weather_code);
        const data = {
          temp: Math.round(cur.temperature_2m),
          icon: wmo.icon,
          desc: wmo.desc,
          descEn: wmo.en,
          wind: cur.wind_speed_10m ? cur.wind_speed_10m.toFixed(1) : '1.5',
          advice: cur.temperature_2m < 10
            ? '산사는 평지보다 기온이 낮으니 보온 외투를 준비하세요.'
            : cur.temperature_2m > 26
            ? '수분을 충분히 섭취하고 모자를 챙겨 걸으세요.'
            : '포행과 산책하기에 온화하고 쾌적한 날씨입니다.'
        };
        WEATHER_CACHE[key] = { ts: now, data };
        return data;
      } catch (e) {
        // Fallback for offline or network block
        const month = new Date().getMonth() + 1;
        const temp = (month >= 6 && month <= 8) ? 24 : (month >= 12 || month <= 2) ? 1 : 16;
        return {
          temp,
          icon: '⛅',
          desc: '온화',
          descEn: 'Mild',
          wind: '1.8',
          advice: '산사 숲길은 도심보다 쌀쌀할 수 있으니 가벼운 겉옷을 챙기세요.'
        };
      }
    }
  };

  // ==========================================
  // 3. 내비게이션 & 길찾기 허브
  // ==========================================
  const Nav = {
    openModal: function (temple) {
      if (!temple) return;
      const modal = document.getElementById('modal');
      if (!modal) return;

      const kakaoUrl = `https://map.kakao.com/link/to/${encodeURIComponent(temple.name)},${temple.lat},${temple.lng}`;
      const naverUrl = `https://map.naver.com/v5/search/${encodeURIComponent(temple.name)}`;
      const tmapUrl = `https://tmap.life/`;
      const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${temple.lat},${temple.lng}`;

      modal.innerHTML = `
        <div class="sheet">
          <div class="row between">
            <h2 style="margin:0">🚗 ${I18N.t('nav_title')}</h2>
            <button class="btn ghost small" data-act="close">${I18N.t('close')}</button>
          </div>
          <p class="sub" style="margin:6px 0">${temple.name} (${temple.sido} ${temple.sgg}) 길찾기 앱을 선택하세요.</p>
          
          <div class="addr-box">
            <div>
              <div class="sub" style="font-size:.78em">${I18N.t('address')}</div>
              <div style="font-weight:600">${temple.addr}</div>
            </div>
            <button class="btn ghost small" data-act="copy-addr" data-addr="${temple.addr}">📋 ${I18N.t('copy')}</button>
          </div>

          <div class="nav-grid">
            <a class="nav-btn kakao" href="${kakaoUrl}" target="_blank" rel="noopener">
              <span>🟡</span> 카카오맵
            </a>
            <a class="nav-btn naver" href="${naverUrl}" target="_blank" rel="noopener">
              <span>🟢</span> 네이버 지도
            </a>
            <a class="nav-btn tmap" href="${tmapUrl}" target="_blank" rel="noopener">
              <span>🔴</span> 티맵 (TMAP)
            </a>
            <a class="nav-btn google" href="${googleUrl}" target="_blank" rel="noopener">
              <span>🔵</span> Google Maps
            </a>
          </div>

          <div style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:10px;font-size:.88em">
            <div>🅿️ <b>${I18N.t('parking')}</b>: ${temple.practical ? temple.practical.parking : '사찰 입구 주차장'}</div>
            <div style="margin-top:4px">🚌 <b>${I18N.t('transit')}</b>: ${temple.practical ? temple.practical.transit : '대중교통 안내 확인 필요'}</div>
          </div>
        </div>`;
      modal.classList.remove('hidden');
    }
  };

  // ==========================================
  // 4. 디지털 순례 완주증 & SNS 공유 카드
  // ==========================================
  const Certificate = {
    generateCanvas: function (pilgrimName, templeCount, beadsCount, missionTitles) {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 1120;
      const ctx = canvas.getContext('2d');

      // 배경 (은은한 전통 한지색)
      const grad = ctx.createLinearGradient(0, 0, 800, 1120);
      grad.addColorStop(0, '#fbf8f1');
      grad.addColorStop(1, '#f2e9d8');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 800, 1120);

      // 외곽선 (전통 이중 테두리)
      ctx.strokeStyle = '#b5643c';
      ctx.lineWidth = 6;
      ctx.strokeRect(30, 30, 740, 1060);

      ctx.strokeStyle = '#c9a24a';
      ctx.lineWidth = 2;
      ctx.strokeRect(42, 42, 716, 1036);

      // 모서리 장식
      function drawCorner(x, y) {
        ctx.fillStyle = '#b5643c';
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c9a24a';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      drawCorner(42, 42);
      drawCorner(758, 42);
      drawCorner(42, 1078);
      drawCorner(758, 1078);

      // 은은한 중앙 연꽃 배경 문양 (워터마크)
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = '#b5643c';
      ctx.beginPath();
      ctx.arc(400, 560, 220, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 상단 머리말
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7a6f62';
      ctx.font = 'bold 20px serif';
      ctx.fillText('마 음 정 사   ·   절 로 가 자 ~ 춘 학 아 ~', 400, 110);

      // 발급 번호
      const year = new Date().getFullYear();
      const serial = `MJ-${year}-${String(templeCount).padStart(3, '0')}${String(beadsCount).padStart(3, '0')}`;
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#9c8e7c';
      ctx.fillText(`제 ${serial} 호`, 400, 140);

      // 제목: 사찰 순례 완주증
      ctx.fillStyle = '#2f2a24';
      ctx.font = 'bold 46px "Noto Serif CJK KR", serif';
      ctx.fillText('사 찰 순 례 완 주 증', 400, 220);

      // 부제
      ctx.fillStyle = '#b5643c';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('PILGRIMAGE COMPLETION CERTIFICATE', 400, 260);

      // 가로 구분선
      ctx.strokeStyle = '#e6dccb';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(120, 290);
      ctx.lineTo(680, 290);
      ctx.stroke();

      // 순례자 성명
      ctx.fillStyle = '#2f2a24';
      ctx.font = 'bold 26px "Noto Serif CJK KR", serif';
      ctx.fillText(`순  례  자  :   ${pilgrimName || '마음여행자'}`, 400, 360);

      // 순례 성취 요약 박스
      ctx.fillStyle = '#fffdfa';
      ctx.strokeStyle = '#d9c9b0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(140, 410, 520, 130, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#2f2a24';
      ctx.font = 'bold 22px serif';
      ctx.fillText(`순례 사찰 ${templeCount}곳  ·  108 염주 ${beadsCount}알 달성`, 400, 460);

      ctx.fillStyle = '#7a6f62';
      ctx.font = '16px sans-serif';
      const mText = missionTitles && missionTitles.length
        ? `완주 미션 : ${missionTitles.slice(0, 3).join(', ')}${missionTitles.length > 3 ? ' 외' : ''}`
        : '전국 전통사찰 성지 순례 정진';
      ctx.fillText(mText, 400, 500);

      // 본문 선언문
      ctx.fillStyle = '#3a342c';
      ctx.font = '20px "Noto Serif CJK KR", serif';
      const lines = [
        '위 사람은 삼천리 금수강산의 유서 깊은 사찰을 순례하며,',
        '자연 속에서 지친 마음을 맑히고 전통 문화유산을',
        '소중히 기리며 성실하게 정진하였기에',
        '이 완주증을 드립니다.'
      ];
      lines.forEach((l, i) => {
        ctx.fillText(l, 400, 600 + i * 42);
      });

      // 발급 일자
      const d = new Date();
      const dateStr = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
      ctx.font = 'bold 20px serif';
      ctx.fillStyle = '#2f2a24';
      ctx.fillText(dateStr, 400, 830);

      // 발행처 명칭
      ctx.font = 'bold 17px "Noto Serif CJK KR", serif';
      ctx.fillStyle = '#2f2a24';
      ctx.fillText('절로가', 335, 910);

      // 직인 (전통 붉은 사각 도장)
      ctx.save();
      ctx.translate(500, 895);
      ctx.rotate(-0.06);
      ctx.fillStyle = '#b5643c';
      ctx.fillRect(-38, -38, 76, 76);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.strokeRect(-34, -34, 68, 68);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px "Noto Serif CJK KR", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('절로가', 0, -10);
      ctx.fillText('순례', 0, 12);
      ctx.restore();

      // 하단 각주
      ctx.fillStyle = '#9c8e7c';
      ctx.font = '13px sans-serif';
      ctx.fillText('본 인증서는 기기 내 사찰 방문 인증 기록을 기반으로 발급되었습니다.', 400, 1020);

      return canvas;
    },
    openModal: function (pilgrimName, templeCount, beadsCount, missionTitles) {
      const modal = document.getElementById('modal');
      if (!modal) return;

      const canvas = Certificate.generateCanvas(pilgrimName, templeCount, beadsCount, missionTitles);
      const dataUrl = canvas.toDataURL('image/png');

      modal.innerHTML = `
        <div class="sheet" style="text-align:center">
          <div class="row between">
            <h2 style="margin:0">📜 ${I18N.t('cert_title')}</h2>
            <button class="btn ghost small" data-act="close">${I18N.t('close')}</button>
          </div>
          <p class="sub" style="margin:6px 0">${I18N.t('cert_desc')}</p>

          <div class="row" style="margin:8px 0;justify-content:center">
            <input type="text" id="certPilgrimInput" value="${pilgrimName || '마음여행자'}" placeholder="순례자 성명" style="max-width:200px;text-align:center">
            <button class="btn small" id="certUpdateBtn">이름 변경</button>
          </div>

          <div class="cert-preview">
            <img id="certImg" src="${dataUrl}" alt="순례 완주증" style="width:100%;display:block">
          </div>

          <div class="grid2" style="margin-top:12px">
            <a class="btn" id="certDownloadBtn" href="${dataUrl}" download="사찰순례완주증_${yearString()}.png">📥 ${I18N.t('cert_download')}</a>
            <button class="btn ghost" id="certShareBtn">📤 ${I18N.t('cert_share')}</button>
          </div>
          <button class="btn ghost small block" style="margin-top:8px" onclick="window.print()">🖨️ ${I18N.t('print')}</button>
        </div>`;
      modal.classList.remove('hidden');

      const updateBtn = document.getElementById('certUpdateBtn');
      if (updateBtn) {
        updateBtn.addEventListener('click', () => {
          const inp = document.getElementById('certPilgrimInput');
          const name = (inp ? inp.value : '').trim() || '마음여행자';
          const newCanvas = Certificate.generateCanvas(name, templeCount, beadsCount, missionTitles);
          const newUrl = newCanvas.toDataURL('image/png');
          const img = document.getElementById('certImg');
          const dl = document.getElementById('certDownloadBtn');
          if (img) img.src = newUrl;
          if (dl) dl.href = newUrl;
          if (root.MJ_TOAST) root.MJ_TOAST('이름이 반영된 새 완주증을 생성했어요 🪷');
        });
      }

      const shareBtn = document.getElementById('certShareBtn');
      if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
          if (navigator.share) {
            try {
              canvas.toBlob(async blob => {
                const file = new File([blob], 'pilgrimage-cert.png', { type: 'image/png' });
                await navigator.share({
                  title: '절로가 사찰 순례 완주증',
                  text: `전국 사찰 ${templeCount}곳을 순례하고 절로가 완주증을 받았습니다! 🪷`,
                  files: [file]
                });
              });
            } catch (err) {
              copyCertLink();
            }
          } else {
            copyCertLink();
          }
        });
      }
    }
  };

  function yearString() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  function copyCertLink() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      if (root.MJ_TOAST) root.MJ_TOAST('공유 링크가 클립보드에 복사되었어요 📋');
    }
  }

  // ==========================================
  // 5. 템플스테이 안내 & 예약 링크
  // ==========================================
  const Templestay = {
    getBookingUrl: function (templeName) {
      return `https://www.templestay.com/select-temple?search=${encodeURIComponent(templeName || '')}`;
    },
    openModal: function (temple) {
      if (!temple) return;
      const modal = document.getElementById('modal');
      if (!modal) return;

      const bookUrl = Templestay.getBookingUrl(temple.name);
      modal.innerHTML = `
        <div class="sheet">
          <div class="row between">
            <h2 style="margin:0">🎋 ${temple.name} ${I18N.t('templestay_title')}</h2>
            <button class="btn ghost small" data-act="close">${I18N.t('close')}</button>
          </div>
          <p class="sub" style="margin:6px 0">한국불교문화사업단 공식 템플스테이 안내</p>

          <div class="card templestay-hero" style="margin:10px 0">
            <div class="row between">
              <span class="templestay-tag">공식 템플스테이</span>
              <span class="sub">${temple.sido} ${temple.sgg}</span>
            </div>
            <h3 style="margin:8px 0 4px">${temple.name} 산사 힐링 체험</h3>
            <p class="sub" style="margin:0">일상의 쉼표, 나를 위한 특별한 하룻밤</p>
            <a class="btn block" style="text-align:center;text-decoration:none;margin-top:12px" href="${bookUrl}" target="_blank" rel="noopener">
              🎋 공식 예약 페이지 바로가기 (templestay.com) ↗
            </a>
          </div>

          <h3>주요 프로그램 유형</h3>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px">
              <b>🧘‍♀️ 휴식형 (Rest)</b>
              <p class="sub" style="margin:2px 0 0">새벽예불과 공양 외의 시간은 숲길 산책, 명상, 독서 등 자유롭게 쉬어가는 일정</p>
            </div>
            <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px">
              <b>📿 체험형 (Experience)</b>
              <p class="sub" style="margin:2px 0 0">108배 염주 만들기, 스님과의 차담, 타종 체험, 숲길 포행 등 사찰 문화 체험</p>
            </div>
            <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px">
              <b>🍵 당일형 (One-day)</b>
              <p class="sub" style="margin:2px 0 0">숙박 없이 2~3시간 동안 사찰 안내, 다도 체험, 명상을 경험하는 프로그램</p>
            </div>
          </div>

          <h3 style="margin-top:14px">준비물 및 주의사항</h3>
          <ul style="padding-left:18px;margin:4px 0;font-size:.9em;line-height:1.6">
            <li>편안한 양말과 운동화 (수련복 조끼·바지는 사찰에서 지급)</li>
            <li>개인 세면도구 (칫솔, 수건 등) 및 개인 텀블러</li>
            <li>밤낮 일교차에 대비한 겉옷</li>
            <li>경내 소등 시간(보통 21:00~22:00) 준수 및 정숙</li>
          </ul>
        </div>`;
      modal.classList.remove('hidden');
    }
  };

  // ==========================================
  // 6. 명상 타이머 & Web Audio 사찰 소음 신시사이저
  // ==========================================
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  const Synth = {
    // 사찰 범종 (Brahma Bell) — 100% Web Audio 합성 (풍부한 저음 배음과 긴 여운)
    playBell: function (freq = 164) {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const partials = [
        { f: freq * 1.0, g: 0.8, d: 6.0 },
        { f: freq * 1.98, g: 0.45, d: 4.5 },
        { f: freq * 2.44, g: 0.35, d: 3.8 },
        { f: freq * 3.12, g: 0.2, d: 2.8 },
        { f: freq * 4.25, g: 0.1, d: 2.0 }
      ];

      partials.forEach(p => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(p.f, now);

        gain.gain.setValueAtTime(p.g, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + p.d);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + p.d);
      });
    },

    // 목탁 소리 (Moktak) — 짧은 과도음과 울림
    playMoktak: function () {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(840, now);
      filter.Q.setValueAtTime(6, now);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);

      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    },

    // 산사 풍경 소리 (Wind Chime) — 맑고 은은한 청동 풍경
    playChime: function () {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [1420, 1680, 2120, 2540, 2860];
      const count = 2 + Math.floor(Math.random() * 2);

      for (let i = 0; i < count; i++) {
        const t = now + i * 0.12 + Math.random() * 0.05;
        const note = notes[Math.floor(Math.random() * notes.length)];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note, t);

        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 2.9);
      }
    },

    // 계곡 물소리 / 대나무 숲 바람 (연속 재생용 노이즈 버퍼)
    streamNode: null,
    startStream: function () {
      const ctx = getAudioCtx();
      if (!ctx || Synth.streamNode) return;
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Pink/Brownian noise for flowing water
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.96 * b1 + white * 0.1;
        b2 = 0.86 * b2 + white * 0.25;
        data[i] = (b0 + b1 + b2) * 0.25;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(550, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, ctx.currentTime);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
      Synth.streamNode = { noise, gain };
    },
    stopStream: function () {
      if (Synth.streamNode) {
        try {
          Synth.streamNode.noise.stop();
          Synth.streamNode.noise.disconnect();
        } catch (e) {}
        Synth.streamNode = null;
      }
    }
  };

  // 명상 타이머 상태
  let medInterval = null;
  let medSecondsLeft = 300;
  let medTotalSeconds = 300;
  let medRunning = false;
  let medSound = 'chime'; // 'chime', 'bell', 'moktak', 'stream', 'silent'

  const Meditation = {
    openModal: function () {
      const modal = document.getElementById('modal');
      if (!modal) return;

      modal.innerHTML = `
        <div class="sheet meditation-box">
          <div class="row between">
            <h2 style="margin:0">🧘 ${I18N.t('meditation_title')}</h2>
            <button class="btn ghost small" data-act="med-close">${I18N.t('close')}</button>
          </div>
          <p class="sub" style="margin:4px 0">${I18N.t('meditation_sub')}</p>

          <div class="sound-selector">
            <button class="sound-btn ${medTotalSeconds === 180 ? 'on' : ''}" data-med-min="3">3분 (호흡)</button>
            <button class="sound-btn ${medTotalSeconds === 300 ? 'on' : ''}" data-med-min="5">5분 (마음정리)</button>
            <button class="sound-btn ${medTotalSeconds === 600 ? 'on' : ''}" data-med-min="10">10분 (정좌명상)</button>
          </div>

          <div class="breath-circle" id="breathCircle">
            <div id="breathText">준비</div>
          </div>

          <div class="timer-digits" id="timerDigits">${fmtTime(medSecondsLeft)}</div>

          <div class="sound-selector" style="margin-top:6px">
            <button class="sound-btn ${medSound === 'chime' ? 'on' : ''}" data-med-sound="chime">🎐 풍경소리</button>
            <button class="sound-btn ${medSound === 'stream' ? 'on' : ''}" data-med-sound="stream">🌊 계곡물소리</button>
            <button class="sound-btn ${medSound === 'moktak' ? 'on' : ''}" data-med-sound="moktak">🪵 목탁소리</button>
            <button class="sound-btn ${medSound === 'bell' ? 'on' : ''}" data-med-sound="bell">🔔 사찰범종</button>
            <button class="sound-btn ${medSound === 'silent' ? 'on' : ''}" data-med-sound="silent">🤫 고요(침묵)</button>
          </div>

          <div class="grid2" style="margin-top:14px">
            <button class="btn ghost" id="medResetBtn">초기화</button>
            <button class="btn" id="medToggleBtn">${medRunning ? '일시정지' : '명상 시작'}</button>
          </div>
        </div>`;
      modal.classList.remove('hidden');

      Meditation.bindControls();
    },

    bindControls: function () {
      const toggleBtn = document.getElementById('medToggleBtn');
      const resetBtn = document.getElementById('medResetBtn');
      const circle = document.getElementById('breathCircle');
      const text = document.getElementById('breathText');
      const digits = document.getElementById('timerDigits');

      document.querySelectorAll('[data-med-min]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (medRunning) Meditation.stop();
          const min = +btn.dataset.medMin;
          medTotalSeconds = min * 60;
          medSecondsLeft = medTotalSeconds;
          document.querySelectorAll('[data-med-min]').forEach(b => b.classList.toggle('on', b === btn));
          if (digits) digits.textContent = fmtTime(medSecondsLeft);
        });
      });

      document.querySelectorAll('[data-med-sound]').forEach(btn => {
        btn.addEventListener('click', () => {
          medSound = btn.dataset.medSound;
          document.querySelectorAll('[data-med-sound]').forEach(b => b.classList.toggle('on', b === btn));
          // 미리듣기
          if (medSound === 'bell') Synth.playBell();
          else if (medSound === 'moktak') Synth.playMoktak();
          else if (medSound === 'chime') Synth.playChime();
        });
      });

      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          if (medRunning) {
            Meditation.pause();
          } else {
            Meditation.start();
          }
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          Meditation.stop();
          medSecondsLeft = medTotalSeconds;
          if (digits) digits.textContent = fmtTime(medSecondsLeft);
          if (text) text.textContent = '준비';
          if (circle) circle.className = 'breath-circle';
        });
      }

      document.querySelectorAll('[data-act="med-close"]').forEach(btn => {
        btn.addEventListener('click', () => {
          Meditation.pause();
          Synth.stopStream();
          const modal = document.getElementById('modal');
          if (modal) modal.classList.add('hidden');
        });
      });
    },

    start: function () {
      medRunning = true;
      const toggleBtn = document.getElementById('medToggleBtn');
      if (toggleBtn) toggleBtn.textContent = '일시정지';

      // 시작 알림 종
      Synth.playBell(150);

      if (medSound === 'stream') {
        Synth.startStream();
      }

      let breathPhase = 0; // 0: inhale, 1: hold, 2: exhale, 3: rest
      const circle = document.getElementById('breathCircle');
      const text = document.getElementById('breathText');
      const digits = document.getElementById('timerDigits');

      clearInterval(medInterval);
      medInterval = setInterval(() => {
        medSecondsLeft--;
        if (digits) digits.textContent = fmtTime(medSecondsLeft);

        // 호흡 가이드 4-4-4-4
        const mod = (medTotalSeconds - medSecondsLeft) % 16;
        if (mod < 4) {
          if (text) text.textContent = '들이쉬고 (들숨)';
          if (circle) circle.className = 'breath-circle inhale';
        } else if (mod < 8) {
          if (text) text.textContent = '머물고 (고요)';
          if (circle) circle.className = 'breath-circle';
        } else if (mod < 12) {
          if (text) text.textContent = '내쉬고 (날숨)';
          if (circle) circle.className = 'breath-circle exhale';
        } else {
          if (text) text.textContent = '비우고 (쉼)';
          if (circle) circle.className = 'breath-circle';
        }

        // 풍경/목탁 간헐적 효과음
        if (medSound === 'chime' && medSecondsLeft % 30 === 0) Synth.playChime();
        if (medSound === 'moktak' && medSecondsLeft % 10 === 0) Synth.playMoktak();

        if (medSecondsLeft <= 0) {
          Meditation.complete();
        }
      }, 1000);
    },

    pause: function () {
      medRunning = false;
      clearInterval(medInterval);
      Synth.stopStream();
      const toggleBtn = document.getElementById('medToggleBtn');
      if (toggleBtn) toggleBtn.textContent = '계속하기';
    },

    stop: function () {
      medRunning = false;
      clearInterval(medInterval);
      Synth.stopStream();
      const toggleBtn = document.getElementById('medToggleBtn');
      if (toggleBtn) toggleBtn.textContent = '명상 시작';
    },

    complete: function () {
      Meditation.stop();
      Synth.playBell(164);
      setTimeout(() => Synth.playBell(164), 2200);

      const circle = document.getElementById('breathCircle');
      const text = document.getElementById('breathText');
      if (text) text.textContent = '회향 🙏';
      if (circle) circle.className = 'breath-circle';

      if (root.MJ_TOAST) root.MJ_TOAST('명상을 무사히 마쳤습니다. 마음이 한결 평온해지셨길 바랍니다 🙏');
    }
  };

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ==========================================
  // 7. 다국어 지원 (i18n: KO / EN)
  // ==========================================
  const I18N_STORAGE_KEY = 'maeumjeongwon.lang';
  let curLang = localStorage.getItem(I18N_STORAGE_KEY) || 'ko';

  const DICTIONARY = {
    ko: {
      app_title: '절로가',
      nav_home: '홈',
      nav_explore: '탐색',
      nav_map: '지도',
      nav_missions: '순례',
      nav_journal: '수첩',
      close: '닫기',
      copy: '복사',
      address: '소재지',
      parking: '주차 안내',
      transit: '대중교통',
      admission: '관람료',
      hours: '개방 시간',
      nav_title: '길찾기 및 내비게이션',
      cert_title: '디지털 순례 완주증',
      cert_desc: '나의 순례 발자취를 담은 고품격 디지털 완주 인증서입니다.',
      cert_download: '이미지로 저장 (PNG)',
      cert_share: 'SNS 공유하기',
      print: '인쇄 / PDF 저장',
      templestay_title: '템플스테이 안내',
      meditation_title: '마음 쉼터 & 명상 타이머',
      meditation_sub: '사찰의 소리와 함께 숨을 고르고 지친 마음을 맑혀보세요.',
      pwa_installed: '절로가 앱이 설치되었습니다 📲',
      pwa_browser_guide: '브라우저 메뉴에서 "홈 화면에 추가"를 선택해 설치하세요.',
      pwa_ios_title: 'iPhone / iPad 앱 설치 안내',
      pwa_ios_desc: '홈 화면에 추가하시면 앱처럼 편리하게 이용하실 수 있습니다.'
    },
    en: {
      app_title: 'Jeoroga : Jeorogaja~Chunhaga~',
      nav_home: 'Home',
      nav_explore: 'Explore',
      nav_map: 'Map',
      nav_missions: 'Pilgrimage',
      nav_journal: 'Journal',
      close: 'Close',
      copy: 'Copy',
      address: 'Address',
      parking: 'Parking',
      transit: 'Public Transit',
      admission: 'Admission',
      hours: 'Opening Hours',
      nav_title: 'Navigation & Directions',
      cert_title: 'Pilgrimage Completion Certificate',
      cert_desc: 'Official digital pilgrimage certificate recording your sacred journey.',
      cert_download: 'Download Image (PNG)',
      cert_share: 'Share on SNS',
      print: 'Print / Save PDF',
      templestay_title: 'Templestay Information',
      meditation_title: 'Mindfulness & Meditation Timer',
      meditation_sub: 'Breathe with serene temple ambient sounds and restore peace.',
      pwa_installed: 'Jeoroga app installed! 📲',
      pwa_browser_guide: 'Tap browser menu and select "Add to Home Screen".',
      pwa_ios_title: 'Install on iOS Safari',
      pwa_ios_desc: 'Add to Home screen for full offline and standalone experience.'
    }
  };

  const I18N = {
    getLang: () => curLang,
    setLang: function (l) {
      curLang = l === 'en' ? 'en' : 'ko';
      try { localStorage.setItem(I18N_STORAGE_KEY, curLang); } catch (e) {}
      I18N.apply();
    },
    toggleLang: function () {
      I18N.setLang(curLang === 'ko' ? 'en' : 'ko');
    },
    t: function (key) {
      return (DICTIONARY[curLang] && DICTIONARY[curLang][key]) || (DICTIONARY.ko[key]) || key;
    },
    apply: function () {
      const btn = document.getElementById('langToggle');
      if (btn) btn.textContent = curLang === 'ko' ? 'EN' : 'KO';

      // 탭 라벨 갱신
      const tabs = document.querySelectorAll('.tabbar a');
      const labels = [
        I18N.t('nav_home'),
        I18N.t('nav_explore'),
        I18N.t('nav_map'),
        I18N.t('nav_missions'),
        I18N.t('nav_journal')
      ];
      tabs.forEach((tab, idx) => {
        const lbl = tab.querySelector('.tab-label');
        if (lbl && labels[idx]) lbl.textContent = labels[idx];
      });
    }
  };

  // ==========================================
  // 8. 오디오 도슨트 (Web Speech API)
  // ==========================================
  let synthUtterance = null;
  let audioPlaying = false;
  let audioSpeed = 1.0;

  const Docent = {
    play: function (title, text) {
      if (!('speechSynthesis' in window)) {
        if (root.MJ_TOAST) root.MJ_TOAST('이 브라우저는 오디오 음성 읽기를 지원하지 않습니다.');
        return;
      }

      window.speechSynthesis.cancel();

      const bar = document.getElementById('audioBar');
      if (bar) {
        bar.innerHTML = `
          <div class="audio-info">
            <div class="audio-title">🎧 ${title}</div>
            <div class="audio-sub">오디오 가이드 해설 진행 중</div>
          </div>
          <div class="audio-controls">
            <button class="audio-btn" id="audioSpeedBtn">${audioSpeed}x</button>
            <button class="audio-btn play" id="audioPlayPauseBtn">⏸️</button>
            <button class="audio-btn" id="audioStopBtn">⏹️</button>
          </div>`;
        bar.classList.remove('hidden');

        document.getElementById('audioPlayPauseBtn').addEventListener('click', () => {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
            document.getElementById('audioPlayPauseBtn').textContent = '⏸️';
          } else if (window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
            document.getElementById('audioPlayPauseBtn').textContent = '▶️';
          }
        });

        document.getElementById('audioStopBtn').addEventListener('click', () => {
          Docent.stop();
        });

        document.getElementById('audioSpeedBtn').addEventListener('click', () => {
          audioSpeed = audioSpeed === 1.0 ? 1.2 : audioSpeed === 1.2 ? 0.8 : 1.0;
          document.getElementById('audioSpeedBtn').textContent = `${audioSpeed}x`;
          Docent.play(title, text);
        });
      }

      const u = new SpeechSynthesisUtterance(text);
      u.lang = curLang === 'en' ? 'en-US' : 'ko-KR';
      u.rate = audioSpeed;
      u.onend = () => {
        Docent.stop();
      };
      u.onerror = () => {
        Docent.stop();
      };

      synthUtterance = u;
      audioPlaying = true;
      window.speechSynthesis.speak(u);
      if (root.MJ_TOAST) root.MJ_TOAST(`🎧 「${title}」 오디오 해설을 시작합니다.`);
    },

    stop: function () {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      audioPlaying = false;
      const bar = document.getElementById('audioBar');
      if (bar) bar.classList.add('hidden');
    }
  };

  // ==========================================
  // 10. Google AI Pro 마음·풍수·기도 맞춤 상담 & 도슨트
  // ==========================================
  const AICounsel = {
    getConfig: function () {
      const cfg = root.MJ_CONFIG || {};
      return {
        tier: cfg.aiTier || 'Google AI Pro',
        model: cfg.aiModel || 'gemini-4-argon',
        fallbackModel: cfg.aiFallbackModel || 'gemini-3.8-flash',
        endpoint: (cfg.apiBase || '') + (cfg.aiEndpoint || '/api/ai/counsel')
      };
    },

    ask: async function (payload) {
      const cfg = AICounsel.getConfig();
      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      });
      if (!res.ok) throw new Error('AI 응답을 불러오지 못했습니다.');
      return res.json();
    },

    openModal: function (opts = {}) {
      const modal = document.getElementById('modal');
      if (!modal) return;
      const cfg = AICounsel.getConfig();
      const temple = opts.temple || null;
      const presetMood = opts.mood || '';
      const defaultPrompt = temple
        ? `${temple.name}(${temple.mountain})의 기운과 역사에 맞춰 오늘 어떤 마음으로 참배하고 걸으면 좋을지 안내해 주세요.`
        : '요즘 마음이 복잡하고 지쳐 있어요. 조용히 걷기 좋은 사찰과 마음 다스리는 법을 추천해 주세요.';

      const quickChips = [
        '마음이 복잡하고 쉬고 싶어요',
        '가족 건강과 평안을 기원해요',
        '새로운 시작·시험·승진 기운',
        '바다와 일출이 보이는 사찰',
        '단풍·숲길이 아름다운 천년고찰'
      ];

      modal.innerHTML = `
        <div class="sheet">
          <div class="row between">
            <div>
              <span class="tag ok">✨ ${cfg.tier} · ${cfg.model}</span>
              <h2 style="margin:6px 0 0">🪷 AI 마음·사찰 맞춤 상담</h2>
            </div>
            <button class="btn ghost small" data-act="close">닫기</button>
          </div>
          <p class="sub" style="margin:6px 0 10px">
            ${temple ? `<b>${temple.name}</b>의 전통·풍수·기도 이야기와 연결된 맞춤 안내를 전해 드립니다.` : '지금 마음 상태나 소원을 적어주시면 어울리는 경전 구절과 사찰·참배 가이드를 안내해 드려요.'}
          </p>
          <div class="row wrap" style="margin-bottom:8px;gap:6px">
            ${quickChips.map(q => `<button type="button" class="chip ai-quick-chip" data-q="${q}">${q}</button>`).join('')}
          </div>
          <label for="aiPromptInput">나의 마음·질문</label>
          <textarea id="aiPromptInput" rows="3" placeholder="지금 마음 상태나 찾고 싶은 사찰 분위기를 적어주세요">${defaultPrompt}</textarea>
          <div class="row" style="margin-top:10px">
            <button class="btn block" id="aiCounselSubmitBtn">✨ Google AI Pro 안내 받기</button>
          </div>
          <div id="aiCounselResult" style="margin-top:12px"></div>
        </div>`;

      modal.classList.remove('hidden');

      modal.querySelectorAll('.ai-quick-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          const inp = document.getElementById('aiPromptInput');
          if (inp) inp.value = btn.getAttribute('data-q') || '';
        });
      });

      const submitBtn = document.getElementById('aiCounselSubmitBtn');
      const resultBox = document.getElementById('aiCounselResult');

      async function runQuery() {
        const inp = document.getElementById('aiPromptInput');
        const prompt = inp ? inp.value.trim() : defaultPrompt;
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '🪷 마음을 헤아려 안내를 준비하고 있어요…';
        }
        if (resultBox) {
          resultBox.innerHTML = `<div class="card"><div class="sub">Google AI Pro (${cfg.model}) 모델이 사찰 기록과 경전 구절을 살피고 있습니다…</div></div>`;
        }
        try {
          const data = await AICounsel.ask({
            prompt,
            mood: presetMood,
            templeId: temple ? temple.id : undefined
          });
          const verse = data.verse || { text: '마음이 청정하면 곧 불국토가 청정하다.', source: '유마경' };
          const recs = Array.isArray(data.recommendations) ? data.recommendations : [];
          const practice = Array.isArray(data.practice) ? data.practice : [];

          if (resultBox) {
            resultBox.innerHTML = `
              <div class="card hero">
                <div class="row between">
                  <span class="tag ok">✨ ${data.tier || cfg.tier}</span>
                  <button class="btn ghost small" id="aiCounselListenBtn">🎧 음성으로 듣기</button>
                </div>
                <p style="margin:10px 0;line-height:1.65">${data.empathy || ''}</p>
                <div class="card legend" style="margin:8px 0 0;background:var(--bg)">
                  <span class="lbl">📖 오늘의 경전 구절 · ${verse.source || ''}</span>
                  <p style="margin:8px 0 2px;font-weight:600">"${verse.text || ''}"</p>
                </div>
              </div>
              ${recs.length ? `
              <div class="card">
                <h3 style="margin-top:0">🧭 추천 사찰 도량</h3>
                <div class="tlist">
                  ${recs.map(r => `
                    <a class="titem" href="#/temple/${r.id}" data-act="close">
                      <div class="seal">寺</div>
                      <div class="meta">
                        <b>${r.name} <span class="sub">(${r.sido} ${r.sgg} · ${r.mountain})</span></b>
                        <div class="sub" style="white-space:normal">${r.reason}</div>
                        <div class="sub" style="white-space:normal;color:var(--accent2)">💡 ${r.point}</div>
                      </div>
                    </a>
                  `).join('')}
                </div>
              </div>` : ''}
              ${practice.length ? `
              <div class="card">
                <h3 style="margin-top:0">🧘 사찰 참배·명상 3단계 실천</h3>
                <ol style="padding-left:20px;margin:6px 0">
                  ${practice.map(step => `<li style="margin-bottom:6px">${step}</li>`).join('')}
                </ol>
                <p class="notice" style="margin:8px 0 0">${data.disclaimer || ''}</p>
              </div>` : ''}
            `;

            const listenBtn = document.getElementById('aiCounselListenBtn');
            if (listenBtn) {
              listenBtn.addEventListener('click', () => {
                const speechText = [
                  data.empathy,
                  `오늘의 경전 구절, ${verse.source}. ${verse.text}.`,
                  ...practice
                ].filter(Boolean).join(' ');
                Docent.play('AI 마음 상담 안내', speechText);
              });
            }
          }
        } catch (err) {
          if (resultBox) {
            resultBox.innerHTML = `<div class="notice">안내를 불러오는 중 일시적인 오류가 발생했어요. 다시 시도해 주세요.</div>`;
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '✨ 다시 안내 받기';
          }
        }
      }

      if (submitBtn) {
        submitBtn.addEventListener('click', runQuery);
      }
      runQuery();
    }
  };

  // 노출
  root.MJ_FEATURES = {
    PWA,
    Weather,
    Nav,
    Certificate,
    Templestay,
    Synth,
    Meditation,
    I18N,
    Docent,
    AICounsel
  };

  // 지연 로딩된 경우 DOMContentLoaded가 이미 지났을 수 있으므로 두 경로를 모두 처리한다.
  let initialized = false;
  function initFeatures() {
    if (initialized) return;
    initialized = true;
    PWA.init();
    I18N.apply();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFeatures, { once: true });
  } else {
    initFeatures();
  }

})(window);
