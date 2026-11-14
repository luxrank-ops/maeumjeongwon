'use strict';

require('./env');
const { GoogleGenAI, Type, ThinkingLevel } = require('@google/genai');
const { listTemples, findTemple } = require('./content/temples');

const DEFAULT_AI_TIER = process.env.AI_TIER || 'Google AI Pro';
const DEFAULT_PRO_MODEL = process.env.GEMINI_MODEL || 'gemini-4-argon';
const FALLBACK_FLASH_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash';

const { createCuratedFallback } = require('./ai-fallback');

const { matchCuratedTemples, buildCuratedFallback } = createCuratedFallback({
  listTemples,
  findTemple,
  proModel: DEFAULT_PRO_MODEL
});

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
