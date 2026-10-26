/* 사찰 여행 계획(Trip Planner) + 조건별 추천 코스 — 앱 셸(js/app.js)에서 떼어 낸 모듈.
 *
 * 왜 나눴나: 이 화면 하나가 앱 셸의 35%(945줄)를 차지했고, 홈·탐색·지도만 쓰는 사람에게는
 * 끝까지 쓰지 않는 코드였다. 이제 계획 화면에 들어갈 때만 js/lib/loader.js 가 내려준다.
 *
 * 계약(셸 ↔ 모듈)
 *   MJ_PLANNER_FACTORY(ctx) → 인스턴스
 *   · ctx 로 받는 것: 앱 상태(S)·저장(save)·다시 그리기(render)·알림(toast)·이스케이프(esc)·
 *     날짜(today)·거리(haversine)·사찰 조회(resolveTemple/visited)·모달(openModal)·
 *     데이터(TEMPLES·THEMES·MISSIONS·TRAD·SIDO_ORDER·PLAN_RECO)·분석(MJAnalytics)
 *   · 돌려주는 것: 화면(viewPlanner·initPlanMap·bindPlannerForm), 액션 7개, 초안 상태(state.*)
 * 상태(초안·추천 조건)를 이 모듈에 두는 이유: 계획 화면에서만 뜻이 있는 값이라 셸이 알 필요가 없다.
 */
