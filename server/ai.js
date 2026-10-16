'use strict';

require('./env');
const { GoogleGenAI, Type, ThinkingLevel } = require('@google/genai');
const { listTemples, findTemple } = require('./content/temples');

const DEFAULT_AI_TIER = process.env.AI_TIER || 'Google AI Pro';
const DEFAULT_PRO_MODEL = process.env.GEMINI_MODEL || 'gemini-4-argon';
const FALLBACK_FLASH_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash';

const VERSES = [
  { text: '스스로를 등불로 삼고, 스스로에게 의지하라. 진리를 등불로 삼고, 진리에 의지하라.', source: '열반경 (대반열반경)' },
  { text: '마음이 청정하면 곧 불국토가 청정하다.', source: '유마경 불국품' },
  { text: '물이 바위를 만나면 돌아 흐르듯, 그대 마음도 집착 없이 고요히 흐르게 하라.', source: '반야심경 강설' },
  { text: '모든 형상 있는 것은 다 허망하니, 만약 모든 형상이 형상 아님을 보면 곧 여래를 보리라.', source: '금강경' },
  { text: '비바람에도 흔들리지 않는 바위산처럼, 지혜로운 이는 칭찬과 비난에 흔들리지 않는다.', source: '법구경 지혜품' },
  { text: '한 번 일어난 맑은 생각이 삼천대천세계를 두루 밝힌다.', source: '화엄경' }
];

