'use strict';

const FREE_CHAPTERS = 1;      // 무료로 전문 공개하는 장 수
const PREVIEW_PARAGRAPHS = 1; // 다음 장에서 미리보기로 보여 줄 문단 수

function baseFields(st) {
  return {
    id: st.id,
    tid: st.tid,
    series: st.series,
    ep: st.ep,
    minutes: st.minutes,
    title: st.title,
    hook: st.hook,
    totalChapters: Array.isArray(st.chapters) ? st.chapters.length : 0,
    sources: st.sources || []
  };
}

// 공개 데이터: 무료 장 + 미리보기만. 나머지 장 본문은 절대 포함하지 않는다.
function publicStory(st) {
  const free = st.chapters.slice(0, FREE_CHAPTERS);
  const next = st.chapters[FREE_CHAPTERS];
  const preview = next ? { h: next.h, legend: !!next.legend, body: next.body.slice(0, PREVIEW_PARAGRAPHS) } : null;
  return Object.assign(baseFields(st), { chapters: free, preview });
}

// 전체 데이터: 플러스 또는 광고 보상이 확인된 사용자에게만 내려간다.
function fullStory(st) {
  return Object.assign(baseFields(st), { chapters: st.chapters, preview: null });
}

module.exports = {
  FREE_CHAPTERS,
  PREVIEW_PARAGRAPHS,
  baseFields,
  publicStory,
  fullStory
};
