'use strict';

// Worker 런타임용 콘텐츠 접근.
// server/content/* 은 Node 의 fs+vm 으로 js/data-*.js 를 읽지만 Worker 에는 fs 가 없다.
// 빌드(tools/build-worker.js)가 같은 모듈로 뽑아 둔 worker/generated/content.json 을 쓴다.
// 필터·조회 규칙은 server/content/traditional.js 와 같게 유지한다.

import data from './generated/content.json';

const temples = data.temples || [];
const templeById = new Map(temples.map(t => [t.id, t]));

const stories = data.stories || [];
const storyById = new Map(stories.map(s => [s.id, s]));

const soon = data.soon || [];
const traditional = data.traditional || [];

export function listTemples() {
  return temples;
}

export function findTemple(id) {
  return templeById.get(id) || null;
}

export function listStories() {
  return stories;
}

export function findStory(id) {
  return storyById.get(id) || null;
}

export function listSoon() {
  return soon;
}

export function listTraditional({ sido, sgg, order, q } = {}) {
  let list = traditional;
  if (sido) list = list.filter(x => x.sido === sido);
  if (sgg) list = list.filter(x => x.sgg === sgg);
  if (order) list = list.filter(x => x.order === order);
  if (q) {
    const kw = String(q).trim();
    if (kw) list = list.filter(x => x.name.includes(kw) || x.addr.includes(kw) || x.sgg.includes(kw) || x.order.includes(kw));
  }
  return list;
}

export function findTraditionalByNo(no) {
  const num = Number(no);
  return traditional.find(x => x.no === num) || null;
}