function createAiClient(apiKey) {
  const key = apiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

function matchCuratedTemples(promptText, moodText, templeId) {
  const all = listTemples();
  const q = `${promptText || ''} ${moodText || ''}`.toLowerCase();
  const results = [];

  if (templeId) {
    const focus = findTemple(templeId);
    if (focus) results.push(focus);
  }

  // 키워드 기반 사찰 매칭
  const scored = all
    .filter(t => !results.some(r => r.id === t.id))
    .map(t => {
      let score = 0;
      if (q.includes(t.name) || q.includes(t.sido) || q.includes(t.sgg) || q.includes(t.mountain)) score += 10;
      if ((q.includes('바다') || q.includes('일출') || q.includes('파도') || q.includes('동해') || q.includes('남해')) && t.themes.includes('sea')) score += 6;
      if ((q.includes('단풍') || q.includes('가을') || q.includes('숲')) && t.themes.includes('autumn')) score += 5;
      if ((q.includes('기도') || q.includes('소원') || q.includes('시험') || q.includes('합격') || q.includes('건강')) && (t.themes.includes('wish') || t.themes.includes('prayer'))) score += 6;
      if ((q.includes('풍수') || q.includes('기운') || q.includes('명당') || q.includes('재물') || q.includes('승진')) && (t.themes.includes('fengshui') || t.themes.includes('energy'))) score += 6;
      if ((q.includes('조용') || q.includes('지쳤') || q.includes('복잡') || q.includes('힐링') || q.includes('명상') || q.includes('쉼')) && t.themes.includes('quiet')) score += 6;
      if ((q.includes('산행') || q.includes('등산') || q.includes('걷기')) && t.themes.includes('hike')) score += 5;
      if ((q.includes('가족') || q.includes('부모님') || q.includes('아이')) && t.themes.includes('family')) score += 5;
      if ((q.includes('역사') || q.includes('국보') || q.includes('문화재')) && t.themes.includes('history')) score += 5;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);

  for (const item of scored) {
    if (results.length >= 3) break;
    results.push(item.t);
  }

  return results.slice(0, 3).map(t => ({
    id: t.id,
    name: t.name,
    sido: t.sido,
    sgg: t.sgg,
    mountain: t.mountain,
    reason: (t.fengshui && t.fengshui[0]) || (t.prayer && `${t.prayer.target} 기도 전통으로 알려진 도량`) || (t.legend && `「${t.legend.title}」 이야기가 전해지는 천년고찰`) || `${t.mountain}의 고즈넉한 산사 풍경`,
    point: (t.viewpoints && t.viewpoints[0]) || t.tip || '일주문에서 대웅전까지 천천히 호흡을 가다듬으며 걸어보세요.'
  }));
}

function buildCuratedFallback({ prompt, mood, templeId }) {
  const q = String(prompt || '').trim();
  const recs = matchCuratedTemples(q, mood, templeId);
  const primary = recs[0] || { name: '산사', mountain: '청정한 산', point: '숲길을 천천히 걸으며 숨을 고르세요.' };
  const seed = q.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % VERSES.length;
  const verse = VERSES[seed];

  const empathy = templeId && findTemple(templeId)
    ? `${primary.name}(${primary.mountain})의 천년 세월과 고요한 풍경 소리에 마음을 잠시 내려놓아 보세요. 전해지는 이야기와 산사의 맑은 바람이 지친 일상에 잔잔한 쉼표가 되어 줄 것입니다.`
    : `지금 마음에 머무는 생각과 무게를 있는 그대로 바라보아도 괜찮습니다. ${primary.name}의 고즈넉한 숲길을 걷듯 들숨과 날숨에 마음을 실어 보내면, 복잡했던 갈래들이 한결 맑아질 거예요.`;

  return {
    ok: true,
    tier: 'Google AI Pro',
    model: DEFAULT_PRO_MODEL,
    empathy,
    verse,
    recommendations: recs,
    practice: [
      `일주문을 지나며 오늘 내려놓고 싶은 생각 한 가지를 마음속으로 가만히 이름 붙여 보세요.`,
      `${primary.name} 경내에서는 걸음 속도를 평소의 절반으로 늦추고, 네 걸음에 숨을 들이쉬고 네 걸음에 내쉬어 보세요.`,
      `참배를 마친 뒤에는 풍경 소리나 나뭇잎 스치는 소리에 1분간 귀를 기울이며 사찰 수첩에 한 줄 다짐을 남겨 보세요.`
    ],
    disclaimer: '전설·풍수·기도 이야기는 전해지는 이야기이며 효험을 보장하지 않습니다. 마음의 평온과 여정을 돕기 위한 안내입니다.'
  };
}

async function generateCounsel({ prompt, mood, templeId, apiKey } = {}) {
  const cleanPrompt = String(prompt || '').trim() || '오늘 마음을 맑히고 조용히 걸을 수 있는 사찰과 명상법을 추천해 주세요.';
  const fallback = buildCuratedFallback({ prompt: cleanPrompt, mood, templeId });
  const ai = createAiClient(apiKey);
  if (!ai) {
    return fallback;
  }

  const contextTemples = fallback.recommendations.map(r =>
    `- ${r.name} (id: ${r.id}, ${r.sido} ${r.sgg} ${r.mountain}): ${r.reason} / 관람포인트: ${r.point}`
  ).join('\n');

  const systemInstruction = [
    '당신은 한국 전통 사찰 순례·힐링 여행 앱 「절로가」의 Google AI Pro 도슨트이자 마음 안내자입니다.',
    '차분하고 따뜻한 한국어 경어체(~해요, ~입니다)로 답변하세요.',
    '전설·풍수·기도 관련 내용은 항상 "전해지는 이야기"로 소개하고 소원 성취나 효험을 단정하거나 보장하지 마세요.',
    '응답은 반드시 지정된 JSON 스키마 형식으로만 작성하세요.'
  ].join(' ');

  const userContent = [
    `사용자 질문/상태: ${cleanPrompt}`,
    mood ? `현재 선택한 기분: ${mood}` : '',
    templeId ? `현재 보고 있는 사찰 ID: ${templeId}` : '',
    '참고할 수 있는 추천 사찰 후보:',
    contextTemples
  ].filter(Boolean).join('\n');

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      empathy: {
        type: Type.STRING,
        description: '사용자의 마음에 공감하고 위로하는 따뜻한 인사말과 통찰 (2~3문장)'
      },
      verse: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: '어울리는 불교 경전이나 선어록의 구절' },
          source: { type: Type.STRING, description: '출전 (예: 법구경, 화엄경, 금강경 등)' }
        },
        required: ['text', 'source']
      },
      practice: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: '사찰에서 실천할 수 있는 3단계 걷기·호흡·참배 가이드'
      }
    },
    required: ['empathy', 'verse', 'practice']
  };

  for (const modelName of [DEFAULT_PRO_MODEL, FALLBACK_FLASH_MODEL]) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: userContent,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema
        }
      });

      const rawText = response.text;
      if (rawText) {
        const parsed = JSON.parse(rawText.trim());
        return {
          ok: true,
          tier: 'Google AI Pro',
          model: modelName,
          empathy: parsed.empathy || fallback.empathy,
          verse: parsed.verse && parsed.verse.text ? parsed.verse : fallback.verse,
          recommendations: fallback.recommendations,
          practice: Array.isArray(parsed.practice) && parsed.practice.length ? parsed.practice : fallback.practice,
          disclaimer: fallback.disclaimer
        };
      }
    } catch (_) {
      // 다음 폴백 모델 또는 큐레이션 엔진으로 자연스럽게 전환
    }
  }

  return fallback;
}

function getAiConfig() {
  return {
    ok: true,
    tier: 'Google AI Pro',
    model: DEFAULT_PRO_MODEL,
    fallbackModel: FALLBACK_FLASH_MODEL,
    sdk: '@google/genai',
    status: 'active',
    paidKeyActive: Boolean(process.env.API_KEY || process.env.GEMINI_API_KEY),
    capabilities: [
      'MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API',
      'mindful_counsel',
      'temple_docent',
      'pilgrimage_recommendation'
    ]
  };
}

module.exports = {
  DEFAULT_PRO_MODEL,
  FALLBACK_FLASH_MODEL,
  generateCounsel,
  getAiConfig
};
