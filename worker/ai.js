'use strict';

// Google AI 상담 — Worker 판.
//
// Node 쪽(server/ai.js)은 @google/genai SDK 를 쓰지만, Worker 번들에는 SDK 를 넣지 않고
// 같은 요청을 REST 로 보낸다. 프롬프트·스키마·폴백(server/ai-fallback.js)은 Node 와 공유하므로
// API 키가 없거나 호출이 실패해도 화면에 나오는 안내 문구는 Node 판과 같다.

import { createCuratedFallback } from '../server/ai-fallback.js';
import { listTemples, findTemple } from './content.js';

let bound = null;

function curated(proModel) {
  if (!bound) {
    bound = createCuratedFallback({ listTemples, findTemple, proModel });
  }
  return bound;
}

export function aiSettings(env) {
  return {
    tier: env.AI_TIER || 'Google AI Pro',
    pro: env.GEMINI_MODEL || 'gemini-4-argon',
    flash: env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash',
    key: env.API_KEY || env.GEMINI_API_KEY || ''
  };
}

export function getAiConfig(env) {
  const s = aiSettings(env);
  return {
    ok: true,
    tier: s.tier,
    model: s.pro,
    fallbackModel: s.flash,
    sdk: '@google/genai',
    status: 'active',
    paidKeyActive: Boolean(s.key),
    capabilities: [
      'MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API',
      'mindful_counsel',
      'temple_docent',
      'pilgrimage_recommendation'
    ]
  };
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    empathy: { type: 'string' },
    verse: {
      type: 'object',
      properties: { text: { type: 'string' }, source: { type: 'string' } },
      required: ['text', 'source']
    },
    practice: { type: 'array', items: { type: 'string' } }
  },
  required: ['empathy', 'verse', 'practice']
};

const SYSTEM_INSTRUCTION = [
  '당신은 한국 전통 사찰 순례·힐링 여행 앱 「절로가」의 Google AI Pro 도슨트이자 마음 안내자입니다.',
  '차분하고 따뜻한 한국어 경어체(~해요, ~입니다)로 답변하세요.',
  '전설·풍수·기도 관련 내용은 항상 "전해지는 이야기"로 소개하고 소원 성취나 효험을 단정하거나 보장하지 마세요.',
  '응답은 반드시 지정된 JSON 스키마 형식으로만 작성하세요.'
].join(' ');

async function callGemini(env, model, userContent) {
  const s = aiSettings(env);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(s.key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'aistudio-build' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: 'LOW' }
      }
    })
  });
  if (!res.ok) throw new Error('gemini_http_' + res.status);
  const data = await res.json();
  const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const text = parts.map(p => p.text || '').join('').trim();
  if (!text) throw new Error('gemini_empty');
  return JSON.parse(text);
}

export async function generateCounsel(env, { prompt, mood, templeId } = {}) {
  const s = aiSettings(env);
  const cleanPrompt = String(prompt || '').trim() || '오늘 마음을 맑히고 조용히 걸을 수 있는 사찰과 명상법을 추천해 주세요.';
  const fallback = curated(s.pro).buildCuratedFallback({ prompt: cleanPrompt, mood, templeId });
  if (!s.key) return fallback;

  const contextTemples = fallback.recommendations.map(r =>
    `- ${r.name} (id: ${r.id}, ${r.sido} ${r.sgg} ${r.mountain}): ${r.reason} / 관람포인트: ${r.point}`
  ).join('\n');

  const userContent = [
    `사용자 질문/상태: ${cleanPrompt}`,
    mood ? `현재 선택한 기분: ${mood}` : '',
    templeId ? `현재 보고 있는 사찰 ID: ${templeId}` : '',
    '참고할 수 있는 추천 사찰 후보:',
    contextTemples
  ].filter(Boolean).join('\n');

  for (const modelName of [s.pro, s.flash]) {
    try {
      const parsed = await callGemini(env, modelName, userContent);
      return {
        ok: true,
        tier: s.tier,
        model: modelName,
        empathy: parsed.empathy || fallback.empathy,
        verse: parsed.verse && parsed.verse.text ? parsed.verse : fallback.verse,
        recommendations: fallback.recommendations,
        practice: Array.isArray(parsed.practice) && parsed.practice.length ? parsed.practice : fallback.practice,
        disclaimer: fallback.disclaimer
      };
    } catch (e) {
      // 다음 폴백 모델 또는 큐레이션 엔진으로 넘어간다
    }
  }

  return fallback;
}