(function (root) {
  'use strict';

  function createPlanner(ctx) {
    const {
      S, save, render, toast, esc, today, haversine, resolveTemple, visited, openModal,
      TEMPLES, THEMES, MISSIONS, TRAD, SIDO_ORDER, MJAnalytics, PLAN_RECO
    } = ctx;

    // ---------- 사찰 여행 계획 (Trip Planner) ----------
    const TRIP_TEMPLATES = [
      {
        id: 'tpl-templestay-1n2d',
        theme: 'quiet',
        title: '산사 1박 2일 템플스테이 & 참선 힐링 코스',
        days: '1박 2일',
        transport: '대중교통·도보',
        companion: '혼자 조용히',
        stops: ['woljeongsa', 'sangwonsa'],
        schedule: [
          '1일차 14:00 — 사찰 도착 및 방사 배정 · 수련복 착용 및 사찰 안내',
          '1일차 16:00 — 사물(범종·법고·목어·운판) 타종 관람 및 타종 체험',
          '1일차 17:30 — 저녁 공양 (사찰음식 발우공양 예절 체험)',
          '1일차 18:30 — 저녁 예불 및 108배 염주 꿰기 체험',
          '1일차 21:00 — 취침 및 소등 (밤하늘 별빛과 산사 고요 체험)',
          '2일차 04:30 — 새벽 도량석 및 새벽 예불',
          '2일차 06:00 — 아침 공양 및 포행 (전나무숲길 걷기 명상)',
          '2일차 09:00 — 스님과의 따뜻한 차담(다도) 및 소감 나누기 · 회향'
        ],
        tip: '산사의 밤은 기온이 크게 떨어지니 따뜻한 옷을 준비하세요. 휴대폰을 잠시 내려놓고 자연의 소리에 귀를 기울여보세요.'
      },
      {
        id: 'tpl-gyeongju-day',
        theme: 'history',
        title: '경주·양산 천년고찰 당일 순례',
        days: '당일치기',
        transport: '자가용',
        companion: '가족·부모님과',
        stops: ['bulguksa', 'seokguram', 'tongdosa'],
        schedule: [
          '오전 09:00 — 경주 불국사 도착 · 청운교·백운교, 다보탑·석가탑 참배 (약 1시간 30분)',
          '오전 11:00 — 토함산 석굴암 이동 · 본존불 참배 및 동해 조망 (약 1시간)',
          '오후 12:30 — 경주 보문단지 또는 양산 이동 후 점심 공양·식사',
          '오후 14:30 — 양산 통도사 무풍한송로 산책 · 대웅전 및 금강계단 참배 (약 2시간)'
        ],
        tip: '석굴암과 불국사는 아침 일찍 방문하면 한결 고즈넉해요. 통도사 무풍한송로는 평탄해 부모님과 걷기 좋습니다.'
      },
      {
        id: 'tpl-jogyesan-1n2d',
        theme: 'quiet',
        title: '순천 조계산 삼보·산사 1박 2일 힐링 여행',
        days: '1박 2일',
        transport: '대중교통·도보',
        companion: '혼자 조용히',
        stops: ['songgwangsa', 'seonamsa', 'hwaeomsa'],
        schedule: [
          '1일차 오전 — 순천 송광사 도착 · 침계루·대웅보전·국사전 참배 및 무소유길 산책',
          '1일차 오후 — 조계산 굴목재 숲길 트레킹(약 2~3시간) 또는 차량 이동 → 선암사 승선교·대웅전 관람',
          '2일차 오전 — 구례 화엄사 이동 · 각황전·사사자 삼층석탑 참배 및 지리산 자락 산책'
        ],
        tip: '송광사~선암사 굴목재 코스를 걸으실 때는 편한 등산화와 생수를 꼭 챙기세요.'
      },
      {
        id: 'tpl-eastsea-1n2d',
        theme: 'sea',
        title: '강원 동해·오대산 관음·적멸보궁 1박 2일',
        days: '1박 2일',
        transport: '자가용',
        companion: '연인·친구와',
        stops: ['naksansa', 'woljeongsa', 'sangwonsa'],
        schedule: [
          '1일차 오후 — 양양 낙산사 도착 · 의상대·홍련암 바다 조망 및 해수관음상 참배',
          '2일차 오전 — 평창 오대산 월정사 전나무 숲길 맨발·산책 (약 1시간) 및 팔각구층석탑 관람',
          '2일차 오후 — 오대산 상원사·중대 적멸보궁 참배 (동양 최고 상원사 동종 관람)'
        ],
        tip: '낙산사 홍련암은 일출 시간대 풍경이 특히 아름답습니다. 오대산은 기온이 낮으니 겉옷을 준비하세요.'
      },
      {
        id: 'tpl-seoul-half',
        theme: 'city',
        title: '도심 속 반나절 마음 비우기 사찰 산책',
        days: '반나절·당일',
        transport: '대중교통',
        companion: '혼자 조용히',
        stops: ['jogyesa', 'bongeunsa', 'jingwansa'],
        schedule: [
          '오전 10:00 — 종로 조계사 대웅전·백송 참배 및 인사동 산책',
          '오후 13:30 — 은평 한옥마을 & 북한산 진관사 계곡길 산책 · 차담 휴식',
          '오후 16:30 — 강남 봉은사 미륵대불 및 명상길 저녁 산책'
        ],
        tip: '전철과 버스만으로 편리하게 다닐 수 있는 서울 대표 힐링 코스예요.'
      },
      {
        id: 'tpl-unesco-2n3d',
        theme: 'history',
        title: '경북·충청 유네스코 산사 2박 3일 기행',
        days: '2박 3일',
        transport: '자가용',
        companion: '가족·부모님과',
        stops: ['buseoksa', 'bongjeongsa', 'beopjusa', 'magoksa'],
        schedule: [
          '1일차 — 영주 부석사 무량수전 배흘림기둥 및 석양 감상 → 안동 숙박',
          '2일차 — 안동 봉정사 극락전·영산암 참배 → 보은 속리산 법주사 팔상전·정이품송 관람',
          '3일차 — 공주 마곡사 백범 명상길 산책 및 대웅보전·대광보전 참배'
        ],
        tip: '유네스코 세계유산으로 등재된 한국 전통 산사의 건축미를 깊이 있게 비교하며 둘러보는 일정입니다.'
      },
      {
        id: 'tpl-prayer-wish-1n2d',
        theme: 'prayer',
        title: '팔공산·사리암 기도처 순례 1박 2일',
        days: '1박 2일',
        transport: '자가용',
        companion: '불자·순례 모임',
        stops: ['gatbawi', 'bulgulsa', 'sariam'],
        schedule: [
          '1일차 오전 — 팔공산 선본사 갓바위(관봉 석조여래좌상) 참배 · 현장 안내와 사찰 공지에 맞춰 조용히 머물기 (약 2시간 30분)',
          '1일차 오후 — 경산 불굴사 적멸보궁 참배 · 홍주암은 날씨와 길 상태를 확인한 뒤 무리 없이 방문 (약 1시간 30분)',
          '2일차 오전 — 청도 운문사 사리암 나반존자 기도처 순례 · 계단길과 체력에 맞춰 일정 조정 (약 2시간)'
        ],
        tip: '기도 전통을 다룬 공개 자료를 참고한 코스예요. 갓바위·홍주암·사리암은 계단과 비탈 구간이 있으니 기상·개방·안전 공지를 확인하세요. 소원 성취나 기운의 효험을 약속하지 않습니다.'
      },
      {
        id: 'tpl-prayer-seoul-1d',
        theme: 'prayer',
        title: '서울 도심 기도처·사찰문화 당일 순례',
        days: '당일치기',
        transport: '대중교통·도보',
        companion: '혼자 조용히',
        stops: ['dosunsa', 'suguksa', 'jingwansa'],
        schedule: [
          '오전 — 삼각산 도선사 석불전·마애불 참배와 경내 산책 (셔틀·도보 이용은 사찰 공지 확인)',
          '오후 — 은평 수국사 황금법당과 경내 참배 · 대중교통 이동에 여유 두기',
          '늦은 오후 — 진관사 경내와 계곡길 산책 · 수륙재 등 의례 일정은 사찰 공지에서 확인'
        ],
        tip: '서울의 기도 도량·사찰 문화를 다룬 공공기관·불교방송 자료를 참고했어요. 도심 횡단 이동이 있으니 실제 대중교통 시간과 개방 구역을 출발 전에 확인하세요.'
      },
      {
        id: 'tpl-prayer-namhae-1n2d',
        theme: 'prayer',
        title: '남해 보리암·호구산 용문사 1박 2일',
        days: '1박 2일',
        transport: '자가용',
        companion: '가족·부모님과',
        stops: ['boriam', 'namhae_yongmunsa'],
        schedule: [
          '1일차 — 금산 보리암 참배 · 탑대와 바다 조망, 산길·계단은 천천히 이동 (약 2시간)',
          '2일차 — 호구산 남해 용문사 경내 참배와 숲길 산책 · 사찰 행사와 개방 구역 확인 (약 1시간 30분)'
        ],
        tip: '보리암의 기도 전승과 남해 지역 사찰 자료를 참고한 코스예요. 금산 진입·주차·탐방로 통제와 계절별 혼잡을 확인하세요.'
      },
      {
        id: 'tpl-yeongnam-sowon-1n2d',
        theme: 'prayer',
        title: '영남 영험 소원성지 1박 2일 기도 순례',
        days: '1박 2일',
        transport: '자가용',
        companion: '기도효험 좋은 곳',
        stops: ['gatbawi', 'bulgulsa', 'sariam'],
        schedule: [
          '1일차 오전 — 팔공산 선본사 갓바위(관봉 석조여래좌상) 참배 · 한 가지 소원을 비는 대표 기도처 (선본사 쪽 왕복 산행 약 3시간, 계단 구간 주의)',
          '1일차 오후 — 경산 불굴사 적멸보궁 참배 · 절벽 위 홍주암 독성각 소원성지는 날씨·길 상태를 확인한 뒤 무리 없이 방문 (약 2시간)',
          '2일차 오전 — 청도 운문사 사리암 나반존자 기도처 · 1,008 돌계단을 올라 소원 기도 (편도 약 30~40분, 체력에 맞춰 조정)'
        ],
        tip: '풍생풍사TV 등에서 꼽는 영남 대표 소원성지 세 곳을 잇는 코스예요. 갓바위·홍주암·사리암 모두 계단과 비탈 산행이 필요하니 기상·개방·안전 공지를 확인하세요. 소원 성취나 효험을 약속하지 않아요.'
      },

      {
        id: 'tpl-autumn-naejang-1d',
        theme: 'autumn',
        title: '단풍 절정 내장산·백양사 당일 순례',
        days: '당일치기',
        transport: '자가용',
        companion: '연인·친구와',
        stops: ['naejangsa', 'baegyangsa'],
        schedule: [
          '오전 07:30 — 정읍 내장사 도착 · 단풍터널 산책 및 우화정 감상 (약 1시간 30분~2시간, 단풍철 주말은 이른 아침이 한산해요)',
          '오전 10:30 — 장성 백양사로 이동 (차량 이동)',
          '오후 12:00 — 백양사 점심 식사 후 쌍계루·백학봉 경관 감상 · 천연기념물 고불매 관람 (약 1시간 30분)'
        ],
        tip: '두 사찰 모두 가을 단풍이 유명해요. 백양사 주차장은 무료이고, 주말에는 주변 도로 정체가 있으니 평일이나 이른 아침 출발을 권해요.'
      },
      {
        id: 'tpl-jirisan-saseongam-1n2d',
        theme: 'hike',
        title: '지리산 자락 사성암 산행 · 쌍계사 1박 2일',
        days: '1박 2일',
        transport: '자가용',
        companion: '혼자 조용히',
        stops: ['saseongam', 'ssanggyesa'],
        schedule: [
          '1일차 오전 — 구례 사성암 하단 주차 후 순환 마을버스 이용 · 오산 산길을 올라 유리광전 마애여래입상과 도선굴 참배 (약 1시간 30분, 등산화 필수)',
          '1일차 오후 — 하동 화개로 이동 · 쌍계사 진감선사탑비(최치원 글) 관람 및 경내 산책 (약 1시간 30분)',
          '2일차 오전 — 쌍계사 주변 차 시배지 일대 산책 후 귀가 (봄에는 화개 십리벚꽃길과 함께 둘러보기 좋아요)'
        ],
        tip: '사성암 순환 마을버스 막차는 오후 5시 30분경이라 하산 시간을 미리 계산하세요. 산길이 있으니 편한 등산화와 생수를 준비하세요.'
      },
      {
        id: 'tpl-south-sea-1n2d',
        theme: 'sea',
        title: '여수 향일암 일출 · 해남 대흥사·미황사 남도 바다 1박 2일',
        days: '1박 2일',
        transport: '자가용',
        companion: '연인·친구와',
        stops: ['hyangiram', 'daeheungsa', 'mihwangsa'],
        schedule: [
          '1일차 새벽 — 여수 향일암 일출 참배 (매일 04:00 개방, 일출 시각 확인) · 바위 석문 통과와 바다 조망 (약 1시간 30분)',
          '1일차 오후 — 해남 두륜산 대흥사 이동 · 장춘숲길 산책 및 경내 참배 (약 2시간)',
          '2일차 오전 — 해남 송지 미황사 참배 · 달마고도 일부 구간 산책 (약 1시간 30분~2시간)'
        ],
        tip: '향일암은 계단과 석문이 좁아 일출 시간에 붐벼요. 일찍 도착해 여유 있게 오르세요. 미황사는 달마산 바위 능선과 다도해 노을이 아름다워 일정을 여유 있게 잡으면 좋아요.'
      },
      {
        id: 'tpl-chungnam-quiet-1n2d',
        theme: 'quiet',
        title: '예산 수덕사·공주 마곡사 침묵 명상 1박 2일',
        days: '1박 2일',
        transport: '자가용',
        companion: '혼자 조용히',
        stops: ['sudeoksa', 'magoksa'],
        schedule: [
          '1일차 오전 — 예산 수덕사 도착 · 고려 시대 목조건축인 대웅전 참배 및 경내 고요한 산책 (약 1시간 30분)',
          '1일차 오후 — 숙소에서 휴식 · 차 한 잔과 함께 조용히 쉬기',
          '2일차 오전 — 공주 마곡사로 이동 · 백범 명상길 걷기 (약 1시간 30분~2시간)',
          '2일차 오후 — 대웅보전·대광보전 참배 후 귀가'
        ],
        tip: '수덕사 대웅전은 건립 연대가 확인되는 오래된 목조 건물이에요. 마곡사는 봄 풍경이 특히 유명해 계절을 바꿔 다시 찾아도 좋아요. 법당에서는 정숙을 지켜 주세요.'
      },
      {
        id: 'tpl-haeinsa-donghwasa-1n2d',
        theme: 'history',
        title: '합천 해인사·대구 동화사 국보·역사 기행 1박 2일',
        days: '1박 2일',
        transport: '자가용',
        companion: '불자·순례 모임',
        stops: ['haeinsa', 'donghwasa'],
        schedule: [
          '1일차 오전 — 합천 해인사 도착 · 경내 참배 및 장경판전 관람 (장경판전은 보존을 위해 출입이 제한될 수 있어 사전 확인, 약 2시간)',
          '1일차 오후 — 시간이 되면 가야산 소리길 산책 후 대구 팔공산으로 이동',
          '2일차 오전 — 대구 팔공산 동화사 · 보물 동화사 마애여래좌상과 통일약사여래대불 참배 (약 1시간 30분~2시간)',
          '2일차 오후 — 팔공산 가을 단풍 산책 후 귀가'
        ],
        tip: '해인사는 팔만대장경과 장경판전으로 기록유산의 가치를 느낄 수 있는 법보사찰이에요. 동화사는 「겨울에 핀 오동꽃」 이야기를 떠올리며 걷기 좋아요.'
      },
      {
        id: 'tpl-ganghwa-legend-day',
        theme: 'legend',
        title: '강화도 설화 순례 — 전등사·보문사 당일',
        days: '당일치기',
        transport: '자가용',
        companion: '가족·부모님과',
        stops: ['jeondeungsa', 'bomunsa'],
        schedule: [
          '오전 09:30 — 강화 전등사 도착 · 대웅전 처마 밑 나부상 이야기 살펴보기, 정족산성 삼랑성 둘레길 산책 (약 1시간 30분)',
          '오후 12:30 — 점심 식사 후 석모도 보문사로 이동 (석모대교 경유)',
          '오후 15:00 — 보문사 눈썹바위 마애석불좌상 참배 (계단이 가파르니 천천히) · 석실 나한전 관람',
          '해질녘 — 서해 낙조 감상 후 귀가 (계절별 일몰 시각 확인)'
        ],
        tip: '전등사 처마 설화와 보문사 그물에 걸린 돌 이야기는 모두 「전해지는 이야기」예요. 보문사 눈썹바위까지는 계단이 가팔라 편한 신발이 필요해요.'
      },
      {
        id: 'tpl-busan-transit-day',
        theme: 'city',
        title: '부산 도심 범어사·바닷가 해동용궁사 뚜벅이 당일',
        days: '당일치기',
        transport: '대중교통',
        companion: '연인·친구와',
        stops: ['beomeosa', 'yonggungsa'],
        schedule: [
          '오전 10:00 — 부산 도시철도 1호선 범어사역에서 순환버스 이용 후 범어사 참배 · 대웅전·삼층석탑·조계문 관람 (약 1시간 30분)',
          '오후 12:30 — 점심 식사 후 기장 해동용궁사로 이동 (버스·지하철 환승, 이동에 1시간 이상 여유)',
          '오후 15:00 — 해동용궁사 바닷가 바위 위 전각 관람 · 해수관음대불 참배 및 파도 소리 산책 (약 1시간 30분)',
          '해질녘 — 동해선 오시리아역 또는 해운대 방면으로 귀가'
        ],
        tip: '해동용궁사는 주말 혼잡이 심하니 평일이나 이른 아침을 추천해요. 두 사찰 모두 대중교통으로 갈 수 있어 차 없이도 편하게 다닐 수 있어요.'
      },
      {
        id: 'tpl-hwaseong-family-day',
        theme: 'family',
        title: '화성 용주사·서울 봉은사 아이와 함께하는 반나절 나들이',
        days: '반나절·당일',
        transport: '자가용',
        companion: '아이와 함께',
        stops: ['yongjusa', 'bongeunsa'],
        schedule: [
          '오전 10:00 — 화성 용주사 도착 · 넓은 무료 주차장에서 가볍게 시작, 경내 산책 · 국보 용주사 동종 및 부모은중경판 관람 (약 1시간 30분)',
          '오후 12:30 — 점심 식사 후 서울 강남 봉은사로 이동',
          '오후 14:30 — 봉은사 판전 현판·미륵대불 관람 · 명상길 산책 (약 1시간 30분)',
          '오후 16:30 — 코엑스 쪽 간식·나들이로 마무리'
        ],
        tip: '용주사는 융릉·건릉과 함께 둘러보기 좋아요. 봉은사는 코엑스 바로 옆이라 나들이 마무리에 좋고, 경내에서는 아이와 함께 조용히 걷도록 이야기해 주세요.'
      }
    ];

    const TRIP_CHECKLIST = [
      { id: 'shoes', cat: '복장·신발', text: '벗고 신기 편한 신발·양말 (법당 참배 시 필수)' },
      { id: 'clothes', cat: '복장·신발', text: '단정하고 편안한 복장 & 산중 체온 유지용 겉옷' },
      { id: 'water', cat: '산행·이동', text: '개인 물병(텀블러) 및 가벼운 간식' },
      { id: 'cash', cat: '참배·실용', text: '소액 현금 (시주·불전함·산중 자판기 등)' },
      { id: 'hours', cat: '사전 확인', text: '사찰 개방시간·주차장 위치 및 산불방지 입산통제 확인' },
      { id: 'etiquette', cat: '사찰 예절', text: '법당 어간문(가운데 문) 피하기 · 묵언 및 촬영 매너 숙지' }
    ];

    // 새 여행 계획 작성 중인 임시 초안 (저장 전까지만 유지, 초기화 버튼으로 비울 수 있음)
    const DRAFT_SAMPLE_STOPS = ['bulguksa', 'tongdosa'];
    const DRAFT_FIELDS = ['title', 'date', 'days', 'transport', 'companion', 'memo'];
    const DRAFT_DEFAULTS = { days: '당일치기', transport: '자가용', companion: '혼자 조용히' };
    const DAYS_OPTS = ['반나절·당일', '당일치기', '1박 2일', '2박 3일', '3박 4일 이상'];
    const TRANSPORT_OPTS = ['자가용', '대중교통', '대중교통·도보', '산행·트레킹'];
    const COMPANION_OPTS = ['혼자 조용히', '가족·부모님과', '연인·친구와', '아이와 함께', '불자·순례 모임', '기도처 중심 일정', '기도효험 좋은 곳'];
    let draftStops = [];
    let draftForm = {};       // 사용자가 직접 고친 입력값만 보관 (없으면 사찰 구성에 따른 자동값 사용)
    let draftCleared = false; // 초기화한 뒤에는 예시 사찰을 다시 채우지 않음

    // 추천 계획 검색 상자 상태 (저장하지 않는 화면 상태)
    let recoSido = '';
    let recoTheme = '';
    let recoSeed = 0;
    let recoAvoid = [];       // '다른 코스 추천'에서 앞서 보여 준 사찰을 다시 담지 않도록 누적
    let recoResult = null;
    let refreshTempleOptions = null;  // 사찰 추가 상자의 검색 실행기 (bindPlannerForm에서 연결)

    function parseDurationMin(str) {
      if (!str) return 60;
      const m = String(str).match(/(\d+)\s*시간/);
      const m2 = String(str).match(/(\d+)\s*분/);
      if (m) return parseInt(m[1], 10) * 60 + (m2 ? parseInt(m2[1], 10) : 0);
      if (m2) return parseInt(m2[1], 10);
      return 60;
    }

    // 두 사찰 사이의 예상 이동 (직선거리 → 도로거리·소요시간). 추천 엔진에도 같은 추정을 넘겨요.
    function legEstimate(a, b, transport) {
      const pub = transport === '대중교통' || transport === '대중교통·도보';
      const factor = pub ? 1.45 : 1.3;
      const speedKmh = pub ? 42 : 55;
      const dKm = haversine(a.lat, a.lng, b.lat, b.lng) / 1000;
      const roadKm = Math.max(1, Math.round(dKm * factor));
      return { straightKm: Math.round(dKm), roadKm, driveMin: Math.max(10, Math.round((roadKm / speedKmh) * 60)) };
    }

    function calcRouteSummary(stopIds, transport) {
      const stops = (stopIds || []).map(id => resolveTemple(id)).filter(Boolean);
      let totalStraightKm = 0;
      const legs = [];
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        const leg = legEstimate(a, b, transport);
        totalStraightKm += leg.straightKm;
        legs.push({ from: a, to: b, straightKm: leg.straightKm, roadKm: leg.roadKm, driveMin: leg.driveMin });
      }
      const stayMin = stops.reduce((acc, t) => acc + parseDurationMin(t.duration), 0);
      const moveMin = legs.reduce((acc, l) => acc + l.driveMin, 0);
      const relatedMissions = MISSIONS.filter(m => m.ids && m.ids.some(id => stopIds.includes(id)));
      return { stops, legs, totalStraightKm: Math.round(totalStraightKm), stayMin, moveMin, totalMin: stayMin + moveMin, relatedMissions };
    }

    function fmtMin(m) {
      if (m < 60) return `${m}분`;
      const h = Math.floor(m / 60), r = m % 60;
      return r ? `${h}시간 ${r}분` : `${h}시간`;
    }

    function ensureDefaultTrips() {
      if (!Array.isArray(S.trips)) S.trips = [];
      if (!S.tripChecks || typeof S.tripChecks !== 'object') S.tripChecks = {};
    }

    // ---- 새 계획 초안(draft) 상태 ----
    const draftNames = () => draftStops.map(id => { const t = resolveTemple(id); return t ? t.name : null; }).filter(Boolean);

    function autoDraftTitle() {
      const names = draftNames();
      if (!names.length) return '';
      return names.slice(0, 2).join('·') + (names.length > 2 ? ` 외 ${names.length - 2}곳` : '') + ' 사찰 여행';
    }

    function autoDraftMemo() {
      return draftStops.map((id, i) => {
        const t = resolveTemple(id);
        return t ? `${i + 1}. ${t.name} (${t.addr}) — 관람 및 산책 (${t.duration || '약 1시간'})` : '';
      }).filter(Boolean).join('\n');
    }

    // 사용자가 입력한 값이 있으면 그 값을, 없으면 자동값(사찰 구성 기반 기본값)을 쓴다
    function draftValue(field) {
      if (draftForm[field] != null) return draftForm[field];
      if (field === 'title') return autoDraftTitle();
      if (field === 'memo') return autoDraftMemo();
      if (field === 'date') return today();
      return DRAFT_DEFAULTS[field] || '';
    }

    function selOpts(list, cur) {
      return list.map(o => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('');
    }

    // 사찰을 추가/삭제하면 화면을 다시 그리므로, 입력 중인 값은 그때그때 초안에 담아 둔다
    function captureDraftField(e) {
      const el = e.target;
      if (!el || !el.name || DRAFT_FIELDS.indexOf(el.name) < 0) return;
      draftForm[el.name] = el.value;
    }

    // 초기화할 내용이 있는지 (경유 사찰 또는 기본값과 다른 입력값)
    function plannerDraftFilled() {
      if (draftStops.length) return true;
      return DRAFT_FIELDS.some(k => {
        const v = draftForm[k];
        if (v == null) return false;
        if (k === 'date') return v !== today();
        if (DRAFT_DEFAULTS[k]) return v !== DRAFT_DEFAULTS[k];
        return String(v).trim() !== '';
      });
    }

    function clearPlannerDraft() {
      draftStops = [];
      draftForm = {};
      draftCleared = true;
      recoResult = null;   // 추천 결과 상자도 함께 비운다 (조건은 기억)
      recoAvoid = [];
    }

    // 지울 내용이 없으면 초기화 버튼을 비활성 상태로 둔다
    function syncDraftResetButtons() {
      const on = plannerDraftFilled();
      document.querySelectorAll('[data-act="draft-reset"]').forEach(b => {
        b.disabled = !on;
        b.setAttribute('aria-disabled', String(!on));
      });
    }

    // 🧹 초기화 버튼 — 작성 중인 새 여행 계획만 비움 (저장된 계획·수첩 기록은 그대로)
    function resetPlannerDraft() {
      if (!plannerDraftFilled()) { toast('이미 비어 있는 새 계획이에요.'); return; }
      if (!confirm('작성 중인 내용을 모두 지우고 처음부터 다시 짤까요?\n(이미 저장한 여행 계획은 그대로 남아요)')) return;
      clearPlannerDraft();
      // #/planner/new/<사찰id> 로 들어온 경우 다시 그리면 그 사찰이 되살아나므로 주소를 비운다
      if (location.hash !== '#/planner/new') location.hash = '#/planner/new';
      else render();
      toast('작성 중이던 여행 계획을 초기화했어요 🧹');
    }

    // ---------- 추천 계획 검색 (조건 → 추천 코스) ----------
    const RECO_THEME_ORDER = ['history', 'quiet', 'photo', 'autumn', 'sea', 'hike', 'legend', 'family', 'city', 'energy', 'wish', 'fengshui', 'prayer'];

    function currentTransport() {
      const sel = document.getElementById('planTransport');
      if (sel && sel.value) return sel.value;
      return draftValue('transport') || DRAFT_DEFAULTS.transport;
    }

    function recoSidoOptions() {
      const sidos = SIDO_ORDER.filter(s => TEMPLES.some(t => t.sido === s));
      return `<option value="">전체 지역</option>` + sidos.map(s =>
        `<option value="${esc(s)}"${s === recoSido ? ' selected' : ''}>${esc(s)} (${TEMPLES.filter(t => t.sido === s).length}곳)</option>`).join('');
    }

    function recoThemeOptions() {
      const keys = RECO_THEME_ORDER.filter(k => THEMES[k]).concat(Object.keys(THEMES).filter(k => RECO_THEME_ORDER.indexOf(k) < 0));
      return `<option value="">테마 전체</option>` + keys.map(k =>
        `<option value="${esc(k)}"${k === recoTheme ? ' selected' : ''}>${THEMES[k].icon} ${esc(THEMES[k].name)}</option>`).join('');
    }

    function recoConditionText(r) {
      const parts = [r.sido || '전체 지역', r.theme && THEMES[r.theme] ? THEMES[r.theme].name : '테마 전체', r.days, r.transport];
      if (r.companion) parts.push(r.companion);
      return parts.join(' · ');
    }

    function recoBoxHtml() {
      if (!recoResult) return '';
      if (!recoResult.ok) return `<p class="notice" style="margin-top:8px">${esc(recoResult.message || '추천 코스를 만들지 못했어요. 조건을 바꿔 다시 시도해 주세요.')}</p>`;
      const r = recoResult;
      const sum = calcRouteSummary(r.stops, currentTransport());
      return `<div class="card reco-card" style="background:#f9f5ec;margin-top:10px">
        <div class="row between"><b>✨ 추천 코스</b><span class="tag ok">${sum.stops.length}곳 · 약 ${fmtMin(sum.totalMin)}</span></div>
        <h3 style="margin:6px 0 2px">${esc(r.title)}</h3>
        <div class="sub">조건: ${esc(recoConditionText(r))}</div>
        <ul class="route-line" style="margin-top:8px">
          ${sum.stops.map((t, idx) => {
            const leg = idx < sum.legs.length ? sum.legs[idx] : null;
            return `<li data-step="${idx + 1}">
              <div><b>${esc(t.name)}</b> <span class="sub">${esc(t.sido)} ${esc(t.sgg)} · ${esc(t.mountain)}</span></div>
              <div class="row wrap" style="margin-top:2px">${(r.reasons[t.id] || []).map(x => `<span class="tag">${x.icon} ${esc(x.text)}</span>`).join('')}</div>
              <div class="sub" style="margin-top:2px">권장 관람: ${esc(t.duration || '약 1시간')}</div>
              ${leg ? `<div class="sub">🚗 다음 사찰(${esc(leg.to.name)})까지 도로 약 ${leg.roadKm}km · 약 ${leg.driveMin}분</div>` : ''}
            </li>`;
          }).join('')}
        </ul>
        <div class="sub">총 예상 ${fmtMin(sum.totalMin)} (관람 ${fmtMin(sum.stayMin)} + 이동 ${fmtMin(sum.moveMin)}) · 구간 직선거리 합 ${sum.totalStraightKm}km</div>
        ${sum.relatedMissions.length ? `<div class="sub" style="margin-top:2px">🏅 함께 채워지는 순례 미션: ${sum.relatedMissions.map(m => m.icon + ' ' + esc(m.name)).join(', ')}</div>` : ''}
        ${(r.notices || []).map(n => `<p class="notice" style="margin-top:6px">ℹ️ ${esc(n)}</p>`).join('')}
        <p class="notice" style="margin-top:6px">${(r.cautions || []).join(' ')}</p>
        <div class="row wrap" style="margin-top:8px">
          <button type="button" class="btn small" data-act="reco-apply">📥 이 코스로 계획 채우기</button>
          <button type="button" class="btn ghost small" data-act="reco-again">🔄 다른 코스 추천</button>
          <button type="button" class="btn ghost small" data-act="reco-dismiss">닫기</button>
        </div>
        <div class="sub" style="margin-top:4px">채운 뒤에는 경유 사찰 순서·제목·일정표를 자유롭게 고칠 수 있어요.</div>
      </div>`;
    }

    function refreshRecoBox() {
      const box = document.getElementById('recoBox');
      if (box) box.innerHTML = recoBoxHtml();
    }

    function runRecommendation(reroll) {
      const box = document.getElementById('recoBox');
      if (!box) return;
      if (!PLAN_RECO) { box.innerHTML = '<p class="notice" style="margin-top:8px">추천 엔진을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.</p>'; return; }
      const form = document.getElementById('planForm');
      const fd = form ? new FormData(form) : null;
      const regionSel = document.getElementById('recoRegion');
      const themeSel = document.getElementById('recoTheme');
      if (regionSel) recoSido = regionSel.value;
      if (themeSel) recoTheme = themeSel.value;
      const cond = {
        sido: recoSido,
        theme: recoTheme,
        days: (fd && fd.get('days')) || draftValue('days'),
        transport: (fd && fd.get('transport')) || draftValue('transport'),
        companion: (fd && fd.get('companion')) || draftValue('companion')
      };
      const prevStops = recoResult && recoResult.ok ? recoResult.stops.slice() : null;
      if (reroll) recoSeed++;
      else { recoSeed = 0; recoAvoid = []; }

      const btn = document.querySelector('[data-act="reco-run"]');
      const btnLabel = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = '⏳ 추천 코스를 계산하는 중…'; }
      box.innerHTML = '<p class="notice" style="margin-top:8px">⏳ 조건에 맞는 사찰과 동선을 찾는 중이에요…</p>';

      // 계산은 곧바로 끝나지만, 무엇으로 골랐는지 잠깐 보여 준 뒤 결과를 띄운다
      setTimeout(() => {
        recoResult = PLAN_RECO.recommend(Object.assign({}, cond, {
          temples: TEMPLES,
          themes: THEMES,
          seed: recoSeed,
          avoidIds: recoAvoid.slice(),
          visitedIds: Array.from(visited()),
          estimate: (a, b, tp) => legEstimate(a, b, tp)
        }));
        if (recoResult.ok) recoAvoid = recoAvoid.concat(recoResult.stops);
        if (!document.getElementById('recoBox')) return;   // 계산 중 다른 화면으로 이동한 경우
        if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = btnLabel; }
        refreshRecoBox();
        MJAnalytics.track('planner_reco', { feature: 'reco', method: recoResult.ok ? 'ok' : 'fail' });
        const sameAsBefore = recoResult.ok && prevStops && prevStops.join(',') === recoResult.stops.join(',');
        if (!recoResult.ok) toast('추천 코스를 만들지 못했어요. 조건을 바꿔 보세요.');
        else if (sameAsBefore) toast('조건에 맞는 사찰이 적어 같은 코스예요. 지역을 넓히거나 테마를 바꿔 보세요.');
        else toast(`추천 코스 ${recoResult.stops.length}곳을 만들었어요 ✨`);
        const card = document.querySelector('.reco-card');
        if (card && card.scrollIntoView) card.scrollIntoView({ block: 'center' });
      }, 450);
    }

    function applyRecommendation() {
      if (!recoResult || !recoResult.ok) return;
      draftStops = recoResult.stops.slice();
      draftCleared = false;
      draftForm.title = recoResult.title;
      draftForm.memo = recoResult.memo;
      recoResult = null;
      recoAvoid = [];
      toast('추천 코스를 계획표에 채웠어요 ✨ 아래에서 자유롭게 고치세요');
      render();
      const el = document.getElementById('draftStopList');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
    }

    function dismissRecommendation() {
      recoResult = null;
      refreshRecoBox();
      toast('추천 결과를 닫았어요. 언제든 다시 받을 수 있어요.');
    }

    // 추천 템플릿을 사찰 특징(테마)별로 골라 보는 필터 (화면 상태, 저장하지 않음)
    let tplTheme = 'all';
    const tplMatch = tpl => tplTheme === 'all' || tpl.theme === tplTheme;
    function tplFilterHtml() {
      const keys = [...new Set(TRIP_TEMPLATES.map(t => t.theme).filter(k => k && THEMES[k]))];
      const chip = (k, label) => `<button type="button" class="chip ${tplTheme === k ? 'on' : ''}" data-act="tpl-theme" data-theme="${k}" aria-pressed="${tplTheme === k}">${label}</button>`;
      return `<div class="row wrap" style="margin:4px 0 10px">${chip('all', '전체')}${keys.map(k => chip(k, THEMES[k].icon + ' ' + THEMES[k].name)).join('')}</div>`;
    }

    function viewPlanner(sub, arg) {
      ensureDefaultTrips();
      if (sub === 'theme') tplTheme = arg === 'all' || THEMES[arg] ? arg : 'all';
      else if (!sub) tplTheme = 'all';
      if (sub === 'new') return viewPlannerNew(arg);
      if (sub === 'view') return viewPlannerDetail(arg);

      const trips = S.trips.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      const checks = S.tripChecks || {};
      const doneCnt = TRIP_CHECKLIST.filter(c => checks[c.id]).length;

      return `<div class="row between"><h1>🗓️ 사찰 여행 계획</h1><a class="btn small" style="text-decoration:none" href="#/planner/new">+ 새 계획 짜기</a></div>
        <p class="sub">가고 싶은 사찰을 골라 동선·소요시간·연계 순례 미션·준비물을 한눈에 계획해 보세요.</p>

        <section class="card hero">
          <div class="row between"><b>나의 사찰 여행 일정</b><span class="tag">${trips.length}개</span></div>
          ${trips.length ? `<div class="tlist" style="margin-top:8px">${trips.map(tr => {
            const sum = calcRouteSummary(tr.stops, tr.transport);
            return `<a class="titem" href="#/planner/view/${encodeURIComponent(tr.id)}">
              <div class="seal" style="background:var(--accent)">🗓️</div>
              <div class="meta">
                <b>${esc(tr.title)}</b>
                <div class="sub">${esc(tr.date || '날짜 미정')} · ${esc(tr.days || '당일치기')} · ${esc(tr.transport || '자가용')} · ${esc(tr.companion || '혼자 조용히')}</div>
                <div><span class="tag ok">${sum.stops.length}곳</span><span class="tag">약 ${fmtMin(sum.totalMin)}</span>${sum.stops.slice(0, 3).map(t => `<span class="tag">${esc(t.name)}</span>`).join('')}</div>
              </div>
            </a>`;
          }).join('')}</div>` : `<p class="sub" style="margin:8px 0">아직 저장된 여행 계획이 없어요. 아래 추천 일정을 담거나 직접 사찰을 골라 나만의 순례 코스를 만들어 보세요!</p>
          <a class="btn small" style="text-decoration:none;display:inline-block" href="#/planner/new">첫 사찰 여행 계획 만들기 →</a>`}
        </section>

        <section class="card">
          <div class="row between"><h2 style="margin:0">✨ 추천 사찰 여행 템플릿</h2><span class="sub">클릭해 내 일정으로 담기</span></div>
          <p class="sub" style="margin:4px 0 10px">사찰마다 가진 테마(단풍·산행·바다·명상·설화 등)에 맞춰 짠 추천 코스예요. 내 일정으로 담은 뒤 자유롭게 수정할 수 있어요.</p>
          ${tplFilterHtml()}
          ${TRIP_TEMPLATES.filter(tplMatch).map(tpl => {
            const sum = calcRouteSummary(tpl.stops, tpl.transport);
            const th = THEMES[tpl.theme];
            return `<div class="course">
              <div class="row between"><b>${esc(tpl.title)}</b><span class="tag">${esc(tpl.days)} · ${esc(tpl.transport)}</span></div>
              ${th ? `<div style="margin:2px 0 4px"><span class="tag ok">${th.icon} ${esc(th.name)}</span> <span class="sub">${esc(th.desc)}</span></div>` : ''}
              <div class="sub" style="margin:4px 0">📍 코스: ${sum.stops.map(t => esc(t.name)).join(' → ')} (총 직선 ${sum.totalStraightKm}km · 예상 ${fmtMin(sum.totalMin)})</div>
              <ol style="padding-left:18px;margin:6px 0;font-size:.92em">${tpl.schedule.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
              <div class="sub">💡 ${esc(tpl.tip)}</div>
              ${sum.relatedMissions.length ? `<div class="sub" style="margin-top:4px">🏅 연계 미션: ${sum.relatedMissions.map(m => m.icon + ' ' + m.name).join(', ')}</div>` : ''}
              <div class="row wrap" style="margin-top:8px">
                <button class="btn small" data-act="tpl-adopt" data-id="${esc(tpl.id)}">📥 내 여행 계획으로 담기</button>
                ${sum.stops.map(t => `<a class="chip" style="text-decoration:none" href="#/temple/${t.id}">${esc(t.name)}</a>`).join('')}
              </div>
            </div>`;
          }).join('')}
        </section>

        <section class="card">
          <div class="row between"><h2 style="margin:0">🎒 사찰 여행 준비물 · 예절 체크리스트</h2><span class="tag ${doneCnt === TRIP_CHECKLIST.length ? 'ok' : ''}">${doneCnt}/${TRIP_CHECKLIST.length} 완료</span></div>
          <p class="sub" style="margin:4px 0 8px">출발 전 하나씩 점검해 보세요. 체크 상태는 자동 저장됩니다.</p>
          <ul class="chklist">
            ${TRIP_CHECKLIST.map(c => {
              const on = !!checks[c.id];
              return `<li class="${on ? 'done' : ''}">
                <input type="checkbox" id="chk_${c.id}" data-act="trip-chk" data-id="${c.id}" ${on ? 'checked' : ''}>
                <label for="chk_${c.id}"><span class="tag">${esc(c.cat)}</span> ${esc(c.text)}</label>
              </li>`;
            }).join('')}
          </ul>
        </section>`;
    }

    function draftStopsHtml(sum) {
      if (!draftStops.length) return '<p class="notice">아래에서 방문할 사찰을 1곳 이상 추가해 주세요.</p>';
      return `<ul class="route-line">${draftStops.map((id, idx) => {
        const t = resolveTemple(id); if (!t) return '';
        const leg = idx < sum.legs.length ? sum.legs[idx] : null;
        return `<li data-step="${idx + 1}">
          <div class="row between">
            <div><b>${esc(t.name)}</b> <span class="sub">${esc(t.sido)} ${esc(t.sgg)} · ${esc(t.mountain)}</span></div>
            <div class="row">
              ${idx > 0 ? `<button type="button" class="btn ghost small" data-act="draft-up" data-idx="${idx}" title="위로">↑</button>` : ''}
              ${idx < draftStops.length - 1 ? `<button type="button" class="btn ghost small" data-act="draft-down" data-idx="${idx}" title="아래로">↓</button>` : ''}
              <button type="button" class="btn ghost small" data-act="draft-rm" data-idx="${idx}">제외</button>
            </div>
          </div>
          <div class="sub">주소: ${esc(t.addr)} · 권장 관람: ${esc(t.duration || '약 1시간')}</div>
          ${leg ? `<div class="route-leg">🚗 다음 사찰(${esc(leg.to.name)})까지 직선 약 ${leg.straightKm}km · 예상 도로 약 ${leg.roadKm}km (약 ${leg.driveMin}분)</div>` : ''}
        </li>`;
      }).join('')}</ul>`;
    }

    function draftSummaryHtml(sum) {
      return `🏅 현재 코스로 채워지는 미션: ${sum.relatedMissions.length ? sum.relatedMissions.map(m => `${m.icon} ${m.name}`).join(', ') : '해당 없음'} · 총 예상 소요: <b>약 ${fmtMin(sum.totalMin)}</b> (관람 ${fmtMin(sum.stayMin)} + 이동 ${fmtMin(sum.moveMin)})`;
    }

    // 이동 수단을 바꾸면 화면 전체를 다시 그리지 않고 거리·소요시간만 갱신 (입력값·스크롤 유지)
    function refreshDraftEstimates() {
      const list = document.getElementById('draftStopList');
      const box = document.getElementById('draftSummary');
      if (!list && !box) return;
      const sum = calcRouteSummary(draftStops, draftValue('transport'));
      if (list) list.innerHTML = draftStopsHtml(sum);
      if (box) box.innerHTML = draftSummaryHtml(sum);
    }

    function viewPlannerNew(preselectTid) {
      if (preselectTid && resolveTemple(preselectTid) && !draftStops.includes(preselectTid)) {
        draftStops.push(preselectTid);
        draftCleared = false;
      }
      if (!draftStops.length && !draftCleared) {
        draftStops = DRAFT_SAMPLE_STOPS.slice();
      }
      const sum = calcRouteSummary(draftStops, draftValue('transport'));
      const sidos = SIDO_ORDER;
      const filled = plannerDraftFilled();

      return `<div class="row between">
          <a href="#/planner" class="sub" style="text-decoration:none">← 여행 계획 목록</a>
          <button type="button" class="btn ghost small" data-act="draft-reset" ${filled ? '' : 'disabled aria-disabled="true"'} title="작성 중인 내용 모두 지우기">🧹 초기화</button>
        </div>
        <h1>새 사찰 여행 계획 짜기</h1>
        <form id="planForm" class="card">
          <label>여행 제목</label>
          <input name="title" placeholder="예: 가을 산사 힐링 1박 2일 순례" value="${esc(draftValue('title'))}" required maxlength="60">
          <div class="grid2">
            <div><label>출발 예정일</label><input type="date" name="date" value="${esc(draftValue('date'))}" required></div>
            <div><label>여행 기간</label><select name="days">${selOpts(DAYS_OPTS, draftValue('days'))}</select></div>
          </div>
          <div class="grid2">
            <div><label>이동 수단</label><select name="transport" id="planTransport">${selOpts(TRANSPORT_OPTS, draftValue('transport'))}</select></div>
            <div><label>동행 스타일</label><select name="companion">${selOpts(COMPANION_OPTS, draftValue('companion'))}</select></div>
          </div>

          <section class="card reco-panel" style="background:#f9f5ec;margin-top:12px">
            <div class="row between"><b>🔎 추천 계획 검색</b><span class="sub">지역·테마를 고르고 실행하세요</span></div>
            <p class="sub" style="margin:4px 0 0">기간·이동 수단·동행 스타일까지 함께 반영해 사찰과 동선을 골라 드려요.</p>
            <div class="grid2" style="margin-top:8px">
              <div><label>지역</label><select id="recoRegion">${recoSidoOptions()}</select></div>
              <div><label>테마</label><select id="recoTheme">${recoThemeOptions()}</select></div>
            </div>
            <button type="button" class="btn block" style="margin-top:10px" data-act="reco-run">✨ 추천 계획 받기</button>
            <div id="recoBox" aria-live="polite">${recoBoxHtml()}</div>
          </section>

          <label style="margin-top:12px">📍 경유 사찰 구성 (${draftStops.length}곳 선택됨)</label>
          <div id="draftStopList">${draftStopsHtml(sum)}</div>

          <div class="card" style="background:#f9f5ec;margin-top:8px">
            <div class="row between"><b>사찰 추가하기 (전통사찰 991곳 전체 지원)</b><button type="button" class="btn ghost small" data-act="draft-optimize">✨ 동선 순서 자동 정렬</button></div>
            <div class="row" style="margin-top:6px">
              <select id="addTempleFilter" style="max-width:105px">
                <option value="">전체 지역</option>
                ${sidos.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
              </select>
              <input id="addTempleSearch" placeholder="사찰명 검색 (예: 보문사, 청량사)" style="flex:1" />
              <button type="button" class="btn small" data-act="draft-search">🔍 검색</button>
            </div>
            <div class="row" style="margin-top:6px">
              <select id="addTempleSelect" style="flex:1">
                ${TEMPLES.map(t => `<option value="${t.id}">[주요·${esc(t.sido)}] ${esc(t.name)} (${esc(t.sgg)})</option>`).join('')}
                ${TRAD.map(r => `<option value="${r.id}">[전통No.${r.no}·${esc(r.sido)}] ${esc(r.name)} (${esc(r.sgg)} · ${esc(r.order)})</option>`).join('')}
              </select>
              <button type="button" class="btn small" data-act="draft-add">+ 추가</button>
            </div>
            <div class="sub" id="addTempleCount" aria-live="polite" style="margin-top:6px"></div>
            <div class="sub" id="draftSummary" style="margin-top:6px">${draftSummaryHtml(sum)}</div>
          </div>

          <label>여행 메모 · 일정표 (시간대별 계획, 맛집·숙소·다짐 등)</label>
          <textarea name="memo" placeholder="예:&#10;- 오전 9시 출발, 경주 톨게이트 통과&#10;- 점심은 사찰 입구 산채비빔밥&#10;- 대웅전에서 가족 건강 발원하기" maxlength="1500">${esc(draftValue('memo'))}</textarea>

          <div class="grid2" style="margin-top:12px">
            <button class="btn ghost" type="button" data-act="draft-reset" ${filled ? '' : 'disabled aria-disabled="true"'}>🧹 초기화</button>
            <button class="btn" type="submit">🗓️ 계획 저장하기</button>
          </div>
          <p class="notice" style="margin-top:8px">🧹 초기화를 누르면 선택한 사찰과 입력한 내용이 모두 지워지고 빈 계획표로 돌아가요. 이미 저장한 여행 계획은 지워지지 않아요.</p>
        </form>`;
    }

    function viewPlannerDetail(id) {
      ensureDefaultTrips();
      const tr = S.trips.find(x => x.id === id);
      if (!tr) return `<a href="#/planner" class="sub" style="text-decoration:none">← 여행 계획 목록</a><p>여행 계획을 찾을 수 없어요.</p>`;
      const sum = calcRouteSummary(tr.stops, tr.transport);
      const v = visited();

      return `<div class="row between noprint">
          <a href="#/planner" class="sub" style="text-decoration:none">← 여행 계획 목록</a>
          <div class="row">
            <button class="btn ghost small" data-act="print">🖨 인쇄 / PDF</button>
            <button class="btn ghost small" data-act="trip-del" data-id="${esc(tr.id)}">삭제</button>
          </div>
        </div>
        <section class="card hero" style="margin-top:8px">
          <div class="sub">🗓️ ${esc(tr.date || '날짜 미정')} · ${esc(tr.days)} · ${esc(tr.transport)} · ${esc(tr.companion)}</div>
          <h1 style="margin:6px 0">${esc(tr.title)}</h1>
          <div class="row wrap">
            <span class="tag ok">경유 사찰 ${sum.stops.length}곳</span>
            <span class="tag">총 예상 ${fmtMin(sum.totalMin)} (관람 ${fmtMin(sum.stayMin)} + 이동 ${fmtMin(sum.moveMin)})</span>
            <span class="tag">구간 직선거리 합 ${sum.totalStraightKm}km</span>
          </div>
          ${sum.relatedMissions.length ? `<p class="sub" style="margin:8px 0 0">🏅 <b>연계 순례 미션</b>: ${sum.relatedMissions.map(m => `${m.icon} ${m.name}`).join(' · ')}</p>` : ''}
        </section>

        <section class="card">
          <h2>📍 순례 동선 및 사찰별 안내</h2>
          <ul class="route-line">
            ${sum.stops.map((t, idx) => {
              const leg = idx < sum.legs.length ? sum.legs[idx] : null;
              const isVis = v.has(t.id);
              return `<li data-step="${idx + 1}">
                <div class="row between">
                  <div><a href="#/temple/${t.id}" style="font-weight:700;text-decoration:none">${esc(t.name)}</a> <span class="sub">${esc(t.sido)} ${esc(t.sgg)} · ${esc(t.mountain)}</span> ${isVis ? '<span class="tag ok">방문 완료</span>' : ''}</div>
                  <a class="btn ghost small noprint" style="text-decoration:none" href="#/temple/${t.id}">상세 →</a>
                </div>
                <div class="sub" style="margin-top:2px">소재지: ${esc(t.addr)}</div>
                <div class="sub">권장 관람: ${esc(t.duration || '약 1시간')} · 주차: ${esc(t.practical.parking)}</div>
                <div class="sub">💡 팁: ${esc(t.tip)}</div>
                ${t.prayer ? `<div class="sub">🙏 기도처 안내: ${esc(t.prayer.target)}</div>` : ''}
                ${leg ? `<div class="route-leg">🚗 <b>${esc(leg.from.name)} → ${esc(leg.to.name)}</b>: 직선 약 ${leg.straightKm}km · 도로 예상 약 ${leg.roadKm}km (약 ${leg.driveMin}분 소요)</div>` : ''}
              </li>`;
            }).join('')}
          </ul>
        </section>

        ${tr.memo ? `<section class="card"><h2>📝 일정표 · 여행 메모</h2><p style="white-space:pre-wrap;margin:0">${esc(tr.memo)}</p></section>` : ''}

        <section class="card noprint">
          <h2>🗺️ 코스 지도</h2>
          <div id="planMap" style="height:300px;border-radius:14px;border:1px solid var(--line)"></div>
        </section>`;
    }

    function initPlanMap(stopIds) {
      const el = document.getElementById('planMap');
      if (!el || typeof L === 'undefined') return null;
      const stops = (stopIds || []).map(id => resolveTemple(id)).filter(Boolean);
      if (!stops.length) return null;
      const m = L.map('planMap', { zoomControl: true }).setView([stops[0].lat, stops[0].lng], 8);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(m);
      const latlngs = stops.map(t => [t.lat, t.lng]);
      if (latlngs.length > 1) {
        L.polyline(latlngs, { color: '#7a8f5c', weight: 3, dashArray: '6, 6' }).addTo(m);
      }
      stops.forEach((t, idx) => {
        L.circleMarker([t.lat, t.lng], { radius: 9, color: '#b5643c', fillColor: '#c9a24a', fillOpacity: 0.95, weight: 2 })
          .bindPopup(`<b>${idx + 1}. ${esc(t.name)}</b><br>${esc(t.sido)} ${esc(t.sgg)}<br><a href="#/temple/${t.id}">상세 보기 →</a>`)
          .addTo(m);
      });
      if (latlngs.length > 1) {
        m.fitBounds(latlngs, { padding: [30, 30] });
      }
      setTimeout(() => m.invalidateSize(), 60);
      return m;
    }

    function bindPlannerForm() {
      const f = document.getElementById('planForm');
      const filterSel = document.getElementById('addTempleFilter');
      const searchInp = document.getElementById('addTempleSearch');
      const templeSel = document.getElementById('addTempleSelect');
      if (filterSel && templeSel) {
        const updateOptions = () => {
          const sd = filterSel.value;
          const kw = (searchInp && searchInp.value || '').trim();
          const featList = TEMPLES.filter(t => (!sd || t.sido === sd) && (!kw || t.name.includes(kw) || t.sgg.includes(kw) || t.addr.includes(kw)));
          const tradList = TRAD.filter(r => (!sd || r.sido === sd) && (!kw || r.name.includes(kw) || r.sgg.includes(kw) || r.addr.includes(kw)));
          templeSel.innerHTML =
            featList.map(t => `<option value="${t.id}">[주요·${esc(t.sido)}] ${esc(t.name)} (${esc(t.sgg)})</option>`).join('') +
            tradList.map(r => `<option value="${r.id}">[전통No.${r.no}·${esc(r.sido)}] ${esc(r.name)} (${esc(r.sgg)} · ${esc(r.order)})</option>`).join('');
          const total = featList.length + tradList.length;
          const searching = !!kw || !!sd;
          const countEl = document.getElementById('addTempleCount');
          if (countEl) countEl.innerHTML = !total
            ? `조건에 맞는 사찰이 없어요. 지역을 '전체 지역'으로 바꾸거나 다른 이름으로 검색해 보세요.`
            : (searching
              ? `🔍 <b>${total}</b>곳 찾음 · 목록에서 고르고 <b>+ 추가</b>를 누르세요.`
              : `전체 <b>${total}</b>곳 · 사찰명을 입력하거나 지역을 고른 뒤 <b>🔍 검색</b>을 누르세요.`);
          const addBtn = document.querySelector('[data-act="draft-add"]');
          if (addBtn) { addBtn.disabled = !total; addBtn.setAttribute('aria-disabled', String(!total)); }
          return total;
        };
        refreshTempleOptions = updateOptions;
        filterSel.addEventListener('change', updateOptions);
        if (searchInp) {
          searchInp.addEventListener('input', updateOptions);
          // Enter는 계획 저장이 아니라 '검색 실행'으로 — 실수로 저장되는 걸 막는다
          searchInp.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            updateOptions();
            if (templeSel.options.length) templeSel.focus();
          });
        }
        updateOptions();
      }
      if (!f) return;
      // 사찰 추가·삭제로 화면을 다시 그려도 입력하던 값은 초안에 남고, 추천 조건도 기억한다
      f.addEventListener('input', e => { captureDraftField(e); syncDraftResetButtons(); });
      f.addEventListener('change', e => {
        captureDraftField(e);
        if (e.target && e.target.name === 'transport') refreshDraftEstimates();
        if (e.target && e.target.id === 'recoRegion') { recoSido = e.target.value; recoResult = null; recoAvoid = []; refreshRecoBox(); }
        if (e.target && e.target.id === 'recoTheme') { recoTheme = e.target.value; recoResult = null; recoAvoid = []; refreshRecoBox(); }
        if (e.target && e.target.name === 'transport' && recoResult) refreshRecoBox();
        syncDraftResetButtons();
      });
      f.addEventListener('submit', e => {
        e.preventDefault();
        if (!draftStops.length) { toast('방문할 사찰을 최소 1곳 이상 추가해 주세요.'); return; }
        const fd = new FormData(f);
        ensureDefaultTrips();
        const id = 'trip_' + Date.now().toString(36);
        const item = {
          id,
          title: (fd.get('title') || '사찰 순례 여행').trim(),
          date: fd.get('date') || today(),
          days: fd.get('days') || '당일치기',
          transport: fd.get('transport') || '자가용',
          companion: fd.get('companion') || '혼자 조용히',
          stops: draftStops.slice(),
          memo: (fd.get('memo') || '').trim(),
          createdAt: new Date().toISOString()
        };
        S.trips.push(item);
        save();
        clearPlannerDraft(); // 저장했으니 다음 '새 계획 짜기'는 빈 계획표로 시작
        toast('여행 계획을 저장했어요 🗓️');
        location.hash = '#/planner/view/' + encodeURIComponent(id);
      });
    }

    function optimizeDraftOrder() {
      if (draftStops.length <= 2) { toast('사찰이 3곳 이상일 때 동선을 자동 정렬해요.'); return; }
      const remaining = draftStops.slice(1);
      const ordered = [draftStops[0]];
      while (remaining.length) {
        const cur = resolveTemple(ordered[ordered.length - 1]);
        let bestIdx = 0, bestDist = Infinity;
        remaining.forEach((id, idx) => {
          const t = resolveTemple(id);
          const d = (cur && t) ? haversine(cur.lat, cur.lng, t.lat, t.lng) : Infinity;
          if (d < bestDist) { bestDist = d; bestIdx = idx; }
        });
        ordered.push(remaining.splice(bestIdx, 1)[0]);
      }
      draftStops = ordered;
      toast('가장 가까운 동선 순서로 정렬했어요 ✨');
      render();
    }

    function openPlanPickModal(tid) {
      const t = resolveTemple(tid); if (!t) return;
      ensureDefaultTrips();
      const trips = S.trips || [];
      openModal(`<div class="sheet">
        <h2>🗓️ 「${esc(t.name)}」 여행 계획에 담기</h2>
        <p class="sub">새 사찰 여행 코스를 만들거나 기존 계획에 경유지로 추가할 수 있어요.</p>
        ${trips.length ? `<div class="tlist" style="margin:10px 0">${trips.map(tr => `<div class="titem">
          <div class="meta"><b>${esc(tr.title)}</b><div class="sub">${esc(tr.date)} · ${tr.stops.length}곳</div></div>
          <button class="btn small" data-act="plan-append" data-trip="${esc(tr.id)}" data-tid="${esc(tid)}">여기에 추가</button>
        </div>`).join('')}</div>` : ''}
        <div class="grid2" style="margin-top:10px">
          <button class="btn ghost" data-act="close">닫기</button>
          <button class="btn" data-act="plan-new-with" data-tid="${esc(tid)}">+ 새 여행 계획 만들기</button>
        </div>
      </div>`);
    }

    /* 셸(라우터·이벤트 핸들러)이 쓰는 이름만 노출한다. */
    return {
      viewPlanner, initPlanMap, bindPlannerForm,
      TRIP_TEMPLATES,
      ensureDefaultTrips, resetPlannerDraft, optimizeDraftOrder, openPlanPickModal,
      runRecommendation, applyRecommendation, dismissRecommendation,
      // 초안·추천 상태는 값이 통째로 바뀌므로 접근자로 넘긴다 (셸이 draftStops = [...] 처럼 대입한다)
      state: {
        get draftStops() { return draftStops; },
        set draftStops(v) { draftStops = v; },
        get draftForm() { return draftForm; },
        set draftForm(v) { draftForm = v; },
        get draftCleared() { return draftCleared; },
        set draftCleared(v) { draftCleared = v; },
        get refreshTempleOptions() { return refreshTempleOptions; },
        set refreshTempleOptions(v) { refreshTempleOptions = v; }
      }
    };
  }

  root.MJ_PLANNER_FACTORY = createPlanner;
})(window);
